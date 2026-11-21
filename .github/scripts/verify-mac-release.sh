#!/usr/bin/env bash
set -euo pipefail

arch=x86_64
if [ "$TARGET_ARCH" = arm64 ]; then arch=arm64; fi
[[ "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]
shopt -s nullglob
images=(dist/verified/*.dmg)
archives=(dist/verified/*.zip)
[[ ${#images[@]} -eq 1 && ${#archives[@]} -eq 1 ]]

scratch="$(mktemp -d)"
mounted=false
cleanup() {
  if [[ "$mounted" == true ]]; then hdiutil detach "$scratch/image"; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

verify_publisher() {
  local identity
  identity="$(codesign -dv --verbose=4 "$1" 2>&1)"
  awk -v team="TeamIdentifier=$APPLE_TEAM_ID" '$0 == team { found=1 } END { exit !found }' <<< "$identity"
}

verify_app() {
  local apps=("$1"/*.app)
  [[ ${#apps[@]} -eq 1 ]]
  local app="${apps[0]}" executable
  executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")"
  lipo -verify_arch "$arch" "$app/Contents/MacOS/$executable"
  codesign --verify --deep --strict "$app"
  verify_publisher "$app"
  xcrun stapler validate "$app"
  spctl --assess --type execute "$app"
}

codesign --verify --strict "${images[0]}"
verify_publisher "${images[0]}"
xcrun notarytool submit "${images[0]}" --wait --output-format json \
  --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID" > "$scratch/notary.json"
if ! jq -e '.status == "Accepted"' "$scratch/notary.json" > /dev/null; then
  printf '%s\n' 'Apple did not accept the signed disk image.' >&2
  exit 1
fi
xcrun stapler staple "${images[0]}"
xcrun stapler validate "${images[0]}"
spctl --assess --type open --context context:primary-signature "${images[0]}"
mkdir "$scratch/image" "$scratch/zip"
hdiutil attach -readonly -nobrowse -mountpoint "$scratch/image" "${images[0]}"
mounted=true
verify_app "$scratch/image"
ditto -x -k "${archives[0]}" "$scratch/zip"
verify_app "$scratch/zip"
