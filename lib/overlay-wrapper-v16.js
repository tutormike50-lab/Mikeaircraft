const baseHandler = require("./overlay-wrapper-v15.js");

// MikeAircraft Overlay v1.6
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v1.5", "Overlay v1.6");

    html = html.replace("</style>", "#routeMapCard{display:none!important;opacity:0!important;visibility:hidden!important}</style>");

    const identityLine = 'function identityKey(t){return t?.identity?.registration||t?.identity?.callsign||null}';
    const friendlyHelpers = `${identityLine}\nfunction friendlyAirportName(endpoint){if(!endpoint)return \"\";const code=String(endpoint.iata||endpoint.icao||\"\").toUpperCase();const familiar={ATL:\"Atlanta\",LHR:\"Heathrow\",LGW:\"Gatwick\",STN:\"Stansted\",LTN:\"Luton\",LCY:\"London City\",PRG:\"Prague\",CDG:\"Paris Charles de Gaulle\",ORY:\"Paris Orly\",AMS:\"Amsterdam\",FRA:\"Frankfurt\",MAN:\"Manchester\"};if(familiar[code])return familiar[code];const city=String(endpoint.city||\"\").trim();if(city)return city;let name=String(endpoint.name||\"\").trim();name=name.replace(/\\bInternational Airport\\b/gi,\"\").replace(/\\bInternational\\b/gi,\"\").replace(/\\bAirport\\b/gi,\"\").replace(/\\s{2,}/g,\" \" ).trim();return name||code}\nfunction friendlyRoute(route){if(!route?.found)return \"\";const from=friendlyAirportName(route.origin),to=friendlyAirportName(route.destination);return from&&to?from+\" → \"+to:(route.display||\"\")}`;
    if (html.includes(identityLine)) html = html.replace(identityLine, friendlyHelpers);
    html = html.replace('setText("route",t.route?.display||"");', 'setText("route",friendlyRoute(t.route));');
    html = html.replace('const speed=.032;', 'const speed=.25;');
    html = html.replace('font-size:clamp(12px,.92vw,16px);font-weight:650', 'font-size:clamp(15px,1.15vw,20px);font-weight:650');

    // Keep all live telemetry values consistently green for a clean broadcast look.
    html = html.replace("</style>", ".telemetry-strip .metric-value{color:#55e889!important}.mikeaircraft-logo{position:absolute;top:3.3vh;left:3vw;z-index:18;pointer-events:none;filter:drop-shadow(0 2px 5px rgba(0,0,0,.85));font-family:Arial,Helvetica,sans-serif}.ma-fuselage{position:relative;display:flex;align-items:center;height:30px;padding:0 23px 0 20px;background:linear-gradient(90deg,rgba(5,31,58,.94),rgba(7,70,110,.94));border:1px solid rgba(103,221,255,.85);border-radius:55% 80% 80% 45%;font-size:clamp(14px,1.05vw,20px);font-weight:900;font-style:italic;letter-spacing:.35px;line-height:1}.ma-fuselage:before{content:\"\";position:absolute;left:13px;top:-13px;width:7px;height:16px;background:#67ddff;clip-path:polygon(0 100%,100% 0,100% 100%)}.ma-fuselage:after{content:\"\";position:absolute;left:48%;top:25px;width:42px;height:17px;background:linear-gradient(135deg,#fff 0 45%,#67ddff 46% 100%);clip-path:polygon(0 0,100% 65%,13% 100%)}.ma-mike{color:#fff}.ma-aircraft{color:#67ddff}.ma-nose{position:absolute;right:-7px;width:15px;height:12px;background:#fff;border-radius:0 100% 100% 0;clip-path:polygon(0 8%,100% 50%,0 92%)}</style>");

    html = html.replace('<div class="overlay">', '<div class="overlay"><div class="mikeaircraft-logo"><div class="ma-fuselage"><span class="ma-mike">MIKE</span><span class="ma-aircraft">AIRCRAFT</span><i class="ma-nose"></i></div></div>');

    return originalSend(html);
  };
  return baseHandler(req, res);
};
