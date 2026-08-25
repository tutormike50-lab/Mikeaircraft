function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function distanceKm(aircraft) {
  return finiteNumber(aircraft?.airportDistance ?? aircraft?.distanceKm);
}

function thresholdKm(aircraft) {
  return finiteNumber(aircraft?.thresholdDistance ?? aircraft?.thresholdKm);
}

function runwayKm(aircraft) {
  return finiteNumber(aircraft?.runwayDistance ?? aircraft?.runwayKm);
}

function isConfirmedTakeoff(aircraft) {
  if (!aircraft?.id || String(aircraft.lineage || "").toUpperCase() !== "DEPARTURE") return false;

  const state = String(aircraft.state || "").toUpperCase();
  if (!["TAKEOFF_ROLL", "AIRBORNE_DEPARTURE", "DEPARTING"].includes(state)) return false;

  const confidence = finiteNumber(aircraft.confidence) || 0;
  const distance = distanceKm(aircraft);
  const positionAge = finiteNumber(aircraft.positionAge);
  const stateAge = finiteNumber(aircraft.stateAgeSeconds);
  const speed = finiteNumber(aircraft.speed) || 0;

  if (confidence < 90) return false;
  if (distance !== null && distance > 2.5) return false;
  if (positionAge !== null && positionAge > 8) return false;
  if (stateAge !== null && stateAge > 55) return false;

  if (state === "TAKEOFF_ROLL") return speed >= 45;

  const altitude = finiteNumber(aircraft.altitude);
  const verticalRate = finiteNumber(aircraft.verticalRate);
  return aircraft.onGround === false &&
    altitude !== null && altitude >= 100 && altitude <= 3500 &&
    speed >= 80 && verticalRate !== null && verticalRate >= 300;
}

function arrivalCanYield(current) {
  if (!current) return true;
  if (String(current.lineage || "").toUpperCase() !== "ARRIVAL") return false;

  const state = String(current.state || "").toUpperCase();
  if (state === "LANDED") return true;
  if (["APPROACHING", "ON_FINAL"].includes(state)) {
    const threshold = thresholdKm(current);
    return threshold !== null && threshold > 3;
  }
  return true;
}

function takeoffPriority(aircraft) {
  const state = String(aircraft?.state || "").toUpperCase();
  const stateScore = { TAKEOFF_ROLL: 300, AIRBORNE_DEPARTURE: 250, DEPARTING: 200 }[state] || 0;
  const distance = distanceKm(aircraft);
  return stateScore + (finiteNumber(aircraft?.confidence) || 0) + (distance === null ? 0 : Math.max(0, 50 - distance * 10));
}

function priorityCandidateScore(aircraft, mode) {
  const state = String(aircraft?.state || "").toUpperCase();
  const confidence = finiteNumber(aircraft?.confidence) || 0;
  const distance = distanceKm(aircraft);
  const proximity = distance === null ? 0 : Math.max(0, 80 - distance * 8);
  const stateScore = mode === "RUNWAY"
    ? ({ TAKEOFF_ROLL: 650, LINING_UP: 580, TAXIING_OUT: 300 }[state] || 0)
    : mode === "TAKEOFF"
    ? ({ TAKEOFF_ROLL: 500, AIRBORNE_DEPARTURE: 460, DEPARTING: 420, LINING_UP: 350 }[state] || 0)
    : ({ ON_FINAL: 500, APPROACHING: 420 }[state] || 0);
  const runwayDistance = runwayKm(aircraft);
  const runwayScore = mode === "RUNWAY" && runwayDistance !== null
    ? Math.max(0, 240 - runwayDistance * 800)
    : 0;
  const alignment = finiteNumber(aircraft?.runwayAlignment);
  const alignmentScore = mode === "RUNWAY" && alignment !== null
    ? Math.max(0, 140 - alignment * 5)
    : 0;
  return stateScore + confidence + proximity + runwayScore + alignmentScore;
}

