const { createRedisClient } = require("../../services/redis.js");
const { getAirport } = require("../../config/airports.js");

const BASE = "https://airlabs.co/api/v9";
const ROUTE_TTL_SECONDS = 4 * 60 * 60;
const MISS_TTL_SECONDS = 15 * 60;
const AIRPORT_TTL_SECONDS = 30 * 24 * 60 * 60;

function redis() {
  try {
    const client = createRedisClient();
    return client.available ? client : null;
  } catch {
    return null;
  }
}

async function cacheGet(key) {
  const client = redis();
  if (!client) return null;
  try {
    const value = await client.command(["GET", key]);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttl) {
  const client = redis();
  if (!client) return;
  try {
    await client.command(["SET", key, JSON.stringify(value), "EX", String(ttl)]);
  } catch {}
}

async function airlabsGet(endpoint, params) {
  const apiKey = process.env.AIRLABS_API_KEY;
  if (!apiKey) return { ok:false, error:"AIRLABS_API_KEY unavailable" };

  const url = new URL(`${BASE}/${endpoint}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  url.searchParams.set("api_key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { cache:"no-store", signal:controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) return { ok:false, status:response.status, error:data?.error?.message || `AirLabs HTTP ${response.status}` };
    if (data?.error) return { ok:false, status:200, error:data.error.message || "AirLabs error" };
    return { ok:true, data:data?.response ?? null };
  } catch (error) {
    return { ok:false, error:error?.name === "AbortError" ? "AirLabs timeout" : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

function localAirportAsRaw(code) {
  const airport = getAirport(code);
  return {
    iata_code:airport.iata,
    icao_code:airport.icao,
    name:airport.name,
    municipality:null,
    country_name:null,
    latitude:airport.lat,
    longitude:airport.lon
  };
}

async function lookupAirport(iataCode) {
  const iata = String(iataCode || "").trim().toUpperCase();
  if (!iata) return null;

  const key = `mikeaircraft:airlabs:airport:${iata}`;
  const cached = await cacheGet(key);
  if (cached) return cached;

  const result = await airlabsGet("airports", {
    iata_code:iata,
    _fields:"name,iata_code,icao_code,lat,lng,city,country_code"
  });
  const record = Array.isArray(result.data) ? result.data[0] : null;
  if (!result.ok || !record) return null;

  const normalized = {
    iata_code:record.iata_code || iata,
    icao_code:record.icao_code || null,
    name:record.name || null,
    municipality:record.city || null,
    country_name:record.country_code || null,
    latitude:Number.isFinite(Number(record.lat)) ? Number(record.lat) : null,
    longitude:Number.isFinite(Number(record.lng)) ? Number(record.lng) : null
  };
  await cacheSet(key, normalized, AIRPORT_TTL_SECONDS);
  return normalized;
}

function flightMatchesAirport(flight, airportCode, lineage) {
  const airport = getAirport(airportCode);
  const dep = String(flight?.dep_iata || "").toUpperCase();
  const arr = String(flight?.arr_iata || "").toUpperCase();
  const movement = String(lineage || "").toUpperCase();
  if (movement === "DEPARTURE") return dep === airport.iata;
  if (movement === "ARRIVAL") return arr === airport.iata;
  return dep === airport.iata || arr === airport.iata;
}

async function lookupAirlabsRoute(callsign, airportCode, lineage) {
  const cs = String(callsign || "").trim().toUpperCase();
  if (!cs || !airportCode) return { route:null, source:"airlabs", error:"Missing callsign or airport" };

  const cacheKey = `mikeaircraft:airlabs:route:${airportCode}:${lineage || "UNKNOWN"}:${cs}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.miss) return { route:null, source:"airlabs-cache", cached:true, error:cached.reason || "Cached AirLabs miss" };
  if (cached) return { route:cached, source:"airlabs-cache", cached:true };

  const result = await airlabsGet("flight", {
    flight_icao:cs,
    _fields:"flight_iata,flight_icao,airline_iata,airline_icao,dep_iata,arr_iata,status,reg_number,hex"
  });
  const flight = result.data;
  if (!result.ok || !flight) {
    await cacheSet(cacheKey, { miss:true, reason:result.error || "No AirLabs flight" }, MISS_TTL_SECONDS);
    return { route:null, source:"airlabs", error:result.error || "No AirLabs flight" };
  }
  if (!flightMatchesAirport(flight, airportCode, lineage)) {
    const reason = "AirLabs route conflicts with watched airport";
    await cacheSet(cacheKey, { miss:true, reason }, MISS_TTL_SECONDS);
    return { route:null, source:"airlabs", error:reason };
  }

  const airport = getAirport(airportCode);
  const dep = String(flight.dep_iata || "").toUpperCase();
  const arr = String(flight.arr_iata || "").toUpperCase();
  const origin = dep === airport.iata ? localAirportAsRaw(airportCode) : await lookupAirport(dep);
  const destination = arr === airport.iata ? localAirportAsRaw(airportCode) : await lookupAirport(arr);
  if (!origin || !destination) {
    const reason = "Could not resolve AirLabs airport coordinates";
    await cacheSet(cacheKey, { miss:true, reason }, MISS_TTL_SECONDS);
    return { route:null, source:"airlabs", error:reason };
  }

  const route = {
    callsign_iata:flight.flight_iata || null,
    callsign_icao:flight.flight_icao || cs,
    airline:{
      name:null,
      iata:flight.airline_iata || null,
      icao:flight.airline_icao || null,
      country:null
    },
    origin,
    destination,
    mikeaircraft_source:"airlabs"
  };

  await cacheSet(cacheKey, route, ROUTE_TTL_SECONDS);
  return { route, source:"airlabs", cached:false };
}

module.exports = { lookupAirlabsRoute, lookupAirport, flightMatchesAirport };
