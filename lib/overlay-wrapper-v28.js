const baseHandler = require("./overlay-wrapper-v27.js");

// MikeAircraft Overlay v2.8
// Professional greetings occupy the main ribbon; a compact PRG tower badge sits beside the radar.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);
  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.7", "Overlay v2.8");

    html = html.replace("</style>", `
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
 top:3.5vh;
 right:calc(3vw + clamp(230px,18vw,355px) + 14px);
 z-index:17;
 width:82px;
 min-height:66px;
 display:flex;
 flex-direction:column;
 align-items:center;
 justify-content:center;
 gap:2px;
 padding:7px 9px 6px;
 border:1px solid rgba(105,225,198,.46);
 border-radius:11px;
 background:linear-gradient(145deg,rgba(4,25,36,.94),rgba(5,48,62,.92));
 box-shadow:0 8px 22px rgba(0,0,0,.3),inset 0 0 18px rgba(64,222,185,.05);
 color:#c8f7e8;
 pointer-events:none;
}
.prg-tower-badge svg{
 width:31px;
 height:31px;
 display:block;
 stroke:#8ce8cf;
 fill:none;
 stroke-width:1.8;
 stroke-linecap:round;
 stroke-linejoin:round;
}
.prg-tower-code{
 font-size:13px;
 line-height:1;
 font-weight:800;
 letter-spacing:2px;
 color:#e8fff8;
 text-shadow:0 1px 5px rgba(0,0,0,.7);
}
@media(max-width:900px){
 .prg-tower-badge{right:calc(3vw + 224px);width:72px}
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
</script></body>`);

    return originalSend(html);
  };
  return baseHandler(req, res);
};
