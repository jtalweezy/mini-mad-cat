#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ -z "$LINUX_SIGNING_KEY" || ! "$LINUX_SIGNING_FINGERPRINT" =~ ^[A-Fa-f0-9]{40}$ ]]; then
  printf '%s\n' 'Provide the Linux signing key and its trusted primary fingerprint.' >&2
  exit 1
fi

fingerprint="${LINUX_SIGNING_FINGERPRINT^^}"
export GNUPGHOME
GNUPGHOME="$(mktemp -d)"
trap 'gpgconf --kill all; rm -rf -- "$GNUPGHOME"' EXIT
printf '%s\n' "$LINUX_SIGNING_KEY" | gpg --batch --import
unset LINUX_SIGNING_KEY
gpg --batch --with-colons --list-secret-keys "$fingerprint" \
  | awk -F: -v expected="$fingerprint" '$1 == "fpr" && $10 == expected { found=1 } END { exit !found }'

if [ "$TARGET_ARCH" = x64 ]; then
  gpg --batch --armor --export "$fingerprint" > dist/verified/mini-mad-cat-linux-signing-key.asc
  test -s dist/verified/mini-mad-cat-linux-signing-key.asc
fi

deb_arch=amd64
if [ "$TARGET_ARCH" = arm64 ]; then deb_arch=arm64; fi
for package in dist/verified/*.deb; do
  test "$(dpkg-deb --field "$package" Architecture)" = "$deb_arch"
  dpkg-deb --contents "$package" > /dev/null
done
for package in dist/verified/*.tar.gz; do tar -tzf "$package" > /dev/null; done
for package in dist/verified/*.deb dist/verified/*.tar.gz; do
  printf '%s\n' "$LINUX_SIGNING_PASSPHRASE" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 \
    --local-user "$fingerprint" --digest-algo SHA256 --armor --detach-sign --output "$package.asc" "$package"
  gpg --batch --status-fd 1 --verify "$package.asc" "$package" \
    | awk -v expected="$fingerprint" '$2 == "VALIDSIG" && $10 == 8 && ($3 == expected || $NF == expected) { found=1 } END { exit !found }'
done
