# Graveyard Shift: notes for working on the code

A co-op salvage horror game (Lethal Company-like) that runs in the browser. Player-facing docs are in `README.md`.
Keep that file current when gameplay changes.

## Layout and running it

- `index.html` loads three.js r160 (import map, jsdelivr) and PeerJS (jsdelivr), then loads `js/*.js` in the order
  given by `const files = [...]` in its loader. There is no bundler and there are no npm dependencies.
- Every `js/*.js` file is a plain `'use strict'` script that defines globals (`G`, `R`, `TEX`, `MATS`, `Ship`,
  `Facility`, `Exterior`, `Avatar`, `Monster`, `HUD`, `Player`, `SFX`, `CrewCam`, `Rover`, `Net`...). There are no ES modules.
- To serve the dev copy, use the preview config `game` (Windows, `serve.ps1`) or `game-node` (`node tools/serve.mjs 8139`).
  Either way the game is at `http://localhost:8139/`.
- To build, run `node tools/build.mjs` (or `build.ps1` / `Build.bat` on Windows). It regenerates `share/GraveyardShift.html`
  (the whole game in one file), `share/web/index.html` and `share/GraveyardShift-web.zip`. Rebuild after every change;
  `share/` is what players download. No JS file may contain the text `</script` because the build inlines them.

## How it fits together

- **Networking is host-authoritative.**
  - `G.emit(ev)` applies an event locally (`G.events[ev.e]`) and broadcasts it to clients.
  - Clients ask through `G.request({ a: ... })`, which runs `G.hostRequest` on the host.
  - New shared state needs an event, plus a field in `fullState` / `applyFullState` for players who join mid-game.
  - Bump `PROTO` in `game.js` when the protocol changes.
- **Generation is seeded and deterministic.**
  - `Facility` (`facility.js`) and `Exterior` (`exterior.js`) are built from the round seed on every peer.
  - Any change to how they consume their RNG changes the layout. That's fine, because all peers run the same build.
  - Sites are staged over several frames (`G.stageSite` / `stepSite`) behind the landing shutters, and their shaders
    compile in the background (`R.precompile`).
- **Worlds, moons and bonus sites** (`game.js`).
  - `SITE_LOOK`, `SITES` and `BODIES` describe the worlds and what circles them.
  - A bonus site has `bonus` (its world), `biome` (`'moon'` / `'rock'`, the airless `BIOMES` in `exterior.js`) and `lowG`.
  - `G.signal(run)` picks the day's beacon; a hop (`'hop'` event / seq) moves between a world and its moon.
  - `site.sky` lists the bodies drawn in the sky over a site (`Exterior.buildSkyBodies`); `Ship.setBodies` hangs them
    round the world in orbit.
- **Coordinates.**
  - The ship's simulation stays at the origin. In flight, what's aboard is drawn through `G.shipM`/`G.shipQ` (the "carry").
  - The deck is at y = 0; landed, the ship stands on its legs over the pad at `SHIP.ground` (the whole site is built
    that far down). The outer hull is one loft (`hullSec` in `ship.js`) around the cabin; its openings are cut in its shader.
  - The facility sits below the surface (`FAC_Y0 = -120`, with each lower level a further `DROP` down). Zones are `'out'` and `'in'`.
- **Rendering** (`render.js`).
  - The space backdrop is a separate background pass.
  - Lights are "sources" fed to a fixed pool of point lights; never add `THREE` lights at runtime, because that recompiles shaders.
  - Fog, the scanner wave and the cabin fog-clearing are injected into three's shader chunks.
- **Assets are all procedural.**
  - Canvas textures live in `textures.js` (`TEX.get(name)`; `CQ` draws at double resolution; `TEX.normal()` derives relief).
  - Shared materials are `MATS.get(name)` / `MATS.rep` / `MATS.aged`.
  - Item models are in `items.js` (`ItemMeshes`), creatures in `monsters.js` (`MonModels`), the crew robot in `avatar.js`.
  - The ship is built in `ship.js` (`pb`/`pc`/`ps`/`pt` push geometry into material buckets, which are merged).
- **Touch** (`touch.js`) drives the same `Input` the keyboard and mouse do (`Input.analog` for the stick). On a touch
  screen, `Input.lock()` / `unlock()` just mean playing / not playing. The hosted copy installs as an app
  (`manifest.webmanifest`, `sw.js`, `icons/`).
