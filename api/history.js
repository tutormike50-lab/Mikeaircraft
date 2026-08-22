// MikeAircraft History entrypoint.
const {applyRedisCompatibility}=require("../lib/services/redis.js");
applyRedisCompatibility();
module.exports=require("../lib/history-base.js");
