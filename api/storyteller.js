// MikeAircraft Storyteller API
// Version 0.1
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

    if (!engine || engineResult.status >= 400 || !engine.ok) {
      throw new Error((engine && engine.error) || "Engine request failed");
    }
    if (!broadcast || broadcastResult.status >= 400 || !broadcast.ok) {
      throw new Error((broadcast && broadcast.error) || "Broadcast request failed");
    }

    const selection = engine.intelligence && engine.intelligence.selectionConfidence
      ? engine.intelligence.selectionConfidence
      : {};
    const current = broadcast.aircraft && broadcast.aircraft.current && broadcast.aircraft.current.available
      ? broadcast.aircraft.current
      : null;

    const identity = current && current.identity ? current.identity : {};
    const aircraft = current && current.aircraft ? current.aircraft : {};
    const movement = current && current.movement ? current.movement : {};
    const route = current && current.route ? current.route : {};
    const operator = current && current.operator ? current.operator : {};
    const telemetry = current && current.telemetry ? current.telemetry : {};

    // Strong gate: the selector itself must say storySafe, and the physical
    // aircraft identity must include registration plus a stable Mode-S/hex ID.
    const identityStrong = Boolean(
      current &&
      selection.storySafe === true &&
      selection.level === "VERY_HIGH" &&
      identity.registration &&
      identity.modeS &&
      Number(movement.confidence || 0) >= 90
    );

    const sources = [];
    const facts = [];
    let story = null;
    let storyClass = "SILENT";
    let confidence = 0;

    function pushSource(source, detail) {
      if (!sources.some(s => s.source === source && s.detail === detail)) {
        sources.push({ source, detail });
      }
    }

    function cleanName(value) {
      return value ? String(value).replace(/\s+/g, " ").trim() : null;
    }

    if (identityStrong) {
      const flight = cleanName(identity.flight || identity.callsign);
      const reg = cleanName(identity.registration);
      const typeName = cleanName(aircraft.name || aircraft.typeCode);
      const airline = operator.identified ? cleanName(operator.name) : null;
      const status = cleanName(movement.displayState || movement.state);
      const runway = cleanName(movement.runway);
      const routeOK = Boolean(route.found && route.origin && route.destination && route.display);

      if (flight) facts.push({ label:"flight", value:flight });
      if (reg) facts.push({ label:"registration", value:reg });
      if (typeName) facts.push({ label:"aircraft", value:typeName });
      if (airline) facts.push({ label:"operator", value:airline });
      if (status) facts.push({ label:"movement", value:status });
      if (runway) facts.push({ label:"runway", value:runway });
      if (telemetry.airportDistanceKm != null) facts.push({ label:"distanceKm", value:telemetry.airportDistanceKm });

      pushSource("MikeAircraft Director", `selection ${selection.level}, score ${selection.score}`);
      pushSource("Live ADS-B", `${identity.callsign || reg} / ${reg}`);
      if (aircraft.owner || aircraft.manufacturer || aircraft.typeCode) pushSource("ADSBDB aircraft identity", reg);

      let textParts = [];
      if (airline && flight) textParts.push(`${flight} is operated by ${airline}.`);
      else if (flight) textParts.push(`This is ${flight}.`);
      else textParts.push(`This aircraft is ${reg}.`);

      if (typeName) textParts.push(`The aircraft is ${typeName}.`);

      if (routeOK) {
        const from = cleanName(route.origin.city || route.origin.name || route.origin.iata || route.origin.icao);
        const to = cleanName(route.destination.city || route.destination.name || route.destination.iata || route.destination.icao);
        textParts.push(`It is operating from ${from} to ${to}.`);
        facts.push({ label:"route", value:route.display });
        pushSource("Route lookup", route.display);
      }

      if (status) {
        let movementSentence = `Right now it is ${status.toLowerCase()}`;
        if (runway) movementSentence += ` for runway ${runway}`;
        movementSentence += ".";
        textParts.push(movementSentence);
      }

      story = {
        headline: flight ? `${flight}${typeName ? " • " + typeName : ""}` : `${reg}${typeName ? " • " + typeName : ""}`,
        text: textParts.join(" "),
        tone: "viewer-friendly",
        specificAircraft: true
      };
      storyClass = routeOK ? "VERIFIED_FLIGHT_STORY" : "VERIFIED_AIRCRAFT_STORY";
      confidence = Math.max(93, Math.min(100, Number(selection.score || 93)));
    } else if (current && aircraft.typeCode) {
      // Low-risk fallback: do not name registration, airline, route or flight.
      // This gives the frontend something useful without presenting uncertain
      // identity as fact.
      const typeName = cleanName(aircraft.name || aircraft.typeCode);
      const status = cleanName(movement.displayState || movement.state);
      story = {
        headline: typeName || "Live airport activity",
        text: status
          ? `MikeAircraft is tracking ${typeName || "an aircraft"} ${status.toLowerCase()}, but identity confidence is not yet high enough for an aircraft-specific story.`
          : `MikeAircraft is tracking ${typeName || "an aircraft"}, but identity confidence is not yet high enough for an aircraft-specific story.`,
        tone: "viewer-friendly",
        specificAircraft: false
      };
      storyClass = "GENERIC_SAFE_CONTEXT";
      confidence = Math.max(40, Math.min(75, Number(selection.score || 50)));
      facts.push({ label:"reportedType", value:typeName });
      pushSource("MikeAircraft Director", `identity gate not passed (${selection.level || "NONE"})`);
    }

    return res.status(200).json({
      ok:true,
      service:"MikeAircraft Storyteller",
      version:"0.1",
      generatedAt:new Date().toISOString(),
      airport:broadcast.airport || { code:airport },
      gate:{
        passed:identityStrong,
        selectionLevel:selection.level || "NONE",
        selectionScore:selection.score ?? 0,
        storySafe:selection.storySafe === true,
        registrationPresent:Boolean(identity.registration),
        modeSPresent:Boolean(identity.modeS),
        movementConfidence:movement.confidence ?? null
      },
      output:{
        available:Boolean(story),
        class:storyClass,
        confidence,
        story,
        facts,
        sources
      }
    });
  } catch (error) {
    console.error("MikeAircraft Storyteller error:", error);
    return res.status(500).json({
      ok:false,
      service:"MikeAircraft Storyteller",
      version:"0.1",
      error:error.message
    });
  }
};
