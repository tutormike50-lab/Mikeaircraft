// MikeAircraft Aircraft Information Service
// Version 0.1
//
// Detailed aircraft lookup using ADSBDB.
//
// Lookup priority:
// 1. Registration
// 2. Mode-S / ICAO hex
//
// Returns detailed aircraft identity for the
// MikeAircraft Broadcast system.

module.exports = async function handler(req, res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=604800"
  );

  try {
    const registration =
      String(req.query.registration || "")
        .trim()
        .toUpperCase();

    const hex =
      String(req.query.hex || "")
        .trim()
        .toUpperCase();

    const lookup =
      registration || hex;

    if (!lookup) {
      return res.status(400).json({
        ok: false,

        service:
          "MikeAircraft Aircraft Information",

        version:
          "0.1",

        error:
          "Missing registration or hex"
      });
    }

    // =====================================================
    // ADSBDB AIRCRAFT LOOKUP
    // =====================================================

    const url =
      "https://api.adsbdb.com/v0/aircraft/" +
      encodeURIComponent(lookup);

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        7000
      );

    let response;

    try {
      response =
        await fetch(
          url,
          {
            headers: {
              Accept:
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

    // =====================================================
    // UNKNOWN AIRCRAFT
    // =====================================================

    if (response.status === 404) {
      return res.status(200).json({
        ok: true,

        service:
          "MikeAircraft Aircraft Information",

        version:
          "0.1",

        lookup,

        found:
          false,

        aircraft:
          null
      });
    }

    if (!response.ok) {
      return res.status(502).json({
        ok: false,

        service:
          "MikeAircraft Aircraft Information",

        version:
          "0.1",

        error:
          "Aircraft database returned status " +
          response.status
      });
    }

    const data =
      await response.json();

    const aircraft =
      data &&
      data.response &&
      data.response.aircraft
        ? data.response.aircraft
        : null;

    if (!aircraft) {
      return res.status(200).json({
        ok: true,

        service:
          "MikeAircraft Aircraft Information",

        version:
          "0.1",

        lookup,

        found:
          false,

        aircraft:
          null
      });
    }

    // =====================================================
    // CLEAN BROADCAST-FRIENDLY RESPONSE
    // =====================================================

    return res.status(200).json({
      ok: true,

      service:
        "MikeAircraft Aircraft Information",

      version:
        "0.1",

      lookup,

      found:
        true,

      aircraft: {
        registration:
          aircraft.registration ||
          registration ||
          null,

        modeS:
          aircraft.mode_s ||
          hex ||
          null,

        manufacturer:
          aircraft.manufacturer ||
          null,

        type:
          aircraft.type ||
          null,

        icaoType:
          aircraft.icao_type ||
          null,

        owner:
          aircraft.registered_owner ||
          null,

        ownerCountry:
          aircraft.registered_owner_country_name ||
          null,

        operatorFlag:
          aircraft.registered_owner_operator_flag_code ||
          null,

        photo:
          aircraft.url_photo ||
          null,

        thumbnail:
          aircraft.url_photo_thumbnail ||
          null
      }
    });
  }

  catch (error) {
    const timedOut =
      error.name === "AbortError";

    return res
      .status(
        timedOut
          ? 504
          : 500
      )
      .json({
        ok: false,

        service:
          "MikeAircraft Aircraft Information",

        version:
          "0.1",

        error:
          timedOut
            ? "Aircraft database request timed out"
            : error.message
      });
  }
};
