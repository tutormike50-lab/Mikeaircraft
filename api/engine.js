export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // ---------------------------------------------
    // MIKEAIRCRAFT ENGINE v2
    // Stage 1: Live ADS-B aircraft ingestion
    // ---------------------------------------------

    const airports = {
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
        lat: 49.009750,
        lon: 2.562618
      },

      MAN: {
        name: "Manchester Airport",
        icao: "EGCC",
        lat: 53.347150,
        lon: -2.283883
      }
    };

    // Airport can later be selected from the tablet.
    // For now PRG is the default.
    const requestedAirport =
      String(req.query.airport || "PRG").toUpperCase();

    const airport =
      airports[requestedAirport] || airports.PRG;

    // Use the existing MikeAircraft nearby endpoint.
    // This keeps ADS-B access in one place.
    const host =
      req.headers["x-forwarded-host"] ||
      req.headers.host;

    const protocol =
      req.headers["x-forwarded-proto"] || "https";

    const nearbyURL =
      `${protocol}://${host}/api/nearby` +
      `?lat=${airport.lat}` +
      `&lon=${airport.lon}` +
      `&radius=20`;

    const response = await fetch(nearbyURL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `Nearby ADS-B feed returned HTTP ${response.status}`
      );
    }

    const data = await response.json();

    const rawAircraft =
      Array.isArray(data.ac) ? data.ac : [];

    // Create a clean standard aircraft object.
    // Future engine stages will work with THIS format,
    // rather than depending directly on ADS-B field names.
    const aircraft = rawAircraft
      .filter(ac =>
        Number.isFinite(Number(ac.lat)) &&
        Number.isFinite(Number(ac.lon))
      )
      .map(ac => ({
        id:
          ac.hex ||
          ac.r ||
          (ac.flight || "").trim() ||
          null,

        hex: ac.hex || null,

        callsign:
          (ac.flight || "").trim() || null,

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
          ac.alt_baro === "ground"
            ? 0
            : Number.isFinite(Number(ac.alt_baro))
              ? Number(ac.alt_baro)
              : Number.isFinite(Number(ac.alt_geom))
                ? Number(ac.alt_geom)
                : null,

        onGround:
          ac.alt_baro === "ground" ||
          ac.alt_geom === "ground",

        speed:
          Number.isFinite(Number(ac.gs))
            ? Number(ac.gs)
            : null,

        track:
          Number.isFinite(Number(ac.track))
            ? Number(ac.track)
            : null,

        verticalRate:
          Number.isFinite(Number(ac.baro_rate))
            ? Number(ac.baro_rate)
            : Number.isFinite(Number(ac.geom_rate))
              ? Number(ac.geom_rate)
              : null,

        positionAge:
          Number.isFinite(Number(ac.seen_pos))
            ? Number(ac.seen_pos)
            : null
      }))
      .filter(ac => ac.id);

    return res.status(200).json({
      ok: true,

      engine: "MikeAircraft Engine v2",

      version: "0.2",

      stage: "LIVE_INGESTION",

      timestamp:
        new Date().toISOString(),

      airport: {
        code: requestedAirport,
        icao: airport.icao,
        name: airport.name,
        lat: airport.lat,
        lon: airport.lon
      },

      traffic: {
        rawCount: rawAircraft.length,
        trackedCount: aircraft.length
      },

      aircraft
    });

  } catch (error) {

    console.error(
      "MikeAircraft Engine error:",
      error
    );

    return res.status(500).json({
      ok: false,
      engine: "MikeAircraft Engine v2",
      version: "0.2",
      error: error.message
    });
  }
}
