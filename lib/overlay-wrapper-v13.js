const baseHandler = require("./overlay-wrapper-v12.js");

// MikeAircraft Overlay v1.3 stability layer.
// Broadcast is the single source of truth for viewer-facing CURRENT, ribbon,
// route-map eligibility and panel closing. Storyteller may enrich that same
// CURRENT but cannot change it. Engine is used only for radar data.
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
`;
      html = html.slice(0, updateAt) + helpers + html.slice(updateAt);
    }

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
