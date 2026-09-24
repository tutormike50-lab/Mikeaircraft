const { authorised } = require("../lib/control-auth");
const { normaliseStoredSettings } = require("./settings");

const SETTINGS_KEY = "mikeaircraft:control:settings";

function credentials() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!authorised(req)) {
    return res.status(401).json({ ok: false, error: "Incorrect control PIN" });
  }
  const auth = credentials();
  if (!auth.url || !auth.token) return res.status(503).json({ ok: false, error: "Redis is not configured" });
  try {
    const response = await fetch(auth.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["GET", SETTINGS_KEY])
    });
    const payload = await response.json();
    if (payload && payload.error) throw new Error(String(payload.error));
    const settings = normaliseStoredSettings(payload?.result);
    const cameraReference = settings.cameraLocation;
    if (!cameraReference?.readiness?.complete) {
      return res.status(409).json({ ok: false, error: "Complete CameraReference is not calibrated" });
    }
    return res.status(200).json({ ok: true, cameraReference });
  }
  catch (error) {
    return res.status(503).json({ ok: false, error: "Could not read CameraReference", detail: error.message });
  }
};

