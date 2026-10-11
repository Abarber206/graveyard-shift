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
There are no recordings and no synthesizer tones: every sound is worked out from how it's really made. Struck things ring the
way their shape and material do, hinges and trees creak by sticking and slipping, creatures have throats and mouths, drips are
bubbles, horns and klaxons are diaphragms being hammered, and the music is a section of bowed strings.

## On a phone or tablet

Open the play link on your phone and turn it sideways. Touch controls come up by themselves:

- **Left thumb:** a thumbstick appears wherever you put it down. Push gently to walk slowly, and past the rim to sprint.
- **Right side:** drag anywhere to look around.
- **Buttons under your right thumb:** JUMP (the big one), USE just above it (hold it to talk on a walkie-talkie), **E** to interact (it lights up when there's something to use), CROUCH (stays on until you tap it again), SCAN, LIGHT and DROP.
- **Hotbar:** tap a slot to hold what's in it. II pauses and CHAT opens the chat.

To **install it** like an app: on Android, use INSTALL APP in the main menu (or *Add to Home screen* in Chrome's menu). On iPhone or iPad, tap Share, then *Add to Home Screen*. It then opens full screen and in landscape, and once it has loaded it also works offline in single player.

Phones start with a lighter picture (lower resolution, no flashlight shadows, no volumetric fog), which you can turn up in *Settings*. **Volumetric fog** (OFF / LOW / HIGH: high by default on a computer; phones start with it off, and LOW is a lighter version made for them) draws the air as a real volume: ground mist lying in drifting patches, thinning as it rises, cloud banks among the far hills, and the sun coming through the trees in shafts; turned off, the outdoors uses a lighter flat mist and drifting cloud cards instead. *Settings → Touch controls* can also force the touch controls on or off (on a touchscreen laptop, say).

## Playing with friends

1. One person picks **HOST ONLINE GAME → NEW RUN**. They get a 5-letter lobby code, shown top-right and in the **Esc** menu, with copy buttons.
2. Friends pick **JOIN ONLINE GAME** and type or paste the code. They can join any time; if a round is already underway they spectate until the ship returns to orbit.

Crew bots (below) count toward the 6; a friend joining a full crew takes the place of the newest bot. No port forwarding or accounts are needed. Connections are peer-to-peer (WebRTC) through the free public PeerJS matchmaking server, with a relay server as a fallback for strict networks once one is set up (see below). The host's browser runs the world, so whoever has the best connection should host. Up to 6 crew.

The host can alt-tab (to Discord, say) without freezing the game for everyone: the world keeps running while the host's tab is in the background.

**On phones and mobile data.** Connections go straight between players when the networks allow it, which covers most home Wi-Fi. Two phones on mobile data (or behind strict Wi-Fi) usually can't reach each other directly and need a relay (TURN) server in between. The free public relays the game used have shut down and every relay now needs an account, so none is set up yet: add one in `js/net.js` (`RELAYS`, or `RELAY_URL` for a link that hands out credentials, such as Metered's). A phone pauses the game when it's in the background: the host should keep it on screen while friends join (if it was paused, the lobby comes back under the same code as soon as it's on screen again). If someone can't get in, both players tap **TEST CONNECTION** on the host or join screen: it checks the matchmaking server, a direct route and the relay from that phone's network, and says whether it can play online. If the game says you have different versions, both of you close it and open it again.

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

**Proximity voice chat:** set it up in *Settings → Voice & Mic*. Turn voice chat on, pick your microphone (and, in Chrome and Edge, your speakers or headphones), and choose open mic or push-to-talk (hold V, or the TALK button on a phone). Set your mic volume and the open-mic threshold, so you only go out while you're actually talking. Noise suppression can be turned off, and other players' voices have their own volume. **TEST MIC** shows your voice on a meter that lights up while the others would hear you, and **HEAR MYSELF** plays you back (use headphones). You hear crewmates from where they are, the way you would in real life:
- **Distance:** a voice gets quieter with distance and more echoey in the room you're in.
- **Facing:** it's duller and quieter from behind someone's back.
- **What's in the way:** it's muffled by facility walls and shut doors, by the floors between levels, and by the ship's hull (unless the hatch is open).
- **Vacuum:** out on an airless moon or rock there's no air to carry it, so outside you hear each other over the suit radios, which fade out past about a hundred metres.

**Walkie-talkies** carry your voice to anyone else carrying one, anywhere on the map. Hold left click (USE on a phone) to transmit. It keys your mic whether you're on open mic or push-to-talk, so you don't need V as well. Calls sound like a real handset:
- A click of the talk button and a burst of squelch as the channel opens.
- A narrow, crushed voice over a hiss that crackles and now and then breaks up.
- The squelch tail as they let go.

