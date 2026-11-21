# Validation record

## Version 1.0.3

- The two side-walk rows use a short link from hip to rear knee and a longer link forward from knee to ankle. The wider steps keep both feet readable at a glance. The original Mini Mad Cat sprites were redrawn using geometry from [Piranha Games’ Timber Wolf Prime side elevation](https://image.api.playstation.com/vulcan/ap/rnd/202409/0501/f46d892693128c49e45094190199b6e1c0ea2c0071caf079.jpg).
- The replacement changes exactly 16 walk frames. The other 41 animation frames, 16 torso-aim poses, and all transparent padding are pixel-identical to v1.0.2. Each left walk frame exactly mirrors the matching right walk frame, with the original timing and order.

## Version 1.0.2

- On Windows, 33 unit tests passed and three platform-specific tests skipped. All four artwork files matched their recorded SHA-256 values and dimensions.
- The desktop Electron renderer exercised click-to-track at 100% and 150% scale, multiple stationary torso directions, expiry at 10 seconds, both directional gaits, upward thrust, the downward crouch hold, manual reaction priority, and reduced motion. The input probe used an isolated cursor simulation.
- The regenerated core atlas keeps the original Codex idle pixels and six other original animation rows. Each of the 16 torso-aim poses keeps its foot centers within 2.5 px of the approved forward stance. The Pets structural preflight passed all 73 cells. Its separate silhouette heuristic flagged the intentional space between the planted legs. An independent alpha flood fill confirmed every flagged pixel was connected to the outside of its cell.
- In live Windows client tests, Claude Desktop and Cursor sent successful missile reactions and failure knockdown/recovery reactions to the companion. macOS, Windows and Linux run the automated suite in CI. The macOS desktop UI still needs a live host check.

## Version 1.0.0

Checked November 20, 2026, on Windows with Node 24.14.0 and Electron 45.4.1.

### Executed checks

- Locked dependency installation completed. First Electron launch also downloads its platform binary when needed; installation and first launch require network access.
- `npm test`: **12 tests passed**, covering frame geometry/timing, one-shot recovery, reaction weights/cooldown/reduced motion, MCP discovery, command validation, loopback authentication, and native hook/wrapper integration.
- `node native/validate.cjs`: **3 maintained native integration tests passed**, also included in the main suite. Test fixtures exercise paths containing spaces, apostrophes, dollar signs, backticks, and ampersands.
- `npm run check:art`: both sprite atlases matched their dimensions and recorded SHA-256 values.
- `npm run test:gui`: **4 cases passed**, with 24 captures of the actual Electron renderer: high success/missiles, medium success/laser, failure/fall/recovery, and reduced motion. Calls used the actual MCP and authenticated local bridge. The temporary reaction cleared after recovery, and test processes exited.
- The hidden-window test uses Electron offscreen rendering for reliable captures. The normal companion uses a regular transparent window. Pixel checks confirm real artwork and transparent background in the captures.
- Claude-compatible generated wrappers passed `claude plugin validate --strict` on Claude Code 2.1.330; the missing optional directory icon was a warning. This is component validation, not marketplace admission or installation in every host.

### Artwork checks

The final core PNG is 1536×2288 RGBA, 2,705,382 bytes, with 73 populated v2 cells and 15 unused transparent cells. It passed the bundled Pets structural and quality scripts, state inspection, chroma cleanup, direction continuity review, three isolated blind direction reviews, and the Pets MCP service preflight. The jump lifts 60 pixels and returns to the idle baseline. The failure row visibly falls, braces, kneels, and stands again.

Core SHA-256:

```text
602f46b75ecdb6137d3660f24ceb4778065cf5dabb16ff7eaec5485dd89c8b56
```

The separate generated laser/missile/explosion atlas is 768×624 with twelve populated 192×208 cells.

FX SHA-256:

```text
d6bd6f782e61f84162d71e7fb7a260ef8db175db973264a603d662f300486f43
```

The final direction review accepted small near-cardinal aiming subtleties and minor continuity metrics after inspection; it has no failed cardinal or structural gate. Source geometry revisions and generation prompts are preserved in the artwork source archive.

### Scope

Windows rendering, local MCP delivery, reaction recovery, authentication, and reduced-motion behavior were exercised. The test did not move or click the user's cursor. Native dragging, tray/right-click interaction, real pointer following, multi-monitor interaction, and macOS/Linux desktop behavior still need target-machine verification. Direction and position calculations are unit tested.

The CI workflow runs Node tests and asset integrity checks on Windows, macOS, and Linux. Its live results are available in the repository's Actions tab. CI does not exercise those systems' graphical desktops.

No global agent configuration, startup service, or public network relay was installed by these checks. The runtime uses same-user loopback control; the native wrappers require the target host's ordinary trust/installation flow.
