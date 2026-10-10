'use strict';
// Game state, host-authoritative simulation, event replication, world management, scare director.
const SITE_LOOK = {
  // seen from orbit, each planet looks like the ground you land on
  ashgrove: { tint: 0x9a9070, atmo: 0x9fb8e8 },
  kessler: { tint: 0x6f8a62, atmo: 0x9adf8a },
  nadir: { tint: 0xb07a4e, atmo: 0xffb070, rings: true },
  hollow: { tint: 0x8a4a3e, atmo: 0xff6a4a, rings: true },
};
const SITES = {
  // each site has its own roster (what lives there), a threat budget, and a cap on how many things are inside at once
  ashgrove: { name: 'Ashgrove Mill', code: '12-A', risk: 'LOW', cost: 0, size: 26, stairs: [2], scrap: [11, 15], mult: 1.0, power: 3, cap: 2, hounds: 1, weather: { clear: 3, fog: 3, rain: 2 }, mon: { mannequin: 2, crawler: 1.2, leech: 1 }, desc: 'Abandoned textile mill. Shallow. A good place to learn. Mind the dress forms.' },
  kessler: { name: 'Kessler Biolab', code: '31-K', risk: 'MEDIUM', cost: 0, size: 32, stairs: [3], scrap: [16, 21], mult: 1.25, power: 5, cap: 3, hounds: 1, weather: { clear: 2, fog: 3, rain: 3, storm: 1 }, mon: { leech: 2, crawler: 1.8, pale: 0.6 }, desc: 'Research annex. Something got out. Something stayed.' },
  nadir: { name: 'Nadir Station', code: '7', risk: 'HIGH', cost: 60, size: 38, stairs: [2, 1], scrap: [23, 30], mult: 1.6, power: 7, cap: 4, hounds: 2, weather: { fog: 3, rain: 2, storm: 3 }, mon: { crawler: 2, pale: 1.5, leech: 1, mannequin: 0.5 }, desc: 'Deep pumping station. Rich salvage. Few crews come back complete.' },
  hollow: { name: 'The Hollow', code: '0', risk: 'EXTREME', cost: 200, size: 44, stairs: [2, 1], scrap: [30, 39], mult: 2.2, power: 10, cap: 5, hounds: 3, weather: { storm: 3, fog: 2 }, mon: { pale: 2, mannequin: 1.6, crawler: 1.3, leech: 1 }, desc: 'No survey data. The signal is coming from below the facility. We would like it back.' },
};
// What circles each world: a moon, and a rock it captured (seen hanging round it from orbit, and in the sky from its
// sites). size and orbit are in the world's radii; ang is where round its limb it shows from orbit, off how far past
// it. Some days a facility beacon shows on one of them: a bonus site, that day only (see G.signal)
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
    { key: 'grit', kind: 'moon', size: 0.2, orbit: 5.5, ang: 2.8, off: 0.14, tint: 0xc0a088 },
    { key: 'mote', kind: 'rock', size: 0.07, orbit: 3.6, ang: 0.9, off: 0.1, tint: 0x9a8676 },
  ],
  hollow: [
    { key: 'cinder', kind: 'moon', size: 0.25, orbit: 6.4, ang: -2.2, off: 0.18, tint: 0x80625a },
    { key: 'clinker', kind: 'rock', size: 0.06, orbit: 3.0, ang: 1.3, off: 0.06, tint: 0x564c48 },
  ],
};
// the bonus sites on them: airless (bonus: the world they circle; biome: moon or rock), light gravity out on the
// surface, nothing hunting outside, better pay for the risk
Object.assign(SITES, {
  wick: { name: 'Wick', code: 'A-I', risk: 'MEDIUM', cost: 0, bonus: 'ashgrove', biome: 'moon', lowG: true, size: 28, stairs: [2], scrap: [15, 20], mult: 1.5, power: 5, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1.6, mannequin: 1.2, leech: 0.8 }, desc: 'A survey outpost that stopped answering.' },
  tallow: { name: 'Tallow', code: 'A-R', risk: 'MEDIUM', cost: 0, bonus: 'ashgrove', biome: 'rock', lowG: true, size: 24, stairs: [], scrap: [12, 16], mult: 1.6, power: 4, cap: 2, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1, leech: 1.6 }, desc: 'A mining claim bored into it. Tight tunnels.' },
  petri: { name: 'Petri', code: 'K-I', risk: 'HIGH', cost: 0, bonus: 'kessler', biome: 'moon', lowG: true, size: 32, stairs: [3], scrap: [18, 24], mult: 1.9, power: 7, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { leech: 2, pale: 0.9, crawler: 1.2 }, desc: 'The quarantine overflow site. Sealed from the outside.' },
  swab: { name: 'Swab', code: 'K-R', risk: 'HIGH', cost: 0, bonus: 'kessler', biome: 'rock', lowG: true, size: 26, stairs: [], scrap: [14, 19], mult: 2.0, power: 6, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { leech: 2.2, crawler: 1 }, desc: 'A sample store. Whatever they kept here is still kept.' },
  grit: { name: 'Grit', code: '7-I', risk: 'HIGH', cost: 0, bonus: 'nadir', biome: 'moon', lowG: true, size: 36, stairs: [2, 1], scrap: [24, 31], mult: 2.1, power: 8, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { crawler: 2, pale: 1.4, mannequin: 0.6 }, desc: "The pumping company's refinery. Red dust in everything." },
  mote: { name: 'Mote', code: '7-R', risk: 'HIGH', cost: 0, bonus: 'nadir', biome: 'rock', lowG: true, size: 28, stairs: [2], scrap: [20, 26], mult: 2.2, power: 7, cap: 3, hounds: 0, weather: { clear: 1 }, mon: { crawler: 1.6, leech: 1.2, pale: 0.8 }, desc: 'An ore crusher, still running.' },
  cinder: { name: 'Cinder', code: '0-I', risk: 'EXTREME', cost: 0, bonus: 'hollow', biome: 'moon', lowG: true, size: 42, stairs: [2, 1], scrap: [32, 40], mult: 2.6, power: 11, cap: 5, hounds: 0, weather: { clear: 1 }, mon: { pale: 2, mannequin: 1.5, crawler: 1.4, leech: 1 }, desc: 'The signal from below the Hollow is louder here.' },
  clinker: { name: 'Clinker', code: '0-R', risk: 'EXTREME', cost: 0, bonus: 'hollow', biome: 'rock', lowG: true, size: 30, stairs: [2], scrap: [26, 33], mult: 2.8, power: 9, cap: 4, hounds: 0, weather: { clear: 1 }, mon: { pale: 1.6, crawler: 1.4, mannequin: 1 }, desc: 'Burnt out. Something tunnels through it.' },
});
for (const w in BODIES) {
  const W = SITE_LOOK[w];
  // seen from orbit round one of them, it's grey and airless
  for (const b of BODIES[w]) SITE_LOOK[b.key] = { tint: b.tint, atmo: 0x000000, airless: true };
  // and in the sky over each site: from the world, its moon and rock (small, a few degrees across); from one of
  // them, the world itself, filling half the sky (bigger still from the rock, in closer), and the other one
  SITES[w].sky = BODIES[w].map((b) => ({ kind: b.kind, tint: b.tint, r: 1.2 * b.size / (b.orbit - 1), az: b.ang * 1.3 + 0.4, el: 0.32 + 0.18 * Math.sin(b.ang * 2) }));
  for (const b of BODIES[w]) SITES[b.key].sky = [{ kind: 'planet', tint: W.tint, atmo: W.atmo, rings: W.rings, r: b.kind === 'rock' ? 0.74 : 0.6, az: 2.3, el: 0.5 }]
    .concat(BODIES[w].filter((o) => o !== b).map((o) => ({ kind: o.kind, tint: o.tint, r: Math.min(0.06, o.size / Math.max(1, Math.abs(o.orbit - b.orbit))), az: o.ang * 1.3 + 4.0, el: 0.28 })));
}
// what is left in a room depends on what the room was for
const LOOT = {
  office: { phone: 3, register: 1.2, watch: 2, painting: 1.2, lamp: 1, horn: 0.8, candelabra: 1, bell: 0.6, toy: 0.4 },
  storage: { gear: 2, bolt: 2, toy: 1.5, doll: 1, candelabra: 1, bell: 1, lamp: 0.8, axle: 1, register: 0.4, painting: 0.5, goldbar: 0.25 },
  machine: { gear: 3, bolt: 3, axle: 2, engine: 1.3, horn: 1, goldbar: 0.2 },
  boiler: { gear: 2, bolt: 3, axle: 1.5, engine: 1.2, horn: 0.8 },
  hall: { gear: 1, bolt: 1, axle: 1, engine: 0.6, toy: 0.5, doll: 0.5, painting: 0.4 },
  lab: { flask: 4, jar: 2.2, mask: 1, watch: 0.5, doll: 0.3 },
  morgue: { mask: 2, doll: 2, watch: 2.2, jar: 1, flask: 1.4, candelabra: 0.5 },
  lockers: { watch: 2, toy: 1.5, horn: 1.4, phone: 1, doll: 1, mask: 1, bell: 1, goldbar: 0.35 },
  entrance: { phone: 2, register: 1.5, painting: 1, lamp: 1, bell: 1 },
  exit: { bolt: 1, gear: 1, horn: 1, toy: 0.6 },
  core: { bolt: 1, gear: 1 },
  corridor: { bolt: 1, doll: 1.2, toy: 0.8, gear: 0.6, watch: 0.4 },
};
// ...and on what the whole site was
const SITE_LOOT = {
  ashgrove: { bell: 1.4, candelabra: 1.4, gear: 1.3, painting: 1.2, lamp: 1.2 },
  kessler: { flask: 1.6, jar: 1.6, mask: 1.3, doll: 1.2 },
  nadir: { engine: 1.6, axle: 1.5, bolt: 1.3, gear: 1.2, goldbar: 1.4 },
  hollow: { goldbar: 1.8, mask: 1.6, doll: 1.6, painting: 1.3, candelabra: 1.3 },
};
const SEC_PER_MIN = 0.75;
const SELL_RATE = [1.0, 0.85, 0.7, 0.5];
const PROTO = 5;
// the ship's flights between orbit and the ground (seconds, metres)
const FLY = {
  landDur: 12, landH: 300, landRun: 190, // powered descent: from this high, this far back along the approach
  liftAt: 2.8, toDur: 11.5,              // takeoff: engines spool up for liftAt seconds, then lift; orbit at toDur
  burst: 4.4,                            // ...and this long after lifting off, the main engines open up all at once
  sendoff: 4.5,                          // ...and this much longer when it leaves anyone behind (they watch it go)
  doorAlt: 40,                           // the hatch can be open below this altitude, and shuts itself above it
};
// leaving orbit for the ground (seconds after the lever): the de-orbit burn, the fall, the burning entry, into cloud;
// the site is built and the descent over it begins at `site`
const ENTRY = { burn: 1.4, heat0: 5.4, heat1: 6.6, white: 8.4, site: 8.6 };
const _orange = new THREE.Color(), _ahead = new THREE.Vector3(), _air = new THREE.Color(), _smokeCol = new THREE.Color();
// a hyperjump to another world: the drive winds up, punches through, drops out, brakes into orbit
const JUMP = { punch: 2.2, drop: 6.4, end: 9.8 };
const DEATH_TEXT = { crawler: 'Mauled', pale: 'Neck snapped', mannequin: 'Caught', leech: 'Suffocated', hound: 'Eaten', left: 'Left behind', friend: 'Friendly fire', blast: 'Blown apart', unknown: 'Unknown' };

