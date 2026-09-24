const crypto = require("crypto");

const SCHEMA = 1;
const ALLOWED_PI_FILES = new Set([
  "scripts/pi_bridge.py",
  "scripts/release_manager.py",
  "scripts/production_tracker.py",
  "scripts/production_tracking.py",
  "scripts/camera_optics.py"
]);

function validateManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("manifest must be an object");
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "piFiles,releaseId,schema,serverCommit") throw new Error("manifest fields are invalid");
  if (value.schema !== SCHEMA) throw new Error("manifest schema is unsupported");
  if (typeof value.releaseId !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(value.releaseId)) throw new Error("releaseId is invalid");
  if (typeof value.serverCommit !== "string" || !/^[0-9a-f]{40}$/.test(value.serverCommit)) throw new Error("serverCommit must be a full lowercase SHA-1");
  if (!Array.isArray(value.piFiles) || value.piFiles.length === 0) throw new Error("piFiles must not be empty");
  const seen = new Set();
  for (const file of value.piFiles) {
    if (!file || typeof file !== "object" || Array.isArray(file) || Object.keys(file).sort().join(",") !== "path,sha256") throw new Error("piFiles entry is invalid");
    if (!ALLOWED_PI_FILES.has(file.path) || seen.has(file.path)) throw new Error("Pi file is not allowlisted: " + file.path);
    if (!/^[0-9a-f]{64}$/.test(file.sha256 || "")) throw new Error("sha256 is invalid for " + file.path);
    seen.add(file.path);
  }
  if (!seen.has("scripts/pi_bridge.py") || !seen.has("scripts/production_tracker.py")) throw new Error("bridge and tracker must be versioned together");
  return value;
}

function manifestHash(value) {
  const canonical = JSON.stringify(validateManifest(value));
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

module.exports = { SCHEMA, ALLOWED_PI_FILES, validateManifest, manifestHash };
