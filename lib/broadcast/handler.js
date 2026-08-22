const engineHandler = require("../../api/engine.js");
const enrichHandler = require("../../api/enrich.js");
const routeHandler = require("../../api/route.js");
const { normalizeAirportCode } = require("../config/airports.js");
const { invokeHandler } = require("../services/invoke-handler.js");
const { buildTarget } = require("./target-builder.js");

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

    return res.status(200).json({
      ok:true,
      service:"MikeAircraft Broadcast",
      version:"0.6",
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
      version:"0.6",
      error:error.message
    });
  }
};
