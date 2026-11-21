# Mini Mad Cat on macOS

The overlay and local controls run directly with Node.js. MCP is optional.

## Requirements

- macOS 13 Ventura or newer. The bundled Electron 45 runtime requires macOS 13+. [Electron platform requirement](https://www.electronjs.org/docs/latest/breaking-changes/#removed-macos-12-support).
- Node.js 22 or newer with npm. Use the native **arm64** build on Apple silicon, or **x64** on an Intel Mac. Download a maintained LTS release from [Node.js](https://nodejs.org/en/download).
- A normal logged-in graphical desktop and an internet connection for the initial dependency/runtime download.

Check the Node installation in Terminal:

```sh
node --version
npm --version
node -p 'process.platform + " " + process.arch'
```

The last command should report `darwin arm64` on Apple silicon or `darwin x64` on Intel. Install dependencies on this Mac; do not copy `node_modules` from Windows or another architecture. Electron provides separate [Intel and Apple silicon binaries](https://www.electronjs.org/docs/latest/tutorial/installation#customization).

## Install and start without an agent

Download the complete source kit from [Releases](https://github.com/jtalweezy/mini-mad-cat/releases/latest), extract it to a permanent folder owned by your account, and open Terminal in that folder. For a cloned checkout, use the repository root instead.

```sh
sh ./install.sh
npm start
```

The installer runs `npm ci`, the non-GUI tests, and the artwork check. Dependencies stay inside the extracted bundle. Keep the first Terminal running while using the companion; use a second Terminal in the same folder for the commands below. This distribution is a source kit, not a signed/notarized `.app` or `.dmg` installer.

Use the menu-bar icon or right-click the visible mech for its menu. Drag the mech to reposition it; double-click to salute. **Follow cursor** enables chasing. **Cmd+Option+M** shows or hides the overlay.

Choose **Mouse tracking → 10 seconds after click** for tracking only after interaction. A primary click on the visible mech or the end of a drag starts a fresh 10-second window for gaze and optional chasing, then returns to idle. **Always** tracks continuously; **Off** disables automatic gaze/chasing. Keep **Click through** off to activate the timed mode by clicking. The mode is saved; the timed window resets at restart. Reduced motion, context bubbles, size, reset position, and quit are also available in the menu.

## Local controls and reaction demos

These commands use the local authenticated bridge directly and need no MCP registration:

```sh
node bridge/control.cjs status
node bridge/control.cjs animate waving 1800
node bridge/control.cjs configure '{"trackingMode":"after-click","clickThrough":false}'
node bridge/control.cjs configure '{"followCursor":true}'
node bridge/control.cjs reset
```

To exercise both weighted outcomes, send JSON through stdin. The default cooldown is 2.5 seconds, so leave at least three seconds between demos:

```sh
printf '%s\n' '{"outcome":"success","impact":1,"confidence":1,"severity":0,"message":"ENEMY DESTROYED"}' | node bridge/event.cjs
sleep 3
printf '%s\n' '{"outcome":"failure","impact":1,"confidence":1,"severity":1,"message":"SYSTEM FAILURE — RECOVERING"}' | node bridge/event.cjs
```

With the default policy, high success launches missiles; high failure plays one knockdown/recovery cycle with an impact effect. Reduced motion suppresses those effects. A response with `accepted:false` means the cooldown prevented a reaction. Use `node bridge/control.cjs quit` or the menu to close the companion.

Settings and the runtime token normally live in `~/Library/Application Support/mini-mad-cat-companion/`. Keep that directory private and out of archives. The app and local bridge must run under the same user with the same `MADCAT_HOME` setting, if you override it.

## Optional connections to local agents

Start the companion first. From the bundle root, capture its actual paths and print the JSON configuration:

```sh
MADCAT_BUNDLE="$(pwd -P)"
MADCAT_NODE="$(node -p 'process.execPath')"
npm run config
```

Use those absolute paths for GUI-launched clients, which may not inherit your Terminal's `PATH`. Merge the printed server entry into existing configuration; preserve other servers. Choose direct MCP registration or a native wrapper for each host.

| Local host | macOS setup and verification |
| --- | --- |
| Codex | Run `codex mcp add mini-mad-cat -- "$MADCAT_NODE" "$MADCAT_BUNDLE/bridge/mcp.cjs"`, then `codex mcp list`. Configuration is in `~/.codex/config.toml`; trusted-project `.codex/config.toml` is another option. [Official guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). |
| Claude Desktop | Open **Claude → Settings → Developer → Edit Config** and merge the printed `mcpServers` entry into `~/Library/Application Support/Claude/claude_desktop_config.json`. Fully quit and reopen Claude Desktop, then inspect its local connector tools. [Official local-server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers). |
| Claude Code | From the project where you want the tools, run `claude mcp add --transport stdio --scope local mini-mad-cat -- "$MADCAT_NODE" "$MADCAT_BUNDLE/bridge/mcp.cjs"`. Check `claude mcp get mini-mad-cat` and `/mcp`. Local scope is private to your current project and stored in `~/.claude.json`; `--scope user` is an optional cross-project choice. [Official guide](https://code.claude.com/docs/en/mcp). |
| Cursor IDE | Merge the printed entry into the project's `.cursor/mcp.json`, or `~/.cursor/mcp.json` for user-wide access. Inspect and enable the server in Cursor's MCP settings. [Official guide](https://cursor.com/docs/mcp). |
| Grok Build | Run `grok mcp add mini-mad-cat -- "$MADCAT_NODE" "$MADCAT_BUNDLE/bridge/mcp.cjs"`, then `grok mcp doctor mini-mad-cat`. Its configuration is `~/.grok/config.toml`. Use the official Grok Build client. [Official guide](https://docs.x.ai/build/features/mcp-servers). |

Registration changes only the selected host configuration. After connecting, ask the agent to call `pet_status`, then `pet_animate` with `{"state":"waving","durationMs":1800}`. Confirm the visible overlay reacts. These five local host routes expose the same companion tools; actual availability also depends on the installed client and its tool approvals.

### Optional native wrappers and lifecycle hooks

Back in the bundle root, generate only the wrapper for your chosen host:

```sh
node native/prepare.cjs --host claude
```

Use `codex`, `cursor`, or `grok` instead for those hosts. Generation resolves this Mac's paths and writes `generated-native/<host>/` without installing a client or changing its configuration. Follow [NATIVE_PLUGIN.md](../NATIVE_PLUGIN.md) for the host's loading and hook trust steps. For a local Claude Code trial, run `claude --plugin-dir "$MADCAT_BUNDLE/generated-native/claude"`; Grok Build supports the equivalent `grok --plugin-dir "$MADCAT_BUNDLE/generated-native/grok"`. Generate that host's wrapper first. Regenerate after moving the bundle or changing the Node installation.

Hooks send coarse lifecycle signals. Meaningful weighted task outcomes still come from explicit `pet_react` calls. Claude Desktop's direct MCP connection does not install a background observer of all conversations.

### Hosted Grok services

[Grok Bot uses a cloud computer](https://docs.x.ai/grok-bot/overview), and the [hosted xAI Remote MCP API](https://docs.x.ai/developers/tools/remote-mcp) connects to HTTP/SSE server URLs. Neither can reach this Mac's local stdio bridge directly. A separate authenticated relay would be required; this kit does not install one. Local Grok Build uses the supported route above.

## What is verified

The repository's macOS CI job runs Node tests and artwork checks without opening the desktop app. That covers headless checks, not macOS overlay rendering, menu-bar behavior, pointer tracking, multiple displays, or end-to-end provider installation. Those desktop checks remain unverified on macOS. Check [VALIDATION.md](../VALIDATION.md) and the latest CI results for the recorded scope.

If the bridge connects but no pet appears, run `npm start` in your Mac's graphical session and compare `node bridge/control.cjs status` with the actual overlay. If a GUI client cannot find Node, use the absolute executable path printed above. Report the macOS version, chip, Node architecture, client version, and observed behavior when opening an issue.