A typed message sent with a walkie-talkie in your hand (T, then Enter) comes out of every other set. Over a crewmate's set it bobs up above them; on the one in your own hand it rises out of the antenna, with newer calls stacking under older ones.

Dead players can still listen in, but the living can't hear them. Sound you make, including your voice, attracts things outside.

**Text chat (T or Enter)** works the same way. What you type is said out loud: it bobs over your head and only reaches crewmates within earshot (about 20 m). Holding a walkie-talkie, you send it over the radio instead: the words bounce up in green over every other walkie-talkie, whether it's in someone's hand or lying in the grass, so anyone near one sees it.

## The job

- Each quota period lasts **3 days**. The first quota is **$300**, and each one after is bigger. Pull the **lever** to land at the routed site. The ship swings its nose round until the world lies under it, then pushes the nose over and dives straight down into it with the engines roaring, from wherever its orbit had it (close in or far out). Dead ahead, the cloud breaks open over the site you're coming down on: the planet holds still in the windshield and swells until it fills it, mountain ranges, cloud banks and their shadows sharpening the whole way down, then the ship hits the air: burning plasma streams past the glass and the cabin glows with it, in the colour of that world's sky (red over the Hollow, green over Kessler). At the worst of it armoured **blast shutters** slam down over every window and the power dips, the cabin lights dying to a glow for a moment. When they flicker back and the shutters grind open again you're in the cloud over the site, and the ship flies itself straight down to the landing spot: a powered descent, gear down, touchdown, ramp out, hatch open. Leaving, it spools up for a few seconds (last chance to run for it), lifts off heavy and slow to a hover in a rolling bank of smoke and dust from its belly jets, the downwash flattening the grass and bending the trees, and noses up; then the main engines open up all at once. The blast lights up everything round it, rolls a gust out across the ground and a cloud of smoke after it, and burns a big black scorch into the ground where the flame hit, embers glowing in it and burning chunks flung all round it, smouldering for a while after. The ship streaks away into the cloud, leaving a smoke trail hanging in the sky; the shutters come down for the burn out of the air and open on space. Outside mist never follows you aboard; the cabin air clears within a few seconds.
- **Plotting a course.** `ROUTE <site>` at the terminal only plots the course (`ROUTE CANCEL` clears it); nothing moves until someone pulls the **JUMP lever** by the left seat in the cockpit. Its lamp glows green while a course is plotted, and the jump's cost is paid when the lever is pulled.
- Jumping to another site makes a **hyperjump**: the drive winds up and, going that fast, space itself tears open ahead of the nose: a hairline crack that rips wide, white-hot along its edges. The ship punches through the rip, streaks of starlight rush past and everything, the cabin too, is drawn out from the middle, more and more the further in, until it bursts out the far side nose-on to the new world as it swells up out of the dark, then eases round into orbit.
- The ship, the MS-7 "Last Call", is a long, smooth dropship, about 29 m nose to tail: one rounded hull wrapped round the bay and the flight deck, a full airliner-style nose with its windshield split into panes, big swept wings set high on the shoulders with lit winglets, a V-tail, and three engine bells in the end of an upswept tail. On the ground it stands on four legs that fold up into its belly, with a ramp that runs out from under the hatch to the ground.
- The ship has an **airlock**. The outer hatch is the real door; the inner door seals the lock off from the cabin. The hatch can be opened in the air while the ship is low, to look out. It shuts itself when the ship climbs past about 40 m, and nobody can step out in flight. A ladder in the airlock climbs up through a hatch to the **roof deck**, a railed platform on top of the ship: watch the site from up there, or ride the takeoff or the landing out in the wind and smoke. The hatch is open while the ship is on the ground or low with its shutters up; climbing away, a klaxon calls everyone down before it seals for space.
- **Sit** in the cockpit seats, the jump seats in the bay, or on the bench at the crew's table (E). You stay in your seat through landing, takeoff and the climb back to orbit. Seated, your body stays facing the way the seat does; crewmates see you turn your head to look round (and your shoulders, for a look behind).
- The bay is home: padded insulation on the walls, a perforated ceiling, worn deck plates, the Company's posters, a coffee machine, a pegboard missing half its tools, and a wall clock that keeps the site's time while you're down there (and the real time in orbit).
- The main screen in the bay shows **crew cams**: one slice per crewmate (halves, thirds and so on), with where they are, their facility level, and "NO LIFE SIGNS" if they're dead. Each feed is lit the way it is where that crewmate is: down in the facility you see its dark, the lamps near them and their own flashlight beam, not the daylight up by the ship. The ◀ ▶ buttons under it page on to a **map** that follows each crewmate in turn: the walls, doors, stairwells and blast doors of the level they're on, seen from above, with everyone on it. **RADAR** sweeps around whoever the map follows and marks any creature it crosses. The last page is the **ship cams**: its own cameras over the hatch looking down the ramp, on a tripod out ahead of the nose looking back at the hatch, on the tail, and one up in a corner of the bay, so whoever stays aboard can watch the crew come and go. They're live wherever the ship is: in space the outside ones show space and the world below, and until the ship is down on the surface (and the tripod set up) the camera on the spine over the cockpit, looking out past the nose, takes the tripod's place. The screen belongs to the ship: everyone sees what anyone last put on it, and it stays on that view (saved with the run).
- Find the facility entrance (press **right click** to scan; the scan marks the ship and entrances outside, and scrap and its value inside). Scanning also outlines creatures in red and names them.
- Facilities go **down**. Stairwells (two or three a site) lead off the ground floor: tall rusted shafts with switchback steel flights, dim failing lamps on the landings and vines hanging the height of the well. The bigger sites go two levels deep, with one stairwell reaching every floor. Each level down is darker, more of its lights are dead or failing, and it's further gone: water down the walls, standing water, moss, trailing vines, fallen ceiling panels, rubble.
- Some corridors are cut by **blast doors**, each stencilled with a code (also shown on the map). Nothing inside can move them: type the code at the ship's terminal to raise the door, or drop it again (monsters can't get through one either). There's always another way round, but it may be a long one. The lower levels were never stripped, so scrap there is worth more. The facility's core is always on the deepest level.
- The scanner sends a pulse rolling out over everything around you. Each find is marked the moment the wave reaches it. It reads what's in the open and line of sight; through a wall only at very close range.
- Scrap is where it would really be. Lab rooms hold flasks, specimen jars, test meters and circuit boards; machine rooms hold gears, engine parts, toolboxes and car batteries; offices hold phones, registers, typewriters, valve radios, desk globes and silver trophies; morgues hold personal effects (and the odd ram's skull or teddy bear). Lamps you find give light: a storm lantern, the candelabra (its candles light with a match), the fancy lamp. Right-click one in your hand to light it (on a phone, press use with nothing in front of you; facing a door, use opens the door). It lights the place for everyone, keeps going when the power's cut, and stays lit where you set it down. Something running you down brings in the chase: high wailing strings and a heart racing past two hundred a minute. Dropped things sound like what they're made of. With volumetric fog on, flashlight beams show in the facility's dusty air. Some of it does something if you use it: the radio hunts through the static, the old box camera's flash whines and pops, an extinguisher blasts, a teddy groans, and anything that makes a noise can be heard. What the site was (a mill, a biolab, a pumping station) tilts it further. It's tucked away: against walls, behind crates, under desks, on shelves. Rooms nearest the entrance were picked over long ago.
- **Gift boxes** turn up in every facility, lying about or shut in lockers. One is worth a little as it is; open it (left click) and you might find a wad of cash, something valuable, a tool, a snack, or a doll's head. Once in a while there's a charge inside with its fuse already burning: throw it (left click) or drop it (G) and run.
- Kill a creature and you'll know it: it collapses, twitches a few times and goes still, its colour drains away, and a dark pool spreads underneath. The scanner marks bodies **DEAD** in grey.
- **Search lockers and cabinets** (E). Whatever is inside is invisible to the scanner apart from a faint "SIGNAL" when you're right next to it. Opening them is noisy.
- Doors swing away from whoever pushes them, and an open door is solid. The handle takes a moment: the latch clicks, then the door swings (lockers and cabinets too). Every door has a vision panel at eye height, wired glass or a grille of bars: you can see through a shut door to the other side (and anything over there can see you), and a lamp beyond it throws a faint shaft of light through the window into the dark (in stripes, through bars).
- Each site is its own world, ten of them, from safe and free to deadly and dear. Ashgrove is rolling dead-autumn hills around a brick textile mill. Verdigris is a hothouse world of ferns and moss-hung trees around an overgrown hydroponic farm, glasshouses on its roof and vines up its walls. Kessler is a drowned marsh of reeds, standing water and moss-hung trees around a white-clad quarantined biolab, with fireflies after dark. Rimefall is an ice world, snow always coming down, around a pale-clad cold-storage depot hung with icicles. St. Agnes is a violet moor of heather and mist around an old brick sanatorium with a slate-spired clock tower, a chapel and a graveyard. Nadir is a red-rock canyon of stepped mesas and spires, with pipelines running off from a rusted pumping station. Brinewell is a drowned coast of mudflats and tidal pools around a sea-green shipyard, a gantry crane over its containers and a hulk run aground. Saltreach is a dead salt sea, flat and white to the horizon, around a refinery with gas spheres and a flare stack still burning. The Hollow is a cratered ash waste under a red sky, with a blackened ruin and something very large lying dead in the field. Vesper is a volcanic world of black basalt and drifting embers around a foundry whose stacks and furnace still glow, slag running off hot. Round every site the country goes on past where you can walk: nearer hills standing in the ground mist and the high ground behind, in that world's own shape (rolling ridges, terraced mesas, volcanoes over the ash, lone mesas on the flats, snowy peaks). The mist lies thickest on the ground and thins as it goes up, so on a fine day the peaks clear it and far-off things are grey shapes rather than gone; cloud hangs among the far hills to show how big they are; rain closes it in and greys a sunset, and a foggy day is a wall. Dead leaves, twigs, grit or ash lie in the grass by world; litter lies along the trail; puddles stand in the ruts after rain; crows wheel high overhead by day. Abandoned cars are a little different every time: a door hanging open, smashed headlights, a flat, and a wheel that's gone shows plainly (the corner up on a block with the brake drum bare and the tyre lying in the grass, or the car down on its drum).
- Inside, each plant was fitted out its own way: green-tiled grow rooms under magenta grow lights at the farm, freezer panels and steel grating in cold blue light at the depot, institutional green tile and wooden doors at the sanatorium, rusted plate and deck plating at the docks, cream-painted steel and sodium light at the refinery, sooty firebrick in furnace-orange light at the foundry; and what the rooms are (and the scrap in them) follows what the place was for.
- **Rings.** Nadir, the Hollow, Rimefall and Saltreach wear rings; the rest don't. They're real, flat sheets round the world's middle, the same from orbit as from its moon or rock: the world's shadow falls across them and theirs across it in bands, sharp-edged; the sunlit face shines and the far face glows only where they're thin; and each one's rock goes round inside them, in a lane it keeps clear, so standing on that rock the rings run right across the sky in front of the world, and the rock's own shadow falls across them when the sun is low.
- **Moons and rocks.** Every world has a moon and a captured rock circling it: you see them hanging beside it from orbit, slowly going round it (nearer some days, farther others), waxing and waning with the sun, throwing their shadows across it, passing into its shadow, and now and then crossing the sun's face (dimming it down on the ground too), and in the sky over its sites, pale by day and bright at night (when the weather lets you). Some days Mercy Survey radios in a facility **beacon** on one of them: a bonus site for that day only, listed under `SITES` and better paid for the risk. `ROUTE` to it from its world and pull the jump lever for a short hop across (the shutters come down for the burn and open on the new orbit). Out there there is no air: a black sky with the stars out by day and the sun a small white disc as blinding as it is from space, glaring whenever you look its way, grey cratered dust or dark broken rock, nothing hunting outside, and the world it belongs to filling half the sky: by night it lights the ground, and once in a while it swallows the sun and the place goes dark for a few hours of the day. The gravity is light on the surface (you jump far higher and fall slowly) and full again inside the ship and the facility. By the next day the beacon is gone and the ship has hopped back. Where they are and how close is the same that day from everywhere: from orbit, from the world's sites (a moon in close looks bigger), and from the moon or rock itself, where the world looms larger on the days its orbit has brought it in close and the other one hangs where it really is.
- Each site has its own creatures. Nobody tells you which: you find out when you get down there (the terminal's `BESTIARY` has field notes on each). The mannequins are only on the harder worlds, and only down on a facility's lower levels. You never face a pack of the same thing: at most one of each big creature and two of the small ones, with a cap on how many are inside at once.
- **The Seep** turns up in some facilities.
  - It's a wall of jelly as wide as the corridor and as high as the ceiling.
  - It's slow, but it never stops, and nothing hurts it.
  - It feels you through the floor and comes after you. Left alone, it settles across a corridor and waits there, blocking the way.
  - It can't open doors, so shut one on it. It will start to seep through under the door (or quicker, through the bars of a barred window) and gather itself again on your side.
  - Touching it burns and shoves you along ahead of it. Backed into a corner, you're swallowed whole, and your body hangs inside it as it goes, until it has to squeeze under a door and leaves you there.
  - It's a different colour every landing.
  - It catches whatever light falls on it and throws it round the corridor in its own colour.
  - It leaves a glossy trail wherever it's been.
- Carry scrap back and drop it inside the ship. Most of it is junk worth a few dollars; a real find is rare. The ship **leaves at midnight**, and anyone not aboard is left behind. Pulling the lever with crew still outside warns you once; pull it again to leave them. Anyone it leaves behind, alive or dead, gets one last look: the view starts on them (or their body), flies the quickest way out of the facility and across the ground, faster the farther it has to come, and settles to watch the ship climb away into the sky without them.
- Sell from orbit at the **terminal** (`SELL`). The Company pays more as the deadline gets closer (50% → 70% → 85% → 100%).
- On the deadline, pull the lever to submit. Make the quota and a bigger one follows; miss it and you're terminated.
- Spend credits at the terminal (`STORE`, `BUY <item>`) on flashlights, shovels, stun grenades, walkie-talkies, a motion tracker, snacks, and ship upgrades. Riskier sites (`SITES`, `ROUTE <site>`) pay much better.
- **Deliveries:** bought in orbit, a delivery drone flies out to the ship: Mercy Supply calls it in over the radio, and you can watch its strobe blink in from far off through the starboard portholes. The lock seals, the hatch opens, the drone flies in, sets your order down in the airlock and leaves, then the lock repressurises and the inner door opens. Bought on a site, it's called in over the radio with an ETA (about half a minute, time to walk out and watch): a glint shows high in the sky and grows, then a supply pod falls out of it and slams in near the ship, leaving a crater. Open it (E) to get your order.
- **The scout rover** (a ship upgrade, `BUY ROVER`) is a little yellow remote-control truck with a camera on a mast, a headlight and a wire basket on its back. It parks in the bay by the airlock, next to its console. Once the ship is down, one crewmate at a time can take the console (E): your view becomes the rover's camera, grainier the further it gets from the ship and worse underground. Drive with WASD (or the stick), look round with the mouse, F for its headlight, Space for its horn (creatures hear it), E to let go. It goes out through the airlock, down the ramp and in through the facility doors, and the console's little screen shows the crew what it sees. Put whatever you're holding in its basket (three things) and take them out again; whatever's in the basket is aboard once the rover is. It can be **carried** too (E on it): both arms, heavy, so you walk slowly and can't use or switch items until you set it down (G). If the ship leaves it on the ground it's gone, basket and all.
- **Snacks and drinks** are sold in the store and found in lockers and cabinets. Eat or drink one (left click) for stamina back and a perk: longer sprints, faster recovery, sharper eyes, steadier hands, or some health back. Mystery cans can go either way.

## Crew bots

Short-handed? Call robot crewmates aboard from the chat (T or Enter). Anyone in the crew can:

| Command | What it does |
|---|---|
| `/add bot` | A bot joins the crew (`/add bot 3` for three). Up to 6 crew in all, people and bots together |
| `/remove bot` | The newest bot leaves (`/remove bot 2`, `/remove bot all`) |
| `/bots return` | Every bot comes back aboard and waits |
| `/bots work` | Back out to it |
| `/bots` | The list of commands |

Once the ship is down, a bot walks out through the airlock and down the ramp, follows the trail to the plant (round the ship if the trail runs under it) and goes in at the front door with its flashlight on (outside too, once it's getting dark), so you can see where it's headed. It searches floor by floor for scrap, heading deeper once it has covered a floor, opening doors and lockers as it goes. When its hands are full, it's badly hurt, or the night is getting on, it carries everything back up the ramp and sets it down in the bay, then goes out again. It sidesteps a charging crawler, slips away from things that haven't noticed it and runs from things that have, tears a leech off its head, and says the odd word to anyone close enough to hear. Everyone heads back by 10 PM, and the moment the ship starts to leave. Aboard with nothing to do (in orbit, waiting to lift off, or called back), a bot takes a seat (the bench or a jump seat, leaving the cockpit to the crew) and stays in it through the jump, the dive and the climb out, until there's work again.

A bot is a real crewmate: it's on the crew cams and the map, creatures hunt it, it can die or be left behind, and the scrap it brings in counts. A lost bot is on the casualty report, but the Company's insurance doesn't charge for one. If every person is dead, the autopilot waits for any bots still standing to get back aboard. Bots come back with a saved run, and a friend joining a full crew bumps the newest bot.

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
| G | Drop held item (or set the rover down) |
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
