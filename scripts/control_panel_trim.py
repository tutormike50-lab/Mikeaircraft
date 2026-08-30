"""Session-scoped HTTPS framing link. No Bluetooth or motor access in this module.

Only the guarded motor loop calls offsets(), so a background HTTP response can
never move a gimbal or mutate HOME. The existing panel PIN is prompted locally;
it is never put in a URL, command argument, log, or generated file.
"""
import copy
import json
import math
import threading
import time
import urllib.request
from urllib.parse import urlsplit
import uuid


class PanelFault(RuntimeError):
    pass


class PanelTrim:
    def __init__(self, url, pin, clock=time.monotonic, transport=None):
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Panel URL must be an HTTPS origin without credentials or query parameters')
        if parsed.path not in ('', '/'):
            raise ValueError('Use the panel site origin, not an API path')
        if not pin or len(pin) > 256:
            raise ValueError('A private control PIN is required')
        self.url = url.rstrip('/') + '/api/gimbal-control'
        self.pin = pin
        self.clock = clock
        self.transport = transport or self._http
        self.session_id = str(uuid.uuid4())
        self.lock = threading.Lock()
        self.closed = threading.Event()
        self.thread = None
        self.reason = None
        self.last_reply = None
        self.seq = 0
        self.reported_at = clock()
        self.report = dict(mode='WAITING', ready=False, target='', telemetryAge=999, tickAge=999)
        self.applied = dict(revision=0, pan=0.0, tilt=0.0)
        self.pending = None
        self.deadline = 0

    def _http(self, body):
        request = urllib.request.Request(self.url, data=json.dumps(body).encode(), method='POST',
            headers={'Content-Type': 'application/json', 'X-MikeAircraft-Control-Pin': self.pin})
        # Do not forward the PIN through redirects to another endpoint/host.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        opener = urllib.request.build_opener(NoRedirect)
        with opener.open(request, timeout=1.5) as response:
            data = response.read(65537)
        if len(data) > 65536:
            raise PanelFault('Oversized panel response')
        return json.loads(data)

    def trip(self, reason):
        with self.lock:
            if self.reason is None:
                self.reason = reason
            self.pending = None

    def _exchange(self, body):
        started = self.clock()
        data = self.transport(body)
        elapsed = self.clock() - started
        if elapsed > 1.8:
            raise PanelFault('Panel response was too slow; session invalidated')
        if not isinstance(data, dict) or not data.get('ok') or data.get('sessionId') != self.session_id:
            raise PanelFault('Panel session was rejected or replaced')
        if data.get('stopRequested'):
            raise PanelFault('Operator requested STOP from the control panel')
        if not data.get('connected'):
            raise PanelFault('Panel session is no longer connected')
        with self.lock:
            self.last_reply = self.clock()
            cmd = data.get('command')
            if cmd is not None:
                remaining = (cmd['expiresAt'] - data['serverNow']) / 1000 - elapsed
                if remaining > 0 and cmd['revision'] > self.applied['revision']:
                    self.pending = copy.deepcopy(cmd)
                    self.deadline = self.clock() + remaining
        return data

    def start(self):
        self._exchange(dict(action='open', sessionId=self.session_id))
        self.thread = threading.Thread(target=self._run, name='framing-panel', daemon=True)
        self.thread.start()

    def update(self, mode, target='', ready=False, telemetry_age=999, tick_age=999):
        with self.lock:
            self.report = dict(mode=mode, target=target, ready=bool(ready),
                               telemetryAge=telemetry_age, tickAge=tick_age)
            self.reported_at = self.clock()

    def _heartbeat(self):
        with self.lock:
            self.seq += 1
            age = max(0, self.clock() - self.reported_at)
            body = dict(action='heartbeat', sessionId=self.session_id, seq=self.seq,
                        applied=dict(self.applied), **self.report)
            body['telemetryAge'] += age
            body['tickAge'] += age
        self._exchange(body)

    def _run(self):
        while not self.closed.is_set():
            try:
                self._heartbeat()
            except Exception:
                # Do not stringify network exceptions: URLs/headers may contain
                # sensitive configuration. No reconnection of a live run.
                self.trip('Control-panel link failed; tracking must stop')
                return
            self.closed.wait(0.2)

    def require(self):
        with self.lock:
            if self.last_reply is None or self.clock() - self.last_reply > 3:
                if self.reason is None:
                    self.reason = 'Control-panel link became stale'
            if self.reason:
                raise PanelFault(self.reason)

    def offsets(self):
        self.require()
        with self.lock:
            cmd = self.pending
            if cmd is not None:
                age = self.clock() - self.reported_at
                allowed = (self.clock() < self.deadline and self.report['mode'] == 'TRACKING'
                    and self.report['ready'] and self.report['telemetryAge'] + age <= 1
                    and self.report['tickAge'] + age <= 0.5)
                self.pending = None
                if allowed:
                    values = [cmd.get('pan'), cmd.get('tilt')]
                    if (type(cmd.get('revision')) is not int or cmd['revision'] <= self.applied['revision']
                        or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or abs(v) > 5 for v in values)
                        or abs(values[0] - self.applied['pan']) > 0.25000001
                        or abs(values[1] - self.applied['tilt']) > 0.25000001):
                        self.reason = 'Invalid framing correction rejected'
                        raise PanelFault(self.reason)
                    self.applied = dict(revision=cmd['revision'], pan=values[0], tilt=values[1])
                    print(f"FRAMING accepted revision={cmd['revision']} pan={values[0]:+.3f} tilt={values[1]:+.3f}; HOME unchanged", flush=True)
            return self.applied['pan'], self.applied['tilt']

    def close(self):
        self.closed.set()
        if self.thread is not None:
            self.thread.join(timeout=1.8)
        # Never wait for network cleanup before stopping/disconnecting motors.
        # Expiry also marks the panel offline if this best-effort report fails.
        self.update('STOPPED')
        try:
            self._heartbeat()
        except Exception:
            pass


def framed_targets(base_yaw, base_pitch, pan, tilt, home_yaw, home_pitch,
                   reference_elevation, max_pan, max_down, max_up):
    """World-frame right/up trim, converted to this rig's yaw/pitch convention."""
    wrap = lambda v: (v + 180) % 360 - 180
    yaw, pitch = wrap(base_yaw + pan), wrap(base_pitch - tilt)
    elevation = reference_elevation - wrap(pitch - home_pitch)
    if abs(wrap(yaw - home_yaw)) > max_pan or not -max_down <= elevation <= max_up:
        raise PanelFault('Framing correction would exceed the existing motion limits')
    return yaw, pitch
