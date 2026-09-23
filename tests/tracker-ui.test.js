const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/tracker-control.js'), 'utf8');

function element() {
  const listeners = {};
  return { listeners, textContent: '', className: '', disabled: false,
    classList: { add() {} }, addEventListener(k, fn) { listeners[k] = fn; },
    async click() { await listeners.click(); } };
}
function setup(initial) {
  const ids = Object.fromEntries(['trackerButton','trackerPiStatus','trackerProcessStatus','trackerAircraft','trackerDetail'].map(id => [id, element()]));
  const calls = []; let response = initial;
  const context = { document: { getElementById: id => ids[id] }, window: { ensureControlAuthentication: async () => true },
    setInterval() {}, async fetch(url, options = {}) { calls.push({ url, options }); return { ok: true, json: async () => response }; } };
  vm.runInNewContext(source, context);
  return { ids, calls, setResponse(value) { response = value; } };
}

test('button renders offline, starting, tracking and stop transitions', async () => {
  const base = { ok: true, desired: 'STOPPED', piOnline: false, trackerState: 'STOPPED', currentAircraft: null, heartbeatAgeSeconds: 20 };
  const s = setup(base); await new Promise(setImmediate);
  assert.equal(s.ids.trackerPiStatus.textContent, 'PI OFFLINE');
  assert.equal(s.ids.trackerButton.textContent, '▶ START TRACKING');
  s.setResponse({ ...base, desired: 'TRACKING', piOnline: true, trackerState: 'STARTING', heartbeatAgeSeconds: 1 });
  await s.ids.trackerButton.click();
  assert.equal(JSON.parse(s.calls.at(-1).options.body).desired, 'TRACKING');
  assert.equal(s.ids.trackerButton.textContent, 'STARTING…');
  s.setResponse({ ...base, desired: 'TRACKING', piOnline: true, trackerState: 'TRACKING', currentAircraft: 'ABC123', heartbeatAgeSeconds: 1 });
  await s.ids.trackerButton.click();
  assert.equal(JSON.parse(s.calls.at(-1).options.body).desired, 'STOPPED');
  assert.equal(s.ids.trackerAircraft.textContent, 'ABC123');
});

test('control page retains prior controls and serves the large tracker control', async () => {
  const handler = require('../api/control'); let html;
  await handler({}, { setHeader() {}, status() { return this; }, send(value) { html = value; } });
  for (const id of ['airportGrid','priorityMessage','resetLocationButton','framingPad','trackerButton']) assert.ok(html.includes('id="'+id+'"'));
  assert.ok(html.includes('▶ START TRACKING'));
  assert.ok(html.includes('/tracker-control.js'));
});
