const baseHandler = require("./engine-base.js");

// MikeAircraft editorial CURRENT lock.
// Keeps the viewer with one aircraft through its useful movement sequence.
// A confirmed takeoff roll may pre-empt an arrival only when that arrival is
// not already on short final. NEXT_IN/NEXT_OUT remain internal data only.
module.exports = async function handler(req, res) {
  const originalJson = res.json.bind(res);
  const airportCode = String(req.query?.airport || "PRG").toUpperCase();
  const redisURL = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;
  const lockKey = `mikeaircraft:v2:${airportCode}:editorial-current`;
  const now = Date.now();

  async function redisCommand(command) {
    if (!redisURL || !redisToken) return null;
    try {
      const response = await fetch(redisURL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redisToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(command)
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data?.error ? null : data?.result;
    } catch {
      return null;
    }
  }

  async function loadLock() {
    const stored = await redisCommand(["GET", lockKey]);
    if (!stored) return null;
    try { return JSON.parse(stored); } catch { return null; }
  }

  async function saveLock(ac, reason) {
    if (!ac) {
      await redisCommand(["DEL", lockKey]);
      return;
    }
    const value = JSON.stringify({ id: ac.id, since: now, reason, updatedAt: now });
    await redisCommand(["SET", lockKey, value, "EX", "900"]);
  }

  function displayObject(ac) {
    if (!ac) return null;
    return {
      id: ac.id,
      hex: ac.hex,
      callsign: ac.callsign,
      registration: ac.registration,
      type: ac.type,
      state: ac.state,
      lineage: ac.lineage,
      confidence: ac.confidence,
      runway: ac.nearestRunway,
      runwayAlignment: Number.isFinite(ac.runwayAlignment) ? Number(ac.runwayAlignment.toFixed(1)) : null,
      distanceKm: Number.isFinite(ac.airportDistance) ? Number(ac.airportDistance.toFixed(2)) : null,
      thresholdKm: Number.isFinite(ac.thresholdDistance) ? Number(ac.thresholdDistance.toFixed(2)) : null,
      altitude: ac.altitude,
      speed: ac.speed,
      positionAge: ac.positionAge,
      stateAgeSeconds: ac.stateAgeSeconds,
      sampleCount: ac.sampleCount,
      score: null
    };
  }

  function arrivalComplete(ac) {
    if (!ac || ac.lineage !== "ARRIVAL" || ac.state !== "LANDED") return false;
    const slowEnough = Number.isFinite(ac.speed) && ac.speed <= 35;
    const settledLongEnough = Number(ac.stateAgeSeconds || 0) >= 35;
    return slowEnough || settledLongEnough;
  }

  function departureComplete(ac) {
    if (!ac || ac.lineage !== "DEPARTURE") return false;
    return ac.state === "DEPARTING" && Number(ac.airportDistance) > 4;
  }

  function sequenceComplete(ac) {
    return arrivalComplete(ac) || departureComplete(ac);
  }

  function takeoffCandidate(list, current) {
    return list
      .filter(ac => ac.id !== current?.id)
      .filter(ac => ac.lineage === "DEPARTURE")
      .filter(ac => ac.state === "TAKEOFF_ROLL")
      .filter(ac => Number(ac.confidence || 0) >= 85)
      .filter(ac => ac.positionAge == null || Number(ac.positionAge) <= 8)
      .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0] || null;
  }

  function canTakeoffInterrupt(current) {
    if (!current) return true;
    if (current.lineage !== "ARRIVAL") return false;
    if (current.state === "LANDED") return true;
    if (current.state === "ON_FINAL") return false;
    if (current.state === "APPROACHING") {
      return Number(current.thresholdDistance) > 3;
    }
    return true;
  }

  function confidenceFor(ac, originalConfidence, originalId) {
    if (!ac) return { level:"NONE", score:0, ambiguous:true, scoreMargin:null, candidateCount:0, storySafe:false };
    if (originalId === ac.id && originalConfidence) return originalConfidence;

    let score = Number(ac.confidence || 0);
    score += Math.min(8, Number(ac.sampleCount || 0));
    if (ac.registration && ac.hex) score += 5;
    if (ac.positionAge != null) score -= Math.min(15, Number(ac.positionAge) * 2);
    score = Math.max(0, Math.min(100, Math.round(score)));
    const identityStrong = Boolean(ac.registration && ac.hex);
    const fresh = ac.positionAge == null || Number(ac.positionAge) <= 5;
    const sampled = Number(ac.sampleCount || 0) >= 3;
    const level = score >= 93 && identityStrong && fresh && sampled ? "VERY_HIGH" : score >= 86 ? "HIGH" : score >= 76 ? "MEDIUM" : "LOW";
    return {
      level,
      score,
      ambiguous: level !== "VERY_HIGH",
      scoreMargin: null,
      candidateCount: 1,
      storySafe: Boolean(level === "VERY_HIGH" && identityStrong && fresh && sampled && ac.state !== "LANDED")
    };
  }

  res.json = async function editorialJson(payload) {
    if (!payload?.ok || !Array.isArray(payload.aircraft) || !payload.intelligence) {
      return originalJson(payload);
    }

    const aircraft = payload.aircraft;
    const originalCurrentId = payload.intelligence.current?.id || null;
    const originalConfidence = payload.intelligence.selectionConfidence || null;
    const lock = await loadLock();
    let current = lock?.id ? aircraft.find(ac => ac.id === lock.id) || null : null;
    let reason = lock?.reason || "STICKY_CURRENT";

    if (current && sequenceComplete(current)) {
      current = null;
      reason = "SEQUENCE_COMPLETE";
    }

    const takeoff = takeoffCandidate(aircraft, current);
    if (takeoff && canTakeoffInterrupt(current)) {
      current = takeoff;
      reason = "TAKEOFF_PREEMPTION";
    }

    if (!current && originalCurrentId) {
      current = aircraft.find(ac => ac.id === originalCurrentId) || null;
      reason = "NEW_CURRENT";
    }

    if (current) await saveLock(current, reason);
    else await saveLock(null);

    payload.intelligence.current = displayObject(current);
    payload.intelligence.selectionConfidence = confidenceFor(current, originalConfidence, originalCurrentId);
    payload.intelligence.editorialLock = {
      active: Boolean(current),
      aircraftId: current?.id || null,
      reason,
      nextAircraftDisplayed: false,
      takeoffPreemptionEnabled: true
    };

    return originalJson(payload);
  };

  return baseHandler(req, res);
};
