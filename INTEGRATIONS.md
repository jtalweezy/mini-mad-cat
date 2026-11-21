# Mini Mad Cat agent integrations

The desktop companion and the agent bridge are separate processes. Run the companion on the computer whose pointer it should follow. Connect an agent to `bridge/mcp.cjs` through MCP stdio to change its animation and behavior. This creates a companion alongside applications; it does not replace their built-in pet interface.

The configurations below register the MCP bridge directly. For native plugin wrappers and optional passive lifecycle reactions, see `NATIVE_PLUGIN.md`. Choose one registration route per host.

Use an absolute path to the installed Node executable and to the extracted bundle. The examples use `/ABS/BUNDLE` as a placeholder. On Windows, a JSON path such as `C:/Tools/mini-mad-cat/bridge/mcp.cjs` works without backslash escaping. Keep the bundle at that location after configuration.

On macOS, begin with the [Mac guide](docs/MACOS.md) for standalone installation, native Node architecture, local CLI demos, and all five local host routes. GUI clients should use the absolute Node executable printed by `node -p 'process.execPath'`.

## Codex

Register the bridge with the locally installed CLI:

```sh
codex mcp add mini-mad-cat -- node /ABS/BUNDLE/bridge/mcp.cjs
codex mcp list
```

Or merge this table into `~/.codex/config.toml`; project-scoped `.codex/config.toml` is also supported in trusted projects:

```toml
[mcp_servers.mini-mad-cat]
command = "/ABS/PATH/TO/node"
args = ["/ABS/BUNDLE/bridge/mcp.cjs"]
```

Restart the MCP connection and inspect its tools. The command syntax was also checked against local `codex-cli 0.170.0`. [Official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Claude Desktop

Open Settings → Developer → Edit Config. Merge one entry under the existing `mcpServers` object:

```json
{
  "mcpServers": {
    "mini-mad-cat": {
      "command": "/ABS/PATH/TO/node",
      "args": ["/ABS/BUNDLE/bridge/mcp.cjs"]
    }
  }
}
```

Config locations:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Fully restart Claude Desktop. Use absolute paths; do not replace unrelated server entries. [Official MCP local-server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

## Claude Code

From the project where you want the tools, register the bridge in local scope:

```sh
claude mcp add --transport stdio --scope local mini-mad-cat -- /ABS/PATH/TO/node /ABS/BUNDLE/bridge/mcp.cjs
claude mcp get mini-mad-cat
```

Inspect `/mcp` inside Claude Code and follow its tool approvals. Local scope is private to the current project and stored in `~/.claude.json`; use `--scope user` only when you want cross-project access. Native plugin loading is an alternative described in `NATIVE_PLUGIN.md`. [Official Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

## Cursor IDE

Merge the following into the project's `.cursor/mcp.json`, or use `~/.cursor/mcp.json` for user-wide access:

```json
{
  "mcpServers": {
    "mini-mad-cat": {
      "type": "stdio",
      "command": "/ABS/PATH/TO/node",
      "args": ["/ABS/BUNDLE/bridge/mcp.cjs"]
    }
  }
}
```

Check the server in Cursor's MCP settings and enable its tools. Cursor IDE integration is separate from following the mouse cursor: the desktop runtime supplies pointer tracking. [Official Cursor MCP documentation](https://cursor.com/docs/mcp).

## Grok Build

The official Grok Build CLI documents local stdio servers:

```sh
grok mcp add mini-mad-cat -- node /ABS/BUNDLE/bridge/mcp.cjs
grok mcp list
grok mcp doctor mini-mad-cat
```

The corresponding `~/.grok/config.toml` entry is:

```toml
[mcp_servers.mini-mad-cat]
command = "/ABS/PATH/TO/node"
args = ["/ABS/BUNDLE/bridge/mcp.cjs"]
```

Verify your installed `grok` executable is the official Grok Build client before applying these instructions. [Official Grok Build MCP documentation](https://docs.x.ai/build/features/mcp-servers).

## Grok Bot and hosted Grok API

Grok Bot's official overview describes a cloud computer and support for custom MCP/API tools. That does not establish a drop-in local desktop plugin schema. A Bot running this companion on its own desktop would track that desktop's pointer. Controlling a user's separate computer requires a deliberately configured authenticated bridge. This bundle does not open a public endpoint or install a Grok Bot connector. [Official Grok Bot overview](https://docs.x.ai/grok-bot/overview).

The hosted xAI API's Remote MCP tool accepts Streamable HTTP or SSE server URLs, rather than launching local stdio commands. A user-owned Grok application with local function calling can invoke the included CLI/bridge; a hosted Remote MCP integration needs an additional authenticated remote transport. Do not point a hosted service at `127.0.0.1` and expect it to reach the user's computer. [Official xAI Remote MCP documentation](https://docs.x.ai/developers/tools/remote-mcp).

## Other agents

Any local MCP stdio host can launch the same Node bridge. An agent with local shell access can use the included command-line controller instead. Inspect `tools/list` for the actual tool names and schema; the bridge advertises the supported operations. Avoid inventing app-specific plugin manifests when the host only supports MCP.

## Platform and validation limits

The runtime targets desktop Windows, macOS, and Linux. Mobile operating systems, browser-only hosts, and headless environments do not supply a personal desktop overlay. A server launched inside a container, SSH host, or cloud workspace controls that environment, not the user's local pointer.

Electron's native Wayland backend does not provide the global cursor-position and window-position APIs required for chase behavior. On compatible Linux systems, use an X11 session or XWayland launch (`npm start -- --ozone-platform=x11`). Desktop/compositor behavior must be verified on the target machine. [Electron screen API](https://www.electronjs.org/docs/latest/api/screen/), [Electron window platform notices](https://www.electronjs.org/docs/latest/api/browser-window).

Documentation routes were checked on November 20–21, 2026. Client configuration examples are verified against their published interfaces; they are not end-to-end installation tests in every application or operating system. macOS CI runs headless Node/artwork checks; macOS desktop rendering and provider installation remain target-machine checks. See the bundle's validation record for the platforms actually exercised.
