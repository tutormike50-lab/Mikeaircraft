export default {
  async fetch(request) {
    try {
      const response = await fetch(
        "https://opendata.adsb.fi/api/v3/lat/50.1008/lon/14.2600/dist/10"
      );

      const text = await response.text();

      return new Response(
        JSON.stringify({
          upstreamStatus: response.status,
          upstreamText: text
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error.message
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
};
