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
    // Version 0.3
    // Stage 2: Live ADS-B + Persistent Aircraft Memory
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

    // =====================================================
    // AIRPORT SELECTION
    // =====================================================

    const requestedCode =
      String(req.query.airport || "PRG").toUpperCase();

    const airportCode =
      AIRPORTS[requestedCode]
        ? requestedCode
        : "PRG";

    const airport =
      AIRPORTS[airportCode];

    const radius = 20;

    // =====================================================
    // UPSTASH REDIS CONNECTION
    // =====================================================

    const redisURL =
      process.env.MIKEAIRCRAFT_KV_REST_API_URL;

    const redisToken =
      process.env.MIKEAIRCRAFT_KV_REST_API_TOKEN;

    const redisAvailable =
      Boolean(redisURL && redisToken);

    async function redisCommand(command) {
      if (!redisAvailable) {
        throw new Error(
          "MikeAircraft Redis environment variables unavailable"
        );
      }

      const response = await fetch(redisURL, {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${redisToken}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(command)
      });

      if (!response.ok) {
        const body =
          await response.text();

        throw new Error(
          `Redis HTTP ${response.status}: ${body}`
        );
      }

      const result =
        await response.json();

      if (result.error) {
        throw new Error(
          `Redis error: ${result.error}`
        );
      }

      return result.result;
    }

    // =====================================================
    // ADS-B SOURCES
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
        const response =
          await fetch(source.url, {
            cache: "no-store",

            headers: {
              "User-Agent":
                "MikeAircraft-Engine-v2"
            }
          });

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const text =
          await response.text();

        let data;

        try {
          data =
            JSON.parse(text);
        }
        catch {
          throw new Error(
            "Source returned non-JSON data"
          );
        }

        if (!Array.isArray(data.ac)) {
          throw new Error(
            "No aircraft array returned"
          );
        }

        rawAircraft =
          data.ac;

        sourceUsed =
          source.name;

        break;
      }
      catch (error) {
        sourceErrors.push({
          source:
            source.name,

          error:
            error.message
        });
      }
    }

    if (!rawAircraft) {
      return res.status(502).json({
        ok: false,

        engine:
          "MikeAircraft Engine v2",

        version:
          "0.3",

        stage:
          "PERSISTENT_MEMORY",

        error:
          "All ADS-B sources failed",

        sourceErrors
      });
    }

    // =====================================================
    // STANDARDISE AIRCRAFT DATA
    // =====================================================

    const now =
      Date.now();

    const aircraft =
      rawAircraft

        .filter(ac =>
          Number.isFinite(Number(ac.lat)) &&
          Number.isFinite(Number(ac.lon))
        )

        .map(ac => {
          const id =
            ac.hex ||
            ac.r ||
            String(ac.flight || "").trim() ||
            null;

          const onGround =
            ac.alt_baro === "ground" ||
            ac.alt_geom === "ground";

          let altitude = null;

          if (onGround) {
            altitude = 0;
          }
          else if (
            Number.isFinite(
              Number(ac.alt_baro)
            )
          ) {
            altitude =
              Number(ac.alt_baro);
          }
          else if (
            Number.isFinite(
              Number(ac.alt_geom)
            )
          ) {
            altitude =
              Number(ac.alt_geom);
          }

          let verticalRate = null;

          if (
            Number.isFinite(
              Number(ac.baro_rate)
            )
          ) {
            verticalRate =
              Number(ac.baro_rate);
          }
          else if (
            Number.isFinite(
              Number(ac.geom_rate)
            )
          ) {
            verticalRate =
              Number(ac.geom_rate);
          }

          return {
            id,

            hex:
              ac.hex || null,

            callsign:
              String(ac.flight || "").trim() ||
              null,

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

            altitude,

            onGround,

            speed:
              Number.isFinite(
                Number(ac.gs)
              )
                ? Number(ac.gs)
                : null,

            track:
              Number.isFinite(
                Number(ac.track)
              )
                ? Number(ac.track)
                : null,

            verticalRate,

            positionAge:
              Number.isFinite(
                Number(ac.seen_pos)
              )
                ? Number(ac.seen_pos)
                : null
          };
        })

        .filter(ac => ac.id);

    // =====================================================
    // SNAPSHOT STORAGE
    // =====================================================

    const memoryKey =
      `mikeaircraft:v2:${airportCode}:snapshot`;

    const currentSnapshot = {
      timestamp:
        now,

      aircraft:
        aircraft.map(ac => ({
          id:
            ac.id,

          lat:
            ac.lat,

          lon:
            ac.lon,

          altitude:
            ac.altitude,

          onGround:
            ac.onGround,

          speed:
            ac.speed,

          track:
            ac.track,

          verticalRate:
            ac.verticalRate
        }))
    };

    // =====================================================
    // READ PREVIOUS MEMORY
    // =====================================================

    let previousSnapshot = null;

    let memoryReadOK = false;
    let memoryWriteOK = false;

    let memoryError = null;

    if (redisAvailable) {
      try {
        const stored =
          await redisCommand([
            "GET",
            memoryKey
          ]);

        memoryReadOK =
          true;

        if (stored) {
          try {
            previousSnapshot =
              JSON.parse(stored);
          }
          catch {
            previousSnapshot =
              null;
          }
        }

        // =================================================
        // WRITE CURRENT SNAPSHOT
        // Keep temporary airport memory for 10 minutes.
        // =================================================

        await redisCommand([
          "SET",
          memoryKey,
          JSON.stringify(currentSnapshot),
          "EX",
          "600"
        ]);

        memoryWriteOK =
          true;
      }
      catch (error) {
        memoryError =
          error.message;
      }
    }
    else {
      memoryError =
        "Redis environment variables unavailable";
    }

    // =====================================================
    // BUILD PREVIOUS AIRCRAFT MAP
    // =====================================================

    const previousMap =
      new Map();

    if (
      previousSnapshot &&
      Array.isArray(previousSnapshot.aircraft)
    ) {
      for (
        const previous
        of previousSnapshot.aircraft
      ) {
        previousMap.set(
          previous.id,
          previous
        );
      }
    }

    // =====================================================
    // COMPARE CURRENT VS PREVIOUS
    // =====================================================

    let matchedAircraft = 0;

    const movementSamples = [];

    for (const ac of aircraft) {
      const previous =
        previousMap.get(ac.id);

      if (!previous) {
        continue;
      }

      matchedAircraft++;

      let altitudeChange = null;

      if (
        ac.altitude !== null &&
        previous.altitude !== null
      ) {
        altitudeChange =
          ac.altitude -
          previous.altitude;
      }

      let speedChange = null;

      if (
        ac.speed !== null &&
        previous.speed !== null
      ) {
        speedChange =
          ac.speed -
          previous.speed;
      }

      const groundTransition =
        previous.onGround !==
        ac.onGround;

      // Only show a few samples in the diagnostic JSON.
      if (movementSamples.length < 10) {
        movementSamples.push({
          id:
            ac.id,

          callsign:
            ac.callsign,

          type:
            ac.type,

          wasOnGround:
            previous.onGround,

          onGround:
            ac.onGround,

          altitude:
            ac.altitude,

          altitudeChange,

          speed:
            ac.speed,

          speedChange,

          verticalRate:
            ac.verticalRate,

          groundTransition
        });
      }
    }

    // =====================================================
    // PREVIOUS SNAPSHOT AGE
    // =====================================================

    let previousAgeSeconds = null;

    if (
      previousSnapshot &&
      Number.isFinite(
        Number(previousSnapshot.timestamp)
      )
    ) {
      previousAgeSeconds =
        Math.round(
          (
            now -
            Number(previousSnapshot.timestamp)
          ) / 1000
        );
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      ok: true,

      engine:
        "MikeAircraft Engine v2",

      version:
        "0.3",

      stage:
        "PERSISTENT_MEMORY",

      timestamp:
        new Date(now).toISOString(),

      airport: {
        code:
          airportCode,

        icao:
          airport.icao,

        name:
          airport.name,

        lat:
          airport.lat,

        lon:
          airport.lon
      },

      traffic: {
        rawCount:
          rawAircraft.length,

        trackedCount:
          aircraft.length,

        source:
          sourceUsed
      },

      memory: {
        redisConnected:
          redisAvailable,

        readOK:
          memoryReadOK,

        writeOK:
          memoryWriteOK,

        previousSnapshotFound:
          Boolean(previousSnapshot),

        previousAgeSeconds,

        previousAircraftCount:
          previousSnapshot &&
          Array.isArray(
            previousSnapshot.aircraft
          )
            ? previousSnapshot.aircraft.length
            : 0,

        matchedAircraft,

        error:
          memoryError
      },

      movementSamples,

      aircraft
    });
  }
  catch (error) {
    console.error(
      "MikeAircraft Engine v2 error:",
      error
    );

    return res.status(500).json({
      ok: false,

      engine:
        "MikeAircraft Engine v2",

      version:
        "0.3",

      stage:
        "PERSISTENT_MEMORY",

      error:
        error.message
    });
  }
};
