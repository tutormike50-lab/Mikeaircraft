const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCameraOptics, equivalentFocalLength } = require("../lib/camera-optics");

test("manual logarithmic mapping has correct mode endpoints and is monotonic", () => {
  assert.equal(equivalentFocalLength(0, "STANDARD_OR_OFF"), 30.5);
  assert.equal(equivalentFocalLength(1, "STANDARD_OR_OFF"), 627);
  assert.equal(equivalentFocalLength(0, "DYNAMIC"), 32);
  assert.equal(equivalentFocalLength(1, "DYNAMIC"), 640);
  const values = [0, .25, .5, .75, 1].map((z) => equivalentFocalLength(z));
  assert.ok(values.every((value, index) => index === 0 || value > values[index - 1]));
});

test("persisted optics is normalized into the complete V1 contract", () => {
  const optics = buildCameraOptics({ slider_position_0_1: .5, stabilisation_mode: "DYNAMIC", timestamp_ms: 123 });
  assert.equal(optics.timestamp_ms, 123);
  assert.equal(optics.source, "MANUAL");
  assert.equal(optics.source_confidence, "ESTIMATED");
  assert.equal(optics.recording_width_px, 1920);
  assert.equal(optics.recording_height_px, 1080);
  assert.equal(optics.physical_focal_length_mm, null);
  assert.equal(optics.fov_model, "CANON_EQUIVALENT");
  assert.equal(optics.optics_valid, true);
});
