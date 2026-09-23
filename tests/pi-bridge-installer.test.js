const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const installer = fs.readFileSync(
  path.join(__dirname, '..', 'deploy', 'pi-bridge', 'install.sh'),
  'utf8'
);

test('auth check validates and runs the same readable installed bridge script', () => {
  assert.match(installer, /BRIDGE_SCRIPT="\$\{INSTALL_DIR\}\/scripts\/pi_bridge\.py"/);
  assert.match(installer, /! -r "\$ENV_FILE" \|\| ! -r "\$BRIDGE_SCRIPT"/);
  assert.match(installer, /\/usr\/bin\/python3 "\$BRIDGE_SCRIPT" --check-auth/);
  assert.doesNotMatch(installer, /-x "\$BRIDGE_SCRIPT"/);
});

test('normal installation verifies auth-check inputs before reporting success', () => {
  const copyIndex = installer.indexOf('cp -a "$SOURCE_DIR/." "$INSTALL_DIR/"');
  const verifyIndex = installer.lastIndexOf('! -r "$ENV_FILE" || ! -r "$BRIDGE_SCRIPT"');
  const successIndex = installer.indexOf('Pi bridge installed and running. Setup is complete.');

  assert.ok(copyIndex >= 0);
  assert.ok(verifyIndex > copyIndex);
  assert.ok(successIndex > verifyIndex);
});
