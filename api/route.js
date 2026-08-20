// MikeAircraft Route Lookup
// Version 0.5
// Route enrichment via ADSBDB

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const callsign =
      String(req.query.callsign || "")
        .trim()
        .toUpperCase();

    if (!callsign) {
      return res.status(400).json({
        ok: false,
        service: "MikeAircraft Route Lookup",
        version: "0.5",
        error: "Missing callsign"
      });
    }

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        8000
      );

    try {
      const response =
        await fetch(
          "https://api.adsbdb.com/v0/callsign/" +
          encodeURIComponent(callsign),
          {
            cache: "no-store",
            headers: {
              "Accept": "application/json",
              "User-Agent": "MikeAircraft-Route-v0.5"
            },
            signal: controller.signal
          }
        );

      const raw =
        await response.text();

      let data;

      try {
        data =
          JSON.parse(raw);
      }
      catch {
        data = raw;
      }

      if (!response.ok) {
        return res.status(response.status).json({
          ok: false,
          service: "MikeAircraft Route Lookup",
          version: "0.5",
          callsign,
          upstreamStatus: response.status,
          upstreamResponse: data
        });
      }

      const route =
        data &&
        data.response &&
        data.response.flightroute
          ? data.response.flightroute
          : null;

      return res.status(200).json({
        ok: true,

        service:
          "MikeAircraft Route Lookup",

        version:
          "0.5",

        callsign,

        routeFound:
          Boolean(route),

        route
      });
    }
    finally {
      clearTimeout(timeout);
    }
  }
  catch (error) {
    const timedOut =
      error.name === "AbortError";

    return res.status(
      timedOut ? 504 : 500
    ).json({
      ok: false,

      service:
        "MikeAircraft Route Lookup",

      version:
        "0.5",

      error:
        timedOut
          ? "ADSBDB request timed out"
          : error.message
    });
  }
};
