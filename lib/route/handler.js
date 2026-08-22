const { lookupAdsbdbRoute } = require("./providers/adsbdb.js");
const { lookupAirlabsRoute } = require("./providers/airlabs.js");
const { normalizeRoute } = require("./normalize.js");
const { evaluateRouteCoherence } = require("./coherence.js");

module.exports = async function routeHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const callsign = String(req.query?.callsign || "").trim().toUpperCase();
  const airport = String(req.query?.airport || "").trim().toUpperCase();
  const lineage = String(req.query?.lineage || "").trim().toUpperCase();

  if (!callsign) {
    return res.status(400).json({
      ok:false,
      service:"MikeAircraft Route Lookup",
      version:"0.6",
      error:"Missing callsign"
    });
  }

  const primary = await lookupAdsbdbRoute(callsign);
  let selectedRoute = primary.status === 200 ? primary.route : null;
  let provider = selectedRoute ? "adsbdb" : null;
  let primaryGuard = null;

  if (airport && lineage && selectedRoute) {
    const normalized = normalizeRoute(selectedRoute);
    primaryGuard = evaluateRouteCoherence({ route:normalized, movement:{ lineage }, airportCode:airport });
    if (!primaryGuard.accepted) selectedRoute = null;
  }

  let fallbackInfo = null;
  if (airport && lineage && !selectedRoute && process.env.AIRLABS_API_KEY) {
    const fallback = await lookupAirlabsRoute(callsign, airport, lineage);
    fallbackInfo = {
      source:fallback.source || "airlabs",
      cached:Boolean(fallback.cached),
      error:fallback.error || null
    };
    if (fallback.route) {
      selectedRoute = fallback.route;
      provider = fallback.source || "airlabs";
    }
  }

  if (!selectedRoute && primary.status !== 200 && !airport) {
    return res.status(primary.status).json({
      ok:false,
      service:"MikeAircraft Route Lookup",
      version:"0.6",
      callsign,
      upstreamStatus:primary.status,
      upstreamResponse:primary.upstreamResponse,
      error:primary.error || undefined
    });
  }

  return res.status(200).json({
    ok:true,
    service:"MikeAircraft Route Lookup",
    version:"0.6",
    callsign,
    routeFound:Boolean(selectedRoute),
    route:selectedRoute,
    provider,
    primaryGuard,
    fallback:fallbackInfo,
    airlabsConfigured:Boolean(process.env.AIRLABS_API_KEY)
  });
};
