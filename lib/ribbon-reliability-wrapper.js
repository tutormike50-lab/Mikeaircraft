const baseHandler = require("./pi-source-wrapper.js");
const { createRedisClient } = require("./services/redis.js");

const PRG_RUNWAYS = {
  "06": { name:"06", heading:65, lat:50.1017990, lon:14.2263002 },
  "24": { name:"24", heading:245, lat:50.1160011, lon:14.2734003 },
  "12": { name:"12", heading:127, lat:50.1080017, lon:14.2454004 },
  "30": { name:"30", heading:307, lat:50.0904999, lon:14.2817001 }
};

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function headingDiff(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 180;
  return Math.abs(((a - b + 540) % 360) - 180);
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function runwayFor(ac) {
  return PRG_RUNWAYS[String(ac?.nearestRunway || ac?.runway || "").trim()] || null;
}

function deriveGeometricMovement(ac) {
  if (!ac || ac.onGround) return null;
  const state = String(ac.state || "").toUpperCase();
  const lineage = String(ac.lineage || "").toUpperCase();
  if (state !== "AIRBORNE" && lineage !== "UNKNOWN" && lineage) return null;

  const lat = finite(ac.lat);
  const lon = finite(ac.lon);
  const altitude = finite(ac.altitude);
  const speed = finite(ac.speed);
  const track = finite(ac.track);
  const verticalRate = finite(ac.verticalRate);
  const positionAge = finite(ac.positionAge);
  const airportDistance = finite(ac.airportDistance ?? ac.distanceKm);
  const thresholdDistance = finite(ac.thresholdDistance ?? ac.thresholdKm);
  const runwayAlignment = finite(ac.runwayAlignment);
  const runway = runwayFor(ac);

  if ([lat, lon, altitude, speed, track, airportDistance, thresholdDistance, runwayAlignment].some(v => v === null)) return null;
  if (!runway) return null;
  if (positionAge !== null && positionAge > 8) return null;

  const toThreshold = bearingDeg(lat, lon, runway.lat, runway.lon);
  const inboundError = headingDiff(track, toThreshold);
  const fromThreshold = bearingDeg(runway.lat, runway.lon, lat, lon);
  const outboundError = headingDiff(track, fromThreshold);
  const vr = verticalRate === null ? 0 : verticalRate;

  // Strong geometric arrival: low commercial transport, fresh position,
  // aligned with the runway and actually flying toward its threshold.
  const arrival =
    thresholdDistance <= 25 &&
    airportDistance <= 26 &&
    altitude >= 400 && altitude <= 7000 &&
    speed >= 105 && speed <= 300 &&
    runwayAlignment <= 28 &&
    inboundError <= 28 &&
    vr <= 600;

  if (arrival) {
    const final =
      thresholdDistance <= 9 &&
      altitude <= 3500 &&
      speed <= 225 &&
      runwayAlignment <= 15 &&
      inboundError <= 15 &&
      vr <= 300;

    return {
      state: final ? "ON_FINAL" : "APPROACHING",
      lineage: "ARRIVAL",
      confidence: final ? 96 : 90,
      reason: final
        ? "Geometric final fallback: low, aligned and tracking directly to runway threshold"
        : "Geometric approach fallback: low, aligned and tracking toward runway threshold",
      geometry: { inboundError:Number(inboundError.toFixed(1)), outboundError:Number(outboundError.toFixed(1)) }
    };
  }

  // Strong geometric departure: low, climbing traffic aligned with a runway
  // and moving away from the runway threshold in the runway direction.
  const departure =
    airportDistance <= 12 &&
    altitude >= 300 && altitude <= 7000 &&
    speed >= 105 && speed <= 320 &&
    runwayAlignment <= 28 &&
    outboundError <= 30 &&
    vr >= 250;

  if (departure) {
    return {
      state: airportDistance <= 5 ? "AIRBORNE_DEPARTURE" : "DEPARTING",
      lineage: "DEPARTURE",
      confidence: airportDistance <= 5 ? 96 : 90,
      reason: "Geometric departure fallback: aligned, climbing and moving away from runway",
      geometry: { inboundError:Number(inboundError.toFixed(1)), outboundError:Number(outboundError.toFixed(1)) }
    };
  }

  return null;
}

function displayObject(ac, score = null) {
  if (!ac) return null;
  const distance = finite(ac.airportDistance ?? ac.distanceKm);
  const threshold = finite(ac.thresholdDistance ?? ac.thresholdKm);
  return {
    id: ac.id,
    hex: ac.hex,
    callsign: ac.callsign,
    registration: ac.registration,
    type: ac.type,
    state: ac.state,
    lineage: ac.lineage,
    confidence: ac.confidence,
    runway: ac.nearestRunway || ac.runway || null,
    runwayAlignment: finite(ac.runwayAlignment),
    distanceKm: distance === null ? null : Number(distance.toFixed(2)),
    thresholdKm: threshold === null ? null : Number(threshold.toFixed(2)),
    altitude: ac.altitude,
    speed: ac.speed,
    positionAge: ac.positionAge,
    stateAgeSeconds: ac.stateAgeSeconds,
    sampleCount: ac.sampleCount,
    score,
    stale: false
  };
}

function arrivalCandidates(aircraft, excludeId, completedId) {
  return aircraft
    .filter(ac => ac.id && ac.id !== excludeId && ac.id !== completedId)
    .filter(ac => ac.lineage === "ARRIVAL")
    .filter(ac => ["ON_FINAL", "APPROACHING"].includes(ac.state))
    .filter(ac => Number(ac.confidence || 0) >= 80)
    .filter(ac => ac.positionAge == null || Number(ac.positionAge) <= 10)
    .sort((a, b) => {
      const pa = a.state === "ON_FINAL" ? 0 : 1;
      const pb = b.state === "ON_FINAL" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return Number(a.thresholdDistance ?? 999) - Number(b.thresholdDistance ?? 999);
    });
}

function departureCandidates(aircraft, excludeId, completedId) {
  const statePriority = {
    TAKEOFF_ROLL: 0,
    AIRBORNE_DEPARTURE: 1,
    LINING_UP: 2,
    DEPARTING: 3,
    TAXIING_OUT: 4
  };
  return aircraft
    .filter(ac => ac.id && ac.id !== excludeId && ac.id !== completedId)
    .filter(ac => ac.lineage === "DEPARTURE")
    .filter(ac => statePriority[ac.state] !== undefined)
    .filter(ac => Number(ac.confidence || 0) >= 74)
    .filter(ac => ac.positionAge == null || Number(ac.positionAge) <= 10)
    .filter(ac => !(ac.state === "DEPARTING" && Number(ac.airportDistance) > 6))
    .sort((a, b) => {
      const pa = statePriority[a.state];
      const pb = statePriority[b.state];
      if (pa !== pb) return pa - pb;
      return Number(a.thresholdDistance ?? a.airportDistance ?? 999) - Number(b.thresholdDistance ?? b.airportDistance ?? 999);
    });
}

function currentScore(ac) {
  const base = {
    ON_FINAL: 1250,
    TAKEOFF_ROLL: 1200,
    AIRBORNE_DEPARTURE: 1130,
    APPROACHING: 1030,
    LINING_UP: 940,
    DEPARTING: 880,
    TAXIING_OUT: 720
  }[String(ac?.state || "").toUpperCase()] || 0;
  if (!base) return -Infinity;
  const threshold = finite(ac.thresholdDistance ?? ac.thresholdKm);
  const distance = finite(ac.airportDistance ?? ac.distanceKm);
  const proximity = Math.max(0, 120 - (threshold ?? distance ?? 20) * 6);
  return base + proximity + Number(ac.confidence || 0);
}

async function saveEditorialLock(ac, reason) {
  if (!ac?.id) return false;
  const redis = createRedisClient();
  if (!redis.available) return false;
  const now = Date.now();
  try {
    const result = await redis.command([
      "SET",
      "mikeaircraft:v2:PRG:editorial-current",
      JSON.stringify({ id:ac.id, since:now, reason, updatedAt:now, snapshot:ac }),
      "EX",
      "900"
    ]);
    return result === "OK";
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  const airport = String(req.query?.airport || "PRG").trim().toUpperCase();
  if (airport !== "PRG") return baseHandler(req, res);

  const originalJson = res.json.bind(res);
  res.json = async function ribbonReliabilityJson(payload) {
    if (!payload?.ok || !payload.intelligence || !Array.isArray(payload.aircraft)) {
      return originalJson(payload);
    }

    let promotions = 0;
    const enhanced = payload.aircraft.map(ac => {
      const derived = deriveGeometricMovement(ac);
      if (!derived) return ac;
      promotions += 1;
      return {
        ...ac,
        state: derived.state,
        lineage: derived.lineage,
        confidence: Math.max(Number(ac.confidence || 0), derived.confidence),
        reason: derived.reason,
        ribbonGeometry: derived.geometry
      };
    });
    payload.aircraft = enhanced;

    const completedId = payload.intelligence.editorialLock?.completedAircraftId || null;
    let current = payload.intelligence.current || null;

    // If an editorial lock already exists for an aircraft that the history
    // classifier still calls AIRBORNE, upgrade the displayed state from the
    // same strong geometry rather than dropping the committed target.
    if (current?.id) {
      const live = enhanced.find(ac => ac.id === current.id) || null;
      if (live && ["APPROACHING","ON_FINAL","TAKEOFF_ROLL","AIRBORNE_DEPARTURE","DEPARTING","LINING_UP","TAXIING_OUT","LANDED"].includes(live.state)) {
        current = displayObject(live, current.score ?? null);
        payload.intelligence.current = current;
      }
    }

    let nextInList = arrivalCandidates(enhanced, current?.id || null, completedId);
    let nextOutList = departureCandidates(enhanced, current?.id || null, completedId);

    if (!current) {
      const pool = [...nextInList, ...nextOutList]
        .sort((a, b) => currentScore(b) - currentScore(a));
      const promoted = pool[0] || null;
      if (promoted) {
        current = displayObject(promoted, Math.round(currentScore(promoted)));
        payload.intelligence.current = current;
        const lockSaved = await saveEditorialLock(promoted, "RIBBON_GEOMETRY_PROMOTION");
        payload.intelligence.selectionConfidence = {
          level: Number(promoted.confidence || 0) >= 94 ? "HIGH" : "MEDIUM",
          score: Math.max(82, Math.min(98, Math.round(Number(promoted.confidence || 0)))),
          ambiguous: false,
          scoreMargin: null,
          candidateCount: pool.length,
          storySafe: false
        };
        payload.intelligence.editorialLock = {
          ...(payload.intelligence.editorialLock || {}),
          active: true,
          aircraftId: promoted.id,
          reason: "RIBBON_GEOMETRY_PROMOTION",
          stale: false,
          lockSaved
        };
        nextInList = arrivalCandidates(enhanced, promoted.id, completedId);
        nextOutList = departureCandidates(enhanced, promoted.id, completedId);
      }
    }

    // Always rebuild NEXT from the enhanced list. Existing good candidates are
    // preserved, while obvious geometry fallbacks can no longer vanish simply
    // because the historical state machine has not caught up yet.
    payload.intelligence.nextIn = nextInList[0] ? displayObject(nextInList[0]) : null;
    payload.intelligence.nextOut = nextOutList[0] ? displayObject(nextOutList[0]) : null;

    const stateCounts = {};
    for (const ac of enhanced) stateCounts[ac.state] = (stateCounts[ac.state] || 0) + 1;
    payload.intelligence.stateCounts = stateCounts;
    payload.intelligence.ribbonReliability = {
      enabled: true,
      geometricPromotions: promotions,
      currentId: payload.intelligence.current?.id || null,
      nextInId: payload.intelligence.nextIn?.id || null,
      nextOutId: payload.intelligence.nextOut?.id || null
    };
    payload.version = "0.7.7";

    return originalJson(payload);
  };

  return baseHandler(req, res);
};
