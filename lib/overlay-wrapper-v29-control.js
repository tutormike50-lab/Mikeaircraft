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

    // Strengthen the native canvas sweep-hit flare. The CSS fallback already
    // has a strong glow, but modern browsers use this single native radar.
    html = html
      .replace(
        "sweepGlow=Math.max(0,1-sweepDiff/.22);",
        "sweepGlow=Math.max(0,1-sweepDiff/.26);"
      )
      .replace(
        'if(sweepGlow>0){ctx.save();ctx.shadowColor=isCurrent?"rgba(255,202,87,.9)":"rgba(104,255,194,.9)";ctx.shadowBlur=10+18*sweepGlow;ctx.fillStyle=isCurrent?"rgba(255,202,87,"+(.05+.18*sweepGlow)+")":"rgba(104,255,194,"+(.04+.16*sweepGlow)+")";ctx.beginPath();ctx.arc(x,y,(isCurrent?7:4)+7*sweepGlow,0,Math.PI*2);ctx.fill();ctx.restore()}',
        'if(sweepGlow>0){ctx.save();ctx.shadowColor=isCurrent?"rgba(255,215,112,1)":"rgba(104,255,194,1)";ctx.shadowBlur=18+30*sweepGlow;ctx.fillStyle=isCurrent?"rgba(255,215,112,"+(.16+.40*sweepGlow)+")":"rgba(104,255,194,"+(.14+.42*sweepGlow)+")";ctx.beginPath();ctx.arc(x,y,(isCurrent?8:5)+11*sweepGlow,0,Math.PI*2);ctx.fill();ctx.lineWidth=1.5+1.5*sweepGlow;ctx.strokeStyle=isCurrent?"rgba(255,240,179,"+(.28+.62*sweepGlow)+")":"rgba(210,255,240,"+(.24+.66*sweepGlow)+")";ctx.beginPath();ctx.arc(x,y,(isCurrent?8:5)+6*sweepGlow,0,Math.PI*2);ctx.stroke();ctx.restore()}'
      )
      .replace(
        'ctx.fillStyle=isCurrent?"#ffca57":a.onGround?"#6dc6ff":"#68ffc2";ctx.beginPath();ctx.arc(x,y,isCurrent?6.2:3.4,0,Math.PI*2);ctx.fill();',
        'ctx.fillStyle=sweepGlow>.05?(isCurrent?"#fff3bd":a.onGround?"#d9f2ff":"#dcfff3"):(isCurrent?"#ffca57":a.onGround?"#6dc6ff":"#68ffc2");ctx.beginPath();ctx.arc(x,y,(isCurrent?6.2:3.4)+2.2*sweepGlow,0,Math.PI*2);ctx.fill();'
      );

    html = html.replace("</body>", `<script>
(function addMikeAircraftControlSync(){
  var supported={PRG:1,LHR:1,FRA:1,AMS:1,CDG:1,MAN:1,ATL:1};
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
      if(code!=="PRG")return false;
      return showMomentBeforeAirportControl(text,kind,key);
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
