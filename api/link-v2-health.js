const { authorised } = require("../lib/control-auth");
const { createRedisClient } = require("../lib/services/redis");
const { constants } = require("./link-v2-commands");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET required" });
  if (!authorised(req)) return res.status(401).json({ ok: false, error: "Unauthorised" });
  try {
    const saved = await createRedisClient().command(["GET", constants.HEALTH_KEY]);
    const health = saved ? JSON.parse(saved) : null;
    const ageMs = health?.receivedAt ? Math.max(0, Date.now() - health.receivedAt) : null;
    const versionMatch = health?.protocolVersion === constants.PROTOCOL_VERSION && health?.releaseId === constants.RELEASE_ID;
    return res.status(200).json({
      ok: true,
      online: ageMs !== null && ageMs <= 45000 && versionMatch,
      versionMatch,
      expected: { protocolVersion: constants.PROTOCOL_VERSION, releaseId: constants.RELEASE_ID },
      ageMs,
      health
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};
