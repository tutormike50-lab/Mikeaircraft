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

    // Tuned aircraft-story crawl speed for livestream readability.
    html = html.replace('const speed=.032;', 'const speed=.26;');

    // Make the scrolling story easier to read on the livestream without
    // increasing the ticker height or taking more camera space.
    html = html.replace(
      'font-size:clamp(12px,.92vw,16px);font-weight:650',
      'font-size:clamp(15px,1.15vw,20px);font-weight:650'
    );

    // Telemetry colour is movement-aware. Arrivals remain red while airborne
    // and turn green at zero altitude/on-ground. Departures do the opposite:
    // green while still at zero/on-ground, then red once airborne.
    html = html.replace(
      "</style>",
      ".telemetry-strip.telemetry-red .metric-value{color:#ff4d4d!important}.telemetry-strip.telemetry-green .metric-value{color:#55e889!important}</style>"
    );

    const telemetryHelper = `function updateTelemetryColour(t){const strip=document.querySelector(\".telemetry-strip\");if(!strip)return;strip.classList.remove(\"telemetry-red\",\"telemetry-green\");if(!t?.available)return;const lineage=String(t.movement?.lineage||\"\").toUpperCase();const rawAlt=Number(t.telemetry?.altitudeFt);const altitude=Number.isFinite(rawAlt)?rawAlt:null;const state=String(t.movement?.state||\"\").toUpperCase();const onGround=altitude===0||state===\"LANDED\"||state===\"TAXIING\"||state===\"LINING_UP\"||state===\"TAKEOFF_ROLL\";if(lineage===\"ARRIVAL\")strip.classList.add(onGround?\"telemetry-green\":\"telemetry-red\");else if(lineage===\"DEPARTURE\")strip.classList.add(onGround?\"telemetry-green\":\"telemetry-red\");else strip.classList.add(\"telemetry-red\")}`;
    const updateMarker = "async function update(){";
    if (html.includes(updateMarker)) html = html.replace(updateMarker, telemetryHelper + "\n" + updateMarker);
    html = html.replace("showMain(current);showNext(null);", "showMain(current);updateTelemetryColour(current);showNext(null);");

    return originalSend(html);
  };

  return baseHandler(req, res);
};
