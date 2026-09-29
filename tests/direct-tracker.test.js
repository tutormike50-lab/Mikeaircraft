const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { directState } = require('../lib/direct-tracker-state');
const direct = require('../api/direct-tracker');
const bridgeApi = require('../api/pi-bridge');
const radar = require('../public/direct-tracker');

test('clicking A makes A authoritative and clicking B explicitly replaces it', async () => {
  const commands = [], lock = radar.createDirectLock(async command => commands.push(command));
  await lock.select({ hex: 'abc123', callsign: 'ONE1' });
  assert.equal(lock.lockedIcao, 'abc123');
  await lock.select({ hex: 'def456', callsign: 'TWO2' });
  assert.equal(lock.lockedIcao, 'def456');
  assert.deepEqual(commands.map(command => command.aircraftId), ['abc123', 'def456']);
});

test('ADS-B and automatic ribbon updates cannot replace the locked ICAO', async () => {
  const lock = radar.createDirectLock(async () => {});
  await lock.select({ hex: 'abc123', callsign: 'ONE1' });
  const unrelatedUpdates = [
    { intelligence: { current: { hex: 'def456' }, nextIn: { hex: '111111' }, nextOut: { hex: '222222' } } },
    { aircraft: [{ hex: 'def456' }, { hex: 'abc123' }] },
    { aircraft: [{ hex: '999999', state: 'TAKEOFF_ROLL' }] }
  ];
  for (const update of unrelatedUpdates) assert.equal(lock.lockedIcao, 'abc123', JSON.stringify(update));
  lock.applyServerState({ command: 'TRACKING', aircraftId: 'abc123' });
  assert.equal(lock.lockedIcao, 'abc123');
});

test('ESTABLISH HOME is an explicit direct command and clears any lock', async () => {
  const commands = [], lock = radar.createDirectLock(async command => commands.push(command));
  await lock.select({ hex: 'abc123', callsign: 'ONE1' });
  await lock.establishHome();
  assert.equal(lock.lockedIcao, null);
  assert.deepEqual(commands.at(-1), { command: 'ESTABLISH_HOME' });
});

test('STOP clears the direct lock and sends an explicit STOPPED command', async () => {
  const commands = [], lock = radar.createDirectLock(async command => commands.push(command));
  await lock.select({ hex: 'abc123', callsign: 'ONE1' });
  await lock.stop();
  assert.equal(lock.lockedIcao, null);
  assert.equal(commands.at(-1).command, 'STOPPED');
});

test('direct control validates ICAO and never accepts implicit target selection', () => {
  assert.equal(direct.cleanAircraftId(' AbC123 '), 'abc123');
  assert.equal(direct.cleanAircraftId('CURRENT'), null);
  assert.equal(direct.cleanAircraftId(''), null);
});

test('standalone page is click-to-lock with an explicit STOP/HOME control', async () => {
  const handler = require('../api/direct-tracker-page'); let html;
  await handler({}, { setHeader() {}, status() { return this; }, send(value) { html = value; } });
  for (const id of ['radarCanvas','owner','selected','homeReference','establishHome','stopTracking','distance','rawAge','horizon','stateTime','angles','relative']) assert.ok(html.includes('id="'+id+'"'));
  for (const id of ['track','home']) assert.ok(!html.includes('id="'+id+'"'));
  assert.match(html, /GIMBAL OWNER: DIRECT TRACKER/);
  assert.ok(html.includes('/direct-tracker.js'));
  const client = fs.readFileSync(require.resolve('../public/direct-tracker.js'), 'utf8');
  assert.ok(client.includes('/api/direct-tracker'));
  assert.ok(client.includes("homeReferenceState==='UNVERIFIED'"));
  assert.ok(client.includes('HOME reference must be established before tracking.'));
  assert.ok(!client.includes('currentAircraft'));
  assert.ok(!client.includes('nextIn'));
});

test('radar uses the required 20 km range and 5/10/15/20 km rings', () => {
  assert.equal(radar.DIRECT_RADAR_RANGE_KM, 20);
  assert.deepEqual([...radar.DIRECT_RADAR_RINGS_KM], [5, 10, 15, 20]);
});

test('production tracker controls cannot clear an active direct ownership lock', () => {
  const source = fs.readFileSync(require.resolve('../api/tracker-control.js'), 'utf8');
  assert.ok(!source.includes("DEL',KEYS[3]"));
  assert.ok(!source.includes('direct-tracker:desired'));
});

test('a direct click becomes the explicit effective Pi control command', () => {
  const control = bridgeApi.effectiveControl(
    { desired: 'TRACKING', generation: 91 },
    directState(JSON.stringify({ command: 'TRACKING', aircraftId: 'abc123', generation: 7, updatedAt: '2026-09-24T12:00:00Z' }))
  );
  assert.deepEqual(control, { owner: 'DIRECT_TRACKER', command: 'TRACKING', generation: 7, aircraftId: 'abc123' });
});

test('explicit ESTABLISH HOME becomes the effective Pi control command', () => {
  const control = bridgeApi.effectiveControl(
    { desired: 'STOPPED', generation: 999 },
    directState(JSON.stringify({ command: 'ESTABLISH_HOME', generation: 8, updatedAt: '2026-09-24T12:00:30Z' }))
  );
  assert.deepEqual(control, { owner: 'DIRECT_TRACKER', command: 'ESTABLISH_HOME', generation: 8, aircraftId: null });
});

test('explicit Direct STOP remains the effective control command', () => {
  const control = bridgeApi.effectiveControl(
    { desired: 'STOPPED', generation: 999 },
    directState(JSON.stringify({ command: 'STOPPED', aircraftId: null, generation: 9, updatedAt: '2026-09-24T12:01:00Z' }))
  );
  assert.deepEqual(control, { owner: 'DIRECT_TRACKER', command: 'STOPPED', generation: 9, aircraftId: null });
});

test('normal START cannot steal effective control from Direct Tracker', () => {
  const control = bridgeApi.effectiveControl(
    { desired: 'TRACKING', generation: 999 },
    { command: 'TRACKING', aircraftId: 'def456', generation: 8 }
  );
  assert.equal(control.owner, 'DIRECT_TRACKER');
  assert.equal(control.aircraftId, 'def456');
  assert.equal(control.generation, 8);
});

test('Vercel exposes the standalone tracker without changing the production root', () => {
  const config = JSON.parse(fs.readFileSync(require.resolve('../vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites.find(item => item.source === '/direct-tracker'), { source: '/direct-tracker', destination: '/api/direct-tracker-page' });
  assert.equal(config.redirects[0].destination, '/api/monitor');
});
