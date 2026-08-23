const baseHandler = require("./overlay-wrapper-v27.js");

// MikeAircraft Overlay v2.8
// Moment styling: same large size, regular weight, yellow; Prague welcome has no flag.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);
  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.7", "Overlay v2.8");

    html = html.replace("</style>", `
.story-ticker.moment .story-ticker-track,
.story-ticker.moment.arrival-moment .story-ticker-track,
.story-ticker.moment.departure-moment .story-ticker-track{
 color:#ffd84a!important;
 font-weight:400!important;
}
</style>`);

    html = html.replace('welcome:"AHOJ! WELCOME TO PRAGUE 🇨🇿"', 'welcome:"AHOJ! WELCOME TO PRAGUE"');

    return originalSend(html);
  };
  return baseHandler(req, res);
};
