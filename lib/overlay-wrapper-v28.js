const baseHandler = require("./overlay-wrapper-v27.js");

// MikeAircraft Overlay v2.8
// Professional arrival and departure greetings inside the lower story ribbon.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);
  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.7", "Overlay v2.8");

    html = html.replace("</style>", `
.story-ticker.moment .story-ticker-track,
.story-ticker.moment.arrival-moment .story-ticker-track,
.story-ticker.moment.departure-moment .story-ticker-track{
 color:#e6f0f7!important;
 font-weight:500!important;
 letter-spacing:.8px!important;
 text-shadow:0 2px 10px rgba(0,0,0,.72)!important;
}
</style>`);

    html = html.replace('welcome:"AHOJ! WELCOME TO PRAGUE 🇨🇿"', 'welcome:"WELCOME TO PRAGUE"');
    html = html.replace('farewell:"ŠŤASTNOU CESTU! HAVE A GOOD FLIGHT ✈️"', 'farewell:"HAVE A GOOD FLIGHT"');

    return originalSend(html);
  };
  return baseHandler(req, res);
};
