module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const allowedAirports = ["PRG", "LHR", "FRA", "AMS", "CDG", "MAN"];
    const requestedAirport = String((req.query && req.query.airport) || "PRG").toUpperCase();
    const airport = allowedAirports.includes(requestedAirport) ? requestedAirport : "PRG";
    const redisURL = process.env.KV_REST_API_URL;
    const redisToken = process.env.KV_REST_API_TOKEN;

    if (!redisURL || !redisToken) {
      return res.status(500).json({ ok: false, error: "Redis environment variables unavailable" });
    }

    async function redisCommand(command) {
      const response = await fetch(redisURL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redisToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(command)
      });

      if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
      const result = await response.json();
      if (result.error) throw new Error(`Redis error: ${result.error}`);
      return result.result;
    }

    const auditKey = `mikeaircraft:audit:${airport}`;

    // =====================================================
    // BLACK BOX WRITE
    // =====================================================
    if (req.method === "POST") {
      const body = req.body || {};
      const engine = body.engine || {};
      const intelligence = engine.intelligence || {};
      const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 10) : [];

      const entry = {
        time: Date.now(),
        iso: new Date().toISOString(),
        airport,
        source: engine.traffic && engine.traffic.source,
        trackedCount: engine.traffic && engine.traffic.trackedCount,
        current: intelligence.current || null,
        nextIn: intelligence.nextIn || null,
        nextOut: intelligence.nextOut || null,
        selectionConfidence: intelligence.selectionConfidence || null,
        candidates,
        displayed: body.displayed || null
      };

      await redisCommand(["LPUSH", auditKey, JSON.stringify(entry)]);
      await redisCommand(["LTRIM", auditKey, "0", "1439"]);
      await redisCommand(["EXPIRE", auditKey, "86400"]);

      return res.status(200).json({ ok: true, airport, recorded: entry.iso });
    }

    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const mode = String((req.query && req.query.mode) || "").toLowerCase();

    // =====================================================
    // BLACK BOX DATA
    // =====================================================
    if (mode === "audit" || mode === "data") {
      const minutes = Math.max(1, Math.min(120, Number(req.query.minutes || 30)));
      const cutoff = Date.now() - minutes * 60000;
      const raw = await redisCommand(["LRANGE", auditKey, "0", "1439"]);
      const entries = (raw || [])
        .map(value => {
          try { return JSON.parse(value); } catch { return null; }
        })
        .filter(entry => entry && entry.time >= cutoff)
        .reverse();

      return res.status(200).json({ ok: true, airport, minutes, count: entries.length, entries });
    }

    // =====================================================
    // BLACK BOX RECORDER PAGE
    // =====================================================
    if (mode === "recorder") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MikeAircraft Black Box</title><style>body{margin:0;background:#07131f;color:#eaf7ff;font-family:Arial,sans-serif}.wrap{max-width:900px;margin:40px auto;padding:24px}.card{background:#0c2234;border:1px solid #24506d;border-radius:14px;padding:22px;margin-bottom:16px}h1{margin:0 0 8px;color:#70dcff}.live{color:#6cf0ad;font-weight:700}.muted{color:#8faabd}.row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.box{background:#081a28;padding:12px;border-radius:9px}.v{font-size:22px;font-weight:800;margin-top:5px}@media(max-width:700px){.row{grid-template-columns:1fr 1fr}}</style></head><body><div class="wrap"><div class="card"><h1>MikeAircraft Selection Black Box</h1><div class="live">● RECORDING ${airport}</div><p class="muted">Records selection and identity snapshots every 5 seconds without changing selector behaviour.</p></div><div class="card"><div class="row"><div class="box">CURRENT<div class="v" id="cur">---</div></div><div class="box">STATE<div class="v" id="state">---</div></div><div class="box">CONFIDENCE<div class="v" id="conf">---</div></div><div class="box">SAMPLES<div class="v" id="samples">0</div></div></div></div><div class="card muted" id="status">Starting recorder…</div></div><script>
const airport=${JSON.stringify(airport)};let n=0;
function scoreCandidate(a){const base={TAKEOFF_ROLL:1160,AIRBORNE_DEPARTURE:1110,ON_FINAL:1080,DEPARTING:930,APPROACHING:900,LINING_UP:850,LANDED:780};return base[a.state]||0}
async function tick(){try{const [er,br]=await Promise.all([fetch('/api/engine?airport='+encodeURIComponent(airport)+'&t='+Date.now(),{cache:'no-store'}),fetch('/api/broadcast?airport='+encodeURIComponent(airport)+'&t='+Date.now(),{cache:'no-store'})]);const e=await er.json(),b=await br.json();if(!e.ok)throw new Error(e.error||'engine failed');const candidates=(e.aircraft||[]).filter(a=>['TAKEOFF_ROLL','AIRBORNE_DEPARTURE','ON_FINAL','DEPARTING','APPROACHING','LINING_UP','LANDED'].includes(a.state)).map(a=>({id:a.id,hex:a.hex,callsign:a.callsign,registration:a.registration,type:a.type,state:a.state,lineage:a.lineage,confidence:a.confidence,distanceKm:a.airportDistance,thresholdKm:a.thresholdDistance,altitude:a.altitude,speed:a.speed,positionAge:a.positionAge,runway:a.nearestRunway,roughPriority:scoreCandidate(a)})).sort((a,b)=>b.roughPriority-a.roughPriority).slice(0,10);const c=b?.aircraft?.current;const displayed=c?.available?{backendCallsign:c.identity?.callsign||null,viewerFlight:c.identity?.flight||null,registration:c.identity?.registration||null,type:c.aircraft?.typeCode||null,operator:c.operator?.name||null,route:c.route?.display||null}:null;await fetch('/api/history?mode=record&airport='+encodeURIComponent(airport),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine:e,candidates,displayed})});n++;const cur=e.intelligence?.current;document.getElementById('cur').textContent=displayed?.viewerFlight||cur?.callsign||cur?.registration||'NONE';document.getElementById('state').textContent=cur?.state||'IDLE';document.getElementById('conf').textContent=e.intelligence?.selectionConfidence?.level||'---';document.getElementById('samples').textContent=n;document.getElementById('status').textContent='Last recorded '+new Date().toLocaleTimeString()+' • backend '+(displayed?.backendCallsign||'---')+' • frontend '+(displayed?.viewerFlight||'---')+' • '+(displayed?.registration||'no registration');}catch(err){document.getElementById('status').textContent='Recorder error: '+err.message}}
tick();setInterval(tick,5000);
</script></body></html>`);
    }

    // =====================================================
    // EXISTING MOVEMENT HISTORY
    // =====================================================
    const stateKey = `mikeaircraft:v2:${airport}:state`;
    const stored = await redisCommand(["GET", stateKey]);

    if (!stored) {
      return res.status(200).json({
        ok: true,
        airport,
        historyFound: false,
        trackedAircraft: 0,
        tracks: []
      });
    }

    const savedState = JSON.parse(stored);
    const storedTracks = savedState.tracks && typeof savedState.tracks === "object" ? savedState.tracks : {};

    const tracks = Object.entries(storedTracks)
      .map(([id, track]) => {
        const samples = Array.isArray(track.samples) ? track.samples : [];
        const latest = samples.length ? samples[samples.length - 1] : null;
        const oldest = samples.length ? samples[0] : null;
        return {
          id,
          state: track.state || "UNKNOWN",
          confidence: track.confidence ?? null,
          reason: track.reason || null,
          stateSince: track.stateSince || null,
          lastSeen: track.lastSeen || null,
          sampleCount: samples.length,
          historySeconds: oldest && latest ? Math.round((latest.time - oldest.time) / 1000) : 0,
          latest,
          samples
        };
      })
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

    return res.status(200).json({
      ok: true,
      engine: "MikeAircraft Engine v2",
      diagnostic: "Movement History",
      airport,
      historyFound: true,
      updatedAt: savedState.updatedAt || null,
      trackedAircraft: tracks.length,
      tracks
    });
  } catch (error) {
    console.error("MikeAircraft history error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
