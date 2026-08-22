const { invokeHandler } = require("../services/invoke-handler.js");
const { lookupAircraft } = require("../aircraft/lookup.js");
const { normalizeRoute } = require("../route/normalize.js");

const STATUS_LABELS = {
  APPROACHING:"APPROACHING", ON_FINAL:"ON FINAL", LANDED:"LANDED", TAXIING_IN:"TAXIING IN",
  TAXIING_OUT:"TAXIING OUT", LINING_UP:"LINING UP", TAKEOFF_ROLL:"TAKEOFF",
  AIRBORNE_DEPARTURE:"AIRBORNE", DEPARTING:"DEPARTING", AIRBORNE:"AIRBORNE", GROUND:"ON GROUND"
};

async function buildTarget(target, role, { enrichHandler, routeHandler, headers = {} }) {
  if (!target) return { available:false, role };

  const callsign = target.callsign || null;
  const registration = target.registration || null;
  const typeCode = target.type || null;

  const [enrichResult, routeResult, aircraftInfo] = await Promise.all([
    invokeHandler(enrichHandler, { callsign:callsign || "", type:typeCode || "" }, headers)
      .catch(() => ({ status:500, data:null })),
    callsign
      ? invokeHandler(routeHandler, { callsign }, headers).catch(() => ({ status:500, data:null }))
      : Promise.resolve({ status:404, data:null }),
    registration ? lookupAircraft(registration) : Promise.resolve(null)
  ]);

  const enrichment = enrichResult?.data?.ok ? enrichResult.data : null;
  const routeData = routeResult?.data?.ok && routeResult.data.routeFound ? routeResult.data.route : null;

  let operator = { identified:false, name:null, icao:null, iata:null, country:null };
  if (routeData?.airline) {
    operator = {
      identified:true,
      name:routeData.airline.name || null,
      icao:routeData.airline.icao || null,
      iata:routeData.airline.iata || null,
      country:routeData.airline.country || null
    };
  } else if (enrichment?.operator?.identified) {
    operator = {
      identified:true,
      name:enrichment.operator.name || null,
      icao:enrichment.operator.icao || null,
      iata:enrichment.operator.iata || null,
      country:null
    };
  } else if (aircraftInfo?.owner) {
    operator = {
      identified:true,
      name:aircraftInfo.owner,
      icao:aircraftInfo.operatorFlag || null,
      iata:null,
      country:aircraftInfo.ownerCountry || null
    };
  }

  const flightDisplay = routeData?.callsign_iata || enrichment?.flight?.display || callsign || null;
  let aircraftName = typeCode || null;
  let manufacturer = null, owner = null, ownerCountry = null, photo = null, thumbnail = null, modeS = null;

  if (aircraftInfo) {
    manufacturer = aircraftInfo.manufacturer || null;
    owner = aircraftInfo.owner || null;
    ownerCountry = aircraftInfo.ownerCountry || null;
    photo = aircraftInfo.photo || null;
    thumbnail = aircraftInfo.thumbnail || null;
    modeS = aircraftInfo.modeS || null;
    if (aircraftInfo.type) {
      aircraftName = manufacturer && !aircraftInfo.type.toUpperCase().startsWith(manufacturer.toUpperCase())
        ? `${manufacturer} ${aircraftInfo.type}`
        : aircraftInfo.type;
    }
  }

  if ((!aircraftInfo || !aircraftInfo.type) && enrichment?.aircraft?.name) {
    aircraftName = enrichment.aircraft.name;
  }

  const route = normalizeRoute(routeData);
  const viewerStatus = STATUS_LABELS[target.state] || target.state || null;

  return {
    available:true,
    role,
    identity:{ callsign, flight:flightDisplay, registration, modeS },
    operator,
    aircraft:{ typeCode, name:aircraftName, manufacturer, owner, ownerCountry, photo, thumbnail },
    route,
    movement:{
      state:target.state || null,
      displayState:viewerStatus,
      lineage:target.lineage || null,
      runway:target.runway || null,
      confidence:target.confidence ?? null,
      score:target.score ?? null
    },
    telemetry:{
      airportDistanceKm:target.distanceKm ?? null,
      thresholdDistanceKm:target.thresholdKm ?? null,
      altitudeFt:target.altitude ?? null,
      speedKt:target.speed ?? null
    }
  };
}

module.exports = { buildTarget, STATUS_LABELS };
