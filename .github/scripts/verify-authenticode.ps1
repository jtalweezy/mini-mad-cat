param(
  [Parameter(Mandatory=$true)][ValidateSet('x64','arm64')][string]$Architecture
)

$ErrorActionPreference = 'Stop'
$fingerprint = $env:WINDOWS_SIGNING_CERT_SHA256
if ($fingerprint -notmatch '^[0-9a-fA-F]{64}$') { throw 'Set WINDOWS_SIGNING_CERT_SHA256 to the trusted Windows signing certificate fingerprint.' }
$installers = @(Get-ChildItem -LiteralPath 'dist/verified' -Filter '*.exe' -File)
if ($installers.Count -ne 1) { throw 'Expected exactly one Windows installer.' }
$unpacked = if ($Architecture -eq 'arm64') { 'win-arm64-unpacked' } else { 'win-unpacked' }
$application = Join-Path "dist/packages/$unpacked" 'mini-mad-cat.exe'

foreach ($path in @($installers[0].FullName, $application)) {
  $signature = Get-AuthenticodeSignature -LiteralPath $path
  if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate) {
    throw "A valid timestamped Authenticode signature is required for $path."
  }
  if ($signature.SignerCertificate.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256) -ine $fingerprint) {
    throw "The Windows signer does not match the trusted publisher for $path."
  }
}

$nodePath = Join-Path "dist/packages/$unpacked" 'resources/bridge-runtime/node.exe'
if ((Get-AuthenticodeSignature -LiteralPath $nodePath).Status -ne 'Valid') {
  throw 'The bundled Windows Node binary lacks a valid Authenticode signature.'
}
Write-Output 'Installer, application and bundled Node signatures verified.'
