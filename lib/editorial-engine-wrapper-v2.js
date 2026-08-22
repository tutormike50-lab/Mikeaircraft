const baseHandler = require("./editorial-engine-wrapper.js");

// MikeAircraft quiet-airport CURRENT promotion.
// When the sticky editorial selector has no CURRENT, promote a credible inbound
// or outbound candidate early enough for a one-aircraft broadcast to remain
// useful at quieter airports. The promoted aircraft is written into the same
// Redis editorial lock so subsequent refreshes remain sticky and consistent.
module.exports = async function handler(req, res) {
  const originalJson = res.json.bind(res);
  const airportCode = String(req.query?.airport || "PRG").toUpperCase();
  const redisURL = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;
  const lockKey = `mikeaircraft:v2:${airportCode}:editorial-current`;

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

  function candidateReady(ac) {
    if (!ac?.id) return false;
    const state = String(ac.state || "").toUpperCase();
    const lineage = String(ac.lineage || "").toUpperCase();
    const confidence = Number(ac.confidence || 0);
    const distance = Number(ac.distanceKm);

    if (lineage === "ARRIVAL") {
      if (!["APPROACHING", "ON_FINAL"].includes(state)) return false;
      if (confidence < 80) return false;
      if (Number.isFinite(distance) && distance > 15) return false;
      return true;
    }

    if (lineage === "DEPARTURE") {
      if (!["TAXIING_OUT", "LINING_UP", "TAKEOFF_ROLL", "AIRBORNE_DEPARTURE", "DEPARTING"].includes(state)) return false;
      if (confidence < 78) return false;
      if (state === "TAXIING_OUT" && Number.isFinite(distance) && distance > 3) return false;
      return true;
    }

    return false;
  }

  function readinessScore(ac) {
    const state = String(ac?.state || "").toUpperCase();
    const priority = {
      ON_FINAL: 1000,
      TAKEOFF_ROLL: 980,
      LINING_UP: 900,
      APPROACHING: 820,
      AIRBORNE_DEPARTURE: 800,
      DEPARTING: 760,
      TAXIING_OUT: 700
    }[state] || 0;
    const confidence = Number(ac?.confidence || 0);
    const distance = Number(ac?.distanceKm);
    const proximity = Number.isFinite(distance) ? Math.max(0, 50 - distance * 3) : 0;
    return priority + confidence + proximity;
  }

  function promotionConfidence(ac) {
    const score = Math.max(0, Math.min(100, Math.round(Number(ac?.confidence || 0))));
    const level = score >= 92 ? "HIGH" : score >= 80 ? "MEDIUM" : "LOW";
    return {
      level,
      score,
      ambiguous: true,
      scoreMargin: null,
      candidateCount: 1,
      storySafe: false
    };
  }

  res.json = async function quietAirportJson(payload) {
    if (!payload?.ok || !payload.intelligence || payload.intelligence.current) {
      return originalJson(payload);
    }

    const completedId = payload.intelligence.editorialLock?.completedAircraftId || null;
    const candidates = [payload.intelligence.nextIn, payload.intelligence.nextOut]
      .filter(Boolean)
      .filter(ac => ac.id !== completedId)
      .filter(candidateReady)
      .sort((a, b) => readinessScore(b) - readinessScore(a));

    const promoted = candidates[0] || null;
    if (!promoted) return originalJson(payload);

    const raw = Array.isArray(payload.aircraft)
      ? payload.aircraft.find(ac => ac.id === promoted.id) || null
      : null;

    if (!raw) return originalJson(payload);

    const now = Date.now();
    const lockValue = JSON.stringify({
      id: raw.id,
      since: now,
      reason: "QUIET_AIRPORT_PROMOTION",
      updatedAt: now,
      snapshot: raw
    });
    await redisCommand(["SET", lockKey, lockValue, "EX", "900"]);

    payload.intelligence.current = { ...promoted, score: null, stale: false };
    payload.intelligence.selectionConfidence = promotionConfidence(promoted);

    if (payload.intelligence.nextIn?.id === promoted.id) payload.intelligence.nextIn = null;
    if (payload.intelligence.nextOut?.id === promoted.id) payload.intelligence.nextOut = null;

    payload.intelligence.editorialLock = {
      ...(payload.intelligence.editorialLock || {}),
      active: true,
      aircraftId: promoted.id,
      reason: "QUIET_AIRPORT_PROMOTION",
      stale: false,
      nextAircraftDisplayed: false,
      quietAirportPromotionEnabled: true
    };

    return originalJson(payload);
  };

  return baseHandler(req, res);
};
