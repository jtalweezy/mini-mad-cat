$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or newer, then rerun this script.' }
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw 'Node.js 22 or newer is required.' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
npm run check:art
if ($LASTEXITCODE -ne 0) { throw 'Artwork validation failed.' }
Write-Host 'Ready. Run npm start to open the companion. Run npm run config for an MCP configuration snippet.'
