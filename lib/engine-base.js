module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    const AIRPORTS = {
      PRG:{name:"Prague Airport",icao:"LKPR",lat:50.1008,lon:14.2600,runwayEnds:[
        {name:"06",heading:65,lat:50.1017990,lon:14.2263002},{name:"24",heading:245,lat:50.1160011,lon:14.2734003},
        {name:"12",heading:127,lat:50.1080017,lon:14.2454004},{name:"30",heading:307,lat:50.0904999,lon:14.2817001}]},
      LHR:{name:"London Heathrow",icao:"EGLL",lat:51.471227,lon:-0.460881,runwayEnds:[
        {name:"09L",heading:90,lat:51.477490,lon:-0.489439},{name:"27R",heading:270,lat:51.477681,lon:-0.433227},
        {name:"09R",heading:90,lat:51.464780,lon:-0.486808},{name:"27L",heading:270,lat:51.464957,lon:-0.434048}]},
      FRA:{name:"Frankfurt Airport",icao:"EDDF",lat:50.032606,lon:8.540669,runwayEnds:[
        {name:"07C",heading:70,lat:50.0326004,lon:8.5346298},{name:"25C",heading:250,lat:50.0451012,lon:8.5869799},
        {name:"07L",heading:70,lat:50.0371017,lon:8.4970798},{name:"25R",heading:250,lat:50.0457993,lon:8.5337200},
        {name:"07R",heading:70,lat:50.0275002,lon:8.5341702},{name:"25L",heading:250,lat:50.0401001,lon:8.5865297},
        {name:"18",heading:180,lat:50.0341540,lon:8.5259440},{name:"36",heading:360,lat:49.9984930,lon:8.5262970}]},
      AMS:{name:"Amsterdam Schiphol",icao:"EHAM",lat:52.314875,lon:4.758074,runwayEnds:[
        {name:"04",heading:41,lat:52.3003998,lon:4.7834802},{name:"22",heading:221,lat:52.3139992,lon:4.8030200},
        {name:"06",heading:58,lat:52.2878990,lon:4.7340202},{name:"24",heading:238,lat:52.3045998,lon:4.7775202},
        {name:"09",heading:87,lat:52.3166008,lon:4.7463498},{name:"27",heading:267,lat:52.3184013,lon:4.7968898},
        {name:"18C",heading:183,lat:52.3314018,lon:4.7400298},{name:"36C",heading:3,lat:52.3017998,lon:4.7375002},
        {name:"18L",heading:183,lat:52.3213005,lon:4.7799602},{name:"36R",heading:3,lat:52.2907982,lon:4.7773499},
        {name:"18R",heading:183,lat:52.3627014,lon:4.7119298},{name:"36L",heading:3,lat:52.3286018,lon:4.7088399}]},
      CDG:{name:"Paris Charles de Gaulle",icao:"LFPG",lat:49.009750,lon:2.562618,runwayEnds:[
        {name:"08L",heading:85,lat:48.9957008,lon:2.5527401},{name:"26R",heading:265,lat:48.9987984,lon:2.6101799},
        {name:"08R",heading:85,lat:48.9929008,lon:2.5656600},{name:"26L",heading:265,lat:48.9948997,lon:2.6024301},
        {name:"09L",heading:85,lat:49.0247002,lon:2.5248899},{name:"27R",heading:265,lat:49.0266991,lon:2.5616901},
        {name:"09R",heading:86,lat:49.0205994,lon:2.5130601},{name:"27L",heading:266,lat:49.0237007,lon:2.5702901}]},
      MAN:{name:"Manchester Airport",icao:"EGCC",lat:53.347150,lon:-2.283883,runwayEnds:[
        {name:"05L",heading:51,lat:53.3451004,lon:-2.2927401},{name:"23R",heading:231,lat:53.3624001,lon:-2.2571399},
        {name:"05R",heading:51,lat:53.3320010,lon:-2.3106600},{name:"23L",heading:231,lat:53.3490980,lon:-2.2749900}]},
      ATL:{name:"Hartsfield-Jackson Atlanta International",icao:"KATL",lat:33.6366996,lon:-84.4278640,runwayEnds:[
        {name:"09L",heading:90,lat:33.6347045,lon:-84.4479669},{name:"27R",heading:270,lat:33.6347025,lon:-84.4072661},
        {name:"08R",heading:90,lat:33.6467867,lon:-84.4383621},{name:"26L",heading:270,lat:33.6467948,lon:-84.4055087},
        {name:"08L",heading:90,lat:33.6495344,lon:-84.4390256},{name:"26R",heading:270,lat:33.6495421,lon:-84.4094539},
        {name:"09R",heading:90,lat:33.6318134,lon:-84.4479658},{name:"27L",heading:270,lat:33.6318236,lon:-84.4184008},
        {name:"10",heading:90,lat:33.6202725,lon:-84.4478771},{name:"28",heading:270,lat:33.6202854,lon:-84.4183155}]}
    };

    const requestedCode=String(req.query.airport||"PRG").toUpperCase();
    const airportCode=AIRPORTS[requestedCode]?requestedCode:"PRG";
    const airport=AIRPORTS[airportCode], radius=20, now=Date.now();

    const redisURL=process.env.KV_REST_API_URL, redisToken=process.env.KV_REST_API_TOKEN;
    const redisAvailable=Boolean(redisURL&&redisToken);
    async function redisCommand(command){
      if(!redisAvailable) throw new Error("Redis environment variables unavailable");
      const response=await fetch(redisURL,{method:"POST",headers:{Authorization:`Bearer ${redisToken}`,"Content-Type":"application/json"},body:JSON.stringify(command)});
      if(!response.ok) throw new Error(`Redis HTTP ${response.status}`);
      const result=await response.json(); if(result.error) throw new Error(`Redis error: ${result.error}`); return result.result;
    }

    const rejectedCategories=new Set(["A7","B1","B2","B3","B4","B6","B7","C1","C2","C3","C4","C5"]);
    const rejectedExact=new Set(["GND","TWR","EMER","GROUND","TOWER"]);
    const rejectedPrefixes=["FOLLOW","POZAR","TXLU","UDRZBA","AIRPORT","GROUND","TWR","GND","EMER"];
    const cleanText=v=>String(v||"").trim().toUpperCase();
    function unwantedAircraft(ac){const flight=cleanText(ac.flight),type=cleanText(ac.t),registration=cleanText(ac.r),category=cleanText(ac.category);if(rejectedCategories.has(category)||rejectedExact.has(type)||rejectedExact.has(registration)||rejectedExact.has(flight))return true;return rejectedPrefixes.some(p=>flight.startsWith(p)||registration.startsWith(p)||type.startsWith(p));}

    function distanceKm(lat1,lon1,lat2,lon2){const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180,a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
    function headingDiff(a,b){if(!Number.isFinite(a)||!Number.isFinite(b))return 180;return Math.abs(((a-b+540)%360)-180);}
    function nearestThreshold(ac){let best=null,bestDistance=Infinity;for(const end of airport.runwayEnds){const d=distanceKm(ac.lat,ac.lon,end.lat,end.lon);if(d<bestDistance){bestDistance=d;best=end;}}return{runway:best,distance:bestDistance};}
    function directionalThreshold(ac){const nearest=nearestThreshold(ac);if(ac.onGround||!Number.isFinite(ac.track))return nearest;let bestAlignment=Infinity;for(const end of airport.runwayEnds)bestAlignment=Math.min(bestAlignment,headingDiff(ac.track,end.heading));if(bestAlignment>45)return nearest;let best=null,bestDistance=Infinity;for(const end of airport.runwayEnds){const alignment=headingDiff(ac.track,end.heading);if(alignment>bestAlignment+5)continue;const d=distanceKm(ac.lat,ac.lon,end.lat,end.lon);if(d<bestDistance){bestDistance=d;best=end;}}return best?{runway:best,distance:bestDistance}:nearest;}
    function distanceToRunwayLine(ac){let best=Infinity;for(let i=0;i<airport.runwayEnds.length;i+=2){const a=airport.runwayEnds[i],b=airport.runwayEnds[i+1];if(!a||!b)continue;const ref=(ac.lat+a.lat+b.lat)/3,ky=111.32,kx=111.32*Math.cos(ref*Math.PI/180),px=ac.lon*kx,py=ac.lat*ky,ax=a.lon*kx,ay=a.lat*ky,bx=b.lon*kx,by=b.lat*ky,vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay,len2=vx*vx+vy*vy||1;let t=(wx*vx+wy*vy)/len2;t=Math.max(0,Math.min(1,t));const cx=ax+t*vx,cy=ay+t*vy,d=Math.sqrt((px-cx)**2+(py-cy)**2);if(d<best)best=d;}return best;}

    const sources=[
      {name:"adsb.lol",url:`https://api.adsb.lol/v2/point/${airport.lat}/${airport.lon}/${radius}`},
      {name:"airplanes.live",url:`https://api.airplanes.live/v2/point/${airport.lat}/${airport.lon}/${radius}`},
      {name:"adsb.fi",url:`https://opendata.adsb.fi/api/v2/lat/${airport.lat}/lon/${airport.lon}/dist/${radius}`}
    ];
    let rawAircraft=null,sourceUsed=null;const sourceErrors=[];
    for(const source of sources){try{const response=await fetch(source.url,{cache:"no-store",headers:{"User-Agent":"MikeAircraft-Engine-v2"}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=JSON.parse(await response.text()),list=Array.isArray(data.ac)?data.ac:Array.isArray(data.aircraft)?data.aircraft:null;if(!list)throw new Error("No aircraft array returned");rawAircraft=list;sourceUsed=source.name;break;}catch(error){sourceErrors.push({source:source.name,error:error.message});}}

    const stateKey=`mikeaircraft:v2:${airportCode}:state`;let savedState=null,redisReadOK=false,redisWriteOK=false,redisError=null;
    if(redisAvailable){try{const stored=await redisCommand(["GET",stateKey]);redisReadOK=true;if(stored)savedState=JSON.parse(stored);}catch(error){redisError=error.message;}}

    if(!rawAircraft){
      const fallback=savedState&&Array.isArray(savedState.lastGoodAircraft)?savedState.lastGoodAircraft:null;
      const fallbackAge=savedState&&savedState.lastGoodTimestamp?Math.round((now-savedState.lastGoodTimestamp)/1000):null;
      if(!fallback||fallbackAge===null||fallbackAge>45)return res.status(502).json({ok:false,engine:"MikeAircraft Engine v2",version:"0.7",stage:"SELECTION_CONFIDENCE",error:"All ADS-B sources failed",sourceErrors,memory:{redisConnected:redisAvailable,readOK:redisReadOK,writeOK:false,error:redisError}});
      return res.status(200).json({ok:true,engine:"MikeAircraft Engine v2",version:"0.7",stage:"SELECTION_CONFIDENCE",dataStatus:"STALE",staleAgeSeconds:fallbackAge,timestamp:new Date(now).toISOString(),airport:{code:airportCode,icao:airport.icao,name:airport.name,lat:airport.lat,lon:airport.lon},traffic:{trackedCount:fallback.length,source:"redis-fallback"},memory:{redisConnected:redisAvailable,readOK:redisReadOK,writeOK:false,trackedHistories:savedState&&savedState.tracks?Object.keys(savedState.tracks).length:0,error:redisError},intelligence:savedState&&savedState.lastIntelligence?savedState.lastIntelligence:{stateCounts:{},current:null,nextIn:null,nextOut:null,selectionConfidence:{level:"NONE",score:0,ambiguous:true,scoreMargin:null,candidateCount:0,storySafe:false}},aircraft:fallback,sourceErrors});
    }

    const filteredRaw=rawAircraft.filter(ac=>!unwantedAircraft(ac)),filteredOutCount=rawAircraft.length-filteredRaw.length;
    const aircraft=filteredRaw.filter(ac=>Number.isFinite(Number(ac.lat))&&Number.isFinite(Number(ac.lon))).map(ac=>{
      const id=ac.hex||ac.r||String(ac.flight||"").trim()||null,onGround=ac.alt_baro==="ground"||ac.alt_geom==="ground";
      let altitude=null;if(onGround)altitude=0;else if(Number.isFinite(Number(ac.alt_baro)))altitude=Number(ac.alt_baro);else if(Number.isFinite(Number(ac.alt_geom)))altitude=Number(ac.alt_geom);
      let verticalRate=null;if(Number.isFinite(Number(ac.baro_rate)))verticalRate=Number(ac.baro_rate);else if(Number.isFinite(Number(ac.geom_rate)))verticalRate=Number(ac.geom_rate);
      const item={id,hex:ac.hex||null,callsign:String(ac.flight||"").trim()||null,registration:ac.r||null,type:ac.t||null,category:ac.category||null,lat:Number(ac.lat),lon:Number(ac.lon),altitude,onGround,speed:Number.isFinite(Number(ac.gs))?Number(ac.gs):null,track:Number.isFinite(Number(ac.track))?Number(ac.track):null,verticalRate,positionAge:Number.isFinite(Number(ac.seen_pos))?Number(ac.seen_pos):null};
      item.airportDistance=distanceKm(item.lat,item.lon,airport.lat,airport.lon);item.runwayDistance=distanceToRunwayLine(item);const threshold=directionalThreshold(item);item.nearestRunway=threshold.runway?threshold.runway.name:null;item.thresholdDistance=threshold.distance;item.runwayHeading=threshold.runway?threshold.runway.heading:null;item.runwayAlignment=headingDiff(item.track,item.runwayHeading);return item;
    }).filter(ac=>ac.id);

    const tracks=savedState&&savedState.tracks&&typeof savedState.tracks==="object"?savedState.tracks:{};
    function recentGroundSample(samples,seconds){const cutoff=now-seconds*1000;return samples.some(sample=>sample.time>=cutoff&&sample.onGround);}
    function classify(ac,history,previousState,previousLineage){
      const samples=history.slice(-12),first=samples[0]||null,last=samples[samples.length-1]||null,prior=samples.length>=2?samples[samples.length-2]:null;
      const distanceChange=first&&last?last.airportDistance-first.airportDistance:0,thresholdChange=first&&last?last.thresholdDistance-first.thresholdDistance:0,altitudeChange=first&&last&&first.altitude!==null&&last.altitude!==null?last.altitude-first.altitude:0,speedChange=first&&last&&first.speed!==null&&last.speed!==null?last.speed-first.speed:0;
      const closing=distanceChange<-.20,opening=distanceChange>.20,towardThreshold=thresholdChange<-.08,descending=(ac.verticalRate!==null&&ac.verticalRate<-150)||altitudeChange<-150,climbing=(ac.verticalRate!==null&&ac.verticalRate>250)||altitudeChange>200,aligned=ac.runwayAlignment<=28,tightlyAligned=ac.runwayAlignment<=18,veryNearRunway=ac.runwayDistance<=.20,recentGround=recentGroundSample(samples,90),justAirborne=prior&&prior.onGround&&!ac.onGround,justLanded=prior&&!prior.onGround&&ac.onGround;
      if(ac.onGround){
        if(justLanded||previousState==="ON_FINAL"||previousState==="APPROACHING"||previousLineage==="ARRIVAL"){
          if(justLanded||previousState==="ON_FINAL"||previousState==="APPROACHING"||previousState==="LANDED")return{state:"LANDED",lineage:"ARRIVAL",confidence:98,reason:"Arrival lineage retained after touchdown"};
          return{state:"TAXIING_IN",lineage:"ARRIVAL",confidence:96,reason:"Recently landed aircraft taxiing in"};
        }
        if(veryNearRunway&&ac.speed!==null&&ac.speed>=45&&speedChange>2)return{state:"TAKEOFF_ROLL",lineage:"DEPARTURE",confidence:97,reason:"Accelerating rapidly on runway"};
        if(veryNearRunway&&tightlyAligned&&ac.speed!==null&&ac.speed>=5&&ac.speed<45)return{state:"LINING_UP",lineage:"DEPARTURE",confidence:90,reason:"Near runway, aligned with runway heading"};
        if(ac.speed!==null&&ac.speed>=4&&ac.speed<40&&towardThreshold&&ac.thresholdDistance<=4.5)return{state:"TAXIING_OUT",lineage:"DEPARTURE",confidence:80,reason:"Ground aircraft moving toward runway threshold"};
        if(previousLineage==="DEPARTURE"&&ac.speed!==null&&ac.speed>=3&&ac.thresholdDistance<=5)return{state:"TAXIING_OUT",lineage:"DEPARTURE",confidence:74,reason:"Departure lineage retained while taxiing out"};
        return{state:"GROUND",lineage:previousLineage||"UNKNOWN",confidence:60,reason:"Aircraft on ground without clear movement intent"};
      }
      if(justAirborne||previousState==="TAKEOFF_ROLL")return{state:"AIRBORNE_DEPARTURE",lineage:"DEPARTURE",confidence:99,reason:"Ground-to-air transition"};
      if(previousLineage==="DEPARTURE"&&ac.airportDistance<=10&&climbing)return{state:"DEPARTING",lineage:"DEPARTURE",confidence:96,reason:"Departure lineage climbing away from airport"};
      if(recentGround&&ac.airportDistance<=10&&climbing)return{state:"DEPARTING",lineage:"DEPARTURE",confidence:94,reason:"Recently on ground and now climbing away"};
      if(ac.airportDistance<=12&&ac.altitude!==null&&ac.altitude<=4200&&aligned&&closing&&!climbing){const final=ac.thresholdDistance<=8&&ac.altitude<=3000&&descending;if(final)return{state:"ON_FINAL",lineage:"ARRIVAL",confidence:96,reason:"Aligned, descending and closing on runway threshold"};return{state:"APPROACHING",lineage:"ARRIVAL",confidence:90,reason:"Aligned and closing on airport"};}
      if(ac.airportDistance<=15&&ac.altitude!==null&&ac.altitude<=5000&&closing&&descending)return{state:"APPROACHING",lineage:"ARRIVAL",confidence:82,reason:"Low, descending and closing on airport"};
      if(ac.airportDistance<=12&&opening&&climbing)return{state:"DEPARTING",lineage:"DEPARTURE",confidence:88,reason:"Climbing and increasing distance from airport"};
      return{state:"AIRBORNE",lineage:previousLineage||"UNKNOWN",confidence:50,reason:"No strong arrival/departure evidence yet"};
    }

    const classified=[],seenIds=new Set();
    for(const ac of aircraft){
      seenIds.add(ac.id);const track=tracks[ac.id]||{samples:[],state:"UNKNOWN",stateSince:now,lineage:"UNKNOWN"};track.samples=Array.isArray(track.samples)?track.samples:[];track.lineage=track.lineage||"UNKNOWN";
      track.samples.push({time:now,lat:ac.lat,lon:ac.lon,altitude:ac.altitude,onGround:ac.onGround,speed:ac.speed,track:ac.track,verticalRate:ac.verticalRate,airportDistance:ac.airportDistance,runwayDistance:ac.runwayDistance,thresholdDistance:ac.thresholdDistance,runwayAlignment:ac.runwayAlignment});
      track.samples=track.samples.filter(sample=>sample.time>=now-120000).slice(-24);
      let decision=classify(ac,track.samples,track.state,track.lineage);
      if(track.state==="LANDED"&&ac.onGround&&now-track.stateSince<90000)decision={state:"LANDED",lineage:"ARRIVAL",confidence:98,reason:"Post-landing hold during rollout"};
      if(decision.state!==track.state){track.state=decision.state;track.stateSince=now;}if(decision.lineage&&decision.lineage!=="UNKNOWN")track.lineage=decision.lineage;track.confidence=decision.confidence;track.reason=decision.reason;track.lastSeen=now;tracks[ac.id]=track;
      classified.push({...ac,state:track.state,lineage:track.lineage,confidence:track.confidence,reason:track.reason,stateAgeSeconds:Math.round((now-track.stateSince)/1000),sampleCount:track.samples.length});
    }
    for(const [id,track] of Object.entries(tracks))if(!seenIds.has(id)&&(!track.lastSeen||track.lastSeen<now-180000))delete tracks[id];
    const stateCounts={};for(const ac of classified)stateCounts[ac.state]=(stateCounts[ac.state]||0)+1;

    function displayObject(ac,score=null){if(!ac)return null;return{id:ac.id,hex:ac.hex,callsign:ac.callsign,registration:ac.registration,type:ac.type,state:ac.state,lineage:ac.lineage,confidence:ac.confidence,runway:ac.nearestRunway,runwayAlignment:Number.isFinite(ac.runwayAlignment)?Number(ac.runwayAlignment.toFixed(1)):null,distanceKm:Number(ac.airportDistance.toFixed(2)),thresholdKm:Number(ac.thresholdDistance.toFixed(2)),altitude:ac.altitude,speed:ac.speed,positionAge:ac.positionAge,stateAgeSeconds:ac.stateAgeSeconds,sampleCount:ac.sampleCount,score};}
    function currentScore(ac){
      const stateBase={TAKEOFF_ROLL:1160,AIRBORNE_DEPARTURE:1110,ON_FINAL:1080,DEPARTING:930,APPROACHING:900,LINING_UP:850,LANDED:780};
      if(!(ac.state in stateBase)||(ac.confidence||0)<78||(ac.positionAge!==null&&ac.positionAge>12)||(ac.state==="LANDED"&&ac.stateAgeSeconds>12)||(ac.state==="DEPARTING"&&ac.airportDistance>4))return-Infinity;
      let score=stateBase[ac.state];score+=Math.max(0,180-ac.airportDistance*20);score+=(ac.confidence||0)*1.35;score+=Math.min(55,(ac.sampleCount||0)*5);if(ac.positionAge!==null)score+=Math.max(0,36-ac.positionAge*6);if(ac.state==="ON_FINAL"||ac.state==="APPROACHING")score+=Math.max(0,120-ac.runwayAlignment*4);if(ac.state==="ON_FINAL")score+=Math.max(0,170-ac.thresholdDistance*21);if(ac.state==="TAKEOFF_ROLL")score+=210;if(ac.state==="AIRBORNE_DEPARTURE")score+=180;if(ac.registration&&ac.hex)score+=22;return score;
    }
    function arrivalCandidates(excludeId=null){return classified.filter(ac=>ac.id!==excludeId&&ac.lineage==="ARRIVAL"&&ac.confidence>=78&&["ON_FINAL","APPROACHING"].includes(ac.state)).sort((a,b)=>{const p={ON_FINAL:0,APPROACHING:1},pa=p[a.state]??9,pb=p[b.state]??9;return pa!==pb?pa-pb:a.thresholdDistance-b.thresholdDistance;});}
    function departureReadiness(ac){const base={TAKEOFF_ROLL:10000,LINING_UP:9000,AIRBORNE_DEPARTURE:8000,TAXIING_OUT:6000,DEPARTING:5000};let score=base[ac.state]||0;if(ac.state==="TAXIING_OUT"){score+=Math.max(0,1000-ac.thresholdDistance*180);score+=Math.max(0,300-ac.runwayAlignment*8);score+=Math.min(150,(ac.speed||0)*5);}if(ac.state==="LINING_UP")score+=Math.max(0,500-ac.thresholdDistance*120);return score;}
    function departureCandidates(excludeId=null){return classified.filter(ac=>ac.id!==excludeId&&ac.lineage==="DEPARTURE"&&ac.confidence>=74&&["TAKEOFF_ROLL","LINING_UP","TAXIING_OUT","AIRBORNE_DEPARTURE","DEPARTING"].includes(ac.state)&&!(ac.state==="DEPARTING"&&ac.airportDistance>4)).sort((a,b)=>departureReadiness(b)-departureReadiness(a));}

    const selection=savedState&&savedState.selection&&typeof savedState.selection==="object"?savedState.selection:{currentId:null,currentSince:0};
    const scored=classified.map(ac=>({ac,score:currentScore(ac)})).filter(item=>Number.isFinite(item.score)).sort((a,b)=>b.score-a.score),challenger=scored[0]||null,runnerUp=scored[1]||null;
    const existingCurrent=selection.currentId?classified.find(ac=>ac.id===selection.currentId):null,existingScore=existingCurrent?currentScore(existingCurrent):-Infinity,currentAge=selection.currentSince?now-selection.currentSince:Infinity,MIN_CURRENT_HOLD_MS=12000,SWITCH_MARGIN=85;
    let current=existingCurrent;
    if(!current||!Number.isFinite(existingScore))current=challenger?challenger.ac:null;
    else if(challenger&&challenger.ac.id!==current.id&&(currentAge>=MIN_CURRENT_HOLD_MS||challenger.ac.state==="TAKEOFF_ROLL"||challenger.ac.state==="AIRBORNE_DEPARTURE"||current.state==="LANDED")&&challenger.score>existingScore+(current.state==="LANDED"?20:SWITCH_MARGIN))current=challenger.ac;
    if(current&&current.id!==selection.currentId){selection.currentId=current.id;selection.currentSince=now;}if(!current){selection.currentId=null;selection.currentSince=0;}

    const currentId=current?current.id:null,currentRank=currentId?scored.findIndex(item=>item.ac.id===currentId):-1,currentScoredItem=currentRank>=0?scored[currentRank]:null,bestCompetingItem=currentId?(scored.find(item=>item.ac.id!==currentId)||null):runnerUp;
    const scoreMargin=currentScoredItem&&bestCompetingItem?Math.round(currentScoredItem.score-bestCompetingItem.score):currentScoredItem?999:null;
    let selectionScore=0;if(current)selectionScore=Math.round(Math.max(0,Math.min(100,(current.confidence||0)*.62+Math.max(0,Math.min(25,(scoreMargin||0)/5))+Math.min(8,current.sampleCount||0)+(current.registration&&current.hex?6:0)-(current.positionAge!==null?Math.min(18,current.positionAge*2):6))));
    const ambiguous=!current||scoreMargin===null||scoreMargin<70||selectionScore<82;
    const selectionLevel=!current?"NONE":selectionScore>=93&&scoreMargin>=120?"VERY_HIGH":selectionScore>=86&&scoreMargin>=80?"HIGH":selectionScore>=76?"MEDIUM":"LOW";
    const storySafe=Boolean(current&&selectionLevel==="VERY_HIGH"&&current.registration&&current.hex&&current.sampleCount>=3&&(current.positionAge===null||current.positionAge<=5)&&current.state!=="LANDED");
    const nextIn=arrivalCandidates(currentId)[0]||null,nextOut=departureCandidates(currentId)[0]||null;
    const intelligence={stateCounts,selectionConfidence:{level:selectionLevel,score:selectionScore,ambiguous,scoreMargin,candidateCount:scored.length,storySafe},current:displayObject(current,current?Math.round(currentScore(current)):null),nextIn:displayObject(nextIn),nextOut:displayObject(nextOut,nextOut?Math.round(departureReadiness(nextOut)):null)};

    const stateToStore={updatedAt:now,tracks,selection,lastIntelligence:intelligence,lastGoodTimestamp:now,lastGoodAircraft:classified};
    if(redisAvailable){try{await redisCommand(["SET",stateKey,JSON.stringify(stateToStore),"EX","900"]);redisWriteOK=true;}catch(error){redisError=redisError||error.message;}}

    return res.status(200).json({ok:true,engine:"MikeAircraft Engine v2",version:"0.7",stage:"SELECTION_CONFIDENCE",dataStatus:"LIVE",timestamp:new Date(now).toISOString(),airport:{code:airportCode,icao:airport.icao,name:airport.name,lat:airport.lat,lon:airport.lon},traffic:{rawCount:rawAircraft.length,filteredOut:filteredOutCount,trackedCount:classified.length,source:sourceUsed},memory:{redisConnected:redisAvailable,readOK:redisReadOK,writeOK:redisWriteOK,trackedHistories:Object.keys(tracks).length,error:redisError},intelligence,aircraft:classified});
  } catch(error) {
    console.error("MikeAircraft Engine v2 error:",error);
    return res.status(500).json({ok:false,engine:"MikeAircraft Engine v2",version:"0.7",stage:"SELECTION_CONFIDENCE",error:error.message});
  }
};
