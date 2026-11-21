# Publish native packages

The **Native package checks** workflow builds x64 and arm64 candidates for Windows, macOS, and Linux. The artifacts are labeled as test builds. The separate **Signed native packages** workflow verifies the signer and publishes the approved binaries when the maintainer requests publication.

## Configure the release environments

In the repository's GitHub Actions settings, create `release-signing` and `release-publishing`. Limit deployments to protected `main` and require reviewers for `release-publishing`. Supply the signing materials through the `release-signing` environment. Keep private keys and passwords in environment secrets.

| System | Environment secrets | Environment variables |
| --- | --- | --- |
| Windows | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | `WINDOWS_SIGNING_CERT_SHA256` |
| macOS | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` | `APPLE_TEAM_ID` |
| Linux | `LINUX_SIGNING_KEY`, `LINUX_SIGNING_PASSPHRASE` | `LINUX_SIGNING_FINGERPRINT` |

The Windows workflow takes a PKCS#12 Authenticode identity with the configured SHA-256 certificate fingerprint. Providers that keep the signing key in a cloud service or hardware token require a compatible signing adapter. For macOS direct distribution, use an Apple Developer ID Application certificate and the corresponding notarization account. Publish your Linux OpenPGP public key through a channel where users can confirm its fingerprint independently. [Windows signing documentation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation) · [Apple Developer ID and notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

## Build and verify

1. Merge the reviewed changes to protected `main` and tag that commit `vX.Y.Z` using the version in `package.json`.
2. Dispatch **Signed native packages** for that tag from `main`. Use the default unchecked **Publish verified packages** for a rehearsal. For a production run, check it so publication waits for approval in `release-publishing`.
3. Check the same run's verified artifact digests and test those signed files on the target desktop and any required endpoint security policy.
4. Approve the waiting publication job after the checks pass. Each signing run can produce new hashes, so review the files from the run you approve.

The signed workflow verifies Authenticode on Windows, Developer ID and notarization on macOS, and detached OpenPGP signatures on Linux. It verifies GitHub build attestations against the workflow and commit before publishing the artifact set with SHA-256 checksums. Endpoint security validation remains an environment-specific check. [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)

For a local test build, use a native machine with matching Node architecture. The build tools download fixed upstream runtime archives and verify their committed SHA-256 values.

```sh
npm ci --ignore-scripts
npm run package -- --arch x64
```

Use `arm64` on an ARM64 host. Check `dist/packages` for the output. To exercise the connection picker without changing your real profile, run `node scripts/smoke-setup.cjs` on a graphical test host.
