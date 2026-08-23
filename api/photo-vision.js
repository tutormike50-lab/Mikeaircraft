const { issueSignedToken, presignUrl } = require('@vercel/blob');
function blobAuthOptions(){const o={};if(process.env.VERCEL_OIDC_TOKEN)o.oidcToken=process.env.VERCEL_OIDC_TOKEN;if(process.env.BLOB_STORE_ID)o.storeId=process.env.BLOB_STORE_ID;return o}
function normalizeReg(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,12)}
function plausible(s){return /^[A-Z0-9]{1,3}-[A-Z0-9]{2,6}$/.test(s)||/^[A-Z]{1,3}[A-Z0-9]{3,5}$/.test(s)}
module.exports=async function handler(req,res){res.setHeader('Cache-Control','no-store');try{
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST required'});
 const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});const pathname=String(body.pathname||'');
 if(!pathname.startsWith('photo-library/')||!/[.](jpg|jpeg|png|webp)$/i.test(pathname))return res.status(400).json({ok:false,error:'Invalid photo'});
 const gatewayKey=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_AI_GATEWAY_KEY;
 if(!gatewayKey)return res.status(503).json({ok:false,ready:false,error:'Vision provider is not configured yet. Add AI Gateway credentials to enable automatic registration reading.'});
 const token=await issueSignedToken({pathname,operations:['get'],validUntil:Date.now()+10*60*1000,...blobAuthOptions()});
 const signed=await presignUrl(token,{operation:'get',pathname,access:'private',validUntil:Date.now()+8*60*1000});
 const prompt='Inspect this aircraft photograph. Read ONLY the aircraft registration painted on the aircraft. Return strict JSON with keys registration, confidence (0-1), visibleText, airlineHint, aircraftTypeHint, reasoning. If any character is unclear, lower confidence and use null registration rather than guessing. Do not infer registration from airline or aircraft type.';
 const r=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+gatewayKey,'Content-Type':'application/json'},body:JSON.stringify({model:'interfaze/interfaze-beta',temperature:0,messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:signed.presignedUrl}}]}],response_format:{type:'json_object'}})});
 const raw=await r.text();if(!r.ok)return res.status(502).json({ok:false,error:'Vision service HTTP '+r.status,detail:raw.slice(0,300)});
 let outer;try{outer=JSON.parse(raw)}catch{return res.status(502).json({ok:false,error:'Vision service returned invalid JSON'})}
 let result={};try{result=JSON.parse(outer.choices?.[0]?.message?.content||'{}')}catch{}
 const registration=normalizeReg(result.registration);const confidence=Math.max(0,Math.min(1,Number(result.confidence)||0));
 const accepted=registration&&plausible(registration)&&confidence>=0.86;
 return res.status(200).json({ok:true,service:'MikeAircraft Visual Registration Reader',version:'0.1',pathname,registration:accepted?registration:null,candidate:registration||null,confidence,status:accepted?'PROBABLE':'UNKNOWN',visibleText:result.visibleText||null,airlineHint:result.airlineHint||null,aircraftTypeHint:result.aircraftTypeHint||null,reasoning:result.reasoning||null,rule:'Visual AI never marks CONFIRMED automatically.'});
 }catch(e){console.error('Photo vision error',e);return res.status(500).json({ok:false,error:e.message})}}
