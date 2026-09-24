const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { directState } = require('../lib/direct-tracker-state');
const direct = require('../api/direct-tracker');

test('explicit selected ICAO remains authoritative until stop or reselection', () => {
  const first = directState(JSON.stringify({ command: 'TRACKING', aircraftId: 'abc123', callsign: 'ONE1', generation: 1 }));
  assert.equal(first.aircraftId, 'abc123');
  const unchanged = directState(JSON.stringify({ ...first, generation: 1 }));
  assert.equal(unchanged.aircraftId, 'abc123');
  const reselection = directState(JSON.stringify({ command: 'TRACKING', aircraftId: 'def456', callsign: 'TWO2', generation: 2 }));
  assert.equal(reselection.aircraftId, 'def456');
  assert.equal(directState(JSON.stringify({ command: 'STOPPED', aircraftId: 'def456', generation: 3 })).aircraftId, null);
});

test('direct control validates ICAO and never accepts implicit target selection', () => {
  assert.equal(direct.cleanAircraftId(' AbC123 '), 'abc123');
  assert.equal(direct.cleanAircraftId('CURRENT'), null);
  assert.equal(direct.cleanAircraftId(''), null);
});

test('standalone page has explicit controls and does not use ribbon selection', async () => {
  const handler = require('../api/direct-tracker-page'); let html;
  await handler({}, { setHeader() {}, status() { return this; }, send(value) { html = value; } });
  for (const id of ['radar','selected','track','stop','home','rawAge','horizon','stateTime','angles','relative']) assert.ok(html.includes('id="'+id+'"'));
  assert.ok(html.includes('/direct-tracker.js'));
  const client = fs.readFileSync(require.resolve('../public/direct-tracker.js'), 'utf8');
  assert.ok(client.includes('/api/direct-tracker'));
  assert.ok(!client.includes('currentAircraft'));
  assert.ok(!client.includes('nextIn'));
});

test('Vercel exposes the standalone tracker without changing the production root', () => {
  const config = JSON.parse(fs.readFileSync(require.resolve('../vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites.find(item => item.source === '/direct-tracker'), { source: '/direct-tracker', destination: '/api/direct-tracker-page' });
  assert.equal(config.redirects[0].destination, '/api/monitor');
});
