const crypto = require("crypto");

const VERSION = "0.1";
const SETTINGS_KEY = "mikeaircraft:control:settings";

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
  updatedAt: null
});

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

  return {
    ...DEFAULT_SETTINGS,
    ...(parsed && typeof parsed === "object" ? parsed : {}),
    airport: AIRPORT_CODES.has(airport) ? airport : DEFAULT_SETTINGS.airport,
    cameraMode: "BOTH",
    storiesEnabled: false
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
        settings,
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
        settings: { ...DEFAULT_SETTINGS },
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

  const requestedAirport = String(req.body?.airport || "")
    .trim()
    .toUpperCase();

  if (!AIRPORT_CODES.has(requestedAirport)) {
    return res.status(400).json({
      ok: false,
      error: "Unsupported airport"
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
      airport: requestedAirport,
      updatedAt: new Date().toISOString()
    };

    await redisCommand(["SET", SETTINGS_KEY, JSON.stringify(settings)]);

    return res.status(200).json({
      ok: true,
      service: "MikeAircraft Control Settings",
      version: VERSION,
      settings
    });
  }
  catch (error) {
    return res.status(503).json({
      ok: false,
      error: "Could not save the airport setting",
      detail: error.message
    });
  }
};
