const HEARTBEAT_FRESH_MS = 15_000;

const DEFAULT_DESIRED = Object.freeze({ desired: "STOPPED", generation: 0, updatedAt: null });

function parseStored(value) {
  if (!value) return null;
  try { return typeof value === "string" ? JSON.parse(value) : value; }
  catch { return null; }
}

function desiredState(value) {
  const parsed = parseStored(value);
  return {
    desired: parsed?.desired === "TRACKING" ? "TRACKING" : "STOPPED",
    generation: Number.isSafeInteger(parsed?.generation) && parsed.generation >= 0 ? parsed.generation : 0,
    updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : null
  };
}

function publicState(desiredValue, heartbeatValue, now = Date.now()) {
  const desired = desiredState(desiredValue);
  const heartbeat = parseStored(heartbeatValue);
  const receivedAt = Number(heartbeat?.receivedAt || 0);
  const ageMs = receivedAt > 0 ? Math.max(0, now - receivedAt) : null;
  const online = ageMs !== null && ageMs <= HEARTBEAT_FRESH_MS;
  const allowed = new Set(["STOPPED", "STARTING", "TRACKING", "FAULT"]);
  return {
    ok: true,
    desired: desired.desired,
    generation: desired.generation,
    desiredUpdatedAt: desired.updatedAt,
    piOnline: online,
    trackerState: online && allowed.has(heartbeat?.trackerState) ? heartbeat.trackerState : "STOPPED",
    currentAircraft: online && typeof heartbeat?.currentAircraft === "string" ? heartbeat.currentAircraft : null,
    rs4State: online && typeof heartbeat?.rs4State === "string" ? heartbeat.rs4State : null,
    fault: online && typeof heartbeat?.fault === "string" ? heartbeat.fault : null,
    telemetry: online && heartbeat?.telemetry && typeof heartbeat.telemetry === "object" ? heartbeat.telemetry : null,
    heartbeatAt: receivedAt ? new Date(receivedAt).toISOString() : null,
    heartbeatAgeSeconds: ageMs === null ? null : Number((ageMs / 1000).toFixed(1))
  };
}

module.exports = { HEARTBEAT_FRESH_MS, DEFAULT_DESIRED, desiredState, publicState };
