const { authorised } = require("../lib/control-auth");
const { createRedisClient } = require("../lib/services/redis");
const { validateManifest, manifestHash } = require("../lib/release-manifest");

const RELEASE_KEY = "mikeaircraft:release:approved:v1";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authorised(req)) return res.status(401).json({ ok: false, error: "Unauthorised" });
  if (!new Set(["GET", "POST", "DELETE"]).has(req.method)) return res.status(405).json({ ok: false, error: "GET, POST or DELETE required" });
  const redis = createRedisClient();
  try {
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      const manifest = validateManifest(body);
      const approved = { manifest, manifestHash: manifestHash(manifest), approvedAt: new Date().toISOString() };
      await redis.command(["SET", RELEASE_KEY, JSON.stringify(approved)]);
    } else if (req.method === "DELETE") {
      await redis.command(["DEL", RELEASE_KEY]);
    }
    const stored = await redis.command(["GET", RELEASE_KEY]);
    const value = stored && typeof stored === "object" && "result" in stored ? stored.result : stored;
    return res.status(200).json({ ok: true, approved: value ? JSON.parse(value) : null });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }
};

module.exports.RELEASE_KEY = RELEASE_KEY;
