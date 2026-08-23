const http = require('https');

function baseUrl(req){ return 'https://' + (req.headers['x-forwarded-host'] || req.headers.host || 'mikeaircraft.vercel.app'); }
async function getJson(url){ const r=await fetch(url,{cache:'no-store'}); const j=await r.json(); if(!r.ok||!j.ok) throw new Error(j.error||('HTTP '+r.status)); return j; }
function idOf(x){ return String(x?.registration||x?.displayed?.registration||x?.current?.registration||'').trim().toUpperCase(); }
function candidateFromEntry(e){
  const out=[];
  if(e.displayed?.registration) out.push({registration:e.displayed.registration,callsign:e.displayed.viewerFlight||e.displayed.backendCallsign||null,type:e.displayed.type||null,source:'displayed'});
  for(const c of (e.candidates||[])) if(c.registration) out.push({registration:c.registration,callsign:c.callsign||null,type:c.type||null,source:'candidate'});
  return out;
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  const airport=String(req.query?.airport||'PRG').toUpperCase();
  const photo=await getJson(baseUrl(req)+'/api/photo-index?ts='+Date.now());
  const unknown=(photo.items||[]).filter(x=>(x.catalog?.status||'UNKNOWN')==='UNKNOWN');
  if(!unknown.length) return res.status(200).json({ok:true,version:'0.1',airport,checked:0,suggestions:[],message:'No UNKNOWN photos'});
  const times=unknown.map(x=>Date.parse(x.capturedAt||x.uploadedAt||0)).filter(Number.isFinite);
  if(!times.length) return res.status(200).json({ok:true,version:'0.1',airport,checked:unknown.length,suggestions:[],message:'Photos have no usable timestamps'});
  // MikeAircraft audit history currently retains only recent data. We deliberately do not invent matches for older summer photographs.
  let hist=null;
  try{ hist=await getJson(baseUrl(req)+'/api/history?mode=data&airport='+encodeURIComponent(airport)+'&minutes=120'); }catch(e){ return res.status(200).json({ok:true,version:'0.1',airport,checked:unknown.length,suggestions:[],historyAvailable:false,message:'Historical movement evidence is not available: '+e.message}); }
  const entries=hist.entries||[], suggestions=[];
  for(const p of unknown){
   const pt=Date.parse(p.capturedAt||p.uploadedAt||0); if(!Number.isFinite(pt)) continue;
   const nearby=entries.filter(e=>Math.abs(Number(e.time)-pt)<=90000);
   const votes=new Map();
   for(const e of nearby) for(const c of candidateFromEntry(e)){ const reg=String(c.registration).toUpperCase(); const v=votes.get(reg)||{registration:reg,score:0,samples:0,callsign:c.callsign,type:c.type}; v.samples++; v.score+=c.source==='displayed'?3:1; if(c.callsign)v.callsign=c.callsign;if(c.type)v.type=c.type;votes.set(reg,v); }
   const ranked=[...votes.values()].sort((a,b)=>b.score-a.score||b.samples-a.samples);
   if(!ranked.length) continue;
   const top=ranked[0], second=ranked[1];
   const confidence=(top.samples>=3 && (!second||top.score>=second.score*2))?'PROBABLE':'UNKNOWN';
   suggestions.push({pathname:p.pathname,sourceName:p.sourceName,capturedAt:p.capturedAt,registration:top.registration,callsign:top.callsign||null,aircraftType:top.type||null,status:confidence,evidence:{nearbyAuditSamples:nearby.length,registrationSamples:top.samples,score:top.score,runnerUp:second?.registration||null},reason:confidence==='PROBABLE'?'Registration repeatedly appears in MikeAircraft movement records around the photo timestamp.':'Evidence is ambiguous; manual confirmation required.'});
  }
  return res.status(200).json({ok:true,service:'MikeAircraft Photo Matcher',version:'0.1',airport,checked:unknown.length,historySamples:entries.length,suggestions,note:'Matcher never marks photos CONFIRMED automatically. CONFIRMED requires visual/manual or stronger independent evidence.'});
 }catch(e){console.error('Photo Matcher error',e);return res.status(500).json({ok:false,error:e.message});}
};
