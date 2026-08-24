const baseHandler = require("./overlay-wrapper-v28.js");

// MikeAircraft controlled-airport overlay preview.
// This wrapper is intentionally used only by /api/overlay-control-test.
// The stable /api/overlay entrypoint remains on v2.8.

const SETTINGS_KEY = "mikeaircraft:control:settings";
const SUPPORTED_AIRPORTS = new Set([
  "PRG",
  "LHR",
  "FRA",
  "AMS",
  "CDG",
  "MAN",
  "ATL"
]);

function redisCredentials() {
  return {
    url:
      process.env.KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ||
      null,
    token:
      process.env.KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ||
      null
  };
}

async function savedAirport() {
  const credentials = redisCredentials();

  if (!credentials.url || !credentials.token) {
    return null;
  }

  try {
    const response = await fetch(credentials.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(["GET", SETTINGS_KEY])
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const stored = payload ? payload.result : null;

    if (!stored) {
      return null;
    }

    const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
    const airport = String(parsed?.airport || "").trim().toUpperCase();

    return SUPPORTED_AIRPORTS.has(airport) ? airport : null;
  }
  catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const selectedAirport = await savedAirport();

  if (selectedAirport) {
    req.query = {
      ...(req.query || {}),
      airport: selectedAirport
    };
  }

  const originalSend = res.send.bind(res);

  res.send = function controlledAirportSend(body) {
    if (typeof body !== "string") {
      return originalSend(body);
    }

    let html = body.replaceAll(
      "Overlay v2.8",
      "Overlay v2.9 Control Preview"
    );

    html = html.replace("</body>", `<script>
(function addMikeAircraftControlSync(){
  var supported={PRG:1,LHR:1,FRA:1,AMS:1,CDG:1,MAN:1,ATL:1};
  var airportCopy={
    PRG:{arrival:"AHOJ! WELCOME TO PRAGUE 🇨🇿",departure:"ŠŤASTNOU CESTU! HAVE A GOOD FLIGHT ✈️"},
    LHR:{arrival:"WELCOME TO LONDON 🇬🇧",departure:"HAVE A GOOD FLIGHT! ✈️"},
    FRA:{arrival:"WILLKOMMEN IN FRANKFURT 🇩🇪",departure:"GUTEN FLUG! ✈️"},
    AMS:{arrival:"WELKOM IN AMSTERDAM 🇳🇱",departure:"HAVE A GOOD FLIGHT! ✈️"},
    CDG:{arrival:"BIENVENUE À PARIS 🇫🇷",departure:"BON VOYAGE! ✈️"},
    MAN:{arrival:"WELCOME TO MANCHESTER 🇬🇧",departure:"HAVE A GOOD FLIGHT! ✈️"},
    ATL:{arrival:"WELCOME TO ATLANTA 🇺🇸",departure:"HAVE A GOOD FLIGHT! ✈️"}
  };
  var requestBusy=false;

  function pageAirport(){
    var value=(new URLSearchParams(window.location.search).get("airport")||"PRG").trim().toUpperCase();
    return supported[value]?value:"PRG";
  }

  function showAirportBadge(code){
    var badge=document.querySelector(".prg-tower-badge");
    var label=document.querySelector(".prg-tower-code");
    if(label)label.textContent=code;
    if(badge)badge.setAttribute("aria-label",code+" airport");
  }

  function moveToAirport(code){
    if(!supported[code]||code===pageAirport())return;
    var url=new URL(window.location.href);
    url.searchParams.set("airport",code);
    url.searchParams.set("control",Date.now().toString());
    window.location.replace(url.toString());
  }

  async function syncAirport(){
    if(requestBusy)return;
    requestBusy=true;
    try{
      var response=await fetch("/api/settings?t="+Date.now(),{cache:"no-store"});
      var data=await response.json();
      var code=String(data&&data.settings&&data.settings.airport||"").trim().toUpperCase();
      if(response.ok&&data.ok&&supported[code]){
        showAirportBadge(code);
        moveToAirport(code);
      }
    }catch(error){}
    finally{requestBusy=false}
  }

  if(typeof maShowMoment==="function"){
    var showMomentBeforeAirportControl=maShowMoment;
    maShowMoment=function(text,kind,key){
      var code=pageAirport();
      var copy=airportCopy[code]||airportCopy.PRG;
      var controlledText=kind==="arrival"?copy.arrival:kind==="departure"?copy.departure:text;
      var shown=showMomentBeforeAirportControl(controlledText,kind,key);
      if(code!=="PRG"){
        var ribbon=document.querySelector(".main-ribbon");
        if(ribbon){
          ribbon.classList.remove("arrival-panorama");
          ribbon.classList.remove("departure-panorama");
        }
      }
      return shown;
    };
  }

  showAirportBadge(pageAirport());
  syncAirport();
  window.setInterval(syncAirport,5000);
})();
</script></body>`);

    return originalSend(html);
  };

  return baseHandler(req, res);
};
