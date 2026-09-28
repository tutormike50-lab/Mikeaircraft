const { resolveRedisEnv } = require('../lib/services/redis');
const { transition, view, opticalTransition, cameraReferenceFingerprint } = require('../lib/gimbal-control');
const { normaliseStoredSettings } = require('./settings');
const { authorised } = require('../lib/control-auth');
const KEY = 'mikeaircraft:gimbal:framing:v1';
const BORESIGHT_KEY = 'mikeaircraft:gimbal:boresight:v1';
const SETTINGS_KEY = 'mikeaircraft:control:settings';
const CAS = `local old=redis.call('GET',KEYS[1]) or ''
if old~=ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[2],'PX',15000)
return 1`;

const CAS_WITH_BORESIGHT = "local old=redis.call('GET',KEYS[1]) or ''\n" +
  "if old~=ARGV[1] then return 0 end\n" +
  "redis.call('SET',KEYS[1],ARGV[2],'PX',15000)\n" +
  "redis.call('SET',KEYS[2],ARGV[3])\nreturn 1";

function parseStored(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

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
      const stored = await command(['GET', KEY]);
      const raw = stored == null ? '' : (typeof stored === 'string' ? stored : JSON.stringify(stored));
      const previous = raw ? JSON.parse(raw) : null;
      const now = Date.now();
      const [savedRaw, settingsRaw] = await Promise.all([
        command(['GET', BORESIGHT_KEY]), command(['GET', SETTINGS_KEY])
      ]);
      const saved = parseStored(savedRaw);
      const settings = normaliseStoredSettings(settingsRaw);
      const cameraFingerprint = cameraReferenceFingerprint(settings.cameraLocation);
      if (req.method === 'GET') return res.status(200).json({ ok: true, ...view(previous, now, saved, cameraFingerprint) });
      if (body?.action === 'clear' && !view(previous, now).connected) {
        const cleared = { enabled: false, schemaVersion: 1, yawDeg: 0, pitchDeg: 0, cameraReferenceFingerprint: null };
        await command(['SET', BORESIGHT_KEY, JSON.stringify(cleared)]);
        return res.status(200).json({ ok: true, ...view(previous, Date.now(), cleared, cameraFingerprint) });
      }
      if (body?.action === 'lock' || body?.action === 'clear') {
        const optical = opticalTransition(previous, body, now, saved, cameraFingerprint);
        const next = optical.state;
        if (await command(['EVAL', CAS_WITH_BORESIGHT, '2', KEY, BORESIGHT_KEY,
                           raw, JSON.stringify(next), JSON.stringify(optical.savedBoresight)])) {
          return res.status(200).json({ ok: true, ...view(next, Date.now(), optical.savedBoresight, cameraFingerprint) });
        }
        continue;
      }
      const next = transition(previous, body, now);
      if (await command(['EVAL', CAS, '1', KEY, raw, JSON.stringify(next)])) {
        return res.status(200).json({ ok: true, ...view(next, Date.now(), saved, cameraFingerprint) });
      }
    }
    return res.status(409).json({ ok: false, error: 'Controller updated; refresh before adjusting' });
  } catch (error) {
    return res.status(error.status || 503).json({ ok: false,
      error: error.status ? error.message : 'Control connection unavailable; no correction confirmed' });
  }
};
