const baseHandler = require("./overlay-wrapper-v12.js");

// MikeAircraft Overlay v1.3 quiet-airport resilience layer.
// Keeps verified Storyteller content briefly through transient confidence gaps,
// falls back to restrained live movement context when specific narration is not
// safe, and only uses the auxiliary Engine to close the panel when it is still
// describing the same CURRENT aircraft.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);

    let html = body.replaceAll("Overlay v1.2", "Overlay v1.3");

    html = html.replace(
      "lastStoryKey=null,storyScrollFrame=null,lastRouteKey=null;",
      "lastStoryKey=null,storyScrollFrame=null,lastRouteKey=null,lastGoodStoryAt=0,lastGoodStoryAircraftKey=null;"
    );

    const updateMarker = "async function update(){";
    const updateAt = html.indexOf(updateMarker);
    if (updateAt >= 0) {
      const helpers = `function currentIdentityMatchesEngine(current,engineCurrent){
 if(!current?.available||!engineCurrent)return false;
 const cr=String(current.identity?.registration||"").toUpperCase(),er=String(engineCurrent.registration||"").toUpperCase();
 const cc=String(current.identity?.callsign||"").toUpperCase(),ec=String(engineCurrent.callsign||"").toUpperCase();
 return Boolean((cr&&er&&cr===er)||(cc&&ec&&cc===ec));
}
function enginePanelClosing(current,engineCurrent){
 if(!currentIdentityMatchesEngine(current,engineCurrent))return false;
 const lineage=String(engineCurrent.lineage||"").toUpperCase(),state=String(engineCurrent.state||"").toUpperCase();
 const age=Number(engineCurrent.stateAgeSeconds||0),distance=Number(engineCurrent.distanceKm);
 if(lineage==="ARRIVAL"&&state==="LANDED"&&age>=10)return true;
 if(lineage==="DEPARTURE"&&(state==="DEPARTING"||state==="AIRBORNE_DEPARTURE")&&Number.isFinite(distance)&&distance>=3)return true;
 return false;
}
function showSafeLiveContext(current,airportInfo){
 const card=document.getElementById("storyCard");
 if(!current?.available){card.classList.remove("visible","verified");return}
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
 lastStoryKey="SAFE|"+(identityKey(current)||"");
 card.classList.add("visible");
 requestAnimationFrame(()=>startStoryScroll(viewport,scroll));
}
`;
      html = html.slice(0, updateAt) + helpers + html.slice(updateAt);
    }

    const oldBlock = `  if(current?.available&&!closing){
   if(!current.route?.found)showLocalMovementMap(current,engine,airport);
   if(srOK&&story?.ok)showStory(story);else document.getElementById("storyCard").classList.remove("visible","verified")
  }

  if(engine?.ok){`;

    const newBlock = `  const finalClosing=closing||enginePanelClosing(current,engine?.intelligence?.current);
  if(current?.available&&!finalClosing){
   if(!current.route?.found)showLocalMovementMap(current,engine,airport);
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
  }else if(finalClosing){
   hideInfoPanel();
  }

  if(engine?.ok){`;

    if (html.includes(oldBlock)) html = html.replace(oldBlock, newBlock);

    return originalSend(html);
  };

  return baseHandler(req, res);
};
