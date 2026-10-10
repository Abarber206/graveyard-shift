'use strict';
// Procedural outdoor landing site: terrain, dead forest, a winding trail, the processing-plant complex
// (facility entrance), fire exit, pylons, wrecks, sky + weather.
function obbCollide(p, r, c) {
  const dx = p.x - c.x, dz = p.z - c.z, cs = Math.cos(c.ry), sn = Math.sin(c.ry);
  const q = { x: dx * cs - dz * sn, z: dx * sn + dz * cs };
  if (!circleBox(q, r, -c.hw, c.hw, -c.hd, c.hd)) return false;
  p.x = c.x + q.x * cs + q.z * sn; p.z = c.z - q.x * sn + q.z * cs;
  return true;
}

// Every site is its own world: the shape of the land, the ground, what grows (or doesn't), the colour of the sky,
// what drifts in the air, and what the plant was built as before everyone left.
const BIOMES = {
  // rolling mill country in a dead autumn
  ashgrove: {
    relief: 'hills', water: null, terrainTex: 'terrain',
    ground: { a: [0.64, 0.6, 0.44], b: [0.55, 0.5, 0.39], damp: [0.4, 0.37, 0.31], moss: [0.5, 0.55, 0.36], rock: [0.56, 0.55, 0.52], trail: [0.44, 0.38, 0.31], yard: [0.5, 0.49, 0.46] },
    trees: { n: 250, snag: 0.28, swamp: 0, bark: null, charred: 0 },
    rocks: { n: 140, big: 0.15, tint: null, spires: 0 },
    deadwood: { logs: 34, stumps: 30, charred: false },
    grass: { kind: 'dry', dens: 0.34, h: 1 },
    sky: { top: [1, 1, 1], hor: [1, 1, 1], sun: [1, 1, 1], hemi: [1, 1, 1], dim: 1, fogAdd: 0 },
    motes: 'spores', plant: 'mill', sign: 'ASHGROVE TEXTILES',
    vehicles: { colors: [0x8a3a2a, 0x3a5a7a, 0xa8a088, 0x4a6a3a, 0x6a6a6a], van: 0.4, burnt: false },
  },
  // a drowned marsh around a research annex: standing water, reeds, moss-hung trees, green mist
  kessler: {
    relief: 'marsh', water: -0.85, terrainTex: 'terrainMarsh',
    ground: { a: [0.66, 0.68, 0.6], b: [0.56, 0.58, 0.52], damp: [0.38, 0.4, 0.36], moss: [0.55, 0.66, 0.48], rock: [0.62, 0.63, 0.6], trail: [0.5, 0.46, 0.4], yard: [0.6, 0.6, 0.58] },
    trees: { n: 220, snag: 0.12, swamp: 0.72, bark: 0x7a7a66, charred: 0 },
    rocks: { n: 50, big: 0.1, tint: 0x7c8a70, spires: 0 },
    deadwood: { logs: 44, stumps: 40, charred: false },
    grass: { kind: 'reeds', dens: 0.36, h: 1.9 },
    sky: { top: [0.82, 0.95, 0.85], hor: [0.84, 0.98, 0.84], sun: [0.95, 1, 0.82], hemi: [0.85, 1, 0.85], dim: 0.95, fogAdd: 0.008 },
    motes: 'fireflies', plant: 'lab', sign: 'KESSLER BIOLOGICAL',
    vehicles: { colors: [0xd8d8d0, 0xc8ccc4, 0x5a8a8a], van: 0.85, burnt: false },
  },
  // a red-rock canyon of stepped mesas and spires, dust on the wind
  nadir: {
    relief: 'canyon', water: null, terrainTex: 'terrainSand',
    ground: { a: [0.8, 0.72, 0.64], b: [0.68, 0.58, 0.52], damp: [0.56, 0.46, 0.4], moss: [0.74, 0.68, 0.56], rock: [0.72, 0.6, 0.52], trail: [0.62, 0.56, 0.5], yard: [0.62, 0.6, 0.58] },
    trees: { n: 45, snag: 0.6, swamp: 0, bark: 0xbcae9c, charred: 0 },
    rocks: { n: 320, big: 0.3, tint: 0xc28c66, spires: 26 },
    deadwood: { logs: 8, stumps: 10, charred: false },
    grass: { kind: 'scrub', dens: 0.12, h: 0.75 },
    sky: { top: [1.08, 0.92, 0.78], hor: [1.18, 0.95, 0.72], sun: [1.1, 0.95, 0.78], hemi: [1.1, 0.95, 0.8], dim: 1, fogAdd: 0.004 },
    motes: 'dust', plant: 'pump', sign: 'NADIR PUMPING STN 7',
    vehicles: { colors: [0xb88a2a, 0x8a5a3a, 0x6a6a6a], van: 0.2, burnt: false },
  },
  // a burnt ash waste under a red sky: craters, bone-white and charred trees, falling ash and embers
  hollow: {
    relief: 'craters', water: null, terrainTex: 'terrainAsh',
    ground: { a: [0.62, 0.6, 0.58], b: [0.5, 0.48, 0.47], damp: [0.34, 0.32, 0.31], moss: [0.6, 0.52, 0.48], rock: [0.56, 0.55, 0.55], trail: [0.5, 0.46, 0.44], yard: [0.55, 0.54, 0.53] },
    trees: { n: 170, snag: 0.5, swamp: 0, bark: 0xd8d2c6, charred: 0.45 },
    rocks: { n: 90, big: 0.25, tint: 0x4a4644, spires: 8 },
    deadwood: { logs: 30, stumps: 60, charred: true },
    grass: { kind: 'ash', dens: 0.1, h: 0.6 },
    sky: { top: [0.72, 0.38, 0.34], hor: [0.9, 0.46, 0.36], sun: [1.0, 0.42, 0.28], hemi: [0.9, 0.52, 0.48], dim: 0.8, fogAdd: 0.006 },
    motes: 'ash', plant: 'ruin', sign: 'S I T E   0',
    vehicles: { colors: [0x2a2624], van: 0.3, burnt: true },
  },
  // a moon: grey dust and craters under a black sky, stars out by day, the world it circles hanging huge overhead;
  // no air, no weather, nothing growing, and the gravity's light out here (see SITES[...].lowG)
  moon: {
    relief: 'craters', water: null, terrainTex: 'terrainAsh', airless: true,
    ground: { a: [0.64, 0.64, 0.62], b: [0.52, 0.52, 0.51], damp: [0.4, 0.4, 0.4], moss: [0.58, 0.58, 0.57], rock: [0.5, 0.5, 0.5], trail: [0.47, 0.46, 0.44], yard: [0.54, 0.54, 0.53] },
    trees: { n: 0, snag: 0, swamp: 0, bark: null, charred: 0 },
    rocks: { n: 300, big: 0.3, tint: 0x8c8c8a, spires: 0 },
    deadwood: { logs: 0, stumps: 0, charred: false },
    grass: { kind: 'none', dens: -1, h: 0.5 },
    sky: { top: [1, 1, 1], hor: [1, 1, 1], sun: [1.15, 1.12, 1.08], hemi: [0.8, 0.84, 0.95], dim: 1, fogAdd: 0 },
    motes: 'none', plant: 'lab', sign: 'MERCY SURVEY OUTPOST',
    vehicles: { colors: [0xd8d8d0, 0x8a8a8a], van: 0.7, burnt: false },
  },
  // a captured asteroid: dark broken rock, jagged spurs and crater pits, a mining claim bored into it
  rock: {
    relief: 'craters', water: null, terrainTex: 'terrainAsh', airless: true,
    ground: { a: [0.5, 0.46, 0.42], b: [0.4, 0.37, 0.34], damp: [0.32, 0.3, 0.28], moss: [0.46, 0.42, 0.38], rock: [0.42, 0.39, 0.36], trail: [0.38, 0.35, 0.32], yard: [0.44, 0.42, 0.4] },
    trees: { n: 0, snag: 0, swamp: 0, bark: null, charred: 0 },
    rocks: { n: 420, big: 0.35, tint: 0x5a524a, spires: 22 },
    deadwood: { logs: 0, stumps: 0, charred: false },
    grass: { kind: 'none', dens: -1, h: 0.5 },
    sky: { top: [1, 1, 1], hor: [1, 1, 1], sun: [1.1, 1.06, 1.0], hemi: [0.85, 0.82, 0.8], dim: 1, fogAdd: 0 },
    motes: 'none', plant: 'pump', sign: 'MERCY MINERAL CLAIM',
    vehicles: { colors: [0xb88a2a, 0x6a6a6a], van: 0.3, burnt: false },
  },
};

