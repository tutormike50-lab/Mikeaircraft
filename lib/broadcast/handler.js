const engineHandler = require("../../api/engine.js");
const enrichHandler = require("../../api/enrich.js");
const routeHandler = require("../../api/route.js");
const { normalizeAirportCode } = require("../config/airports.js");
const { invokeHandler } = require("../services/invoke-handler.js");
const { createRedisClient } = require("../services/redis.js");
const { buildTarget } = require("./target-builder.js");

const lastAuditMinute = new Map();
const AUDIT_SCRIPT = [
  "redis.call('LPUSH', KEYS[1], ARGV[1])",
  "redis.call('LTRIM', KEYS[1], 0, 1439)",
  "redis.call('EXPIRE', KEYS[1], 86400)",
  "return 1"
].join("; ");

function displayedIdentity(target) {
  if (!target?.available) return null;
  return {
    backendCallsign: target.identity?.callsign || null,
    viewerFlight: target.identity?.flight || null,
    registration: target.identity?.registration || null,
    type: target.aircraft?.typeCode || null,
    operator: target.operator?.name || null,
    route: target.route?.display || null
  };
}

async function recordSyncAudit(airport, engine, current, nextIn, nextOut) {
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  if (lastAuditMinute.get(airport) === minute) return;
  lastAuditMinute.set(airport, minute);

  try {
    const redis = createRedisClient();
    if (!redis.available) return;

    const intelligence = engine.intelligence || {};
    const entry = {
      time: now,
      iso: new Date(now).toISOString(),
      airport,
      source: engine.traffic?.source || null,
      trackedCount: engine.traffic?.trackedCount ?? null,
      current: intelligence.current || null,
      nextIn: intelligence.nextIn || null,
      nextOut: intelligence.nextOut || null,
      selectionConfidence: intelligence.selectionConfidence || null,
      candidates: [],
      displayed: displayedIdentity(current),
      broadcast: {
        currentAvailable: Boolean(current?.available),
        nextInAvailable: Boolean(nextIn?.available),
        nextOutAvailable: Boolean(nextOut?.available)
      }
    };

    await redis.command([
      "EVAL",
      AUDIT_SCRIPT,
      "1",
      `mikeaircraft:audit:${airport}`,
      JSON.stringify(entry)
    ]);
  }
  catch (error) {
    // Auditing must never interrupt the live broadcast.
    console.warn("MikeAircraft sync audit warning:", error.message);
  }
}

module.exports = async function broadcastHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const airport = normalizeAirportCode(req.query?.airport || "PRG");
    const engineResult = await invokeHandler(engineHandler, { airport }, req.headers || {});
    const engine = engineResult.data;

    if (!engine || engineResult.status >= 400 || !engine.ok) {
      const detail = engine?.error
        ? (typeof engine.error === "string" ? engine.error : JSON.stringify(engine.error))
        : "Engine request failed";
      throw new Error(detail);
    }

    const intelligence = engine.intelligence || {};
    const deps = { enrichHandler, routeHandler, headers:req.headers || {}, airport };
    const [current, nextIn, nextOut] = await Promise.all([
      buildTarget(intelligence.current, "CURRENT", deps),
      buildTarget(intelligence.nextIn, "NEXT_IN", deps),
      buildTarget(intelligence.nextOut, "NEXT_OUT", deps)
    ]);

    let mode = "IDLE", primaryRole = null, showRouteMap = false;
    if (current.available) {
      mode = "PRIMARY"; primaryRole = "CURRENT"; showRouteMap = Boolean(current.route?.found);
    } else if (nextIn.available) {
      mode = "PREVIEW"; primaryRole = "NEXT_IN"; showRouteMap = Boolean(nextIn.route?.found);
    } else if (nextOut.available) {
      mode = "PREVIEW"; primaryRole = "NEXT_OUT"; showRouteMap = Boolean(nextOut.route?.found);
    }

    await recordSyncAudit(airport, engine, current, nextIn, nextOut);

    return res.status(200).json({
      ok:true,
      service:"MikeAircraft Broadcast",
      version:"0.7",
      generatedAt:new Date().toISOString(),
      airport:{
        code:engine.airport?.code || airport,
        icao:engine.airport?.icao || null,
        name:engine.airport?.name || null
      },
      system:{
        engineVersion:engine.version || null,
        engineStage:engine.stage || null,
        dataStatus:engine.dataStatus || null,
        adsbSource:engine.traffic?.source || null,
        redisConnected:engine.memory?.redisConnected ?? null,
        airlabsConfigured:Boolean(process.env.AIRLABS_API_KEY)
      },
      director:{ mode, primaryRole, showRouteMap },
      aircraft:{ current, nextIn, nextOut }
    });
  } catch (error) {
    console.error("MikeAircraft Broadcast error:", error);
    return res.status(500).json({
      ok:false,
      service:"MikeAircraft Broadcast",
      version:"0.7",
      error:error.message
    });
  }
};
