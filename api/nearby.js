export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radiusRaw = Number(req.query.radius ?? 20);
  const radius = Math.max(1, Math.min(50, Number.isFinite(radiusRaw) ? radiusRaw : 20));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: "Missing or invalid lat/lon" });
  }

  const sources = [
    `https://api.adsb.lol/v2/point/${lat}/${lon}/${radius}`,
    `https://api.airplanes.live/v2/point/${lat}/${lon}/${radius}`,
    `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${radius}`
  ];

  const errors = [];

  for (const url of sources) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);

      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "MikePlanes/1.0"
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        errors.push(`${url} -> HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const ac = Array.isArray(data.ac)
        ? data.ac
        : Array.isArray(data.aircraft)
          ? data.aircraft
          : null;

      if (!ac) {
        errors.push(`${url} -> no aircraft array`);
        continue;
      }

      return res.status(200).json({
        ac,
        total: ac.length,
        source: new URL(url).hostname,
        airportQuery: { lat, lon, radius }
      });
    }
    catch (error) {
      errors.push(`${url} -> ${error?.name || "Error"}: ${error?.message || String(error)}`);
    }
  }

  return res.status(502).json({
    error: "All ADS-B sources failed",
    details: errors
  });
}
