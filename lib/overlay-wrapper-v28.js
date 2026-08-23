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
.ma-css-radar-dot{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#68ffc2;box-shadow:0 0 7px rgba(104,255,194,.95)}
.ma-css-radar-dot.ground{background:#6dc6ff;box-shadow:0 0 7px rgba(109,198,255,.9)}
.ma-css-radar-dot.current{width:12px;height:12px;margin:-6px 0 0 -6px;background:#ffca57;border:2px solid rgba(255,242,185,.9);box-shadow:0 0 12px rgba(255,202,87,.95)}
#radarCanvas{z-index:2}
.radar-wrap{
 background:radial-gradient(circle,rgba(5,46,51,.94) 0%,rgba(3,29,35,.97) 72%,rgba(1,15,20,.99) 100%)!important;
 border-color:rgba(92,255,209,.9)!important;
 box-shadow:0 0 38px rgba(73,255,190,.38),inset 0 0 34px rgba(73,255,190,.16)!important;
}
.radar-title{color:rgba(210,255,240,1)!important;text-shadow:0 0 8px rgba(73,255,190,.65)}
.radar-range{color:rgba(177,245,224,.92)!important}
.main-ribbon .identity,
.main-ribbon .status-panel{
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
 message.textContent=text;
 message.classList.add("visible");
 ribbon.classList.add("moment-active");
 window.__maMomentTimer=setTimeout(()=>{
  message.classList.remove("visible");
  ribbon.classList.remove("moment-active");
 },3200);
 return true;
};
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
 const face=document.createElement("div");
 face.className="ma-css-radar";
 face.innerHTML='<span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span><span class="ring r4"></span><span class="axis-h"></span><span class="axis-v"></span><span class="sweep"></span><span class="center"></span>';
 wrap.insertBefore(face,wrap.firstChild);
 function renderDots(){
  const old=face.querySelectorAll(".ma-css-radar-dot");
  for(let i=0;i<old.length;i++)old[i].parentNode.removeChild(old[i]);
  if(!radarAirport||!Array.isArray(radarAircraft))return;
  for(let i=0;i<radarAircraft.length;i++){
   const a=radarAircraft[i],lat=Number(a.lat),lon=Number(a.lon);
   if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
   const rel=radarRelativeKm(lat,lon,radarAirport.lat,radarAirport.lon);
   const distance=Math.hypot(rel.eastKm,rel.northKm);
   if(distance>RADAR_RANGE_KM)continue;
   const dot=document.createElement("span");
   const current=radarKey(a)===radarCurrentKey;
   dot.className="ma-css-radar-dot"+(a.onGround?" ground":"")+(current?" current":"");
   dot.style.left=(50+(rel.eastKm/RADAR_RANGE_KM)*50)+"%";
   dot.style.top=(50-(rel.northKm/RADAR_RANGE_KM)*50)+"%";
   face.appendChild(dot);
  }
 }
 renderDots();
 setInterval(renderDots,1000);
})();
</script></body>`);

    return originalSend(html);
  };
  return baseHandler(req, res);
};
