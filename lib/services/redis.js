function resolveRedisEnv(env=process.env){
  const url=env.KV_REST_API_URL||env.UPSTASH_REDIS_REST_URL||env.UPSTASH_REDIS_REST_KV_REST_API_URL||null;
  const token=env.KV_REST_API_TOKEN||env.UPSTASH_REDIS_REST_TOKEN||env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN||null;
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
  async function command(command){
    if(!cfg.available) throw new Error("Redis environment variables unavailable");
    const response=await fetch(cfg.url,{method:"POST",headers:{Authorization:`Bearer ${cfg.token}`,"Content-Type":"application/json"},body:JSON.stringify(command)});
    if(!response.ok) throw new Error(`Redis HTTP ${response.status}`);
    const data=await response.json();
    if(data.error) throw new Error(`Redis error: ${data.error}`);
    return data.result;
  }
  return {...cfg,command};
}

module.exports={resolveRedisEnv,applyRedisCompatibility,createRedisClient};
