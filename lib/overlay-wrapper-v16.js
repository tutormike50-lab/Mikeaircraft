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

    // Viewer-friendly route names in the ribbon. Keep IATA/ICAO codes in the
    // backend, but display readable place names such as Atlanta → Heathrow.
    const identityLine = 'function identityKey(t){return t?.identity?.registration||t?.identity?.callsign||null}';
    const friendlyHelpers = `${identityLine}\nfunction friendlyAirportName(endpoint){if(!endpoint)return \"\";const code=String(endpoint.iata||endpoint.icao||\"\").toUpperCase();const familiar={ATL:\"Atlanta\",LHR:\"Heathrow\",LGW:\"Gatwick\",STN:\"Stansted\",LTN:\"Luton\",LCY:\"London City\",PRG:\"Prague\",CDG:\"Paris Charles de Gaulle\",ORY:\"Paris Orly\",AMS:\"Amsterdam\",FRA:\"Frankfurt\",MAN:\"Manchester\"};if(familiar[code])return familiar[code];const city=String(endpoint.city||\"\").trim();if(city)return city;let name=String(endpoint.name||\"\").trim();name=name.replace(/\\bInternational Airport\\b/gi,\"\").replace(/\\bInternational\\b/gi,\"\").replace(/\\bAirport\\b/gi,\"\").replace(/\\s{2,}/g,\" \" ).trim();return name||code}\nfunction friendlyRoute(route){if(!route?.found)return \"\";const from=friendlyAirportName(route.origin),to=friendlyAirportName(route.destination);return from&&to?from+\" → \"+to:(route.display||\"\")}`;
    if (html.includes(identityLine)) html = html.replace(identityLine, friendlyHelpers);

    html = html.replace(
      'setText("route",t.route?.display||"");',
      'setText("route",friendlyRoute(t.route));'
    );

    return originalSend(html);
  };

  return baseHandler(req, res);
};
