const { authorised } = require("../lib/control-auth");
const { createRedisClient } = require("../lib/services/redis");
const { DEFAULT_DESIRED, publicState } = require("../lib/tracker-bridge-state");

const DESIRED_KEY = "mikeaircraft:tracker:desired:v1";
const GENERATION_KEY = "mikeaircraft:tracker:generation:v1";
const HEARTBEAT_KEY = "mikeaircraft:tracker:heartbeat:v1";

async function readState(redis, now = Date.now()) {
  const [desired, heartbeat] = await redis.pipeline([
    ["GET", DESIRED_KEY],
    ["GET", HEARTBEAT_KEY]
  ]);
  return publicState(desired, heartbeat, now);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authorised(req)) return res.status(401).json({ ok: false, error: "Unauthorised" });
  if (!new Set(["GET", "POST"]).has(req.method)) return res.status(405).json({ ok: false, error: "GET or POST required" });

  const redis = createRedisClient();
  try {
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      if (!body || !new Set(["TRACKING", "STOPPED"]).has(body.desired)) {
        return res.status(400).json({ ok: false, error: "desired must be TRACKING or STOPPED" });
      }
      const updatedAt = new Date().toISOString();
      await redis.command([
        "EVAL",
        "local g=redis.call('INCR',KEYS[2]); redis.call('SET',KEYS[1],cjson.encode({desired=ARGV[1],generation=g,updatedAt=ARGV[2]})); redis.call('DEL',KEYS[3]); return g",
        "3", DESIRED_KEY, GENERATION_KEY, "mikeaircraft:direct-tracker:desired:v1", body.desired, updatedAt
      ]);
    }
    return res.status(200).json(await readState(redis));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};

module.exports.readState = readState;
module.exports.keys = { DESIRED_KEY, GENERATION_KEY, HEARTBEAT_KEY };
