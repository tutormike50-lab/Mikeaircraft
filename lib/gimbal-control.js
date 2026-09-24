// Session-only framing trims. No motor packets, HOME, GPS or settings writes.
const MAX_TRIM = 5;
const MAX_STEP = 0.25;
const LINK_MS = 3000;
const COMMAND_MS = 1500;
const MODES = new Set(['WAITING', 'TRACKING', 'RETURNING', 'STOPPED', 'FAULT']);
const terminal = s => s && ['STOPPED', 'FAULT'].includes(s.mode);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const revision = v => Number.isSafeInteger(v) && v >= 0;
const validId = v => typeof v === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(v);
function fail(message, status = 409) {
  const error = new Error(message); error.status = status; throw error;
}
function fresh(s, now) {
  return Boolean(s && now >= s.heartbeatAt && now - s.heartbeatAt < LINK_MS && !terminal(s));
}
function view(s, now) {
  const connected = fresh(s, now);
  return { connected, ready: connected && s.ready && !s.stopRequested,
    sessionId: s?.sessionId || null, mode: s?.mode || 'OFFLINE',
    target: s?.target || '', revision: s?.revision || 0,
    applied: s?.applied || { revision: 0, pan: 0, tilt: 0 },
    command: s?.command && s.command.expiresAt > now ? s.command : null,
    stopRequested: Boolean(s?.stopRequested), serverNow: now,
    commandWindowUntil: now + COMMAND_MS, maxTrim: MAX_TRIM };
}
function transition(previous, body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Invalid request', 400);
  const action = body.action;
  if (action === 'open') {
    if (!validId(body.sessionId)) fail('Invalid session', 400);
    if (previous?.sessionId === body.sessionId) {
      if (!fresh(previous, now)) fail('Session expired; start a new physical run', 410);
      return previous;
    }
    if (fresh(previous, now)) fail('Another controller is already connected');
    return { sessionId: body.sessionId, heartbeatAt: now, heartbeatSeq: 0,
      mode: 'WAITING', ready: false, target: '', revision: 0, command: null,
      applied: { revision: 0, pan: 0, tilt: 0 }, stopRequested: false };
  }
  if (!previous || body.sessionId !== previous.sessionId) fail('Controller session changed', 410);
  if (!fresh(previous, now)) fail('Controller is offline; a new run is required', 410);
  const s = structuredClone(previous);
  if (s.command && s.command.expiresAt <= now) s.command = null;
  if (action === 'heartbeat') {
    if (!revision(body.seq) || body.seq <= s.heartbeatSeq) fail('Out-of-order heartbeat');
    if (!MODES.has(body.mode) || typeof body.ready !== 'boolean' ||
        !finite(body.telemetryAge) || body.telemetryAge < 0 ||
        !finite(body.tickAge) || body.tickAge < 0 ||
        !revision(body.applied?.revision) || !finite(body.applied?.pan) || !finite(body.applied?.tilt)) {
      fail('Invalid controller report', 400);
    }
    const a = body.applied;
    if (a.revision === previous.command?.revision) {
      // May acknowledge after expiry only if the Pi already accepted it while
      // fresh. The Pi independently checks a monotonic deadline before applying.
      if (a.pan !== previous.command.pan || a.tilt !== previous.command.tilt) fail('Trim acknowledgement mismatch');
      s.applied = a; s.command = null;
    } else if (a.revision !== s.applied.revision || a.pan !== s.applied.pan || a.tilt !== s.applied.tilt) {
      fail('Unknown trim acknowledgement');
    }
    s.heartbeatSeq = body.seq; s.heartbeatAt = now; s.mode = body.mode;
    s.ready = body.mode === 'TRACKING' && body.ready && body.telemetryAge <= 1 && body.tickAge <= 0.5;
    s.target = String(body.target || '').slice(0, 40);
    // A readiness report can race with the motor loop accepting a command.
    // Retain the acknowledgement record until expiry, even while disabled.
    if (s.stopRequested || terminal(s)) s.command = null;
    return s;
  }
  if (action === 'stop') {
    s.stopRequested = true; s.ready = false; s.command = null; return s;
  }
  if (action !== 'trim') fail('Unsupported action', 400);
  if (!s.ready || s.mode !== 'TRACKING' || s.stopRequested) fail('Controller is not ready for framing');
  if (!validId(body.requestId)) fail('Invalid request ID', 400);
  if (body.requestId === s.lastRequestId) return s;
  if (s.command) fail('Waiting for the Pi to acknowledge the previous correction');
  if (body.expectedRevision !== s.revision) fail('Framing changed; refresh before adjusting');
  if (!finite(body.validUntil) || body.validUntil <= now || body.validUntil > now + COMMAND_MS) fail('Correction expired', 410);
  if (![body.pan, body.tilt].every(v => finite(v) && Math.abs(v) <= MAX_TRIM)) fail('Framing limit exceeded', 400);
  if (Math.abs(body.pan - s.applied.pan) > MAX_STEP + 1e-8 ||
      Math.abs(body.tilt - s.applied.tilt) > MAX_STEP + 1e-8) fail('Correction step is too large', 400);
  s.revision += 1; s.lastRequestId = body.requestId;
  s.command = { revision: s.revision, pan: body.pan, tilt: body.tilt,
    expiresAt: Math.min(body.validUntil, now + COMMAND_MS) };
  return s;
}
module.exports = { transition, view, MAX_TRIM, MAX_STEP, LINK_MS, COMMAND_MS };
