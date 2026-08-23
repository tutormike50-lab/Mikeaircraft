const baseHandler = require("./overlay-wrapper-v18.js");

// MikeAircraft Overlay v1.9
// Correlation fix: authoritative movement state, ticker and viewer distance must agree.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v1.8", "Overlay v1.9");

    // Main lower-third: raw state wins over stale displayState at critical runway transitions.
    const oldMain = `function showMain(t){const box=document.getElementById("lowerThird");if(!t||!t.available){box.classList.remove("visible");radarCurrentKey=null;return}setText("airline",t.operator?.name||"Operator not identified");setText("flight",t.identity?.flight||t.identity?.callsign||"---");setText("route",friendlyRoute(t.route));setText("aircraft",t.aircraft?.name||t.aircraft?.typeCode||"---");setText("registration",t.identity?.registration?"• "+t.identity.registration:"");setText("status",t.movement?.displayState||t.movement?.state||"---");setText("runwayText",t.movement?.runway?"RUNWAY "+t.movement.runway:"");setText("distance",t.telemetry?.airportDistanceKm!=null?t.telemetry.airportDistanceKm+" km":"---");setText("altitude",t.telemetry?.altitudeFt!=null?t.telemetry.altitudeFt+" ft":"---");setText("speed",t.telemetry?.speedKt!=null?t.telemetry.speedKt+" kt":"---");setText("runway",t.movement?.runway||"---");box.classList.add("visible");const key=identityKey(t);radarCurrentKey=key;if(key&&key!==lastCurrentKey){lastCurrentKey=key;if(t.route?.found)showRouteMap(t)}}`;
    const newMain = `function showMain(t){const box=document.getElementById("lowerThird");if(!t||!t.available){box.classList.remove("visible");radarCurrentKey=null;return}const rawState=String(t.movement?.state||"").toUpperCase();const critical=["LANDED","TAXIING_IN","TAXIING_OUT","LINING_UP","TAKEOFF_ROLL","AIRBORNE_DEPARTURE"];const viewerState=critical.includes(rawState)?rawState:(t.movement?.displayState||t.movement?.state||"---");const zeroStates=["LANDED","TAXIING_IN","TAXIING_OUT","LINING_UP","TAKEOFF_ROLL"];let viewerDistance=t.telemetry?.airportDistanceKm;if(zeroStates.includes(rawState))viewerDistance=0;setText("airline",t.operator?.name||"Operator not identified");setText("flight",t.identity?.flight||t.identity?.callsign||"---");setText("route",friendlyRoute(t.route));setText("aircraft",t.aircraft?.name||t.aircraft?.typeCode||"---");setText("registration",t.identity?.registration?"• "+t.identity.registration:"");setText("status",viewerState.replaceAll("_"," "));setText("runwayText",t.movement?.runway?"RUNWAY "+t.movement.runway:"");setText("distance",viewerDistance!=null?Number(viewerDistance).toFixed(viewerDistance===0?0:2)+" km":"---");setText("altitude",t.telemetry?.altitudeFt!=null?t.telemetry.altitudeFt+" ft":"---");setText("speed",t.telemetry?.speedKt!=null?t.telemetry.speedKt+" kt":"---");setText("runway",t.movement?.runway||"---");box.classList.add("visible");const key=identityKey(t);radarCurrentKey=key;if(key&&key!==lastCurrentKey){lastCurrentKey=key;if(t.route?.found)showRouteMap(t)}}`;
    if (html.includes(oldMain)) html = html.replace(oldMain, newMain);

    // Live ticker: never let a stale displayState override an authoritative runway state.
    html = html.replace(
      'const state=String(current.movement?.displayState||current.movement?.state||"Aircraft in view").toUpperCase();\n const rawState=String(current.movement?.state||"").toUpperCase();',
      'const rawState=String(current.movement?.state||"").toUpperCase();\n const criticalStates=["LANDED","TAXIING_IN","TAXIING_OUT","LINING_UP","TAKEOFF_ROLL","AIRBORNE_DEPARTURE"];\n const state=(criticalStates.includes(rawState)?rawState:String(current.movement?.displayState||current.movement?.state||"Aircraft in view")).replaceAll("_"," ").toUpperCase();'
    );

    return originalSend(html);
  };

  return baseHandler(req, res);
};
