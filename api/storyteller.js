// MikeAircraft Storyteller API — PARKED
// Core development priority: ADS-B -> ribbon -> radar -> gimbal -> broadcast graphics.
// The previous storyteller implementation remains recoverable from Git history.

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  return res.status(200).json({
    ok: true,
    service: "MikeAircraft Storyteller",
    version: "parked",
    enabled: false,
    reason: "Core tracking development",
    generatedAt: new Date().toISOString(),
    output: {
      available: false,
      class: "DISABLED",
      confidence: 0,
      attention: null,
      story: null,
      segments: [],
      facts: [],
      sources: []
    }
  });
};
