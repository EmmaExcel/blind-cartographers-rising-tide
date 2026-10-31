# Blind Cartographers: Rising Tide · 3D Expedition Edition

Version 2.0 adds a real Three.js island, original articulated 3D explorers, animated stepping, tide movement, treasure, traps, route markers, top-down camera and crew close-up. The game interface has been rebuilt for desktop and phones. No accounts, keys or external asset services are required.

Public deployment still needs a Git provider repository and confirmed Render workspace. No public URL has been created. Express + Socket.IO, plain HTML/CSS/JS with Three.js served locally, one process, no database.

## Run locally

Install Node.js 22 or newer. From this folder:

```sh
npm ci
npm test
npm start
```

Open http://localhost:3000. Health: http://localhost:3000/health.
The server listens on `0.0.0.0` and `process.env.PORT || 3000`.
For phone testing on the same Wi-Fi, open `http://YOUR_COMPUTER_LAN_IP:3000`.

## Three-tab test, normal + two Incognito tabs

1. In a normal tab, open localhost:3000, enter Ada, create a room. Note the four letters.
2. Open two Incognito tabs at the same address. Join as Ben and Cal using the code. Names are case-insensitive and unique.
3. Press Ready in all three tabs. Ada presses Start expedition.
4. Confirm the same turn, lives, countdown and Navigator. Compare private clues: Ada knows the treasure row and column A; Ben knows row 1 and column B; Cal knows row 2 and column C.
5. The 3D scene shows only your own clues, public visited cells and the expedition. Unknown cells remain slate gray. During Step, tap an outlined tile, then select Take this step. This two-part input prevents accidental movement. The Open flat chart button provides equivalent accessible controls. Top view changes the camera, and Meet the crew shows the animated explorers up close.
6. Send three emoji as Ada during Signal. Confirm all tabs receive them. A fourth signal is disabled and rejected server-side if sent manually.
7. Wait for Step. Confirm only Ada has enabled adjacent cells. Use the flat chart for an immediate tap, or select and confirm on the island. All tabs advance to turn 2 with Ben as Navigator. Double taps must not advance a second turn.
8. Let Ben's Step timer expire. The expedition stays put, water rises, and Cal becomes Navigator.
9. Choose known traps when reachable. Each costs one life and raises water two rows. Wait turns to reach a flood loss. Confirm full maps match on every end screen.
10. After GameOver, the host selects Play again. Ready up and start a fresh map to test a win. Navigate upward along column A with at most one right step toward the treasure identified by Ada. Use private clues to avoid traps. The generator guarantees a safe route, though not necessarily straight up column A. Treasure arrival wins before the flood rises.
11. Check a duplicate name, an unknown code, a seventh player, and host start before a second player joins. Each shows a friendly error.
12. Leave as the host. Confirm a remaining player inherits hosting. During play, fewer than two remaining players ends the expedition.
13. Refresh during play. Your role, clues, emoji allowance and ballot return. Disconnect for under 60 seconds to reclaim your seat. After 60 seconds the seat expires. If the host disconnects, hosting transfers immediately. A departing Saboteur gives the crew a win.

Reconnect credentials live in sessionStorage, separately per tab. Sound and tutorial preferences use localStorage. Duplicating an existing tab might copy its credential, so use new blank tabs to join as distinct players. A credential permits one active connection only.

## Automated checks

`npm test` runs map, rules, privacy and three-client socket integration tests.
It tests 1,000 generated routes and 50 complete winning routes, turn expiry, traps, loss, emoji limits, stale/late actions, non-Navigator actions and repeated taps.

Browser check on Linux uses the packaged Chromium development dependency. On other platforms, install a compatible Chromium and set CHROMIUM_PATH to its executable:

```sh
npm run test:browser
npm run test:world
# macOS example:
# CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:browser
```

