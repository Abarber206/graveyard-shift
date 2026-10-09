# GRAVEYARD SHIFT

**Play it now:** https://abarber206.github.io/graveyard-shift/ (or download `share/GraveyardShift.html` and double-click it)

A co-op salvage horror game. You and your crew work the night shift for **Mercy Salvage Co.**: land at abandoned sites, go down into dark procedurally generated facilities, haul scrap back to the ship before midnight, and sell it to meet the profit quota. Miss the quota and you're fired.

Single player, or online co-op with up to 6 players (room codes, no port forwarding). Paint your robot any colour you like on the colour wheel before you start.

---

## How to play it

**Easiest:** double-click **`share/GraveyardShift.html`**. That one file is the whole game. It opens in your browser (Chrome, Edge or Firefox) with no install and no server.

**Also works:** double-click `Play.bat`, which runs the development copy (`index.html` + `js/`) through a tiny local server.

You need an internet connection: the 3D engine, the fonts and the multiplayer matchmaking load from public CDNs.

Use **headphones** and play in a **dark room**. All the audio is positional, and a lot of the danger is something you hear before you see it.

## On a phone or tablet

Open the play link on your phone and turn it sideways. Touch controls come up by themselves:

- **Left thumb:** a thumbstick appears wherever you put it down. Push gently to walk slowly, and past the rim to sprint.
- **Right side:** drag anywhere to look around.
- **Buttons under your right thumb:** JUMP (the big one), USE just above it (hold it to talk on a walkie-talkie), **E** to interact (it lights up when there's something to use), CROUCH (stays on until you tap it again), SCAN, LIGHT and DROP.
- **Hotbar:** tap a slot to hold what's in it. II pauses and CHAT opens the chat.

To **install it** like an app: on Android, use INSTALL APP in the main menu (or *Add to Home screen* in Chrome's menu). On iPhone or iPad, tap Share, then *Add to Home Screen*. It then opens full screen and in landscape, and once it has loaded it also works offline in single player.

Phones start with a lighter picture (lower resolution, no flashlight shadows), which you can turn up in *Settings*. *Settings → Touch controls* can also force the touch controls on or off (on a touchscreen laptop, say).

## Playing with friends

1. One person picks **HOST ONLINE GAME → NEW RUN**. They get a 5-letter lobby code, shown top-right and in the **Esc** menu, with copy buttons.
2. Friends pick **JOIN ONLINE GAME** and type or paste the code. They can join any time; if a round is already underway they spectate until the ship returns to orbit.

No port forwarding or accounts are needed. Connections are peer-to-peer (WebRTC) through the free public PeerJS matchmaking server, with relay servers as a fallback for strict networks. The host's browser runs the world, so whoever has the best connection should host. Up to 6 crew.

The host can alt-tab (to Discord, say) without freezing the game for everyone: the world keeps running while the host's tab is in the background.

## Sharing the game

Everyone needs a copy of the game, and everyone should have the same version. Pick one:

### Send the file (simplest)
Send friends **`share/GraveyardShift.html`** (about 750 KB) over Discord, Google Drive, a USB stick, anything. They double-click it, choose **JOIN ONLINE GAME** and enter your code. Some email services block `.html` attachments; send `share/GraveyardShift-web.zip` instead (unzip, then open `index.html`).

### Put it online (one link, invite links work)
Once the game has a web address, friends don't need any files: they open the link. From a hosted copy, **Esc → COPY INVITE LINK** gives a link like `https://your-site/?join=ABCDE`. Opening it lands straight on the join screen with the code filled in.

- **itch.io** (made for browser games): create a free account → *Upload new project* → *Kind of project: HTML* → upload `share/GraveyardShift-web.zip` → tick *This file will be played in the browser* → set the viewport to 1280 × 720 and enable the *Fullscreen button*. Save it as Public, or as Restricted/Draft to keep it to people with the link.
- **Netlify Drop**: open app.netlify.com/drop and drag the **`share/web`** folder onto the page. You get a URL right away; sign in (free) so the site stays up.
- **GitHub Pages**: make a repository, upload `share/web/index.html`, then *Settings → Pages → Deploy from a branch*.

### Updating
If you change the code (`index.html`, `css/`, `js/`), double-click **`Build.bat`** to regenerate everything in `share/`, then send friends the new file (or re-upload it). Everyone in a lobby should be on the same version.

**Proximity voice chat:** turn on *Settings → Voice chat* to use it. You hear crewmates from their position in the world. Walkie-talkies carry your voice to anyone else carrying one (hold left click to transmit). Dead players can still listen in, but the living can't hear them. Sound you make, including your voice, attracts things outside.

**Text chat (T or Enter)** works the same way. What you type is said out loud: it bobs over your head and only reaches crewmates within earshot (about 20 m). Holding a walkie-talkie, you send it over the radio instead: the words bounce up in green over every other walkie-talkie, whether it's in someone's hand or lying in the grass, so anyone near one sees it.

## The job

- Each quota period lasts **3 days**. The first quota is **$300**, and each one after is bigger. Pull the **lever** to land at the routed site. The ship swings its nose round onto the world, burns out of orbit and dives straight at it from wherever its orbit had it (close in or far out): the planet holds still in the windshield and swells until it fills it, mountain ranges, cloud banks and their shadows sharpening the whole way down, then the ship hits the air: burning plasma streams past the glass and the cabin glows with it, in the colour of that world's sky (red over the Hollow, green over Kessler). At the worst of it armoured **blast shutters** slam down over every window and the power dips, the cabin lights dying to a glow for a moment. When they flicker back and the shutters grind open again you're in the cloud over the site, and the ship flies itself straight down to the landing spot: a powered descent, gear down, touchdown, ramp out, hatch open. Leaving, it spools up for a few seconds (last chance to run for it), lifts off, noses up and climbs away into the cloud; the shutters come down for the burn out of the air and open on space. Outside mist never follows you aboard; the cabin air clears within a few seconds.
- Routing to another site (`ROUTE <site>`) makes a **hyperjump**: the drive winds up and, going that fast, space itself tears open ahead of the nose: a hairline crack that rips wide, white-hot along its edges. The ship punches through the rip, space bends and stretches round the cabin while rings of light and streaking starlight rush past, and it bursts out the far side nose-on to the new world as it swells up out of the dark, then eases round into orbit.
- The ship, the MS-7 "Last Call", is a long, smooth dropship, about 29 m nose to tail: one rounded hull wrapped round the bay and the flight deck, a full airliner-style nose with its windshield split into panes, big swept wings set high on the shoulders with lit winglets, a V-tail, and three engine bells in the end of an upswept tail. On the ground it stands on four legs that fold up into its belly, with a ramp that runs out from under the hatch to the ground.
- The ship has an **airlock**. The outer hatch is the real door; the inner door seals the lock off from the cabin. The hatch can be opened in the air while the ship is low, to look out. It shuts itself when the ship climbs past about 40 m, and nobody can step out in flight.
- **Sit** in the cockpit seats or the jump seats in the bay (E). You stay in your seat through landing, takeoff and the climb back to orbit.
- The bay is home: padded insulation on the walls, a perforated ceiling, worn deck plates, the Company's posters, a coffee machine, a pegboard missing half its tools, and a wall clock that keeps the site's time while you're down there (and the real time in orbit).
- The main screen in the bay shows **crew cams**: one slice per crewmate (halves, thirds and so on), with where they are, their facility level, and "NO LIFE SIGNS" if they're dead. The ◀ ▶ buttons under it page on to a **map** that follows each crewmate in turn: the walls, doors, stairwells and blast doors of the level they're on, seen from above, with everyone on it. **RADAR** sweeps around whoever the map follows and marks any creature it crosses. The screen belongs to the ship: everyone sees what anyone last put on it, and it stays on that view (saved with the run).
- Find the facility entrance (press **right click** to scan; the scan marks the ship and entrances outside, and scrap and its value inside). Scanning also outlines creatures in red and names them.
- Facilities go **down**. Stairwells (two or three a site) lead off the ground floor: tall rusted shafts with switchback steel flights, dim failing lamps on the landings and vines hanging the height of the well. The bigger sites go two levels deep, with one stairwell reaching every floor. Each level down is darker, more of its lights are dead or failing, and it's further gone: water down the walls, standing water, moss, trailing vines, fallen ceiling panels, rubble.
- Some corridors are cut by **blast doors**, each stencilled with a code (also shown on the map). Nothing inside can move them: type the code at the ship's terminal to raise the door, or drop it again (monsters can't get through one either). There's always another way round, but it may be a long one. The lower levels were never stripped, so scrap there is worth more. The facility's core is always on the deepest level.
- The scanner sends a pulse rolling out over everything around you. Each find is marked the moment the wave reaches it. It reads what's in the open and line of sight; through a wall only at very close range.
- Scrap is where it would really be. Lab rooms hold flasks and specimen jars, machine rooms hold gears and engine parts, offices hold phones and registers, morgues hold personal effects. What the site was (a mill, a biolab, a pumping station) tilts it further. It's tucked away: against walls, behind crates, under desks, on shelves. Rooms nearest the entrance were picked over long ago.
- **Gift boxes** turn up in every facility, lying about or shut in lockers. One is worth a little as it is; open it (left click) and you might find a wad of cash, something valuable, a tool, a snack, or a doll's head. Once in a while there's a charge inside with its fuse already burning: throw it (left click) or drop it (G) and run.
- Kill a creature and you'll know it: it collapses, twitches a few times and goes still, its colour drains away, and a dark pool spreads underneath. The scanner marks bodies **DEAD** in grey.
- **Search lockers and cabinets** (E). Whatever is inside is invisible to the scanner apart from a faint "SIGNAL" when you're right next to it. Opening them is noisy.
- Doors swing away from whoever pushes them, and an open door is solid.
- Each site is its own world. Ashgrove is rolling dead-autumn hills around a brick textile mill. Kessler is a drowned marsh of reeds, standing water and moss-hung trees around a white-clad quarantined biolab, with fireflies after dark. Nadir is a red-rock canyon of stepped mesas and spires, with pipelines running off from a rusted pumping station. The Hollow is a cratered ash waste under a red sky, with a blackened ruin and something very large lying dead in the field.
- Each site has its own creatures (the terminal's `SITES` command lists what has been sighted where). Ashgrove Mill has mannequins, crawlers and leeches. Kessler Biolab has escaped specimens and the odd Pale. Nadir Station has crawlers and the Pale. The Hollow has all of them. You never face a pack of the same thing: at most one of each big creature and two of the small ones, with a cap on how many are inside at once.
- Carry scrap back and drop it inside the ship. Most of it is junk worth a few dollars; a real find is rare. The ship **leaves at midnight**, and anyone not aboard is left behind. Pulling the lever with crew still outside warns you once; pull it again to leave them. Anyone it leaves behind, alive or dead, gets one last look: the view starts on them (or their body), flies the quickest way out of the facility and across the ground, faster the farther it has to come, and settles to watch the ship climb away into the sky without them.
- Sell from orbit at the **terminal** (`SELL`). The Company pays more as the deadline gets closer (50% → 70% → 85% → 100%).
- On the deadline, pull the lever to submit. Make the quota and a bigger one follows; miss it and you're terminated.
- Spend credits at the terminal (`STORE`, `BUY <item>`) on flashlights, shovels, stun grenades, walkie-talkies, a motion tracker, snacks, and ship upgrades. Riskier sites (`SITES`, `ROUTE <site>`) pay much better.
- **Deliveries:** bought in orbit, a delivery drone flies out to the ship. The lock seals, the hatch opens, the drone flies in, sets your order down in the airlock and leaves, then the lock repressurises and the inner door opens. Bought on a site, give it a few seconds: a glint shows high in the sky, then a supply pod falls out of it and slams in near the ship, leaving a crater. Open it (E) to get your order.
- **Snacks and drinks** are sold in the store and found in lockers and cabinets. Eat or drink one (left click) for stamina back and a perk: longer sprints, faster recovery, sharper eyes, steadier hands, or some health back. Mystery cans can go either way.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Shift | Sprint |
| C (hold) | Crouch (quieter) |
| Space | Jump |
| E | Interact / pick up / sit / mash to escape |
| Left click | Use held item |
| Right click | Scan |
| F | Toggle flashlight |
| G | Drop held item |
| 1–5 / mouse wheel | Switch inventory slot |
| T / Enter | Chat |
| V | Push-to-talk (if enabled in settings) |
| Esc | Pause / settings |

## Field notes

The terminal's `BESTIARY` command has notes on each creature. Short version: **listen, look up, don't stare, and keep the hatch shut after dark.**

## Files

- `share/GraveyardShift.html`: the whole game in one file, for playing and sending to friends.
- `share/web/index.html` and `share/GraveyardShift-web.zip`: the same file, packaged for web hosts.
- `index.html`, `css/`, `js/`: the source. Everything (models, textures, sounds) is generated in code; there are no asset files.
- `Build.bat` + `build.ps1`: rebuild `share/` from the source.
- `Play.bat` + `serve.ps1`: run the source through a local server.
- `tools/build.mjs`, `tools/serve.mjs` (`npm run build`, `npm run serve`): the same two for Mac, Linux or a cloud machine with Node.js.
- `manifest.webmanifest`, `sw.js`, `icons/`: what lets the hosted game install as an app and run offline.
- `CLAUDE.md`: notes for anyone (or any Claude session) working on the code.
- Progress saves in your browser automatically whenever the ship is in orbit.
