const baseHandler = require("./overlay-wrapper-v23.js");

// MikeAircraft Overlay v2.4
// Departure viewer sequence: TAKEOFF ROLL -> AIRBORNE -> DEPARTED.
// At 3 km the aircraft is considered DEPARTED and is removed from the overlay.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.3", "Overlay v2.4");

    html = html.replace("</body>", `<script>
function maDepartureGone(t){
 if(!t?.available)return false;
 const lineage=String(t.movement?.lineage||"").toUpperCase();
 const raw=String(t.movement?.state||"").toUpperCase();
 const d=Number(t.telemetry?.airportDistanceKm);
 return lineage==="DEPARTURE"&&["AIRBORNE_DEPARTURE","DEPARTING"].includes(raw)&&Number.isFinite(d)&&d>=3;
}

const __maShowMainV23=showMain;
showMain=function(t){
 if(maDepartureGone(t)){
  setText("status","DEPARTED");
  document.getElementById("lowerThird")?.classList.remove("visible");
  stopLiveDistanceTicker();
  hideStoryTicker();
  radarCurrentKey=null;
  return;
 }
 __maShowMainV23(t);
 if(t?.available){
  const lineage=String(t.movement?.lineage||"").toUpperCase();
  const raw=String(t.movement?.state||"").toUpperCase();
  const d=Number(t.telemetry?.airportDistanceKm);
  if(lineage==="DEPARTURE"&&["AIRBORNE_DEPARTURE","DEPARTING"].includes(raw)&&Number.isFinite(d)){
   setText("status",d<3?"AIRBORNE":"DEPARTED");
  }
 }
};

const __maShowSafeV23=showSafeLiveContext;
showSafeLiveContext=function(current,airportInfo){
 if(maDepartureGone(current)){
  stopLiveDistanceTicker();
  hideStoryTicker();
  return;
 }
 if(current?.available){
  const lineage=String(current.movement?.lineage||"").toUpperCase();
  const raw=String(current.movement?.state||"").toUpperCase();
  const d=Number(current.telemetry?.airportDistanceKm);
  if(lineage==="DEPARTURE"&&["AIRBORNE_DEPARTURE","DEPARTING"].includes(raw)&&Number.isFinite(d)&&d<3){
   const oldDisplay=current.movement?.displayState;
   current={...current,movement:{...current.movement,displayState:"AIRBORNE"}};
   __maShowSafeV23(current,airportInfo);
   if(current.movement)current.movement.displayState=oldDisplay;
   return;
  }
 }
 __maShowSafeV23(current,airportInfo);
};
</script></body>`);

    return originalSend(html);
  };

  return baseHandler(req, res);
};
