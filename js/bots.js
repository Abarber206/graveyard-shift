'use strict';
// Crew bots: robot crewmates the host's game works, called aboard from the chat (/add bot). To everything else a bot is
// an ordinary crewmate: it shows on the crew cams and the map, creatures hunt it, it can die or be left behind, and the
// scrap it brings in counts. Only its feet are worked from here instead of by a person. Once the ship is down it walks
// out through the airlock, down the ramp and along the trail to the plant, goes in at the front door with its shoulder
// lamp on, and searches the floors for scrap (opening lockers as it goes). With its hands full, or the night getting on,
// it carries the lot back up the ramp and sets it down in the bay. It runs from anything that comes for it, fights a
// leech off its head, and says the odd word to whoever's near enough to hear.
// Commands (anyone aboard can give them, in the chat): /add bot [how many], /remove bot [how many | all],
// /bots return (come back aboard and wait), /bots work (back to it), /bots (the list).
const Bots = (() => {
  const B = {};
  const brains = new Map();
  const RAD = 0.32, WALK = 3.4, RUN = 6.0, MAX_CREW = 6;
  const DX = (SHIP.doorX0 + SHIP.doorX1) / 2, HULL_Z = 4.05;
  // the way through the ship: the bay aisle, inside the inner door, the airlock, the sill, the ramp, the foot of the ramp
  const SHIPWAY = [{ x: DX, z: 1.3, tol: 0.4 }, { x: DX, z: 2.15, tol: 0.3 }, { x: DX, z: 3.3, tol: 0.3 }, { x: DX, z: 4.3, tol: 0.35 }, { x: DX, z: 5.3, tol: 0.5 }, { x: DX, z: 7.7, tol: 0.9 }];
  const rng = new RNG((Math.random() * 1e9) | 0);
  const isBot = (p) => !!(p && p.bot);
  const bots = () => [...G.players.values()].filter(isBot);
  const humansAlive = () => G.alivePlayers().some((p) => !p.bot);
  const tell = (pid, text) => G.sendTo(pid, { t: 'ev', e: { e: 'chat', text, sys: true } });
  // said out loud: it hangs over its head and reaches whoever is in earshot (never chattering)
  const say = (p, b, text, gap = 8000) => { if (!p.alive || G.now - (b.saidT || -1e9) < gap) return; b.saidT = G.now; G.emit({ e: 'chat', pid: p.id, text }); };
  const carrying = (p) => p.slots.some((id) => id != null && G.items.get(id));
  const handsFull = (p) => p.slots.every((id) => id != null) || p.slots.some((id) => { const it = id != null && G.items.get(id); return it && ITEMS[it.type].twoHanded; });
  const weight = (p) => p.slots.reduce((s, id) => { const it = id != null && G.items.get(id); return s + (it ? ITEMS[it.type].weight || 0 : 0); }, 0);
  function fresh() {
    return { state: 'aboard', route: null, ri: 0, path: null, pathT: 0, pathGoal: null, target: null, box: null, goal: null, known: new Set(), boxes: new Set(), skip: new Set(), seen: new Set(),
      scanT: 0, cells: null, lastFind: G.now, mv: 0, trying: false, progT: 0, stuck: 0, side: null, dodge: null, watch: null, key: null, bestD: 0, bestT: 0, routeId: 0, flee: null, threatT: 0, recall: false, done: false, waitUntil: 0, mashT: 0, hatch: null, gateT: 0, dropT: 0, spots: null, saidT: -1e9, late: false };
  }
  const brain = (p) => { let b = brains.get(p.id); if (!b) { b = fresh(); brains.set(p.id, b); } return b; };
  // how long (ms) it has gone without getting any closer to what it's after (key: what that is)
  function slow(b, key, d) {
    if (b.key !== key) { b.key = key; b.bestD = d; b.bestT = G.now; }
    else if (d < b.bestD - 0.5) { b.bestD = d; b.bestT = G.now; }
    return G.now - b.bestT;
  }
  let routes = 0;
  const setRoute = (b, R) => { b.route = R; b.ri = 0; b.routeId = ++routes; };

  // ---------------- the crew roster ----------------
  function nextName() { const used = new Set(bots().map((p) => p.name)); for (let n = 1; ; n++) if (!used.has('Bot ' + n)) return 'Bot ' + n; }
  function remember() { if (!G.run) return; G.run.bots = bots().map((p) => ({ name: p.name, color: p.color })); if (G.mode === 'orbit') G.save(); }
  // a new bot stands up in the bay, ready for work (aboard and alive, even partway through a day)
  B.spawn = (name, color) => {
    const id = G.nextPid++, idx = G.players.size;
    const x = 1 + (idx % 3) * 1.1, z = 0.6 + Math.floor(idx / 3) * 1.0;
    G.emit({ e: 'join', p: { id, name: name || nextName(), color: color ?? G.distinctSuit((Math.random() * 1e3) | 0), peerId: null, bot: true, x, y: 0, z, yaw: -Math.PI / 2, alive: true, hp: 100, zone: 'out' } });
    brains.set(id, fresh());
    return G.players.get(id);
  };
  B.remove = (pid) => { const p = G.players.get(pid); if (!isBot(p)) return; brains.delete(pid); G.hostPlayerLeft(pid); };
  // the crew is full and a person wants in: the newest bot steps aside for them
  B.makeRoom = () => { const p = bots().pop(); if (!p) return false; B.remove(p.id); remember(); return true; };
  // bots kept with a saved run come back with it
  B.restore = () => { for (const s of (G.run && G.run.bots) || []) if (G.players.size < MAX_CREW) B.spawn(s.name, s.color); };
  B.reset = () => brains.clear();
  // back in orbit: everyone is aboard again, with a fresh night ahead
  B.newDay = () => { for (const [id, b] of brains) { const n = fresh(); n.recall = b.recall; brains.set(id, n); } };

  // ---------------- chat commands ----------------
  const HELP = ['Crew bot commands:', '/add bot [how many]: call bots aboard (up to 6 crew in all)', '/remove bot [how many | all]: send bots away',
    '/bots return: bring them back aboard to wait', '/bots work: send them back out scavenging'];
  B.command = (pid, text) => {
    const w = text.trim().toLowerCase().replace(/^\/+/, '').split(/\s+/), n = parseInt(w[2], 10);
    if ((w[0] === 'add' || w[0] === 'spawn') && /^bots?$/.test(w[1] || '')) {
      const want = clamp(Number.isFinite(n) ? n : 1, 1, MAX_CREW - 1), room = MAX_CREW - G.players.size;
      if (room <= 0) { tell(pid, 'The crew is full (6 at most). /remove bot to make room.'); return; }
      const made = [];
      for (let i = 0; i < Math.min(want, room); i++) made.push(B.spawn());
      G.emit({ e: 'chat', text: made.map((p) => p.name).join(', ') + ' joined the crew.', sys: true });
      if (want > room) tell(pid, 'Only room for ' + room + ' more (6 crew at most).');
      made.forEach((p, i) => G.timers.push({ t: 0.8 + i * 0.6, fn: () => { if (G.players.get(p.id)) say(p, brain(p), 'Reporting for the night shift.'); } }));
      remember();
      return;
    }
    if ((w[0] === 'remove' || w[0] === 'kick' || w[0] === 'delete') && /^bots?$/.test(w[1] || '')) {
      const list = bots(); if (!list.length) { tell(pid, 'There are no bots aboard.'); return; }
      const k = w[2] === 'all' ? list.length : clamp(Number.isFinite(n) ? n : 1, 1, list.length);
      for (const p of list.slice(-k)) B.remove(p.id);
      remember();
      return;
    }
    if (w[0] === 'bots' || w[0] === 'bot') {
      const list = bots();
      if (/^(return|back|home|stay|stop|wait|come)$/.test(w[1] || '')) {
        if (!list.length) { tell(pid, 'There are no bots aboard.'); return; }
        for (const p of list) { const b = brain(p); b.recall = true; if (p.alive && !G.inShip(p)) say(p, b, 'On my way back.', 0); }
        tell(pid, 'Bots: heading back to the ship.');
        return;
      }
      if (/^(work|go|scavenge|resume|start)$/.test(w[1] || '')) {
        if (!list.length) { tell(pid, 'There are no bots aboard.'); return; }
        for (const p of list) { const b = brain(p); b.recall = false; b.done = false; b.waitUntil = 0; }
        tell(pid, 'Bots: back to work.');
        return;
      }
    }
    for (const l of HELP) tell(pid, l);
  };

  // ---------------- moving about ----------------
  // the world pushes back on a bot exactly as it does on anyone (walls, props, doors, the ship, the rover)
  function settle(p, ox, oz) {
    if (p.zone === 'in' && G.fac) {
      const f = G.fac;
      f.collide(p.pos, RAD); f.collide(p.pos, RAD);
      if (!f.floorAt(f.ti(p.pos.x), f.tj(p.pos.z))) {
        if (f.floorAt(f.ti(ox), f.tj(oz))) { p.pos.x = ox; p.pos.z = oz; }
        else { const t = f.nearestWalkable(f.ti(p.pos.x), f.tj(p.pos.z)); if (t) { p.pos.x = f.cx(t[0]); p.pos.z = f.cz(t[1]); } }
      }
      p.pos.y = f.floorY(p.pos.x, p.pos.z, p.pos.y);
      return;
    }
    const shipHere = !G.ship.airborne || G.playerAboard(p);
    if (G.ext && G.mode !== 'orbit' && !(G.ship.airborne && shipHere)) G.ext.collide(p.pos, RAD);
    if (shipHere) G.ship.collide(p.pos, RAD);
    Rover.push(p.pos, 0.3, p.zone);
    p.pos.y = G.groundAt(p.pos.x, p.pos.z, !shipHere);
  }
  // one stride toward (tx, tz): turn toward it (or keep facing `face`), walk, and let the world push back
  function step(p, b, tx, tz, speed, dt, face) {
    const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.03) return d;
    b.trying = true;
    const w = b.watch != null && G.monsters.get(b.watch);
    if (face == null && w && !w.dead && Math.hypot(w.pos.x - p.pos.x, w.pos.z - p.pos.z) < 16) face = Math.atan2(-(w.pos.x - p.pos.x), -(w.pos.z - p.pos.z));
    p.yaw += clamp(angDiff(p.yaw, face != null ? face : Math.atan2(-dx, -dz)), -7 * dt, 7 * dt);
    let s = Math.min(d, speed * clamp(1 - weight(p) / 110, 0.45, 1) * dt);
    const x0 = p.pos.x, z0 = p.pos.z;
    // (in short strides, so a slow frame can't carry it through a thin wall)
    while (s > 1e-4) { const k = Math.min(s, 0.15), ox = p.pos.x, oz = p.pos.z; p.pos.x += (dx / d) * k; p.pos.z += (dz / d) * k; settle(p, ox, oz); s -= k; }
    const moved = Math.hypot(p.pos.x - x0, p.pos.z - z0);
    b.mv += moved;
    if (moved > 0.3 * dt) { p.moving = true; p.sprint = speed > WALK + 0.5; }
    return Math.hypot(tx - p.pos.x, tz - p.pos.z);
  }
  // making no headway for a while: step aside for a moment, and after that give up on where it was going
  function watchProgress(p, b, dt) {
    if (!b.progP) b.progP = p.pos.clone();
    b.progT += dt;
    if (b.progT < 1) return;
    // (how far it actually got, not how much it shuffled: pressed against a door frame it jiggles on the spot)
    const got = Math.hypot(p.pos.x - b.progP.x, p.pos.z - b.progP.z);
    if (b.trying && got < 0.35) b.stuck++; else b.stuck = 0;
    b.progT = 0; b.mv = 0; b.trying = false; b.progP.copy(p.pos);
    if (b.stuck >= 2 && !b.side) b.side = { t: 0.8, a: p.yaw + (rng.next() < 0.5 ? 1 : -1) * (Math.PI / 2 + rng.range(-0.4, 0.4)) };
  }
  function sidestep(p, b, dt) {
    if (!b.side) return false;
    b.side.t -= dt;
    step(p, b, p.pos.x - Math.sin(b.side.a), p.pos.z - Math.cos(b.side.a), WALK, dt);
    if (b.side.t <= 0) b.side = null;
    return true;
  }
  // through the facility the way the creatures go: along the corridors, down the stairwells, opening doors on the way
  function walkIn(p, b, gx, gz, gy, speed, dt, face) {
    const fac = G.fac; if (!fac) return -1;
    b.pathT -= dt;
    if (!b.path || b.pathT <= 0 || !b.pathGoal || Math.hypot(b.pathGoal.x - gx, b.pathGoal.z - gz) > 1) {
      const path = fac.findPath(p.pos.x, p.pos.z, gx, gz, false, p.pos.y, gy);
      if (!path) { b.path = null; return -1; }
      b.path = path; b.pathGoal = { x: gx, z: gz }; b.pathT = 1.5 + rng.next();
    }
    while (b.path.length > 1 && Math.hypot(b.path[0].x - p.pos.x, b.path[0].z - p.pos.z) < 0.45) b.path.shift();
    const wp = b.path[0];
    let tx = wp.x, tz = wp.z;
    // a doorway the straight line to the next waypoint goes through: open it if it's shut, square up to it, then
    // straight through the middle (cutting the corner, it wedges on the jamb or the open door)
    for (const d of fac.doors) {
      if (Math.abs(d.x - p.pos.x) > 2.6 || Math.abs(d.z - p.pos.z) > 2.6 || Math.abs(d.y - p.pos.y) > 1) continue;
      const s1 = (p.pos.x - d.x) * d.nx + (p.pos.z - d.z) * d.nz, s2 = (wp.x - d.x) * d.nx + (wp.z - d.z) * d.nz;
      if (s1 * s2 >= 0) continue;   // (the waypoint is on this side: nothing to go through)
      const u = s1 - s2 ? clamp(s1 / (s1 - s2), 0, 1) : 0, cx = p.pos.x + (wp.x - p.pos.x) * u, cz = p.pos.z + (wp.z - p.pos.z) * u;
      if (Math.abs((cx - d.x) * -d.nz + (cz - d.z) * d.nx) > 1.2) continue;
      if (!d.open && !d.broken && Math.hypot(d.x - p.pos.x, d.z - p.pos.z) < 2) G.hostRequest(p.id, { a: 'door', id: d.id });
      const lat = (p.pos.x - d.x) * -d.nz + (p.pos.z - d.z) * d.nx, side = Math.sign(s1);
      // (an open leaf on this side stands out 1.5 m from the hinge jamb: line up beyond its end, and from behind it,
      // back out past its end first)
      const leaf = d.open && !d.broken && d.dir === side && d.anim > 0.5, out = leaf ? 2.1 : 1.0;
      let L = 0, S = -side * 1.3;
      if (leaf && lat < -0.6 && Math.abs(s1) < 1.95) { L = lat; S = side * out; }
      else if (Math.abs(lat) > 0.14 && Math.abs(s1) > 0.35 && b.stuck < 1) S = side * out;
      tx = d.x + d.nx * S - d.nz * L; tz = d.z + d.nz * S + d.nx * L;
      break;
    }
    step(p, b, tx, tz, speed, dt, face);
    return Math.hypot(gx - p.pos.x, gz - p.pos.z);
  }
  function teleport(p, zone, x, y, z, yaw) {
    p.zone = zone; p.pos.set(x, y, z); p.yaw = yaw; p.buf.length = 0; p.rpos.copy(p.pos);
    G.emitSound('door_open', new THREE.Vector3(x, y + 1, z), { vol: 0.7 });
  }

  // ---------------- outside: the ship and the trail ----------------
  const trail = () => (G.ext && G.ext.path) || [];
  const frontDoor = () => G.ext && G.ext.interact.find((o) => o.kind === 'enter' && o.which === 'main');
  function nearestTrail(x, z) { const T = trail(); let bi = 0, bd = Infinity; T.forEach((q, i) => { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; bi = i; } }); return bi; }
  const onShip = (p) => p.zone === 'out' && G.ship.onFootprint(p.pos.x, p.pos.z) && p.pos.z < HULL_Z + 0.3;
  const onRamp = (p) => p.zone === 'out' && G.ship.rampAt(p.pos.x, p.pos.z) != null;
  // On some sites the trail's first stretch runs right under the ship. Nobody can walk under it (outside, its
  // footprint is as solid as its hull), so outdoors a bot goes round it by the tail or the nose, as people do.
  const HB = { x0: -20.3, x1: 14.2, z0: -6.3, z1: 6.3 };   // (the hull is solid out to x -19..13, |z| 6; a stride clear of that)
  const CORNERS = [{ x: HB.x0, z: HB.z0 }, { x: HB.x1, z: HB.z0 }, { x: HB.x1, z: HB.z1 }, { x: HB.x0, z: HB.z1 }];
  const underShip = (q) => q.x > HB.x0 && q.x < HB.x1 && q.z > HB.z0 && q.z < HB.z1;
  // does the straight line a-b pass under the ship? (running along the edge of its box doesn't count)
  function crosses(a, b) {
    const e = 0.05, dx = b.x - a.x, dz = b.z - a.z; let t0 = 0, t1 = 1;
    for (const [k, q] of [[-dx, a.x - HB.x0 - e], [dx, HB.x1 - e - a.x], [-dz, a.z - HB.z0 - e], [dz, HB.z1 - e - a.z]]) {
      if (Math.abs(k) < 1e-9) { if (q < 0) return false; continue; }
      const r = q / k;
      if (k < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t0 < t1;
  }
  // the shortest way from a to b round the ship's corners (a little graph: a, the four corners, b)
  function around(a, b) {
    if (!crosses(a, b)) return [];
    const N = [a, ...CORNERS, b], dist = N.map(() => Infinity), prev = N.map(() => -1), done = N.map(() => false);
    dist[0] = 0;
    for (;;) {
      let u = -1; for (let i = 0; i < N.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity || u === N.length - 1) break;
      done[u] = true;
      for (let v = 0; v < N.length; v++) {
        if (done[v] || crosses(N[u], N[v])) continue;
        const d = dist[u] + Math.hypot(N[u].x - N[v].x, N[u].z - N[v].z); if (d < dist[v]) { dist[v] = d; prev[v] = u; }
      }
    }
    const out = []; for (let v = prev[N.length - 1]; v > 0; v = prev[v]) out.unshift({ x: N[v].x, z: N[v].z, tol: 1.3 });
    return out;
  }
  // outdoor waypoints onto a route: any under the ship left out, and the way round it put in between
  function outdoors(R, pts, from) {
    for (const q of pts) {
      if (underShip(q)) continue;
      const last = R.length ? R[R.length - 1] : from;
      R.push(...around(last, q), q);
    }
  }
  // out of the ship (from wherever it is aboard), down the trail, up to the plant's front door
  function outRoute(p) {
    const R = [], aboard = onShip(p) || onRamp(p);
    if (aboard) for (const w of SHIPWAY) { if (w.z > p.pos.z - 0.2) R.push(w); }
    const T = trail(), i0 = aboard ? 0 : nearestTrail(p.pos.x, p.pos.z), pts = [];
    for (let i = i0; i < T.length; i++) pts.push({ x: T[i].x, z: T[i].z, tol: 1.8 });
    const sp = G.ext.entrance.spawn, fd = frontDoor();
    pts.push({ x: sp.x, z: sp.z, tol: 0.9 });
    if (fd) pts.push({ x: fd.x, z: fd.z, tol: 1.2 });
    outdoors(R, pts, { x: p.pos.x, z: p.pos.z });
    return R;
  }
  // back along the trail from wherever it is outside, up the ramp and in
  function homeRoute(p) {
    const R = [], foot = SHIPWAY[SHIPWAY.length - 1];
    if (onShip(p) || onRamp(p)) { for (let i = SHIPWAY.length - 1; i >= 0; i--) { const w = SHIPWAY[i]; if (w.z < p.pos.z + 0.2) R.push(w); } return R; }
    const T = trail(), i0 = nearestTrail(p.pos.x, p.pos.z), pts = [];
    for (let i = i0; i >= 0; i--) pts.push({ x: T[i].x, z: T[i].z, tol: 1.8 });
    pts.push(foot);
    outdoors(R, pts, { x: p.pos.x, z: p.pos.z });
    for (let i = SHIPWAY.length - 2; i >= 0; i--) R.push(SHIPWAY[i]);
    return R;
  }
  // the hatch and the airlock's inner door: a bot opens a shut door on its way through (and shuts the hatch again
  // behind it if it found it shut: someone closed it for a reason)
  function gate(p, b, w) {
    const near = Math.abs(p.pos.x - DX) < 1.6;
    const across = (zz) => near && (p.pos.z - zz) * (w.z - zz) < 0 && Math.abs(p.pos.z - zz) < 2.6;
    if (across(HULL_Z)) {
      if (!G.ship.door.open) {
        if (G.now - b.gateT > 1500) { b.gateT = G.now; G.hostRequest(p.id, { a: 'hatch' }); if (G.ship.door.open) b.hatch = { side: Math.sign(w.z - HULL_Z) }; }
        return false;
      }
      if (G.ship.door.t < 0.6) return false;
    }
    if (across(AIRLOCK.z0)) {
      if (!G.ship.idoor.open) { if (!G.ship.lockCycling && G.now - b.gateT > 1500) { b.gateT = G.now; G.hostRequest(p.id, { a: 'idoor' }); } return false; }
      if (G.ship.idoor.t < 0.6) return false;
    }
    return true;
  }
  function closeBehind(p, b) {
    if (!b.hatch || (p.pos.z - HULL_Z) * b.hatch.side < 1.4) return;
    const crowd = G.alivePlayers().some((q) => q.id !== p.id && q.zone === 'out' && Math.hypot(q.pos.x - DX, q.pos.z - HULL_Z) < 3);
    if (G.ship.door.open && !crowd && G.mode === 'site') G.hostRequest(p.id, { a: 'hatch' });
    b.hatch = null;
  }
  function follow(p, b, speed, dt) {
    const R = b.route; if (!R) return true;
    while (b.ri < R.length) {
      const w = R[b.ri];
      const key = 'r' + b.routeId + ':' + b.ri;
      if (!gate(p, b, w)) { p.yaw += clamp(angDiff(p.yaw, Math.atan2(-(w.x - p.pos.x), -(w.z - p.pos.z))), -5 * dt, 5 * dt); b.key = null; b.trying = false; return false; }
      const d = step(p, b, w.x, w.z, speed, dt);
      closeBehind(p, b);
      if (d < (w.tol || 1)) { b.ri++; continue; }
      // can't get to this one: it's close enough to the next, carry on to that
      if (slow(b, key, d) > 6000 && b.ri < R.length - 1) b.ri++;
      return false;
    }
    return true;
  }

  // ---------------- inside: finding scrap ----------------
  const cell = (fac, x, z, y) => Math.floor(x / 7) + ',' + Math.floor(z / 7) + ',' + Math.round(fac.depthOfY(y));
  const wanted = (it) => { const D = ITEMS[it.type]; return D.kind === 'scrap' && !D.core && it.holder == null && it.basket == null && G.itemZone(it) === 'in' && !G.itemSealed(it); };
  // a look round, like a scan of its own: scrap out in the open within sight on this floor, and shut lockers
  function scan(p, b) {
    const fac = G.fac;
    for (const it of G.items.values()) {
      if (b.known.has(it.id) || b.skip.has(it.id) || !wanted(it)) continue;
      const d = Math.hypot(it.pos.x - p.pos.x, it.pos.z - p.pos.z);
      if (d > 22 || Math.abs(it.pos.y - p.pos.y) > 3) continue;
      if (d < 3.5 || fac.los(p.pos.x, p.pos.z, it.pos.x, it.pos.z, true)) b.known.add(it.id);
    }
    for (const c of fac.containers) {
      if (c.open || b.boxes.has(c.id) || b.skip.has('c' + c.id) || Math.abs(c.y - p.pos.y) > 3) continue;
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z); if (d > 14) continue;
      // (it stands against a wall: look at the floor just in front of it)
      const fx = c.x + (p.pos.x - c.x) * (0.9 / (d || 1)), fz = c.z + (p.pos.z - c.z) * (0.9 / (d || 1));
      if (d < 4 || fac.los(p.pos.x, p.pos.z, fx, fz, true)) b.boxes.add(c.id);
    }
  }
  function claimed(p) { const s = new Set(); for (const [id, o] of brains) if (id !== p.id && o.target != null) s.add(o.target); return s; }
  function pickTarget(p, b) {
    const taken = claimed(p); let best = null, bd = Infinity;
    for (const id of b.known) {
      const it = G.items.get(id);
      if (!it || !wanted(it)) { b.known.delete(id); continue; }
      // (a two-handed find waits until its hands are empty)
      if (taken.has(id) || (ITEMS[it.type].twoHanded && carrying(p))) continue;
      const d = Math.hypot(it.pos.x - p.pos.x, it.pos.z - p.pos.z) + Math.abs(it.pos.y - p.pos.y) * 4;
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  function pickBox(p, b) {
    let best = null, bd = Infinity;
    for (const id of b.boxes) {
      const c = G.fac.containers[id];
      if (!c || c.open) { b.boxes.delete(id); continue; }
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z) + Math.abs(c.y - p.pos.y) * 4;
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  // somewhere it hasn't been yet, not too far off; once most of this floor has been covered, the floors below it
  // (they were never stripped, so the scrap down there is worth more)
  function exploreGoal(p, b) {
    const fac = G.fac, here = Math.round(fac.depthOfY(p.pos.y));
    if (!b.cells) {
      b.cells = new Map();
      for (let k = 0; k < fac.grid.length; k++) { const i = k % fac.W, j = Math.floor(k / fac.W); if (fac.walkable(i, j)) b.cells.set(cell(fac, fac.cx(i), fac.cz(j), fac.tileY(k)), Math.max(0, fac.lvl[k])); }
    }
    const total = {}, seen = {};
    for (const [key, lv] of b.cells) { total[lv] = (total[lv] || 0) + 1; if (b.seen.has(key)) seen[lv] = (seen[lv] || 0) + 1; }
    const covered = (lv) => (seen[lv] || 0) / (total[lv] || 1) > 0.55;
    let best = null, bs = Infinity;
    for (let t = 0; t < 60; t++) {
      const q = fac.randomWalkable(rng); if (!q) break;
      const k = fac.idx(q.i, q.j), y = fac.tileY(k), lv = Math.max(0, fac.lvl[k]), d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z);
      if (d < 8 && lv === here) continue;
      let s = d * rng.range(0.6, 1.4) + (b.seen.has(cell(fac, q.x, q.z, y)) ? 80 : 0) + Math.abs(lv - here) * 6;
      if (lv !== here && covered(here) && !covered(lv)) s -= 60;
      if (s < bs) { bs = s; best = { x: q.x, z: q.z, y }; }
    }
    return best;
  }
  function grab(p, b, it) {
    const slot = p.slots[p.sel] == null ? p.sel : p.slots.indexOf(null);
    if (slot < 0) return;
    G.hostRequest(p.id, { a: 'pick', item: it.id, slot });
    if (it.holder !== p.id) { b.skip.add(it.id); return; }
    p.sel = slot; b.known.delete(it.id); b.lastFind = G.now;
    if (it.value >= 70) say(p, b, 'Found a ' + ITEMS[it.type].name.toLowerCase() + '!', 15000);
  }

  // ---------------- danger ----------------
  function threat(p) {
    let best = null, bd = Infinity;
    for (const m of G.monsters.values()) {
      if (m.dead || m.def.zone !== p.zone || m.stun > 0) continue;
      // (a leech up on the ceiling can't be seen; one that's dropped can)
      if (m.type === 'leech' && m.state !== 'fallen') continue;
      const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
      if (d > (m.type === 'mannequin' ? 14 : p.zone === 'in' ? 8 : 20) || Math.abs(m.pos.y - p.pos.y) > 3) continue;
      if (p.zone === 'in' && d > 2.5 && !G.fac.los(p.pos.x, p.pos.z, m.pos.x, m.pos.z, true)) continue;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  // is it coming for this one (or right on top of it)?
  const CALM = new Set(['roam', 'wander', 'lurk', 'crawl', 'wait', 'idle']);
  const hunting = (m, p) => (m.target === p.id && !CALM.has(m.state)) || Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 4;
  // a crawler charges dead straight and turns slowly: out of its line, sideways, is the way to live
  function dodge(p, m) {
    const f = m.forward(), side = Math.sign((p.pos.x - m.pos.x) * f.z - (p.pos.z - m.pos.z) * f.x) || 1, fac = G.fac;
    for (const s of [side, -side]) for (const r of [2.6, 1.6]) {
      const x = p.pos.x + f.z * s * r, z = p.pos.z - f.x * s * r;
      if (fac.walkable(fac.ti(x), fac.tj(z)) && fac.los(p.pos.x, p.pos.z, x, z)) return { x, z, until: G.now + 650 };
    }
    return null;
  }
  // somewhere on this floor, a good way off and away from it
  function fleeGoal(p, m) {
    const fac = G.fac, ax = p.pos.x - m.pos.x, az = p.pos.z - m.pos.z, al = Math.hypot(ax, az) || 1;
    let best = null, bs = -Infinity;
    for (let t = 0; t < 40; t++) {
      const q = fac.randomWalkable(rng); if (!q) break;
      const dx = q.x - p.pos.x, dz = q.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 7 || d > 32 || Math.abs(fac.tileY(fac.idx(q.i, q.j)) - p.pos.y) > 2) continue;
      const s = (dx * ax + dz * az) / (d * al) + Math.min(d, 20) / 40;
      if (s > bs) { bs = s; best = { x: q.x, z: q.z }; }
    }
    return best;
  }
  const leechOn = (p) => [...G.monsters.values()].find((m) => m.type === 'leech' && m.state === 'attached' && m.victim === p.id);

  // ---------------- the brain ----------------
  function think(p, b, dt) {
    p.moving = false; p.sprint = false;
    p.flash = p.zone === 'in' ? 1 : 0;
    p.pitch = damp(p.pitch, b.look || 0, 4, dt); b.look = 0;
    if (!p.alive) return;
    watchProgress(p, b, dt);
    // a leech on its head: it stops and tears at it until it lets go
    if (leechOn(p)) {
      say(p, b, 'Get it off me!', 6000);
      b.mashT -= dt; if (b.mashT <= 0) { b.mashT = 0.15 + rng.next() * 0.1; G.hostRequest(p.id, { a: 'struggle' }); }
      return;
    }
    const site = (G.mode === 'site' || G.mode === 'leaving') && G.round && G.ext;
    const aboard = G.inShip(p);
    // in orbit, coming down or lifting off: aboard, it stands by
    if (!site || (G.flight && aboard)) { b.state = aboard || !site ? 'aboard' : b.state; standBy(p, b, dt); return; }
    const t = G.round.time, leaving = G.mode === 'leaving';
    const recall = b.recall || leaving || t >= 22 * 60 || !humansAlive();
    if (recall && !b.recall && !b.late && !aboard) { b.late = true; say(p, b, leaving ? 'Wait for me!' : !humansAlive() ? 'Heading back to the ship.' : 'Getting late. Heading back.', 0); }
    const hurry = leaving || t >= 23 * 60;
    // something coming: run (inside, away from it; outside, back to the ship)
    b.threatT -= dt;
    if (b.threatT <= 0) {
      b.threatT = b.flee || b.watch != null ? 0.1 : 0.25;
      const m = threat(p), w = b.watch != null && G.monsters.get(b.watch);
      if (!w || w.dead || p.zone !== 'in' || Math.hypot(w.pos.x - p.pos.x, w.pos.z - p.pos.z) > 16 || !G.fac.los(p.pos.x, p.pos.z, w.pos.x, w.pos.z, true)) b.watch = null;
      // a mannequin only moves while nobody's watching: no running from it, just eyes on it all the way past
      if (m && m.type === 'mannequin' && p.zone === 'in') { b.watch = m.id; if (b.flee && b.flee.m === m.id) b.flee = null; }
      else if (m) {
        if (p.zone === 'in') {
          const hunted = hunting(m, p);
          // (out of the way at the last moment, once it's committed and close: any sooner and it just turns after it)
          if (m.type === 'crawler' && m.state === 'charge' && m.target === p.id && !b.dodge) {
            const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, dd = Math.hypot(dx, dz), f = m.forward();
            if (dd < 5.5 && (dx * f.x + dz * f.z) / (dd || 1) > 0.7) b.dodge = dodge(p, m);
          }
          if (!b.flee || b.flee.m !== m.id || G.now > b.flee.until - 2000 || (hunted && !b.flee.run)) { const g = fleeGoal(p, m); if (g) { b.flee = { m: m.id, until: G.now + (hunted ? 4000 : 2500), goal: g, run: hunted }; b.path = null; } }
          if (hunted) say(p, b, 'Something\'s down here!', 20000);
        } else if (aboard) b.waitUntil = Math.max(b.waitUntil, G.now + 30000);
        else if (b.state === 'out') {
          say(p, b, 'Back to the ship!', 20000);
          b.state = 'home'; setRoute(b, homeRoute(p)); b.waitUntil = G.now + 30000;
        }
      }
    }
    if (b.flee && (G.now > b.flee.until || p.zone !== 'in')) b.flee = null;
    if (b.dodge) {
      if (G.now > b.dodge.until || p.zone !== 'in') b.dodge = null;
      else { step(p, b, b.dodge.x, b.dodge.z, RUN, dt); return; }
    }
    if (sidestep(p, b, dt)) return;
    if (b.flee) {
      const r = walkIn(p, b, b.flee.goal.x, b.flee.goal.z, undefined, b.flee.run ? RUN : WALK, dt);
      if (r < 1.5 || r < 0) b.flee = null;
      return;
    }
    switch (b.state) {
      case 'aboard': {
        if (!aboard && !onShip(p) && !onRamp(p)) { b.state = 'home'; setRoute(b, homeRoute(p)); break; }
        const go = !recall && !b.done && G.now > b.waitUntil && p.hp >= 80 && !G.flight && t < 21.5 * 60 && G.mode === 'site';
        if (go) { b.state = 'out'; setRoute(b, outRoute(p)); b.late = false; break; }
        standBy(p, b, dt);
        break;
      }
      case 'out': {
        if (p.zone === 'in') { b.state = 'search'; break; }
        if (recall) { b.state = 'home'; setRoute(b, homeRoute(p)); break; }
        if (follow(p, b, WALK, dt)) {
          // in at the front door
          const ex = G.fac.exits.find((e) => e.kind === 'main') || G.fac.exits[0];
          teleport(p, 'in', ex.spawn.x, FAC_Y0, ex.spawn.z, ex.spawn.yaw);
          b.state = 'search'; b.path = null; b.target = null; b.box = null; b.goal = null; b.scanT = 0.3; b.lastFind = G.now;
        }
        break;
      }
      case 'search': {
        if (p.zone !== 'in') { b.state = 'home'; setRoute(b, homeRoute(p)); break; }
        const has = carrying(p), idle = G.now - b.lastFind;
        if (!has && idle > 150000) b.done = true;
        if (handsFull(p) || recall || b.done || p.hp < 45 || (has && (t >= 21.5 * 60 || idle > 90000))) {
          if (handsFull(p)) say(p, b, 'Hands full. Taking this back.', 30000);
          else if (p.hp < 45) say(p, b, 'I\'m hurt. Heading back.', 30000);
          b.state = 'exit'; b.path = null; b.target = null; b.box = null;
          break;
        }
        b.seen.add(cell(G.fac, p.pos.x, p.pos.z, p.pos.y));
        b.scanT -= dt; if (b.scanT <= 0) { b.scanT = 1.2; scan(p, b); }
        // after something it's spotted, then a shut locker, then wherever it hasn't been
        if (b.target != null) {
          const it = G.items.get(b.target);
          if (!it || !wanted(it)) { b.target = null; break; }
          const d = Math.hypot(it.pos.x - p.pos.x, it.pos.z - p.pos.z);
          if (d < 3) b.look = clamp(Math.atan2(it.pos.y - (p.pos.y + 1.5), d), -1, 0.4);
          const lag = slow(b, 'i' + it.id, d);
          if ((d < 1.4 || (d < 2.6 && lag > 1500)) && Math.abs(it.pos.y - p.pos.y) < 2.5) { grab(p, b, it); b.target = null; break; }
          if (walkIn(p, b, it.pos.x, it.pos.z, it.pos.y, WALK, dt) < 0 || lag > 8000) { b.skip.add(it.id); b.known.delete(it.id); b.target = null; }
          break;
        }
        if (b.box != null) {
          const c = G.fac.containers[b.box];
          if (!c || c.open) { b.box = null; b.scanT = 0.2; break; }
          const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
          const lag = slow(b, 'c' + c.id, d);
          if (d < 1.5 || (d < 3 && lag > 1500)) { G.hostRequest(p.id, { a: 'box', id: c.id }); b.boxes.delete(c.id); b.box = null; b.scanT = 0.6; break; }
          if (walkIn(p, b, c.x, c.z, c.y, WALK, dt) < 0 || lag > 8000) { b.skip.add('c' + c.id); b.boxes.delete(c.id); b.box = null; }
          break;
        }
        b.target = pickTarget(p, b);
        if (b.target != null) { b.goal = null; b.path = null; break; }
        b.box = pickBox(p, b);
        if (b.box != null) { b.goal = null; b.path = null; break; }
        if (!b.goal) b.goal = exploreGoal(p, b);
        if (!b.goal) break;
        const r = walkIn(p, b, b.goal.x, b.goal.z, b.goal.y, WALK, dt);
        if (r < 1.5 || r < 0 || slow(b, 'g' + b.goal.x + ',' + b.goal.z, r) > 8000) b.goal = null;
        break;
      }
      case 'exit': {
        if (p.zone !== 'in') { b.state = 'home'; setRoute(b, homeRoute(p)); break; }
        const ex = G.fac.exits.find((e) => e.kind === 'main') || G.fac.exits[0];
        const r = walkIn(p, b, ex.x, ex.z, FAC_Y0, hurry ? RUN : WALK, dt), lag = slow(b, 'x', r);
        if (lag > 6000) { b.path = null; b.key = null; }
        if ((r >= 0 && r < 1.3) || (r >= 0 && r < 2.6 && lag > 1500)) {
          const sp = G.ext.entrance.spawn;
          teleport(p, 'out', sp.x, G.groundAt(sp.x, sp.z), sp.z, sp.yaw);
          b.state = 'home'; setRoute(b, homeRoute(p));
        }
        break;
      }
      case 'home': {
        if (p.zone === 'in') { b.state = 'exit'; break; }
        if (follow(p, b, hurry || b.waitUntil > G.now ? RUN : WALK, dt)) { b.state = carrying(p) ? 'unload' : 'aboard'; b.spots = null; b.dropT = 0.3; }
        break;
      }
      // in the bay: everything it carried set down on the deck, in a tidy spread
      case 'unload': {
        if (!carrying(p)) { b.state = 'aboard'; b.waitUntil = Math.max(b.waitUntil, G.now + 2500); break; }
        if (!b.spots) b.spots = dropSpots(p.slots.filter((id) => id != null).length);
        const s = b.spots[0];
        const ds = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
        if (ds > 1.1 && slow(b, 'u', ds) < 4000) { step(p, b, s.x, s.z, WALK, dt); break; }
        b.look = -0.5;
        b.dropT -= dt; if (b.dropT > 0) break;
        b.dropT = 0.35;
        const k = p.slots.findIndex((id) => id != null), id = p.slots[k], it = G.items.get(id), spot = b.spots.shift() || s;
        if (b.spots.length === 0) b.spots.push(spot);
        p.sel = k;
        G.hostRequest(p.id, { a: 'drop', item: id, x: spot.x, y: 0, z: spot.z, ry: rng.range(0, TAU), battery: it ? it.battery : 1, on: false });
        break;
      }
      default: b.state = 'aboard';
    }
  }
  // standing by aboard: back to its own spot in the bay, out of everyone's way
  function standBy(p, b, dt) {
    if (G.flight || !G.inShip(p) || G.mode === 'landing') return;
    const idx = [...G.players.keys()].indexOf(p.id), x = 1 + (idx % 3) * 1.1, z = 0.6 + Math.floor(idx / 3) * 1.0;
    const d = Math.hypot(x - p.pos.x, z - p.pos.z);
    if (d > 0.4 && slow(b, 's' + idx, d) < 5000) step(p, b, x, z, WALK, dt);
    else if (d <= 0.4) b.key = null;
  }
  // clear deck in the bay, nearest the airlock first, away from the walkway and anything already set down
  function dropSpots(n) {
    const deck = [];
    {
      for (let x = -6.6; x <= -3.2; x += 0.5) for (let z = -3.4; z <= 1.6; z += 0.5) {
        if (Math.abs(x - DX) < 0.9 && z > 0.6) continue;
        const q = { x, y: 0, z };
        if (!G.ship.inside(x, 0.3, z) || G.ship.collide(q, 0.45) || Math.hypot(q.x - x, q.z - z) > 1e-3) continue;
        deck.push({ x, z });
      }
      deck.sort((a, b) => Math.hypot(a.x + 4.6, a.z - 0.8) - Math.hypot(b.x + 4.6, b.z - 0.8));
    }
    const out = [];
    for (const s of deck) {
      if (out.length >= n) break;
      const busy = [...G.items.values()].some((it) => it.holder == null && it.inShip && Math.hypot(it.pos.x - s.x, it.pos.z - s.z) < 0.4);
      if (!busy) out.push({ x: s.x + rng.range(-0.08, 0.08), z: s.z + rng.range(-0.08, 0.08) });
    }
    while (out.length < Math.max(1, n)) out.push({ x: -4.6 + rng.range(-0.5, 0.5), z: 0.8 + rng.range(-0.5, 0.5) });
    return out;
  }

  // every frame, on the host: each bot thinks and moves, then goes out to everyone like any crewmate's position
  B.update = (dt) => {
    if (!G.isHost) return;
    dt = Math.min(dt, 0.1);
    for (const p of G.players.values()) {
      if (!p.bot) continue;
      const b = brain(p);
      think(p, b, dt);
      p.crouch = false; p.seat = null; p.air = false; p.radio = false; p.talking = false;
      p.flags = (p.sprint ? 2 : 0) | (p.moving ? 4 : 0) | (p.flash ? 8 : 0) | (p.zone === 'in' ? 128 : 0);
      p.buf.push({ t: G.now, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch }); if (p.buf.length > 12) p.buf.shift();
    }
  };
  B.brainOf = (id) => brains.get(id);
  return B;
})();
