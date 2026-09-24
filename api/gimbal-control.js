const { resolveRedisEnv } = require('../lib/services/redis');
const { transition, view } = require('../lib/gimbal-control');
const { normaliseBoresight } = require('../lib/boresight');
const { authorised } = require('../lib/control-auth');
const KEY = 'mikeaircraft:gimbal:framing:v1';
const SETTINGS_KEY = 'mikeaircraft:control:settings';
const CAS = `local old=redis.call('GET',KEYS[1]) or ''
local settings=redis.call('GET',KEYS[2]) or ''
if old~=ARGV[1] or settings~=ARGV[3] then return 0 end
redis.call('SET',KEYS[1],ARGV[2],'PX',15000)
if ARGV[4]~='' then redis.call('SET',KEYS[2],ARGV[4]) end
return 1`;

async function command(args) {
  const { url, token } = resolveRedisEnv();
  if (!url || !token) throw new Error('Control storage unavailable');
  const response = await fetch(url, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(1800) });
  if (!response.ok) throw new Error('Control storage unavailable');
  const value = await response.json();
  if (value.error) throw new Error('Control storage unavailable');
  return value.result;
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // No permissive CORS. The PIN is sent only in a header, never in URLs/logs.
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'GET or POST required' });
  if (!process.env.MIKEAIRCRAFT_CONTROL_PIN) return res.status(503).json({ ok: false, error: 'Control PIN is not configured' });
  if (!authorised(req)) return res.status(401).json({ ok: false, error: 'Enter the private control PIN' });
  try {
    let body = req.body;
    if (typeof body === 'string') {
      if (body.length > 2048) return res.status(413).json({ ok: false, error: 'Request too large' });
      try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const values = await command(['MGET', KEY, SETTINGS_KEY]);
      const stored = values?.[0];
      const settingsRaw = values?.[1] == null ? '' : (typeof values[1] === 'string' ? values[1] : JSON.stringify(values[1]));
      let settings;
      try { settings = settingsRaw ? JSON.parse(settingsRaw) : {}; } catch { settings = {}; }
      const saved = normaliseBoresight(settings?.cameraLocation?.boresight);
      const raw = stored == null ? '' : (typeof stored === 'string' ? stored : JSON.stringify(stored));
      const previous = raw ? JSON.parse(raw) : null;
      const now = Date.now();
      if (req.method === 'GET') return res.status(200).json({ ok: true, ...view(previous, now, saved) });
      const next = transition(previous, body, now, saved);
      let nextSettings = '';
      let resultSaved = saved;
      if (next.saveBoresight) {
        resultSaved = normaliseBoresight({ ...next.saveBoresight, savedAt: new Date(now).toISOString(),
          method: 'DIRECT_TRACKER_JOYSTICK_CENTRE', quality: 'OPERATOR_CENTRED' });
        settings.cameraLocation = { ...(settings.cameraLocation || {}), boresight: resultSaved };
        settings.updatedAt = new Date(now).toISOString(); nextSettings = JSON.stringify(settings);
        delete next.saveBoresight;
      }
      if (await command(['EVAL', CAS, '2', KEY, SETTINGS_KEY, raw, JSON.stringify(next), settingsRaw, nextSettings])) {
        return res.status(200).json({ ok: true, ...view(next, Date.now(), resultSaved) });
      }
    }
    return res.status(409).json({ ok: false, error: 'Controller updated; refresh before adjusting' });
  } catch (error) {
    return res.status(error.status || 503).json({ ok: false,
      error: error.status ? error.message : 'Control connection unavailable; no correction confirmed' });
  }
};
