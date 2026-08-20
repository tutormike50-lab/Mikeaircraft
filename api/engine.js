module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    // =====================================================
    // MIKEAIRCRAFT ENGINE v2
    // Stage 1: Live ADS-B ingestion
    // =====================================================

    const AIRPORTS = {
      PRG: {
        name: "Prague Airport",
        icao: "LKPR",
        lat: 50.1008,
        lon: 14.2600
      },

      LHR: {
        name: "London Heathrow",
        icao: "EGLL",
        lat: 51.471227,
        lon: -0.460881
      },

      FRA: {
        name: "Frankfurt Airport",
        icao: "EDDF",
        lat: 50.032606,
        lon: 8.540669
      },

      AMS: {
        name: "Amsterdam Schiphol",
        icao: "EHAM",
        lat: 52.314875,
        lon: 4.758074
      },

      CDG: {
        name: "Paris Charles de Gaulle",
        icao: "LFPG",
        lat: 49.00975,
        lon: 2.562618
      },

      MAN: {
        name: "Manchester Airport",
        icao: "EGCC",
        lat: 53.34715,
        lon: -2.283883
      }
    };

    const requestedCode =
      String(req.query.airport || "PRG").toUpperCase();

    const airport =
      AIRPORTS[requestedCode] || AIRPORTS.PRG;

    const airportCode =
      AIRPORTS[requestedCode] ? requestedCode : "PRG";

    const radius = 20;

    // =====================================================
    // DIRECT ADS-B SOURCES
    // Engine v2 does not depend on nearby.js
    // =====================================================

    const sources = [
      {
        name: "adsb.lol",
        url:
          `https://api.adsb.lol/v2/point/` +
          `${airport.lat}/${airport.lon}/${radius}`
      },

      {
        name: "airplanes.live",
        url:
          `https://api.airplanes.live/v2/point/` +
          `${airport.lat}/${airport.lon}/${radius}`
      },

      {
        name: "adsb.fi",
        url:
          `https://opendata.adsb.fi/api/v2/lat/` +
          `${airport.lat}/lon/${airport.lon}/dist/${radius}`
      }
    ];

    let rawAircraft = null;
    let sourceUsed = null;
    const sourceErrors = [];

    for (const source of sources) {
      try {
        const response = await fetch(source.url, {
          cache: "no-store",
          headers: {
            "User-Agent": "MikeAircraft-Engine-v2"
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();

        let data;

        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("Source returned non-JSON data");
        }

        if (!Array.isArray(data.ac)) {
          throw new Error("No aircraft array");
        }

        rawAircraft = data.ac;
        sourceUsed = source.name;
        break;

      } catch (error) {
        sourceErrors.push({
          source: source.name,
          error: error.message
        });
      }
    }

    if (!rawAircraft) {
      return res.status(502).json({
        ok: false,
        engine: "MikeAircraft Engine v2",
        version: "0.2",
        stage: "LIVE_INGESTION",
        error: "All ADS-B sources failed",
        sourceErrors
      });
    }

    // =====================================================
    // STANDARDISE AIRCRAFT DATA
    // =====================================================

    const aircraft = rawAircraft
      .filter(ac => {
        return (
          Number.isFinite(Number(ac.lat)) &&
          Number.isFinite(Number(ac.lon))
        );
      })
      .map(ac => {
        const id =
          ac.hex ||
          ac.r ||
          String(ac.flight || "").trim() ||
          null;

        const onGround =
          ac.alt_baro === "ground" ||
          ac.alt_geom === "ground";

        let alt = null;

        if (onGround) {
          alt = 0;
        } else if (Number.isFinite(Number(ac.alt_baro))) {
          alt = Number(ac.alt_baro);
        } else if (Number.isFinite(Number(ac.alt_geom))) {
          alt = Number(ac.alt_geom);
        }

        let verticalRate = null;

        if (Number.isFinite(Number(ac.baro_rate))) {
          verticalRate = Number(ac.baro_rate);
        } else if (Number.isFinite(Number(ac.geom_rate))) {
          verticalRate = Number(ac.geom_rate);
        }

        return {
          id,

          hex:
            ac.hex || null,

          callsign:
            String(ac.flight || "").trim() || null,

          registration:
            ac.r || null,

          type:
            ac.t || null,

          category:
            ac.category || null,

          lat:
            Number(ac.lat),

          lon:
            Number(ac.lon),

          altitude:
            alt,

          onGround,

          speed:
            Number.isFinite(Number(ac.gs))
              ? Number(ac.gs)
              : null,

          track:
            Number.isFinite(Number(ac.track))
              ? Number(ac.track)
              : null,

          verticalRate,

          positionAge:
            Number.isFinite(Number(ac.seen_pos))
              ? Number(ac.seen_pos)
              : null
        };
      })
      .filter(ac => ac.id);

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      ok: true,

      engine:
        "MikeAircraft Engine v2",

      version:
        "0.2",

      stage:
        "LIVE_INGESTION",

      timestamp:
        new Date().toISOString(),

      airport: {
        code: airportCode,
        icao: airport.icao,
        name: airport.name,
        lat: airport.lat,
        lon: airport.lon
      },

      traffic: {
        rawCount: rawAircraft.length,
        trackedCount: aircraft.length,
        source: sourceUsed
      },

      aircraft
    });

  } catch (error) {
    console.error(
      "MikeAircraft Engine v2 error:",
      error
    );

    return res.status(500).json({
      ok: false,
      engine: "MikeAircraft Engine v2",
      version: "0.2",
      error: error.message
    });
  }
};