function isManualPriorityCandidate(aircraft, mode) {
  if (!aircraft?.id) return false;

  const lineage = String(aircraft.lineage || "").toUpperCase();
  const state = String(aircraft.state || "").toUpperCase();
  const confidence = finiteNumber(aircraft.confidence) || 0;
  const positionAge = finiteNumber(aircraft.positionAge);
  const distance = distanceKm(aircraft);

  if (positionAge !== null && positionAge > 12) return false;
  if (confidence < 70) return false;

  if (mode === "ARRIVAL") {
    return lineage === "ARRIVAL" &&
      ["ON_FINAL", "APPROACHING"].includes(state) &&
      (distance === null || distance <= 18);
  }

  if (mode === "RUNWAY") {
    if (lineage !== "DEPARTURE" || !["TAKEOFF_ROLL", "LINING_UP", "TAXIING_OUT"].includes(state)) return false;
    if (aircraft.onGround === false) return false;

    const runwayDistance = runwayKm(aircraft);
    const alignment = finiteNumber(aircraft.runwayAlignment);
    const speed = finiteNumber(aircraft.speed) || 0;
    return runwayDistance !== null && runwayDistance <= 0.24 &&
      alignment !== null && alignment <= 24 &&
      speed >= 4;
  }

  if (mode !== "TAKEOFF" || lineage !== "DEPARTURE") return false;
  if (!["TAKEOFF_ROLL", "AIRBORNE_DEPARTURE", "DEPARTING", "LINING_UP"].includes(state)) return false;
  if (distance !== null && distance > 5.5) return false;

  const speed = finiteNumber(aircraft.speed) || 0;
  if (state === "LINING_UP") return speed >= 5;
  if (state === "TAKEOFF_ROLL") return speed >= 35;

  const altitude = finiteNumber(aircraft.altitude);
  return aircraft.onGround === false &&
    altitude !== null && altitude >= 50 && altitude <= 5000 &&
    speed >= 70;
}

function selectPriorityCandidate(aircraft, mode, current, completedId) {
  return (Array.isArray(aircraft) ? aircraft : [])
    .filter(candidate => candidate.id !== current?.id)
    .filter(candidate => candidate.id !== completedId)
    .filter(candidate => isManualPriorityCandidate(candidate, mode))
    .sort((a, b) => priorityCandidateScore(b, mode) - priorityCandidateScore(a, mode))[0] || null;
}

function selectConfirmedTakeoff(aircraft, current, completedId) {
  if (!arrivalCanYield(current)) return null;
  return (Array.isArray(aircraft) ? aircraft : [])
    .filter(candidate => candidate.id !== current?.id)
    .filter(candidate => candidate.id !== completedId)
    .filter(isConfirmedTakeoff)
    .sort((a, b) => takeoffPriority(b) - takeoffPriority(a))[0] || null;
}

function toDisplay(aircraft) {
  if (!aircraft) return null;
  const distance = distanceKm(aircraft);
  const threshold = thresholdKm(aircraft);
  return {
    id: aircraft.id,
    hex: aircraft.hex,
    callsign: aircraft.callsign,
    registration: aircraft.registration,
    type: aircraft.type,
    state: aircraft.state,
    lineage: aircraft.lineage,
    confidence: aircraft.confidence,
    runway: aircraft.nearestRunway || aircraft.runway || null,
    runwayAlignment: Number.isFinite(Number(aircraft.runwayAlignment)) ? Number(Number(aircraft.runwayAlignment).toFixed(1)) : null,
    distanceKm: distance === null ? null : Number(distance.toFixed(2)),
    thresholdKm: threshold === null ? null : Number(threshold.toFixed(2)),
    altitude: aircraft.altitude,
    speed: aircraft.speed,
    positionAge: aircraft.positionAge,
    stateAgeSeconds: aircraft.stateAgeSeconds,
    sampleCount: aircraft.sampleCount,
    score: null,
    stale: false
  };
}

module.exports = {
  arrivalCanYield,
  isConfirmedTakeoff,
  isManualPriorityCandidate,
  selectConfirmedTakeoff,
  selectPriorityCandidate,
  toDisplay
};
