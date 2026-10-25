'use strict';
// Game state, host-authoritative simulation, event replication, world management, scare director.
const SITE_LOOK = {
  // seen from orbit, each planet looks like the ground you land on
  ashgrove: { tint: 0x9a9070, atmo: 0x9fb8e8 },
  kessler: { tint: 0x6f8a62, atmo: 0x9adf8a },
  // (and some of them wear rings: in and out are where they start and end, in the world's radii)
  nadir: { tint: 0xb07a4e, atmo: 0xffb070, rings: { in: 1.3, out: 3.1 } },
  hollow: { tint: 0x8a4a3e, atmo: 0xff6a4a, rings: { in: 1.25, out: 2.9 } },
  verdigris: { tint: 0x6f8a4a, atmo: 0xc8f070 },
  rimefall: { tint: 0xc8d4dc, atmo: 0xb8e0ff, rings: { in: 1.35, out: 2.5 } },
  agnes: { tint: 0x7a6a72, atmo: 0xc0a8d8 },
  brinewell: { tint: 0x4a6a7a, atmo: 0x8ac8e8 },
  saltreach: { tint: 0xd8ccb0, atmo: 0xffe8a8, rings: { in: 1.3, out: 2.4 } },
  vesper: { tint: 0x3a2a24, atmo: 0xff8a3a },
  // gas giants: no ground at all, only cloud all the way down (giant: which face it wears), and enormous next to the
  // moons that go round them; each with its own kind of rings (map: the rings' profile; col: their colour, where it
  // isn't the world's): Halcyon's broad and bright, Tarrow's a faint rusty haze of dust, Hush's thin dark ringlets
  halcyon: { tint: 0xece4d4, atmo: 0xd8c8a0, rings: { in: 1.25, out: 2.25 }, giant: 'giant' },
  tarrow: { tint: 0xf4ece4, atmo: 0xe0c0a0, rings: { in: 1.4, out: 1.85, map: 'ringsDust', col: 0x8a6a50 }, giant: 'giantJove' },
  hush: { tint: 0xeaf4f8, atmo: 0x9ad8ff, rings: { in: 1.6, out: 2.05, map: 'ringsThin', col: 0x5a5e64 }, giant: 'giantIce' },
};
const SITES = {
  // each site has its own roster (what lives there), a threat budget, and a cap on how many things are inside at once.
  // size: how wide its facility is, in tiles; stairs: how many stairwells join each of its floors to the next one down;
  // scrap: how many pieces are left in the whole building, however deep it goes (shared out between its floors: see
  // spawnScrap). How many floors it goes down is down to its risk (FLOORS, below).
  ashgrove: { name: 'Ashgrove Mill', code: '12-A', risk: 'LOW', cost: 0, size: 26, stairs: 2, scrap: [11, 15], mult: 1.0, power: 3, cap: 2, hounds: 1, weather: { clear: 3, fog: 3, rain: 2 }, mon: { crawler: 1.4, leech: 1.2 }, desc: 'Abandoned textile mill. The shallowest of them. A good place to learn.' },
  verdigris: { name: 'Verdigris Farm', code: '5-V', risk: 'LOW', cost: 0, size: 28, stairs: 2, scrap: [12, 17], mult: 1.1, power: 3, cap: 2, hounds: 1, weather: { rain: 3, fog: 3, clear: 1 }, mon: { leech: 2.2, crawler: 1.4, slime: 0.5 }, desc: 'A hydroponic farm gone to seed. Warm, wet, and still growing.' },
  kessler: { name: 'Kessler Biolab', code: '31-K', risk: 'MEDIUM', cost: 0, size: 32, stairs: 3, scrap: [16, 21], mult: 1.25, power: 5, cap: 3, hounds: 1, weather: { clear: 2, fog: 3, rain: 3, storm: 1 }, mon: { leech: 2, crawler: 1.8, pale: 0.6, slime: 1.3 }, desc: 'Research annex. Something got out. Something stayed.' },
  rimefall: { name: 'Rimefall Depot', code: '22-R', risk: 'MEDIUM', cost: 25, size: 30, stairs: 2, scrap: [15, 20], mult: 1.3, power: 4, cap: 3, hounds: 1, weather: { clear: 2, fog: 3 }, mon: { pale: 1.2, crawler: 1.6, slime: 1 }, desc: 'Cold storage on an ice world. Whatever they kept frozen has thawed.' },
  agnes: { name: 'St. Agnes', code: '40-G', risk: 'MEDIUM', cost: 45, size: 34, stairs: 3, scrap: [17, 23], mult: 1.4, power: 5, cap: 3, hounds: 2, weather: { fog: 4, rain: 2, clear: 1 }, mon: { clown: 0.8, mannequin: 2.2, pale: 1, leech: 0.8 }, desc: 'A sanatorium out on the moor. The patients never checked out.' },
  nadir: { name: 'Nadir Station', code: '7', risk: 'HIGH', cost: 60, size: 38, stairs: 3, scrap: [23, 30], mult: 1.6, power: 7, cap: 4, hounds: 2, weather: { fog: 3, rain: 2, storm: 3 }, mon: { clown: 0.8, crawler: 2, pale: 1.5, leech: 1, mannequin: 0.5, slime: 0.8 }, desc: 'Deep pumping station. Rich salvage. Few crews come back complete.' },
  brinewell: { name: 'Brinewell Docks', code: '56-B', risk: 'HIGH', cost: 90, size: 38, stairs: 3, scrap: [22, 29], mult: 1.7, power: 7, cap: 4, hounds: 2, weather: { rain: 3, storm: 3, fog: 2 }, mon: { clown: 0.6, leech: 2, crawler: 1.6, pale: 1, slime: 1.2 }, desc: 'A drowned shipyard. The tide comes in a little further every year.' },
  saltreach: { name: 'Saltreach Refinery', code: '19-S', risk: 'HIGH', cost: 120, size: 40, stairs: 3, scrap: [25, 32], mult: 1.9, power: 8, cap: 4, hounds: 2, weather: { clear: 3, fog: 1, storm: 1 }, mon: { clown: 0.8, crawler: 2.2, pale: 1.4, mannequin: 0.8 }, desc: 'Brine works on a dead salt sea. The flare stack is still burning.' },
  hollow: { name: 'The Hollow', code: '0', risk: 'EXTREME', cost: 200, size: 44, stairs: 3, scrap: [30, 39], mult: 2.2, power: 10, cap: 5, hounds: 3, weather: { storm: 3, fog: 2 }, mon: { clown: 0.7, pale: 2, mannequin: 1.6, crawler: 1.3, leech: 1, slime: 0.8 }, desc: 'No survey data. The signal is coming from below the facility. We would like it back.' },
  vesper: { name: 'Vesper Foundry', code: '1-X', risk: 'EXTREME', cost: 280, size: 46, stairs: 3, scrap: [33, 42], mult: 2.4, power: 11, cap: 5, hounds: 3, weather: { clear: 2, fog: 2, storm: 1 }, mon: { clown: 0.9, pale: 2.2, crawler: 1.6, mannequin: 1.2, leech: 1 }, desc: 'A foundry on a volcanic world. Nobody ever banked the furnaces.' },
};
// Halcyon, a gas giant: nowhere to land on it, but a family of moons round it, each with a facility, and all of them
// open every day (open): jump to any of them, or to the giant to look, and hop between them for nothing
const GIANT = { stairs: 2, scrap: [0, 0], size: 30, mult: 1, power: 5, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1 }, risk: 'VARIES', giant: true };
Object.assign(SITES, {
  halcyon: Object.assign({ name: 'Halcyon', code: '9', cost: 150, desc: 'A pale gold gas giant in broad bright rings: no surface. Five moons, each with a facility. Route to any of them.' }, GIANT),
  tarrow: Object.assign({ name: 'Tarrow', code: '14', cost: 190, desc: 'A banded giant, its storms bigger than worlds: no surface. Three moons, each with a facility.' }, GIANT),
  hush: Object.assign({ name: 'Hush', code: '20', cost: 240, desc: 'A still, pale blue giant in thin dark rings: no surface. Three moons, each with a facility.' }, GIANT),
});
// (inside, each world's dark has its own faint cast: the colour of the murk the fog fades into)
Object.assign(SITES.verdigris, { murk: 0x020904 }); Object.assign(SITES.rimefall, { murk: 0x03060b }); Object.assign(SITES.agnes, { murk: 0x070507 });
Object.assign(SITES.brinewell, { murk: 0x010607 }); Object.assign(SITES.saltreach, { murk: 0x080602 }); Object.assign(SITES.vesper, { murk: 0x0b0301 });
Object.assign(SITES.ashgrove, { murk: 0x070503 }); Object.assign(SITES.kessler, { murk: 0x040607 }); Object.assign(SITES.nadir, { murk: 0x020604 }); Object.assign(SITES.hollow, { murk: 0x0a0202 });
// What circles each world: a moon, and a rock it captured (seen hanging round it from orbit, and in the sky from its
// sites). size and orbit are in the world's radii; ang is where round its limb it shows from orbit, off how far past
// it. A ringed world's rock goes round inside its rings (ring), in a lane it keeps swept clear; its moon, outside them,
// on an orbit tipped incl to them. Some days a facility beacon shows on one of them: a bonus site, that day only (see G.signal)
const BODIES = {
  ashgrove: [
    { key: 'wick', kind: 'moon', size: 0.27, orbit: 6.0, ang: 0.6, off: 0.16, tint: 0xb4b0a6 },
    { key: 'tallow', kind: 'rock', size: 0.06, orbit: 3.2, ang: 2.5, off: 0.07, tint: 0x8e8272 },
  ],
  kessler: [
    { key: 'petri', kind: 'moon', size: 0.22, orbit: 5.2, ang: -0.4, off: 0.2, tint: 0xb0baa8 },
    { key: 'swab', kind: 'rock', size: 0.05, orbit: 2.8, ang: 2.0, off: 0.05, tint: 0x7e8a78 },
  ],
  nadir: [
    { key: 'grit', kind: 'moon', size: 0.2, orbit: 5.5, ang: 2.8, off: 0.14, tint: 0xc0a088, incl: 0.24 },
    { key: 'mote', kind: 'rock', size: 0.07, orbit: 2.5, ang: 0.9, off: 0.1, tint: 0x9a8676, ring: true },
  ],
  hollow: [
    { key: 'cinder', kind: 'moon', size: 0.25, orbit: 6.4, ang: -2.2, off: 0.18, tint: 0x80625a, incl: 0.3 },
    { key: 'clinker', kind: 'rock', size: 0.06, orbit: 2.3, ang: 1.3, off: 0.06, tint: 0x564c48, ring: true },
  ],
  verdigris: [
    { key: 'sprig', kind: 'moon', size: 0.24, orbit: 5.6, ang: 1.4, off: 0.15, tint: 0xa8b098 },
    { key: 'husk', kind: 'rock', size: 0.05, orbit: 3.0, ang: -1.1, off: 0.06, tint: 0x7a7a60 },
  ],
  rimefall: [
    { key: 'sleet', kind: 'moon', size: 0.26, orbit: 5.8, ang: -0.8, off: 0.17, tint: 0xc8ccd4, incl: 0.2 },
    { key: 'floe', kind: 'rock', size: 0.06, orbit: 2.0, ang: 2.2, off: 0.07, tint: 0xa8b0b8, ring: true },
  ],
  agnes: [
    { key: 'vigil', kind: 'moon', size: 0.2, orbit: 6.2, ang: 2.4, off: 0.15, tint: 0xb0a8b0 },
    { key: 'relic', kind: 'rock', size: 0.05, orbit: 3.4, ang: 0.4, off: 0.06, tint: 0x7a7070 },
  ],
  brinewell: [
    { key: 'ballast', kind: 'moon', size: 0.28, orbit: 5.0, ang: -2.6, off: 0.18, tint: 0x9aa4a8 },
    { key: 'barnacle', kind: 'rock', size: 0.06, orbit: 2.9, ang: 1.0, off: 0.07, tint: 0x6a7270 },
  ],
  saltreach: [
    { key: 'cask', kind: 'moon', size: 0.22, orbit: 5.4, ang: 0.2, off: 0.15, tint: 0xd0c8b4, incl: 0.22 },
    { key: 'grain', kind: 'rock', size: 0.05, orbit: 2.0, ang: -1.8, off: 0.06, tint: 0xb8ae98, ring: true },
  ],
  vesper: [
    { key: 'flux', kind: 'moon', size: 0.23, orbit: 6.0, ang: -1.6, off: 0.16, tint: 0x6a5048 },
    { key: 'dross', kind: 'rock', size: 0.07, orbit: 3.2, ang: 2.0, off: 0.08, tint: 0x3a3230 },
  ],
  // (a giant's moons are specks beside it, and they go round it close: from the nearest it fills most of the sky,
  // and even from the farthest it's a wall of cloud a third of the way across the glass. One goes round in its rings)
  halcyon: [
    { key: 'sump', kind: 'rock', size: 0.012, orbit: 1.7, ang: 0.8, off: 0.06, tint: 0x7a7064, ring: true },
    { key: 'lantern', kind: 'moon', size: 0.03, orbit: 2.4, ang: -0.5, off: 0.12, tint: 0xdfe6ee, incl: 0.06 },
    { key: 'chandler', kind: 'moon', size: 0.05, orbit: 2.6, ang: 2.2, off: 0.15, tint: 0xd8c070, incl: 0.1 },
    { key: 'gloam', kind: 'moon', size: 0.045, orbit: 3.1, ang: -2.0, off: 0.14, tint: 0x5a5a60, incl: 0.14 },
    { key: 'ferrule', kind: 'moon', size: 0.035, orbit: 3.8, ang: 1.3, off: 0.13, tint: 0xa87a62, incl: 0.18 },
  ],
  tarrow: [
    { key: 'kiln', kind: 'moon', size: 0.03, orbit: 1.6, ang: 0.5, off: 0.1, tint: 0xc89060, ring: true },
    { key: 'tithe', kind: 'moon', size: 0.04, orbit: 2.2, ang: -1.2, off: 0.13, tint: 0xb8b8b0, incl: 0.08 },
    { key: 'warden', kind: 'moon', size: 0.035, orbit: 3.0, ang: 2.4, off: 0.12, tint: 0x8a7060, incl: 0.15 },
  ],
  hush: [
    { key: 'murmur', kind: 'moon', size: 0.028, orbit: 1.4, ang: -0.4, off: 0.1, tint: 0xd8eef8, incl: 0.04 },
    { key: 'lull', kind: 'rock', size: 0.012, orbit: 2.2, ang: 1.9, off: 0.07, tint: 0x9aa8b0, incl: 0.1 },
    { key: 'pall', kind: 'moon', size: 0.04, orbit: 2.8, ang: -2.3, off: 0.13, tint: 0x5a6070, incl: 0.18 },
  ],
};
// the bonus sites on them: airless (bonus: the world they circle; biome: moon or rock), light gravity out on the
// surface, nothing hunting outside, better pay for the risk
Object.assign(SITES, {
  wick: { name: 'Wick', code: 'A-I', risk: 'MEDIUM', cost: 0, bonus: 'ashgrove', biome: 'moon', lowG: true, size: 28, stairs: 2, scrap: [15, 20], mult: 1.5, power: 5, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1.6, leech: 1 }, desc: 'A survey outpost that stopped answering.' },
  tallow: { name: 'Tallow', code: 'A-R', risk: 'MEDIUM', cost: 0, bonus: 'ashgrove', biome: 'rock', lowG: true, size: 24, stairs: 2, scrap: [12, 16], mult: 1.6, power: 4, cap: 2, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1, leech: 1.6 }, desc: 'A mining claim bored into it. Tight tunnels.' },
  petri: { name: 'Petri', code: 'K-I', risk: 'HIGH', cost: 0, bonus: 'kessler', biome: 'moon', lowG: true, size: 32, stairs: 3, scrap: [18, 24], mult: 1.9, power: 7, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { leech: 2, pale: 0.9, crawler: 1.2, slime: 1.4 }, desc: 'The quarantine overflow site. Sealed from the outside.' },
  swab: { name: 'Swab', code: 'K-R', risk: 'HIGH', cost: 0, bonus: 'kessler', biome: 'rock', lowG: true, size: 26, stairs: 2, scrap: [14, 19], mult: 2.0, power: 6, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { leech: 2.2, crawler: 1, slime: 1.2 }, desc: 'A sample store. Whatever they kept here is still kept.' },
  grit: { name: 'Grit', code: '7-I', risk: 'HIGH', cost: 0, bonus: 'nadir', biome: 'moon', lowG: true, size: 36, stairs: 3, scrap: [24, 31], mult: 2.1, power: 8, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { crawler: 2, pale: 1.4, mannequin: 0.6 }, desc: "The pumping company's refinery. Red dust in everything." },
  mote: { name: 'Mote', code: '7-R', risk: 'HIGH', cost: 0, bonus: 'nadir', biome: 'rock', lowG: true, size: 28, stairs: 2, scrap: [20, 26], mult: 2.2, power: 7, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1.6, leech: 1.2, pale: 0.8 }, desc: 'An ore crusher, still running.' },
  cinder: { name: 'Cinder', code: '0-I', risk: 'EXTREME', cost: 0, bonus: 'hollow', biome: 'moon', lowG: true, size: 42, stairs: 3, scrap: [32, 40], mult: 2.6, power: 11, cap: 5, hounds: 0, weather: { clear: 1 }, mon: { pale: 2, mannequin: 1.5, crawler: 1.4, leech: 1 }, desc: 'The signal from below the Hollow is louder here.' },
  clinker: { name: 'Clinker', code: '0-R', risk: 'EXTREME', cost: 0, bonus: 'hollow', biome: 'rock', lowG: true, size: 30, stairs: 2, scrap: [26, 33], mult: 2.8, power: 9, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { pale: 1.6, crawler: 1.4, mannequin: 1 }, desc: 'Burnt out. Something tunnels through it.' },
  sprig: { name: 'Sprig', code: '5-I', risk: 'LOW', cost: 0, bonus: 'verdigris', biome: 'moon', lowG: true, size: 26, stairs: 2, scrap: [13, 18], mult: 1.4, power: 4, cap: 2, hounds: 0, weather: { clear: 1 }, mon: { leech: 1.6, crawler: 1.2 }, desc: 'A seed vault, sealed against the end of the world. Something got in anyway.' },
  husk: { name: 'Husk', code: '5-R', risk: 'MEDIUM', cost: 0, bonus: 'verdigris', biome: 'rock', lowG: true, size: 22, stairs: 2, scrap: [11, 15], mult: 1.5, power: 4, cap: 2, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1.4, leech: 1.2, slime: 1 }, desc: 'A compost works bored into the rock. Mind the smell.' },
  sleet: { name: 'Sleet', code: '22-I', risk: 'MEDIUM', cost: 0, bonus: 'rimefall', biome: 'moon', lowG: true, size: 30, stairs: 2, scrap: [16, 22], mult: 1.6, power: 5, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { pale: 1, crawler: 1.4 }, desc: 'An ice-core drilling station. The cores are missing.' },
  floe: { name: 'Floe', code: '22-R', risk: 'HIGH', cost: 0, bonus: 'rimefall', biome: 'rock', lowG: true, size: 26, stairs: 2, scrap: [18, 24], mult: 1.8, power: 6, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1.6, pale: 1 }, desc: "An ice hauler's camp out in the rings, cutting blocks from them." },
  vigil: { name: 'Vigil', code: '40-I', risk: 'MEDIUM', cost: 0, bonus: 'agnes', biome: 'moon', lowG: true, size: 30, stairs: 3, scrap: [17, 23], mult: 1.7, power: 5, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { mannequin: 2, pale: 1 }, desc: "The sanatorium's isolation ward. Built a long way off, on purpose." },
  relic: { name: 'Relic', code: '40-R', risk: 'HIGH', cost: 0, bonus: 'agnes', biome: 'rock', lowG: true, size: 24, stairs: 2, scrap: [15, 20], mult: 1.8, power: 5, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { leech: 1.2, pale: 1 }, desc: 'An ossuary. They ran out of room on the moor.' },
  ballast: { name: 'Ballast', code: '56-I', risk: 'HIGH', cost: 0, bonus: 'brinewell', biome: 'moon', lowG: true, size: 34, stairs: 3, scrap: [22, 29], mult: 2.0, power: 7, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { leech: 2, crawler: 1.4, pale: 0.8 }, desc: "A breaker's yard, where they cut up the ships too big to land." },
  barnacle: { name: 'Barnacle', code: '56-R', risk: 'HIGH', cost: 0, bonus: 'brinewell', biome: 'rock', lowG: true, size: 26, stairs: 2, scrap: [19, 25], mult: 2.1, power: 6, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { leech: 2.2, crawler: 1, slime: 1.2 }, desc: "A salvage tender's base, grown over with something." },
  cask: { name: 'Cask', code: '19-I', risk: 'HIGH', cost: 0, bonus: 'saltreach', biome: 'moon', lowG: true, size: 36, stairs: 3, scrap: [24, 31], mult: 2.2, power: 8, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { crawler: 2, pale: 1.4 }, desc: 'Brine evaporators under glass. The glass is cracked.' },
  grain: { name: 'Grain', code: '19-R', risk: 'HIGH', cost: 0, bonus: 'saltreach', biome: 'rock', lowG: true, size: 28, stairs: 2, scrap: [21, 27], mult: 2.3, power: 7, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1.8, pale: 1.2 }, desc: 'A salt mine in a rock out in the rings.' },
  flux: { name: 'Flux', code: '1-I', risk: 'EXTREME', cost: 0, bonus: 'vesper', biome: 'moon', lowG: true, size: 44, stairs: 3, scrap: [34, 42], mult: 2.8, power: 11, cap: 5, hounds: 0, weather: { clear: 1 }, mon: { pale: 2, crawler: 1.6, mannequin: 1.4, leech: 1 }, desc: "The foundry's ore terminal. The conveyors are still running." },
  // Halcyon's: open every day (open), each a little world of its own (ground: its dust's colour against a plain moon's)
  sump: { name: 'Sump', code: '9-R', risk: 'MEDIUM', cost: 150, bonus: 'halcyon', open: true, biome: 'rock', lowG: true, size: 26, stairs: 2, scrap: [16, 21], mult: 1.6, power: 5, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1.4, leech: 1.4, slime: 0.8 }, ground: [0.95, 0.9, 0.85], desc: "A moonlet in the rings, mined hollow for ice. The drills stopped mid-shift." },
  lantern: { name: 'Lantern', code: '9-I', risk: 'MEDIUM', cost: 150, bonus: 'halcyon', open: true, biome: 'moon', lowG: true, size: 30, stairs: 2, scrap: [17, 23], mult: 1.7, power: 5, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { pale: 1.2, crawler: 1.4 }, ground: [1.12, 1.16, 1.24], desc: 'An ice moon just outside the rings. The relay station still answers hails, in a voice nobody recorded.' },
  chandler: { name: 'Chandler', code: '9-II', risk: 'HIGH', cost: 150, bonus: 'halcyon', open: true, biome: 'moon', lowG: true, size: 36, stairs: 3, scrap: [23, 30], mult: 2.0, power: 7, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { crawler: 2, slime: 1.2, pale: 1 }, ground: [1.2, 1.04, 0.62], desc: 'Sulphur flats and a refinery that ran itself for years. It kept the furnaces lit for someone.' },
  gloam: { name: 'Gloam', code: '9-III', risk: 'HIGH', cost: 150, bonus: 'halcyon', open: true, biome: 'moon', lowG: true, size: 38, stairs: 3, scrap: [24, 31], mult: 2.2, power: 8, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { mannequin: 1.8, pale: 1.4, leech: 0.8 }, ground: [0.5, 0.5, 0.54], desc: 'A moon as black as soot. The observatory on it was watching something, then stopped reporting.' },
  ferrule: { name: 'Ferrule', code: '9-IV', risk: 'EXTREME', cost: 150, bonus: 'halcyon', open: true, biome: 'moon', lowG: true, size: 42, stairs: 3, scrap: [30, 38], mult: 2.6, power: 10, cap: 5, hounds: 0, weather: { clear: 1 }, mon: { pale: 2, crawler: 1.6, mannequin: 1.2, leech: 1 }, ground: [1.12, 0.82, 0.7], desc: "Halcyon's outermost moon, rust-red. A breakers' yard for ships that came back wrong." },
  // Tarrow's
  kiln: { name: 'Kiln', code: '14-I', risk: 'HIGH', cost: 190, bonus: 'tarrow', open: true, biome: 'moon', lowG: true, size: 36, stairs: 3, scrap: [23, 30], mult: 2.1, power: 8, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1.8, slime: 1.4, pale: 1 }, ground: [1.2, 0.85, 0.55], desc: "Down in Tarrow's dust ring, its crust cracking and smoking in the giant's pull. The geothermal plant still runs, hot as a stove." },
  tithe: { name: 'Tithe', code: '14-II', risk: 'MEDIUM', cost: 190, bonus: 'tarrow', open: true, biome: 'moon', lowG: true, size: 30, stairs: 2, scrap: [17, 23], mult: 1.7, power: 5, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { mannequin: 1.4, pale: 1 }, ground: [0.96, 0.96, 0.93], desc: 'A grey moon with a company chapel and its counting house. The tithes were paid in something other than money.' },
  warden: { name: 'Warden', code: '14-III', risk: 'EXTREME', cost: 190, bonus: 'tarrow', open: true, biome: 'moon', lowG: true, size: 42, stairs: 3, scrap: [30, 38], mult: 2.6, power: 10, cap: 5, hounds: 0, weather: { clear: 1 }, mon: { pale: 2, crawler: 1.6, mannequin: 1.2, leech: 1 }, ground: [0.78, 0.64, 0.52], desc: 'A prison moon. The cells were built to keep things in; the doors all open from the inside now.' },
  // Hush's
  murmur: { name: 'Murmur', code: '20-I', risk: 'HIGH', cost: 240, bonus: 'hush', open: true, biome: 'moon', lowG: true, size: 34, stairs: 3, scrap: [22, 29], mult: 2.2, power: 8, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { pale: 1.6, leech: 1.2, crawler: 1 }, ground: [1.1, 1.18, 1.3], desc: 'An ice moon so close in that Hush fills half its sky. A listening post, every dish turned the same way.' },
  lull: { name: 'Lull', code: '20-R', risk: 'HIGH', cost: 240, bonus: 'hush', open: true, biome: 'rock', lowG: true, size: 30, stairs: 2, scrap: [20, 26], mult: 2.2, power: 7, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1.6, slime: 1.2 }, ground: [0.9, 0.96, 1.06], desc: 'A captured rock in a slow, cold orbit. A cryo vault is cut into it; most of the pods are open.' },
  pall: { name: 'Pall', code: '20-II', risk: 'EXTREME', cost: 240, bonus: 'hush', open: true, biome: 'moon', lowG: true, size: 44, stairs: 3, scrap: [34, 42], mult: 2.9, power: 11, cap: 5, hounds: 0, weather: { clear: 1 }, mon: { pale: 2.2, mannequin: 1.6, crawler: 1.4 }, ground: [0.46, 0.49, 0.56], desc: "Hush's dark outer moon. They brought a lost fleet's crews here to lie in state, and something kept them." },
  dross: { name: 'Dross', code: '1-R', risk: 'EXTREME', cost: 0, bonus: 'vesper', biome: 'rock', lowG: true, size: 32, stairs: 2, scrap: [28, 35], mult: 3.0, power: 10, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { pale: 1.8, crawler: 1.6, mannequin: 1 }, desc: 'A slag dump that somebody hollowed out and lived in.' },
});
// How deep each site's facility goes, the ground floor counted: never fewer than four floors, and the more dangerous the
// site, the further down it goes (every floor the size it would be anyway, so a deeper plant is a bigger one)
const FLOORS = { LOW: 4, MEDIUM: 4, HIGH: 5, EXTREME: 6 };
for (const k in SITES) SITES[k].floors = Math.max(4, FLOORS[SITES[k].risk] || 4);
// (a moon's plant is fitted out like the place it takes after, and its dark has the same cast: see Facility.fitOf)
for (const k in SITES) if (SITES[k].murk == null) { const f = SITES[Facility.fitOf(k)]; if (f && f.murk != null) SITES[k].murk = f.murk; }
for (const w in BODIES) {
  const W = SITE_LOOK[w];
  // seen from orbit round one of them, it's grey and airless
  for (const b of BODIES[w]) SITE_LOOK[b.key] = { tint: b.tint, atmo: 0x000000, airless: true };
  // and in the sky over each site: from the world, its moon and rock (small, a few degrees across); from one of
  // them, the world itself, filling half the sky (bigger still from the rock, in closer), and the other one
  SITES[w].sky = BODIES[w].map((b) => ({ kind: b.kind, tint: b.tint, r: 1.08 * b.size / (b.orbit - 1), az: b.ang * 1.3 + 0.4, el: 0.32 + 0.18 * Math.sin(b.ang * 2) }));
  for (const b of BODIES[w]) SITES[b.key].sky = [{ kind: 'planet', tint: W.tint, atmo: W.atmo, rings: W.rings, giant: W.giant, r: b.kind === 'rock' ? 0.74 : 0.6, az: -1.2, el: 0.55 }]
    .concat(BODIES[w].filter((o) => o !== b).map((o) => ({ kind: o.kind, tint: o.tint, r: Math.min(0.06, o.size / Math.max(1, Math.abs(o.orbit - b.orbit))), az: o.ang * 1.3 + 4.0, el: 0.28 })));
}
// What came up from behind the siren: the Sisters keep to the wards, the Bound to wherever the dead were laid out
for (const [k, w] of Object.entries({ agnes: { sister: 2, bound: 0.8 }, vigil: { sister: 1.8, bound: 0.6 }, relic: { bound: 1.6, sister: 0.6 }, kessler: { sister: 0.9, bound: 0.5 }, petri: { sister: 1, bound: 0.8 }, nadir: { bound: 0.8 }, hollow: { sister: 1, bound: 1.2 }, cinder: { bound: 1, sister: 0.6 }, pall: { bound: 1.6, sister: 0.8 }, tithe: { sister: 1.2 }, warden: { bound: 1, sister: 0.6 }, brinewell: { bound: 0.7 }, gloam: { sister: 0.8 } })) Object.assign(SITES[k].mon, w);
// Where each moon and rock is today: how far out along its orbit (near: 1 its usual distance, under that closer in,
// over it farther out), how far round its world (phase), and how far above or below the plane of the world's rings
// (eps, an angle seen from the world: a rock inside them is right in it). Decided by the day and the world, so the view
// from orbit, the sky over the world's sites and the sky over its moon and rock all agree, and every crewmate sees the same.
function orbitsToday(world, run) {
  const rr = new RNG(((run ? run.day * 7919 + run.cycle * 104729 : 1) + [...world].reduce((s, c) => s + c.charCodeAt(0) * 131, 0)) >>> 0), out = {};
  // (a giant's moons keep to nearly round orbits: closer or farther by only a little from day to day)
  const giant = SITE_LOOK[world] && SITE_LOOK[world].giant;
  for (const b of BODIES[world] || []) {
    const n = giant ? 0.97 + rr.next() * 0.12 : 0.6 + rr.next() * 0.9, phase = rr.range(0, TAU);
    // (a rock in the rings keeps to its lane, give or take; a moon is never quite edge-on to them, or they'd vanish)
    const s = Math.sin(phase * 2 + 1.3), eps = b.incl ? Math.sign(s || 1) * Math.max(0.08, Math.abs(s) * b.incl) : 0;
    out[b.key] = { near: b.ring && !giant ? 0.85 + (n - 0.6) / 0.9 * 0.35 : n, phase, eps };
  }
  return out;
}
// a ringed world's rings today: where they start and end, and the lanes swept clear in them by whatever goes round
// inside them (where it is today, how wide), all in the world's radii (null: no rings)
function ringsToday(world, run) {
  const R = SITE_LOOK[world] && SITE_LOOK[world].rings; if (!R) return null;
  const O = orbitsToday(world, run);
  return { in: R.in, out: R.out, map: R.map, col: R.col, gaps: (BODIES[world] || []).filter((b) => b.ring).map((b) => [b.orbit * O[b.key].near, b.size * 2]) };
}
// where it is today, in the world's radii from its centre, in the plane they all go round in
const bodyAt = (b, o) => ({ x: Math.cos(o.phase) * b.orbit * o.near, z: Math.sin(o.phase) * b.orbit * o.near });
// the angle round from the world to another body, as seen from one of its moons (positive: anticlockwise)
const turnFrom = (pm, po) => { const vx = po.x - pm.x, vz = po.z - pm.z; return Math.atan2(-pm.x * vz + pm.z * vx, -pm.x * vx - pm.z * vz); };
// what is left in a room depends on what the room was for
const LOOT = {
  office: { phone: 3, register: 1.2, watch: 2, painting: 1.2, lamp: 1, horn: 0.8, candelabra: 1, bell: 0.6, toy: 0.4, typewriter: 2.2, radio: 1.4, globe: 1.4, trophy: 1.2, camera: 1, vase: 0.8, bottle: 0.8 },
  storage: { lantern: 1.2, gear: 2, bolt: 2, toy: 1.5, doll: 1, candelabra: 1, bell: 1, lamp: 0.8, axle: 1, register: 0.4, painting: 0.5, goldbar: 0.25, toolbox: 1.5, battery: 1.2, kettle: 1, bottle: 1, extinguisher: 0.8, radio: 0.6, typewriter: 0.5 },
  machine: { gear: 3, bolt: 3, axle: 2, engine: 1.3, horn: 1, goldbar: 0.2, toolbox: 2, battery: 1.8, meter: 1.2, extinguisher: 1.2, circuit: 1 },
  boiler: { lantern: 0.8, gear: 2, bolt: 3, axle: 1.5, engine: 1.2, horn: 0.8, extinguisher: 1.5, toolbox: 1.2, battery: 1, meter: 1, kettle: 0.6 },
  hall: { gear: 1, bolt: 1, axle: 1, engine: 0.6, toy: 0.5, doll: 0.5, painting: 0.4, extinguisher: 1, trophy: 0.6, vase: 0.5, globe: 0.4 },
  lab: { flask: 4, jar: 2.2, mask: 1, watch: 0.5, doll: 0.3, meter: 2, circuit: 2.2, skull: 1.2, camera: 0.6, bottle: 0.6 },
  morgue: { mask: 2, doll: 2, watch: 2.2, jar: 1, flask: 1.4, candelabra: 0.5, skull: 2, teddy: 1.4, camera: 0.8, bottle: 0.6 },
  lockers: { lantern: 0.9, watch: 2, toy: 1.5, horn: 1.4, phone: 1, doll: 1, mask: 1, bell: 1, goldbar: 0.35, teddy: 1.4, radio: 1.2, camera: 1.2, kettle: 1, bottle: 1.2, trophy: 0.8 },
  entrance: { phone: 2, register: 1.5, painting: 1, lamp: 1, bell: 1, typewriter: 1.2, radio: 1, trophy: 1.2, vase: 1, globe: 0.8 },
  exit: { lantern: 0.7, bolt: 1, gear: 1, horn: 1, toy: 0.6, extinguisher: 1.5, toolbox: 0.6 },
  core: { bolt: 1, gear: 1, battery: 0.6, meter: 0.6, circuit: 0.6 },
  corridor: { lantern: 0.6, bolt: 1, doll: 1.2, toy: 0.8, gear: 0.6, watch: 0.4, extinguisher: 1, teddy: 0.8, bottle: 0.5 },
};
// ...and on what the whole site was
const SITE_LOOT = {
  ashgrove: { lantern: 1.3, bell: 1.4, candelabra: 1.4, gear: 1.3, painting: 1.2, lamp: 1.2, typewriter: 1.4, kettle: 1.4, radio: 1.3 },
  kessler: { flask: 1.6, jar: 1.6, mask: 1.3, doll: 1.2, circuit: 1.6, meter: 1.5, skull: 1.3 },
  nadir: { engine: 1.6, axle: 1.5, bolt: 1.3, gear: 1.2, goldbar: 1.4, battery: 1.5, toolbox: 1.5, extinguisher: 1.3 },
  hollow: { goldbar: 1.8, mask: 1.6, doll: 1.6, painting: 1.3, candelabra: 1.3, skull: 1.8, vase: 1.5, trophy: 1.3, teddy: 1.3 },
  verdigris: { jar: 1.5, flask: 1.2, toy: 1.2, lamp: 1.2, circuit: 1.3, camera: 1.3, globe: 1.3 },
  rimefall: { lantern: 1.4, engine: 1.3, axle: 1.2, bolt: 1.2, jar: 1.3, watch: 1.2, battery: 1.3, kettle: 1.3, radio: 1.3 },
  agnes: { doll: 1.6, mask: 1.4, bell: 1.4, candelabra: 1.4, watch: 1.3, teddy: 1.8, vase: 1.4, trophy: 1.4, typewriter: 1.3 },
  brinewell: { lantern: 1.4, horn: 1.6, bolt: 1.4, gear: 1.4, engine: 1.2, goldbar: 1.1, bottle: 1.6, extinguisher: 1.3, globe: 1.3, radio: 1.2 },
  saltreach: { flask: 1.4, jar: 1.3, engine: 1.3, axle: 1.2, goldbar: 1.3, meter: 1.4, circuit: 1.4, camera: 1.2 },
  vesper: { goldbar: 2.0, engine: 1.5, gear: 1.4, axle: 1.4, bell: 1.2, trophy: 1.5, vase: 1.5, battery: 1.3 },
};
// how many real seconds a minute of the site's day takes (8 AM to midnight: a little over half an hour)
const SEC_PER_MIN = 2;
const SELL_RATE = [1.0, 0.85, 0.7, 0.5];
const PROTO = 20;
// the ship's flights between orbit and the ground (seconds, metres)
const FLY = {
  landDur: 12, landH: 300, landRun: 190, // powered descent: from this high, this far back along the approach
  liftAt: 7, toDur: 15.7,                // takeoff: the engines fire up for liftAt seconds (time to run for it), then it
                                         // lifts; orbit at toDur
  grab: 1,                               // ...and for this long after it lifts, someone right under the hatch can still
                                         // catch the sill and haul themselves in
  burst: 4.4,                            // ...and this long after lifting off, the main engines open up all at once
  sendoff: 4.5,                          // ...and this much longer when it leaves anyone behind (they watch it go)
  doorAlt: 40,                           // the hatch can be open below this altitude, and shuts itself above it
};
// leaving orbit for the ground (seconds after the lever): the ship swings round to fly along its way down (from
// turn0, taking longer the further it has to turn), the braking burn (from burn), the long slide down round the world
// from drop, reaching the top of the air (hAir high, a share of the world's radius) at air and skimming on through it
// to hEnd at white, the shutters coming down just before; the site is built and the descent over it begins at `site`.
// On the way it goes trip round the world (radians), or as far as tripMax to come down into the morning (the sun
// sunUp over the ground under it; starting deep on the night side, only just up)
const ENTRY = { turn0: 0.4, burn: 6.5, drop: 7, air: 27, white: 35, site: 35.2, hAir: 0.07, hEnd: 0.02, trip: 1.3, tripMax: 1.75, sunUp: 0.65 };
const _shQ = new THREE.Quaternion(), _rq2b = new THREE.Quaternion(), _lampP = new THREE.Vector3(), _fxA = new THREE.Vector3(), _fxD = new THREE.Vector3(), _fxV = new THREE.Vector3(), _rainV = new THREE.Vector3(), _rainP = new THREE.Vector3();
const _orange = new THREE.Color(), _ahead = new THREE.Vector3(), _air = new THREE.Color(), _smokeCol = new THREE.Color(), _peekV = new THREE.Vector3(), _noGlow = new THREE.Color(0, 0, 0), _eyeAt = new THREE.Vector3();
// a hyperjump to another world: the drive winds up, punches through, drops out, brakes into orbit
const JUMP = { punch: 2.2, drop: 6.4, end: 17.4 };
const DEATH_TEXT = { water: 'Drowned', clown: 'Taken', crawler: 'Mauled', pale: 'Neck snapped', mannequin: 'Caught', leech: 'Suffocated', roach: 'Eaten alive', hound: 'Eaten', slime: 'Swallowed', left: 'Left behind', friend: 'Friendly fire', blast: 'Blown apart', meteor: 'Struck by a meteor', impact: 'Still on the surface at impact', sister: 'Cut open', bound: 'Dissolved', executioner: 'Executed', unknown: 'Unknown' };

const G = {
  mode: 'menu', isHost: true, online: false, localId: 0, saveKey: null,
  players: new Map(), items: new Map(), monsters: new Map(),
  run: null, round: null, fac: null, ext: null, ship: null,
  noises: [], timers: [], nextItemId: 1, nextMonId: 1, nextPid: 1, lampSrc: new Map(),
  lightSources: [], sendT: 0, leechOn: null, flicker: 0, seq: null, leverConfirm: 0, corpses: [], departT: 0, grenades: [],
  bombs: [], fuses: [], blasts: [],
  dir: { t: 20, light: 0, beat: 0 }, now: 0,
  marks: [], flight: null, fp: null, shipM: new THREE.Matrix4(), shipQ: new THREE.Quaternion(), shipMoved: false,
  simCam: new THREE.Object3D(),

  // ======================= setup =======================
  init() {
    G.ship = new Ship();
    G.ship.clockMinutes = () => (G.round ? G.round.time : null);
    R.scene.add(G.ship.group); R.scene.add(G.ship.wash); R.scene.add(G.ship.smoke); R.scene.add(G.ship.scorch); R.setBackdrop(G.ship.space, G.ship.sunCore);
    CrewCam.init(G.ship);
    Rover.init(G.ship);
    FX.init(R.scene);
    SFX.setOcclusion((p) => {
      const cam = R.camera.position;
      if (G.fac && cam.y < -50 && p.y < -50) return G.fac.los(cam.x, cam.z, p.x, p.z) ? 0 : 0.85;
      return 0;
    });
    Net.on('message', (d, c) => G.onMessage(d, c));
    Net.on('leave', (c) => { if (c.pid != null) G.hostPlayerLeft(c.pid); });
    Net.on('close', (why) => G.quit(why || 'Disconnected from host.'));
    // (always answered: with voice chat off, nothing goes out and nothing's heard; see Voice.onCall)
    Net.on('call', (call) => Voice.onCall(call));
  },
  newRun() { return { credits: 60, quota: 300, sold: 0, daysLeft: 3, cycle: 1, day: 1, route: 'ashgrove', upgrades: {}, totalSold: 0, deaths: 0, collected: 0 }; },
  reset() {
    G.teardownSite(true);
    for (const it of [...G.items.values()]) G.removeItem(it.id);
    for (const p of G.players.values()) if (p.avatar) p.avatar.dispose();
    for (const c of G.corpses) c.dispose();
    G.players.clear(); G.items.clear(); G.monsters.clear(); G.corpses = []; G.myBody = null; Bots.reset();
    G.noises = []; G.timers = []; G.grenades = []; G.round = null; G.leechOn = null; G.seq = null; G.flicker = 0;
    G.ship.setDoor(false); G.ship.door.t = 0;
    G.flight = null; G.updateFlight(0); G.ship.setLanded(false); SFX.setThrust(0, true, 0);
    G.robot = null; G.ship.poseRobot(-1); G.ship.lockCycling = false; G.ship.idoor.open = true; G.ship.idoor.t = 1;
    G.endSendoff(); G.entryHeat = 0; G.fovAdd = 0; G.jumping = false; R.fx.white = 0; R.fx.heat = 0;
    G.siteBuild = null; G.siteShown = true; G.setCabinPower(1);
    G.bombs = []; G.fuses = []; for (const b of G.blasts) for (const p of b.parts) R.scene.remove(p.o); G.blasts = [];
    for (const g of G.grenades) R.scene.remove(g.mesh); G.grenades = [];
    G.ship.snapShutters(false);
    G.ship.glide = null; G.ship.arrive = 1; G.ship.turn = 0; G.ship.inWarp = false; G.ship.warp.visible = false; G.ship.portal.visible = false; G.ship.tunnel.visible = false; R.fx.warp = 0; G.ship.plasma.visible = false; G.ship.stars.material.uniforms.uFade.value = 1;
    HUD.reset(); Player.resetVM(); Player.clearPerks(); G.clearMarks(); CrewCam.reset();
    R.fx.fade = 0; R.fx.damage = 0; R.fx.leech = 0; R.fx.static = 0; R.fx.flash = 0; R.fx.fear = 0; R.fx.health = 1; G.adrenaline = 0; G.orbitSeed = null;
  },
  startHost({ online, name, cont, color }) {
    G.reset();
    G.isHost = true; G.online = online; G.localId = 0; G.nextPid = 1; G.nextItemId = 1; G.nextMonId = 1;
    G.saveKey = online ? 'gs_save_mp' : 'gs_save_sp';
    const save = cont ? Store.get(G.saveKey, null) : null;
    G.run = save && save.run ? save.run : G.newRun();
    G.addPlayer({ id: 0, name: name || 'Crew', color: color || 0, peerId: Net.myPeerId, alive: true, zone: 'out' });
    // older saves may hold positions from the previous ship layout; keep anything that is not inside the cabin near the cargo racks
    if (save && save.items) for (const s of save.items) { const ok = G.ship.inside(s.x, s.y + 0.3, s.z); G.createItem({ id: G.nextItemId++, type: s.type, value: s.value, x: ok ? s.x : -5 + Math.random(), y: ok ? s.y : 0, z: ok ? s.z : 1.5 + Math.random(), ry: s.ry, battery: s.battery ?? 1, inShip: s.bk == null || !G.run.upgrades.rover, bk: G.run.upgrades.rover ? s.bk : null }); }
    else G.createItem({ id: G.nextItemId++, type: 'flashlight', value: 0, x: 2.17, y: 0.92, z: -3.42, ry: 0.4, battery: 1, inShip: true });
    G.applyRunVisuals();
    G.enterOrbitState();
    G.mode = 'orbit';
    G.spawnInShip(G.me(), 0);
    Bots.restore();
    G.callSignal();
    if (!save) G.timers.push({ t: 1.2, fn: () => HUD.notice('DAY ' + G.run.day, 'Quota $' + G.run.quota + ' · ' + G.run.daysLeft + ' days', false, 5) });
    else G.timers.push({ t: 1.2, fn: () => HUD.notice('WELCOME BACK', 'Credits $' + G.run.credits + ' · Quota $' + G.run.sold + '/$' + G.run.quota, false, 4) });
    G.timers.push({ t: 2, fn: G.warmShaders });
  },
  startClient(id, s) {
    G.reset();
    G.isHost = false; G.online = true; G.localId = id;
    G.applyFullState(s);
    G.timers.push({ t: 2, fn: G.warmShaders });
  },
  // once a session, every item and creature model is compiled in the background, so the first landing doesn't
  // stall the first time it draws them
  warmShaders() {
    if (G.warmed) return; G.warmed = true;
    const g = new THREE.Group();
    for (const k of Object.keys(ITEMS)) g.add(ItemMeshes.build(k));
    for (const k of Object.keys(MON_DEFS)) g.add(MonModels.build(k));
    R.precompile(g, () => {});
    // (and everything on the ship that's only seen landing or taking off, the jets and the smoke; the space outside)
    R.precompile(R.scene, () => {}); R.precompile(R.bgScene, () => {}, R.bgScene); R.warmVol();
  },
  quit(msg) {
    if (G.mode === 'menu') return;
    if (G.isHost && G.online) { try { Net.broadcast({ t: 'bye' }); } catch (e) { /* ignore */ } }
    Voice.reset(); Voice.disable();
    setTimeout(() => Net.close(), 100);
    G.reset();
    G.mode = 'menu';
    Menu.show(msg);
  },
  save() {
    if (!G.isHost || !G.run) return;
    const items = [];
    for (const it of G.items.values()) {
      const inShip = it.holder != null || it.basket != null ? true : it.inShip;
      if (!inShip) continue;
      const held = it.holder != null || it.basket != null;
      items.push({ type: it.type, value: it.value, x: held ? -5 + Math.random() : it.pos.x, y: held ? 0 : it.pos.y, z: held ? 2 + Math.random() : it.pos.z, ry: it.ry, battery: it.battery, bk: it.basket ?? undefined });
    }
    Store.set(G.saveKey, { v: PROTO, run: G.run, items });
  },
  // ======================= players =======================
  addPlayer(info) {
    let p = G.players.get(info.id);
    if (!p) {
      p = { id: info.id, name: info.name, color: info.color || 0, peerId: info.peerId, pos: new THREE.Vector3(info.x || 0, info.y || 0, info.z || 0), rpos: new THREE.Vector3(info.x || 0, info.y || 0, info.z || 0), yaw: info.yaw || 0, pitch: 0, hp: info.hp ?? 100, alive: info.alive ?? true, zone: info.zone || 'out', slots: info.slots || [null, null, null, null], sel: info.sel || 0, flags: 0, buf: [], noiseT: 0, speed: 0, bot: !!info.bot };
      G.players.set(p.id, p);
      if (p.id !== G.localId) { p.avatar = new Avatar(p.name, p.color); R.scene.add(p.avatar.root); p.avatar.root.visible = p.alive; }
      else Player.setSuit(p.color);
    } else Object.assign(p, { name: info.name, peerId: info.peerId });
    const n = G.run && G.run.upgrades.belt ? 5 : 4;
    while (p.slots.length < n) p.slots.push(null);
    return p;
  },
  removePlayer(id) {
    const p = G.players.get(id); if (!p) return;
    if (p.avatar) p.avatar.dispose();
    G.players.delete(id);
  },
  me() { return G.players.get(G.localId); },
  localPlayer() { return G.me(); },
  alivePlayers() { return [...G.players.values()].filter((p) => p.alive); },
  playerByPeer(peerId) { for (const p of G.players.values()) if (p.peerId === peerId) return p; return null; },
  hasItem(pid, type) { const p = G.players.get(pid); return !!p && p.slots.some((id) => id != null && G.items.get(id) && G.items.get(id).type === type); },
  holdingWalkie() { const me = G.me(); const id = me && me.slots[me.sel]; const it = id != null && G.items.get(id); return !!(it && it.type === 'walkie'); },
  inShip(p) { return p.zone === 'out' && G.ship.inside(p.pos.x, p.pos.y + 0.5, p.pos.z); },
  pinfo(p) { return { id: p.id, name: p.name, color: p.color, peerId: p.peerId, bot: p.bot || undefined, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, hp: p.hp, alive: p.alive, zone: p.zone, slots: p.slots, sel: p.sel }; },
  spawnInShip(p, idx) {
    const x = 1 + (idx % 3) * 1.1, z = 0.6 + Math.floor(idx / 3) * 1.0;
    p.pos.set(x, 0, z); p.zone = 'out';
    if (p.id === G.localId) Player.spawn(x, 0, z, -Math.PI / 2);
  },
  // ======================= items =======================
  createItem(d) {
    const it = { id: d.id, type: d.type, value: d.value || 0, pos: new THREE.Vector3(d.x, d.y, d.z), ry: d.ry || 0, holder: d.holder ?? null, inShip: !!d.inShip, battery: d.battery ?? 1, on: !!d.on, fallV: 0, vis: new THREE.Vector3(d.x, d.y, d.z), box: d.c ?? null, basket: d.bk ?? null };
    it.mesh = ItemMeshes.build(it.type, it.id);
    it.mesh.position.copy(it.pos); it.mesh.rotation.y = it.ry;
    R.scene.add(it.mesh);
    G.items.set(it.id, it);
    if (it.holder != null) { const p = G.players.get(it.holder); if (p && !p.slots.includes(it.id)) { const k = p.slots.indexOf(null); if (k >= 0) p.slots[k] = it.id; } }
    if (d.id >= G.nextItemId) G.nextItemId = d.id + 1;
    return it;
  },
  removeItem(id) {
    const it = G.items.get(id); if (!it) return;
    R.scene.remove(it.mesh);
    for (const p of G.players.values()) { const k = p.slots.indexOf(id); if (k >= 0) p.slots[k] = null; }
    G.items.delete(id);
  },
  iinfo(i) { return { id: i.id, type: i.type, value: i.value, x: i.pos.x, y: i.pos.y, z: i.pos.z, ry: i.ry, holder: i.holder, inShip: i.inShip, battery: i.battery, on: i.on, c: i.box, bk: i.basket }; },
  // an item shut inside a locker or cabinet can't be seen, scanned or taken until it is opened
  itemSealed(it) { return it.box != null && G.fac && G.fac.containers[it.box] && !G.fac.containers[it.box].open; },
  itemZone(it) { return it.pos.y < -50 ? 'in' : 'out'; },
  updateItems(dt) {
    for (const it of G.items.values()) {
      if (it.holder != null) { it.mesh.visible = false; continue; }
      it.mesh.visible = true;
      // riding in the rover's basket: wherever it goes
      if (it.basket != null) {
        Rover.slotPos(it.basket, it.vis); it.pos.copy(it.vis); it.fallV = 0;
        it.mesh.position.copy(it.vis); it.mesh.rotation.set(0, Rover.state.yaw + Math.PI / 2 + [0.12, -0.1, 0.3][it.basket], Rover.state.carrier != null ? 0.2 : 0, 'YXZ');
        if (G.shipMoved && G.posAboard(it.vis)) { it.mesh.position.applyMatrix4(G.shipM); it.mesh.quaternion.premultiply(G.shipQ); }
        continue;
      }
      if (it.vis.y > it.pos.y + 0.001 || Math.abs(it.vis.x - it.pos.x) > 0.001 || Math.abs(it.vis.z - it.pos.z) > 0.001) {
        // (it only gathers speed while it's still coming down: once down, it just slides the last bit into place)
        const up = it.vis.y > it.pos.y + 0.001;
        if (up) it.fallV += 20 * G.gravity(G.itemZone(it), it.vis.x, it.vis.y, it.vis.z) * dt;
        it.vis.y = Math.max(it.pos.y, it.vis.y - it.fallV * dt);
        it.vis.x = damp(it.vis.x, it.pos.x, 10, dt); it.vis.z = damp(it.vis.z, it.pos.z, 10, dt);
        if (up && it.vis.y <= it.pos.y + 0.001) { if (it.fallV > 2) { SFX.play('drop', it.pos, { vol: 0.6, mat: ITEM_MAT[it.type], w: ITEMS[it.type].weight }); FX.foot(it.pos, G.itemZone(it), Math.min(1.2, 0.3 + ITEMS[it.type].weight / 40)); } it.fallV = 0; }
      } else it.fallV = 0;
      it.mesh.position.copy(it.vis); it.mesh.rotation.set(0, it.ry, 0);
      if (G.shipMoved && G.posAboard(it.vis)) { it.mesh.position.applyMatrix4(G.shipM); it.mesh.quaternion.premultiply(G.shipQ); }
    }
  },
  dropHeld() {
    const me = G.me(); const id = me.slots[me.sel]; const it = id != null && G.items.get(id); if (!it) return;
    const fw = new THREE.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
    let x = me.pos.x + fw.x * 0.55, z = me.pos.z + fw.z * 0.55;
    if (me.zone === 'in' && G.fac && !G.fac.los(me.pos.x, me.pos.z, x, z)) { x = me.pos.x; z = me.pos.z; }
    // (onto whatever you're facing if it's in reach: a desk, a crate, a drum, the shelf you look at; down in the plant,
    // or aboard)
    const hand = me.pos.y + 1.3, eye = me.pos.y + Player.eye, lk = Math.tan(clamp(me.pitch, -1.35, 1.35)), S = G.ship, ft = G.footprint(it);
    const F = me.zone === 'in' && G.fac, aboard = !F && me.zone !== 'in' && !me.roof && S.inside(me.pos.x, me.pos.y + 0.3, me.pos.z);
    const look = (qx, qz) => eye + lk * Math.hypot(qx - me.pos.x, qz - me.pos.z);
    const at = F ? (qx, qz) => F.restAt(qx, qz, hand, look(qx, qz), ft.h) : aboard ? (qx, qz) => S.restAt(qx, qz, hand, look(qx, qz), ft.h) : null;
    let r = null, ry = me.yaw;
    if (at) {
      const fl = F ? F.floorY(x, z, me.pos.y) : 0, on = (qx, qz) => at(qx, qz).y >= fl + 0.2;
      // aboard, a wall or a console's body stops it short; then, if it'd go down on the deck, a top a little further on
      // in reach takes it (in the plant, the same reach past the end of a desk or a crate, with nothing in the way)
      const d = aboard ? S.reach(me.pos.x, me.pos.z, fw.x, fw.z, 0.55, on) : 0.55, far = aboard ? S.reach(me.pos.x, me.pos.z, fw.x, fw.z, 1.05, on) : 1.05;
      if (aboard) { x = me.pos.x + fw.x * d; z = me.pos.z + fw.z * d; }
      const clear = (qx, qz) => !F || F.los(me.pos.x, me.pos.z, qx, qz);
      if (!on(x, z)) for (let q = Math.max(0.6, d + 0.05); q <= far + 1e-3; q += 0.05) {
        const qx = me.pos.x + fw.x * q, qz = me.pos.z + fw.z * q; if (!on(qx, qz) || !clear(qx, qz)) continue;
        const ix = qx + fw.x * 0.1, iz = qz + fw.z * 0.1, inn = q + 0.1 <= far + 1e-3 && on(ix, iz);
        x = inn ? ix : qx; z = inn ? iz : qz; break;
      }
      r = at(x, z);
      if (r.t) {
        // set down square on the bare top (turned a quarter if it fits better), clear of what stands on it already, and
        // not hanging off its edge
        // (only a way round it fits on whole; with no room over it either, it can't go there at all)
        const t = r.t, ry0 = Math.round(me.yaw / (Math.PI / 2)) * (Math.PI / 2), fit = r.cramped ? [] : [ry0, ry0 + Math.PI / 2].map((q) => {
          const sw = Math.abs(Math.sin(q)) > 0.5, ex = (sw ? ft.z : ft.x) + 0.01, ez = (sw ? ft.x : ft.z) + 0.01;
          return { ry: q, ex, ez, kx: (v) => clamp(v, t.x0 + ex, t.x1 - ex), kz: (v) => clamp(v, t.z0 + ez, t.z1 - ez) };
        }).filter((o) => 2 * o.ex <= t.x1 - t.x0 && 2 * o.ez <= t.z1 - t.z0);
        let bx = x, bz = z, ok = false;
        find: for (let rr = 0; rr < 0.72; rr += 0.05) for (const o of fit) for (let k = 0; k < (rr ? 16 : 1); k++) {
          const a = Math.atan2(-fw.z, -fw.x) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (TAU / 16), qx = o.kx(x + Math.cos(a) * rr), qz = o.kz(z + Math.sin(a) * rr);
          if ((F || S).clearOn(t, qx, qz, o.ex, o.ez)) { bx = qx; bz = qz; ry = o.ry; ok = true; break find; }
        }
        if (ok) {
          // (and on anything low and flat it's been moved onto, a keyboard on the desk)
          x = bx; z = bz; const q = at(x, z); if (q.t && q.y > t.y && q.y < t.y + 0.1) r = q;
        } else {
          // no room on it: down on the floor in front of it instead (aboard, short of it; in the plant, at your feet)
          ry = me.yaw; const e = aboard ? S.reach(me.pos.x, me.pos.z, fw.x, fw.z, 0.55, () => false) : 0;
          x = me.pos.x + fw.x * e; z = me.pos.z + fw.z * e; r = { y: F ? F.floorY(x, z, me.pos.y) : 0 };
        }
      }
    }
    const y = me.roof ? ROOF.y : r ? r.y : G.groundAt(x, z);
    G.request({ a: 'drop', item: id, x, y, z, ry, battery: it.battery, on: it.on });
  },
  // an item's half-size across the floor in its own frame (x, z) and its height, from its model
  footprint(it) {
    const c = G.feet || (G.feet = {}); if (c[it.type]) return c[it.type];
    const m = it.mesh, p = m.position.clone(), r = m.rotation.clone(); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(m); m.position.copy(p); m.rotation.copy(r); m.updateMatrixWorld(true);
    return (c[it.type] = b.isEmpty() ? { x: 0.1, z: 0.1, h: 0.2 } : { x: Math.max(-b.min.x, b.max.x), z: Math.max(-b.min.z, b.max.z), h: b.max.y });
  },
  // ======================= world =======================
  // noShip: for someone left on the ground while the ship is in the air (its deck and ramp are not there)
  groundAt(x, z, noShip = false) {
    if (!noShip) {
      if (G.ship.onFootprint(x, z)) return 0;
      const r = G.ship.rampAt(x, z); if (r != null && G.ship.rampT > 0.5) return r;
    }
    return G.ext ? G.ext.height(x, z) : 0;
  },
  // A site is put together in steps a frame apart (the facility, its meshes, the surface), so no single frame stalls
  // for long; landing, that happens behind shut blast shutters with the cabin lights dipped. Its shaders then compile
  // in the background, and it only goes into the scene once they're ready.
  // (ecl: on a moon, the ship came down in its world's shadow, and the site opens in that eclipse)
  stageSite(seed, siteKey, weather, ecl, done) {
    if (G.fac && G.round && G.round.seed === seed) { if (done) done(); return; }
    if (G.siteBuild && G.siteBuild.seed === seed) { if (done) G.siteBuild.done.push(done); return; }
    const site = SITES[siteKey], b = { seed, siteKey, weather, ecl: !!ecl, i: 0, done: done ? [done] : [] };
    // (a step that's built in pieces takes a piece a frame, and says false until it's done)
    const pieces = (start, end) => { let g = null; return () => { g = g || start(); const r = g.next(); if (!r.done) return false; end(r.value); }; };
    b.steps = [
      () => { b.fac = new Facility(seed, site.size, siteKey, site.stairs, site.floors, true); b.fac.nestK = site.mon.leech || 0.6; },
      pieces(() => b.fac.generateGen(), () => {}),
      // (and the host works out the plan of it the creatures go by: see Facility.nav)
      pieces(() => (G.isHost ? b.fac.navGen() : [].values()), () => {}),
      pieces(() => b.fac.buildGen(), (v) => { b.facG = v; }),
      () => { b.ext = new Exterior(seed, Object.assign({}, site, { sky: G.skyToday(siteKey), ecl: b.ecl }), weather, siteKey); },
      pieces(() => b.ext.landGen(), () => {}),
      pieces(() => b.ext.restGen(), (v) => { b.extG = v; }),
    ];
    G.siteBuild = b;
  },
  stepSite(all) {
    const b = G.siteBuild; if (!b) return;
    do { if (b.steps[b.i]() !== false) b.i++; } while (all && b.i < b.steps.length);
    if (b.i < b.steps.length) return;
    G.siteBuild = null;
    G.installSite(b);
    for (const f of b.done) f();
  },
  prepareSite(seed, siteKey, weather, ecl) {
    if (G.fac && G.round && G.round.seed === seed) return;
    G.stageSite(seed, siteKey, weather, ecl);
    G.stepSite(true);
  },
  installSite(b) {
    const { seed, siteKey, weather } = b;
    G.teardownSite(false);
    G.fac = b.fac; G.ext = b.ext;
    const fac = G.fac, ext = G.ext;
    G.siteShown = false;
    // (the ship's jets, dust and smoke are compiled again now, under the light they'll be seen in on the way down; on an
    // airless moon, what a meteor strike would need too)
    if (b.ext.biome.airless) Meteors.prepare();
    R.precompile(R.scene, () => {});
    R.precompile(b.facG, () => R.precompile(b.extG, () => { if (G.fac !== fac) return; R.scene.add(b.facG); R.scene.add(b.extG); G.siteShown = true; }));
    G.fac.lamps.forEach((l) => (l.fac = true));
    // (of the facility, only what can be seen from wherever each view is drawn from is drawn: see Facility.showFor)
    R.scene.onBeforeRender = (r, s, cam) => { if (G.fac) G.fac.showFor(_eyeAt.setFromMatrixPosition(cam.matrixWorld)); };
    G.lightSources = [...G.ship.lights, ...G.ext.lights, ...G.fac.lamps];
    G.round = { site: siteKey, seed, weather, ecl: b.ecl, time: 8 * 60, power: true, coreTaken: false, startShip: new Set(), warn1: false, warn2: false, spawnT: 45, houndT: 4 + Math.random() * 16, blackoutT: 150 + Math.random() * 240, blackout: false, allDeadT: 0, total: 0 };
    SFX.setWeather(weather === 'rain' ? 0.8 : weather === 'storm' ? 1 : 0, weather === 'storm' ? 1.4 : weather === 'fog' ? 0.7 : 1);
  },
  teardownSite(full) {
    G.ship.glassU.uRainK.value = 0; G.rainAt = false;
    G.clearMarks(); Pods.clear(); G.podBusy = false; G.ship.clearSmoke(); G.mists = [];
    for (const m of G.monsters.values()) { R.scene.remove(m.mesh); m.dispose(); }
    G.monsters.clear();
    const disposeGroup = (g) => { if (!g) return; R.scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); };
    if (G.fac) { disposeGroup(G.fac.group); G.fac = null; }
    if (G.ext) { disposeGroup(G.ext.group); G.ext = null; }
    FX.clear();
    for (const c of G.corpses) c.dispose();
    G.corpses = []; G.myBody = null;
    G.lightSources = [...G.ship.lights];
    G.leechOn = null;
    if (!full) G.round = null;
  },
  applyRunVisuals() {
    const r = G.run; if (!r) return;
    G.ship.drawMonitor(r); G.ship.setCourse(!!r.course);
    HUD.termStats(r);
    Rover.setOwned(!!r.upgrades.rover);
    // the main screen stays on whatever somebody last left it on
    CrewCam.setView(r.mon || 0);
    for (const p of G.players.values()) { const n = r.upgrades.belt ? 5 : 4; while (p.slots.length < n) p.slots.push(null); }
    if (G.jumping) return;   // (mid-jump: the new world appears when the ship drops out)
    const look = SITE_LOOK[r.route] || SITE_LOOK.ashgrove; G.ship.setPlanet(look.tint, look.atmo, look.airless, look.giant);
    G.ship.setScars((r.scars || []).filter((s) => s.site === r.route));
    // each day / destination gets its own orbit (deterministic, so every crewmate sees the same sky)
    const oseed = (r.day * 7919 + r.cycle * 104729 + [...r.route].reduce((s, c) => s + c.charCodeAt(0) * 31, 0)) >>> 0;
    if (G.orbitSeed !== oseed) { G.orbitSeed = oseed; G.ship.setOrbit(oseed, look, !!(SITES[r.route].bonus && SITE_LOOK[SITES[r.route].bonus].giant)); G.ship.setBodies(G.bodiesAround(r.route), ringsToday(SITES[r.route].bonus || r.route, r)); }
  },
  // the sun just peeking out past the edge of what's eclipsing it: a flare where it is on screen (k 0..1)
  sunPeek(k, dir) {
    const cam = R.camera, p = _peekV.copy(cam.position).addScaledVector(dir, 100).project(cam);
    R.fx.peek = p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2 ? k : 0; R.fx.peekUV.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
  },
  // gravity, as a share of the usual: light out on the surface of a moon or rock (the ship and the facilities keep
  // a full one of their own)
  gravity(zone, x, y, z) { return G.round && SITES[G.round.site].lowG && zone === 'out' && !G.ship.inside(x, y + 0.5, z) ? 0.3 : 1; },
  // the sky over a site today. From a world: its moon and rock, bigger the closer in they've come, round the sky as far
  // as they are round their orbits. From a moon or rock: the world (which never moves in its sky: it always keeps
  // the same face to it), bigger the closer in its orbit has brought it, and the other one, the size it really looks
  // from here and where it really is, out along the plane they all circle in
  skyToday(key) {
    const s = SITES[key], world = s.bonus || key, O = orbitsToday(world, G.run);
    // (each with how far off it really is, in the world's radii, so the nearer one is drawn over the farther)
    if (!s.bonus) return s.sky.map((e, i) => { const o = O[BODIES[world][i].key]; return Object.assign({}, e, { r: e.r / o.near, az: e.az + 0.5 * Math.sin(o.phase), fixed: true, dist: BODIES[world][i].orbit * o.near }); });
    const me = BODIES[world].find((b) => b.key === key), pm = bodyAt(me, O[key]), others = BODIES[world].filter((b) => b !== me), W = s.sky[0];
    // A ringed world is laid out as it really is (Exterior.buildSkyBodies works out the rest): the world as big as it
    // looks from this far out, its rings round it in the plane everything here circles in, and the other one out in
    // that plane, as far round from us as it really is today (dphi), as far off and as far out of the plane
    if (W.rings) {
      const d = me.orbit * O[key].near;
      return s.sky.map((e, i) => {
        if (e.kind === 'planet') return Object.assign({}, e, { r: Math.asin(1 / d), fixed: true, dist: d, me: { size: me.size, eps: O[key].eps, ring: !!me.ring }, ringSys: ringsToday(world, G.run) });
        const b = others[i - 1], o = O[b.key];
        return Object.assign({}, e, { fixed: true, withWorld: true, place: { dphi: o.phase - O[key].phase, dist: b.orbit * o.near, eps: o.eps, size: b.size } });
      });
    }
    const wd = new THREE.Vector3(Math.cos(W.az) * Math.cos(W.el), Math.sin(W.el), Math.sin(W.az) * Math.cos(W.el));
    const t1 = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), wd).normalize(), t2 = new THREE.Vector3().crossVectors(wd, t1);
    const road = t1.multiplyScalar(Math.cos(0.3)).addScaledVector(t2, Math.sin(0.3));
    // (the world is drawn bigger than it truly looks from here, so the sky round it is spread to match: what's really
    // just past its edge shows just past the edge drawn, and only what's really behind it is hidden)
    const Wr = Math.min(0.78, W.r / O[key].near), Rr = Math.asin(Math.min(1, 1 / (me.orbit * O[key].near)));
    const spread = (a) => Math.sign(a) * Math.min(Math.PI, Math.abs(a) < Rr ? Math.abs(a) * Wr / Rr : Math.abs(a) + Wr - Rr);
    return s.sky.map((e, i) => {
      if (e.kind === 'planet') return Object.assign({}, e, { r: Wr, fixed: true, dist: me.orbit * O[key].near });
      const b = others[i - 1], po = bodyAt(b, O[b.key]), a = spread(turnFrom(pm, po)), dist = Math.hypot(po.x - pm.x, po.z - pm.z);
      const d = wd.clone().multiplyScalar(Math.cos(a)).addScaledVector(road, Math.sin(a));
      return Object.assign({}, e, { r: clamp(Math.asin(Math.min(0.5, b.size / dist)) * 1.3, 0.008, 0.09), az: Math.atan2(d.z, d.x), el: Math.asin(clamp(d.y, -1, 1)), fixed: true, withWorld: true, dist });
    });
  },
  // what hangs round the world the ship is orbiting, for the view from orbit (Ship.setBodies): its moon and rock, or
  // from round one of those, the world itself, enormous, and the other one
  // (where they are, and how close, are today's: see orbitsToday)
  bodiesAround(route) {
    const s = SITES[route]; if (!s) return [];
    const O = orbitsToday(s.bonus || route, G.run);
    if (!s.bonus) return (BODIES[route] || []).map((b) => ({ key: b.key, kind: b.kind, size: b.size, orbit: b.orbit, ang: b.ang + 0.6 * Math.sin(O[b.key].phase), off: b.off, tint: b.tint, near: O[b.key].near, ring: !!b.ring && !!SITE_LOOK[route].rings }));
    const W = SITE_LOOK[s.bonus], me = BODIES[s.bonus].find((b) => b.key === route), pm = bodyAt(me, O[route]), pa = me.ang + Math.PI * 0.8;
    // (the world: bigger the closer in we are today; the other one: where it really is from here, and how far)
    // (a ringed world, as big as it really looks from this far out, round in its rings with us: see Ship.setBodies)
    const ar = W.rings ? Math.asin(1 / (me.orbit * O[route].near)) : clamp(0.5 / O[route].near, 0.32, 0.75);
    return [{ kind: 'planet', size: W.rings ? 1 / me.size : Math.min(10, 1 / me.size), orbit: 0, ang: pa, off: 0.12, tint: W.tint, atmo: W.atmo, rings: W.rings, giant: W.giant, ar, me: { size: me.size, eps: O[route].eps, ring: !!me.ring } }]
      .concat(BODIES[s.bonus].filter((b) => b !== me).map((b) => { const po = bodyAt(b, O[b.key]); return { key: b.key, kind: b.kind, size: b.size / me.size * 0.6, orbit: Math.max(3, Math.hypot(po.x - pm.x, po.z - pm.z) / me.size * 0.3), near: 1, ang: pa + turnFrom(pm, po), off: b.off, tint: b.tint }; }));
  },
  // Some days a facility beacon shows on one of the bodies circling the world the ship is at (or the one it belongs
  // to): a bonus site for that day only. Decided by the day, so every crewmate sees the same one
  signal(run) {
    const world = SITES[run.route] && SITES[run.route].bonus || run.route, list = BODIES[world]; if (!list || SITES[world].giant) return null;
    const seed = (run.day * 2654435761 + run.cycle * 40503 + [...world].reduce((s, c) => s + c.charCodeAt(0), 0) * 97) >>> 0;
    return new RNG(seed).next() < 0.45 ? list[Math.floor(new RNG(seed ^ 0x5bd1e995).next() * list.length)].key : null;
  },
  // the survey office calling a beacon in over the radio, when there is one (and the ship isn't already there)
  callSignal() {
    const sig = G.signal(G.run); if (!sig || G.run.route === sig) return;
    const s = SITES[sig];
    G.timers.push({ t: 3, fn: () => G.emit({ e: 'chat', text: `Mercy Survey: facility beacon on ${s.name}, ${s.biome === 'rock' ? 'the rock' : 'the moon'} off ${SITES[s.bonus].name}. Bonus rates, today only. ROUTE ${s.name.toUpperCase()}.`, sys: true }) });
  },
  // the colour a world's air burns as you come down through it: its sky colour, deepened
  entryColor(look) { const c = (G._fire || (G._fire = new THREE.Color())).set(look.atmo), m = Math.max(c.r, c.g, c.b, 0.01); return c.setRGB((c.r / m) ** 2.2, (c.g / m) ** 2.2, (c.b / m) ** 2.2); },
  enterOrbitState() {
    G.ship.space.visible = true; G.ship.setDoor(false); G.ship.door.t = 0; G.ship.setFlood(false); G.ship.turn = 0;
    G.flight = null; G.updateFlight(0); G.ship.setLanded(false); G.ship.setThrust(0, 0); G.ship.setEngines(0.4);
    G.lightSources = [...G.ship.lights];
  },
  // ======================= networking =======================
  request(r) {
    const me = G.me();
    if (me) r.p = [+me.pos.x.toFixed(2), +me.pos.y.toFixed(2), +me.pos.z.toFixed(2)];
    if (G.isHost) G.hostRequest(G.localId, r);
    else Net.send({ t: 'req', r });
  },
  emit(ev) {
    G.applyEvent(ev);
    if (G.online) Net.broadcast({ t: 'ev', e: ev });
  },
  sendTo(pid, msg) {
    if (pid === G.localId) { G.onClientMessage(msg); return; }
    for (const c of Net.clients()) if (c.pid === pid) Net.sendTo(c, msg);
  },
  fullState() {
    return {
      v: PROTO, mode: G.mode, run: G.run, orbitT: G.orbitT || 60,
      round: G.round ? { site: G.round.site, seed: G.round.seed, weather: G.round.weather, ecl: G.round.ecl, time: G.round.time, power: G.round.power, coreTaken: G.round.coreTaken, strikes: G.round.strikes || [], doom: G.round.doom || null } : null,
      players: [...G.players.values()].map(G.pinfo),
      items: [...G.items.values()].map(G.iinfo),
      monsters: [...G.monsters.values()].map((m) => m.serialize()),
      nest: G.fac && G.fac.nest ? G.fac.nest.hp : null,
      // (on the way down out of orbit, before the site's there: how far down)
      seq: G.mode === 'landing' && !G.round && G.seq && G.seq.kind === 'land' ? { t: +G.seq.t.toFixed(2), site: G.seq.site, h0: G.ship.glide ? +G.ship.glide.h0.toFixed(5) : null } : null,
      // 0 shut, 1 open into the room, 3 open into the corridor, 2 broken
      doors: G.fac ? G.fac.doors.map((d) => (d.broken ? 2 : d.open ? (d.dir < 0 ? 3 : 1) : 0)) : [],
      boxes: G.fac ? G.fac.containers.map((c) => (c.open ? 1 : 0)) : [],
      blasts: G.fac ? G.fac.blasts.map((b) => (b.open ? 1 : 0)) : [],
      hatch: G.ship.door.open,
      flight: G.flight ? { kind: G.flight.kind, t: G.flight.t, aboard: G.flight.aboard ? [...G.flight.aboard] : null } : null,
      idoor: G.ship.idoor.open, lock: !!G.ship.lockCycling,
      robot: G.robot ? { t: G.robot.t, items: G.robot.items } : null,
      pods: Pods.serialize(),
      rover: Rover.owned ? Rover.serialize() : null,
    };
  },
  applyFullState(s) {
    G.run = s.run;
    if (typeof s.orbitT === 'number') G.orbitT = s.orbitT;
    if (s.round) {
      G.prepareSite(s.round.seed, s.round.site, s.round.weather, s.round.ecl);
      Object.assign(G.round, { time: s.round.time, power: s.round.power, coreTaken: s.round.coreTaken, doom: s.round.doom || undefined });
      // (the craters today's meteors left)
      for (const m of s.round.strikes || []) G.ext.addCrater(m.x, m.z, m.r, m.d, true);
      if (s.round.coreTaken) G.startEmergency(true);
      s.doors.forEach((o, i) => { const d = G.fac.doors[i]; if (!d) return; if (o === 2) { G.fac.breakDoor(d); return; } d.open = !!o; d.dir = o === 3 ? -1 : 1; d.anim = o ? 1 : 0; G.fac.applyDoor(d); });
      (s.boxes || []).forEach((o, i) => { const c = G.fac.containers[i]; if (!c) return; c.open = !!o; c.anim = o ? 1 : 0; c.mesh.rotation.y = c.closedRy + c.swing * c.anim; });
      (s.blasts || []).forEach((o, i) => { const d = G.fac.blasts[i]; if (!d) return; d.open = !!o; d.anim = o ? 1 : 0; G.fac.applyBlast(d); });
      if (s.nest != null && G.fac.nest) { G.fac.nest.hp = s.nest; G.fac.nest.dead = s.nest <= 0; G.fac.nest.sag = s.nest <= 0 ? 1 : 0; }
      G.ship.space.visible = false;
    } else G.enterOrbitState();
    for (const p of s.players) G.addPlayer(p);
    for (const i of s.items) G.createItem(i);
    for (const m of s.monsters) G.spawnMonster({ id: m[0], type: m[1], x: m[2], y: m[3], z: m[4] });
    G.ship.setDoor(!!s.hatch); G.ship.door.t = s.hatch ? 1 : 0;
    G.mode = s.mode === 'landing' && !s.seq ? 'site' : s.mode;
    // (joining on the way down: aboard, coming down with everyone)
    // (joining partway down: from the same height the host started from, and with the cues already gone by marked done,
    // so they don't all go off at once)
    if (s.seq) { const t = s.seq.t, E = ENTRY; G.seq = { kind: 'land', t, site: s.seq.site, h0: s.seq.h0, rcs0: t > E.turn0, rcs1: t > E.turn0 + 2, roar: t > E.burn, boom: t > E.air, boomT: 1 }; G.ship.setEngines(1); }
    // mid-flight: pick the flight up where it is, gear and ramp already where they should be
    if (s.flight) {
      G.flight = { kind: s.flight.kind, t: s.flight.t, aboard: s.flight.aboard ? new Set(s.flight.aboard) : null, down: s.flight.kind === 'land' && s.flight.t >= FLY.landDur, up: s.flight.kind === 'takeoff' && s.flight.t >= FLY.liftAt };
      G.updateFlight(0); const S = G.ship; S.gearT = S.gearTarget; S.rampT = S.rampTarget; S.poseGear();
    } else G.ship.setLanded(!!s.round);
    G.ship.idoor.open = s.idoor !== false; G.ship.idoor.t = G.ship.idoor.open ? 1 : 0; G.ship.lockCycling = !!s.lock;
    if (s.robot) { G.robot = { t: s.robot.t, items: s.robot.items, done: {} }; for (const k in DELIVERY) if (DELIVERY[k] <= s.robot.t) G.robot.done[k] = true; G.ship.setRobotCargo(s.robot.items); }
    for (const p of s.pods || []) Pods.spawn(p);
    G.applyRunVisuals();
    if (s.rover) Rover.apply(s.rover);
    const me = G.me();
    if (me) {
      if (me.alive) G.spawnInShip(me, G.localId);
      else { Player.startDeath('join', null); HUD.notice('SPECTATING', '', false, 4); }
    }
  },
  // whatever colour a joining crewmate picked, nudged round the wheel if it's too close to someone already aboard
  distinctSuit(want) {
    const c = new THREE.Color().setHex(suitHex(want), THREE.SRGBColorSpace), hsl = {}, used = [...G.players.values()].map((p) => new THREE.Color().setHex(suitHex(p.color), THREE.SRGBColorSpace));
    const near = (x) => used.some((u) => Math.abs(u.r - x.r) + Math.abs(u.g - x.g) + Math.abs(u.b - x.b) < 0.18);
    c.getHSL(hsl, THREE.SRGBColorSpace);
    for (let i = 0; i < 12 && near(c); i++) c.setHSL((hsl.h + (i + 1) * 0.083) % 1, Math.max(0.35, hsl.s), Math.min(0.65, Math.max(0.3, hsl.l)), THREE.SRGBColorSpace);
    return '#' + c.getHexString(THREE.SRGBColorSpace);
  },
  onMessage(m, conn) {
    if (!m || typeof m !== 'object') return;
    if (G.isHost && conn) {
      if (m.t === 'hello') {
        if (m.v !== PROTO) { Net.sendTo(conn, { t: 'deny', reason: 'You and the host have different versions of the game. Both of you: close it and open it again (or reload the page), then try again.' }); return; }
        if (G.players.size >= 6 && !Bots.makeRoom()) { Net.sendTo(conn, { t: 'deny', reason: 'Lobby is full (6 crew max).' }); return; }
        const id = G.nextPid++;
        conn.pid = id;
        // (still in space, on the way down, counts as aboard: there's no day under way yet)
        const midRound = G.mode !== 'orbit' && !(G.mode === 'landing' && !G.round);
        const color = G.distinctSuit(m.suit);
        const info = { id, name: String(m.name || 'Crew').slice(0, 16), color, peerId: conn.conn.peer, x: 2, y: 0, z: 1, alive: !midRound, hp: midRound ? 0 : 100, zone: 'out' };
        G.emit({ e: 'join', p: info });
        Net.sendTo(conn, { t: 'welcome', id, s: G.fullState() });
        G.emit({ e: 'chat', text: info.name + ' joined the crew.', sys: true });
        G.timers.push({ t: 1.5, fn: () => G.emit({ e: 'peers', list: [...G.players.values()].map((p) => p.peerId).filter(Boolean) }) });
        return;
      }
      if (conn.pid == null) return;
      const p = G.players.get(conn.pid); if (!p) return;
      if (m.t === 'ps') {
        if (!p.alive) return;
        p.pos.set(m.x, m.y, m.z); p.yaw = m.yaw; p.pitch = m.pitch; p.flags = m.f; p.sel = m.sel;
        G.decodeFlags(p);
        p.buf.push({ t: G.now, x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch }); if (p.buf.length > 12) p.buf.shift();
        // (whoever's at the rover's console moves it)
        if (Array.isArray(m.rv) && Rover.state.driver === conn.pid) Rover.applyNet(m.rv);
      } else if (m.t === 'req') G.hostRequest(conn.pid, m.r || {});
      return;
    }
    G.onClientMessage(m);
  },
  onClientMessage(m) {
    switch (m.t) {
      case 'welcome': G.startClient(m.id, m.s); Menu.joined(); break;
      case 'deny': Menu.joinFailed(m.reason); break;
      case 'ev': G.applyEvent(m.e); break;
      case 'snap': G.applySnap(m); break;
      case 'term': HUD.termPrint(m.lines); break;
      case 'bye': G.quit('The host ended the session.'); break;
      default: break;
    }
  },
  encodeFlags(me) {
    return (me.crouch ? 1 : 0) | (me.sprint ? 2 : 0) | (me.moving ? 4 : 0) | (me.flash ? 8 : 0) | (me.flash === 2 ? 16 : 0) | (me.radio ? 32 : 0) | (Voice.talking ? 64 : 0) | (me.zone === 'in' ? 128 : 0)
      | ((me.seat != null ? me.seat + 1 : 0) << 8)   // which seat they're sitting in (0: standing)
      | (me.air ? 4096 : 0)                           // off the ground (jumping or falling, not walking a slope)
      | (Math.round(clamp(me.loud || 0, 0, 1) * 15) << 13);   // how loud they're talking (see Voice.loudness)
  },
  decodeFlags(p) {
    const f = p.flags;
    p.crouch = !!(f & 1); p.sprint = !!(f & 2); p.moving = !!(f & 4); p.flash = f & 8 ? (f & 16 ? 2 : 1) : 0; p.talking = !!(f & 64); p.radio = !!(f & 32) && p.talking;
    p.zone = f & 128 ? 'in' : 'out';
    const s = (f >> 8) & 15; p.seat = s ? s - 1 : null;
    p.air = !!(f & 4096);
    p.loud = p.talking ? ((f >> 13) & 15) / 15 : 0;
  },
  netTick(dt) {
    if (!G.online) return;
    G.sendT -= dt;
    if (G.sendT > 0) return;
    G.sendT = 0.05;
    const me = G.me();
    if (G.isHost) {
      const ps = [];
      for (const p of G.players.values()) {
        const f = p.id === G.localId ? G.encodeFlags(p) : p.flags;
        ps.push([p.id, +p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(2), f, p.sel]);
      }
      const ms = []; for (const m of G.monsters.values()) ms.push(m.serialize());
      // (tm: the time of day down on the site; ot: how far round its orbit the ship is, which sets where the sun, the
      // world and its moons are and how the light falls, so everyone aboard sees the same sky)
      const snap = { t: 'snap', tm: G.round ? G.round.time : 0, ot: +(G.orbitT || 60).toFixed(2), p: ps, m: ms };
      if (Rover.owned && Rover.state.carrier == null) snap.rv = Rover.netPose();
      Net.broadcast(snap);
    } else if (me) {
      const ps = { t: 'ps', x: +me.pos.x.toFixed(2), y: +me.pos.y.toFixed(2), z: +me.pos.z.toFixed(2), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(2), f: G.encodeFlags(me), sel: me.sel };
      if (Rover.driving) ps.rv = Rover.netPose();
      Net.send(ps);
    }
  },
  applySnap(m) {
    if (G.round && typeof m.tm === 'number') G.round.time = m.tm;
    // (the host's orbit clock: eased onto when close, jumped to when far out, after a pause or on joining)
    if (typeof m.ot === 'number') G.orbitT = Math.abs(m.ot - (G.orbitT || 0)) > 2 ? m.ot : G.orbitT + (m.ot - G.orbitT) * 0.2;
    for (const a of m.p) {
      if (a[0] === G.localId) continue;
      const p = G.players.get(a[0]); if (!p) continue;
      p.pos.set(a[1], a[2], a[3]); p.yaw = a[4]; p.pitch = a[5]; p.flags = a[6]; p.sel = a[7];
      G.decodeFlags(p);
      p.buf.push({ t: G.now, x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5] }); if (p.buf.length > 12) p.buf.shift();
    }
    for (const a of m.m) { const mon = G.monsters.get(a[0]); if (mon) mon.applySnap(a, G.now); }
    if (Array.isArray(m.rv) && Rover.state.carrier == null) Rover.applyNet(m.rv);
  },
  // ======================= events (all peers) =======================
  applyEvent(e) {
    const fn = G.EV[e.e];
    if (fn) { try { fn(e); } catch (err) { console.error('event error', e, err); } }
  },
  EV: {
    join(e) { G.addPlayer(e.p); },
    leave(e) { const p = G.players.get(e.id); if (p) HUD.chat('', p.name + ' left the crew.', 'sys'); G.removePlayer(e.id); },
    peers(e) { Voice.connect(e.list); },
    run(e) { G.run = e.run; G.applyRunVisuals(); },
    chat(e) {
      if (e.sys) { HUD.chat('', e.text, 'sys'); return; }
      const p = G.players.get(e.pid); if (!p) return;
      const me = G.me();
      if (e.radio) {
        // (the channel opening on the call, and the squelch tail as it closes)
        if (G.hasItem(G.localId, 'walkie') || e.pid === G.localId) { HUD.chat(p.name + ' [RADIO]', e.text, 'radio'); SFX.play('squelch_on', null, { vol: 0.5 }); SFX.play('squelch_off', null, { vol: 0.5, delay: 0.6 }); }
        // the call comes out of every other walkie-talkie: the words bob up over each set, dropped or in a hand
        for (const it of G.items.values()) {
          if (it.type !== 'walkie' || it.holder === e.pid) continue;
          if (it.holder === G.localId) { HUD.bubble('hand', e.text, 'radio'); continue; }
          const h = it.holder != null ? G.players.get(it.holder) : null;
          if (h && !h.alive) continue;
          HUD.bubble(() => (h ? h.rpos.clone().setY(h.rpos.y + 1.45) : it.vis.clone().setY(it.vis.y + 0.35)), e.text, 'radio', h ? h.zone : G.itemZone(it));
        }
        return;
      }
      // said out loud, it only carries so far: in the log within earshot, and hanging over the speaker's head (the
      // dead hear everyone, but only each other: the living never hear them)
      const near = p.zone === me.zone && p.pos.distanceTo(me.pos) < 22;
      if (p.alive ? !me.alive || e.pid === G.localId || near : !me.alive) HUD.chat(p.name, e.text, p.alive ? '' : 'sys');
      if (e.pid !== G.localId && p.alive) HUD.bubble(() => (p.alive ? p.rpos.clone().setY(p.rpos.y + (p.crouch ? 1.8 : 2.32)) : null), e.text, 'say', p.zone);
    },
    // the de-orbit burn: the screen goes dark through re-entry while the site is made ready
    landing(e) {
      G.mode = 'landing';
      G.seq = { kind: 'land', t: e.t || 0, site: e.site };
      G.ship.setEngines(1);
      HUD.closeTerminal(true);
    },
    // (anyone whose way down has fallen behind the host's catches up to it here, as the shutters close)
    sitePrep(e) { if (e.t != null && G.seq && G.seq.kind === 'land' && G.seq.t < e.t) G.seq.t = e.t; G.stageSite(e.seed, e.site, e.weather, e.ecl); },
    monitor(e) {
      if (G.run) G.run.mon = e.view;
      CrewCam.setView(e.view);
      if (e.radar) { CrewCam.radar(); SFX.play('scan', new THREE.Vector3(0, 1.45, -3.85), { vol: 0.7 }); }
    },
    // out of the cloud, high over the site: the powered descent begins
    land(e) {
      G.prepareSite(e.seed, e.site, e.weather, e.ecl);
      G.ship.space.visible = false;
      for (const d of e.items) G.createItem(d);
      G.round.total = e.items.reduce((s, d) => s + (ITEMS[d.type].kind === 'scrap' ? d.value : 0), 0);
      for (const it of G.items.values()) if (it.inShip || it.holder != null || it.basket != null) G.round.startShip.add(it.id);
      G.mode = 'site';
      G.ship.setDoor(false); G.ship.door.t = 0; G.ship.setLanded(false);
      G.flight = { kind: 'land', t: 0, aboard: new Set(G.alivePlayers().map((p) => p.id)) };
      G.updateFlight(0);
      if (!G.seq) G.seq = { kind: 'land', t: 1.2, site: e.site };
      const s = SITES[e.site];
      G.timers.push({ t: 3.4, fn: () => { HUD.notice(s.name.toUpperCase(), fmtTime(G.round.time) + ' · ' + { clear: 'CLEAR', fog: 'FOGGY', rain: 'RAINING', storm: 'STORMY' }[e.weather] + ' · RISK: ' + s.risk, false, 5); SFX.play('chime'); } });
    },
    hatch(e) {
      G.ship.setDoor(e.open); SFX.play('ship_door', new THREE.Vector3(-2.5, 1.3, 4), { vol: 1 });
      // the lock venting to space, or filling again
      if (e.vent) SFX.play('vent_air', new THREE.Vector3(-2.5, 1.5, 3.3), { vol: 1, dur: e.open ? 2.4 : 1.6, fill: !e.open });
      if (e.auto) { SFX.play('beep', new THREE.Vector3(-2.5, 2.8, 3.8), { f: 760, vol: 0.6 }); SFX.play('beep', new THREE.Vector3(-2.5, 2.8, 3.8), { f: 540, vol: 0.6, delay: 0.16 }); }
    },
    door(e) {
      const d = G.fac && G.fac.doors[e.id]; if (!d) return;
      const at = new THREE.Vector3(d.x, d.y + 1.2, d.z);
      if (e.broken) {
        G.fac.breakDoor(d); G.fac.doorVer = (G.fac.doorVer | 0) + 1;
        SFX.play('door_slam', at, { vol: 1.6, ref: 4 }); SFX.play('crunch', at, { vol: 1.1 }); SFX.play('hit_metal', at, { vol: 1 });
        const me = G.me(); if (me && me.zone === 'in' && me.pos.distanceTo(at) < 12) Player.addShake(0.45);
        return;
      }
      if (d.broken) return;
      G.fac.setDoor(d, e.open, e.dir);
      G.fac.doorVer = (G.fac.doorVer | 0) + 1;   // (the way sound carries has changed: see Brain.hear)
      SFX.play(e.bash ? 'door_slam' : e.open ? 'door_open' : 'door_close', at, { vol: e.bash ? 1.3 : 0.9 });
    },
    // a blast door raised or dropped from the ship's terminal: a warning tone, hydraulics, a heavy seat at the bottom
    blast(e) {
      const d = G.fac && G.fac.blasts[e.id]; if (!d) return;
      G.fac.setBlast(e.id, e.open);
      const at = new THREE.Vector3(d.x, d.y + 2.2, d.z);
      SFX.play('beep', at, { f: 420, vol: 0.8, ref: 6 }); SFX.play('beep', at, { f: 420, vol: 0.8, ref: 6, delay: 0.35 });
      SFX.play('servo', at, { vol: 1.5, ref: 6, dur: e.open ? 2.4 : 1.3, pitch: 0.45, delay: 0.5 });
      SFX.play('shutter', at, { vol: 0.9, ref: 6, dur: e.open ? 2.4 : 1.3, delay: 0.5 });
      if (!e.open) SFX.play('door_slam', at, { vol: 1.4, ref: 8, delay: 1.75 });
      if (G.isHost) G.addNoise(at, 22, 'in', null, 'bang');
    },
    box(e) {
      const c = G.fac && G.fac.containers[e.id]; if (!c) return;
      c.open = e.open;
      SFX.play(e.open ? 'locker_open' : 'locker_close', new THREE.Vector3(c.x, c.y + 1.1, c.z), { vol: 0.9, ref: 3 });
    },
    hp(e) { const p = G.players.get(e.pid); if (p) p.hp = e.hp; },
    pick(e) {
      const it = G.items.get(e.item), p = G.players.get(e.pid); if (!it || !p) return;
      it.holder = p.id; it.inShip = false; it.box = null; it.basket = null;
      for (const q of G.players.values()) { const k = q.slots.indexOf(it.id); if (k >= 0) q.slots[k] = null; }
      p.slots[e.slot] = it.id;
      if (p.id === G.localId) p.sel = e.slot;
      SFX.play('pickup', it.pos, { vol: 0.8 });
    },
    drop(e) {
      const it = G.items.get(e.item); if (!it) return;
      const p = G.players.get(it.holder);
      // (from the hand, or from a little over a shelf above it, so it's never seen to jump up onto it)
      // (set down on something raised, a desk or a shelf, it's lowered in just over it rather than dropped from the hand,
      // so it never passes through the shelf above)
      if (p) { const k = p.slots.indexOf(it.id); if (k >= 0) p.slots[k] = null; it.vis.set(p.pos.x, e.y > p.pos.y + 0.1 ? e.y + 0.12 : p.pos.y + 1.1, p.pos.z); }
      else it.vis.set(e.x, e.y + 0.5, e.z);
      it.holder = null; it.pos.set(e.x, e.y, e.z); it.ry = e.ry || 0; it.inShip = !!e.inShip;
      if (e.battery != null) it.battery = e.battery; if (e.on != null) it.on = e.on;
      it.fallV = 0;
    },
    // the rover: someone takes its console (or lets go of it); someone picks it up or sets it down
    rover(e) {
      const R0 = Rover.state; R0.driver = e.driver;
      if (e.driver === G.localId && !Rover.driving) Rover.startDriving();
      else if (e.driver !== G.localId && Rover.driving) Rover.stopDriving();
      if (e.driver != null) SFX.play('beep', G.ship.group.localToWorld(new THREE.Vector3(ROVER.CONSOLE.x, 1.2, ROVER.CONSOLE.z)), { f: 990, vol: 0.4 });
    },
    roverCarry(e) {
      const R0 = Rover.state; R0.carrier = e.pid;
      if (e.pid == null && e.x != null) Rover.apply({ x: e.x, y: e.y, z: e.z, yaw: e.yaw, zone: e.zone || 'out' });
      SFX.play(e.pid != null ? 'pickup' : 'drop', new THREE.Vector3(R0.x, R0.y + 0.2, R0.z), { vol: 0.9, metal: true, pitch: 0.7 });
    },
    // something put in the rover's basket
    basket(e) {
      const it = G.items.get(e.item); if (!it) return;
      const p = G.players.get(it.holder); if (p) { const k = p.slots.indexOf(it.id); if (k >= 0) p.slots[k] = null; }
      it.holder = null; it.box = null; it.inShip = false; it.basket = e.slot; it.fallV = 0;
      SFX.play('drop', new THREE.Vector3(Rover.state.x, Rover.state.y + 0.3, Rover.state.z), { vol: 0.6, metal: true, pitch: 1.2 });
    },
    // (fy: how far above where it settles it starts, so it drops into place)
    itemSpawn(e) { const it = G.createItem(e.d); it.vis.y += e.d.fy != null ? e.d.fy : 0.6; },
    // the inner airlock door; when it shuts by itself (a delivery coming), nobody gets shut in the chamber
    idoor(e) {
      G.ship.idoor.open = e.open; SFX.play('ship_door', new THREE.Vector3(-2.5, 1.2, AIRLOCK.z0), { vol: 0.8 });
      if (!e.open && e.auto) {
        const me = G.me();
        if (me && me.alive && me.zone === 'out' && me.pos.x > AIRLOCK.x0 && me.pos.x < AIRLOCK.x1 && me.pos.z > AIRLOCK.z0 - 0.4 && me.pos.z < 4.0) Player.spawn(me.pos.x, 0, AIRLOCK.z0 - 0.75, me.yaw);
      }
    },
    // the drone is on its way with an order
    delivery(e) {
      G.robot = { t: 0, items: e.items, done: {} };
      G.ship.setRobotCargo(e.items); G.ship.lockCycling = true;
      SFX.play('chime', G.ship.termPos, { vol: 0.7 });
      HUD.chat('', 'Mercy Supply: drone inbound, starboard side, docking in about ' + Math.round(DELIVERY.arrive) + ' seconds.', 'sys');
    },
    // the hyperjump to another world (the run's new route arrives with it; its sky is held back until drop-out)
    jump() {
      G.jumping = true; G.seq = { kind: 'jump', t: 0 };
      HUD.closeTerminal(true);
      SFX.play('warp_charge', null, { vol: 1, dur: JUMP.punch });
    },
    hop() {
      G.jumping = true; G.seq = { kind: 'hop', t: 0 };
      HUD.closeTerminal(true);
      SFX.play('engine', null, { dur: 3.6, vol: 1.1 });
    },
    // a supply pod on its way down, and one being cracked open
    meteors(e) { Meteors.spawn(e); },
    mist(e) { G.addMist(e); },
    // something on its way in (G.round.doom: when it hits, by the site's clock, and where it is in the sky)
    asteroid(e) { if (G.round) G.round.doom = { at: e.at, az: e.az, el: e.el }; },
    // still on the surface when it hit: the sky goes white, and that's the end of the contract
    doomed(e) {
      if (G.round) G.round.lost = true;
      G.seq = { kind: 'doomed', t: 0, data: e };
      for (const p of G.players.values()) if (p.alive) { p.alive = false; (G.deathCause || (G.deathCause = {}))[p.id] = 'impact'; }
      SFX.play('bang', null, { vol: 1.6 }); SFX.play('thud', null, { vol: 1.6 });
    },
    // and from orbit, having got away: it comes down on the moon we left (Ship.impact draws it)
    impact(e) { G.ship.impact(e.site, G.run.route, e.lat, e.lon); },
    pod(e) {
      Pods.spawn(e);
      // (the Company calls it in over the radio, so whoever wants to can go out and watch it come down)
      if (e.t == null) HUD.chat('', 'Mercy Supply: pod inbound, impact in about ' + Math.round(POD.WAIT + POD.GLINT + POD.FALL) + ' seconds. Stand clear of the ship.', 'sys');
    },
    podOpen(e) { const p = Pods.get(e.id); if (p && !p.opened) Pods.crack(p, false); },
    // more for a pod that's still being loaded
    podAdd(e) {
      const p = Pods.get(e.id); if (!p) return;
      p.items.push(...e.items);
      HUD.chat('', 'Mercy Supply: added to the pod already inbound.', 'sys');
    },
    lock(e) { G.ship.lockCycling = !!e.cycling; if (!e.cycling) SFX.play('beep', new THREE.Vector3(-2.5, 2.5, AIRLOCK.z0), { f: 1320, vol: 0.5 }); },
    itemDel(e) { G.removeItem(e.id); },
    // someone finished a snack: you hear it from them; if it was you, it kicks in
    eat(e) {
      if (e.pid === G.localId) { Player.ate(e.perk); return; }
      const p = G.players.get(e.pid); if (p) SFX.play(FOOD[e.type] ? FOOD[e.type].sound : 'can_open', p.rpos.clone().setY(p.rpos.y + 1.5), { vol: 0.7, ref: 2 });
    },
    itemState(e) { const it = G.items.get(e.id); if (it) { if (e.battery != null) it.battery = e.battery; if (e.on != null) it.on = e.on; } },
    hurt(e) {
      const p = G.players.get(e.pid); if (!p) return;
      p.hp = e.hp;
      if (p.id === G.localId) {
        if (!e.silent) { R.fx.damage = 1; SFX.play('hurt', null, { vol: 1 }); Player.knock(e.kx || 0, e.kz || 0); }
        else { R.fx.damage = Math.max(R.fx.damage, 0.35); }
      } else if (!e.silent) SFX.play('hit_flesh', p.pos.clone().setY(p.pos.y + 1.2), { vol: 0.9 });
    },
    die(e) {
      const p = G.players.get(e.pid); if (!p) return;
      p.alive = false; p.hp = 0;
      (G.deathCause || (G.deathCause = {}))[e.pid] = e.cause;
      const pos = new THREE.Vector3(e.x, e.y, e.z);
      const mon = e.mon != null ? G.monsters.get(e.mon) : null;
      if (e.cause === 'pale') SFX.play('neck_snap', pos.clone().setY(pos.y + 1.5), { vol: 1.3 });
      else if (e.cause === 'slime') SFX.play('slime_gulp', pos.clone().setY(pos.y + 1), { vol: 1.3 });
      else if (e.cause !== 'left') SFX.play('crunch', pos.clone().setY(pos.y + 1), { vol: 1.2 });
      if (e.cause !== 'left') {
        const body = new Avatar(p.name, p.color), live = p.avatar && p.avatar.root.visible ? p.avatar : null;
        if (e.cause === 'slime') { body.setDead(e.pid * 7 + Math.floor(e.x * 10)); body.root.position.copy(pos); body.root.rotation.y = p.yaw; }
        else {
          // the body goes limp from just as it stood, and is thrown
          if (live) G.copyPose(live, body);
          else { body.root.position.copy(pos); body.root.rotation.y = p.yaw; body.update(1 / 60, { at: pos, yaw: p.yaw, crouch: p.crouch }); }
          const th = G.deathThrow(e, pos, mon);
          if (live) th.vel.add(live.vel);
          body.goLimp(G.ragEnv(p.zone, pos), th.vel, th.spin);
          if (p.id === G.localId) G.myBody = body;
        }
        R.scene.add(body.root); G.corpses.push(body);
        if (e.cause === 'pale') G.timers.push({ t: 1.6, fn: () => { body.root.visible = false; } });
        // (the Seep swallows them whole: the body is drawn up into it and hangs there, carried along)
        if (e.cause === 'slime' && mon && mon.swallowed) mon.swallowed.push({ body, k: 0, lx: (Math.random() - 0.5) * 0.9, ly: 0.7 + Math.random() * 0.45, tilt: 0.5 + Math.random() * 0.6, yaw: p.yaw, spin: Math.random() * TAU });
      }
      if (p.avatar) p.avatar.root.visible = false;
      if (p.id === G.localId && G.sendoff) {
        // (left behind, the view is already out watching the ship go)
      } else if (p.id === G.localId) {
        Player.startDeath(e.cause, mon);
        const face = e.cause === 'pale' || e.cause === 'mannequin';
        R.fx.damage = face ? 0.25 : 1; R.fx.static = 0;
        if (face) { SFX.play('stinger_hi', null, { vol: 1.3 }); SFX.play('stinger', null, { vol: 1.2, pitch: 0.8 }); }
        G.timers.push({ t: face ? 0.62 : 1.6, fn: () => { R.fx.static = 1; SFX.play('static', null, { dur: 1.4, vol: 1.5 }); } });
        G.timers.push({ t: 3.2, fn: () => { R.fx.static = 0.25; HUD.notice('YOU DIED', (DEATH_TEXT[e.cause] || 'Killed') + '.', true, 4); } });
        HUD.struggle(false);
      } else {
        HUD.chat('', p.name + ' — ' + (DEATH_TEXT[e.cause] || 'killed').toLowerCase() + '.', 'sys');
      }
      if (G.leechOn === p.id) G.leechOn = null;
    },
    sound(e) { const at = new THREE.Vector3(e.x, e.y, e.z); SFX.play(e.s, at, e.o || {}); FX.onSound(e.s, at); if (e.s === 'charge' && G.ship) G.ship.charging(); },
    // a warning from the director (see Brain): your light stutters a moment
    cue(e) { if (e.pid === G.localId && e.k === 'light') G.cueT = 1.8; },
    monSpawn(e) { G.spawnMonster(e); },
    // the nest hit (hp left); at none it's burst
    nest(e) {
      const n = G.fac && G.fac.nest; if (!n) return;
      n.hp = e.hp; n.hitT = 0.35;
      if (e.hp <= 0) n.dead = true;
    },
    monDel(e) { const m = G.monsters.get(e.id); if (m) { R.scene.remove(m.mesh); m.dispose(); G.monsters.delete(e.id); if (m.glow) G.lightSources = G.lightSources.filter((s) => s !== m.glow); } },
    leech(e) {
      G.leechOn = e.pid;
      if (e.pid === G.localId) { SFX.play('squelch', null, { vol: 1.2 }); SFX.play('stinger_hi', null, { vol: 0.9 }); HUD.struggle(true); Player.addShake(0.6); }
      if (e.from === G.localId && e.pid == null) { HUD.struggle(false); SFX.play('chitter', null, { vol: 0.8 }); }
      if (e.pid == null && e.from !== G.localId) { /* nothing */ }
    },
    power(e) {
      if (!G.round) return;
      G.round.power = e.on; if (e.perm) G.round.coreTaken = true;
      const me = G.me();
      if (me && G.zoneOf(me) === 'in') SFX.play(e.on ? 'power_up' : 'power_down', null, { vol: 1 });
      if (G.fac) for (const l of G.fac.lamps) if (l.state !== 'emergency') G.fac.setLampVisual(l, e.on && l.state !== 'off' ? 1 : 0.04);
      // (the core pulled: the dark, then the emergency circuit, and its alarm)
      if (e.perm) G.startEmergency(false);
    },
    toast(e) { HUD.toast(e.text, 2.5); },
    jumpLever() { G.ship.pullJump(); SFX.play('lever', G.ship.jumpPos.clone(), { vol: 1 }); },
    notice(e) { const me = G.me(); if (!e.zone || (me && me.zone === e.zone)) HUD.notice(e.title, e.sub || '', !!e.danger, e.dur || 4); if (e.alarm) SFX.play('alarm', null, { vol: 0.7 }); },
    swing(e) { const p = G.players.get(e.pid); if (p && p.id !== G.localId) { p.swingT = 0.45; SFX.play('swing', p.pos.clone().setY(p.pos.y + 1.4), { vol: 0.8 }); } },
    throwFx(e) { G.grenades.push({ from: new THREE.Vector3(...e.from), to: new THREE.Vector3(...e.to), t: 0, dur: e.dur, bomb: e.bomb ?? null, mesh: (() => { const m = ItemMeshes.build(e.type || 'stun'); R.scene.add(m); return m; })() }); },
    // a charge's fuse has been lit (everyone hears it spit, wherever it goes)
    fuse(e) { G.fuses.push({ id: e.id, t: e.t, snd: 0 }); },
    gift(e) {
      if (e.pid !== G.localId) return;
      if (e.type === 'bomb') HUD.toast('The fuse is lit. Throw it!');
      else HUD.toast(e.what === 'dud' ? "A doll's head. Somebody's idea of a joke." : 'Inside: ' + ITEMS[e.type].name);
    },
    boom(e) {
      const pos = new THREE.Vector3(e.x, e.y, e.z);
      SFX.play('explosion', pos, { vol: 2.6, ref: 8 });
      G.blastFx(pos, e.zone);
      for (let i = G.grenades.length - 1; i >= 0; i--) if (G.grenades[i].bomb === e.id) { R.scene.remove(G.grenades[i].mesh); G.grenades.splice(i, 1); }
      G.fuses = G.fuses.filter((f) => f.id !== e.id);
      const me = G.me(); if (!me || me.zone !== e.zone) return;
      const cam = R.camera.position, d = cam.distanceTo(pos); if (d > 45) return;
      const los = e.zone !== 'in' || !G.fac || G.fac.los(cam.x, cam.z, pos.x, pos.z);
      Player.addShake(Math.min(1.4, 10 / (d + 2)) * (los ? 1 : 0.5));
      if (los && d < 26) { const dir = R.camera.getWorldDirection(new THREE.Vector3()), to = pos.clone().sub(cam).normalize(); R.fx.flash = Math.max(R.fx.flash, (dir.dot(to) > 0.3 ? 1.5 : 0.45) * (1 - d / 26)); }
      if (d < 11 && me.alive) SFX.play('tinnitus', null, { vol: 0.8 * (1 - d / 11) });
    },
    stunFx(e) {
      const pos = new THREE.Vector3(e.x, e.y, e.z);
      SFX.play('bang', pos, { vol: 2, ref: 6 });
      const me = G.me(); if (!me || !me.alive) return;
      const cam = R.camera.position, d = cam.distanceTo(pos);
      if (d < 14 && (me.zone !== 'in' || !G.fac || G.fac.los(cam.x, cam.z, pos.x, pos.z, true))) {
        const dir = R.camera.getWorldDirection(new THREE.Vector3()), to = pos.clone().sub(cam).normalize();
        const facing = dir.dot(to);
        R.fx.flash = Math.max(R.fx.flash, (facing > 0.3 ? 2.2 : 0.6) * (1 - d / 16));
        if (d < 9) SFX.play('tinnitus', null, { vol: 1 - d / 10 });
        Player.addShake(0.5);
      }
    },
    // takeoff: the engines spool up (last chance to run for it), then the ship lifts, tucks its gear and climbs out.
    // The hatch stays as it is; it shuts itself once the ship is too high.
    // someone caught the hatch's sill as the ship lifted and hauled themselves in: aboard after all
    board(e) {
      const f = G.flight, p = G.players.get(e.pid); if (!f || !f.aboard || !p) return;
      f.aboard.add(e.pid); if (f.left) f.left = f.left.filter((id) => id !== e.pid);
      p.pos.set((SHIP.doorX0 + SHIP.doorX1) / 2, 0, 3.4);
      if (e.pid === G.localId) { Player.spawn(p.pos.x, 0, p.pos.z, Math.PI); Player.addShake(0.6); SFX.play('clunk', null, { vol: 1 }); SFX.play('pant', null, { vol: 0.9 }); }
    },
    depart(e) {
      G.mode = 'leaving';
      SFX.play('alarm', null, { vol: 0.6 });
      const me = G.me();
      if (me && me.alive && !G.inShip(me)) HUD.notice('THE SHIP IS LEAVING', '', true, 4);
      else HUD.notice('DEPARTING', e.reason === 'dead' ? 'No life signs.' : e.reason === 'midnight' ? 'Midnight.' : '', false, 3);
      G.flight = { kind: 'takeoff', t: 0, aboard: null };
      G.updateFlight(0);
      // (the engines winding up: heard through the hull aboard, from the tail outside)
      SFX.play('spool', me && G.inShip(me) ? null : G.ship.exhaust.clone(), { vol: me && G.inShip(me) ? 0.55 : 1.2, ref: 12 });
    },
    orbit(e) {
      G.seq = { kind: 'orbit', t: 0, data: e };
    },
    quota(e) { HUD.notice(e.title, e.sub, false, 6); SFX.play('gong'); },
    fired(e) { G.seq = { kind: 'fired', t: 0, data: e }; SFX.play('fired', null, { vol: 1 }); HUD.notice('QUOTA NOT MET', 'The Company thanks you for your service.', true, 6); },
    revive() { },
  },
  finishOrbit(e) {
    G.endSendoff();
    const keep = new Set(e.keep);
    for (const it of [...G.items.values()]) if (!keep.has(it.id)) G.removeItem(it.id);
    G.teardownSite(false);
    G.run = e.run; G.applyRunVisuals();
    // (if the rover came home, it's back on its spot in the bay)
    Rover.state.driver = Rover.state.carrier = null; Rover.stopDriving(); Rover.dock();
    G.enterOrbitState();
    G.mode = 'orbit';
    G.deathCause = {};
    let i = 0;
    for (const p of G.players.values()) {
      // the dead are brought back aboard; whoever rode up stays right where they are (in their seat, say)
      const back = !p.alive || p.zone !== 'out' || !G.ship.inside(p.pos.x, p.pos.y + 0.5, p.pos.z);
      p.alive = true; p.hp = 100;
      if (p.avatar && back) { R.scene.remove(p.avatar.root); p.avatar = new Avatar(p.name, p.color); R.scene.add(p.avatar.root); }
      if ((p.id === G.localId || (G.isHost && p.bot)) && back) { G.spawnInShip(p, i); p.buf.length = 0; }
      i++;
    }
    HUD.hideSpectate(); HUD.struggle(false); R.fx.static = 0; R.fx.leech = 0; Player.clearPerks();
    G.showSummary(e.summary);
    if (G.isHost) { Bots.newDay(); G.save(); G.callSignal(); }
  },
  showSummary(s) {
    const rows = [
      ['Site', s.site], ['Scrap collected', '$' + s.collected + ` (${s.count} items)`], ['Scrap on site', '$' + s.total],
    ];
    if (s.lost) rows.push(['Scrap lost', '<span class="dead">-$' + s.lost + '</span>']);
    if (s.fine) rows.push(['Insurance deductible', '<span class="dead">-$' + s.fine + '</span>']);
    const deaths = s.deaths.length ? s.deaths.map((d) => `<div class="row"><span class="dead">${esc(d.name)}</span><span>${esc(DEATH_TEXT[d.cause] || d.cause)}</span></div>`).join('') : '<div class="row"><span>No casualties</span><span></span></div>';
    HUD.summary(`<h2>PERFORMANCE REPORT</h2><div class="sub">DAY ${s.day} · ${s.allDead ? '<span class="dead">ALL CREW LOST — AUTOPILOT RETURNED THE SHIP</span>' : 'SHIP RETURNED TO ORBIT'}</div>
      ${rows.map((r) => `<div class="row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}
      <div style="margin-top:10px;opacity:.75">CASUALTIES</div>${deaths}
      <div class="grade">${s.grade}</div>
      <div class="sub" style="text-align:center;margin-top:6px">${s.daysLeft > 0 ? s.daysLeft + (s.daysLeft === 1 ? ' DAY' : ' DAYS') + ' UNTIL DEADLINE' : 'DEADLINE REACHED'}</div>`, 'CONTINUE');
  },
  spawnMonster(e) {
    if (G.monsters.has(e.id)) return G.monsters.get(e.id);
    const m = new Monster(G, e.id, e.type, e.x, e.y, e.z);
    if (e.home) m.home = true;
    G.monsters.set(e.id, m); R.scene.add(m.mesh);
    if (e.id >= G.nextMonId) G.nextMonId = e.id + 1;
    return m;
  },
  // ======================= host logic =======================
  // is a course to k a short hop between a world and its moon or rock (rather than a jump to another world)?
  // (or across from one of a giant's moons to another)
  isHop(k) { const cur = SITES[G.run.route], b = SITES[k].bonus; return !!((b && (b === G.run.route || b === cur.bonus)) || (cur.bonus && cur.bonus === k)); },
  // why a course to k can't be flown right now (or null)
  routeProblem(k) {
    const run = G.run, hop = G.isHop(k);
    // (a moon or rock only while it's showing a beacon, and only from the world it circles)
    // (a giant's moons are always open, and can be jumped to straight from anywhere)
    const open = SITES[k].open;
    if (SITES[k].bonus && !open && G.signal(run) !== k) return 'NO BEACON THERE TODAY. Try SITES.';
    if (SITES[k].bonus && !open && !hop) return 'ROUTE TO ' + SITES[SITES[k].bonus].name.toUpperCase() + ' FIRST.';
    if (!hop && SITES[k].cost > run.credits) return `INSUFFICIENT CREDITS ($${SITES[k].cost} needed)`;
    return null;
  },
  // the JUMP lever pulled: off on the plotted course, a jump to the new world, or a short hop across to its moon or
  // back (everyone aboard rides it; the sky changes when the ship gets there). Returns why not, if it can't.
  hostEngage() {
    const run = G.run, k = run && run.course;
    if (G.mode !== 'orbit') return 'Jump drive: only in orbit.';
    if (!k) return 'No course plotted. ROUTE at the terminal.';
    if (G.flight || G.seq || G.robot || G.jumping) return 'Jump drive busy.';
    const why = G.routeProblem(k); if (why) { delete run.course; G.emit({ e: 'run', run }); return why.charAt(0) + why.slice(1).toLowerCase(); }
    const hop = G.isHop(k);
    // (a jump to another world leaves this one's fresh craters behind, and anything still on its way in to them)
    if (!hop) { run.credits -= SITES[k].cost; run.scars = []; delete run.doom; }
    run.route = k; delete run.course;
    G.emit({ e: 'jumpLever' });
    G.emit({ e: hop ? 'hop' : 'jump', route: k });
    G.emit({ e: 'run', run }); G.save();
    return null;
  },
  hostRequest(pid, r) {
    const p = G.players.get(pid); if (!p) return;
    // clients report where they were when they acted (tolerates network lag)
    let at = p.pos;
    if (Array.isArray(r.p) && r.p.length === 3) { const v = new THREE.Vector3(r.p[0], r.p[1], r.p[2]); if (v.distanceTo(p.pos) < 10) at = v; }
    switch (r.a) {
      case 'pick': {
        const it = G.items.get(r.item);
        if (!it || it.holder != null || !p.alive) return;
        if (it.pos.distanceTo(at) > 5 || G.itemSealed(it)) return;
        let slot = r.slot;
        if (slot == null || slot < 0 || slot >= p.slots.length || p.slots[slot] != null) slot = p.slots.indexOf(null);
        if (slot < 0) return;
        G.emit({ e: 'pick', item: it.id, pid, slot });
        if (it.type === 'core' && G.round && !G.round.coreTaken) G.hostCoreTaken();
        break;
      }
      case 'drop': {
        const it = G.items.get(r.item); if (!it || it.holder !== pid) return;
        const inShip = p.zone === 'out' && G.ship.inside(r.x, r.y + 0.3, r.z);
        G.emit({ e: 'drop', item: it.id, x: r.x, y: r.y, z: r.z, ry: r.ry, inShip, battery: r.battery, on: r.on });
        G.addNoise(new THREE.Vector3(r.x, r.y, r.z), ITEMS[it.type].weight > 4 ? 10 : 5, p.zone, pid, 'item');
        break;
      }
      case 'swing': G.hostSwing(pid, r); break;
      // (caught the sill of the hatch as the ship lifted: see updateFlight)
      case 'board': {
        const f = G.flight;
        if (!f || f.kind !== 'takeoff' || !f.aboard || f.aboard.has(pid) || f.t > FLY.liftAt + FLY.grab + 0.5 || !p.alive || p.zone !== 'out') return;
        const sill = new THREE.Vector3((SHIP.doorX0 + SHIP.doorX1) / 2, 0, 4.35).applyMatrix4(G.shipM);
        if (Math.hypot(sill.x - p.pos.x, sill.z - p.pos.z) > 3) return;
        G.emit({ e: 'board', pid });
        break;
      }
      case 'throw': G.hostThrow(pid, r); break;
      case 'noise': {
        const it = G.items.get(r.item); if (!it || it.holder !== pid) return;
        const d = ITEMS[it.type]; if (!d.noise) return;
        const pos = p.pos.clone().setY(p.pos.y + 1.2);
        G.emitSound(d.noise, pos, { vol: 1.3, ref: 4 });
        G.addNoise(pos, d.noiseR || 20, p.zone, pid, 'item');
        break;
      }
      case 'door': {
        const d = G.fac && G.fac.doors[r.id]; if (!d || !p.alive || d.broken || d.latch) return;
        if (Math.hypot(d.x - at.x, d.z - at.z) > 4.5) return;
        if (G.now - (d.lastT || 0) < 350) return;
        d.lastT = G.now;
        const dir = G.doorDirFrom(d, at), fac = G.fac, by = new THREE.Vector3(d.x, d.y + 1, d.z);
        // opening, the handle goes down and the latch clicks back first; a moment later the door swings
        if (!d.open) {
          d.latch = true;
          G.emitSound('click', by, { vol: 0.9 });
          G.timers.push({ t: 0.32, fn: () => { d.latch = false; if (G.fac !== fac || d.open || d.broken) return; G.emit({ e: 'door', id: d.id, open: true, dir }); G.addNoise(by, 10, 'in', pid, 'door'); } });
          break;
        }
        G.emit({ e: 'door', id: d.id, open: false, dir });
        G.addNoise(by, 10, 'in', pid, 'door');
        break;
      }
      case 'box': {
        const c = G.fac && G.fac.containers[r.id]; if (!c || !p.alive || c.latch) return;
        if (Math.hypot(c.x - at.x, c.z - at.z) > 3.5 || G.now - (c.lastT || 0) < 400) return;
        c.lastT = G.now;
        const fac = G.fac, by = new THREE.Vector3(c.x, c.y + 1, c.z);
        // (a locker's catch takes a moment too)
        if (!c.open) {
          c.latch = true;
          G.emitSound('click', by, { vol: 0.7 });
          // rusty hinges and a rattling steel door: anything nearby hears you rummaging
          G.timers.push({ t: 0.25, fn: () => { c.latch = false; if (G.fac !== fac || c.open) return; G.emit({ e: 'box', id: c.id, open: true }); G.addNoise(by, 9, 'in', pid, 'door'); } });
          break;
        }
        G.emit({ e: 'box', id: c.id, open: false });
        G.addNoise(by, 9, 'in', pid, 'door');
        break;
      }
      case 'hatch': {
        // it opens on the ground, and in the air while the ship is low; never in space or up high
        if ((G.mode !== 'site' && G.mode !== 'leaving') || (G.fp && G.fp.y > FLY.doorAlt)) { G.sendTo(pid, { t: 'ev', e: { e: 'toast', text: 'Hatch locked.' } }); return; }
        G.emit({ e: 'hatch', open: !G.ship.door.open });
        G.addNoise(new THREE.Vector3(-2.5, 1, 4.5), 22, 'out', pid, 'door');
        break;
      }
      case 'engage': {
        if (p.zone !== 'out' || !G.ship.jumpPos || Math.hypot(at.x - G.ship.jumpPos.x, at.z - G.ship.jumpPos.z) > 2.5) return;
        const why = G.hostEngage();
        if (why) { G.emitSound('err', G.ship.jumpPos, { vol: 0.6 }); G.sendTo(pid, { t: 'ev', e: { e: 'toast', text: why } }); }
        break;
      }
      case 'lever': {
        if (G.flight || G.robot || G.seq) return;
        if (G.mode === 'orbit') G.hostLand();
        else if (G.mode === 'site') G.hostDepart('lever');
        break;
      }
      case 'term': G.hostTerminal(pid, String(r.cmd || '').slice(0, 60)); break;
      // (a line starting with / is a command, not something said out loud)
      case 'chat': if (String(r.text || '').startsWith('/')) Bots.command(pid, String(r.text).slice(0, 60)); else G.emit({ e: 'chat', pid, text: String(r.text || '').slice(0, 120), radio: !!r.radio && p.alive && G.hasItem(pid, 'walkie') }); break;
      case 'struggle': {
        for (const m of G.monsters.values()) if (m.type === 'leech' && m.state === 'attached' && m.victim === pid) { m.grip -= 8 + Math.random() * 4; if (m.grip <= 0) m.detach(); }
        break;
      }
      case 'idoor': {
        if (p.zone !== 'out' || Math.hypot(at.x - (SHIP.doorX0 + SHIP.doorX1) / 2, at.z - AIRLOCK.z0) > 4) return;
        if (G.ship.lockCycling) { G.sendTo(pid, { t: 'ev', e: { e: 'toast', text: 'Locked.' } }); return; }
        G.emit({ e: 'idoor', open: !G.ship.idoor.open });
        break;
      }
      case 'pod': {
        const pod = Pods.get(r.id); if (!pod || pod.opened || !pod.hit || p.zone !== 'out' || Math.hypot(at.x - pod.x, at.z - pod.z) > 6) return;
        G.emit({ e: 'podOpen', id: pod.id });
        G.addNoise(new THREE.Vector3(pod.x, pod.gy + 1, pod.z), 20, 'out', pid, 'bang');
        const spots = Pods.dropSpots(pod, pod.items.length);
        pod.items.forEach((it, i) => G.emit({ e: 'itemSpawn', d: { id: it.id, type: it.type, value: 0, x: spots[i].x, y: spots[i].y, z: spots[i].z, ry: Math.random() * TAU, inShip: false, battery: 1, fy: 0.5 } }));
        break;
      }
      case 'eat': {
        const it = G.items.get(r.item); if (!it || it.holder !== pid || !p.alive || ITEMS[it.type].kind !== 'food') return;
        const F = FOOD[it.type], perk = new RNG((Math.random() * 1e9) | 0).weighted(F.perks), P = PERKS[perk];
        G.emit({ e: 'itemDel', id: it.id });
        if (P.heal && p.hp < 100) { p.hp = Math.min(100, p.hp + P.heal); G.emit({ e: 'hp', pid, hp: p.hp }); }
        G.emit({ e: 'eat', pid, type: it.type, perk });
        break;
      }
      // a gift torn open: it's gone, and whatever was in it is in their hand. Usually cash or something worth more,
      // a tool, a snack, a joke... and once in a while a charge with its fuse already burning
      case 'gift': {
        const it = G.items.get(r.item); if (!it || it.holder !== pid || !p.alive || !ITEMS[it.type].gift) return;
        const slot = p.slots.indexOf(it.id), rng = new RNG((Math.random() * 1e9) | 0);
        const mult = G.round ? SITES[G.round.site].mult : 1;
        const what = rng.weighted({ cash: 30, treasure: 22, tool: 16, snack: 12, dud: 13, bomb: 7 });
        const type = what === 'cash' ? 'cash' : what === 'treasure' ? rng.pick(['goldbar', 'watch', 'candelabra', 'mask', 'bell', 'toy'])
          : what === 'tool' ? rng.pick(['proflash', 'stun', 'tracker', 'walkie', 'flashlight', 'mappad']) : what === 'snack' ? rng.pick(['nightshift', 'cola', 'ration'])
          : what === 'dud' ? 'doll' : 'bomb';
        const d = ITEMS[type];
        const value = d.kind === 'scrap' ? Math.max(4, Math.round(rng.range(d.value[0], d.value[1]) * mult * SCRAP_SCALE * (what === 'treasure' ? 1.35 : what === 'dud' ? 0.35 : 1))) : 0;
        G.emit({ e: 'itemDel', id: it.id });
        const id = G.nextItemId++;
        G.emit({ e: 'itemSpawn', d: { id, type, value, x: p.pos.x, y: p.pos.y, z: p.pos.z, ry: 0, inShip: false, battery: 1, fy: 0 } });
        G.emit({ e: 'pick', item: id, pid, slot: slot >= 0 ? slot : Math.max(0, p.slots.indexOf(null)) });
        G.emit({ e: 'gift', pid, type, what });
        if (type === 'bomb') { G.bombs.push({ id, t: 3.4, pid }); G.emit({ e: 'fuse', id, t: 3.4 }); }
        break;
      }
      // the main screen is the ship's, not yours: what one crewmate puts on it is what everyone sees (and it stays)
      case 'monitor': {
        if (p.zone !== 'out' || !G.run || Math.hypot(at.x, at.z + 3.875) > 3.5) return;
        // (the pages: the crew's cams, a map following each crewmate, the hull cams)
        const crew = [...G.players.values()].sort((a, b) => a.id - b.id), n = crew.length + 2;
        let view = (G.run.mon || 0) % n;
        if (r.act === 'radar') {
          // from either set of cams, the sweep follows the first crewmate out in the field (or whoever pressed it)
          if (view === 0 || view === n - 1) { const i = crew.findIndex((q) => q.alive && !G.inShip(q)); view = (i >= 0 ? i : crew.findIndex((q) => q.id === pid)) + 1; }
        } else view = (((view + (r.act === 'next' ? 1 : -1)) % n) + n) % n;
        G.run.mon = view;
        G.emit({ e: 'monitor', view, radar: r.act === 'radar' });
        break;
      }
      case 'lamp': {
        const it = G.items.get(r.item); if (!it || it.holder !== pid || !ITEMS[it.type].lamp) return;
        G.emit({ e: 'itemState', id: it.id, on: !!r.on && !(ITEMS[it.type].battery && it.battery <= 0) });
        break;
      }
      case 'charge': {
        const it = G.items.get(r.item); if (!it || it.holder !== pid || !ITEMS[it.type].battery) return;
        // it takes a while: the charger's lamps fill one by one as the cell takes the charge, a sixth at a time, and
        // it's only full once the last is lit (put it away or walk off and it keeps what it got); one thing at a time
        const now = performance.now() / 1000; if (G.charging && now - G.charging.at < 3) return;
        const b0 = it.battery, c = (G.charging = { id: it.id, at: now });
        G.emitSound('charge', new THREE.Vector3(-3.6, 1.3, -3.7), {});
        for (let k = 1; k <= 6; k++) G.timers.push({ t: k * 0.4, fn: () => {
          if (G.charging !== c) return;
          const q = G.items.get(c.id), p = G.players.get(pid);
          if (!q || q.holder !== pid || !p || p.zone === 'in' || Math.hypot(p.pos.x + 3.6, p.pos.z + 3.75) > 2.4) { G.charging = null; return; }
          G.emit({ e: 'itemState', id: q.id, battery: Math.max(q.battery, b0 + (1 - b0) * k / 6) });
          if (k === 6) G.charging = null;
        } });
        break;
      }
      // the rover: one driver at a time, from the console in the bay; nobody drives it while the ship's flying
      case 'drive': {
        const R0 = Rover.state, C = ROVER.CONSOLE;
        if (!Rover.owned || R0.driver != null || R0.carrier != null || !p.alive || p.zone !== 'out' || G.flight || G.mode !== 'site') return;
        if (Math.hypot(at.x - C.x, at.z - C.z) > 2) return;
        G.emit({ e: 'rover', driver: pid });
        break;
      }
      case 'undrive': if (Rover.state.driver === pid) G.emit({ e: 'rover', driver: null }); break;
      case 'roverHorn': {
        const R0 = Rover.state; if (R0.driver !== pid) return;
        G.emitSound('toot', new THREE.Vector3(R0.x, R0.y + 0.3, R0.z), { vol: 1.2 });
        G.addNoise(new THREE.Vector3(R0.x, R0.y + 0.3, R0.z), 16, R0.zone, pid, 'bang');
        break;
      }
      case 'basketPut': {
        const R0 = Rover.state, it = G.items.get(r.item);
        if (!Rover.owned || !it || it.holder !== pid || R0.carrier != null || p.zone !== R0.zone || at.distanceTo(new THREE.Vector3(R0.x, R0.y, R0.z)) > 3) return;
        const slot = Rover.freeSlot(); if (slot < 0) return;
        G.emit({ e: 'basket', item: it.id, slot });
        break;
      }
      case 'basketTake': {
        const R0 = Rover.state, it = G.items.get(r.item);
        if (!it || it.basket == null || !p.alive || p.zone !== R0.zone || at.distanceTo(new THREE.Vector3(R0.x, R0.y, R0.z)) > 3) return;
        let slot = r.slot; if (slot == null || slot < 0 || slot >= p.slots.length || p.slots[slot] != null) slot = p.slots.indexOf(null);
        if (slot < 0) return;
        G.emit({ e: 'pick', item: it.id, pid, slot });
        break;
      }
      // picked up in both arms (not while someone's driving it, or someone else has it)
      case 'roverPick': {
        const R0 = Rover.state;
        if (!Rover.owned || R0.driver != null || R0.carrier != null || !p.alive || p.zone !== R0.zone || at.distanceTo(new THREE.Vector3(R0.x, R0.y, R0.z)) > 3) return;
        G.emit({ e: 'roverCarry', pid });
        break;
      }
      case 'roverDrop': {
        const R0 = Rover.state; if (R0.carrier !== pid) return;
        const x = +r.x, y = +r.y, z = +r.z; if (![x, y, z].every(Number.isFinite) || Math.hypot(x - p.pos.x, z - p.pos.z) > 3) return;
        G.emit({ e: 'roverCarry', pid: null, x, y, z, yaw: +r.yaw || 0, zone: p.zone });
        G.addNoise(new THREE.Vector3(x, y, z), 8, p.zone, pid, 'item');
        break;
      }
      default: break;
    }
  },
  emitSound(s, pos, o) { G.emit({ e: 'sound', s, x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), o }); },
  // something the creatures might hear (see Brain.hear): how far it carries, and what kind of noise it is (step, voice,
  // item, door, bang); src: the creature that made it, which doesn't go after its own din
  addNoise(pos, r, zone, pid, kind = 'bang', src) { G.noises.push({ x: pos.x, y: pos.y, z: pos.z, r, zone, pid, age: 0, kind, src }); },
  hurtPlayer(pid, dmg, cause, kx = 0, kz = 0, silent = false) {
    const p = G.players.get(pid); if (!p || !p.alive) return;
    const hp = Math.max(0, p.hp - dmg);
    p.lastHurt = G.now;
    if (hp <= 0) { G.killPlayer(pid, cause, undefined, kx, kz); return; }
    p.hp = hp;
    G.emit({ e: 'hurt', pid, hp, cause, kx, kz, silent });
  },
  killPlayer(pid, cause, monId, kx = 0, kz = 0) {
    const p = G.players.get(pid); if (!p || !p.alive) return;
    p.alive = false;
    const ground = p.zone === 'in' ? G.fac.floorY(p.pos.x, p.pos.z, p.pos.y) : G.groundAt(p.pos.x, p.pos.z);
    // (aboard, what they held goes down on the deck round them, short of the walls and the consoles)
    const aboard = p.zone !== 'in' && !p.roof && G.ship.inside(p.pos.x, p.pos.y + 0.3, p.pos.z);
    p.slots.forEach((id, i) => {
      if (id == null) return;
      const a = Math.random() * TAU, d = aboard ? G.ship.reach(p.pos.x, p.pos.z, Math.cos(a), Math.sin(a), 0.5, () => false) : 0.5, x = p.pos.x + Math.cos(a) * d, z = p.pos.z + Math.sin(a) * d;
      const ok = p.zone !== 'in' || !G.fac || G.fac.walkable(G.fac.ti(x), G.fac.tj(z)) || G.fac.floorAt(G.fac.ti(x), G.fac.tj(z));
      const fx = ok ? x : p.pos.x, fz = ok ? z : p.pos.z;
      G.emit({ e: 'drop', item: id, x: fx, y: ground, z: fz, ry: Math.random() * TAU, inShip: p.zone === 'out' && G.ship.inside(fx, ground + 0.3, fz) });
    });
    G.hostRoverRelease(p);
    G.emit({ e: 'die', pid, cause, mon: monId, x: p.pos.x, y: ground, z: p.pos.z, kx: Math.round(kx * 10) / 10, kz: Math.round(kz * 10) / 10 });
    for (const m of G.monsters.values()) if (m.type === 'leech' && m.victim === pid) m.detach();
    if (G.run) G.run.deaths = (G.run.deaths || 0) + 1;
  },
  // the world a body falls in, for its ragdoll: the facility's floors, ceilings and walls; outside the ground, its
  // rocks and trees and the ship where it stands; aboard in orbit the deck and the cabin's walls (and the light pull
  // of a small moon out on its surface)
  ragEnv(zone, at) {
    const g = 14 * G.gravity(zone, at.x, at.y, at.z);
    if (zone === 'in' && G.fac) { const f = G.fac; return { g, floor: (x, z, y) => f.floorY(x, z, y), ceil: (x, z, y) => f.ceilY(x, z, y), push: (p, r) => f.collide(p, r) }; }
    if (!G.ext) return { g, floor: () => 0, push: (p, r) => G.ship.collide(p, r) };
    return { g, floor: (x, z) => G.groundAt(x, z, G.ship.airborne), push: (p, r) => { G.ext.collide(p, r); if (!G.ship.airborne) G.ship.collide(p, r); } };
  },
  // how a body goes as it dies: thrown away from what killed it (the blow's own push, or else away from the creature),
  // the harder the blow the harder, the top of it going first so it topples over the way it was hit
  deathThrow(e, pos, mon) {
    const k = { blast: 8, meteor: 10, impact: 10, executioner: 5, clown: 5, crawler: 4.5, hound: 4, friend: 3.5, sister: 3, bound: 2.5, water: 0.4 }[e.cause] ?? 2;
    const d = new THREE.Vector3(e.kx || 0, 0, e.kz || 0);
    if (d.lengthSq() < 1e-4 && mon && mon.pos) d.set(pos.x - mon.pos.x, 0, pos.z - mon.pos.z);
    if (d.lengthSq() < 1e-4) d.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    d.normalize();
    const wob = () => (Math.random() - 0.5) * 2;
    return { vel: d.clone().multiplyScalar(k).setY(k * 0.35), spin: new THREE.Vector3(d.z, 0, -d.x).multiplyScalar(1.2 + k * 0.4).add(new THREE.Vector3(wob(), wob() * 1.5, wob())) };
  },
  // one robot standing just as another is (for a body taking over from the living one)
  copyPose(a, b) {
    for (const k of ['root', 'body', 'hips', 'torso', 'head']) { b[k].position.copy(a[k].position); b[k].quaternion.copy(a[k].quaternion); }
    for (const L of ['armL', 'armR']) for (const j of ['g', 'elbow', 'hand']) b[L][j].quaternion.copy(a[L][j].quaternion);
    for (const L of ['legL', 'legR']) for (const j of ['g', 'knee', 'ankle']) b[L][j].quaternion.copy(a[L][j].quaternion);
  },
  canSee(p, pos, maxD, dotMin) {
    const ey = p.pos.y + (p.crouch ? 1.0 : 1.6);
    const dx = pos.x - p.pos.x, dy = pos.y - ey, dz = pos.z - p.pos.z, d = Math.hypot(dx, dy, dz);
    if (d > maxD || d < 0.01) return d < 0.01;
    const cp = Math.cos(p.pitch);
    const fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
    if ((dx * fx + dy * fy + dz * fz) / d < dotMin) return false;
    if (p.zone === 'in' && G.fac) return G.fac.los(p.pos.x, p.pos.z, pos.x, pos.z, true);
    return true;
  },
  // whether someone has a lamp lit in their hands or on their belt
  carriesLight(p) { for (const it of G.items.values()) if (it.holder === p.id && it.on && ITEMS[it.type].lamp) return true; return false; },
  // A Bound's mist: a cloud of something that eats through a suit, hanging where it landed and drifting apart over a few
  // seconds. Everyone sees it; the host hurts whoever's in it
  addMist(e) {
    const grp = G.fac && G.fac.group; if (!grp) return;
    const mist = { x: e.x, y: e.y, z: e.z, t: 0, puffs: [], hurtT: 0 };
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('puff'), color: new THREE.Color(0.62, 0.66, 0.3), transparent: true, opacity: 0, depthWrite: false }));
      const a = Math.random() * TAU, r = Math.random() * 1.1;
      sp.userData.o = { x: Math.cos(a) * r, y: 0.3 + Math.random() * 1.4, z: Math.sin(a) * r, s: 1.2 + Math.random() * 1.2, d: Math.random() * 0.25 };
      sp.position.set(e.fx, e.fy, e.fz); grp.add(sp); mist.puffs.push(sp);
    }
    mist.from = { x: e.fx, y: e.fy, z: e.fz };
    (G.mists || (G.mists = [])).push(mist);
    SFX.play('mist_hiss', new THREE.Vector3(e.x, e.y + 1, e.z), { vol: 1, ref: 3, delay: 0.3 });
  },
  stepMists(dt) {
    if (!G.mists || !G.mists.length) return;
    for (let i = G.mists.length - 1; i >= 0; i--) {
      const m = G.mists[i]; m.t += dt;
      // (flung from its mouth to where it lands, then blooming out and thinning away)
      for (const sp of m.puffs) {
        const o = sp.userData.o, u = clamp((m.t - o.d) / 0.35, 0, 1), k = sstep(0, 1, u), age = Math.max(0, m.t - 0.35 - o.d);
        sp.position.set(lerp(m.from.x, m.x + o.x * (1 + age * 0.15), k), lerp(m.from.y, m.y + o.y + age * 0.08, k) + Math.sin(k * Math.PI) * 0.6, lerp(m.from.z, m.z + o.z * (1 + age * 0.15), k));
        sp.scale.setScalar(lerp(0.25, o.s * (1 + age * 0.12), k));
        sp.material.opacity = (u < 1 ? 0.5 : 0.62) * (1 - sstep(3.5, 6, m.t));
      }
      if (G.isHost && m.t > 0.4 && m.t < 5.5) {
        m.hurtT -= dt;
        if (m.hurtT <= 0) {
          m.hurtT = 0.5;
          for (const p of G.alivePlayers()) if (p.zone === 'in' && Math.hypot(p.pos.x - m.x, p.pos.z - m.z) < 2.0 && Math.abs(p.pos.y - m.y) < 1.5) G.hurtPlayer(p.id, 8, 'bound', 0, 0);
        }
      }
      if (m.t > 6) { for (const sp of m.puffs) { if (sp.parent) sp.parent.remove(sp); sp.material.dispose(); } G.mists.splice(i, 1); }
    }
  },
  isLit(pos) {
    for (const p of G.alivePlayers()) {
      if (!p.flash) continue;
      const range = p.flash === 2 ? 30 : 21;
      if (G.canSee(p, pos, range, 0.9)) return true;
    }
    if (G.fac && G.round) for (const l of G.fac.lamps) {
      if (l.state === 'off') continue;
      if (!G.round.power && l.state !== 'emergency') continue;
      if (Math.abs(l.x - pos.x) < 5 && Math.abs(l.z - pos.z) < 5 && Math.hypot(l.x - pos.x, l.z - pos.z) < 4.5 && G.fac.los(l.x, l.z, pos.x, pos.z, true)) return true;
    }
    return false;
  },
  // doors swing away from whoever pushes them: +1 into the room, -1 into the corridor
  doorDirFrom(d, p) { return (p.x - d.x) * d.nx + (p.z - d.z) * d.nz > 0 ? -1 : 1; },
  monsterOpenDoor(m, door, bash) {
    if (door.open || G.now - (door.lastT || 0) < 600) return;
    door.lastT = G.now;
    G.emit({ e: 'door', id: door.id, open: true, bash: !!bash, dir: G.doorDirFrom(door, m.pos) });
  },
  // a creature brushing past an open door's leaf (not the doorway it's going through) knocks it shut behind it
  monsterShoveDoor(m, door) {
    if (!door.open || door.broken || door.latch || G.now - (door.lastT || 0) < 600) return;
    door.lastT = G.now;
    G.emit({ e: 'door', id: door.id, open: false, dir: door.dir });
  },
  monsterBreakDoor(m, door) {
    if (door.broken) return;
    G.emit({ e: 'door', id: door.id, open: true, broken: true });
    G.addNoise(new THREE.Vector3(door.x, door.y + 1, door.z), 26, 'in', null, 'bang', m && m.id);
  },
  monsterDied() { },
  leechAttach(m, pid) { G.emit({ e: 'leech', pid, mid: m.id }); },
  leechDetach(m, pid) { G.emit({ e: 'leech', pid: null, mid: m.id, from: pid }); },
  hostSwing(pid, r) {
    const p = G.players.get(pid); if (!p || !p.alive) return;
    G.emit({ e: 'swing', pid });
    const o = new THREE.Vector3(...r.o), d = new THREE.Vector3(...r.d).normalize();
    let best = null, bestAlong = Infinity;
    for (const m of G.monsters.values()) {
      if (m.dead || m.def.zone !== p.zone) continue;
      const c = m.type === 'leech' ? m.pos.clone() : m.pos.clone().setY(m.pos.y + m.def.height * 0.5);
      const v = c.sub(o), along = v.dot(d);
      if (along < 0 || along > 2.4 + m.def.radius) continue;
      const perp = v.sub(d.clone().multiplyScalar(along)).length();
      if (perp < 0.8 + m.def.radius * 0.6 && along < bestAlong) { bestAlong = along; best = m; }
    }
    if (best) { best.onHit(1, pid); return; }
    // the nest: anywhere up it, in reach
    const nest = p.zone === 'in' && G.fac && G.fac.nest;
    if (nest && !nest.dead) for (const c of nest.spine) {
      const v = c.clone().sub(o), along = v.dot(d);
      if (along < 0 || along > 2.9 || v.sub(d.clone().multiplyScalar(along)).length() > 0.95) continue;
      const at = o.clone().addScaledVector(d, Math.max(0.3, along - 0.6));
      G.emit({ e: 'nest', hp: nest.hp - 1 }); G.emitSound('hit_flesh', at, { vol: 1.2, ref: 5 });
      if (!nest.dead) G.hostNestFlood(p);
      // (the brood come to see what's hurting it)
      for (const m of G.monsters.values()) if (m.home && !m.dead && m.stalk == null && (m.state === 'crawl' || m.state === 'wait')) { m.heardAt = { x: p.pos.x, z: p.pos.z, y: p.pos.y, pd: 4 }; m.goal = null; m.stalk = null; m.setState('crawl'); }
      if (nest.dead) { G.emitSound('slime_slosh', at, { vol: 1.6, ref: 6 }); for (const s of nest.spine.slice(0, 3)) G.emitSound('hit_flesh', s, { vol: 1, ref: 5 }); }
      return;
    }
    for (const q of G.alivePlayers()) {
      if (q.id === pid || q.zone !== p.zone) continue;
      const v = q.pos.clone().setY(q.pos.y + 1.2).sub(o), along = v.dot(d);
      if (along < 0 || along > 2.3) continue;
      if (v.sub(d.clone().multiplyScalar(along)).length() < 0.6) {
        const leech = [...G.monsters.values()].find((m) => m.type === 'leech' && m.victim === q.id && m.state === 'attached');
        if (leech) { leech.onHit(1, pid); return; }
        G.hurtPlayer(q.id, 20, 'friend', d.x * 4, d.z * 4);
        return;
      }
    }
  },
  hostThrow(pid, r) {
    const p = G.players.get(pid); const it = G.items.get(r.item);
    if (!p || !it || it.holder !== pid || (it.type !== 'stun' && it.type !== 'bomb')) return;
    const pos = new THREE.Vector3(...r.o), vel = new THREE.Vector3(...r.d).normalize().multiplyScalar(it.type === 'bomb' ? 11 : 13); vel.y += 2.5;
    const from = pos.clone();
    for (let i = 0; i < 150; i++) {
      const prev = pos.clone();
      pos.addScaledVector(vel, 0.02); vel.y -= 20 * 0.02;
      if (p.zone === 'in' && G.fac) {
        if (!G.fac.floorAt(G.fac.ti(pos.x), G.fac.tj(pos.z)) || !G.fac.los(prev.x, prev.z, pos.x, pos.z)) { pos.copy(prev); vel.set(0, vel.y, 0); }
        const ceil = G.fac.ceilY(pos.x, pos.z, pos.y) - 0.1; if (pos.y > ceil) { pos.y = ceil; vel.y = -Math.abs(vel.y) * 0.3; }
      }
      const gnd = p.zone === 'in' ? G.fac.floorY(pos.x, pos.z, pos.y) : G.groundAt(pos.x, pos.z);
      if (pos.y <= gnd + 0.05) { pos.y = gnd + 0.05; break; }
    }
    G.emit({ e: 'itemDel', id: it.id });
    const bomb = it.type === 'bomb';
    G.emit({ e: 'throwFx', from: [from.x, from.y, from.z], to: [pos.x, pos.y, pos.z], dur: 0.7, type: it.type, bomb: bomb ? it.id : null });
    // a thrown charge keeps burning where it lands
    if (bomb) { const b = G.bombs.find((q) => q.id === it.id); if (b) { b.at = pos.clone().setY(pos.y + 0.1); b.zone = p.zone; } return; }
    const zone = p.zone, at = pos.clone();
    G.timers.push({ t: 1.8, fn: () => {
      G.emit({ e: 'stunFx', x: at.x, y: at.y + 0.2, z: at.z });
      G.addNoise(at, 30, zone, pid, 'bang');
      for (const m of G.monsters.values()) {
        if (m.dead || m.def.zone !== zone) continue;
        const d = Math.hypot(m.pos.x - at.x, m.pos.z - at.z);
        if (d < 10 && (zone !== 'in' || G.fac.los(at.x, at.z, m.pos.x, m.pos.z, true))) { m.stun = 5.5; if (m.type === 'leech' && m.state === 'attached') m.detach(); }
      }
    } });
  },
  // a lit charge burns down wherever it is (in a hand, dropped, or where it was thrown) and then goes off
  tickBombs(dt) {
    for (let i = G.bombs.length - 1; i >= 0; i--) {
      const b = G.bombs[i]; b.t -= dt;
      if (b.t > 0) continue;
      G.bombs.splice(i, 1);
      const it = G.items.get(b.id); let at = null, zone = b.zone || 'out';
      if (it) {
        const h = it.holder != null && G.players.get(it.holder);
        if (h) { at = h.pos.clone().setY(h.pos.y + 1.1); zone = h.zone; } else { at = it.pos.clone().setY(it.pos.y + 0.1); zone = G.itemZone(it); }
        G.emit({ e: 'itemDel', id: b.id });
      } else if (b.at) at = b.at;
      if (at) G.hostExplode(at, zone, b.id, b.pid);
    }
  },
  // A meteoroid swarm: a handful of strikes over a dozen seconds, scattered over the ground round the site (some close
  // to whoever's out in it), one of them big; and a fresh scar on the moon, seen from orbit until the ship leaves this
  // world and its moons behind (run.scars)
  // (k: how heavy, 0 a light shower of pebbles, 1 a heavy one with a big strike in it; dir, el: where in the sky it
  // comes from, when it's debris off something on its way in)
  hostMeteors(k = 0.5, dir, el) {
    const ext = G.ext, list = [], out = G.alivePlayers().filter((p) => p.zone === 'out' && !G.playerAboard(p));
    const n = 4 + Math.floor(Math.random() * 4 + k * 6), big = k > 0.45 ? Math.floor(Math.random() * n) : -1;
    for (let tries = 0; list.length < n && tries < 120; tries++) {
      const i = list.length, near = out.length && Math.random() < 0.4 ? out[Math.floor(Math.random() * out.length)].pos : null;
      const a = Math.random() * TAU, dd = near ? 10 + Math.random() * 28 : 20 + Math.random() * 110, r = i === big ? 5 + Math.random() * 2 + k * 3 : lerp(0.6, 1.6, k) + Math.random() * lerp(0.8, 2.4, k);
      const x = (near ? near.x : 0) + Math.cos(a) * dd, z = (near ? near.z : 0) + Math.sin(a) * dd, dc = Math.hypot(x, z);
      // (not on the ship, the buildings or the trail)
      if (dc < 18 + r || dc > 160 || Math.hypot(x - ext.center.x, z - ext.center.z) < 36 + r || Math.hypot(x - ext.fire.x, z - ext.fire.z) < 10 + r || ext.pathInfo(x, z).d < r + 2) continue;
      list.push({ x: +x.toFixed(2), z: +z.toFixed(2), r: +r.toFixed(2), d: +(r * (0.28 + Math.random() * 0.1)).toFixed(2), t: +(i === 0 ? 1.5 : 1.5 + Math.random() * 11).toFixed(2), dir: +(dir != null ? dir + (Math.random() - 0.5) * 0.3 : Math.random() * TAU).toFixed(3), el: el != null ? el : undefined });
    }
    if (!list.length) return;
    G.emit({ e: 'meteors', list });
    if (big < 0) return;   // (a light shower leaves nothing you'd see from orbit)
    const run = G.run; (run.scars || (run.scars = [])).push({ site: G.round.site, lat: +(Math.random() * 1.2 - 0.6).toFixed(3), lon: +(Math.random() * TAU).toFixed(3), r: +(0.02 + Math.random() * 0.015).toFixed(4) });
    if (run.scars.length > 8) run.scars.shift();
    G.emit({ e: 'run', run });
  },
  // a strike landing (host): anyone out in the open near it is thrown off their feet or killed; aboard, you're safe
  hostMeteorHit(m) {
    (G.round.strikes || (G.round.strikes = [])).push({ x: m.x, z: m.z, r: m.r, d: m.d });
    for (const p of G.alivePlayers()) {
      if (p.zone !== 'out' || G.playerAboard(p)) continue;
      const d = Math.hypot(p.pos.x - m.x, p.pos.z - m.z), reach = m.r * 4; if (d > reach) continue;
      const k = Math.pow(1 - d / reach, 1.3), dmg = d < m.r * 1.2 ? 200 : Math.round(150 * k); if (dmg < 3) continue;
      const nn = Math.max(d, 0.5);
      G.hurtPlayer(p.id, dmg, 'meteor', (p.pos.x - m.x) / nn * 14 * k, (p.pos.z - m.z) / nn * 14 * k);
    }
  },
  hostExplode(at, zone, id, pid) {
    G.emit({ e: 'boom', x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2), zone, id });
    G.addNoise(at, 45, zone, null, 'bang');
    const sees = (x, z) => zone !== 'in' || !G.fac || G.fac.los(at.x, at.z, x, z);
    for (const p of G.alivePlayers()) {
      if (p.zone !== zone) continue;
      // (holding it is death; a couple of metres off, maybe; past five or six, bruises)
      const d = p.pos.clone().setY(p.pos.y + 1).distanceTo(at); if (d > 7) continue;
      const k = Math.pow(1 - d / 7, 1.5) * (sees(p.pos.x, p.pos.z) ? 1 : 0.3), dmg = Math.round(145 * k);
      if (dmg < 3) continue;
      const n = Math.max(d, 0.3);
      G.hurtPlayer(p.id, dmg, 'blast', (p.pos.x - at.x) / n * 12 * k, (p.pos.z - at.z) / n * 12 * k);
    }
    for (const m of G.monsters.values()) {
      if (m.dead || m.def.zone !== zone) continue;
      const d = m.pos.distanceTo(at); if (d > 7 || !sees(m.pos.x, m.pos.z)) continue;
      m.onHit(d < 3 ? 8 : d < 5 ? 3 : 1, G.players.has(pid) ? pid : null);
      if (!m.dead) m.stun = Math.max(m.stun, 2.5);
    }
  },
  // where a lit charge is right now, for its hissing (every peer)
  updateFuses(dt) {
    for (let i = G.fuses.length - 1; i >= 0; i--) {
      const f = G.fuses[i]; f.t -= dt; f.snd -= dt;
      if (f.t < -1.5) { G.fuses.splice(i, 1); continue; }
      if (f.snd > 0) continue;
      f.snd = 0.42;
      const it = G.items.get(f.id); let pos = null;
      if (it) {
        const h = it.holder != null && G.players.get(it.holder);
        if (h) pos = (h.id === G.localId ? h.pos : h.rpos).clone().setY(h.pos.y + 1.1);
        else { pos = it.vis.clone(); const sp = it.mesh.getObjectByName('spark'); if (sp) sp.scale.setScalar(0.6 + Math.random() * 0.9); }
      } else { const g = G.grenades.find((q) => q.bomb === f.id); if (g) pos = g.mesh.position.clone(); }
      if (pos) SFX.play('fuse', pos, { dur: 0.45, vol: 0.9 });
    }
  },
  // is p in the ship's shadow, the sun being off along dir? (its hull and its nacelles, as boxes, in its own frame)
  shipShades(p, dir) {
    const S = G.ship.group, o = S.worldToLocal(_fxA.copy(p)), d = _fxD.copy(dir).applyQuaternion(_shQ.copy(S.quaternion).invert());
    const hit = (x0, x1, y0, y1, z0, z1) => {
      let t0 = 0, t1 = 80;
      for (const [a, v, lo, hi] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
        if (Math.abs(v) < 1e-6) { if (a < lo || a > hi) return false; continue; }
        let ta = (lo - a) / v, tb = (hi - a) / v; if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false;
      }
      return true;
    };
    return hit(-16.6, 12.6, -0.85, 4.6, -4.6, 4.6) || hit(-16.6, -8.2, 0.4, 2.2, -6.4, 6.4);
  },
  // a failing tube now and then spits a shower of sparks onto the floor under it, with a crackle (only the ones near
  // you on your own floor: each about every ten seconds)
  lampSparks(dt) {
    const me = G.me(); if (!G.fac || !me || me.zone !== 'in' || (G.sparkT = (G.sparkT || 0) - dt) > 0) return;
    G.sparkT = 0.5;
    const cam = R.camera.position;
    for (const l of G.fac.lamps) {
      if (l.state !== 'flicker' || !l.lit || Math.abs(l.fy - me.pos.y) > 2.5 || Math.hypot(l.x - cam.x, l.z - cam.z) > 16 || Math.random() > 0.05) continue;
      const at = new THREE.Vector3(l.x, l.y - 0.08, l.z);
      FX.sparks(at, { dir: new THREE.Vector3(0, -1, 0), spread: 1.0, n: [6, 14], speed: [0.4, 2.4], floor: l.fy, life: [0.5, 1.1] });
      SFX.play('zap', at, { vol: 0.55 });
      break;
    }
  },
  // a blast: a fireball that swells and burns out, black smoke rolling up and spreading under the ceiling, a hot
  // flash of light on everything around, and a scorch mark left on the floor
  blastFx(pos, zone) {
    const inside = zone === 'in' && G.fac;
    const ceil = inside ? G.fac.ceilY(pos.x, pos.z, pos.y) - 0.35 : pos.y + 40;
    const floor = inside ? G.fac.floorY(pos.x, pos.z, pos.y) : G.groundAt(pos.x, pos.z);
    const puff = TEX.get('puff'), parts = [];
    // (sparks and burning bits flung out, grit and chips off everything round it, dust rolling out across the floor)
    { const l = FX.lit(pos, inside ? 'in' : 'out');
      FX.sparks(pos, { n: 40, spread: Math.PI, speed: [4, 14], floor, life: [0.5, 1.4], streak: 0.05 });
      FX.embers(pos, { n: 14, speed: [1, 4], life: [1.5, 3] });
      FX.grit(pos, { n: 26, spread: 1.4, speed: [3, 10], floor, color: [0.12, 0.11, 0.1] });
      FX.puff(pos.clone().setY(floor + 0.3), { n: 10, r: 1, spread: 1.5, speed: [1.5, 4], size: [0.6, 1.1], color: [0.42 * l, 0.4 * l, 0.36 * l], alpha: 0.3 }); }
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: new THREE.Color(9, 4.2, 1.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    fire.position.copy(pos); R.scene.add(fire); parts.push({ o: fire, kind: 'fire' });
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: 0x1c1916, depthWrite: false, transparent: true, opacity: 0 }));
      s.material.rotation = Math.random() * TAU;
      s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.5, (Math.random() - 0.5) * 1.2));
      R.scene.add(s);
      parts.push({ o: s, kind: 'smoke', v: new THREE.Vector3((Math.random() - 0.5) * 2, 0.7 + Math.random() * 1.3, (Math.random() - 0.5) * 2), d: Math.random() * 0.2 });
    }
    const grp = inside ? G.fac.group : G.ext && G.ext.group;
    if (grp) {
      const sc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 20), new THREE.MeshStandardMaterial({ map: puff, color: 0x000000, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, roughness: 1 }));
      sc.rotation.set(-Math.PI / 2, 0, Math.random() * TAU); sc.position.set(pos.x, floor + 0.02, pos.z); grp.add(sc);
    }
    const L = { x: pos.x, y: pos.y + 0.6, z: pos.z, color: 0xffa048, power: 9, state: 'on', zone, range: 22, lit: 1 };
    G.lightSources.push(L);
    G.blasts.push({ t: 0, parts, ceil, light: L });
  },
  updateBlasts(dt) {
    for (let i = G.blasts.length - 1; i >= 0; i--) {
      const b = G.blasts[i]; b.t += dt;
      if (b.light) { b.light.power = 9 * Math.max(0, 1 - b.t / 0.7); if (b.t > 0.7) { const k = G.lightSources.indexOf(b.light); if (k >= 0) G.lightSources.splice(k, 1); b.light = null; } }
      for (const p of b.parts) {
        if (p.kind === 'fire') { const k = b.t / 0.55; p.o.scale.setScalar(0.6 + 5.5 * Math.sqrt(Math.min(1, k * 1.6))); p.o.material.opacity = Math.max(0, 1 - k); p.o.visible = k < 1; continue; }
        const t = Math.max(0, b.t - p.d);
        p.o.position.addScaledVector(p.v, dt); p.v.multiplyScalar(Math.exp(-dt * 0.7));
        if (p.o.position.y > b.ceil) { p.o.position.y = b.ceil; p.v.y = 0; }
        p.o.scale.setScalar(1.2 + t * 1.3); p.o.material.opacity = 0.78 * sstep(0, 0.25, t) * (1 - sstep(2.5, 6.5, t));
      }
      if (b.t > 7) { for (const p of b.parts) { R.scene.remove(p.o); p.o.material.dispose(); } G.blasts.splice(i, 1); }
    }
  },
  hostCoreTaken() {
    G.emit({ e: 'power', on: false, perm: true });
    // pulling the core wakes the worst thing this site has (just the one)
    G.timers.push({ t: 6, fn: () => {
      if (G.mode !== 'site') return;
      const roster = Object.keys(SITES[G.round.site].mon).sort((a, b) => MON_DEFS[b].power - MON_DEFS[a].power);
      const apex = roster.find((t) => ![...G.monsters.values()].some((m) => !m.dead && m.type === t)) || roster[0];
      G.hostSpawnInterior(apex, true);
    } });
    // and sometimes the alarm brings up something worse, from as far down as the building goes (the more dangerous
    // the site, the likelier)
    if (Math.random() < Math.min(0.9, 0.35 + SITES[G.round.site].power * 0.05)) G.timers.push({ t: 20 + Math.random() * 15, fn: () => { if (G.mode === 'site' && ![...G.monsters.values()].some((m) => m.type === 'executioner')) G.hostSpawnInterior('executioner', true, 28); } });
  },
  // The core pulled: every light in the place dies, the emergency circuit's too, and there's nothing but your
  // flashlight. A few seconds on, its main breaker slams home somewhere below and the red lamps come on a fitting at a
  // time, outward from the core room, each with its own clunk: most of the ones that light are failing, a few burn
  // steady, and many never come on at all (some try, once). Then the old alarm on the circuit starts up and doesn't
  // stop. (Worked out from the round's seed, so every crewmate sees the same lamps lit; instant: someone joining after
  // it happened just finds it so.)
  startEmergency(instant) {
    const fac = G.fac; if (!fac || fac.emerg) return;
    const rr = new RNG((G.round.seed * 7 + 31337) >>> 0), core = fac.rooms.find((r) => r.type === 'core');
    const cl = core ? fac.lamps.filter((l) => l.i >= core.i && l.i < core.i + core.w && l.j >= core.j && l.j < core.j + core.h) : [];
    const c = cl[0] || fac.lamps[0] || { x: 0, y: 0, z: 0 }, reds = [0xff2a14, 0xff3b1e, 0xe8200f, 0xff4a22, 0xd81c10];
    const E = fac.emerg = { t: instant ? 60 : 0, main: instant, next: 0, horns: [] };
    for (const l of fac.lamps) {
      const d = Math.hypot(l.x - c.x, l.z - c.z) + Math.abs(l.y - c.y) * 3, x = rr.next();
      const kind = x < 0.42 ? (rr.chance(0.35) ? 'try' : null) : rr.chance(0.72) ? 'bad' : 'ok';
      l.em = { at: 3.4 + d * 0.05 + rr.range(0, 0.9), kind, col: rr.pick(reds), dur: rr.range(0.08, 0.35) };
      l.state = 'off'; fac.setLampVisual(l, 0.02);
    }
    // (the alarm's horns: a few of the fittings that light, spread through the building)
    for (const l of fac.lamps) if ((l.em.kind === 'ok' || l.em.kind === 'bad') && E.horns.every((h) => Math.hypot(h.x - l.x, h.z - l.z) + Math.abs(h.y - l.y) * 4 > 26)) E.horns.push({ x: l.x, y: l.y, z: l.z });
    if (!E.horns.length) E.horns.push({ x: c.x, y: c.y, z: c.z });
    if (instant) G.stepEmergency(0);
  },
  stepEmergency(dt) {
    const fac = G.fac, E = fac && fac.emerg; if (!E) return;
    E.t += dt;
    const me = G.me(), inside = !!me && G.zoneOf(me) === 'in', cam = R.camera.position, live = E.t < 40;
    if (!E.main && E.t > 3.1) { E.main = true; if (inside) SFX.play('em_breaker', null, { vol: 1, rev: 1.1 }); }
    for (const l of fac.lamps) {
      const m = l.em; if (!m || m.done || E.t < m.at) continue;
      if (!m.lit) {
        m.lit = true;
        if (m.kind) {
          l.state = 'emergency'; l.color = m.col; l.bad = m.kind !== 'ok'; l.power = Math.min(l.power, 0.6); fac.setLampVisual(l, 0.85);
          if (live && inside && Math.abs(l.x - cam.x) + Math.abs(l.z - cam.z) + Math.abs(l.y - cam.y) * 4 < 50) SFX.play('em_lamp', new THREE.Vector3(l.x, l.y, l.z), { vol: 0.9, ref: 3.5, rev: 0.9 });
        }
      }
      if (m.kind !== 'try') m.done = true;
      else if (E.t >= m.at + m.dur) { l.state = 'off'; fac.setLampVisual(l, 0.02); m.done = true; }
    }
    // the alarm, from whichever horn is nearest (through the walls, muffled, if it's round a corner); now and then it
    // drops out altogether for a moment, then catches again
    if (E.t > 3.8 && inside && G.mode === 'site') {
      E.next -= dt;
      if (E.next <= 0) {
        let h = E.horns[0], hd = 1e18;
        for (const o of E.horns) { const d = (o.x - cam.x) ** 2 + ((o.y - cam.y) * 3) ** 2 + (o.z - cam.z) ** 2; if (d < hd) { hd = d; h = o; } }
        const gap = Math.random() < 0.12;
        E.next = 2.0 + Math.random() * 0.5 + (gap ? 0.8 + Math.random() * 2 : 0);
        if (!gap) SFX.play('em_alarm', new THREE.Vector3(h.x, h.y, h.z), { vol: 1.5, ref: 10, roll: 0.6, rev: 0.9 });
      }
    }
  },
  hostLand() {
    if (G.mode !== 'orbit') return;
    const run = G.run;
    if (run.daysLeft <= 0) { G.hostSubmit(); return; }
    // (a gas giant has nothing to land on: only cloud, all the way down)
    if (SITES[run.route].giant) { SFX.play('err', G.ship.leverPos, { vol: 0.6 }); return; }
    G.ship.pullLever();
    G.emitSound('lever', G.ship.leverPos, {});
    const key = run.route;
    G.emit({ e: 'landing', site: key });
    // with the shutters down, everyone starts building the site (a few frames' work); the descent begins once it's up
    G.timers.push({ t: ENTRY.site, fn: () => {
      const site = SITES[key], seed = randSeed(), rng = new RNG(seed ^ 0x51ed);
      const weather = rng.weighted(site.weather), ecl = !!(G.ship.glide && G.ship.glide.ecl);
      G.emit({ e: 'sitePrep', site: key, seed, weather, ecl, t: G.seq && G.seq.kind === 'land' ? +G.seq.t.toFixed(2) : null });
      G.stageSite(seed, key, weather, ecl, () => {
        // (the descent waits, shutters down, until the site's shaders are ready, so it doesn't stutter its way down)
        const go = () => {
          if (G.mode !== 'landing' || !G.round || G.round.seed !== seed) return;
          const items = G.spawnScrap(seed, site, key);
          // (and the ship's ground camera, set up on its tripod out ahead of the nose looking back at the hatch)
          items.push({ id: G.nextItemId++, type: 'shipcam', value: 0, x: 9.6, y: G.groundAt(9.6, 7.6), z: 7.6, ry: Math.atan2(12.1, 2.4) });
          G.emit({ e: 'land', site: key, seed, weather, ecl, items });
          const first = (key === 'hollow' ? 2 : 1) + (G.fac.levels >= 6 ? 1 : 0);
          for (let i = 0; i < first; i++) G.hostSpawnInterior(null, false, 30);
          // (a nest has its brood about it already: two, three on the worse sites)
          if (G.fac.nest) for (let i = 0, n = site.power >= 7 ? 3 : 2; i < n; i++) G.hostNestBreed(true);
        };
        const wait = (t) => (G.siteShown || t > 6 ? go() : G.timers.push({ t: 0.1, fn: () => wait(t + 0.1) }));
        wait(0);
      });
    } });
  },
  // Scrap belongs where it would really be: what a room was used for decides what is left in it, and what the
  // site was (a mill, a biolab, a pumping station...) tilts it further. It is tucked away: against walls, behind
  // crates, under desks, on shelves, inside lockers. The rooms nearest the entrance were picked over long ago.
  spawnScrap(seed, site, siteKey) {
    const r = new RNG(seed ^ 0x77aa), fac = G.fac;
    const n = Math.round(r.int(site.scrap[0], site.scrap[1]) * 0.85);
    const ent = fac.exits.find((e) => e.kind === 'main') || { x: 0, z: 0 };
    const spots = fac.spots.map((s) => ({ ...s, w: s.w * clamp(Math.hypot(s.x - ent.x, s.z - ent.z) / 28, 0.2, 1.5), lv: Math.round(fac.depthOfY(s.y)) }));
    const bias = SITE_LOOT[siteKey] || {};
    const out = [];
    // (however deep the plant goes, there's no more of it than there ever was: it's shared out between the floors, each
    // in turn, starting from a different one each day, so every floor holds about as much as any other)
    const L = fac.levels, lv0 = r.int(0, L - 1);
    for (let i = 0; i < n && spots.length; i++) {
      const want = (lv0 + i) % L, pool = spots.some((s) => s.lv === want) ? (s) => s.lv === want : () => true;
      let tot = 0; for (const s of spots) if (pool(s)) tot += s.w;
      let x = r.next() * tot, k = -1;
      for (let q = 0; q < spots.length; q++) if (pool(spots[q])) { k = q; x -= spots[q].w; if (x <= 0) break; }
      const s = spots.splice(k, 1)[0];
      // spread finds out: no second piece lying a step away from the first
      for (let q = spots.length - 1; q >= 0; q--) if (spots[q].c == null && Math.hypot(spots[q].x - s.x, spots[q].z - s.z) < 2.2) spots.splice(q, 1);
      // (the deeper it lies, the likelier it's one of the good things: the floors nearest the top were picked over first)
      const table = LOOT[s.tag] || LOOT.storage, w = {}, tilt = Math.min(1.2, 0.25 * s.lv);
      for (const t in table) { if (!s.big && ITEMS[t].twoHanded) continue; w[t] = table[t] * (bias[t] || 1) * Math.pow((ITEMS[t].value[0] + ITEMS[t].value[1]) / 90, tilt); }
      const type = Object.keys(w).length ? r.weighted(w) : 'bolt', d = ITEMS[type];
      // scrap is junk: most of it is worth a few dollars, a real find is rare; the lower levels were never stripped
      const deep = 1 + 0.25 * s.lv;
      out.push({ id: G.nextItemId++, type, value: Math.max(3, Math.round(r.range(d.value[0], d.value[1]) * site.mult * SCRAP_SCALE * deep)), x: s.x, y: s.y, z: s.z, ry: r.range(0, TAU), c: s.c });
    }
    // (and down on the bottom floor of a deep one, that hardly anybody got down to: a piece or two of the good stuff besides)
    const rich = Object.keys(ITEMS).filter((t) => ITEMS[t].kind === 'scrap' && t !== 'core' && t !== 'gift' && ITEMS[t].value[0] + ITEMS[t].value[1] >= 150);
    for (let i = 0, nd = L >= 4 ? r.int(1, 2) : 0; i < nd; i++) {
      const ks = spots.map((q, k) => (q.lv === L - 1 ? k : -1)).filter((k) => k >= 0); if (!ks.length) break;
      const s = spots.splice(ks[r.int(0, ks.length - 1)], 1)[0], opts = rich.filter((t) => s.big || !ITEMS[t].twoHanded); if (!opts.length) continue;
      const type = opts[r.int(0, opts.length - 1)], d = ITEMS[type];
      out.push({ id: G.nextItemId++, type, value: Math.round(r.range(d.value[0], d.value[1]) * site.mult * SCRAP_SCALE * (1 + 0.25 * s.lv)), x: s.x, y: s.y, z: s.z, ry: r.range(0, TAU), c: s.c });
    }
    if (fac.coreSpot) { const d = ITEMS.core; out.push({ id: G.nextItemId++, type: 'core', value: Math.round(r.range(d.value[0], d.value[1]) * site.mult * SCRAP_SCALE), x: fac.coreSpot.x, y: fac.coreSpot.y, z: fac.coreSpot.z, ry: 0 }); }
    // a few snacks somebody never came back for: mostly in lockers and cabinets, desks, the front office
    const nf = r.int(2, 4);
    for (let i = 0; i < nf && spots.length; i++) {
      let tot = 0; const ws = spots.map((s) => { const w = (FOOD_SPOTS[s.tag] || 0.15) * (s.c != null ? 2.5 : 1); tot += w; return w; });
      let x = r.next() * tot, k = 0; for (; k < spots.length - 1; k++) { x -= ws[k]; if (x <= 0) break; }
      const s = spots.splice(k, 1)[0];
      out.push({ id: G.nextItemId++, type: r.weighted(FOOD_FIND), value: 0, x: s.x, y: s.y, z: s.z, ry: r.range(0, TAU), c: s.c });
    }
    // a gift box or three: wrapped parcels left lying about, or tucked away in a locker
    const ng = r.int(1, 3);
    for (let i = 0; i < ng && spots.length; i++) {
      const s = spots.splice(r.int(0, spots.length - 1), 1)[0], d = ITEMS.gift;
      out.push({ id: G.nextItemId++, type: 'gift', value: Math.round(r.range(d.value[0], d.value[1]) * site.mult * SCRAP_SCALE), x: s.x, y: s.y, z: s.z, ry: r.range(0, TAU), c: s.c });
    }
    return out;
  },
  hostSpawnInterior(type, force, minDist = 16) {
    const site = SITES[G.round.site], fac = G.fac;
    if (!type) {
      const counts = {}; let power = 0, n = 0;
      // (a nest's brood are its own: they don't count against what else turns up)
      // (and a swarm of roaches counts as one thing, however many of them there are)
      for (const m of G.monsters.values()) if (!m.dead && m.def.zone === 'in' && !m.home) { counts[m.type] = (counts[m.type] || 0) + 1; power += m.def.power; n += m.def.swarm ? 1 / 3 : 1; }
      // (a plant more than four floors deep has room for a little more of it: one more thing for each floor past the fourth)
      const extra = Math.max(0, fac.levels - 4);
      if (n >= site.cap + Math.min(2, extra)) return;
      // never a pack of the same thing: one of each big creature, at most two of the small ones, and a type that is
      // already prowling is much less likely to be picked again
      const lim = { crawler: site.power >= 7 ? 2 : 1, leech: 2, roach: 1, pale: 1, mannequin: 1, slime: 1, sister: 2, bound: 2, clown: 1 };
      // (ceiling leeches and roaches turn up in every plant, wherever they don't already belong to it: the easy things, so
      // there's always something about in there besides the clock)
      const mon = Object.assign({ leech: 0.8, roach: 1.1 }, site.mon);
      const w = {}; for (const k in mon) if ((counts[k] || 0) < lim[k]) w[k] = mon[k] * Math.pow(0.3, counts[k] || 0);
      // (the mannequins are kept down below: none in a facility that's all on one level)
      if (fac.levels < 2) delete w.mannequin;
      // (the Clown: one a landing at most, and only once the afternoon's come)
      if (G.round.clownN || G.round.time < 13 * 60) delete w.clown;
      if (!Object.keys(w).length) return;
      type = R0.weighted(w);
      if (!force && power + MON_DEFS[type].power > site.power * (1 + 0.15 * extra)) return;
    }
    const players = G.alivePlayers().filter((p) => p.zone === 'in');
    const far = (x, z) => players.every((p) => Math.hypot(p.pos.x - x, p.pos.z - z) > minDist);
    // where: out of a vent for most things; a mannequin only somewhere in the lower half of the building; the Seep out
    // in a corridor (it's far too big for a vent)
    // (the Executioner, up from below: from the bottom floor, and far too big for a vent)
    const wide = type === 'slime' || type === 'executioner' || type === 'clown';
    if (type === 'clown') { G.round.clownN = 1; minDist = Math.max(minDist, 40); }
    if (type === 'mannequin' && fac.levels < 2) return;
    // (the leeches mostly down in the lower half, where the infestation's got hold)
    let minLv = type === 'executioner' ? fac.levels - 1 : type === 'mannequin' || type === 'clown' || (type === 'leech' && R0.chance(0.7)) ? Math.max(1, Math.floor(fac.levels / 2)) : 0;
    let spot = null;
    const vents = wide ? [] : R0.shuffle(fac.vents.slice());
    for (const v of vents) if (far(v.x, v.z) && fac.levelAt(v.x, v.z, v.y) >= minLv) { spot = { x: v.x + v.nx * 1.2, z: v.z + v.nz * 1.2, vent: v }; break; }
    // (nowhere down there far enough from everyone: anywhere below the ground floor will do)
    for (let tries = 0; !spot && tries < 2; tries++, minLv = Math.min(minLv, 1)) {
      const p = fac.randomWalkable(R0, (q) => far(q.x, q.z) && fac.lvl[fac.idx(q.i, q.j)] >= minLv && (!wide || fac.grid[fac.idx(q.i, q.j)] === 1), minLv ? { lv: minLv } : null);
      if (p) spot = { x: p.x, z: p.z };
    }
    if (!spot) return;
    const y = type === 'leech' ? fac.ceilY(spot.x, spot.z) - 0.18 : fac.floorY(spot.x, spot.z);
    G.emit({ e: 'monSpawn', id: G.nextMonId++, type, x: spot.x, y, z: spot.z });
    // (the roaches: a few of them, out of the same vent one after another)
    if (type === 'roach') for (let k = 0, n = R0.chance(0.5) ? 2 : 1; k < n; k++) G.timers.push({ t: 0.4 + k * 0.5, fn: () => { if (G.fac === fac) G.emit({ e: 'monSpawn', id: G.nextMonId++, type, x: spot.x + (Math.random() - 0.5) * 0.4, y, z: spot.z + (Math.random() - 0.5) * 0.4 }); } });
    // (the Sisters come in twos and threes)
    if (type === 'sister') for (let k = 0, n = R0.chance(0.35) ? 2 : 1; k < n; k++) G.timers.push({ t: 0.8 + k * 0.9, fn: () => { if (G.fac === fac) G.emit({ e: 'monSpawn', id: G.nextMonId++, type, x: spot.x + (Math.random() - 0.5) * 0.4, y, z: spot.z + (Math.random() - 0.5) * 0.4 }); } });
    if (spot.vent) G.emitSound('vent', new THREE.Vector3(spot.vent.x, spot.vent.y, spot.vent.z), { vol: 1.2, ref: 3 });
  },
  // a leech out of the nest, onto the ceiling by it (not right over anyone's head); false if it couldn't (anyone too
  // near, or its brood's at full strength). seed: the ones it has at landing, quietly
  hostNestBreed(seed) {
    const n = G.fac && G.fac.nest; if (!n || n.dead) return false;
    if ([...G.monsters.values()].filter((m) => m.home && !m.dead).length >= 3 + (G.fac.levels >= 5 ? 1 : 0)) return true;
    const near = (s) => G.alivePlayers().some((p) => p.zone === 'in' && Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 5 && Math.abs(p.pos.y - (n.Y + 1)) < 3);
    const ok = n.spots.filter((s) => !near(s)); if (!ok.length) return false;
    const s = ok[Math.floor(Math.random() * ok.length)];
    G.emit({ e: 'monSpawn', id: G.nextMonId++, type: 'leech', x: s.x, y: s.y, z: s.z, home: 1 });
    if (!seed) G.emitSound('slime_gurgle', new THREE.Vector3(n.x, n.Y + n.h * 0.6, n.z), { vol: 1.1, ref: 4 });
    return true;
  },
  // the nest's brood start to pour out of it (at whoever it was set off by)
  hostNestFlood(p) {
    const n = G.fac.nest, r = G.round; if (!n || n.dead || r.nestFlood || !(r.nestPool > 0)) return;
    r.nestFlood = { t: 0.6, pid: p.id };
    G.emitSound('slime_slosh', new THREE.Vector3(n.x, n.Y + n.h - 0.5, n.z), { vol: 1.5, ref: 6 });
  },
  hostSpawnHound() {
    const outside = G.alivePlayers().filter((p) => p.zone === 'out');
    for (let t = 0; t < 20; t++) {
      const a = Math.random() * TAU, d = 115 + Math.random() * 35, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (outside.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 55)) continue;
      G.emit({ e: 'monSpawn', id: G.nextMonId++, type: 'hound', x, y: G.groundAt(x, z), z });
      return;
    }
  },
  hostDepart(reason) {
    if (G.mode !== 'site') return;
    if (reason === 'lever') { G.ship.pullLever(); G.emitSound('lever', G.ship.leverPos, {}); }
    G.emit({ e: 'depart', reason });
    G.departT = FLY.toDur;
  },
  hostOrbit() {
    const r = G.round, site = SITES[r.site], run = G.run;
    for (const p of G.alivePlayers()) if (!G.inShip(p)) G.killPlayer(p.id, 'left');
    const allDead = G.alivePlayers().length === 0;
    // (the rover is aboard if it's in the bay, or in the arms of someone who is; what's in its basket goes with it)
    const roverCarrier = Rover.owned && Rover.state.carrier != null ? G.players.get(Rover.state.carrier) : null;
    const roverAboard = Rover.owned && (roverCarrier ? roverCarrier.alive && G.inShip(roverCarrier) : Rover.aboard());
    const inShipNow = (it) => (it.basket != null ? roverAboard : it.holder != null ? (() => { const h = G.players.get(it.holder); return h && h.alive && G.inShip(h); })() : it.inShip);
    if (Rover.owned && !roverAboard) { run.upgrades.rover = false; G.emit({ e: 'chat', text: 'The rover was left behind.', sys: true }); }
    const shipItems = [...G.items.values()].filter(inShipNow);
    const collectedItems = shipItems.filter((it) => ITEMS[it.type].kind === 'scrap' && !r.startShip.has(it.id));
    const collected = collectedItems.reduce((s, it) => s + it.value, 0);
    const lost = allDead ? collected : 0;
    // (the ground camera is packed away for flight, wherever it was: it comes out again with the ramp)
    const keep = shipItems.filter((it) => it.type !== 'shipcam' && !(allDead && collectedItems.includes(it))).map((it) => it.id);
    const deaths = [...G.players.values()].filter((p) => !p.alive).map((p) => ({ name: p.name, cause: G.deathCause && G.deathCause[p.id] || 'unknown', bot: p.bot || undefined }));
    // (a lost bot is on the report, but the Company's insurance doesn't charge for one)
    const fine = allDead ? 0 : Math.round(run.credits * 0.1 * deaths.filter((d) => !d.bot).length);
    run.credits = Math.max(0, run.credits - fine);
    run.daysLeft = Math.max(0, run.daysLeft - 1); run.day += 1;
    // (a beacon lasts the day: by the next the ship has hopped back to the world the moon or rock belongs to)
    if (SITES[run.route].bonus && !SITES[run.route].open && G.signal(run) !== run.route) run.route = SITES[run.route].bonus;
    // (and a course plotted to yesterday's beacon goes with it)
    if (run.course && (run.course === run.route || (SITES[run.course].bonus && !SITES[run.course].open && G.signal(run) !== run.course))) delete run.course;
    if (!allDead) run.collected = (run.collected || 0) + collected;
    const frac = r.total ? (collected - lost) / r.total : 0;
    let grade = allDead ? 'F' : frac >= 0.7 && !deaths.length ? 'S' : frac >= 0.5 ? 'A' : frac >= 0.3 ? 'B' : frac >= 0.15 ? 'C' : frac > 0 ? 'D' : 'F';
    if (deaths.length && grade === 'S') grade = 'A';
    // (got away with it on its way in: it comes down while we watch from orbit, half a minute or so after we're up)
    if (r.doom && !r.lost) run.doom = { site: r.site, t: Math.max(25, (r.doom.at - r.time) * SEC_PER_MIN) };
    const summary = { site: site.name, day: run.day - 1, collected: collected - lost, count: allDead ? 0 : collectedItems.length, total: r.total, lost, fine, deaths, allDead, grade, daysLeft: run.daysLeft };
    G.emit({ e: 'orbit', summary, run, keep });
  },
  hostSubmit() {
    const run = G.run;
    G.ship.pullLever();
    if (run.sold >= run.quota) {
      const over = run.sold - run.quota, bonus = Math.floor(over * 0.25);
      run.credits += bonus; run.cycle += 1;
      const old = run.quota;
      // each quota climbs more steeply than the last (300 -> ~470 -> ~700 -> ~1000 -> ~1400 ...)
      run.quota = Math.round(old + 130 * (1 + (run.cycle * run.cycle) / 12) * (0.92 + Math.random() * 0.2));
      run.sold = 0; run.daysLeft = 3;
      G.emit({ e: 'run', run });
      G.emit({ e: 'quota', title: 'QUOTA MET', sub: (bonus ? 'Overtime bonus $' + bonus + '. ' : '') + 'New quota: $' + run.quota + ' in 3 days.' });
      G.save();
    } else {
      G.emit({ e: 'fired', run });
      Store.del(G.saveKey);
    }
  },
  hostTerminal(pid, cmd) {
    const run = G.run, out = [];
    const parts = cmd.trim().split(/\s+/), c = parts[0] || '';
    const L = (t, cls, cm) => out.push(cm ? { t, c: cls, cmd: cm } : cls ? { t, c: cls } : t);
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const inOrbit = G.mode === 'orbit';
    const rate = SELL_RATE[clamp(run.daysLeft, 0, 3)];
    switch (c) {
      case 'help': case '?':
        L('COMMANDS', 'hi');
        L('  STORE            - tools & ship upgrades', '', 'store');
        L('  BUY <ITEM> [N]   - purchase (delivered to ship)', '', 'store');
        L('  SITES            - list salvage sites', '', 'sites');
        L('  ROUTE <SITE>     - plot a course (then pull the JUMP lever)', '', 'sites');
        L('  SELL             - sell all scrap aboard (in orbit)', '', 'sell');
        L('  SCAN             - scrap aboard / remaining', '', 'scan');
        L('  QUOTA            - profit quota status', '', 'quota');
        L('  BESTIARY         - creature notes', '', 'bestiary');
        L('  CREW             - crew status', '', 'crew');
        L('  <CODE>           - raise / drop a blast door');
        L('  CLEAR / EXIT', 'dim');
        break;
      case 'store': case 'shop': {
        const row = (name, price, key, owned) => out.push({ segs: [{ t: '  ' + name.padEnd(18, '.') + ' ' + price.padStart(6) + '   ', c: owned ? 'dim' : '' }, owned ? { t: 'INSTALLED', c: 'dim' } : { t: '[ BUY ]', cmd: 'buy ' + key, c: 'btn' }, { t: '  ' }, { t: '[ INFO ]', cmd: 'info ' + key, c: 'btn dim' }] });
        L('TOOLS', 'dim');
        for (const k of SHOP_TOOLS) row(ITEMS[k].name, '$' + ITEMS[k].price, k, false);
        L(' ');
        L('SHIP UPGRADES', 'dim');
        for (const k in UPGRADES) row(UPGRADES[k].name, '$' + UPGRADES[k].price, k, !!run.upgrades[k]);
        L(' ');
        break;
      }
      case 'info': {
        const q = norm(parts.slice(1).join(''));
        const tool = SHOP_TOOLS.find((k) => k === q || norm(ITEMS[k].name).startsWith(q) || k.startsWith(q));
        const up = Object.keys(UPGRADES).find((k) => k === q || norm(UPGRADES[k].name).startsWith(q) || k.startsWith(q));
        if (tool) { L(ITEMS[tool].name.toUpperCase() + '  —  $' + ITEMS[tool].price, 'hi'); L(ITEMS[tool].desc); L('Weight: ' + ITEMS[tool].weight + ' kg' + (ITEMS[tool].battery ? '   ·   battery powered' : '')); out.push({ segs: [{ t: '[ BUY ONE ]', cmd: 'buy ' + tool, c: 'btn' }, { t: '   ' }, { t: '[ BACK TO STORE ]', cmd: 'store', c: 'btn dim' }] }); }
        else if (up) { L(UPGRADES[up].name.toUpperCase() + '  —  $' + UPGRADES[up].price, 'hi'); L(UPGRADES[up].desc); out.push({ segs: [run.upgrades[up] ? { t: 'INSTALLED', c: 'dim' } : { t: '[ INSTALL ]', cmd: 'buy ' + up, c: 'btn' }, { t: '   ' }, { t: '[ BACK TO STORE ]', cmd: 'store', c: 'btn dim' }] }); }
        else L('UNKNOWN ITEM. Try STORE.', 'bad');
        break;
      }
      case 'buy': {
        let qty = 1, words = parts.slice(1);
        if (words.length > 1 && /^\d+$/.test(words[words.length - 1])) qty = clamp(parseInt(words.pop(), 10), 1, 8);
        const q = norm(words.join(''));
        if (!q) { L('BUY WHAT? Try STORE.', 'bad'); break; }
        const tool = SHOP_TOOLS.find((k) => k === q || norm(ITEMS[k].name).startsWith(q) || k.startsWith(q));
        const up = Object.keys(UPGRADES).find((k) => k === q || norm(UPGRADES[k].name).startsWith(q) || k.startsWith(q));
        if (tool) {
          const cost = ITEMS[tool].price * qty;
          if (cost > run.credits) { L(`INSUFFICIENT CREDITS ($${cost} needed, $${run.credits} available)`, 'bad'); G.emitSound('err', G.ship.termPos, {}); break; }
          run.credits -= cost;
          // in orbit the drone brings it through the airlock; on the ground a supply rocket drops it nearby
          (run.orders = run.orders || []).push(...new Array(qty).fill(tool));
          G.emit({ e: 'run', run });
          G.emitSound('buy', G.ship.termPos, {});
          L(`ORDERED ${qty} x ${ITEMS[tool].name.toUpperCase()} FOR $${cost}.`, 'hi');
          L(G.mode === 'orbit' ? 'DELIVERY DRONE DISPATCHED.' : 'SUPPLY DROP INBOUND.', 'dim');
          L('CREDITS: $' + run.credits);
          out.push({ segs: [{ t: '[ BACK TO STORE ]', cmd: 'store', c: 'btn dim' }] });
        } else if (up) {
          const u = UPGRADES[up];
          if (run.upgrades[up]) { L('ALREADY INSTALLED.', 'dim'); break; }
          if (u.price > run.credits) { L(`INSUFFICIENT CREDITS ($${u.price} needed)`, 'bad'); G.emitSound('err', G.ship.termPos, {}); break; }
          run.credits -= u.price; run.upgrades[up] = true;
          G.emit({ e: 'run', run });
          G.emitSound('buy', G.ship.termPos, {});
          L(`${u.name.toUpperCase()} INSTALLED.`, 'hi');
        } else L('UNKNOWN ITEM. Try STORE.', 'bad');
        G.save();
        break;
      }
      case 'sites': case 'moons':
        L('SALVAGE SITES', 'hi');
        for (const k in SITES) {
          const s = SITES[k]; if (s.bonus) continue;
          L(`  ${s.name.padEnd(16)} RISK: ${s.risk.padEnd(8)} ${s.cost ? 'ROUTE $' + s.cost : 'FREE'}${run.route === k ? '   << HERE' : run.course === k ? '   << COURSE' : ''}`, run.route === k || run.course === k ? 'hi' : '', 'route ' + k); L('     ' + s.desc, 'dim');
          // (a giant's moons, under it: open every day, a free hop from one to the next)
          if (s.giant) for (const b of BODIES[k]) { const m = SITES[b.key], here = run.route === b.key ? '   << HERE' : run.course === b.key ? '   << COURSE' : '';
            L(`    ${m.name.padEnd(14)} RISK: ${m.risk.padEnd(8)} ${b.kind === 'rock' ? 'MOONLET' : 'MOON'}${here}`, here ? 'hi' : '', 'route ' + b.key); L('       ' + m.desc + ' NO AIR, LIGHT GRAVITY.', 'dim'); }
        }
        // (and today's beacon, if one of the bodies round here is showing one)
        { const sig = G.signal(run);
          if (sig) { const s = SITES[sig], home = SITES[s.bonus];
            L(''); L('BEACON  ·  TODAY ONLY', 'hi');
            L(`  ${s.name.padEnd(16)} RISK: ${s.risk.padEnd(8)} BONUS${run.route === sig ? '   << HERE' : run.course === sig ? '   << COURSE' : ''}`, run.route === sig || run.course === sig ? 'hi' : '', 'route ' + sig);
            L(`     ${s.biome === 'rock' ? 'A rock' : 'The moon'} off ${home.name}: a short hop from there. ${s.desc}`, 'dim');
            L('     NO AIR, LIGHT GRAVITY', 'dim');
          } }
        break;
      // ROUTE plots a course; nothing moves until someone pulls the JUMP lever in the cockpit (G.hostEngage)
      case 'route': {
        const q = norm(parts.slice(1).join(''));
        if (q === 'cancel' || q === 'none' || q === 'clear') {
          if (!run.course) { L('NO COURSE PLOTTED.', 'dim'); break; }
          delete run.course; G.emit({ e: 'run', run }); G.save(); L('COURSE CLEARED.', 'hi'); break;
        }
        const k = Object.keys(SITES).find((s) => s === q || norm(SITES[s].name).startsWith(q) || norm(SITES[s].name).includes(q));
        if (!k) { L('UNKNOWN SITE. Try SITES.', 'bad'); break; }
        if (!inOrbit) { L('ROUTING ONLY AVAILABLE IN ORBIT.', 'bad'); break; }
        if (run.route === k) { L('ALREADY IN ORBIT OVER ' + SITES[k].name.toUpperCase() + '.', 'dim'); break; }
        const why = G.routeProblem(k); if (why) { L(why, 'bad'); break; }
        run.course = k;
        G.emit({ e: 'run', run }); G.save();
        const hop = G.isHop(k);
        L('COURSE PLOTTED: ' + SITES[k].name.toUpperCase() + (hop ? ' (A SHORT HOP)' : SITES[k].cost ? ` ($${SITES[k].cost} ON JUMP)` : '') + '.', 'hi');
        L('PULL THE JUMP LEVER, BY THE LEFT SEAT IN THE COCKPIT. ROUTE CANCEL TO CLEAR IT.', 'dim');
        break;
      }
      case 'sell': {
        if (!inOrbit) { L('THE COMPANY ONLY BUYS WHILE IN ORBIT.', 'bad'); break; }
        const scrap = [...G.items.values()].filter((it) => ITEMS[it.type].kind === 'scrap' && (it.holder != null || it.inShip));
        if (!scrap.length) { L('NO SCRAP ABOARD.', 'bad'); break; }
        const raw = scrap.reduce((s, it) => s + it.value, 0), paid = Math.round(raw * rate);
        if (parts[1] !== 'confirm') { L(`${scrap.length} ITEMS, VALUE $${raw}. CURRENT BUY RATE ${Math.round(rate * 100)}% => $${paid}`, 'hi'); L('  [ SELL CONFIRM ]', '', 'sell confirm'); break; }
        for (const it of scrap) G.emit({ e: 'itemDel', id: it.id });
        run.credits += paid; run.sold += paid; run.totalSold = (run.totalSold || 0) + paid;
        G.emit({ e: 'run', run });
        G.emitSound('sell', G.ship.termPos, { vol: 1.2 });
        L(`SOLD ${scrap.length} ITEMS FOR $${paid}.`, 'hi');
        L(`QUOTA: $${run.sold} / $${run.quota}` + (run.sold >= run.quota ? '  -- MET' : ''));
        G.save();
        break;
      }
      case 'scan': {
        const aboard = [...G.items.values()].filter((it) => ITEMS[it.type].kind === 'scrap' && (it.inShip || it.holder != null));
        L(`SCRAP ABOARD: ${aboard.length} ITEMS, $${aboard.reduce((s, it) => s + it.value, 0)}`, 'hi');
        if (G.round && G.mode === 'site') { const left = [...G.items.values()].filter((it) => ITEMS[it.type].kind === 'scrap' && !it.inShip && it.holder == null); L(`ON SITE: ~${left.length} ITEMS REMAINING`, ''); L('TIME: ' + fmtTime(G.round.time), 'dim'); }
        break;
      }
      case 'quota':
        L(`PROFIT QUOTA: $${run.sold} / $${run.quota}`, 'hi');
        L(`DEADLINE: ${run.daysLeft} ${run.daysLeft === 1 ? 'DAY' : 'DAYS'}   BUY RATE: ${Math.round(rate * 100)}%`);
        L(`CREDITS: $${run.credits}   CYCLE: ${run.cycle}`);
        if (run.daysLeft <= 0) L('DEADLINE REACHED.', 'bad');
        break;
      case 'bestiary': case 'creatures': {
        const q = norm(parts.slice(1).join(''));
        const k = q && Object.keys(MON_DEFS).find((m) => m.startsWith(q) || norm(MON_DEFS[m].name).includes(q));
        if (k) { L(MON_DEFS[k].name.toUpperCase(), 'hi'); L(BESTIARY[k]); }
        else { L('FIELD NOTES (compiled from recovered body cams)', 'hi'); for (const m in MON_DEFS) L('  ' + MON_DEFS[m].name, '', 'bestiary ' + m); }
        break;
      }
      case 'crew':
        for (const p of G.players.values()) L(`  ${p.name.padEnd(16)} ${p.alive ? (p.zone === 'in' ? 'INSIDE FACILITY' : G.inShip(p) ? 'ABOARD' : 'OUTSIDE') : 'NO LIFE SIGNS'}`, p.alive ? '' : 'bad');
        break;
      default: {
        // a blast door's code (stencilled on it, and shown on the map): raise it, or drop it again
        const d = G.fac && G.round && !inOrbit && G.fac.blasts.find((b) => b.code.toLowerCase() === norm(cmd));
        if (d) {
          const open = !d.open;
          G.emit({ e: 'blast', id: d.id, open });
          L('BLAST DOOR ' + d.code + (open ? ': RAISING' : ': DROPPING'), 'hi');
          G.emitSound('beep', G.ship.termPos, { f: open ? 880 : 520 });
          break;
        }
        L('UNKNOWN COMMAND. Type HELP.', 'bad');
      }
    }
    G.sendTo(pid, { t: 'term', lines: out });
  },
  // whoever was at the rover's console lets go of it; whoever was carrying it drops it where they stand
  hostRoverRelease(p) {
    const R0 = Rover.state; if (!Rover.owned) return;
    if (R0.driver === p.id) G.emit({ e: 'rover', driver: null });
    if (R0.carrier === p.id) {
      const y = p.zone === 'in' && G.fac ? G.fac.floorY(p.pos.x, p.pos.z, p.pos.y + 0.3) : G.groundAt(p.pos.x, p.pos.z);
      G.emit({ e: 'roverCarry', pid: null, x: p.pos.x, y, z: p.pos.z, yaw: R0.yaw, zone: p.zone });
    }
  },
  hostPlayerLeft(pid) {
    const p = G.players.get(pid); if (!p) return;
    G.hostRoverRelease(p);
    p.slots.forEach((id) => { if (id != null) G.emit({ e: 'drop', item: id, x: p.pos.x, y: p.zone === 'in' && G.fac ? G.fac.floorY(p.pos.x, p.pos.z, p.pos.y) : G.groundAt(p.pos.x, p.pos.z), z: p.pos.z, ry: 0, inShip: p.zone === 'out' && G.ship.inside(p.pos.x, p.pos.y + 0.3, p.pos.z) }); });
    for (const m of G.monsters.values()) if (m.type === 'leech' && m.victim === pid) m.detach();
    G.emit({ e: 'leave', id: pid });
    G.emit({ e: 'peers', list: [...G.players.values()].map((q) => q.peerId).filter(Boolean) });
  },
  hostTick(dt) {
    // The marsh water only slows you while you wade; over your head it drowns you
    if (G.mode === 'site' && !G.flight && G.ext && G.ext.water != null && (G.waterT = (G.waterT || 0) - dt) <= 0) {
      G.waterT = 0.5;
      for (const p of G.alivePlayers()) {
        if (p.zone !== 'out' || G.inShip(p)) continue;
        // (by where their feet are: on a jetty or a roof over it they're dry)
        if (G.ext.water - p.pos.y > 1.45) G.hurtPlayer(p.id, 20, 'water');
      }
    }
    // On an airless moon or rock the sky isn't empty. Some landings a meteoroid shower comes through (a light one, or a
    // heavy one with a big strike in it), the survey office radioing a warning half a minute ahead. And now and then the
    // shower is only the leading edge: debris shed by something much bigger on its way in. It shows as a new star, then
    // a rock, swelling in the sky as the showers come thicker and heavier, until it hits. The crew has to be off the
    // surface by then; whoever's left on it, ship and all, goes with the moon. (From orbit, you watch it hit.)
    const R0 = G.round;
    if (R0 && G.mode === 'site' && !G.flight && G.ext && G.ext.biome.airless && !R0.lost) {
      if (R0.strikeAt === undefined) {
        const roll = Math.random();
        R0.strikeAt = roll < 0.15 && R0.time < 17 * 60 ? R0.time + 60 + Math.random() * 120 : roll < 0.45 ? R0.time + 90 + Math.random() * 330 : null;
        R0.doomed = roll < 0.15 && R0.strikeAt != null;
      }
      if (R0.strikeAt != null) {
        if (!R0.strikeWarned && R0.time > R0.strikeAt - 30) { R0.strikeWarned = true; G.emit({ e: 'chat', text: 'Mercy Survey: meteoroid swarm crossing your position. Impacts inside the minute. Get under cover.', sys: true }); G.emitSound('alarm', G.ship.leverPos, {}); }
        if (R0.time > R0.strikeAt) {
          R0.strikeAt = null;
          if (!R0.doomed) G.hostMeteors(Math.random());
          else {
            // (the first of it: then the radio works out where it came from)
            const at = Math.min(23.5 * 60, R0.time + 200 + Math.random() * 60), az = Math.random() * TAU, el = 0.5 + Math.random() * 0.5;
            G.emit({ e: 'asteroid', at: +at.toFixed(1), az: +az.toFixed(3), el: +el.toFixed(3) });
            G.hostMeteors(0.25);
            R0.showerT = 35; R0.doomWarn = 0;
            G.timers.push({ t: 6, fn: () => G.emit({ e: 'chat', text: `Mercy Survey: that was debris, shed by something bigger. The parent body is on a collision course with ${SITES[R0.site].name}. Impact at ${fmtTime(at)}. Get off the surface before then.`, sys: true }) });
          }
        }
      }
      const D0 = R0.doom;
      if (D0) {
        const left = D0.at - R0.time;
        // the showers coming thicker and heavier the closer it gets
        R0.showerT -= dt;
        if (R0.showerT <= 0 && left > 4) { const k = clamp(1 - left / 230, 0.25, 1); R0.showerT = lerp(32, 12, k) + Math.random() * 8; G.hostMeteors(k, D0.az, D0.el); }
        // (the survey office counting it down over the radio, the ship's klaxon going with it)
        if (R0.doomWarn < 1 && left < 60) { R0.doomWarn = 1; G.emit({ e: 'chat', text: `Mercy Survey: one hour to impact. Start loading up.`, sys: true }); G.emitSound('alarm', G.ship.leverPos, {}); }
        if (R0.doomWarn < 2 && left < 15) { R0.doomWarn = 2; G.emit({ e: 'chat', text: `Mercy Survey: fifteen minutes. Whoever is still down there, get to the ship. Now.`, sys: true }); G.emitSound('alarm', G.ship.leverPos, {}); }
        if (left <= 0) { R0.lost = true; G.emit({ e: 'doomed', site: R0.site }); Store.del(G.saveKey); return; }
      }
    }
    // (and from orbit, having got away in time: it comes down on the moon we left)
    const DR = G.run && G.run.doom;
    if (DR && G.mode === 'orbit' && !G.seq && !G.jumping) {
      DR.t -= dt;
      if (DR.t <= 0) {
        const run = G.run, at = G.ship.impactAt(DR.site, run.route);
        delete run.doom;
        G.emit({ e: 'run', run });
        if (at) {
          // (the rock falls in for 8 s; the scar is there once the flash has gone)
          G.emit({ e: 'impact', site: DR.site, lat: at.lat, lon: at.lon });
          G.timers.push({ t: 10, fn: () => {
            const r2 = G.run; if (r2 !== run) return;
            (run.scars || (run.scars = [])).push({ site: DR.site, lat: at.lat, lon: at.lon, r: 0.16 });
            if (run.scars.length > 8) run.scars.shift();
            G.emit({ e: 'run', run });
            G.emit({ e: 'chat', text: `Mercy Survey: impact confirmed on ${SITES[DR.site].name}. Glad you weren't on it.`, sys: true });
          } });
        }
      }
    }
    // the hatch in flight: it shuts itself once the ship climbs too high, and opens itself after touchdown
    const f = G.flight;
    if (f && G.fp && G.ship.door.open && G.fp.y > FLY.doorAlt) G.emit({ e: 'hatch', open: false, auto: true });
    if (f && f.kind === 'land' && !f.opened && f.t > FLY.landDur + 1.9) { f.opened = true; if (!G.ship.door.open) G.emit({ e: 'hatch', open: true }); }
    for (const n of G.noises) n.age += dt;
    G.noises = G.noises.filter((n) => n.age < 1.2);
    for (const p of G.alivePlayers()) {
      p.noiseT -= dt;
      if (p.noiseT <= 0 && (p.moving || p.talking)) {
        p.noiseT = 0.33;
        if (p.moving) G.addNoise(p.pos, p.sprint ? 20 : p.crouch ? 2 : 7.5, p.zone, p.id, 'step');
        // (a voice carries as far as it's loud: a whisper only to whoever's at your shoulder, a shout down most of the
        // floor. Out on an airless moon or rock it doesn't carry at all: there it's the suits' radios)
        const vr = p.talking ? Brain.voiceR(p.loud || 0) : 0;
        if (vr > 0.5 && !(p.zone === 'out' && G.ext && G.ext.biome.airless && !G.inShip(p))) G.addNoise(p.pos.clone().setY(p.pos.y + 1.6), vr, p.zone, p.id, 'voice');
      }
      // slow recovery once nothing has hurt you for a while
      if (p.hp < 100 && G.now - (p.lastHurt || 0) > 9000) {
        p.regen = (p.regen || 0) + dt * 2;
        if (p.regen >= 4) { p.regen -= 4; p.hp = Math.min(100, p.hp + 4); G.emit({ e: 'hp', pid: p.id, hp: p.hp }); }
      }
    }
    if (G.mode === 'site') {
      const r = G.round, site = SITES[r.site];
      if (r.lost) return;
      r.time += dt / SEC_PER_MIN;
      if (!r.warn1 && r.time >= 21 * 60) { r.warn1 = true; G.emit({ e: 'notice', title: '9:00 PM', sub: '' }); }
      if (!r.warn2 && r.time >= 23 * 60) { r.warn2 = true; G.emit({ e: 'notice', title: '11:00 PM', sub: '', danger: true, alarm: true }); }
      if (r.time >= 24 * 60) { G.hostDepart('midnight'); return; }
      // every person dead: the autopilot brings the ship home, as soon as any bots still standing are back aboard
      const alive = G.alivePlayers();
      if (!alive.some((p) => !p.bot) && alive.every((p) => G.inShip(p))) { r.allDeadT += dt; if (r.allDeadT > 4) { G.hostDepart('dead'); return; } }
      // spawns
      r.spawnT -= dt;
      if (r.spawnT <= 0) { r.spawnT = (55 + Math.random() * 50) * (1 - clamp((r.time - 480) / 960, 0, 1) * 0.35); G.hostSpawnInterior(null, false); }
      // a nest: its brood (nestPool, still inside it) pour out of its crown when anyone comes into its room or near it in
      // sight of it, one after another; left alone, it breeds them back up
      const nest = G.fac.nest;
      if (nest && !nest.dead) {
        const full = nest.over ? 10 : site.power >= 7 ? 8 : 6;
        if (r.nestPool == null) r.nestPool = full;
        r.nestT = (r.nestT ?? 90) - dt;
        if (r.nestT <= 0) { r.nestT = 70 + Math.random() * 50; if (r.nestPool < full) r.nestPool++; }
        if (!r.nestFlood && r.nestPool > 0) {
          const f = G.fac, by = G.alivePlayers().find((q) => q.zone === 'in' && Math.abs(q.pos.y - nest.Y) < 2 && (f.room[f.idx(f.ti(q.pos.x), f.tj(q.pos.z))] === nest.room || (Math.hypot(q.pos.x - nest.x, q.pos.z - nest.z) < 7 && f.los(q.pos.x, q.pos.z, nest.x, nest.z, true))));
          if (by) G.hostNestFlood(by);
        }
        const fl = r.nestFlood;
        if (fl && (fl.t -= dt) <= 0) {
          fl.t = 0.4 + Math.random() * 0.45;
          const s = nest.holes.length ? nest.holes[Math.floor(Math.random() * nest.holes.length)] : nest.spots[0], id = G.nextMonId++;
          G.emit({ e: 'monSpawn', id, type: 'leech', x: s.x, y: s.y, z: s.z, home: 1 });
          G.emitSound('chitter', new THREE.Vector3(s.x, s.y, s.z), { vol: 0.8, ref: 4 });
          // (straight for whoever set them off, across the ceiling)
          const m = G.monsters.get(id), p = G.players.get(fl.pid);
          if (m && p && p.alive) { m.setState('crawl'); m.stalk = p.id; m.lostT = 0; m.hurry = true; m.goal = { x: p.pos.x, z: p.pos.z }; }
          if (--r.nestPool <= 0) r.nestFlood = null;
        }
      }
      if (r.time >= 19 * 60) {
        r.houndT -= dt;
        const hounds = [...G.monsters.values()].filter((m) => m.type === 'hound' && !m.dead).length;
        if (r.houndT <= 0) { r.houndT = r.time < 20 * 60 ? 15 + Math.random() * 15 : 40 + Math.random() * 45; if (hounds < site.hounds + (r.time > 22 * 60 && !site.bonus ? 1 : 0)) G.hostSpawnHound(); }
      }
      // blackouts
      if (!r.coreTaken) {
        r.blackoutT -= dt;
        if (r.blackoutT <= 0) {
          if (!r.blackout) { r.blackout = true; r.blackoutT = 22 + Math.random() * 25; G.emit({ e: 'power', on: false }); }
          else { r.blackout = false; r.blackoutT = 200 + Math.random() * 260; G.emit({ e: 'power', on: true }); }
        }
      }
      Brain.tick(dt);
      for (const m of G.monsters.values()) m.hostUpdate(dt);
      Monster.separate(G, dt);
    } else if (G.mode === 'leaving') {
      Brain.tick(dt);
      for (const m of G.monsters.values()) m.hostUpdate(dt);
      Monster.separate(G, dt);
      G.departT -= dt;
      if (G.departT <= 0) { G.departT = 99; G.hostOrbit(); }
    }
  },
  // ======================= flight =======================
  // The ship never really moves. Aboard, everything (players, loot, the hatch, collisions, interaction) stays in
  // ship coordinates, so walking around a ship in flight works exactly as on the ground. What flies is the picture:
  // the hull, and everything drawn aboard (your view, crewmates, loot, cabin lights, scan marks), is carried by the
  // ship's transform. Outside, the world stays put and watches it come and go.
  flightPose(f) {
    const t = f.t, w = (a, b) => Math.sin(t * a + b);
    const P = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, lift: 0, main: 0, burst: 0, gear: 1, ramp: 1, shake: 0 };
    if (f.kind === 'land') {
      const D = FLY.landDur, u = clamp(t / D, 0, 1), e = 1 - u;
      // a braking dive: straight in along its heading from where it broke out of the cloud, steep at first, flattening
      // and slowing all the way down, settling onto the struts. No turns, no weaving.
      P.y = FLY.landH * e * e * e;
      P.x = -FLY.landRun * Math.pow(e, 2.3);
      // nose down coming in, a flare as it brakes, level for touchdown
      P.pitch = -0.07 * (1 - sstep(0, 0.3, u)) + 0.16 * sstep(0.3, 0.62, u) * (1 - sstep(0.72, 0.97, u));
      const air = sstep(0, 6, P.y);
      P.pitch += (w(1.7, 0) * 0.6 + w(3.3, 1) * 0.4) * 0.012 * air; P.roll += (w(1.3, 2) * 0.6 + w(2.9, 3) * 0.4) * 0.016 * air; P.y += w(0.9, 4) * 0.25 * air;
      P.lift = t < D ? 0.4 + 0.6 * sstep(0.18, 0.5, u) : Math.max(0, 1 - (t - D) / 1.1) * 0.5;
      P.main = t < D ? 0.85 * Math.pow(e, 1.4) : 0;
      P.gear = P.y < 45 ? 1 : 0;
      P.ramp = t > D + 0.6 ? 1 : 0;
      // touchdown: the struts take the weight and the hull rocks once on them
      if (t >= D) { const k = t - D; P.x = 0; P.z = 0; P.yaw = 0; P.roll = 0; P.y = -0.12 * Math.sin(k * 10) * Math.exp(-k * 5); P.pitch = 0.012 * Math.sin(k * 8) * Math.exp(-k * 4); }
      P.shake = t < D ? 0.1 + 0.16 * P.lift : 0;
    } else {
      const L = FLY.liftAt, k = Math.max(0, t - L), B = FLY.burst;
      // Off the pad the way a freighter leaves a spaceport: it rises straight up off its struts on the belly jets,
      // slow and heavy and a little unsteady, tucks its gear and steadies in a hover; swings its nose round onto the
      // heading, banking into the turn, and lifts it a little. Then the mains light and it surges away along its nose,
      // gathering speed before your eyes (about three g: no jump to full speed), climbing steeper as it goes. The path
      // always follows the nose: it flies, it never slides.
      const pitchAt = (q) => 0.1 * sstep(1.6, 3.6, q) + 0.44 * sstep(B, B + 5, q);
      const yawAt = (q) => 0.38 * sstep(1.8, 5.8, q);
      const accAt = (q) => 0.5 * sstep(2.4, 3.4, q) * (1 - sstep(B - 0.4, B, q)) + 34 * sstep(B - 0.1, B + 1.2, q);
      let x = 0, y = 0, z = 0, v = 0;
      for (let q = 0; q < k; q += 1 / 30) {
        const dq = Math.min(1 / 30, k - q), m = q + dq / 2, p = pitchAt(m), yw = yawAt(m);
        v += accAt(m) * dq; const d = v * dq;
        x += d * Math.cos(p) * Math.cos(yw); y += d * Math.sin(p); z -= d * Math.cos(p) * Math.sin(yw);
      }
      // (the hover: a slow sway on the jets, settling once it's under way)
      const hov = sstep(0.4, 1.6, k) * (1 - sstep(B, B + 2, k));
      P.x = x + 0.14 * Math.sin(k * 1.3) * hov; P.z = z + 0.1 * Math.sin(k * 1.7 + 1) * hov;
      P.y = 6.5 * sstep(0, 2.8, k) + y + 0.12 * Math.sin(k * 2.1) * hov;
      P.yaw = yawAt(k); P.pitch = pitchAt(k) + 0.012 * Math.sin(k * 1.9 + 2) * hov;
      // banked into the turn, as much as it's turning, and level again once it's on its heading
      P.roll = -1.1 * (yawAt(k + 0.05) - yawAt(k - 0.05)) / 0.1 + 0.016 * Math.sin(k * 1.5 + 0.5) * hov;
      const air = sstep(0, 4, P.y);
      P.pitch += w(1.9, 0.5) * 0.006 * air; P.roll += w(1.4, 1.5) * 0.008 * air;
      // firing up, the whole frame trembles on its struts, harder as the jets build
      const spool = sstep(0.3, L, t) * (1 - sstep(0, 1.2, k));
      P.y += spool * 0.02 * Math.sin(t * 37); P.roll += spool * 0.004 * Math.sin(t * 29);
      // (the mains idle along while it hovers and glow up as they're brought to readiness; they light with a flare
      // and settle into a roaring burn while the belly jets fade)
      const kick = sstep(B - 0.1, B + 0.4, k), flare = k > B ? Math.exp(-(k - B) * 2.5) : 0;
      // (the lift jets cough alight one after another, sputtering and catching, then build steadily to a roar: no
      // countdown, just the noise and the dust, and a few seconds to get aboard)
      const cough = t < 3.2 ? Math.max(0, Math.sin(t * 7.3 + 1) * Math.sin(t * 2.9)) * 0.55 * sstep(0.4, 1, t) : 0;
      P.lift = t < L ? Math.max(0.06 + cough, 0.12 + 0.75 * sstep(2.2, L, t)) : (1 - 0.25 * sstep(2.8, 4, k)) * (1 - 0.65 * sstep(B, B + 2.2, k));
      P.main = 0.1 * sstep(0.3, L, t) + 0.2 * sstep(B - 1.4, B - 0.2, k) + 0.95 * kick + 0.35 * flare * kick;
      P.burst = sstep(B - 0.1, B + 0.4, k);
      P.gear = P.y > 3 ? 0 : 1;
      // (the ramp stays down until the last moment: it comes up as the ship lifts, tipping in whoever is on it)
      P.ramp = t < L - 1.5 ? 1 : 0;
      P.shake = 0.05 + 0.2 * spool + 0.1 * P.lift + 0.32 * kick * (1 - sstep(B + 0.4, B + 2.6, k)) + 0.08 * sstep(B, B + 2, k);
    }
    return P;
  },
  // is this point inside the ship's hull (in ship coordinates)?
  // the roof hatch opens on the ground, and in the air while the ship is low with its shutters up; it's called shut a
  // few seconds before the shutters come down for the burn out of the air (and never opens in space)
  roofOpen() {
    const f = G.flight;
    if (G.mode !== 'site' && G.mode !== 'leaving') return false;
    if (G.ship.shut.t > 0.15) return false;
    return !(f && f.kind === 'takeoff' && f.t > (f.dur || FLY.toDur) - 2.8);
  },
  posAboard(v) { return G.ship.onFootprint(v.x, v.z) && v.y > -1.2 && v.y < 7.5; },   // (up to the roof deck and a jump off it)
  // is this player riding along? (fixed at liftoff: nobody joins or leaves a ship in the air)
  playerAboard(p) {
    if (!p || !G.flight) return false;
    if (G.flight.aboard) return G.flight.aboard.has(p.id);
    return p.zone === 'out' && G.posAboard(p.pos);
  },
  // ship coordinates -> where it is drawn right now (in place when the ship is on the ground)
  carry(v) { return G.shipMoved ? v.applyMatrix4(G.shipM) : v; },
  carryIfAboard(v) { return G.shipMoved && G.posAboard(v) ? v.applyMatrix4(G.shipM) : v; },
  updateFlight(dt) {
    const S = G.ship, f = G.flight;
    if (!f) {
      if (G.shipMoved) { S.group.position.set(0, 0, 0); S.group.rotation.set(0, 0, 0); S.group.updateMatrixWorld(true); G.shipM.identity(); G.shipQ.identity(); S.placeLights(G.shipM); G.shipMoved = false; }
      S.airborne = false; G.fp = null;
      if (S.lift || S.main) S.setThrust(0, 0);
      // (whatever smoke is still hanging about drifts off and thins out; the wind it made dies down)
      if (G.ext && dt > 0 && (S.smoke.visible || S.scorchT > 0)) S.stepSmoke(dt, S.smokeMat.uniforms.uCol.value, (x, z) => G.ext.height(x, z), G.ext.height(0, 0));
      // (and the dust the jets threw up settles, rather than hanging where it was when they cut out)
      if (S.wash.visible) { if (G.ext && dt > 0) S.updateWash(dt, 0, 0, 0, 0, (x, z) => G.ext.height(x, z), S.washMat.uniforms.uCol.value, _noGlow); else if (!G.ext) S.wash.visible = false; }
      if (G.ext && G.ext.blastU.value.z) G.ext.setBlast(0, 0, 0, 20);
      SFX.blastWind = 0;
      return;
    }
    f.t += dt;
    const p = G.fp = G.flightPose(f);
    S.group.position.set(p.x, p.y, p.z); S.group.rotation.set(p.roll, p.yaw, p.pitch, 'YZX'); S.group.updateMatrixWorld(true);
    G.shipM.copy(S.group.matrixWorld); G.shipQ.copy(S.group.quaternion); G.shipMoved = true;
    S.placeLights(G.shipM);
    S.airborne = f.kind === 'land' ? f.t < FLY.landDur : f.t >= FLY.liftAt;
    S.setThrust(p.lift, p.main);
    S.gearTarget = p.gear; S.rampTarget = p.ramp;
    const me = G.me();
    // the ramp coming up tips whoever is standing on it in through the hatch (all the while it's on its way up)
    if (f.kind === 'takeoff' && f.t >= FLY.liftAt - 1.5 && f.t < FLY.liftAt && S.rampT > 0.45) {
      const onRamp = (q) => q && q.alive && q.zone === 'out' && G.ship.rampAt(q.pos.x, q.pos.z) != null && Math.abs(q.pos.y - G.ship.rampAt(q.pos.x, q.pos.z)) < 0.9;
      const inside = (q) => { q.pos.set((SHIP.doorX0 + SHIP.doorX1) / 2, 0, 3.6); if (q === me) { Player.spawn(q.pos.x, 0, q.pos.z, me.yaw); Player.addShake(0.3); } };
      if (onRamp(me)) { inside(me); SFX.play('clunk', null, { vol: 0.8 }); }
      if (G.isHost) for (const q of G.players.values()) if (q.bot && onRamp(q)) inside(q);
    }
    // who is aboard is settled the moment the ship leaves the ground (but see 'board': whoever catches the sill)
    if (f.kind === 'takeoff' && !f.aboard && S.airborne) f.aboard = new Set(G.alivePlayers().filter((q) => q.zone === 'out' && G.posAboard(q.pos)).map((q) => q.id));
    // for a moment after it lifts, someone right under the hatch can still jump for the sill and haul themselves in
    if (f.kind === 'takeoff' && f.aboard && !f.grabbed && f.t < FLY.liftAt + FLY.grab && me && me.alive && me.zone === 'out' && !f.aboard.has(me.id)) {
      const sill = _fxA.set((SHIP.doorX0 + SHIP.doorX1) / 2, 0, 4.35).applyMatrix4(G.shipM);
      if (Math.hypot(sill.x - me.pos.x, sill.z - me.pos.z) < 1.5 && sill.y - me.pos.y < 2.7) { f.grabbed = true; G.request({ a: 'board' }); }
    }
    // only once it's past catching are those still on the ground left behind
    if (f.kind === 'takeoff' && f.aboard && !f.leftDone && f.t >= FLY.liftAt + FLY.grab + 0.2) { f.leftDone = true; G.leftBehind(f); }
    const aboard = G.playerAboard(me);
    if (f.kind === 'land' && !f.down && f.t >= FLY.landDur) {
      f.down = true; SFX.play('thud', new THREE.Vector3(-1, 0.2, 0), { vol: 1.1 }); if (me && me.alive) Player.addShake(aboard ? 0.9 : 0.35);
      // (grit kicked up round each foot as the struts take the weight)
      if (G.ext) for (const [x, z] of [[-6.1, -4], [-6.1, 4], [2.9, -4], [2.9, 4]]) { const gy = G.ext.height(x, z); FX.grit(_fxA.set(x, gy + 0.05, z), { n: [6, 10], spread: 1.2, speed: [1.5, 4], floor: gy, color: [0.14, 0.13, 0.12] }); }
    }
    if (f.kind === 'takeoff' && !f.up && f.t >= FLY.liftAt) { f.up = true; SFX.play('clunk', new THREE.Vector3(-1, -0.3, 0), { vol: 0.9, pitch: 0.7 }); }
    // the burst: a thump you feel through the deck (or hear roll across the ground) and the roar of the mains opening up
    if (f.kind === 'takeoff' && !f.boom && f.t >= FLY.liftAt + FLY.burst - 0.1) {
      f.boom = true; const tail = aboard ? null : S.exhaust.clone().applyMatrix4(G.shipM);
      SFX.play('ignite', tail, { vol: aboard ? 0.7 : 1.3, ref: 30 }); SFX.play('engine', tail, { dur: 5, vol: 1.5, ref: 60 });
      // where the flame hits: straight down the exhaust from the main nozzle (or under the tail, if it's pointing too
      // flat to reach the ground): it blows a cloud of smoke and a ring of dust out across it and burns it black
      if (G.ext) {
        const h = (x, z) => G.ext.height(x, z), at = S.exhaust.clone().applyMatrix4(G.shipM), dir = new THREE.Vector3(-1, 0, 0).transformDirection(G.shipM), q = at.clone();
        let hit = false; for (let s = 0; s < 60 && !hit; s += 0.5) { q.copy(at).addScaledVector(dir, s); hit = q.y <= h(q.x, q.z); }
        if (!hit) q.copy(at);
        q.y = h(q.x, q.z); S.burstAt(q.x, q.y, q.z, h); f.boomAt = { x: q.x, z: q.z, t: f.t };
        for (const e of S.exhausts) { const ep = e.clone().applyMatrix4(G.shipM); FX.sparks(ep, { n: 40, r: 0.3, dir: dir, spread: 0.5, speed: [8, 24], floor: h(ep.x, ep.z), life: [0.5, 1.4], size: [0.05, 0.09], streak: 0.06 }); }
        // (its firelight joins the lamps the renderer picks from, until the site is gone)
        for (const L of S.fireLights) if (!G.lightSources.includes(L)) G.lightSources.push(L);
      }
    }
    // climbing into the cloud deck, the blast shutters come down for the burn out of the air; before they do, a klaxon
    // on the roof hatch calls anyone riding up there back down inside
    if (f.kind === 'takeoff' && f.t > (f.dur || FLY.toDur) - 1.3) S.setShutters(true);
    if (f.kind === 'takeoff' && me && me.roof && !Player.climbing && !G.roofOpen()) { SFX.play('alarm', null, { vol: 0.5 }); Player.climb(false); }
    if (me && me.alive && aboard && dt > 0) Player.addShake(p.shake);
    // the dust (spray, ash) the jets tear off the ground under the ship
    if (G.ext && dt > 0) {
      const gy = G.ext.height(p.x, p.z), alt = p.y - gy, B = G.ext.biome;
      const strength = p.lift * (1 - sstep(4, 30, alt));
      const L = G.ext.lighting(G.round ? G.round.time : 720), day = 0.22 + 0.78 * (1 - L.night);
      const base = B.water != null ? [0.66, 0.7, 0.66] : B.ground.trail;
      const col = new THREE.Color(base[0] * day, base[1] * day, base[2] * day), glow = new THREE.Color(0.7, 0.3, 0.08).multiplyScalar(p.lift * (1 - sstep(2, 18, alt)));
      S.washVac = !!B.airless; S.updateWash(dt, strength, p.x, gy, p.z, (x, z) => G.ext.height(x, z), col, glow);
      S.updateSmoke(dt, p, _smokeCol.setRGB(0.34 * day, 0.33 * day, 0.32 * day), (x, z) => G.ext.height(x, z));
      // grit the jets tear off the ground and fling out from under it; once the mains are lit, embers streaming back
      // off the bells (thrown at the ship's own speed, so they trail it)
      const sv = _fxV.copy(S.group.position).sub(G.fxShip || S.group.position).divideScalar(dt); G.fxShip = (G.fxShip || new THREE.Vector3()).copy(S.group.position);
      if (strength > 0.2 && Math.random() < strength * dt * 26) {
        const a = Math.random() * TAU, r = 2 + Math.random() * 6, at = _fxA.set(p.x + Math.cos(a) * r, gy + 0.05, p.z + Math.sin(a) * r);
        FX.grit(at, { n: [1, 3], dir: _fxD.set(Math.cos(a), 0.5, Math.sin(a)), spread: 0.45, speed: [4, 4 + 9 * strength], floor: gy, color: [base[0] * 0.4 * day, base[1] * 0.4 * day, base[2] * 0.4 * day] });
      }
      if (p.main > 0.4 && sv.lengthSq() < 1e6) for (const e of S.exhausts) {
        if (Math.random() > dt * 36 * p.main) continue;
        FX.embers(_fxA.copy(e).applyMatrix4(G.shipM), { n: [2, 4], r: 0.3, dir: _fxD.set(-1, 0, 0).transformDirection(G.shipM), spread: 0.16, speed: [10, 26], drag: 2.2, grav: 0.4, life: [0.4, 0.9], size: [0.08, 0.15], streak: 0.035, color: [2.2, 1.9, 1.5], color1: [1.4, 0.38, 0.05], flicker: 0.3, vel: sv });
      }
      // and its wind: the downwash flattening the grass and bending the trees under it while it's low, then the blast
      // when the mains fire, rolling out from where the flame hit (heard as a roaring gust by anyone near enough)
      const w = f.boomAt ? Math.exp(-(f.t - f.boomAt.t) * 1.2) : 0, cam = R.camera.position;
      if (w * 2.4 > strength) G.ext.setBlast(f.boomAt.x, f.boomAt.z, 2.4 * w, 14 + 30 * (1 - w));
      else G.ext.setBlast(p.x, p.z, strength * 1.2, 12);
      SFX.blastWind = Math.max(strength * Math.exp(-Math.hypot(cam.x - p.x, cam.z - p.z) / 40), f.boomAt ? w * 1.2 * Math.exp(-Math.hypot(cam.x - f.boomAt.x, cam.z - f.boomAt.z) / 70) : 0);
    }
    // riding up on the roof deck: the wind of the ship's own speed, roaring past and shoving you about
    if (me && me.roof && dt > 0) {
      const sp = f.lastP ? Math.hypot(p.x - f.lastP.x, p.y - f.lastP.y, p.z - f.lastP.z) / dt : 0;
      SFX.blastWind = Math.max(SFX.blastWind || 0, clamp(sp / 35, 0, 1.3)); Player.addShake(Math.min(0.45, sp / 140));
    }
    if (dt > 0) f.lastP = { x: p.x, y: p.y, z: p.z };
    if (f.kind === 'land' && f.t > FLY.landDur + 3.2) { G.flight = null; G.updateFlight(0); }
  },
  // carry the local view along when riding the ship (called after the player has been simulated)
  carryCamera() {
    const cam = R.camera, me = G.me();
    G.simCam.position.copy(cam.position); G.simCam.quaternion.copy(cam.quaternion); G.simCam.updateMatrixWorld(true);
    G.camCarried = false;
    if (!G.shipMoved || !me) return;
    // (a spectator's chase camera may sit just outside the hull behind whoever it follows)
    const c = cam.position, ride = me.alive ? G.playerAboard(me) : c.x > -14 && c.x < 12 && Math.abs(c.z) < 7 && c.y > -1 && c.y < 8 && G.alivePlayers().some((p) => G.playerAboard(p));
    if (!ride) return;
    cam.position.applyMatrix4(G.shipM); cam.quaternion.premultiply(G.shipQ); cam.updateMatrixWorld(true);
    G.camCarried = true;
  },
  // put the view back in ship coordinates before the player is simulated again (death cam and spectating lerp from it)
  uncarryCamera() {
    if (!G.camCarried) return;
    R.camera.position.copy(G.simCam.position); R.camera.quaternion.copy(G.simCam.quaternion); G.camCarried = false;
  },
  // which world the view is in: your own; the dead see where they're watching; the send-off flies from one to the other
  zoneOf(me) { return G.sendoff ? G.sendoff.zone : Rover.driving ? Rover.zone : me.alive ? me.zone : (me.zoneView || me.zone); },
  // ======================= the send-off =======================
  // Whoever the ship leaves behind (alive and not aboard when it lifts off, or dead with their body still down here)
  // gets one last look. Out in the open, the view stays right where you are (your eyes, or over where you fell) and
  // turns to follow the ship as it lifts away and climbs into the sky without you. Shut in down below, it starts on
  // you and flies the quickest way out: along the corridors and up the stairwells to the nearest exit, out through
  // the door into the open and across the ground (the farther it has to come, the faster it comes), and comes to rest
  // there to watch it go.
  leftBehind(f) {
    f.left = [...G.players.values()].filter((p) => !f.aboard.has(p.id) && !(!p.alive && p.zone === 'out' && G.posAboard(p.pos))).map((p) => p.id);
    if (!f.left.length) return;
    f.dur = FLY.toDur + FLY.sendoff;
    if (G.isHost) G.departT += FLY.sendoff;
    if (f.left.includes(G.localId)) G.startSendoff();
  },
  startSendoff() {
    const me = G.me(), fac = G.fac, ext = G.ext;
    if (!me || !ext || G.sendoff) return;
    const cam = R.camera;
    if (me.zone !== 'in' || !fac) {
      const pos = me.alive ? cam.position.clone() : new THREE.Vector3(me.pos.x, me.pos.y + 1.1, me.pos.z);
      G.sendoff = { t: 0, pos, q: cam.quaternion.clone(), yaw: me.yaw, zone: 'out', murk: G.murk() };
      HUD.hideSpectate(); HUD.letterbox(true); R.fx.static = 0;
      return;
    }
    // down in the facility the view breaks up into static and cuts to the ground outside, on the side of the pad the
    // way in is on, the ship already in view
    const sp = ext.entrance.spawn, dir = new THREE.Vector3(sp.x, 0, sp.z); if (dir.lengthSq() < 1) dir.set(0, 0, 1);
    const pos = dir.normalize().multiplyScalar(30); pos.y = ext.height(pos.x, pos.z) + 1.7;
    const shipAt = G.ship.group.position.clone(); shipAt.y += 1.5;
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, shipAt, new THREE.Vector3(0, 1, 0)));
    G.sendoff = { t: 0, pos, q, yaw: Math.atan2(pos.x, pos.z), zone: 'out', cut: 1.2, murk: G.murk() };
    HUD.hideSpectate(); HUD.letterbox(true); R.fx.static = 1; SFX.play('static', null, { dur: 1.2, vol: 1.2 });
  },
  // (how thick the air is down here for losing sight of something, under fog, rain or storm; a clear day keeps it in
  // view until it's up in the cloud)
  murk() { return G.ext && G.round && G.round.weather !== 'clear' ? G.ext.lighting(G.round.time).fogDen : 0; },
  updateSendoff(dt) {
    const so = G.sendoff, me = G.me(), cam = R.camera;
    so.t += dt;
    const t = so.t, shipAt = G.ship.group.position.clone(); shipAt.y += 1.5;
    // (cut in from the facility: the static clearing off the picture)
    if (so.cut) R.fx.static = 1 - sstep(0.3, so.cut, t);
    // turning to follow it, slowly at first, then held on it the way your eyes would be (never quite rolling over
    // as it goes straight up overhead)
    const d = _fxD.copy(shipAt).sub(so.pos), h = Math.hypot(d.x, d.z);
    if (h > 0.4) so.yaw = Math.atan2(-d.x, -d.z);
    const want = _shQ.setFromEuler((so.e || (so.e = new THREE.Euler(0, 0, 0, 'YXZ'))).set(clamp(Math.atan2(d.y, h), -1.2, 1.4), so.yaw, 0));
    so.q.slerp(want, 1 - Math.exp(-dt * lerp(0.7, 6.5, sstep(0, 1.6, t))));
    me.zoneView = 'out'; R.flash.intensity = 0;
    cam.position.copy(so.pos); cam.position.y += Math.sin(t * 0.8) * 0.012; cam.quaternion.copy(so.q); cam.updateMatrixWorld();
    // watching it climb away, the view closes in on it
    const far = so.pos.distanceTo(shipAt), fov = Settings.fov - 26 * sstep(40, 700, far);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 3, dt); cam.updateProjectionMatrix(); }
    // and where you lose it, up in the murk or the cloud, one sharp twinkle and a ting, the way they go in cartoons
    const f = G.flight;
    if (!so.kira && f && f.kind === 'takeoff' && f.t > FLY.liftAt + FLY.burst && (1 - Math.exp(-((so.murk * far) ** 2)) > 0.97 || shipAt.y - G.ext.height(shipAt.x, shipAt.z) > 300 || f.t > (f.dur || FLY.toDur) - 1)) {
      so.kira = { t: 0, at: shipAt.clone() }; SFX.play('glint', null, { vol: 3.5 });
    }
    if (so.kira) {
      const k = so.kira, g = G.twinkle || (G.twinkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: Pods.glintTex(), color: new THREE.Color(5, 4.6, 4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
      if (g.parent !== R.scene) R.scene.add(g);
      k.t += dt; const u = k.t, a = u < 0.06 ? u / 0.06 : Math.max(0, 1 - (u - 0.06) / 0.5), s = so.pos.distanceTo(k.at) * (0.03 + 0.07 * a);
      g.visible = a > 0; g.position.copy(k.at); g.scale.set(s, s, 1); g.material.opacity = a; g.material.rotation = u * 3;
    }
  },
  endSendoff() {
    if (!G.sendoff) return;
    if (G.twinkle) G.twinkle.visible = false;
    if (G.sendoff.cut) R.fx.static = 0;
    G.sendoff = null; HUD.letterbox(false);
    R.camera.fov = Settings.fov; R.camera.updateProjectionMatrix();
  },
  // engines as heard from here: through the hull when aboard, falling away with distance outside
  flightSound() {
    const S = G.ship;
    let level = 0, gale = 0, inside = true;
    if (G.fp) {
      level = Math.max(G.fp.lift, G.fp.main);
      if (G.camCarried) {
        inside = S.door.t < 0.4;
        if (S.door.t > 0.05 && S.airborne) gale = S.door.t * (0.35 + 0.65 * sstep(3, 40, G.fp.y));
        level *= inside ? 1 : 1.15;
      } else {
        inside = false;
        const d = R.camera.position.distanceTo(S.group.position);
        level *= clamp(46 / (d + 26), 0, 1.2);
      }
    } else if (G.seq && G.seq.kind === 'land' && G.mode === 'landing') {
      // the burn, the quiet fall, then the roar of the air on the hull
      const t = G.seq.t;
      // (through the long fall the hum through the deck builds as the world comes up, and down near the top of the air
      // the first thin wisps of it start to whistle on the hull)
      const hr = S.alt / S.R;
      level = 0.95 * G.burnK(t) + 0.15 + 0.12 * sstep(0.45, 0.09, hr) + 0.85 * (G.entryHeat || 0);
      // (and the air tearing past the hull, louder the faster and deeper it goes)
      gale = Math.max(G.entryHeat || 0, 0.5 * sstep(ENTRY.air - 1, ENTRY.white, t), G.ship.airless ? 0 : 0.14 * sstep(0.15, 0.075, hr)) * 1.1;
    } else if (G.seq && G.seq.kind === 'fired' && G.seq.blown) {
      // (the air roaring out of the hatch, dying away as it goes)
      gale = 1.5 * (G.seq.gale || 0);
    } else if (G.seq && G.seq.kind === 'jump') {
      // (dropping out, the drive's roar gives way to the long braking burn in, dying away as the ship settles into orbit)
      const t = G.seq.t; level = t < JUMP.punch ? 0.25 + 0.6 * (t / JUMP.punch) ** 2 : t < JUMP.drop ? 0.75 : 0.75 * Math.max(0, 1 - (t - JUMP.drop) / 2.5) + 0.45 * sstep(JUMP.drop + 0.8, JUMP.drop + 2, t) * (1 - sstep(JUMP.end - 4, JUMP.end - 0.5, t));
    }
    SFX.setThrust(level, inside, gale, S.group.position);
  },
  // ======================= deliveries =======================
  // Orders wait on the run (run.orders) until they can be brought: in orbit the Company's drone carries them in
  // through the airlock; on the ground a supply rocket drops them a little way from the ship. One at a time.
  updateDelivery(dt) {
    const S = G.ship, r = G.robot, D = DELIVERY;
    if (r) {
      r.t += dt;
      S.poseRobot(r.t);
      const at = (k) => r.t >= D[k] && !r.done[k] && (r.done[k] = true);
      const rp = () => S.robot.position.clone();
      // what everyone hears: the drone's thrusters puffing as it manoeuvres, its clamps letting go
      for (const k of [D.arrive - 1.6, D.arrive - 0.6, D.arrive + 0.2, D.inside - 0.1, D.leave, D.leave + 0.6, D.out + 0.3]) if (r.t >= k && !r.done['p' + k] && (r.done['p' + k] = true)) SFX.play('hiss_valve', rp(), { vol: 0.5, ref: 2 });
      if (at('drop')) SFX.play('clunk', rp(), { vol: 0.8, pitch: 1.4 });
      // what the host decides: the doors, the lock, the goods
      if (G.isHost) {
        if (at('close') && S.idoor.open) G.emit({ e: 'idoor', open: false, auto: true });
        if (at('open')) G.emit({ e: 'hatch', open: true, auto: true, vent: true });
        if (at('spawn')) for (const it of r.items) G.emit({ e: 'itemSpawn', d: { id: it.id, type: it.type, value: 0, x: it.x, y: 0, z: it.z, ry: Math.random() * TAU, inShip: true, battery: 1, fy: 0.34 } });
        if (at('shut')) G.emit({ e: 'hatch', open: false, auto: true, vent: true });
        if (at('sealed')) G.emit({ e: 'lock', cycling: false });
      }
      if (r.t > D.end) { G.robot = null; S.poseRobot(-1); if (!G.isHost) S.lockCycling = false; }
      return;
    }
    if (!G.isHost || !G.run) return;
    const orders = G.run.orders || [];
    if (!orders.length || G.flight || G.seq) return;
    if (G.mode === 'orbit') {
      // set down on free floor in the chamber, nearest the middle first (things left from last time stay put)
      const cx = (SHIP.doorX0 + SHIP.doorX1) / 2, cz = AIRLOCK.z0 + 0.8, spots = [];
      for (const dx of [0, -0.24, 0.24, -0.48, 0.48]) for (const dz of [0, -0.24, 0.24, 0.46]) spots.push({ dx, dz, d: Math.hypot(dx, dz) });
      spots.sort((a, b) => a.d - b.d);
      const free = spots.filter((s) => ![...G.items.values()].some((it) => it.holder == null && Math.hypot(it.pos.x - (cx + s.dx), it.pos.z - (cz + s.dz)) < 0.2));
      const types = orders.splice(0, Math.min(6, free.length));
      if (!types.length) return;
      const items = types.map((type, i) => ({ id: G.nextItemId++, type, x: +(cx + free[i].dx).toFixed(2), z: +(cz + free[i].dz).toFixed(2) }));
      G.emit({ e: 'run', run: G.run });
      G.emit({ e: 'delivery', items });
    } else if (G.mode === 'site' && G.ext) {
      if (!G.podBusy) { G.hostLaunchPod(orders.splice(0, 8)); return; }
      // (orders that come in while the last one's still being loaded, its first ten seconds or so, go on the same pod)
      const pod = Pods.get(G.nextPodId);
      if (pod && !pod.hit && pod.t < -(POD.WAIT + POD.GLINT) + 10 && pod.items.length < 8) {
        G.emit({ e: 'podAdd', id: pod.id, items: orders.splice(0, 8 - pod.items.length).map((type) => ({ id: G.nextItemId++, type })) });
        G.emit({ e: 'run', run: G.run });
      }
    }
  },
  // a supply rocket for whatever was ordered on the ground: it comes down within sight of the ship but not on it,
  // somewhere open (no trees, rocks, buildings, water or the trail in the way)
  hostLaunchPod(types) {
    const ext = G.ext; let at = null;
    for (let k = 0; k < 240 && !at; k++) {
      const wide = k > 160, a = Math.random() * TAU, d = wide ? 26 + Math.random() * 34 : 32 + Math.random() * 14;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!ext.clearOf(x, z, wide ? 0 : 1.5) || !ext.freeAt(x, z, POD.CRATER * 1.2)) continue;
      const hs = [0, 1, 2, 3].map((i) => ext.height(x + Math.cos(i * 1.57) * 3, z + Math.sin(i * 1.57) * 3));
      if (Math.max(...hs) - Math.min(...hs) > 1.4) continue;
      at = { x: +x.toFixed(2), z: +z.toFixed(2) };
    }
    if (!at) { (G.run.orders = G.run.orders || []).unshift(...types); return; }
    G.podBusy = true;
    G.emit({ e: 'run', run: G.run });
    G.emit({ e: 'pod', id: G.nextPodId = (G.nextPodId || 0) + 1, x: at.x, z: at.z, dir: +(Math.random() * TAU).toFixed(3), items: types.map((type) => ({ id: G.nextItemId++, type })) });
    G.timers.push({ t: POD.WAIT + POD.GLINT + POD.FALL + 3, fn: () => { G.podBusy = false; } });
  },
  // ======================= interaction (local) =======================
  interactables(me) {
    const out = [];
    for (const it of G.items.values()) {
      if (it.holder != null || G.itemZone(it) !== me.zone || G.itemSealed(it)) continue;
      if (it.pos.distanceTo(me.pos) > 3.6) continue;
      const d = ITEMS[it.type];
      // (something in an open locker or cabinet wins over its door, swung out right by your head)
      out.push({ kind: 'item', ref: it, x: it.vis.x, y: it.vis.y + (d.twoHanded ? d.tall || 0.3 : 0.12), z: it.vis.z, r: d.twoHanded ? 0.55 : 0.32, pen: it.box != null ? -0.9 : 0, label: 'Pick up ' + d.name, value: d.kind === 'scrap' ? it.value : 0 });
    }
    if (me.zone === 'in' && G.fac) {
      for (const d of G.fac.doors) if (!d.broken && Math.hypot(d.x - me.pos.x, d.z - me.pos.z) < 3.2) out.push({ kind: 'door', ref: d, x: d.x, y: d.y + 1.2, z: d.z, r: 0.75, label: d.open ? 'Close door' : 'Open door' });
      for (const c of G.fac.containers) {
        if (Math.abs(c.x - me.pos.x) > 3 || Math.abs(c.z - me.pos.z) > 3) continue;
        const f = G.fac.containerFront(c), name = c.kind === 'locker' ? 'locker' : 'cabinet';
        if (!c.open) { out.push({ kind: 'box', ref: c, x: f.x, y: f.y, z: f.z, r: 0.4, label: 'Search ' + name }); continue; }
        // open, it's shut by its door; looking into it shuts it too, but whatever's in there comes first
        const dd = G.fac.containerDoor(c);
        out.push({ kind: 'box', ref: c, x: dd.x, y: dd.y, z: dd.z, r: 0.35, label: 'Close ' + name });
        out.push({ kind: 'box', ref: c, x: f.x, y: f.y, z: f.z, r: 0.4, pen: 1.5, label: 'Close ' + name });
      }
      for (const ex of G.fac.exits) if (Math.hypot(ex.x - me.pos.x, ex.z - me.pos.z) < 3.5) out.push({ kind: 'exit', ref: ex, x: ex.x, y: FAC_Y0 + 1.3, z: ex.z, r: 1.1, label: 'Exit facility' });
    } else {
      if (G.ext && (G.mode === 'site' || G.mode === 'leaving')) for (const o of G.ext.interact) out.push({ kind: 'enter', ref: o, x: o.x, y: o.y, z: o.z, r: o.r, label: o.which === 'fire' ? 'Enter facility (fire exit)' : 'Enter facility' });
      for (const o of G.ship.interact) {
        let label = '';
        if (o.kind === 'terminal') label = 'Use terminal';
        if (o.kind === 'monitor') label = o.act === 'radar' ? 'Radar sweep' : o.act === 'next' ? 'Next view' : 'Previous view';
        const armed = G.now - G.leverConfirm < 4000;
        if (o.kind === 'lever' && (G.flight || G.robot || G.seq || G.mode === 'leaving' || G.mode === 'landing')) continue;
        if (o.kind === 'lever') label = G.mode === 'orbit' ? (G.run.daysLeft <= 0 ? (armed ? 'Submit anyway' : 'Submit quota') : SITES[G.run.route].giant ? 'No surface: ROUTE to a moon' : 'Land at ' + SITES[G.run.route].name) : G.mode === 'site' ? (armed ? 'Leave them behind' : 'Depart') : '...';
        if (o.kind === 'jump') { if (G.flight || G.robot || G.seq || G.jumping) continue; label = G.mode !== 'orbit' ? 'Jump drive (only in orbit)' : G.run.course ? 'Jump to ' + SITES[G.run.course].name : 'Jump drive: no course plotted'; }
        if (o.kind === 'hatch') label = G.ship.door.open ? 'Close hatch' : 'Open hatch';
        if (o.kind === 'idoor') label = G.ship.lockCycling ? 'Locked' : G.ship.idoor.open ? 'Close door' : 'Open door';
        if (o.kind === 'charger') { const id = me.slots[me.sel], it = id != null && G.items.get(id), busy = G.ship.chg && G.ship.chg.t != null && G.ship.chg.t < 2.4; label = busy ? 'Charging…' : it && ITEMS[it.type].battery ? 'Charge ' + ITEMS[it.type].name : 'Charging station'; }
        if (o.kind === 'rover') { if (!Rover.owned) continue; const R0 = Rover.state; label = R0.driver != null ? 'Rover in use' : R0.carrier != null ? 'Rover being carried' : G.flight || G.mode !== 'site' ? 'Rover (no signal until landed)' : 'Drive rover'; }
        if (o.kind === 'ladder') { if (me.roof) continue; label = G.roofOpen() ? 'Climb to the roof' : 'Roof hatch (sealed)'; }
        if (o.kind === 'roofHatch') { if (!me.roof) continue; label = 'Climb down'; }
        out.push({ kind: o.kind, ref: o, x: o.x, y: o.y, z: o.z, r: o.r, h: o.h, label });
      }
      if (G.ext) Pods.interactables(me, out);
      // seats nobody else is in
      if (Player.seat == null) G.ship.seats.forEach((s, i) => {
        if ([...G.players.values()].some((p) => p.id !== G.localId && p.alive && p.seat === i)) return;
        out.push({ kind: 'seat', ref: i, x: s.x, y: s.y + 0.15, z: s.z, r: 0.38, label: 'Sit' });
      });
    }
    Rover.interactables(me, out);
    // (with the rover in your arms there's nothing else you can lay hands on)
    if (Rover.carriedByMe) return out.filter((t) => t.kind === 'door' || t.kind === 'exit' || t.kind === 'enter' || t.kind === 'hatch' || t.kind === 'idoor');
    return out;
  },
  interact(t) {
    const me = G.me();
    switch (t.kind) {
      case 'item': {
        const cur = me.slots[me.sel] != null && G.items.get(me.slots[me.sel]);
        if (cur && ITEMS[cur.type].twoHanded) { HUD.toast('Hands full — [G] to drop'); return; }
        let slot = me.slots[me.sel] == null ? me.sel : me.slots.indexOf(null);
        if (slot < 0) { HUD.toast('Inventory full'); return; }
        G.request({ a: 'pick', item: t.ref.id, slot });
        break;
      }
      case 'door': G.request({ a: 'door', id: t.ref.id }); break;
      case 'box': G.request({ a: 'box', id: t.ref.id }); break;
      case 'exit': {
        if (!G.ext) return;
        const sp = t.ref.kind === 'fire' && G.ext.fire.spawn ? G.ext.fire.spawn : G.ext.entrance.spawn;
        G.teleport('out', sp.x, sp.y, sp.z, sp.yaw);
        break;
      }
      case 'enter': {
        const ex = G.fac.exits.find((e) => e.kind === t.ref.which) || G.fac.exits[0];
        G.teleport('in', ex.spawn.x, FAC_Y0, ex.spawn.z, ex.spawn.yaw);
        break;
      }
      case 'terminal': HUD.openTerminal(); break;
      case 'monitor': SFX.play('click', new THREE.Vector3(t.ref.x, t.ref.y, t.ref.z), { vol: 0.8 }); G.request({ a: 'monitor', act: t.ref.act }); break;
      case 'seat': Player.sit(t.ref); break;
      case 'idoor': G.request({ a: 'idoor' }); break;
      case 'pod': G.request({ a: 'pod', id: t.ref }); break;
      case 'lever': {
        if (G.flight) return;
        if (G.mode === 'site') {
          const outside = G.alivePlayers().filter((p) => !G.inShip(p));
          // G.now is in milliseconds: a second pull within 4 s means it
          if (outside.length && G.now - G.leverConfirm > 4000) { G.leverConfirm = G.now; HUD.toast(outside.length + (outside.length === 1 ? ' crewmate' : ' crew') + ' still outside.', 4); return; }
        }
        if (G.mode === 'orbit' && G.run.daysLeft <= 0 && G.run.sold < G.run.quota && G.now - G.leverConfirm > 4000) { G.leverConfirm = G.now; HUD.toast('Quota not met. $' + G.run.sold + ' / $' + G.run.quota, 4); return; }
        G.leverConfirm = 0;
        G.request({ a: 'lever' });
        break;
      }
      case 'hatch': G.request({ a: 'hatch' }); break;
      case 'jump': G.request({ a: 'engage' }); break;
      case 'rover': if (t.label === 'Drive rover') G.request({ a: 'drive' }); break;
      case 'ladder': if (G.roofOpen()) Player.climb(true); else SFX.play('err', null, { vol: 0.5 }); break;
      case 'roofHatch': Player.climb(false); break;
      case 'roverPick': G.request({ a: 'roverPick' }); break;
      case 'basketPut': G.request({ a: 'basketPut', item: t.ref }); break;
      case 'basketTake': { const slot = me.slots[me.sel] == null ? me.sel : me.slots.indexOf(null); if (slot >= 0) G.request({ a: 'basketTake', item: t.ref, slot }); break; }
      case 'charger': {
        const id = me.slots[me.sel], it = id != null && G.items.get(id);
        if (it && ITEMS[it.type].battery) G.request({ a: 'charge', item: id }); else HUD.toast('Nothing to charge');
        break;
      }
      default: break;
    }
  },
  teleport(zone, x, y, z, yaw) {
    SFX.play('door_open', null, { vol: 0.7 });
    R.fx.fade = 1;
    G.timers.push({ t: 0.18, fn: () => {
      const me = G.me(); me.zone = zone;
      Player.spawn(x, y, z, yaw);
      SFX.play('door_close', null, { vol: 0.6, delay: 0.1 });
    } });
  },
  // the scanner: a pulse rolls out from you (see R.startScan); each find is marked the moment the wave reaches it.
  // It reads what is in the open or close by; anything shut in a locker or cabinet is only a faint signal up close.
  scan() {
    const me = G.me(), cam = R.camera.position, inside = me.zone === 'in';
    const speed = inside ? 24 : 42, maxR = inside ? 24 : 70;
    R.startScan(cam, maxR, speed);
    SFX.play('scan', null, { vol: 0.8 });
    const list = [], sig = new Set();
    for (const it of G.items.values()) {
      if (it.holder != null || G.itemZone(it) !== me.zone) continue;
      const d = it.pos.distanceTo(cam);
      if (d > (inside ? 22 : 40)) continue;
      if (G.itemSealed(it)) {
        if (d < 7 && !sig.has(it.box)) { sig.add(it.box); const f = G.fac.containerFront(G.fac.containers[it.box]); list.push({ x: f.x, y: f.y + 0.15, z: f.z, text: 'SIGNAL', sub: 'inside', kind: 'sig', d }); }
        continue;
      }
      // through a wall only at very short range
      if (inside && G.fac && d > 6 && !G.fac.los(cam.x, cam.z, it.pos.x, it.pos.z, true)) continue;
      const def = ITEMS[it.type];
      list.push({ x: it.vis.x, y: it.vis.y + 0.25, z: it.vis.z, text: def.name, value: def.kind === 'scrap' ? it.value : 0, kind: def.kind === 'scrap' && it.value >= 60 ? 'rich' : 'item', d });
    }
    const far = (x, y, z, text, d) => list.push({ x, y, z, text, sub: Math.round(d) + 'm', kind: 'big', d: Math.min(d, maxR) });
    if (!inside && G.ext) {
      far(0, 4.5, 0, 'SHIP', Math.hypot(me.pos.x, me.pos.z));
      far(G.ext.entrance.x, G.ext.entrance.h + 5, G.ext.entrance.z, 'MAIN ENTRANCE', Math.hypot(me.pos.x - G.ext.entrance.x, me.pos.z - G.ext.entrance.z));
      far(G.ext.fire.x, G.ext.fire.h + 3.5, G.ext.fire.z, 'FIRE EXIT', Math.hypot(me.pos.x - G.ext.fire.x, me.pos.z - G.ext.fire.z));
    }
    if (inside && G.fac) for (const ex of G.fac.exits) { const d = Math.hypot(ex.x - me.pos.x, ex.z - me.pos.z); if (d < 35 && G.fac.los(cam.x, cam.z, ex.x, ex.z, true)) far(ex.x, G.fac.floorY(ex.x, ex.z) + 2.2, ex.z, ex.kind === 'fire' ? 'FIRE EXIT' : 'MAIN EXIT', d); }
    for (const p of G.players.values()) if (p.id !== G.localId && p.alive && p.zone === me.zone && p.pos.distanceTo(me.pos) < 40) list.push({ x: p.rpos.x, y: p.rpos.y + 1.95, z: p.rpos.z, text: p.name, kind: 'player', d: p.rpos.distanceTo(cam) });
    // creatures: traced in red where the wave finds them, named, and followed while the mark lasts
    for (const m of G.monsters.values()) {
      if (!m.mesh || !m.mesh.visible || m.def.zone !== me.zone) continue;
      const d = m.rpos.distanceTo(cam);
      if (d > (inside ? 24 : 60)) continue;
      if (inside && G.fac && d > 6 && !G.fac.los(cam.x, cam.z, m.rpos.x, m.rpos.z, true)) continue;
      // a body reads as one: struck through in grey, no outline, no alarm
      if (m.dead) { list.push({ x: m.rpos.x, y: m.rpos.y + 0.9, z: m.rpos.z, text: m.def.name.toUpperCase(), sub: 'DEAD', kind: 'dead', d }); continue; }
      const head = () => new THREE.Vector3(m.rpos.x, m.rpos.y + (m.type === 'leech' ? -0.45 : m.def.height + 0.35), m.rpos.z), h = head();
      list.push({ x: h.x, y: h.y, z: h.z, text: m.def.name.toUpperCase(), kind: 'mon', d, track: head });
      G.markMonster(m, d / speed);
    }
    HUD.scan(list, speed);
  },
  // ======================= scan marks on creatures =======================
  // a red silhouette (an outline shell plus a rim glow on the body) laid over every part of the creature, so it
  // moves with it; it flashes in when the wave reaches it, holds, and fades with the scan marks
  markMonster(m, delay) {
    G.marks = G.marks.filter((k) => (k.m === m ? (G.dropMark(k), false) : true));
    const u = { uA: { value: 0 } };
    const shell = new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, transparent: true, depthWrite: false,
      vertexShader: 'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); mv.xyz += n * (0.012 + 0.0042 * -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uA; void main(){ gl_FragColor = vec4(1.9, 0.1, 0.05, uA); }',
    });
    const rim = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float r = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(vec3(1.6, 0.08, 0.04) * (0.04 + r * 1.15) * uA, 1.0); }',
    });
    const parts = [], ov = [];
    m.mesh.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !o.userData.scanMark && o.geometry && o.geometry.attributes.normal) parts.push(o); });
    for (const o of parts) for (const mat of [shell, rim]) { const x = new THREE.Mesh(o.geometry, mat); x.userData.scanMark = true; x.renderOrder = 6; x.castShadow = false; o.add(x); ov.push(x); }
    G.marks.push({ m, u, ov, mats: [shell, rim], t: -delay, life: 5.5 });
  },
  // the nest, heard as you come near it: the slow wet heave of it breathing in, in time with it (each of us hears it
  // for ourselves)
  nestSound() {
    const n = G.fac && G.fac.nest, me = G.me(); if (!n || !n.piv) return;
    const ph = Math.sin((n.t || 0) * 1.3), rising = n.ph < 0 && ph >= 0; n.ph = ph;
    if (!rising || n.dead || !me || G.zoneOf(me) !== 'in') return;
    const cam = R.camera.position;
    if (Math.hypot(cam.x - n.x, cam.z - n.z) < 18 && Math.abs(cam.y - n.Y - 1.5) < 3) SFX.play('nest_breath', new THREE.Vector3(n.x, n.Y + n.h * 0.6, n.z), { vol: 1, ref: 3 });
  },
  updateMarks(dt) {
    for (let i = G.marks.length - 1; i >= 0; i--) {
      const k = G.marks[i]; k.t += dt;
      const t = k.t;
      if (t > k.life || (k.m.dead && t > 0.6)) { G.dropMark(k); G.marks.splice(i, 1); continue; }
      k.u.uA.value = t < 0 ? 0 : Math.min(1, t / 0.1) * (1 + 1.2 * Math.exp(-t * 6)) * (0.82 + 0.18 * Math.sin(t * 9)) * (1 - sstep(k.life - 1.4, k.life, t)) * 0.9;
    }
  },
  dropMark(k) { for (const x of k.ov) if (x.parent) x.parent.remove(x); for (const m of k.mats) m.dispose(); },
  clearMarks() { for (const k of G.marks) G.dropMark(k); G.marks = []; },
  // ======================= per-frame =======================
  update(dt) {
    G.now += dt * 1000;
    const me = G.me(); if (!me) return;
    // timers
    for (let i = G.timers.length - 1; i >= 0; i--) { const t = G.timers[i]; t.t -= dt; if (t.t <= 0) { G.timers.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } } }
    G.stepSite(false);
    if (G.isHost) G.tickBombs(dt);
    G.updateFuses(dt); G.updateBlasts(dt);
    G.updateSeq(dt, G.frameDt);
    G.updateFlight(dt);
    G.updateDelivery(dt);
    Pods.update(dt); G.lampSparks(dt); FX.update(dt);
    for (const c of G.corpses) if (c.rag) c.rag.step(dt);
    G.stepEmergency(dt); G.stepMists(dt);
    // input not tied to the player body
    if (!HUD.blocking) {
      if (Input.hit('KeyT') || Input.hit('Enter')) HUD.openChat();
    }
    // (push-to-talk: V, or the talk button on a walkie-talkie in your hand, which keys the mic whichever mode it's in)
    { const keyed = !!(G.me() && G.me().radio); Voice.setPTT(Settings.ptt ? Input.down('KeyV') || keyed : keyed); }
    G.uncarryCamera();
    Player.update(dt);
    if (G.sendoff) G.updateSendoff(dt);
    Rover.update(dt);
    G.carryCamera();
    me.talking = G.online && Voice.talking; me.loud = me.talking ? Voice.loudness : 0;
    if (G.isHost) { G.hostTick(dt); Bots.update(dt); }
    G.netTick(dt);
    G.presentPlayers(dt);
    for (const m of G.monsters.values()) {
      if (m._carry) { m.mesh.rotation.copy(m._carry); m._carry = null; }
      m.present(dt, G.isHost, G.now, me);
      // something that got aboard rides along
      if (G.shipMoved && m.mesh && m.rpos && G.posAboard(m.rpos)) { m._carry = m.mesh.rotation.clone(); m.mesh.position.applyMatrix4(G.shipM); m.mesh.quaternion.premultiply(G.shipQ); }
    }
    G.updateMarks(dt);
    G.updateItems(dt);
    G.updateGrenades(dt);
    if (G.fac) G.fac.update(dt);
    G.nestSound();
    G.ship.update(dt, performance.now() / 1000, G.mode);
    G.environment(dt);
    G.director(dt);
    if (G.online) Voice.update(G, dt);
    // you hear from where you stand in the ship (all of the ship's own sounds are placed in ship coordinates)
    SFX.listener(G.simCam);
    G.flightSound();
    CrewCam.update(dt);
    G.updateHUD(dt);
  },
  presentPlayers(dt) {
    const rt = G.now - 110;
    for (const p of G.players.values()) {
      if (p.id === G.localId) { p.rpos.copy(p.pos); continue; }
      if (p.buf.length) {
        let a = p.buf[0], b = p.buf[p.buf.length - 1];
        for (let i = 0; i < p.buf.length - 1; i++) if (p.buf[i].t <= rt && p.buf[i + 1].t >= rt) { a = p.buf[i]; b = p.buf[i + 1]; break; }
        const t = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1) : 1;
        const nx = lerp(a.x, b.x, t), ny = lerp(a.y, b.y, t), nz = lerp(a.z, b.z, t);
        p.speed = damp(p.speed, Math.hypot(nx - p.rpos.x, nz - p.rpos.z) / Math.max(dt, 1e-3), 8, dt);
        p.rpos.set(nx, ny, nz);
        p.ryaw = a.yaw + angDiff(a.yaw, b.yaw) * t; p.rpitch = lerp(a.pitch, b.pitch, t);
      }
      const av = p.avatar; if (!av) continue;
      av.root.visible = p.alive && !p.blown;
      if (!p.alive || p.blown) continue;
      // (sitting down, the body faces the way the seat does; only the head turns to look about)
      const seat = p.seat != null && G.ship.seats[p.seat], bodyYaw = seat ? seat.yaw : p.ryaw || 0;
      av.root.position.copy(p.rpos); av.root.rotation.set(0, bodyYaw, 0);
      if (G.shipMoved && G.playerAboard(p)) { av.root.position.applyMatrix4(G.shipM); av.root.quaternion.premultiply(G.shipQ); }
      const id = p.slots[p.sel], it = id != null && G.items.get(id);
      if (Rover.owned && Rover.state.carrier === p.id) av.setHug(0.33, 0.44); else av.setHeld(it ? it.type : null, it ? it.id : 0);
      av.setLamp(!!p.flash);
      p.swingT = Math.max(0, (p.swingT || 0) - dt);
      av.update(dt, { at: p.rpos, yaw: bodyYaw, speed: p.speed, crouch: p.crouch, sit: p.seat != null, air: !!p.air, pitch: p.rpitch || 0, look: seat ? angDiff(seat.yaw, p.ryaw || 0) : null, swing: p.swingT > 0 ? Math.sin((1 - p.swingT / 0.45) * Math.PI) : 0 });
      // (a scuff of dust, snow or spray off their feet each stride)
      if (p.speed > 0.6 && !p.air && p.seat == null && !(G.shipMoved && G.playerAboard(p))) { p.strideAcc = (p.strideAcc || 0) + p.speed * dt; if (p.strideAcc > 1.8) { p.strideAcc = 0; FX.foot(p.rpos, p.zone, Math.min(1.4, p.speed / 3.5)); } }
      const me = G.me();
      av.tag.visible = me && p.rpos.distanceTo(R.camera.position) < 14;
      if (G.leechOn === p.id) { /* leech mesh shows on their head */ }
    }
  },
  updateGrenades(dt) {
    for (let i = G.grenades.length - 1; i >= 0; i--) {
      const g = G.grenades[i]; g.t += dt;
      const t = Math.min(1, g.t / g.dur);
      g.mesh.position.lerpVectors(g.from, g.to, t); g.mesh.position.y += Math.sin(t * Math.PI) * 1.2;
      if (t < 1) g.mesh.rotation.x += dt * 12; else g.mesh.rotation.x = 0;
      // (a thrown charge lies there spitting until it goes off)
      if (g.bomb != null) { const sp = g.mesh.getObjectByName('spark'); if (sp) sp.scale.setScalar(0.6 + Math.random() * 0.9); continue; }
      if (g.t > g.dur + 1.1) { R.scene.remove(g.mesh); G.grenades.splice(i, 1); }
    }
  },
  // the cabin lights through a power dip: they stutter and sag to a faint glow, then stutter back on
  powerDip(s, dt, down) {
    if (down && !s.dipped) { s.dipped = true; s.dipT = 0; SFX.play('power_down', null, { vol: 0.6 }); }
    if (!down && s.dipped && !s.restored) { s.restored = true; s.upT = 0; SFX.play('power_up', null, { vol: 0.45 }); }
    if (!s.dipped) return;
    let k;
    if (!s.restored) { s.dipT += dt; k = s.dipT < 0.3 ? (Math.random() < 0.45 ? 0.2 : 0.85) : damp(R.fx.cabin, 0.05, 7, dt); }
    else { s.upT += dt; k = s.upT < 0.45 ? (Math.random() < 0.3 ? 0.9 : 0.08) : damp(R.fx.cabin, 1, 6, dt); }
    G.setCabinPower(k);
  },
  // the hull's thrusters firing in space (on the shoulders and out on the nose): from each nozzle that fires, gas
  // white-hot for an instant at its mouth, then a pale plume thinning out fast (lit by the sun, if the ship's in it).
  // fwd: just the ones facing forward, held on (the braking burn, k how hard: a few bits a frame); otherwise a short
  // burst from the others
  rcsPuff(fwd, k = 1) {
    const S = G.ship, lit = 0.1 + 0.55 * S.sunCore.material.opacity;
    for (const r of S.rcs) {
      if (fwd !== r.d.x > 0.5) continue;
      const at = G.carry(_fxA.copy(r.p)), dir = _fxD.copy(r.d); if (G.shipMoved) dir.applyQuaternion(G.shipQ);
      // (the burn's jets: a hot core streaming out and a cone of gas spreading round it; the burst: a quick spray of
      // vapour that's gone in a moment. Those on the shoulders, out to the sides, stay fainter)
      const side = r.p.x < 9 ? 0.5 : 1;
      if (fwd) {
        FX.emit({ at, dir, glow: true, n: 2, spread: 0.06, speed: [16, 26], grav: 0, drag: 1, life: [0.15, 0.35], size: [0.14, 0.26], grow: 2, streak: 0.05, color: [1.8, 1.45, 1.1], color1: [0.8, 0.35, 0.15], alpha: (0.5 + 0.5 * k) * side });
        FX.emit({ at, dir, n: 2, spread: 0.2, speed: [12, 22], grav: 0, drag: 0.5, life: [0.35, 0.7], size: [0.08, 0.14], grow: 6, color: [lit, lit * 1.02, lit * 1.05], alpha: 0.25 * k * side, fadeIn: 0.02 });
      } else {
        FX.emit({ at, dir, glow: true, n: 3, spread: 0.15, speed: [10, 18], grav: 0, drag: 2, life: [0.04, 0.1], size: [0.1, 0.18], grow: 2, streak: 0.03, color: [1.6, 1.4, 1.2], color1: [0.7, 0.4, 0.2], alpha: side });
        FX.emit({ at, dir, n: 14, spread: 0.35, speed: [8, 20], grav: 0, drag: 0.8, life: [0.18, 0.4], size: [0.06, 0.12], grow: 7, color: [lit, lit * 1.02, lit * 1.05], alpha: 0.3 * side, fadeIn: 0.02 });
      }
    }
  },
  // how high the ship is on the way down from orbit, t seconds after the lever (a share of the world's radius, from
  // h0, the orbit's): it eases off the orbit's height so slowly at first you hardly see it go, then falls the long way
  // down to the top of the air by ENTRY.air, the world swelling steadily (a log scale), and on into the air, sinking
  // faster as it takes hold, to ENTRY.hEnd as the shutters close; never a kink, and never back up
  glideAlt(h0, t) {
    const E = ENTRY, L0 = Math.log(h0), L1 = Math.log(E.hAir), Le = Math.log(E.hEnd), T = E.air - E.drop, Ta = E.white - E.air;
    // (the pace at the top of the air: the air's own, unless that would make the fall to it overshoot and climb back)
    const r = Math.min((L1 - Le) / Ta, 2.5 * Math.max(0, L0 - L1) / T), q = Math.max(0, (L1 - Le - r * Ta) / (Ta * Ta));
    if (t >= E.air) { const s = t - E.air; return Math.max(E.hEnd * 0.5, Math.exp(L1 - r * s - q * s * s)); }
    const u = clamp((t - E.drop) / T, 0, 1), u2 = u * u, u3 = u2 * u;
    return Math.exp((2 * u3 - 3 * u2 + 1) * L0 + (3 * u2 - 2 * u3) * L1 - (u3 - u2) * r * T);
  },
  // the braking burn's push coming down out of orbit, t seconds after the lever (0..1): a long heavy shove
  burnK(t) { return sstep(ENTRY.burn, ENTRY.burn + 0.8, t) * (1 - sstep(ENTRY.burn + 4.6, ENTRY.burn + 5.8, t)); },
  setCabinPower(k) { R.fx.cabin = k; G.ship.tubeMat.color.copy(G.ship.tubeBase).multiplyScalar(Math.max(0.04, k)); },
  updateSeq(dt, raw) {
    const s = G.seq; if (!s) return;
    // (the long scripted ones keep to the clock even when the frames come slow, so everyone aboard stays together)
    s.t += s.kind === 'land' || s.kind === 'jump' ? Math.max(dt, Math.min(0.25, raw || dt)) : dt;
    const S = G.ship;
    if (s.kind === 'land') {
      // out of orbit and down: round the world and lower, into the top of the air, which burns round the ship until
      // the shutters come down over it, and out into cloud (the descent over the site takes over from there)
      const E = ENTRY, t = s.t;
      if (G.mode === 'landing') {
        // first the ship swings round on its thrusters (slow and soft at either end, the way they'd swing a ship this
        // size) to fly along its orbit with its belly to the world and the horizon across the windshield; the
        // braking burn; then the long slide down round the world, the ground streaming by faster and faster beneath,
        // the horizon flattening, until it skims into the top of the air (see the ship's orbit code)
        const ease = (a, b) => { const u = clamp((t - a) / (b - a), 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
        const g = S.glide || (S.glide = { t: 0, turn: 0, hr: null, phi: 0, A: null, dur: 4.4, h0: s.h0 || S.alt / S.R });
        g.t = t; g.turn = ease(E.turn0, E.turn0 + g.dur); g.hr = G.glideAlt(g.h0, t);
        // (the thrusters puff to start the swing and again to stop it, a pair at a time out on the nose)
        for (const [k, at] of [['rcs0', E.turn0], ['rcs1', E.turn0 + g.dur - 1.1]]) if (!s[k] && t > at) {
          s[k] = true; Player.addShake(0.12); G.rcsPuff(false);
          for (const z of [-0.8, 0.8]) SFX.play('hiss_valve', new THREE.Vector3(11.5, 0.9, z), { vol: 0.9, ref: 3, delay: z > 0 ? 0.06 : 0 });
        }
        if (!s.roar && t > E.burn) { s.roar = true; SFX.play('engine', null, { dur: 5.8, vol: 1.3 }); }
        // (the braking burn: the thrusters facing forward fire and hold, a long heavy shove, jets streaming out ahead
        // past the windows)
        const burn = G.burnK(t);
        if (burn > 0.05) G.rcsPuff(true, burn);
        // (then the long fall, nothing but now and then a thruster puffing out on the hull, keeping her lined up, the
        // world filling more of the glass each time you look)
        if (t > E.burn + 6.5 && t < E.air - 2) { s.trimT = (s.trimT ?? 1.5) - dt; if (s.trimT <= 0) { s.trimT = 3.5 + Math.random() * 4; G.rcsPuff(false); Player.addShake(0.05); SFX.play('hiss_valve', new THREE.Vector3(Math.random() < 0.5 ? 11.5 : -6, 0.9, Math.random() < 0.5 ? -0.8 : 0.8), { vol: 0.6, ref: 3 }); } }
        // (the long fall reads as the speed it is, without going any faster: the view stretching a little as it gathers
        // pace, and a shiver through the frame building all the way down with the odd jolt)
        const fall = sstep(E.burn + 3, E.air, t);
        G.fovAdd = 5 * fall + 6 * sstep(E.air - 2, E.white - 1.3, t);
        if (fall > 0.2 && Math.random() < dt * 1.4 * fall) Player.addShake(0.1 + 0.12 * Math.random());
        // the air starts where the ship actually reaches it
        const hr = S.alt / S.R;
        G.entryHeat = S.airless ? 0 : sstep(0.07, 0.03, hr) * (1 - sstep(E.white - 0.5, E.white + 0.4, t));   // (no air, nothing to burn)
        // at the height of it the blast shutters slam down over every window; the glare stays outside
        if (t > E.white - 1.3) S.setShutters(true);
        R.fx.heat = G.entryHeat * 0.9 * (1 - S.shut.t);
        R.fx.white = 0;
        // the sheath of burning air outside the windows; the sky coming up and the glare drown the stars
        const pm = S.plasma.material.uniforms;
        S.plasma.visible = G.entryHeat > 0.001; pm.uK.value = G.entryHeat; pm.uT.value = t;
        S.stars.material.uniforms.uFade.value = 1 - 0.9 * sstep(0.09, 0.03, hr);
        // (a hum through the deck, the burn's shove, and a mounting rumble as the air thickens; with no air to burn
        // through, the braking burn that holds the ship up over the ground instead)
        const deep = sstep(E.air - 2, E.white - 1, t);
        Player.addShake(0.03 + 0.1 * burn + 0.08 * fall + 0.55 * G.entryHeat + 0.08 * deep + (S.airless ? 0.2 * deep : 0));
        // (up in the dark the odd fleck of dust and ice catching the light goes flicking past)
        const dust = fall * (1 - G.entryHeat) * (1 - S.shut.t);
        for (let i = Math.round(dust * 2 * Math.min(4, dt * 60) + Math.random() * 0.5); i > 0; i--) {
          const a = Math.random() * TAU, rr = 3 + Math.random() * 11;
          FX.emit({ at: _fxA.set(25 + Math.random() * 40, 1.6 + Math.sin(a) * rr, Math.cos(a) * rr), glow: true, dir: _fxD.set(-1, 0, 0), spread: 0, speed: [150, 220], grav: 0, drag: 0, life: [0.25, 0.45], size: [0.02, 0.04], streak: 0.008, color: [0.75, 0.8, 0.95], alpha: 0.5, fadeIn: 0.1 });
        }
        // going this fast into the air: it buffets the ship in sudden jolts, the frame groaning, and sparks of burning air
        // streak back past the glass (round the outside of the hull, never through it)
        if (G.entryHeat > 0.05 && Math.random() < dt * 4 * G.entryHeat) { Player.addShake(0.25 + 0.35 * Math.random()); if (Math.random() < 0.4) SFX.play('clunk', new THREE.Vector3(Math.random() * 8 - 4, 3, Math.random() * 6 - 3), { vol: 0.45, pitch: 0.5 + Math.random() * 0.3 }); }
        if (G.entryHeat > 0.03) {
          const fire = G.entryColor(SITE_LOOK[G.run.route] || SITE_LOOK.ashgrove);
          for (let i = Math.ceil(G.entryHeat * 4); i > 0; i--) {
            const a = (Math.random() - 0.5) * 2.6, rr = 5.8 + Math.random() * 5;
            FX.emit({ at: _fxA.set(14 + Math.random() * 26, 1.6 + Math.sin(a) * rr, Math.cos(a) * rr * (Math.random() < 0.5 ? -1 : 1)), glow: true, dir: _fxD.set(-1, 0, 0), spread: 0, speed: [60, 95], grav: 0, drag: 0, life: [0.3, 0.55], size: [0.18, 0.4], streak: 0.07, color: [2.4 * fire.r + 1.4, 1.6 * fire.g + 0.7, 1.2 * fire.b + 0.25], color1: [1.6, 0.4, 0.08], alpha: 0.7 + 0.3 * G.entryHeat });
          }
        }
        if (!s.boom && G.entryHeat > 0.08) { s.boom = true; s.boomT = 3; SFX.play('thunder', null, { vol: 0.7 }); }
        // (and through the thick of it, the rumble keeps rolling)
        if (s.boom && G.entryHeat > 0.3 && (s.boomT -= dt) <= 0) { s.boomT = 2.4 + Math.random() * 1.8; SFX.play('thunder', null, { vol: 0.35 + 0.4 * G.entryHeat }); }
        // shut in, the worst of the burn draws the power down: the cabin lights sag and die to a glow for a moment
        if (t > E.site - 0.35) G.powerDip(s, dt, true);
      } else {
        // through the worst of it: still shut in, then the power comes back, the shutters grind up on cloud, and the
        // ground appears below (not before the site is really there)
        if (s.tLand == null) { s.tLand = t; G.fovAdd = 0; S.glide = null; G.entryHeat = 0; R.fx.heat = 0; S.plasma.visible = false; S.stars.material.uniforms.uFade.value = 1; S.setShutters(true); }
        R.fx.white = 0;
        if (s.tUp == null && G.siteShown && t - s.tLand > 0.3) s.tUp = t;
        G.powerDip(s, dt, s.tUp == null);
        if (s.tUp != null && t - s.tUp > 0.55) S.setShutters(false);
        if (s.tUp != null && t - s.tUp > 2.2) { G.seq = null; G.setCabinPower(1); }
      }
    } else if (s.kind === 'orbit') {
      // out of the air behind closed shutters (they came down on the climb); the orbit is set up while they're shut,
      // then they grind open on space
      R.fx.white = 0;
      S.setShutters(s.t < 2.0);
      Player.addShake(s.t < 1.6 ? 0.25 * (1 - s.t / 1.6) : 0);
      if (s.t >= 1.2 && !s.done) { s.done = true; G.finishOrbit(s.data); }
      if (s.t > 3.7) G.seq = null;
    } else if (s.kind === 'hop') {
      // a short hop across to a world's moon (or back): the shutters come down, a long burn rumbles through the deck,
      // and they grind open on the new orbit
      const t = s.t;
      S.setShutters(t < 2.7);
      S.setThrust(0, 0.65 * sstep(0.3, 0.8, t) * (1 - sstep(2.0, 2.6, t)));
      Player.addShake(0.04 + 0.12 * sstep(0.3, 0.8, t) * (1 - sstep(2.0, 2.6, t)));
      if (!s.swapped && t > 1.4) { s.swapped = true; G.jumping = false; G.applyRunVisuals(); }
      if (t > 3.6) { G.seq = null; S.setThrust(0, 0); }
    } else if (s.kind === 'jump') {
      // the hyperjump: the drive winds up, the ship punches through into a tunnel of streaking light, drops out at
      // the new world, which swells up out of the distance as the ship brakes into orbit around it
      const J = JUMP, t = s.t, pu = S.portal.material.uniforms, tu = S.tunnel.material.uniforms;
      if (t < J.punch) {
        const u = t / J.punch; G.fovAdd = -5 * u * u; Player.addShake(0.05 + 0.3 * u * u); S.warp.material.uniforms.uK.value = 0;
        // going this fast, space splits ahead of the nose: a crack, then a rip that gapes open and rushes in on the ship
        const o = sstep(0.12, 1, u), rush = Math.pow(sstep(0.55, 1, u), 2.2);
        S.portal.visible = o > 0; pu.uK.value = 0.06 + sstep(0.15, 0.85, o) * 1.0; S.portal.scale.setScalar(lerp(170, 620, rush));
        S.portal.position.set(lerp(420, 34, rush), 1.6, 0);
        R.fx.warp = 0.35 * u * u;
      } else if (t < J.drop) {
        if (!s.punched) { s.punched = true; R.fx.flash = Math.max(R.fx.flash, 1.6); SFX.play('warp_in', null, { vol: 1 }); S.inWarp = true; S.warp.visible = true; S.portal.visible = false; S.tunnel.visible = true; }
        // (and the further in, the more everything is drawn out: the view widening, the streaks lengthening, space
        // pulled out from the middle, until the ship drops out at the other end)
        const u = (t - J.punch) / (J.drop - J.punch), deep = Math.pow(u, 1.3);
        G.fovAdd = lerp(12, 30, deep); Player.addShake(0.22 + 0.12 * deep);
        S.warp.material.uniforms.uK.value = Math.min(1, (t - J.punch) * 3);
        S.warp.material.uniforms.uLen.value = lerp(220, 620, deep);
        S.stars.material.uniforms.uFade.value = Math.max(0, 1 - (t - J.punch) * 3);
        tu.uK.value = Math.min(1, (t - J.punch) * 2) * (0.7 + 0.3 * deep);
        R.fx.warp = lerp(0.22, 0.85, deep) * (0.94 + 0.06 * Math.sin(t * 3.1));
      } else {
        if (!s.dropped) {
          s.dropped = true; R.fx.flash = Math.max(R.fx.flash, 1.3); SFX.play('warp_out', null, { vol: 1 });
          S.inWarp = false; G.jumping = false; G.applyRunVisuals(); S.arrive = 0; S.tunnel.visible = false; S.portal.visible = true;
        }
        const u = (t - J.drop) / (J.end - J.drop);
        G.fovAdd = lerp(30, 0, sstep(0, 0.4, u)); Player.addShake(0.25 * (1 - u));
        S.warp.material.uniforms.uK.value = Math.max(0, 1 - (t - J.drop) * 3.5);
        S.warp.material.uniforms.uLen.value = 60;
        S.stars.material.uniforms.uFade.value = Math.min(1, (t - J.drop) * 1.5);
        // (it drops out a long way off, the world small, and brakes the whole way in, the world swelling slower and
        // slower until it fills the glass)
        S.arrive = 1 - Math.pow(1 - Math.min(1, u * 1.05), 2.2);
        // out through the far side of the tear, which zips shut around the ship; dropping out nose-on to the new world,
        // the ship eases round into its orbit as it brakes
        const b = (t - J.drop) / 0.55;
        S.portal.visible = b < 1; pu.uK.value = Math.pow(Math.max(0, 1 - b), 2) * 1.2; S.portal.scale.setScalar(lerp(2600, 1500, Math.min(1, b))); S.portal.position.set(90, 1.6, 0);
        S.turn = 1 - sstep(J.drop + 1.4, J.end, t);
        R.fx.warp = 0.85 * Math.pow(Math.max(0, 1 - (t - J.drop) / 0.9), 2);
        if (t > J.end) { S.arrive = 1; S.turn = 0; S.warp.visible = false; S.stars.material.uniforms.uFade.value = 1; G.fovAdd = 0; G.seq = null; R.fx.warp = 0; S.portal.visible = false; }
      }
      S.warp.material.uniforms.uT.value = t; pu.uT.value = t; tu.uT.value = t;
    } else if (s.kind === 'doomed') {
      // the light first, from everywhere at once, then the ground coming up through you
      R.fx.white = s.t < 0.15 ? s.t / 0.15 : 1; Player.addShake(s.t < 3 ? 1.2 : 0);
      if (s.t > 3.5 && !s.done) {
        s.done = true;
        const run = G.run;
        HUD.summary(`<h2 style="color:var(--red)">LOST</h2><div class="sub">The ship was still on ${esc(SITES[s.data.site].name)} when it hit.</div>
          <div class="row"><span>Quota cycles survived</span><span>${run.cycle - 1}</span></div>
          <div class="row"><span>Days worked</span><span>${run.day - 1}</span></div>
          <div class="row"><span>Total scrap sold</span><span>$${run.totalSold || 0}</span></div>
          <div class="grade" style="color:var(--red)">X</div>`, 'RETURN TO MENU', () => G.quit());
      }
    } else if (s.kind === 'fired') G.blowout(s, dt);
  },
  // Fired. The klaxon, the lights stuttering, the inner door wide; then the outer hatch blows, and the cabin's air goes
  // out through the lock in a roar, taking everything with it: the crew, limp (ragdolls), the scrap and the gear and the
  // junk lying about, all tumbling out into space in a jet of frozen vapour. The view rides your own body out, the ship
  // falling away and the world wheeling past, and the roar dies to nothing; then the static, and the end.
  blowout(s, dt) {
    const S = G.ship, t = s.t, T0 = 1.9, me = G.me();
    if (!s.lock && t > 0.4) { s.lock = true; S.idoor.open = true; }
    if (t < T0) { G.setCabinPower(Math.random() < 0.25 ? 0.3 : 0.9); Player.addShake(0.15 * t); return; }
    const k = Math.exp(-(t - T0) / 2.4);
    s.gale = k;
    if (!s.blown) {
      s.blown = true; s.bodies = []; s.fly = [];
      S.setDoor(true); S.door.t = 0.85;
      R.fx.flash = Math.max(R.fx.flash, 0.6); G.setCabinPower(0.35);
      const hatch = new THREE.Vector3((SHIP.doorX0 + SHIP.doorX1) / 2, 1.2, 4.3);
      SFX.play('thunder', hatch, { vol: 1.3 }); SFX.play('vent_air', hatch, { vol: 1.6, dur: 4.5 }); SFX.play('crunch', hatch, { vol: 1, pitch: 0.6 });
      const sky = { gAt: (p) => (p.z < 4.3 ? 9 : 0), floor: (x, z) => (z < 4.3 && x > -16 && x < 9 ? 0 : -1e9), fric: 0.97,
        ceil: (x, z) => (z > AIRLOCK.z0 && z < 4.3 && x > AIRLOCK.x0 && x < AIRLOCK.x1 ? AIRLOCK.ih : z < 4.3 ? 3.3 : 1e9),
        push: (p, r) => { if (p.z < 4.45) S.collide(p, r); }, wind: (p, a) => G.blowWind(p, a, s.gale) };
      s.env = sky;
      // the crew, gone limp where they stood (you too: the view rides you out)
      for (const p of G.players.values()) {
        if (!p.alive) continue;
        const body = new Avatar(p.name, p.color), live = p.id !== G.localId && p.avatar && p.avatar.root.visible ? p.avatar : null;
        if (live) G.copyPose(live, body);
        else { body.root.position.copy(p.pos); body.root.rotation.y = p.yaw; body.update(1 / 60, { at: p.pos, yaw: p.yaw }); }
        body.goLimp(sky, new THREE.Vector3((Math.random() - 0.5) * 2, 1.5, 1.5), new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4));
        p.blown = true; R.scene.add(body.root); s.bodies.push(body);
        if (p.id === G.localId) { s.mine = body; body.root.visible = false; }
      }
      // and everything loose aboard: what's lying about, what was in your hands, and the junk in the corners
      const fling = (m, at, r) => { m.position.copy(at); R.scene.add(m); s.fly.push({ m, p: at.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, Math.random() * 2), w: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9), r }); };
      for (const it of G.items.values()) {
        if (!it.mesh || it.box != null || it.basket != null) continue;
        const h = it.holder != null ? G.players.get(it.holder) : null;
        if (!h && !it.inShip) continue;
        const at = h ? h.pos.clone().setY(h.pos.y + 1.1) : it.mesh.getWorldPosition(new THREE.Vector3());
        it.mesh.parent && it.mesh.parent.remove(it.mesh);
        fling(it.mesh, at, ITEMS[it.type].twoHanded ? 0.35 : 0.18);
      }
      const JUNK = ['gear', 'bolt', 'toolbox', 'kettle', 'bottle', 'battery', 'circuit', 'extinguisher', 'radio', 'meter', 'jar', 'register', 'typewriter', 'teddy', 'axle'];
      for (let i = 0; i < 14; i++) { const ty = JUNK[(Math.random() * JUNK.length) | 0], m = ItemMeshes.build(ty, i); fling(m, new THREE.Vector3(-9 + Math.random() * 11, 0.25, -2.2 + Math.random() * 4.4), ITEMS[ty].twoHanded ? 0.35 : 0.18); }
    }
    for (const b of s.bodies) b.rag.step(dt);
    // (loose things: blown along, bouncing off the deck and the walls in here, then tumbling free out there)
    for (const f of s.fly) {
      const inside = f.p.z < 4.3;
      G.blowWind(f.p, _fxA, s.gale); f.v.addScaledVector(_fxA, dt); if (inside) f.v.y -= 9 * dt;
      f.p.addScaledVector(f.v, dt);
      if (inside) {
        if (f.p.y < f.r) { f.p.y = f.r; f.v.y = Math.abs(f.v.y) * 0.3; f.v.x *= 0.9; f.v.z *= 0.9; }
        if (f.p.y > 3.2) { f.p.y = 3.2; f.v.y = -Math.abs(f.v.y) * 0.3; }
        if (S.collide(f.p, f.r)) f.v.multiplyScalar(0.7);
      }
      f.m.position.copy(f.p); f.m.rotation.x += f.w.x * dt; f.m.rotation.y += f.w.y * dt; f.m.rotation.z += f.w.z * dt;
    }
    // the air going: a jet of freezing vapour out of the hatch, grit and scraps streaming across the deck to it
    if (k > 0.04) {
      const DX = (SHIP.doorX0 + SHIP.doorX1) / 2;
      FX.emit({ at: _fxA.set(DX, 1.1, 4.4), r: 0.5, dir: _fxD.set(0, 0.05, 1), spread: 0.45, n: Math.ceil(5 * k), speed: [12, 30].map((v) => v * (0.4 + 0.6 * k)), grav: 0, drag: 0.6, life: [0.6, 1.4], size: [0.3, 0.6], grow: 5, color: [0.8, 0.84, 0.88], alpha: 0.4 * k, fadeIn: 0.03 });
      FX.emit({ at: _fxA.set(-8 + Math.random() * 9, 0.15, -1.8 + Math.random() * 3.6), dir: _fxD.set(DX + 1 - _fxA.x, 0.6, AIRLOCK.z0 - _fxA.z).normalize(), spread: 0.25, n: Math.ceil(3 * k), speed: [6, 14], grav: 2, drag: 0.4, life: [0.5, 1.1], size: [0.02, 0.05], color: [0.2, 0.18, 0.16], alpha: 1, fadeIn: 0.01 });
    }
    // your view: riding your own body out, tumbling with it; once out, it keeps turning back to the ship falling away
    if (s.mine) {
      const cam = R.camera, rg = s.mine.rag, hd = rg.at('head');
      cam.position.lerp(hd, 1 - Math.exp(-dt * 16));
      const back = _shQ.setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position, _fxD.set(-2, 1.5, 0), _fxV.set(0, 1, 0).applyQuaternion(rg.headQ)));
      cam.quaternion.slerp(_rq2b.copy(rg.headQ).slerp(back, 0.8 * sstep(T0 + 1, T0 + 2.6, t) * sstep(5, 9, hd.z)), 1 - Math.exp(-dt * 7)); cam.updateMatrixWorld();
      HUD.prompt(null, me);
    }
    R.fx.static = t > T0 + 6 ? Math.min(1, (t - T0 - 6) / 1.4) : 0;
    if (t > T0 + 7.6 && !s.done) {
      s.done = true;
      const run = s.data.run || G.run;
      HUD.summary(`<h2 style="color:var(--red)">TERMINATED</h2><div class="sub">The Company has ended your contract.</div>
          <div class="row"><span>Quota cycles survived</span><span>${run.cycle - 1}</span></div>
          <div class="row"><span>Days worked</span><span>${run.day - 1}</span></div>
          <div class="row"><span>Total scrap sold</span><span>$${run.totalSold || 0}</span></div>
          <div class="row"><span>Crew deaths</span><span>${run.deaths || 0}</span></div>
          <div class="grade" style="color:var(--red)">X</div>`, 'RETURN TO MENU', () => G.quit());
    }
  },
  // the rush of air out of the cabin when the hatch blows (a pull on whatever's at p, into a; k: how much air is left
  // going): across the cabin toward the lock, hardest close to it, then straight out through it, and nothing past it
  blowWind(p, a, k) {
    const DX = (SHIP.doorX0 + SHIP.doorX1) / 2;
    if (p.z < AIRLOCK.z0 - 0.1) { a.set(DX - p.x, 1.1 - p.y, AIRLOCK.z0 + 0.4 - p.z); const d = Math.max(0.5, a.length()); a.multiplyScalar((k * 75) / (d * Math.sqrt(d))); }
    else if (p.z < 4.6) a.set((DX - p.x) * 40, (1.05 - p.y) * 18, 70).multiplyScalar(k);
    else a.set(0, 0, 0);
    return a;
  },
  // Lamps people carry (a lantern, the candelabra, the fancy lamp): lit, each is a light source like the building's own,
  // where it is (in someone's hand, or set down), working whether the power's on or not; its glow lit to match in the
  // piece itself and in whoever's hand it's in. (Shut in a locker, or in the rover's basket, it gives no light.)
  lamps(t) {
    const live = new Set();
    for (const it of G.items.values()) {
      const L = ITEMS[it.type].lamp; if (!L) continue;
      const on = it.on && it.box == null && it.basket == null;
      const k = on ? (L.fire ? 0.82 + 0.12 * Math.sin(t * 13 + it.id) * Math.sin(t * 7.1 + it.id * 2) + Math.random() * 0.06 : L.unsteady ? 0.94 + 0.06 * Math.sin(t * 9 + it.id) : 1) : 0;
      ItemMeshes.glow(it.mesh, k);
      const h = it.holder != null ? G.players.get(it.holder) : null;
      if (h && h.id === G.localId && Player.vmItem && Player.vmItem.userData.type === it.type) ItemMeshes.glow(Player.vmItem, k);
      if (h && h.avatar && h.avatar.held) ItemMeshes.glow(h.avatar.held, k);
      if (!on) continue;
      live.add(it.id);
      let s = G.lampSrc.get(it.id);
      if (!s) { s = { x: 0, y: 0, z: 0, color: L.color, power: L.power, state: L.fire ? 'fire' : 'on', range: L.range, lit: 1, phase: it.id, far: 40 }; G.lampSrc.set(it.id, s); }
      // (the light list is made afresh on every landing: put it back in if it's gone)
      if (!G.lightSources.includes(s)) G.lightSources.push(s);
      if (h) {
        const P = h.id === G.localId ? h.pos : h.rpos, yaw = h.id === G.localId ? h.yaw : h.ryaw || 0;
        _lampP.set(P.x - Math.sin(yaw) * 0.45 + Math.cos(yaw) * 0.22, P.y + (h.crouch ? 0.7 : 1.05), P.z - Math.cos(yaw) * 0.45 - Math.sin(yaw) * 0.22);
        if (G.shipMoved && G.playerAboard(h)) _lampP.applyMatrix4(G.shipM);
        s.zone = h.zone;
      } else {
        _lampP.copy(it.vis || it.pos); _lampP.y += L.y != null ? L.y + 0.05 : 0.35;
        if (G.shipMoved && it.inShip) _lampP.applyMatrix4(G.shipM);
        s.zone = it.pos.y < FAC_Y0 + 60 ? 'in' : 'out';
      }
      s.x = _lampP.x; s.y = _lampP.y; s.z = _lampP.z;
    }
    for (const [id, s] of G.lampSrc) if (!live.has(id)) { G.lampSrc.delete(id); const i = G.lightSources.indexOf(s); if (i >= 0) G.lightSources.splice(i, 1); }
  },
  // a crewmate's flashlight, as a spotlight: held out at their side, pointing where they look
  aimFlash(s, p) {
    const yaw = p.ryaw || p.yaw, pitch = p.rpitch || 0, cp = Math.cos(pitch);
    s.position.set(p.rpos.x - Math.sin(yaw) * 0.3 + Math.cos(yaw) * 0.2, p.rpos.y + (p.crouch ? 1.0 : 1.5), p.rpos.z - Math.cos(yaw) * 0.3 - Math.sin(yaw) * 0.2);
    s.target.position.set(s.position.x - Math.sin(yaw) * cp * 5, s.position.y + Math.sin(pitch) * 5, s.position.z - Math.cos(yaw) * cp * 5);
    if (G.shipMoved && G.playerAboard(p)) { s.position.applyMatrix4(G.shipM); s.target.position.applyMatrix4(G.shipM); }
    const L = ITEMS[p.flash === 2 ? 'proflash' : 'flashlight'].light;
    s.intensity = FLASH_K * L.power; s.distance = L.range; s.angle = L.angle;
  },
  // A crewmate's body-cam is lit the way it is where they are, not where you are: down in the facility, its dark, its
  // murk and the lamps around them, instead of the daylight up by the ship; their own flashlight lighting the way ahead
  // (and anyone else's down there with them). R.rig() first, R.rig(true) after.
  feedLight(p, eye) {
    const me = G.me(), t = performance.now() / 1000, power = G.round ? G.round.power : true, fac = G.fac;
    if (p.zone === 'in' && fac && G.zoneOf(me) !== 'in') {
      const dp = fac.gloomAt(eye.y - 1.4);
      R.scene.background.set(0x000000); R.scene.fog.color.set((G.round && SITES[G.round.site].murk) || 0x000000); R.scene.fog.density = 0.07 + 0.014 * dp; R.setFog(null);
      R.hemi.intensity = 0.04 * (1 - 0.32 * dp); R.hemi.color.set(0x8899aa).lerp(_orange.setRGB(0.42, 0.42, 0.33), Math.min(1, dp * 0.5)); R.hemi.groundColor.set(0x000000); R.sun.intensity = 0;
      R.lightsAt(G.lightSources, eye, 'in', t, power, (s) => (s.fac ? fac.lampReach(eye, s) : fac.los(eye.x, eye.z, s.x, s.z) ? 1 : 0));
    }
    const lamps = [...G.players.values()].filter((q) => q.id !== G.localId && q.alive && q.flash && q.zone === p.zone)
      .sort((a, b) => (a === p ? -1 : b === p ? 1 : a.rpos.distanceToSquared(eye) - b.rpos.distanceToSquared(eye))).slice(0, R.remote.length);
    R.remote.forEach((s, i) => { R.setBeam(i, s, false); if (lamps[i]) G.aimFlash(s, lamps[i]); else s.intensity = 0; });
  },
  environment(dt) {
    const me = G.me();
    const zone = G.zoneOf(me);
    const scene = R.scene, cam = R.camera.position;
    const t = performance.now() / 1000;
    const inSpace = G.mode === 'orbit' || G.mode === 'landing' || !G.ext;
    R.vol.on = false; G.under = 0;
    // the sun casts shadows in orbit (through the windows) and outdoors; inside the facility the map is simply not
    // refreshed (switching castShadow would recompile every shader)
    if (!R.sun.castShadow) R.sun.castShadow = true;
    R.sun.shadow.autoUpdate = inSpace || zone !== 'in';
    if (R.camera.far !== 700) { R.camera.far = 700; R.camera.updateProjectionMatrix(); }
    if (inSpace || zone === 'in') R.setFog(null);
    if (inSpace) {
      G.orbitT = (G.orbitT || 60) + dt;
      const sd = G.ship.orbit(dt, G.orbitT);
      // parked, the ship is still going round at a tremendous lick: now and then a fleck of dust or ice catches the sun
      // and flicks past the glass from ahead; more of them while it brakes in out of a jump
      if (G.mode === 'orbit' && !G.ship.inWarp && (!G.seq || G.seq.kind === 'jump') && G.ship.arrive >= 0) {
        const rate = 1.6 + 14 * (1 - Math.min(1, G.ship.arrive));
        for (let i = Math.floor(rate * dt + Math.random()); i > 0; i--) {
          const a = Math.random() * TAU, rr = 2.5 + Math.random() * 12;
          FX.emit({ at: _fxA.set(30 + Math.random() * 40, 1.6 + Math.sin(a) * rr, Math.cos(a) * rr), glow: true, dir: _fxD.set(-1, 0, 0), spread: 0.04, speed: [80, 130], grav: 0, drag: 0, life: [0.6, 0.9], size: [0.02, 0.045], streak: 0.01, color: [0.8 * sd.vis + 0.15, 0.84 * sd.vis + 0.15, 0.95 * sd.vis + 0.18], alpha: 0.45, fadeIn: 0.15 });
        }
      }
      R.fx.sun = 0; G.sunPeek(sd.vis > 0 && sd.vis < 1 ? sstep(0, 0.08, sd.vis) * (1 - sstep(0.3, 1, sd.vis)) : 0, sd.dir);
      // falling close over the surface, the backdrop's near plane comes in so nothing out there is ever clipped: the
      // ground below, or the shells of the air and the cloud as the ship sinks through them
      R.setBgNear(clamp(G.ship.clearance() * 0.35, 0.5, 20));
      // up here everyone is shut in the cabin, so its air is clear when the ship comes down into the cloud
      G.cabinClear = 1;
      R.setSunShadow(15, 120);
      // the planet is lit by the sun even while it eclipses the sun from our side
      R.bgSun.position.copy(sd.dir); R.bgSun.target.position.set(0, 0, 0);
      scene.background.set(0x000000); scene.fog.density = 0.0004; scene.fog.color.set(0x000000);
      const look = SITE_LOOK[G.run.route] || SITE_LOOK.ashgrove;
      R.hemi.intensity = 0.32; R.hemi.color.set(0x2a3448); R.hemi.groundColor.set(look.tint).multiplyScalar(0.5);
      // sunlight through the windows, gone while the planet eclipses the sun
      R.sun.intensity = 5.5 * sd.vis; R.sun.color.set(0xfff1dc);
      R.sun.position.copy(sd.dir).multiplyScalar(40); R.sun.target.position.set(0, 1.5, 0);
      // falling into this world's air, its colour creeps into the cabin; then the burning air outside floods it with
      // fire from ahead, coloured by that air (a red world burns red, a green one green)
      const S = G.ship, near = sstep(S.R * 0.08, S.R * 0.012, S.alt), fire = G.entryColor(look);
      if (near > 0) R.hemi.color.lerp(_air.set(look.atmo), 0.3 * near);
      const heat = G.entryHeat || 0;
      R.fx.heatCol.setRGB(1.2, 0.4, 0.1).lerp(_air.copy(fire).multiplyScalar(1.3), 0.6);
      if (heat > 0) {
        R.sun.color.lerp(_orange.setRGB(1, 0.45, 0.16).lerp(fire, 0.6), heat); R.sun.intensity = lerp(R.sun.intensity, 10, heat);
        R.sun.position.lerp(_ahead.set(40, 8, 0), heat);
        R.hemi.color.lerp(_orange.setRGB(0.5, 0.22, 0.08).lerp(_air.copy(fire).multiplyScalar(0.45), 0.6), heat); R.hemi.intensity += heat * 0.7;
      }
      SFX.setEnv('orbit');
      R.fx.exposure = 1.0;
      if (G.ext) G.ext.group.visible = false;
    } else if (zone === 'in') {
      R.fx.peek = 0; R.fx.sun = 0;
      // each level down the air is thicker and what little light there is bounces off nothing (past the second
      // basement only a little more so each floor: see Facility.gloomAt)
      const dp = G.fac ? G.fac.gloomAt(cam.y - 1.4) : 0;
      scene.background.set(0x000000); scene.fog.color.set((G.round && SITES[G.round.site].murk) || 0x000000); scene.fog.density = 0.07 + 0.014 * dp;
      R.hemi.intensity = 0.04 * (1 - 0.32 * dp); R.hemi.color.set(0x8899aa).lerp(_orange.setRGB(0.42, 0.42, 0.33), Math.min(1, dp * 0.5)); R.hemi.groundColor.set(0x000000); R.sun.intensity = 0;
      // (the volumetric air, if it's on: the building's still, dusty air, the flashlights' beams showing in it)
      if (Settings.volumetric) { R.vol.on = true; R.vol.k = 1; R.volIndoor(scene.fog.color, 0.062 + 0.012 * dp); scene.fog.density = 0; }
      SFX.setEnv('interior');
      R.fx.exposure = 1.25 - 0.06 * dp;
      G.ext.group.visible = false; G.ext.rain.visible = false;
    } else {
      G.ext.group.visible = true;
      const L = G.ext.lighting(G.round.time);
      G.sunPeek(L.peek || 0, L.sunDir);
      // (no air: the sun glares as it does from space, as long as it is up and nothing is across it)
      R.fx.sun = G.ext.biome.airless ? clamp(L.sun / 5, 0, 1) : 0; R.fx.sunDir.copy(L.sunDir);
      scene.background.copy(L.fog); scene.fog.color.copy(L.fog); scene.fog.density = L.fogDen;
      // riding the ship up through the cloud deck (or down out of it): from about 30 m above the ground the air
      // thickens into cloud, so the land falls away into it instead of running out
      const deck = G.camCarried && !G.ext.biome.airless ? sstep(28, 105, cam.y - G.ext.height(cam.x, cam.z)) : 0;
      // (the volumetric air, if it's on, takes over from the flat fog: not on an airless world, nor up in the cloud deck;
      // coming down out of the deck it comes in over a second or two as the flat fog goes, never all at once on landing)
      const wantVol = !!Settings.volumetric && !G.ext.biome.airless && (!G.camCarried || deck < 0.02);
      G.volK = G.volK == null ? (wantVol ? 1 : 0) : damp(G.volK, wantVol ? 1 : 0, 2.2, dt);
      R.vol.on = G.volK > 0.003; R.vol.k = G.volK; G.ext.fogDen = L.fogDen;
      // height fog that pools in the hollows and glows toward the sun
      R.setFog(L.sunDir, L.scatter, L.fogFalloff, 0);
      G.ext.skyMat.uniforms.inCloud.value = deck * 0.97;
      if (deck > 0) { scene.fog.density = lerp(L.fogDen, 0.034, deck); R.setFog(L.sunDir, L.scatter, L.fogFalloff * (1 - deck), 0); }
      if (R.vol.on) scene.fog.density *= 1 - R.vol.k;
      G.ext.starMat.opacity = L.stars; G.ext.moon.material.opacity = L.night * 0.7;
      G.ext.sky.position.copy(cam); G.ext.stars.position.copy(cam);
      R.hemi.intensity = L.hemi; R.hemi.color.copy(L.hemiSky); R.hemi.groundColor.set(0x1a1712);
      R.sun.intensity = L.sun; R.sun.color.copy(L.sunColor);
      // under the marsh water: thick black-green murk a step or two deep all round, the daylight dying away below the
      // surface, and every sound gone dull and close (the surface itself shuts out the sky; nothing shows through it
      // either way)
      G.under = G.ext.water != null && !G.camCarried ? sstep(0, 0.12, G.ext.water - cam.y) : 0;
      if (G.under > 0) {
        const u = G.under, deep = sstep(0, 1.5, G.ext.water - cam.y), lit = 0.25 + 0.75 * (1 - L.night);
        _air.setRGB(0.035, 0.06, 0.042).multiplyScalar(lit * (1 - 0.6 * deep));
        scene.fog.color.lerp(_air, u); scene.background.lerp(_air, u); scene.fog.density = lerp(scene.fog.density, 1.1, u);
        R.vol.on = false; R.setFog(null);
        R.hemi.intensity *= 1 - 0.7 * u; R.hemi.color.lerp(_air.setRGB(0.25, 0.4, 0.3), u); R.sun.intensity *= 1 - 0.9 * u;
        // (flecks of silt and rot hanging in it, drifting past your face)
        if (dt > 0 && u > 0.5) for (let i = 0; i < 2; i++) FX.emit({ at: _fxA.set(cam.x + (Math.random() - 0.5) * 3, cam.y + (Math.random() - 0.5) * 2, cam.z + (Math.random() - 0.5) * 3), dir: _fxD.set(Math.random() - 0.5, 0.2, Math.random() - 0.5), spread: 1, speed: [0.03, 0.15], grav: -0.02, drag: 0.5, life: [1.5, 3], size: [0.008, 0.02], color: [0.16 * lit, 0.2 * lit, 0.15 * lit], alpha: 0.8, fadeIn: 0.3 });
      }
      // (and whether the sun's on your hands, or you're standing in the ship's shadow under its hull: see R.lightVM)
      R.fx.sunlit = damp(R.fx.sunlit, G.shipShades(cam, L.sunDir) ? 0 : 1, 6, dt);
      // a wide shadow frustum that follows the camera, snapped to whole shadow-map texels so edges don't crawl
      R.setSunShadow(42, 300);
      {
        const fw = L.sunDir.clone().negate(), rt = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(rt, fw);
        const tx = (2 * 42) / R.sun.shadow.mapSize.x, snap = (v) => Math.round(v / tx) * tx;
        const tgt = new THREE.Vector3().addScaledVector(rt, snap(cam.dot(rt))).addScaledVector(up, snap(cam.dot(up))).addScaledVector(fw, cam.dot(fw));
        R.sun.target.position.copy(tgt); R.sun.position.copy(tgt).addScaledVector(L.sunDir, 140);
      }
      const raining = G.round.weather === 'rain' || G.round.weather === 'storm';
      G.ext.rain.visible = raining; G.ext.rainMat.uniforms.uTime.value = t; G.ext.rainMat.uniforms.uCam.value.copy(cam);
      // (the rain smears the way it's passing you: straight down standing still, slanting back past the glass flying)
      { const rv = G.ext.rainMat.uniforms.uVel.value; if (G.rainAt && dt > 0) { _rainV.copy(cam).sub(_rainP).divideScalar(dt); if (_rainV.lengthSq() > 200 * 200) _rainV.set(0, 0, 0); rv.lerp(_rainV, 1 - Math.exp(-6 * dt)); } _rainP.copy(cam); G.rainAt = true; }
      // (and beads and runs on the ship's windows, out here or flying up through it; none once it's out in space)
      // (never with the blast shutters down over the glass: there's nothing to see of it then)
      { G.rainGlass = damp(G.rainGlass || 0, raining && !G.ship.space.visible ? (G.round.weather === 'storm' ? 1 : 0.75) : 0, 0.5, dt); G.ship.glassU.uRainK.value = G.rainGlass * (1 - G.ship.shut.t); }
      // (and the rain splashing up off the ground and the water all round you)
      if (raining && dt > 0 && !G.camCarried) {
        const n = dt * (G.round.weather === 'storm' ? 110 : 60) + Math.random(), w = G.ext.water, l = FX.lit(cam, 'out');
        for (let k = 0; k < n - 1; k++) {
          const a = Math.random() * TAU, d = 0.8 + Math.random() * 11, x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
          if (G.ship.onFootprint(x, z)) continue;
          const gy = Math.max(G.groundAt(x, z), w ?? -1e9);
          FX.emit({ at: _fxA.set(x, gy + 0.02, z), n: 2, spread: 0.7, speed: [0.5, 1.5], grav: 9.8, floor: gy, die: true, life: 0.5, size: [0.012, 0.022], streak: 0.03, color: [0.6 * l, 0.65 * l, 0.7 * l], alpha: 0.55 });
        }
      }
      G.ext.setShipFrame(G.shipM);
      G.ext.update(t, cam, L);
      G.ship.setFlood(!!G.run.upgrades.flood && G.round.time > 16 * 60);
      const sc = G.simCam.position, inCab = G.ship.inside(sc.x, sc.y, sc.z) && (!G.shipMoved || G.camCarried);
      SFX.setEnv(inCab ? 'ship' : 'exterior');
      // the mist stays outside: once you're in the cabin its air clears over a few seconds (and mists up again
      // quickly when you step back out)
      G.cabinClear = damp(G.cabinClear || 0, inCab ? 1 : 0, inCab ? 0.9 : 5, dt);
      R.setShipFog(G.shipM, G.cabinClear);
      R.fx.exposure = 1.0 + L.night * 0.35;
      // lightning
      if (G.round.weather === 'storm') {
        G.dir.light -= dt;
        if (G.dir.light <= 0) { G.dir.light = 8 + Math.random() * 18; R.fx.flash = 0.55; G.dir.flashT = 0.25; SFX.play('thunder', null, { vol: 1, delay: 0.4 + Math.random() * 2 }); }
      }
      if (G.dir.flashT > 0) { G.dir.flashT -= dt; R.hemi.intensity += 3 * (Math.random() < 0.5 ? 1 : 0.3); }
    }
    // NIGHT EYES: the dark gives up a little more
    R.fx.exposure *= Player.fx.light;
    G.ship.space.visible = inSpace;
    G.ship.beaconOn = G.mode === 'landing' || G.mode === 'leaving' || !!(G.seq && G.seq.kind !== 'fired');
    // lights
    const power = G.round ? G.round.power : true;
    const los = zone === 'in' && G.fac ? (s) => (s.fac ? G.fac.lampReach(cam, s) : G.fac.los(cam.x, cam.z, s.x, s.z) ? 1 : 0) : null;
    R.updateLights(G.lightSources, cam, zone, t, dt, power, (s, f) => { if (s.fac && G.fac) G.fac.setLampVisual(s, power || s.state === 'emergency' ? Math.max(0.05, f) : 0.04); }, los);
    G.lamps(t);
    // remote flashlights (+ a faint visible beam, but not where there's no air for it to show in)
    const vac = zone === 'out' && !!(G.ext && G.ext.biome.airless);
    const remotes = [...G.players.values()].filter((p) => p.id !== G.localId && p.alive && p.flash && p.zone === zone)
      .sort((a, b) => a.rpos.distanceToSquared(cam) - b.rpos.distanceToSquared(cam)).slice(0, R.remote.length);
    R.remote.forEach((s, i) => {
      const p = remotes[i];
      if (!p) { s.intensity = 0; R.setBeam(i, s, false); return; }
      G.aimFlash(s, p);
      R.setBeam(i, s, zone === 'in' || (!vac && G.round && G.round.time > 18 * 60));
    });
    // suits give off no light of their own: in the dark, a crewmate is only as visible as their flashlight
    const me2 = G.me();
    for (let i = -1; i < 2; i++) R.setGlow(i, null);
    // dust drifting through your flashlight beam
    R.updateDust(t, me2.alive && !vac && R.flash.intensity > 1 ? (zone === 'in' ? 1 : 0.5) : 0);
    // ambience: what this place sounds like right now
    const amb = { cam, storm: !!(G.round && G.round.weather === 'storm'), night: 0, buzz: 0 };
    if (!inSpace && zone === 'out' && G.ext) { amb.night = G.ext.lighting(G.round.time).night; amb.trees = G.ext.trees; amb.complex = G.ext.center; }
    if (!inSpace && zone === 'in' && G.fac) {
      let best = null, bd = 1e9;
      for (const l of G.fac.lamps) { if (l.state === 'off' || !(l.lit > 0.05)) continue; const d = (l.x - cam.x) ** 2 + (l.z - cam.z) ** 2; if (d < bd) { bd = d; best = l; } }
      if (best && bd < 81 && G.fac.los(cam.x, cam.z, best.x, best.z, true)) {
        const d = Math.sqrt(bd);
        amb.buzz = Math.pow(clamp(1 - d / 8, 0, 1), 1.4) * Math.min(1, best.lit) * (power || best.state === 'emergency' ? 1 : 0);
        if (best.state === 'flicker' && power) amb.flickerLamp = new THREE.Vector3(best.x, best.y, best.z);
      }
      // (somewhere on every floor, a machine still thumping away)
      const fac = G.fac, lv = Math.round(fac.depthOfY(cam.y - 1.4)), M = fac._machines || (fac._machines = []);
      if (M[lv] === undefined) { const p = fac.randomWalkable(R0, (q) => fac.lvl[fac.idx(q.i, q.j)] === lv, { lv, only: true }); M[lv] = p ? new THREE.Vector3(p.x, fac.floorY(p.x, p.z) + 1.2, p.z) : null; }
      amb.machine = M[lv];
    }
    if (G.ship.termPos) amb.console = G.ship.termPos;
    SFX.ambience(dt, amb);
  },
  director(dt) {
    const me = G.me(); if (!me) return;
    const cam = R.camera.position, d = G.dir;
    // fear from visible creatures
    let fear = 0, flicker = 0, chased = false, chaseK = 0, radioD = 99;
    const camDir = R.camera.getWorldDirection(new THREE.Vector3());
    for (const m of G.monsters.values()) {
      // (how long since it was last with you: in sight, or out of it but still after you; see the stinger below)
      m.lostT = (m.lostT || 0) + dt;
      if (m.dead || m.def.zone !== G.zoneOf(me)) continue;
      const c = m.center(), dist = c.distanceTo(cam);
      if (dist > 26) continue;
      const to = c.clone().sub(cam).normalize();
      const inView = camDir.dot(to) > 0.62;
      const los = me.zone !== 'in' || !G.fac || G.fac.los(cam.x, cam.z, c.x, c.z, true);
      const flashOn = R.flash.intensity > 0 && camDir.dot(to) > 0.9 && dist < R.flash.distance;
      const nearLamp = G.fac && me.zone === 'in' ? G.fac.nearestLampDist(c.x, c.z, G.round ? G.round.power : true) < 4.5 : me.zone === 'out' && dist < 18;
      const visible = inView && los && (dist < 6 || flashOn || nearLamp || (m.type === 'leech' && dist < 4)) && !(m.type === 'leech' && m.extra === me.id);
      const threat = m.state === 'charge' || m.state === 'chase' || m.state === 'lunge' || m.state === 'hunt' || m.state === 'drawn' || m.state === 'lurch' || m.state === 'swing' || (m.type === 'executioner' && m.state === 'walk') || (m.type === 'clown' && (m.state === 'herd' || m.state === 'block' || m.state === 'grab'));
      if (m.def.radio) radioD = Math.min(radioD, dist);
      if (threat && dist < 16 && (m.extra === me.id || m.type === 'mannequin' || m.type === 'hound' || m.type === 'executioner')) { chased = true; chaseK = Math.max(chaseK, clamp(1 - dist / 18, 0.15, 1)); }
      // The stinger: once, the moment you first see it. Not again while it's still with you (in sight, or out of sight
      // but still on your heels: a look back at it mid-chase is no surprise); only once you've lost it a while (a good
      // twelve seconds with it neither in sight nor after you) does seeing it again sting
      if (visible || (m.stung && threat && m.extra === me.id && dist < 22)) m.lostT = 0;
      if (m.lostT > 12) m.stung = false;
      if (visible) {
        fear = Math.max(fear, clamp(1 - dist / 22, 0, 1) + (threat ? 0.35 : 0.1));
        if (me.alive && !m.stung) { m.stung = true; SFX.play(dist < 5 ? 'stinger_hi' : 'stinger', null, { vol: 0.9, pitch: 0.85 + Math.random() * 0.3 }); }
      } else if (dist < 12 && los) fear = Math.max(fear, (1 - dist / 12) * 0.45);
      if (m.type === 'pale' && m.extra === me.id && dist < 13 && m.state === 'stalk') flicker = Math.max(flicker, 0.06 * (1 - dist / 13) + 0.02);
    }
    if (G.leechOn === me.id) fear = 1;
    if (me.alive && me.hp < 35) fear = Math.max(fear, 0.35);
    // (and as any radio does near one of the things from behind the siren, a walkie you're carrying starts to hiss,
    // in bursts that come quicker and longer the closer it is)
    if (me.alive && radioD < 15 && me.slots.some((id) => id != null && G.items.get(id) && G.items.get(id).type === 'walkie')) {
      d.radio = (d.radio || 0) - dt;
      if (d.radio <= 0) { const k = 1 - radioD / 15; d.radio = lerp(1.1, 0.12, k) * (0.5 + Math.random()); SFX.play('static', null, { dur: 0.08 + Math.random() * 0.5 * k, vol: 0.4 + k * 1.1 }); }
    }
    R.fx.fear = damp(R.fx.fear, me.alive ? clamp(fear, 0, 1) : 0, fear > R.fx.fear ? 3 : 0.4, dt);
    if (G.cueT > 0) { G.cueT -= dt; flicker = Math.max(flicker, 0.3); }
    G.flicker = flicker + (R.fx.fear > 0.7 ? 0.01 : 0);
    // heartbeat: quickening with fear, and racing (over two hundred a minute) with something right behind you
    d.beat -= dt;
    if (me.alive && (R.fx.fear > 0.3 || chaseK > 0) && d.beat <= 0) {
      d.beat = chaseK > 0 ? lerp(0.45, 0.26, chaseK) : lerp(1.05, 0.38, R.fx.fear);
      SFX.play('heartbeat', null, { vol: Math.max(R.fx.fear * 0.9, chaseK > 0 ? 0.65 + chaseK * 0.45 : 0), gap: Math.min(0.22, d.beat * 0.42) });
    }
    // ...and the chase music, swelling with how close it is
    SFX.chase(dt, me.alive ? chaseK : 0);
    // post fx decay
    R.fx.damage = damp(R.fx.damage, 0, 2.5, dt);
    R.fx.flash = damp(R.fx.flash, 0, 1.4, dt);
    R.fx.lowhp = me.alive && me.hp < 30 ? 1 - me.hp / 30 : 0;
    R.fx.health = damp(R.fx.health, me.alive ? me.hp / 100 : 0, me.alive ? 2.5 : 1.2, dt);
    // adrenaline: a silent burst of speed and breath while something is running you down
    G.adrenaline = chased && me.alive ? 2.5 : Math.max(0, (G.adrenaline || 0) - dt);
    R.fx.leech = damp(R.fx.leech, G.leechOn === me.id && me.alive ? 1 : 0, 6, dt);
    SFX.setMuffle(Math.max(R.fx.leech * 0.85 + (me.alive ? 0 : 0.3), (G.under || 0) * 0.92));
    if (!G.seq && R.fx.fade > 0) R.fx.fade = damp(R.fx.fade, 0, 6, dt);
    if (me.alive && R.fx.static > 0 && !(G.seq && G.seq.kind === 'fired')) R.fx.static = damp(R.fx.static, 0, 3, dt);
    // ambient scares (cosmetic, local only)
    if (!me.alive || G.mode !== 'site') return;
    if (me.zone === 'in' && G.fac) {
      d.t -= dt;
      if (d.t <= 0) {
        d.t = 14 + Math.random() * 26;
        const alone = !G.alivePlayers().some((p) => p.id !== me.id && p.zone === 'in' && p.pos.distanceTo(me.pos) < 15);
        const pick = R0.weighted({ metal_bang: 3, groan: 2, drip: 3, knock: 1.2, run_far: 1, door_slam: 1, whisper: alone ? 0.8 : 0.1, scream: 0.25, vent: 0.6 });
        let pos;
        if (pick === 'whisper') { const back = new THREE.Vector3(Math.sin(me.yaw), 0, Math.cos(me.yaw)); pos = cam.clone().addScaledVector(back, 1.1).add(new THREE.Vector3((Math.random() - 0.5), 0.1, 0)); }
        else {
          const near = pick === 'drip' || pick === 'knock';
          const p = G.fac.randomWalkable(R0, (q) => { const dd = Math.hypot(q.x - me.pos.x, q.z - me.pos.z); return near ? dd > 3 && dd < 9 : dd > 12 && dd < 34; }, { x: me.pos.x, z: me.pos.z, r: near ? 9 : 34 });
          pos = p ? new THREE.Vector3(p.x, G.fac.floorY(p.x, p.z) + (pick === 'knock' ? 1.2 : 2), p.z) : null;
        }
        if (pos) SFX.play(pick, pos, { vol: pick === 'scream' ? 0.5 : pick === 'whisper' ? 0.35 : 0.9, rev: 0.7 });
        if (pick === 'groan' || pick === 'metal_bang') Player.addShake(0.08);
      }
    }
  },
  updateHUD(dt) {
    const me = G.me();
    HUD.vitals(me.alive ? me.hp : 0, Player.stamina, Player.exhausted, Player.weight);
    HUD.slots(me);
    const zone = G.zoneOf(me);
    if (G.mode === 'orbit') HUD.clock('IN ORBIT', 'DAY ' + G.run.day + ' · QUOTA $' + G.run.sold + '/$' + G.run.quota + ' · ' + (G.run.daysLeft > 0 ? G.run.daysLeft + 'D LEFT' : 'DEADLINE'), false);
    else if (G.round && zone === 'out') HUD.clock(fmtTime(G.round.time), SITES[G.round.site].name.toUpperCase(), G.round.time >= 23 * 60);
    else HUD.clock('', '', false);
    HUD.lobby(G.online ? Net.code : '', G.players.size);
    // tracker
    const id = me.slots[me.sel], it = id != null && G.items.get(id);
    const trk = me.alive && it && it.type === 'tracker' && it.on;
    if (trk) {
      const blips = [];
      const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
      const add = (x, z, sp, big) => {
        if (sp < 0.3) return;
        const dx = x - me.pos.x, dz = z - me.pos.z, dd = Math.hypot(dx, dz); if (dd > 25) return;
        const a = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz); if (Math.abs(a) > 1.0) return;
        blips.push({ a, d: dd, big });
      };
      for (const m of G.monsters.values()) if (!m.dead && m.def.zone === me.zone) add(m.rpos.x, m.rpos.z, m.vis.speed, m.def.radius > 0.5);
      for (const p of G.players.values()) if (p.id !== me.id && p.alive && p.zone === me.zone) add(p.rpos.x, p.rpos.z, p.speed || 0, false);
      HUD.tracker(true, blips);
    } else HUD.tracker(false);
    // (how far you're carrying: a whisper, talking, a shout)
    HUD.voice(G.online && Voice.enabled ? (Voice.talking ? (me.radio ? '((( RADIO )))' : me.loud > 0.8 ? '((( MIC )))' : me.loud > 0.3 ? '(( MIC ))' : '( MIC )') : '') : '');
    HUD.update(dt);
  },
};
