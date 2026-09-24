const test = require('node:test');
const assert = require('node:assert/strict');
const { validateManifest, manifestHash } = require('../lib/release-manifest');
const { publicState } = require('../lib/tracker-bridge-state');

function manifest() {
  return { schema: 1, releaseId: 'ec9b423-recovery', serverCommit: 'a'.repeat(40), piFiles: [
    { path: 'scripts/pi_bridge.py', sha256: 'b'.repeat(64) },
    { path: 'scripts/production_tracker.py', sha256: 'c'.repeat(64) }
  ] };
}

test('strict release manifest accepts only fixed allowlisted files', () => {
  const value = manifest(); assert.equal(validateManifest(value), value); assert.match(manifestHash(value), /^[0-9a-f]{64}$/);
  for (const path of ['../../etc/passwd', '/etc/mikeaircraft/pi-bridge.env', 'deploy/pi-bridge/mikeaircraft-pi-bridge.service']) {
    const bad = manifest(); bad.piFiles[0].path = path;
    assert.throws(() => validateManifest(bad), /allowlisted/);
  }
});

test('manifest rejects malformed commits, hashes, duplicates and unknown fields', () => {
  let bad = manifest(); bad.serverCommit = 'abc'; assert.throws(() => validateManifest(bad), /SHA-1/);
  bad = manifest(); bad.piFiles[0].sha256 = 'x'.repeat(64); assert.throws(() => validateManifest(bad), /sha256/);
  bad = manifest(); bad.piFiles.push({...bad.piFiles[0]}); assert.throws(() => validateManifest(bad), /allowlisted/);
  bad = manifest(); bad.command = 'rm -rf /'; assert.throws(() => validateManifest(bad), /fields/);
});

test('heartbeat exposes mixed-version state without inventing health', () => {
  const fresh = JSON.stringify({ receivedAt: 1000, trackerState: 'TRACKING', bridgeHealth: 'HEALTHY', trackerHealth: 'HEALTHY',
    release: { releaseId: 'old', serverCommit: '1'.repeat(40) } });
  const state = publicState(null, fresh, 1001);
  assert.equal(state.piVersion, '1'.repeat(40)); assert.equal(state.piReleaseId, 'old'); assert.equal(state.bridgeHealth, 'HEALTHY');
  const stale = publicState(null, fresh, 20000); assert.equal(stale.piOnline, false); assert.equal(stale.bridgeHealth, 'FAULT');
});
