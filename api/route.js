// MikeAircraft Route Test
// Version 0.4
//
// Uses the proven airport point/radius ADS-B feed:
// airport traffic -> find callsign -> get position -> route lookup

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {

    const AIRPORTS = {
      PRG: {
        lat: 50.1008,
        lon: 14.2600
      },

      LHR: {
        lat: 51.471227,
        lon: -0.460881
      },

      FRA: {
        lat: 50.032606,
        lon: 8.540669
      },

      AMS: {
        lat: 52.314875,
        lon: 4.758074
      },

      CDG: {
        lat: 49.009750,
        lon: 2.562618
      },

      MAN: {
        lat: 53.347150,
        lon: -2.283883
      }
    };

    const callsign =
      String(
        req.query.callsign || ""
      )
        .trim()
        .toUpperCase();

    const requestedAirport =
      String(
        req.query.airport || "LHR"
      )
        .trim()
        .toUpperCase();

    if (!callsign) {
      return res.status(400).json({
        ok: false,
        error: "Missing callsign"
      });
    }

    const airportCode =
      AIRPORTS[requestedAirport]
        ? requestedAirport
        : "LHR";

    const airport =
      AIRPORTS[airportCode];

    const radius = 20;

    // =====================================================
    // STEP 1
    // USE PROVEN ADS-B POINT FEED
    // =====================================================

    const trafficController =
      new AbortController();

    const trafficTimeout =
      setTimeout(
        () =>
          trafficController.abort(),
        8000
      );

    let trafficData;

    try {

      const url =
        `https://api.adsb.lol/v2/point/` +
        `${airport.lat}/` +
        `${airport.lon}/` +
        `${radius}`;

      const response =
        await fetch(
          url,
          {
            cache: "no-store",

            headers: {
              "Accept":
                "application/json",

              "User-Agent":
                "MikeAircraft-Route-v0.4"
            },

            signal:
              trafficController.signal
          }
        );

      if (!response.ok) {
        throw new Error(
          `Traffic lookup HTTP ${response.status}`
        );
      }

      trafficData =
        await response.json();

    }
    finally {

      clearTimeout(
        trafficTimeout
      );
    }

    const aircraftList =
      Array.isArray(
        trafficData.ac
      )
        ? trafficData.ac
        : [];

    // =====================================================
    // FIND OUR AIRCRAFT
    // =====================================================

    const aircraft =
      aircraftList.find(
        ac => {

          const liveCallsign =
            String(
              ac.flight || ""
            )
              .trim()
              .toUpperCase();

          return (
            liveCallsign ===
            callsign
          );
        }
      );

    if (!aircraft) {

      return res
        .status(404)
        .json({
          ok: false,

          service:
            "MikeAircraft Route Test",

          version:
            "0.4",

          airport:
            airportCode,

          callsign,

          aircraftSeen:
            aircraftList.length,

          error:
            "Callsign not found in current airport traffic"
        });
    }

    const lat =
      Number(
        aircraft.lat
      );

    const lng =
      Number(
        aircraft.lon
      );

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {

      return res
        .status(404)
        .json({
          ok: false,

          service:
            "MikeAircraft Route Test",

          version:
            "0.4",

          airport:
            airportCode,

          callsign,

          error:
            "Aircraft found but live position unavailable"
        });
    }

    // =====================================================
    // STEP 2
    // TRY ADSB.LOL ROUTE LOOKUP
    // =====================================================

    const routeController =
      new AbortController();

    const routeTimeout =
      setTimeout(
        () =>
          routeController.abort(),
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
                "MikeAircraft-Route-v0.4"
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
      // Leave response as text.
    }

    // =====================================================
    // RESULT
    // =====================================================

    return res
      .status(200)
      .json({

        ok:
          routeResponse.ok,

        service:
          "MikeAircraft Route Test",

        version:
          "0.4",

        airport:
          airportCode,

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

        routeLookup: {

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

    return res
      .status(
        timedOut
          ? 504
          : 500
      )
      .json({

        ok: false,

        service:
          "MikeAircraft Route Test",

        version:
          "0.4",

        error:
          timedOut
            ? "ADSB.lol request timed out"
            : error.message
      });
  }
};
