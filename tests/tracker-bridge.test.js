const test = require('node:test');
const assert = require('node:assert/strict');
const { publicState } = require('../lib/tracker-bridge-state');
const control = require('../api/tracker-control');
const piBridge = require('../api/pi-bridge');

function response() {
  return { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
}

function saveEnv() {
  return { pin: process.env.MIKEAIRCRAFT_CONTROL_PIN, bridge: process.env.MIKEAIRCRAFT_PI_BRIDGE_TOKEN,
    url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, fetch: global.fetch };
}
function restoreEnv(old) {
  global.fetch = old.fetch;
  for (const [key, value] of [['MIKEAIRCRAFT_CONTROL_PIN', old.pin], ['MIKEAIRCRAFT_PI_BRIDGE_TOKEN', old.bridge],
    ['KV_REST_API_URL', old.url], ['KV_REST_API_TOKEN', old.token]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

test('heartbeat freshness makes stale Pi offline without inventing live status', () => {
  const desired = JSON.stringify({ desired: 'TRACKING', generation: 4, updatedAt: '2026-01-01T00:00:00.000Z' });
  const fresh = JSON.stringify({ receivedAt: 1000, trackerState: 'TRACKING', currentAircraft: 'TEST123', rs4State: 'CONNECTED' });
  assert.equal(publicState(desired, fresh, 15_999).piOnline, true);
  const stale = publicState(desired, fresh, 16_001);
  assert.equal(stale.piOnline, false);
  assert.equal(stale.trackerState, 'STOPPED');
  assert.equal(stale.currentAircraft, null);
});

test('operator desired-state API requires the existing browser authentication', async () => {
  const old = saveEnv(); process.env.MIKEAIRCRAFT_CONTROL_PIN = 'test-pin';
  try {
    const denied = response(); await control({ method: 'GET', headers: {} }, denied);
    assert.equal(denied.code, 401);
    const invalid = response(); await control({ method: 'POST', headers: { 'x-mikeaircraft-control-pin': 'test-pin' }, body: { desired: 'RUN' } }, invalid);
    assert.equal(invalid.code, 400);
  } finally { restoreEnv(old); }
});

test('authenticated START advances generation and returns bridge status', async () => {
  const old = saveEnv();
  process.env.MIKEAIRCRAFT_CONTROL_PIN = 'test-pin'; process.env.KV_REST_API_URL = 'https://redis.invalid'; process.env.KV_REST_API_TOKEN = 'redis-token';
  const desired = JSON.stringify({ desired: 'TRACKING', generation: 7, updatedAt: '2026-01-01T00:00:00.000Z' });
  const heartbeat = JSON.stringify({ receivedAt: Date.now(), trackerState: 'STARTING' });
  const calls = [];
  global.fetch = async (url, options) => {
    const command = JSON.parse(options.body); calls.push(command);
    if (String(url).endsWith('/pipeline')) return { ok: true, json: async () => [{ result: desired }, { result: heartbeat }] };
    assert.equal(command[0], 'EVAL'); assert.equal(command.at(-2), 'TRACKING');
    return { ok: true, json: async () => ({ result: 7 }) };
  };
  try {
    const res = response(); await control({ method: 'POST', headers: { 'x-mikeaircraft-control-pin': 'test-pin' }, body: { desired: 'TRACKING' } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.desired, 'TRACKING'); assert.equal(res.body.trackerState, 'STARTING');
    assert.equal(calls.length, 2);
  } finally { restoreEnv(old); }
});

test('Pi heartbeat uses separate bearer secret and receives desired state', async () => {
  const old = saveEnv();
  process.env.MIKEAIRCRAFT_PI_BRIDGE_TOKEN = 'bridge-secret'; process.env.KV_REST_API_URL = 'https://redis.invalid'; process.env.KV_REST_API_TOKEN = 'redis-token';
  global.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/pipeline'));
    const commands = JSON.parse(options.body);
    assert.deepEqual(commands[0], ['GET', 'mikeaircraft:tracker:desired:v1']);
    assert.equal(commands[1][0], 'SET'); assert.equal(commands[1].at(-2), 'EX'); assert.equal(commands[1].at(-1), '45');
    return { ok: true, json: async () => [{ result: JSON.stringify({ desired: 'TRACKING', generation: 9 }) }, { result: 'OK' }] };
  };
  try {
    const denied = response(); await piBridge({ method: 'POST', headers: {}, body: { trackerState: 'STOPPED' } }, denied); assert.equal(denied.code, 401);
    const res = response(); await piBridge({ method: 'POST', headers: { authorization: 'Bearer bridge-secret' }, body: { trackerState: 'TRACKING', currentAircraft: 'ABC123' } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.desired, 'TRACKING'); assert.equal(res.body.generation, 9);
  } finally { restoreEnv(old); }
});

test('Pi auth diagnostic is read-only and reports only the accepted token fingerprint', async () => {
  const old = saveEnv();
  process.env.MIKEAIRCRAFT_PI_BRIDGE_TOKEN = '  bridge-secret  ';
  try {
    const denied = response(); await piBridge({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, denied);
    assert.equal(denied.code, 401);
    assert.equal(denied.body.tokenFingerprint, undefined);
    const res = response(); await piBridge({ method: 'GET', headers: { authorization: 'Bearer bridge-secret' } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.credential, 'bridge-token');
    assert.match(res.body.tokenFingerprint, /^[0-9a-f]{12}$/);
    assert.equal(res.body.tokenFingerprint, piBridge.tokenFingerprint('bridge-secret'));
  } finally { restoreEnv(old); }
});
