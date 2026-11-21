$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or newer, then rerun this script.' }
if (-not (Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue)) { throw 'Install npm with Node.js, then rerun this script.' }
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw 'Node.js 22 or newer is required.' }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
npm.cmd run check:art
if ($LASTEXITCODE -ne 0) { throw 'Artwork validation failed.' }
Write-Host 'Ready. Run npm.cmd start to open the companion. Run npm.cmd run config for an MCP configuration snippet.'
