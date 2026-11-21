---
name: mini-mad-cat
description: Send meaningful task activity and outcome reactions to an enabled Mini Mad Cat desktop companion through its local MCP tools. Use when the user has enabled this companion or requests its chat-session reactions.
---

# Mini Mad Cat reactions

Support the user's main task with occasional companion events. The companion is a local desktop overlay; it does not inspect chat sessions on its own.

Discover the connected Mini Mad Cat tools and call `pet_status` once when needed. If the companion or bridge is unavailable, continue the user's task without repeatedly retrying, installing software, or changing configuration. Installation guidance is in the plugin's `AGENT_HANDOFF.md` and `INTEGRATIONS.md` when the user asks to install it.

Use `pet_animate` with `running` during sustained active work, `waiting` when a user response is required, and `review` while checking completed output. `running-left` and `running-right` are foot locomotion, not task processing. Keep gestures occasional; let the companion's cooldown handle bursts.

Send actual outcomes through `pet_react`:

- `success`: the requested result was completed and relevant checks support it.
- `failure`: a concrete operation failed; the mech plays one knockdown and recovery.
- `partial`: useful progress exists but the requested result remains incomplete or uncertain.
- `blocked`: progress requires a specific missing input or external change.

Include `impact`, `confidence`, and `severity` as numbers from 0 to 1 when useful. They control presentation intensity. Use observed checks and task consequences to choose them; do not imply the companion has independently measured correctness. A completed model turn or a passing tool call alone does not establish that the whole task succeeded. Preserve the user's chosen weighting and reaction preferences.

Example for a verified major completion:

```json
{"outcome":"success","impact":0.9,"confidence":0.95,"severity":0}
```

Prefer the built-in generic bubbles. An optional `message` is plain text, at most 96 characters. Do not forward prompts, transcripts, private code, credentials, or hidden reasoning to the companion. Automatic lifecycle hooks send coarse event state only; avoid reacting to the companion's own tool calls.

After a meaningful final result, report the outcome once and return to the main task. Honor reduced motion, disabled bubbles, and cooldown responses. Never expose the loopback token or create a public relay without a separate user request.
