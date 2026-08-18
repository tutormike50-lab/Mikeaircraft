export default {
  async fetch(request) {
    try {
      const response = await fetch(
        "https://opendata.adsb.fi/api/v3/lat/50.1008/lon/14.2600/dist/10"
      );

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: "Upstream API error",
            status: response.status
          }),
          {
            status: response.status,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }

      const data = await response.text();

      return new Response(data, {
        status: 200,
        headers: {
           "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store"
        }
      });

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
