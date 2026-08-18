export default async function handler(req, res) {

  const { hex } = req.query;

  if (!hex) {
    return res.status(400).json({
      error: "Missing aircraft hex code"
    });
  }

  try {

    const url =
      "https://api.planespotters.net/pub/photos/hex/" +
      encodeURIComponent(hex);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "MikePlanes/1.0"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Planespotters returned " + response.status
      });
    }

    const data = await response.json();

    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate"
    );

    return res.status(200).json(data);

  } catch (error) {

    return res.status(500).json({
      error: error.message
    });

  }
}
