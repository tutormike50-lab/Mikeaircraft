const {LEARNER_AIRPORTS}=require("./airports.js");
const {createRedisClient}=require("../services/redis.js");

const SOURCE="adsb.lol";
const RADIUS_NM=35;
const BATCH=4;
const FETCH_CONCURRENCY=2;
const CURSOR_KEY="mikeaircraft:learner:cursor:v1";
const LOCK_KEY="mikeaircraft:learner:lock:v1";
const STATS_KEY="mikeaircraft:learner:stats:v1";
const TTL_SECONDS=60*60*24*180;
const PIPELINE_CHUNK=100;

function clean(v){return String(v||"").trim().toUpperCase();}
function usable(a){
  const hex=clean(a.hex); const call=clean(a.flight);
  if(!hex || hex.startsWith("~")) return false;
  if(!call && !a.r && !a.t) return false;
  return true;
}
function snapshot(a,airport,now){
  return {hex:clean(a.hex),callsign:clean(a.flight),registration:clean(a.r),type:clean(a.t),airport:airport.code,
    lat:Number.isFinite(Number(a.lat))?Number(a.lat):null,lon:Number.isFinite(Number(a.lon))?Number(a.lon):null,
    altitude:a.alt_baro??a.alt_geom??null,groundSpeed:a.gs??null,track:a.track??null,verticalRate:a.baro_rate??a.geom_rate??null,
    firstSeen:now,lastSeen:now,source:SOURCE};
}
function parseJson(raw){if(!raw)return {};try{return JSON.parse(raw)||{};}catch{return {};}}
async function setJson(redis,key,value,ttl){
  const cmd=ttl?["SET",key,JSON.stringify(value),"EX",String(ttl)]:["SET",key,JSON.stringify(value)];
  return redis.command(cmd);
}
async function acquireLock(redis){
  const token=`${Date.now()}-${Math.random()}`;
  const ok=await redis.command(["SET",LOCK_KEY,token,"NX","EX","180"]);
  return ok?token:null;
}
async function releaseLock(redis,token){
  const current=await redis.command(["GET",LOCK_KEY]);
  if(current===token) await redis.command(["DEL",LOCK_KEY]);
}
async function fetchAirport(airport){
  const url=`https://api.adsb.lol/v2/point/${airport.lat}/${airport.lon}/${RADIUS_NM}`;
  const r=await fetch(url,{headers:{"User-Agent":"MikeAircraft-Network-Learner/0.2"},signal:AbortSignal.timeout(9000)});
  if(!r.ok) throw new Error(`${SOURCE} HTTP ${r.status}`);
  const j=await r.json(); return Array.isArray(j.ac)?j.ac:[];
}
async function fetchAirportsLimited(airports,errors){
  const results=new Array(airports.length);
  let next=0;
  async function worker(){
    while(true){
      const i=next++; if(i>=airports.length)return;
      const airport=airports[i];
      try{results[i]={airport,aircraft:await fetchAirport(airport)};}
      catch(e){errors.push(`${airport.code}:${e.message}`);results[i]={airport,aircraft:[]};}
    }
  }
  await Promise.all(Array.from({length:Math.min(FETCH_CONCURRENCY,airports.length)},worker));
  return results;
}
async function mgetMap(redis,keys){
  const out=new Map();
  if(!keys.length)return out;
  const values=await redis.command(["MGET",...keys]);
  keys.forEach((key,i)=>out.set(key,parseJson(Array.isArray(values)?values[i]:null)));
  return out;
}
async function runPipelineChunks(redis,commands){
  for(let i=0;i<commands.length;i+=PIPELINE_CHUNK){
    await redis.pipeline(commands.slice(i,i+PIPELINE_CHUNK));
  }
}
async function runCollector(){
  const redis=createRedisClient(); if(!redis.available) return {ok:false,error:"REDIS_UNAVAILABLE"};
  const lock=await acquireLock(redis); if(!lock)return {ok:true,skipped:true,reason:"LOCKED"};
  const started=Date.now(); let aircraftSeen=0,aircraftLearned=0,errors=[];
  try{
    const raw=await redis.command(["GET",CURSOR_KEY]); let cursor=Number(raw||0)%LEARNER_AIRPORTS.length;
    const airports=[];
    for(let i=0;i<BATCH;i++)airports.push(LEARNER_AIRPORTS[(cursor+i)%LEARNER_AIRPORTS.length]);

    const fetched=await fetchAirportsLimited(airports,errors);
    const observations=[]; const now=new Date().toISOString();
    for(const {airport,aircraft} of fetched){
      aircraftSeen+=aircraft.length;
      for(const a of aircraft){if(!usable(a))continue;observations.push(snapshot(a,airport,now));}
    }

    const aircraftKeys=[...new Set(observations.map(s=>`mikeaircraft:learner:aircraft:${s.hex}`))];
    const callsignKeys=[...new Set(observations.filter(s=>s.callsign).map(s=>`mikeaircraft:learner:callsign:${s.callsign}`))];
    const [aircraftState,callsignState]=await Promise.all([mgetMap(redis,aircraftKeys),mgetMap(redis,callsignKeys)]);

    for(const s of observations){
      const key=`mikeaircraft:learner:aircraft:${s.hex}`;
      const old=aircraftState.get(key)||{};
      const airportsSeen=old.airports&&typeof old.airports==="object"?{...old.airports}:{};
      airportsSeen[s.airport]=(airportsSeen[s.airport]||0)+1;
      const callsigns=old.callsigns&&typeof old.callsigns==="object"?{...old.callsigns}:{};
      if(s.callsign) callsigns[s.callsign]=(callsigns[s.callsign]||0)+1;
      aircraftState.set(key,{...old,...s,firstSeen:old.firstSeen||now,lastSeen:now,observations:(old.observations||0)+1,airports:airportsSeen,callsigns});

      if(s.callsign){
        const ck=`mikeaircraft:learner:callsign:${s.callsign}`;
        const co=callsignState.get(ck)||{};
        const seen=co.airports&&typeof co.airports==="object"?{...co.airports}:{};
        seen[s.airport]=(seen[s.airport]||0)+1;
        callsignState.set(ck,{callsign:s.callsign,airports:seen,observations:(co.observations||0)+1,lastSeen:now,source:SOURCE});
      }
      aircraftLearned++;
    }

    const writes=[];
    for(const [key,value] of aircraftState)writes.push(["SET",key,JSON.stringify(value),"EX",String(TTL_SECONDS)]);
    for(const [key,value] of callsignState)writes.push(["SET",key,JSON.stringify(value),"EX",String(TTL_SECONDS)]);
    if(writes.length) await runPipelineChunks(redis,writes);

    cursor=(cursor+BATCH)%LEARNER_AIRPORTS.length; await redis.command(["SET",CURSOR_KEY,String(cursor)]);
    const result={ok:true,version:"0.2",source:SOURCE,airports:airports.map(a=>a.code),aircraftSeen,aircraftLearned,uniqueAircraft:aircraftState.size,uniqueCallsigns:callsignState.size,nextAirport:LEARNER_AIRPORTS[cursor].code,errors,durationMs:Date.now()-started,finishedAt:new Date().toISOString()};
    await setJson(redis,STATS_KEY,result,60*60*24*7); return result;
  } finally {await releaseLock(redis,lock).catch(()=>{});}
}
module.exports={runCollector};
