const test = require("node:test");
const assert = require("node:assert/strict");

test("control panel exposes crosshair workflow and continuous fresh geolocation", async () => {
  const handler = require("../api/control");
  let html = "";
  await handler({}, { setHeader() {}, status() { return this; }, send(value) { html = value; } });
  assert.match(html, /class="crosshair"/);
  assert.match(html, /AUTO CALIBRATE CAMERA POSITION/);
  assert.match(html, /navigator\.geolocation\.watchPosition/);
  assert.match(html, /enableHighAccuracy: true/);
  assert.match(html, /maximumAge: 0/);
  assert.match(html, /CALIBRATION CONFLICT/);
  assert.match(html, /Engineering details/);
  assert.match(html, /snapshot\.acceptanceMet/);
  assert.match(html, /camera-orientation\.js/);
  assert.match(html, /CameraOrientationCalibration\.requestPermission\(window\)/);
  assert.match(html, /HEADING/);
  assert.match(html, /ELEVATION/);
  assert.doesNotMatch(html, /fewer than 20 fresh fixes/);
  assert.doesNotMatch(html, /getCurrentPosition\(/);
});

test("rejected calibration returns before saving and preserves the previous position", async () => {
  const handler = require("../api/control");
  let html = "";
  await handler({}, { setHeader() {}, status() { return this; }, send(value) { html = value; } });
  const rejection = html.indexOf("if (!snapshot.acceptanceMet || !snapshot.estimate)");
  const save = html.indexOf("saveCameraLocation(snapshot)", rejection);
  assert.ok(rejection >= 0 && save > rejection);
  assert.match(html.slice(rejection, save), /previous saved position was preserved[\s\S]*return;/);
});

test("camera calibration has a dedicated route while field controls link to it", async () => {
  const control = require("../api/control");
  const calibration = require("../api/camera-calibration");
  const render = async (handler) => { let html = ""; await handler({ query: {} }, { setHeader() {}, status() { return this; }, send(value) { html = value; } }); return html; };
  const field = await render(control);
  const page = await render(calibration);
  assert.match(field, /class="normal-page"/);
  assert.match(field, /href="\/api\/camera-calibration"/);
  assert.match(page, /class="calibration-page"/);
  assert.match(page, /<h2>Camera Calibration<\/h2>/);
  assert.match(page, /POSITION[\s\S]*HEADING[\s\S]*ELEVATION/);
  assert.match(page, /navigator\.geolocation\.watchPosition/);
});