const G = {
  mode: 'menu', isHost: true, online: false, localId: 0, saveKey: null,
  players: new Map(), items: new Map(), monsters: new Map(),
  run: null, round: null, fac: null, ext: null, ship: null,
  noises: [], timers: [], nextItemId: 1, nextMonId: 1, nextPid: 1,
  lightSources: [], sendT: 0, leechOn: null, flicker: 0, seq: null, leverConfirm: 0, corpses: [], departT: 0, grenades: [],
  bombs: [], fuses: [], blasts: [],
  dir: { t: 20, howl: 40, light: 0, beat: 0 }, now: 0,
  marks: [], flight: null, fp: null, shipM: new THREE.Matrix4(), shipQ: new THREE.Quaternion(), shipMoved: false,
  simCam: new THREE.Object3D(),

  // ======================= setup =======================
  init() {
    G.ship = new Ship();
    G.ship.clockMinutes = () => (G.round ? G.round.time : null);
    R.scene.add(G.ship.group); R.scene.add(G.ship.wash); R.scene.add(G.ship.smoke); R.scene.add(G.ship.scorch); R.setBackdrop(G.ship.space, G.ship.sunCore);
    CrewCam.init(G.ship);
    Rover.init(G.ship);
    SFX.setOcclusion((p) => {
      const cam = R.camera.position;
      if (G.fac && cam.y < -50 && p.y < -50) return G.fac.los(cam.x, cam.z, p.x, p.z) ? 0 : 0.85;
      return 0;
    });
    Net.on('message', (d, c) => G.onMessage(d, c));
    Net.on('leave', (c) => { if (c.pid != null) G.hostPlayerLeft(c.pid); });
    Net.on('close', (why) => G.quit(why || 'Disconnected from host.'));
    Net.on('call', (call) => { if (Settings.voice) Voice.onCall(call); else call.close(); });
  },
  newRun() { return { credits: 60, quota: 300, sold: 0, daysLeft: 3, cycle: 1, day: 1, route: 'ashgrove', upgrades: {}, totalSold: 0, deaths: 0, collected: 0 }; },
  reset() {
    G.teardownSite(true);
    for (const it of [...G.items.values()]) G.removeItem(it.id);
    for (const p of G.players.values()) if (p.avatar) p.avatar.dispose();
    for (const c of G.corpses) c.dispose();
    G.players.clear(); G.items.clear(); G.monsters.clear(); G.corpses = [];
    G.noises = []; G.timers = []; G.grenades = []; G.round = null; G.leechOn = null; G.seq = null; G.flicker = 0;
    G.ship.setDoor(false); G.ship.door.t = 0;
    G.flight = null; G.updateFlight(0); G.ship.setLanded(false); SFX.setThrust(0, true, 0);
    G.robot = null; G.ship.poseRobot(-1); G.ship.lockCycling = false; G.ship.idoor.open = true; G.ship.idoor.t = 1;
    G.endSendoff(); G.entryHeat = 0; G.fovAdd = 0; G.jumping = false; R.fx.white = 0; R.fx.heat = 0;
    G.siteBuild = null; G.siteShown = true; G.setCabinPower(1);
    G.bombs = []; G.fuses = []; for (const b of G.blasts) for (const p of b.parts) R.scene.remove(p.o); G.blasts = [];
    for (const g of G.grenades) R.scene.remove(g.mesh); G.grenades = [];
    G.ship.snapShutters(false);
    G.ship.approach = 0; G.ship.arrive = 1; G.ship.turn = 0; G.ship.dip = 1; G.ship.inWarp = false; G.ship.warp.visible = false; G.ship.portal.visible = false; G.ship.tunnel.visible = false; R.fx.warp = 0; G.ship.plasma.visible = false; G.ship.stars.material.uniforms.uFade.value = 1;
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
    else G.createItem({ id: G.nextItemId++, type: 'flashlight', value: 0, x: 2.3, y: 0.92, z: -3.3, ry: 0.4, battery: 1, inShip: true });
    G.applyRunVisuals();
    G.enterOrbitState();
    G.mode = 'orbit';
    G.spawnInShip(G.me(), 0);
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
      p = { id: info.id, name: info.name, color: info.color || 0, peerId: info.peerId, pos: new THREE.Vector3(info.x || 0, info.y || 0, info.z || 0), rpos: new THREE.Vector3(info.x || 0, info.y || 0, info.z || 0), yaw: info.yaw || 0, pitch: 0, hp: info.hp ?? 100, alive: info.alive ?? true, zone: info.zone || 'out', slots: info.slots || [null, null, null, null], sel: info.sel || 0, flags: 0, buf: [], noiseT: 0, speed: 0 };
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
  pinfo(p) { return { id: p.id, name: p.name, color: p.color, peerId: p.peerId, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, hp: p.hp, alive: p.alive, zone: p.zone, slots: p.slots, sel: p.sel }; },
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
      if (it.vis.y > it.pos.y + 0.001 || Math.abs(it.vis.x - it.pos.x) > 0.001) {
        it.fallV += 20 * G.gravity(G.itemZone(it), it.vis.x, it.vis.y, it.vis.z) * dt;
        it.vis.y = Math.max(it.pos.y, it.vis.y - it.fallV * dt);
        it.vis.x = damp(it.vis.x, it.pos.x, 10, dt); it.vis.z = damp(it.vis.z, it.pos.z, 10, dt);
        if (it.vis.y <= it.pos.y + 0.001 && it.fallV > 2) { SFX.play('drop', it.pos, { vol: 0.6, metal: ITEMS[it.type].weight > 4, pitch: 1.4 - Math.min(0.8, ITEMS[it.type].weight / 30) }); it.fallV = 0; }
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
    const y = me.roof ? ROOF.y : me.zone === 'in' ? G.fac.floorY(x, z, me.pos.y) : G.groundAt(x, z);
    G.request({ a: 'drop', item: id, x, y, z, ry: me.yaw, battery: it.battery, on: it.on });
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
  stageSite(seed, siteKey, weather, done) {
    if (G.fac && G.round && G.round.seed === seed) { if (done) done(); return; }
    if (G.siteBuild && G.siteBuild.seed === seed) { if (done) G.siteBuild.done.push(done); return; }
    const site = SITES[siteKey], b = { seed, siteKey, weather, i: 0, done: done ? [done] : [] };
    b.steps = [
      () => { b.fac = new Facility(seed, site.size, siteKey, site.stairs); },
      () => { b.facG = b.fac.build(); },
      () => { b.ext = new Exterior(seed, site, weather, siteKey); b.ext.buildLand(); },
      () => { b.extG = b.ext.buildRest(); },
    ];
    G.siteBuild = b;
  },
  stepSite(all) {
    const b = G.siteBuild; if (!b) return;
    do b.steps[b.i++](); while (all && b.i < b.steps.length);
    if (b.i < b.steps.length) return;
    G.siteBuild = null;
    G.installSite(b);
    for (const f of b.done) f();
  },
  prepareSite(seed, siteKey, weather) {
    if (G.fac && G.round && G.round.seed === seed) return;
    G.stageSite(seed, siteKey, weather);
    G.stepSite(true);
  },
  installSite(b) {
    const { seed, siteKey, weather } = b;
    G.teardownSite(false);
    G.fac = b.fac; G.ext = b.ext;
    const fac = G.fac, ext = G.ext;
    G.siteShown = false;
    R.precompile(b.facG, () => R.precompile(b.extG, () => { if (G.fac !== fac) return; R.scene.add(b.facG); R.scene.add(b.extG); G.siteShown = true; }));
    G.fac.lamps.forEach((l) => (l.fac = true));
    G.lightSources = [...G.ship.lights, ...G.ext.lights, ...G.fac.lamps];
    G.round = { site: siteKey, seed, weather, time: 8 * 60, power: true, coreTaken: false, startShip: new Set(), warn1: false, warn2: false, spawnT: 45, houndT: 30, blackoutT: 150 + Math.random() * 240, blackout: false, allDeadT: 0, total: 0 };
    SFX.setWeather(weather === 'rain' ? 0.8 : weather === 'storm' ? 1 : 0, weather === 'storm' ? 1.4 : weather === 'fog' ? 0.7 : 1);
  },
  teardownSite(full) {
    G.clearMarks(); Pods.clear(); G.podBusy = false; G.ship.clearSmoke();
    for (const m of G.monsters.values()) R.scene.remove(m.mesh);
    G.monsters.clear();
    const disposeGroup = (g) => { if (!g) return; R.scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); };
    if (G.fac) { disposeGroup(G.fac.group); G.fac = null; }
    if (G.ext) { disposeGroup(G.ext.group); G.ext = null; }
    for (const c of G.corpses) c.dispose();
    G.corpses = [];
    G.lightSources = [...G.ship.lights];
    G.leechOn = null;
    if (!full) G.round = null;
  },
  applyRunVisuals() {
    const r = G.run; if (!r) return;
    G.ship.drawMonitor(r);
    HUD.termStats(r);
    Rover.setOwned(!!r.upgrades.rover);
    // the main screen stays on whatever somebody last left it on
    CrewCam.setView(r.mon || 0);
    for (const p of G.players.values()) { const n = r.upgrades.belt ? 5 : 4; while (p.slots.length < n) p.slots.push(null); }
    if (G.jumping) return;   // (mid-jump: the new world appears when the ship drops out)
    const look = SITE_LOOK[r.route] || SITE_LOOK.ashgrove; G.ship.setPlanet(look.tint, look.atmo, look.airless);
    // each day / destination gets its own orbit (deterministic, so every crewmate sees the same sky)
    const oseed = (r.day * 7919 + r.cycle * 104729 + [...r.route].reduce((s, c) => s + c.charCodeAt(0) * 31, 0)) >>> 0;
    if (G.orbitSeed !== oseed) { G.orbitSeed = oseed; G.ship.setOrbit(oseed, look); G.ship.setBodies(G.bodiesAround(r.route)); }
  },
  // gravity, as a share of the usual: light out on the surface of a moon or rock (the ship and the facilities keep
  // a full one of their own)
  gravity(zone, x, y, z) { return G.round && SITES[G.round.site].lowG && zone === 'out' && !G.ship.inside(x, y + 0.5, z) ? 0.3 : 1; },
  // what hangs round the world the ship is orbiting, for the view from orbit (Ship.setBodies): its moon and rock, or
  // from round one of those, the world itself, enormous, and the other one
  bodiesAround(route) {
    const s = SITES[route]; if (!s) return [];
    if (!s.bonus) return (BODIES[route] || []).map((b) => ({ kind: b.kind, size: b.size, orbit: b.orbit, ang: b.ang, off: b.off, tint: b.tint }));
    const W = SITE_LOOK[s.bonus], me = BODIES[s.bonus].find((b) => b.key === route);
    return [{ kind: 'planet', size: Math.min(10, 1 / me.size), orbit: 0, ang: me.ang + Math.PI * 0.8, off: 0.12, tint: W.tint, atmo: W.atmo, rings: W.rings }]
      .concat(BODIES[s.bonus].filter((b) => b !== me).map((b) => ({ kind: b.kind, size: b.size / me.size * 0.6, orbit: Math.max(3, Math.abs(b.orbit - me.orbit) / me.size * 0.3), ang: b.ang, off: b.off, tint: b.tint })));
  },
  // Some days a facility beacon shows on one of the bodies circling the world the ship is at (or the one it belongs
  // to): a bonus site for that day only. Decided by the day, so every crewmate sees the same one
  signal(run) {
    const world = SITES[run.route] && SITES[run.route].bonus || run.route, list = BODIES[world]; if (!list) return null;
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
      v: PROTO, mode: G.mode, run: G.run,
      round: G.round ? { site: G.round.site, seed: G.round.seed, weather: G.round.weather, time: G.round.time, power: G.round.power, coreTaken: G.round.coreTaken } : null,
      players: [...G.players.values()].map(G.pinfo),
      items: [...G.items.values()].map(G.iinfo),
      monsters: [...G.monsters.values()].map((m) => m.serialize()),
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
    if (s.round) {
      G.prepareSite(s.round.seed, s.round.site, s.round.weather);
      Object.assign(G.round, { time: s.round.time, power: s.round.power, coreTaken: s.round.coreTaken });
      s.doors.forEach((o, i) => { const d = G.fac.doors[i]; if (!d) return; if (o === 2) { G.fac.breakDoor(d); return; } d.open = !!o; d.dir = o === 3 ? -1 : 1; d.anim = o ? 1 : 0; G.fac.applyDoor(d); });
      (s.boxes || []).forEach((o, i) => { const c = G.fac.containers[i]; if (!c) return; c.open = !!o; c.anim = o ? 1 : 0; c.mesh.rotation.y = c.closedRy + c.swing * c.anim; });
      (s.blasts || []).forEach((o, i) => { const d = G.fac.blasts[i]; if (!d) return; d.open = !!o; d.anim = o ? 1 : 0; G.fac.applyBlast(d); });
      G.ship.space.visible = false;
    } else G.enterOrbitState();
    for (const p of s.players) G.addPlayer(p);
    for (const i of s.items) G.createItem(i);
    for (const m of s.monsters) G.spawnMonster({ id: m[0], type: m[1], x: m[2], y: m[3], z: m[4] });
    G.ship.setDoor(!!s.hatch); G.ship.door.t = s.hatch ? 1 : 0;
    G.mode = s.mode === 'landing' ? 'site' : s.mode;
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
        if (m.v !== PROTO) { Net.sendTo(conn, { t: 'deny', reason: 'Version mismatch. Make sure everyone has the same game files.' }); return; }
        if (G.players.size >= 6) { Net.sendTo(conn, { t: 'deny', reason: 'Lobby is full (6 crew max).' }); return; }
        const id = G.nextPid++;
        conn.pid = id;
        const midRound = G.mode !== 'orbit';
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
      | (me.air ? 4096 : 0);                          // off the ground (jumping or falling, not walking a slope)
  },
  decodeFlags(p) {
    const f = p.flags;
    p.crouch = !!(f & 1); p.sprint = !!(f & 2); p.moving = !!(f & 4); p.flash = f & 8 ? (f & 16 ? 2 : 1) : 0; p.talking = !!(f & 64); p.radio = !!(f & 32) && p.talking;
    p.zone = f & 128 ? 'in' : 'out';
    const s = (f >> 8) & 15; p.seat = s ? s - 1 : null;
    p.air = !!(f & 4096);
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
      const snap = { t: 'snap', tm: G.round ? G.round.time : 0, p: ps, m: ms };
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
    peers(e) { if (Settings.voice) Voice.connect(e.list); },
    run(e) { G.run = e.run; G.applyRunVisuals(); },
    chat(e) {
      if (e.sys) { HUD.chat('', e.text, 'sys'); return; }
      const p = G.players.get(e.pid); if (!p) return;
      const me = G.me();
      if (e.radio) {
        if (G.hasItem(G.localId, 'walkie') || e.pid === G.localId) { HUD.chat(p.name + ' [RADIO]', e.text, 'radio'); SFX.play('static', null, { dur: 0.2 }); }
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
      // said out loud, it only carries so far: in the log within earshot, and hanging over the speaker's head
      const near = p.zone === me.zone && p.pos.distanceTo(me.pos) < 22;
      if (!me.alive || !p.alive || e.pid === G.localId || near) HUD.chat(p.name, e.text, p.alive ? '' : 'sys');
      if (e.pid !== G.localId && p.alive) HUD.bubble(() => (p.alive ? p.rpos.clone().setY(p.rpos.y + (p.crouch ? 1.8 : 2.32)) : null), e.text, 'say', p.zone);
    },
    // the de-orbit burn: the screen goes dark through re-entry while the site is made ready
    landing(e) {
      G.mode = 'landing';
      G.seq = { kind: 'land', t: 0, site: e.site };
      G.ship.setEngines(1);
      HUD.closeTerminal(true);
    },
    sitePrep(e) { G.stageSite(e.seed, e.site, e.weather); },
    monitor(e) {
      if (G.run) G.run.mon = e.view;
      CrewCam.setView(e.view);
      if (e.radar) { CrewCam.radar(); SFX.play('scan', new THREE.Vector3(0, 1.45, -3.85), { vol: 0.7 }); }
    },
    // out of the cloud, high over the site: the powered descent begins
    land(e) {
      G.prepareSite(e.seed, e.site, e.weather);
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
        G.fac.breakDoor(d);
        SFX.play('door_slam', at, { vol: 1.6, ref: 4 }); SFX.play('crunch', at, { vol: 1.1 }); SFX.play('hit_metal', at, { vol: 1 });
        const me = G.me(); if (me && me.zone === 'in' && me.pos.distanceTo(at) < 12) Player.addShake(0.45);
        return;
      }
      if (d.broken) return;
      G.fac.setDoor(d, e.open, e.dir);
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
      if (G.isHost) G.addNoise(at, 22, 'in', null);
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
      if (p) { const k = p.slots.indexOf(it.id); if (k >= 0) p.slots[k] = null; it.vis.set(p.pos.x, p.pos.y + 1.1, p.pos.z); }
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
    pod(e) {
      Pods.spawn(e);
      // (the Company calls it in over the radio, so whoever wants to can go out and watch it come down)
      if (e.t == null) HUD.chat('', 'Mercy Supply: pod inbound, impact in about ' + Math.round(POD.WAIT + POD.GLINT + POD.FALL) + ' seconds. Stand clear of the ship.', 'sys');
    },
    podOpen(e) { const p = Pods.get(e.id); if (p && !p.opened) Pods.crack(p, false); },
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
      else if (e.cause !== 'left') SFX.play('crunch', pos.clone().setY(pos.y + 1), { vol: 1.2 });
      if (e.cause !== 'left') {
        const body = new Avatar(p.name, p.color); body.setDead(e.pid * 7 + Math.floor(e.x * 10));
        body.root.position.copy(pos); body.root.rotation.y = p.yaw; R.scene.add(body.root); G.corpses.push(body);
        if (e.cause === 'pale') G.timers.push({ t: 1.6, fn: () => { body.root.visible = false; } });
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
    sound(e) { SFX.play(e.s, new THREE.Vector3(e.x, e.y, e.z), e.o || {}); },
    monSpawn(e) { G.spawnMonster(e); },
    monDel(e) { const m = G.monsters.get(e.id); if (m) { R.scene.remove(m.mesh); G.monsters.delete(e.id); } },
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
      if (me && G.zoneOf(me) === 'in') {
        SFX.play(e.on ? 'power_up' : 'power_down', null, { vol: 1 });
        if (e.perm) { SFX.play('alarm', null, { vol: 0.8, delay: 1.2 }); HUD.notice('POWER FAILURE', 'Something down here just woke up.', true, 5); }
      }
      if (G.fac) for (const l of G.fac.lamps) if (l.state !== 'emergency') G.fac.setLampVisual(l, e.on && l.state !== 'off' ? 1 : 0.04);
    },
    toast(e) { HUD.toast(e.text, 2.5); },
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
      if (d < 14 && (me.zone !== 'in' || !G.fac || G.fac.los(cam.x, cam.z, pos.x, pos.z))) {
        const dir = R.camera.getWorldDirection(new THREE.Vector3()), to = pos.clone().sub(cam).normalize();
        const facing = dir.dot(to);
        R.fx.flash = Math.max(R.fx.flash, (facing > 0.3 ? 2.2 : 0.6) * (1 - d / 16));
        if (d < 9) SFX.play('tinnitus', null, { vol: 1 - d / 10 });
        Player.addShake(0.5);
      }
    },
    // takeoff: the engines spool up (last chance to run for it), then the ship lifts, tucks its gear and climbs out.
    // The hatch stays as it is; it shuts itself once the ship is too high.
    depart(e) {
      G.mode = 'leaving';
      SFX.play('alarm', null, { vol: 0.6 });
      const me = G.me();
      if (me && me.alive && !G.inShip(me)) HUD.notice('THE SHIP IS LEAVING', '', true, 4);
      else HUD.notice('DEPARTING', e.reason === 'dead' ? 'No life signs.' : e.reason === 'midnight' ? 'Midnight.' : '', false, 3);
      G.flight = { kind: 'takeoff', t: 0, aboard: null };
      G.updateFlight(0);
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
      if (p.id === G.localId && back) G.spawnInShip(p, i);
      i++;
    }
    HUD.hideSpectate(); HUD.struggle(false); R.fx.static = 0; R.fx.leech = 0; Player.clearPerks();
    G.showSummary(e.summary);
    if (G.isHost) { G.save(); G.callSignal(); }
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
    G.monsters.set(e.id, m); R.scene.add(m.mesh);
    if (e.id >= G.nextMonId) G.nextMonId = e.id + 1;
    return m;
  },
  // ======================= host logic =======================
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
        G.addNoise(new THREE.Vector3(r.x, r.y, r.z), ITEMS[it.type].weight > 4 ? 10 : 5, p.zone, pid);
        break;
      }
      case 'swing': G.hostSwing(pid, r); break;
      case 'throw': G.hostThrow(pid, r); break;
      case 'noise': {
        const it = G.items.get(r.item); if (!it || it.holder !== pid) return;
        const d = ITEMS[it.type]; if (!d.noise) return;
        const pos = p.pos.clone().setY(p.pos.y + 1.2);
        G.emitSound(d.noise, pos, { vol: 1.3, ref: 4 });
        G.addNoise(pos, d.noiseR || 20, p.zone, pid);
        break;
      }
      case 'door': {
        const d = G.fac && G.fac.doors[r.id]; if (!d || !p.alive || d.broken) return;
        if (Math.hypot(d.x - at.x, d.z - at.z) > 4.5) return;
        if (G.now - (d.lastT || 0) < 350) return;
        d.lastT = G.now;
        G.emit({ e: 'door', id: d.id, open: !d.open, dir: G.doorDirFrom(d, at) });
        G.addNoise(new THREE.Vector3(d.x, d.y + 1, d.z), 10, 'in', pid);
        break;
      }
      case 'box': {
        const c = G.fac && G.fac.containers[r.id]; if (!c || !p.alive) return;
        if (Math.hypot(c.x - at.x, c.z - at.z) > 3.5 || G.now - (c.lastT || 0) < 400) return;
        c.lastT = G.now;
        G.emit({ e: 'box', id: c.id, open: !c.open });
        // rusty hinges and a rattling steel door: anything nearby hears you rummaging
        G.addNoise(new THREE.Vector3(c.x, c.y + 1, c.z), 9, 'in', pid);
        break;
      }
      case 'hatch': {
        // it opens on the ground, and in the air while the ship is low; never in space or up high
        if ((G.mode !== 'site' && G.mode !== 'leaving') || (G.fp && G.fp.y > FLY.doorAlt)) { G.sendTo(pid, { t: 'ev', e: { e: 'toast', text: 'Hatch locked.' } }); return; }
        G.emit({ e: 'hatch', open: !G.ship.door.open });
        G.addNoise(new THREE.Vector3(-2.5, 1, 4.5), 22, 'out', pid);
        break;
      }
      case 'lever': {
        if (G.flight || G.robot || G.seq) return;
        if (G.mode === 'orbit') G.hostLand();
        else if (G.mode === 'site') G.hostDepart('lever');
        break;
      }
      case 'term': G.hostTerminal(pid, String(r.cmd || '').slice(0, 60)); break;
      case 'chat': G.emit({ e: 'chat', pid, text: String(r.text || '').slice(0, 120), radio: !!r.radio && G.hasItem(pid, 'walkie') }); break;
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
        G.addNoise(new THREE.Vector3(pod.x, pod.gy + 1, pod.z), 20, 'out', pid);
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
          : what === 'tool' ? rng.pick(['proflash', 'stun', 'tracker', 'walkie', 'flashlight']) : what === 'snack' ? rng.pick(['nightshift', 'cola', 'ration'])
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
      case 'charge': {
        const it = G.items.get(r.item); if (!it || it.holder !== pid || !ITEMS[it.type].battery) return;
        G.emit({ e: 'itemState', id: it.id, battery: 1 });
        G.emitSound('charge', new THREE.Vector3(-3.6, 1.3, -3.7), {});
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
        G.addNoise(new THREE.Vector3(R0.x, R0.y + 0.3, R0.z), 16, R0.zone, pid);
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
        G.addNoise(new THREE.Vector3(x, y, z), 8, p.zone, pid);
        break;
      }
      default: break;
    }
  },
  emitSound(s, pos, o) { G.emit({ e: 'sound', s, x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), o }); },
  addNoise(pos, r, zone, pid) { G.noises.push({ x: pos.x, y: pos.y, z: pos.z, r, zone, pid, age: 0 }); },
  hurtPlayer(pid, dmg, cause, kx = 0, kz = 0, silent = false) {
    const p = G.players.get(pid); if (!p || !p.alive) return;
    const hp = Math.max(0, p.hp - dmg);
    p.lastHurt = G.now;
    if (hp <= 0) { G.killPlayer(pid, cause); return; }
    p.hp = hp;
    G.emit({ e: 'hurt', pid, hp, cause, kx, kz, silent });
  },
  killPlayer(pid, cause, monId) {
    const p = G.players.get(pid); if (!p || !p.alive) return;
    p.alive = false;
    const ground = p.zone === 'in' ? G.fac.floorY(p.pos.x, p.pos.z, p.pos.y) : G.groundAt(p.pos.x, p.pos.z);
    p.slots.forEach((id, i) => {
      if (id == null) return;
      const a = Math.random() * TAU, x = p.pos.x + Math.cos(a) * 0.5, z = p.pos.z + Math.sin(a) * 0.5;
      const ok = p.zone !== 'in' || !G.fac || G.fac.walkable(G.fac.ti(x), G.fac.tj(z)) || G.fac.floorAt(G.fac.ti(x), G.fac.tj(z));
      const fx = ok ? x : p.pos.x, fz = ok ? z : p.pos.z;
      G.emit({ e: 'drop', item: id, x: fx, y: ground, z: fz, ry: Math.random() * TAU, inShip: p.zone === 'out' && G.ship.inside(fx, ground + 0.3, fz) });
    });
    G.hostRoverRelease(p);
    G.emit({ e: 'die', pid, cause, mon: monId, x: p.pos.x, y: ground, z: p.pos.z });
    for (const m of G.monsters.values()) if (m.type === 'leech' && m.victim === pid) m.detach();
    if (G.run) G.run.deaths = (G.run.deaths || 0) + 1;
  },
  canSee(p, pos, maxD, dotMin) {
    const ey = p.pos.y + (p.crouch ? 1.0 : 1.6);
    const dx = pos.x - p.pos.x, dy = pos.y - ey, dz = pos.z - p.pos.z, d = Math.hypot(dx, dy, dz);
    if (d > maxD || d < 0.01) return d < 0.01;
    const cp = Math.cos(p.pitch);
    const fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
    if ((dx * fx + dy * fy + dz * fz) / d < dotMin) return false;
    if (p.zone === 'in' && G.fac) return G.fac.los(p.pos.x, p.pos.z, pos.x, pos.z);
    return true;
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
      if (Math.abs(l.x - pos.x) < 5 && Math.abs(l.z - pos.z) < 5 && Math.hypot(l.x - pos.x, l.z - pos.z) < 4.5 && G.fac.los(l.x, l.z, pos.x, pos.z)) return true;
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
  monsterBreakDoor(m, door) {
    if (door.broken) return;
    G.emit({ e: 'door', id: door.id, open: true, broken: true });
    G.addNoise(new THREE.Vector3(door.x, door.y + 1, door.z), 26, 'in', null);
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
      G.addNoise(at, 30, zone, pid);
      for (const m of G.monsters.values()) {
        if (m.dead || m.def.zone !== zone) continue;
        const d = Math.hypot(m.pos.x - at.x, m.pos.z - at.z);
        if (d < 10 && (zone !== 'in' || G.fac.los(at.x, at.z, m.pos.x, m.pos.z))) { m.stun = 5.5; if (m.type === 'leech' && m.state === 'attached') m.detach(); }
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
  hostExplode(at, zone, id, pid) {
    G.emit({ e: 'boom', x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2), zone, id });
    G.addNoise(at, 45, zone, null);
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
  // a blast: a fireball that swells and burns out, black smoke rolling up and spreading under the ceiling, a hot
  // flash of light on everything around, and a scorch mark left on the floor
  blastFx(pos, zone) {
    const inside = zone === 'in' && G.fac;
    const ceil = inside ? G.fac.ceilY(pos.x, pos.z, pos.y) - 0.35 : pos.y + 40;
    const floor = inside ? G.fac.floorY(pos.x, pos.z, pos.y) : G.groundAt(pos.x, pos.z);
    const puff = TEX.get('puff'), parts = [];
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
  },
  hostLand() {
    if (G.mode !== 'orbit') return;
    const run = G.run;
    if (run.daysLeft <= 0) { G.hostSubmit(); return; }
    G.ship.pullLever();
    G.emitSound('lever', G.ship.leverPos, {});
    const key = run.route;
    G.emit({ e: 'landing', site: key });
    // with the shutters down, everyone starts building the site (a few frames' work); the descent begins once it's up
    G.timers.push({ t: ENTRY.site, fn: () => {
      const site = SITES[key], seed = randSeed(), rng = new RNG(seed ^ 0x51ed);
      const weather = rng.weighted(site.weather);
      G.emit({ e: 'sitePrep', site: key, seed, weather });
      G.stageSite(seed, key, weather, () => {
        const items = G.spawnScrap(seed, site, key);
        G.emit({ e: 'land', site: key, seed, weather, items });
        const first = key === 'hollow' ? 2 : 1;
        for (let i = 0; i < first; i++) G.hostSpawnInterior(null, false, 30);
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
    const spots = fac.spots.map((s) => ({ ...s, w: s.w * clamp(Math.hypot(s.x - ent.x, s.z - ent.z) / 28, 0.2, 1.5) }));
    const bias = SITE_LOOT[siteKey] || {};
    const out = [];
    for (let i = 0; i < n && spots.length; i++) {
      let tot = 0; for (const s of spots) tot += s.w;
      let x = r.next() * tot, k = 0;
      for (; k < spots.length - 1; k++) { x -= spots[k].w; if (x <= 0) break; }
      const s = spots.splice(k, 1)[0];
      // spread finds out: no second piece lying a step away from the first
      for (let q = spots.length - 1; q >= 0; q--) if (spots[q].c == null && Math.hypot(spots[q].x - s.x, spots[q].z - s.z) < 2.2) spots.splice(q, 1);
      const table = LOOT[s.tag] || LOOT.storage, w = {};
      for (const t in table) { if (!s.big && ITEMS[t].twoHanded) continue; w[t] = table[t] * (bias[t] || 1); }
      const type = Object.keys(w).length ? r.weighted(w) : 'bolt', d = ITEMS[type];
      // scrap is junk: most of it is worth a few dollars, a real find is rare; the lower levels were never stripped
      const deep = 1 + 0.2 * Math.round(fac.depthOfY(s.y));
      out.push({ id: G.nextItemId++, type, value: Math.max(3, Math.round(r.range(d.value[0], d.value[1]) * site.mult * SCRAP_SCALE * deep)), x: s.x, y: s.y, z: s.z, ry: r.range(0, TAU), c: s.c });
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
      for (const m of G.monsters.values()) if (!m.dead && m.def.zone === 'in') { counts[m.type] = (counts[m.type] || 0) + 1; power += m.def.power; n++; }
      if (n >= site.cap) return;
      // never a pack of the same thing: one of each big creature, at most two of the small ones, and a type that is
      // already prowling is much less likely to be picked again
      const lim = { crawler: site.power >= 7 ? 2 : 1, leech: 2, pale: 1, mannequin: 1 };
      const w = {}; for (const k in site.mon) if ((counts[k] || 0) < lim[k]) w[k] = site.mon[k] * Math.pow(0.3, counts[k] || 0);
      if (!Object.keys(w).length) return;
      type = R0.weighted(w);
      if (!force && power + MON_DEFS[type].power > site.power) return;
    }
    const players = G.alivePlayers().filter((p) => p.zone === 'in');
    const far = (x, z) => players.every((p) => Math.hypot(p.pos.x - x, p.pos.z - z) > minDist);
    let spot = null;
    const vents = R0.shuffle(fac.vents.slice());
    for (const v of vents) if (far(v.x, v.z)) { spot = { x: v.x + v.nx * 1.2, z: v.z + v.nz * 1.2, vent: v }; break; }
    if (!spot) { const p = fac.randomWalkable(R0, (q) => far(q.x, q.z)); if (p) spot = { x: p.x, z: p.z }; }
    if (!spot) return;
    const y = type === 'leech' ? fac.ceilY(spot.x, spot.z) - 0.18 : fac.floorY(spot.x, spot.z);
    G.emit({ e: 'monSpawn', id: G.nextMonId++, type, x: spot.x, y, z: spot.z });
    if (spot.vent) G.emitSound('vent', new THREE.Vector3(spot.vent.x, spot.vent.y, spot.vent.z), { vol: 1.2, ref: 3 });
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
    const keep = shipItems.filter((it) => !(allDead && collectedItems.includes(it))).map((it) => it.id);
    const deaths = [...G.players.values()].filter((p) => !p.alive).map((p) => ({ name: p.name, cause: G.deathCause && G.deathCause[p.id] || 'unknown' }));
    const fine = allDead ? 0 : Math.round(run.credits * 0.1 * deaths.length);
    run.credits = Math.max(0, run.credits - fine);
    run.daysLeft = Math.max(0, run.daysLeft - 1); run.day += 1;
    // (a beacon lasts the day: by the next the ship has hopped back to the world the moon or rock belongs to)
    if (SITES[run.route].bonus && G.signal(run) !== run.route) run.route = SITES[run.route].bonus;
    if (!allDead) run.collected = (run.collected || 0) + collected;
    const frac = r.total ? (collected - lost) / r.total : 0;
    let grade = allDead ? 'F' : frac >= 0.7 && !deaths.length ? 'S' : frac >= 0.5 ? 'A' : frac >= 0.3 ? 'B' : frac >= 0.15 ? 'C' : frac > 0 ? 'D' : 'F';
    if (deaths.length && grade === 'S') grade = 'A';
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
        L('  ROUTE <SITE>     - set destination (in orbit)', '', 'sites');
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
        for (const k in SITES) { const s = SITES[k]; if (s.bonus) continue; L(`  ${s.name.padEnd(16)} RISK: ${s.risk.padEnd(8)} ${s.cost ? 'ROUTE $' + s.cost : 'FREE'}${run.route === k ? '   << ROUTED' : ''}`, run.route === k ? 'hi' : '', 'route ' + k); L('     ' + s.desc, 'dim'); L('     SIGHTED: ' + Object.keys(s.mon).map((t) => MON_DEFS[t].name).join(', ') + '   ·   HOUNDS AFTER DARK', 'dim'); }
        // (and today's beacon, if one of the bodies round here is showing one)
        { const sig = G.signal(run);
          if (sig) { const s = SITES[sig], home = SITES[s.bonus];
            L(''); L('BEACON  ·  TODAY ONLY', 'hi');
            L(`  ${s.name.padEnd(16)} RISK: ${s.risk.padEnd(8)} BONUS${run.route === sig ? '   << ROUTED' : ''}`, run.route === sig ? 'hi' : '', 'route ' + sig);
            L(`     ${s.biome === 'rock' ? 'A rock' : 'The moon'} off ${home.name}: a short hop from there. ${s.desc}`, 'dim');
            L('     SIGHTED: ' + Object.keys(s.mon).map((t) => MON_DEFS[t].name).join(', ') + '   ·   NO AIR, LIGHT GRAVITY', 'dim');
          } }
        break;
      case 'route': {
        const q = norm(parts.slice(1).join(''));
        const k = Object.keys(SITES).find((s) => s === q || norm(SITES[s].name).startsWith(q) || norm(SITES[s].name).includes(q));
        if (!k) { L('UNKNOWN SITE. Try SITES.', 'bad'); break; }
        if (!inOrbit) { L('ROUTING ONLY AVAILABLE IN ORBIT.', 'bad'); break; }
        if (run.route === k) { L('ALREADY ROUTED TO ' + SITES[k].name.toUpperCase() + '.', 'dim'); break; }
        // (a moon or rock only while it's showing a beacon, and only from the world it circles)
        if (SITES[k].bonus && G.signal(run) !== k) { L('NO BEACON THERE TODAY. Try SITES.', 'bad'); break; }
        const cur = SITES[run.route], hop = (SITES[k].bonus && SITES[k].bonus === run.route) || (cur.bonus && cur.bonus === k);
        if (SITES[k].bonus && !hop) { L('ROUTE TO ' + SITES[SITES[k].bonus].name.toUpperCase() + ' FIRST.', 'bad'); break; }
        if (!hop && SITES[k].cost > run.credits) { L(`INSUFFICIENT CREDITS ($${SITES[k].cost} needed)`, 'bad'); break; }
        if (G.seq || G.robot) { L('NAVIGATION BUSY.', 'bad'); break; }
        if (!hop) run.credits -= SITES[k].cost;
        run.route = k;
        // a jump to the new world, or a short hop across to its moon or back (everyone aboard rides it; the sky
        // changes when the ship gets there)
        G.emit({ e: hop ? 'hop' : 'jump', route: k });
        G.emit({ e: 'run', run }); G.save();
        L('ROUTED TO ' + SITES[k].name.toUpperCase() + '.', 'hi');
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
        if (p.moving) G.addNoise(p.pos, p.sprint ? 20 : p.crouch ? 2 : 7.5, p.zone, p.id);
        if (p.talking) G.addNoise(p.pos.clone().setY(p.pos.y + 1.6), 24, p.zone, p.id);
      }
      // slow recovery once nothing has hurt you for a while
      if (p.hp < 100 && G.now - (p.lastHurt || 0) > 9000) {
        p.regen = (p.regen || 0) + dt * 2;
        if (p.regen >= 4) { p.regen -= 4; p.hp = Math.min(100, p.hp + 4); G.emit({ e: 'hp', pid: p.id, hp: p.hp }); }
      }
    }
    if (G.mode === 'site') {
      const r = G.round, site = SITES[r.site];
      r.time += dt / SEC_PER_MIN;
      if (!r.warn1 && r.time >= 21 * 60) { r.warn1 = true; G.emit({ e: 'notice', title: '9:00 PM', sub: '' }); }
      if (!r.warn2 && r.time >= 23 * 60) { r.warn2 = true; G.emit({ e: 'notice', title: '11:00 PM', sub: '', danger: true, alarm: true }); }
      if (r.time >= 24 * 60) { G.hostDepart('midnight'); return; }
      if (G.alivePlayers().length === 0) { r.allDeadT += dt; if (r.allDeadT > 4) { G.hostDepart('dead'); return; } }
      // spawns
      r.spawnT -= dt;
      if (r.spawnT <= 0) { r.spawnT = (55 + Math.random() * 50) * (1 - clamp((r.time - 480) / 960, 0, 1) * 0.35); G.hostSpawnInterior(null, false); }
      if (r.time >= 19 * 60) {
        r.houndT -= dt;
        const hounds = [...G.monsters.values()].filter((m) => m.type === 'hound' && !m.dead).length;
        if (r.houndT <= 0) { r.houndT = 40 + Math.random() * 45; if (hounds < site.hounds + (r.time > 22 * 60 && !site.bonus ? 1 : 0)) G.hostSpawnHound(); }
      }
      // blackouts
      if (!r.coreTaken) {
        r.blackoutT -= dt;
        if (r.blackoutT <= 0) {
          if (!r.blackout) { r.blackout = true; r.blackoutT = 22 + Math.random() * 25; G.emit({ e: 'power', on: false }); }
          else { r.blackout = false; r.blackoutT = 200 + Math.random() * 260; G.emit({ e: 'power', on: true }); }
        }
      }
      for (const m of G.monsters.values()) m.hostUpdate(dt);
    } else if (G.mode === 'leaving') {
      for (const m of G.monsters.values()) m.hostUpdate(dt);
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
      // straight up off the struts to a hover; the nose comes up and it eases forward, heavy and slow... then the main
      // engines open up all at once, a kick of flame and smoke, and it's gone, streaking away up its heading and banking
      // onto it as it climbs. The path always follows the nose: it flies, it never slides.
      const pitchAt = (q) => 0.6 * sstep(1.4, 4.8, q), yawAt = (q) => 0.4 * sstep(2, 8, q);
      const speedAt = (q) => (q < 1.8 ? 0 : 4 * sstep(1.8, 3.6, q) + 170 * sstep(B, B + 1.3, q) ** 1.5);
      let x = 0, y = 0, z = 0;
      for (let q = 1.8; q < k; q += 1 / 30) {
        const dq = Math.min(1 / 30, k - q), m = q + dq / 2, v = speedAt(m) * dq, p = pitchAt(m), yw = yawAt(m);
        x += v * Math.cos(p) * Math.cos(yw); y += v * Math.sin(p); z -= v * Math.cos(p) * Math.sin(yw);
      }
      P.x = x + 0.15 * Math.sin(k * 1.4) * (1 - sstep(2, 4, k)); P.z = z;
      P.y = 7 * sstep(0, 2.4, k) + y;
      P.yaw = yawAt(k); P.pitch = pitchAt(k);
      P.roll = -0.18 * Math.sin(Math.PI * sstep(2, 8, k));
      const air = sstep(0, 4, P.y);
      P.pitch += w(1.9, 0.5) * 0.01 * air; P.roll += w(1.4, 1.5) * 0.014 * air;
      // spooling up, the whole frame trembles on its struts
      const spool = sstep(0.3, L, t) * (1 - sstep(0, 1.2, k));
      P.y += spool * 0.02 * Math.sin(t * 37); P.roll += spool * 0.004 * Math.sin(t * 29);
      // (the mains idle along while it hovers; at the burst they flare out long and white-hot, then hold a roaring burn)
      const kick = sstep(B - 0.1, B + 0.25, k), flare = k > B ? Math.exp(-(k - B) * 3) : 0;
      P.lift = t < L ? 0.15 + 0.7 * sstep(0.3, L, t) : (1 - 0.35 * sstep(4, 9, k)) * (1 - 0.55 * sstep(B, B + 1, k));
      P.main = 0.12 * sstep(0.3, L, t) + 0.3 * sstep(1.6, 3.6, k) + 1.15 * kick + 0.5 * flare * kick;
      P.burst = sstep(B - 0.1, B + 0.4, k);
      P.gear = P.y > 6 ? 0 : 1;
      P.ramp = t < 0.35 ? 1 : 0;
      P.shake = 0.06 + 0.22 * spool + 0.12 * P.lift + 0.6 * kick * (1 - sstep(B + 0.3, B + 2.2, k));
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
    // who is aboard is settled the moment the ship leaves the ground
    if (f.kind === 'takeoff' && !f.aboard && S.airborne) { f.aboard = new Set(G.alivePlayers().filter((q) => q.zone === 'out' && G.posAboard(q.pos)).map((q) => q.id)); G.leftBehind(f); }
    const me = G.me(), aboard = G.playerAboard(me);
    if (f.kind === 'land' && !f.down && f.t >= FLY.landDur) { f.down = true; SFX.play('thud', new THREE.Vector3(-1, 0.2, 0), { vol: 1.1 }); if (me && me.alive) Player.addShake(aboard ? 0.9 : 0.35); }
    if (f.kind === 'takeoff' && !f.up && f.t >= FLY.liftAt) { f.up = true; SFX.play('clunk', new THREE.Vector3(-1, -0.3, 0), { vol: 0.9, pitch: 0.7 }); }
    // the burst: a thump you feel through the deck (or hear roll across the ground) and the roar of the mains opening up
    if (f.kind === 'takeoff' && !f.boom && f.t >= FLY.liftAt + FLY.burst - 0.1) {
      f.boom = true; const tail = aboard ? null : new THREE.Vector3(-18, 2.5, 0).applyMatrix4(G.shipM);
      SFX.play('explosion', tail, { vol: aboard ? 0.7 : 1.3, ref: 40 }); SFX.play('engine', tail, { dur: 4.5, vol: 1.5, ref: 60 });
      // where the flame hits: straight down the exhaust from the main nozzle (or under the tail, if it's pointing too
      // flat to reach the ground): it blows a cloud of smoke and a ring of dust out across it and burns it black
      if (G.ext) {
        const h = (x, z) => G.ext.height(x, z), at = new THREE.Vector3(-18.1, 2.55, 0).applyMatrix4(G.shipM), dir = new THREE.Vector3(-1, 0, 0).transformDirection(G.shipM), q = at.clone();
        let hit = false; for (let s = 0; s < 60 && !hit; s += 0.5) { q.copy(at).addScaledVector(dir, s); hit = q.y <= h(q.x, q.z); }
        if (!hit) q.copy(at);
        q.y = h(q.x, q.z); S.burstAt(q.x, q.y, q.z, h); f.boomAt = { x: q.x, z: q.z, t: f.t };
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
      S.updateWash(dt, strength, p.x, gy, p.z, (x, z) => G.ext.height(x, z), col, glow);
      S.updateSmoke(dt, p, _smokeCol.setRGB(0.34 * day, 0.33 * day, 0.32 * day), (x, z) => G.ext.height(x, z));
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
  // gets one last look. The view starts on you, where you stand or where you fell, then flies the quickest way out:
  // along the corridors and up the stairwells to the nearest exit, out through the door into the open and across the
  // ground (the farther it has to come, the faster it comes), and comes to rest on the ground to watch the ship climb
  // away into the sky without you.
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
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z), EYE = 1.55;
    // a smooth course through some points, evenly spaced (step metres apart), with its running length
    const course = (zone, pts, step) => {
      const q = pts.filter((p, i) => !i || p.distanceTo(pts[i - 1]) > 0.05);
      let n = 0; for (let i = 1; i < q.length; i++) n += q[i].distanceTo(q[i - 1]);
      const P = q.length < 2 ? [q[0], q[0].clone()] : new THREE.CatmullRomCurve3(q, false, 'centripetal').getSpacedPoints(Math.max(2, Math.ceil(n / step)));
      const len = [0]; for (let i = 1; i < P.length; i++) len.push(len[i - 1] + P[i].distanceTo(P[i - 1]));
      return { zone, P, len, L: len[len.length - 1] };
    };
    const legs = [];
    let from, face = null;
    if (me.zone === 'in' && fac) {
      // the shortest way to any exit, along the corridors and the stairs
      let best = null;
      for (const ex of fac.exits) {
        const path = fac.findPath(me.pos.x, me.pos.z, ex.spawn.x, ex.spawn.z, true, me.pos.y, FAC_Y0);
        if (!path) continue;
        let L = 0, px = me.pos.x, pz = me.pos.z; for (const q of path) { L += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
        if (!best || L < best.L) best = { L, ex, path };
      }
      const pts = [V3(me.pos.x, me.pos.y + EYE, me.pos.z)];
      let kind = 'main';
      if (best) {
        let y = me.pos.y;
        for (const q of best.path) { y = q.y != null ? q.y : G.fac.floorY(q.x, q.z, y); pts.push(V3(q.x, y + EYE, q.z)); }
        pts.push(V3(best.ex.x, y + EYE, best.ex.z));
        kind = best.ex.kind;
      }
      legs.push(course('in', pts, 0.3));
      // ...and out of the door it came to
      const sp = kind === 'fire' && ext.fire.spawn ? ext.fire.spawn : ext.entrance.spawn;
      face = V3(-Math.sin(sp.yaw), 0, -Math.cos(sp.yaw));
      from = V3(sp.x, sp.y + EYE, sp.z).addScaledVector(face, kind === 'fire' ? -1.2 : -2.0);
    } else from = V3(me.pos.x, me.pos.y + EYE, me.pos.z);
    // where to watch from: on the ground on this side of the pad, the ship in full view
    const dir = V3(from.x, 0, from.z); if (dir.lengthSq() < 1) dir.set(0, 0, 1); dir.normalize();
    const spot = dir.clone().multiplyScalar(30); spot.y = ext.height(spot.x, spot.z) + 1.7;
    const far = Math.hypot(from.x, from.z), ctrl = [from];
    if (face) ctrl.push(from.clone().addScaledVector(face, 5).setY(from.y + 1.5));
    if (far > 50) { const m = from.clone().lerp(spot, 0.5); m.y = Math.max(from.y, spot.y) + 8; ctrl.push(m); }
    if (far > 40) ctrl.push(spot.clone().addScaledVector(dir, 7).setY(spot.y + 2.5));
    ctrl.push(spot);
    const out = course('out', ctrl, 0.5);
    for (const p of out.P) p.y = Math.max(p.y, ext.height(p.x, p.z) + 1.2);   // (never through the ground)
    legs.push(out);
    const Ltot = legs.reduce((s, l) => s + l.L, 0);
    // the opening look, from just back from you: over your shoulder, or down at your body
    const head = V3(me.pos.x, me.pos.y + (me.alive ? 1.45 : 0.35), me.pos.z), back = V3(Math.sin(me.yaw), 0, Math.cos(me.yaw));
    let d = 2.6;
    if (me.zone === 'in' && fac) for (let k = 0.6; k <= 2.6; k += 0.2) { const c = head.clone().addScaledVector(back, k); if (!fac.floorAt(fac.ti(c.x), fac.tj(c.z))) { d = Math.max(0.5, k - 0.4); break; } }
    const shot = head.clone().addScaledVector(back, d); shot.y += me.alive ? 0.4 : 1.7;
    shot.lerp(head, -0.12);
    G.sendoff = { t: 0, legs, Ltot, run: clamp(1.6 + Ltot / 40, 2.2, 6.5), head, shot, zone: legs[0].zone, body: null, q: null };
    if (me.alive) { const b = new Avatar(me.name, me.color); b.root.position.copy(me.pos); b.root.rotation.y = me.yaw; R.scene.add(b.root); G.sendoff.body = b; }
    HUD.hideSpectate(); HUD.letterbox(true); R.fx.static = 0;
  },
  updateSendoff(dt) {
    const so = G.sendoff, me = G.me(), cam = R.camera, OPEN = 1.4;
    so.t += dt;
    const t = so.t;
    if (so.body) {
      // (something got you before the ship was out of sight: there's your body instead)
      if (!me.alive) { so.body.dispose(); so.body = null; } else so.body.update(dt, { at: me.pos, yaw: me.yaw, speed: 0, pitch: -0.35 });
    }
    // a point this far along the whole course, and which world it's in
    const at = (s) => {
      for (let n = 0; n < so.legs.length; n++) {
        const l = so.legs[n];
        if (s > l.L && n < so.legs.length - 1) { s -= l.L; continue; }
        s = clamp(s, 0, l.L);
        let i = 1; while (i < l.len.length - 1 && l.len[i] < s) i++;
        const k = (s - l.len[i - 1]) / Math.max(1e-6, l.len[i] - l.len[i - 1]);
        return { p: l.P[i - 1].clone().lerp(l.P[i], clamp(k, 0, 1)), zone: l.zone };
      }
    };
    const shipAt = G.ship.group.position.clone(); shipAt.y += 1.5;
    let pos, look, zone = so.legs[0].zone;
    if (t < OPEN) { pos = so.shot.clone(); look = so.head; }
    else if (t < OPEN + so.run) {
      // the run: away from you, picking up speed, the whole course in the same few seconds however long it is
      const u = (t - OPEN) / so.run, s = so.Ltot * u * u * (3 - 2 * u), a = at(s), ahead = at(s + 5);
      zone = a.zone; pos = a.p;
      look = ahead.zone === zone ? ahead.p : a.p.clone().add(a.p.clone().sub(at(s - 1).p).multiplyScalar(5));
      if (zone === so.legs[0].zone) { const w = sstep(0, 0.2, u); pos = so.shot.clone().lerp(pos, w); look = so.head.clone().lerp(look, w); }
      look.lerp(shipAt, sstep(0.75, 1, u));
    } else {
      // and there it goes
      const end = so.legs[so.legs.length - 1]; pos = end.P[end.P.length - 1].clone(); pos.y += Math.sin(t * 0.7) * 0.03;
      zone = 'out'; look = shipAt;
    }
    // out through the door: a burst of daylight (or night air) and the door banging behind
    if (zone !== so.zone) { so.zone = zone; R.fx.flash = Math.max(R.fx.flash, 0.8); SFX.play('door_open', null, { vol: 0.7 }); }
    me.zoneView = so.zone;
    // down there a light rides with the view, a glow leading the way out through the dark
    R.flash.intensity = so.zone === 'in' ? 30 : 0; R.flash.distance = 26; R.flash.angle = 0.8; R.flash.position.set(0, 0.1, 0.3);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, look, new THREE.Vector3(0, 1, 0)));
    if (!so.q || zone !== so.lastZone) so.q = q; else so.q.slerp(q, 1 - Math.exp(-dt * (t < OPEN + so.run ? 7 : 4)));
    so.lastZone = zone;
    cam.position.copy(pos); cam.quaternion.copy(so.q); cam.updateMatrixWorld();
    // watching it climb away, the view closes in on it
    const fov = Settings.fov - (t > OPEN + so.run ? 26 * sstep(40, 700, pos.distanceTo(shipAt)) : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 3, dt); cam.updateProjectionMatrix(); }
  },
  endSendoff() {
    const so = G.sendoff; if (!so) return;
    if (so.body) so.body.dispose();
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
      level = 0.9 * sstep(0, 0.5, t) * (1 - sstep(ENTRY.burn + 1.6, ENTRY.burn + 3.2, t)) + 0.15 + 0.85 * (G.entryHeat || 0);
      gale = (G.entryHeat || 0) * 0.8;
    } else if (G.seq && G.seq.kind === 'jump') {
      const t = G.seq.t; level = t < JUMP.punch ? 0.25 + 0.6 * (t / JUMP.punch) ** 2 : t < JUMP.drop ? 0.75 : 0.75 * Math.max(0, 1 - (t - JUMP.drop) / 2.5);
    }
    SFX.setThrust(level, inside, gale);
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
    } else if (G.mode === 'site' && G.ext && !G.podBusy) G.hostLaunchPod(orders.splice(0, 8));
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
      out.push({ kind: 'item', ref: it, x: it.vis.x, y: it.vis.y + (d.twoHanded ? 0.3 : 0.12), z: it.vis.z, r: d.twoHanded ? 0.55 : 0.32, label: 'Pick up ' + d.name, value: d.kind === 'scrap' ? it.value : 0 });
    }
    if (me.zone === 'in' && G.fac) {
      for (const d of G.fac.doors) if (!d.broken && Math.hypot(d.x - me.pos.x, d.z - me.pos.z) < 3.2) out.push({ kind: 'door', ref: d, x: d.x, y: d.y + 1.2, z: d.z, r: 0.75, label: d.open ? 'Close door' : 'Open door' });
      for (const c of G.fac.containers) {
        if (Math.abs(c.x - me.pos.x) > 3 || Math.abs(c.z - me.pos.z) > 3) continue;
        const f = G.fac.containerFront(c), name = c.kind === 'locker' ? 'locker' : 'cabinet';
        out.push({ kind: 'box', ref: c, x: f.x, y: f.y, z: f.z, r: 0.4, label: (c.open ? 'Close ' : 'Search ') + name });
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
        if (o.kind === 'lever') label = G.mode === 'orbit' ? (G.run.daysLeft <= 0 ? (armed ? 'Submit anyway' : 'Submit quota') : 'Land at ' + SITES[G.run.route].name) : G.mode === 'site' ? (armed ? 'Leave them behind' : 'Depart') : '...';
        if (o.kind === 'hatch') label = G.ship.door.open ? 'Close hatch' : 'Open hatch';
        if (o.kind === 'idoor') label = G.ship.lockCycling ? 'Locked' : G.ship.idoor.open ? 'Close door' : 'Open door';
        if (o.kind === 'charger') { const id = me.slots[me.sel], it = id != null && G.items.get(id); label = it && ITEMS[it.type].battery ? 'Charge ' + ITEMS[it.type].name : 'Charging station'; }
        if (o.kind === 'rover') { if (!Rover.owned) continue; const R0 = Rover.state; label = R0.driver != null ? 'Rover in use' : R0.carrier != null ? 'Rover being carried' : G.flight || G.mode !== 'site' ? 'Rover (no signal until landed)' : 'Drive rover'; }
        if (o.kind === 'ladder') { if (me.roof) continue; label = G.roofOpen() ? 'Climb to the roof' : 'Roof hatch (sealed)'; }
        if (o.kind === 'roofHatch') { if (!me.roof) continue; label = 'Climb down'; }
        out.push({ kind: o.kind, ref: o, x: o.x, y: o.y, z: o.z, r: o.r, label });
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
      if (inside && G.fac && d > 6 && !G.fac.los(cam.x, cam.z, it.pos.x, it.pos.z)) continue;
      const def = ITEMS[it.type];
      list.push({ x: it.vis.x, y: it.vis.y + 0.25, z: it.vis.z, text: def.name, value: def.kind === 'scrap' ? it.value : 0, kind: def.kind === 'scrap' && it.value >= 60 ? 'rich' : 'item', d });
    }
    const far = (x, y, z, text, d) => list.push({ x, y, z, text, sub: Math.round(d) + 'm', kind: 'big', d: Math.min(d, maxR) });
    if (!inside && G.ext) {
      far(0, 4.5, 0, 'SHIP', Math.hypot(me.pos.x, me.pos.z));
      far(G.ext.entrance.x, G.ext.entrance.h + 5, G.ext.entrance.z, 'MAIN ENTRANCE', Math.hypot(me.pos.x - G.ext.entrance.x, me.pos.z - G.ext.entrance.z));
      far(G.ext.fire.x, G.ext.fire.h + 3.5, G.ext.fire.z, 'FIRE EXIT', Math.hypot(me.pos.x - G.ext.fire.x, me.pos.z - G.ext.fire.z));
    }
    if (inside && G.fac) for (const ex of G.fac.exits) { const d = Math.hypot(ex.x - me.pos.x, ex.z - me.pos.z); if (d < 35 && G.fac.los(cam.x, cam.z, ex.x, ex.z)) far(ex.x, G.fac.floorY(ex.x, ex.z) + 2.2, ex.z, ex.kind === 'fire' ? 'FIRE EXIT' : 'MAIN EXIT', d); }
    for (const p of G.players.values()) if (p.id !== G.localId && p.alive && p.zone === me.zone && p.pos.distanceTo(me.pos) < 40) list.push({ x: p.rpos.x, y: p.rpos.y + 1.95, z: p.rpos.z, text: p.name, kind: 'player', d: p.rpos.distanceTo(cam) });
    // creatures: traced in red where the wave finds them, named, and followed while the mark lasts
    for (const m of G.monsters.values()) {
      if (!m.mesh || !m.mesh.visible || m.def.zone !== me.zone) continue;
      const d = m.rpos.distanceTo(cam);
      if (d > (inside ? 24 : 60)) continue;
      if (inside && G.fac && d > 6 && !G.fac.los(cam.x, cam.z, m.rpos.x, m.rpos.z)) continue;
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
    G.updateSeq(dt);
    G.updateFlight(dt);
    G.updateDelivery(dt);
    Pods.update(dt);
    // input not tied to the player body
    if (!HUD.blocking) {
      if (Input.hit('KeyT') || Input.hit('Enter')) HUD.openChat();
    }
    if (Settings.ptt) Voice.setPTT(Input.down('KeyV'));
    G.uncarryCamera();
    Player.update(dt);
    if (G.sendoff) G.updateSendoff(dt);
    Rover.update(dt);
    G.carryCamera();
    me.talking = G.online && Voice.talking;
    if (G.isHost) G.hostTick(dt);
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
    G.ship.update(dt, performance.now() / 1000, G.mode);
    G.environment(dt);
    G.director(dt);
    if (G.online) Voice.update(G);
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
      av.root.visible = p.alive;
      if (!p.alive) continue;
      av.root.position.copy(p.rpos); av.root.rotation.set(0, p.ryaw || 0, 0);
      if (G.shipMoved && G.playerAboard(p)) { av.root.position.applyMatrix4(G.shipM); av.root.quaternion.premultiply(G.shipQ); }
      const id = p.slots[p.sel], it = id != null && G.items.get(id);
      if (Rover.owned && Rover.state.carrier === p.id) av.setHug(0.33, 0.44); else av.setHeld(it ? it.type : null, it ? it.id : 0);
      av.setLamp(!!p.flash);
      p.swingT = Math.max(0, (p.swingT || 0) - dt);
      av.update(dt, { at: p.rpos, yaw: p.ryaw || 0, speed: p.speed, crouch: p.crouch, sit: p.seat != null, air: !!p.air, pitch: p.rpitch || 0, swing: p.swingT > 0 ? Math.sin((1 - p.swingT / 0.45) * Math.PI) : 0 });
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
  setCabinPower(k) { R.fx.cabin = k; G.ship.tubeMat.color.copy(G.ship.tubeBase).multiplyScalar(Math.max(0.04, k)); },
  updateSeq(dt) {
    const s = G.seq; if (!s) return;
    s.t += dt;
    const S = G.ship;
    if (s.kind === 'land') {
      // out of orbit and down: the de-orbit burn, a long fall toward the planet until it fills the windows, the
      // burning plunge through the upper air, and out into cloud (the descent over the site takes over from there)
      const E = ENTRY, t = s.t;
      if (G.mode === 'landing') {
        // the fall: eased in by the burn, fastest through the middle, slowing as the air takes hold (the altitude
        // itself shrinks geometrically, in the ship's orbit code, so the world swells at a steady rate)
        // first the nose swings round until the world lies under it; then it dips, the ship pushing over to dive
        // straight down into it with the engines roaring, and the view opens out as the world swells to fill it
        // (both slow and soft at either end, the way thrusters would swing a ship this size, and run into each other)
        const ease = (a, b) => { const u = clamp((t - a) / (b - a), 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
        S.turn = ease(0, 2.4); S.dip = ease(1.6, 4.0);
        if (!s.roar && t > 1.6) { s.roar = true; SFX.play('engine', null, { dur: 5.5, vol: 1.3 }); }
        G.fovAdd = 10 * sstep(0.3, 0.9, S.approach);
        const w = clamp((t - 0.6) / (E.white - 0.6), 0, 1);
        S.approach = w * w * (3 - 2 * w);
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
        S.setThrust(0, sstep(0, 0.5, t) * (1 - sstep(E.burn + 1.6, E.burn + 3.2, t)));
        Player.addShake(0.05 + 0.08 * sstep(0, 1.2, t) * (1 - sstep(E.burn + 1.6, E.burn + 3.2, t)) + 0.04 * sstep(1.6, 2.6, t) * (1 - sstep(3.2, 4.2, t)) + 0.55 * G.entryHeat);
        if (!s.boom && G.entryHeat > 0.08) { s.boom = true; SFX.play('thunder', null, { vol: 0.7 }); }
        // shut in, the worst of the burn draws the power down: the cabin lights sag and die to a glow for a moment
        if (t > E.site - 0.35) G.powerDip(s, dt, true);
      } else {
        // through the worst of it: still shut in, then the power comes back, the shutters grind up on cloud, and the
        // ground appears below (not before the site is really there)
        if (s.tLand == null) { s.tLand = t; G.fovAdd = 0; S.approach = 0; S.dip = 1; G.entryHeat = 0; R.fx.heat = 0; S.plasma.visible = false; S.stars.material.uniforms.uFade.value = 1; S.setShutters(true); }
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
        S.arrive = 1 - Math.pow(1 - Math.min(1, u * 1.1), 3);
        // out through the far side of the tear, which zips shut around the ship; dropping out nose-on to the new world,
        // the ship eases round into its orbit as it brakes
        const b = (t - J.drop) / 0.55;
        S.portal.visible = b < 1; pu.uK.value = Math.pow(Math.max(0, 1 - b), 2) * 1.2; S.portal.scale.setScalar(lerp(2600, 1500, Math.min(1, b))); S.portal.position.set(90, 1.6, 0);
        S.turn = 1 - sstep(J.drop + 1.4, J.end, t);
        R.fx.warp = 0.85 * Math.pow(Math.max(0, 1 - (t - J.drop) / 0.9), 2);
        if (t > J.end) { S.arrive = 1; S.turn = 0; S.warp.visible = false; S.stars.material.uniforms.uFade.value = 1; G.fovAdd = 0; G.seq = null; R.fx.warp = 0; S.portal.visible = false; }
      }
      S.warp.material.uniforms.uT.value = t; pu.uT.value = t; tu.uT.value = t;
    } else if (s.kind === 'fired') {
      if (s.t > 1.5 && !s.open) { s.open = true; G.ship.setDoor(true); }
      if (s.t > 2.5) { Player.addShake(0.8); const me = G.me(); me.pos.x = lerp(me.pos.x, -2.5, dt * 2); me.pos.z += dt * (s.t - 2.4) * 6; }
      R.fx.static = s.t > 4 ? Math.min(1, (s.t - 4) / 1.5) : 0;
      if (s.t > 6 && !s.done) {
        s.done = true;
        const run = s.data.run || G.run;
        HUD.summary(`<h2 style="color:var(--red)">TERMINATED</h2><div class="sub">The Company has ended your contract.</div>
          <div class="row"><span>Quota cycles survived</span><span>${run.cycle - 1}</span></div>
          <div class="row"><span>Days worked</span><span>${run.day - 1}</span></div>
          <div class="row"><span>Total scrap sold</span><span>$${run.totalSold || 0}</span></div>
          <div class="row"><span>Crew deaths</span><span>${run.deaths || 0}</span></div>
          <div class="grade" style="color:var(--red)">X</div>`, 'RETURN TO MENU', () => G.quit());
      }
    }
  },
  environment(dt) {
    const me = G.me();
    const zone = G.zoneOf(me);
    const scene = R.scene, cam = R.camera.position;
    const t = performance.now() / 1000;
    const inSpace = G.mode === 'orbit' || G.mode === 'landing' || !G.ext;
    // the sun casts shadows in orbit (through the windows) and outdoors; inside the facility the map is simply not
    // refreshed (switching castShadow would recompile every shader)
    if (!R.sun.castShadow) R.sun.castShadow = true;
    R.sun.shadow.autoUpdate = inSpace || zone !== 'in';
    if (R.camera.far !== 700) { R.camera.far = 700; R.camera.updateProjectionMatrix(); }
    if (inSpace || zone === 'in') R.setFog(null);
    if (inSpace) {
      G.orbitT = (G.orbitT || 60) + dt;
      const sd = G.ship.orbit(dt, G.orbitT);
      // falling close over the surface, the backdrop's near plane comes in so the ground below is never clipped
      R.setBgNear(clamp(G.ship.alt * 0.35, 0.5, 20));
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
      // each level down the air is thicker and what little light there is bounces off nothing
      const dp = G.fac ? G.fac.depthOfY(cam.y - 1.4) : 0;
      scene.background.set(0x000000); scene.fog.color.set(0x000000); scene.fog.density = 0.07 + 0.014 * dp;
      R.hemi.intensity = 0.04 * (1 - 0.32 * dp); R.hemi.color.set(0x8899aa).lerp(_orange.setRGB(0.42, 0.42, 0.33), dp * 0.5); R.hemi.groundColor.set(0x000000); R.sun.intensity = 0;
      SFX.setEnv('interior');
      R.fx.exposure = 1.25 - 0.06 * dp;
      G.ext.group.visible = false; G.ext.rain.visible = false;
    } else {
      G.ext.group.visible = true;
      const L = G.ext.lighting(G.round.time);
      scene.background.copy(L.fog); scene.fog.color.copy(L.fog); scene.fog.density = L.fogDen;
      // height fog that pools in the hollows and glows toward the sun
      R.setFog(L.sunDir, L.scatter, L.fogFalloff, 0);
      // riding the ship up through the cloud deck (or down out of it): from about 30 m above the ground the air
      // thickens into cloud, so the land falls away into it instead of running out
      const deck = G.camCarried && !G.ext.biome.airless ? sstep(28, 105, cam.y - G.ext.height(cam.x, cam.z)) : 0;
      G.ext.skyMat.uniforms.inCloud.value = deck * 0.97;
      if (deck > 0) { scene.fog.density = lerp(L.fogDen, 0.034, deck); R.setFog(L.sunDir, L.scatter, L.fogFalloff * (1 - deck), 0); }
      G.ext.starMat.opacity = L.stars; G.ext.moon.material.opacity = L.night * 0.7;
      G.ext.sky.position.copy(cam); G.ext.stars.position.copy(cam);
      R.hemi.intensity = L.hemi; R.hemi.color.copy(L.hemiSky); R.hemi.groundColor.set(0x1a1712);
      R.sun.intensity = L.sun; R.sun.color.copy(L.sunColor);
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
    const los = zone === 'in' && G.fac ? (s) => G.fac.los(cam.x, cam.z, s.x, s.z) : null;
    R.updateLights(G.lightSources, cam, zone, t, dt, power, (s, f) => { if (s.fac && G.fac) G.fac.setLampVisual(s, power || s.state === 'emergency' ? Math.max(0.05, f) : 0.04); }, los);
    // remote flashlights (+ a faint visible beam)
    const remotes = [...G.players.values()].filter((p) => p.id !== G.localId && p.alive && p.flash && p.zone === zone)
      .sort((a, b) => a.rpos.distanceToSquared(cam) - b.rpos.distanceToSquared(cam)).slice(0, R.remote.length);
    R.remote.forEach((s, i) => {
      const p = remotes[i];
      if (!p) { s.intensity = 0; R.setBeam(i, s, false); return; }
      const yaw = p.ryaw || p.yaw, pitch = p.rpitch || 0, cp = Math.cos(pitch);
      s.position.set(p.rpos.x - Math.sin(yaw) * 0.3 + Math.cos(yaw) * 0.2, p.rpos.y + (p.crouch ? 1.0 : 1.5), p.rpos.z - Math.cos(yaw) * 0.3 - Math.sin(yaw) * 0.2);
      s.target.position.set(s.position.x - Math.sin(yaw) * cp * 5, s.position.y + Math.sin(pitch) * 5, s.position.z - Math.cos(yaw) * cp * 5);
      if (G.shipMoved && G.playerAboard(p)) { s.position.applyMatrix4(G.shipM); s.target.position.applyMatrix4(G.shipM); }
      const pro = p.flash === 2, L = ITEMS[pro ? 'proflash' : 'flashlight'].light;
      s.intensity = FLASH_K * L.power; s.distance = L.range; s.angle = L.angle;
      R.setBeam(i, s, zone === 'in' || (G.round && G.round.time > 18 * 60));
    });
    // suits give off no light of their own: in the dark, a crewmate is only as visible as their flashlight
    const me2 = G.me();
    for (let i = -1; i < 2; i++) R.setGlow(i, null);
    // dust drifting through your flashlight beam
    R.updateDust(t, me2.alive && R.flash.intensity > 1 ? (zone === 'in' ? 1 : 0.5) : 0);
    // ambience: what this place sounds like right now
    const amb = { cam, storm: !!(G.round && G.round.weather === 'storm'), night: 0, buzz: 0 };
    if (!inSpace && zone === 'out' && G.ext) { amb.night = G.ext.lighting(G.round.time).night; amb.trees = G.ext.trees; amb.complex = G.ext.center; }
    if (!inSpace && zone === 'in' && G.fac) {
      let best = null, bd = 1e9;
      for (const l of G.fac.lamps) { if (l.state === 'off' || !(l.lit > 0.05)) continue; const d = (l.x - cam.x) ** 2 + (l.z - cam.z) ** 2; if (d < bd) { bd = d; best = l; } }
      if (best && bd < 81 && G.fac.los(cam.x, cam.z, best.x, best.z)) {
        const d = Math.sqrt(bd);
        amb.buzz = Math.pow(clamp(1 - d / 8, 0, 1), 1.4) * Math.min(1, best.lit) * (power || best.state === 'emergency' ? 1 : 0);
        if (best.state === 'flicker' && power) amb.flickerLamp = new THREE.Vector3(best.x, best.y, best.z);
      }
      if (G.fac._machine === undefined) { const p = G.fac.randomWalkable(R0, () => true); G.fac._machine = p ? new THREE.Vector3(p.x, G.fac.floorY(p.x, p.z) + 1.2, p.z) : null; }
      amb.machine = G.fac._machine;
    }
    if (G.ship.termPos) amb.console = G.ship.termPos;
    SFX.ambience(dt, amb);
  },
  director(dt) {
    const me = G.me(); if (!me) return;
    const cam = R.camera.position, d = G.dir;
    // fear from visible creatures
    let fear = 0, flicker = 0, chased = false;
    const camDir = R.camera.getWorldDirection(new THREE.Vector3());
    for (const m of G.monsters.values()) {
      if (m.dead || m.def.zone !== G.zoneOf(me)) continue;
      const c = m.center(), dist = c.distanceTo(cam);
      if (dist > 26) continue;
      const to = c.clone().sub(cam).normalize();
      const inView = camDir.dot(to) > 0.62;
      const los = me.zone !== 'in' || !G.fac || G.fac.los(cam.x, cam.z, c.x, c.z);
      const flashOn = R.flash.intensity > 0 && camDir.dot(to) > 0.9 && dist < R.flash.distance;
      const nearLamp = G.fac && me.zone === 'in' ? G.fac.nearestLampDist(c.x, c.z, G.round ? G.round.power : true) < 4.5 : me.zone === 'out' && dist < 18;
      const visible = inView && los && (dist < 6 || flashOn || nearLamp || (m.type === 'leech' && dist < 4)) && !(m.type === 'leech' && m.extra === me.id);
      const threat = m.state === 'charge' || m.state === 'chase' || m.state === 'lunge' || m.state === 'hunt';
      if (threat && dist < 16 && (m.extra === me.id || m.type === 'mannequin' || m.type === 'hound')) chased = true;
      if (visible) {
        fear = Math.max(fear, clamp(1 - dist / 22, 0, 1) + (threat ? 0.35 : 0.1));
        if (me.alive && G.now - (m.lastSting || -1e9) > 25000) { m.lastSting = G.now; SFX.play(dist < 5 ? 'stinger_hi' : 'stinger', null, { vol: 0.9, pitch: 0.85 + Math.random() * 0.3 }); }
      } else if (dist < 12 && los) fear = Math.max(fear, (1 - dist / 12) * 0.45);
      if (m.type === 'pale' && m.extra === me.id && dist < 13 && m.state === 'stalk') flicker = Math.max(flicker, 0.06 * (1 - dist / 13) + 0.02);
    }
    if (G.leechOn === me.id) fear = 1;
    if (me.alive && me.hp < 35) fear = Math.max(fear, 0.35);
    R.fx.fear = damp(R.fx.fear, me.alive ? clamp(fear, 0, 1) : 0, fear > R.fx.fear ? 3 : 0.4, dt);
    G.flicker = flicker + (R.fx.fear > 0.7 ? 0.01 : 0);
    // heartbeat
    d.beat -= dt;
    if (me.alive && R.fx.fear > 0.3 && d.beat <= 0) { d.beat = lerp(1.05, 0.38, R.fx.fear); SFX.play('heartbeat', null, { vol: R.fx.fear * 0.9 }); }
    // post fx decay
    R.fx.damage = damp(R.fx.damage, 0, 2.5, dt);
    R.fx.flash = damp(R.fx.flash, 0, 1.4, dt);
    R.fx.lowhp = me.alive && me.hp < 30 ? 1 - me.hp / 30 : 0;
    R.fx.health = damp(R.fx.health, me.alive ? me.hp / 100 : 0, me.alive ? 2.5 : 1.2, dt);
    // adrenaline: a silent burst of speed and breath while something is running you down
    G.adrenaline = chased && me.alive ? 2.5 : Math.max(0, (G.adrenaline || 0) - dt);
    R.fx.leech = damp(R.fx.leech, G.leechOn === me.id && me.alive ? 1 : 0, 6, dt);
    SFX.setMuffle(R.fx.leech * 0.85 + (me.alive ? 0 : 0.3));
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
          const p = G.fac.randomWalkable(R0, (q) => { const dd = Math.hypot(q.x - me.pos.x, q.z - me.pos.z); return near ? dd > 3 && dd < 9 : dd > 12 && dd < 34; });
          pos = p ? new THREE.Vector3(p.x, G.fac.floorY(p.x, p.z) + (pick === 'knock' ? 1.2 : 2), p.z) : null;
        }
        if (pos) SFX.play(pick, pos, { vol: pick === 'scream' ? 0.5 : pick === 'whisper' ? 0.35 : 0.9, rev: 0.7 });
        if (pick === 'groan' || pick === 'metal_bang') Player.addShake(0.08);
      }
    } else if (me.zone === 'out' && G.round && G.round.time > 19 * 60) {
      d.howl -= dt;
      if (d.howl <= 0) { d.howl = 35 + Math.random() * 60; const a = Math.random() * TAU; SFX.play('howl', new THREE.Vector3(cam.x + Math.cos(a) * 70, cam.y + 5, cam.z + Math.sin(a) * 70), { vol: 1.4, ref: 30, rev: 0.4 }); }
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
    HUD.voice(G.online && Voice.enabled ? (Voice.talking ? (me.radio ? '((( RADIO )))' : '(( MIC ))') : '') : '');
    HUD.update(dt);
  },
};
