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

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET required" });

  try {
    const stored = await redisCommand(["GET", FEED_KEY]);
    if (!stored) {
      return res.status(200).json({ ok: true, connected: false, source: "raspberry-pi-dump1090" });
    }
    const feed = typeof stored === "string" ? JSON.parse(stored) : stored;
    const ageSeconds = Math.max(0, (Date.now() - Number(feed.receivedAt || 0)) / 1000);
    const aircraft = Array.isArray(feed.aircraft) ? feed.aircraft : [];
    const positioned = aircraft.filter(ac => Number.isFinite(Number(ac?.lat)) && Number.isFinite(Number(ac?.lon))).length;
    return res.status(200).json({
      ok: true,
      connected: ageSeconds <= 15,
      source: feed.source || "raspberry-pi-dump1090",
      airport: feed.airport || "PRG",
      ageSeconds: Number(ageSeconds.toFixed(1)),
      aircraftCount: aircraft.length,
      positionedAircraftCount: positioned,
      receivedAt: feed.receivedAt ? new Date(feed.receivedAt).toISOString() : null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, connected: false, error: error.message });
  }
};
