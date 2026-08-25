const crypto = require("crypto");

const VERSION = "0.3";
const SETTINGS_KEY = "mikeaircraft:control:settings";
const PRIORITY_DURATION_MS = 2 * 60 * 1000;
const PRIORITY_MODES = new Set(["AUTO", "ARRIVAL", "TAKEOFF", "RUNWAY"]);

const AIRPORTS = [
  { code: "PRG", icao: "LKPR", name: "Prague" },
  { code: "LHR", icao: "EGLL", name: "London Heathrow" },
  { code: "FRA", icao: "EDDF", name: "Frankfurt" },
  { code: "AMS", icao: "EHAM", name: "Amsterdam Schiphol" },
  { code: "CDG", icao: "LFPG", name: "Paris Charles de Gaulle" },
  { code: "MAN", icao: "EGCC", name: "Manchester" },
  { code: "ATL", icao: "KATL", name: "Atlanta" }
];

const AIRPORT_CODES = new Set(AIRPORTS.map((airport) => airport.code));

const DEFAULT_SETTINGS = Object.freeze({
  airport: "PRG",
  cameraMode: "BOTH",
  storiesEnabled: false,
  priorityMode: "AUTO",
  priorityUntil: null,
  cameraLocation: null,
  updatedAt: null
});

function normaliseCameraLocation(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const lat = Number(value.lat);
  const lon = Number(value.lon);
  const accuracyM = Number(value.accuracyM);
  const altitudeM = value.altitudeM === null || value.altitudeM === undefined
    ? null
    : Number(value.altitudeM);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return null;
  }

  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return null;
  }

  if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 100000) {
    return null;
  }

  if (altitudeM !== null && (!Number.isFinite(altitudeM) || altitudeM < -500 || altitudeM > 10000)) {
    return null;
  }

  return {
    lat: Number(lat.toFixed(7)),
    lon: Number(lon.toFixed(7)),
    accuracyM: Number(accuracyM.toFixed(1)),
    altitudeM: altitudeM === null ? null : Number(altitudeM.toFixed(1)),
    source: "BROWSER_GEOLOCATION",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString()
  };
}

