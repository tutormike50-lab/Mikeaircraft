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
  assert.doesNotMatch(html, /getCurrentPosition\(/);
});
