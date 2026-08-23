const baseHandler = require("./overlay-wrapper-v26.js");

// MikeAircraft Overlay v2.7
// Welcome/farewell moments pulse three times, then hold steady.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);
  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.6", "Overlay v2.7");

    html = html.replace("</style>", `
@keyframes maMomentFlash{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.28;transform:scale(1.035)}}
.story-ticker.moment.flash .story-ticker-track{animation:maMomentFlash .66s ease-in-out 3}
</style>`);

    html = html.replace(
      'ticker.classList.add("moment",kind==="arrival"?"arrival-moment":"departure-moment");\n track.textContent=text;',
      'ticker.classList.add("moment","flash",kind==="arrival"?"arrival-moment":"departure-moment");\n track.textContent=text;\n setTimeout(()=>ticker.classList.remove("flash"),2100);'
    );

    html = html.replace(
      'window.__maMomentTimer=setTimeout(()=>{ticker.classList.remove("visible","moment","arrival-moment","departure-moment");},3200);',
      'window.__maMomentTimer=setTimeout(()=>{ticker.classList.remove("visible","moment","flash","arrival-moment","departure-moment");},3200);'
    );

    return originalSend(html);
  };
  return baseHandler(req, res);
};