function publicSettings(settings) {
  const priorityUntilMs = Date.parse(settings.priorityUntil || "");
  const priorityActive = settings.priorityMode !== "AUTO" &&
    Number.isFinite(priorityUntilMs) && priorityUntilMs > Date.now();

  return {
    airport: settings.airport,
    cameraMode: settings.cameraMode,
    storiesEnabled: settings.storiesEnabled,
    priorityMode: priorityActive ? settings.priorityMode : "AUTO",
    priorityUntil: priorityActive ? settings.priorityUntil : null,
    priorityExpiresInSeconds: priorityActive
      ? Math.max(0, Math.ceil((priorityUntilMs - Date.now()) / 1000))
      : 0,
    cameraLocationConfigured: Boolean(settings.cameraLocation),
    cameraLocationUpdatedAt: settings.cameraLocation?.updatedAt || null,
    updatedAt: settings.updatedAt
  };
}

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

  if (!credentials.url || !credentials.token) {
    throw new Error("Redis is not configured");
  }

  const response = await fetch(credentials.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error(`Redis HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (payload && payload.error) {
    throw new Error(String(payload.error));
  }

  return payload ? payload.result : null;
}

function normaliseStoredSettings(value) {
  let parsed = value;

  if (typeof value === "string" && value.trim()) {
    try {
      parsed = JSON.parse(value);
    }
    catch {
      parsed = null;
    }
  }

  const airport = String(parsed?.airport || DEFAULT_SETTINGS.airport)
    .trim()
    .toUpperCase();

  const requestedPriority = String(parsed?.priorityMode || "AUTO").trim().toUpperCase();
  const priorityUntilMs = Date.parse(parsed?.priorityUntil || "");
  const priorityActive = PRIORITY_MODES.has(requestedPriority) &&
    requestedPriority !== "AUTO" &&
    Number.isFinite(priorityUntilMs) && priorityUntilMs > Date.now();

  return {
    ...DEFAULT_SETTINGS,
    ...(parsed && typeof parsed === "object" ? parsed : {}),
    airport: AIRPORT_CODES.has(airport) ? airport : DEFAULT_SETTINGS.airport,
    cameraMode: "BOTH",
    storiesEnabled: false,
    priorityMode: priorityActive ? requestedPriority : "AUTO",
    priorityUntil: priorityActive ? new Date(priorityUntilMs).toISOString() : null,
    cameraLocation: normaliseCameraLocation(parsed?.cameraLocation)
  };
}

async function readSettings() {
  const stored = await redisCommand(["GET", SETTINGS_KEY]);
  return normaliseStoredSettings(stored);
}

function suppliedPin(req) {
  const headerPin = req.headers?.["x-mikeaircraft-control-pin"];
  const bodyPin = req.body && typeof req.body === "object" ? req.body.pin : null;
  return String(headerPin || bodyPin || "");
}

function pinMatches(supplied, expected) {
  const left = Buffer.from(String(supplied || ""));
  const right = Buffer.from(String(expected || ""));

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-MikeAircraft-Control-Pin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    try {
      const settings = await readSettings();

      return res.status(200).json({
        ok: true,
        service: "MikeAircraft Control Settings",
        version: VERSION,
        settings: publicSettings(settings),
        supportedAirports: AIRPORTS,
        persistence: {
          redisConnected: true
        }
      });
    }
    catch (error) {
      return res.status(200).json({
        ok: true,
        service: "MikeAircraft Control Settings",
        version: VERSION,
        settings: publicSettings({ ...DEFAULT_SETTINGS }),
        supportedAirports: AIRPORTS,
        persistence: {
          redisConnected: false,
          error: error.message
        }
      });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  const expectedPin = String(process.env.MIKEAIRCRAFT_CONTROL_PIN || "");

  if (!expectedPin) {
    return res.status(503).json({
      ok: false,
      error: "Control PIN is not configured"
    });
  }

  if (!pinMatches(suppliedPin(req), expectedPin)) {
    return res.status(401).json({
      ok: false,
      error: "Incorrect control PIN"
    });
  }

  const hasAirport = Boolean(
    req.body &&
    typeof req.body === "object" &&
    Object.prototype.hasOwnProperty.call(req.body, "airport")
  );
  const hasCameraLocation = Boolean(
    req.body &&
    typeof req.body === "object" &&
    Object.prototype.hasOwnProperty.call(req.body, "cameraLocation")
  );
  const hasPriorityMode = Boolean(
    req.body &&
    typeof req.body === "object" &&
    Object.prototype.hasOwnProperty.call(req.body, "priorityMode")
  );

  if (!hasAirport && !hasCameraLocation && !hasPriorityMode) {
    return res.status(400).json({
      ok: false,
      error: "No supported setting was supplied"
    });
  }

  const requestedAirport = hasAirport
    ? String(req.body.airport || "").trim().toUpperCase()
    : null;

  if (hasAirport && !AIRPORT_CODES.has(requestedAirport)) {
    return res.status(400).json({
      ok: false,
      error: "Unsupported airport"
    });
  }

  const requestedPriorityMode = hasPriorityMode
    ? String(req.body.priorityMode || "").trim().toUpperCase()
    : null;

  if (hasPriorityMode && !PRIORITY_MODES.has(requestedPriorityMode)) {
    return res.status(400).json({
      ok: false,
      error: "Unsupported priority mode"
    });
  }

  const requestedCameraLocation = hasCameraLocation
    ? normaliseCameraLocation(req.body.cameraLocation)
    : null;

  if (hasCameraLocation && !requestedCameraLocation) {
    return res.status(400).json({
      ok: false,
      error: "Invalid camera location"
    });
  }

  try {
    let current = { ...DEFAULT_SETTINGS };

    try {
      current = await readSettings();
    }
    catch {
      // The write below is the authoritative Redis availability check.
    }

    const settings = {
      ...current,
      ...(hasAirport ? { airport: requestedAirport } : {}),
      ...(hasCameraLocation ? { cameraLocation: requestedCameraLocation } : {}),
      ...(hasPriorityMode ? {
        priorityMode: requestedPriorityMode,
        priorityUntil: requestedPriorityMode === "AUTO"
          ? null
          : new Date(Date.now() + PRIORITY_DURATION_MS).toISOString()
      } : {}),
      updatedAt: new Date().toISOString()
    };

    await redisCommand(["SET", SETTINGS_KEY, JSON.stringify(settings)]);

    if (hasPriorityMode) {
      await redisCommand(["DEL", `mikeaircraft:v2:${settings.airport}:editorial-current`]);
    }

    return res.status(200).json({
      ok: true,
      service: "MikeAircraft Control Settings",
      version: VERSION,
      settings: publicSettings(settings),
      cameraLocation: hasCameraLocation
        ? {
            saved: true,
            accuracyM: settings.cameraLocation.accuracyM,
            altitudeAvailable: settings.cameraLocation.altitudeM !== null,
            updatedAt: settings.cameraLocation.updatedAt
          }
        : undefined
    });
  }
  catch (error) {
    return res.status(503).json({
      ok: false,
      error: "Could not save the control setting",
      detail: error.message
    });
  }
};
