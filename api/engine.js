// MikeAircraft Engine entrypoint.
const {applyRedisCompatibility}=require("../lib/services/redis.js");
applyRedisCompatibility();
module.exports=require("../lib/editorial-engine-wrapper-v2.js");
