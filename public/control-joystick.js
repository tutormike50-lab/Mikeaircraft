/* Framing setpoints only: releasing never leaves a remote velocity command. */
(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const pad = el('framingPad'), knob = el('framingKnob'), status = el('framingStatus');
  if (!pad) return;
  const connect = el('framingConnect'), stop = el('framingStop'), reset = el('framingReset');
  const save = el('framingSave'), cancel = el('framingCancel');
  const speed = el('framingSpeed'), pin = el('pin');
  const buttons = Array.from(document.querySelectorAll('[data-frame-direction]'));
  let state = null, checkedAt = 0, enabled = false, busy = false;
  let vector = { x: 0, y: 0 }, pointer = null, heldKey = null, pollTimer = null, resetting = false;
  let epoch = 0, lastStep = performance.now();
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const clamp = (v, n) => Math.max(-n, Math.min(n, v));
  function message(text, bad) { status.textContent = text; status.className = bad ? 'bad' : 'warn'; }
  function release() {
    vector = { x: 0, y: 0 }; heldKey = null; resetting = false;
    const captured = pointer; pointer = null;
    if (captured !== null && pad.hasPointerCapture?.(captured)) pad.releasePointerCapture(captured);
    knob.style.transform = 'translate(0px, 0px)';
    buttons.forEach(b => b.setAttribute('aria-pressed', 'false'));
  }
  function ready() {
    return enabled && state?.ready && performance.now() - checkedAt < 2000 && !document.hidden;
  }
  function paint() {
    const can = ready() && state?.adjusting;
    pad.setAttribute('aria-disabled', String(!can));
    buttons.forEach(b => { b.disabled = !can; });
    reset.disabled = !can || (!resetting && !(state?.applied?.pan || state?.applied?.tilt));
    stop.disabled = !enabled || !state?.connected || state?.stopRequested;
    connect.disabled = busy || Boolean(state?.adjusting) || Boolean(state?.command);
    save.disabled = !can || Boolean(state?.command);
    cancel.disabled = !state?.adjusting || Boolean(state?.command);
    const signed = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '°';
    el('framingPan').textContent = signed(state?.applied?.pan || 0);
    el('framingTilt').textContent = signed(state?.applied?.tilt || 0);
    el('framingTarget').textContent = state?.target || 'No aircraft';
    el('savedBoresightYaw').textContent = signed(state?.savedBoresight?.yawDeg || 0);
    el('savedBoresightPitch').textContent = signed(state?.savedBoresight?.pitchDeg || 0);
    if (!can) release();
  }
  function accept(data) {
    if (state && data.sessionId !== state.sessionId) {
      release(); enabled = false; epoch++;
      message('New controller session. Check framing, then reconnect the joystick.');
    }
    state = data; checkedAt = performance.now();
    if (resetting && Math.abs(data.applied?.pan || 0) < 0.01 && Math.abs(data.applied?.tilt || 0) < 0.01) {
      resetting = false; vector = { x: 0, y: 0 };
    }
    if (enabled) {
      message(data.stopRequested ? 'STOP requested. Check the camera has stopped; use physical STOP if needed.' :
        !data.connected ? 'Pi controller not connected. No camera commands can be sent.' :
        data.command ? 'Correction sent — waiting for the Pi.' :
        data.ready && data.adjusting ? 'Adjusting. Drag towards where the camera should point; automatic tracking continues.' :
        data.ready ? 'Tracking ready. Press START ADJUST to establish a zero adjustment baseline.' :
        data.mode === 'TRACKING' ? 'Acquiring aircraft — joystick waits until the camera is near its commanded aim.' :
        'Controller: ' + data.mode + '. Joystick is available during tracking only.');
    }
    paint();
  }
  async function request(body) {
    const headers = {};
    if (pin.value.trim()) headers['X-MikeAircraft-Control-Pin'] = pin.value.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch('/api/gimbal-control', { method: body ? 'POST' : 'GET',
        headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
        body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Joystick connection failed');
      return data;
    } finally { clearTimeout(timeout); }
  }
  function fail(error) {
    release(); enabled = false; epoch++; paint();
    message(error.name === 'AbortError' ? 'Connection timed out. Correction not confirmed. Reconnect before adjusting.' : error.message, true);
  }
  async function pump() {
    clearTimeout(pollTimer);
    if (!enabled || busy || document.hidden) return;
    busy = true;
    const turn = epoch;
    try {
      let body;
      if (resetting && ready() && !state.command) {
        const pan = state.applied.pan, tilt = state.applied.tilt;
        vector = { x: Math.abs(pan) < 0.01 ? 0 : -Math.sign(pan), y: Math.abs(tilt) < 0.01 ? 0 : -Math.sign(tilt) };
      }
      const moving = vector.x || vector.y;
      if (moving && ready() && !state.command) {
        const now = performance.now();
        const dt = Math.min(0.25, Math.max(0.02, (now - lastStep) / 1000)); lastStep = now;
        const rate = resetting ? 0.2 : speed.value === 'normal' ? 0.8 : 0.2;
        const round = v => Math.round(clamp(v, 5) * 10000) / 10000;
        body = { action: 'trim', sessionId: state.sessionId, requestId: crypto.randomUUID(),
          expectedRevision: state.revision, validUntil: state.commandWindowUntil,
          pan: round(resetting && Math.abs(state.applied.pan) <= rate * dt ? 0 : state.applied.pan + vector.x * rate * dt),
          tilt: round(resetting && Math.abs(state.applied.tilt) <= rate * dt ? 0 : state.applied.tilt + vector.y * rate * dt) };
      }
      const data = await request(body);
      if (turn === epoch) accept(data);
    } catch (error) { if (turn === epoch) fail(error); }
    finally {
      busy = false;
      if (enabled && !document.hidden) pollTimer = setTimeout(pump, (vector.x || vector.y || state?.command) ? 100 : 750);
    }
  }
  connect.addEventListener('click', async () => {
    if (busy) return;
    release(); epoch++; enabled = true; state = null;
    message('Starting a known adjustment baseline…');
    try {
      state = await request(); checkedAt = performance.now();
      state = await request({ action: 'start-adjust', sessionId: state.sessionId }); checkedAt = performance.now();
      accept(state); pump();
    } catch (error) { fail(error); }
  });
  async function finish(action, success) {
    if (!state?.adjusting || busy || state.command) return;
    release(); busy = true;
    try { accept(await request({ action, sessionId: state.sessionId })); message(success); }
    catch (error) { fail(error); }
    finally { busy = false; paint(); if (enabled) pump(); }
  }
  save.addEventListener('click', () => finish('save-adjust', 'Adjustment saved. The same pointing target remains active.'));
  cancel.addEventListener('click', () => finish('cancel-adjust', 'Adjustment cancelled. Returning to the last saved boresight.'));
  stop.addEventListener('click', async () => {
    release(); enabled = false; epoch++; clearTimeout(pollTimer); paint();
    message('Requesting STOP…');
    try {
      const data = await request({ action: 'stop', sessionId: state.sessionId });
      state = data;
      message('STOP requested, not physically confirmed. Watch the camera; use physical STOP if needed.');
    } catch (error) { message('STOP could not be confirmed. Use the gimbal’s physical STOP/power.', true); }
  });
  reset.addEventListener('click', () => {
    if (!ready() || state.command) return;
    release(); resetting = true; lastStep = performance.now();
    message('Gently centring the framing trim…'); pump();
  });
  function move(event) {
    const r = pad.getBoundingClientRect(), radius = r.width * 0.32;
    let x = (event.clientX - r.left - r.width / 2) / radius;
    let y = -(event.clientY - r.top - r.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length < 0.12) x = y = 0;
    else if (length > 1) { x /= length; y /= length; }
    vector = { x, y }; knob.style.transform = 'translate(' + (x * radius) + 'px,' + (-y * radius) + 'px)';
  }
  pad.addEventListener('pointerdown', e => {
    if (!ready() || pointer !== null || e.button !== 0) return;
    e.preventDefault(); pad.focus(); pointer = e.pointerId; pad.setPointerCapture(pointer);
    lastStep = performance.now(); move(e); pump();
  });
  pad.addEventListener('pointermove', e => { if (pointer === e.pointerId && ready()) move(e); });
  pad.addEventListener('lostpointercapture', release);
  buttons.forEach(button => {
    const key = button.dataset.frameDirection;
    button.addEventListener('pointerdown', e => {
      if (!ready() || e.button !== 0) return;
      e.preventDefault(); release(); const [x, y] = directions[key]; vector = { x, y };
      button.setAttribute('aria-pressed', 'true'); lastStep = performance.now(); pump();
    });
    button.addEventListener('keydown', e => {
      if (![' ', 'Enter'].includes(e.key) || !ready()) return;
      e.preventDefault(); if (heldKey) return;
      heldKey = e.key; const [x, y] = directions[key]; vector = { x, y }; lastStep = performance.now(); pump();
    });
    button.addEventListener('blur', release);
  });
  pad.addEventListener('keydown', e => {
    if (!directions[e.key] || !ready()) return;
    e.preventDefault(); if (heldKey) return;
    heldKey = e.key; const [x, y] = directions[e.key]; vector = { x, y }; lastStep = performance.now(); pump();
  });
  pad.addEventListener('blur', release);
  window.addEventListener('keyup', release);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);
  window.addEventListener('pagehide', () => { release(); enabled = false; epoch++; });
  window.addEventListener('offline', () => fail(new Error('Device is offline. Reconnect before adjusting.')));
  document.addEventListener('visibilitychange', () => {
    release();
    if (document.hidden) { enabled = false; epoch++; clearTimeout(pollTimer); paint(); message('Joystick paused. Reconnect when you return.'); }
  });
  pin.addEventListener('input', () => { release(); enabled = false; epoch++; paint(); message('PIN changed. Reconnect the joystick.'); });
  setInterval(paint, 250);
  paint();
})();
