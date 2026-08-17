export default {
  fetch(request) {
    return new Response(
      JSON.stringify({
        status: "OK",
        message: "MikeAircraft Vercel function is working"
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
};
