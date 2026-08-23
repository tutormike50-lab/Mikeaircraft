const baseHandler = require("./overlay-wrapper-v27.js");

// MikeAircraft Overlay v2.8
// Professional arrival and departure greetings temporarily occupy the main aircraft ribbon.
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
</script></body>`);

    return originalSend(html);
  };
  return baseHandler(req, res);
};
