const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../api/link-v2-commands");

test("V2 authentication uses an independent secret", () => {
  process.env.MIKEAIRCRAFT_LINK_V2_TOKEN = "new-independent-secret";
  assert.equal(api.authorised({ headers: { authorization: "Bearer new-independent-secret" } }), true);
  assert.equal(api.authorised({ headers: { authorization: "Bearer old-bridge-secret" } }), false);
  delete process.env.MIKEAIRCRAFT_LINK_V2_TOKEN;
});

test("command envelope is versioned, short lived and maps explicit ownership", () => {
  const now = Date.parse("2026-09-24T20:00:00Z");
  assert.deepEqual(api.commandEnvelope(JSON.stringify({ command: "TRACKING", aircraftId: "abc123", callsign: "MIKE1", generation: 42, updatedAt: "2026-09-24T19:59:59Z" }), now), {
    protocolVersion: "mikeaircraft-link-v2", releaseId: "ec9b423-link-v2", sequence: 42,
    commandId: "direct-42", selectedIcao: "abc123", callsign: "MIKE1",
    issuedAt: "2026-09-24T19:59:59.000Z", expiresAt: "2026-09-24T20:00:15.000Z"
  });
});

test("stopped or malformed state never produces a target", () => {
  for (const value of [null, "not json", JSON.stringify({ command: "STOPPED", aircraftId: "abc123", generation: 8 })])
    assert.equal(api.commandEnvelope(value, 0).selectedIcao, null);
});

test("health allowlist cannot echo secrets or arbitrary paths", () => {
  const clean = api.cleanHealth({ protocolVersion: "mikeaircraft-link-v2", releaseId: "ec9b423-link-v2", lastSequence: 4, token: "never", controlPin: "never", runtimePath: "/secret", fault: "offline" });
  assert.equal(clean.lastSequence, 4);
  assert.equal(clean.fault, "offline");
  assert.equal(clean.token, undefined);
  assert.equal(clean.controlPin, undefined);
  assert.equal(clean.runtimePath, undefined);
});

test("future timestamps are clamped", () => {
  const now = 100000;
  const command = api.commandEnvelope({ command: "TRACKING", aircraftId: "abcdef", generation: 1, updatedAt: new Date(now + 60000).toISOString() }, now);
  assert.equal(Date.parse(command.issuedAt), now + api.constants.MAX_CLOCK_SKEW_MS);
});

test("handler rejects a Pi/server version mismatch before reading state", async () => {
  process.env.MIKEAIRCRAFT_LINK_V2_TOKEN = "secret";
  let status, body;
  await api({ method: "POST", headers: { authorization: "Bearer secret" }, body: {
    protocolVersion: "mikeaircraft-link-v1", releaseId: "wrong"
  } }, { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; return value; } });
  delete process.env.MIKEAIRCRAFT_LINK_V2_TOKEN;
  assert.equal(status, 409);
  assert.equal(body.error, "Version mismatch");
  assert.equal(body.protocolVersion, api.constants.PROTOCOL_VERSION);
  assert.equal(body.releaseId, api.constants.RELEASE_ID);
});

test("health endpoint is operator-authenticated and fail-closed", async () => {
  const health = require("../api/link-v2-health");
  let status, body;
  await health({ method: "GET", headers: {} }, { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; return value; } });
  assert.equal(status, 401);
  assert.equal(body.ok, false);
});
