// MikeAircraft Engine compatibility entrypoint.
// Accept legacy Vercel KV, direct Upstash REST, and Vercel-prefixed Upstash names.
const redisUrl =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;

const redisToken =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;

if (!process.env.KV_REST_API_URL && redisUrl) {
  process.env.KV_REST_API_URL = redisUrl;
}
if (!process.env.KV_REST_API_TOKEN && redisToken) {
  process.env.KV_REST_API_TOKEN = redisToken;
}

module.exports = require("../lib/engine-base.js");
