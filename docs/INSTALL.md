# Install Mini Mad Cat

Download signed native packages from [GitHub Releases](https://github.com/jtalweezy/mini-mad-cat/releases) when available. Choose **x64** for a 64-bit Intel or AMD processor or **arm64** for Apple silicon, Windows on Arm, or a 64-bit ARM Linux device. Native packages include the companion, the artwork, and the local bridge runtime.

| Platform | Native package | How to start |
| --- | --- | --- |
| Windows | Setup .exe | Verify the publisher signature and install for your user. Open **Mini Mad Cat** from the Start menu. |
| macOS 13.5+ | .dmg, with a .zip alternative | Drag the app to **Applications**, then open that copy. Open an extracted .app from a permanent location when using the ZIP. |
| Debian or Ubuntu Linux | .deb | Use the system package installer, then open **Mini Mad Cat** from your applications menu. |
| Other Linux desktops | .tar.gz | Extract it to a permanent folder and launch the included executable from that folder. |

The [source instructions](../README.md#download-and-start) are also available and use Node.js 22 or newer. See the [macOS guide](MACOS.md) for source installation and provider-specific instructions. The companion runs directly in your desktop session. MCP is optional and used when connecting supported apps.

If you are switching from the source kit to a native package, quit the existing companion before opening the installed app.

## Choose your apps

On the first packaged launch, **App connections** lists supported local apps and preselects the detected apps it can configure. Review the boxes and choose **Save connections**, or choose **Continue without connecting** to run the pet by itself. Restart each changed app to load its connection.

Open **App connections…** from the tray or the mech's right-click menu later to connect or disconnect an app. You can also relaunch the companion with `--setup` if your desktop hides its tray menu. Clear the relevant checkboxes and save to disconnect the apps before removing the companion. The setup reports files it cannot safely edit so you can configure those hosts using their documented settings.

The installer recognizes **Codex**, **Claude Desktop**, **Claude Code**, **Cursor**, and **Grok Build** where installed and supported. Local app availability varies by operating system. The manager uses each app's per-user configuration and only changes the Mini Mad Cat MCP registration. Optional lifecycle hooks installed separately can be managed through their host's plugin settings. Connections use the authenticated local bridge. For a host that needs manual setup, see [INTEGRATIONS.md](../INTEGRATIONS.md).

## Linux displays

The full cursor-following experience uses X11 or a compatible XWayland session. Native Wayland limits global pointer tracking and app-controlled window movement. You can run the desktop executable with `--ozone-platform=x11` when XWayland is available. Reactions are delivered through the same local bridge. [Electron's Wayland notes](https://www.electronjs.org/blog/tech-talk-wayland)

On Ubuntu, use the `.deb` if system policy blocks the portable app's Chromium sandbox. The Debian package supplies the upstream scoped AppArmor profile for the installed app path.

## Verify a download

Check the download against the release's SHA-256 file. On Windows, you can inspect the **Digital Signatures** tab in the installer properties or run `Get-AuthenticodeSignature` in PowerShell. On macOS, the normal Gatekeeper check verifies the Developer ID and notarization. On Linux, verify the package with its matching detached `.asc` signature and the project's independently confirmed OpenPGP key. [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) · [Windows signing and reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)

Endpoint products apply the policies set by the organization. To investigate a suspected false positive, give the endpoint administrator the original release file's SHA-256, signer, and detection ID so they can verify the exact artifact.
