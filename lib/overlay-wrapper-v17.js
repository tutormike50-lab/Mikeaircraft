const baseHandler = require("./overlay-wrapper-v16.js");

// MikeAircraft Overlay v1.7
// Ticker editorial/attention update:
// - PLANE FACT and AIR ENGLISH attention labels
// - no generic encyclopedia filler
// - viewer wording uses "airport", never "airport reference point"
// - rough live distance moves between ADS-B refreshes and is anchored to 0 km
//   around touchdown/takeoff states
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v1.6", "Overlay v1.7");

    html = html.replace("</style>", `
@keyframes maFactPulse{
  0%,100%{background:linear-gradient(90deg,#3a2500,#5d3a00);color:#ffe4a0;box-shadow:0 0 0 rgba(255,205,90,0)}
  50%{background:linear-gradient(90deg,#ffbd21,#ffdf72);color:#07111c;box-shadow:0 0 18px rgba(255,202,87,.95)}
}
@keyframes maEnglishPulse{
  0%,100%{background:linear-gradient(90deg,#00364c,#005875);color:#baf4ff;box-shadow:0 0 0 rgba(77,220,255,0)}
  50%{background:linear-gradient(90deg,#42dbff,#9df2ff);color:#06121a;box-shadow:0 0 18px rgba(77,220,255,.95)}
}
.story-ticker.plane-fact .story-ticker-label{color:#ffe29a;border-right-color:rgba(255,202,87,.65)}
.story-ticker.plane-fact.attention .story-ticker-label{animation:maFactPulse .65s ease-in-out 3}
.story-ticker.air-english .story-ticker-label{color:#9befff;border-right-color:rgba(85,220,255,.65)}
.story-ticker.air-english.attention .story-ticker-label{animation:maEnglishPulse .65s ease-in-out 3}
</style>`);

    // Ensure any live-distance updater is stopped when the ticker is hidden.
    html = html.replace("function hideStoryTicker(){", "function hideStoryTicker(){stopLiveDistanceTicker();");

    // Replace Storyteller renderer so v0.6 PLANE FACT metadata drives the ticker.
    const storyStart = html.indexOf("function showStory(data){");
    const storyEnd = html.indexOf("\nfunction radarRelativeKm", storyStart);
    if (storyStart >= 0 && storyEnd > storyStart) {
      const storyRenderer = `function showStory(data){
 stopLiveDistanceTicker();
 const output=data?.output,story=output?.story,segments=Array.isArray(output?.segments)?output.segments:[];
 if(!data?.ok||!output?.available||!story)return;
 const cls=String(output.class||"").toUpperCase();
 const isPlaneFact=cls==="PLANE_FACT";
 const isAirEnglish=cls==="AIR_ENGLISH";
 const verified=story.specificAircraft===true||isPlaneFact||String(output.class||"").startsWith("VERIFIED_");
 const regFact=Array.isArray(output.facts)?output.facts.find(f=>f?.label==="registration"):null;
 const storyKey=(regFact?.value||story.headline||output.class||"")+"|"+cls;
 const items=segments.length?segments.map(s=>s?.text).filter(Boolean):[story.text].filter(Boolean);
 const text=items.join("   •   ");
 const labelText=isPlaneFact?"✦ PLANE FACT ✦":isAirEnglish?"✦ AIR ENGLISH ✦":verified?"AIRCRAFT STORY":"LIVE STORY";
 startStoryTicker(text,storyKey,verified,labelText);
 const ticker=document.getElementById("storyTicker");
 if(!ticker)return;
 ticker.classList.toggle("plane-fact",isPlaneFact);
 ticker.classList.toggle("air-english",isAirEnglish);
 ticker.classList.remove("attention");
 if(isPlaneFact||isAirEnglish){
   void ticker.offsetWidth;
   ticker.classList.add("attention");
   setTimeout(()=>ticker.classList.remove("attention"),2100);
 }
}`;
      html = html.slice(0, storyStart) + storyRenderer + html.slice(storyEnd);
    }

    // Replace fallback live-context renderer. Distance is a viewer aid, not a
    // survey measurement: it is re-anchored on each fresh data update and then
    // projected using groundspeed until the next update.
    const contextStart = html.indexOf("function showSafeLiveContext(current,airportInfo){");
    const contextEnd = html.indexOf("\nfunction showStableRouteMap", contextStart);
    if (contextStart >= 0 && contextEnd > contextStart) {
      const contextRenderer = `function stopLiveDistanceTicker(){
 if(window.__maLiveDistanceTimer){clearInterval(window.__maLiveDistanceTimer);window.__maLiveDistanceTimer=null}
}
function maViewerDistance(current){
 const state=String(current?.movement?.state||"").toUpperCase();
 const lineage=String(current?.movement?.lineage||"").toUpperCase();
 const threshold=Number(current?.telemetry?.thresholdDistanceKm);
 const airportDistance=Number(current?.telemetry?.airportDistanceKm);
 let base=Number.isFinite(threshold)&&lineage==="ARRIVAL"?threshold:airportDistance;
 if(!Number.isFinite(base))return null;
 if(["LANDED","TAXIING_IN"].includes(state))base=0;
 if(["TAXIING_OUT","LINING_UP","TAKEOFF_ROLL"].includes(state))base=0;
 return Math.max(0,base);
}
function maProjectedDistance(){
 const a=window.__maDistanceAnchor;if(!a)return null;
 if(a.fixedZero)return 0;
 const elapsed=Math.max(0,(Date.now()-a.time)/1000);
 const kmPerSec=Math.max(0,a.speedKt)*1.852/3600;
 const delta=kmPerSec*elapsed;
 const d=a.lineage==="ARRIVAL"?a.distance-delta:a.lineage==="DEPARTURE"?a.distance+delta:a.distance;
 return Math.max(0,d);
}
function maFormatDistance(d){
 if(!Number.isFinite(d))return "";
 if(d<0.05)return "0 km";
 if(d<10)return d.toFixed(1)+" km";
 return Math.round(d)+" km";
}
function maRenderLiveContext(anchor){
 const track=document.getElementById("storyTickerTrack");if(!track||!anchor)return;
 const d=maProjectedDistance();
 const parts=[];
 if(anchor.state)parts.push(anchor.state);
 if(anchor.runway)parts.push("Runway "+anchor.runway);
 if(Number.isFinite(d))parts.push("About "+maFormatDistance(d)+" from the airport");
 track.textContent=parts.join("   •   ");
}
function showSafeLiveContext(current,airportInfo){
 if(!current?.available){stopLiveDistanceTicker();hideStoryTicker();return}
 const state=String(current.movement?.displayState||current.movement?.state||"Aircraft in view").toUpperCase();
 const rawState=String(current.movement?.state||"").toUpperCase();
 const lineage=String(current.movement?.lineage||"").toUpperCase();
 const runway=current.movement?.runway||null;
 const speedKt=Number(current.telemetry?.speedKt)||0;
 const distance=maViewerDistance(current);
 const fixedZero=["LANDED","TAXIING_IN","TAXIING_OUT","LINING_UP","TAKEOFF_ROLL"].includes(rawState);
 window.__maDistanceAnchor={time:Date.now(),distance:Number.isFinite(distance)?distance:0,speedKt,lineage,state,runway,fixedZero};
 const safeKey="LIVE|"+(identityKey(current)||"");
 const initial=[];if(state)initial.push(state);if(runway)initial.push("Runway "+runway);if(Number.isFinite(distance))initial.push("About "+maFormatDistance(distance)+" from the airport");
 startStoryTicker(initial.join("   •   "),safeKey,false,"LIVE");
 const ticker=document.getElementById("storyTicker");if(ticker){ticker.classList.remove("plane-fact","air-english","attention")}
 stopLiveDistanceTicker();
 window.__maLiveDistanceTimer=setInterval(()=>maRenderLiveContext(window.__maDistanceAnchor),1000);
}`;
      html = html.slice(0, contextStart) + contextRenderer + html.slice(contextEnd);
    }

    return originalSend(html);
  };

  return baseHandler(req, res);
};
