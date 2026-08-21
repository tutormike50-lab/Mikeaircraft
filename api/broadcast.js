// MikeAircraft Broadcast API
// Version 0.1
//
// Purpose:
// Convert MikeAircraft Engine intelligence into a clean,
// stable feed for livestream graphics.
//
// Future:
// airline + route + aircraft enrichment
// route map data
// intelligent display modes
// NEXT aircraft
// aircraft profile graphics
// storytelling / recent history

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const airport =
      String(req.query.airport || "PRG")
        .trim()
        .toUpperCase();

    // =====================================================
    // CALL THE EXISTING ENGINE
    // =====================================================

    const protocol =
      req.headers["x-forwarded-proto"] ||
      "https";

    const host =
      req.headers.host;

    if (!host) {
      throw new Error(
        "Unable to determine server host"
      );
    }

    const engineUrl =
      protocol +
      "://" +
      host +
      "/api/engine?airport=" +
      encodeURIComponent(airport);

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        12000
      );

    let response;

    try {
      response =
        await fetch(
          engineUrl,
          {
            cache: "no-store",
            headers: {
              "Accept":
                "application/json"
            },
            signal:
              controller.signal
          }
        );
    }
    finally {
      clearTimeout(timeout);
    }

    const raw =
      await response.text();

    let engine;

    try {
      engine =
        JSON.parse(raw);
    }
    catch {
      throw new Error(
        "Engine returned invalid JSON"
      );
    }

   if (
  !response.ok ||
  !engine.ok
) {
  const engineError =
    typeof engine.error === "string"
      ? engine.error
      : JSON.stringify(
          engine.error ||
          engine
        );

  throw new Error(
    engineError ||
    "Engine request failed"
  );
}

    // =====================================================
    // BROADCAST TARGET FORMATTER
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
      engine.intelligence || {};

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
    // BASIC DISPLAY DECISION
    //
    // This will become much smarter later.
    // For now:
    //
    // CURRENT exists -> PRIMARY
    // otherwise NEXT IN -> PREVIEW
    // otherwise NEXT OUT -> PREVIEW
    // otherwise IDLE
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
    // BROADCAST RESPONSE
    // =====================================================

    return res
      .status(200)
      .json({
        ok: true,

        service:
          "MikeAircraft Broadcast",

        version:
          "0.1",

        generatedAt:
          new Date().toISOString(),

        airport,

        engine: {
          version:
            engine.version || null,

          dataStatus:
            engine.dataStatus || null
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
    const timedOut =
      error.name ===
      "AbortError";

    return res
      .status(
        timedOut ? 504 : 500
      )
      .json({
        ok: false,

        service:
          "MikeAircraft Broadcast",

        version:
          "0.1",

        error:
          timedOut
            ? "Engine request timed out"
            : error.message
      });
  }
};
