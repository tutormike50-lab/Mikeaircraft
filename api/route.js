// MikeAircraft Route Test
// Version 0.2
// Tests ADSB.lol route lookup with callsign + live position.

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const callsign = String(req.query.callsign || "")
      .trim()
      .toUpperCase();

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!callsign) {
      return res.status(400).json({
        ok: false,
        error: "Missing callsign"
      });
    }

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return res.status(400).json({
        ok: false,
        error: "Missing or invalid lat/lng"
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
      const response = await fetch(
        "https://api.adsb.lol/api/0/routeset",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "MikeAircraft-Route-v0.2"
          },

          body: JSON.stringify({
            planes: [
              {
                callsign,
                lat,
                lng
              }
            ]
          }),

          signal: controller.signal
        }
      );

      const raw =
        await response.text();

      let data = raw;

      try {
        data =
          JSON.parse(raw);
      }
      catch {
        // Leave as text if ADSB.lol returns non-JSON.
      }

      return res.status(200).json({
        ok: response.ok,

        service:
          "MikeAircraft Route Test",

        version:
          "0.2",

        request: {
          callsign,
          lat,
          lng
        },

        adsbLol: {
          status:
            response.status,

          response:
            data
        }
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
        "MikeAircraft Route Test",

      version:
        "0.2",

      error:
        timedOut
          ? "ADSB.lol route request timed out"
          : error.message
    });
  }
};
