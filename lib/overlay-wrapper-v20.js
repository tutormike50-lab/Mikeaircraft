const baseHandler = require("./overlay-wrapper-v19.js");

// MikeAircraft Overlay v2.0
// Hard vocabulary rule: AIRBORNE is departure-only and only represents post-liftoff movement.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v1.9", "Overlay v2.0");

    // Normalize viewer-facing state vocabulary so arrivals can never display AIRBORNE.
    html = html.replace(
      'const rawState=String(t.movement?.state||"").toUpperCase();const critical=["LANDED","TAXIING_IN","TAXIING_OUT","LINING_UP","TAKEOFF_ROLL","AIRBORNE_DEPARTURE"];const viewerState=critical.includes(rawState)?rawState:(t.movement?.displayState||t.movement?.state||"---");',
      'const rawState=String(t.movement?.state||"").toUpperCase();const lineage=String(t.movement?.lineage||"").toUpperCase();const critical=["LANDED","TAXIING_IN","TAXIING_OUT","LINING_UP","TAKEOFF_ROLL","AIRBORNE_DEPARTURE"];let viewerState=critical.includes(rawState)?rawState:(t.movement?.displayState||t.movement?.state||"---");const vu=String(viewerState||"").toUpperCase();if(lineage!=="DEPARTURE"&&(vu==="AIRBORNE"||vu==="AIRBORNE_DEPARTURE"))viewerState=rawState==="LANDED"?"LANDED":rawState==="ON_FINAL"?"ON FINAL":rawState==="APPROACHING"?"APPROACHING":"APPROACHING";if(lineage==="DEPARTURE"&&rawState==="AIRBORNE_DEPARTURE")viewerState="AIRBORNE";'
    );

    // Apply the same rule to the live ticker state text.
    html = html.replace(
      'const state=(criticalStates.includes(rawState)?rawState:String(current.movement?.displayState||current.movement?.state||"Aircraft in view")).replaceAll("_"," ").toUpperCase();',
      'let state=(criticalStates.includes(rawState)?rawState:String(current.movement?.displayState||current.movement?.state||"Aircraft in view")).replaceAll("_"," ").toUpperCase();const lineageForState=String(current.movement?.lineage||"").toUpperCase();if(lineageForState!=="DEPARTURE"&&(state==="AIRBORNE"||state==="AIRBORNE DEPARTURE"))state=rawState==="LANDED"?"LANDED":rawState==="ON_FINAL"?"ON FINAL":rawState==="APPROACHING"?"APPROACHING":"APPROACHING";if(lineageForState==="DEPARTURE"&&rawState==="AIRBORNE_DEPARTURE")state="AIRBORNE";'
    );

    return originalSend(html);
  };

  return baseHandler(req, res);
};
