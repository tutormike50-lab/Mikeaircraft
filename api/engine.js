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
    // Stage 2: ADS-B ingestion + persistent aircraft memory
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

    // =====================================================
    // AIRPORT SELECTION
    // =====================================================

    const requestedCode =
      String(req.query.airport || "PRG").toUpperCase();

    const airport =
      AIRPORTS[requestedCode] || AIRPORTS.PRG;

    const airportCode =
      AIRPORTS[requestedCode]
        ? requestedCode
        : "PRG";

    const radius = 20;

    // =====================================================
    // REDIS / UPSTASH CONNECTION
    // Credentials were created automatically by Vercel.
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
          "MikeAircraft Redis environment variables are missing"
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
        throw new Error(
          `Redis HTTP ${response.status}`
        );
      }

      const data =
        await response.json();

      if (data.error) {
        throw new Error(
          `Redis: ${data.error}`
        );
      }

      return data.result;
    }

    // =====================================================
    // DIRECT ADS-B SOURCES
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
        } catch {
          throw new Error(
            "Source returned non-JSON data"
          );
        }

        if (!Array.isArray(data.ac)) {
          throw new Error(
            "No aircraft array"
          );
        }

        rawAircraft =
          data.ac;

        sourceUsed =
          source.name;

        break;

      } catch (error) {
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
    // BUILD COMPACT MEMORY SNAPSHOT
    //
    // We store ONE Redis record per airport, rather than
    // one Redis command for every individual aircraft.
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
    // READ PREVIOUS SNAPSHOT
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

        if (stored) {
          try {
            previousSnapshot =
              JSON.parse(stored);

            memoryReadOK =
              true;
          }
          catch {
            previousSnapshot =
              null;
          }
        }
        else {
          // Redis worked, but this is simply the
          // first observation for this airport.
          memoryReadOK =
            true;
        }

        // =================================================
        // WRITE CURRENT SNAPSHOT
        //
        // Expire after 10 minutes. If an airport stops being
        // used, its temporary tracking memory disappears.
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

      } catch (error) {
        memoryError =
          error.message;
      }
    }
    else {
      memoryError =
        "Redis environment variables unavailable";
    }

    // =====================================================
    // COMPARE CURRENT AIRCRAFT WITH PREVIOUS OBSERVATION
    // =====================================================

    const previousMap =
      new Map();

    if (
      previousSnapshot &&
      Array.isArray(previousSnapshot.aircraft)
    ) {
      for (
        const oldAircraft
        of previousSnapshot.aircraft
      ) {
        previousMap.set(
          oldAircraft.id,
          oldAircraft
        );
      }
    }

    let matchedAircraft = 0;

    const movementSamples = [];

    for (const ac of aircraft) {
      const previous =
        previousMap.get(ac.id);

      if (!previous) {
        continue;
      }

      matchedAircraft++;

      const altitudeChange =
        (
          ac.altitude !== null &&
          previous.altitude !== null
        )
          ? ac.altitude -
            previous.altitude
          : null;

      const speedChange =
        (
          ac.speed !== null &&
          previous.speed !== null
        )
          ? ac.speed -
            previous.speed
          : null;

      const groundTransition =
        previous.onGround !==
        ac.onGround;

      if (
        movementSamples.length < 8
      ) {
        movementSamples.push({
          id:
            ac.id,

          callsign:
            ac.callsign,

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
    // HOW OLD WAS THE PREVIOUS OBSERVATION?
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

  } catch (error) {
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
