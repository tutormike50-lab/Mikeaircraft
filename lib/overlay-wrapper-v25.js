const baseHandler = require("./overlay-wrapper-v24.js");

// MikeAircraft Overlay v2.5
// Editorial rule: ribbon owns all routine flight status/telemetry.
// Ticker is reserved for PLANE FACT, AIR ENGLISH and verified ALERT/EMERGENCY content.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);
  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.4", "Overlay v2.5");
    html = html.replace("</body>", `<script>
// Never narrate routine movement/status in the ticker.
showSafeLiveContext=function(){stopLiveDistanceTicker();hideStoryTicker();};
</script></body>`);
    return originalSend(html);
  };
  return baseHandler(req, res);
};
