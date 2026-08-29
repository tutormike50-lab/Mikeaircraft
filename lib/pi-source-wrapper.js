const baseHandler = require("./editorial-engine-wrapper-v3.js");

const FEED_KEY = "mikeaircraft:pi:PRG:feed";
const PI_MAX_AGE_MS = 15000;
const PRG = { lat: 50.1008, lon: 14.2600, radius: 20 };
let requestQueue = Promise.resolve();
const METADATA_CACHE_MS = 30000;
const METADATA_FETCH_TIMEOUT_MS = 650;
let metadataCache = [];
let metadataCacheAt = 0;

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

async function redisCommand(command, fetchImpl) {
  const { url, token } = redisCredentials();
  if (!url || !token) return null;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command)
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.error ? null : payload?.result;
  } catch {
    return null;
  }
}

async function loadPiFeed(fetchImpl) {
  const stored = await redisCommand(["GET", FEED_KEY], fetchImpl);
  if (!stored) return null;
  try {
    const feed = typeof stored === "string" ? JSON.parse(stored) : stored;
    const ageMs = Date.now() - Number(feed?.receivedAt || 0);
    if (ageMs < 0 || ageMs > PI_MAX_AGE_MS || !Array.isArray(feed?.aircraft)) return null;
    return { ...feed, ageMs };
  } catch {
    return null;
  }
}

async function fetchMetadata(fetchImpl) {
  const now = Date.now();
  if (metadataCache.length && now - metadataCacheAt < METADATA_CACHE_MS) return metadataCache;

  const sources = [
    `https://api.adsb.lol/v2/point/${PRG.lat}/${PRG.lon}/${PRG.radius}`,
    `https://api.airplanes.live/v2/point/${PRG.lat}/${PRG.lon}/${PRG.radius}`,
    `https://opendata.adsb.fi/api/v2/lat/${PRG.lat}/lon/${PRG.lon}/dist/${PRG.radius}`
  ];
  for (const url of sources) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        cache: "no-store",
        headers: { "User-Agent": "MikeAircraft-Pi-Bridge" },
        signal: controller.signal
      });
      if (!response.ok) continue;
      const payload = JSON.parse(await response.text());
      const list = Array.isArray(payload?.ac) ? payload.ac : Array.isArray(payload?.aircraft) ? payload.aircraft : null;
      if (list) {
        metadataCache = list;
        metadataCacheAt = Date.now();
        return list;
      }
    } catch {}
    finally {
      clearTimeout(timeout);
    }
  }
  return metadataCache;
}

function cleanHex(value) {
  return String(value || "").trim().toLowerCase();
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalisePiAircraft(piAircraft, metadata) {
  const byHex = new Map();
  for (const ac of metadata) {
    const hex = cleanHex(ac?.hex);
    if (hex) byHex.set(hex, ac);
  }

  let metadataMatches = 0;
  const aircraft = [];
  for (const local of piAircraft) {
    const hex = cleanHex(local?.hex);
    if (!hex) continue;
    const remote = byHex.get(hex) || {};
    if (byHex.has(hex)) metadataMatches += 1;

    const localAltitude = local?.altitude ?? local?.alt_baro ?? local?.alt_geom;
    const onGround = localAltitude === "ground" || local?.alt_baro === "ground" || local?.alt_geom === "ground";
    const lat = finite(local?.lat);
    const lon = finite(local?.lon);
    const speed = finite(local?.speed ?? local?.gs);
    const track = finite(local?.track);
    const verticalRate = finite(local?.vert_rate ?? local?.baro_rate ?? local?.geom_rate);
    const seenPos = finite(local?.seen_pos ?? local?.seen);
    const flight = String(local?.flight || remote?.flight || "").trim();

    aircraft.push({
      hex,
      flight,
      r: remote?.r || local?.r || null,
      t: remote?.t || local?.t || null,
      category: remote?.category || local?.category || null,
      lat,
      lon,
      alt_baro: onGround ? "ground" : finite(localAltitude),
      alt_geom: onGround ? "ground" : finite(local?.alt_geom),
      gs: speed,
      track,
      baro_rate: verticalRate,
      seen_pos: seenPos,
      messages: finite(local?.messages),
      squawk: local?.squawk || remote?.squawk || null,
      _pi: true
    });
  }

  return { aircraft, metadataMatches };
}

function isPrgAdsbUrl(url) {
  const text = String(url || "");
  return (
    text.includes(`api.adsb.lol/v2/point/${PRG.lat}/${PRG.lon}/`) ||
    text.includes(`api.airplanes.live/v2/point/${PRG.lat}/${PRG.lon}/`) ||
    text.includes(`opendata.adsb.fi/api/v2/lat/${PRG.lat}/lon/${PRG.lon}/`)
  );
}

async function runPrg(req, res) {
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function") return baseHandler(req, res);

  const feed = await loadPiFeed(originalFetch);
  if (!feed) return baseHandler(req, res);

  const metadata = await fetchMetadata(originalFetch);
  const local = normalisePiAircraft(feed.aircraft, metadata);
  const synthetic = JSON.stringify({ ac: local.aircraft, now: Date.now() / 1000, total: local.aircraft.length });
  const originalJson = res.json.bind(res);

  res.json = function piSourceJson(payload) {
    if (payload?.ok) {
      payload.version = "0.7.6";
      payload.dataStatus = "LIVE_LOCAL";
      payload.traffic = {
        ...(payload.traffic || {}),
        source: "local-pi",
        telemetrySource: "FlightAware dongle via Raspberry Pi",
        piFeedFresh: true,
        piFeedAgeSeconds: Number((feed.ageMs / 1000).toFixed(1)),
        piRawAircraftCount: feed.aircraft.length,
        piPositionedAircraftCount: local.aircraft.filter(ac => Number.isFinite(ac.lat) && Number.isFinite(ac.lon)).length,
        piMetadataMatchedCount: local.metadataMatches,
        internetMetadataFallback: true
      };
    }
    return originalJson(payload);
  };

  const patchedFetch = async function(url, options) {
    if (isPrgAdsbUrl(url)) {
      return {
        ok: true,
        status: 200,
        text: async () => synthetic,
        json: async () => JSON.parse(synthetic)
      };
    }
    return originalFetch(url, options);
  };

  globalThis.fetch = patchedFetch;
  try {
    return await baseHandler(req, res);
  } finally {
    if (globalThis.fetch === patchedFetch) globalThis.fetch = originalFetch;
  }
}

module.exports = async function handler(req, res) {
  const airportCode = String(req.query?.airport || "PRG").toUpperCase();
  if (airportCode !== "PRG") return baseHandler(req, res);

  const task = requestQueue.then(() => runPrg(req, res));
  requestQueue = task.catch(() => {});
  return task;
};
