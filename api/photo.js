export default async function handler(req, res) {

  // Allow the GitHub Pages ribbon/debug page to call this API
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle browser preflight request
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const { hex } = req.query;

  if (!hex) {
    return res.status(400).json({
      error: "Missing aircraft hex code"
    });
  }

  try {

    const cleanHex =
      String(hex)
        .trim()
        .toUpperCase();

    const url =
      "https://airport-data.com/api/ac_thumb.json?m=" +
      encodeURIComponent(cleanHex) +
      "&n=1";

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Airport-Data returned " + response.status
      });
    }

    const data = await response.json();

    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate=604800"
    );

    return res.status(200).json(data);

  } catch (error) {

    return res.status(500).json({
      error: error.message
    });

  }
}
