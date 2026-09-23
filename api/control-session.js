const { authorised, pinMatches, sessionCookie } = require('../lib/control-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const pin = String(process.env.MIKEAIRCRAFT_CONTROL_PIN || '');
  if (!pin) return res.status(503).json({ ok: false, error: 'Control PIN is not configured' });
  if (req.method === 'GET') return res.status(authorised(req) ? 200 : 401).json({ ok: authorised(req) });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET or POST required' });
  if (!pinMatches(req.body?.pin, pin)) return res.status(401).json({ ok: false, error: 'Incorrect control PIN' });
  res.setHeader('Set-Cookie', sessionCookie(pin));
  return res.status(200).json({ ok: true });
};
