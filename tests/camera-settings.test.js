const test = require("node:test");
const assert = require("node:assert/strict");
const settingsHandler = require("../api/settings");
const cameraReferenceHandler = require("../api/camera-reference");
const { sessionCookie } = require("../lib/control-auth");
const { normaliseCameraLocation, normaliseStoredSettings } = settingsHandler;

function responseCapture() {
  return {
    statusCode: 200, body: null,
    setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }, end() { return this; }
  };
}

function completeLocation(overrides = {}) {
  return {
    lat: 50, lon: 14, accuracyM: 6,
    calibrationStartedAt: "2026-09-23T10:00:00Z",
    calibrationCompletedAt: "2026-09-23T10:01:30Z",
    orientation: {
      homeTrueAzimuthDeg: 243.2, homeElevationDeg: 3.4,
      headingSpreadDeg: 2, elevationSpreadDeg: 1, sampleCount: 20,
      calibratedAt: "2026-09-23T10:01:30Z"
    },
    ...overrides
  };
}

test("normalises and preserves multi-fix CameraReference provenance", () => {
  const value = normaliseCameraLocation({
    lat: 50.123456789, lon: 14.987654321, horizontalUncertaintyM: 4.94,
    altitudeM: 321.26, altitudeAccuracyM: 8.14, phoneReportedAccuracyM: 4.2,
    observedSpreadM: 1.23, clusterRadius95M: 2.34, centreMovement30sM: .56,
    sampleCountTotal: 32, sampleCountAccepted: 30, sampleCountRejected: 2,
    duplicateTimestampCount: 1, staleTimestampCount: 3,
    calibrationStartedAt: "2026-09-23T10:00:00Z", calibrationCompletedAt: "2026-09-23T10:01:30Z",
    grade: "EXCELLENT"
  });
  assert.equal(value.lat, 50.1234568);
  assert.equal(value.horizontalUncertaintyM, 4.9);
  assert.equal(value.altitudeDatum, "WGS84_ELLIPSOID");
  assert.equal(value.altitudeSource, "BROWSER_GEOLOCATION");
  assert.equal(value.source, "BROWSER_GEOLOCATION_MULTI_FIX");
  assert.equal(value.sampleCountAccepted, 30);
  assert.equal(value.l80Evidence.status, "NOT_INTEGRATED");
  assert.equal(value.l80Evidence.device, "/dev/ttyUSB0");
});

test("legacy persisted camera location is safely upgraded", () => {
  const settings = normaliseStoredSettings(JSON.stringify({ cameraLocation: { lat: 50, lon: 14, accuracyM: 14, altitudeM: null } }));
  assert.equal(settings.cameraLocation.horizontalUncertaintyM, 14);
  assert.equal(settings.cameraLocation.grade, "AMBER");
  assert.equal(settings.cameraLocation.altitudeDatum, null);
});

test("camera optics is persisted independently from CameraReference", () => {
  const settings = normaliseStoredSettings(JSON.stringify({ cameraLocation: { lat: 50, lon: 14, accuracyM: 14 }, cameraOptics: { slider_position_0_1: 0.75, stabilisation_mode: "DYNAMIC", timestamp_ms: 456 } }));
  assert.equal(settings.cameraLocation.lat, 50);
  assert.equal(settings.cameraOptics.slider_position_0_1, 0.75);
  assert.equal(settings.cameraOptics.stabilisation_mode, "DYNAMIC");
  assert.equal(settings.cameraOptics.timestamp_ms, 456);
});
test("rejects invalid position or uncertainty", () => {
  assert.equal(normaliseCameraLocation({ lat: 91, lon: 14, accuracyM: 4 }), null);
  assert.equal(normaliseCameraLocation({ lat: 50, lon: 14, accuracyM: -1 }), null);
});

