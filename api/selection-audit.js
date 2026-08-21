// MikeAircraft Selection Black Box
// Records engine selection snapshots for later analysis without changing selector behaviour.

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const airport = String((req.query && req.query.airport) || "LHR").trim().toUpperCase();
  const redisURL = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;

  async function redis(command) {
    if (!redisURL || !redisToken) throw new Error("Redis unavailable");
    const r = await fetch(redisURL, {
      method: "POST",
      headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(command)
    });
    if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  }

  const key = `mikeaircraft:audit:${airport}`;

  if (req.method === "POST") {
    try {
      const b = req.body || {};
      const e = b.engine || {};
      const i = e.intelligence || {};
      const current = i.current || null;
      const nextIn = i.nextIn || null;
      const nextOut = i.nextOut || null;
      const candidates = Array.isArray(b.candidates) ? b.candidates.slice(0, 8) : [];
      const entry = {
        time: Date.now(),
        iso: new Date().toISOString(),
        source: e.traffic && e.traffic.source,
        trackedCount: e.traffic && e.traffic.trackedCount,
        current,
        nextIn,
        nextOut,
        selectionConfidence: i.selectionConfidence || null,
        candidates,
        displayed: b.displayed || null
      };
      await redis(["LPUSH", key, JSON.stringify(entry)]);
      await redis(["LTRIM", key, "0", "719"]); // about one hour at 5-second polling
      await redis(["EXPIRE", key, "86400"]);
      return res.status(200).json({ ok: true, airport, recorded: entry.iso });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  }

  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  if (String(req.query.mode || "").toLowerCase() === "data") {
    try {
      const minutes = Math.max(1, Math.min(120, Number(req.query.minutes || 30)));
      const cutoff = Date.now() - minutes * 60000;
      const raw = await redis(["LRANGE", key, "0", "719"]);
      const entries = (raw || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(x => x && x.time >= cutoff).reverse();
      return res.status(200).json({ ok: true, airport, minutes, count: entries.length, entries });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MikeAircraft Black Box</title><style>body{margin:0;background:#07131f;color:#eaf7ff;font-family:Arial,sans-serif}.wrap{max-width:900px;margin:40px auto;padding:24px}.card{background:#0c2234;border:1px solid #24506d;border-radius:14px;padding:22px;margin-bottom:16px}h1{margin:0 0 8px;color:#70dcff}.live{color:#6cf0ad;font-weight:700}.muted{color:#8faabd}.row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.box{background:#081a28;padding:12px;border-radius:9px}.v{font-size:22px;font-weight:800;margin-top:5px}@media(max-width:700px){.row{grid-template-columns:1fr 1fr}}</style></head><body><div class="wrap"><div class="card"><h1>MikeAircraft Selection Black Box</h1><div class="live">● RECORDING ${airport}</div><p class="muted">Keep this page open while testing. It records a decision snapshot every 5 seconds for later selection and identity analysis.</p></div><div class="card"><div class="row"><div class="box">CURRENT<div class="v" id="cur">---</div></div><div class="box">STATE<div class="v" id="state">---</div></div><div class="box">CONFIDENCE<div class="v" id="conf">---</div></div><div class="box">SAMPLES<div class="v" id="samples">0</div></div></div></div><div class="card muted" id="status">Starting recorder…</div></div><script>
const airport=${JSON.stringify(airport)};let n=0;
function key(a){return a?.id||a?.hex||a?.registration||a?.callsign||null}
async function tick(){try{const [er,br]=await Promise.all([fetch('/api/engine?airport='+encodeURIComponent(airport)+'&t='+Date.now(),{cache:'no-store'}),fetch('/api/broadcast?airport='+encodeURIComponent(airport)+'&t='+Date.now(),{cache:'no-store'})]);const e=await er.json(),b=await br.json();if(!e.ok)throw new Error(e.error||'engine failed');const scored=(e.aircraft||[]).filter(a=>['TAKEOFF_ROLL','AIRBORNE_DEPARTURE','ON_FINAL','DEPARTING','APPROACHING','LINING_UP','LANDED'].includes(a.state)).map(a=>({id:a.id,hex:a.hex,callsign:a.callsign,registration:a.registration,type:a.type,state:a.state,lineage:a.lineage,confidence:a.confidence,distanceKm:a.airportDistance,thresholdKm:a.thresholdDistance,altitude:a.altitude,speed:a.speed,positionAge:a.positionAge,runway:a.nearestRunway})).slice(0,8);const displayed=b?.aircraft?.current?{callsign:b.aircraft.current.identity?.callsign,flight:b.aircraft.current.identity?.flight,registration:b.aircraft.current.identity?.registration,type:b.aircraft.current.aircraft?.typeCode}:null;await fetch('/api/selection-audit?airport='+encodeURIComponent(airport),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine:e,candidates:scored,displayed})});n++;const c=e.intelligence?.current;document.getElementById('cur').textContent=c?.callsign||c?.registration||'NONE';document.getElementById('state').textContent=c?.state||'IDLE';document.getElementById('conf').textContent=e.intelligence?.selectionConfidence?.level||'---';document.getElementById('samples').textContent=n;document.getElementById('status').textContent='Last recorded '+new Date().toLocaleTimeString()+' • flight '+(displayed?.flight||'---')+' • '+(c?.registration||'no registration');}catch(err){document.getElementById('status').textContent='Recorder error: '+err.message}}
tick();setInterval(tick,5000);
</script></body></html>`);
};
