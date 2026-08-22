const baseHandler = require("./overlay-wrapper.js");

// MikeAircraft Overlay v1.2 presentation layer.
// Joins the route map and Storyteller into one visual panel, keeps the route
// animation looping while CURRENT is active, and clears that information panel
// shortly before the main CURRENT ribbon ends. CURRENT and its coherent route
// render immediately from Broadcast so auxiliary engine/story calls can never
// blank the main ribbon/map. If an external route is incoherent, the map can
// fall back to the real live aircraft position relative to the watched airport.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);

    let html = body
      .replaceAll("Overlay v1.1", "Overlay v1.2")
      .replaceAll("Overlay v1.0", "Overlay v1.2");

    html = html.replace(
      "</style>",
      `.route-map-card{left:3vw!important;top:3.5vh!important;width:clamp(330px,31vw,560px)!important;height:clamp(180px,14vw,250px)!important;border-radius:14px 14px 0 0!important;border-bottom-color:rgba(105,205,255,.22)!important}
.story-card{left:3vw!important;top:calc(3.5vh + clamp(180px,14vw,250px))!important;width:clamp(330px,31vw,560px)!important;border-radius:0 0 14px 14px!important;border-top:none!important;box-shadow:0 16px 36px rgba(0,0,0,.34)!important}
.story-card.mapless{top:3.5vh!important;border-radius:14px!important;border-top:1px solid rgba(105,205,255,.42)!important}
.story-text{height:168px!important}
@media(max-width:900px){.route-map-card{width:min(65vw,480px)!important;height:190px!important}.story-card{width:min(65vw,480px)!important;top:calc(3.5vh + 190px)!important}.story-card.mapless{top:3.5vh!important}}
</style>`
    );

    html = html.replace(
      "let busy=false,lastCurrentKey=null,radarCurrentKey=null,radarAircraft=[],radarAirport=null,radarSweepAngle=0,lastStoryKey=null,storyScrollFrame=null;",
      "let busy=false,lastCurrentKey=null,radarCurrentKey=null,radarAircraft=[],radarAirport=null,radarSweepAngle=0,lastStoryKey=null,storyScrollFrame=null,lastRouteKey=null;"
    );

    const routeStart = html.indexOf("function showRouteMap(t){");
    const routeEnd = html.indexOf("\nfunction drawRouteMap(){", routeStart);
    if (routeStart >= 0 && routeEnd > routeStart) {
      const newRoute = `function setMapTitle(text){const el=document.querySelector(".route-map-title");if(el)el.textContent=text}
function showRouteMap(t){
 const card=document.getElementById("routeMapCard");
 if(!t?.route?.found||!t.route.map){card.classList.remove("visible");routeAnimationActive=false;routeData=null;lastRouteKey=null;return}
 const start=t.route.map.start,end=t.route.map.end;
 if(start?.lat==null||start?.lon==null||end?.lat==null||end?.lon==null){card.classList.remove("visible");routeAnimationActive=false;routeData=null;return}
 const routeKey=(identityKey(t)||"")+"|"+(t.route.display||"");
 routeData={start,end,originCode:t.route.origin?.iata||t.route.origin?.icao||"",destinationCode:t.route.destination?.iata||t.route.destination?.icao||""};
 setMapTitle("FLIGHT ROUTE");
 setText("routeMapRoute",t.route.display||"");
 const o=t.route.origin?.city||t.route.origin?.name||"",d=t.route.destination?.city||t.route.destination?.name||"";
 setText("routeMapCities",o+"  →  "+d);
 if(routeKey!==lastRouteKey){lastRouteKey=routeKey;routeAnimationStart=performance.now()}
 routeAnimationActive=true;
 card.classList.add("visible")
}
function showLocalMovementMap(current,engine,airport){
 if(!current?.available||!engine?.ok||!Array.isArray(engine.aircraft))return false;
 const reg=String(current.identity?.registration||"").toUpperCase(),cs=String(current.identity?.callsign||"").toUpperCase();
 const live=engine.aircraft.find(a=>(reg&&String(a.registration||"").toUpperCase()===reg)||(cs&&String(a.callsign||"").toUpperCase()===cs));
 const apLat=Number(engine.airport?.lat),apLon=Number(engine.airport?.lon),lat=Number(live?.lat),lon=Number(live?.lon);
 if(!Number.isFinite(apLat)||!Number.isFinite(apLon)||!Number.isFinite(lat)||!Number.isFinite(lon))return false;
 const lineage=String(current.movement?.lineage||"").toUpperCase();
 const arrival=lineage==="ARRIVAL";
 const start=arrival?{lat,lon}:{lat:apLat,lon:apLon},end=arrival?{lat:apLat,lon:apLon}:{lat,lon};
 const airportCode=String(airport||"").toUpperCase();
 const routeKey=(identityKey(current)||"")+"|LOCAL|"+airportCode;
 routeData={start,end,originCode:arrival?"LIVE":airportCode,destinationCode:arrival?airportCode:"LIVE"};
 setMapTitle("LIVE MOVEMENT");
 setText("routeMapRoute",arrival?"LIVE → "+airportCode:airportCode+" → LIVE");
 setText("routeMapCities",arrival?"Current aircraft position → "+engine.airport.name:engine.airport.name+" → current aircraft position");
 if(routeKey!==lastRouteKey){lastRouteKey=routeKey;routeAnimationStart=performance.now()}
 routeAnimationActive=true;
 document.getElementById("routeMapCard").classList.add("visible");
 document.getElementById("storyCard").classList.remove("mapless");
 return true
}`;
      html = html.slice(0, routeStart) + newRoute + html.slice(routeEnd);
    }

    html = html.replace(
      "let progress=routeAnimationActive?Math.min(1,(performance.now()-routeAnimationStart)/ROUTE_ANIMATION_MS):1;",
      "let progress=routeAnimationActive?((performance.now()-routeAnimationStart)%ROUTE_ANIMATION_MS)/ROUTE_ANIMATION_MS:1;"
    );

    const updateStart = html.indexOf("async function update(){");
    const updateEnd = html.indexOf("\ndrawRadar();", updateStart);
    if (updateStart >= 0 && updateEnd > updateStart) {
      const newUpdate = `function hideInfoPanel(){
 const map=document.getElementById("routeMapCard"),story=document.getElementById("storyCard");
 map.classList.remove("visible");story.classList.remove("visible","verified");
 routeAnimationActive=false;
 if(storyScrollFrame){cancelAnimationFrame(storyScrollFrame);storyScrollFrame=null}
}
function infoPanelClosing(current){
 if(!current?.available)return false;
 const lineage=String(current.movement?.lineage||"").toUpperCase(),state=String(current.movement?.state||"").toUpperCase();
 const distance=Number(current.telemetry?.airportDistanceKm);
 if(lineage==="ARRIVAL"&&state==="LANDED")return Number(current.movement?.stateAgeSeconds||0)>=10;
 if(lineage==="DEPARTURE"&&(state==="DEPARTING"||state==="AIRBORNE_DEPARTURE")&&Number.isFinite(distance)&&distance>=3)return true;
 return false
}
function guardCurrentRoute(current,airport){
 if(!current?.available||!current.route?.found)return current;
 const ids={PRG:["PRG","LKPR"],LHR:["LHR","EGLL"],FRA:["FRA","EDDF"],AMS:["AMS","EHAM"],CDG:["CDG","LFPG"],MAN:["MAN","EGCC"],ATL:["ATL","KATL"]};
 const local=ids[airport]||[airport];
 const endpointMatches=e=>{if(!e)return false;const a=String(e.iata||"").toUpperCase(),b=String(e.icao||"").toUpperCase();return local.includes(a)||local.includes(b)};
 const lineage=String(current.movement?.lineage||"").toUpperCase();
 const routeOK=lineage==="ARRIVAL"?endpointMatches(current.route.destination):lineage==="DEPARTURE"?endpointMatches(current.route.origin):(endpointMatches(current.route.origin)||endpointMatches(current.route.destination));
 if(!routeOK)current.route={...current.route,found:false,display:null,map:null,suppressed:true,suppressedReason:"Route not coherent with CURRENT at watched airport"};
 return current
}
async function update(){
 if(busy)return;busy=true;
 const p=new URLSearchParams(window.location.search),airport=(p.get("airport")||"PRG").trim().toUpperCase();
 try{
  const br=await fetch("/api/broadcast?airport="+encodeURIComponent(airport)+"&t="+Date.now(),{cache:"no-store"});
  const bt=await br.text(),data=JSON.parse(bt);if(!br.ok||!data.ok)throw new Error(data.error||"Broadcast API failed");
  const current=guardCurrentRoute(data.aircraft?.current,airport);
  const closing=infoPanelClosing(current);

  showMain(current);showNext(null);
  if(current?.available&&!closing){
   const storyCard=document.getElementById("storyCard");
   if(current.route?.found){storyCard.classList.remove("mapless");showRouteMap(current)}
   else{document.getElementById("routeMapCard").classList.remove("visible");routeAnimationActive=false;storyCard.classList.add("mapless")}
  }else if(!current?.available||closing){
   hideInfoPanel();
  }

  const storyParams=new URLSearchParams({airport:airport,t:String(Date.now())});
  if(current?.available){if(current.identity?.registration)storyParams.set("registration",current.identity.registration);if(current.identity?.callsign)storyParams.set("callsign",current.identity.callsign)}else{storyParams.set("registration","__NO_CURRENT__")}

  const [er,sr]=await Promise.allSettled([
   fetch("/api/engine?airport="+encodeURIComponent(airport)+"&t="+Date.now(),{cache:"no-store"}),
   fetch("/api/storyteller?"+storyParams.toString(),{cache:"no-store"})
  ]);

  let engine=null,story=null,srOK=false;
  if(er.status==="fulfilled"){
   try{const et=await er.value.text();engine=JSON.parse(et)}catch(e){console.warn("Engine auxiliary parse failed",e)}
  }
  if(sr.status==="fulfilled"){
   try{const st=await sr.value.text();story=JSON.parse(st);srOK=sr.value.ok}catch(e){console.warn("Story auxiliary parse failed",e)}
  }

  if(current?.available&&!closing){
   if(!current.route?.found)showLocalMovementMap(current,engine,airport);
   if(srOK&&story?.ok)showStory(story);else document.getElementById("storyCard").classList.remove("visible","verified")
  }

  if(engine?.ok){radarAircraft=Array.isArray(engine.aircraft)?engine.aircraft:[];radarAirport={lat:Number(engine.airport?.lat),lon:Number(engine.airport?.lon)};if(!Number.isFinite(radarAirport.lat)||!Number.isFinite(radarAirport.lon))radarAirport=null}
 }catch(e){console.error("Overlay update failed:",e)}finally{busy=false}
}`;
      html = html.slice(0, updateStart) + newUpdate + html.slice(updateEnd);
    }

    return originalSend(html);
  };

  return baseHandler(req, res);
};
