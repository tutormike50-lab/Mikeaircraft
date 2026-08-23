const baseHandler = require("./overlay-wrapper-v23.js");

// MikeAircraft Overlay v2.4
// Departure handoff rule: once a departure is 3 km or more from the airport,
// clear it from the lower third/ticker so CURRENT can move on.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.3", "Overlay v2.4");

    html = html.replace("</body>", `<script>
const __maShowMainV23=showMain;
showMain=function(t){
 if(t?.available){
  const lineage=String(t.movement?.lineage||"").toUpperCase();
  const raw=String(t.movement?.state||"").toUpperCase();
  const d=Number(t.telemetry?.airportDistanceKm);
  const postTakeoff=["AIRBORNE_DEPARTURE","DEPARTING"].includes(raw);
  if(lineage==="DEPARTURE"&&postTakeoff&&Number.isFinite(d)&&d>=3){
   document.getElementById("lowerThird")?.classList.remove("visible");
   stopLiveDistanceTicker();
   hideStoryTicker();
   radarCurrentKey=null;
   return;
  }
 }
 __maShowMainV23(t);
};

const __maShowSafeV23=showSafeLiveContext;
showSafeLiveContext=function(current,airportInfo){
 if(current?.available){
  const lineage=String(current.movement?.lineage||"").toUpperCase();
  const raw=String(current.movement?.state||"").toUpperCase();
  const d=Number(current.telemetry?.airportDistanceKm);
  const postTakeoff=["AIRBORNE_DEPARTURE","DEPARTING"].includes(raw);
  if(lineage==="DEPARTURE"&&postTakeoff&&Number.isFinite(d)&&d>=3){
   stopLiveDistanceTicker();
   hideStoryTicker();
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
