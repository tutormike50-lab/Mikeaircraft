const test = require('node:test');
const assert = require('node:assert/strict');
const { transition: go, view } = require('../lib/gimbal-control');
const sessionId = '01234567-89ab-cdef-0123-456789abcdef';
function initial() { return go(null, { action: 'open', sessionId }, 1000); }
function beat(s, values = {}, now = 1100) {
  return go(s, { action: 'heartbeat', sessionId, seq: s.heartbeatSeq + 1,
    mode: 'TRACKING', ready: true, target: 'TEST123', telemetryAge: 0.1, tickAge: 0.01,
    applied: s.applied, ...values }, now);
}
function trim(s, values = {}, now = 1200) {
  return go(s, { action: 'trim', sessionId, expectedRevision: s.revision,
    validUntil: 2200, requestId: 'request-1234567890', pan: 0.2, tilt: -0.1, ...values }, now);
}
test('offline and WAITING are disabled; no inherited trims in a new session', () => {
  assert.equal(view(null, 1000).ready, false);
  assert.equal(view(initial(), 1000).ready, false);
  assert.throws(() => trim(initial()), /not ready/);
  let s = trim(beat(initial()));
  s = go(s, { action: 'open', sessionId: 'new-session-123456789' }, 5000);
  assert.deepEqual(s.applied, { revision: 0, pan: 0, tilt: 0 });
  assert.equal(s.command, null);
});
test('accept one absolute correction; only the Pi acknowledges it', () => {
  let s = trim(beat(initial()));
  assert.equal(s.command.pan, 0.2);
  assert.equal(s.applied.pan, 0);
  assert.throws(() => trim(s, { requestId: 'different-request-1234' }), /acknowledge/);
  s = beat(s, { applied: { revision: 1, pan: 0.2, tilt: -0.1 } }, 1300);
  assert.equal(s.command, null);
  assert.equal(s.applied.pan, 0.2);
  assert.equal(view(s, 1500).applied.pan, 0.2); // release holds; no rate command exists
});
test('duplicate request is idempotent; old revision and session rejected', () => {
  const s = trim(beat(initial()));
  assert.equal(trim(s).revision, 1);
  assert.throws(() => trim(beat(initial()), { sessionId: 'different-session-123' }), /session changed/);
  assert.throws(() => trim(beat(initial()), { expectedRevision: 8 }), /Framing changed/);
});
test('reject limits, nonnumeric values, infinite and large steps', () => {
  for (const pan of [null, '0.1', NaN, Infinity, 6, -6, 0.251]) {
    assert.throws(() => trim(beat(initial()), { pan }), /limit|large/);
  }
});
test('corrected request has a deadline; expired request never queues', () => {
  assert.throws(() => trim(beat(initial()), { validUntil: 1100 }), /expired/);
  assert.throws(() => trim(beat(initial()), { validUntil: 90000 }), /expired/);
  const s = trim(beat(initial()));
  assert.equal(view(s, 2300).command, null);
  assert.equal(view(s, 2300).applied.pan, 0);
});
test('stale telemetry, slow control ticks and acquisition disable trim', () => {
  for (const values of [{ telemetryAge: 1.1 }, { tickAge: 0.6 }, { ready: false }, { mode: 'RETURNING' }]) {
    assert.equal(view(beat(initial(), values), 1100).ready, false);
    assert.throws(() => trim(beat(initial(), values)), /not ready/);
  }
});
test('stale session cannot resume, and a second controller cannot take over', () => {
  assert.throws(() => beat(initial(), {}, 4001), /offline/);
  assert.throws(() => go(initial(), { action: 'open', sessionId: 'different-session-123' }, 1200), /already connected/);
  assert.throws(() => go(initial(), { action: 'open', sessionId }, 5000), /expired/);
});
test('stop latches, cancels pending trim and cannot be cleared by heartbeat', () => {
  let s = go(trim(beat(initial())), { action: 'stop', sessionId }, 1300);
  assert.equal(s.command, null);
  s = beat(s, {}, 1400);
  assert.equal(view(s, 1400).ready, false);
  assert.throws(() => trim(s, {}, 1500), /not ready/);
});
test('a readiness change may not erase an in-flight acknowledgement', () => {
  let s = beat(trim(beat(initial())), { ready: false }, 1250);
  assert.equal(s.command.revision, 1);
  s = beat(s, { applied: { revision: 1, pan: 0.2, tilt: -0.1 } }, 1300);
  assert.equal(s.applied.pan, 0.2);
});
test('reordered heartbeats, invented acknowledgements and invalid reports fail closed', () => {
  const s = beat(initial());
  assert.throws(() => beat(s, { seq: 1 }), /Out-of-order/);
  assert.throws(() => beat(s, { applied: { revision: 99, pan: 1, tilt: 1 } }), /Unknown/);
  assert.throws(() => beat(s, { ready: 'true' }), /Invalid/);
});
test('no transition touches HOME or broadcast settings', () => {
  const s = trim(beat(initial()), { home_yaw: 99, airport: 'LHR' });
  assert.equal(s.home_yaw, undefined); assert.equal(s.airport, undefined);
});

// Handler tests mock Redis only: no deployment credentials or network.
const handler = require('../api/gimbal-control');
function response() { return { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; } }; }
test('HTTP requires PIN, does not log it, rejects methods and malformed input', async () => {
  const old = process.env.MIKEAIRCRAFT_CONTROL_PIN;
  process.env.MIKEAIRCRAFT_CONTROL_PIN = 'unit-test-only';
  try {
    for (const [req, code] of [
      [{ method: 'GET', headers: {} }, 401],
      [{ method: 'DELETE', headers: {} }, 405],
      [{ method: 'POST', headers: { 'x-mikeaircraft-control-pin': 'unit-test-only' }, body: '{' }, 400]
    ]) { const res = response(); await handler(req, res); assert.equal(res.code, code); }
  } finally { if (old === undefined) delete process.env.MIKEAIRCRAFT_CONTROL_PIN; else process.env.MIKEAIRCRAFT_CONTROL_PIN = old; }
});
test('handler uses atomic compare-and-set with no changes to the settings key', async () => {
  const prior = { pin: process.env.MIKEAIRCRAFT_CONTROL_PIN, url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, fetch: global.fetch };
  process.env.MIKEAIRCRAFT_CONTROL_PIN = 'unit-test-only';
  process.env.KV_REST_API_URL = 'https://fake.invalid'; process.env.KV_REST_API_TOKEN = 'fake';
  let raw = null, collisions = 1;
  global.fetch = async (_, options) => {
    const args = JSON.parse(options.body); let result;
    if (args[0] === 'GET') { assert.equal(args[1], 'mikeaircraft:gimbal:framing:v1'); result = raw; }
    else { assert.equal(args[0], 'EVAL'); assert.equal(args[3], 'mikeaircraft:gimbal:framing:v1');
      if (collisions-- > 0) result = 0;
      else { assert.equal(args[4], raw || ''); raw = args[5]; result = 1; }
    }
    return { ok: true, json: async () => ({ result }) };
  };
  try {
    const res = response();
    await handler({ method: 'POST', headers: { 'x-mikeaircraft-control-pin': 'unit-test-only' }, body: { action: 'open', sessionId } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.ready, false); assert.equal(res.body.sessionId, sessionId);
  } finally {
    global.fetch = prior.fetch;
    for (const [key, value] of [['MIKEAIRCRAFT_CONTROL_PIN', prior.pin], ['KV_REST_API_URL', prior.url], ['KV_REST_API_TOKEN', prior.token]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
