# Mini Mad Cat installation handoff

This bundle contains an animated miniature Mad Cat, a desktop overlay, a local controller, and an MCP stdio bridge. Read this file and the root README before installing. Preserve the included character artwork and animation manifest.

## Install on the target computer

1. Extract the complete archive into a stable application directory owned by the user. Keep the assets, runtime, bridge, package files, and documentation together.
2. Inspect `package.json`, `package-lock.json`, and the scripts before running them. Use Node.js 22 or newer and a compatible npm installation; check the package's `engines` field. Resolve the full Node executable path for GUI-launched MCP clients.
3. From the extracted root, install exactly the locked dependencies with `npm ci`, then run `npm test`. Do not copy another operating system's `node_modules` directory into this installation.
4. Start the overlay with `npm start` in the target graphical session. Verify the mech appears, follows or looks toward the actual pointer as configured, and can be paused and closed through its controls.
5. Choose the requested agent host and apply one configuration from `INTEGRATIONS.md`, substituting absolute paths, or generate the native adapter described in `NATIVE_PLUGIN.md`. Preserve unrelated configuration. Back up a configuration before merging an entry. Do not register both routes for the same host.
6. Restart that host's MCP connection, confirm the bridge's tools appear, and test a harmless animation change. Check that the actual overlay changes, then restore idle.

The archive itself does not edit global agent configuration, install startup services, or register public connectors. The companion uses an authenticated loopback endpoint for the local bridge; it does not expose a public network endpoint. A future installation agent should make only the configuration changes required for the host the user asked to install.

## Verify the outcome

- Check the local command/bridge status and the overlay independently. A running MCP process alone is not proof the desktop companion is visible.
- Test a greeting, one active-work state, and a return to idle. Test pointer directions on both sides of the pet and across connected monitors.
- Check that pointer pass-through and interactive controls behave as intended, and that pause/quit can recover the desktop.
- Record the OS, display server, Node/Electron versions, host-client version, checks run, and visible result. Report untested combinations honestly.

The source was developed on Windows. macOS and Linux are portability targets, with target-machine visual verification still required unless the bundled validation record says otherwise. On Linux, native Wayland restricts global cursor/window positioning; consult `INTEGRATIONS.md` for the X11/XWayland route.

## Agent behavior

The bridge exposes these tools:

| Tool | Arguments | Purpose |
| --- | --- | --- |
| `pet_status` | `{}` | Check the companion and its current state. |
| `pet_animate` | `{"state":"waving","durationMs":1800}` | Set one of the nine standard states temporarily; duration is 100–300000 ms, default 7000. |
| `pet_configure` | `{"followCursor":true,"trackingMode":"after-click","clickThrough":false,"scale":1,"reducedMotion":false,"contextBubbles":true}` | Update the supplied behavior options; scale is 0.5–2. Tracking modes are `always`, `after-click`, and `off`. |
| `pet_reset` | `{}` | Clear a temporary animation. |
| `pet_react` | `{"outcome":"success","impact":0.6,"confidence":0.95,"severity":0,"message":"Checks passed"}` | Send a weighted, evidence-based task outcome; the runtime chooses its animation/effect strength. |

The same controls work without MCP:

```sh
node bridge/control.cjs status
node bridge/control.cjs animate waving 1800
node bridge/control.cjs configure '{"followCursor":true}'
node bridge/control.cjs configure '{"trackingMode":"after-click","clickThrough":false}'
```

Use shell-appropriate quoting for JSON on Windows. The default is a stationary pet that looks toward the cursor; enabling `followCursor` makes it chase. The tray/right-click menu also offers animation, follow, click-through, scale, reset-position, and quit controls. Drag to reposition; double-click to wave. `MADCAT_HOME` optionally selects its per-user data directory. That directory contains a local authentication token and must not be copied into a handoff archive.

Use **Mouse tracking → 15 seconds after click** in the tray/right-click menu for interaction-triggered tracking. A primary click on visible mech artwork, or the end of an explicit drag, starts a fresh 15-second window. Both automatic gaze and optional chasing stop at expiry and the idle animation resumes. Hover, right-clicks, task reactions, and unrelated settings do not extend the window. Explicit dragging and transparent-area hit testing remain available while tracking is inactive. `always` preserves existing settings behavior, `off` disables automatic gaze/chase, and each restart clears timed permission. Keep `clickThrough:false` when the user wants to activate tracking by clicking the mech.

Select `running` for active work; `waiting` while a response is required; `review` when examining completed work; `failed` for a concrete error; and `idle` after activity ends. `running-right`/`running-left` are locomotion, not working. Greeting (`waving`) and jump (`jumping`) are short attention gestures. Do not repeatedly interrupt the user's work with decorative events.

Agent tool calls change the companion's state. Cursor following comes from the local runtime. This package does not grant an agent mouse-clicking, typing, screenshot capture, or access to other applications.

## Chat outcome behavior

After a meaningful task result, call `pet_react` with the outcome supported by the actual work. The required `outcome` is `success`, `failure`, `partial`, or `blocked`. Optional `impact`, `confidence`, and `severity` are numbers from 0 to 1; defaults are 0.5, 1, and 0.5 respectively. An optional `message` is at most 96 characters. Do not send unsupported keys or raw chat text.

Use `impact` for the importance of the result, `confidence` for the evidence behind the assessment, and `severity` for the seriousness of a failure. Small edits deserve small reactions; a completed milestone with meaningful passing checks can justify a stronger celebration. A recoverable tool error should not be presented as a failed overall task. Unfinished or unvalidated work is `partial`; a concrete dependency that prevents progress is `blocked`. Avoid giving every response maximum impact.

Examples:

```json
{"outcome":"success","impact":0.15,"confidence":1,"severity":0,"message":"Small fix verified"}
{"outcome":"success","impact":0.8,"confidence":0.95,"severity":0,"message":"Milestone checks passed"}
{"outcome":"failure","impact":0.3,"confidence":1,"severity":0.25,"message":"Check failed; investigating"}
{"outcome":"partial","impact":0.4,"confidence":0.7,"severity":0,"message":"Draft ready; validation remains"}
```

Use the user's reduced-motion and context-bubble preferences. The runtime applies a cooldown, so do not loop or retry decorative calls just to force an effect. A short generic message is sufficient; never include credentials, private conversation excerpts, or sensitive file contents in a desktop bubble.

Native lifecycle hooks only supply coarse signals. A turn ending does not prove task correctness, so their completion acknowledgements have low impact and confidence. The agent's explicit, evidence-based `pet_react` is the route for a meaningful weighted outcome. On Claude Desktop or Grok Bot without an installed lifecycle adapter, use explicit tool calls; do not claim to observe or intercept all conversations.

## Reuse and troubleshooting

Use the relative assets/manifest paths already shipped in the runtime. Preserve the exact sprite dimensions and cell layout when moving files. Keep the canonical artwork and creation/QA artifacts so another agent can reproduce or repair the animation.

If an MCP client reports a missing executable, use the resolved absolute Node path. If it starts the bridge but no pet appears, start the overlay in the same user's graphical session and check the shared local state location. If a hosted/cloud agent cannot reach the local companion, use an explicit authenticated relay designed for that environment; a loopback address is local to the process making the request.

Uninstall by removing this server's configuration entry, closing the overlay, and deleting the extracted application directory when the user requests removal. Preserve other MCP servers and do not recursively delete a computed path until its resolved target has been checked.
