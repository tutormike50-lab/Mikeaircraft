async function lookupAdsbdbRoute(callsign) {
  const normalized = String(callsign || "").trim().toUpperCase();
  if (!normalized) return { status:400, route:null, error:"Missing callsign" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      "https://api.adsbdb.com/v0/callsign/" + encodeURIComponent(normalized),
      {
        cache:"no-store",
        headers:{ Accept:"application/json", "User-Agent":"MikeAircraft-Route-v0.5" },
        signal:controller.signal
      }
    );
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }
    if (!response.ok) return { status:response.status, route:null, upstreamResponse:data };
    return { status:200, route:data?.response?.flightroute || null, upstreamResponse:data };
  } catch (error) {
    return { status:error?.name === "AbortError" ? 504 : 500, route:null, error:error?.name === "AbortError" ? "ADSBDB request timed out" : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { lookupAdsbdbRoute };
