const test = require("node:test");
const assert = require("node:assert/strict");
const { createSession, requestPermission } = require("../public/camera-orientation");

test("reports unavailable and denied sensor permission specifically", async () => {
  assert.match((await requestPermission({})).reason, /does not expose/);
  const denied = await requestPermission({ DeviceOrientationEvent: { requestPermission: async () => "denied" } });
  assert.equal(denied.granted, false);
  assert.match(denied.reason, /denied/);
});

test("accepts repeated stable heading and elevation samples with offsets", () => {
  const session = createSession({ headingDeg: 2, elevationDeg: -1, magneticDeclinationDeg: 4 });
  for (let index = 0; index < 12; index++) session.add({ webkitCompassHeading: 359 + (index % 3), beta: 5 + (index % 2) * .2 });
  const result = session.snapshot();
  assert.equal(result.ready, true);
  assert.ok(result.homeTrueAzimuthDeg > 5 && result.homeTrueAzimuthDeg < 8);
  assert.ok(Math.abs(result.homeElevationDeg - 4.1) < 1e-9);
  assert.equal(result.quality, "STABLE");
});

test("does not mislabel an uncorrected iPhone magnetic heading as true", () => {
  const session = createSession();
  for (let index = 0; index < 12; index++) session.add({ webkitCompassHeading: 90, beta: 5 });
  const result = session.snapshot();
  assert.equal(result.ready, false);
  assert.match(result.reason, /magnetic declination/);
});

test("converts iPhone magnetic top-edge heading to true camera heading", () => {
  const session = createSession({ magneticDeclinationDeg: 4.5 });
  for (let index = 0; index < 12; index++) session.add({ webkitCompassHeading: 90, beta: 5 });
  const result = session.snapshot();
  assert.equal(result.ready, true);
  assert.equal(result.homeTrueAzimuthDeg, 94.5);
  assert.equal(result.headingReference, "TRUE_NORTH");
  assert.equal(result.phoneAxis, "PORTRAIT_TOP_EDGE");
});

test("rejects obviously unstable or moving readings", () => {
  const session = createSession({ magneticDeclinationDeg: 0 });
  for (let index = 0; index < 12; index++) session.add({ webkitCompassHeading: index % 2 ? 40 : 100, beta: index % 2 ? -15 : 20 });
  const result = session.snapshot();
  assert.equal(result.ready, false);
  assert.equal(result.quality, "UNSTABLE");
  assert.match(result.reason, /moving/);
});
