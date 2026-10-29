const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const cli = require.resolve('@webos-tools/cli/bin/ares-package.js');
const result = spawnSync(process.execPath, [cli, 'app', '-o', 'dist'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
