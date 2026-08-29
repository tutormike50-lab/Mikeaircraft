const crypto = require("crypto");
const baseHandler = require("./pi-source-wrapper.js");
const { invokeHandler } = require("./services/invoke-handler.js");
const { createRedisClient } = require("./services/redis.js");

const FEED_KEY = "mikeaircraft:pi:PRG:feed";
const SNAPSHOT_KEY = "mikeaircraft:engine:PRG:decision-snapshot:v1";
const LOCK_KEY = "mikeaircraft:engine:PRG:decision-lock:v1";
const SNAPSHOT_TTL_SECONDS = 30;
const LOCK_TTL_MS = 7000;
const WAIT_STEP_MS = 100;
const WAIT_STEPS = 12;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseJson(value) {
  if (!value) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

async function feedVersion(redis) {
  const stored = await redis.command(["GET", FEED_KEY]);
  const feed = parseJson(stored);
  const receivedAt = Number(feed?.receivedAt || 0);
  return Number.isFinite(receivedAt) && receivedAt > 0 ? receivedAt : null;
}

async function readSnapshot(redis) {
  const stored = await redis.command(["GET", SNAPSHOT_KEY]);
  const snapshot = parseJson(stored);
  if (!snapshot?.payload?.ok) return null;
  return snapshot;
}

function annotate(payload, feedReceivedAt, computedAt, cacheHit) {
  if (!payload?.ok) return payload;
  payload.traffic = {
    ...(payload.traffic || {}),
    decisionMode: "SINGLE_PI_SNAPSHOT",
    decisionFeedReceivedAt: feedReceivedAt || null,
    decisionComputedAt: computedAt || null,
    decisionSnapshotHit: Boolean(cacheHit)
  };
  return payload;
}

async function computeFresh(req, feedReceivedAt) {
  const result = await invokeHandler(baseHandler, req.query || {}, req.headers || {});
  const payload = result.data;
  if (payload?.ok) annotate(payload, feedReceivedAt, Date.now(), false);
  return { status: result.status, payload };
}

async function releaseLock(redis, token) {
  try {
    await redis.command([
      "EVAL",
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
      "1",
      LOCK_KEY,
      token
    ]);
  } catch {}
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  const airport = String(req.query?.airport || "PRG").trim().toUpperCase();
  if (airport !== "PRG") return baseHandler(req, res);

  const redis = createRedisClient();
  if (!redis.available) return baseHandler(req, res);

  let wantedFeed = null;
  let previousSnapshot = null;
  try {
    [wantedFeed, previousSnapshot] = await Promise.all([
      feedVersion(redis),
      readSnapshot(redis)
    ]);
  } catch {
    return baseHandler(req, res);
  }

  if (!wantedFeed) return baseHandler(req, res);

  if (previousSnapshot && Number(previousSnapshot.feedReceivedAt) === wantedFeed) {
    const payload = annotate(
      previousSnapshot.payload,
      previousSnapshot.feedReceivedAt,
      previousSnapshot.computedAt,
      true
    );
    return res.status(Number(previousSnapshot.status || 200)).json(payload);
  }

  const token = crypto.randomBytes(12).toString("hex");
  let lockAcquired = false;
  try {
    lockAcquired = (await redis.command([
      "SET",
      LOCK_KEY,
      token,
      "NX",
      "PX",
      String(LOCK_TTL_MS)
    ])) === "OK";
  } catch {
    return baseHandler(req, res);
  }

  if (lockAcquired) {
    try {
      const computed = await computeFresh(req, wantedFeed);
      if (computed.payload?.ok) {
        let actualFeed = wantedFeed;
        try {
          actualFeed = (await feedVersion(redis)) || wantedFeed;
        } catch {}
        const computedAt = Date.now();
        annotate(computed.payload, actualFeed, computedAt, false);
        const snapshot = {
          feedReceivedAt: actualFeed,
          computedAt,
          status: computed.status,
          payload: computed.payload
        };
        await redis.command([
          "SET",
          SNAPSHOT_KEY,
          JSON.stringify(snapshot),
          "EX",
          String(SNAPSHOT_TTL_SECONDS)
        ]);
      }
      return res.status(computed.status || 200).json(computed.payload);
    } finally {
      await releaseLock(redis, token);
    }
  }

  for (let i = 0; i < WAIT_STEPS; i += 1) {
    await sleep(WAIT_STEP_MS);
    try {
      const snapshot = await readSnapshot(redis);
      if (snapshot && Number(snapshot.feedReceivedAt) === wantedFeed) {
        const payload = annotate(snapshot.payload, snapshot.feedReceivedAt, snapshot.computedAt, true);
        return res.status(Number(snapshot.status || 200)).json(payload);
      }
    } catch {}
  }

  // A writer is still working. Prefer the last coherent snapshot to creating
  // another competing movement decision from the same live feed.
  if (previousSnapshot?.payload?.ok) {
    const ageMs = Date.now() - Number(previousSnapshot.computedAt || 0);
    if (ageMs >= 0 && ageMs <= 10000) {
      const payload = annotate(
        previousSnapshot.payload,
        previousSnapshot.feedReceivedAt,
        previousSnapshot.computedAt,
        true
      );
      payload.traffic.decisionWaitingForNewFeed = true;
      return res.status(Number(previousSnapshot.status || 200)).json(payload);
    }
  }

  // Last-resort fallback only; normal PRG operation should not reach this path.
  return baseHandler(req, res);
};
