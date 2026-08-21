// MikeAircraft Broadcast API
// Version 0.2
//
// Directly invokes MikeAircraft Engine inside the same
// Vercel function environment.
// No public HTTP self-fetch, so Vercel deployment
// protection cannot block it.

const engineHandler =
  require("./engine.js");

module.exports = async function handler(req, res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  try {

    const airport =
      String(
        req.query.airport || "PRG"
      )
        .trim()
        .toUpperCase();

    // =====================================================
    // RUN ENGINE DIRECTLY
    // =====================================================

    let engineStatus = 200;
    let engineData = null;

    const fakeReq = {
      method: "GET",

      query: {
        airport
      },

      headers:
        req.headers || {}
    };

    const fakeRes = {

      setHeader() {
        return fakeRes;
      },

      status(code) {
        engineStatus = code;
        return fakeRes;
      },

      json(data) {
        engineData = data;
        return data;
      },

      send(data) {
        engineData = data;
        return data;
      },

      end() {
        return null;
      }
    };

    await engineHandler(
      fakeReq,
      fakeRes
    );

    if (
      !engineData ||
      engineStatus >= 400 ||
      !engineData.ok
    ) {

      const detail =
        engineData &&
        engineData.error
          ? (
              typeof engineData.error === "string"
                ? engineData.error
                : JSON.stringify(
                    engineData.error
                  )
            )
          : "Engine request failed";

      throw new Error(
        detail
      );
    }

    // =====================================================
    // FORMAT TARGET FOR BROADCAST
    // =====================================================

    function formatTarget(
      target,
      role
    ) {

      if (!target) {

        return {
          available: false,

          role,

          callsign: null,
          registration: null,
          typeCode: null,

          state: null,
          lineage: null,

          runway: null,

          distanceKm: null,
          thresholdKm: null,

          altitudeFt: null,
          speedKt: null,

          confidence: null,
          score: null
        };
      }

      return {
        available: true,

        role,

        callsign:
          target.callsign || null,

        registration:
          target.registration || null,

        typeCode:
          target.type || null,

        state:
          target.state || null,

        lineage:
          target.lineage || null,

        runway:
          target.runway || null,

        distanceKm:
          target.distanceKm ?? null,

        thresholdKm:
          target.thresholdKm ?? null,

        altitudeFt:
          target.altitude ?? null,

        speedKt:
          target.speed ?? null,

        confidence:
          target.confidence ?? null,

        score:
          target.score ?? null
      };
    }

    // =====================================================
    // ENGINE INTELLIGENCE
    // =====================================================

    const intelligence =
      engineData.intelligence || {};

    const current =
      formatTarget(
        intelligence.current,
        "CURRENT"
      );

    const nextIn =
      formatTarget(
        intelligence.nextIn,
        "NEXT_IN"
      );

    const nextOut =
      formatTarget(
        intelligence.nextOut,
        "NEXT_OUT"
      );

    // =====================================================
    // BASIC BROADCAST DISPLAY MODE
    // =====================================================

    let displayMode =
      "IDLE";

    let primaryRole =
      null;

    if (current.available) {

      displayMode =
        "PRIMARY";

      primaryRole =
        "CURRENT";
    }

    else if (nextIn.available) {

      displayMode =
        "PREVIEW";

      primaryRole =
        "NEXT_IN";
    }

    else if (nextOut.available) {

      displayMode =
        "PREVIEW";

      primaryRole =
        "NEXT_OUT";
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res
      .status(200)
      .json({

        ok: true,

        service:
          "MikeAircraft Broadcast",

        version:
          "0.2",

        generatedAt:
          new Date()
            .toISOString(),

        airport: {
          code:
            engineData.airport?.code ||
            airport,

          icao:
            engineData.airport?.icao ||
            null,

          name:
            engineData.airport?.name ||
            null
        },

        engine: {
          version:
            engineData.version || null,

          stage:
            engineData.stage || null,

          dataStatus:
            engineData.dataStatus || null,

          source:
            engineData.traffic?.source ||
            null
        },

        display: {
          mode:
            displayMode,

          primaryRole
        },

        aircraft: {
          current,
          nextIn,
          nextOut
        }
      });
  }

  catch (error) {

    console.error(
      "MikeAircraft Broadcast error:",
      error
    );

    return res
      .status(500)
      .json({

        ok: false,

        service:
          "MikeAircraft Broadcast",

        version:
          "0.2",

        error:
          error.message
      });
  }
};