The script opens four isolated browser contexts at 375 × 812, tests the tutorial and shared room, checks overflow and the 49-cell grid, sends an emoji, navigates, restores the Saboteur after refresh, votes correctly, checks the reveal and returns to Lobby. It uses short test-only deadlines. Normal games retain 15s Signal and 10s Step. One browser deliberately disables WebGL to verify fallback. The separate `test:world` script tests actual canvas raycasting, tile selection, confirmation, shared turn progression, crew close-up and top-down camera. These are browser interactions, not simulated renderer calls.

Preview screenshots are written to a temporary directory. Set ARTIFACT_DIR to choose a local output folder. Run `node scripts/visual-check.cjs` for desktop/mobile landing screenshots.

All 14 Node/socket tests, the four-player browser check and the 3D interaction check passed in the build environment. Level 1 also passed the user’s local check. Sound/vibration depends on browser support and user activation. Public deployment and real remote-device smoke testing are still outstanding.

## Rules fixed by the approved plan

Rows are 1–7 from bottom to top. A1 is the start. Treasure lies in row 6 or 7. Maps reserve a short safe route whose move count beats or ties the flood deadline. A win resolves before flooding. Water blocks future entry into flooded cells, but reaching the expedition position causes no extra damage. Traps consume one life and add one extra flood row. Orthogonal moves and revisits are allowed. Visited terrain becomes public.

No full-map data is sent in public snapshots until GameOver. Each private snapshot contains only its recipient's row/column cells. Hidden map generation runs only on the server. Actions are phase-, version-, turn-, deadline- and membership-checked. The first accepted navigation changes the phase synchronously, rejecting duplicate taps. Fixed emoji IDs prevent arbitrary text chat. Names are rendered with textContent.

## Deployment: Render Free

1. Push this folder as the root of a Git repository.
2. Create a Render Web Service connected to that repository.
3. Choose Node and the Free instance plan.
4. Build command: `npm ci`.
5. Start command: `npm start`.
6. Environment: `NODE_ENV=production` and `NODE_VERSION=22`.
7. Health check path: `/health`.
8. Keep a single instance. Let Render supply PORT, normally 10000. The same HTTP server handles Socket.IO.
9. Deploy and open the assigned `https://SERVICE.onrender.com` URL.
10. Verify /health and join from a laptop and a phone on mobile data.

`render.yaml` contains matching settings. No app API keys or database are required. Hosting account access is required to publish.

Free Render services sleep after 15 minutes without inbound traffic and take about a minute to wake. Restarts, deploys and sleep erase all rooms. No public deployment has been made from this build environment.

## Extra test scenarios

With 4–6 players, test a correct accusation, a wrong accusation, a tie and a timed-out vote. Ballots stay secret until GameOver. A wrong target becomes a spectator and loses signaling, navigation and voting controls. Verify their private clues still appear after refreshing. A vote pauses the current phase without resetting the emoji allowance.

The tide animates with reduced-motion support. Sound and vibration start muted and require opt-in. The host’s Play again button returns everyone to Lobby with roles, clues and readiness reset.

The server implements Lobby, Signal, Step, Vote, Resolving and GameOver. Public lobby lists are scoped to room membership. Logs contain room code, phase and turn, not map contents or private clues.


## 3D performance and privacy

Three.js loads from this server, without a CDN. Characters and scenery use original procedural geometry, with no downloaded character models. A fixed camera and raycast selection drive turn-based actions, without physics or real-time movement messages. Animation is cosmetic and follows authoritative path updates. Pixel ratio is capped at 1.5, animation is capped near 30 fps, and rendering pauses when the island is offscreen or the tab is hidden. Small screens use lower-resolution shadows. Reduced-motion preferences stop idle animation and use immediate movement.

The renderer accepts the same sanitized public/private view as the flat chart. It has no route to the server's hidden map. The landing scene is a fixed decorative demo, not a playable map. WebGL failure opens the flat chart automatically. Browser tests use software rendering, so physical-phone GPU performance still needs a real-device check.

See DEMO.md for a submission walkthrough and THIRD_PARTY_NOTICES.md for dependency attribution.
