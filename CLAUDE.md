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
  - The crew cams (`crewcam.js`) relight the scene for each crewmate's feed (`G.feedLight`: the facility's dark, the
    lamps near them via `R.lightsAt`, their flashlight), between `R.rig()` and `R.rig(true)`, which put your own view back.
  - Fog, the scanner wave and the cabin fog-clearing are injected into three's shader chunks.
  - Your hands and what they hold are drawn in their own scene (`vmScene`), lit each frame by `lightVM` from the world's
    own lights as they stand round the eye: the sky (kept out of the ship's cabin), the sun (`fx.sunlit`: out of it in
    the ship's shadow, `G.shipShades`) and the nearest of the lamp pool. Never give it fixed lights of its own.
  - Volumetric air (`Settings.volumetric`, off by default on touch devices): `R.vol` marches each pixel's ray through
    a density field (height fog, ground mist from the land's height map, cloud banks among the far hills, sun shadow
    map for light shafts) at half resolution, using the frame's depth texture, and post composites it. The outdoors sets
    its uniforms (`Exterior.update`) and `G.environment` turns it on outdoors only, zeroing the flat scene fog; when it's
    off, the flat fog, the ranges' own haze and the cloud cards (`buildClouds`) do the job instead.
  - Past the walkable land (players are kept within 160 m), `Exterior.buildRanges` rings the site with far hills drawn
    with their own haze: hidden below a fog-bank top worked out per direction from the land (`uTop`), coming out of it
    softly above. Keep it consistent with the scene fog when changing `lighting()`'s `fogDen` / `fog`.
- **Assets are all procedural.**
  - Canvas textures live in `textures.js` (`TEX.get(name)`; `CQ` draws at double resolution; `TEX.normal()` derives relief).
  - Shared materials are `MATS.get(name)` / `MATS.rep` / `MATS.aged`.
  - Flat-coloured materials wear a wear layer instead of a stretched texture: `MATS.wear(mat, { kind, k, bare, s, edge })`
    (sheets from `TEX.wear`: paint / metal / vinyl / rubber), looked up triplanar in the object's own space so it neither
    stretches nor slides in flight; `edge` rubs the paint off along box edges (from the faces' UVs). Copies made by
    `MATS.rep` / `MATS.aged` keep it.
  - Item models are in `items.js` (`ItemMeshes`), creatures in `monsters.js` (`MonModels`), the crew robot in `avatar.js`.
  - The ship is built in `ship.js` (`pb`/`pc`/`ps`/`pt` push geometry into material buckets, which are merged).
  - Sounds (`audio.js`) come from physical models, never bare oscillators (the user asked for nothing that sounds synth):
    `struck` (modal resonances set going by a `blow`; mode sets `BAR`, `BELL`, `GLASS`, `DRUM`, `plate()`), `fric`
    (stick-slip), `voice` / `growl` / `talk` (glottal pulses through formants), `buzz` (an armature slapping a diaphragm:
    horns, klaxons, motors, fans, ballasts), `piezo`, `bubble`, and `bowing` (a bowed string, for all the music). They're
    rendered into takes: `take(key, n, make, sr)` works out a fresh one the first n times, then picks among them; `smp`
    plays one. `prepare()` queues the heavy ones (the orbit chord, the chase stems, the stingers, the ambience beds via
    `bed()`) and a first take of every recipe as background jobs, a second of audio at a time. `LEVEL` sets each recipe's
    loudness; `SFX.render(name, o)` renders one offline for checking levels. Noise through filters (`nz`) is fine for air,
    hiss and rustle.
- **Particles** (`fx.js`): one pool of short-lived bits in two layers (glowing: sparks, embers; solid: dust, spray,
  grit), each drawn in one call as camera-facing cards stretched along their flight, with fog. `FX.emit(o)` throws them;
  `FX.step` / `FX.foot` (a foot coming down: dust, snow, ash, marsh mud, spray, facility grit), `FX.splash`, `FX.sparks`,
  `FX.embers`, `FX.grit`, `FX.puff` are the usual throws; `FX.onSound` adds what a networked sound throws off (blows on
  flesh or metal, a smashed door), so every peer sees the same. Solid bits take their light from `FX.lit` (time of day,
  lamps, the flashlight), since nothing lights them.
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
- **Gas giants** (`SITE_LOOK[k].giant`: the name of its face, `giant` / `giantJove` / `giantIce`, from `giantFace`, worked
  out a band of rows at a time) have no surface: `hostLand` refuses them and the lever says so. Their moons are bonus
  sites with `open` (no beacon, open every day, a direct jump from anywhere, a free hop between them: `routeProblem` /
  `isHop`), and `ground` tints their dust. No cloud shells (`setPlanet`'s `giant`, `uPdGas` in the planet shader, which
  adds fine streaks, `b.giant` in the sky and in `setBodies`); the ship orbits them low (`setOrbit`), their moons go round
  close and keep nearly round orbits (`orbitsToday`). Every giant has rings (`rings.map`: the profile, `rings`,
  `ringsDust` or `ringsThin`; `rings.col`: their own colour), so its sky and orbit views take the real-scale ring path.
- **Adding a world** takes an entry in `SITE_LOOK` (its colour from orbit; `rings` if it has them), `SITES`, `BODIES`
  (its moon and rock, each with a bonus site), `SITE_LOOT`; a biome in `BIOMES` (`exterior.js`: the land, sky, motes and
  `plant`, the kind of buildings, drawn in `buildComplex` / `buildPlantExtras`); and in `facility.js` a room mix in
  `THEME_W` and an interior `FINISH` (surfaces swapped per world, lamp colour). `SITES[k].murk` tints the dark inside.
- **Rings** (`Rings` in `exterior.js`) are ray-traced: one GLSL chunk shared by the sky over a moon (a dome round the eye)
  and the orbit view (a dome writing true depth), with the planet, moons and the ground as analytic spheres for hiding
  and shadowing, and `ringThrough` for the rings' shadow on surfaces. `ringsToday` gives the radii and lanes for a day.
- **Orbits are per day** (`orbitsToday`): the orbit view (`bodiesAround`) and each landing's sky (`G.skyToday`) read the
  same numbers, so they always agree. The orbit view draws moons nearer the world than they are, so their shadows are
  reckoned out along the line of sight at their real distance (`uLift` in `setBodies`), and they hide the rings without
  shadowing them (a negative radius in `uRingOcc`).
- **Coming down from orbit** (`updateSeq`'s `'land'`, timed by `ENTRY`; `Ship.orbit` with `S.glide`). The ship lines
  itself up to fly along its way down (`glideFrame`: the world below the nose, the horizon held a little above it). Its
  height follows `G.glideAlt` (on a log scale), and the world turns under it about `g.A`. `planGlide` picks that heading,
  and how far round to go, so it comes down into the morning, with the sun about `ENTRY.sunUp` up and not behind
  anything (`sunHidden`). When a moon is in its world's shadow, the sun slides out from behind it on the way down (`g.shQ`).
- **Leech nests** (`leechNest` / `buildNest` in `facility.js`): some days, on sites with leeches (`fac.nestK` from
  `SITES[k].mon.leech`), from the facility's own numbers off the seed. `fac.nest` holds the corner, the hit points up it
  (`spine`), the ceiling perches the brood keep to (`spots`), the crown burrows they pour out of (`holes`), hp, and
  `over` (it has taken the room: more hills in `cols`, the walls and ceiling skinned by `skin`). Each hill is one
  lathed, displaced mesh on its own breathing pivot; the burrows' glow is an unlit vertex-coloured material. The host
  seeds the watch (`hostNestBreed`), keeps the rest in `G.round.nestPool` and floods them out (`hostNestFlood`) when
  someone comes in or hits it (`m.home`: not counted against the site's cap); a shovel blow is a `'nest'` event, and
  `fullState` carries its hp.
- **Resting heights:** `fac.top(...)` registers the flat top of a prop (desk, bench, crate, drum, shelf, gurney); a
  drop lands on `fac.restY(x, z, handY)`.
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
