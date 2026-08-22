const baseHandler = require("./overlay-wrapper-v13.js");

// MikeAircraft Overlay v1.4 map-lifecycle patch.
// Keep a coherent CURRENT aircraft route map visible for the full CURRENT
// lifecycle and loop the route animation instead of hiding the map after 5.2s.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);

    let html = body.replaceAll("Overlay v1.3", "Overlay v1.4");

    // Remove the base map's self-destruct timer. CURRENT/closing logic is the
    // authority for when the card disappears.
    html = html.replace(
      `clearTimeout(routeTimer);routeTimer=setTimeout(()=>{card.classList.remove("visible");routeAnimationActive=false},ROUTE_ANIMATION_MS)`,
      `clearTimeout(routeTimer);routeTimer=null`
    );

    // Continuously loop the route trace while the map remains active.
    html = html.replace(
      `let progress=routeAnimationActive?Math.min(1,(performance.now()-routeAnimationStart)/ROUTE_ANIMATION_MS):1;`,
      `let progress=routeAnimationActive?((performance.now()-routeAnimationStart)%ROUTE_ANIMATION_MS)/ROUTE_ANIMATION_MS:1;`
    );

    return originalSend(html);
  };

  return baseHandler(req, res);
};
