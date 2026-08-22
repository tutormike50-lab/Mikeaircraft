const baseHandler=require("./engine-base.js");
const {normalizeAirportCode}=require("./config/airports.js");
const {createRedisClient}=require("./services/redis.js");

module.exports=async function handler(req,res){
  const originalJson=res.json.bind(res);
  const airportCode=normalizeAirportCode(req.query?.airport||"PRG");
  const redis=createRedisClient();
  const lockKey=`mikeaircraft:v2:${airportCode}:editorial-current`;
  const completedKey=`mikeaircraft:v2:${airportCode}:editorial-completed`;
  const now=Date.now(),DROPOUT_GRACE_MS=15000,COMPLETED_COOLDOWN_SECONDS=120;
  async function safeRedis(command){try{return await redis.command(command)}catch{return null}}
  async function loadJson(key){const stored=await safeRedis(["GET",key]);if(!stored)return null;try{return JSON.parse(stored)}catch{return null}}
  async function markCompleted(ac){if(!ac?.id)return;await safeRedis(["SET",completedKey,JSON.stringify({id:ac.id,completedAt:now,lineage:ac.lineage,state:ac.state}),"EX",String(COMPLETED_COOLDOWN_SECONDS)])}
  async function saveLock(ac,reason,previousLock=null){
    if(!ac){await safeRedis(["DEL",lockKey]);return}
    const sameAircraft=previousLock?.id===ac.id;
    const value={id:ac.id,since:sameAircraft&&previousLock?.since?previousLock.since:now,reason,updatedAt:now,snapshot:ac};
    await safeRedis(["SET",lockKey,JSON.stringify(value),"EX","900"]);
  }
  function displayObject(ac,stale=false){
    if(!ac)return null;
    return {id:ac.id,hex:ac.hex,callsign:ac.callsign,registration:ac.registration,type:ac.type,state:ac.state,lineage:ac.lineage,confidence:ac.confidence,
      runway:ac.nearestRunway||ac.runway||null,runwayAlignment:Number.isFinite(ac.runwayAlignment)?Number(ac.runwayAlignment.toFixed(1)):null,
      distanceKm:Number.isFinite(ac.airportDistance)?Number(ac.airportDistance.toFixed(2)):(Number.isFinite(ac.distanceKm)?Number(ac.distanceKm):null),
      thresholdKm:Number.isFinite(ac.thresholdDistance)?Number(ac.thresholdDistance.toFixed(2)):(Number.isFinite(ac.thresholdKm)?Number(ac.thresholdKm):null),
      altitude:ac.altitude,speed:ac.speed,positionAge:ac.positionAge,stateAgeSeconds:ac.stateAgeSeconds,sampleCount:ac.sampleCount,score:null,stale};
  }
  function staleSnapshot(lock){
    if(!lock?.snapshot||!lock?.updatedAt)return null;
    const ageMs=now-Number(lock.updatedAt);if(ageMs<0||ageMs>DROPOUT_GRACE_MS)return null;
    const snapshot={...lock.snapshot},addedSeconds=ageMs/1000;
    snapshot.positionAge=snapshot.positionAge!=null&&Number.isFinite(Number(snapshot.positionAge))?Number(snapshot.positionAge)+addedSeconds:addedSeconds;
    snapshot._editorialStale=true;return snapshot;
  }
  function sequenceComplete(ac){
    if(!ac)return false;
    if(ac.lineage==="ARRIVAL"&&ac.state==="LANDED")return Number(ac.stateAgeSeconds||0)>=20;
    if(ac.lineage==="DEPARTURE"&&ac.state==="DEPARTING"){
      const distance=Number.isFinite(Number(ac.airportDistance))?Number(ac.airportDistance):Number(ac.distanceKm);return distance>4;
    }
    return false;
  }
  function takeoffCandidate(list,current,completedId){
    return list.filter(ac=>ac.id!==current?.id&&ac.id!==completedId&&ac.lineage==="DEPARTURE"&&ac.state==="TAKEOFF_ROLL"&&Number(ac.confidence||0)>=85&&(ac.positionAge==null||Number(ac.positionAge)<=8))
      .sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0))[0]||null;
  }
  function canTakeoffInterrupt(current){
    if(!current)return true;if(current.lineage!=="ARRIVAL")return false;if(current.state==="LANDED")return true;if(current.state==="ON_FINAL")return false;
    if(current.state==="APPROACHING"){const threshold=Number.isFinite(Number(current.thresholdDistance))?Number(current.thresholdDistance):Number(current.thresholdKm);return threshold>3}return true;
  }
  function confidenceFor(ac,originalConfidence,originalId,stale=false){
    if(!ac)return {level:"NONE",score:0,ambiguous:true,scoreMargin:null,candidateCount:0,storySafe:false};
    if(stale)return {level:"LOW",score:Math.min(60,Number(ac.confidence||0)),ambiguous:true,scoreMargin:null,candidateCount:1,storySafe:false};
    if(originalId===ac.id&&originalConfidence)return originalConfidence;
    let score=Number(ac.confidence||0)+Math.min(8,Number(ac.sampleCount||0));if(ac.registration&&ac.hex)score+=5;if(ac.positionAge!=null)score-=Math.min(15,Number(ac.positionAge)*2);
    score=Math.max(0,Math.min(100,Math.round(score)));const identityStrong=Boolean(ac.registration&&ac.hex),fresh=ac.positionAge==null||Number(ac.positionAge)<=5,sampled=Number(ac.sampleCount||0)>=3;
    const level=score>=93&&identityStrong&&fresh&&sampled?"VERY_HIGH":score>=86?"HIGH":score>=76?"MEDIUM":"LOW";
    return {level,score,ambiguous:level!=="VERY_HIGH",scoreMargin:null,candidateCount:1,storySafe:Boolean(level==="VERY_HIGH"&&identityStrong&&fresh&&sampled&&ac.state!=="LANDED")};
  }

  res.json=async function editorialJson(payload){
    if(!payload?.ok||!Array.isArray(payload.aircraft)||!payload.intelligence)return originalJson(payload);
    const aircraft=payload.aircraft,originalCurrentId=payload.intelligence.current?.id||null,originalConfidence=payload.intelligence.selectionConfidence||null;
    const [lock,completed]=await Promise.all([loadJson(lockKey),loadJson(completedKey)]),completedId=completed?.id||null;
    let current=lock?.id&&lock.id!==completedId?aircraft.find(ac=>ac.id===lock.id)||null:null,stale=false,reason=lock?.reason||"STICKY_CURRENT";
    if(!current&&lock?.id&&lock.id!==completedId){current=staleSnapshot(lock);stale=Boolean(current);if(stale)reason="DROPOUT_GRACE"}
    if(current&&!stale&&sequenceComplete(current)){await markCompleted(current);current=null;reason="SEQUENCE_COMPLETE"}
    const activeCompletedId=reason==="SEQUENCE_COMPLETE"?(lock?.id||completedId):completedId;
    const takeoff=takeoffCandidate(aircraft,current,activeCompletedId);if(takeoff&&canTakeoffInterrupt(current)){current=takeoff;stale=false;reason="TAKEOFF_PREEMPTION"}
    if(!current&&originalCurrentId&&originalCurrentId!==activeCompletedId){current=aircraft.find(ac=>ac.id===originalCurrentId)||null;stale=false;reason="NEW_CURRENT"}
    if(current&&!stale)await saveLock(current,reason,lock);else if(!current)await saveLock(null);
    payload.intelligence.current=displayObject(current,stale);payload.intelligence.selectionConfidence=confidenceFor(current,originalConfidence,originalCurrentId,stale);
    payload.intelligence.editorialLock={active:Boolean(current),aircraftId:current?.id||null,reason,stale,dropoutGraceSeconds:DROPOUT_GRACE_MS/1000,completedCooldownSeconds:COMPLETED_COOLDOWN_SECONDS,
      completedAircraftId:activeCompletedId||null,nextAircraftDisplayed:false,takeoffPreemptionEnabled:true};
    return originalJson(payload);
  };
  return baseHandler(req,res);
};
