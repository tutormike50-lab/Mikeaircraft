const crypto = require('crypto');

const COOKIE = 'mikeaircraft_control_session';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function pinMatches(given, expected) {
  if (typeof given !== 'string' || !expected || given.length > 256) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signature(expires, pin) {
  return crypto.createHmac('sha256', pin).update(`control-session:${expires}`).digest('base64url');
}

function cookies(req) {
  return Object.fromEntries(String(req.headers?.cookie || '').split(';').map(item => {
    const split = item.indexOf('=');
    return split < 0 ? ['', ''] : [item.slice(0, split).trim(), item.slice(split + 1).trim()];
  }).filter(([key]) => key));
}

function authorised(req) {
  const pin = String(process.env.MIKEAIRCRAFT_CONTROL_PIN || '');
  if (!pin) return false;
  if (pinMatches(req.headers?.['x-mikeaircraft-control-pin'], pin)) return true;
  const [expiresText, supplied = ''] = String(cookies(req)[COOKIE] || '').split('.');
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= Date.now()) return false;
  return pinMatches(supplied, signature(expires, pin));
}

function sessionCookie(pin) {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  return `${COOKIE}=${expires}.${signature(expires, pin)}; Max-Age=${MAX_AGE_SECONDS}; Path=/api; HttpOnly; Secure; SameSite=Strict`;
}

module.exports = { authorised, pinMatches, sessionCookie, COOKIE, MAX_AGE_SECONDS };
