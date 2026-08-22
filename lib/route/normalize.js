function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRoute(routeData) {
  const origin = routeData?.origin;
  const destination = routeData?.destination;
  if (!origin || !destination) {
    return { found:false, origin:null, destination:null, display:null, map:null };
  }

  const originCode = origin.iata_code || origin.icao_code || null;
  const destinationCode = destination.iata_code || destination.icao_code || null;
  const originLat = finiteNumber(origin.latitude);
  const originLon = finiteNumber(origin.longitude);
  const destinationLat = finiteNumber(destination.latitude);
  const destinationLon = finiteNumber(destination.longitude);

  return {
    found: true,
    display: originCode && destinationCode ? `${originCode} → ${destinationCode}` : null,
    origin: {
      iata: origin.iata_code || null,
      icao: origin.icao_code || null,
      name: origin.name || null,
      city: origin.municipality || null,
      country: origin.country_name || null,
      lat: originLat,
      lon: originLon
    },
    destination: {
      iata: destination.iata_code || null,
      icao: destination.icao_code || null,
      name: destination.name || null,
      city: destination.municipality || null,
      country: destination.country_name || null,
      lat: destinationLat,
      lon: destinationLon
    },
    map: {
      start: { lat: originLat, lon: originLon },
      end: { lat: destinationLat, lon: destinationLon }
    }
  };
}

module.exports = { normalizeRoute };
