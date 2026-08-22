const engineHandler = require("../../api/engine.js");
const broadcastHandler = require("../../api/broadcast.js");
const { normalizeAirportCode } = require("../config/airports.js");
const { invokeHandler } = require("../services/invoke-handler.js");
const { evaluateRouteCoherence } = require("../route/coherence.js");
const { TYPE_FACTS } = require("./type-facts.js");

function cleanName(value) {
  return value ? String(value).replace(/\s+/g, " ").trim() : null;
}

module.exports = async function storytellerHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    const airport = normalizeAirportCode(req.query?.airport || "PRG");
    const targetRegistration = String(req.query?.registration || "").trim().toUpperCase();
    const targetCallsign = String(req.query?.callsign || "").trim().toUpperCase();
    const targetLocked = Boolean(targetRegistration || targetCallsign);

    const [engineResult, broadcastResult] = await Promise.all([
      invokeHandler(engineHandler, { airport }, req.headers || {}),
      invokeHandler(broadcastHandler, { airport }, req.headers || {})
    ]);

    const engine = engineResult.data;
    const broadcast = broadcastResult.data;
    if (!engine || engineResult.status >= 400 || !engine.ok) throw new Error(engine?.error || "Engine request failed");
    if (!broadcast || broadcastResult.status >= 400 || !broadcast.ok) throw new Error(broadcast?.error || "Broadcast request failed");

    const selection = engine.intelligence?.selectionConfidence || {};
    const current = broadcast.aircraft?.current?.available ? broadcast.aircraft.current : null;
    const identity = current?.identity || {};
    const aircraft = current?.aircraft || {};
    const movement = current?.movement || {};
    const route = current?.route || {};
    const operator = current?.operator || {};
    const telemetry = current?.telemetry || {};

    const currentRegistration = String(identity.registration || "").trim().toUpperCase();
    const currentCallsign = String(identity.callsign || "").trim().toUpperCase();
    const targetMatches = !targetLocked ||
      (targetRegistration && currentRegistration && targetRegistration === currentRegistration) ||
      (targetCallsign && currentCallsign && targetCallsign === currentCallsign);

    if (targetLocked && !targetMatches) {
      return res.status(200).json({
        ok:true,
        service:"MikeAircraft Storyteller",
        version:"0.5",
        generatedAt:new Date().toISOString(),
        airport:broadcast.airport || { code:airport },
        gate:{
          passed:false,
          selectionLevel:selection.level || "NONE",
          selectionScore:selection.score ?? 0,
          storySafe:false,
          registrationPresent:Boolean(identity.registration),
          modeSPresent:Boolean(identity.modeS),
          movementConfidence:movement.confidence ?? null,
          fallbackUsed:false,
          targetLocked:true,
          targetMatched:false,
          routeGuard:{ checked:false, accepted:false, reason:"CURRENT changed before Storyteller evaluation" }
        },
        output:{ available:false, class:"SILENT_CURRENT_MISMATCH", confidence:0, story:null, segments:[], facts:[], sources:[] }
      });
    }

    const identityStrong = Boolean(
      current && selection.storySafe === true && selection.level === "VERY_HIGH" &&
      identity.registration && identity.modeS && Number(movement.confidence || 0) >= 90
    );

    const sources = [], facts = [], segments = [];
    let story = null;
    let storyClass = "SILENT";
    let confidence = 0;
    let routeGuard = { checked:false, accepted:false, reason:"No route evaluated" };

    function pushSource(source, detail) {
      if (!sources.some(s => s.source === source && s.detail === detail)) sources.push({ source, detail });
    }
    function addSegment(kind, text) {
      const clean = text ? String(text).replace(/\s+/g, " ").trim() : "";
      if (clean && !segments.some(s => s.text === clean)) segments.push({ kind, text:clean });
    }

    if (identityStrong) {
      const flight = cleanName(identity.flight || identity.callsign);
      const reg = cleanName(identity.registration);
      const typeName = cleanName(aircraft.name || aircraft.typeCode);
      const typeCode = String(aircraft.typeCode || "").toUpperCase();
      const airline = operator.identified ? cleanName(operator.name) : null;
      const status = cleanName(movement.displayState || movement.state);
      const runway = cleanName(movement.runway);

      routeGuard = evaluateRouteCoherence({ route, movement, airportCode:airport });
      const routeOK = routeGuard.accepted;

      if (flight) facts.push({ label:"flight", value:flight });
      if (reg) facts.push({ label:"registration", value:reg });
      if (typeName) facts.push({ label:"aircraft", value:typeName });
      if (airline) facts.push({ label:"operator", value:airline });
      if (status) facts.push({ label:"movement", value:status });
      if (runway) facts.push({ label:"runway", value:runway });
      if (telemetry.airportDistanceKm != null) facts.push({ label:"distanceKm", value:telemetry.airportDistanceKm });
      if (routeGuard.checked && !routeGuard.accepted) facts.push({ label:"routeSuppressed", value:routeGuard.reason });

      pushSource("MikeAircraft Director", `selection ${selection.level}, score ${selection.score}`);
      pushSource("Live ADS-B", `${identity.callsign || reg} / ${reg}`);
      if (aircraft.owner || aircraft.manufacturer || aircraft.typeCode) pushSource("ADSBDB aircraft identity", reg);

      if (airline && flight) addSegment("identity", `${flight} is operated by ${airline}, and the aircraft on screen is registration ${reg}.`);
      else if (flight) addSegment("identity", `This is ${flight}, flying today as aircraft ${reg}.`);
      else addSegment("identity", `The aircraft on screen is registration ${reg}.`);

      if (typeName) addSegment("aircraft", `It is a ${typeName}.`);
      if (TYPE_FACTS[typeCode]) {
        TYPE_FACTS[typeCode].forEach(text => addSegment("aircraft-fact", text));
        pushSource("MikeAircraft aircraft-type reference", typeCode);
      }

      if (routeOK) {
        const from = cleanName(route.origin.city || route.origin.name || route.origin.iata || route.origin.icao);
        const to = cleanName(route.destination.city || route.destination.name || route.destination.iata || route.destination.icao);
        addSegment("route", `This flight is operating from ${from} to ${to}.`);
        facts.push({ label:"route", value:route.display });
        pushSource("Route lookup", route.display);
      } else if (routeGuard.checked) {
        pushSource("Route guard", routeGuard.reason);
      }

      if (aircraft.owner && (!airline || cleanName(aircraft.owner) !== airline)) {
        addSegment("owner", `The aircraft is registered to ${cleanName(aircraft.owner)}${aircraft.ownerCountry ? ` in ${cleanName(aircraft.ownerCountry)}` : ""}.`);
      }

      if (status) {
        let movementSentence = `Right now it is ${status.toLowerCase()}`;
        if (runway) movementSentence += ` for runway ${runway}`;
        if (telemetry.airportDistanceKm != null && Number(telemetry.airportDistanceKm) > 0.2) {
          movementSentence += `, about ${Number(telemetry.airportDistanceKm).toFixed(1)} kilometres from the airport reference point`;
        }
        addSegment("live", movementSentence + ".");
      }

      if (telemetry.altitudeFt != null && Number(telemetry.altitudeFt) > 0 && String(movement.lineage || "") === "ARRIVAL") {
        addSegment("live", `Its reported altitude is around ${Math.round(Number(telemetry.altitudeFt) / 100) * 100} feet as it continues the arrival.`);
      }
      if (telemetry.speedKt != null && Number(telemetry.speedKt) > 40) {
        addSegment("live", `The latest reported ground speed is about ${Math.round(Number(telemetry.speedKt))} knots.`);
      }

      story = {
        headline:flight ? `${flight}${typeName ? " • " + typeName : ""}` : `${reg}${typeName ? " • " + typeName : ""}`,
        text:segments.map(s => s.text).join(" "),
        tone:"viewer-friendly",
        specificAircraft:true
      };
      storyClass = routeOK ? "VERIFIED_FLIGHT_STORY" : "VERIFIED_AIRCRAFT_STORY";
      confidence = Math.max(93, Math.min(100, Number(selection.score || 93)));
    } else if (current && aircraft.typeCode) {
      const typeName = cleanName(aircraft.name || aircraft.typeCode);
      const typeCode = String(aircraft.typeCode || "").toUpperCase();
      const status = cleanName(movement.displayState || movement.state);
      const lineage = cleanName(movement.lineage);
      const direction = lineage === "ARRIVAL" ? "arriving" : lineage === "DEPARTURE" ? "departing" : status ? status.toLowerCase() : "in live airport activity";

      addSegment("context", `${typeName || "Aircraft"} ${direction}${movement.runway ? ` on runway ${movement.runway}` : ""}.`);
      if (TYPE_FACTS[typeCode]) {
        TYPE_FACTS[typeCode].forEach(text => addSegment("aircraft-fact", text));
        pushSource("MikeAircraft aircraft-type reference", typeCode);
      }
      story = {
        headline:typeName || "Live airport activity",
        text:segments.map(s => s.text).join(" "),
        tone:"viewer-friendly",
        specificAircraft:false
      };
      storyClass = "GENERIC_CURRENT_CONTEXT";
      confidence = Math.max(40, Math.min(75, Number(selection.score || 50)));
      facts.push({ label:"reportedType", value:typeName });
      pushSource("MikeAircraft Director", `CURRENT identity gate not passed (${selection.level || "NONE"})`);
    }

    return res.status(200).json({
      ok:true,
      service:"MikeAircraft Storyteller",
      version:"0.5",
      generatedAt:new Date().toISOString(),
      airport:broadcast.airport || { code:airport },
      gate:{
        passed:identityStrong,
        selectionLevel:selection.level || "NONE",
        selectionScore:selection.score ?? 0,
        storySafe:selection.storySafe === true,
        registrationPresent:Boolean(identity.registration),
        modeSPresent:Boolean(identity.modeS),
        movementConfidence:movement.confidence ?? null,
        fallbackUsed:false,
        targetLocked,
        targetMatched:true,
        routeGuard
      },
      output:{ available:Boolean(story), class:storyClass, confidence, story, segments, facts, sources }
    });
  } catch (error) {
    console.error("MikeAircraft Storyteller error:", error);
    return res.status(500).json({ ok:false, service:"MikeAircraft Storyteller", version:"0.5", error:error.message });
  }
};
