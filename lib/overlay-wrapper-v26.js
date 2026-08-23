const baseHandler = require("./overlay-wrapper-v25.js");

// MikeAircraft Overlay v2.6
// Ticker remains silent for routine status, but gets two human broadcast moments:
// - arrival touchdown welcome
// - departure farewell shortly before the 3 km drop
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);
  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.5", "Overlay v2.6");

    html = html.replace("</style>", `
.story-ticker.moment{background:linear-gradient(90deg,rgba(5,24,38,.98),rgba(8,57,76,.98));}
.story-ticker.moment .story-ticker-label{display:none!important}
.story-ticker.moment .story-ticker-track{font-size:clamp(25px,2.2vw,40px)!important;font-weight:900!important;letter-spacing:.4px!important;text-align:center!important;transform:none!important;position:static!important;width:100%!important;white-space:nowrap!important;color:#fff!important;text-shadow:0 2px 12px rgba(0,0,0,.65)}
.story-ticker.moment.arrival-moment .story-ticker-track{color:#74ffc1!important}
.story-ticker.moment.departure-moment .story-ticker-track{color:#8fe8ff!important}
</style>`);

    html = html.replace("</body>", `<script>
const MA_AIRPORT_MOMENTS={
 PRG:{welcome:"AHOJ! WELCOME TO PRAGUE 🇨🇿",farewell:"ŠŤASTNOU CESTU! HAVE A GOOD FLIGHT ✈️"},
 LHR:{welcome:"WELCOME TO LONDON 🇬🇧",farewell:"HAVE A GOOD FLIGHT! ✈️"},
 ATL:{welcome:"WELCOME TO ATLANTA 🇺🇸",farewell:"HAVE A GOOD FLIGHT! ✈️"},
 FRA:{welcome:"WILLKOMMEN IN FRANKFURT 🇩🇪",farewell:"GUTEN FLUG! ✈️"},
 AMS:{welcome:"WELKOM IN AMSTERDAM 🇳🇱",farewell:"GOEDE REIS! ✈️"},
 CDG:{welcome:"BIENVENUE À PARIS 🇫🇷",farewell:"BON VOL! ✈️"},
 MAN:{welcome:"WELCOME TO MANCHESTER 🇬🇧",farewell:"HAVE A GOOD FLIGHT! ✈️"}
};
window.__maMomentSeen=window.__maMomentSeen||new Set();
window.__maMomentTimer=null;
function maAirportCode(){return (new URLSearchParams(location.search).get("airport")||"PRG").trim().toUpperCase()}
function maMomentKey(current,kind){return (identityKey(current)||"unknown")+"|"+kind}
function maShowMoment(text,kind,key){
 if(!text||window.__maMomentSeen.has(key))return false;
 window.__maMomentSeen.add(key);
 stopLiveDistanceTicker();
 const ticker=document.getElementById("storyTicker"),track=document.getElementById("storyTickerTrack");
 if(!ticker||!track)return false;
 if(window.__maStoryTimer){clearTimeout(window.__maStoryTimer);window.__maStoryTimer=null}
 if(window.__maMomentTimer){clearTimeout(window.__maMomentTimer);window.__maMomentTimer=null}
 ticker.classList.remove("plane-fact","air-english","attention","arrival-approaching","arrival-final","arrival-landed","arrival-moment","departure-moment");
 ticker.classList.add("moment",kind==="arrival"?"arrival-moment":"departure-moment");
 track.textContent=text;
 track.style.transform="none";
 ticker.classList.add("visible");
 window.__maMomentTimer=setTimeout(()=>{ticker.classList.remove("visible","moment","arrival-moment","departure-moment");},3200);
 return true;
}
showSafeLiveContext=function(current){
 if(!current?.available){stopLiveDistanceTicker();hideStoryTicker();return}
 const lineage=String(current.movement?.lineage||"").toUpperCase();
 const raw=String(current.movement?.state||"").toUpperCase();
 const d=Number(current.telemetry?.airportDistanceKm);
 const msg=MA_AIRPORT_MOMENTS[maAirportCode()]||MA_AIRPORT_MOMENTS.PRG;
 if(lineage==="ARRIVAL"&&["LANDED","TAXIING_IN"].includes(raw)){
  maShowMoment(msg.welcome,"arrival",maMomentKey(current,"WELCOME"));return;
 }
 if(lineage==="DEPARTURE"&&["AIRBORNE_DEPARTURE","DEPARTING"].includes(raw)&&Number.isFinite(d)&&d>=1.8&&d<3){
  maShowMoment(msg.farewell,"departure",maMomentKey(current,"FAREWELL"));return;
 }
 stopLiveDistanceTicker();hideStoryTicker();
};
</script></body>`);

    return originalSend(html);
  };
  return baseHandler(req, res);
};
