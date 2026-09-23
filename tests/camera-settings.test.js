const test = require("node:test");
const assert = require("node:assert/strict");
const { normaliseCameraLocation, normaliseStoredSettings } = require("../api/settings");

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

test("rejects invalid position or uncertainty", () => {
  assert.equal(normaliseCameraLocation({ lat: 91, lon: 14, accuracyM: 4 }), null);
  assert.equal(normaliseCameraLocation({ lat: 50, lon: 14, accuracyM: -1 }), null);
});
