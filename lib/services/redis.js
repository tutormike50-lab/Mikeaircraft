function firstEnv(env,names){
  for(const name of names){
    if(env[name]) return env[name];
  }
  return null;
}

function resolveRedisEnv(env=process.env){
  const url=firstEnv(env,[
    "KV_REST_API_URL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_KV_REST_API_URL",
    "MIKEAIRCRAFT_KV_REST_API_URL",
    "MIKEAIRCRAFT_UPSTASH_REDIS_REST_URL",
    "MIKEAIRCRAFT_UPSTASH_REDIS_REST_KV_REST_API_URL",
    "MIKEAIRCRAFT_REDIS_REST_URL"
  ]);
  const token=firstEnv(env,[
    "KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_TOKEN",
    "UPSTASH_REDIS_REST_KV_REST_API_TOKEN",
    "MIKEAIRCRAFT_KV_REST_API_TOKEN",
    "MIKEAIRCRAFT_UPSTASH_REDIS_REST_TOKEN",
    "MIKEAIRCRAFT_UPSTASH_REDIS_REST_KV_REST_API_TOKEN",
    "MIKEAIRCRAFT_REDIS_REST_TOKEN"
  ]);
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
