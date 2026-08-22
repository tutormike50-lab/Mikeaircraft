const {LEARNER_AIRPORTS}=require("./airports.js");
const {createRedisClient}=require("../services/redis.js");

const SOURCE="adsb.lol";
const RADIUS_NM=35;
const BATCH=4;
const CURSOR_KEY="mikeaircraft:learner:cursor:v1";
const LOCK_KEY="mikeaircraft:learner:lock:v1";
const STATS_KEY="mikeaircraft:learner:stats:v1";

function clean(v){return String(v||"").trim().toUpperCase();}
function usable(a){
  const hex=clean(a.hex); const call=clean(a.flight);
  if(!hex || hex.startsWith("~")) return false;
  // Ignore obvious ground-only clutter with no usable identity.
  if(!call && !a.r && !a.t) return false;
  return true;
}
function snapshot(a,airport,now){
  return {hex:clean(a.hex),callsign:clean(a.flight),registration:clean(a.r),type:clean(a.t),airport:airport.code,
    lat:Number.isFinite(Number(a.lat))?Number(a.lat):null,lon:Number.isFinite(Number(a.lon))?Number(a.lon):null,
    altitude:a.alt_baro??a.alt_geom??null,groundSpeed:a.gs??null,track:a.track??null,verticalRate:a.baro_rate??a.geom_rate??null,
    firstSeen:now,lastSeen:now,source:SOURCE};
}
async function setJson(redis,key,value,ttl){
  const cmd=ttl?["SET",key,JSON.stringify(value),"EX",String(ttl)]:["SET",key,JSON.stringify(value)];
  return redis.command(cmd);
}
async function getJson(redis,key){
  const raw=await redis.command(["GET",key]); if(!raw)return null;
  try{return JSON.parse(raw);}catch{return null;}
}
async function acquireLock(redis){
  const token=`${Date.now()}-${Math.random()}`;
  const ok=await redis.command(["SET",LOCK_KEY,token,"NX","EX","55"]);
  return ok?token:null;
}
async function releaseLock(redis,token){
  const current=await redis.command(["GET",LOCK_KEY]);
  if(current===token) await redis.command(["DEL",LOCK_KEY]);
}
async function fetchAirport(airport){
  const url=`https://api.adsb.lol/v2/point/${airport.lat}/${airport.lon}/${RADIUS_NM}`;
  const r=await fetch(url,{headers:{"User-Agent":"MikeAircraft-Network-Learner/0.1"},signal:AbortSignal.timeout(9000)});
  if(!r.ok) throw new Error(`${SOURCE} HTTP ${r.status}`);
  const j=await r.json(); return Array.isArray(j.ac)?j.ac:[];
}
async function learn(redis,airport,a,now){
  const s=snapshot(a,airport,now); const key=`mikeaircraft:learner:aircraft:${s.hex}`;
  const old=await getJson(redis,key)||{};
  const airports=old.airports&&typeof old.airports==="object"?old.airports:{};
  airports[airport.code]=(airports[airport.code]||0)+1;
  const callsigns=old.callsigns&&typeof old.callsigns==="object"?old.callsigns:{};
  if(s.callsign) callsigns[s.callsign]=(callsigns[s.callsign]||0)+1;
  const merged={...old,...s,firstSeen:old.firstSeen||now,lastSeen:now,observations:(old.observations||0)+1,airports,callsigns};
  await setJson(redis,key,merged,60*60*24*180);
  if(s.callsign){
    const ck=`mikeaircraft:learner:callsign:${s.callsign}`; const co=await getJson(redis,ck)||{};
    const seen=co.airports&&typeof co.airports==="object"?co.airports:{}; seen[airport.code]=(seen[airport.code]||0)+1;
    await setJson(redis,ck,{callsign:s.callsign,airports:seen,observations:(co.observations||0)+1,lastSeen:now,source:SOURCE},60*60*24*180);
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
    for(const airport of airports){
      try{
        const aircraft=await fetchAirport(airport); aircraftSeen+=aircraft.length;
        for(const a of aircraft){if(!usable(a))continue; await learn(redis,airport,a,new Date().toISOString()); aircraftLearned++;}
      }catch(e){errors.push(`${airport.code}:${e.message}`);}
    }
    cursor=(cursor+BATCH)%LEARNER_AIRPORTS.length; await redis.command(["SET",CURSOR_KEY,String(cursor)]);
    const result={ok:true,version:"0.1",source:SOURCE,airports:airports.map(a=>a.code),aircraftSeen,aircraftLearned,nextAirport:LEARNER_AIRPORTS[cursor].code,errors,durationMs:Date.now()-started,finishedAt:new Date().toISOString()};
    await setJson(redis,STATS_KEY,result,60*60*24*7); return result;
  } finally {await releaseLock(redis,lock).catch(()=>{});}
}
module.exports={runCollector};