const Exterior = (() => {
  class Ext {
    constructor(seed, site, weather, key) {
      this.seed = seed; this.site = site; this.weather = weather;
      const bk = (site && site.biome) || key; this.key = BIOMES[bk] ? bk : 'ashgrove'; this.biome = BIOMES[this.key];
      this.rng = new RNG(seed ^ 0x5bd1e995); this.noise = new Noise2D(seed + 7);
      this.impacts = [];
      const r = this.rng;
      // the Hollow is pocked with craters (they shape the height field, so they come first)
      this.craters = [];
      if (this.biome.relief === 'craters') for (let i = 0; i < 10; i++) { const a = r.range(0, TAU), d = r.range(40, 150); this.craters.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: r.range(8, 22), depth: r.range(2, 5.5) }); }
      // (no weather to wear them down: an airless moon or rock is pocked with smaller ones on top of those)
      if (this.biome.airless) for (let i = 0; i < 30; i++) { const a = r.range(0, TAU), d = r.range(34, 170), big = r.chance(0.15); this.craters.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: r.range(2.5, 8) * (big ? 1.8 : 1), depth: r.range(0.6, 1.8) * (big ? 1.6 : 1) }); }
      // the whole site sits a little below the ship's deck: it stands on its legs over the landing pad (SHIP.ground)
      const sink = SHIP.ground + 0.3;
      this.base0 = this.baseH(0, 0) - sink;
      this.water = this.biome.water != null ? this.biome.water + sink : null;
      const lowest = this.water != null ? this.water + 1.2 : -3 + sink;
      const a = r.range(0, TAU), d = r.range(100, 125);
      this.entrance = { x: Math.cos(a) * d, z: Math.sin(a) * d };
      this.entrance.h = clamp(this.baseH(this.entrance.x, this.entrance.z) - this.base0, lowest, 5 + sink);
      this.entrance.ry = Math.atan2(-this.entrance.x, -this.entrance.z);
      this.cbase = { x: this.entrance.x, y: this.entrance.h, z: this.entrance.z, ry: this.entrance.ry };
      this.center = this.toWorld(this.cbase, 0, -20);
      for (let t = 0; t < 40; t++) {
        const a2 = a + (r.chance(0.5) ? 1 : -1) * r.range(0.9, 1.9), d2 = r.range(65, 98);
        this.fire = { x: Math.cos(a2) * d2, z: Math.sin(a2) * d2 };
        if (Math.hypot(this.fire.x - this.center.x, this.fire.z - this.center.z) > 62) break;
      }
      this.fire.h = clamp(this.baseH(this.fire.x, this.fire.z) - this.base0, Math.max(-4 + sink, lowest), 6 + sink);
      this.buildPath();
      this.flats = [
        { x: 0, z: 0, r: 19, r2: 32, h: SHIP.ground },
        { x: this.center.x, z: this.center.z, r: 50, r2: 68, h: this.entrance.h },
        { x: this.fire.x, z: this.fire.z, r: 6, r2: 13, h: this.fire.h },
      ];
      this.cols = []; this.obbs = []; this.hash = new Map();
      this.lights = []; this.interact = []; this.blinkers = [];
      // world -> ship coordinates (the ship flies in and out): rain and drifting motes are kept out of its hull
      this.shipInv = { value: new THREE.Matrix4() };
    }
    setShipFrame(m) { this.shipInv.value.copy(m).invert(); }
    baseH(x, z) {
      const n = this.noise, R = this.biome.relief;
      if (R === 'marsh') {
        // low hummocks, and hollows sunk deep enough that about a third of the ground stands under water
        const f = n.fbm(x * 0.012, z * 0.012, 4) * 6;
        return (f < 0 ? f * 1.9 : f) + n.noise(x * 0.05, z * 0.05) * 0.6;
      }
      if (R === 'canyon') {
        // ridged mesas cut into terraces: flat benches with steep risers
        const rd = 1 - Math.abs(n.noise(x * 0.009 + 11, z * 0.009 - 7));
        let h = n.fbm(x * 0.007, z * 0.007, 3) * 10 + rd * rd * 16;
        const step = 3.2, f = h / step, k = Math.floor(f);
        h = (k + sstep(0.62, 0.92, f - k)) * step;
        return h + n.noise(x * 0.06, z * 0.06) * 0.5;
      }
      if (R === 'craters') {
        let h = n.fbm(x * 0.008, z * 0.008, 4) * 9 + n.noise(x * 0.05, z * 0.05) * 1.0;
        for (const c of this.craters) { const d = Math.hypot(x - c.x, z - c.z) / c.r; if (d < 1.6) h += d < 1 ? -c.depth * (1 - d * d) : 0; h += c.depth * 0.4 * Math.exp(-((d - 1.0) ** 2) / 0.04); }
        return h;
      }
      return n.fbm(x * 0.008, z * 0.008, 4) * 16 + n.noise(x * 0.045, z * 0.045) * 1.4;
    }
    toWorld(base, lx, lz) { const c = Math.cos(base.ry), s = Math.sin(base.ry); return { x: base.x + lx * c + lz * s, z: base.z - lx * s + lz * c }; }
    // a meandering foot trail from the ship's ramp to the plant's front door
    buildPath() {
      const r = this.rng, s = { x: -2.5, z: 8.2 }, e = this.toWorld(this.cbase, 0, 10);
      const dx = e.x - s.x, dz = e.z - s.z, l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l;
      const ctrl = [s];
      for (let k = 1; k <= 4; k++) { const t = k / 5, off = r.range(-22, 22) * Math.sin(t * Math.PI); ctrl.push({ x: s.x + dx * t + nx * off, z: s.z + dz * t + nz * off }); }
      ctrl.push(e);
      const pts = [];
      const P = (i) => ctrl[clamp(i, 0, ctrl.length - 1)];
      for (let i = 0; i < ctrl.length - 1; i++) for (let k = 0; k < 10; k++) {
        const t = k / 10, p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), t2 = t * t, t3 = t2 * t;
        pts.push({ x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3), z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3) });
      }
      pts.push(e);
      let acc = 0; pts[0].s = 0;
      for (let i = 1; i < pts.length; i++) { acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); pts[i].s = acc; }
      for (const p of pts) p.t = p.s / acc;
      this.path = pts;
    }
    pathInfo(x, z) {
      const P = this.path; let bd = Infinity, bt = 0;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
        const u = clamp(((x - a.x) * ex + (z - a.z) * ez) / l2, 0, 1);
        const d = Math.hypot(x - (a.x + ex * u), z - (a.z + ez * u));
        if (d < bd) { bd = d; bt = lerp(a.t, b.t, u); }
      }
      return { d: bd, t: bt };
    }
    pathPoint(t) {
      const P = this.path;
      for (let i = 0; i < P.length - 1; i++) if (P[i + 1].t >= t) { const u = (t - P[i].t) / ((P[i + 1].t - P[i].t) || 1); return { x: lerp(P[i].x, P[i + 1].x, u), z: lerp(P[i].z, P[i + 1].z, u), dx: P[i + 1].x - P[i].x, dz: P[i + 1].z - P[i].z }; }
      const l = P[P.length - 1]; return { x: l.x, z: l.z, dx: 1, dz: 0 };
    }
    height(x, z) {
      let h = this.baseH(x, z) - this.base0;
      const dc = Math.hypot(x, z);
      if (dc > 140) h += Math.min(26, (dc - 140) * (dc - 140) * 0.03);
      const p = this.pathInfo(x, z);
      if (p.d < 7) h = lerp(h, lerp(SHIP.ground, this.entrance.h, p.t), sstep(7, 2.5, p.d) * 0.85);
      for (const f of this.flats) { const d = Math.hypot(x - f.x, z - f.z); h = lerp(h, f.h, sstep(f.r2, f.r, d)); }
      // supply-pod craters: a bowl blown out of the ground with a lip of thrown-up earth
      for (const c of this.impacts) {
        const q = Math.hypot(x - c.x, z - c.z) / c.r; if (q > 1.7) continue;
        if (q < 1) h -= c.d * Math.pow(1 - q * q, 1.4);
        h += c.d * 0.3 * Math.exp(-((q - 1.0) ** 2) / 0.05);
      }
      return h;
    }
    // is this spot free of trees, rocks and anything else solid, within rad?
    freeAt(x, z, rad) {
      for (const c of this.cols) if (Math.hypot(c.x - x, c.z - z) < c.r + rad) return false;
      for (const o of this.obbs) if (Math.hypot(o.x - x, o.z - z) < o.hw + o.hd + rad) return false;
      return true;
    }
    // a supply pod came down here: carve the crater (the coarse terrain dips out of the way; a finely meshed, scorched
    // bowl is laid over it), and keep anything from growing in it
    addCrater(x, z, r, d) {
      this.impacts.push({ x, z, r, d });
      // (coarse vertices inside rd sink well below the bowl; the bowl reaches a full grid diagonal past them, so no
      // coarse triangle that dips can show outside it)
      const rd = r + 0.6, R = rd + 3.0, g = this.terrainGeo, pos = g.attributes.position, col = g.attributes.color, G2 = this.grid;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i), vz = pos.getZ(i), q = Math.hypot(vx - x, vz - z); if (q > R + 2.2) continue;
        const h = this.height(vx, vz);
        pos.setY(i, h - (q < rd ? 0.4 : 0)); G2.h[i] = h; if (q < r * 1.5) G2.bare[i] = 1;
      }
      pos.needsUpdate = true; g.computeVertexNormals();
      // the bowl: a fine grid following the ground exactly, coloured from the ground around it and scorched inward
      const n = 36, bg = new THREE.PlaneGeometry(R * 2, R * 2, n, n); bg.rotateX(-Math.PI / 2);
      const bp = bg.attributes.position, buv = bg.attributes.uv, bc = new Float32Array(bp.count * 3);
      const N = G2.n, cell = G2.size / (N - 1);
      const sampleCol = (vx, vz) => {
        const fx = clamp((vx + G2.size / 2) / cell, 0, N - 1.001), fz = clamp((vz + G2.size / 2) / cell, 0, N - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
        const at = (a, b, k) => col.getComponent((b * N + a), k);
        return [0, 1, 2].map((k) => lerp(lerp(at(i, j, k), at(i + 1, j, k), u), lerp(at(i, j + 1, k), at(i + 1, j + 1, k), u), v));
      };
      for (let i = 0; i < bp.count; i++) {
        const vx = bp.getX(i) + x, vz = bp.getZ(i) + z, q = Math.hypot(vx - x, vz - z) / r;
        bp.setX(i, vx); bp.setZ(i, vz); bp.setY(i, this.height(vx, vz) + 0.01); buv.setXY(i, vx / 5, vz / 5);
        const c = sampleCol(vx, vz), burn = sstep(1.15, 0.25, q), lip = Math.exp(-((q - 1.0) ** 2) / 0.04) * 0.35;
        const soil = [0.42, 0.34, 0.27];
        for (let k = 0; k < 3; k++) { let v = lerp(c[k], soil[k], lip); v = lerp(v, [0.1, 0.085, 0.075][k], burn * 0.85); bc[i * 3 + k] = v; }
      }
      bg.setAttribute('color', new THREE.BufferAttribute(bc, 3)); bg.computeVertexNormals();
      const m = this.terrainMat.clone(); m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
      const bowl = new THREE.Mesh(bg, m); bowl.receiveShadow = true; this.group.add(bowl);
      this.coverAt = null;   // regrow the ground cover around here without the crater
      return bowl;
    }
    addCircle(x, z, r) { const c = { x, z, r }; this.cols.push(c); const k = Math.floor(x / 10) + ',' + Math.floor(z / 10); let l = this.hash.get(k); if (!l) this.hash.set(k, (l = [])); l.push(c); }
    addObb(x, z, hw, hd, ry) { this.obbs.push({ x, z, hw, hd, ry }); }
    collide(p, rad) {
      let hit = false;
      const ci = Math.floor(p.x / 10), cj = Math.floor(p.z / 10);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const l = this.hash.get((ci + a) + ',' + (cj + b)); if (!l) continue;
        for (const c of l) {
          const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + rad;
          if (d < m && d > 1e-4) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; hit = true; }
        }
      }
      for (const o of this.obbs) { const reach = o.hw + o.hd + rad + 1; if (Math.abs(p.x - o.x) < reach && Math.abs(p.z - o.z) < reach) if (obbCollide(p, rad, o)) hit = true; }
      const dc = Math.hypot(p.x, p.z);
      if (dc > 160) { p.x *= 160 / dc; p.z *= 160 / dc; hit = true; }
      return hit;
    }
    clearOf(x, z, m) {
      if (Math.hypot(x, z) < 30) return false;
      if (Math.hypot(x - this.center.x, z - this.center.z) < 56 + m) return false;
      if (Math.hypot(x - this.fire.x, z - this.fire.z) < 11) return false;
      if (this.pathInfo(x, z).d < 5.5 + m) return false;
      if (this.water != null && this.height(x, z) < this.water - 0.6) return false;
      return Math.hypot(x, z) < 165;
    }
    buildLand() {
      const grp = new THREE.Group(); grp.name = 'exterior';
      const r = this.rng;
      // ---- terrain ----
      const size = 380, seg = 190;
      const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, uv = geo.attributes.uv, cols = new Float32Array(pos.count * 3);
      // coarse grids (2 m) kept for ground cover placement: terrain height and where nothing may grow
      this.grid = { n: seg + 1, size, h: new Float32Array(pos.count), bare: new Float32Array(pos.count) };
      const trails = new Float32Array(pos.count), yards = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), h = this.height(x, z);
        pos.setY(i, h); this.grid.h[i] = h;
        uv.setXY(i, x / 5, z / 5);
        trails[i] = sstep(3.2, 1.2, this.pathInfo(x, z).d) * (0.75 + 0.25 * this.noise.noise(x * 0.4, z * 0.4));
        yards[i] = sstep(48, 30, Math.hypot(x - this.center.x, z - this.center.z));
        const pads = Math.max(sstep(19, 14, Math.hypot(x, z)), sstep(8, 5, Math.hypot(x - this.fire.x, z - this.fire.z)));
        this.grid.bare[i] = Math.max(sstep(0.15, 0.45, trails[i]), sstep(0.3, 0.7, yards[i]), pads);
      }
      geo.computeVertexNormals();
      const nrm = geo.attributes.normal, BI = this.biome, P = BI.ground, W = this.water;
      const mix = (c, k, t) => { c[0] = lerp(c[0], k[0], t); c[1] = lerp(c[1], k[1], t); c[2] = lerp(c[2], k[2], t); };
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
        // layered ground: the site's base colours, darker damp earth in the hollows, moss, bare rock on the steep bits
        const n1 = this.noise.noise(x * 0.06 + 40, z * 0.06) * 0.5 + 0.5, n2 = this.noise.noise(x * 0.17 - 9, z * 0.17 + 3) * 0.5 + 0.5;
        const n3 = this.noise.fbm(x * 0.02 + 70, z * 0.02 - 30, 3) * 0.5 + 0.5;
        let damp_ = sstep(-1.5, -5, y) * 0.6 + sstep(0.62, 0.8, n3) * 0.5;
        if (W != null) damp_ = Math.max(damp_, sstep(W + 0.7, W - 0.1, y));       // mud at the waterline
        const moss = sstep(0.55, 0.75, n2) * (1 - damp_ * 0.5);
        const rock = sstep(0.9, 0.78, nrm.getY(i));
        const c = [lerp(P.a[0], P.b[0], n1), lerp(P.a[1], P.b[1], n1), lerp(P.a[2], P.b[2], n1)];
        mix(c, P.moss, moss * 0.6); mix(c, P.damp, Math.min(1, damp_)); mix(c, P.rock, rock);
        // canyon walls show their strata
        if (BI.relief === 'canyon') { const band = 0.9 + 0.12 * Math.sin(y * 2.6 + this.noise.noise(x * 0.03, z * 0.03) * 2); c[0] *= band; c[1] *= band * 0.98; c[2] *= band * 0.95; }
        mix(c, P.trail, trails[i]); mix(c, P.yard, yards[i] * 0.7);
        cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2];
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const tmat = new THREE.MeshStandardMaterial({ map: TEX.get(BI.terrainTex), roughness: W != null ? 0.75 : 1, vertexColors: true });
      const terrain = new THREE.Mesh(geo, tmat); terrain.receiveShadow = true; grp.add(terrain);
      this.terrainGeo = geo; this.terrainMat = tmat;
      // the marsh: one sheet of dark standing water fills every hollow below the waterline
      if (W != null) {
        const wm = new THREE.MeshStandardMaterial({ color: 0x18221c, roughness: 0.06, metalness: 0.65, transparent: true, opacity: 0.88 });
        const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size), wm); water.rotation.x = -Math.PI / 2; water.position.y = W; water.receiveShadow = true; grp.add(water);
      }
      // ---- dead forest: branching trees and snags that creak in the wind ----
      this.windU = { value: 0 };
      // the ship's own wind: the downwash of its lift jets, and the blast when its mains fire, shoving everything that
      // grows away from where it comes from (xy: that spot, z: how hard, w: how far it reaches)
      this.blastU = { value: new THREE.Vector4(0, 0, 0, 20) };
      // (a push in metres, away from the blast and shivering with it, given in the instance's own frame)
      const BLAST = this.blastGL = `uniform vec4 uBlast;
        vec3 blastPush(vec3 at, float k) {
          vec2 d = at.xz - uBlast.xy; float r = length(d) + 0.001;
          float s = uBlast.z * exp(-r / uBlast.w) * (0.8 + 0.2 * sin(uWind * 9.0 + r * 0.7)) * k;
          return inverse(mat3(instanceMatrix)) * vec3(d.x / r * s, -0.25 * s, d.y / r * s);
        }\n`;
      const swayMat = (base) => {
        const m = base.clone();
        m.onBeforeCompile = (sh) => {
          sh.uniforms.uWind = this.windU; sh.uniforms.uBlast = this.blastU;
          sh.vertexShader = 'uniform float uWind;\n#ifdef USE_INSTANCING\n' + BLAST + '#endif\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            #ifdef USE_INSTANCING
              vec3 tip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
              float bend = pow(max(position.y, 0.0) / 10.0, 2.0);
              float gust = sin(uWind * 0.9 + tip.x * 0.05 + tip.z * 0.04) * 0.6 + sin(uWind * 2.3 + tip.z * 0.2) * 0.25;
              transformed.x += gust * 0.28 * bend; transformed.z += gust * 0.16 * bend;
              transformed += blastPush(tip, 1.4 * bend);
            #endif`);
        };
        m.customProgramCacheKey = () => 'sway';
        return m;
      };
      const T = BI.trees;
      const barkBase = MATS.get('bark').clone(); if (T.bark != null) barkBase.color = new THREE.Color(T.bark);
      const treeMat = swayMat(barkBase);
      const charMat = swayMat(new THREE.MeshStandardMaterial({ color: 0x141211, roughness: 0.95, map: TEX.get('bark') }));
      const mossMat = swayMat(new THREE.MeshStandardMaterial({ color: 0x3a4630, roughness: 1, side: THREE.DoubleSide }));
      // kinds: 2 snags, 2 broadleaf, 2 swamp trees (with hanging moss)
      const kinds = [];
      for (let v = 0; v < 2; v++) kinds.push({ geo: this.snagGeo(new RNG(this.seed + v * 53)) });
      for (let v = 0; v < 2; v++) kinds.push({ geo: this.treeGeo(new RNG(this.seed + v * 31 + 62)) });
      for (let v = 0; v < 2; v++) kinds.push(T.swamp > 0 ? this.swampGeo(new RNG(this.seed + v * 71 + 9)) : { geo: null });
      const lists = kinds.map(() => ({ bark: [], char: [] }));
      let count = 0;
      for (let t = 0; t < T.n * 6 && count < T.n; t++) {
        const x = r.range(-165, 165), z = r.range(-165, 165);
        if (!this.clearOf(x, z, 0)) continue;
        if (this.noise.noise(x * 0.02, z * 0.02) < -0.15 && r.chance(0.7)) continue;
        const roll = r.next(), v = roll < T.snag ? r.int(0, 1) : roll < T.snag + T.swamp ? r.int(4, 5) : r.int(2, 3), s = r.range(0.8, 1.4);
        (r.chance(T.charred) ? lists[v].char : lists[v].bark).push({ x, z, s, ry: r.range(0, TAU), lean: r.range(-0.07, 0.07) }); count++;
        this.addCircle(x, z, 0.32 * s);
      }
      const plant = (geo, list, m) => {
        if (!list.length || !geo) return;
        const im = new THREE.InstancedMesh(geo, m, list.length);
        list.forEach((p, n) => im.setMatrixAt(n, mat(p.x, this.height(p.x, p.z) - 0.3, p.z, p.lean, p.ry, p.lean, p.s, p.s, p.s)));
        im.castShadow = true; im.receiveShadow = true; grp.add(im);
      };
      kinds.forEach((k, v) => { plant(k.geo, lists[v].bark, treeMat); plant(k.geo, lists[v].char, charMat); if (k.moss) plant(k.moss, lists[v].bark, mossMat); });
      this.trees = lists.flatMap((l) => [...l.bark, ...l.char]);
      this.buildDeadwood(grp);
      // ---- rocks ----
      const rockGeos = [0, 1, 2].map((v) => {
        const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, rr = new RNG(this.seed * 3 + v);
        const map = new Map();
        for (let i = 0; i < p.count; i++) {
          const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
          if (!map.has(key)) map.set(key, rr.range(0.75, 1.25));
          const s = map.get(key); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s);
        }
        g.computeVertexNormals(); return g;
      });
      const RK = BI.rocks;
      this.rockMat = MATS.get('rock').clone(); if (RK.tint != null) this.rockMat.color = new THREE.Color(RK.tint);
      const rps = [[], [], []];
      for (let t = 0; t < RK.n * 5 && rps[0].length + rps[1].length + rps[2].length < RK.n; t++) {
        const x = r.range(-165, 165), z = r.range(-165, 165);
        if (!this.clearOf(x, z, 1)) continue;
        const s = r.chance(RK.big) ? r.range(2, 4.5) : r.range(0.4, 1.6);
        rps[r.int(0, 2)].push({ x, z, s, ry: r.range(0, TAU), sy: 1 });
        if (s > 0.7) this.addCircle(x, z, s * 0.85);
      }
      // rock spires: tall weathered pillars standing out of the canyon floor (and out of the ash)
      for (let t = 0; t < RK.spires * 8 && t < 400; t++) {
        if (rps.reduce((n, l) => n + l.filter((p) => p.sy > 1).length, 0) >= RK.spires) break;
        const x = r.range(-160, 160), z = r.range(-160, 160);
        if (!this.clearOf(x, z, 4)) continue;
        const s = r.range(1.6, 3.4);
        rps[r.int(0, 2)].push({ x, z, s, ry: r.range(0, TAU), sy: r.range(3.5, 7) });
        this.addCircle(x, z, s * 0.9);
      }
      rps.forEach((list, v) => {
        if (!list.length) return;
        const im = new THREE.InstancedMesh(rockGeos[v], this.rockMat, list.length);
        list.forEach((p, n) => im.setMatrixAt(n, mat(p.x, this.height(p.x, p.z) - p.s * 0.25 + (p.sy > 1 ? p.s * p.sy * 0.55 : 0), p.z, 0, p.ry, 0, p.s, p.s * p.sy, p.s)));
        im.castShadow = true; im.receiveShadow = true; grp.add(im);
      });
      this.group = grp;
      return grp;
    }
    // (in two halves, so a landing can build them a frame apart)
    build() { this.buildLand(); return this.buildRest(); }
    buildRest() {
      const grp = this.group;
      this.buildComplex(grp);
      this.buildFireExit(grp);
      this.buildPylons(grp);
      this.buildWrecks(grp);
      this.buildWorldExtras(grp);
      this.buildLampPosts(grp);
      this.buildSky(grp);
      this.buildRain(grp);
      this.buildGroundCover(grp);
      this.buildMotes(grp);
      this.group = grp;
      return grp;
    }
    // a tapered, slightly crooked limb from p along dir; returns the far end
    limb(parts, p, dir, len, r0, r1, sides) {
      const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true); g.translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      parts.push({ geo: g, matrix: new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)) });
      return p.clone().addScaledVector(dir, len * 0.97);
    }
    // a dead broadleaf: crooked trunk, recursive branches and twigs
    treeGeo(rr) {
      const parts = [], V3 = (x, y, z) => new THREE.Vector3(x, y, z);
      const jitter = (d, a) => d.add(V3(rr.range(-a, a), rr.range(-a * 0.4, a * 0.6), rr.range(-a, a))).normalize();
      const grow = (p, dir, len, r, depth) => {
        const n = depth === 0 ? 5 : depth === 1 ? 3 : 2;
        let cur = p.clone(), d = dir.clone(), rad = r;
        for (let i = 0; i < n; i++) {
          const r1 = rad * (depth === 0 ? 0.8 : 0.68);
          jitter(d, depth === 0 ? 0.13 : 0.32); if (depth > 0) d.y -= 0.05 * depth;
          d.normalize();
          cur = this.limb(parts, cur, d, len / n, rad, Math.max(0.006, r1), depth === 0 ? 7 : depth === 1 ? 5 : 4);
          rad = r1;
          if (depth < 2 && (depth > 0 || i >= 1)) {
            const kids = depth === 0 ? rr.int(1, 2) : rr.chance(0.75) ? 1 : 0;
            for (let k = 0; k < kids; k++) {
              const a = rr.range(0, TAU), out = V3(Math.cos(a), 0, Math.sin(a));
              const cd = d.clone().multiplyScalar(depth === 0 ? 0.35 : 0.6).addScaledVector(out, 1).add(V3(0, rr.range(0.15, 0.6), 0)).normalize();
              grow(cur, cd, len * (depth === 0 ? rr.range(0.32, 0.5) * (1 - i / n * 0.45) : rr.range(0.35, 0.55)), rad * 0.62, depth + 1);
            }
          }
        }
        // a broken-off tip
        if (depth === 0) this.limb(parts, cur, d, 0.5, rad, 0.01, 5);
      };
      grow(V3(0, -0.2, 0), V3(rr.range(-0.06, 0.06), 1, rr.range(-0.06, 0.06)).normalize(), rr.range(8, 12), rr.range(0.26, 0.36), 0);
      return mergeGeoList(parts);
    }
    // a dead conifer snag: tall straight trunk bristling with short drooping stubs
    snagGeo(rr) {
      const parts = [], h = rr.range(11, 16), V3 = (x, y, z) => new THREE.Vector3(x, y, z);
      let p = V3(0, -0.2, 0); const d = V3(0, 1, 0);
      for (let i = 0; i < 4; i++) { d.x += rr.range(-0.03, 0.03); d.z += rr.range(-0.03, 0.03); d.normalize(); p = this.limb(parts, p, d.clone(), h / 4, 0.3 * (1 - i * 0.22), 0.3 * (1 - (i + 1) * 0.22) + 0.01, 7); }
      const n = rr.int(18, 28);
      for (let b = 0; b < n; b++) {
        const t = rr.range(0.22, 0.95), y = h * t, a = rr.range(0, TAU);
        const len = (1 - t) * rr.range(1.4, 2.6) + 0.25;
        const dir = V3(Math.cos(a), rr.range(-0.55, -0.1), Math.sin(a)).normalize();
        this.limb(parts, V3(0, y, 0), dir, len, 0.05 * (1.2 - t), 0.008, 4);
      }
      return mergeGeoList(parts);
    }
    // a swamp tree: a short leaning trunk on buttress roots, a few long limbs that spread and droop, moss hanging off them
    swampGeo(rr) {
      const parts = [], moss = [], V3 = (x, y, z) => new THREE.Vector3(x, y, z);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + rr.range(-0.3, 0.3); this.limb(parts, V3(Math.cos(a) * 0.9, -0.35, Math.sin(a) * 0.9), V3(-Math.cos(a) * 0.6, 1, -Math.sin(a) * 0.6).normalize(), 1.4, 0.15, 0.05, 5); }
      let p = V3(0, -0.3, 0); const d = V3(rr.range(-0.25, 0.25), 1, rr.range(-0.25, 0.25)).normalize(), H = rr.range(3.5, 5.5);
      for (let i = 0; i < 3; i++) { d.add(V3(rr.range(-0.12, 0.12), 0, rr.range(-0.12, 0.12))).normalize(); p = this.limb(parts, p, d.clone(), H / 3, 0.42 - i * 0.08, 0.34 - i * 0.08, 8); }
      const nl = rr.int(3, 5);
      for (let k = 0; k < nl; k++) {
        const a = (k / nl) * TAU + rr.range(-0.4, 0.4), L = rr.range(3.5, 6);
        let q = p.clone(), rad = 0.2; const dd = V3(Math.cos(a), rr.range(0.3, 0.7), Math.sin(a)).normalize();
        for (let s = 0; s < 4; s++) {
          dd.y -= 0.2; dd.normalize();
          q = this.limb(parts, q, dd.clone(), L / 4, rad, rad * 0.75, 6); rad *= 0.75;
          for (let m = 0; m < 2; m++) { const len = rr.range(0.6, 1.9), g = new THREE.PlaneGeometry(0.14, len); g.translate(0, -len / 2, 0); g.rotateY(rr.range(0, Math.PI)); moss.push({ geo: g, matrix: new THREE.Matrix4().makeTranslation(q.x + rr.range(-0.2, 0.2), q.y, q.z + rr.range(-0.2, 0.2)) }); }
        }
      }
      return { geo: mergeGeoList(parts), moss: mergeGeoList(moss) };
    }
    // fallen logs and stumps between the trees
    buildDeadwood(grp) {
      const r = new RNG(this.seed + 404), logs = [], stumps = [], DW = this.biome.deadwood;
      for (let t = 0; t < DW.logs * 12 && logs.length < DW.logs; t++) {
        const x = r.range(-160, 160), z = r.range(-160, 160);
        if (!this.clearOf(x, z, 3)) continue;
        logs.push({ x, z, len: r.range(3, 6.5), rad: r.range(0.16, 0.3), ry: r.range(0, TAU) });
      }
      for (let t = 0; t < DW.stumps * 10 && stumps.length < DW.stumps; t++) {
        const x = r.range(-160, 160), z = r.range(-160, 160);
        if (!this.clearOf(x, z, 1)) continue;
        stumps.push({ x, z, s: r.range(0.7, 1.3), ry: r.range(0, TAU) });
      }
      const logGeo = new THREE.CylinderGeometry(0.82, 1, 1, 9, 2); logGeo.rotateZ(Math.PI / 2);
      const stumpGeo = (() => {
        const parts = [{ geo: new THREE.CylinderGeometry(0.28, 0.4, 0.7, 8), matrix: mat(0, 0.2, 0) }];
        for (let k = 0; k < 4; k++) parts.push({ geo: new THREE.CylinderGeometry(0.03, 0.12, 0.7, 4), matrix: mat(0, 0, 0, 0, k * 1.6, 1.25) });
        parts.push({ geo: new THREE.ConeGeometry(0.22, 0.45, 6), matrix: mat(0.06, 0.75, 0, 0, 0, 0.25) });
        return mergeGeoList(parts);
      })();
      const bark = DW.charred ? new THREE.MeshStandardMaterial({ color: 0x161412, roughness: 0.95, map: TEX.get('bark') }) : MATS.get('bark');
      const li = new THREE.InstancedMesh(logGeo, bark, logs.length);
      logs.forEach((l, n) => {
        const c = Math.cos(l.ry), s = Math.sin(l.ry), hx = c * l.len / 2, hz = -s * l.len / 2;
        const h0 = this.height(l.x - hx, l.z - hz), h1 = this.height(l.x + hx, l.z + hz);
        li.setMatrixAt(n, mat(l.x, (h0 + h1) / 2 + l.rad * 0.6, l.z, 0, l.ry, Math.atan2(h1 - h0, l.len), l.len, l.rad, l.rad));
        this.addObb(l.x, l.z, l.len / 2, l.rad + 0.05, l.ry);
      });
      li.castShadow = true; li.receiveShadow = true; grp.add(li);
      const si = new THREE.InstancedMesh(stumpGeo, bark, stumps.length);
      stumps.forEach((p, n) => { si.setMatrixAt(n, mat(p.x, this.height(p.x, p.z) - 0.1, p.z, 0, p.ry, 0, p.s, p.s, p.s)); this.addCircle(p.x, p.z, 0.38 * p.s); });
      si.castShadow = true; si.receiveShadow = true; grp.add(si);
    }
    // bilinear sample of a 2 m terrain grid
    gridAt(arr, x, z) {
      const G = this.grid, f = (G.n - 1) / G.size;
      const gx = clamp((x + G.size / 2) * f, 0, G.n - 1.001), gz = clamp((z + G.size / 2) * f, 0, G.n - 1.001);
      const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz, i = iz * G.n + ix;
      return lerp(lerp(arr[i], arr[i + 1], tx), lerp(arr[i + G.n], arr[i + G.n + 1], tx), tz);
    }
    // dry grass and weeds (wind-swayed) plus pebbles, kept in a ring around the camera and refilled as it moves
    buildGroundCover(grp) {
      const [c, g] = TEX.canvas(128, 128), rr = new RNG(this.seed + 8), kind = this.biome.grass.kind;
      g.clearRect(0, 0, 128, 128);
      const blade = (x0, h, bend, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, 128); g.quadraticCurveTo(x0 + bend * 0.3, 128 - h * 0.6, x0 + bend, 128 - h); g.stroke(); };
      if (kind === 'reeds') {
        // tall straight reeds, a few bulrush heads
        for (let i = 0; i < 40; i++) {
          const x0 = rr.range(8, 120), h = rr.range(80, 126), bend = rr.range(-8, 8), v = rr.range(-16, 16) | 0;
          blade(x0, h, bend, rr.range(1.4, 2.6), rr.chance(0.5) ? `rgb(${86 + v},${100 + v},${58 + v})` : `rgb(${120 + v},${112 + v},${74 + v})`);
          if (rr.chance(0.22)) { g.fillStyle = `rgb(${62 + v},${40 + v},${26 + v})`; g.beginPath(); g.ellipse(x0 + bend, 128 - h + 8, 2.6, 9, 0, 0, TAU); g.fill(); }
        }
      } else if (kind === 'scrub') {
        // low grey-green desert scrub: woody twigs with tiny leaves
        for (let i = 0; i < 26; i++) {
          const x0 = rr.range(30, 98), a = rr.range(-1.2, 1.2), l = rr.range(30, 70), v = rr.range(-12, 12) | 0;
          g.strokeStyle = `rgb(${110 + v},${100 + v},${84 + v})`; g.lineWidth = rr.range(1.2, 2.2);
          const ex = x0 + Math.sin(a) * l, ey = 128 - Math.cos(a) * l * 0.9; g.beginPath(); g.moveTo(64 + (x0 - 64) * 0.2, 128); g.lineTo(ex, ey); g.stroke();
          for (let k = 0; k < 4; k++) { g.fillStyle = `rgb(${120 + v},${128 + v},${96 + v})`; g.fillRect(lerp(x0, ex, k / 4) + rr.range(-3, 3), lerp(128, ey, k / 4) + rr.range(-3, 3), 3, 2); }
        }
      } else if (kind === 'ash') {
        // burnt stubble: black stalks, a few grey tips
        for (let i = 0; i < 22; i++) { const v = rr.range(-8, 8) | 0; blade(rr.range(14, 114), rr.range(30, 90), rr.range(-14, 14), rr.range(1.2, 2.4), rr.chance(0.75) ? `rgb(${26 + v},${24 + v},${22 + v})` : `rgb(${92 + v},${88 + v},${84 + v})`); }
      } else {
        for (let i = 0; i < 46; i++) {
          const x0 = rr.range(10, 118), h = rr.range(55, 124), bend = rr.range(-22, 22), w = rr.range(1.5, 3.4);
          const v = rr.range(-18, 18) | 0, dry = rr.chance(0.7);
          blade(x0, h, bend, w, dry ? `rgb(${150 + v},${132 + v},${84 + v})` : `rgb(${92 + v},${104 + v},${60 + v})`);
          if (rr.chance(0.25)) { g.fillStyle = `rgb(${130 + v},${110 + v},${70 + v})`; g.beginPath(); g.ellipse(x0 + bend, 128 - h, 2.5, 6, 0, 0, TAU); g.fill(); }
        }
      }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      // three crossed cards; every normal points up so the tuft is lit like the ground it grows from
      const cards = [];
      for (let k = 0; k < 3; k++) { const p = new THREE.PlaneGeometry(0.6, 0.5); p.translate(0, 0.25, 0); p.rotateY(k * Math.PI / 3); cards.push({ geo: p, matrix: new THREE.Matrix4() }); }
      const tuft = mergeGeoList(cards), tn = tuft.attributes.normal;
      for (let i = 0; i < tn.count; i++) tn.setXYZ(i, 0, 1, 0);
      const gm = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide });
      gm.onBeforeCompile = (sh) => {
        sh.uniforms.uWind = this.windU; sh.uniforms.uBlast = this.blastU;
        sh.vertexShader = 'uniform float uWind;\n#ifdef USE_INSTANCING\n' + this.blastGL + '#endif\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
            float sw = sin(uWind * 1.9 + ip.x * 0.31 + ip.z * 0.23) * 0.65 + sin(uWind * 4.3 + ip.x * 1.7) * 0.2;
            float k = uv.y * uv.y; transformed.x += sw * 0.12 * k; transformed.z += sw * 0.06 * k;
            transformed += blastPush(ip, 0.38 * k);
          #endif`);
        // both faces of a card take the upward normal (a flipped back face would render black)
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;');
      };
      this.grass = new THREE.InstancedMesh(tuft, gm, 5200); this.grass.count = 0;
      this.grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.grass.frustumCulled = false; this.grass.receiveShadow = true;
      this.grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(5200 * 3), 3);
      grp.add(this.grass);
      const pg = new THREE.IcosahedronGeometry(1, 0); pg.scale(1, 0.5, 1);
      this.pebbles = new THREE.InstancedMesh(pg, this.rockMat || MATS.get('rock'), 900); this.pebbles.count = 0;
      this.pebbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.pebbles.frustumCulled = false; this.pebbles.receiveShadow = true;
      grp.add(this.pebbles);
      this.coverAt = null;
    }
    fillGroundCover(cx, cz) {
      this.coverAt = { x: cx, z: cz };
      const R = 36, cell = 1.05, gi = this.grass, pi = this.pebbles, m4 = new THREE.Matrix4(), col = new THREE.Color();
      let ng = 0, np = 0;
      const i0 = Math.floor((cx - R) / cell), i1 = Math.ceil((cx + R) / cell), j0 = Math.floor((cz - R) / cell), j1 = Math.ceil((cz + R) / cell);
      const hash = (a, b, s) => { let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(s, 2246822519) ^ this.seed; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const x = (i + hash(i, j, 1)) * cell, z = (j + hash(i, j, 2)) * cell, d = Math.hypot(x - cx, z - cz);
        if (d > R) continue;
        const bare = this.gridAt(this.grid.bare, x, z);
        // grass grows in patches: thick in some places, gone in others
        const patch = this.noise.noise(x * 0.07, z * 0.07) * 0.5 + this.noise.noise(x * 0.23 + 5, z * 0.23) * 0.2;
        const GR = this.biome.grass, W = this.water;
        const y = this.gridAt(this.grid.h, x, z);
        let dens = GR.dens - bare * 0.9 + patch * 0.6;
        // reeds crowd the waterline and stand in the shallows, never out in deep water
        if (W != null) { if (y < W - 0.35) dens = -1; else dens += sstep(W + 1.0, W, y) * 0.6; }
        if (hash(i, j, 3) < dens && ng < 5200) {
          const s = (0.5 + hash(i, j, 4) * 0.8) * sstep(R, R - 7, d);
          m4.makeRotationY(hash(i, j, 5) * TAU); m4.scale(new THREE.Vector3(s, s * (0.7 + hash(i, j, 6) * 0.6) * GR.h, s)); m4.setPosition(x, y - 0.05, z);
          gi.setMatrixAt(ng, m4);
          // toned to sit in the ground colour rather than glow on top of it
          const tint = hash(i, j, 7), v = 0.5 + tint * 0.22;
          gi.setColorAt(ng, col.setRGB(v, v * 0.98, v * 0.9));
          ng++;
        }
        if (d < 26 && hash(i, j, 8) < 0.07 + bare * 0.18 && np < 900) {
          const s = 0.03 + Math.pow(hash(i, j, 9), 3) * 0.16;
          m4.makeRotationY(hash(i, j, 10) * TAU); m4.scale(new THREE.Vector3(s, s, s * (0.7 + hash(i, j, 11) * 0.6))); m4.setPosition(x, y, z);
          pi.setMatrixAt(np++, m4);
        }
      }
      gi.count = ng; pi.count = np;
      gi.instanceMatrix.needsUpdate = true; gi.instanceColor.needsUpdate = true; pi.instanceMatrix.needsUpdate = true;
    }
    // spores and ash drifting on the wind around the camera
    buildMotes(grp) {
      const n = 520, p = new Float32Array(n * 3), s = new Float32Array(n), rr = new RNG(this.seed + 61);
      for (let i = 0; i < n; i++) { p.set([rr.range(-14, 14), rr.range(-6, 10), rr.range(-14, 14)], i * 3); s[i] = rr.next(); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
      // what drifts depends on the world: spores, fireflies over the marsh, canyon dust, falling ash and embers
      const M = { spores: [1, 0.05, 0, 0], fireflies: [0.25, 0.0, 1, 0], dust: [2.4, 0.0, 0, 0], ash: [0.45, 0.7, 0, 0.07] }[this.biome.motes] || [1, 0.05, 0, 0];
      this.moteMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color(0.8, 0.8, 0.75) }, uOp: { value: 0.5 }, uWind: { value: M[0] }, uFall: { value: M[1] }, uGlow: { value: 0 }, uEmber: { value: M[3] }, uFly: { value: M[2] }, uShipInv: this.shipInv },
        vertexShader: `uniform float uTime, uWind, uFall, uGlow, uEmber, uFly; uniform vec3 uCam; uniform mat4 uShipInv; attribute float aSeed; varying float vA; varying float vE; varying float vB;
          void main(){
            vec3 p = position + vec3(uTime * (0.7 + aSeed * 0.5) * uWind, sin(uTime * 0.4 + aSeed * 30.0) * 0.6 - uTime * (0.05 + uFall * (0.6 + aSeed * 0.8)), uTime * 0.3 * uWind + sin(uTime * 0.7 + aSeed * 11.0) * 0.5);
            // fireflies wander in loops, low over the ground
            p += uFly * vec3(sin(uTime * 0.31 + aSeed * 17.0) * 2.0, sin(uTime * 0.53 + aSeed * 9.0) * 0.7, cos(uTime * 0.27 + aSeed * 23.0) * 2.0);
            p.xz = mod(p.xz - uCam.xz + 14.0, 28.0) - 14.0 + uCam.xz;
            float yr = mix(16.0, 4.0, uFly); p.y = mod(p.y - uCam.y + 6.0, yr) - mix(6.0, 1.8, uFly) + uCam.y;
            vec4 mv = viewMatrix * vec4(p, 1.0); float d = -mv.z;
            vE = step(1.0 - uEmber, aSeed);
            vB = mix(1.0, pow(max(0.0, sin(uTime * (1.3 + aSeed * 2.2) + aSeed * 40.0)), 4.0), uGlow);
            vA = smoothstep(14.0, 6.0, length(p - uCam)) * smoothstep(0.4, 1.5, d) * (0.4 + aSeed * 0.6);
            // nothing drifts through the cabin
            vec3 l = (uShipInv * vec4(p, 1.0)).xyz;
            if (l.x > -18.4 && l.x < 12.4 && abs(l.z) < 4.9 && l.y > -0.9 && l.y < 5.0) vA = 0.0;
            gl_Position = projectionMatrix * mv; gl_PointSize = vA > 0.0 ? clamp(5.0 / d, 1.0, 3.0) * (1.0 + uGlow * 0.5 + vE * 0.4) : 0.0; }`,
        fragmentShader: `uniform vec3 uCol; uniform float uOp, uGlow; varying float vA; varying float vE; varying float vB;
          void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
            vec3 c = mix(uCol, vec3(1.7, 2.1, 0.55), uGlow); c = mix(c, vec3(2.6, 0.85, 0.2), vE);
            gl_FragColor = vec4(c, a * vA * uOp * vB * (1.0 + vE)); }`,
        transparent: true, depthWrite: false,
      });
      this.motes = new THREE.Points(g, this.moteMat); this.motes.frustumCulled = false; grp.add(this.motes);
    }
    place(grp, mesh, lx, ly, lz, base, rx = 0, ry = 0, rz = 0) {
      const w = this.toWorld(base, lx, lz);
      mesh.position.set(w.x, base.y + ly, w.z);
      mesh.rotation.set(rx, base.ry + ry, rz, 'YXZ');
      mesh.castShadow = true; mesh.receiveShadow = true;
      grp.add(mesh); return mesh;
    }
    obbLocal(base, lx, lz, hw, hd, ry = 0) { const w = this.toWorld(base, lx, lz); this.addObb(w.x, w.z, hw, hd, base.ry + ry); }
    circLocal(base, lx, lz, rad) { const w = this.toWorld(base, lx, lz); this.addCircle(w.x, w.z, rad); }
    plane(w, h, material) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); }
    // ---------------- the processing plant ----------------
    buildComplex(grp) {
      const b = this.cbase, rr = new RNG(this.seed + 5);
      const B = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      const PL = this.biome.plant;
      // what the place was built from: brick mill, white-clad lab, rust-streaked corrugated pump house, black ruin
      const conc = (w, h) => PL === 'mill' ? MATS.rep('brick', Math.max(1, w / 4), Math.max(1, h / 4))
        : PL === 'lab' ? MATS.rep('labPanel', Math.max(1, w / 6), Math.max(1, h / 6))
        : PL === 'pump' ? MATS.rep('corrugated', Math.max(1, w / 3), Math.max(1, h / 3), 0xa0704e)
        : PL === 'ruin' ? MATS.rep('bunker', Math.max(1, w / 7), Math.max(1, h / 7), 0x5a5550)
        : MATS.rep('bunker', Math.max(1, w / 7), Math.max(1, h / 7));
      const dark = MATS.get('darkmetal'), rust = MATS.get('rust');
      const roof = PL === 'lab' ? MATS.rep('labPanel', 6, 4, 0x9a9c96) : PL === 'mill' ? MATS.rep('corrugated', 12, 8, 0x4a4844) : dark;
      // main hall, wing, tower, rooftop plant
      this.place(grp, B(56, 27, 38, conc(56, 27)), 0, 10.5, -20, b);
      this.place(grp, B(57, 1.2, 39, roof), 0, 24.6, -20, b);
      this.place(grp, B(18, 7, 14, conc(18, 7)), -10, 28.5, -24, b);
      if (PL !== 'mill') this.place(grp, B(9, 4, 9, MATS.get('vent')), 9, 27, -14, b);
      this.place(grp, B(24, 16, 30, conc(24, 16)), -40, 5, -16, b);
      this.place(grp, B(25, 0.8, 31, roof), -40, 13.4, -16, b);
      this.place(grp, B(14, PL === 'ruin' ? 30 : 44, 14, conc(14, 44)), 35, PL === 'ruin' ? 12 : 19, -27, b);
      if (PL !== 'ruin') this.place(grp, B(15, 1, 15, roof), 35, 41.5, -27, b);
      this.obbLocal(b, 0, -20, 28.3, 19.3); this.obbLocal(b, -40, -16, 12.3, 15.3); this.obbLocal(b, 35, -27, 7.3, 7.3);
      // chimneys: one tall brick stack at the mill, slim white exhaust stacks at the lab, rusted stacks at the pumps,
      // a single broken stump in the Hollow
      if (PL === 'mill') {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.8, 46, 20), MATS.rep('brick', 4, 10)); this.place(grp, st, 18, 24 + 23, -34, b);
        for (const y of [30, 46, 66]) this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(2.7 - (y - 24) * 0.019, 2.7 - (y - 24) * 0.019, 0.5, 20), dark), 18, y, -34, b);
        this.blinkLight(grp, b, 18, 70.6, -34, 0xff2010, 2.2);
      } else if (PL === 'lab') {
        for (const [x, z] of [[14, -34], [20, -38]]) {
          this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 30, 16), MATS.rep('labPanel', 2, 5)), x, 24 + 15, z, b);
          for (const y of [48, 52]) this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.2, 16), MATS.rep('painted', 1, 1, 0xa02018)), x, y, z, b);
          this.blinkLight(grp, b, x, 54.6, z, 0xff2010, 2.2);
        }
      } else if (PL === 'ruin') {
        this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 16, 18), MATS.rep('bunker', 2, 3, 0x3a3634)), 16, 24 + 8, -32, b);
        for (let i = 0; i < 4; i++) this.place(grp, B(1.6, rr.range(1.5, 4), 0.8, MATS.rep('bunker', 1, 1, 0x3a3634)), 16 + Math.cos(i * 1.6) * 2, 40 + rr.range(0, 1.5), -32 + Math.sin(i * 1.6) * 2, b, rr.range(-0.4, 0.4), i * 1.6, rr.range(-0.4, 0.4));
      } else {
        for (const [x, z, rad] of [[16, -32, 2.8], [22, -37, 2.4]]) {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.85, rad, 36, 18), MATS.rep('rust', 2, 6)); this.place(grp, st, x, 24 + 18, z, b);
          const top = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.95, rad * 0.95, 1.2, 18), dark); this.place(grp, top, x, 60.4, z, b);
          this.blinkLight(grp, b, x, 61.4, z, 0xff2010, 2.2);
        }
      }
      if (PL !== 'ruin') this.blinkLight(grp, b, 35, 42.6, -27, 0xff2010, 1.7);
      // tanks: a timber water tower at the mill, containment vessels at the lab, settling tanks elsewhere
      if (PL === 'mill') {
        const wt = { x: -38, z: 6 };
        this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 4.5, 20), MATS.rep('wood', 3, 2)), wt.x, 12.6, wt.z, b);
        this.place(grp, new THREE.Mesh(new THREE.ConeGeometry(3.8, 2.2, 20), dark), wt.x, 15.95, wt.z, b);
        for (const y of [11, 12.6, 14.2]) this.place(grp, new THREE.Mesh(new THREE.TorusGeometry(3.42, 0.06, 4, 24), dark), wt.x, y, wt.z, b, Math.PI / 2);
        for (const [dx, dz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) { this.place(grp, B(0.35, 10.4, 0.35, MATS.get('wood')), wt.x + dx, 5.2, wt.z + dz, b); this.circLocal(b, wt.x + dx, wt.z + dz, 0.35); }
        for (const y of [3.5, 7]) { this.place(grp, B(5.2, 0.2, 0.2, MATS.get('wood')), wt.x, y, wt.z - 2.4, b); this.place(grp, B(5.2, 0.2, 0.2, MATS.get('wood')), wt.x, y, wt.z + 2.4, b); }
      } else if (PL === 'lab') {
        const glowG = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 0.6) });
        for (const [x, z] of [[-33, 7], [-44, 4]]) {
          this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 13, 24), MATS.rep('labPanel', 3, 2)), x, 6.5 - 1, z, b);
          this.place(grp, new THREE.Mesh(new THREE.SphereGeometry(3.6, 24, 10, 0, TAU, 0, Math.PI / 2), MATS.rep('labPanel', 3, 1)), x, 11.5, z, b);
          for (const y of [3, 7.5]) this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(3.66, 3.66, 0.5, 24, 1, true), glowG), x, y, z, b);
          this.circLocal(b, x, z, 3.8);
        }
      } else {
        for (const [x, z] of [[-33, 7], [-44, 4]]) {
          const tk = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 15, 24), MATS.rep('rust', 3, 2, PL === 'ruin' ? 0x3a3230 : undefined)); this.place(grp, tk, x, 7.5 - 1, z, b);
          if (PL !== 'ruin') { const cap = new THREE.Mesh(new THREE.SphereGeometry(4.5, 24, 8, 0, TAU, 0, Math.PI / 2), MATS.rep('rust', 3, 1)); cap.scale.y = 0.3; this.place(grp, cap, x, 14, z, b); }
          this.circLocal(b, x, z, 4.7);
        }
      }
      this.buildPlantExtras(grp, b, PL, rr);
      // entrance block, doors, canopy, lamp
      this.place(grp, B(9, 7.5, 3, conc(9, 7.5)), 0, 3.0, 0.2, b);
      this.obbLocal(b, 0, 0.2, 4.6, 1.6);
      this.place(grp, B(3.6, 4.0, 0.12, dark), 0, 1.95, 1.72, b);
      this.place(grp, B(1.48, 3.3, 0.1, MATS.get('door')), -0.76, 1.65, 1.8, b);
      this.place(grp, B(1.48, 3.3, 0.1, MATS.get('door')), 0.76, 1.65, 1.8, b);
      // a pair of long pull handles at the meeting edge of the double doors
      { const hw = []; for (const s of [-1, 1]) DoorKit.pull(hw, s * 0.13, 0.1, 1, 0.85, 1.75, 0.02); this.place(grp, DoorKit.mesh(DoorKit.place(hw, mat(0, 0, 1.8))), 0, 0, 0, b); }
      this.place(grp, B(11, 0.45, 4.6, conc(11, 1)), 0, 6.95, 3.4, b);
      for (const x of [-5.1, 5.1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6.9, 8), dark); this.place(grp, c, x, 3.45, 5.4, b); this.circLocal(b, x, 5.4, 0.3); }
      this.place(grp, B(0.6, 0.18, 0.35, new THREE.MeshBasicMaterial({ color: 0xffb060 })), 0, 6.6, 3.2, b);
      const lp = this.toWorld(b, 0, 3.6);
      this.lights.push({ x: lp.x, y: b.y + 6.2, z: lp.z, color: 0xffa050, power: 1.6, state: 'flicker', phase: 3, zone: 'out', range: 16, lit: 1 });
      // signs (flush with their walls)
      const signMat = (txt, o) => new THREE.MeshStandardMaterial({ map: TEX.sign(txt, o), roughness: 0.85 });
      this.place(grp, this.plane(26, 3.6, signMat(this.biome.sign, { w: 1024, h: 140, size: 96, bg: PL === 'lab' ? '#e2e4de' : PL === 'ruin' ? '#141110' : '#1d1c19', fg: PL === 'lab' ? '#1e3a2e' : PL === 'ruin' ? '#6a1a12' : '#cfc6ae' })), 0, 19.8, -0.96, b);
      this.place(grp, this.plane(7.6, 1.1, signMat('PROCESSING PLANT  ·  SITE ' + (this.site.code || '7'), { w: 1024, h: 148, size: 62, bg: '#2a2a24', fg: '#d8cfb5' })), 0, 5.6, 1.76, b);
      this.place(grp, this.plane(2.0, 1.45, signMat('DANGER\nNO ENTRY\nAFTER DARK', { w: 192, h: 140, size: 26, bg: '#c9a326', fg: '#151515' })), -3.0, 2.2, 1.76, b);
      this.place(grp, this.plane(1.6, 1.2, signMat('HARD HAT\nAREA', { w: 192, h: 140, size: 34, bg: '#2a4a8a', fg: '#e8e8e8' })), 3.2, 2.4, 1.76, b);
      // roll-up doors, windows, pipes, catwalk
      for (const x of [-16, 16]) {
        this.place(grp, this.plane(9, 8, MATS.rep('corrugated', 3, 2, 0x8a8a84)), x, 4, -0.96, b);
        this.place(grp, B(9.8, 0.6, 0.6, dark), x, 8.2, -0.8, b);
        for (const s of [-1, 1]) this.place(grp, B(0.4, 8.4, 0.5, dark), x + s * 4.75, 4.2, -0.8, b);
      }
      const winDark = new THREE.MeshStandardMaterial({ map: TEX.get('dirtGlass'), roughness: 0.2, metalness: 0.5 });
      const winLit = new THREE.MeshBasicMaterial({ color: 0x5a3010 });
      for (const y of [12.5, 16]) for (let x = -25.5; x <= 25.5; x += 4.5) {
        if (Math.abs(x) < 4) continue;
        this.place(grp, this.plane(2.4, 1.7, PL !== 'ruin' && rr.chance(0.08) ? winLit : winDark), x, y, -0.95, b);
      }
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 54, 12), MATS.rep('rust', 8, 1)); this.place(grp, pipe, 0, 9.4, -0.45, b, 0, 0, Math.PI / 2);
      for (const x of [-27, -9, 9, 27]) { const dp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 9.4, 10), rust); this.place(grp, dp, x, 4.7, -0.45, b); }
      this.place(grp, B(54, 0.15, 1.4, MATS.rep('grate', 30, 1)), 0, 11, -0.2, b);
      this.place(grp, B(54, 0.08, 0.08, dark), 0, 12, 0.48, b);
      for (let x = -26; x <= 26; x += 4) this.place(grp, B(0.08, 1.0, 0.08, dark), x, 11.5, 0.48, b);
      // yard: flood poles, containers, barriers
      for (const [x, works] of [[-11, PL !== 'ruin'], [11, false]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 14, 8), dark); this.place(grp, pole, x, 7, 15, b); this.circLocal(b, x, 15, 0.35);
        const head = B(1.6, 0.5, 0.6, new THREE.MeshBasicMaterial({ color: works ? 0xfff0d0 : 0x222222 })); this.place(grp, head, x, 14.1, 14.6, b, -0.5);
        if (works) { const w = this.toWorld(b, x, 12.5); this.lights.push({ x: w.x, y: b.y + 12.5, z: w.z, color: 0xffe8c0, power: 2.6, state: 'flicker', phase: 7, zone: 'out', range: 26, lit: 1 }); }
      }
      const cont = (x, y, z, ry, color) => { this.place(grp, B(12, 2.6, 2.45, MATS.rep('corrugated', 6, 1, color)), x, y + 1.3, z, b, 0, ry); if (y < 1) this.obbLocal(b, x, z, 6.1, 1.3, ry); };
      cont(24, 0, 10, 0.3, 0x7a3a2a); cont(24, 2.6, 10, 0.25, 0x3a5a6a); cont(31, 0, 16, 1.4, 0x5a6a3a);
      cont(-24, 0, 16, -0.2, 0x8a6a2a);
      for (let i = 0; i < 6; i++) { const x = rr.range(-14, 14), z = rr.range(8, 18), ry = rr.range(0, Math.PI), wb = this.toWorld(b, x, z); if (Math.abs(x) < 3.5 || this.pathInfo(wb.x, wb.z).d < 3.4) continue; this.place(grp, B(2.2, 0.85, 0.6, conc(2, 1)), x, 0.42, z, b, 0, ry); this.obbLocal(b, x, z, 1.1, 0.3, ry); }
      // entrance interaction + exit spawn
      const ip = this.toWorld(b, 0, 2.6);
      this.interact.push({ kind: 'enter', which: 'main', x: ip.x, y: b.y + 1.4, z: ip.z, r: 1.6 });
      const sp = this.toWorld(b, 0, 4.8);
      this.entrance.spawn = { x: sp.x, y: b.y, z: sp.z, yaw: Math.atan2(this.entrance.x, this.entrance.z) };
    }
    // what makes each plant unmistakable
    buildPlantExtras(grp, b, PL, rr) {
      const B = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), dark = MATS.get('darkmetal');
      if (PL === 'mill') {
        // a north-light sawtooth roof: glazed risers facing along the hall
        const glass = new THREE.MeshStandardMaterial({ map: TEX.get('dirtGlass'), roughness: 0.2, metalness: 0.5 }), rf = MATS.rep('corrugated', 2, 8, 0x4a4844);
        for (const [x0, w] of [[-27, 6.5], [0.5, 6.7], [7.2, 6.7], [13.9, 6.7], [20.6, 6.7]]) {
          const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(w, 0); sh.lineTo(w, 3.2); sh.closePath();
          const g = new THREE.ExtrudeGeometry(sh, { depth: 37, bevelEnabled: false }); g.translate(x0, 0, -38.5);
          this.place(grp, new THREE.Mesh(g, rf), 0, 25.2, 0, b);
          const gl = this.plane(36.6, 2.8, glass); this.place(grp, gl, x0 + w + 0.02, 26.6, -20, b, 0, Math.PI / 2);
        }
      } else if (PL === 'lab') {
        // observation domes, an antenna mast, a quarantine fence round the yard, biohazard drums
        const domeMat = MATS.rep('labPanel', 4, 2);
        for (const [x, y, z, r] of [[15, 25.2, -26, 6], [-40, 13.8, -16, 4.5]]) this.place(grp, new THREE.Mesh(new THREE.SphereGeometry(r, 28, 12, 0, TAU, 0, Math.PI / 2), domeMat), x, y, z, b);
        this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 14, 8), dark), -24, 32, -30, b);
        for (const y of [35, 38]) this.place(grp, B(3, 0.1, 0.1, dark), -24, y, -30, b);
        this.blinkLight(grp, b, -24, 39.3, -30, 0xff2010, 1.3);
        const ft = TEX.get('fence').clone(); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(9, 1.3); ft.needsUpdate = true;
        const fm = new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 });
        const warn = new THREE.MeshStandardMaterial({ map: TEX.sign('BIOHAZARD\nQUARANTINE ZONE\nNO UNAUTHORISED ENTRY', { w: 256, h: 160, size: 24, bg: '#d8b020', fg: '#141414' }), roughness: 0.8 });
        // 4 m panels that follow the ground; a gap is left wherever the trail runs through
        const FZ = 31, gy = (x) => { const w = this.toWorld(b, x, FZ); return this.height(w.x, w.z) - b.y; };
        let k = 0;
        for (let x = -38; x < 38; x += 4) {
          const w = this.toWorld(b, x + 2, FZ); if (this.pathInfo(w.x, w.z).d < 4.5) continue;
          const y0 = gy(x), y1 = gy(x + 4), ym = (y0 + y1) / 2, tilt = Math.atan2(y1 - y0, 4);
          this.place(grp, this.plane(4, 2.6, fm), x + 2, ym + 1.3, FZ, b, 0, 0, tilt);
          this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 6), dark), x + 2, ym + 2.62, FZ, b, 0, 0, Math.PI / 2 + tilt);
          for (const [px, py] of [[x, y0], [x + 4, y1]]) this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 6), dark), px, py + 1.4, FZ, b);
          if (k++ % 3 === 1) this.place(grp, this.plane(1.2, 0.75, warn), x + 2, ym + 1.6, FZ + 0.04, b, 0, 0, tilt);
          this.obbLocal(b, x + 2, FZ, 2, 0.12);
        }
        const drum = MATS.rep('painted', 1, 1, 0xc49a1e), band = MATS.get('dark');
        for (const [cx, cz] of [[-22, 12], [22, 5], [14, 20]]) for (let k = 0; k < 4; k++) {
          const x = cx + rr.range(-1.6, 1.6), z = cz + rr.range(-1.6, 1.6), tipped = rr.chance(0.25), w = this.toWorld(b, x, z);
          if (this.pathInfo(w.x, w.z).d < 3) continue;
          this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.95, 14), drum), x, tipped ? 0.36 : 0.475, z, b, tipped ? Math.PI / 2 : 0, rr.range(0, TAU));
          if (!tipped) this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.12, 14), band), x, 0.6, z, b);
          this.circLocal(b, x, z, 0.4);
        }
      } else if (PL === 'pump') {
        // two pipelines leave the pump hall on trestles and wander off across the canyon floor
        const rustMat = MATS.rep('rust', 10, 1);
        for (const [lz, r0, yo] of [[-10, 0.85, 0], [-14, 0.55, -0.6]]) {
          const pts = []; let p = this.toWorld(b, 28.5, lz), ang = b.ry, y = b.y + 6 + yo;
          pts.push(new THREE.Vector3(p.x, y, p.z));
          for (let i = 1; i < 15; i++) {
            ang += rr.range(-0.18, 0.18);
            p = { x: p.x + Math.cos(ang) * 7, z: p.z - Math.sin(ang) * 7 };
            if (Math.hypot(p.x, p.z) > 165 || Math.hypot(p.x, p.z) < 32 || Math.hypot(p.x - this.fire.x, p.z - this.fire.z) < 12) break;
            const gy = this.height(p.x, p.z);
            y = Math.max(gy + 3.2 + yo, y - 0.8); pts.push(new THREE.Vector3(p.x, y, p.z));
            // a trestle under each joint (none standing in the trail: it runs underneath)
            const leg = y - r0 - gy;
            if (leg > 0.3 && this.pathInfo(p.x, p.z).d > 3) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, leg, 0.3), dark); m.position.set(p.x, gy + leg / 2, p.z); m.castShadow = true; grp.add(m); this.addCircle(p.x, p.z, 0.3); }
          }
          const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 6, r0, 12, false), rustMat); tube.castShadow = true; tube.receiveShadow = true; grp.add(tube);
          for (const q of pts) { const fl = new THREE.Mesh(new THREE.TorusGeometry(r0 + 0.05, 0.08, 6, 16), dark); fl.position.copy(q); fl.lookAt(q.x + 1, q.y, q.z); grp.add(fl); }
        }
        // pump towers in the yard
        for (const [x, z] of [[-27, 18], [28, 20]]) {
          const parts = [];
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push({ geo: new THREE.BoxGeometry(0.18, 15, 0.18), matrix: mat(dx * 0.9, 7.5, dz * 0.9, -dz * 0.04, 0, dx * 0.04) });
          for (let y = 1.5; y < 15; y += 2.2) { parts.push({ geo: new THREE.BoxGeometry(1.9, 0.1, 0.1), matrix: mat(0, y, -0.9) }); parts.push({ geo: new THREE.BoxGeometry(1.9, 0.1, 0.1), matrix: mat(0, y, 0.9) }); parts.push({ geo: new THREE.BoxGeometry(0.1, 0.1, 1.9), matrix: mat(-0.9, y, 0) }); parts.push({ geo: new THREE.BoxGeometry(0.1, 0.1, 1.9), matrix: mat(0.9, y, 0) }); }
          parts.push({ geo: new THREE.BoxGeometry(7, 0.5, 0.5), matrix: mat(0.8, 15.3, 0, 0, 0, 0.12) }); parts.push({ geo: new THREE.BoxGeometry(1.6, 1.4, 1.0), matrix: mat(-2.6, 14.6, 0) });
          const m = new THREE.Mesh(mergeGeoList(parts), dark); m.castShadow = true; this.place(grp, m, x, 0, z, b);
          this.circLocal(b, x, z, 1.4);
        }
      } else if (PL === 'ruin') {
        // the front of the hall has caved in at the top; part of the roof is gone; rubble in the yard
        const wall = MATS.rep('bunker', 1, 1, 0x4a4542);
        for (let i = 0; i < 16; i++) this.place(grp, B(rr.range(2, 5), rr.range(1.5, 4), rr.range(1, 2.5), wall), rr.range(-26, 26), rr.range(23.5, 26), rr.range(-3, -1), b, rr.range(-0.5, 0.5), rr.range(-0.4, 0.4), rr.range(-0.6, 0.6));
        this.place(grp, B(13, 0.1, 10, new THREE.MeshBasicMaterial({ color: 0x050403 })), 8, 25.26, -18, b);
        for (let i = 0; i < 14; i++) {
          const x = rr.range(-24, 24), z = rr.range(2, 14), wp = this.toWorld(b, x, z); if (Math.abs(x) < 5 || this.pathInfo(wp.x, wp.z).d < 4.8) continue;
          const w = rr.range(1.2, 3.5), d = rr.range(1, 2.5), ry = rr.range(0, TAU);
          this.place(grp, B(w, rr.range(0.5, 1.6), d, wall), x, 0.4, z, b, rr.range(-0.3, 0.3), ry, rr.range(-0.3, 0.3));
          this.obbLocal(b, x, z, w / 2, d / 2, ry);
        }
      }
    }
    // set dressing that belongs to the world rather than the plant: field fences, a giant carcass in the ash
    buildWorldExtras(grp) {
      const r = new RNG(this.seed + 909);
      if (this.key === 'ashgrove') {
        // old split-rail fences running beside the trail, broken in places
        const parts = [], wood = MATS.get('wood');
        const off = (p, side) => { const l = Math.hypot(p.dx, p.dz) || 1; return { x: p.x - p.dz / l * side * 4.8, z: p.z + p.dx / l * side * 4.8 }; };
        for (const side of [-1, 1]) for (let t = 0.12; t < 0.9; t += 0.028) {
          if (r.chance(0.18)) continue;
          const a = off(this.pathPoint(t), side), bq = off(this.pathPoint(t + 0.028), side);
          if (Math.hypot(a.x, a.z) < 30 || Math.hypot(a.x - this.center.x, a.z - this.center.z) < 56) continue;
          const ha = this.height(a.x, a.z), hb = this.height(bq.x, bq.z), len = Math.hypot(bq.x - a.x, bq.z - a.z), ang = Math.atan2(-(bq.z - a.z), bq.x - a.x);
          parts.push({ geo: new THREE.BoxGeometry(0.14, 1.3, 0.14), matrix: mat(a.x, ha + 0.55, a.z, r.range(-0.08, 0.08), 0, r.range(-0.08, 0.08)) });
          for (const y of [0.55, 1.0]) if (!r.chance(0.12)) parts.push({ geo: new THREE.BoxGeometry(len, 0.1, 0.06), matrix: mat((a.x + bq.x) / 2, (ha + hb) / 2 + y, (a.z + bq.z) / 2, 0, ang, Math.atan2(hb - ha, len)) });
          this.addCircle(a.x, a.z, 0.15);
        }
        if (parts.length) { const m = new THREE.Mesh(mergeGeoList(parts), wood); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
      }
      if (this.key === 'hollow') {
        // the bones of something enormous, half sunk in the ash
        let at = null;
        for (let t = 0; t < 200 && !at; t++) { const a = r.range(0, TAU), d = r.range(45, 95), x = Math.cos(a) * d, z = Math.sin(a) * d; if (this.clearOf(x, z, 10)) at = { x, z }; }
        if (at) {
          const bone = new THREE.MeshStandardMaterial({ color: 0xd6ccb6, roughness: 0.85, map: TEX.get('porcelain') }), parts = [];
          const yaw = r.range(0, TAU), dir = { x: Math.cos(yaw), z: -Math.sin(yaw) }, gy = this.height(at.x, at.z);
          for (let i = 0; i < 16; i++) {
            const s = (i - 8) * 1.5, x = at.x + dir.x * s, z = at.z + dir.z * s, y = this.height(x, z) + 0.6 + Math.sin(i / 15 * Math.PI) * 0.9;
            parts.push({ geo: new THREE.DodecahedronGeometry(0.6, 0), matrix: mat(x, y, z, 0, yaw + i, 0, 1.05, 0.85, 1.15) });
            if (i % 2) parts.push({ geo: new THREE.ConeGeometry(0.16, 1.3, 5), matrix: mat(x, y + 0.9, z, 0, yaw, -0.35) });
            if (i >= 3 && i <= 13) {
              const R = 2.6 + Math.sin((i - 3) / 10 * Math.PI) * 3.2;
              parts.push({ geo: new THREE.TorusGeometry(R, 0.26, 6, 18, Math.PI * 0.86), matrix: mat(x, this.height(x, z) - 0.6, z, 0, yaw + Math.PI / 2, Math.PI * 0.07) });
              this.addCircle(x + dir.z * R, z - dir.x * R, 0.4); this.addCircle(x - dir.z * R, z + dir.x * R, 0.4);
            }
            this.addCircle(x, z, 0.7);
          }
          // the skull: a domed cranium, a long tapering snout, a dropped jaw and two swept-back horns
          const hx = at.x + dir.x * 13.8, hz = at.z + dir.z * 13.8, hy = this.height(hx, hz) + 1.5;
          parts.push({ geo: new THREE.SphereGeometry(1, 16, 12), matrix: mat(hx, hy, hz, 0, yaw, 0.1, 1.6, 1.25, 1.35) });
          const sn = new THREE.CylinderGeometry(0.35, 0.95, 3.4, 10); sn.rotateZ(-Math.PI / 2);
          parts.push({ geo: sn, matrix: mat(hx + dir.x * 2.4, hy - 0.35, hz + dir.z * 2.4, 0, yaw, -0.12) });
          parts.push({ geo: new THREE.BoxGeometry(3.6, 0.25, 1.1), matrix: mat(hx + dir.x * 2.0, hy - 1.15, hz + dir.z * 2.0, 0, yaw, -0.28) });
          for (const s of [-1, 1]) {
            const hn = new THREE.ConeGeometry(0.3, 3.4, 8); hn.translate(0, 1.7, 0);
            parts.push({ geo: hn, matrix: mat(hx - dir.z * s * 0.8 - dir.x * 0.4, hy + 0.6, hz + dir.x * s * 0.8 - dir.z * 0.4, s * 0.6, yaw, 1.0) });
          }
          this.addCircle(hx, hz, 2.2);
          const m = new THREE.Mesh(mergeGeoList(parts), bone); m.castShadow = true; m.receiveShadow = true; grp.add(m);
        }
      }
    }
    blinkLight(grp, base, lx, ly, lz, color, period) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color }));
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.scale.set(5, 5, 1);
      this.place(grp, m, lx, ly, lz, base); const w = this.toWorld(base, lx, lz); sp.position.set(w.x, base.y + ly, w.z); grp.add(sp);
      this.blinkers.push({ m, sp, color: new THREE.Color(color), period, phase: Math.random() * period });
    }
    buildFireExit(grp) {
      const f = this.fire;
      const ry = Math.atan2(-f.x, -f.z) + this.rng.range(-1, 1);
      const base = { x: f.x, y: f.h, z: f.z, ry };
      f.ry = ry;
      const B = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MATS.get(m));
      this.place(grp, B(3.4, 3.2, 3.2, 'bunker'), 0, 1.5, -1.6, base);
      this.place(grp, B(3.8, 0.3, 3.8, 'bunker'), 0, 3.2, -1.5, base);
      this.place(grp, B(1.3, 2.3, 0.1, 'door'), 0, 1.15, 0.02, base);
      // hinges on the left, lever on the right
      { const hw = []; DoorKit.lever(hw, 1.3, 0.1); DoorKit.hinges(hw, 2.3); this.place(grp, DoorKit.mesh(DoorKit.place(hw, mat(-0.65, 0, 0.02))), 0, 0, 0, base); }
      this.place(grp, this.plane(1.4, 0.36, new THREE.MeshBasicMaterial({ map: TEX.sign('FIRE EXIT', { bg: '#2a0505', fg: '#ff5040', size: 34, bold: true, dirty: false }) })), 0, 2.65, 0.02, base);
      const wl = this.toWorld(base, 0, 0.8);
      this.lights.push({ x: wl.x, y: f.h + 2.8, z: wl.z, color: 0xff3020, power: 0.6, state: 'on', phase: 0, zone: 'out', range: 9, lit: 1 });
      this.obbLocal(base, 0, -1.6, 1.75, 1.65);
      const ip = this.toWorld(base, 0, 0.9);
      this.interact.push({ kind: 'enter', which: 'fire', x: ip.x, y: f.h + 1.3, z: ip.z, r: 1.2 });
      const sp = this.toWorld(base, 0, 2.0);
      f.spawn = { x: sp.x, y: f.h, z: sp.z, yaw: ry + Math.PI };
    }
    buildPylons(grp) {
      const r = this.rng;
      const a = r.range(0, TAU), off = r.range(45, 75) * (r.chance(0.5) ? 1 : -1);
      const dir = { x: Math.cos(a), z: Math.sin(a) }, nrm = { x: -dir.z, z: dir.x };
      const parts = [];
      const H = 24;
      for (const [lx, lz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
        const len = Math.hypot(H, Math.hypot(lx, lz) * 0.7);
        parts.push({ geo: new THREE.BoxGeometry(0.25, len, 0.25), matrix: mat(lx * 0.6, H / 2, lz * 0.6, -lz * 0.025, 0, lx * 0.025) });
      }
      for (let y = 3; y < H; y += 3.5) {
        const w = 4.4 * (1 - (y / H) * 0.6);
        parts.push({ geo: new THREE.BoxGeometry(w, 0.12, 0.12), matrix: mat(0, y, 0) });
        parts.push({ geo: new THREE.BoxGeometry(0.12, 0.12, w), matrix: mat(0, y, 0) });
        parts.push({ geo: new THREE.BoxGeometry(w * 1.4, 0.08, 0.08), matrix: mat(0, y + 1.6, 0, 0, Math.PI / 4, 0.6) });
      }
      parts.push({ geo: new THREE.BoxGeometry(11, 0.3, 0.3), matrix: mat(0, H - 2, 0) });
      parts.push({ geo: new THREE.BoxGeometry(7, 0.3, 0.3), matrix: mat(0, H - 5, 0) });
      const pg = mergeGeoList(parts);
      const tops = [];
      for (let n = -3; n <= 3; n++) {
        const x = nrm.x * off + dir.x * n * 55, z = nrm.z * off + dir.z * n * 55;
        if (Math.hypot(x, z) > 160) continue;
        if (Math.hypot(x - this.center.x, z - this.center.z) < 64 || Math.hypot(x - this.fire.x, z - this.fire.z) < 14 || this.pathInfo(x, z).d < 6) continue;
        const y = this.height(x, z), leaning = this.key === 'hollow';
        const m = new THREE.Mesh(pg, MATS.get('darkmetal')); m.position.set(x, y - 0.5, z);
        // in the Hollow the towers have buckled and lean; their lines are down
        m.rotation.set(leaning ? r.range(-0.14, 0.14) : 0, -(a + Math.PI / 2), leaning ? r.range(-0.12, 0.12) : 0, 'YXZ'); m.castShadow = true; grp.add(m);
        this.addCircle(x, z, 2.2);
        tops.push({ x, y: y + H - 2.3, z });
      }
      const lm = new THREE.LineBasicMaterial({ color: 0x0b0b0b });
      if (this.key !== 'hollow') for (let n = 0; n < tops.length - 1; n++) for (const s of [-5, 0, 5]) {
        const p = tops[n], q = tops[n + 1], pts = [];
        for (let k = 0; k <= 16; k++) { const t = k / 16, sag = Math.sin(t * Math.PI) * 4; pts.push(new THREE.Vector3(lerp(p.x, q.x, t) + nrm.x * s, lerp(p.y, q.y, t) - sag, lerp(p.z, q.z, t) + nrm.z * s)); }
        grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm));
      }
    }
    // ---------------- abandoned vehicles ----------------
    vehicle(grp, x, z, ry, rr) {
      // sit on the ground: pitch and roll follow the terrain under the wheels
      const fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry);
      const hF = this.height(x + fx * 1.7, z + fz * 1.7), hB = this.height(x - fx * 1.6, z - fz * 1.6);
      const hR = this.height(x + rx * 0.92, z + rz * 0.92), hL = this.height(x - rx * 0.92, z - rz * 0.92);
      const g = new THREE.Group(); g.position.set(x, (hF + hB + hR + hL) / 4 - 0.04, z);
      g.rotation.set(Math.atan2(hB - hF, 3.3), ry, Math.atan2(hR - hL, 1.84) + rr.range(-0.02, 0.02), 'YXZ');
      // burnt-out shells in the Hollow: blackened paint, no glass, no tyres
      const VB = this.biome.vehicles, burnt = VB.burnt;
      const paint = MATS.rep('painted', 1, 1, rr.pick(VB.colors));
      const rust = burnt ? MATS.rep('rust', 1, 1, 0x5a4034) : MATS.get('rust'), dark = MATS.get('dark'), glass = MATS.get('carGlass'), rubber = burnt ? dark : MATS.get('rubber'), steel = burnt ? rust : MATS.get('steelBolt');
      const add = (geo, m, px, py, pz, rx = 0, ryy = 0, rz = 0) => { if (burnt && m === glass) return null; const me = new THREE.Mesh(geo, m); me.position.set(px, py, pz); me.rotation.set(rx, ryy, rz); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
      const Bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
      const pm = () => (rr.chance(burnt ? 0.5 : 0.25) ? rust : paint);
      if (burnt) g.position.y -= 0.12;
      add(Bx(1.7, 0.25, 4.9), dark, 0, 0.55, 0);
      // lower body / rocker panels: everything above sits directly on this, no daylight between parts
      const base = paint;
      add(Bx(1.92, 0.42, 5.3), base, 0, 0.88, 0.08);
      const van = rr.chance(VB.van);
      if (van) {
        add(Bx(1.95, 1.9, 3.5), pm(), 0, 1.65, -0.65);
        add(Bx(1.95, 1.15, 1.25), pm(), 0, 1.22, 1.72);
        add(Bx(1.85, 0.65, 0.05), glass, 0, 1.98, 1.25, -0.5);
        for (const s of [-1, 1]) add(Bx(0.03, 0.5, 0.8), glass, s * 0.985, 1.95, 0.75);
        add(Bx(1.6, 0.35, 0.05), dark, 0, 0.98, 2.36);
      } else {
        add(Bx(1.9, 0.95, 1.5), pm(), 0, 1.38, 0.55);
        add(Bx(1.8, 0.08, 1.15), paint, 0, 1.89, 0.45);
        add(Bx(1.7, 0.66, 0.04), glass, 0, 1.56, 1.3, -0.42);
        for (const s of [-1, 1]) add(Bx(0.03, 0.42, 0.85), glass, s * 0.955, 1.6, 0.45);
        add(Bx(1.85, 0.5, 1.45), pm(), 0, 1.08, 2.0, 0.05);
        add(Bx(1.6, 0.4, 0.05), dark, 0, 1.0, 2.73);
        add(Bx(1.9, 0.1, 2.1), paint, 0, 0.92, -1.3);
        for (const s of [-1, 1]) add(Bx(0.08, 0.5, 2.1), pm(), s * 0.91, 1.2, -1.3);
        if (rr.chance(0.5)) add(Bx(1.9, 0.5, 0.08), paint, 0, 1.2, -2.35); else add(Bx(1.9, 0.08, 0.5), paint, 0, 0.72, -2.6, 0.2);
      }
      const lamp = new THREE.MeshBasicMaterial({ color: 0x40382a });
      for (const s of [-1, 1]) add(Bx(0.3, 0.16, 0.05), rr.chance(0.3) ? dark : lamp, s * 0.6, van ? 1.08 : 1.1, van ? 2.36 : 2.76);
      add(Bx(2.0, 0.18, 0.15), steel, 0, 0.72, van ? 2.4 : 2.82); add(Bx(2.0, 0.18, 0.15), steel, 0, 0.72, -2.5);
      for (const [wx, wz] of [[-0.92, 1.7], [0.92, 1.7], [-0.92, -1.55], [0.92, -1.55]]) {
        if (rr.chance(0.12)) { g.rotation.z += wx * 0.06; continue; }
        add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16), rubber, wx, 0.42, wz, 0, 0, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.24, 0.24, 0.31, 12), steel, wx, 0.42, wz, 0, 0, Math.PI / 2);
        add(Bx(0.36, 0.1, 1.05), paint, wx * 1.02, 0.92, wz);
      }
      grp.add(g);
      this.addObb(x, z, 1.05, 2.85, ry);
    }
    buildWrecks(grp) {
      const r = this.rng;
      let placed = 0;
      for (let t = 0; t < 80 && placed < 3; t++) {
        const p = this.pathPoint(r.range(0.15, 0.85)), l = Math.hypot(p.dx, p.dz) || 1, side = r.chance(0.5) ? 1 : -1, off = r.range(6, 14);
        const x = p.x + (-p.dz / l) * off * side, z = p.z + (p.dx / l) * off * side;
        if (!this.clearOf(x, z, -3) || Math.hypot(x, z) < 26) continue;
        this.vehicle(grp, x, z, Math.atan2(p.dx, p.dz) + r.range(-0.6, 0.6), new RNG(this.seed + t * 17));
        placed++;
      }
      // two more parked in the yard in front of the plant
      // (never across the trail: slide along the yard until clear of it)
      for (const [lx, lz, a] of [[-15, 22, 1.2], [9, 26, -0.4]]) {
        for (const dx of [0, 7, -7, 14, -14]) {
          const w = this.toWorld(this.cbase, lx + dx, lz);
          if (this.pathInfo(w.x, w.z).d < 5) continue;
          this.vehicle(grp, w.x, w.z, this.cbase.ry + a, new RNG(this.seed + lx * 3)); break;
        }
      }
    }
    buildLampPosts(grp) {
      const ts = [0.14, 0.34, 0.54, 0.74], rr = new RNG(this.seed + 4242);
      ts.forEach((t, k) => {
        const p = this.pathPoint(t), l = Math.hypot(p.dx, p.dz) || 1, side = k % 2 ? 1 : -1;
        const nx = (-p.dz / l) * side, nz = (p.dx / l) * side;
        const x = p.x + nx * 3.2, z = p.z + nz * 3.2, y = this.height(x, z);
        // A rusted old street lamp: the pole runs on down into the ground (no base to float on a slope) and has settled
        // a little off true; collar bands, a junction box, an arm curving out to a cobra-head lamp. The ones that still
        // work glow sodium orange or old mercury blue-green; the dead ones hold the faintest ember behind the lens.
        // (local +X of the post points back toward the trail)
        const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set((rr.range(-1, 1)) * 0.035, Math.atan2(nz, -nx), rr.range(-1, 1) * 0.045); grp.add(g);
        const rust = MATS.get('rust'), dm = MATS.get('darkmetal');
        const m = (geo, mat, px, py, pz) => { const me = new THREE.Mesh(geo, mat); me.position.set(px, py, pz); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
        m(new THREE.CylinderGeometry(0.075, 0.12, 7.2, 10), rust, 0, 2.4, 0);
        for (const by of [0.5, 2.4]) m(new THREE.CylinderGeometry(0.135, 0.135, 0.07, 10), dm, 0, by, 0);
        m(new THREE.BoxGeometry(0.16, 0.26, 0.12), rust, 0, 1.55, 0.12);
        const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 5.6, 0), new THREE.Vector3(0.12, 6.05, 0), new THREE.Vector3(0.7, 6.18, 0), new THREE.Vector3(1.3, 6.1, 0)]);
        const am = new THREE.Mesh(new THREE.TubeGeometry(arm, 16, 0.045, 6, false), rust); am.castShadow = true; g.add(am);
        m(new THREE.SphereGeometry(1, 14, 8), rust, 1.42, 6.05, 0).scale.set(0.34, 0.11, 0.17);
        const working = (k === 1 || k === 3) && this.key !== 'hollow';
        const col = working ? [0xff9a40, 0x9fe0cf][k === 1 ? 0 : 1] : 0x3a1a0c;
        const lens = m(new THREE.SphereGeometry(1, 12, 6, 0, TAU, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: col }), 1.44, 6.0, 0); lens.scale.set(0.24, 0.08, 0.12); lens.castShadow = false;
        g.updateMatrixWorld(true); const hp = lens.getWorldPosition(new THREE.Vector3());
        if (working) {
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
          glow.position.copy(hp); glow.position.y -= 0.05; glow.scale.set(1.6, 1.6, 1); grp.add(glow);
          this.lights.push({ x: hp.x, y: hp.y - 0.25, z: hp.z, color: col, power: 1.6, state: k === 1 ? 'flicker' : 'on', phase: k * 13, zone: 'out', range: 16, lit: 1 });
        }
        this.addCircle(x, z, 0.2);
      });
    }
    buildSky(grp) {
      const U = (v) => ({ value: v });
      this.skyMat = new THREE.ShaderMaterial({
        uniforms: {
          top: U(new THREE.Color(0x10141a)), hor: U(new THREE.Color(0x30343a)), fogCol: U(new THREE.Color(0x30343a)), scatter: U(new THREE.Color(0, 0, 0)),
          sunDir: U(new THREE.Vector3(0, 1, 0)), sunCol: U(new THREE.Color(0, 0, 0)), moonDir: U(new THREE.Vector3(-0.5, 0.6, -0.6).normalize()),
          cloudLit: U(new THREE.Color(0.6, 0.6, 0.6)), cloudDark: U(new THREE.Color(0.3, 0.3, 0.3)),
          uTime: U(0), cover: U(0.5), haze: U(0.5), night: U(0), seed: U((this.seed % 1000) * 0.137), inCloud: U(0),
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          uniform vec3 top, hor, fogCol, scatter, sunDir, sunCol, moonDir, cloudLit, cloudDark;
          uniform float uTime, cover, haze, night, seed, inCloud;
          varying vec3 vP;
          float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
          float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
          float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
          void main(){
            vec3 d = normalize(vP); float h = d.y;
            vec3 c = mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.55));
            float sd = max(dot(d, sunDir), 0.0), md = max(dot(d, moonDir), 0.0);
            c += sunCol * (pow(sd, 7.0) * 0.3 + pow(sd, 90.0) * 0.8) + vec3(0.5, 0.56, 0.7) * pow(md, 60.0) * 0.12 * night;
            float disc = smoothstep(0.99935, 0.9997, sd);
            c += sunCol * disc * 3.0;
            // drifting cloud deck, lit from the sun's side, darker underneath
            if (h > -0.02) {
              vec2 q = d.xz / (max(h, 0.0) + 0.1) * 1.4 + vec2(uTime * 0.006, uTime * 0.0022) + seed;
              float n = fbm(q), n2 = fbm(q * 2.3 + 3.0);
              float cl = smoothstep(1.0 - cover, 1.0 - cover + 0.32, n) * smoothstep(-0.02, 0.2, h);
              float lit = clamp(0.5 + (n - n2) * 1.6 + pow(sd, 3.0) * 0.6, 0.0, 1.0);
              vec3 cc = mix(cloudDark, cloudLit, lit) + sunCol * pow(sd, 10.0) * 0.4 * (1.0 - cl * 0.5);
              c = mix(c, cc, cl * 0.92);
            }
            // horizon haze matches the fog (including its glow toward the sun), so the land melts into the sky
            vec3 fc = fogCol + scatter * (pow(sd, 5.0) * 0.55 + pow(sd, 40.0) * 0.9);
            c = mix(c, fc, clamp(exp(-max(h, 0.0) * mix(14.0, 4.0, haze)), 0.0, 1.0));
            // distant ridgelines, then a ragged treeline, both half lost in the haze
            vec2 ring = vec2(d.x, d.z) / max(length(d.xz), 0.001);
            float ridge = 0.022 + 0.07 * fbm(ring * 2.2 + seed) * fbm(ring * 0.9 - seed);
            float trees = 0.012 + 0.02 * fbm(ring * 9.0 + seed * 2.0) + 0.016 * pow(vn(ring * 140.0 + seed), 3.0);
            vec3 far = mix(fc, top * 0.55 + fc * 0.25, 0.22 * (1.0 - haze));
            vec3 near = mix(fc, top * 0.35 + fc * 0.2, 0.42 * (1.0 - haze * 0.8));
            c = mix(c, far, smoothstep(ridge + 0.002, ridge - 0.002, h));
            c = mix(c, near, smoothstep(trees + 0.0015, trees - 0.0015, h));
            if (h < 0.0) c = mix(near, fc, 0.3);
            // inside the cloud deck (climbing out, or before breaking out of it coming down) there's only the cloud
            c = mix(c, fc, inCloud);
            gl_FragColor = vec4(c, 1.0);
          }`,
        side: THREE.BackSide, depthWrite: false, fog: false,
      });
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(480, 24, 12), this.skyMat); this.sky.renderOrder = -10; grp.add(this.sky);
      const n = 1400, sp = new Float32Array(n * 3), rr = new RNG(this.seed + 99);
      for (let i = 0; i < n; i++) { const a = rr.range(0, TAU), y = rr.range(0.08, 1), rad = Math.sqrt(1 - y * y); sp[i * 3] = Math.cos(a) * rad * 440; sp[i * 3 + 1] = y * 440; sp[i * 3 + 2] = Math.sin(a) * rad * 440; }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
      this.stars = new THREE.Points(sg, this.starMat); grp.add(this.stars);
      this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: 0xdde6ff, transparent: true, opacity: 0, fog: false, depthWrite: false }));
      this.moon.scale.set(60, 60, 1); this.moon.position.set(-200, 260, -260); grp.add(this.moon);
      this.buildSkyBodies();
    }
    // what hangs in the sky over this place (site.sky): the world's moons and the odd captured rock, or seen from a
    // moon, the world itself, huge. Real spheres just inside the sky dome, lit by the sun from where it really is (so
    // they wax and wane), and added onto the sky: their dark side is just sky, they're pale ghosts by day and bright
    // at night; cloud and fog veil them, and the land hides them below the horizon
    buildSkyBodies() {
      const list = (this.site && this.site.sky) || [], D = 400, air = !this.biome.airless;
      this.bodies = []; this.bodiesG = new THREE.Group(); this.sky.add(this.bodiesG);
      if (list.length) this.moon.visible = false;
      const rr = new RNG(this.seed + 31);
      // (drawn at the very back of the depth range, so they're behind everything on the ground however big they are;
      // under a black airless sky they're solid, their night side blotting out the stars)
      const far = 'gl_Position.z = gl_Position.w * 0.99995;';
      for (const b of list) {
        const r = D * Math.sin(Math.min(0.78, b.r)), geo = b.kind === 'rock' ? new THREE.IcosahedronGeometry(1, 3) : new THREE.SphereGeometry(1, 64, 32);
        if (b.kind === 'rock') {
          // (a lumpy, broken potato of a thing)
          const p = geo.attributes.position, nz = new Noise2D(7 + rr.next() * 100);
          for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + nz.fbm(x * 1.6 + 3, y * 1.6 + z * 1.2, 3) * 0.55; p.setXYZ(i, x * k * 1.25, y * k * 0.8, z * k); }
          geo.computeVertexNormals();
        }
        // (an airless moon or rock is harsh: its craters' slopes catch the light or fall into shadow, and the line
        // between its day and night is a knife edge; the world, with its air, is softer)
        const harsh = b.kind === 'planet' ? 0 : 1;
        const mat = new THREE.ShaderMaterial({
          uniforms: { map: { value: TEX.get(b.kind === 'planet' ? 'planet' : 'moonmap') }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uCol: { value: new THREE.Color(b.tint) }, uAtmo: { value: new THREE.Color(b.atmo != null ? b.atmo : 0x000000) }, uVis: { value: 1 }, uHarsh: { value: harsh }, uBump: { value: r * 0.35 * harsh } },
          vertexShader: `varying vec3 vN; varying vec2 vUv; varying vec3 vV; varying vec3 vW;
            void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vV = cameraPosition - wp.xyz; vW = wp.xyz;
              gl_Position = projectionMatrix * viewMatrix * wp; ${far} }`,
          fragmentShader: `uniform sampler2D map; uniform vec3 uSun, uCol, uAtmo; uniform float uVis, uHarsh, uBump; varying vec3 vN; varying vec2 vUv; varying vec3 vV; varying vec3 vW;
            void main(){ vec3 n = normalize(vN); float l = dot(n, uSun);
              vec3 tex = texture2D(map, vUv).rgb;
              // (relief read off the map's brightness: low dark floors, high bright rims)
              float h = dot(tex, vec3(0.3333)); vec3 dpx = dFdx(vW), dpy = dFdy(vW); float dhx = dFdx(h), dhy = dFdy(h);
              vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
              vec3 bn = normalize(abs(det) * n - sign(det) * (dhx * r1 + dhy * r2) * uBump);
              float term = mix(smoothstep(-0.06, 0.2, l), smoothstep(-0.01, 0.04, l), uHarsh);
              vec3 c = tex * uCol * term * (mix(0.3, 0.06, uHarsh) + 0.95 * max(mix(l, dot(bn, uSun), uHarsh), 0.0));
              // (a world with air wears a glowing limb on its sunlit side, and the faintest glow round the dark)
              float rim = pow(1.0 - abs(dot(n, normalize(vV))), 2.6);
              c += uAtmo * rim * (smoothstep(-0.3, 0.45, l) * 1.1 + 0.06);
              gl_FragColor = vec4(c * uVis, 1.0); }`,
          transparent: true, blending: air ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, fog: false,
        });
        const m = new THREE.Mesh(geo, mat), el = b.el, az = b.az;
        m.position.set(Math.cos(az) * Math.cos(el) * D, Math.sin(el) * D, Math.sin(az) * Math.cos(el) * D); m.scale.setScalar(r);
        m.rotation.set(rr.range(-0.4, 0.4), rr.range(0, TAU), rr.range(-0.3, 0.3)); m.renderOrder = air ? -9 : 2; m.frustumCulled = false;
        this.bodiesG.add(m); this.bodies.push(m);
        if (b.kind !== 'planet') continue;
        // the world overhead: its weather turning slowly over the day side, and (Nadir, the Hollow) its rings
        const cl = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 32), new THREE.ShaderMaterial({
          uniforms: { map: { value: TEX.get('clouds') }, uSun: mat.uniforms.uSun, uVis: mat.uniforms.uVis },
          vertexShader: `varying vec3 vN; varying vec2 vUv; void main(){ vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); ${far} }`,
          fragmentShader: `uniform sampler2D map; uniform vec3 uSun; uniform float uVis; varying vec3 vN; varying vec2 vUv;
            void main(){ float l = dot(normalize(vN), uSun), a = texture2D(map, vUv).a * 0.85; gl_FragColor = vec4(vec3(0.95) * smoothstep(-0.05, 0.3, l) * (0.3 + 0.8 * max(l, 0.0)) * uVis, a * smoothstep(-0.2, 0.15, l)); }`,
          transparent: true, depthWrite: false, fog: false,
        }));
        cl.position.copy(m.position); cl.scale.setScalar(r); cl.rotation.copy(m.rotation); cl.renderOrder = m.renderOrder + 1; cl.frustumCulled = false; this.bodiesG.add(cl); this.bodies.push(cl);
        if (b.rings) {
          const rg = new THREE.RingGeometry(1.35, 2.3, 160, 1), uv = rg.attributes.uv, p = rg.attributes.position;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - 1.35) / 0.95, 0.5);
          const ring = new THREE.Mesh(rg, new THREE.ShaderMaterial({
            uniforms: { map: { value: TEX.get('rings') }, uSun: mat.uniforms.uSun, uVis: mat.uniforms.uVis, uCol: { value: new THREE.Color(b.tint).lerp(new THREE.Color(0xffffff), 0.4) } },
            vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); ${far} }`,
            fragmentShader: `uniform sampler2D map; uniform vec3 uCol; uniform float uVis; varying vec2 vUv; void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * uCol * uVis, t.a * 0.85); }`,
            transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
          }));
          ring.position.copy(m.position); ring.scale.setScalar(r); ring.lookAt(0, 0, 0); ring.rotateX(1.15); ring.rotateZ(0.5); ring.renderOrder = m.renderOrder + 2; ring.frustumCulled = false;
          this.bodiesG.add(ring); this.bodies.push(ring);
        }
      }
    }
    // the sky's bodies: lit by the sun, veiled by cloud and weather, drifting slowly across the sky over the day
    updateSkyBodies(L, t) {
      if (!this.bodies.length) return;
      const vis = this.biome.airless ? 1 : (1 - L.cover * 0.8) * (this.weather === 'fog' ? 0.25 : 1);
      this.bodiesG.rotation.y = t * 0.0006;
      for (const m of this.bodies) { const u = m.material.uniforms; u.uSun.value.copy(L.sunDir); u.uVis.value = vis * (1 + 0.7 * L.night); }
    }
    buildRain(grp) {
      // each drop is a short line; both of its vertices share the drop's head position (position) and differ
      // only by aOff, so wrapping and the ship cut-out always treat a drop as one piece
      const n = 2400, p = new Float32Array(n * 6), o = new Float32Array(n * 6), rr = new RNG(5);
      for (let i = 0; i < n; i++) { const x = rr.range(-20, 20), y = rr.range(0, 24), z = rr.range(-20, 20); p.set([x, y, z, x, y, z], i * 6); o.set([0, 0, 0, 0.03, -0.55, 0], i * 6); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aOff', new THREE.BufferAttribute(o, 3));
      this.rainMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uOp: { value: 0.2 }, uShipInv: this.shipInv },
        vertexShader: `uniform float uTime; uniform vec3 uCam; uniform mat4 uShipInv; attribute vec3 aOff; varying float vA;
          void main(){ vec3 h = position; h.y = mod(h.y - uTime * 22.0, 24.0) - 8.0;
            h.x = mod(h.x - uCam.x + 20.0, 40.0) - 20.0 + uCam.x; h.z = mod(h.z - uCam.z + 20.0, 40.0) - 20.0 + uCam.z; h.y += uCam.y;
            // no rain inside (or through) the ship's hull, wherever the ship is
            vec3 l = (uShipInv * vec4(h, 1.0)).xyz;
            if (l.x > -18.6 && l.x < 12.6 && l.z > -5.2 && l.z < 5.2 && l.y < 5.3 && l.y > -1.1) h.y -= 2000.0;
            vec3 p = h + aOff;
            vA = 1.0 - clamp(length(p.xz - uCam.xz) / 20.0, 0.0, 1.0);
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
        fragmentShader: 'uniform float uOp; varying float vA; void main(){ gl_FragColor = vec4(0.62, 0.68, 0.75, uOp * vA); }',
        transparent: true, depthWrite: false,
      });
      this.rain = new THREE.LineSegments(g, this.rainMat); this.rain.frustumCulled = false; this.rain.visible = false; grp.add(this.rain);
    }
    // the ship's wind on whatever grows round it: from (x, z), shoving s metres at the source, fading over about r
    setBlast(x, z, s, r) { this.blastU.value.set(x, z, s, r); }
    update(t, cam, L) {
      for (const b of this.blinkers) { const on = ((t + b.phase) % b.period) < 0.35; b.m.material.color.copy(b.color).multiplyScalar(on ? 1 : 0.12); b.sp.material.opacity = on ? 0.9 : 0; }
      const gusty = this.weather === 'storm' ? 1.8 : this.weather === 'rain' ? 1.3 : 1;
      this.windU.value = t * gusty;
      if (!cam) return;
      if (!this.coverAt || Math.hypot(cam.x - this.coverAt.x, cam.z - this.coverAt.z) > 7) this.fillGroundCover(cam.x, cam.z);
      const mu = this.moteMat.uniforms; mu.uTime.value = t * gusty; mu.uCam.value.copy(cam);
      if (L) {
        const mk = this.biome.motes, wet = this.weather === 'rain' || this.weather === 'storm';
        mu.uCol.value.copy(L.hor).multiplyScalar(mk === 'dust' ? 1.5 : mk === 'ash' ? 0.9 : 1.25).lerp(L.sunColor, 0.2 * (1 - L.night));
        mu.uGlow.value = mk === 'fireflies' ? L.night : 0;
        mu.uOp.value = mk === 'none' ? 0 : mk === 'fireflies' ? (wet ? 0.2 : 0.35 + L.night * 0.65) : (wet ? 0.15 : mk === 'dust' ? 0.8 : mk === 'ash' ? 0.75 : 0.55) * (1 - L.night * (mk === 'ash' ? 0.3 : 0.6));
        const su = this.skyMat.uniforms;
        su.top.value.copy(L.top); su.hor.value.copy(L.hor); su.fogCol.value.copy(L.fog); su.scatter.value.copy(L.scatter);
        su.sunDir.value.copy(L.sunDir); su.sunCol.value.copy(L.sunColor).multiplyScalar(L.sunGlow);
        su.cloudLit.value.copy(L.cloudLit); su.cloudDark.value.copy(L.cloudDark);
        su.uTime.value = t * gusty; su.cover.value = L.cover; su.haze.value = L.haze; su.night.value = L.night;
        this.updateSkyBodies(L, t);
      }
    }
    // time of day: mins 480..1440
    lighting(mins) {
      const h = mins / 60;
      const day = 1 - sstep(16.5, 20, h);
      const dusk = sstep(16, 18.3, h) * (1 - sstep(18.8, 20.5, h));
      const night = sstep(19.5, 21.5, h);
      const wx = this.weather;
      const overcast = wx === 'clear' ? 0 : wx === 'fog' ? 0.6 : 0.8;
      const C = (hex) => new THREE.Color(hex);
      const top = C(0x6f7d88).lerp(C(0x4a4f5a), overcast).lerp(C(0x3a2c44), dusk).lerp(C(0x04060a), night);
      const hor = C(0x9aa3a6).lerp(C(0x7c8286), overcast).lerp(C(0xa0573a), dusk * 0.85).lerp(C(0x0b0e13), night);
      // the world's own sky: a murky green marsh, a dusty orange canyon, the Hollow's permanent red dusk
      const SK = this.biome.sky, tint = (c, a) => c.multiply(new THREE.Color(a[0], a[1], a[2]));
      tint(top, SK.top).multiplyScalar(SK.dim); tint(hor, SK.hor).multiplyScalar(SK.dim);
      const fogDen = (wx === 'fog' ? 0.05 : wx === 'storm' ? 0.03 : wx === 'rain' ? 0.024 : 0.012) + night * 0.012 + SK.fogAdd;
      const sunColor = tint(C(0xfff2dd).lerp(C(0xff8a4a), dusk), SK.sun);
      const L = {
        top, hor, fog: hor.clone().multiplyScalar(0.9), fogDen,
        hemi: (lerp(lerp(1.5, 1.0, overcast), 0.05, 1 - day * (1 - dusk * 0.4)) + dusk * 0.2) * SK.dim,
        hemiSky: tint(C(0xb8c4d0).lerp(C(0xd08a60), dusk).lerp(C(0x3a4a66), night), SK.hemi),
        sun: (lerp(2.1 * (1 - overcast * 0.6), 0, 1 - day) + dusk * 0.6) * SK.dim,
        sunColor,
        sunDir: new THREE.Vector3(Math.cos((h - 6) / 14 * Math.PI) * 0.8, Math.max(0.12, Math.sin((h - 6) / 14 * Math.PI)), 0.4).normalize(),
        stars: night * (wx === 'clear' ? 1 : 0.25),
        night,
        // atmosphere: fog glow toward the sun, cloud colours, how much of the sky is cloud and how hazy the horizon is
        scatter: sunColor.clone().multiplyScalar((0.32 + dusk * 0.55) * (1 - night) * (1 - overcast * 0.5)),
        sunGlow: (0.9 * (1 - overcast * 0.75) + dusk * 0.7) * (1 - night),
        cloudLit: hor.clone().lerp(sunColor, 0.25 * (1 - night)).multiplyScalar(1.1 - night * 0.45),
        cloudDark: top.clone().multiplyScalar(0.8).lerp(hor, 0.25),
        cover: wx === 'clear' ? 0.42 : wx === 'fog' ? 0.72 : 0.92,
        haze: wx === 'fog' ? 1 : wx === 'clear' ? 0.2 : 0.65,
        fogFalloff: wx === 'fog' ? 0.075 : 0.045,
      };
      // no air: a black sky by day as well as by night with the stars always out, a hard white sun and deep shadows,
      // nothing to scatter it (no fog to speak of, no cloud, no haze)
      if (this.biome.airless) {
        const k = 1 - night;
        L.top = C(0x020203); L.hor = C(0x050506).lerp(C(0x0b0b0d), k); L.fog = C(0x030304); L.fogDen = 0.0035;
        L.hemi = 0.08 + 0.1 * k; L.sun = 5.0 * day; L.stars = 1; L.scatter = C(0x000000); L.sunGlow = 0.25 * k;
        L.cloudLit = L.hor.clone(); L.cloudDark = L.top.clone(); L.cover = 0; L.haze = 0; L.fogFalloff = 0.02;
      }
      return L;
    }
  }
  return Ext;
})();
