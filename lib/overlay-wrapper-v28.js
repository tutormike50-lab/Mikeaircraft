const baseHandler = require("./overlay-wrapper-v27.js");

// MikeAircraft Overlay v2.8
// Professional greetings occupy the main ribbon; a compact PRG tower badge sits beside the radar.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);
  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.7", "Overlay v2.8");

    // YoloBox uses an older embedded browser that may not support conic canvas gradients.
    // Fall back to a simple sweep arm so radar rendering cannot stop the live ribbon updater.
    html = html.replace(
      'const sr=radarSweepAngle*Math.PI/180,g=ctx.createConicGradient(sr,cx,cy);g.addColorStop(0,"rgba(73,255,190,.30)");g.addColorStop(.07,"rgba(73,255,190,.10)");g.addColorStop(.18,"rgba(73,255,190,0)");g.addColorStop(1,"rgba(73,255,190,0)");ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();',
      'const sr=radarSweepAngle*Math.PI/180;if(typeof ctx.createConicGradient==="function"){const g=ctx.createConicGradient(sr,cx,cy);g.addColorStop(0,"rgba(73,255,190,.30)");g.addColorStop(.07,"rgba(73,255,190,.10)");g.addColorStop(.18,"rgba(73,255,190,0)");g.addColorStop(1,"rgba(73,255,190,0)");ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill()}else{ctx.save();ctx.strokeStyle="rgba(73,255,190,.72)";ctx.lineWidth=2;ctx.shadowColor="rgba(73,255,190,.65)";ctx.shadowBlur=7;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.sin(sr)*r,cy-Math.cos(sr)*r);ctx.stroke();ctx.restore()}'
    );

    // Increase radar contrast for HDMI capture and compressed livestream video.
    html = html
      .replace('ctx.strokeStyle="rgba(83,226,185,.23)"', 'ctx.strokeStyle="rgba(104,255,205,.48)"')
      .replace('ctx.strokeStyle="rgba(83,226,185,.16)"', 'ctx.strokeStyle="rgba(104,255,205,.32)"')
      .replace('ctx.fillStyle="rgba(141,235,208,.55)"', 'ctx.fillStyle="rgba(190,255,235,.88)"')
      .replace('g.addColorStop(0,"rgba(73,255,190,.30)")', 'g.addColorStop(0,"rgba(73,255,190,.52)")')
      .replace('g.addColorStop(.07,"rgba(73,255,190,.10)")', 'g.addColorStop(.07,"rgba(73,255,190,.22)")')
      .replace('ctx.strokeStyle="rgba(73,255,190,.72)"', 'ctx.strokeStyle="rgba(73,255,190,.96)"')
      .replace('ctx.shadowColor="rgba(73,255,190,.65)";ctx.shadowBlur=7', 'ctx.shadowColor="rgba(73,255,190,.92)";ctx.shadowBlur=11')
      .replace('ctx.strokeStyle="rgba(104,255,205,.7)"', 'ctx.strokeStyle="rgba(104,255,205,.96)";ctx.lineWidth=1.8')
      .replace('ctx.arc(x,y,isCurrent?5.5:2.6', 'ctx.arc(x,y,isCurrent?6.2:3.4');

    html = html.replace("</style>", `
@keyframes maCssRadarSweep{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.ma-css-radar{position:absolute;inset:8%;z-index:1;border-radius:50%;pointer-events:none}
.ma-css-radar .ring{position:absolute;left:50%;top:50%;border:1px solid rgba(104,255,205,.5);border-radius:50%;transform:translate(-50%,-50%)}
.ma-css-radar .r1{width:25%;height:25%}.ma-css-radar .r2{width:50%;height:50%}.ma-css-radar .r3{width:75%;height:75%}.ma-css-radar .r4{width:100%;height:100%}
.ma-css-radar .axis-h,.ma-css-radar .axis-v{position:absolute;background:rgba(104,255,205,.34)}
.ma-css-radar .axis-h{left:0;right:0;top:50%;height:1px}.ma-css-radar .axis-v{top:0;bottom:0;left:50%;width:1px}
.ma-css-radar .sweep{position:absolute;left:calc(50% - 1px);top:0;width:2px;height:50%;transform-origin:50% 100%;background:linear-gradient(to top,rgba(104,255,205,.98),rgba(104,255,205,.28));box-shadow:0 0 9px rgba(73,255,190,.95);animation:maCssRadarSweep 8s linear infinite}
.ma-css-radar .center{position:absolute;left:calc(50% - 3px);top:calc(50% - 3px);width:6px;height:6px;border-radius:50%;background:#eafff8;box-shadow:0 0 8px rgba(104,255,205,.95)}
.ma-css-radar-dot{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#68ffc2;box-shadow:0 0 7px rgba(104,255,194,.95);transition:left .95s linear,top .95s linear,transform .12s ease,box-shadow .12s ease,background .12s ease}
.ma-css-radar-dot.ground{background:#6dc6ff;box-shadow:0 0 7px rgba(109,198,255,.9)}
.ma-css-radar-dot.current{width:12px;height:12px;margin:-6px 0 0 -6px;background:#ffca57;border:2px solid rgba(255,242,185,.9);box-shadow:0 0 12px rgba(255,202,87,.95)}
.ma-css-radar-dot.sweep-hit{transform:scale(1.65);background:#b6ffe7;box-shadow:0 0 9px rgba(182,255,231,1),0 0 22px rgba(73,255,190,.95)}
.ma-css-radar-dot.current.sweep-hit{transform:scale(1.55);background:#ffe58a;box-shadow:0 0 10px rgba(255,239,166,1),0 0 26px rgba(255,202,87,1)}
.ma-css-radar-label{position:absolute;left:14px;top:-7px;white-space:nowrap;color:#fff1b8;font-size:clamp(10px,.72vw,13px);font-weight:800;letter-spacing:.2px;text-shadow:-1px -1px 2px #061018,1px 1px 2px #061018,0 0 7px rgba(255,202,87,.85)}
.ma-css-radar-label.left{left:auto;right:14px;text-align:right}
.ma-css-radar-dot:not(.current) .ma-css-radar-label{color:#c2ffe8;font-size:clamp(8px,.58vw,11px);font-weight:700;text-shadow:-1px -1px 2px #061018,1px 1px 2px #061018,0 0 6px rgba(73,255,190,.7)}
.ma-css-radar-dot.ground:not(.current) .ma-css-radar-label{display:none}
#radarCanvas{z-index:2}
.radar-wrap{
 background:radial-gradient(circle,rgba(5,46,51,.94) 0%,rgba(3,29,35,.97) 72%,rgba(1,15,20,.99) 100%)!important;
 border-color:rgba(92,255,209,.9)!important;
 box-shadow:0 0 38px rgba(73,255,190,.38),inset 0 0 34px rgba(73,255,190,.16)!important;
}
.radar-title{color:rgba(210,255,240,1)!important;text-shadow:0 0 8px rgba(73,255,190,.65)}
.radar-range{color:rgba(177,245,224,.92)!important}
.ma-prague-panorama{
 position:absolute;
 inset:0;
 z-index:3;
 border-radius:inherit;
 overflow:hidden;
 background-image:linear-gradient(90deg,rgba(2,18,31,.58) 0%,rgba(2,18,31,.24) 32%,rgba(2,18,31,.22) 68%,rgba(2,18,31,.58) 100%),linear-gradient(0deg,rgba(1,12,23,.28),rgba(1,12,23,.03)),url("/api/prague-welcome-image");
 background-size:cover;
 background-position:center center;
 opacity:0;
 transform:scale(1.01);
 transition:opacity .5s ease,transform 3.4s ease;
 pointer-events:none;
}
.main-ribbon.arrival-panorama .ma-prague-panorama{
 opacity:1;
 transform:scale(1);
}
.main-ribbon.arrival-panorama{
 box-shadow:0 10px 34px rgba(0,0,0,.4),0 0 24px rgba(64,186,255,.14);
}
.main-ribbon.arrival-panorama .main-ribbon-moment{
 color:#fff;
 font-weight:650;
 letter-spacing:1.4px;
 text-shadow:0 2px 5px rgba(0,0,0,.98),0 0 16px rgba(0,0,0,.7);
}
.ma-departure-panorama{
 position:absolute;
 inset:0;
 z-index:3;
 border-radius:inherit;
 overflow:hidden;
 background-image:linear-gradient(90deg,rgba(2,18,31,.58) 0%,rgba(2,18,31,.22) 32%,rgba(2,18,31,.20) 68%,rgba(2,18,31,.58) 100%),linear-gradient(0deg,rgba(1,12,23,.30),rgba(1,12,23,.02)),url("/api/prague-departure-cockpit-image");
 background-size:cover;
 background-position:center center;
 opacity:0;
 transform:scale(1.01);
 transition:opacity .5s ease,transform 3.4s ease;
 pointer-events:none;
}
.main-ribbon.departure-panorama .ma-departure-panorama{
 opacity:1;
 transform:scale(1);
}
.main-ribbon.departure-panorama{
 box-shadow:0 10px 34px rgba(0,0,0,.4),0 0 24px rgba(64,186,255,.14);
}
.main-ribbon.departure-panorama .main-ribbon-moment{
 color:#fff;
 font-weight:650;
 letter-spacing:1.4px;
 text-shadow:0 2px 5px rgba(0,0,0,.98),0 0 16px rgba(0,0,0,.7);
}
.main-ribbon .identity,
.main-ribbon .status-panel{
 position:relative;
 z-index:2;
 transition:opacity .25s ease;
}
.main-ribbon.moment-active .identity,
.main-ribbon.moment-active .status-panel{
 opacity:0;
}
.main-ribbon-moment{
 position:absolute;
 inset:0;
 z-index:4;
 display:flex;
 align-items:center;
 justify-content:center;
 padding:18px 30px;
 color:#e6f0f7;
 font-size:clamp(27px,2.45vw,44px);
 font-weight:500;
 letter-spacing:.8px;
 text-align:center;
 text-shadow:0 2px 10px rgba(0,0,0,.72);
 opacity:0;
 transition:opacity .25s ease;
 pointer-events:none;
}
.main-ribbon-moment.visible{opacity:1}
.ma-copyright{
 position:absolute;
 top:calc(3.5vh + 118px);
 left:2.1vw;
 z-index:16;
 color:rgba(220,242,255,.76);
 font-size:clamp(10px,.68vw,12px);
 line-height:1;
 font-weight:650;
 letter-spacing:.75px;
 text-shadow:0 1px 5px rgba(0,0,0,.92);
 white-space:nowrap;
 pointer-events:none;
}
.prg-tower-badge{
 position:absolute;
 top:calc(3.5vh - 14px);
 right:calc(3vw - 14px);
 z-index:17;
 width:56px;
 min-height:48px;
 display:flex;
 flex-direction:column;
 align-items:center;
 justify-content:center;
 gap:2px;
 padding:5px 6px 4px;
 border:1px solid rgba(105,225,198,.28);
 border-radius:9px;
 background:rgba(3,24,31,.56);
 box-shadow:0 4px 12px rgba(0,0,0,.2);
 color:#c8f7e8;
 pointer-events:none;
 animation:prgSweepFlash 8s linear infinite;
}
@keyframes prgSweepFlash{
 0%,10%,15%,100%{
  border-color:rgba(105,225,198,.28);
  background:rgba(3,24,31,.56);
  box-shadow:0 4px 12px rgba(0,0,0,.2);
 }
 12.5%{
  border-color:#74ffc1;
  background:rgba(8,75,57,.88);
  box-shadow:0 0 8px rgba(116,255,193,.85),0 0 22px rgba(72,255,181,.65);
 }
}
.prg-tower-badge svg{
 width:25px;
 height:25px;
 display:block;
 stroke:#8ce8cf;
 fill:none;
 stroke-width:1.8;
 stroke-linecap:round;
 stroke-linejoin:round;
}
.prg-tower-code{
 font-size:11px;
 line-height:1;
 font-weight:800;
 letter-spacing:2px;
 color:#e8fff8;
 text-shadow:0 1px 5px rgba(0,0,0,.7);
}
@media(max-width:900px){
 .prg-tower-badge{top:calc(3.5vh - 12px);right:calc(3vw - 12px);width:52px}
}
</style>`);

    html = html.replace('welcome:"AHOJ! WELCOME TO PRAGUE 🇨🇿"', 'welcome:"WELCOME TO PRAGUE"');
    html = html.replace('farewell:"ŠŤASTNOU CESTU! HAVE A GOOD FLIGHT ✈️"', 'farewell:"HAVE A GOOD FLIGHT"');

    html = html.replace("</body>", `<script>
window.__maCompletedMomentAircraftKey=window.__maCompletedMomentAircraftKey||null;
window.__maCompletedMomentAircraftIds=window.__maCompletedMomentAircraftIds||[];
window.__maLastCurrentAircraft=window.__maLastCurrentAircraft||null;
function __maAircraftIdentitySet(aircraft){
 const values=[],identity=aircraft&&aircraft.identity?aircraft.identity:{};
 const candidates=[identity.modeS,identity.registration,identity.callsign,identity.flight,aircraft&&aircraft.modeS,aircraft&&aircraft.hex,aircraft&&aircraft.registration,aircraft&&aircraft.callsign];
 for(let i=0;i<candidates.length;i++){
  const value=String(candidates[i]||"").trim().toUpperCase().replace(/\s+/g,"");
  if(value&&values.indexOf(value)<0)values.push(value);
 }
 return values;
}
const __maShowMainBeforeMomentClose=showMain;
showMain=function(current){
 const currentAvailable=!!(current&&current.available);
 const currentKey=currentAvailable?identityKey(current):null;
 const currentIds=currentAvailable?__maAircraftIdentitySet(current):[];
 const completedIds=Array.isArray(window.__maCompletedMomentAircraftIds)?window.__maCompletedMomentAircraftIds:[];
 const completedKey=window.__maCompletedMomentAircraftKey;
 const lockActive=!!completedKey||completedIds.length>0;
 let sameAircraft=!!(currentKey&&completedKey&&currentKey===completedKey);
 for(let i=0;!sameAircraft&&i<currentIds.length;i++){
  if(completedIds.indexOf(currentIds[i])>=0)sameAircraft=true;
 }
 if(currentAvailable)window.__maLastCurrentAircraft=current;
 if(lockActive&&(!currentAvailable||sameAircraft)){
  const lower=document.getElementById("lowerThird");
  if(lower)lower.classList.remove("visible");
  return;
 }
 if(lockActive&&currentAvailable&&!sameAircraft){
  window.__maCompletedMomentAircraftKey=null;
  window.__maCompletedMomentAircraftIds=[];
  const ribbon=document.querySelector(".main-ribbon");
  if(ribbon){
   ribbon.classList.remove("arrival-panorama");
   ribbon.classList.remove("departure-panorama");
  }
 }
 __maShowMainBeforeMomentClose(current);
 const status=document.getElementById("status");
 if(status){
  const viewerStatus=String(status.textContent||"").trim().toUpperCase();
  if(viewerStatus==="ON FINAL")status.textContent="FINAL APPROACH";
  else if(viewerStatus==="TAXIING OUT")status.textContent="TAXI OUT";
 }
};
maShowMoment=function(text,kind,key){
 if(!text||window.__maMomentSeen.has(key))return false;
 const ribbon=document.querySelector(".main-ribbon");
 if(!ribbon)return false;
 window.__maMomentSeen.add(key);
 stopLiveDistanceTicker();
 hideStoryTicker();
 if(window.__maStoryTimer){clearTimeout(window.__maStoryTimer);window.__maStoryTimer=null}
 if(window.__maMomentTimer){clearTimeout(window.__maMomentTimer);window.__maMomentTimer=null}
 let message=ribbon.querySelector(".main-ribbon-moment");
 if(!message){
  message=document.createElement("div");
  message.className="main-ribbon-moment";
  ribbon.appendChild(message);
 }
 let panorama=ribbon.querySelector(".ma-prague-panorama");
 if(!panorama){
  panorama=document.createElement("div");
  panorama.className="ma-prague-panorama";
  ribbon.insertBefore(panorama,ribbon.firstChild);
 }
 let departurePanorama=ribbon.querySelector(".ma-departure-panorama");
 if(!departurePanorama){
  departurePanorama=document.createElement("div");
  departurePanorama.className="ma-departure-panorama";
  ribbon.insertBefore(departurePanorama,ribbon.firstChild);
 }
 if(kind==="arrival"){
  const homeAirportMatch=String(window.location.search||"").match(/[?&]airport=([^&]+)/i);
  const homeAirportCode=homeAirportMatch?decodeURIComponent(homeAirportMatch[1]).toUpperCase():"PRG";
  const homeAirline=String((document.getElementById("airline")&&document.getElementById("airline").textContent)||"").trim();
  const homeFlight=String((document.getElementById("flight")&&document.getElementById("flight").textContent)||"").trim().toUpperCase();
  const isCzechHomeAirline=/smart\s*wings?|travel\s*service/i.test(homeAirline)||/^(QS|TVS)/.test(homeFlight);
  if(homeAirportCode==="PRG"&&isCzechHomeAirline)text="WELCOME HOME";
 }
 message.textContent=text;
 message.classList.add("visible");
 ribbon.classList.add("moment-active");
 ribbon.classList.toggle("arrival-panorama",kind==="arrival");
 ribbon.classList.toggle("departure-panorama",kind==="departure");
 window.__maCompletedMomentAircraftKey=String(key).replace(/\|(WELCOME|FAREWELL)$/,"");
 window.__maCompletedMomentAircraftIds=__maAircraftIdentitySet(window.__maLastCurrentAircraft);
 window.__maMomentTimer=setTimeout(()=>{
  message.classList.remove("visible");
  ribbon.classList.remove("moment-active");
  ribbon.classList.remove("arrival-panorama");
  ribbon.classList.remove("departure-panorama");
  const lower=document.getElementById("lowerThird");
  if(lower)lower.classList.remove("visible");
 },3200);
 return true;
};
(function addMikeAircraftCopyright(){
 const overlay=document.querySelector(".overlay");
 if(!overlay||overlay.querySelector(".ma-copyright"))return;
 const mark=document.createElement("div");
 mark.className="ma-copyright";
 mark.textContent="© "+new Date().getFullYear()+" MikeAircraft";
 overlay.appendChild(mark);
})();
(function addPrgTowerBadge(){
 const overlay=document.querySelector(".overlay");
 if(!overlay||overlay.querySelector(".prg-tower-badge"))return;
 const badge=document.createElement("div");
 badge.className="prg-tower-badge";
 badge.setAttribute("aria-label","Prague Airport PRG");
 badge.innerHTML='<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M13 10h14l3 6H10l3-6Z"/><path d="M14 16h12l-2 7h-8l-2-7Z"/><path d="M17 23h6l3 14H14l3-14Z"/><path d="M8 37h24"/><path d="M20 5v5"/><path d="M17 5h6"/></svg><span class="prg-tower-code">PRG</span>';
 overlay.appendChild(badge);
})();
(function addYoloSafeRadar(){
 const wrap=document.querySelector(".radar-wrap");
 if(!wrap||wrap.querySelector(".ma-css-radar"))return;
 const nativeCanvas=document.getElementById("radarCanvas");
 let nativeContext=null;
 try{nativeContext=nativeCanvas&&nativeCanvas.getContext?nativeCanvas.getContext("2d"):null}catch(error){}
 // Modern browsers use the single native canvas radar. The CSS radar is only a Yolo-safe fallback.
 if(nativeContext&&typeof nativeContext.createConicGradient==="function")return;
 if(nativeCanvas)nativeCanvas.style.display="none";
 const face=document.createElement("div");
 face.className="ma-css-radar";
 face.innerHTML='<span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span><span class="ring r4"></span><span class="axis-h"></span><span class="axis-v"></span><span class="sweep"></span><span class="center"></span>';
 wrap.insertBefore(face,wrap.firstChild);
 const dots=Object.create(null),movement=Object.create(null);
 function renderDots(){
  if(!radarAirport||!Array.isArray(radarAircraft))return;
  const seen=Object.create(null),now=Date.now();
  for(let i=0;i<radarAircraft.length;i++){
   const a=radarAircraft[i],lat=Number(a.lat),lon=Number(a.lon);
   if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
   const key=String(radarKey(a)||("aircraft-"+i));
   const rel=radarRelativeKm(lat,lon,radarAirport.lat,radarAirport.lon);
   const positionKey=lat.toFixed(6)+"|"+lon.toFixed(6);
   let motion=movement[key];
   if(!motion||motion.positionKey!==positionKey){
    const age=Math.max(0,Math.min(10,Number(a.positionAge)||0));
    motion=movement[key]={positionKey:positionKey,northKm:rel.northKm,eastKm:rel.eastKm,time:now-age*1000,speedKt:Number(a.speed)||0,track:Number(a.track)};
   }
   const elapsed=Math.max(0,(now-motion.time)/1000);
   const travelled=Math.max(0,motion.speedKt)*1.852/3600*elapsed;
   const heading=Number.isFinite(motion.track)?motion.track*Math.PI/180:null;
   const north=motion.northKm+(heading===null?0:Math.cos(heading)*travelled);
   const east=motion.eastKm+(heading===null?0:Math.sin(heading)*travelled);
   const distance=Math.hypot(east,north);
   if(distance>RADAR_RANGE_KM)continue;
   seen[key]=true;
   let dot=dots[key];
   if(!dot){
    dot=dots[key]=document.createElement("span");
    const label=document.createElement("span");
    label.className="ma-css-radar-label";
    dot.appendChild(label);
    face.appendChild(dot);
   }
   const current=radarKey(a)===radarCurrentKey;
   dot.className="ma-css-radar-dot"+(a.onGround?" ground":"")+(current?" current":"");
   const left=50+(east/RADAR_RANGE_KM)*50,top=50-(north/RADAR_RANGE_KM)*50;
   dot.style.left=left+"%";
   dot.style.top=top+"%";
   dot._maRadarEast=east;
   dot._maRadarNorth=north;
   const label=dot.firstChild,placeLeft=left>63;
   label.className="ma-css-radar-label"+(placeLeft?" left":"");
   label.textContent=String(current?((document.getElementById("flight")&&document.getElementById("flight").textContent)||a.callsign||a.registration||"CURRENT"):(a.callsign||a.registration||"")).trim();
  }
  const keys=Object.keys(dots);
  for(let i=0;i<keys.length;i++){
   const key=keys[i];
   if(!seen[key]){if(dots[key].parentNode)dots[key].parentNode.removeChild(dots[key]);delete dots[key];delete movement[key]}
  }
 }
 const sweepStarted=Date.now();
 function updateSweepGlow(){
  const sweep=((Date.now()-sweepStarted)%8000)/8000*Math.PI*2;
  const keys=Object.keys(dots);
  for(let i=0;i<keys.length;i++){
   const dot=dots[keys[i]],east=Number(dot._maRadarEast),north=Number(dot._maRadarNorth);
   if(!Number.isFinite(east)||!Number.isFinite(north)){dot.classList.remove("sweep-hit");continue}
   const target=Math.atan2(east,north);
   const difference=Math.abs(Math.atan2(Math.sin(sweep-target),Math.cos(sweep-target)));
   dot.classList.toggle("sweep-hit",difference<0.13);
  }
 }
 renderDots();
 setInterval(renderDots,1000);
 setInterval(updateSweepGlow,100);
})();
</script></body>`);

    return originalSend(html);
  };
  return baseHandler(req, res);
};
