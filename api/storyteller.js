// MikeAircraft Storyteller API
// Version 0.3
//
// Produces short, grounded viewer-friendly story copy from live MikeAircraft
// data. Aircraft-specific copy is only allowed when the Director's identity
// gate is strong enough. No invented anecdotes and no speculative routes.

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
    const airportIds = {
      PRG:{ iata:"PRG", icao:"LKPR" }, LHR:{ iata:"LHR", icao:"EGLL" },
      FRA:{ iata:"FRA", icao:"EDDF" }, AMS:{ iata:"AMS", icao:"EHAM" },
      CDG:{ iata:"CDG", icao:"LFPG" }, MAN:{ iata:"MAN", icao:"EGCC" },
      ATL:{ iata:"ATL", icao:"KATL" }
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

    const identityStrong = Boolean(current && selection.storySafe === true && selection.level === "VERY_HIGH" && identity.registration && identity.modeS && Number(movement.confidence || 0) >= 90);
    const sources = [], facts = [];
    let story = null, storyClass = "SILENT", confidence = 0, fallbackCandidate = null, routeGuard = { checked:false, accepted:false, reason:"No route evaluated" };

    function pushSource(source, detail) {
      if (!sources.some(s => s.source === source && s.detail === detail)) sources.push({ source, detail });
    }
    function cleanName(value) { return value ? String(value).replace(/\s+/g, " ").trim() : null; }
    function finiteNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
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

    // A Redis-free fallback may provide generic activity context, but can never
    // be promoted into a named aircraft story.
    function chooseInstantaneousContext(list) {
      if (!Array.isArray(list)) return null;
      const candidates = [];
      for (const ac of list) {
        const age=finiteNumber(ac.positionAge), alignment=finiteNumber(ac.runwayAlignment), threshold=finiteNumber(ac.thresholdDistance), runwayDistance=finiteNumber(ac.runwayDistance), altitude=finiteNumber(ac.altitude), speed=finiteNumber(ac.speed);
        if (!ac.type || age === null || age > 5) continue;
        const strongFinalGeometry = !ac.onGround && alignment !== null && alignment <= 12 && threshold !== null && threshold <= 8 && altitude !== null && altitude <= 3500;
        const strongRunwayGeometry = ac.onGround && runwayDistance !== null && runwayDistance <= 0.22 && speed !== null && speed >= 35;
        if (!strongFinalGeometry && !strongRunwayGeometry) continue;
        let score=0;
        if (strongRunwayGeometry) score+=120;
        if (strongFinalGeometry) score+=100;
        if (threshold !== null) score+=Math.max(0,40-threshold*5);
        score+=Math.max(0,15-age*3);
        if (alignment !== null) score+=Math.max(0,20-alignment);
        candidates.push({ ac, score, context:strongRunwayGeometry ? "RUNWAY_ACTIVITY" : "FINAL_APPROACH_GEOMETRY" });
      }
      candidates.sort((a,b)=>b.score-a.score);
      return candidates[0] || null;
    }

    if (identityStrong) {
      const flight=cleanName(identity.flight || identity.callsign), reg=cleanName(identity.registration), typeName=cleanName(aircraft.name || aircraft.typeCode), airline=operator.identified ? cleanName(operator.name) : null, status=cleanName(movement.displayState || movement.state), runway=cleanName(movement.runway);
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

      const textParts=[];
      if (airline && flight) textParts.push(`${flight} is operated by ${airline}.`);
      else if (flight) textParts.push(`This is ${flight}.`);
      else textParts.push(`This aircraft is ${reg}.`);
      if (typeName) textParts.push(`The aircraft is ${typeName}.`);
      if (routeOK) {
        const from=cleanName(route.origin.city || route.origin.name || route.origin.iata || route.origin.icao), to=cleanName(route.destination.city || route.destination.name || route.destination.iata || route.destination.icao);
        textParts.push(`It is operating from ${from} to ${to}.`);
        facts.push({label:"route",value:route.display});
        pushSource("Route lookup", route.display);
      } else if (routeGuard.checked) {
        pushSource("Route guard", routeGuard.reason);
      }
      if (status) {
        let movementSentence=`Right now it is ${status.toLowerCase()}`;
        if (runway) movementSentence+=` for runway ${runway}`;
        textParts.push(movementSentence+".");
      }
      story={ headline:flight ? `${flight}${typeName ? " • "+typeName : ""}` : `${reg}${typeName ? " • "+typeName : ""}`, text:textParts.join(" "), tone:"viewer-friendly", specificAircraft:true };
      storyClass=routeOK ? "VERIFIED_FLIGHT_STORY" : "VERIFIED_AIRCRAFT_STORY";
      confidence=Math.max(93,Math.min(100,Number(selection.score || 93)));
    } else if (current && aircraft.typeCode) {
      const typeName=cleanName(aircraft.name || aircraft.typeCode), status=cleanName(movement.displayState || movement.state);
      story={ headline:typeName || "Live airport activity", text:status ? `MikeAircraft is tracking ${typeName || "an aircraft"} ${status.toLowerCase()}, but identity confidence is not yet high enough for an aircraft-specific story.` : `MikeAircraft is tracking ${typeName || "an aircraft"}, but identity confidence is not yet high enough for an aircraft-specific story.`, tone:"viewer-friendly", specificAircraft:false };
      storyClass="GENERIC_SAFE_CONTEXT";
      confidence=Math.max(40,Math.min(75,Number(selection.score || 50)));
      facts.push({label:"reportedType",value:typeName});
      pushSource("MikeAircraft Director", `identity gate not passed (${selection.level || "NONE"})`);
    } else {
      fallbackCandidate=chooseInstantaneousContext(engine.aircraft);
      if (fallbackCandidate) {
        const ac=fallbackCandidate.ac, typeName=cleanName(ac.type) || "aircraft", runway=cleanName(ac.nearestRunway), onRunway=fallbackCandidate.context === "RUNWAY_ACTIVITY";
        const activity=onRunway ? `moving rapidly close to${runway ? " runway "+runway : " a runway"}` : `aligned close to${runway ? " runway "+runway : " a runway"}`;
        story={ headline:"Live airport activity", text:`MikeAircraft is tracking a ${typeName} ${activity}. The live geometry is clear, but identity confidence is not yet high enough for an aircraft-specific story.`, tone:"viewer-friendly", specificAircraft:false };
        storyClass="GENERIC_SAFE_CONTEXT";
        confidence=onRunway ? 70 : 65;
        facts.push({label:"reportedType",value:typeName});
        if (runway) facts.push({label:"nearestRunway",value:runway});
        if (ac.thresholdDistance != null) facts.push({label:"thresholdDistanceKm",value:Number(Number(ac.thresholdDistance).toFixed(2))});
        pushSource("Live ADS-B","instantaneous position and reported type");
        pushSource("MikeAircraft geometry",fallbackCandidate.context);
      }
    }

    return res.status(200).json({
      ok:true, service:"MikeAircraft Storyteller", version:"0.3", generatedAt:new Date().toISOString(), airport:broadcast.airport || {code:airport},
      gate:{ passed:identityStrong, selectionLevel:selection.level || "NONE", selectionScore:selection.score ?? 0, storySafe:selection.storySafe === true, registrationPresent:Boolean(identity.registration), modeSPresent:Boolean(identity.modeS), movementConfidence:movement.confidence ?? null, fallbackUsed:Boolean(fallbackCandidate), routeGuard },
      output:{ available:Boolean(story), class:storyClass, confidence, story, facts, sources }
    });
  } catch(error) {
    console.error("MikeAircraft Storyteller error:",error);
    return res.status(500).json({ok:false,service:"MikeAircraft Storyteller",version:"0.3",error:error.message});
  }
};
