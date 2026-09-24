const crypto = require("crypto");
const { createRedisClient } = require("../lib/services/redis");
const { keys: directKeys } = require("./direct-tracker");
const { directState, DEFAULT_DIRECT } = require("../lib/direct-tracker-state");

const PROTOCOL_VERSION = "mikeaircraft-link-v2";
const RELEASE_ID = "ec9b423-link-v2";
const HEALTH_KEY = "mikeaircraft:link-v2:health:v1";
const COMMAND_TTL_MS = 15000;
const MAX_CLOCK_SKEW_MS = 5000;

function safeEqual(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(given.trim()), b = Buffer.from(expected.trim());
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorised(req) {
  const header = String(req.headers?.authorization || "");
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  return safeEqual(given, String(process.env.MIKEAIRCRAFT_LINK_V2_TOKEN || ""));
}

function cleanHealth(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const text = (item, max = 160) => typeof item === "string" ? item.trim().slice(0, max) : null;
  return {
    protocolVersion: text(value.protocolVersion, 64),
    releaseId: text(value.releaseId, 64),
    agentVersion: text(value.agentVersion, 64),
    state: text(value.state, 32),
    trackerState: text(value.trackerState, 32),
    trackerPid: Number.isSafeInteger(value.trackerPid) && value.trackerPid > 0 ? value.trackerPid : null,
    lastSequence: Number.isSafeInteger(value.lastSequence) && value.lastSequence >= 0 ? value.lastSequence : null,
    lastCommandId: text(value.lastCommandId, 96),
    commandFresh: value.commandFresh === true,
    commandRejected: text(value.commandRejected, 160),
    fault: text(value.fault || value.trackerFault, 300)
  };
}

function commandEnvelope(value, now = Date.now()) {
  const state = directState(value || DEFAULT_DIRECT);
  const sequence = state.generation;
  const selectedIcao = state.command === "TRACKING" ? state.aircraftId : null;
  const sourceTime = Date.parse(state.updatedAt || "");
  const issuedAtMs = Number.isFinite(sourceTime) ? Math.min(sourceTime, now + MAX_CLOCK_SKEW_MS) : now;
  return {
    protocolVersion: PROTOCOL_VERSION,
    releaseId: RELEASE_ID,
    sequence,
    commandId: `direct-${sequence}`,
    selectedIcao,
    callsign: selectedIcao ? state.callsign : null,
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(now + COMMAND_TTL_MS).toISOString()
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" });
  if (!authorised(req)) return res.status(401).json({ ok: false, error: "Unauthorised" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ ok: false, error: "Invalid JSON" }); }
  if (body?.protocolVersion !== PROTOCOL_VERSION || body?.releaseId !== RELEASE_ID) {
    return res.status(409).json({ ok: false, error: "Version mismatch", protocolVersion: PROTOCOL_VERSION, releaseId: RELEASE_ID });
  }
  try {
    const redis = createRedisClient();
    const receivedAt = Date.now();
    const health = cleanHealth(body.health || body);
    const [direct] = await redis.pipeline([
      ["GET", directKeys.DIRECT_KEY],
      ["SET", HEALTH_KEY, JSON.stringify({ ...health, receivedAt }), "EX", "45"]
    ]);
    return res.status(200).json({ ok: true, ...commandEnvelope(direct || DEFAULT_DIRECT, receivedAt), receivedAt: new Date(receivedAt).toISOString() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports.authorised = authorised;
module.exports.cleanHealth = cleanHealth;
module.exports.commandEnvelope = commandEnvelope;
module.exports.constants = { PROTOCOL_VERSION, RELEASE_ID, HEALTH_KEY, COMMAND_TTL_MS, MAX_CLOCK_SKEW_MS };