- **Crew bots** (`bots.js`, chat `/add bot`): ordinary players with `p.bot`, no peer, steered on the host by `Bots.update`
  (after `hostTick`). They act only through `G.hostRequest` (pick, drop, door, box, hatch, idoor, struggle) and their
  position goes out in snapshots like anyone's. Outside they follow the ship's walkway (`SHIPWAY`) and the trail
  (`G.ext.path`), going round the hull where it stands over the trail; inside they path with `fac.findPath`.
- **Networking** (`net.js`): PeerJS for matchmaking. ICE uses STUN, plus whatever relay (TURN) is configured in
  `RELAYS` (static servers) or `RELAY_URL` (a link that hands out short-lived credentials as JSON). The free public relays
  it used (Open Relay's and PeerJS's) are gone, and no free relay works without an account, so it's empty until the
  user sets one up. `Net.test()` checks the server, a direct route and the relay from the device (TEST CONNECTION). A host that drops off the server (phones in the background) is re-listed under the same
  code by `keepListed`. Menus, the pause screen and the report fit the window via `fitToScreen` (two columns, then zoom).
- **Seeing vs passing.** `fac.los(ax, az, bx, bz, sight)`: with `sight`, a shut door's window (`door.pane`) lets the
  line through. Use it for anything about seeing or light (creature senses, `canSee`, the scanner, lamp culling via
  `fac.lampReach`); leave it off for anything about moving or sound (paths, throws, drops, occlusion).
- **Adding a world** takes an entry in `SITE_LOOK` (its colour from orbit; `rings` if it has them), `SITES`, `BODIES`
  (its moon and rock, each with a bonus site), `SITE_LOOT`; a biome in `BIOMES` (`exterior.js`: the land, sky, motes and
  `plant`, the kind of buildings, drawn in `buildComplex` / `buildPlantExtras`); and in `facility.js` a room mix in
  `THEME_W` and an interior `FINISH` (surfaces swapped per world, lamp colour). `SITES[k].murk` tints the dark inside.
- **Rings** (`Rings` in `exterior.js`) are ray-traced: one GLSL chunk shared by the sky over a moon (a dome round the eye)
  and the orbit view (a dome writing true depth), with the planet, moons and the ground as analytic spheres for hiding
  and shadowing, and `ringThrough` for the rings' shadow on surfaces. `ringsToday` gives the radii and lanes for a day.
- **Orbits are per day** (`orbitsToday`): the orbit view (`bodiesAround`) and each landing's sky (`G.skyToday`) read the
  same numbers, so they always agree.
- **The robot avatar** is modelled in rig units and drawn at `AV_SCALE` so its visor matches the 1.62 m eye height.

## Style

- Match the surrounding code: compact, with prose comments that describe what the player sees and why. Prefer editing
  existing systems to adding new ones.
- Gameplay text and HUD stay diegetic and sparse; the user dislikes immersion-breaking pop-ups.

## Testing in the preview browser

The browser won't grant pointer lock to automated clicks, so drive the game from JavaScript:

- **Start a run:** click `SINGLE PLAYER`, then `NEW RUN`. Keep the game unpaused with
  `setInterval(() => HUD.paused && Menu.pause(false), 200)` (and set `Input.locked = true` so the HUD isn't blocking).
- **Rover:** `G.hostTerminal(0, 'buy rover')`; drive by holding keys in `Input.keys` while stepping frames.
- **Moons:** to force a beacon, `G.signal = () => 'wick'`, then `G.hostTerminal(0, 'route wick')` to plot the course and
  `G.hostEngage()` to pull the jump lever (a 3.6 s hop). Routing to another world works the same way.
- **Move the player:** `Player.spawn(x, y, z, yaw)` (yaw: facing is `(-sin yaw, -cos yaw)`), then set `G.me().pitch`.
  Inside the facility, set `G.me().zone = 'in'` first.
- **Flights:** `G.hostLand()` lands at `G.run.route` (about 13 s until you're on site); `G.hostDepart('lever')` takes off.
- **Phone:** `resize_window` 740×360 emulates a touch device. If the pane is hidden, no frames run, so step by hand:
  `G.update(1/60); Touch.update(); Input.endFrame();`.
- **Errors:** add `window.addEventListener('error', ...)` and check the console. To measure hitches, wrap `G.update` / `R.render`.
