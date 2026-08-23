const baseHandler = require("./overlay-wrapper-v20.js");

// MikeAircraft Overlay v2.1
// Arrival ticker simplification:
// - only APPROACHING and FINAL APPROACH are used for arrivals
// - ON FINAL is never shown in the ticker
// - after touchdown/ground states, the live arrival ticker is suppressed
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.0", "Overlay v2.1");

    // Replace arrival ticker state mapping with a two-stage vocabulary.
    html = html.replace(
      'let state=(criticalStates.includes(rawState)?rawState:String(current.movement?.displayState||current.movement?.state||"Aircraft in view")).replaceAll("_"," ").toUpperCase();const lineageForState=String(current.movement?.lineage||"").toUpperCase();if(lineageForState!=="DEPARTURE"&&(state==="AIRBORNE"||state==="AIRBORNE DEPARTURE"))state=rawState==="LANDED"?"LANDED":rawState==="ON_FINAL"?"ON FINAL":rawState==="APPROACHING"?"APPROACHING":"APPROACHING";if(lineageForState==="DEPARTURE"&&rawState==="AIRBORNE_DEPARTURE")state="AIRBORNE";',
      'let state=(criticalStates.includes(rawState)?rawState:String(current.movement?.displayState||current.movement?.state||"Aircraft in view")).replaceAll("_"," ").toUpperCase();const lineageForState=String(current.movement?.lineage||"").toUpperCase();if(lineageForState==="ARRIVAL"){if(["LANDED","TAXIING_IN"].includes(rawState)){stopLiveDistanceTicker();hideStoryTicker();return}state=(rawState==="ON_FINAL"||String(current.movement?.displayState||"").toUpperCase().includes("FINAL"))?"FINAL APPROACH":"APPROACHING"}else if(lineageForState!=="DEPARTURE"&&(state==="AIRBORNE"||state==="AIRBORNE DEPARTURE"))state="APPROACHING";if(lineageForState==="DEPARTURE"&&rawState==="AIRBORNE_DEPARTURE")state="AIRBORNE";'
    );

    return originalSend(html);
  };

  return baseHandler(req, res);
};
