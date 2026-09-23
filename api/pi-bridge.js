const crypto = require("crypto");
const { createRedisClient } = require("../lib/services/redis");
const { DEFAULT_DESIRED, desiredState } = require("../lib/tracker-bridge-state");
const { keys } = require("./tracker-control");

function tokenMatches(given, expected) {
  if (typeof given !== "string" || !expected || given.length > 512) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorised(req) {
  const header = String(req.headers?.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return tokenMatches(token, process.env.MIKEAIRCRAFT_PI_BRIDGE_TOKEN || "");
}

function cleanText(value, length) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, length) : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" });
  if (!authorised(req)) return res.status(401).json({ ok: false, error: "Unauthorised" });
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
      fault: cleanText(body.fault, 300)
    });
    const [desired] = await redis.pipeline([
      ["GET", keys.DESIRED_KEY],
      ["SET", keys.HEARTBEAT_KEY, heartbeat, "EX", "45"]
    ]);
    return res.status(200).json({ ok: true, ...desiredState(desired || DEFAULT_DESIRED), receivedAt: new Date(receivedAt).toISOString() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports.authorised = authorised;
