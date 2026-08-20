// MikeAircraft Route Test
// Version 0.1
// Tests ADSB.lol routeset without touching the main engine.

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

    const response = await fetch(
      "https://api.adsb.lol/api/0/routeset",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },

        body: JSON.stringify({
          planes: [
            {
              callsign: callsign
            }
          ]
        })
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }

    return res.status(200).json({
      ok: response.ok,
      service: "MikeAircraft Route Test",
      version: "0.1",
      callsign: callsign,

      adsbLol: {
        status: response.status,
        response: data
      }
    });

  } catch (error) {

    console.error(
      "MikeAircraft route error:",
      error
    );

    return res.status(500).json({
      ok: false,
      service: "MikeAircraft Route Test",
      version: "0.1",
      error: error.message
    });
  }
};
