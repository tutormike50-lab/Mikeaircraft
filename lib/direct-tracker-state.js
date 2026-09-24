const DEFAULT_DIRECT = Object.freeze({ command: "STOPPED", aircraftId: null, callsign: null, generation: 0, updatedAt: null });

function parse(value) {
  if (!value) return null;
  try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return null; }
}

function directState(value) {
  const saved = parse(value);
  const command = new Set(["TRACKING", "HOME"]).has(saved?.command) ? saved.command : "STOPPED";
  return {
    command,
    aircraftId: command === "TRACKING" && typeof saved?.aircraftId === "string" ? saved.aircraftId : null,
    callsign: command === "TRACKING" && typeof saved?.callsign === "string" ? saved.callsign : null,
    generation: Number.isSafeInteger(saved?.generation) && saved.generation >= 0 ? saved.generation : 0,
    updatedAt: typeof saved?.updatedAt === "string" ? saved.updatedAt : null
  };
}

module.exports = { DEFAULT_DIRECT, directState };
