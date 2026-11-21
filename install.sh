#!/usr/bin/env sh
set -eu
cd -- "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 22 or newer first.' >&2; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
npm ci
npm test
npm run check:art
printf '%s\n' 'Ready. Run npm start to open the companion. Run npm run config for an MCP configuration snippet.'
