const baseHandler = require("./overlay-wrapper-v15.js");

// MikeAircraft Overlay v1.6
// Broadcast presentation simplification: remove the route/live-movement map
// entirely while preserving radar, aircraft ribbon, story crawl, status,
// runway and telemetry. Route data remains available in the backend for
// Storyteller and route coherence decisions.
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);

    let html = body.replaceAll("Overlay v1.5", "Overlay v1.6");

    // Remove the map from the rendered broadcast layer without disturbing
    // the underlying route data or backend logic.
    html = html.replace(
      "</style>",
      "#routeMapCard{display:none!important;opacity:0!important;visibility:hidden!important}</style>"
    );

    return originalSend(html);
  };

  return baseHandler(req, res);
};
