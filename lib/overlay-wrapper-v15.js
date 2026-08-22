const baseHandler = require("./overlay-wrapper-v14.js");

// MikeAircraft Overlay v1.5 PRG/route-fallback patch.
// If a CURRENT aircraft route is rejected as incoherent with the watched airport,
// keep the map useful by drawing the verified live aircraft-to-airport movement
// from the engine feed. Never display the rejected route.
//
// Important stability rule: once v1.4 has retained a coherent route for the same
// CURRENT aircraft, LIVE MOVEMENT must never replace it just because one later
// refresh temporarily loses/rejects the route. The fallback is used only when
// there is no retained coherent route at all.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);

    let html = body.replaceAll("Overlay v1.4", "Overlay v1.5");

    const radarLine = `if(engine?.ok){radarAircraft=Array.isArray(engine.aircraft)?engine.aircraft:[];radarAirport={lat:Number(engine.airport?.lat),lon:Number(engine.airport?.lon)};if(!Number.isFinite(radarAirport.lat)||!Number.isFinite(radarAirport.lon))radarAirport=null}`;
    const fallbackLine = `if(engine?.ok){radarAircraft=Array.isArray(engine.aircraft)?engine.aircraft:[];radarAirport={lat:Number(engine.airport?.lat),lon:Number(engine.airport?.lon)};if(!Number.isFinite(radarAirport.lat)||!Number.isFinite(radarAirport.lon))radarAirport=null;if(current?.available&&!closing&&!current.route?.found&&!lastCoherentMapRoute?.found){showLocalMovementMap(current,engine,airport)}}`;

    if (html.includes(radarLine)) html = html.replace(radarLine, fallbackLine);

    return originalSend(html);
  };

  return baseHandler(req, res);
};
