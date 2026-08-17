export default async function handler(req, res) {
  const url =
    "https://opendata.adsb.fi/api/v3/lat/50.1008/lon/14.2600/dist/10";

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Upstream API error",
        status: response.status
      });
    }

    const data = await response.json();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: "Aircraft API request failed",
      details: error.message
    });
  }
}
