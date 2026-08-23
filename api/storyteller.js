// MikeAircraft Storyteller API
// Version 0.6 — selective, individuality-first Plane Facts.
// Editorial rule: silence is better than filler; no evidence = no fact.

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
    const airport=String(req.query?.airport||"PRG").trim().toUpperCase(), targetRegistration=String(req.query?.registration||"").trim().toUpperCase(), targetCallsign=String(req.query?.callsign||"").trim().toUpperCase(), targetLocked=Boolean(targetRegistration||targetCallsign);
    const airportIds={PRG:{iata:"PRG",icao:"LKPR"},LHR:{iata:"LHR",icao:"EGLL"},FRA:{iata:"FRA",icao:"EDDF"},AMS:{iata:"AMS",icao:"EHAM"},CDG:{iata:"CDG",icao:"LFPG"},MAN:{iata:"MAN",icao:"EGCC"},ATL:{iata:"ATL",icao:"KATL"}};
    async function invokeHandler(h,q){let statusCode=200,responseData=null;const r={method:"GET",query:q||{},headers:req.headers||{}},s={setHeader(){return s},status(c){statusCode=c;return s},json(d){responseData=d;return d},send(d){responseData=d;return d},end(){return null}};await h(r,s);return{status:statusCode,data:responseData}}
    const [er,br]=await Promise.all([invokeHandler(engineHandler,{airport}),invokeHandler(broadcastHandler,{airport})]),engine=er.data,broadcast=br.data;
    if(!engine||er.status>=400||!engine.ok)throw new Error(engine?.error||"Engine request failed");if(!broadcast||br.status>=400||!broadcast.ok)throw new Error(broadcast?.error||"Broadcast request failed");
    const selection=engine.intelligence?.selectionConfidence||{},current=broadcast.aircraft?.current?.available?broadcast.aircraft.current:null,identity=current?.identity||{},aircraft=current?.aircraft||{},movement=current?.movement||{},route=current?.route||{},operator=current?.operator||{};
    const reg=String(identity.registration||"").trim().toUpperCase(),callsign=String(identity.callsign||"").trim().toUpperCase(),targetMatches=!targetLocked||(targetRegistration&&reg===targetRegistration)||(targetCallsign&&callsign===targetCallsign),base={ok:true,service:"MikeAircraft Storyteller",version:"0.6",generatedAt:new Date().toISOString(),airport:broadcast.airport||{code:airport}};
    if(targetLocked&&!targetMatches)return res.status(200).json({...base,gate:{passed:false,targetLocked:true,targetMatched:false},output:{available:false,class:"SILENT_CURRENT_MISMATCH",confidence:0,attention:null,story:null,segments:[],facts:[],sources:[]}});
    const identityStrong=Boolean(current&&selection.storySafe===true&&selection.level==="VERY_HIGH"&&identity.registration&&identity.modeS&&Number(movement.confidence||0)>=90),sources=[],facts=[],segments=[];let routeGuard={checked:false,accepted:false,reason:"No route evaluated"};
    const clean=v=>v?String(v).replace(/\s+/g," ").trim():null,source=(s,d)=>{if(!sources.some(x=>x.source===s&&x.detail===d))sources.push({source:s,detail:d})},segment=(kind,text)=>{const t=clean(text);if(t&&!segments.some(x=>x.text===t))segments.push({kind,text:t})};
    function endpointMatchesLocal(e){const l=airportIds[airport];if(!l||!e)return false;return String(e.iata||"").toUpperCase()===l.iata||String(e.icao||"").toUpperCase()===l.icao}
    function routeCoherence(){if(!(route.found&&route.origin&&route.destination&&route.display))return{checked:false,accepted:false,reason:"No complete route"};const lin=String(movement.lineage||"").toUpperCase();if(lin==="ARRIVAL")return endpointMatchesLocal(route.destination)?{checked:true,accepted:true,reason:"Arrival destination matches live airport"}:{checked:true,accepted:false,reason:"Arrival destination conflicts with live airport"};if(lin==="DEPARTURE")return endpointMatchesLocal(route.origin)?{checked:true,accepted:true,reason:"Departure origin matches live airport"}:{checked:true,accepted:false,reason:"Departure origin conflicts with live airport"};return{checked:true,accepted:false,reason:"Movement lineage is not certain enough to validate route"}}
    if(identityStrong){
      routeGuard=routeCoherence();const flight=clean(identity.flight||identity.callsign),typeName=clean(aircraft.name||aircraft.typeCode),airline=operator.identified?clean(operator.name):null,owner=clean(aircraft.owner),country=clean(aircraft.ownerCountry);
      source("MikeAircraft Director",`selection ${selection.level}, score ${selection.score}`);source("Live ADS-B",`${identity.callsign||reg} / ${reg}`);if(aircraft.owner||aircraft.manufacturer||aircraft.typeCode)source("ADSBDB aircraft identity",reg);
      facts.push({label:"registration",value:reg});if(typeName)facts.push({label:"aircraft",value:typeName});if(airline)facts.push({label:"operator",value:airline});if(routeGuard.accepted){facts.push({label:"route",value:route.display});source("Route lookup",route.display)}else if(routeGuard.checked)source("Route guard",routeGuard.reason);
      const ownerAddsValue=Boolean(owner&&(!airline||owner.toLowerCase()!==airline.toLowerCase()));
      if(ownerAddsValue){segment("identity",flight?`${flight} is ${typeName?`a ${typeName}`:"the aircraft"} we're watching, registration ${reg}.`:`The aircraft we're watching is ${reg}${typeName?`, a ${typeName}`:""}.`);segment("individual",`This particular aircraft is registered to ${owner}${country?` in ${country}`:""}.`);return res.status(200).json({...base,gate:{passed:true,selectionLevel:selection.level,selectionScore:selection.score,storySafe:true,registrationPresent:true,modeSPresent:true,movementConfidence:movement.confidence,targetLocked,targetMatched:true,routeGuard},output:{available:true,class:"PLANE_FACT",confidence:Math.max(93,Math.min(100,Number(selection.score||93))),attention:{label:"PLANE FACT",style:"flash",flashCount:3,flashDurationMs:2000,then:"steady"},story:{headline:"✦ PLANE FACT ✦",text:segments.map(s=>s.text).join(" "),tone:"interesting-verified",specificAircraft:true},segments,facts,sources}})}
    }
    return res.status(200).json({...base,gate:{passed:false,selectionLevel:selection.level||"NONE",selectionScore:selection.score??0,storySafe:false,registrationPresent:Boolean(identity.registration),modeSPresent:Boolean(identity.modeS),movementConfidence:movement.confidence??null,targetLocked,targetMatched:true,routeGuard},output:{available:false,class:"SILENT_NO_INTERESTING_VERIFIED_FACT",confidence:0,attention:null,story:null,segments:[],facts,sources}});
  } catch(error){console.error("MikeAircraft Storyteller error:",error);return res.status(500).json({ok:false,service:"MikeAircraft Storyteller",version:"0.6",error:error.message})}
};
