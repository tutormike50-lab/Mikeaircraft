const baseHandler = require("./overlay-wrapper-v12.js");

// MikeAircraft Overlay v1.3 stability layer.
// Broadcast is the single source of truth for viewer-facing CURRENT, ribbon,
// route-map eligibility and panel closing. Storyteller may enrich that same
// CURRENT but cannot change it. Engine is used only for radar data.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);
  const requestedAirport = String(req.query?.airport || "PRG").trim().toUpperCase();
  const allowedAirports = new Set(["PRG","LHR","FRA","AMS","CDG","MAN","ATL"]);
  const pinnedAirport = allowedAirports.has(requestedAirport) ? requestedAirport : "PRG";

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);

    let html = body.replaceAll("Overlay v1.2", "Overlay v1.3");

    // Hard-pin this rendered overlay instance to the airport requested on the
    // server. The browser can no longer silently fall back to PRG because of
    // query-string or navigation state. All viewer-facing calls use this value.
    html = html.replace(
      `const p=new URLSearchParams(window.location.search),airport=(p.get("airport")||"PRG").trim().toUpperCase();`,
      `const airport=${JSON.stringify(pinnedAirport)};`
    );

    html = html.replace(
      "lastStoryKey=null,storyScrollFrame=null,lastRouteKey=null;",
      "lastStoryKey=null,storyScrollFrame=null,lastRouteKey=null,lastGoodStoryAt=0,lastGoodStoryAircraftKey=null,lastCoherentMapAircraftKey=null,lastCoherentMapRoute=null;"
    );

    // Radar-only polish: keep the central rings uncluttered, but label more
    // non-current aircraft once they are sufficiently far from the airport.
    // CURRENT keeps its existing prominent gold label.
    html = html.replace(
      `if(isCurrent){ctx.strokeStyle="rgba(255,202,87,.82)";ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(x,y,9.5,0,Math.PI*2);ctx.stroke();const label=document.getElementById("flight")?.textContent||a.callsign||a.registration||"";ctx.save();ctx.font="800 "+Math.max(12,w*.043)+"px Arial";ctx.textAlign="left";ctx.textBaseline="middle";ctx.lineJoin="round";ctx.miterLimit=2;ctx.lineWidth=Math.max(3,w*.012);ctx.strokeStyle="rgba(0,10,15,.92)";ctx.shadowColor="rgba(0,0,0,.85)";ctx.shadowBlur=5;ctx.strokeText(label,x+12,y);ctx.fillStyle="#fff1b8";ctx.shadowColor="rgba(255,202,87,.28)";ctx.shadowBlur=4;ctx.fillText(label,x+12,y);ctx.restore()}`,
      `if(isCurrent){ctx.strokeStyle="rgba(255,202,87,.82)";ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(x,y,9.5,0,Math.PI*2);ctx.stroke();const label=document.getElementById("flight")?.textContent||a.callsign||a.registration||"";ctx.save();ctx.font="800 "+Math.max(12,w*.043)+"px Arial";ctx.textAlign="left";ctx.textBaseline="middle";ctx.lineJoin="round";ctx.miterLimit=2;ctx.lineWidth=Math.max(3,w*.012);ctx.strokeStyle="rgba(0,10,15,.92)";ctx.shadowColor="rgba(0,0,0,.85)";ctx.shadowBlur=5;ctx.strokeText(label,x+12,y);ctx.fillStyle="#fff1b8";ctx.shadowColor="rgba(255,202,87,.28)";ctx.shadowBlur=4;ctx.fillText(label,x+12,y);ctx.restore()}else if(dist>=6&&(a.callsign||a.registration)){const label=String(a.callsign||a.registration||"").trim();if(label){ctx.save();ctx.font="700 "+Math.max(8,w*.028)+"px Arial";ctx.textBaseline="middle";ctx.textAlign=x>cx?"right":"left";const offset=x>cx?-7:7;ctx.lineJoin="round";ctx.lineWidth=2.5;ctx.strokeStyle="rgba(0,12,16,.88)";ctx.strokeText(label,x+offset,y);ctx.fillStyle="rgba(194,255,232,.88)";ctx.fillText(label,x+offset,y);ctx.restore()}}`
    );

    const updateMarker = "async function update(){";
    const updateAt = html.indexOf(updateMarker);
    if (updateAt >= 0) {
      const helpers = `function showSafeLiveContext(current,airportInfo){
 const card=document.getElementById("storyCard");
 if(!current?.available){card.classList.remove("visible","verified");return}
 const safeKey="SAFE|"+(identityKey(current)||"");
 if(lastStoryKey===safeKey&&card.classList.contains("visible"))return;
 if(storyScrollFrame){cancelAnimationFrame(storyScrollFrame);storyScrollFrame=null}
 card.classList.remove("verified");
 setText("storyKicker","LIVE CONTEXT");
 const state=current.movement?.displayState||current.movement?.state||"Aircraft in view";
 setText("storyHeadline",state);
 const airportName=airportInfo?.name||airportInfo?.code||"the airport";
 const runway=current.movement?.runway;
 const distance=Number(current.telemetry?.airportDistanceKm);
 const parts=["Live aircraft activity at "+airportName+"."];
 if(runway)parts.push("The aircraft is associated with runway "+runway+".");
 if(Number.isFinite(distance))parts.push("It is about "+distance.toFixed(1)+" kilometres from the airport reference point.");
 parts.push("More aircraft details will appear when they can be verified.");
 const viewport=document.getElementById("storyText");viewport.innerHTML="";
 const scroll=document.createElement("div");scroll.className="story-scroll";
 for(const text of parts){const p=document.createElement("p");p.textContent=text;scroll.appendChild(p)}
 viewport.appendChild(scroll);
 setText("storyMeta","LIVE DATA • DETAILS PENDING VERIFICATION");
 lastStoryKey=safeKey;
 card.classList.add("visible");
 requestAnimationFrame(()=>startStoryScroll(viewport,scroll));
}
function showStableRouteMap(current){
 const storyCard=document.getElementById("storyCard");
 const currentKey=identityKey(current)||"";
 if(current?.route?.found){
  lastCoherentMapAircraftKey=currentKey;
  lastCoherentMapRoute=current.route;
  storyCard.classList.remove("mapless");
  showRouteMap(current);
  return;
 }
 if(currentKey&&currentKey===lastCoherentMapAircraftKey&&lastCoherentMapRoute?.found){
  storyCard.classList.remove("mapless");
  showRouteMap({...current,route:lastCoherentMapRoute});
  return;
 }
 lastCoherentMapAircraftKey=currentKey||null;
 lastCoherentMapRoute=null;
 document.getElementById("routeMapCard").classList.remove("visible");
 routeAnimationActive=false;
 storyCard.classList.add("mapless");
}
`;
      html = html.slice(0, updateAt) + helpers + html.slice(updateAt);
    }

    html = html.replace(
      `  if(current?.available&&!closing){
   const storyCard=document.getElementById("storyCard");
   if(current.route?.found){storyCard.classList.remove("mapless");showRouteMap(current)}
   else{document.getElementById("routeMapCard").classList.remove("visible");routeAnimationActive=false;storyCard.classList.add("mapless")}
  }else if(!current?.available||closing){
   hideInfoPanel();
  }`,
      `  if(current?.available&&!closing){
   showStableRouteMap(current);
  }else if(!current?.available||closing){
   lastCoherentMapAircraftKey=null;
   lastCoherentMapRoute=null;
   hideInfoPanel();
  }`
    );

    const oldBlock = `  if(current?.available&&!closing){
   if(!current.route?.found)showLocalMovementMap(current,engine,airport);
   if(srOK&&story?.ok)showStory(story);else document.getElementById("storyCard").classList.remove("visible","verified")
  }

  if(engine?.ok){`;

    const newBlock = `  if(current?.available&&!closing){
   const currentStoryKey=identityKey(current)||"";
   const storyUsable=Boolean(srOK&&story?.ok&&story?.output?.available);
   if(storyUsable){
    showStory(story);
    lastGoodStoryAt=Date.now();
    lastGoodStoryAircraftKey=currentStoryKey;
   }else{
    const sameAircraft=currentStoryKey&&currentStoryKey===lastGoodStoryAircraftKey;
    const cardVisible=document.getElementById("storyCard").classList.contains("visible");
    if(!(sameAircraft&&cardVisible&&(Date.now()-lastGoodStoryAt)<20000))showSafeLiveContext(current,data.airport);
   }
  }

  if(engine?.ok){`;

    if (html.includes(oldBlock)) html = html.replace(oldBlock, newBlock);

    return originalSend(html);
  };

  return baseHandler(req, res);
};
