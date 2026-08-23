const { issueSignedToken, presignUrl } = require('@vercel/blob');
function blobAuthOptions(){const o={};if(process.env.VERCEL_OIDC_TOKEN)o.oidcToken=process.env.VERCEL_OIDC_TOKEN;if(process.env.BLOB_STORE_ID)o.storeId=process.env.BLOB_STORE_ID;return o}
function normalizeReg(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,12)}
function plausible(s){return /^[A-Z0-9]{1,3}-[A-Z0-9]{2,6}$/.test(s)||/^[A-Z]{1,3}[A-Z0-9]{3,5}$/.test(s)}
module.exports=async function handler(req,res){res.setHeader('Cache-Control','no-store');try{
 const gatewayKey=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_AI_GATEWAY_KEY;
 if(req.method==='GET')return res.status(200).json({ok:true,service:'MikeAircraft Visual Registration Reader',version:'0.3',ready:!!gatewayKey,blobReady:!!process.env.VERCEL_OIDC_TOKEN,model:'openai/gpt-5.4-mini'});
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST required'});
 const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});const pathname=String(body.pathname||'');
 if(!pathname.startsWith('photo-library/')||!/[.](jpg|jpeg|png|webp)$/i.test(pathname))return res.status(400).json({ok:false,error:'Invalid photo'});
 if(!gatewayKey)return res.status(503).json({ok:false,ready:false,error:'Vision provider is not configured yet.'});
 const token=await issueSignedToken({pathname,operations:['get'],validUntil:Date.now()+10*60*1000,...blobAuthOptions()});
 const signed=await presignUrl(token,{operation:'get',pathname,access:'private',validUntil:Date.now()+8*60*1000});
 const prompt='You are reading an aircraft photograph for a registration catalogue. Inspect the actual pixels carefully, especially the rear fuselage, tail area, nose gear doors and under-wing areas. Read the aircraft registration painted on the aircraft. Do not infer or guess a registration from airline, livery or aircraft type. Return JSON only with keys registration, confidence, visibleText, airlineHint, aircraftTypeHint, reasoning. confidence is 0 to 1. If even one registration character is unclear, set registration to null and explain what was visible.';
 const payload={model:'openai/gpt-5.4-mini',messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:signed.presignedUrl,detail:'high'}}]}],response_format:{type:'json_object'}};
 const r=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+gatewayKey,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const raw=await r.text();
 if(!r.ok){console.error('Photo vision gateway error',r.status,raw.slice(0,500));return res.status(502).json({ok:false,error:'Vision service HTTP '+r.status,detail:raw.slice(0,300)})}
 let outer;try{outer=JSON.parse(raw)}catch{console.error('Photo vision invalid outer JSON',raw.slice(0,500));return res.status(502).json({ok:false,error:'Vision service returned invalid JSON'})}
 let content=outer.choices?.[0]?.message?.content||'';let result={};
 try{result=JSON.parse(content)}catch{const m=String(content).match(/\{[\s\S]*\}/);if(m)try{result=JSON.parse(m[0])}catch{} }
 const registration=normalizeReg(result.registration);const confidence=Math.max(0,Math.min(1,Number(result.confidence)||0));
 const accepted=registration&&plausible(registration)&&confidence>=0.82;
 console.log('Photo vision result',JSON.stringify({pathname,registration:registration||null,confidence,accepted,visibleText:result.visibleText||null}));
 return res.status(200).json({ok:true,service:'MikeAircraft Visual Registration Reader',version:'0.3',pathname,registration:accepted?registration:null,candidate:registration||null,confidence,status:accepted?'PROBABLE':'UNKNOWN',visibleText:result.visibleText||null,airlineHint:result.airlineHint||null,aircraftTypeHint:result.aircraftTypeHint||null,reasoning:result.reasoning||null,model:'openai/gpt-5.4-mini',rule:'Visual AI never marks CONFIRMED automatically.'});
 }catch(e){console.error('Photo vision error',e);return res.status(500).json({ok:false,error:e.message})}}
