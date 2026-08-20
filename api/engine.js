module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const AIRPORTS = {
      PRG: {
        name: "Prague Airport", icao: "LKPR", lat: 50.1008, lon: 14.2600,
        runwayEnds: [
          { name: "06", heading: 65, lat: 50.1017990, lon: 14.2263002 },
          { name: "24", heading: 245, lat: 50.1160011, lon: 14.2734003 },
          { name: "12", heading: 127, lat: 50.1080017, lon: 14.2454004 },
          { name: "30", heading: 307, lat: 50.0904999, lon: 14.2817001 }
        ]
      },

      LHR: {
        name: "London Heathrow", icao: "EGLL", lat: 51.471227, lon: -0.460881,
        runwayEnds: [
          { name: "09L", heading: 90, lat: 51.477490, lon: -0.489439 },
          { name: "27R", heading: 270, lat: 51.477681, lon: -0.433227 },
          { name: "09R", heading: 90, lat: 51.464780, lon: -0.486808 },
          { name: "27L", heading: 270, lat: 51.464957, lon: -0.434048 }
        ]
      },

      FRA: {
        name: "Frankfurt Airport", icao: "EDDF", lat: 50.032606, lon: 8.540669,
        runwayEnds: [
          { name: "07C", heading: 70, lat: 50.0326004, lon: 8.5346298 },
          { name: "25C", heading: 250, lat: 50.0451012, lon: 8.5869799 },
          { name: "07L", heading: 70, lat: 50.0371017, lon: 8.4970798 },
          { name: "25R", heading: 250, lat: 50.0457993, lon: 8.5337200 },
          { name: "07R", heading: 70, lat: 50.0275002, lon: 8.5341702 },
          { name: "25L", heading: 250, lat: 50.0401001, lon: 8.5865297 },
          { name: "18", heading: 180, lat: 50.0341540, lon: 8.5259440 },
          { name: "36", heading: 360, lat: 49.9984930, lon: 8.5262970 }
        ]
      },

      AMS: {
        name: "Amsterdam Schiphol", icao: "EHAM", lat: 52.314875, lon: 4.758074,
        runwayEnds: [
          { name: "04", heading: 41, lat: 52.3003998, lon: 4.7834802 },
          { name: "22", heading: 221, lat: 52.3139992, lon: 4.8030200 },
          { name: "06", heading: 58, lat: 52.2878990, lon: 4.7340202 },
          { name: "24", heading: 238, lat: 52.3045998, lon: 4.7775202 },
          { name: "09", heading: 87, lat: 52.3166008, lon: 4.7463498 },
          { name: "27", heading: 267, lat: 52.3184013, lon: 4.7968898 },
          { name: "18C", heading: 183, lat: 52.3314018, lon: 4.7400298 },
          { name: "36C", heading: 3, lat: 52.3017998, lon: 4.7375002 },
          { name: "18L", heading: 183, lat: 52.3213005, lon: 4.7799602 },
          { name: "36R", heading: 3, lat: 52.2907982, lon: 4.7773499 },
          { name: "18R", heading: 183, lat: 52.3627014, lon: 4.7119298 },
          { name: "36L", heading: 3, lat: 52.3286018, lon: 4.7088399 }
        ]
      },

      CDG: {
        name: "Paris Charles de Gaulle", icao: "LFPG", lat: 49.009750, lon: 2.562618,
        runwayEnds: [
          { name: "08L", heading: 85, lat: 48.9957008, lon: 2.5527401 },
          { name: "26R", heading: 265, lat: 48.9987984, lon: 2.6101799 },
          { name: "08R", heading: 85, lat: 48.9929008, lon: 2.5656600 },
          { name: "26L", heading: 265, lat: 48.9948997, lon: 2.6024301 },
          { name: "09L", heading: 85, lat: 49.0247002, lon: 2.5248899 },
          { name: "27R", heading: 265, lat: 49.0266991, lon: 2.5616901 },
          { name: "09R", heading: 86, lat: 49.0205994, lon: 2.5130601 },
          { name: "27L", heading: 266, lat: 49.0237007, lon: 2.5702901 }
        ]
      },

      MAN: {
        name: "Manchester Airport", icao: "EGCC", lat: 53.347150, lon: -2.283883,
        runwayEnds: [
          { name: "05L", heading: 51, lat: 53.3451004, lon: -2.2927401 },
          { name: "23R", heading: 231, lat: 53.3624001, lon: -2.2571399 },
          { name: "05R", heading: 51, lat: 53.3320010, lon: -2.3106600 },
          { name: "23L", heading: 231, lat: 53.3490980, lon: -2.2749900 }
        ]
      }
    };

    const requestedCode = String(req.query.airport || "PRG").toUpperCase();
    const airportCode = AIRPORTS[requestedCode] ? requestedCode : "PRG";
    const airport = AIRPORTS[airportCode];
    const radius = 20;
    const now = Date.now();

    const redisURL = process.env.KV_REST_API_URL;
    const redisToken = process.env.KV_REST_API_TOKEN;
    const redisAvailable = Boolean(redisURL && redisToken);

    async function redisCommand(command) {
      if (!redisAvailable) throw new Error("Redis environment variables unavailable");

      const response = await fetch(redisURL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redisToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(command)
      });

      if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);

      const result = await response.json();

      if (result.error) throw new Error(`Redis error: ${result.error}`);

      return result.result;
    }

    function distanceKm(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;

      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function headingDiff(a, b) {
      if (!Number.isFinite(a) || !Number.isFinite(b)) return 180;
      return Math.abs(((a - b + 540) % 360) - 180);
    }

    function nearestThreshold(ac) {
      let best = null;
      let bestDistance = Infinity;

      for (const end of airport.runwayEnds) {
        const d = distanceKm(ac.lat, ac.lon, end.lat, end.lon);

        if (d < bestDistance) {
          bestDistance = d;
          best = end;
        }
      }

      return {
        runway: best,
        distance: bestDistance
      };
    }

    function distanceToRunwayLine(ac) {
      let best = Infinity;

      for (let i = 0; i < airport.runwayEnds.length; i += 2) {
        const a = airport.runwayEnds[i];
        const b = airport.runwayEnds[i + 1];

        if (!a || !b) continue;

        const ref = (ac.lat + a.lat + b.lat) / 3;
        const ky = 111.32;
        const kx = 111.32 * Math.cos(ref * Math.PI / 180);

        const px = ac.lon * kx;
        const py = ac.lat * ky;

        const ax = a.lon * kx;
        const ay = a.lat * ky;

        const bx = b.lon * kx;
        const by = b.lat * ky;

        const vx = bx - ax;
        const vy = by - ay;

        const wx = px - ax;
        const wy = py - ay;

        const len2 = vx * vx + vy * vy || 1;

        let t = (wx * vx + wy * vy) / len2;
        t = Math.max(0, Math.min(1, t));

        const cx = ax + t * vx;
        const cy = ay + t * vy;

        const d =
          Math.sqrt(
            (px - cx) ** 2 +
            (py - cy) ** 2
          );

        if (d < best) best = d;
      }

      return best;
    }
