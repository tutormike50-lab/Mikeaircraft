const { createRedisClient } = require("../lib/services/redis");
const { authorised } = require("./pi-bridge");
const { RELEASE_KEY } = require("./release-control");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET required" });
  if (!authorised(req)) return res.status(401).json({ ok: false, error: "Unauthorised" });
  try {
    const stored = await createRedisClient().command(["GET", RELEASE_KEY]);
    const value = stored && typeof stored === "object" && "result" in stored ? stored.result : stored;
    return res.status(200).json({
      ok: true,
      approvedRelease: value ? JSON.parse(value) : null,
      serverVersion: process.env.VERCEL_GIT_COMMIT_SHA || null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};
