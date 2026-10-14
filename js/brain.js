'use strict';
// What the creatures know (host only). Seeing you wants light: a lamp near you, a light in your hands, or being close
// enough to be made out in the dark (closer still if you crouch or keep still, further off if you run). Sound goes the
// way sound does, along the corridors and round the corners, dulled through a shut door (less through a barred window),
// up and down a stairwell and a little through a thin wall: a shout carries along a floor, a whisper not past the next
// door. What they've seen or heard of you they remember, less and less sure of it as it gets older. The plan of the
// building is Facility.nav's; this keeps what it says about the crew (where each of you is, how fast you're going,
// whether you're lit, where you've been walking) a few times a second.
const Brain = (() => {
  const B = { dbg: { fields: 0, fallbacks: 0, heard: 0 } };
  let fac = null, now = 0, budget = 2, bbT = 0, heatT = 0, decT = 0, lastR = 0, lit = null, heat = null, tmp = null;
  const P = new Map(), cache = new Map(), pool = [];
  const N = () => fac.nav().N;
  const buf = () => pool.pop() || new Float32Array(N());
  const free = (F) => { if (F && pool.length < 24 && F.length === N()) pool.push(F); };
  B.P = P;
  B.now = () => now;
  B.reset = (f) => {
    fac = f || null; P.clear(); cache.clear(); pool.length = 0; heat = lit = tmp = null; now = 0; bbT = heatT = decT = lastR = 0;
    B.dbg = { fields: 0, fallbacks: 0, heard: 0 };
    resetDir();
  };
  // each host frame, before the creatures move
  B.tick = (dt) => {
    if (fac !== G.fac) B.reset(G.fac);
    if (!fac) return;
    now += dt;
    // (how many of the costlier sound and route workings-out a frame may have; the rest wait, or make do)
    budget = Touch.on ? 1 : 2;
    if ((bbT -= dt) <= 0) { bbT = 0.1; refresh(); }
    if ((heatT -= dt) <= 0) { heatT = 0.5; warm(); }
    if ((D.dt += dt) >= 0.25) { direct(D.dt); D.dt = 0; }
    for (const [key, c] of cache) if (now - c.t > 1.2) { free(c.F); cache.delete(key); }
  };
  // ---------------- the crew, as the creatures have them ----------------
  function refresh() {
    const ddt = Math.max(1e-3, now - lastR); lastR = now;
    lit = fac.litMap(!G.round || G.round.power);
    for (const p of G.players.values()) {
      if (!p.alive) { P.delete(p.id); continue; }
      let e = P.get(p.id);
      if (!e) { e = { id: p.id, x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: 0, vz: 0, spd: 0, still: 0, yaw: p.yaw, yr: 0, k: -1, lit: false, inT: 0, zone: p.zone }; P.set(p.id, e); }
      let vx = (p.pos.x - e.x) / ddt, vz = (p.pos.z - e.z) / ddt;
      // (a jump, not a walk: spawned somewhere, or through the hatch)
      if (Math.hypot(vx, vz) > 10 || e.zone !== p.zone) vx = vz = 0;
      e.vx += (vx - e.vx) * 0.5; e.vz += (vz - e.vz) * 0.5; e.spd = Math.hypot(e.vx, e.vz);
      e.still = e.spd < 0.3 ? e.still + ddt : 0;
      e.yr = angDiff(e.yaw, p.yaw) / ddt; e.yaw = p.yaw;
      e.x = p.pos.x; e.y = p.pos.y; e.z = p.pos.z; e.zone = p.zone;
      e.k = p.zone === 'in' ? fac.nodeAt(p.pos.x, p.pos.z, p.pos.y) : -1;
      const sh = p.zone === 'in' && fac.shaftAt(p.pos.x, p.pos.z);
      e.lit = !!p.flash || G.carriesLight(p) || (e.k >= 0 && (sh ? shaftLit(sh, p) : !!lit[e.k]));
      e.inT = p.zone === 'in' ? e.inT + ddt : 0;
    }
  }
  // (a stairwell's own caged lamps light the landing or flight they hang over)
  function shaftLit(s, p) {
    const power = !G.round || G.round.power;
    for (const l of fac.lamps) if (l.shaft === s.id && l.state !== 'off' && (power || l.state === 'emergency') && Math.abs(l.fy - p.pos.y) < 2 && Math.hypot(l.x - p.pos.x, l.z - p.pos.z) < 4.5) return true;
    return false;
  }
  // where the crew have been walking: a little warmth left on each tile they cross, fading over a couple of minutes
  function warm() {
    if (!heat) heat = new Float32Array(N());
    for (const e of P.values()) if (e.zone === 'in' && e.k >= 0) heat[e.k] += 1;
    if ((decT += 0.5) >= 5) { decT = 0; for (let k = 0; k < heat.length; k++) if (heat[k]) heat[k] *= 0.9715; }
  }
  B.heat = (k) => (heat && k >= 0 ? Math.min(1, heat[k] / 6) : 0);
  B.lit = (k) => !!(lit && k >= 0 && lit[k]);
  B.node = (x, z, y) => (fac ? fac.nodeAt(x, z, y) : -1);
  // ---------------- seeing ----------------
  // How sure it is it sees p (0: not at all). o: range, cone (the least cos of the angle off its facing; -1 all round),
  // dark (how near it makes someone out without light), touch (bumped into: no light needed, but never through a wall)
  B.sees = (m, p, o) => {
    if (!p.alive || p.zone !== m.def.zone) return 0;
    const inside = m.def.zone === 'in' && fac;
    if (inside && Math.abs(p.pos.y - m.feetY()) > 2.5) return 0;
    const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, d = Math.hypot(dx, dz);
    if (o.touch && d < o.touch) return !inside || m.clearTo(p) ? 1 : 0;
    if (d > o.range) return 0;
    if (o.cone != null && o.cone > -1 && d > 0.05) { const f = m.forward(); if ((dx * f.x + dz * f.z) / d < o.cone) return 0; }
    if (inside && !fac.los(m.pos.x, m.pos.z, p.pos.x, p.pos.z, true)) return 0;
    const e = P.get(p.id);
    if (e ? e.lit : p.flash) return 1;
    const dark = (o.dark || 0) * (p.crouch ? 0.55 : 1) * (p.sprint ? 1.5 : 1) * (e && e.still > 0.5 ? 0.7 : 1);
    return d < dark ? 1 - 0.5 * d / dark : 0;
  };
  // the best of the crew it sees right now: { p, c } (or null)
  B.look = (m, o, filter) => {
    let best = null, bc = 0;
    for (const p of G.players.values()) { if (filter && !filter(p)) continue; const c = B.sees(m, p, o); if (c > bc) { bc = c; best = p; } }
    return best ? { p: best, c: bc } : null;
  };
  // Those of the crew who see m. Someone has to be looking its way (with nothing in between), and there has to be light
  // to see it by (close to, a lamp over it, their beam on it, or its own glow). The cone is widened by how far each of
  // them is turning in a quarter of a second, so what's drawn on a crewmate's screen, a moment behind, never shows it
  // moving while they look at it. o: eye (its height), range, dot, glow
  B.seenBy = (m, o = {}, out = []) => {
    out.length = 0;
    const eye = { x: m.pos.x, y: m.pos.y + (o.eye || 1.6), z: m.pos.z }, range = o.range || 40, d0 = Math.acos(clamp(o.dot != null ? o.dot : 0.55, -1, 1));
    let here = null;
    for (const p of G.players.values()) {
      if (!p.alive || p.zone !== m.def.zone) continue;
      const e = P.get(p.id), dd = Math.hypot(p.pos.x - eye.x, p.pos.z - eye.z); if (dd > range) continue;
      const widen = 0.1 + Math.min(1.2, Math.abs(e ? e.yr : 0) * 0.25);
      if (!G.canSee(p, eye, range, Math.cos(Math.min(Math.PI, d0 + widen)))) continue;
      if (dd < 6 || o.glow) { out.push(p); continue; }
      if (here === null) here = (fac && m.def.zone === 'in' && B.lit(fac.nodeAt(m.pos.x, m.pos.z, m.feetY()))) || G.isLit(eye);
      if (here || (p.flash && dd < (p.flash === 2 ? 30 : 21) && G.canSee(p, eye, 30, Math.cos(Math.min(Math.PI, Math.acos(0.9) + widen))))) out.push(p);
    }
    return out;
  };
  // ---------------- hearing ----------------
  // The way a noise carries from where it was made, worked out once and shared for a moment by any noise from about the
  // same place of about the same loudness (feet on the same tile). With this frame's share of the working used up, null.
  // (need: as far as this listener could hear it from)
  function noiseField(n, mode, need) {
    if (n.k === undefined) n.k = fac.nodeAt(n.x, n.z, n.y);
    if (n.k < 0) return null;
    const rb = Math.min(127, Math.ceil(n.r / 2)), ver = fac.doorVer | 0, key = (n.k * 128 + rb) * 2 + (mode === 'floor' ? 1 : 0);
    const c = cache.get(key);
    if (c && c.ver === ver && c.max >= need) { c.t = now; return c.F; }
    if (budget <= 0) { B.dbg.fallbacks++; return null; }
    budget--; B.dbg.fields++;
    const max = Math.max(need, rb * 2 * 1.6 + 2), F = fac.field([n.k], max, mode, c ? c.F : buf());
    cache.set(key, { F, t: now, ver, max });
    return F;
  }
  // The loudest thing m can hear right now (or null): a noise made in its zone in the last moment, heard out to its
  // range times sens (times K[kind], its ear for that kind of noise: step, voice, item, door, bang), measured the way the
  // sound has to come: along the floor plan, round corners, through doors. Outside, across open ground (the hull of the
  // ship in between, with the hatch shut, dulls it to a third). o.mode 'floor': felt through the floor (the Seep): along
  // its own floor only, doors no matter. o.max: nothing heard further than that. { n, pid, loud (1 at the source, 0 at the edge), pd (how far it came), x, y, z }
  B.hear = (m, sens = 1, K, o) => {
    const zone = m.def.zone, mode = (o && o.mode) || 'sound';
    if (zone === 'in' && !fac) return null;
    let best = null, bl = 0, mk;
    const my = m.feetY();
    for (const n of G.noises) {
      if (n.zone !== zone || n.age > 0.4 || n.src === m.id) continue;
      const kk = K ? (K[n.kind] != null ? K[n.kind] : K.other != null ? K.other : 1) : 1;
      let R = Math.min(n.r * sens * kk, (o && o.max) || Infinity); if (R < 0.3) continue;
      const d = Math.hypot(n.x - m.pos.x, n.z - m.pos.z);
      let pd;
      if (zone === 'out') {
        if (G.ship && !G.ship.door.open && G.ship.inside(n.x, n.y, n.z) !== G.ship.inside(m.pos.x, m.pos.y + 0.5, m.pos.z)) R *= 0.3;
        if (d >= R) continue;
        pd = d;
      } else {
        if (d >= R) continue;
        const same = Math.abs(n.y - (n.kind === 'voice' ? 1.6 : 0) - my) < 2.6, inS = fac.shaftAt(n.x, n.z) || fac.shaftAt(m.pos.x, m.pos.z);
        // (close by on its floor, the straight line, a little further round a corner; otherwise the way it carries)
        let F = null;
        if (mode === 'floor' || R > 9 || !same || inS) { F = noiseField(n, mode, R); if (F && mk === undefined) mk = fac.nodeAt(m.pos.x, m.pos.z, my); }
        pd = F ? (mk >= 0 ? F[mk] : Infinity) : !same ? Infinity : mode === 'floor' ? d : d + (fac.los(m.pos.x, m.pos.z, n.x, n.z) ? 0 : 6);
        if (!(pd < R)) continue;
      }
      const loud = 1 - pd / R;
      if (loud > bl) { bl = loud; best = { n, pid: n.pid, loud, pd, R, x: n.x, y: n.y - (n.kind === 'voice' ? 1.6 : 0), z: n.z, kind: n.kind }; }
    }
    if (best) B.dbg.heard++;
    return best;
  };
  // how far a voice carries at a loudness L (0..1, see Voice.loudness): a whisper only right next to you, ordinary talk
  // a room or two, a shout most of a floor
  B.voiceR = (L) => (L < 0.03 ? 0 : L <= 0.12 ? 3.5 : L <= 0.3 ? lerp(5, 9, (L - 0.12) / 0.18) : L <= 0.55 ? lerp(9, 15, (L - 0.3) / 0.25) : L <= 0.8 ? lerp(15, 30, (L - 0.55) / 0.25) : lerp(30, 45, Math.min(1, (L - 0.8) / 0.2)));
  // ---------------- memory ----------------
  // what it last knew of p: where, which way they were going, how sure it was then (fading with the creature's own tau)
  B.remember = (m, p, conf, how) => {
    const mem = m.mem || (m.mem = new Map()), e = P.get(p.id), r = mem.get(p.id) || {};
    const c = Math.min(1, Math.max(conf, B.conf(m, r)));
    Object.assign(r, { pid: p.id, x: p.pos.x, y: p.pos.y, z: p.pos.z, k: e ? e.k : -1, t: now, vx: e ? e.vx : 0, vz: e ? e.vz : 0, conf: c, how });
    mem.set(p.id, r); return r;
  };
  // a noise heard: where it came from (not where whoever made it is now)
  B.noted = (m, h, conf) => {
    if (h.pid == null) return null;
    const mem = m.mem || (m.mem = new Map()), r = mem.get(h.pid) || {};
    const c = Math.min(1, Math.max(conf, B.conf(m, r)));
    Object.assign(r, { pid: h.pid, x: h.x, y: h.y, z: h.z, k: h.n.k != null ? h.n.k : -1, t: now, vx: 0, vz: 0, conf: c, how: 'heard' });
    mem.set(h.pid, r); return r;
  };
  B.conf = (m, r) => (r && r.t != null ? r.conf * Math.exp(-(now - r.t) / ((m.cfg && m.cfg.tau) || 10)) : 0);
  B.age = (r) => now - r.t;
  B.recall = (m, pid) => {
    const r = m.mem && m.mem.get(pid); if (!r) return null;
    const p = G.players.get(pid);
    if (!p || !p.alive || p.zone !== m.def.zone || B.conf(m, r) < 0.05) { m.mem.delete(pid); return null; }
    return r;
  };
  B.forget = (m, pid) => { if (m.mem) { if (pid == null) m.mem.clear(); else m.mem.delete(pid); } };
  // its surest memory of anyone
  B.freshest = (m) => {
    let best = null, bc = 0;
    if (m.mem) for (const r of [...m.mem.values()]) { if (!B.recall(m, r.pid)) continue; const c = B.conf(m, r); if (c > bc) { bc = c; best = r; } }
    return best;
  };
  // where someone going that way would be in T seconds (stopping short at a wall)
  B.ahead = (x, z, vx, vz, T) => {
    const s = Math.hypot(vx, vz); if (s < 0.3 || !fac) return { x, z };
    let px = x, pz = z; const n = Math.max(1, Math.ceil((s * T) / 1.5));
    for (let i = 1; i <= n; i++) { const qx = x + (vx * T * i) / n, qz = z + (vz * T * i) / n; if (!fac.walkable(fac.ti(qx), fac.tj(qz)) || !fac.los(x, z, qx, qz)) break; px = qx; pz = qz; }
    return { x: px, z: pz };
  };
  // ---------------- the building, from where the creature stands ----------------
  // a walk (or floor) field from m out to maxM, in a buffer kept for it (null with the frame's share used up, unless
  // it's a choice made now and then that can't wait: force)
  B.from = (m, maxM, mode = 'walk', force) => {
    if (!fac || (budget <= 0 && !force)) return null;
    const k = fac.nodeAt(m.pos.x, m.pos.z, m.feetY()); if (k < 0) return null;
    budget--; B.dbg.fields++;
    return fac.field([k], maxM, mode, tmp || (tmp = new Float32Array(N())));
  };
  // Calling the others of its kind within R (by the way it would have to walk): fn(mate, metres) for each that hears
  B.call = (m, R, fn) => {
    const mates = []; for (const o of G.monsters.values()) if (o !== m && o.type === m.type && !o.dead && o.def.zone === m.def.zone && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < R) mates.push(o);
    if (!mates.length) return 0;
    const inside = m.def.zone === 'in' && fac, F = inside ? B.from(m, R) : null;
    let n = 0;
    for (const o of mates) {
      // (no working it out this frame: those in plain sight of it)
      const d = F ? F[fac.nodeAt(o.pos.x, o.pos.z, o.feetY())] : !inside || (Math.abs(o.pos.y - m.pos.y) < 2.5 && fac.los(m.pos.x, m.pos.z, o.pos.x, o.pos.z)) ? Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) : Infinity;
      if (d < R) { fn(o, d); n++; }
    }
    return n;
  };
  // ---------------- the director ----------------
  // The cleverer ones (the Pale, the Executioner, the Mannequin) don't kill whoever they happen to reach. A round goes
  // in swells: quiet a while; then building (they shadow you, show themselves, back off); then one of them is let loose
  // on one of you, whoever's furthest from help or heading home alone; then it eases off again. Before it comes for
  // you there's always warning, a sound somewhere out of sight, your light stuttering, a door slammed down the
  // corridor, the first of it a good six seconds before; it never takes two of you inside a minute; and now and then it
  // only toys with you. Until it's let loose, one that gets its hands on you hurts you and lets you go.
  const SMART = { pale: 1, executioner: 1, mannequin: 1 }, CUE_SND = { pale: 'breath', executioner: 'blade_drag', mannequin: 'creak' };
  const D = { phase: 'calm', t: 0, len: 60, tok: null, lastKill: -1e9, dt: 0, log: [] };
  // where each of you went to ground after a fright (searched first next time they lose you)
  const H = new Map();
  B.smart = (m) => !!SMART[m.type];
  B.dir = D;
  const go = (ph, len) => { D.phase = ph; D.t = 0; D.len = len; D.log.push([+now.toFixed(1), ph]); if (D.log.length > 60) D.log.shift(); };
  const resetDir = () => { D.phase = 'calm'; D.t = 0; D.len = 55 + Math.random() * 35; D.tok = null; D.lastKill = -1e9; D.log.length = 0; H.clear(); };
  // heading home: hands full, hurt, or late
  const homebound = (p) => p.hp < 40 || p.slots.every((id) => id != null) || (G.round && G.round.time > 21 * 60);
  B.homebound = homebound;
  function direct(dt) {
    D.t += dt;
    for (const e of P.values()) {
      // how frightening it is where they are: anything close, on their floor
      let near = 0;
      for (const m of G.monsters.values()) if (!m.dead && m.def.zone === e.zone && Math.abs(m.pos.y - e.y) < 3) { const d = Math.hypot(m.pos.x - e.x, m.pos.z - e.z); if (d < 14) near = Math.max(near, 1 - d / 14); }
      e.I = Math.max((e.I || 0) - dt * 0.03, near);
      if (e.I > 0.5) e.hot = now;
      // gone to ground after a fright: remembered
      if (e.zone === 'in' && e.k >= 0 && e.still > 4 && now - (e.hot || -99) < 20 && e.hidK !== e.k) {
        e.hidK = e.k; const h = H.get(e.id) || []; if (!h.includes(e.k)) { h.push(e.k); if (h.length > 6) h.shift(); } H.set(e.id, h);
      }
    }
    const smart = []; for (const m of G.monsters.values()) if (!m.dead && SMART[m.type] && m.def.zone === 'in') smart.push(m);
    let maxI = 0; for (const e of P.values()) maxI = Math.max(maxI, e.I || 0);
    switch (D.phase) {
      case 'calm': if (D.t > D.len && maxI < 0.6) go('build', 25 + Math.random() * 30); break;
      case 'build': if (D.t > D.len && now - D.lastKill > 60 && !grant(smart)) D.t = D.len - 8; break;
      case 'peak': {
        const k = D.tok, p = k && G.players.get(k.pid), m = k && G.monsters.get(k.mid);
        if (!k || !p || !p.alive || p.zone !== 'in' || !m || m.dead || D.t > (k.toy ? 25 : 75)) {
          if (p && !p.alive) D.lastKill = now;
          D.tok = null; go('relax', 40 + Math.random() * 30);
        } else cue(k, p, m);
        break;
      }
      case 'relax': if (D.t > D.len) go('calm', 30 + Math.random() * 40); break;
    }
  }
  function grant(smart) {
    if (!smart.length) return false;
    const crew = []; for (const p of G.players.values()) if (p.alive && p.zone === 'in') crew.push(p);
    // the prey: furthest from help (a floor between you counts for a lot), more so heading home
    let prey = null, ps = -1;
    for (const p of crew) {
      let iso = 60; for (const q of crew) if (q !== p) iso = Math.min(iso, Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) + Math.abs(q.pos.y - p.pos.y) * 4);
      const s = iso + (homebound(p) ? 15 : 0) + Math.random() * 6; if (s > ps) { ps = s; prey = p; }
    }
    if (!prey) return false;
    let m = null, md = Infinity;
    for (const o of smart) { const d = Math.hypot(o.pos.x - prey.pos.x, o.pos.z - prey.pos.z) + Math.abs(o.pos.y - prey.pos.y) * 3; if (d < md) { md = d; m = o; } }
    D.tok = { mid: m.id, pid: prey.id, t0: now, cues: 0, first: -1, next: now + 1 + Math.random() * 3, toy: Math.random() < 0.3 };
    go('peak', 0); D.log.push([+now.toFixed(1), 'let loose', m.type, prey.id, D.tok.toy ? 'toy' : 'kill']);
    return true;
  }
  // the warnings, a few seconds apart: a sound out of sight near them, their light stuttering, a door slammed near by
  function cue(k, p, m) {
    if (k.cues >= 3 || now < k.next) return;
    const kind = ['sound', 'light', 'door'][k.cues];
    k.cues++; if (k.first < 0) k.first = now; k.next = now + 3 + Math.random() * 3;
    D.log.push([+now.toFixed(1), 'cue', kind, p.id]);
    const lv = fac.lvl[fac.idx(fac.ti(p.pos.x), fac.tj(p.pos.z))];
    if (kind === 'sound') {
      const s = fac.randomWalkable(R0, (q) => { const d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z); return d > 6 && d < 14 && fac.lvl[fac.idx(q.i, q.j)] === lv && !fac.los(p.pos.x, p.pos.z, q.x, q.z, true); }, { x: p.pos.x, z: p.pos.z, r: 14 });
      G.emitSound(CUE_SND[m.type], s ? new THREE.Vector3(s.x, p.pos.y + 1.2, s.z) : m.center(), { vol: 0.8, ref: 4 });
      return;
    }
    if (kind === 'door') {
      let best = null, bd = 16;
      for (const d of fac.doors) { if (!d.open || d.broken || d.latch || d.lv !== lv) continue; const dd = Math.hypot(d.x - p.pos.x, d.z - p.pos.z); if (dd > 4 && dd < bd) { bd = dd; best = d; } }
      if (best) { G.monsterShoveDoor(m, best); return; }
    }
    G.emit({ e: 'cue', pid: p.id, k: 'light' });
  }
  // whom it's been let loose on (null: nobody, or it isn't the one)
  B.prey = (m) => { const k = D.tok; return k && k.mid === m.id ? G.players.get(k.pid) || null : null; };
  // whether it may kill p now: always for the animals; for the cleverer ones, only its prey, once warned
  B.mayKill = (m, p) => { if (!SMART[m.type]) return true; const k = D.tok; return !!(k && !k.toy && k.mid === m.id && k.pid === p.id && k.cues >= 2 && now - k.first >= 6); };
  // where p went to ground before, nearest first (tiles)
  B.hides = (pid) => H.get(pid) || [];
  // Somewhere ahead of p on their way out that m can reach first, out of their sight, to wait for them there (null if
  // nowhere will do). speed: how fast m goes unseen
  B.cutoff = (m, p, speed) => {
    const e = P.get(p.id); if (!e || e.k < 0) return null;
    const Fm = B.from(m, 90, 'walk', true); if (!Fm) return null;
    const route = fac.route(fac.homeField(), e.k, 60), v = Math.max(1.5, e.spd);
    let cum = 0, prev = e.k;
    for (let i = 1; i < route.length; i++) {
      const k = route[i], W = fac.W, x = fac.cx(k % W), z = fac.cz((k - (k % W)) / W);
      cum += Math.hypot(x - fac.cx(prev % W), z - fac.cz((prev - (prev % W)) / W)); prev = k;
      if (cum < 8) continue; if (cum > 45) break;
      if (Fm[k] / speed + 1.5 < cum / v && !fac.los(p.pos.x, p.pos.z, x, z, true)) return { x, z, y: fac.tileY(k), k };
    }
    return null;
  };
  return B;
})();
