# Native plugin wrappers and passive chat hooks

The bundle supplies separate native adapters rather than assuming every client reads the same manifest or path variable. The desktop companion remains a separately launched local app. The native wrapper connects its MCP tools and optional lifecycle reactions to a client that supports those features.

## Generate a wrapper on the installation machine

From the bundle root, after its dependencies and bridge files are present:

```sh
node native/prepare.cjs --host codex
node native/prepare.cjs --host claude
node native/prepare.cjs --host cursor
node native/prepare.cjs --host grok
```

Run only the command for the desired host. The helper creates `generated-native/<host>/` inside the current bundle, including the root `skills/` instructions and available installation docs. It resolves the current Node executable and companion directory, quotes hook commands for the local shell, and writes no global client configuration. You may set `--bundle-root /absolute/installed/bundle` when invoking it from elsewhere. Keep generated directories local: they contain machine-specific absolute paths. Regenerate after moving the bundle.

`native/templates/` contains the reviewable source manifests. Its `__...__` tokens are placeholders, not executable installation paths. Do not install a template without materializing it. Do not load both the manual MCP entry and a native wrapper for the same companion, or attach the same lifecycle hook twice.

Each generated wrapper records the installed application directory in `companion-location.json`. Run companion installation/start commands in that application directory, not inside a client-managed plugin cache. The copied agent instructions and handoff docs describe the application bundle, while the wrapper only wires the host to it.

## Host adapters

| Host | Generated manifest | Loading route |
| --- | --- | --- |
| Codex | Root `plugin.json` and `mcp.json` with Agent Plugins schemas; hooks under `extensions.com.openai` | The helper also creates a local marketplace under `generated-native/.agents/plugins/`. Register and install using the commands below. |
| Claude Code | `.claude-plugin/plugin.json` with inline MCP definition and hook file | Inspect with `claude plugin validate /ABS/generated-native/claude`; test locally with `claude --plugin-dir /ABS/generated-native/claude`. |
| Cursor IDE | `.cursor-plugin/plugin.json`, `mcp.json`, and Cursor hook format | Use the local plugin flow, or folder discovery under `~/.cursor/plugins/local/mini-mad-cat`; restart and verify loaded components. |
| Grok Build | Claude-compatible `.claude-plugin/plugin.json` and Grok hooks | Install the generated directory under the selected `.grok/plugins/` location or add it to the client's configured plugin paths. |

These formats follow [OpenAI's plugin packaging guide](https://developers.openai.com/plugins/build/plugins), [Claude Code's manifest reference](https://code.claude.com/docs/en/plugins-reference), [Cursor's plugin reference](https://cursor.com/docs/reference/plugins) and [extension API reference](https://cursor.com/docs/extension-api), and [Grok Build's plugin guide](https://docs.x.ai/build/features/skills-plugins-marketplaces). Client-specific end-to-end installation remains a target-machine check.

After generating the Codex adapter, a user-authorized local install can run:

```sh
codex plugin marketplace add /ABS/BUNDLE/generated-native
codex plugin add mini-mad-cat@mini-mad-cat-local
```

Start a fresh session and inspect its MCP tools and hook trust state. These commands change the selected Codex installation; wrapper generation alone does not. The selector syntax was checked against the local Codex 0.170.0 CLI help.

The standard `${PLUGIN_ROOT}` variable is not expanded by Cursor. Cursor documents `${CURSOR_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` instead. Claude Code documents `${CLAUDE_PLUGIN_ROOT}`; Codex plugin hooks receive `PLUGIN_ROOT` and compatibility aliases, and Grok hooks receive `GROK_PLUGIN_ROOT` and Claude aliases. Generated wrappers avoid this difference by resolving installed absolute paths. They do not write mutable runtime state inside a plugin cache.

## Chat events and their meaning

`bridge/hook.cjs HOST` reads a host event from stdin and forwards a small normalized event to `bridge/event.cjs`. It does not read a transcript, analyze sentiment, monitor other chats, or forward prompt/tool text. Its stdout is always an empty JSON object; failures and a closed companion do not block the agent. Its bounded child call is limited to 1.2 seconds. Pet-control tools are ignored to prevent reactions to the companion's own calls.

| Source signal | Reaction meaning |
| --- | --- |
| Session started | Small greeting acknowledgement. |
| Turn/response ended | Small, low-confidence acknowledgement. This does not establish that a task or its tests succeeded. |
| Structured tool failure | Modest failure reaction; a recoverable tool error is not a failed overall task. |
| API/turn failure | Stronger error signal when the host explicitly reports it. |
| Permission denial or interruption | Blocked/partial reaction, not a verdict about user behavior. |
| Agent's explicit `pet_react` call | Weighted task outcome based on the agent's actual evidence. |

The bundled configs use only published events: local Codex uses `SessionStart`, `Stop`, `PostToolUse`, `PostModelRequest`, and `Interrupt`; Claude Code uses `SessionStart`, `Stop`, `StopFailure`, and `PostToolUseFailure`; Cursor uses `sessionStart`, `stop`, and `postToolUseFailure`; Grok Build uses its documented Claude-style events. Codex's released hook reference does not list a separate `PostToolUseFailure` event. [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Claude Code hooks](https://code.claude.com/docs/en/hooks), [Cursor hooks](https://cursor.com/docs/hooks), [Grok Build hooks](https://docs.x.ai/build/features/hooks).

Codex requires non-managed hooks to be reviewed and trusted; inspect `/hooks`. Grok project hooks also require the client's trust flow. Follow the client's actual review UI, without disabling or bypassing its trust controls. Hook availability differs for local and cloud orchestration. A cloud hook cannot automatically control a personal desktop on another computer.

## Claude Desktop and Grok Bot

The Claude Desktop MCP configuration in `INTEGRATIONS.md` supports explicit agent tool calls. The Claude Code adapter is for Claude Code sessions, including its documented desktop surface; do not install it as a claimed observer of every Claude Desktop conversation.

Grok Bot is a separate hosted product. Its published custom MCP/API capability does not establish an automatic local chat lifecycle plugin format. Use explicit calls from an approved integration or a deliberate authenticated relay; this bundle does not scrape or intercept its conversations.

## Validation scope

The Claude-compatible manifest templates passed the installed `claude plugin validate` command (Claude Code 2.1.330). That checks manifest/component loading, not actual overlay delivery or marketplace admission. Public directory submission can impose additional README, licensing, icon, policy, and scanning requirements. Generated wrappers and hook behavior must be tested on the chosen host before reporting that host installation complete.
