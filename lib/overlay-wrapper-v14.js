const baseHandler = require("./overlay-wrapper-v13.js");

// MikeAircraft Overlay v1.4 map-lifecycle patch.
// Keep a coherent CURRENT aircraft route map visible for the full CURRENT
// lifecycle, loop the route animation, and tolerate transient identity/route
// dropouts without flashing the map off.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);

    let html = body.replaceAll("Overlay v1.3", "Overlay v1.4");

    // Remove the base map's self-destruct timer. CURRENT/closing logic is the
    // authority for when the card disappears.
    html = html.replace(
      `clearTimeout(routeTimer);routeTimer=setTimeout(()=>{card.classList.remove("visible");routeAnimationActive=false},ROUTE_ANIMATION_MS)`,
      `clearTimeout(routeTimer);routeTimer=null`
    );

    // Continuously loop the route trace while the map remains active.
    html = html.replace(
      `let progress=routeAnimationActive?Math.min(1,(performance.now()-routeAnimationStart)/ROUTE_ANIMATION_MS):1;`,
      `let progress=routeAnimationActive?((performance.now()-routeAnimationStart)%ROUTE_ANIMATION_MS)/ROUTE_ANIMATION_MS:1;`
    );

    // Track both identity aliases. Broadcast feeds can occasionally alternate
    // between registration and callsign availability on adjacent refreshes.
    html = html.replace(
      `lastCoherentMapAircraftKey=null,lastCoherentMapRoute=null,radarTopLabel=null;`,
      `lastCoherentMapAircraftKey=null,lastCoherentMapRoute=null,lastCoherentMapRegistration=null,lastCoherentMapCallsign=null,lastCoherentMapSeenAt=0,radarTopLabel=null;`
    );

    const oldStableMap = `function showStableRouteMap(current){
 const currentKey=identityKey(current)||"";
 if(current?.route?.found){
  lastCoherentMapAircraftKey=currentKey;
  lastCoherentMapRoute=current.route;
  showRouteMap(current);
  return;
 }
 if(currentKey&&currentKey===lastCoherentMapAircraftKey&&lastCoherentMapRoute?.found){
  showRouteMap({...current,route:lastCoherentMapRoute});
  return;
 }
 lastCoherentMapAircraftKey=currentKey||null;
 lastCoherentMapRoute=null;
 document.getElementById("routeMapCard").classList.remove("visible");
 routeAnimationActive=false;
}`;

    const newStableMap = `function showStableRouteMap(current){
 const currentKey=identityKey(current)||"";
 const reg=String(current?.identity?.registration||"").trim().toUpperCase();
 const call=String(current?.identity?.callsign||"").trim().toUpperCase();
 if(current?.route?.found){
  lastCoherentMapAircraftKey=currentKey;
  lastCoherentMapRegistration=reg||lastCoherentMapRegistration;
  lastCoherentMapCallsign=call||lastCoherentMapCallsign;
  lastCoherentMapRoute=current.route;
  lastCoherentMapSeenAt=Date.now();
  showRouteMap(current);
  return;
 }
 const regMatches=Boolean(reg&&lastCoherentMapRegistration&&reg===lastCoherentMapRegistration);
 const callMatches=Boolean(call&&lastCoherentMapCallsign&&call===lastCoherentMapCallsign);
 const keyMatches=Boolean(currentKey&&lastCoherentMapAircraftKey&&currentKey===lastCoherentMapAircraftKey);
 const identityMissing=!reg&&!call;
 const transientIdentity=identityMissing&&(Date.now()-lastCoherentMapSeenAt)<30000;
 if(lastCoherentMapRoute?.found&&(regMatches||callMatches||keyMatches||transientIdentity)){
  lastCoherentMapSeenAt=Date.now();
  showRouteMap({...current,route:lastCoherentMapRoute});
  return;
 }
 // A clearly different identified CURRENT means the old map is stale.
 if((reg||call)&&lastCoherentMapRoute?.found){
  lastCoherentMapAircraftKey=currentKey||null;
  lastCoherentMapRegistration=reg||null;
  lastCoherentMapCallsign=call||null;
  lastCoherentMapRoute=null;
 }
 // Do not flash an already-visible map off merely because one refresh has no
 // route. The normal CURRENT closing path remains responsible for hiding it.
 const card=document.getElementById("routeMapCard");
 if(!card.classList.contains("visible"))routeAnimationActive=false;
}`;

    if (html.includes(oldStableMap)) html = html.replace(oldStableMap, newStableMap);

    // Clear alias memory only when CURRENT is genuinely closed/changed by the
    // viewer lifecycle, not on a transient enrichment miss.
    html = html.replace(
      `lastCoherentMapAircraftKey=null;\n   lastCoherentMapRoute=null;\n   hideInfoPanel();`,
      `lastCoherentMapAircraftKey=null;\n   lastCoherentMapRegistration=null;\n   lastCoherentMapCallsign=null;\n   lastCoherentMapSeenAt=0;\n   lastCoherentMapRoute=null;\n   hideInfoPanel();`
    );

    return originalSend(html);
  };

  return baseHandler(req, res);
};
