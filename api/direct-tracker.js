const { authorised } = require("../lib/control-auth");
const { createRedisClient } = require("../lib/services/redis");
const { directState, DEFAULT_DIRECT } = require("../lib/direct-tracker-state");
const { publicState } = require("../lib/tracker-bridge-state");
const { keys: trackerKeys } = require("./tracker-control");

const DIRECT_KEY = "mikeaircraft:direct-tracker:desired:v1";
const GENERATION_KEY = "mikeaircraft:direct-tracker:generation:v1";

function cleanAircraftId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{6}$/.test(id) ? id : null;
}

async function readState(redis, now = Date.now()) {
  const [direct, heartbeat] = await redis.pipeline([["GET", DIRECT_KEY], ["GET", trackerKeys.HEARTBEAT_KEY]]);
  return { ok: true, ...directState(direct || DEFAULT_DIRECT), bridge: publicState(null, heartbeat, now) };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authorised(req)) return res.status(401).json({ ok: false, error: "Unauthorised" });
  if (!new Set(["GET", "POST"]).has(req.method)) return res.status(405).json({ ok: false, error: "GET or POST required" });
  const redis = createRedisClient();
  try {
    if (req.method === "POST") {
      let body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const command = String(body?.command || "").toUpperCase();
      if (!new Set(["TRACKING", "STOPPED", "HOME"]).has(command)) return res.status(400).json({ ok: false, error: "Invalid command" });
      const aircraftId = command === "TRACKING" ? cleanAircraftId(body.aircraftId) : null;
      if (command === "TRACKING" && !aircraftId) return res.status(400).json({ ok: false, error: "TRACKING requires a six-character ICAO hex" });
      const callsign = command === "TRACKING" ? String(body.callsign || aircraftId).trim().slice(0, 24) : null;
      const updatedAt = new Date().toISOString();
      await redis.command(["EVAL", "local g=redis.call('INCR',KEYS[2]); redis.call('SET',KEYS[1],cjson.encode({command=ARGV[1],aircraftId=ARGV[2]~='' and ARGV[2] or cjson.null,callsign=ARGV[3]~='' and ARGV[3] or cjson.null,generation=g,updatedAt=ARGV[4]})); return g", "2", DIRECT_KEY, GENERATION_KEY, command, aircraftId || "", callsign || "", updatedAt]);
    }
    return res.status(200).json(await readState(redis));
  } catch (error) { return res.status(500).json({ ok: false, error: error.message }); }
};

module.exports.readState = readState;
module.exports.cleanAircraftId = cleanAircraftId;
module.exports.keys = { DIRECT_KEY, GENERATION_KEY };
