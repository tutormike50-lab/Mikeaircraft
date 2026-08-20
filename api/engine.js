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
    // Version 0.4
    // Stage 3: Persistent state tracking
    // =====================================================

    const AIRPORTS = {

      PRG: {
        name: "Prague Airport",
        icao: "LKPR",
        lat: 50.1008,
        lon: 14.2600,

        runwayEnds: [
          { name: "06", heading: 65, lat: 50.1017990, lon: 14.2263002 },
          { name: "24", heading: 245, lat: 50.1160011, lon: 14.2734003 },
          { name: "12", heading: 127, lat: 50.1080017, lon: 14.2454004 },
          { name: "30", heading: 307, lat: 50.0904999, lon: 14.2817001 }
        ]
      },

      LHR: {
        name: "London Heathrow",
        icao: "EGLL",
        lat: 51.471227,
        lon: -0.460881,

        runwayEnds: [
          { name: "09L", heading: 90, lat: 51.477490, lon: -0.489439 },
          { name: "27R", heading: 270, lat: 51.477681, lon: -0.433227 },
          { name: "09R", heading: 90, lat: 51.464780, lon: -0.486808 },
          { name: "27L", heading: 270, lat: 51.464957, lon: -0.434048 }
        ]
      },

      FRA: {
        name: "Frankfurt Airport",
        icao: "EDDF",
        lat: 50.032606,
        lon: 8.540669,

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
        name: "Amsterdam Schiphol",
        icao: "EHAM",
        lat: 52.314875,
        lon: 4.758074,

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
        name: "Paris Charles de Gaulle",
        icao: "LFPG",
        lat: 49.009750,
        lon: 2.562618,

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
        name: "Manchester Airport",
        icao: "EGCC",
        lat: 53.347150,
        lon: -2.283883,

        runwayEnds: [
          { name: "05L", heading: 51, lat: 53.3451004, lon: -2.2927401 },
          { name: "23R", heading: 231, lat: 53.3624001, lon: -2.2571399 },
          { name: "05R", heading: 51, lat: 53.3320010, lon: -2.3106600 },
          { name: "23L", heading: 231, lat: 53.3490980, lon: -2.2749900 }
        ]
      }
    };

    // =====================================================
    // AIRPORT
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

    const now =
      Date.now();

    // =====================================================
    // REDIS
    // =====================================================

    const redisURL =
      process.env.KV_REST_API_URL;

    const redisToken =
      process.env.KV_REST_API_TOKEN;

    const redisAvailable =
      Boolean(redisURL && redisToken);

    async function redisCommand(command) {

      if (!redisAvailable) {
        throw new Error(
          "Redis environment variables unavailable"
        );
      }

      const response =
        await fetch(redisURL, {
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
    // GEOMETRY
    // =====================================================

    function distanceKm(
      lat1,
      lon1,
      lat2,
      lon2
    ) {

      const R = 6371;

      const dLat =
        (lat2 - lat1) *
        Math.PI / 180;

      const dLon =
        (lon2 - lon1) *
        Math.PI / 180;

      const a =
        Math.sin(dLat / 2) ** 2
        +
        Math.cos(lat1 * Math.PI / 180)
        *
        Math.cos(lat2 * Math.PI / 180)
        *
        Math.sin(dLon / 2) ** 2;

      return (
        R *
        2 *
        Math.atan2(
          Math.sqrt(a),
          Math.sqrt(1 - a)
        )
      );
    }

    function headingDiff(a, b) {

      if (
        !Number.isFinite(a)
        ||
        !Number.isFinite(b)
      ) {
        return 180;
      }

      return Math.abs(
        ((a - b + 540) % 360) - 180
      );
    }

    function nearestThreshold(ac) {

      let best = null;
      let bestDistance = Infinity;

      for (
        const end
        of airport.runwayEnds
      ) {

        const d =
          distanceKm(
            ac.lat,
            ac.lon,
            end.lat,
            end.lon
          );

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

      for (
        let i = 0;
        i < airport.runwayEnds.length;
        i += 2
      ) {

        const a =
          airport.runwayEnds[i];

        const b =
          airport.runwayEnds[i + 1];

        if (!a || !b) {
          continue;
        }

        const ref =
          (
            ac.lat +
            a.lat +
            b.lat
          ) / 3;

        const ky =
          111.32;

        const kx =
          111.32 *
          Math.cos(
            ref * Math.PI / 180
          );

        const px =
          ac.lon * kx;

        const py =
          ac.lat * ky;

        const ax =
          a.lon * kx;

        const ay =
          a.lat * ky;

        const bx =
          b.lon * kx;

        const by =
          b.lat * ky;

        const vx =
          bx - ax;

        const vy =
          by - ay;

        const wx =
          px - ax;

        const wy =
          py - ay;

        const len2 =
          vx * vx +
          vy * vy ||
          1;

        let t =
          (
            wx * vx +
            wy * vy
          )
          /
          len2;

        t =
          Math.max(
            0,
            Math.min(
              1,
              t
            )
          );

        const cx =
          ax +
          t * vx;

        const cy =
          ay +
          t * vy;

        const d =
          Math.sqrt(
            (px - cx) ** 2 +
            (py - cy) ** 2
          );

        if (d < best) {
          best = d;
        }
      }

      return best;
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

    for (
      const source
      of sources
    ) {

      try {

        const response =
          await fetch(
            source.url,
            {
              cache: "no-store",

              headers: {
                "User-Agent":
                  "MikeAircraft-Engine-v2"
              }
            }
          );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const text =
          await response.text();

        const data =
          JSON.parse(text);

        const list =
          Array.isArray(data.ac)
            ? data.ac
            : Array.isArray(data.aircraft)
              ? data.aircraft
              : null;

        if (!list) {
          throw new Error(
            "No aircraft array returned"
          );
        }

        rawAircraft =
          list;

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

    // =====================================================
    // LOAD EXISTING ENGINE STATE
    // =====================================================

    const stateKey =
      `mikeaircraft:v2:${airportCode}:state`;

    let savedState = null;

    let redisReadOK = false;
    let redisWriteOK = false;

    let redisError = null;

    if (redisAvailable) {

      try {

        const stored =
          await redisCommand([
            "GET",
            stateKey
          ]);

        redisReadOK =
          true;

        if (stored) {
          savedState =
            JSON.parse(stored);
        }
      }
      catch (error) {

        redisError =
          error.message;
      }
    }

    // =====================================================
    // FALLBACK IF LIVE ADS-B TEMPORARILY FAILS
    // =====================================================

    if (!rawAircraft) {

      const fallback =
        savedState &&
        Array.isArray(
          savedState.lastGoodAircraft
        )
          ? savedState.lastGoodAircraft
          : null;

      const fallbackAge =
        savedState &&
        savedState.lastGoodTimestamp
          ? Math.round(
              (
                now -
                savedState.lastGoodTimestamp
              )
              /
              1000
            )
          : null;

      if (
        !fallback
        ||
        fallbackAge === null
        ||
        fallbackAge > 45
      ) {

        return res.status(502).json({
          ok: false,

          engine:
            "MikeAircraft Engine v2",

          version:
            "0.4",

          stage:
            "STATE_TRACKING",

          error:
            "All ADS-B sources failed",

          sourceErrors,

          memory: {
            redisConnected:
              redisAvailable,

            readOK:
              redisReadOK,

            writeOK:
              false,

            error:
              redisError
          }
        });
      }

      return res.status(200).json({
        ok: true,

        engine:
          "MikeAircraft Engine v2",

        version:
          "0.4",

        stage:
          "STATE_TRACKING",

        dataStatus:
          "STALE",

        staleAgeSeconds:
          fallbackAge,

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
          trackedCount:
            fallback.length,

          source:
            "redis-fallback"
        },

        memory: {
          redisConnected:
            redisAvailable,

          readOK:
            redisReadOK,

          writeOK:
            false,

          error:
            redisError
        },

        aircraft:
          fallback,

        sourceErrors
      });
    }

    // =====================================================
    // NORMALISE AIRCRAFT
    // =====================================================

    const aircraft =
      rawAircraft

        .filter(
          ac =>
            Number.isFinite(
              Number(ac.lat)
            )
            &&
            Number.isFinite(
              Number(ac.lon)
            )
        )

        .map(ac => {

          const id =
            ac.hex
            ||
            ac.r
            ||
            String(
              ac.flight || ""
            ).trim()
            ||
            null;

          const onGround =
            ac.alt_baro === "ground"
            ||
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

          const item = {

            id,

            hex:
              ac.hex || null,

            callsign:
              String(
                ac.flight || ""
              ).trim()
              ||
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

          item.airportDistance =
            distanceKm(
              item.lat,
              item.lon,
              airport.lat,
              airport.lon
            );

          item.runwayDistance =
            distanceToRunwayLine(
              item
            );

          const threshold =
            nearestThreshold(
              item
            );

          item.nearestRunway =
            threshold.runway
              ? threshold.runway.name
              : null;

          item.thresholdDistance =
            threshold.distance;

          item.runwayHeading =
            threshold.runway
              ? threshold.runway.heading
              : null;

          item.runwayAlignment =
            headingDiff(
              item.track,
              item.runwayHeading
            );

          return item;
        })

        .filter(
          ac =>
            ac.id
        );

    // =====================================================
    // EXISTING TRACK HISTORIES
    // =====================================================

    const tracks =
      savedState
      &&
      savedState.tracks
      &&
      typeof savedState.tracks === "object"

        ? savedState.tracks

        : {};

    function recentGroundSample(
      samples,
      seconds
    ) {

      const cutoff =
        now -
        seconds * 1000;

      return samples.some(
        sample =>
          sample.time >= cutoff
          &&
          sample.onGround
      );
    }

    // =====================================================
    // STATE CLASSIFIER
    // =====================================================

    function classify(
      ac,
      history,
      previousState
    ) {

      const samples =
        history.slice(-12);

      const first =
        samples[0] ||
        null;

      const last =
        samples[
          samples.length - 1
        ] ||
        null;

      const prior =
        samples.length >= 2
          ? samples[
              samples.length - 2
            ]
          : null;

      const distanceChange =
        first &&
        last

          ? last.airportDistance
            -
            first.airportDistance

          : 0;

      const altitudeChange =
        first
        &&
        last
        &&
        first.altitude !== null
        &&
        last.altitude !== null

          ? last.altitude
            -
            first.altitude

          : 0;

      const speedChange =
        first
        &&
        last
        &&
        first.speed !== null
        &&
        last.speed !== null

          ? last.speed
            -
            first.speed

          : 0;

      const closing =
        distanceChange < -0.20;

      const opening =
        distanceChange > 0.20;

      const descending =
        (
          ac.verticalRate !== null
          &&
          ac.verticalRate < -150
        )
        ||
        altitudeChange < -150;

      const climbing =
        (
          ac.verticalRate !== null
          &&
          ac.verticalRate > 250
        )
        ||
        altitudeChange > 200;

      const aligned =
        ac.runwayAlignment <= 28;

      const nearRunway =
        ac.runwayDistance <= 0.35;

      const recentGround =
        recentGroundSample(
          samples,
          90
        );

      const justAirborne =
        prior
        &&
        prior.onGround
        &&
        !ac.onGround;

      const justLanded =
        prior
        &&
        !prior.onGround
        &&
        ac.onGround;

      // ---------------------------------------------
      // GROUND STATES
      // ---------------------------------------------

      if (ac.onGround) {

        if (
          justLanded
          ||
          previousState === "ON_FINAL"
          ||
          previousState === "APPROACHING"
        ) {

          return {
            state:
              "LANDED",

            confidence:
              98,

            reason:
              "Air-to-ground transition after arrival"
          };
        }

        if (
          nearRunway
          &&
          ac.speed !== null
          &&
          ac.speed >= 45
          &&
          speedChange > 2
        ) {

          return {
            state:
              "TAKEOFF_ROLL",

            confidence:
              96,

            reason:
              "Accelerating rapidly on runway"
          };
        }

        if (
          nearRunway
          &&
          ac.speed !== null
          &&
          ac.speed >= 10
          &&
          ac.speed < 45
        ) {

          return {
            state:
              "LINE_UP_OR_TAXI",

            confidence:
              72,

            reason:
              "Moving slowly on or beside runway"
          };
        }

        return {
          state:
            "GROUND",

          confidence:
            60,

          reason:
            "Aircraft on ground"
        };
      }

      // ---------------------------------------------
      // DEPARTURE STATES
      // ---------------------------------------------

      if (
        justAirborne
        ||
        previousState ===
          "TAKEOFF_ROLL"
      ) {

        return {
          state:
            "AIRBORNE_DEPARTURE",

          confidence:
            99,

          reason:
            "Ground-to-air transition"
        };
      }

      if (
        recentGround
        &&
        ac.airportDistance <= 10
        &&
        climbing
      ) {

        return {
          state:
            "DEPARTING",

          confidence:
            96,

          reason:
            "Recently on ground and now climbing away"
        };
      }

      // ---------------------------------------------
      // ARRIVAL STATES
      // ---------------------------------------------

      if (
        ac.airportDistance <= 12
        &&
        ac.altitude !== null
        &&
        ac.altitude <= 4200
        &&
        aligned
        &&
        closing
        &&
        !climbing
      ) {

        const final =
          ac.thresholdDistance <= 8
          &&
          ac.altitude <= 3000
          &&
          descending;

        if (final) {

          return {
            state:
              "ON_FINAL",

            confidence:
              96,

            reason:
              "Aligned, descending and closing on runway threshold"
          };
        }

        return {
          state:
            "APPROACHING",

          confidence:
            90,

          reason:
            "Aligned and closing on airport"
        };
      }

      if (
        ac.airportDistance <= 15
        &&
        ac.altitude !== null
        &&
        ac.altitude <= 5000
        &&
        closing
        &&
        descending
      ) {

        return {
          state:
            "APPROACHING",

          confidence:
            82,

          reason:
            "Low, descending and closing on airport"
        };
      }

      if (
        ac.airportDistance <= 12
        &&
        opening
        &&
        climbing
      ) {

        return {
          state:
            "DEPARTING",

          confidence:
            88,

          reason:
            "Climbing and increasing distance from airport"
        };
      }

      return {
        state:
          "AIRBORNE",

        confidence:
          50,

        reason:
          "No strong arrival/departure evidence yet"
      };
    }

    // =====================================================
    // UPDATE HISTORY + CLASSIFY
    // =====================================================

    const classified = [];

    const seenIds =
      new Set();

    for (
      const ac
      of aircraft
    ) {

      seenIds.add(
        ac.id
      );

      const track =
        tracks[ac.id]
        ||
        {
          samples: [],
          state: "UNKNOWN",
          stateSince: now
        };

      track.samples =
        Array.isArray(
          track.samples
        )
          ? track.samples
          : [];

      track.samples.push({

        time:
          now,

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
          ac.verticalRate,

        airportDistance:
          ac.airportDistance,

        runwayDistance:
          ac.runwayDistance,

        thresholdDistance:
          ac.thresholdDistance,

        runwayAlignment:
          ac.runwayAlignment
      });

      track.samples =
        track.samples

          .filter(
            sample =>
              sample.time >=
              now - 120000
          )

          .slice(-24);

      const decision =
        classify(
          ac,
          track.samples,
          track.state
        );

      if (
        decision.state !==
        track.state
      ) {

        track.state =
          decision.state;

        track.stateSince =
          now;
      }

      track.confidence =
        decision.confidence;

      track.reason =
        decision.reason;

      track.lastSeen =
        now;

      tracks[ac.id] =
        track;

      classified.push({

        ...ac,

        state:
          track.state,

        confidence:
          track.confidence,

        reason:
          track.reason,

        stateAgeSeconds:
          Math.round(
            (
              now -
              track.stateSince
            )
            /
            1000
          ),

        sampleCount:
          track.samples.length
      });
    }

    // =====================================================
    // REMOVE OLD TRACKS
    // =====================================================

    for (
      const [
        id,
        track
      ]
      of Object.entries(
        tracks
      )
    ) {

      if (
        !seenIds.has(id)
        &&
        (
          !track.lastSeen
          ||
          track.lastSeen <
            now - 180000
        )
      ) {

        delete tracks[id];
      }
    }

    // =====================================================
    // STATE COUNTS
    // =====================================================

    const stateCounts = {};

    for (
      const ac
      of classified
    ) {

      stateCounts[
        ac.state
      ] =
        (
          stateCounts[
            ac.state
          ]
          ||
          0
        )
        +
        1;
    }

    // =====================================================
    // NEXT ARRIVAL
    // =====================================================

    const nextArrival =
      classified

        .filter(
          ac =>
            [
              "ON_FINAL",
              "APPROACHING"
            ]
            .includes(
              ac.state
            )
        )

        .sort(
          (
            a,
            b
          ) => {

            if (
              a.state === "ON_FINAL"
              &&
              b.state !== "ON_FINAL"
            ) {
              return -1;
            }

            if (
              b.state === "ON_FINAL"
              &&
              a.state !== "ON_FINAL"
            ) {
              return 1;
            }

            return (
              a.thresholdDistance
              -
              b.thresholdDistance
            );
          }
        )[0]
        ||
        null;

    // =====================================================
    // NEXT DEPARTURE
    // =====================================================

    const nextDeparture =
      classified

        .filter(
          ac =>
            [
              "TAKEOFF_ROLL",
              "AIRBORNE_DEPARTURE",
              "DEPARTING",
              "LINE_UP_OR_TAXI"
            ]
            .includes(
              ac.state
            )
        )

        .sort(
          (
            a,
            b
          ) => {

            const priority = {
              TAKEOFF_ROLL: 0,
              AIRBORNE_DEPARTURE: 1,
              DEPARTING: 2,
              LINE_UP_OR_TAXI: 3
            };

            const pa =
              priority[
                a.state
              ]
              ??
              9;

            const pb =
              priority[
                b.state
              ]
              ??
              9;

            if (pa !== pb) {
              return pa - pb;
            }

            return (
              a.airportDistance
              -
              b.airportDistance
            );
          }
        )[0]
        ||
        null;

    // =====================================================
    // SAVE ENGINE STATE
    // =====================================================

    const stateToStore = {

      updatedAt:
        now,

      tracks,

      lastGoodTimestamp:
        now,

      lastGoodAircraft:
        classified
    };

    if (redisAvailable) {

      try {

        await redisCommand([
          "SET",
          stateKey,
          JSON.stringify(
            stateToStore
          ),
          "EX",
          "900"
        ]);

        redisWriteOK =
          true;
      }
      catch (error) {

        redisError =
          redisError
          ||
          error.message;
      }
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({

      ok: true,

      engine:
        "MikeAircraft Engine v2",

      version:
        "0.4",

      stage:
        "STATE_TRACKING",

      dataStatus:
        "LIVE",

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
          classified.length,

        source:
          sourceUsed
      },

      memory: {

        redisConnected:
          redisAvailable,

        readOK:
          redisReadOK,

        writeOK:
          redisWriteOK,

        trackedHistories:
          Object.keys(
            tracks
          ).length,

        error:
          redisError
      },

      intelligence: {

        stateCounts,

        nextArrival:
          nextArrival
            ? {

                id:
                  nextArrival.id,

                callsign:
                  nextArrival.callsign,

                registration:
                  nextArrival.registration,

                type:
                  nextArrival.type,

                state:
                  nextArrival.state,

                confidence:
                  nextArrival.confidence,

                runway:
                  nextArrival.nearestRunway,

                distanceKm:
                  Number(
                    nextArrival
                      .airportDistance
                      .toFixed(2)
                  ),

                thresholdKm:
                  Number(
                    nextArrival
                      .thresholdDistance
                      .toFixed(2)
                  ),

                altitude:
                  nextArrival.altitude,

                speed:
                  nextArrival.speed
              }

            : null,

        nextDeparture:
          nextDeparture
            ? {

                id:
                  nextDeparture.id,

                callsign:
                  nextDeparture.callsign,

                registration:
                  nextDeparture.registration,

                type:
                  nextDeparture.type,

                state:
                  nextDeparture.state,

                confidence:
                  nextDeparture.confidence,

                runway:
                  nextDeparture.nearestRunway,

                distanceKm:
                  Number(
                    nextDeparture
                      .airportDistance
                      .toFixed(2)
                  ),

                altitude:
                  nextDeparture.altitude,

                speed:
                  nextDeparture.speed
              }

            : null
      },

      aircraft:
        classified
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
        "0.4",

      stage:
        "STATE_TRACKING",

      error:
        error.message
    });
  }
};
