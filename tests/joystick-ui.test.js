const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/control-joystick.js'), 'utf8');
function element() {
  const listeners = {}, attrs = {};
  return { listeners, attrs, style: {}, value: '', textContent: '', disabled: false,
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); },
    async emit(k, value = {}) { for (const fn of listeners[k] || []) await fn({ preventDefault() {}, ...value }); },
    setAttribute(k, v) { attrs[k] = v; }, getBoundingClientRect() { return { left: 0, top: 0, width: 240, height: 240 }; },
    focus() {}, setPointerCapture(id) { this.capture = id; }, hasPointerCapture(id) { return this.capture === id; },
    releasePointerCapture() { this.capture = null; }
  };
}
function setup() {
  const ids = Object.fromEntries(['framingPad','framingKnob','framingStatus','framingConnect','framingStop','framingSpeed','framingPan','framingTilt','framingTarget','pin'].map(k => [k, element()]));
  ids.pin.value = 'fake-pin'; ids.framingSpeed.value = 'normal';
  const buttons = ['ArrowLeft','ArrowUp','ArrowDown','ArrowRight'].map(key => ({ ...element(), dataset: { frameDirection: key } }));
  const document = { ...element(), hidden: false, getElementById: k => ids[k], querySelectorAll: () => buttons };
  const window = element(), calls = [], timers = new Map();
  let nextTimer = 1, now = 0, fail = false;
  let response = { ok: true, connected: true, ready: true, sessionId: 'session-1234567890', target: 'TEST', revision: 0,
    commandWindowUntil: 2000, applied: { revision: 0, pan: 0, tilt: 0 }, command: null };
  const context = { document, window, AbortController, crypto: { randomUUID: () => 'request-1234567890' },
    performance: { now: () => now }, setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() {},
    async fetch(url, opts) { calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
      if (fail) throw new Error('network lost');
      return { ok: true, json: async () => structuredClone(response) }; }
  };
  vm.runInNewContext(source, context);
  return { ids, window, document, calls, buttons, timers,
    tick(ms) { now += ms; }, fail() { fail = true; }, state(value) { response = { ...response, ...value }; },
    async runTimer() { const item = [...timers].find(([,v]) => v.delay !== 2500); if (item) { timers.delete(item[0]); await item[1].fn(); } }
  };
}
test('UI is disabled until authenticated connection and fresh readiness', async () => {
  const s = setup(); assert.equal(s.ids.framingPad.attrs['aria-disabled'], 'true');
  await s.ids.framingConnect.emit('click');
  assert.equal(s.ids.framingPad.attrs['aria-disabled'], 'false');
  assert.equal(s.calls[0].opts.headers['X-MikeAircraft-Control-Pin'], 'fake-pin');
  assert.ok(!s.calls[0].url.includes('fake-pin'));
});
test('drag right/up sends bounded absolute pan-positive tilt-positive values', async () => {
  const s = setup(); await s.ids.framingConnect.emit('click');
  await s.ids.framingPad.emit('pointerdown', { button: 0, pointerId: 1, clientX: 190, clientY: 50 });
  await new Promise(setImmediate); s.tick(200); await s.runTimer();
  const body = s.calls.filter(c => c.body?.action === 'trim').at(-1).body;
  assert.ok(body.pan > 0 && body.tilt > 0); assert.ok(body.pan <= 0.25 && body.tilt <= 0.25);
});
test('pointer release, cancel, blur and keyup stop new corrections', async () => {
  for (const event of ['pointerup','pointercancel','blur','keyup']) {
    const s = setup(); await s.ids.framingConnect.emit('click');
    await s.ids.framingPad.emit('pointerdown', { button: 0, pointerId: 1, clientX: 190, clientY: 120 });
    await new Promise(setImmediate); await s.window.emit(event); s.tick(200);
    const count = s.calls.filter(c => c.body?.action === 'trim').length;
    await s.runTimer();
    assert.equal(s.calls.filter(c => c.body?.action === 'trim').length, count, event);
    assert.equal(s.ids.framingKnob.style.transform, 'translate(0px, 0px)');
  }
});
test('hidden tab and network failure disable joystick; no automatic replay', async () => {
  const s = setup(); await s.ids.framingConnect.emit('click');
  s.document.hidden = true; await s.document.emit('visibilitychange');
  assert.equal(s.ids.framingPad.attrs['aria-disabled'], 'true');
  s.document.hidden = false; await s.document.emit('visibilitychange');
  assert.equal(s.ids.framingPad.attrs['aria-disabled'], 'true');
  await s.ids.framingConnect.emit('click'); s.fail(); await s.runTimer();
  assert.equal(s.ids.framingPad.attrs['aria-disabled'], 'true');
});
test('STOP is explicit and never claims physical confirmation', async () => {
  const s = setup(); await s.ids.framingConnect.emit('click'); await s.ids.framingStop.emit('click');
  assert.equal(s.calls.at(-1).body.action, 'stop');
  assert.match(s.ids.framingStatus.textContent, /not physically confirmed/);
});
test('existing panel still serves airport, priority and location controls', async () => {
  const handler = require('../api/control'); let html;
  await handler({}, { setHeader() {}, status() { return this; }, send(v) { html = v; } });
  for (const name of ['airportGrid','priorityMessage','resetLocationButton','framingPad']) assert.ok(html.includes('id="'+name+'"'));
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(inline);
  assert.ok(html.includes('/control-joystick.js'));
});
