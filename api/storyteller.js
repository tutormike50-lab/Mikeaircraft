// MikeAircraft Storyteller API
// Version 0.5
//
// Produces grounded viewer-friendly story segments from live MikeAircraft data.
// Aircraft-specific copy is only allowed when the Director's identity gate is
// strong enough. The overlay can scroll these segments as a continuous script.
// No invented anecdotes and no speculative routes.

const engineHandler = require("./engine.js");
const broadcastHandler = require("./broadcast.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    const airport = String((req.query && req.query.airport) || "PRG").trim().toUpperCase();
    const targetRegistration = String((req.query && req.query.registration) || "").trim().toUpperCase();
    const targetCallsign = String((req.query && req.query.callsign) || "").trim().toUpperCase();
    const targetLocked = Boolean(targetRegistration || targetCallsign);

    const airportIds = {
      PRG:{ iata:"PRG", icao:"LKPR" }, LHR:{ iata:"LHR", icao:"EGLL" },
      FRA:{ iata:"FRA", icao:"EDDF" }, AMS:{ iata:"AMS", icao:"EHAM" },
      CDG:{ iata:"CDG", icao:"LFPG" }, MAN:{ iata:"MAN", icao:"EGCC" },
      ATL:{ iata:"ATL", icao:"KATL" }
    };

    // Carefully limited evergreen type facts. These are only used when the
    // live aircraft type code is known; they never identify a specific flight.
    const typeFacts = {
      A318:["The Airbus A318 is the smallest member of the original A320 family."],
      A319:["The Airbus A319 is a shortened member of the A320 family and is widely used on short and medium-haul routes."],
      A320:["The Airbus A320 family helped make fly-by-wire flight controls standard in modern single-aisle airliners."],
      A20N:["The A320neo is the newer-generation A320, designed around more efficient engines and aerodynamic improvements."],
      A321:["The Airbus A321 is the longest member of the original A320 family and can carry more passengers than the A320."],
      A21N:["The A321neo combines the larger A321 fuselage with newer-generation engines and improved efficiency."],
      A332:["The Airbus A330-200 is a long-range wide-body aircraft used for both passenger and cargo flying."],
      A333:["The Airbus A330-300 is a twin-engine wide-body commonly used on medium and long-haul routes."],
      A339:["The A330-900 is part of the A330neo family, combining the A330 airframe with newer engines and updated aerodynamics."],
      A359:["The Airbus A350-900 is a long-range wide-body built extensively from lightweight composite materials."],
      A35K:["The Airbus A350-1000 is the largest member of the A350 family and is designed for long-haul flying."],
      A388:["The Airbus A380 is the world's largest passenger airliner and has two full-length passenger decks."],
      B737:["The Boeing 737 family is one of the most widely used families of passenger jets in the world."],
      B738:["The Boeing 737-800 became one of the most common versions of the 737 Next Generation family."],
      B739:["The Boeing 737-900 is the longest member of the 737 Next Generation family."],
      B38M:["The Boeing 737 MAX 8 is a newer-generation 737 designed around more efficient engines and aerodynamic changes."],
      B39M:["The Boeing 737 MAX 9 is the stretched version of the MAX 8, offering additional passenger capacity."],
      B744:["The Boeing 747-400 is one of the best-known versions of the classic four-engine 747 jumbo jet."],
      B748:["The Boeing 747-8 is the final and largest production version of the 747 family."],
      B752:["The Boeing 757-200 is known for strong takeoff performance and has served both short and long sectors."],
      B763:["The Boeing 767-300 is a twin-engine wide-body that has been widely used for passenger flights and air cargo."],
      B772:["The Boeing 777-200 is part of the first generation of Boeing's large twin-engine 777 family."],
      B77L:["The Boeing 777-200LR is a very long-range member of the 777 family and is also the basis for the 777 Freighter."],
      B77W:["The Boeing 777-300ER became one of the most successful long-haul wide-body aircraft of its generation."],
      B788:["The Boeing 787-8 was the first version of the Dreamliner family and makes extensive use of composite materials."],
      B789:["The Boeing 787-9 is the middle-sized Dreamliner and is widely used on long-haul routes."],
      B78X:["The Boeing 787-10 is the longest Dreamliner variant and has the highest passenger capacity in the family."],
      E170:["The Embraer E170 is a regional jet designed for shorter routes and smaller passenger markets."],
      E175:["The Embraer E175 is a popular regional jet, especially on feeder routes into major airline hubs."],
      E75L:["The Embraer E175 is a popular regional jet, especially on feeder routes into major airline hubs."],
      E190:["The Embraer E190 bridges the gap between traditional regional jets and larger single-aisle airliners."],
      E195:["The Embraer E195 is the largest member of the original E-Jet family."],
      CRJ9:["The Bombardier CRJ900 is a stretched regional jet designed to carry more passengers than earlier CRJ variants."],
      AT72:["The ATR 72 is a twin-turboprop regional airliner optimized for relatively short routes."],
      DH8D:["The Dash 8 Q400 is a fast turboprop regional aircraft designed for short and medium-distance services."]
    };

    async function invokeHandler(targetHandler, query) {
      let statusCode = 200;
      let responseData = null;
      const fakeReq = { method:"GET", query:query || {}, headers:req.headers || {} };
      const fakeRes = {
        setHeader(){ return fakeRes; },
        status(code){ statusCode = code; return fakeRes; },
        json(data){ responseData = data; return data; },
        send(data){ responseData = data; return data; },
        end(){ return null; }
      };
      await targetHandler(fakeReq, fakeRes);
      return { status:statusCode, data:responseData };
    }

    const [engineResult, broadcastResult] = await Promise.all([
      invokeHandler(engineHandler, { airport }),
      invokeHandler(broadcastHandler, { airport })
    ]);

    const engine = engineResult.data;
    const broadcast = broadcastResult.data;
    if (!engine || engineResult.status >= 400 || !engine.ok) throw new Error((engine && engine.error) || "Engine request failed");
    if (!broadcast || broadcastResult.status >= 400 || !broadcast.ok) throw new Error((broadcast && broadcast.error) || "Broadcast request failed");

    const selection = engine.intelligence && engine.intelligence.selectionConfidence ? engine.intelligence.selectionConfidence : {};
    const current = broadcast.aircraft && broadcast.aircraft.current && broadcast.aircraft.current.available ? broadcast.aircraft.current : null;
    const identity = current && current.identity ? current.identity : {};
    const aircraft = current && current.aircraft ? current.aircraft : {};
    const movement = current && current.movement ? current.movement : {};
    const route = current && current.route ? current.route : {};
    const operator = current && current.operator ? current.operator : {};
    const telemetry = current && current.telemetry ? current.telemetry : {};

    const currentRegistration = String(identity.registration || "").trim().toUpperCase();
    const currentCallsign = String(identity.callsign || "").trim().toUpperCase();
    const targetMatches = !targetLocked ||
      (targetRegistration && currentRegistration && targetRegistration === currentRegistration) ||
      (targetCallsign && currentCallsign && targetCallsign === currentCallsign);

    if (targetLocked && !targetMatches) {
      return res.status(200).json({
        ok:true, service:"MikeAircraft Storyteller", version:"0.5", generatedAt:new Date().toISOString(), airport:broadcast.airport || {code:airport},
        gate:{ passed:false, selectionLevel:selection.level || "NONE", selectionScore:selection.score ?? 0, storySafe:false, registrationPresent:Boolean(identity.registration), modeSPresent:Boolean(identity.modeS), movementConfidence:movement.confidence ?? null, fallbackUsed:false, targetLocked:true, targetMatched:false, routeGuard:{checked:false,accepted:false,reason:"CURRENT changed before Storyteller evaluation"} },
        output:{ available:false, class:"SILENT_CURRENT_MISMATCH", confidence:0, story:null, segments:[], facts:[], sources:[] }
      });
    }

    const identityStrong = Boolean(current && selection.storySafe === true && selection.level === "VERY_HIGH" && identity.registration && identity.modeS && Number(movement.confidence || 0) >= 90);
    const sources = [], facts = [], segments = [];
    let story = null, storyClass = "SILENT", confidence = 0, routeGuard = { checked:false, accepted:false, reason:"No route evaluated" };

    function pushSource(source, detail) {
      if (!sources.some(s => s.source === source && s.detail === detail)) sources.push({ source, detail });
    }
    function addSegment(kind, text) {
      const clean = text ? String(text).replace(/\s+/g," ").trim() : "";
      if (clean && !segments.some(s => s.text === clean)) segments.push({ kind, text:clean });
    }
    function cleanName(value) { return value ? String(value).replace(/\s+/g, " ").trim() : null; }
    function endpointMatchesLocal(endpoint) {
      const local = airportIds[airport];
      if (!local || !endpoint) return false;
      const iata = String(endpoint.iata || "").toUpperCase();
      const icao = String(endpoint.icao || "").toUpperCase();
      return iata === local.iata || icao === local.icao;
    }
    function routeCoherence() {
      if (!(route.found && route.origin && route.destination && route.display)) return { checked:false, accepted:false, reason:"No complete route" };
      const lineage = String(movement.lineage || "").toUpperCase();
      if (lineage === "ARRIVAL") return endpointMatchesLocal(route.destination)
        ? { checked:true, accepted:true, reason:"Arrival destination matches live airport" }
        : { checked:true, accepted:false, reason:"Arrival destination conflicts with live airport" };
      if (lineage === "DEPARTURE") return endpointMatchesLocal(route.origin)
        ? { checked:true, accepted:true, reason:"Departure origin matches live airport" }
        : { checked:true, accepted:false, reason:"Departure origin conflicts with live airport" };
      return { checked:true, accepted:false, reason:"Movement lineage is not certain enough to validate route" };
    }

    if (identityStrong) {
      const flight=cleanName(identity.flight || identity.callsign), reg=cleanName(identity.registration), typeName=cleanName(aircraft.name || aircraft.typeCode), typeCode=String(aircraft.typeCode || "").toUpperCase(), airline=operator.identified ? cleanName(operator.name) : null, status=cleanName(movement.displayState || movement.state), runway=cleanName(movement.runway);
      routeGuard = routeCoherence();
      const routeOK = routeGuard.accepted;

      if (flight) facts.push({label:"flight",value:flight});
      if (reg) facts.push({label:"registration",value:reg});
      if (typeName) facts.push({label:"aircraft",value:typeName});
      if (airline) facts.push({label:"operator",value:airline});
      if (status) facts.push({label:"movement",value:status});
      if (runway) facts.push({label:"runway",value:runway});
      if (telemetry.airportDistanceKm != null) facts.push({label:"distanceKm",value:telemetry.airportDistanceKm});
      if (routeGuard.checked && !routeGuard.accepted) facts.push({label:"routeSuppressed",value:routeGuard.reason});

      pushSource("MikeAircraft Director", `selection ${selection.level}, score ${selection.score}`);
      pushSource("Live ADS-B", `${identity.callsign || reg} / ${reg}`);
      if (aircraft.owner || aircraft.manufacturer || aircraft.typeCode) pushSource("ADSBDB aircraft identity", reg);

      if (airline && flight) addSegment("identity", `${flight} is operated by ${airline}, and the aircraft on screen is registration ${reg}.`);
      else if (flight) addSegment("identity", `This is ${flight}, flying today as aircraft ${reg}.`);
      else addSegment("identity", `The aircraft on screen is registration ${reg}.`);

      if (typeName) addSegment("aircraft", `It is a ${typeName}.`);
      if (typeFacts[typeCode]) {
        typeFacts[typeCode].forEach(text => addSegment("aircraft-fact", text));
        pushSource("MikeAircraft aircraft-type reference", typeCode);
      }

      if (routeOK) {
        const from=cleanName(route.origin.city || route.origin.name || route.origin.iata || route.origin.icao), to=cleanName(route.destination.city || route.destination.name || route.destination.iata || route.destination.icao);
        addSegment("route", `This flight is operating from ${from} to ${to}.`);
        facts.push({label:"route",value:route.display});
        pushSource("Route lookup", route.display);
      } else if (routeGuard.checked) {
        pushSource("Route guard", routeGuard.reason);
      }

      if (aircraft.owner && (!airline || cleanName(aircraft.owner) !== airline)) addSegment("owner", `The aircraft is registered to ${cleanName(aircraft.owner)}${aircraft.ownerCountry ? ` in ${cleanName(aircraft.ownerCountry)}` : ""}.`);

      if (status) {
        let movementSentence=`Right now it is ${status.toLowerCase()}`;
        if (runway) movementSentence+=` for runway ${runway}`;
        if (telemetry.airportDistanceKm != null && Number(telemetry.airportDistanceKm) > 0.2) movementSentence+=`, about ${Number(telemetry.airportDistanceKm).toFixed(1)} kilometres from the airport reference point`;
        addSegment("live", movementSentence+".");
      }

      if (telemetry.altitudeFt != null && Number(telemetry.altitudeFt) > 0 && String(movement.lineage||"") === "ARRIVAL") addSegment("live", `Its reported altitude is around ${Math.round(Number(telemetry.altitudeFt)/100)*100} feet as it continues the arrival.`);
      if (telemetry.speedKt != null && Number(telemetry.speedKt) > 40) addSegment("live", `The latest reported ground speed is about ${Math.round(Number(telemetry.speedKt))} knots.`);

      story={ headline:flight ? `${flight}${typeName ? " • "+typeName : ""}` : `${reg}${typeName ? " • "+typeName : ""}`, text:segments.map(s=>s.text).join(" "), tone:"viewer-friendly", specificAircraft:true };
      storyClass=routeOK ? "VERIFIED_FLIGHT_STORY" : "VERIFIED_AIRCRAFT_STORY";
      confidence=Math.max(93,Math.min(100,Number(selection.score || 93)));
    } else if (current && aircraft.typeCode) {
      const typeName=cleanName(aircraft.name || aircraft.typeCode), typeCode=String(aircraft.typeCode || "").toUpperCase(), status=cleanName(movement.displayState || movement.state), lineage=cleanName(movement.lineage);
      const direction = lineage === "ARRIVAL" ? "arriving" : lineage === "DEPARTURE" ? "departing" : status ? status.toLowerCase() : "in live airport activity";
      addSegment("context", `${typeName || "Aircraft"} ${direction}${movement.runway ? ` on runway ${movement.runway}` : ""}.`);
      if (typeFacts[typeCode]) {
        typeFacts[typeCode].forEach(text => addSegment("aircraft-fact", text));
        pushSource("MikeAircraft aircraft-type reference", typeCode);
      }
      story={ headline:typeName || "Live airport activity", text:segments.map(s=>s.text).join(" "), tone:"viewer-friendly", specificAircraft:false };
      storyClass="GENERIC_CURRENT_CONTEXT";
      confidence=Math.max(40,Math.min(75,Number(selection.score || 50)));
      facts.push({label:"reportedType",value:typeName});
      pushSource("MikeAircraft Director", `CURRENT identity gate not passed (${selection.level || "NONE"})`);
    }

    return res.status(200).json({
      ok:true, service:"MikeAircraft Storyteller", version:"0.5", generatedAt:new Date().toISOString(), airport:broadcast.airport || {code:airport},
      gate:{ passed:identityStrong, selectionLevel:selection.level || "NONE", selectionScore:selection.score ?? 0, storySafe:selection.storySafe === true, registrationPresent:Boolean(identity.registration), modeSPresent:Boolean(identity.modeS), movementConfidence:movement.confidence ?? null, fallbackUsed:false, targetLocked, targetMatched:true, routeGuard },
      output:{ available:Boolean(story), class:storyClass, confidence, story, segments, facts, sources }
    });
  } catch(error) {
    console.error("MikeAircraft Storyteller error:",error);
    return res.status(500).json({ok:false,service:"MikeAircraft Storyteller",version:"0.5",error:error.message});
  }
};
