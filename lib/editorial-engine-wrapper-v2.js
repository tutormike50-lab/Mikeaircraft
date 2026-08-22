const baseHandler = require("./editorial-engine-wrapper.js");

// MikeAircraft quiet-airport CURRENT promotion + viewer traffic filter.
// Small private aircraft and business jets are removed before they can become
// viewer-facing CURRENT/NEXT or appear on the radar. This keeps the broadcast
// focused on airline/commercial traffic and avoids ambiguous GA movements.
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

  const PRIVATE_TYPES = new Set([
    // Learjet
    "LJ23","LJ24","LJ25","LJ28","LJ31","LJ35","LJ36","LJ40","LJ45","LJ55","LJ60","LJ70","LJ75",
    // Cessna Citation
    "C500","C501","C510","C525","C526","C550","C551","C560","C56X","C650","C680","C68A","C700","C750",
    // Gulfstream / Galaxy
    "GLF2","GLF3","GLF4","GLF5","GLF6","G150","G200","G280","GLEX","GL5T","GL6T","GALX",
    // Dassault Falcon
    "FA10","FA20","FA50","F2TH","F900","F7X","F8X",
    // Bombardier Challenger / Global
    "CL30","CL35","CL60","BD10","BD70","BD90","GLEX","GL5T","GL6T",
    // Hawker / Beechjet / Premier
    "H25A","H25B","H25C","BE40","PRM1",
    // Embraer executive jets
    "E50P","E55P","E35L","E45X","E545","E550",
    // Other light/private jets
    "PC24","HDJT","SF50","EA50",
    // Common light/private GA that can confuse airport movement logic
    "C150","C152","C172","C177","C182","C206","C210","PA24","PA28","PA32","PA34","PA46",
    "SR20","SR22","DA40","DA42","DA62","BE33","BE35","BE36","BE55","BE58","M20P","M20T",
    "TBM7","TBM8","TBM9","PC12","BE20","BE30","B350"
  ]);

  function clean(v) { return String(v || "").trim().toUpperCase(); }

  function isPrivateOrBusiness(ac) {
    if (!ac) return false;
    const type = clean(ac.type || ac.typeCode || ac.aircraft?.typeCode || ac.t);
    if (PRIVATE_TYPES.has(type)) return true;

    // Cover ICAO family variants without accidentally catching airliners.
    if (/^LJ\d{2}$/.test(type)) return true;
    if (/^GLF[2-6]$/.test(type)) return true;
    if (/^FA(10|20|50)$/.test(type)) return true;
    return false;
  }

  function candidateReady(ac) {
    if (!ac?.id || isPrivateOrBusiness(ac)) return false;
    const state = String(ac.state || "").toUpperCase();
    const lineage = String(ac.lineage || "").toUpperCase();
    const confidence = Number(ac.confidence || 0);
    const distance = Number(ac.airportDistance ?? ac.distanceKm);

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
    const distance = Number(ac?.airportDistance ?? ac?.distanceKm);
    const proximity = Number.isFinite(distance) ? Math.max(0, 50 - distance * 3) : 0;
    return priority + confidence + proximity;
  }

  function toDisplay(ac) {
    if (!ac) return null;
    const distance = Number(ac.airportDistance ?? ac.distanceKm);
    const threshold = Number(ac.thresholdDistance ?? ac.thresholdKm);
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
      runwayAlignment: Number.isFinite(ac.runwayAlignment) ? Number(ac.runwayAlignment.toFixed(1)) : null,
      distanceKm: Number.isFinite(distance) ? Number(distance.toFixed(2)) : null,
      thresholdKm: Number.isFinite(threshold) ? Number(threshold.toFixed(2)) : null,
      altitude: ac.altitude,
      speed: ac.speed,
      positionAge: ac.positionAge,
      stateAgeSeconds: ac.stateAgeSeconds,
      sampleCount: ac.sampleCount,
      score: null,
      stale: false
    };
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
    if (!payload?.ok || !payload.intelligence) return originalJson(payload);

    const originalAircraft = Array.isArray(payload.aircraft) ? payload.aircraft : [];
    const filteredAircraft = originalAircraft.filter(ac => !isPrivateOrBusiness(ac));
    const removedCount = originalAircraft.length - filteredAircraft.length;
    payload.aircraft = filteredAircraft;

    if (payload.traffic) {
      payload.traffic.privateAircraftFiltered = removedCount;
      payload.traffic.trackedCount = filteredAircraft.length;
    }

    const currentWasPrivate = isPrivateOrBusiness(payload.intelligence.current);
    if (currentWasPrivate) {
      payload.intelligence.current = null;
      payload.intelligence.selectionConfidence = {
        level: "NONE", score: 0, ambiguous: true, scoreMargin: null, candidateCount: 0, storySafe: false
      };
      await redisCommand(["DEL", lockKey]);
    }

    if (isPrivateOrBusiness(payload.intelligence.nextIn)) payload.intelligence.nextIn = null;
    if (isPrivateOrBusiness(payload.intelligence.nextOut)) payload.intelligence.nextOut = null;

    if (payload.intelligence.current) return originalJson(payload);

    const completedId = payload.intelligence.editorialLock?.completedAircraftId || null;
    const promotedRaw = filteredAircraft
      .filter(ac => ac.id !== completedId)
      .filter(candidateReady)
      .sort((a, b) => readinessScore(b) - readinessScore(a))[0] || null;

    if (!promotedRaw) {
      payload.intelligence.editorialLock = {
        ...(payload.intelligence.editorialLock || {}),
        active: false,
        aircraftId: null,
        reason: currentWasPrivate ? "PRIVATE_AIRCRAFT_FILTERED" : (payload.intelligence.editorialLock?.reason || "NO_CURRENT"),
        privateAircraftFilterEnabled: true,
        privateAircraftFilteredCount: removedCount,
        nextAircraftDisplayed: false
      };
      return originalJson(payload);
    }

    const promoted = toDisplay(promotedRaw);
    const now = Date.now();
    const lockValue = JSON.stringify({
      id: promotedRaw.id,
      since: now,
      reason: "QUIET_AIRPORT_PROMOTION",
      updatedAt: now,
      snapshot: promotedRaw
    });
    await redisCommand(["SET", lockKey, lockValue, "EX", "900"]);

    payload.intelligence.current = promoted;
    payload.intelligence.selectionConfidence = promotionConfidence(promotedRaw);

    if (payload.intelligence.nextIn?.id === promotedRaw.id) payload.intelligence.nextIn = null;
    if (payload.intelligence.nextOut?.id === promotedRaw.id) payload.intelligence.nextOut = null;

    payload.intelligence.editorialLock = {
      ...(payload.intelligence.editorialLock || {}),
      active: true,
      aircraftId: promotedRaw.id,
      reason: "QUIET_AIRPORT_PROMOTION",
      stale: false,
      nextAircraftDisplayed: false,
      quietAirportPromotionEnabled: true,
      privateAircraftFilterEnabled: true,
      privateAircraftFilteredCount: removedCount
    };

    return originalJson(payload);
  };

  return baseHandler(req, res);
};
