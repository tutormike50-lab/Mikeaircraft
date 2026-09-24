const crypto = require("crypto");
const { createRedisClient } = require("../lib/services/redis");
const { DEFAULT_DESIRED, desiredState } = require("../lib/tracker-bridge-state");
const { keys } = require("./tracker-control");
const { keys: directKeys } = require("./direct-tracker");
const { directState, DEFAULT_DIRECT } = require("../lib/direct-tracker-state");
const { RELEASE_KEY } = require("./release-control");

function tokenMatches(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  const normalGiven = given.trim(), normalExpected = expected.trim();
  if (!normalGiven || !normalExpected || normalGiven.length > 512) return false;
  const a = Buffer.from(normalGiven), b = Buffer.from(normalExpected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function tokenFingerprint(token) {
  return crypto.createHash("sha256").update(String(token).trim()).digest("hex").slice(0, 12);
}

function authDiagnostic(req) {
  const header = String(req.headers?.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = String(process.env.MIKEAIRCRAFT_PI_BRIDGE_TOKEN || "").trim();
  const given = token.trim();
  if (!expected) return { ok: false, reason: "SERVER_TOKEN_MISSING" };
  if (!given) return { ok: false, reason: "PI_TOKEN_MISSING", serverFingerprint: tokenFingerprint(expected) };
  if (!tokenMatches(given, expected)) return { ok: false, reason: "TOKEN_MISMATCH", piFingerprint: tokenFingerprint(given), serverFingerprint: tokenFingerprint(expected) };
  return { ok: true, reason: "OK", piFingerprint: tokenFingerprint(given), serverFingerprint: tokenFingerprint(expected) };
}

function authorised(req) {
  return authDiagnostic(req).ok;
}

function logAuthDiagnostic(req, diagnostic) {
  console.warn("PI_BRIDGE_AUTH", JSON.stringify({
    reason: diagnostic.reason,
    method: req.method || null,
    path: req.url || "/api/pi-bridge",
    piFingerprint: diagnostic.piFingerprint || null,
    serverFingerprint: diagnostic.serverFingerprint || null
  }));
}

function cleanText(value, length) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, length) : null;
}

function effectiveControl(desired, direct) {
  if (direct.command === "TRACKING" && direct.aircraftId) {
    return {
      owner: "DIRECT_TRACKER",
      command: "TRACKING",
      generation: direct.generation,
      aircraftId: direct.aircraftId
    };
  }
  return {
    owner: "PRODUCTION",
    command: desired.desired,
    generation: desired.generation,
    aircraftId: null
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    logAuthDiagnostic(req, { reason: "WRONG_METHOD_ENDPOINT" });
    return res.status(405).json({ ok: false, error: "GET or POST required" });
  }
  const diagnostic = authDiagnostic(req);
  if (!diagnostic.ok) {
    logAuthDiagnostic(req, diagnostic);
    return res.status(401).json({ ok: false, error: "Unauthorised" });
  }
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      credential: "bridge-token",
      tokenFingerprint: tokenFingerprint(process.env.MIKEAIRCRAFT_PI_BRIDGE_TOKEN)
    });
  }
  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    const allowed = new Set(["STOPPED", "STARTING", "TRACKING", "FAULT"]);
    if (!body || !allowed.has(body.trackerState)) {
      return res.status(400).json({ ok: false, error: "Invalid trackerState" });
    }
    const redis = createRedisClient();
    const receivedAt = Date.now();
    const heartbeat = JSON.stringify({
      receivedAt,
      trackerState: body.trackerState,
      currentAircraft: cleanText(body.currentAircraft, 80),
      rs4State: cleanText(body.rs4State, 80),
      fault: cleanText(body.fault, 300),
      telemetry: body.telemetry && typeof body.telemetry === "object" ? body.telemetry : null
      ,release: body.release && typeof body.release === "object" ? body.release : null
      ,bridgeHealth: body.bridgeHealth === "HEALTHY" ? "HEALTHY" : "FAULT"
      ,trackerHealth: new Set(["HEALTHY", "IDLE", "FAULT"]).has(body.trackerHealth) ? body.trackerHealth : "FAULT"
    });
    const [desired, , direct, approvedRelease] = await redis.pipeline([
      ["GET", keys.DESIRED_KEY],
      ["SET", keys.HEARTBEAT_KEY, heartbeat, "EX", "45"],
      ["GET", directKeys.DIRECT_KEY],
      ["GET", RELEASE_KEY]
    ]);
    const normalState = desiredState(desired || DEFAULT_DESIRED);
    const directCommand = directState(direct || DEFAULT_DIRECT);
    return res.status(200).json({
      ok: true,
      ...normalState,
      direct: directCommand,
      control: effectiveControl(normalState, directCommand),
      approvedRelease: approvedRelease ? JSON.parse(approvedRelease) : null,
      serverVersion: process.env.VERCEL_GIT_COMMIT_SHA || null,
      receivedAt: new Date(receivedAt).toISOString()
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports.authorised = authorised;
module.exports.authDiagnostic = authDiagnostic;
module.exports.tokenFingerprint = tokenFingerprint;
module.exports.effectiveControl = effectiveControl;
