// MikeAircraft Storyteller API
// Version 0.7 — WOW gate + human mini-story composer.
// Rules: no evidence = no fact; identification is not a story; silence beats filler.

const engineHandler = require("./engine.js");
const broadcastHandler = require("./broadcast.js");

module.exports = async function handler(req,res){
 res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Methods","GET, OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type");res.setHeader("Cache-Control","no-store");
 if(req.method==="OPTIONS")return res.status(204).end();if(req.method!=="GET")return res.status(405).json({ok:false,error:"Method not allowed"});
 try{
  const airport=String(req.query?.airport||"PRG").trim().toUpperCase(),targetRegistration=String(req.query?.registration||"").trim().toUpperCase(),targetCallsign=String(req.query?.callsign||"").trim().toUpperCase(),targetLocked=Boolean(targetRegistration||targetCallsign);
  const airportIds={PRG:{iata:"PRG",icao:"LKPR"},LHR:{iata:"LHR",icao:"EGLL"},FRA:{iata:"FRA",icao:"EDDF"},AMS:{iata:"AMS",icao:"EHAM"},CDG:{iata:"CDG",icao:"LFPG"},MAN:{iata:"MAN",icao:"EGCC"},ATL:{iata:"ATL",icao:"KATL"}};
  async function invoke(h,q){let status=200,data=null;const r={method:"GET",query:q||{},headers:req.headers||{}},s={setHeader(){return s},status(c){status=c;return s},json(d){data=d;return d},send(d){data=d;return d},end(){return null}};await h(r,s);return{status,data}}
  const [er,br]=await Promise.all([invoke(engineHandler,{airport}),invoke(broadcastHandler,{airport})]),engine=er.data,broadcast=br.data;if(!engine||er.status>=400||!engine.ok)throw new Error(engine?.error||"Engine request failed");if(!broadcast||br.status>=400||!broadcast.ok)throw new Error(broadcast?.error||"Broadcast request failed");
  const selection=engine.intelligence?.selectionConfidence||{},current=broadcast.aircraft?.current?.available?broadcast.aircraft.current:null,identity=current?.identity||{},aircraft=current?.aircraft||{},movement=current?.movement||{},route=current?.route||{},operator=current?.operator||{};
  const reg=String(identity.registration||"").trim().toUpperCase(),callsign=String(identity.callsign||"").trim().toUpperCase(),targetMatches=!targetLocked||(targetRegistration&&reg===targetRegistration)||(targetCallsign&&callsign===targetCallsign),base={ok:true,service:"MikeAircraft Storyteller",version:"0.7",generatedAt:new Date().toISOString(),airport:broadcast.airport||{code:airport}};
  if(targetLocked&&!targetMatches)return res.status(200).json({...base,gate:{passed:false,targetLocked:true,targetMatched:false},output:{available:false,class:"SILENT_CURRENT_MISMATCH",confidence:0,attention:null,story:null,segments:[],facts:[],sources:[]}});
  const identityStrong=Boolean(current&&selection.storySafe===true&&selection.level==="VERY_HIGH"&&identity.registration&&identity.modeS&&Number(movement.confidence||0)>=90),sources=[],facts=[];let routeGuard={checked:false,accepted:false,reason:"No route evaluated"};
  const clean=v=>v?String(v).replace(/\s+/g," ").trim():null,source=(s,d)=>{if(!sources.some(x=>x.source===s&&x.detail===d))sources.push({source:s,detail:d})};
  function local(e){const l=airportIds[airport];return Boolean(l&&e&&(String(e.iata||"").toUpperCase()===l.iata||String(e.icao||"").toUpperCase()===l.icao))}
  function routeCheck(){if(!(route.found&&route.origin&&route.destination&&route.display))return{checked:false,accepted:false,reason:"No complete route"};const lin=String(movement.lineage||"").toUpperCase();if(lin==="ARRIVAL")return local(route.destination)?{checked:true,accepted:true,reason:"Arrival destination matches live airport"}:{checked:true,accepted:false,reason:"Arrival destination conflicts with live airport"};if(lin==="DEPARTURE")return local(route.origin)?{checked:true,accepted:true,reason:"Departure origin matches live airport"}:{checked:true,accepted:false,reason:"Departure origin conflicts with live airport"};return{checked:true,accepted:false,reason:"Movement lineage uncertain"}}
  if(identityStrong){
   routeGuard=routeCheck();const typeName=clean(aircraft.name||aircraft.typeCode),airline=operator.identified?clean(operator.name):null;
   source("MikeAircraft Director",`selection ${selection.level}, score ${selection.score}`);source("Live ADS-B",`${callsign||reg} / ${reg}`);if(aircraft.owner||aircraft.manufacturer||aircraft.typeCode)source("ADSBDB aircraft identity",reg);
   facts.push({kind:"identity",label:"registration",value:reg,wow:0});if(typeName)facts.push({kind:"identity",label:"aircraft",value:typeName,wow:0});if(airline)facts.push({kind:"identity",label:"operator",value:airline,wow:0});if(routeGuard.accepted){facts.push({kind:"context",label:"route",value:route.display,wow:0});source("Route lookup",route.display)}

   // Future enrichers feed only verified facts into these fields. v0.7 will not infer them.
   const verified=aircraft.verifiedStoryFacts||current.verifiedStoryFacts||[];
   for(const f of Array.isArray(verified)?verified:[]){if(!f||f.verified!==true||!clean(f.text))continue;const wow=Math.max(0,Math.min(5,Number(f.wow||0)));facts.push({kind:f.kind||"individual",label:f.label||"fact",value:f.value||null,text:clean(f.text),wow,verified:true,source:f.source||null});if(f.source)source(f.source,reg)}
   const wowFacts=facts.filter(f=>f.verified===true&&f.wow>=3).sort((a,b)=>b.wow-a.wow).slice(0,4);
   const wowScore=wowFacts.reduce((n,f)=>n+f.wow,0);
   if(wowFacts.length){
    const openings=["There's an interesting story behind this aircraft.","This one has a story worth telling.","There's more to this aircraft than meets the eye.","This aircraft has an interesting history."];
    const seed=[...reg].reduce((n,c)=>n+c.charCodeAt(0),0),opening=openings[seed%openings.length];
    let body=wowFacts.map(f=>f.text.replace(/[. ]+$/,"" )).join(". ")+".";let text=(opening+" "+body).replace(/\s+/g," ").trim();
    const words=text.split(/\s+/);if(words.length>65)text=words.slice(0,65).join(" ").replace(/[,;:]?$/,"…");
    return res.status(200).json({...base,gate:{passed:true,selectionLevel:selection.level,selectionScore:selection.score,storySafe:true,targetLocked,targetMatched:true,routeGuard,wowScore,wowFacts:wowFacts.length},output:{available:true,class:"PLANE_FACT",confidence:Math.max(93,Math.min(100,Number(selection.score||93))),attention:{label:"PLANE FACT",style:"flash",flashCount:3,flashDurationMs:2000,then:"steady"},story:{headline:"✦ PLANE FACT ✦",text,tone:"human-interest-verified",specificAircraft:true},segments:[{kind:"mini_story",text}],facts,sources}})
   }
  }
  return res.status(200).json({...base,gate:{passed:false,selectionLevel:selection.level||"NONE",selectionScore:selection.score??0,storySafe:Boolean(identityStrong),targetLocked,targetMatched:true,routeGuard,wowRule:"Requires at least one verified aircraft-specific fact scoring 3/5 or higher"},output:{available:false,class:"SILENT_NO_WOW_FACT",confidence:0,attention:null,story:null,segments:[],facts,sources}});
 }catch(error){console.error("MikeAircraft Storyteller error:",error);return res.status(500).json({ok:false,service:"MikeAircraft Storyteller",version:"0.7",error:error.message})}
};
