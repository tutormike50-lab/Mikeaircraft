const crypto = require("crypto");

const TOKEN_SHA256 = "2bfbaa9394bfa828c40d49c8b5893483c18623d4ef27a7ac60523b7b8d9f5afb";
const FEED_KEY = "mikeaircraft:pi:PRG:feed";

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
  const { url, token } = redisCredentials();
  if (!url || !token) throw new Error("Redis environment variables unavailable");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.error) throw new Error(`Redis error: ${payload.error}`);
  return payload?.result;
}

function authorised(req) {
  const token = String(req.headers["x-mikeaircraft-token"] || "");
  if (!token) return false;
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(TOKEN_SHA256, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" });
  if (!authorised(req)) return res.status(401).json({ ok: false, error: "Unauthorised" });

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    const aircraft = Array.isArray(body?.aircraft) ? body.aircraft : [];
    if (aircraft.length > 1000) return res.status(413).json({ ok: false, error: "Too many aircraft" });

    const receivedAt = Date.now();
    const value = JSON.stringify({
      source: "raspberry-pi-dump1090",
      airport: "PRG",
      receivedAt,
      dump1090Now: Number.isFinite(Number(body?.now)) ? Number(body.now) : null,
      messages: Number.isFinite(Number(body?.messages)) ? Number(body.messages) : null,
      aircraft
    });

    await redisCommand(["SET", FEED_KEY, value, "EX", "30"]);
    return res.status(200).json({
      ok: true,
      source: "raspberry-pi-dump1090",
      receivedAt: new Date(receivedAt).toISOString(),
      aircraftCount: aircraft.length
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};
