function resolveRedisEnv(env=process.env){
  const url=env.KV_REST_API_URL||env.UPSTASH_REDIS_REST_URL||env.UPSTASH_REDIS_REST_KV_REST_API_URL||env.MIKEAIRCRAFT_KV_REST_API_URL||env.MIKEAIRCRAFT_UPSTASH_REDIS_REST_URL||env.MIKEAIRCRAFT_REDIS_REST_URL||null;
  const token=env.KV_REST_API_TOKEN||env.UPSTASH_REDIS_REST_TOKEN||env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN||env.MIKEAIRCRAFT_KV_REST_API_TOKEN||env.MIKEAIRCRAFT_UPSTASH_REDIS_REST_TOKEN||env.MIKEAIRCRAFT_REDIS_REST_TOKEN||null;
  return {url,token,available:Boolean(url&&token)};
}

function applyRedisCompatibility(env=process.env){
  const cfg=resolveRedisEnv(env);
  if(!env.KV_REST_API_URL&&cfg.url) env.KV_REST_API_URL=cfg.url;
  if(!env.KV_REST_API_TOKEN&&cfg.token) env.KV_REST_API_TOKEN=cfg.token;
  return cfg;
}

function createRedisClient(env=process.env){
  const cfg=resolveRedisEnv(env);
  const headers=()=>({Authorization:`Bearer ${cfg.token}`,"Content-Type":"application/json"});
  async function command(command){
    if(!cfg.available) throw new Error("Redis environment variables unavailable");
    const response=await fetch(cfg.url,{method:"POST",headers:headers(),body:JSON.stringify(command)});
    if(!response.ok) throw new Error(`Redis HTTP ${response.status}`);
    const data=await response.json();
    if(data.error) throw new Error(`Redis error: ${data.error}`);
    return data.result;
  }
  async function pipeline(commands){
    if(!cfg.available) throw new Error("Redis environment variables unavailable");
    if(!Array.isArray(commands)||commands.length===0) return [];
    const response=await fetch(`${cfg.url.replace(/\/$/,"")}/pipeline`,{method:"POST",headers:headers(),body:JSON.stringify(commands)});
    if(!response.ok) throw new Error(`Redis pipeline HTTP ${response.status}`);
    const data=await response.json();
    if(!Array.isArray(data)) throw new Error("Redis pipeline returned invalid response");
    const failure=data.find(item=>item&&item.error);
    if(failure) throw new Error(`Redis pipeline error: ${failure.error}`);
    return data.map(item=>item?item.result:null);
  }
  return {...cfg,command,pipeline};
}

module.exports={resolveRedisEnv,applyRedisCompatibility,createRedisClient};
