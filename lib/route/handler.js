const { lookupAdsbdbRoute } = require("./providers/adsbdb.js");

module.exports = async function routeHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const callsign = String(req.query?.callsign || "").trim().toUpperCase();
  if (!callsign) {
    return res.status(400).json({
      ok:false,
      service:"MikeAircraft Route Lookup",
      version:"0.5",
      error:"Missing callsign"
    });
  }

  const result = await lookupAdsbdbRoute(callsign);
  if (result.status !== 200) {
    return res.status(result.status).json({
      ok:false,
      service:"MikeAircraft Route Lookup",
      version:"0.5",
      callsign,
      upstreamStatus:result.status,
      upstreamResponse:result.upstreamResponse,
      error:result.error || undefined
    });
  }

  return res.status(200).json({
    ok:true,
    service:"MikeAircraft Route Lookup",
    version:"0.5",
    callsign,
    routeFound:Boolean(result.route),
    route:result.route
  });
};
