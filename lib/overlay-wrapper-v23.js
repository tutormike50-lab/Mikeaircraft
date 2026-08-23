const baseHandler = require("./overlay-wrapper-v22.js");

// MikeAircraft Overlay v2.3
// Fixes viewer-distance semantics:
// - taxiing out / lining up: no distance shown
// - takeoff roll: 0 km
// - airborne departure: distance increases from takeoff
// - arrival stages keep APPROACHING / FINAL APPROACH / LANDED colour coding
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.2", "Overlay v2.3");

    html = html.replace("</style>", `
.story-ticker.arrival-approaching .story-ticker-label,.story-ticker.arrival-approaching .story-ticker-track{color:#ff9f2f!important}
.story-ticker.arrival-final .story-ticker-label,.story-ticker.arrival-final .story-ticker-track{color:#ffd84a!important}
.story-ticker.arrival-landed .story-ticker-label,.story-ticker.arrival-landed .story-ticker-track{color:#43f59a!important}
</style>`);

    html = html.replace("</body>", `<script>
// v2.3 viewer-distance correction layer.
const __maShowMainV22=showMain;
showMain=function(t){
 __maShowMainV22(t);
 if(!t?.available)return;
 const raw=String(t.movement?.state||"").toUpperCase();
 const lineage=String(t.movement?.lineage||"").toUpperCase();
 if(lineage==="DEPARTURE"){
  if(["TAXIING_OUT","LINING_UP"].includes(raw))setText("distance","---");
  else if(raw==="TAKEOFF_ROLL")setText("distance","0 km");
 }
 if(lineage==="ARRIVAL"&&["LANDED","TAXIING_IN"].includes(raw))setText("distance","0 km");
};

maViewerDistance=function(current){
 const state=String(current?.movement?.state||"").toUpperCase();
 const lineage=String(current?.movement?.lineage||"").toUpperCase();
 if(lineage==="DEPARTURE"&&["TAXIING_OUT","LINING_UP"].includes(state))return null;
 if(lineage==="DEPARTURE"&&state==="TAKEOFF_ROLL")return 0;
 if(lineage==="ARRIVAL"&&["LANDED","TAXIING_IN"].includes(state))return 0;
 const threshold=Number(current?.telemetry?.thresholdDistanceKm);
 const airportDistance=Number(current?.telemetry?.airportDistanceKm);
 const base=Number.isFinite(threshold)&&lineage==="ARRIVAL"?threshold:airportDistance;
 return Number.isFinite(base)?Math.max(0,base):null;
};

showSafeLiveContext=function(current,airportInfo){
 if(!current?.available){stopLiveDistanceTicker();hideStoryTicker();return}
 const rawState=String(current.movement?.state||"").toUpperCase();
 const lineage=String(current.movement?.lineage||"").toUpperCase();
 const display=String(current.movement?.displayState||"").toUpperCase();
 let state;
 if(lineage==="ARRIVAL") state=["LANDED","TAXIING_IN"].includes(rawState)?"LANDED":((rawState==="ON_FINAL"||display.includes("FINAL"))?"FINAL APPROACH":"APPROACHING");
 else if(lineage==="DEPARTURE"&&rawState==="AIRBORNE_DEPARTURE") state="AIRBORNE";
 else state=String(current.movement?.displayState||current.movement?.state||"Aircraft in view").replaceAll("_"," ").toUpperCase();
 const runway=current.movement?.runway||null;
 const speedKt=Number(current.telemetry?.speedKt)||0;
 const distance=maViewerDistance(current);
 const groundNoDistance=lineage==="DEPARTURE"&&["TAXIING_OUT","LINING_UP"].includes(rawState);
 const fixedZero=(lineage==="DEPARTURE"&&rawState==="TAKEOFF_ROLL")||(lineage==="ARRIVAL"&&["LANDED","TAXIING_IN"].includes(rawState));
 window.__maDistanceAnchor={time:Date.now(),distance:Number.isFinite(distance)?distance:0,speedKt,lineage,state,runway,fixedZero,showDistance:!groundNoDistance&&Number.isFinite(distance)};
 const parts=[];if(state)parts.push(state);if(runway)parts.push("Runway "+runway);if(!groundNoDistance&&Number.isFinite(distance))parts.push("About "+maFormatDistance(distance)+" from the airport");
 const safeKey="LIVE|"+(identityKey(current)||"")+"|"+state;
 startStoryTicker(parts.join("   •   "),safeKey,false,"LIVE");
 const ticker=document.getElementById("storyTicker");
 if(ticker){
  ticker.classList.remove("plane-fact","air-english","attention","arrival-approaching","arrival-final","arrival-landed");
  if(lineage==="ARRIVAL")ticker.classList.add(state==="LANDED"?"arrival-landed":state==="FINAL APPROACH"?"arrival-final":"arrival-approaching");
 }
 stopLiveDistanceTicker();
 window.__maLiveDistanceTimer=setInterval(()=>{
  const a=window.__maDistanceAnchor;if(!a)return;
  const track=document.getElementById("storyTickerTrack");if(!track)return;
  const d=maProjectedDistance();
  const p=[];if(a.state)p.push(a.state);if(a.runway)p.push("Runway "+a.runway);if(a.showDistance&&Number.isFinite(d))p.push("About "+maFormatDistance(d)+" from the airport");
  track.textContent=p.join("   •   ");
 },1000);
};
</script></body>`);

    return originalSend(html);
  };

  return baseHandler(req, res);
};
