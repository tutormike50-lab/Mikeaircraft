const baseHandler = require("./editorial-engine-wrapper-v2.js");
const {
  selectConfirmedTakeoff,
  selectPriorityCandidate,
  toDisplay
} = require("./takeoff-preemption.js");

const SETTINGS_KEY = "mikeaircraft:control:settings";

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

async function redisCommand(command) {
  const credentials = redisCredentials();
  if (!credentials.url || !credentials.token) return null;

  try {
    const response = await fetch(credentials.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command)
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.error ? null : payload?.result;
  }
  catch {
    return null;
  }
}

async function readPriority() {
  const stored = await redisCommand(["GET", SETTINGS_KEY]);
  if (!stored) return { mode: "AUTO", until: null, expired: false };

  try {
    const settings = typeof stored === "string" ? JSON.parse(stored) : stored;
    const mode = String(settings?.priorityMode || "AUTO").toUpperCase();
    const untilMs = Date.parse(settings?.priorityUntil || "");
    const validMode = ["ARRIVAL", "TAKEOFF", "RUNWAY"].includes(mode);
    const active = validMode && Number.isFinite(untilMs) && untilMs > Date.now();
    return {
      mode: active ? mode : "AUTO",
      until: active ? new Date(untilMs).toISOString() : null,
      expired: validMode && !active
    };
  }
  catch {
    return { mode: "AUTO", until: null, expired: false };
  }
}

function preserveDisplaced(intelligence, previousCurrent) {
  if (!previousCurrent) return;

  const slot = previousCurrent.lineage === "ARRIVAL" ? "nextIn" : "nextOut";
  const existing = intelligence[slot] || null;
  const previousDistance = Number(previousCurrent.thresholdKm ?? previousCurrent.distanceKm);
  const existingDistance = Number(existing?.thresholdKm ?? existing?.distanceKm);

  if (!existing || (Number.isFinite(previousDistance) && (!Number.isFinite(existingDistance) || previousDistance < existingDistance))) {
    intelligence[slot] = previousCurrent;
  }
}

function highConfidence(aircraft) {
  return {
    level: "HIGH",
    score: Math.max(90, Math.min(100, Math.round(Number(aircraft?.confidence || 0)))),
    ambiguous: false,
    scoreMargin: null,
    candidateCount: 1,
    storySafe: true
  };
}

// MikeAircraft live-priority control and confirmed-takeoff recovery.
// Automatic takeoff pre-emption is deliberately blocked once an arrival is
// within 3 km of its runway threshold. A two-minute manual control-panel choice
// may override the automatic editorial order when Mike can see a live movement.
module.exports = async function handler(req, res) {
  const originalJson = res.json.bind(res);
  const airportCode = String(req.query?.airport || "PRG").toUpperCase();
  const lockKey = `mikeaircraft:v2:${airportCode}:editorial-current`;

  async function saveLock(aircraft, reason, priorityUntil) {
    if (!aircraft) return false;
    const now = Date.now();
    const ttl = priorityUntil
      ? Math.max(30, Math.ceil((Date.parse(priorityUntil) - now) / 1000) + 30)
      : 900;
    const result = await redisCommand(["SET", lockKey, JSON.stringify({
      id: aircraft.id,
      since: now,
      reason,
      updatedAt: now,
      snapshot: aircraft
    }), "EX", String(ttl)]);
    return result === "OK";
  }

  res.json = async function livePriorityJson(payload) {
    if (!payload?.ok || !payload.intelligence || !Array.isArray(payload.aircraft)) return originalJson(payload);

    let previousCurrent = payload.intelligence.current || null;
    const completedId = payload.intelligence.editorialLock?.completedAircraftId || null;
    const priority = await readPriority();
    const existingReason = String(payload.intelligence.editorialLock?.reason || "");

    const previousState = String(previousCurrent?.state || "").toUpperCase();
    const previousSpeed = Number(previousCurrent?.speed || 0);
    const previousStateAge = Number(previousCurrent?.stateAgeSeconds || 0);
    const staleQuietGroundLock = existingReason === "QUIET_AIRPORT_PROMOTION" &&
      previousState === "GROUND" &&
      previousSpeed <= 2 &&
      previousStateAge >= 60;

    if (staleQuietGroundLock) {
      await redisCommand(["DEL", lockKey]);
      payload.intelligence.current = null;
      payload.intelligence.selectionConfidence = {
        level: "NONE",
        score: 0,
        ambiguous: false,
        scoreMargin: null,
        candidateCount: 0,
        storySafe: false
      };
      payload.intelligence.editorialLock = {
        ...(payload.intelligence.editorialLock || {}),
        active: false,
        aircraftId: null,
        reason: "STALE_QUIET_GROUND_LOCK_CLEARED",
        stale: true
      };
      previousCurrent = null;
    }

    if (priority.expired && existingReason.startsWith("MANUAL_")) {
      await redisCommand(["DEL", lockKey]);
    }

    let selected = null;
    let reason = null;

    if (priority.mode !== "AUTO") {
      selected = selectPriorityCandidate(payload.aircraft, priority.mode, previousCurrent, completedId);
      reason = `MANUAL_${priority.mode}_PRIORITY`;
    }
    else {
      selected = selectConfirmedTakeoff(payload.aircraft, previousCurrent, completedId);
      reason = "CONFIRMED_TAKEOFF_PREEMPTION";
    }

    if (selected) {
      if (selected.id !== previousCurrent?.id) {
        preserveDisplaced(payload.intelligence, previousCurrent);
      }
      payload.intelligence.current = toDisplay(selected);
      if (payload.intelligence.nextIn?.id === selected.id) payload.intelligence.nextIn = null;
      if (payload.intelligence.nextOut?.id === selected.id) payload.intelligence.nextOut = null;
      payload.intelligence.selectionConfidence = highConfidence(selected);

      const lockSaved = await saveLock(selected, reason, priority.until);
      payload.intelligence.editorialLock = {
        ...(payload.intelligence.editorialLock || {}),
        active: true,
        aircraftId: selected.id,
        reason,
        stale: false,
        lockSaved
      };
    }

    payload.intelligence.editorialLock = {
      ...(payload.intelligence.editorialLock || {}),
      takeoffPreemptionEnabled: true,
      confirmedTakeoffRecoveryEnabled: true,
      manualPriorityMode: priority.mode,
      manualPriorityUntil: priority.until
    };

    payload.version = "0.7.5";
    return originalJson(payload);
  };

  return baseHandler(req, res);
};
