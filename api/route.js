// MikeAircraft Route Test
// Version 0.3
// Automatic:
// callsign -> live aircraft position -> route lookup

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const callsign = String(req.query.callsign || "")
      .trim()
      .toUpperCase();

    if (!callsign) {
      return res.status(400).json({
        ok: false,
        error: "Missing callsign"
      });
    }

    // =====================================================
    // STEP 1 — FIND LIVE AIRCRAFT BY CALLSIGN
    // =====================================================

    const lookupController =
      new AbortController();

    const lookupTimeout =
      setTimeout(
        () => lookupController.abort(),
        8000
      );

    let aircraftData;

    try {
      const aircraftResponse =
        await fetch(
          "https://api.adsb.lol/v2/callsign/" +
          encodeURIComponent(callsign),
          {
            cache: "no-store",
            headers: {
              "Accept": "application/json",
              "User-Agent":
                "MikeAircraft-Route-v0.3"
            },
            signal:
              lookupController.signal
          }
        );

      if (!aircraftResponse.ok) {
        throw new Error(
          `Aircraft lookup HTTP ${aircraftResponse.status}`
        );
      }

      aircraftData =
        await aircraftResponse.json();
    }
    finally {
      clearTimeout(
        lookupTimeout
      );
    }

    const aircraftList =
      Array.isArray(aircraftData.ac)
        ? aircraftData.ac
        : [];

    if (!aircraftList.length) {
      return res.status(404).json({
        ok: false,

        service:
          "MikeAircraft Route Test",

        version:
          "0.3",

        callsign,

        error:
          "No live aircraft found for this callsign"
      });
    }

    // Prefer the first aircraft that has a valid position.
    const aircraft =
      aircraftList.find(
        ac =>
          Number.isFinite(
            Number(ac.lat)
          ) &&
          Number.isFinite(
            Number(ac.lon)
          )
      );

    if (!aircraft) {
      return res.status(404).json({
        ok: false,

        service:
          "MikeAircraft Route Test",

        version:
          "0.3",

        callsign,

        error:
          "Aircraft found but no live position available"
      });
    }

    const lat =
      Number(aircraft.lat);

    const lng =
      Number(aircraft.lon);

    // =====================================================
    // STEP 2 — ROUTE LOOKUP
    // =====================================================

    const routeController =
      new AbortController();

    const routeTimeout =
      setTimeout(
        () => routeController.abort(),
        8000
      );

    let routeResponse;
    let routeRaw;

    try {
      routeResponse =
        await fetch(
          "https://api.adsb.lol/api/0/routeset",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Accept":
                "application/json",

              "User-Agent":
                "MikeAircraft-Route-v0.3"
            },

            body:
              JSON.stringify({
                planes: [
                  {
                    callsign,
                    lat,
                    lng
                  }
                ]
              }),

            signal:
              routeController.signal
          }
        );

      routeRaw =
        await routeResponse.text();
    }
    finally {
      clearTimeout(
        routeTimeout
      );
    }

    let routeData =
      routeRaw;

    try {
      routeData =
        JSON.parse(
          routeRaw
        );
    }
    catch {
      // Keep raw text if the response is not JSON.
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      ok:
        routeResponse.ok,

      service:
        "MikeAircraft Route Test",

      version:
        "0.3",

      callsign,

      aircraft: {
        hex:
          aircraft.hex || null,

        registration:
          aircraft.r || null,

        type:
          aircraft.t || null,

        lat,

        lng
      },

      adsbLolRoute: {
        status:
          routeResponse.status,

        response:
          routeData
      }
    });
  }
  catch (error) {
    const timedOut =
      error.name ===
      "AbortError";

    return res.status(
      timedOut
        ? 504
        : 500
    ).json({
      ok: false,

      service:
        "MikeAircraft Route Test",

      version:
        "0.3",

      error:
        timedOut
          ? "ADSB.lol request timed out"
          : error.message
    });
  }
};