test("persists stable HOME orientation provenance and fixed offsets", () => {
  const value = normaliseCameraLocation({
    lat: 50, lon: 14, accuracyM: 6,
    orientation: { homeTrueAzimuthDeg: 243.24, homeElevationDeg: 3.44, headingOffsetDeg: 1.5, elevationOffsetDeg: -0.5, headingSpreadDeg: 2, elevationSpreadDeg: 1, sampleCount: 20 }
  });
  assert.deepEqual(value.orientation, { homeTrueAzimuthDeg: 243.2, homeElevationDeg: 3.4, headingOffsetDeg: 1.5, elevationOffsetDeg: -0.5, headingSpreadDeg: 2, elevationSpreadDeg: 1, sampleCount: 20, source: "IPHONE_DEVICE_ORIENTATION", quality: "STABLE", calibratedAt: value.orientation.calibratedAt });
  assert.deepEqual(value.readiness, { position: true, heading: true, elevation: true, complete: true });
});

test("incomplete calibration cannot replace the previous complete CameraReference", async () => {
  const previous = JSON.stringify({ cameraLocation: completeLocation() });
  const prior = { pin: process.env.MIKEAIRCRAFT_CONTROL_PIN, url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, fetch: global.fetch };
  process.env.MIKEAIRCRAFT_CONTROL_PIN = "1234";
  process.env.KV_REST_API_URL = "https://redis.test";
  process.env.KV_REST_API_TOKEN = "token";
  const commands = [];
  global.fetch = async (_, options) => {
    const command = JSON.parse(options.body); commands.push(command);
    return { ok: true, json: async () => ({ result: command[0] === "GET" ? previous : "OK" }) };
  };
  try {
    const res = responseCapture();
    await settingsHandler({ method: "POST", headers: { "x-mikeaircraft-control-pin": "1234" }, body: { cameraLocation: { lat: 51, lon: 15, accuracyM: 4 } } }, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /previous calibration was preserved/);
    assert.deepEqual(commands.map(command => command[0]), ["GET"]);
  }
  finally {
    process.env.MIKEAIRCRAFT_CONTROL_PIN = prior.pin;
    process.env.KV_REST_API_URL = prior.url;
    process.env.KV_REST_API_TOKEN = prior.token;
    global.fetch = prior.fetch;
  }
});

test("complete calibration is committed and restored with readiness metadata", async () => {
  const previous = JSON.stringify({ cameraLocation: completeLocation() });
  const next = completeLocation({ lat: 51, lon: 15 });
  const prior = { pin: process.env.MIKEAIRCRAFT_CONTROL_PIN, url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, fetch: global.fetch };
  process.env.MIKEAIRCRAFT_CONTROL_PIN = "1234";
  process.env.KV_REST_API_URL = "https://redis.test";
  process.env.KV_REST_API_TOKEN = "token";
  let stored = previous;
  global.fetch = async (_, options) => {
    const command = JSON.parse(options.body);
    if (command[0] === "SET") { stored = command[2]; return { ok: true, json: async () => ({ result: "OK" }) }; }
    return { ok: true, json: async () => ({ result: stored }) };
  };
  try {
    const save = responseCapture();
    await settingsHandler({ method: "POST", headers: { "x-mikeaircraft-control-pin": "1234" }, body: { cameraLocation: next } }, save);
    assert.equal(save.statusCode, 200);
    assert.deepEqual(save.body.cameraReference.readiness, { position: true, heading: true, elevation: true, complete: true });
    assert.equal(save.body.cameraReference.orientation.homeTrueAzimuthDeg, 243.2);

    const reload = responseCapture();
    const cookie = sessionCookie("1234").split(";")[0];
    await cameraReferenceHandler({ method: "GET", headers: { cookie } }, reload);
    assert.equal(reload.statusCode, 200);
    assert.equal(reload.body.cameraReference.lat, 51);
    assert.equal(reload.body.cameraReference.readiness.complete, true);
    assert.equal(reload.body.cameraReference.orientation.homeElevationDeg, 3.4);
  }
  finally {
    process.env.MIKEAIRCRAFT_CONTROL_PIN = prior.pin;
    process.env.KV_REST_API_URL = prior.url;
    process.env.KV_REST_API_TOKEN = prior.token;
    global.fetch = prior.fetch;
  }
});
