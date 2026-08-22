const baseHandler=require("./editorial-engine-wrapper.js");
const {normalizeAirportCode}=require("./config/airports.js");
const {createRedisClient}=require("./services/redis.js");
const {isPrivateOrBusiness}=require("./aircraft/filters.js");

module.exports=async function handler(req,res){
  const originalJson=res.json.bind(res);
  const airportCode=normalizeAirportCode(req.query?.airport||"PRG");
  const redis=createRedisClient();
  const lockKey=`mikeaircraft:v2:${airportCode}:editorial-current`;
  async function safeRedis(command){try{return await redis.command(command)}catch{return null}}

  function candidateReady(ac){
    if(!ac?.id||isPrivateOrBusiness(ac))return false;
    const state=String(ac.state||"").toUpperCase(),lineage=String(ac.lineage||"").toUpperCase();
    const confidence=Number(ac.confidence||0),distance=Number(ac.airportDistance??ac.distanceKm);
    if(lineage==="ARRIVAL")return ["APPROACHING","ON_FINAL"].includes(state)&&confidence>=80&&(!Number.isFinite(distance)||distance<=15);
    if(lineage==="DEPARTURE"){
      if(!["TAXIING_OUT","LINING_UP","TAKEOFF_ROLL","AIRBORNE_DEPARTURE","DEPARTING"].includes(state)||confidence<78)return false;
      return !(state==="TAXIING_OUT"&&Number.isFinite(distance)&&distance>3);
    }
    return false;
  }
  function readinessScore(ac){
    const state=String(ac?.state||"").toUpperCase();
    const priority={ON_FINAL:1000,TAKEOFF_ROLL:980,LINING_UP:900,APPROACHING:820,AIRBORNE_DEPARTURE:800,DEPARTING:760,TAXIING_OUT:700}[state]||0;
    const confidence=Number(ac?.confidence||0),distance=Number(ac?.airportDistance??ac?.distanceKm);
    return priority+confidence+(Number.isFinite(distance)?Math.max(0,50-distance*3):0);
  }
  function toDisplay(ac){
    if(!ac)return null;
    const distance=Number(ac.airportDistance??ac.distanceKm),threshold=Number(ac.thresholdDistance??ac.thresholdKm);
    return {id:ac.id,hex:ac.hex,callsign:ac.callsign,registration:ac.registration,type:ac.type,state:ac.state,lineage:ac.lineage,confidence:ac.confidence,
      runway:ac.nearestRunway||ac.runway||null,runwayAlignment:Number.isFinite(ac.runwayAlignment)?Number(ac.runwayAlignment.toFixed(1)):null,
      distanceKm:Number.isFinite(distance)?Number(distance.toFixed(2)):null,thresholdKm:Number.isFinite(threshold)?Number(threshold.toFixed(2)):null,
      altitude:ac.altitude,speed:ac.speed,positionAge:ac.positionAge,stateAgeSeconds:ac.stateAgeSeconds,sampleCount:ac.sampleCount,score:null,stale:false};
  }
  function promotionConfidence(ac){
    const score=Math.max(0,Math.min(100,Math.round(Number(ac?.confidence||0))));
    return {level:score>=92?"HIGH":score>=80?"MEDIUM":"LOW",score,ambiguous:true,scoreMargin:null,candidateCount:1,storySafe:false};
  }

  res.json=async function modularEditorialJson(payload){
    if(!payload?.ok||!payload.intelligence)return originalJson(payload);
    const originalAircraft=Array.isArray(payload.aircraft)?payload.aircraft:[];
    const filteredAircraft=originalAircraft.filter(ac=>!isPrivateOrBusiness(ac));
    const removedCount=originalAircraft.length-filteredAircraft.length;
    payload.aircraft=filteredAircraft;
    if(payload.traffic){payload.traffic.privateAircraftFiltered=removedCount;payload.traffic.trackedCount=filteredAircraft.length}

    const currentWasPrivate=isPrivateOrBusiness(payload.intelligence.current);
    if(currentWasPrivate){
      payload.intelligence.current=null;
      payload.intelligence.selectionConfidence={level:"NONE",score:0,ambiguous:true,scoreMargin:null,candidateCount:0,storySafe:false};
      await safeRedis(["DEL",lockKey]);
    }
    if(isPrivateOrBusiness(payload.intelligence.nextIn))payload.intelligence.nextIn=null;
    if(isPrivateOrBusiness(payload.intelligence.nextOut))payload.intelligence.nextOut=null;
    if(payload.intelligence.current)return originalJson(payload);

    const completedId=payload.intelligence.editorialLock?.completedAircraftId||null;
    const promotedRaw=filteredAircraft.filter(ac=>ac.id!==completedId).filter(candidateReady).sort((a,b)=>readinessScore(b)-readinessScore(a))[0]||null;
    if(!promotedRaw){
      payload.intelligence.editorialLock={...(payload.intelligence.editorialLock||{}),active:false,aircraftId:null,
        reason:currentWasPrivate?"PRIVATE_AIRCRAFT_FILTERED":(payload.intelligence.editorialLock?.reason||"NO_CURRENT"),
        privateAircraftFilterEnabled:true,privateAircraftFilteredCount:removedCount,nextAircraftDisplayed:false};
      return originalJson(payload);
    }

    const promoted=toDisplay(promotedRaw),now=Date.now();
    await safeRedis(["SET",lockKey,JSON.stringify({id:promotedRaw.id,since:now,reason:"QUIET_AIRPORT_PROMOTION",updatedAt:now,snapshot:promotedRaw}),"EX","900"]);
    payload.intelligence.current=promoted;
    payload.intelligence.selectionConfidence=promotionConfidence(promotedRaw);
    if(payload.intelligence.nextIn?.id===promotedRaw.id)payload.intelligence.nextIn=null;
    if(payload.intelligence.nextOut?.id===promotedRaw.id)payload.intelligence.nextOut=null;
    payload.intelligence.editorialLock={...(payload.intelligence.editorialLock||{}),active:true,aircraftId:promotedRaw.id,reason:"QUIET_AIRPORT_PROMOTION",stale:false,
      nextAircraftDisplayed:false,quietAirportPromotionEnabled:true,privateAircraftFilterEnabled:true,privateAircraftFilteredCount:removedCount};
    return originalJson(payload);
  };
  return baseHandler(req,res);
};
