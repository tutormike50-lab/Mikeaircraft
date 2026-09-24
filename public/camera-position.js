(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CameraPositionCalibration = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const EARTH_RADIUS_M = 6371008.8;
  function median(values) { if (!values.length) return null; const s = values.slice().sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }
  function percentile(values,p) { if (!values.length) return null; const s=values.slice().sort((a,b)=>a-b); return s[Math.min(s.length-1,Math.ceil(p*s.length)-1)]; }
  function project(fix,origin) { const r=Math.PI/180; return {eastM:(fix.lon-origin.lon)*r*EARTH_RADIUS_M*Math.cos(origin.lat*r),northM:(fix.lat-origin.lat)*r*EARTH_RADIUS_M}; }
  function unproject(point,origin) { const d=180/Math.PI; return {lat:origin.lat+point.northM/EARTH_RADIUS_M*d,lon:origin.lon+point.eastM/(EARTH_RADIUS_M*Math.cos(origin.lat*Math.PI/180))*d}; }
  function centre(points) { return {eastM:median(points.map(p=>p.eastM)),northM:median(points.map(p=>p.northM))}; }
  function distance(a,b) { return Math.hypot(a.eastM-b.eastM,a.northM-b.northM); }
  function normaliseFix(position) {
    const c=position&&position.coords?position.coords:position||{};
    const timestamp=Number(position&&position.timestamp!==undefined?position.timestamp:c.timestamp);
    const lat=Number(c.latitude!==undefined?c.latitude:c.lat),lon=Number(c.longitude!==undefined?c.longitude:c.lon),accuracyM=Number(c.accuracy!==undefined?c.accuracy:c.accuracyM);
    if(!Number.isFinite(timestamp)||!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180||!Number.isFinite(accuracyM)||accuracyM < 0)return null;
    const altitude=c.altitude==null?null:Number(c.altitude),altitudeAccuracy=c.altitudeAccuracy==null?null:Number(c.altitudeAccuracy);
    return {timestamp,lat,lon,accuracyM,altitudeM:Number.isFinite(altitude)?altitude:null,altitudeAccuracyM:Number.isFinite(altitudeAccuracy)&&altitudeAccuracy>=0?altitudeAccuracy:null};
  }
  function estimate(fixes, referenceTime) {
    if(!Array.isArray(fixes)||!fixes.length)return null;
    const origin={lat:median(fixes.map(f=>f.lat)),lon:median(fixes.map(f=>f.lon))};
    const projected=fixes.map(f=>({...f,...project(f,origin)})),initialCentre=centre(projected),initialDistances=projected.map(p=>distance(p,initialCentre));
    const distanceMedian=median(initialDistances),mad=median(initialDistances.map(v=>Math.abs(v-distanceMedian)))||0,outlierLimitM=Math.max(20,distanceMedian+3*1.4826*mad);
    const accepted=projected.filter(p=>distance(p,initialCentre)<=outlierLimitM); if(!accepted.length)return null;
    const robustCentre=centre(accepted),location=unproject(robustCentre,origin),distances=accepted.map(p=>distance(p,robustCentre));
    const clusterRadius95M=percentile(distances,.95),observedSpreadM=Math.sqrt(distances.reduce((s,v)=>s+v*v,0)/distances.length),reportedAccuracyM=median(accepted.map(f=>f.accuracyM));
    const referenceMs=Number.isFinite(referenceTime)?referenceTime:accepted[accepted.length-1].timestamp,recent=accepted.filter(f=>f.timestamp>=referenceMs-30000&&f.timestamp<=referenceMs); let centreMovement30sM=null;
    if(recent.length>=4){const midpoint=referenceMs-15000,first=recent.filter(f=>f.timestamp<midpoint),second=recent.filter(f=>f.timestamp>=midpoint);if(first.length>=2&&second.length>=2)centreMovement30sM=distance(centre(first),centre(second));}
    const recentCentre=recent.length?centre(recent):null,recentDistances=recentCentre?recent.map(f=>distance(f,recentCentre)):[],final30sRadius95M=percentile(recentDistances,.95);
    const horizontalUncertaintyM=Math.max(reportedAccuracyM,clusterRadius95M),grade=horizontalUncertaintyM<=5?"EXCELLENT":horizontalUncertaintyM<=10?"SUITABLE":horizontalUncertaintyM<=20?"AMBER":"REJECT";
    const altitudeFixes=accepted.filter(f=>f.altitudeM!==null),altitudeAccuracies=altitudeFixes.map(f=>f.altitudeAccuracyM).filter(Number.isFinite);
    return {lat:location.lat,lon:location.lon,horizontalUncertaintyM,reportedAccuracyM,observedSpreadM,clusterRadius95M,centreMovement30sM,final30sCount:recent.length,final30sRadius95M,acceptedCount:accepted.length,rejectedCount:fixes.length-accepted.length,grade,altitudeM:altitudeFixes.length?median(altitudeFixes.map(f=>f.altitudeM)):null,altitudeAccuracyM:altitudeAccuracies.length?median(altitudeAccuracies):null};
  }
  function createSession(startedAt) {
    const startMs=Number.isFinite(startedAt)?startedAt:Date.now(),fixes=[],timestamps=new Set(); let receivedCount=0,duplicateCount=0,staleCount=0,lastRejectionReason="NONE";
    return {
      add(position,receivedAt){
        receivedCount++;
        const fix=normaliseFix(position),now=Number.isFinite(receivedAt)?receivedAt:Date.now();
        if(!fix){staleCount++;lastRejectionReason="INVALID GEOLOCATION FIX";return false;}
        if(fix.timestamp<startMs-2000){staleCount++;lastRejectionReason="STALE GEOLOCATION FIX";return false;}
        if(fix.timestamp>now+5000){staleCount++;lastRejectionReason="FUTURE GEOLOCATION TIMESTAMP";return false;}
        if(timestamps.has(fix.timestamp)){duplicateCount++;lastRejectionReason="DUPLICATE GEOLOCATION TIMESTAMP";return false;}
        timestamps.add(fix.timestamp);fixes.push(fix);fixes.sort((a,b)=>a.timestamp-b.timestamp);return true;
      },
      snapshot(now){
        const at=Number.isFinite(now)?now:Date.now(),elapsedSeconds=Math.max(0,(at-startMs)/1000),result=estimate(fixes,at),minimumMet=elapsedSeconds>=60&&fixes.length>=8;
        const centreMovementStable=Boolean(result&&result.centreMovement30sM!==null&&result.centreMovement30sM<=2),finalRadiusStable=Boolean(result&&result.centreMovement30sM===null&&result.final30sCount>=4&&result.final30sRadius95M<=2),stable=centreMovementStable||finalRadiusStable;
        const blockers=[];
        if(!fixes.length)blockers.push("NO GEOLOCATION UPDATES");
        else {
          if(elapsedSeconds<60)blockers.push("MINIMUM 60 SECOND OBSERVATION NOT REACHED");
          if(fixes.length<8)blockers.push("INSUFFICIENT ACCEPTED FIXES");
          if(result&&result.reportedAccuracyM>10)blockers.push("INSUFFICIENT ACCURACY");
          if(result&&result.clusterRadius95M>5)blockers.push("POSITION NOT STABLE: CLUSTER RADIUS");
          if(result&&result.rejectedCount>0)blockers.push("POSITION OUTLIERS REJECTED");
          if(result&&!stable)blockers.push("POSITION NOT STABLE: RECENT SPREAD");
        }
        const acceptanceMet=blockers.length===0&&Boolean(result),lastFixAgeSeconds=fixes.length?Math.max(0,(at-fixes[fixes.length-1].timestamp)/1000):null;
        let state=elapsedSeconds<60||fixes.length<8?"ACQUIRING":"STABILISING";
        if(acceptanceMet)state="GOOD";else if(result&&result.horizontalUncertaintyM>20)state="POOR POSITION—KEEP WAITING";
        return {startedAt:new Date(startMs).toISOString(),elapsedSeconds,receivedCount,totalCount:fixes.length,requiredCount:8,duplicateCount,staleCount,rejectedInputCount:duplicateCount+staleCount,lastRejectionReason,lastFixAgeSeconds,minimumMet,preferredMet:acceptanceMet,stable,qualityMet:acceptanceMet,acceptanceMet,state,blockingConditions:blockers,blockingCondition:blockers[0]||"NONE",estimate:result};
      },
      fixes:()=>fixes.slice()
    };
  }
  return {createSession,estimate,normaliseFix};
});
