const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const bootstrap = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'pi-bridge', 'bootstrap-recovery.py'), 'utf8');
const releaseAgent = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'release_agent.py'), 'utf8');
const releaseService = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'pi-bridge', 'mikeaircraft-release-agent.service'), 'utf8');

test('recovery bootstrap is fixed-purpose and preserves existing secrets and bridge unit', () => {
  assert.match(bootstrap, /RELEASE_ID = "ec9b423-recovery-bootstrap-v1"/);
  assert.match(bootstrap, /existing \/etc\/mikeaircraft\/pi-bridge\.env is required and was not changed/);
  assert.match(bootstrap, /existing Pi bridge service is required and was not replaced/);
  assert.doesNotMatch(bootstrap, /cp -a|shutil\.copytree|shell=True/);
  assert.doesNotMatch(bootstrap, /write_text\([^\n]*ENV_FILE|atomic_write\(ENV_FILE/);
  assert.match(bootstrap, /SOURCE_DIR = Path\("\/home\/mike\/MikeAircraft"\)/);
  assert.match(bootstrap, /INSTALL_DIR = Path\("\/opt\/mikeaircraft"\)/);
  assert.doesNotMatch(bootstrap, /git", "-C", str\(INSTALL_DIR\)/);
  assert.match(bootstrap, /git@github\.com:tutormike50-lab\/mikeaircraft/);
});

test('permanent release agent reads Git source and writes only runtime installation', () => {
  assert.match(releaseAgent, /MIKEAIRCRAFT_SOURCE_DIR", "\/home\/mike\/MikeAircraft"/);
  assert.match(releaseAgent, /MIKEAIRCRAFT_INSTALL_DIR", "\/opt\/mikeaircraft"/);
  assert.match(releaseService, /ProtectHome=read-only/);
  assert.match(releaseService, /ReadOnlyPaths=\/home\/mike\/MikeAircraft/);
  assert.match(releaseService, /ReadWritePaths=\/opt\/mikeaircraft/);
});

test('recovery bootstrap pins all five release paths and exact ec9 tracker hashes', () => {
  for (const name of ['pi_bridge.py', 'release_manager.py', 'production_tracker.py', 'production_tracking.py', 'camera_optics.py']) {
    assert.match(bootstrap, new RegExp(`"scripts/${name.replace('.', '\\.')}": "[0-9a-f]{64}"`));
  }
  for (const digest of [
    '40215803f7e864121781c56c27d1818f5115fb204d31cc785d8a63b72e640d20',
    '27f8ba829826fe737285767c109814d71815fd905249879f80f2b3f1cdd0cb50',
    'd7c5a2f1d634fd219f631e3bcca6444938333c75dd849b1f0e04c088e122f7f9'
  ]) assert.match(bootstrap, new RegExp(digest));
});

test('recovery bootstrap requires match and both health checks before READY', () => {
  assert.match(bootstrap, /status\.get\("match"\) is True/);
  assert.match(bootstrap, /status\.get\("bridgeHealth"\) == "HEALTHY"/);
  assert.match(bootstrap, /status\.get\("trackerHealth"\) == "HEALTHY"/);
  assert.match(bootstrap, /"--check", "--direct"/);
});
