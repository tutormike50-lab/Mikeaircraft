async function lookupAircraft(registration) {
  if (!registration) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(
      "https://api.adsbdb.com/v0/aircraft/" + encodeURIComponent(registration),
      { headers: { Accept: "application/json" }, signal: controller.signal }
    );
    if (response.status === 404 || !response.ok) return null;
    const data = await response.json();
    const aircraft = data?.response?.aircraft || null;
    if (!aircraft) return null;
    return {
      registration: aircraft.registration || registration,
      modeS: aircraft.mode_s || null,
      manufacturer: aircraft.manufacturer || null,
      type: aircraft.type || null,
      icaoType: aircraft.icao_type || null,
      owner: aircraft.registered_owner || null,
      ownerCountry: aircraft.registered_owner_country_name || null,
      operatorFlag: aircraft.registered_owner_operator_flag_code || null,
      photo: aircraft.url_photo || null,
      thumbnail: aircraft.url_photo_thumbnail || null
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { lookupAircraft };
