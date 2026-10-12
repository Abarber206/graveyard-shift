'use strict';
// Procedural facility interior: tile-grid dungeon with rooms, corridors, doors, lamps, props, vents.
const FAC_TS = 3;
const FAC_Y0 = -120;

function circleBox(p, r, x0, x1, z0, z1) {
  const cx = clamp(p.x, x0, x1), cz = clamp(p.z, z0, z1);
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) { const d = Math.sqrt(d2), push = (r - d) / d; p.x += dx * push; p.z += dz * push; }
  else {
    const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, b = z1 - p.z, m = Math.min(l, rr, t, b);
    if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r;
  }
  return true;
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < k.length && k[l] < k[m]) m = l; if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break; [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return top;
  }
}

// Door hardware: lever sets, hinges, push bars and pull handles, built in a leaf's own frame:
// x runs from the hinge edge (0) to the latch edge (w), y is height above the floor, the faces sit at z = ±t/2.
// A door's vision panel: where it sits in the leaf (heights from the leaf's foot), the leaf with it cut out, the trim
// round it (and the bars of a grille), the wired glass, and the shaft of lamplight that falls through it into the dark
const Pane = {
  W: 0.42, y0: 1.3, y1: 1.82,
  leaf(w, h, t) {
    const hw = w / 2, hh = h / 2, sh = new THREE.Shape(), x = Pane.W / 2, y0 = Pane.y0 - 0.005 - hh, y1 = Pane.y1 - 0.005 - hh;
    sh.moveTo(-hw, -hh); sh.lineTo(hw, -hh); sh.lineTo(hw, hh); sh.lineTo(-hw, hh); sh.lineTo(-hw, -hh);
    const hole = new THREE.Path(); hole.moveTo(-x, y0); hole.lineTo(-x, y1); hole.lineTo(x, y1); hole.lineTo(x, y0); hole.lineTo(-x, y0);
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -t / 2);
    // (the door's texture spread over each face just as it is over a plain slab)
    const P = g.attributes.position, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) U.setXY(i, (P.getX(i) + hw) / w, (P.getY(i) + hh) / h);
    return g;
  },
  trim(parts, kind, w, t) {
    const cx = w / 2, cy = (Pane.y0 + Pane.y1) / 2, W = Pane.W, H = Pane.y1 - Pane.y0, b = 0.03, d = t + 0.024;
    for (const y of [Pane.y1 + b / 2, Pane.y0 - b / 2]) parts.push({ geo: new THREE.BoxGeometry(W + 2 * b, b, d), matrix: mat(cx, y, 0) });
    for (const s of [-1, 1]) parts.push({ geo: new THREE.BoxGeometry(b, H, d), matrix: mat(cx + s * (W / 2 + b / 2), cy, 0) });
    if (kind === 'bars') {
      for (let i = 1; i <= 5; i++) parts.push({ geo: new THREE.CylinderGeometry(0.011, 0.011, H, 6), matrix: mat(cx - W / 2 + (W * i) / 6, cy, 0) });
      parts.push({ geo: new THREE.BoxGeometry(W, 0.018, 0.014), matrix: mat(cx, cy, 0) });
    }
  },
  glass() {
    if (!Pane.glassMat) {
      // safety glass with a diamond wire mesh in it, a little greenish and smeared
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      x.fillStyle = 'rgba(150,172,160,0.15)'; x.fillRect(0, 0, 64, 64);
      x.strokeStyle = 'rgba(28,30,28,0.6)'; x.lineWidth = 1;
      for (let i = -64; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke(); x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 64); x.stroke(); }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 2.5);
      Pane.glassMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.12, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
    }
    return Pane.glassMat;
  },
  // a shaft running out from the window (leaf space +z; side -1 runs the other way), spreading, fading and tipping
  // down toward the floor; through a grille it comes out in stripes
  beam(kind, side) {
    if (!Pane.beamGeo) {
      const W = Pane.W, H = Pane.y1 - Pane.y0, L = 2.6, sp = 1.7, drop = 0.5, cy = (Pane.y0 + Pane.y1) / 2;
      const ring = (a) => { const k = 1 + (sp - 1) * a, z = 0.03 + L * a, y = cy - drop * L * a; return [[-W / 2 * k, y - H / 2 * k, z], [W / 2 * k, y - H / 2 * k, z], [W / 2 * k, y + H / 2 * k, z], [-W / 2 * k, y + H / 2 * k, z]]; };
      const A = ring(0), B = ring(1), pos = [], uv = [];
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; pos.push(...A[i], ...A[j], ...B[j], ...A[i], ...B[j], ...B[i]); uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeBoundingSphere();
      Pane.beamGeo = g;
    }
    const m = new THREE.Mesh(Pane.beamGeo, new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 }, uBars: { value: kind === 'bars' ? 1 : 0 }, uCol: { value: new THREE.Color(1, 0.84, 0.6) } },
      // (a haze, not a solid: each side of the shaft fades out toward its edges and wherever it's seen edge-on, and
      // it thins away close up, so walking through it never shows a box)
      vertexShader: 'varying vec2 vUv; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uI; uniform float uBars; uniform vec3 uCol; varying vec2 vUv; varying vec3 vV; void main(){ vec3 n = normalize(cross(dFdx(vV), dFdy(vV))); float d = length(vV), face = pow(abs(dot(n, vV / d)), 1.6); float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x); float bars = mix(1.0, 0.2 + 0.8 * smoothstep(0.3, 0.75, abs(fract(vUv.x * 6.0) - 0.5) * 2.0), uBars); float a = uI * 0.07 * pow(1.0 - vUv.y, 1.4) * smoothstep(0.0, 0.12, vUv.y + 0.02) * edge * face * bars * smoothstep(0.6, 2.0, d) * (1.0 - smoothstep(14.0, 24.0, d)); gl_FragColor = vec4(uCol * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.scale.z = side; m.renderOrder = 4; m.visible = false;
    return m;
  },
};
const DoorKit = {
  // a lever on each face near the latch edge; the levers point back toward the hinge, as real ones do
  lever(parts, w, t, y = 1.0) {
    const x = w - 0.075;
    for (const s of [-1, 1]) {
      const z = s * t / 2;
      parts.push({ geo: new THREE.BoxGeometry(0.05, 0.2, 0.012), matrix: mat(x, y - 0.035, z + s * 0.006) });
      parts.push({ geo: new THREE.CylinderGeometry(0.02, 0.02, 0.036, 10), matrix: mat(x, y, z + s * 0.024, Math.PI / 2) });
      parts.push({ geo: new THREE.BoxGeometry(0.13, 0.022, 0.024), matrix: mat(x - 0.058, y, z + s * 0.046) });
      parts.push({ geo: new THREE.BoxGeometry(0.022, 0.022, 0.034), matrix: mat(x - 0.116, y, z + s * 0.035) });
    }
  },
  hinges(parts, h) { for (const y of [0.28, h / 2, h - 0.28]) parts.push({ geo: new THREE.CylinderGeometry(0.019, 0.019, 0.13, 8), matrix: mat(0, y, 0) }); },
  // a horizontal push bar across face s (±1)
  panic(parts, x0, x1, t, s, y = 1.02) {
    const z = s * t / 2;
    parts.push({ geo: new THREE.CylinderGeometry(0.022, 0.022, x1 - x0, 10), matrix: mat((x0 + x1) / 2, y, z + s * 0.075, 0, 0, Math.PI / 2) });
    for (const x of [x0, x1]) parts.push({ geo: new THREE.BoxGeometry(0.09, 0.13, 0.085), matrix: mat(x, y, z + s * 0.042) });
  },
  // a vertical pull handle on two standoffs, on face s
  pull(parts, x, t, s, y0 = 0.8, y1 = 1.5, r = 0.016) {
    const z = s * t / 2;
    parts.push({ geo: new THREE.CylinderGeometry(r, r, y1 - y0, 10), matrix: mat(x, (y0 + y1) / 2, z + s * 0.06) });
    for (const y of [y0 + 0.04, y1 - 0.04]) parts.push({ geo: new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.06, 8), matrix: mat(x, y, z + s * 0.03, Math.PI / 2) });
  },
  place(parts, m4) { return parts.map((p) => ({ geo: p.geo, matrix: m4.clone().multiply(p.matrix) })); },
  mesh(parts) { const m = new THREE.Mesh(mergeGeoList(parts), MATS.get('hardware')); m.castShadow = true; m.receiveShadow = true; return m; },
};

const Facility = (() => {
  const TS = FAC_TS, Y0 = FAC_Y0, CH = 3.0, DW = 1.6, DH = 2.4;
  // levels: each lies DROP below the last. They are joined by stairwells: vertical shafts SW x SL tiles with switchback
  // flights stacked one storey over the next, standing in a band SB tiles deep between one floor and the next one down.
  // A shaft opens onto each floor it serves at its own landing.
  const DROP = 6, SB = 4, SW = 2, SL = 4, STAIR_H = 3.3, levelLabel = (n) => (n > 0 ? 'B' + n : 'G');
  // how far gone a level is (dark, failing, grown over): a floor further down for each of the first two, and after that
  // only a little more for each (the bottom of the deepest plant is as near dead as the second basement, not past it)
  const deepK = (d) => (d <= 2 ? Math.max(0, d) : 2 + (d - 2) * 0.15);
  // how near a stairwell you have to be to see into it at all (further off, its doorway is lost in the dark)
  const SHOW_R = 40;
  // a stairwell storey: north landing (v 0-3), flights (v 3-9: east one down to the south, west one down to the north),
  // south landing (v 9-12); the well between the flights is RAIL wide
  const RAIL = 0.15;
  // door leaf: hinged on its centre line just clear of the jamb, so it can swing either way without clipping the frame
  const LEAF_T = 0.05, LEAF_AXIS = -DW / 2 + 0.045, LEAF_W = DW - 0.069;
  const RT = {
    entrance: { h: 4.2, floor: 'floorTile', wall: 'wall', lamp: 0xffe2b8 },
    storage: { h: 4.8, floor: 'floor', wall: 'wall', lamp: 0xcfe0ff },
    office: { h: 3.2, floor: 'floorTile', wall: 'wall', lamp: 0xe8f0d0 },
    machine: { h: 6.5, floor: 'floor', wall: 'wall', lamp: 0xffc890 },
    lab: { h: 3.6, floor: 'floorTile', wall: 'wallTile', lamp: 0xd8f4ff },
    lockers: { h: 3.4, floor: 'floor', wall: 'wall', lamp: 0xcfe0ff },
    boiler: { h: 5.5, floor: 'floor', wall: 'wall', lamp: 0xffa860 },
    morgue: { h: 3.4, floor: 'floorTile', wall: 'wallTile', lamp: 0xc8ffd8 },
    hall: { h: 6.0, floor: 'floor', wall: 'wall', lamp: 0xcfe0ff },
    core: { h: 7.0, floor: 'floor', wall: 'wall', lamp: 0xff3a24 },
    exit: { h: 3.4, floor: 'floor', wall: 'wall', lamp: 0xffe2b8 },
    stairs: { h: STAIR_H, floor: 'floor', wall: 'wall', lamp: 0xcfdcff },
  };
  // further down, the plant was given over to the heavy plant and the dead, and nobody came to clean it
  const DEEP_W = { boiler: 1.9, machine: 1.6, storage: 1.1, morgue: 1.5, hall: 1.3, lab: 0.8, lockers: 0.8, office: 0.4 };
  // the surfaces a lower level wears down: they take that level's darker, grimier finish ('wall@2' and so on)
  const AGED = new Set(['wall', 'wallTile', 'floor', 'floorTile', 'ceiling', 'painted', 'rust', 'darkmetal', 'metal', 'wood', 'crate', 'door', 'locker', 'vent', 'bunker', 'cloth', 'sheet', 'hazard', 'labPanel', 'grate']);
  const TYPE_W = { storage: 3, office: 2, machine: 1.5, lab: 2, lockers: 1.5, boiler: 1, morgue: 1.2, hall: 0.6 };
  // what each site was before it was abandoned decides what its rooms are
  const THEME_W = {
    ashgrove: { storage: 3.5, machine: 3, boiler: 2, office: 2, lockers: 2, hall: 1, lab: 0.2, morgue: 0.1 },          // textile mill
    kessler: { lab: 4, morgue: 2.5, office: 2, storage: 1.5, lockers: 1.5, machine: 0.6, boiler: 0.4, hall: 0.4 },     // research annex
    nadir: { machine: 3.5, boiler: 3, storage: 2, lockers: 1.6, hall: 1.4, office: 0.8, lab: 0.4, morgue: 0.3 },       // pumping station
    hollow: { morgue: 2.2, lab: 2, storage: 2, machine: 1.8, hall: 1.6, boiler: 1.2, lockers: 1, office: 0.7 },        // ???
    verdigris: { lab: 3, storage: 2.5, hall: 1.5, office: 1, lockers: 1, machine: 1, boiler: 0.8, morgue: 0.2 },       // hydroponic farm
    rimefall: { storage: 4, machine: 2.4, lockers: 1.4, office: 1.2, hall: 1.2, morgue: 1, boiler: 0.6, lab: 0.6 },     // cold storage
    agnes: { morgue: 2.4, lockers: 2.4, office: 2.2, lab: 1.6, hall: 1, storage: 1, boiler: 0.8, machine: 0.2 },       // sanatorium
    brinewell: { storage: 3, machine: 2.6, hall: 2.2, boiler: 1.6, lockers: 1.2, office: 1, morgue: 0.4, lab: 0.2 },   // shipyard
    saltreach: { machine: 3.6, boiler: 2.6, storage: 2, hall: 1.6, lab: 1, lockers: 1, office: 0.8, morgue: 0.2 },     // brine refinery
    vesper: { boiler: 3.8, machine: 3, hall: 2, storage: 1.6, lockers: 0.8, morgue: 0.8, office: 0.4, lab: 0.2 },      // foundry
  };
  // What each world's plant was fitted out with inside: each of the usual surfaces swapped for its own (a material and a
  // tint), and the colour its strip lights burn (lamp, blended into what each room's own lights are)
  const FINISH = {
    // potting-shed timber, wet green-stained concrete, white grow-room panels over drainage grating, the grow lights' magenta
    verdigris: { wall: ['wood', 0xb0a080], wallTile: ['labPanel', 0xc8d8c0], floor: ['floor', 0x7a8a6a], floorTile: ['grate', 0x8a9a80], ceiling: ['perf', 0x9aa890], door: ['door', 0x7f9a78], lamp: 0xff9ae8 },
    // insulated freezer panels, steel grating underfoot, cold blue-white light
    rimefall: { wall: ['labPanel', 0xc4d4e2], wallTile: ['labPanel', 0xb4c6d6], floor: ['grate', 0xa8b8c8], floorTile: ['floorTile', 0xaabccc], ceiling: ['metal', 0xb0c0cc], door: ['door', 0xc0d0dc], lamp: 0xc8e8ff },
    // institutional green tile, worn linoleum, old wooden doors, yellowed light
    agnes: { wall: ['wallTile', 0x98b49a], wallTile: ['wallTile', 0xc8ccb8], floor: ['floorTile', 0x9a9282], floorTile: ['floorTile', 0xb0aa98], ceiling: ['ceiling', 0xb8b2a0], door: ['wood', 0x9a7a58], lamp: 0xf2eaa8 },
    // a ship's insides: rusted plate, painted bulkheads, deck plating, a sea-green cast
    brinewell: { wall: ['rust', 0x8a9a96], wallTile: ['painted', 0x5f8a86], floor: ['metal', 0x6a7a78], floorTile: ['metal', 0x7a8a88], ceiling: ['painted', 0x506a68], door: ['painted', 0x3f6a66], lamp: 0xb8ffe8 },
    // cream-painted steel, grating, safety-yellow doors, sodium light
    saltreach: { wall: ['painted', 0xd8cca0], wallTile: ['wallTile', 0xe0dcc8], floor: ['grate', 0xa09880], floorTile: ['floorTile', 0xc8c0a8], ceiling: ['metal', 0xa8a088], door: ['painted', 0xd0a428], lamp: 0xffc070 },
    // sooty firebrick, black slag concrete, rusted doors, furnace-orange light
    vesper: { wall: ['brick', 0x7a5a50], wallTile: ['bunker', 0x5a5450], floor: ['floor', 0x5a524c], floorTile: ['metal', 0x5a5450], ceiling: ['bunker', 0x4a4440], door: ['rust', 0x8a6a5a], lamp: 0xff9a50 },
  };
  const _lampC = new THREE.Color(), _lampF = new THREE.Color(), stencils = {};
  const AGE_T = [null, [0.72, 0.66, 0.56], [0.55, 0.52, 0.42], [0.45, 0.42, 0.34], [0.42, 0.39, 0.31], [0.39, 0.36, 0.29]], finCache = {};
  // a world's own version of a surface (worn the way MATS.aged wears one, on the levels below)
  const finMat = (theme, base, f, lv) => {
    const k = theme + ':' + base + '@' + lv; if (finCache[k]) return finCache[k];
    const m = MATS.get(f[0]).clone(); if (f[1] != null) m.color = new THREE.Color(f[1]);
    if (lv > 0) { const t = AGE_T[Math.min(AGE_T.length - 1, lv)]; m.color.multiply(new THREE.Color(t[0], t[1], t[2])); if (m.roughness != null) m.roughness = Math.min(1, m.roughness + 0.12 * lv); if (m.metalness) m.metalness *= 0.6; }
    return (finCache[k] = m);
  };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  class Fac {
    // a surface ('wall', or 'wall@2' a level down), in this world's own finish when it has one
    mat(key) {
      const at = key.indexOf('@'), base = at < 0 ? key : key.slice(0, at), lv = at < 0 ? 0 : +key.slice(at + 1), f = FINISH[this.theme] && FINISH[this.theme][base];
      if (f) return finMat(this.theme, base, f, lv);
      return at < 0 ? MATS.get(key) : MATS.aged(base, lv);
    }
    // stairs: how many stairwells join each floor to the next one down (2 or 3; fewer only where a floor is too narrow
    // to keep them apart). floors: how many floors, the ground floor and the basements under it (1 if not given).
    // defer: set up only; generateGen() then lays it out a piece at a time (see G.stageSite)
    constructor(seed, size, theme, stairs, floors, defer) {
      this.seed = seed; this.rng = new RNG(seed); this.theme = theme;
      this.perBand = clamp((Array.isArray(stairs) ? stairs[0] : stairs) || 2, 1, 3); this.levels = Math.max(1, Math.min(10, floors | 0 || 1));
      const W = (this.W = size), L = this.levels;
      // where each level lies: the ground floor across the top, then for each floor down a band of stairwells and under
      // it that floor, every one the full width (each further down the grid; nothing joins them but the stairwells)
      const Hg = (this.Hg = size), Hl = (this.Hl = Math.max(16, Math.round(size * 0.66)));
      this.regions = [{ n: 0, i0: 0, i1: W, j0: 0, j1: Hg }]; this.bands = [0];
      for (let n = 1; n < L; n++) { const jb = this.regions[n - 1].j1; this.bands.push(jb); this.regions.push({ n, i0: 0, i1: W, j0: jb + SB, j1: jb + SB + Hl }); }
      this.H = this.regions[L - 1].j1;
      const N = this.W * this.H;
      this.ox = -size * TS / 2; this.oz = -size * TS / 2;
      this.grid = new Uint8Array(N); this.room = new Int16Array(N).fill(-1); this.ceil = new Float32Array(N);
      this.block = new Uint8Array(N); this.clear = new Uint8Array(N);
      // each floor tile's level (-1 for rock and stairwells), and the stairwell a shaft tile belongs to
      this.lvl = new Int8Array(N).fill(-1); this.shaftOf = new Int8Array(N).fill(-1);
      this.rooms = []; this.doors = []; this.doorEdge = new Map(); this.lamps = []; this.vents = [];
      this.shafts = []; this.exitEdge = new Map(); this.portals = new Map(); this.blasts = []; this.blastEdge = new Map();
      this.cols = []; this.colHash = new Map(); this.spots = []; this.exits = []; this.buckets = {}; this.coreSpot = null; this.containers = [];
      this.lampMeshes = null; this.group = null; this.parts = null; this.lv = 0; this.part = null;
      if (!defer) { const g = this.generateGen(); while (!g.next().done); }
    }
    // ---------- grid helpers ----------
    idx(i, j) { return i < 0 || j < 0 || i >= this.W || j >= this.H ? -1 : i + j * this.W; }
    floorAt(i, j) { const k = this.idx(i, j); return k >= 0 && this.grid[k] > 0; }
    // somewhere a creature can stand and wander to (a stairwell is only ever passed through, down its flights)
    walkable(i, j) { const k = this.idx(i, j); return k >= 0 && this.grid[k] > 0 && this.grid[k] !== 4 && !this.block[k]; }
    cx(i) { return this.ox + (i + 0.5) * TS; }
    cz(j) { return this.oz + (j + 0.5) * TS; }
    ti(x) { return Math.floor((x - this.ox) / TS); }
    tj(z) { return Math.floor((z - this.oz) / TS); }
    ceilAt(x, z) { const k = this.idx(this.ti(x), this.tj(z)); return k >= 0 && this.grid[k] && this.grid[k] !== 4 ? this.ceil[k] : CH; }
    tileY(k) { return Y0 - Math.max(0, this.lvl[k]) * DROP; }
    // the floor under (x, z). In a stairwell its storeys stand over one another, so it's the surface just under y.
    floorY(x, z, y) {
      const k = this.idx(this.ti(x), this.tj(z));
      if (k < 0 || !this.grid[k]) return Y0;
      return this.grid[k] === 4 ? this.shaftFloor(this.shafts[this.shaftOf[k]], x, z, y) : this.tileY(k);
    }
    ceilY(x, z, y) { const k = this.idx(this.ti(x), this.tj(z)); return this.floorY(x, z, y) + (k >= 0 && this.grid[k] === 4 ? 4 : this.ceilAt(x, z)); }
    // how far down a height is, in levels, and that level's name (G, B1, B2...)
    depthOfY(y) { return clamp(-(y - Y0) / DROP, 0, this.levels - 1); }
    levelName(y) { return levelLabel(Math.round(this.depthOfY(y))); }
    levelLabel(n) { return levelLabel(n); }
    // how far gone the air is at a height: dark, murk (see G.environment); 0 up on the ground floor
    gloomAt(y) { return deepK(this.depthOfY(y)); }
    contains(x, y, z) { return y < Y0 + 30 && y > Y0 - 10 - (this.levels - 1) * DROP && this.floorAt(this.ti(x), this.tj(z)); }
    edgeKey(a, b) { return a < b ? a * 65536 + b : b * 65536 + a; }
    // can you pass straight from tile k into its neighbour nk? Only on the same level, and into a stairwell only
    // through one of its doorways
    connected(k, nk) {
      if (k < 0 || nk < 0 || !this.grid[k] || !this.grid[nk]) return false;
      const a = this.shaftOf[k], b = this.shaftOf[nk];
      if (a >= 0 || b >= 0) return a === b || this.exitEdge.has(this.edgeKey(k, nk));
      return this.lvl[k] === this.lvl[nk];
    }
    // a blast door shut across this edge?
    closedBlast(a, b) { const d = this.blastEdge.get(this.edgeKey(a, b)); return !!d && !(d.open && d.anim > 0.6); }
    shaftAt(x, z) { const k = this.idx(this.ti(x), this.tj(z)); return k >= 0 && this.grid[k] === 4 ? this.shafts[this.shaftOf[k]] : null; }

    // ---------- generation ----------
    addRoom(i, j, w, h, type, lv = 0) {
      const r = { id: this.rooms.length, i, j, w, h, type, lv, cx: i + Math.floor(w / 2), cy: j + Math.floor(h / 2) };
      r.ax = r.cx; r.ay = r.cy;   // where corridors are dug to and from
      this.rooms.push(r); return r;
    }
    // the stairwells: 2 x 4-tile shafts in the band over each floor below the ground, two or three of them spread across
    // its width. Each opens north onto a small lobby on the floor above and, at its foot, sideways into a hall that runs
    // down beside it into the floor below. (A shaft only ever joins two floors: the way down is a floor at a time.)
    planShafts() {
      const r = this.rng, W = this.W, L = this.levels; if (L < 2) return;
      const plan = [], count = this.perBand;
      for (let b = 1; b < L; b++) {
        const cols = [];
        for (let c = 0; c < count; c++) for (let t = 0; t < 40; t++) {
          const i = clamp(Math.round(W * (c + 0.5) / count + r.range(-W * 0.08, W * 0.08)), 3, W - 5);
          if (cols.some((o) => Math.abs(o - i) < 8)) continue;
          cols.push(i); break;
        }
        // (where chance left them crowded, the first column clear of the others)
        for (let i = 3; cols.length < count && i <= W - 5; i++) if (cols.every((o) => Math.abs(o - i) >= 8)) cols.push(i);
        // the halls down into the floor below turn alternately west and east, the other way round on the next floor
        cols.sort((a, q) => a - q).forEach((c, n) => plan.push({ c, jb: this.bands[b], levels: [b - 1, b], side: { [b]: (n + b) % 2 ? 'w' : 'e' } }));
      }
      plan.forEach((p, n) => {
        const jb = p.jb, top = p.levels[0];
        const s = { id: n, name: String.fromCharCode(65 + n), c: p.c, jb, top, bot: p.levels[1], exits: [], x0: this.ox + p.c * TS, z0: this.oz + jb * TS };
        for (let a = 0; a < SW; a++) for (let b = 0; b < SL; b++) { const k = this.idx(p.c + a, jb + b); this.grid[k] = 4; this.shaftOf[k] = n; }
        // the floor above: through the north wall from a small lobby
        const lob = this.addRoom(p.c - 1, jb - 2, 3, 2, 'stairs', top); lob.shaft = s;
        s.exits.push({ lv: top, side: 'n', out: this.idx(p.c, jb - 1), inn: this.idx(p.c, jb) });
        // the floor below: a side door off its landing into a hall running down beside the shaft into the floor
        for (const lv of p.levels) if (lv > top) {
          const side = p.side[lv], ci = side === 'w' ? p.c - 1 : p.c + SW;
          const hall = this.addRoom(ci, jb, 1, SB + 1, 'stairs', lv); hall.ax = ci; hall.ay = jb + SB; hall.shaft = s; hall.hall = true;
          s.exits.push({ lv, side, out: this.idx(ci, jb), inn: this.idx(side === 'w' ? p.c : p.c + SW - 1, jb) });
        }
        for (const e of s.exits) { e.shaft = s; this.exitEdge.set(this.edgeKey(e.out, e.inn), e); }
        // a creature can go in at one doorway and come out at another (see findPath)
        for (const a of s.exits) for (const b of s.exits) if (a !== b && a.lv !== b.lv) {
          let l = this.portals.get(a.out); if (!l) this.portals.set(a.out, (l = []));
          l.push({ to: b.out, cost: 4 + 7 * Math.abs(a.lv - b.lv), a, b });
        }
        this.shafts.push(s);
      });
    }
    // laid out a piece at a time: it yields whenever it has been at it for a few milliseconds, so a landing can spread
    // it over frames (the pieces always come in the same order, so the layout is the same however it's split up)
    *generateGen() {
      const r = this.rng, W = this.W;
      let t0 = performance.now(); const busy = () => performance.now() - t0 > 6;
      const ew = 5, eh = 4, ei = Math.floor(W / 2 - ew / 2), ej = 1;
      const ent = this.addRoom(ei, ej, ew, eh, 'entrance', 0);
      this.planShafts();
      for (const reg of this.regions) {
        const want = Math.floor(((reg.i1 - reg.i0) * (reg.j1 - reg.j0)) / 78);
        let have = this.rooms.filter((o) => o.lv === reg.n && o.type !== 'stairs').length;
        for (let tries = 0; tries < 900 && have < want; tries++) {
          const big = r.chance(0.18);
          const w = big ? r.int(6, 9) : r.int(3, 6), h = big ? r.int(5, 8) : r.int(3, 6);
          const i0 = reg.i0 + 1, i1 = reg.i1 - w - 1, j0 = reg.j0 + (reg.n === 0 ? 2 : 1), j1 = reg.j1 - h - 1;
          if (i1 < i0 || j1 < j0) continue;
          const i = r.int(i0, i1), j = r.int(j0, j1);
          if (this.rooms.some((o) => i - 2 < o.i + o.w && i + w + 2 > o.i && j - 2 < o.j + o.h && j + h + 2 > o.j)) continue;
          this.addRoom(i, j, w, h, null, reg.n); have++;
        }
      }
      const dr = (a, b) => Math.hypot(a.ax - b.ax, a.ay - b.ay);
      const plain = (n) => this.rooms.filter((o) => o.lv === n && !o.type);
      const farthest = (list, anchors) => { let best = null, bs = -1; for (const o of list) { const s = Math.min(...anchors.map((a) => dr(o, a))); if (s > bs) { bs = s; best = o; } } return best; };
      // the core lies as deep as the plant goes, as far from the stairwells as it can be
      {
        const n = this.levels - 1, core = farthest(plain(n), n === 0 ? [ent] : this.rooms.filter((o) => o.lv === n && o.type === 'stairs'));
        if (core) core.type = 'core';
      }
      // the fire exit is up on the ground floor, away from the entrance and the stairwells
      { const ex = farthest(plain(0), this.rooms.filter((o) => o.lv === 0 && o.type)); if (ex) ex.type = 'exit'; }
      for (const o of this.rooms) if (!o.type) {
        const w = { ...(o.w * o.h >= 30 ? { machine: 3, hall: 2, storage: 3, boiler: 2 } : THEME_W[this.theme] || TYPE_W) };
        if (o.lv > 0) for (const t in w) w[t] *= Math.pow(DEEP_W[t] || 1, deepK(o.lv));
        o.type = r.weighted(w);
      }
      for (const room of this.rooms) for (let i = room.i; i < room.i + room.w; i++) for (let j = room.j; j < room.j + room.h; j++) {
        const k = this.idx(i, j); this.grid[k] = 2; this.room[k] = room.id; this.ceil[k] = RT[room.type].h; this.lvl[k] = room.lv;
      }
      // connections within each level: MST + some loops (the only way between levels is a stairwell)
      for (const reg of this.regions) {
        const rs = this.rooms.filter((o) => o.lv === reg.n), n = rs.length;
        if (n < 2) continue;
        const inTree = new Array(n).fill(false), edges = [], has = new Set();
        inTree[0] = true;
        for (let c = 1; c < n; c++) {
          let ba = -1, bb = -1, bd = Infinity;
          for (let a = 0; a < n; a++) if (inTree[a]) for (let q = 0; q < n; q++) if (!inTree[q]) { const d = dr(rs[a], rs[q]); if (d < bd) { bd = d; ba = a; bb = q; } }
          inTree[bb] = true; edges.push([ba, bb]); has.add(ba * 1000 + bb); has.add(bb * 1000 + ba);
        }
        for (let a = 0; a < n; a++) {
          let bb = -1, bd = Infinity;
          for (let q = 0; q < n; q++) if (q !== a && !has.has(a * 1000 + q)) { const d = dr(rs[a], rs[q]); if (d < bd) { bd = d; bb = q; } }
          if (bb >= 0 && bd < W * 0.5 && r.chance(0.4)) { edges.push([a, bb]); has.add(a * 1000 + bb); has.add(bb * 1000 + a); }
        }
        for (const [a, q] of edges) { this.carve(rs[a], rs[q], reg); if (busy()) { yield; t0 = performance.now(); } }
      }
      this.deadEnds();
      yield; t0 = performance.now();
      this.placeBlastDoors();
      yield; t0 = performance.now();
      this.placeDoors();
      this.placeExits();
      yield; t0 = performance.now();
      this.placeLamps();
      this.placeVents();
      for (const room of this.rooms) { this.furnish(room); if (busy()) { yield; t0 = performance.now(); } }
      yield; t0 = performance.now();
      for (const _ of this.corridorDressing()) if (busy()) { yield; t0 = performance.now(); }
      for (const s of this.shafts) this.shaftColliders(s);
      this.bloodTrail();
      this._dig = null;
    }
    // a corridor dug from A to B within one level's region (from and to each room's anchor tile)
    carve(A, B, reg) {
      const W = this.W, H = this.H, N = W * H * 4, ilo = Math.max(1, reg.i0), ihi = Math.min(W - 1, reg.i1), jlo = Math.max(1, reg.j0), jhi = Math.min(H - 1, reg.j1);
      const start = this.idx(A.ax, A.ay), goal = this.idx(B.ax, B.ay);
      // (one set of scratch arrays for every dig, each search stamped with its own number: a state whose stamp is old
      // hasn't been reached yet this time)
      const C = this._dig || (this._dig = { g: new Float32Array(N), came: new Int32Array(N), at: new Uint32Array(N), t: 0 }), g = C.g, came = C.came, at = C.at, now = ++C.t;
      const gOf = (s) => (at[s] === now ? g[s] : Infinity);
      const open = new MinHeap();
      const hx = (k) => Math.abs((k % W) - B.ax) + Math.abs(Math.floor(k / W) - B.ay);
      for (let d = 0; d < 4; d++) { at[start * 4 + d] = now; g[start * 4 + d] = 0; came[start * 4 + d] = -1; open.push(hx(start), start * 4 + d); }
      let end = -1, guard = 0;
      while (open.size && guard++ < 60000) {
        const s = open.pop(), k = s >> 2, dir = s & 3;
        if (k === goal) { end = s; break; }
        const i = k % W, j = Math.floor(k / W);
        for (let nd = 0; nd < 4; nd++) {
          const ni = i + DIRS[nd][0], nj = j + DIRS[nd][1];
          if (ni < ilo || nj < jlo || ni >= ihi || nj >= jhi) continue;
          const nk = ni + nj * W, ns = nk * 4 + nd;
          const cost = g[s] + this.carveCost(nk, A, B) + (nd !== dir ? 4 : 0);
          if (cost < gOf(ns)) { at[ns] = now; g[ns] = cost; came[ns] = s; open.push(cost + hx(nk), ns); }
        }
      }
      if (end < 0) return;
      for (let s = end; s >= 0; s = came[s]) {
        const k = s >> 2;
        if (this.grid[k] === 0) { this.grid[k] = 1; this.ceil[k] = CH; this.lvl[k] = reg.n; }
      }
    }
    carveCost(k, A, B) {
      const rid = this.room[k];
      if (rid === A.id || rid === B.id) return 1;
      if (rid >= 0) return 30;
      if (this.grid[k] === 1) return 1.3;
      let c = 3;
      const i = k % this.W, j = Math.floor(k / this.W);
      for (const [dx, dy] of DIRS) {
        const nk = this.idx(i + dx, j + dy);
        if (nk >= 0 && this.room[nk] >= 0) { c += this.room[nk] === A.id || this.room[nk] === B.id ? 2 : 8; }
        else if (nk >= 0 && this.grid[nk] === 1) c += 1.5;
      }
      return c;
    }
    deadEnds() {
      const r = this.rng;
      for (const b of this.regions) {
      const cor = [];
      for (let k = 0; k < this.grid.length; k++) if (this.grid[k] === 1 && this.lvl[k] === b.n) cor.push(k);
      if (!cor.length) continue;
      const count = r.int(2, 4), ilo = Math.max(1, b.i0), ihi = Math.min(this.W - 1, b.i1), jlo = Math.max(1, b.j0), jhi = Math.min(this.H - 1, b.j1);
      for (let n = 0; n < count; n++) {
        const k0 = r.pick(cor), d = r.pick(DIRS), len = r.int(3, 6);
        let i = k0 % this.W, j = Math.floor(k0 / this.W);
        for (let s = 0; s < len; s++) {
          const ni = i + d[0], nj = j + d[1];
          if (ni < ilo || nj < jlo || ni >= ihi || nj >= jhi) break;
          const nk = this.idx(ni, nj);
          if (this.grid[nk] !== 0) break;
          let ok = true;
          for (const [dx, dy] of DIRS) { const ck = this.idx(ni + dx, nj + dy); if ((ni + dx === i && nj + dy === j)) continue; if (ck < 0 || this.grid[ck] !== 0) { ok = false; break; } }
          if (!ok) break;
          this.grid[nk] = 1; this.ceil[nk] = CH; this.lvl[nk] = b.n; i = ni; j = nj;
        }
      }
      }
    }
    placeDoors() {
      const r = this.rng, W = this.W;
      for (let k = 0; k < this.grid.length; k++) {
        if (this.grid[k] !== 1) continue;
        const i = k % W, j = Math.floor(k / W);
        let roomN = 0, cand = null;
        for (const [dx, dy] of DIRS) { const nk = this.idx(i + dx, j + dy); if (nk >= 0 && this.room[nk] >= 0 && this.lvl[nk] === this.lvl[k]) { roomN++; cand = [dx, dy, nk]; } }
        if (roomN !== 1) continue;
        const [dx, dy, nk] = cand;
        const p1 = this.idx(i + dy, j + dx), p2 = this.idx(i - dy, j - dx);
        if ((p1 >= 0 && this.grid[p1] > 0) || (p2 >= 0 && this.grid[p2] > 0)) continue;
        const room = this.rooms[this.room[nk]];
        if (!r.chance(room.type === 'entrance' ? 0.45 : 0.6)) continue;
        const ex = this.cx(i) + dx * TS / 2, ez = this.cz(j) + dy * TS / 2;
        const door = { id: this.doors.length, a: k, b: nk, nx: dx, nz: dy, x: ex, y: this.tileY(k), z: ez, lv: room.lv, open: r.chance(0.3), dir: 1, anim: 0, mesh: null };
        door.anim = door.open ? 1 : 0;
        // a vision panel at eye height in every door: wired glass, or in rougher places a grille of bars
        door.pane = Math.abs(Math.sin(ex * 12.9898 + ez * 78.233 + room.lv * 37.719) * 43758.5453) % 1 < 0.6 ? 'glass' : 'bars';
        this.doors.push(door);
        this.doorEdge.set(this.edgeKey(k, nk), door);
        // jamb colliders (always) + door panel collider (when closed)
        const tx = -dy, tz = dx;
        const along = (a0, a1) => {
          const xa = ex + tx * a0, xb = ex + tx * a1, za = ez + tz * a0, zb = ez + tz * a1;
          return [Math.min(xa, xb) - (dx ? 0.1 : 0), Math.max(xa, xb) + (dx ? 0.1 : 0), Math.min(za, zb) - (dy ? 0.1 : 0), Math.max(za, zb) + (dy ? 0.1 : 0)];
        };
        const s1 = along(-TS / 2, -DW / 2), s2 = along(DW / 2, TS / 2), dp = along(-DW / 2, DW / 2);
        this.addCol(...s1, 4, null, [k, nk]); this.addCol(...s2, 4, null, [k, nk]);
        this.addCol(...dp, 4, door, [k, nk]);
        // the open leaf is solid too: one blocker for each way it can swing (dir +1 into the room, -1 into the corridor)
        for (const s of [1, -1]) {
          const ax = ex + tx * LEAF_AXIS, az = ez + tz * LEAF_AXIS, bx = ax + dx * s * LEAF_W, bz = az + dy * s * LEAF_W;
          this.addCol(Math.min(ax, bx) - 0.05, Math.max(ax, bx) + 0.05, Math.min(az, bz) - 0.05, Math.max(az, bz) + 0.05, 4, null, [s > 0 ? nk : k]).leaf = { door, dir: s };
        }
        this.clear[k] = 1; this.clear[nk] = 1;
      }
    }
    placeExits() {
      const ent = this.rooms[0];
      const mi = ent.i + 2, mj = ent.j;
      this.exits.push({ kind: 'main', x: this.cx(mi), z: this.oz + mj * TS + 0.05, nx: 0, nz: 1, spawn: { x: this.cx(mi), z: this.oz + mj * TS + 1.4, yaw: Math.PI } });
      this.markClear(mi, mj, 1);
      const ex = this.rooms.find((o) => o.type === 'exit');
      if (!ex) return;
      // pick a wall tile on the exit room whose outside neighbor is solid, farthest from the entrance
      let best = null, bd = -1;
      for (let i = ex.i; i < ex.i + ex.w; i++) for (let j = ex.j; j < ex.j + ex.h; j++) for (const [dx, dy] of DIRS) {
        const nk = this.idx(i + dx, j + dy);
        if (nk >= 0 && this.grid[nk] !== 0) continue;
        if (this.clear[this.idx(i, j)]) continue;
        const d = Math.hypot(i - ent.cx, j - ent.cy) + (dx || dy ? 0 : 0);
        if (d > bd) { bd = d; best = { i, j, dx, dy }; }
      }
      if (!best) return;
      const { i, j, dx, dy } = best;
      const wx = this.cx(i) + dx * (TS / 2 - 0.05), wz = this.cz(j) + dy * (TS / 2 - 0.05);
      this.exits.push({ kind: 'fire', x: wx, z: wz, nx: -dx, nz: -dy, spawn: { x: this.cx(i) - dx * 0.1, z: this.cz(j) - dy * 0.1, yaw: Math.atan2(dx, dy) } });
      this.markClear(i, j, 1);
    }
    markClear(i, j, rad) { for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) { const k = this.idx(i + a, j + b); if (k >= 0) this.clear[k] = 1; } }
    placeLamps() {
      const r = this.rng, W = this.W;
      const near = (i, j, d) => this.lamps.some((l) => Math.abs(l.i - i) + Math.abs(l.j - j) <= d);
      const add = (i, j, color, state, axis) => {
        const k = this.idx(i, j), h = this.ceil[k], deep = deepK(this.lvl[k]), base = this.tileY(k);
        // short ranges keep lamps from bleeding through the walls into neighbouring rooms
        const range = this.grid[k] !== 2 ? 6.2 : h >= 5 ? 8.5 : 7;
        // the further down, the weaker what's left of the supply; the lowest emergency circuit glows red
        if (state === 'emergency' && deep > 1.5) color = 0xff5a30;
        // (each world's fittings burn their own colour; the emergency circuit is the same red everywhere)
        else if (state !== 'emergency' && FINISH[this.theme]) color = _lampC.set(color).lerp(_lampF.set(FINISH[this.theme].lamp), 0.6).getHex();
        this.lamps.push({ i, j, x: this.cx(i), y: base + h - 0.12, fy: base, z: this.cz(j), tilt: 0, color, state, axis, range, power: (state === 'emergency' ? 0.55 : h >= 5 ? 1.4 : 1) * (1 - 0.16 * deep), phase: r.next() * 100, zone: 'in', lit: 1, idx: this.lamps.length });
      };
      // deeper down more of the tubes are dead and most of the rest are failing; from the second basement on only the
      // emergency circuit still runs in places, and less of anything at all the further down
      const pickState = (deep) => {
        const x = r.next();
        if (deep < 0.5) return x < 0.5 ? 'on' : x < 0.68 ? 'flicker' : 'off';
        if (deep < 1.5) return x < 0.28 ? 'on' : x < 0.5 ? 'flicker' : 'off';
        const f = clamp((deep - 2) / 0.45, 0, 1);
        return x < 0.14 - 0.05 * f ? 'on' : x < 0.34 - 0.08 * f ? 'flicker' : x < 0.5 - 0.06 * f ? 'emergency' : 'off';
      };
      this.pickLampState = pickState;
      for (let k = 0; k < this.grid.length; k++) {
        if (this.grid[k] !== 1) continue;
        const i = k % W, j = Math.floor(k / W);
        if (near(i, j, 3) || !r.chance(0.6)) continue;
        const horiz = this.floorAt(i - 1, j) || this.floorAt(i + 1, j);
        add(i, j, 0xcfdcff, pickState(deepK(this.lvl[k])), horiz ? 'x' : 'z');
      }
      for (const room of this.rooms) {
        const t = RT[room.type];
        // a stairwell's hall: one fitting halfway along, never quite dead
        if (room.hall) { const st = pickState(deepK(room.lv)); add(room.i, room.j + 2, st === 'emergency' ? 0xff5a30 : t.lamp, st === 'off' ? 'flicker' : st, 'z'); continue; }
        for (let i = room.i + 1; i < room.i + room.w; i += 3) for (let j = room.j + 1; j < room.j + room.h; j += 3) {
          let st = pickState(deepK(room.lv));
          if (room.type === 'entrance') st = 'on';
          if (room.type === 'core') st = 'emergency';
          // a stairwell's lobby always has its light, even if it's only the emergency one
          if (room.type === 'stairs' && st === 'off') st = room.lv > 0 ? 'emergency' : 'flicker';
          add(i, j, room.type === 'stairs' && st === 'emergency' ? 0xff5a30 : t.lamp, st, room.type === 'stairs' ? 'x' : 'z');
        }
      }
    }    placeVents() {
      const r = this.rng;
      for (const room of this.rooms) {
        if (room.type === 'entrance' || room.type === 'stairs') continue;
        if (!r.chance(0.7)) continue;
        for (let t = 0; t < 20; t++) {
          const i = r.int(room.i, room.i + room.w - 1), j = r.int(room.j, room.j + room.h - 1), [dx, dy] = r.pick(DIRS);
          const nk = this.idx(i + dx, j + dy);
          if (nk >= 0 && this.grid[nk] !== 0) continue;
          if (this.clear[this.idx(i, j)]) continue;
          const y0 = this.tileY(this.idx(i, j)), high = r.chance(0.4), y = high ? y0 + this.ceil[this.idx(i, j)] - 0.8 : y0 + 0.4;
          this.vents.push({ x: this.cx(i) + dx * (TS / 2 - 0.03), y, z: this.cz(j) + dy * (TS / 2 - 0.03), nx: -dx, nz: -dy, i, j, room: room.id });
          break;
        }
      }
    }
    // a solid box (seen from above) h tall. extra may hold yr: [a, b] (it only stops things whose feet are between a and b:
    // a stairwell's railings) or ygap: [a, b] (it lets those through: a stairwell's doorway on that level)
    addCol(x0, x1, z0, z1, h, door, tiles, extra) {
      const kc = this.idx(this.ti((x0 + x1) / 2), this.tj((z0 + z1) / 2));
      const c = Object.assign({ x0, x1, z0, z1, h, door, y0: kc >= 0 && this.grid[kc] && this.grid[kc] !== 4 ? this.tileY(kc) : Y0 }, extra);
      this.cols.push(c);
      const set = new Set(tiles || []);
      for (let i = this.ti(x0); i <= this.ti(x1); i++) for (let j = this.tj(z0); j <= this.tj(z1); j++) { const k = this.idx(i, j); if (k >= 0) set.add(k); }
      for (const k of set) { let l = this.colHash.get(k); if (!l) this.colHash.set(k, (l = [])); l.push(c); }
      return c;
    }
    // ---------- geometry buckets ----------
    // props built while furnishing a lower level (this.lv > 0) get that level's grimier, darker finish. Each level's
    // (and each stairwell's: this.part) are merged on their own, so a floor nobody can see isn't drawn (see showFor)
    put(mat, geo, m) {
      if (this.lv > 0 && AGED.has(mat)) mat += '@' + this.lv;
      const key = mat + '#' + (this.part ?? this.lv);
      (this.buckets[key] || (this.buckets[key] = [])).push({ geo, matrix: m });
    }
    // place a box prop. local size w (x) * h * d (z), positioned with base at y.
    pbox(mat, w, h, d, x, y, z, ry = 0) { this.put(mat, new THREE.BoxGeometry(w, h, d), mat4(x, y + h / 2, z, ry)); }
    // a door leaf; mirrored leaves flip the texture so double doors have both handles on the inner edges
    doorLeaf(w, h, d, x, z, ry, mirror) {
      const g = new THREE.BoxGeometry(w, h, d);
      if (mirror) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
      this.put('door', g, mat4(x, Y0 + h / 2, z, ry));
    }
    pcyl(mat, r1, r2, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) { this.put(mat, new THREE.CylinderGeometry(r1, r2, h, seg), mat4(x, y, z, ry, rx, rz)); }
    // a box in a prop's own frame (L from frame()), base at y: lx/lz along and out from it, tilted by rz in its plane
    lbox(mat, L, ry, w, h, d, lx, y, lz, rz = 0) { const [px, pz] = L(lx, lz); this.put(mat, new THREE.BoxGeometry(w, h, d), mat4(px, y + h / 2, pz, ry, 0, rz)); }
    // a slatted wooden crate: planked body, a batten down every edge and round the top and bottom
    crateProp(x, y, z, s, ry) {
      const L = this.frame(x, z, ry), e = s * 0.075, h = s / 2 - e / 2;
      this.pbox('crate', s * 0.97, s * 0.97, s * 0.97, x, y + s * 0.015, z, ry);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.lbox('wood', L, ry, e, s, e, a * h, y, b * h);
      for (const yy of [0, s - e]) for (const b of [-1, 1]) { this.lbox('wood', L, ry, s - 2 * e, e, e, 0, y + yy, b * h); this.lbox('wood', L, ry, e, e, s - 2 * e, b * h, y + yy, 0); }
      // a diagonal brace across two of the faces
      for (const b of [-1, 1]) this.lbox('wood', L, ry, s * 1.18, e * 0.8, e * 0.5, 0, y + s / 2 - e * 0.4, b * (s / 2 + e * 0.1), b * 0.78);
    }
    // a steel drum: rolled hoops, a lid with its bung
    barrelProp(mat, x, y, z) {
      this.pcyl(mat, 0.34, 0.34, 0.93, x, y + 0.475, z, 0, 0, 0, 22);
      for (const yy of [0.025, 0.33, 0.63, 0.925]) this.pcyl(mat === 'rust' ? 'rust' : 'darkmetal', 0.357, 0.357, 0.035, x, y + yy, z, 0, 0, 0, 22);
      this.pcyl('darkmetal', 0.31, 0.31, 0.012, x, y + 0.948, z, 0, 0, 0, 18);
      this.pcyl('hardware', 0.035, 0.035, 0.025, x + 0.16, y + 0.955, z + 0.05, 0, 0, 0, 8);
    }
    // helper: local->world for a prop frame
    frame(x, z, ry) {
      const c = Math.cos(ry), s = Math.sin(ry);
      return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    }
    colFor(x, z, ry, w, d, h) {
      const swap = Math.abs(Math.sin(ry)) > 0.5;
      const hw = (swap ? d : w) / 2, hd = (swap ? w : d) / 2;
      this.addCol(x - hw, x + hw, z - hd, z + hd, h, null);
    }
    // a place loot can be: tagged with its room's theme; big = room for a two-handed item; c = inside a container
    spot(room, x, y, z, w, big, c = null) {
      this.spots.push({ x, y, z, room: room ? room.id : -1, tag: room ? room.type : 'corridor', w, big: !!big, c });
    }
    // a hollow steel box (back, sides, top, floor, inner shelf) whose front is a hinged door built in build()
    container(room, kind, x, z, ry, W, H, D, shelfY, mat) {
      const r = this.rng, L = this.frame(x, z, ry), Y0 = this.roomY(room);
      const part = (w, h, d, lx, y, lz, m = mat) => { const [px, pz] = L(lx, lz); this.pbox(m, w, h, d, px, Y0 + y, pz, ry); };
      part(W, H, 0.02, 0, 0, -D / 2 + 0.01);
      for (const s of [-1, 1]) part(0.02, H, D, s * (W / 2 - 0.01), 0, 0);
      part(W, 0.03, D, 0, H - 0.03, 0); part(W, 0.06, D, 0, 0, 0);
      part(W - 0.04, 0.02, D - 0.04, 0, shelfY, -0.01);
      part(W - 0.05, H - 0.12, 0.01, 0, 0.06, -D / 2 + 0.025, 'dark');
      const id = this.containers.length;
      this.containers.push({ id, kind, x, y: Y0, z, ry, w: W, h: H, d: D, open: false, anim: 0, swing: -1.9, closedRy: ry, mesh: null, room: room.id, lv: room.lv });
      // whatever is inside sits on the floor of it or up on the shelf
      const [sx, sz] = L(0, -0.04);
      this.spot(room, sx, Y0 + (r.chance(0.65) ? 0.06 : shelfY + 0.02), sz, kind === 'locker' ? 0.5 : 0.9, false, id);
      return id;
    }
    locker(room, x, z, ry) { this.container(room, 'locker', x, z, ry, 0.58, 2.0, 0.5, 1.6, 'locker'); }
    cabinet(room, x, z, ry) {
      this.container(room, 'cabinet', x, z, ry, 0.55, 1.35, 0.6, 0.68, 'painted');
      this.spot(room, x, this.roomY(room) + 1.35, z, 0.25, false);
    }
    roomY(room) { return Y0 - room.lv * DROP; }
    furnish(room) {
      this.lv = room.lv;
      this.furnishRoom(room);
      this.lv = 0;
    }
    furnishRoom(room) {
      const r = this.rng, Y0 = this.roomY(room);
      const tiles = [];
      for (let i = room.i; i < room.i + room.w; i++) for (let j = room.j; j < room.j + room.h; j++) tiles.push([i, j]);
      // keep doorways clear
      for (const [i, j] of tiles) for (const [dx, dy] of DIRS) { const nk = this.idx(i + dx, j + dy); if (nk >= 0 && (this.grid[nk] === 1 || this.grid[nk] === 4)) this.markClear(i, j, 1); }
      const dens = { storage: 0.65, office: 0.5, lab: 0.45, lockers: 0.6, morgue: 0.5, machine: 0.4, boiler: 0.4, hall: 0.25, core: 0.25, exit: 0.3, entrance: 0.25, stairs: 0.1 }[room.type] || 0.3;
      const perim = [];
      for (const [i, j] of tiles) {
        const k = this.idx(i, j); if (this.clear[k]) continue;
        const walls = DIRS.filter(([dx, dy]) => { const nk = this.idx(i + dx, j + dy); return nk < 0 || this.grid[nk] === 0; });
        if (walls.length) perim.push([i, j, walls[0]]);
      }
      r.shuffle(perim);
      const count = Math.floor(perim.length * dens);
      for (let n = 0; n < count; n++) {
        const [i, j, [dx, dy]] = perim[n];
        const k = this.idx(i, j);
        this.block[k] = 1;
        this.wallProp(room, i, j, dx, dy);
      }
      // centerpiece for big rooms
      if (room.w >= 5 && room.h >= 5) {
        const ci = room.i + Math.floor(room.w / 2), cj = room.j + Math.floor(room.h / 2), k = this.idx(ci, cj);
        if (!this.clear[k]) { this.block[k] = 1; this.centerProp(room, ci, cj); }
      } else if (room.type === 'core') {
        const ci = room.cx, cj = room.cy, k = this.idx(ci, cj);
        this.block[k] = 0; this.centerProp(room, ci, cj);
      }
      // floor spots: things get dropped and kicked into corners, along walls and against furniture, rarely in the
      // middle of a floor (the obvious places were picked clean long ago)
      for (const [i, j] of tiles) {
        const k = this.idx(i, j);
        if (this.block[k] || this.clear[k]) continue;
        const walls = DIRS.filter(([dx, dy]) => { const nk = this.idx(i + dx, j + dy); return nk < 0 || this.grid[nk] === 0 || this.block[nk]; });
        if (!walls.length) { if (r.chance(0.25)) this.spot(room, this.cx(i) + r.range(-0.9, 0.9), Y0, this.cz(j) + r.range(-0.9, 0.9), 0.15, true); continue; }
        // tuck it against the wall (or into the corner when there are two)
        let ox = 0, oz = 0; for (const [dx, dy] of walls) { ox += dx; oz += dy; }
        const corner = walls.length >= 2, [wx, wz] = walls[0], jit = corner ? 0 : r.range(-0.9, 0.9);
        this.spot(room, this.cx(i) + clamp(ox, -1, 1) * (TS / 2 - 0.45) + (wx ? 0 : jit), Y0, this.cz(j) + clamp(oz, -1, 1) * (TS / 2 - 0.45) + (wz ? 0 : jit), corner ? 0.8 : 0.45, true);
      }
      // hanging chains in tall rooms
      const h = RT[room.type].h;
      if (h >= 5.5) for (let c = 0; c < Math.floor(room.w * room.h / 6); c++) {
        const x = this.cx(room.i) - TS / 2 + r.range(0.5, room.w * TS - 0.5), z = this.cz(room.j) - TS / 2 + r.range(0.5, room.h * TS - 0.5);
        const len = r.range(1.5, h - 2.6);
        this.pcyl('darkmetal', 0.015, 0.015, len, x, Y0 + h - len / 2, z);
        this.pbox('darkmetal', 0.08, 0.15, 0.03, x, Y0 + h - len - 0.15, z);
      }
      // debris
      for (let c = 0; c < Math.floor(room.w * room.h / 4); c++) {
        const [i, j] = r.pick(tiles);
        const x = this.cx(i) + r.range(-1.2, 1.2), z = this.cz(j) + r.range(-1.2, 1.2);
        const t = r.next();
        if (t < 0.5) this.put('paper', new THREE.PlaneGeometry(0.22, 0.3), mat4(x, Y0 + 0.012, z, r.range(0, TAU), -Math.PI / 2));
        else if (t < 0.7) this.pcyl('rust', 0.035, 0.035, 0.12, x, Y0 + 0.035, z, Math.PI / 2, r.range(0, TAU), 0, 8);
        else if (t < 0.85) this.put('puddle', new THREE.CircleGeometry(r.range(0.4, 1.0), 14), mat4(x, Y0 + 0.01, z, 0, -Math.PI / 2));
        else this.crateProp(x, Y0, z, 0.38, r.range(0, TAU));
      }
      if (room.type === 'morgue' || (room.type === 'lab' && r.chance(0.5)) || r.chance(0.12)) {
        const [i, j] = r.pick(tiles);
        this.put('blood', new THREE.PlaneGeometry(r.range(1.2, 2.2), r.range(1.2, 2.2)), mat4(this.cx(i), Y0 + 0.015, this.cz(j), r.range(0, TAU), -Math.PI / 2));
      }
      if (room.lv > 0) this.decay(tiles, Y0, room.lv, RT[room.type].h, room);
    }
    // what years of nobody bring to a lower level: water down the walls, standing water, fallen ceiling panels and the
    // dark holes they left, rubble, cables hanging out of the ceiling
    decay(tiles, Y0, lv, h, room) {
      const r = this.rng, n = tiles.length, k = lv >= 2 ? 1.6 : 1;
      const solid = (i, j) => { const q = this.idx(i, j); return q < 0 || this.grid[q] === 0; };
      // stains run down from the ceiling on the bare walls
      for (const [i, j] of tiles) for (const [dx, dy] of DIRS) {
        if (!solid(i + dx, j + dy) || !r.chance(0.32 * k)) continue;
        const along = r.range(-0.4, 0.4), w = r.range(1.0, TS - 0.1 - 2 * Math.abs(along));
        const x = this.cx(i) + dx * (TS / 2 - 0.012), z = this.cz(j) + dy * (TS / 2 - 0.012), px = x + (dy ? along : 0), pz = z + (dx ? along : 0);
        this.put('stain', new THREE.PlaneGeometry(w, h), mat4(px, Y0 + h / 2, pz, Math.atan2(-dx, -dy)));
      }
      // standing water
      for (let c = 0; c < Math.ceil(n * 0.22 * k); c++) {
        const [i, j] = r.pick(tiles);
        this.put('puddle', new THREE.CircleGeometry(r.range(0.6, 1.5) * (lv >= 2 ? 1.3 : 1), 18), mat4(this.cx(i) + r.range(-0.8, 0.8), Y0 + 0.011, this.cz(j) + r.range(-0.8, 0.8), 0, -Math.PI / 2));
      }
      // fallen ceiling panels, each leaving a black hole above it
      for (let c = 0; c < Math.ceil(n * 0.08 * k); c++) {
        const [i, j] = r.pick(tiles);
        if (this.block[this.idx(i, j)] || this.clear[this.idx(i, j)]) continue;
        const x = this.cx(i) + r.range(-0.8, 0.8), z = this.cz(j) + r.range(-0.8, 0.8), a = r.range(0, TAU);
        this.put('dark', new THREE.PlaneGeometry(1.2, 0.6), mat4(x + r.range(-0.4, 0.4), Y0 + h - 0.008, z + r.range(-0.4, 0.4), a, Math.PI / 2));
        if (r.chance(0.5)) this.pbox('ceiling', 1.2, 0.03, 0.6, x, Y0, z, a);
        else { const g = new THREE.BoxGeometry(1.2, 0.03, 0.6); this.put('ceiling', g, mat4(x, Y0 + 0.28, z, a, 0, 0.5)); }
      }
      // rubble kicked against the walls and into the corners
      for (let c = 0; c < Math.ceil(n * 0.18 * k); c++) {
        const [i, j] = r.pick(tiles);
        const walls = DIRS.filter(([dx, dy]) => solid(i + dx, j + dy));
        if (!walls.length || this.clear[this.idx(i, j)]) continue;
        const [dx, dy] = r.pick(walls), cx = this.cx(i) + dx * (TS / 2 - 0.35) + (dy ? r.range(-1, 1) : 0), cz = this.cz(j) + dy * (TS / 2 - 0.35) + (dx ? r.range(-1, 1) : 0);
        for (let q = 0; q < r.int(3, 7); q++) {
          const s = r.range(0.07, 0.2), g = new THREE.DodecahedronGeometry(s, 0); g.scale(1, r.range(0.5, 0.9), r.range(0.7, 1.2));
          this.put(r.chance(0.7) ? 'bunker' : 'wall', g, mat4(cx + r.range(-0.4, 0.4), Y0 + s * 0.4, cz + r.range(-0.4, 0.4), r.range(0, TAU), r.range(0, TAU)));
        }
      }
      // loose cable hanging out of the ceiling
      for (let c = 0; c < Math.ceil(n * 0.06 * k); c++) {
        const [i, j] = r.pick(tiles), len = r.range(0.6, Math.min(2.2, h - 1.9));
        if (len < 0.4) continue;
        const x = this.cx(i) + r.range(-1, 1), z = this.cz(j) + r.range(-1, 1);
        this.pcyl('cable', 0.012, 0.012, len, x, Y0 + h - len / 2, z, r.range(-0.12, 0.12), 0, r.range(-0.12, 0.12), 5);
      }
      // and the growth that came in with the water: vines trailing down from the ceiling, moss over the floor
      for (let c = 0; c < Math.ceil(n * 0.1 * k); c++) {
        const [i, j] = r.pick(tiles), len = r.range(0.5, Math.min(1.8, h - 1.95));
        if (len < 0.4) continue;
        const x = this.cx(i) + r.range(-1.2, 1.2), z = this.cz(j) + r.range(-1.2, 1.2);
        for (const a of [0, Math.PI / 2]) {
          const g = new THREE.PlaneGeometry(0.3, len), uv = g.attributes.uv;
          for (let q = 0; q < uv.count; q++) uv.setY(q, uv.getY(q) * len / 1.1);
          this.put('vine', g, mat4(x, Y0 + h - len / 2 - 0.02, z, a + r.range(-0.3, 0.3)));
        }
      }
      for (let c = 0; c < Math.ceil(n * 0.14 * k); c++) {
        const [i, j] = r.pick(tiles);
        this.put('moss', new THREE.CircleGeometry(r.range(0.35, 1.0), 12), mat4(this.cx(i) + r.range(-1, 1), Y0 + 0.013, this.cz(j) + r.range(-1, 1), r.range(0, TAU), -Math.PI / 2));
      }
    }
    wallProp(room, i, j, dx, dy) {
      const r = this.rng, Y0 = this.roomY(room);
      const ry = Math.atan2(-dx, -dy);
      const at = (depth) => [this.cx(i) + dx * (TS / 2 - depth / 2 - 0.06), this.cz(j) + dy * (TS / 2 - depth / 2 - 0.06)];
      const pool = {
        storage: ['shelf', 'shelf', 'crates', 'barrels'],
        office: ['desk', 'desk', 'cabinet', 'crates'],
        lab: ['tank', 'labbench', 'cabinet', 'labbench'],
        lockers: ['lockers', 'lockers', 'bench'],
        morgue: ['gurney', 'gurney', 'cabinet', 'drawers'],
        machine: ['machine', 'barrels', 'crates'],
        boiler: ['pipesv', 'barrels', 'machine'],
        hall: ['crates', 'barrels', 'shelf'],
        core: ['machine', 'pipesv'],
        exit: ['crates', 'barrels', 'lockers'],
        entrance: ['bench', 'cabinet'],
        stairs: ['barrels', 'crates'],
      }[room.type] || ['crates'];
      const kind = r.pick(pool);
      const f = (d) => { const [x, z] = at(d); return [x, z, this.frame(x, z, ry)]; };
      switch (kind) {
        case 'shelf': {
          const w = 2.6, d = 0.6, [x, z, L] = f(d);
          for (const [lx, lz] of [[-w / 2 + 0.03, -d / 2 + 0.03], [w / 2 - 0.03, -d / 2 + 0.03], [-w / 2 + 0.03, d / 2 - 0.03], [w / 2 - 0.03, d / 2 - 0.03]]) { const [px, pz] = L(lx, lz); this.pbox('darkmetal', 0.06, 2.2, 0.06, px, Y0, pz, ry); this.pbox('rubber', 0.09, 0.02, 0.09, px, Y0, pz, ry); }
          // cross-bracing down the back and at each end, the way real racking is held square
          for (const s of [-1, 1]) this.lbox('darkmetal', L, ry, Math.hypot(w, 2.0) * 0.98, 0.035, 0.012, 0, Y0 + 1.1 - 0.0175, -d / 2 + 0.02, s * Math.atan2(2.0, w));
          for (const e of [-1, 1]) for (let q = 0; q < 3; q++) this.lbox('darkmetal', L, ry, 0.03, 0.03, d - 0.06, e * (w / 2 - 0.03), Y0 + 0.4 + q * 0.65, 0);
          for (const sy of [0.1, 0.75, 1.4, 2.05]) {
            this.pbox('painted', w, 0.04, d, x, Y0 + sy, z, ry);
            for (const e of [-1, 1]) this.lbox('darkmetal', L, ry, w, 0.06, 0.025, 0, Y0 + sy - 0.02, e * (d / 2 - 0.0125));
            const n = r.int(0, 3);
            for (let b = 0; b < n; b++) { const bw = r.range(0.3, 0.6), bh = r.range(0.2, 0.5); const [px, pz] = L(r.range(-1.0, 1.0), r.range(-0.1, 0.1)); this.pbox(r.chance(0.6) ? 'crate' : 'cloth', bw, Math.min(bh, 0.55), Math.min(bw, 0.5), px, Y0 + sy + 0.04, pz, ry + r.range(-0.2, 0.2)); }
            // between the boxes on a shelf, at any height you can still reach
            if (sy > 0.5 && sy < 1.5 && r.chance(0.6)) { const [px, pz] = L(r.range(-0.9, 0.9), 0.05); this.spot(room, px, Y0 + sy + 0.04, pz, 1.1, false); }
            if (sy < 0.5 && r.chance(0.35)) { const [px, pz] = L(r.range(-0.9, 0.9), -0.05); this.spot(room, px, Y0 + sy + 0.04, pz, 0.9, false); }
          }
          this.colFor(x, z, ry, w, d, 2.2);
          break;
        }
        case 'crates': {
          const [x, z, L] = f(1.2);
          const n = r.int(1, 3);
          for (let c = 0; c < n; c++) { const s = r.range(0.8, 1.15); const [px, pz] = L(r.range(-0.6, 0.6), r.range(-0.1, 0.1)); this.crateProp(px, Y0, pz, s, ry + r.range(-0.3, 0.3)); if (c === 0 && r.chance(0.4)) this.crateProp(px, Y0 + s, pz, s * 0.7, ry + r.range(-0.5, 0.5)); }
          // in the gap beside the stack, against the wall
          { const [px, pz] = L(r.pick([-1, 1]) * 1.25, -0.25); this.spot(room, px, Y0, pz, 1.2, true); }
          this.colFor(x, z, ry, 2.2, 1.2, 1.6);
          break;
        }
        case 'barrels': {
          const [x, z, L] = f(0.9);
          const mats = ['rust', 'painted', 'darkmetal'];
          const nb = r.int(1, 3);
          for (let c = 0; c < nb; c++) { const [px, pz] = L(-0.8 + c * 0.8, r.range(-0.1, 0.1)); this.barrelProp(r.pick(mats), px, Y0, pz); }
          // wedged behind / beside the drums
          { const [px, pz] = L(-0.8 + nb * 0.8 - 0.1, -0.15); this.spot(room, px, Y0, pz, 1, true); }
          if (r.chance(0.4)) { const [px, pz] = L(-0.8 + r.int(0, nb - 1) * 0.8, 0); this.spot(room, px, Y0 + 0.96, pz, 0.6, false); }
          this.colFor(x, z, ry, 2.4, 0.8, 1);
          break;
        }
        case 'desk': {
          const w = 1.7, d = 0.8, [x, z, L] = f(d + 0.5);
          const [dx0, dz0] = L(0, -0.25);
          // a steel office desk: wooden top, a drawer pedestal on one side, a modesty panel at the back; on it an old
          // beige terminal, its keyboard and the paperwork; a swivel chair pushed out from it
          this.pbox('wood', w, 0.05, d, dx0, Y0 + 0.74, dz0, ry);
          this.lbox('wood', L, ry, w + 0.02, 0.02, 0.02, 0, Y0 + 0.74, -0.25 + d / 2);
          for (const [lx, lz] of [[-w / 2 + 0.05, -0.25 - d / 2 + 0.05], [-w / 2 + 0.05, -0.25 + d / 2 - 0.05]]) this.lbox('darkmetal', L, ry, 0.05, 0.74, 0.05, lx, Y0, lz);
          this.lbox('painted', L, ry, 0.46, 0.72, d - 0.04, w / 2 - 0.25, Y0 + 0.02, -0.25);
          for (let q = 0; q < 3; q++) { this.lbox('painted', L, ry, 0.42, 0.21, 0.02, w / 2 - 0.25, Y0 + 0.06 + q * 0.225, -0.25 + d / 2 - 0.01); this.lbox('hardware', L, ry, 0.12, 0.018, 0.025, w / 2 - 0.25, Y0 + 0.2 + q * 0.225, -0.25 + d / 2 + 0.005); }
          this.lbox('painted', L, ry, w - 0.55, 0.45, 0.02, -0.25, Y0 + 0.27, -0.25 - d / 2 + 0.06);
          const [mx, mz] = L(r.range(-0.4, 0.1), -0.42), crt = 'beige';
          this.pbox(crt, 0.42, 0.36, 0.3, mx, Y0 + 0.83, mz, ry);
          { const [bx, bz] = this.frame(mx, mz, ry)(0, -0.2); this.pbox(crt, 0.3, 0.26, 0.16, bx, Y0 + 0.86, bz, ry); }
          { const [sx, sz] = this.frame(mx, mz, ry)(0, 0.151); this.pbox('dark', 0.32, 0.25, 0.01, sx, Y0 + 0.885, sz, ry); }
          this.pbox(crt, 0.24, 0.05, 0.2, mx, Y0 + 0.775, mz, ry);
          { const [kx, kz] = this.frame(mx, mz, ry)(0.02, 0.36); this.pbox(crt, 0.44, 0.025, 0.15, kx, Y0 + 0.77, kz, ry + r.range(-0.15, 0.15)); }
          for (let p = 0; p < 3; p++) { const [px, pz] = L(r.range(-0.7, 0.7), r.range(-0.5, 0)); this.put('paper', new THREE.PlaneGeometry(0.21, 0.29), mat4(px, Y0 + 0.772 + p * 0.002, pz, r.range(0, TAU), -Math.PI / 2)); }
          if (r.chance(0.6)) { const [ux, uz] = L(r.range(-0.75, -0.45), r.range(-0.4, -0.1)); this.pcyl('sheet', 0.042, 0.038, 0.1, ux, Y0 + 0.82, uz, 0, 0, 0, 12); }
          const [cx, cz] = L(r.range(-0.3, 0.3), 0.45), cry = ry + r.range(-0.6, 0.6), C = this.frame(cx, cz, cry);
          this.pbox('cloth', 0.46, 0.08, 0.44, cx, Y0 + 0.44, cz, cry);
          { const [bx, bz] = C(0, 0.22); this.put('cloth', new THREE.BoxGeometry(0.44, 0.48, 0.06), mat4(bx, Y0 + 0.78, bz, cry, -0.12)); }
          this.pcyl('darkmetal', 0.025, 0.025, 0.36, cx, Y0 + 0.24, cz, 0, 0, 0, 8);
          for (let q = 0; q < 5; q++) { const a = cry + (q / 5) * TAU, lx = Math.sin(a) * 0.2, lz = Math.cos(a) * 0.2; this.put('darkmetal', new THREE.BoxGeometry(0.03, 0.025, 0.21), mat4(cx + lx * 0.5, Y0 + 0.06, cz + lz * 0.5, a)); this.pcyl('rubber', 0.025, 0.025, 0.03, cx + lx, Y0 + 0.025, cz + lz, Math.PI / 2, a, 0, 8); }
          // on the desk among the papers, or kicked under it into the dark
          { const [sx, sz] = L(r.range(-0.6, 0.6), -0.3); this.spot(room, sx, Y0 + 0.77, sz, 0.7, true); }
          { const [sx, sz] = L(r.range(-0.5, 0.5), -0.45); this.spot(room, sx, Y0, sz, 1.1, false); }
          this.colFor(dx0, dz0, ry, w, d, 0.8);
          break;
        }
        case 'cabinet': {
          const [x, z] = at(0.6);
          this.cabinet(room, x, z, ry);
          this.colFor(x, z, ry, 0.6, 0.6, 1.35);
          break;
        }
        case 'drawers': {
          // the morgue's cold chamber: a steel cabinet faced with a grid of body drawers, each with its latch handle
          // and name-card slot; now and then one left pulled half out
          const [x, z, L] = f(0.8);
          this.pbox('darkmetal', 2.2, 2.0, 0.8, x, Y0, z, ry);
          for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
            const lx = -0.72 + col * 0.72, y = Y0 + 0.1 + row * 0.62, out = r.chance(0.08) ? r.range(0.25, 0.55) : 0;
            this.lbox('metal', L, ry, 0.66, 0.56, 0.03 + out, lx, y, 0.4 + out / 2);
            this.lbox('hardware', L, ry, 0.22, 0.03, 0.04, lx, y + 0.42, 0.43 + out);
            this.lbox('paper', L, ry, 0.12, 0.07, 0.005, lx - 0.2, y + 0.42, 0.417 + out);
          }
          this.colFor(x, z, ry, 2.2, 0.8, 2);
          break;
        }
        case 'lockers': {
          const [x, z, L] = f(0.5);
          for (let c = 0; c < 4; c++) { const [px, pz] = L(-0.9 + c * 0.6, 0); this.locker(room, px, pz, ry); }
          this.colFor(x, z, ry, 2.4, 0.5, 2);
          break;
        }
        case 'bench': {
          const [x, z, L] = f(0.45);
          // a slatted changing-room bench on steel legs
          for (let q = 0; q < 3; q++) this.lbox('wood', L, ry, 1.8, 0.045, 0.115, 0, Y0 + 0.44, -0.13 + q * 0.13);
          for (const e of [-0.7, 0.7]) { this.lbox('darkmetal', L, ry, 0.05, 0.44, 0.34, e, Y0, 0); this.lbox('darkmetal', L, ry, 0.08, 0.03, 0.38, e, Y0, 0); }
          this.lbox('darkmetal', L, ry, 1.4, 0.04, 0.04, 0, Y0 + 0.12, 0);
          { const [sx, sz] = L(r.range(-0.6, 0.6), 0); this.spot(room, sx, Y0 + 0.51, sz, 0.4, false); }
          this.colFor(x, z, ry, 1.8, 0.45, 0.5);
          break;
        }
        case 'tank': {
          const [x, z] = at(1.1);
          this.pcyl('darkmetal', 0.55, 0.6, 0.3, x, Y0 + 0.15, z); this.pcyl('darkmetal', 0.55, 0.55, 0.2, x, Y0 + 2.3, z);
          this.pcyl('glass', 0.5, 0.5, 1.9, x, Y0 + 1.25, z, 0, 0, 0, 16);
          this.pcyl('liquid', 0.47, 0.47, r.range(1.0, 1.8), x, Y0 + 0.3 + 0.8, z, 0, 0, 0, 16);
          if (r.chance(0.75)) { const g = new THREE.CapsuleGeometry(0.18, 0.6, 4, 8); this.put('darkflesh', g, mat4(x, Y0 + 1.2, z, r.range(0, TAU), r.range(-0.4, 0.4), r.range(-0.4, 0.4))); }
          // dropped at the foot of the tank
          { const [, , L] = f(1.1); const [sx, sz] = L(r.pick([-1, 1]) * 0.75, 0.1); this.spot(room, sx, Y0, sz, 0.8, false); }
          this.colFor(x, z, ry, 1.2, 1.2, 2.4);
          break;
        }
        case 'labbench': {
          const [x, z, L] = f(0.8);
          // a lab bench: tiled carcass with cupboard doors and a kick plate, a black resin top, a steel sink with a
          // swan-neck tap at one end, glassware and a rack of tubes
          this.pbox('wallTile', 2.4, 0.9, 0.8, x, Y0, z, ry);
          this.lbox('dark', L, ry, 2.36, 0.08, 0.02, 0, Y0, 0.4);
          for (let q = 0; q < 4; q++) { this.lbox('painted', L, ry, 0.56, 0.74, 0.02, -0.9 + q * 0.6, Y0 + 0.1, 0.405); this.lbox('hardware', L, ry, 0.02, 0.14, 0.03, -0.9 + q * 0.6 + (q % 2 ? -0.23 : 0.23), Y0 + 0.55, 0.42); }
          this.pbox('dark', 2.45, 0.05, 0.85, x, Y0 + 0.9, z, ry);
          const sx0 = r.pick([-0.8, 0.8]);
          this.lbox('hardware', L, ry, 0.5, 0.012, 0.42, sx0, Y0 + 0.95, 0.02);
          { const [tx, tz] = L(sx0, -0.28); this.pcyl('hardware', 0.015, 0.015, 0.3, tx, Y0 + 1.1, tz, 0, 0, 0, 8); const [nx, nz] = L(sx0, -0.2); this.pcyl('hardware', 0.013, 0.013, 0.18, nx, Y0 + 1.25, nz, Math.PI / 2, ry, 0, 8); }
          for (let c = 0; c < r.int(1, 4); c++) { const [px, pz] = L(-sx0 * r.range(0.5, 1.1), r.range(-0.2, 0.2)); this.pcyl('glass', 0.06, 0.08, 0.25, px, Y0 + 1.07, pz, 0, 0, 0, 12); }
          if (r.chance(0.6)) { this.lbox('darkmetal', L, ry, 0.36, 0.06, 0.12, 0, Y0 + 0.95, -0.25); for (let q = 0; q < 6; q++) { const [tx, tz] = L(-0.15 + q * 0.06, -0.25); this.pcyl('glass', 0.012, 0.012, 0.16, tx, Y0 + 1.06, tz, 0, 0, 0, 6); } }
          // among the glassware on the bench
          { const [sx, sz] = L(r.range(-0.9, 0.9), r.range(-0.2, 0.15)); this.spot(room, sx, Y0 + 0.95, sz, 1, false); }
          this.colFor(x, z, ry, 2.4, 0.8, 1);
          break;
        }
        case 'gurney': {
          const [x, z, L] = f(0.9);
          const gry = ry + Math.PI / 2;
          // a steel gurney: the slab with a raised lip, legs braced near the floor, castors, a push bar at the head
          const G = this.frame(x, z, gry);
          this.pbox('hardware', 2.0, 0.05, 0.8, x, Y0 + 0.8, z, gry);
          for (const e of [-1, 1]) { this.lbox('darkmetal', G, gry, 2.0, 0.05, 0.025, 0, Y0 + 0.84, e * 0.39); this.lbox('darkmetal', G, gry, 0.025, 0.05, 0.8, e * 0.99, Y0 + 0.84, 0); }
          for (const [lx, lz] of [[-0.9, -0.3], [0.9, -0.3], [-0.9, 0.3], [0.9, 0.3]]) {
            this.lbox('darkmetal', G, gry, 0.04, 0.68, 0.04, lx, Y0 + 0.12, lz);
            const [px, pz] = G(lx, lz); this.pcyl('rubber', 0.055, 0.055, 0.03, px, Y0 + 0.055, pz, Math.PI / 2, gry, 0, 12); this.pbox('darkmetal', 0.05, 0.07, 0.05, px, Y0 + 0.09, pz, gry);
          }
          for (const e of [-1, 1]) this.lbox('darkmetal', G, gry, 1.8, 0.03, 0.03, 0, Y0 + 0.25, e * 0.3);
          { const [hx, hz] = G(-1.04, 0); this.pcyl('hardware', 0.016, 0.016, 0.66, hx, Y0 + 1.0, hz, Math.PI / 2, gry, 0, 8); for (const e of [-0.3, 0.3]) { const [ux, uz] = G(-1.0, e); this.pcyl('hardware', 0.014, 0.014, 0.18, ux, Y0 + 0.92, uz, 0, 0, 0, 6); } }
          if (r.chance(0.7)) {
            const g = new THREE.CapsuleGeometry(0.22, 1.3, 4, 10); g.rotateZ(Math.PI / 2); g.scale(1, 0.55, 1.1);
            this.put('sheet', g, mat4(x, Y0 + 1.0, z, gry));
            const [hx, hz] = this.frame(x, z, gry)(-0.85, 0); this.put('sheet', new THREE.SphereGeometry(0.14, 10, 8), mat4(hx, Y0 + 1.02, hz));
            if (r.chance(0.5)) this.put('blood', new THREE.PlaneGeometry(1, 1), mat4(x, Y0 + 0.014, z, r.range(0, TAU), -Math.PI / 2));
            // personal effects left with the body
            if (r.chance(0.6)) { const [sx, sz] = this.frame(x, z, gry)(r.range(-0.2, 0.6), r.pick([-0.3, 0.3])); this.spot(room, sx, Y0 + 0.86, sz, 1.2, false); }
          }
          // or fallen underneath the gurney
          this.spot(room, x, Y0, z, 0.7, false);
          this.colFor(x, z, ry, 0.9, 2.1, 1.1);
          break;
        }
        case 'machine': {
          // a big control cabinet on a plinth: louvred vents, a control panel with lamps and gauges, a valve wheel,
          // cable conduit running up into the ceiling
          const [x, z, L] = f(1.3), mh = r.range(1.8, 2.6);
          this.lbox('darkmetal', L, ry, 2.3, 0.12, 1.36, 0, Y0, 0);
          this.pbox(r.chance(0.5) ? 'painted' : 'rust', 2.2, mh - 0.12, 1.3, x, Y0 + 0.12, z, ry);
          this.lbox('darkmetal', L, ry, 2.24, 0.06, 1.34, 0, Y0 + mh - 0.02, 0);
          for (const e of [-1, 1]) this.lbox('vent', L, ry, 0.5, 0.4, 0.02, e * 0.75, Y0 + 0.35, 0.655);
          const [px, pz] = L(r.range(-0.8, 0.8), 0.66); this.pbox('dark', 0.5, 0.35, 0.04, px, Y0 + 1.2, pz, ry);
          for (let g = 0; g < 2; g++) { const [gx, gz] = L(-0.85 + g * 0.22, 0.67); this.pcyl('hardware', 0.07, 0.07, 0.03, gx, Y0 + 1.75, gz, Math.PI / 2, ry, 0, 16); const [fx, fz] = L(-0.85 + g * 0.22, 0.685); this.pcyl('sheet', 0.058, 0.058, 0.005, fx, Y0 + 1.75, fz, Math.PI / 2, ry, 0, 16); }
          { const [wx, wz] = L(0.8, 0.7); this.put('hardware', new THREE.TorusGeometry(0.13, 0.015, 6, 18), mat4(wx, Y0 + 0.95, wz, ry)); this.pcyl('hardware', 0.02, 0.02, 0.08, wx, Y0 + 0.95, wz, Math.PI / 2, ry, 0, 8); }
          { const [cx2, cz2] = L(0.95, 0.1); this.pcyl('cable', 0.04, 0.04, RT[room.type].h - mh, cx2, Y0 + mh + (RT[room.type].h - mh) / 2, cz2, 0, 0, 0, 8); }
          for (let c = 0; c < 3; c++) { const [lx, lz] = L(-0.15 + c * 0.12 + r.range(-0.6, 0.4), 0.67); this.pbox(r.chance(0.5) ? 'ledRed' : r.chance(0.5) ? 'ledGreen' : 'ledAmber', 0.04, 0.04, 0.02, lx, Y0 + 1.5, lz, ry); }
          const h = RT[room.type].h; const [qx, qz] = L(r.range(-0.6, 0.6), -0.2);
          this.pcyl('rust', 0.12, 0.12, h, qx, Y0 + h / 2, qz);
          // in the narrow gap between the machine and whatever is next to it
          { const [sx, sz] = L(r.pick([-1, 1]) * 1.3, -0.3); this.spot(room, sx, Y0, sz, 1.1, true); }
          this.colFor(x, z, ry, 2.2, 1.3, 2.6);
          break;
        }
        case 'pipesv': {
          const [x, z, L] = f(0.6);
          const h = RT[room.type].h;
          for (let c = 0; c < 3; c++) { const [px, pz] = L(-0.7 + c * 0.7, 0); this.pcyl(c === 1 ? 'darkmetal' : 'rust', 0.16, 0.16, h, px, Y0 + h / 2, pz); const [vx, vz] = L(-0.7 + c * 0.7, 0.2); this.pcyl('ledRed', 0.1, 0.1, 0.03, vx, Y0 + 1.3, vz, Math.PI / 2, ry, 0, 10); }
          { const [sx, sz] = L(r.pick([-0.35, 0.35]), -0.05); this.spot(room, sx, Y0, sz, 0.9, false); }
          this.colFor(x, z, ry, 2.2, 0.6, h);
          break;
        }
        default: break;
      }
    }
    centerProp(room, i, j) {
      const r = this.rng, x = this.cx(i), z = this.cz(j), h = RT[room.type].h, Y0 = this.roomY(room);
      switch (room.type) {
        case 'core': {
          this.pcyl('darkmetal', 0.75, 0.9, 0.5, x, Y0 + 0.25, z, 0, 0, 0, 16);
          this.pcyl('hazard', 0.92, 0.92, 0.04, x, Y0 + 0.02, z, 0, 0, 0, 20);
          for (let c = 0; c < 6; c++) { const a = (c / 6) * TAU, l = 2.4; this.pcyl('cable', 0.05, 0.05, l, x + Math.cos(a) * (l / 2 + 0.6), Y0 + 0.05, z + Math.sin(a) * (l / 2 + 0.6), Math.PI / 2, -a + Math.PI / 2, 0, 6); }
          this.pcyl('rust', 0.3, 0.3, h - 2.2, x, Y0 + 2.2 + (h - 2.2) / 2, z, 0, 0, 0, 12);
          this.pcyl('darkmetal', 0.6, 0.6, 0.3, x, Y0 + 2.2, z, 0, 0, 0, 14);
          this.coreSpot = { x, y: Y0 + 0.5, z };
          this.addCol(x - 0.8, x + 0.8, z - 0.8, z + 0.8, 1, null);
          break;
        }
        case 'machine': case 'boiler': {
          if (room.type === 'boiler') {
            this.pcyl('rust', 1.0, 1.0, 2.6, x, Y0 + 1.3, z, 0, 0, Math.PI / 2, 18);
            this.pbox('darkmetal', 0.3, 0.5, 1.6, x - 0.9, Y0, z); this.pbox('darkmetal', 0.3, 0.5, 1.6, x + 0.9, Y0, z);
            this.pcyl('darkmetal', 0.18, 0.18, h - 1.3, x + 0.6, Y0 + 1.3 + (h - 1.3) / 2, z);
          } else {
            this.pbox('painted', 2.4, 2.8, 2.4, x, Y0, z, r.range(0, 0.3));
            this.pbox('rust', 1.6, 1.0, 1.6, x, Y0 + 2.8, z);
            this.pcyl('rust', 0.2, 0.2, h - 3.8, x, Y0 + 3.8 + (h - 3.8) / 2, z);
            for (let c = 0; c < 4; c++) this.pbox(c % 2 ? 'ledGreen' : 'ledRed', 0.05, 0.05, 0.02, x - 0.3 + c * 0.2, Y0 + 1.8, z + 1.21);
          }
          this.addCol(x - 1.3, x + 1.3, z - 1.3, z + 1.3, 3, null);
          // tucked against the base of the big machine
          { const a = r.int(0, 3) * Math.PI / 2; this.spot(room, x + Math.cos(a) * 1.5, Y0, z + Math.sin(a) * 1.5, 1, true); }
          break;
        }
        case 'hall': {
          this.pbox('bunker', 1.2, h, 1.2, x, Y0, z);
          this.addCol(x - 0.6, x + 0.6, z - 0.6, z + 0.6, h, null);
          break;
        }
        default: {
          for (let c = 0; c < 4; c++) { const s = r.range(0.8, 1.2); this.crateProp(x + r.range(-0.6, 0.6), Y0 + (c === 3 ? 1.0 : 0), z + r.range(-0.6, 0.6), s, r.range(0, 1)); }
          this.addCol(x - 1.2, x + 1.2, z - 1.2, z + 1.2, 2, null);
          // in the shadow at the foot of the stack
          if (r.chance(0.6)) { const a = r.int(0, 3) * Math.PI / 2; this.spot(room, x + Math.cos(a) * 1.4, Y0, z + Math.sin(a) * 1.4, 0.7, true); }
        }
      }
    }
    // (a piece at a time: see generateGen)
    *corridorDressing() {
      const r = this.rng, W = this.W, deep = this.regions.map(() => []);
      for (let k = 0; k < this.grid.length; k++) {
        if ((k & 511) === 511) yield;
        if (this.grid[k] !== 1) continue;
        const i = k % W, j = Math.floor(k / W), x = this.cx(i), z = this.cz(j), h = this.ceil[k];
        const Y0 = this.tileY(k);
        this.lv = Math.max(0, this.lvl[k]); if (this.lv > 0) deep[this.lv].push([i, j]);
        const ew = this.floorAt(i - 1, j) && this.floorAt(i + 1, j) && !this.floorAt(i, j - 1) && !this.floorAt(i, j + 1);
        const ns = this.floorAt(i, j - 1) && this.floorAt(i, j + 1) && !this.floorAt(i - 1, j) && !this.floorAt(i + 1, j);
        if (ew) { this.pcyl('rust', 0.1, 0.1, TS, x, Y0 + h - 0.22, z - 1.15, 0, 0, Math.PI / 2, 8); this.pcyl('darkmetal', 0.06, 0.06, TS, x, Y0 + h - 0.42, z - 1.25, 0, 0, Math.PI / 2, 6); }
        if (ns) { this.pcyl('rust', 0.1, 0.1, TS, x + 1.15, Y0 + h - 0.22, z, Math.PI / 2, 0, 0, 8); this.pcyl('darkmetal', 0.06, 0.06, TS, x + 1.25, Y0 + h - 0.42, z, Math.PI / 2, 0, 0, 6); }
        // corridors were walked a thousand times; only dead ends still hold anything
        const exits = DIRS.filter(([dx, dy]) => this.floorAt(i + dx, j + dy)).length;
        if (exits === 1 && r.chance(0.5)) this.spot(null, x + r.range(-0.6, 0.6), Y0, z + r.range(-0.6, 0.6), 0.5, false);
        if (r.chance(0.18)) {
          const t = r.next();
          if (t < 0.5) this.put('paper', new THREE.PlaneGeometry(0.22, 0.3), mat4(x + r.range(-1, 1), Y0 + 0.012, z + r.range(-1, 1), r.range(0, TAU), -Math.PI / 2));
          else this.put('puddle', new THREE.CircleGeometry(r.range(0.3, 0.9), 12), mat4(x + r.range(-0.8, 0.8), Y0 + 0.01, z + r.range(-0.8, 0.8), 0, -Math.PI / 2));
        }
      }
      for (let n = 1; n < this.levels; n++) if (deep[n].length) { yield; this.lv = n; this.decay(deep[n], FAC_Y0 - n * DROP, n, CH, null); }
      this.lv = 0;
    }
    // ---------- blast doors ----------
    // heavy shutters across a few corridors, each stencilled with a code; only the ship's terminal can raise or drop
    // them. They only ever cut a loop, so everything stays reachable some other way, if further round.
    placeBlastDoors() {
      const r = this.rng, W = this.W, ent = this.rooms[0], start = this.idx(ent.ax, ent.ay);
      let total = 0; for (let k = 0; k < this.grid.length; k++) if (this.grid[k]) total++;
      const cut = new Set();
      const reach = () => {
        const seen = new Uint8Array(this.grid.length), q = [start]; seen[start] = 1; let n = 0;
        while (q.length) {
          const k = q.pop(); n++;
          const i = k % W, j = Math.floor(k / W);
          for (const [dx, dy] of DIRS) { const nk = this.idx(i + dx, j + dy); if (nk >= 0 && !seen[nk] && this.connected(k, nk) && !cut.has(this.edgeKey(k, nk))) { seen[nk] = 1; q.push(nk); } }
        }
        return n;
      };
      // a straight run of corridor, away from doorways, stairwells and the exits
      const straight = (k) => {
        const i = k % W, j = Math.floor(k / W), n = DIRS.map(([dx, dy]) => this.connected(k, this.idx(i + dx, j + dy)));
        if (this.clear[k] || DIRS.some(([dx, dy]) => { const nk = this.idx(i + dx, j + dy); return nk >= 0 && (this.room[nk] >= 0 || this.grid[nk] === 4); })) return null;
        return n[0] && n[1] && !n[2] && !n[3] ? 'x' : n[2] && n[3] && !n[0] && !n[1] ? 'z' : null;
      };
      const cand = [];
      for (let k = 0; k < this.grid.length; k++) {
        if (this.grid[k] !== 1) continue;
        const ax = straight(k); if (!ax) continue;
        const nk = ax === 'x' ? k + 1 : k + W;
        if (this.grid[nk] === 1 && straight(nk) === ax) cand.push([k, nk, ax]);
      }
      r.shuffle(cand);
      // (about one for every 240 tiles of floor, shared out between the levels: a few on every one of a deep plant)
      const want = clamp(Math.round(total / 240), 2, 3 + this.levels), letters = 'ABCDEFGHJKLMNPRSTUVWXYZ', used = new Set();
      const perLv = Math.ceil(want / this.levels), onLv = new Array(this.levels).fill(0);
      for (const pass of [0, 1]) for (const [k, nk, ax] of cand) {
        if (this.blasts.length >= want) break;
        if (this.blastEdge.has(this.edgeKey(k, nk)) || (!pass && onLv[this.lvl[k]] >= perLv)) continue;
        const i = k % W, j = Math.floor(k / W);
        if (this.blasts.some((b) => Math.abs(b.i - i) + Math.abs(b.j - j) < 9)) continue;
        cut.add(this.edgeKey(k, nk));
        if (reach() !== total) { cut.delete(this.edgeKey(k, nk)); continue; }
        let code; do code = letters[r.int(0, letters.length - 1)] + r.int(1, 9); while (used.has(code)); used.add(code);
        const dx = ax === 'x' ? 1 : 0, dz = ax === 'z' ? 1 : 0;
        const x = this.cx(i) + dx * TS / 2, z = this.cz(j) + dz * TS / 2, open = r.chance(0.35);
        const d = { id: this.blasts.length, code, i, j, a: k, b: nk, x, z, y: this.tileY(k), nx: dx, nz: dz, lv: this.lvl[k], open, anim: open ? 1 : 0, mesh: null };
        this.blasts.push(d); this.blastEdge.set(this.edgeKey(k, nk), d); onLv[d.lv]++;
        this.clear[k] = this.clear[nk] = 1;
        // the slab across the corridor (solid while it's down)
        this.addCol(x - (dx ? 0.25 : TS / 2), x + (dx ? 0.25 : TS / 2), z - (dz ? 0.25 : TS / 2), z + (dz ? 0.25 : TS / 2), 4, null, [k, nk], { blast: d });
      }
    }
    setBlast(id, open) { const d = this.blasts[id]; if (d) d.open = !!open; }

    // ---------- stairwells ----------
    shaftY(s, lv) { return Y0 - lv * DROP; }
    // the walking surface just under height y at (x, z) in a stairwell: a landing, a flight or the pit floor
    shaftFloor(s, x, z, y) {
      const u = x - s.x0, v = z - s.z0, cand = [this.shaftY(s, s.bot)];
      for (let lv = s.top; lv <= s.bot; lv++) {
        const yl = this.shaftY(s, lv);
        if (v < 3) cand.push(yl);
        if (lv < s.bot) {
          if (v > 9) cand.push(yl - 3);
          else if (v >= 3) cand.push(u >= 3 ? yl - 3 * (v - 3) / 6 : yl - 3 - 3 * (9 - v) / 6);
        }
      }
      if (y === undefined || y === null) y = this.shaftY(s, s.top) + 1;
      let best = -Infinity, lo = Infinity;
      for (const c of cand) { if (c <= y + 0.6 && c > best) best = c; if (c < lo) lo = c; }
      return best > -Infinity ? best : lo;
    }
    // the way down a stairwell, top first: each north landing, then across to the east flight, down it, across the
    // south landing and down the west flight to the next landing
    shaftNodes(s) {
      if (s.nodes) return s.nodes;
      const P = [], at = (u, v, y) => ({ x: s.x0 + u, z: s.z0 + v, y });
      s.landIdx = {};
      for (let lv = s.top; lv <= s.bot; lv++) {
        const yl = this.shaftY(s, lv);
        s.landIdx[lv] = P.length; P.push(at(3.0, 1.4, yl));
        if (lv < s.bot) P.push(at(4.6, 2.6, yl), at(4.6, 9.4, yl - 3), at(3.0, 10.6, yl - 3), at(1.4, 9.4, yl - 3), at(1.4, 2.6, yl - 6));
      }
      return (s.nodes = P);
    }
    // a doorway: the point just inside it and the middle of the tile outside
    shaftDoor(s, e) {
      const i = e.side === 'n' ? [1.5, 0.5] : e.side === 'w' ? [0.5, 1.5] : [5.5, 1.5];
      return { inside: { x: s.x0 + i[0], z: s.z0 + i[1], hard: true }, outside: { x: this.cx(e.out % this.W), z: this.cz(Math.floor(e.out / this.W)), hard: true } };
    }
    shaftNearest(s, x, z, y) {
      const P = this.shaftNodes(s); let bi = 0, bd = Infinity;
      P.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z) + Math.abs(p.y - (y === undefined ? p.y : y)) * 2; if (d < bd) { bd = d; bi = i; } });
      return bi;
    }
    // the nodes passed going from node a to node b (not including a)
    shaftWalk(s, a, b) {
      const P = this.shaftNodes(s), out = [];
      if (b > a) for (let i = a + 1; i <= b; i++) out.push(P[i]); else for (let i = a - 1; i >= b; i--) out.push(P[i]);
      return out.map((p) => ({ x: p.x, z: p.z, hard: true }));
    }
    // in at one doorway, down (or up) the flights, out at another
    shaftPassage(a, b) {
      const s = a.shaft; this.shaftNodes(s);
      const ia = s.landIdx[a.lv], ib = s.landIdx[b.lv], P = s.nodes, da = this.shaftDoor(s, a), db = this.shaftDoor(s, b);
      return [da.inside, { x: P[ia].x, z: P[ia].z, hard: true }, ...this.shaftWalk(s, ia, ib), db.inside, db.outside];
    }
    // the doorway best for getting toward level lv (that level's, else the nearest)
    shaftExitFor(s, lv) { let best = s.exits[0]; for (const e of s.exits) if (Math.abs(e.lv - lv) < Math.abs(best.lv - lv)) best = e; return best; }
    // walls (each doorway lets through only what's on its landing), the rail down the well between the flights, a
    // rail where the top landing drops away, the pit under the lowest flight, and dim lamps on every landing
    shaftColliders(s) {
      const x0 = s.x0, z0 = s.z0, X1 = x0 + SW * TS, Z1 = z0 + SL * TS, t = 0.2, tiles = [];
      for (let a = 0; a < SW; a++) for (let b = 0; b < SL; b++) tiles.push(this.idx(s.c + a, s.jb + b));
      const yTop = this.shaftY(s, s.top), yBot = this.shaftY(s, s.bot), col = (a, b, c, d, extra) => this.addCol(a, b, c, d, 99, null, tiles, extra);
      const wall = (side, fixed0, fixed1, from, to, horiz) => {
        const e = s.exits.find((q) => q.side === side), at = (a, b, extra) => (horiz ? col(a, b, fixed0, fixed1, extra) : col(fixed0, fixed1, a, b, extra));
        if (!e) { at(from, to); return; }
        const c = side === 'n' ? x0 + 1.5 : z0 + 1.5, yl = this.shaftY(s, e.lv);
        at(from, c - DW / 2); at(c + DW / 2, to); at(c - DW / 2, c + DW / 2, { ygap: [yl - 0.8, yl + 1.4] });
      };
      wall('n', z0 + 0.01, z0 + t, x0, X1, true);
      wall('s', Z1 - t, Z1 - 0.01, x0, X1, true);
      wall('w', x0 + 0.01, x0 + t, z0, Z1, false);
      wall('e', X1 - t, X1 - 0.01, z0, Z1, false);
      col(x0 + 3 - RAIL, x0 + 3 + RAIL, z0 + 3, z0 + 9);
      col(x0, x0 + 3 - RAIL, z0 + 2.95, z0 + 3.1, { yr: [yTop - 0.8, yTop + 2] });
      col(x0 + 3 + RAIL, X1, z0 + 2.95, z0 + 3.1, { yr: [yBot - 0.8, yBot + 1.5] });
      col(x0, x0 + 3 - RAIL, z0 + 4.5, Z1, { yr: [yBot - 0.8, yBot + 0.3] });
      // a caged lamp on the wall of every landing: dim, most of them failing
      const lamp = (x, z, fy, lv) => {
        const deep = deepK(lv);
        let st = this.pickLampState(deep); if (st === 'off' || st === 'on') st = this.rng.chance(0.6) ? 'flicker' : 'on';
        this.lamps.push({ i: this.ti(x), j: this.tj(z), x, y: fy + 2.7, fy, z, tilt: 0, color: st === 'emergency' ? 0xff5a30 : 0xffc890, state: st, axis: 'x', range: 7, power: 0.62 * (1 - 0.14 * deep), phase: this.rng.next() * 100, zone: 'in', lit: 1, idx: this.lamps.length, shaft: s.id });
      };
      for (let lv = s.top; lv <= s.bot; lv++) {
        const yl = this.shaftY(s, lv);
        lamp(x0 + 4.5, z0 + 0.32, yl, lv);
        if (lv < s.bot) lamp(x0 + 3, Z1 - 0.32, yl - 3, lv + 0.5);
      }
    }
    bloodTrail() {
      const r = this.rng;
      if (!r.chance(0.8) || this.rooms.length < 3) return;
      // a body dragged from one room to another on the same level
      const a = r.pick(this.rooms.slice(1)), b = r.pick(this.rooms.slice(1).filter((o) => o.lv === a.lv));
      if (a === b) return;
      const Y0 = this.roomY(a);
      const path = this.findPath(this.cx(a.cx), this.cz(a.cy), this.cx(b.cx), this.cz(b.cy), true);
      if (!path || path.length < 3) return;
      this.lv = a.lv;
      for (let n = 0; n < path.length - 1; n++) {
        const p = path[n], q = path[n + 1], ang = Math.atan2(q.x - p.x, q.z - p.z);
        this.put('smear', new THREE.PlaneGeometry(0.7, TS * 1.05), mat4((p.x + q.x) / 2 + r.range(-0.2, 0.2), Y0 + 0.016, (p.z + q.z) / 2, ang, -Math.PI / 2));
      }
      const e = path[path.length - 1];
      this.put('blood', new THREE.PlaneGeometry(1.8, 1.8), mat4(e.x, Y0 + 0.017, e.z, r.range(0, TAU), -Math.PI / 2));
      this.lv = 0;
    }

    // ---------- mesh building ----------
    // (built in pieces, so a landing can put it together a frame or so apart: see G.stageSite)
    build() { const g = this.buildGen(); let r; do r = g.next(); while (!r.done); return r.value; }
    *buildGen() {
      const grp = new THREE.Group(); grp.name = 'facility';
      // what's built is hung in parts: one for each level, then one for each stairwell (see showFor)
      const parts = (this.parts = []), L = this.levels;
      for (let n = 0; n < L + this.shafts.length; n++) { const g = new THREE.Group(); g.name = n < L ? 'level ' + levelLabel(n) : 'stairwell ' + this.shafts[n - L].name; parts.push(g); grp.add(g); }
      const partOf = (key) => { const at = key.lastIndexOf('#'); return at < 0 ? [key, 0] : [key.slice(0, at), +key.slice(at + 1)]; };
      let t0 = performance.now(); const busy = () => performance.now() - t0 > 6;
      const P = {};
      const bucket = (m) => P[m] || (P[m] = { pos: [], nor: [], uv: [] });
      const quad = (m, pts, n, uvs) => {
        const b = bucket(m);
        const [a, bb, c, d] = pts;
        const e1 = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        let order = [0, 1, 2, 0, 2, 3];
        if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) order = [0, 2, 1, 0, 3, 2];
        for (const o of order) { b.pos.push(...pts[o]); b.nor.push(...n); b.uv.push(...uvs[o]); }
      };
      const W = this.W, H = this.H;
      // a tile's level decides its finish (the deeper, the grimier), and which part it's merged into
      const aged = (m, lv) => (lv > 0 && AGED.has(m) ? m + '@' + lv : m) + '#' + lv;
      const matFloor = (k) => (this.room[k] >= 0 ? RT[this.rooms[this.room[k]].type].floor : 'floor');
      const matWall = (k) => (this.room[k] >= 0 ? RT[this.rooms[this.room[k]].type].wall : 'wall');
      const wallQuad = (m, k, dx, dy, y0, y1, a0 = -TS / 2, a1 = TS / 2) => {
        const i = k % W, j = Math.floor(k / W), cx = this.cx(i), cz = this.cz(j), yb = this.tileY(k);
        const ex = cx + dx * TS / 2, ez = cz + dy * TS / 2, tx = -dy, tz = dx;
        const p = (a, y) => [ex + tx * a, yb + y, ez + tz * a];
        const u = (a) => ((dx ? ez : ex) + (dx ? tz : tx) * a) / TS;
        quad(m, [p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1)], [-dx, 0, -dy], [[u(a0), y0 / 3], [u(a1), y0 / 3], [u(a1), y1 / 3], [u(a0), y1 / 3]]);
      };
      for (let k = 0; k < W * H; k++) {
        if ((k & 255) === 255 && busy()) { yield; t0 = performance.now(); }
        // (a stairwell builds itself, below)
        if (!this.grid[k] || this.grid[k] === 4) continue;
        const i = k % W, j = Math.floor(k / W), x0 = this.ox + i * TS, x1 = x0 + TS, z0 = this.oz + j * TS, z1 = z0 + TS, h = this.ceil[k];
        const lv = Math.max(0, this.lvl[k]), y = this.tileY(k);
        quad(aged(matFloor(k), lv), [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], [[x0 / TS, z0 / TS], [x1 / TS, z0 / TS], [x1 / TS, z1 / TS], [x0 / TS, z1 / TS]]);
        quad(aged('ceiling', lv), [[x0, y + h, z0], [x1, y + h, z0], [x1, y + h, z1], [x0, y + h, z1]], [0, -1, 0], [[x0 / TS, z0 / TS], [x1 / TS, z0 / TS], [x1 / TS, z1 / TS], [x0 / TS, z1 / TS]]);
        for (const [dx, dy] of DIRS) {
          const nk = this.idx(i + dx, j + dy);
          const wm = aged(matWall(k), lv);
          // rock, another level's corridor on the far side, or a stairwell's wall where it has no doorway
          if (!this.connected(k, nk)) { wallQuad(wm, k, dx, dy, 0, h); continue; }
          // a stairwell doorway: its frame is the stairwell's own wall
          if (this.grid[nk] === 4) continue;
          const nh = this.ceil[nk];
          const door = this.doorEdge.get(this.edgeKey(k, nk));
          if (door) {
            const hm = Math.min(h, nh);
            wallQuad(wm, k, dx, dy, 0, hm, -TS / 2, -DW / 2);
            wallQuad(wm, k, dx, dy, 0, hm, DW / 2, TS / 2);
            wallQuad(wm, k, dx, dy, DH, hm, -DW / 2, DW / 2);
          }
          if (nh < h) wallQuad(wm, k, dx, dy, nh, h);
        }
      }
      yield; t0 = performance.now();
      for (const key in P) {
        const b = P[key], geo = new THREE.BufferGeometry(), [m, part] = partOf(key);
        geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        const me = new THREE.Mesh(geo, this.mat(m)); me.receiveShadow = true; me.castShadow = !m.startsWith('ceiling') && !m.startsWith('floor'); parts[part].add(me);
        if (busy()) { yield; t0 = performance.now(); }
      }
      yield; t0 = performance.now();
      // doors: frames + panels
      const leafGeo = Pane.leaf(LEAF_W, DH - 0.03, LEAF_T);
      const leafHW = {};
      for (const kind of ['glass', 'bars']) { const parts = []; DoorKit.lever(parts, LEAF_W, LEAF_T); DoorKit.hinges(parts, DH - 0.03); Pane.trim(parts, kind, LEAF_W, LEAF_T); leafHW[kind] = mergeGeoList(parts); }
      const glassGeo = new THREE.PlaneGeometry(Pane.W, Pane.y1 - Pane.y0);
      for (const d of this.doors) {
        const tx = -d.nz, tz = d.nx;
        const base = Math.atan2(-tz, tx);
        this.lv = d.lv;
        for (const s of [-1, 1]) this.pbox('darkmetal', 0.22, DH + 0.1, 0.3, d.x + tx * s * (DW / 2 + 0.09), d.y, d.z + tz * s * (DW / 2 + 0.09), base);
        this.pbox('darkmetal', DW + 0.44, 0.18, 0.3, d.x, d.y + DH, d.z, base);
        this.lv = 0;
        // the leaf hangs on three hinges at the jamb; a lever set on each face at the latch edge
        const pivot = new THREE.Group();
        pivot.position.set(d.x + tx * LEAF_AXIS, d.y, d.z + tz * LEAF_AXIS);
        const panel = new THREE.Mesh(leafGeo, this.mat(d.lv > 0 ? 'door@' + d.lv : 'door'));
        panel.position.set(LEAF_W / 2, (DH - 0.03) / 2 + 0.005, 0); panel.castShadow = true; panel.receiveShadow = true;
        pivot.add(panel);
        const hw = new THREE.Mesh(leafHW[d.pane], MATS.get('hardware')); hw.castShadow = true; pivot.add(hw);
        if (d.pane === 'glass') { const g = new THREE.Mesh(glassGeo, Pane.glass()); g.position.set(LEAF_W / 2, (Pane.y0 + Pane.y1) / 2, 0); g.renderOrder = 3; pivot.add(g); }
        // light from a lamp on the far side falling through the window (one shaft each way, lit from the other side)
        d.beams = [1, -1].map((side) => { const m = Pane.beam(d.pane, side); m.position.set(LEAF_W / 2, 0, 0); pivot.add(m); return m; });
        d.lampBy = {};
        for (const side of [1, -1]) {
          // (the nearest working lamp on that side that can see the door)
          let best = null, bd = 9;
          const fx = d.x + d.nx * side * 0.6, fz = d.z + d.nz * side * 0.6;
          for (const l of this.lamps) {
            if (Math.abs(l.fy - d.y) > 1 || ((l.x - d.x) * d.nx + (l.z - d.z) * d.nz) * side <= 0.2) continue;
            const dd = Math.hypot(l.x - fx, l.z - fz); if (dd < bd && this.los(l.x, l.z, fx, fz)) { bd = dd; best = l; }
          }
          d.lampBy[side] = best ? { l: best, k: 1 - bd / 11 } : null;
          if (best) (best.panes || (best.panes = [])).push({ d, side });
        }
        // it can swing into the room (+1) or into the corridor (-1); it always swings away from whoever opens it
        d.base = base;
        d.swingP = angDiff(base, Math.atan2(-d.nz, d.nx)) * 0.97;
        d.swingN = angDiff(base, Math.atan2(d.nz, -d.nx)) * 0.97;
        d.mesh = pivot; this.applyDoor(d); parts[d.lv].add(pivot);
        { const a = d.base, lz = { x: Math.sin(a), z: Math.cos(a) }; d.leafSign = Math.sign(lz.x * d.nx + lz.z * d.nz) || 1; }
        if (busy()) { yield; t0 = performance.now(); }
      }
      yield; t0 = performance.now();
      // locker and cabinet doors: hinged on the left front edge, a small pull at the right
      const chw = {};
      for (const c of this.containers) {
        const L = this.frame(c.x, c.z, c.ry), [hx, hz] = L(-c.w / 2 + 0.01, c.d / 2);
        const pivot = new THREE.Group(); pivot.position.set(hx, c.y, hz); pivot.rotation.y = c.ry;
        const dw = c.w - 0.02, dh = c.h - 0.05, dm = c.kind === 'locker' ? 'locker' : 'painted';
        const door = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.02), this.mat(c.lv > 0 ? dm + '@' + c.lv : dm));
        door.position.set(dw / 2, 0.025 + dh / 2, 0.01); door.castShadow = true; door.receiveShadow = true; pivot.add(door);
        if (!chw[c.kind]) { const parts = []; const y = c.kind === 'locker' ? 0.95 : 0.55; DoorKit.pull(parts, dw - 0.07, 0.02, 1, y, y + 0.2, 0.009); chw[c.kind] = mergeGeoList(DoorKit.place(parts, mat(0, 0, 0.01))); }
        const hw = new THREE.Mesh(chw[c.kind], MATS.get('hardware')); pivot.add(hw);
        c.mesh = pivot; pivot.rotation.y = c.closedRy + c.swing * c.anim; parts[c.lv].add(pivot);
      }
      // exits: big doors + signs
      for (const ex of this.exits) {
        const ry = Math.atan2(ex.nx, ex.nz);
        const big = ex.kind === 'main';
        const w = big ? 2.6 : 1.4, h = big ? 2.9 : 2.3;
        const L = this.frame(ex.x, ex.z, ry);
        // leaves sit flush on the wall; the frame overlaps their edges so no seam can show light
        if (big) for (const s of [-1, 1]) { const [px, pz] = L(s * w / 4, 0); this.doorLeaf(w / 2, h, 0.1, px, pz, ry, s > 0); }
        else this.doorLeaf(w, h, 0.1, ex.x, ex.z, ry, false);
        // exit hardware on the inside face: a push bar across each leaf, butted up to the meeting edge
        const hw = [];
        if (big) for (const s of [-1, 1]) DoorKit.panic(hw, s * 0.1, s * (w / 2 - 0.12), 0.1, 1);
        else DoorKit.panic(hw, -w / 2 + 0.14, w / 2 - 0.14, 0.1, 1);
        for (const p of DoorKit.place(hw, mat(ex.x, Y0, ex.z, 0, ry, 0))) this.put('hardware', p.geo, p.matrix);
        const [fx, fz] = L(0, 0.08);
        this.pbox('darkmetal', w + 0.36, 0.24, 0.26, fx, Y0 + h - 0.04, fz, ry);
        for (const s of [-1, 1]) { const [px, pz] = L(s * (w / 2 + 0.06), 0.08); this.pbox('darkmetal', 0.24, h, 0.26, px, Y0, pz, ry); }
        if (big) { const [cx, cz] = L(0, 0.06); this.pbox('darkmetal', 0.06, h, 0.04, cx, Y0, cz, ry); }
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(big ? 1.4 : 1.2, 0.35), new THREE.MeshBasicMaterial({ map: TEX.sign(big ? 'EXIT' : 'FIRE EXIT', { bg: '#2a0505', fg: '#ff5040', size: 34, bold: true, dirty: false, w: 256, h: 64 }) }));
        sign.position.set(ex.x + ex.nx * 0.12, Y0 + h + 0.45, ex.z + ex.nz * 0.12); sign.rotation.y = ry; parts[0].add(sign);
        this.lamps.push({ i: this.ti(ex.x), j: this.tj(ex.z), x: ex.x + ex.nx * 0.6, y: Y0 + h + 0.3, z: ex.z + ex.nz * 0.6, color: 0xff3a24, state: 'emergency', power: 0.5, phase: 0, zone: 'in', axis: 'none', lit: 1, idx: this.lamps.length, noMesh: true });
      }
      // vents
      for (const v of this.vents) {
        const ry = Math.atan2(v.nx, v.nz);
        this.lv = this.rooms[v.room].lv;
        this.pbox('vent', 0.9, 0.55, 0.06, v.x, v.y - 0.275, v.z, ry);
      }
      this.lv = 0;
      yield; t0 = performance.now();
      for (const s of this.shafts) { this.buildShaft(s, parts[L + s.id]); if (busy()) { yield; t0 = performance.now(); } }
      this.buildBlasts();
      yield; t0 = performance.now();
      // prop buckets
      for (const key in this.buckets) {
        const geo = mergeGeoList(this.buckets[key]), [m, part] = partOf(key);
        if (!geo) continue;
        const mat = this.mat(m);
        const me = new THREE.Mesh(geo, mat);
        me.castShadow = !mat.transparent && m !== 'paper'; me.receiveShadow = true;
        if (mat.transparent) me.renderOrder = 2;
        parts[part].add(me);
        if (busy()) { yield; t0 = performance.now(); }
      }
      this.buckets = {};
      // lamps (instanced: a set for each part, hung with it)
      const lamps = this.lamps.filter((l) => !l.noMesh), byPart = parts.map(() => []);
      for (const l of lamps) byPart[l.shaft != null ? L + l.shaft : clamp(Math.round((Y0 - l.fy) / DROP), 0, L - 1)].push(l);
      const housGeo = new THREE.BoxGeometry(0.34, 0.1, 1.4), tubeGeo = new THREE.BoxGeometry(0.2, 0.04, 1.25);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      // a faint shaft of light under each lamp, as if the air were full of dust; it dims and flickers with the lamp
      const shaftGeo = new THREE.CylinderGeometry(0.38, 1.3, 1, 18, 1, true); shaftGeo.translate(0, -0.5, 0);
      const shaftMat = new THREE.ShaderMaterial({
        uniforms: { uFog: { value: 0.07 } },
        vertexShader: `varying float vT; varying vec3 vC; varying float vE; varying float vD;
          void main(){
            vT = -position.y; vC = vec3(1.0);
            #ifdef USE_INSTANCING_COLOR
              vC = instanceColor;
            #endif
            mat4 im = mat4(1.0);
            #ifdef USE_INSTANCING
              im = instanceMatrix;
            #endif
            vec4 mv = viewMatrix * modelMatrix * im * vec4(position, 1.0);
            vec3 n = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(im) * normal);
            vE = abs(dot(n, normalize(-mv.xyz))); vD = -mv.z;
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uFog; varying float vT; varying vec3 vC; varying float vE; varying float vD;
          void main(){ float a = pow(vE, 1.8) * pow(1.0 - vT, 1.3) * smoothstep(0.0, 0.1, vT) * 0.055 * exp(-pow(uFog * vD, 2.0));
            gl_FragColor = vec4(vC * a, 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
      byPart.forEach((ls, pi) => {
        if (!ls.length) return;
        const hous = new THREE.InstancedMesh(housGeo, MATS.get('lampHousing'), ls.length), tubes = new THREE.InstancedMesh(tubeGeo, tubeMat, ls.length);
        const shafts = new THREE.InstancedMesh(shaftGeo, shaftMat, ls.length), set = { tubes, shafts };
        ls.forEach((l, n) => {
          const ry = l.axis === 'x' ? Math.PI / 2 : 0;
          m4.copy(mat4(l.x, l.y + 0.06, l.z, ry, l.tilt || 0)); hous.setMatrixAt(n, m4);
          m4.copy(mat4(l.x, l.y - 0.01, l.z, ry, l.tilt || 0)); tubes.setMatrixAt(n, m4);
          tubes.setColorAt(n, col.set(l.state === 'off' ? 0x111111 : l.color));
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
          m4.compose(pv.set(l.x, l.y - 0.04, l.z), q, sc.set(1, Math.max(1, l.y - l.fy - 0.02), 1.7)); shafts.setMatrixAt(n, m4);
          shafts.setColorAt(n, col.set(l.state === 'off' ? 0x000000 : l.color));
          l.inst = n; l.lampSet = set;
        });
        tubes.instanceColor.needsUpdate = true; shafts.instanceColor.needsUpdate = true;
        hous.castShadow = false; tubes.castShadow = false; shafts.castShadow = false; shafts.renderOrder = 3; shafts.frustumCulled = false;
        parts[pi].add(hous, tubes, shafts);
      });
      this.lampMeshes = { lamps };
      this.group = grp;
      return grp;
    }
    // a box whose texture is laid on at s metres a repeat on every face (for long beams, walls, gratings)
    wbox(w, h, d, s = 1) {
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let q = 0; q < 4; q++) { const i = f * 4 + q; uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s); }
      return g;
    }
    // a stairwell: a tall concrete shaft through every level it serves, rusted steel flights switching back one storey
    // over the next with open grating treads, pipe rails, beams under the landings, dim caged lamps, the levels
    // stencilled at their doorways, and the whole thing gone over to damp: water down the walls, moss on the landings,
    // vines hanging the height of the well
    buildShaft(s, grp) {
      const r = this.rng, x0 = s.x0, z0 = s.z0, X1 = x0 + SW * TS, Z1 = z0 + SL * TS;
      const yTop = this.shaftY(s, s.top), yBot = this.shaftY(s, s.bot), top = yTop + 3.6, bottom = yBot - 0.4;
      // (worn the way the floor at its foot is, and merged on its own: see showFor)
      this.lv = Math.max(1, s.bot); this.part = this.levels + s.id;
      const box = (m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, sc = 1) => this.put(m, this.wbox(w, h, d, sc), mat4(x, y, z, ry, rx, rz));
      const cyl = (m, rad, len, x, y, z, rx = 0, ry = 0, rz = 0, seg = 8) => this.put(m, new THREE.CylinderGeometry(rad, rad, len, seg), mat4(x, y, z, ry, rx, rz));
      // ---- the shaft walls, each with its doorway ----
      const wall = (side) => {
        const e = s.exits.find((q) => q.side === side), horiz = side === 'n' || side === 's', t = 0.2;
        const fixed = side === 'n' ? z0 + 0.11 : side === 's' ? Z1 - 0.11 : side === 'w' ? x0 + 0.11 : X1 - 0.11;
        const from = horiz ? x0 : z0, to = horiz ? X1 : Z1;
        const piece = (a, b, ya, yb) => { if (b - a < 0.01 || yb - ya < 0.01) return; const c = (a + b) / 2, len = b - a; horiz ? box('bunker', len, yb - ya, t, c, (ya + yb) / 2, fixed, 0, 0, 0, 2) : box('bunker', t, yb - ya, len, fixed, (ya + yb) / 2, c, 0, 0, 0, 2); };
        if (!e) { piece(from, to, bottom, top); return; }
        const c = side === 'n' ? x0 + 1.5 : z0 + 1.5, yl = this.shaftY(s, e.lv);
        piece(from, c - DW / 2, bottom, top); piece(c + DW / 2, to, bottom, top);
        piece(c - DW / 2, c + DW / 2, bottom, yl); piece(c - DW / 2, c + DW / 2, yl + DH, top);
        // a steel frame round the doorway, both faces
        for (const f of [-1, 1]) {
          const o = fixed + f * 0.13;
          const jamb = (a) => (horiz ? box('rust', 0.12, DH + 0.1, 0.06, a, yl + DH / 2, o) : box('rust', 0.06, DH + 0.1, 0.12, o, yl + DH / 2, a));
          jamb(c - DW / 2 - 0.06); jamb(c + DW / 2 + 0.06);
          horiz ? box('rust', DW + 0.24, 0.12, 0.06, c, yl + DH + 0.05, o) : box('rust', 0.06, 0.12, DW + 0.24, o, yl + DH + 0.05, c);
        }
      };
      for (const side of ['n', 's', 'w', 'e']) wall(side);
      // the pit floor (standing water in it) and the slab over the top
      box('bunker', SW * TS, 0.3, SL * TS, (x0 + X1) / 2, yBot - 0.15, (z0 + Z1) / 2, 0, 0, 0, 2);
      box('bunker', SW * TS, 0.3, SL * TS, (x0 + X1) / 2, top + 0.15, (z0 + Z1) / 2, 0, 0, 0, 2);
      for (let q = 0; q < 3; q++) this.put('puddle', new THREE.CircleGeometry(r.range(0.6, 1.4), 16), mat4(x0 + r.range(0.8, 5.2), yBot + 0.012, z0 + r.range(3.5, 11), 0, -Math.PI / 2));
      // ---- landings: a steel grating on rusted I-beams ----
      const landing = (y, za, zb) => {
        box('grate', SW * TS - 0.42, 0.05, zb - za, (x0 + X1) / 2, y - 0.025, (za + zb) / 2, 0, 0, 0, 0.6);
        for (const z of [za + 0.08, zb - 0.08]) box('rust', SW * TS - 0.42, 0.2, 0.1, (x0 + X1) / 2, y - 0.15, z);
        for (let x = x0 + 0.6; x < X1 - 0.3; x += 1.25) box('darkmetal', 0.08, 0.14, zb - za - 0.2, x, y - 0.12, (za + zb) / 2);
      };
      // ---- flights: open grating treads between rusted stringers, a pipe rail down each side ----
      const ang = Math.atan2(3, 6), slen = Math.hypot(6, 3);
      const flight = (u0, u1, yHi, down) => {
        // down = +1: descends toward +z (the east flight); -1: descends toward -z (the west flight)
        const w = u1 - u0, xc = x0 + (u0 + u1) / 2;
        for (let n = 1; n <= 15; n++) {
          const yt = yHi - (n - 0.5) * 0.2, v = down > 0 ? 3 + (n - 0.5) * 0.4 : 9 - (n - 0.5) * 0.4;
          box('grate', w - 0.14, 0.035, 0.36, xc, yt - 0.018, z0 + v, 0, 0, 0, 0.6);
          box('hazard', w - 0.16, 0.02, 0.04, xc, yt - 0.01, z0 + v + down * 0.17);
        }
        const yMid = yHi - 1.5, rx = down > 0 ? ang : -ang;
        for (const u of [u0 + 0.05, u1 - 0.05]) box('rust', 0.06, 0.26, slen, x0 + u, yMid - 0.16, z0 + 6, rx);
        // rails: along the well side, and on brackets off the wall
        const inner = u0 < 3 ? u1 - 0.04 : u0 + 0.04, outer = u0 < 3 ? u0 + 0.08 : u1 - 0.08, prx = Math.PI / 2 + (down > 0 ? ang : -ang);
        cyl('rust', 0.024, slen, x0 + inner, yMid + 0.95, z0 + 6, prx);
        cyl('rust', 0.018, slen, x0 + inner, yMid + 0.5, z0 + 6, prx);
        cyl('darkmetal', 0.022, slen, x0 + outer, yMid + 0.9, z0 + 6, prx);
        for (let k = 0; k <= 4; k++) {
          const v = 3 + k * 1.5, yr = down > 0 ? yHi - (v - 3) / 2 : yHi - (9 - v) / 2;
          cyl('rust', 0.02, 0.95, x0 + inner, yr + 0.475, z0 + v);
        }
      };
      const railAcross = (ua, ub, v, y) => {
        cyl('rust', 0.024, ub - ua, x0 + (ua + ub) / 2, y + 1.0, z0 + v, 0, 0, Math.PI / 2);
        cyl('rust', 0.018, ub - ua, x0 + (ua + ub) / 2, y + 0.5, z0 + v, 0, 0, Math.PI / 2);
        for (let u = ua + 0.1; u < ub; u += 1.3) cyl('rust', 0.02, 1.0, x0 + u, y + 0.5, z0 + v);
      };
      for (let lv = s.top; lv <= s.bot; lv++) {
        const yl = this.shaftY(s, lv);
        if (lv < s.bot) {
          landing(yl, z0 + 0.22, z0 + 3);
          landing(yl - 3, Z1 - 3, Z1 - 0.22);
          flight(3 + RAIL, SW * TS - 0.22, yl, 1);
          flight(0.22, 3 - RAIL, yl - 3, -1);
        }
        // the levels painted big inside each landing, and a plate by the doorway outside
        const e = s.exits.find((q) => q.lv === lv);
        this.shaftSign(grp, levelLabel(lv), 1.2, 0.75, x0 + 4.4, yl + 1.45, z0 + 0.215, 0, { w: 256, h: 160, size: 118, bold: true, border: false, bg: 'rgba(0,0,0,0)', fg: lv > 1 ? 'rgba(160,44,28,.75)' : 'rgba(205,195,165,.6)', clear: true });
        if (e) {
          const list = [];
          for (let q = s.top; q <= s.bot; q++) if (s.exits.some((x) => x.lv === q)) list.push(levelLabel(q));
          const text = 'STAIRWELL ' + s.name + '\n' + list.join('  ·  ');
          const plate = { w: 256, h: 128, size: 28, bold: true, bg: '#c2aa62', fg: '#1a1712' };
          if (e.side === 'n') this.shaftSign(grp, text, 0.66, 0.33, x0 + 1.5 + 1.25, yl + 1.7, z0 - 0.0, Math.PI, plate);
          else if (e.side === 'w') this.shaftSign(grp, text, 0.66, 0.33, x0 - 0.0, yl + 1.7, z0 + 1.5 + 1.2, -Math.PI / 2, plate);
          else this.shaftSign(grp, text, 0.66, 0.33, X1 + 0.0, yl + 1.7, z0 + 1.5 + 1.2, Math.PI / 2, plate);
        }
      }
      railAcross(0.22, 3 - RAIL, 3.05, yTop);
      railAcross(3 + RAIL, SW * TS - 0.22, 3.05, yBot);
      // ---- services: two rusted risers in the corners, a cable run, the lamps' brackets ----
      for (const [x, z] of [[x0 + 0.42, Z1 - 0.42], [X1 - 0.42, Z1 - 0.42]]) {
        cyl('rust', 0.09, top - bottom, x, (top + bottom) / 2, z, 0, 0, 0, 10);
        for (let y = bottom + 1; y < top; y += 2.5) box('darkmetal', 0.3, 0.06, 0.06, x, y, z + 0.15);
      }
      cyl('cable', 0.035, top - bottom, X1 - 0.3, (top + bottom) / 2, z0 + 6.2, 0, 0, 0, 6);
      for (const l of this.lamps) if (l.shaft === s.id) { box('darkmetal', 0.5, 0.06, 0.2, l.x, l.y + 0.12, l.z + (l.z < z0 + 6 ? -0.1 : 0.1)); }
      // ---- damp and growth ----
      const wallAt = () => { const side = r.int(0, 3); return side === 0 ? [x0 + r.range(0.4, 5.6), z0 + 0.235, 0] : side === 1 ? [x0 + r.range(0.4, 5.6), Z1 - 0.235, Math.PI] : side === 2 ? [x0 + 0.235, z0 + r.range(0.5, 11.5), Math.PI / 2] : [X1 - 0.235, z0 + r.range(0.5, 11.5), -Math.PI / 2]; };
      for (let q = 0; q < 9 + 5 * (s.bot - s.top); q++) {
        const [x, z, ry] = wallAt(), h = r.range(3, 8), y = r.range(bottom + h / 2, top - h / 2);
        this.put('stain', new THREE.PlaneGeometry(r.range(1, 2.4), h), mat4(x, y, z, ry));
      }
      // vines down the well and the walls, from the top and from under every landing
      const vine = (x, z, y, len) => {
        for (const a of [0, Math.PI / 2]) {
          const g = new THREE.PlaneGeometry(0.34, len), uv = g.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 1.1);
          this.put('vine', g, mat4(x, y - len / 2, z, a + r.range(-0.3, 0.3)));
        }
      };
      for (let q = 0; q < 10; q++) vine(x0 + 3 + r.range(-0.18, 0.18), z0 + r.range(3.2, 8.8), top, r.range(3, Math.min(top - bottom - 1, 11)));
      for (let q = 0; q < 12; q++) { const [x, z] = wallAt(); vine(x, z, top - r.range(0, 2), r.range(2, 7)); }
      for (let lv = s.top; lv < s.bot; lv++) {
        const yl = this.shaftY(s, lv);
        for (let q = 0; q < 4; q++) vine(x0 + r.range(0.5, 5.5), r.chance(0.5) ? z0 + 2.9 : Z1 - 2.9, yl - 0.25, r.range(0.6, 2.2));
      }
      // moss on the landings and the pit floor
      for (let lv = s.top; lv <= s.bot; lv++) {
        const yl = this.shaftY(s, lv);
        for (let q = 0; q < 3; q++) this.put('moss', new THREE.CircleGeometry(r.range(0.35, 0.9), 12), mat4(x0 + r.range(0.6, 5.4), yl + 0.012, z0 + r.range(0.5, 2.6), r.range(0, TAU), -Math.PI / 2));
        if (lv < s.bot) for (let q = 0; q < 2; q++) this.put('moss', new THREE.CircleGeometry(r.range(0.3, 0.7), 12), mat4(x0 + r.range(0.6, 5.4), yl - 3 + 0.012, Z1 - r.range(0.5, 2.6), r.range(0, TAU), -Math.PI / 2));
      }
      for (let q = 0; q < 4; q++) this.put('moss', new THREE.CircleGeometry(r.range(0.5, 1.2), 12), mat4(x0 + r.range(0.8, 5.2), yBot + 0.014, z0 + r.range(3.5, 11), r.range(0, TAU), -Math.PI / 2));
      // what fell down the well
      for (let q = 0; q < 10; q++) { const sz = r.range(0.08, 0.22), g = new THREE.DodecahedronGeometry(sz, 0); g.scale(1, 0.6, 1.1); this.put('bunker', g, mat4(x0 + r.range(0.6, 5.4), yBot + sz * 0.3, z0 + r.range(4, 11.4), r.range(0, TAU), r.range(0, TAU))); }
      this.pbox('crate', 0.7, 0.5, 0.6, x0 + 1.2, yBot, Z1 - 1.2, 0.5);
      this.lv = 0; this.part = null;
    }
    shaftSign(grp, text, w, h, x, y, z, ry, opts) {
      // (the levels stencilled on the landings are the same in every stairwell: painted once, and kept)
      const key = opts.clear && text + JSON.stringify(opts);
      const mat = (key && stencils[key]) || new THREE.MeshStandardMaterial({ map: TEX.sign(text, opts), roughness: 0.85, transparent: !!opts.clear, depthWrite: !opts.clear, polygonOffset: true, polygonOffsetFactor: -2 });
      if (key) stencils[key] = mat;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z); m.rotation.y = ry; grp.add(m); return m;
    }
    // the blast doors: a heavy rusted frame across the corridor, a slab that drops out of a slot in the ceiling
    // with its code stencilled on both faces, and a lamp over it (red while it's down)
    buildBlasts() {
      const parts = this.parts;
      for (const d of this.blasts) {
        this.lv = d.lv;
        const tx = -d.nz, tz = d.nx, ry = Math.atan2(d.nx, d.nz), half = TS / 2;
        for (const s of [-1, 1]) this.pbox('rust', 0.42, CH, 0.4, d.x + tx * s * (half - 0.21), d.y, d.z + tz * s * (half - 0.21), ry);
        this.pbox('rust', TS, 0.32, 0.5, d.x, d.y + CH - 0.32, d.z, ry);
        this.pbox('hazard', TS - 0.84, 0.12, 0.52, d.x, d.y + CH - 0.46, d.z, ry);
        this.lv = 0;
        const g = new THREE.Group(); g.position.set(d.x, d.y, d.z); g.rotation.y = ry; parts[d.lv].add(g);
        const slab = new THREE.Mesh(this.wbox(TS - 0.8, CH - 0.1, 0.26, 1.5), this.mat(d.lv > 0 ? 'painted@' + d.lv : 'painted'));
        slab.position.y = (CH - 0.1) / 2; slab.castShadow = true; slab.receiveShadow = true; g.add(slab);
        const band = new THREE.Mesh(new THREE.BoxGeometry(TS - 0.82, 0.16, 0.28), MATS.get('hazard')); band.position.y = 0.12; g.add(band);
        const tex = TEX.sign(d.code, { w: 256, h: 192, size: 130, bold: true, border: false, bg: 'rgba(0,0,0,0)', fg: 'rgba(225,190,70,.92)' });
        for (const f of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.86), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
          p.position.set(0, 1.45, f * 0.136); p.rotation.y = f > 0 ? 0 : Math.PI; g.add(p);
        }
        const lampMat = new THREE.MeshStandardMaterial({ color: 0x220806, emissive: 0xff2a14, emissiveIntensity: 0.9 });
        for (const f of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.1), lampMat); l.position.set(d.x + d.nx * f * 0.3, d.y + CH - 0.2, d.z + d.nz * f * 0.3); l.rotation.y = ry; parts[d.lv].add(l); }
        d.mesh = g; d.slab = slab; d.lampMat = lampMat;
        this.applyBlast(d);
      }
    }
    // the slab rides up into its slot as it opens; the lamp shows green once the way is clear
    applyBlast(d) {
      if (!d.mesh) return;
      const k = d.anim * d.anim * (3 - 2 * d.anim);
      d.mesh.position.y = d.y + k * (CH - 0.32);
      d.lampMat.emissive.setHex(d.anim > 0.98 ? 0x30ff60 : 0xff2a14);
    }
    // what's drawn from an eye at p (called for every view, the body-cams' and the rover's too): the floor it's on, the
    // stairwells near enough to be seen into, and, from on a stairwell's flights, the floor at its other end. The floors
    // are far apart and shut in, and nothing of one can be seen from another except from down in a stairwell (each
    // landing hides the doorway under it), so the rest is never missed, and never drawn. Up on the surface, none of it.
    showFor(p) {
      const P = this.parts; if (!P) return;
      const L = this.levels;
      if (p.y > Y0 + 50) { for (const g of P) g.visible = false; return; }
      const lv = clamp(Math.round((Y0 - (p.y - 1)) / DROP), 0, L - 1);
      for (let n = 0; n < L; n++) P[n].visible = n === lv;
      for (const s of this.shafts) {
        if (s.top !== lv && s.bot !== lv) { P[L + s.id].visible = false; continue; }
        const d = Math.hypot(p.x - clamp(p.x, s.x0, s.x0 + SW * TS), p.z - clamp(p.z, s.z0, s.z0 + SL * TS));
        P[L + s.id].visible = d < SHOW_R;
        if (d < 2) P[s.top === lv ? s.bot : s.top].visible = true;
      }
    }
    setLampVisual(l, f) {
      if (l.inst == null || !l.lampSet) return;
      const c = new THREE.Color(l.color).multiplyScalar(f), m = l.lampSet;
      m.tubes.setColorAt(l.inst, c); m.tubes.instanceColor.needsUpdate = true;
      m.shafts.setColorAt(l.inst, c); m.shafts.instanceColor.needsUpdate = true;
    }
    breakDoor(d) {
      if (d.broken) return;
      d.broken = true; d.open = true; d.anim = 1;
      d.mesh.visible = false;
      // the panel is torn off its hinges and lands flat inside the room
      const slab = new THREE.Mesh(new THREE.BoxGeometry(DW - 0.04, 0.07, DH - 0.02), this.mat(d.lv > 0 ? 'door@' + d.lv : 'door'));
      slab.position.set(d.x + d.nx * 1.5, d.y + 0.05, d.z + d.nz * 1.5);
      slab.rotation.set(0.04, d.base + 0.3, 0.02);
      slab.castShadow = true; slab.receiveShadow = true;
      (this.parts ? this.parts[d.lv] : this.group).add(slab);
    }
    // where to aim to open a locker/cabinet: the middle of its door
    containerFront(c) { const [x, z] = this.frame(c.x, c.z, c.ry)(0.05, c.d / 2 + 0.03); return { x, y: c.y + Math.min(1.15, c.h * 0.55), z }; }
    // how much of a lamp's light gets to where the camera is: all of it in plain view, some of it through a door's
    // window (seeing the lamp through the glass, or seeing a window it shines on), none through a wall
    lampReach(cam, l) {
      if (this.los(cam.x, cam.z, l.x, l.z)) return 1;
      if (this.los(cam.x, cam.z, l.x, l.z, true)) return 0.4;
      if (l.panes) for (const { d, side } of l.panes) {
        if (d.broken || d.anim > 0.5) continue;
        const sx = d.x - d.nx * side * 0.4, sz = d.z - d.nz * side * 0.4;
        if (Math.hypot(sx - cam.x, sz - cam.z) < 14 && ((cam.x - d.x) * d.nx + (cam.z - d.z) * d.nz) * side < 0 && this.los(cam.x, cam.z, sx, sz)) return 0.28;
      }
      return 0;
    }
    // the light coming through each door's window: from a working lamp on one side into the gloom on the other
    updatePanes() {
      const cam = R.camera.position, power = !G.round || G.round.power;
      const lit = (e) => {
        if (!e) return 0;
        const l = e.l; if (l.state === 'off' || (!power && l.state !== 'emergency')) return 0;
        return e.k * clamp(l.lit ?? 1, 0, 1.2) * (l.state === 'emergency' ? 0.5 : 1);
      };
      for (const d of this.doors) {
        if (!d.beams) continue;
        const near = Math.abs(d.x - cam.x) < 26 && Math.abs(d.z - cam.z) < 26 && Math.abs(d.y - cam.y) < 5;
        for (let i = 0; i < 2; i++) {
          const side = i ? -1 : 1, u = d.beams[i].material.uniforms;
          // (which way this shaft points in the world once the leaf is hung: it shows on the side away from its lamp)
          const out = side * (d.leafSign || 1);
          const v = near && !d.broken ? lit(d.lampBy[-out]) * (1 - 0.6 * Math.min(1, lit(d.lampBy[out]) * 1.5)) * (1 - d.anim) : 0;
          u.uI.value = v; d.beams[i].visible = v > 0.01;
          if (v > 0.01) u.uCol.value.setHex(d.lampBy[-out].l.color);
        }
      }
    }
    applyDoor(d) { if (d.mesh) d.mesh.rotation.y = d.base + (d.dir < 0 ? d.swingN : d.swingP) * d.anim; }
    // open/close a door; a door only changes which way it swings while it is (nearly) shut
    setDoor(d, open, dir) {
      if (dir && d.anim < 0.12) d.dir = dir;
      d.open = open;
    }
    update(dt) {
      this.paneT = (this.paneT || 0) - dt;
      if (this.paneT <= 0) { this.paneT = 0.12; this.updatePanes(); }
      for (const d of this.doors) {
        if (d.broken) continue;
        const tgt = d.open ? 1 : 0;
        if (Math.abs(d.anim - tgt) > 0.001) {
          d.anim = damp(d.anim, tgt, 7, dt);
          if (Math.abs(d.anim - tgt) < 0.002) d.anim = tgt;
          this.applyDoor(d);
        }
      }
      for (const c of this.containers) {
        const tgt = c.open ? 1 : 0;
        if (Math.abs(c.anim - tgt) > 0.001) { c.anim = damp(c.anim, tgt, 9, dt); if (Math.abs(c.anim - tgt) < 0.002) c.anim = tgt; if (c.mesh) c.mesh.rotation.y = c.closedRy + c.swing * c.anim; }
      }
      // blast doors grind up slowly and drop fast
      for (const d of this.blasts) {
        const tgt = d.open ? 1 : 0;
        if (d.anim !== tgt) { d.anim = tgt > d.anim ? Math.min(1, d.anim + dt / 2.4) : Math.max(0, d.anim - dt / 1.3); this.applyBlast(d); }
      }
    }

    // ---------- queries ----------
    // push a circle (p: x, z, and y for its feet) out of everything solid: rock, the far side of a wall onto another
    // level, props, closed doors and blast doors, a stairwell's walls and rails (they know which storey p is on)
    collide(p, rad) {
      let hit = false;
      const k0 = this.idx(this.ti(p.x), this.tj(p.z)), inShaft = k0 >= 0 && this.grid[k0] === 4, lv0 = k0 >= 0 ? this.lvl[k0] : -1;
      for (let it = 0; it < 2; it++) {
        const i0 = this.ti(p.x - rad), i1 = this.ti(p.x + rad), j0 = this.tj(p.z - rad), j1 = this.tj(p.z + rad);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = this.idx(i, j);
          const solid = !this.floorAt(i, j) || (!inShaft && lv0 >= 0 && this.grid[k] !== 4 && this.lvl[k] !== lv0);
          if (solid) { const x0 = this.ox + i * TS, z0 = this.oz + j * TS; if (circleBox(p, rad, x0, x0 + TS, z0, z0 + TS)) hit = true; continue; }
          const list = this.colHash.get(k);
          if (list) for (const c of list) {
            if (c.door && c.door.open) continue;
            if (c.leaf) { const dd = c.leaf.door; if (!dd.open || dd.broken || dd.dir !== c.leaf.dir || dd.anim < 0.6) continue; }
            if (c.blast && c.blast.open && c.blast.anim > 0.7) continue;
            if (c.yr && p.y !== undefined && (p.y < c.yr[0] || p.y > c.yr[1])) continue;
            if (c.ygap && p.y !== undefined && p.y >= c.ygap[0] && p.y <= c.ygap[1]) continue;
            if (c.h < 0.6 && p.y !== undefined && p.y > c.y0 + c.h - 0.05) continue;
            if (circleBox(p, rad, c.x0, c.x1, c.z0, c.z1)) hit = true;
          }
        }
      }
      return hit;
    }
    closedDoorBetween(i0, j0, i1, j1) {
      const a = this.idx(i0, j0), b = this.idx(i1, j1);
      if (a < 0 || b < 0) return false;
      const d = this.doorEdge.get(this.edgeKey(a, b));
      return d && !d.open ? d : null;
    }
    doorBetween(i0, j0, i1, j1) { const a = this.idx(i0, j0), b = this.idx(i1, j1); return a < 0 || b < 0 ? null : this.doorEdge.get(this.edgeKey(a, b)) || null; }
    // a clear straight line from a to b (seen from above): not through rock, a wall onto another level, or a shut door.
    // sight: only seeing (or light) has to get through, and a shut door's window lets it
    los(ax, az, bx, bz, sight = false) {
      const x = (ax - this.ox) / TS, z = (az - this.oz) / TS, ex = (bx - this.ox) / TS, ez = (bz - this.oz) / TS;
      let i = Math.floor(x), j = Math.floor(z);
      const ti = Math.floor(ex), tj = Math.floor(ez);
      if (!this.floorAt(i, j)) return false;
      const dx = ex - x, dz = ez - z;
      const si = Math.sign(dx), sj = Math.sign(dz);
      const tdi = si ? Math.abs(1 / dx) : Infinity, tdj = sj ? Math.abs(1 / dz) : Infinity;
      let tmi = si > 0 ? (i + 1 - x) / dx : si < 0 ? (x - i) / -dx : Infinity;
      let tmj = sj > 0 ? (j + 1 - z) / dz : sj < 0 ? (z - j) / -dz : Infinity;
      let guard = 0;
      while ((i !== ti || j !== tj) && guard++ < 300) {
        const pi = i, pj = j;
        if (tmi < tmj) { if (tmi > 1) break; i += si; tmi += tdi; } else { if (tmj > 1) break; j += sj; tmj += tdj; }
        const pk = this.idx(pi, pj), k = this.idx(i, j);
        if (!this.connected(pk, k)) return false;
        const shut = this.closedDoorBetween(pi, pj, i, j);
        if ((shut && !(sight && shut.pane)) || this.closedBlast(pk, k)) return false;
      }
      return true;
    }
    nearestWalkable(i, j) {
      if (this.walkable(i, j)) return [i, j];
      for (let r = 1; r < 6; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (this.walkable(i + a, j + b)) return [i + a, j + b];
      return null;
    }
    // the level a point's tile is on (in a stairwell: the storey nearest its height)
    levelAt(x, z, y) {
      const s = this.shaftAt(x, z);
      if (s) return clamp(Math.round(this.depthOfY(y === undefined ? this.shaftY(s, s.top) : y)), s.top, s.bot);
      const t = this.nearestWalkable(this.ti(x), this.tj(z));
      return t ? Math.max(0, this.lvl[this.idx(t[0], t[1])]) : 0;
    }
    // a route from a to b as waypoints ({x, z}). Within a level it follows the corridors; between levels it goes through
    // a stairwell, in at one doorway, down or up the flights (every turn a waypoint that must be reached), out at another.
    // ay / by: the heights of the two ends, which only matter inside a stairwell (its storeys share the same ground).
    findPath(ax, az, bx, bz, ignoreBlock = false, ay, by) {
      const W = this.W, sa = this.shaftAt(ax, az), sb = this.shaftAt(bx, bz);
      const goalLv = this.levelAt(bx, bz, by);
      // both ends in the same stairwell: just along its flights
      if (sa && sa === sb) {
        const a = this.shaftNearest(sa, ax, az, ay), b = this.shaftNearest(sa, bx, bz, by);
        return [...this.shaftWalk(sa, a, b), { x: bx, z: bz }];
      }
      let pre = [], post = [], start, goal;
      if (sa) {
        const e = this.shaftExitFor(sa, goalLv), d = this.shaftDoor(sa, e); this.shaftNodes(sa);
        pre = [...this.shaftWalk(sa, this.shaftNearest(sa, ax, az, ay), sa.landIdx[e.lv]), d.inside, d.outside];
        start = e.out;
      } else { const s = this.nearestWalkable(this.ti(ax), this.tj(az)); if (!s) return null; start = this.idx(s[0], s[1]); }
      if (sb) {
        const e = this.shaftExitFor(sb, this.levelAt(bx, bz, by)), d = this.shaftDoor(sb, e); this.shaftNodes(sb);
        const land = sb.landIdx[e.lv], L = sb.nodes[land];
        post = [d.inside, { x: L.x, z: L.z, hard: true }, ...this.shaftWalk(sb, land, this.shaftNearest(sb, bx, bz, by)), { x: bx, z: bz }];
        goal = e.out;
      } else { const t = this.nearestWalkable(this.ti(bx), this.tj(bz)); if (!t) return null; goal = this.idx(t[0], t[1]); }
      const tg = [goal % W, Math.floor(goal / W)];
      // (scratch arrays kept from one search to the next, each search stamped with its own number: a tile whose stamp is
      // old hasn't been reached yet this time)
      // (and a tile once taken off the heap is done with: a later, costlier way to it is skipped)
      const N = this.grid.length, S = this._path || (this._path = { g: new Float64Array(N), came: new Int32Array(N), via: new Array(N).fill(null), at: new Uint32Array(N), shut: new Uint32Array(N), t: 0 });
      const now = ++S.t, gOf = (k) => (S.at[k] === now ? S.g[k] : Infinity), open = new MinHeap();
      S.at[start] = now; S.g[start] = 0; S.came[start] = -1; S.via[start] = null; open.push(0, start);
      let found = start === goal, guard = 0;
      while (!found && open.size && guard++ < Math.max(8000, N)) {
        const k = open.pop();
        if (k === goal) { found = true; break; }
        if (S.shut[k] === now) continue;
        S.shut[k] = now;
        const i = k % W, j = Math.floor(k / W), gk = S.g[k];
        const relax = (nk, cost, portal) => {
          if (cost < gOf(nk)) { S.at[nk] = now; S.g[nk] = cost; S.came[nk] = k; S.via[nk] = portal || null; open.push(cost + Math.abs((nk % W) - tg[0]) + Math.abs(Math.floor(nk / W) - tg[1]), nk); }
        };
        for (const [dx, dy] of DIRS) {
          const ni = i + dx, nj = j + dy, nk = this.idx(ni, nj);
          if (!(ignoreBlock ? this.floorAt(ni, nj) : this.walkable(ni, nj)) || this.grid[nk] === 4) continue;
          if (!this.connected(k, nk) || this.closedBlast(k, nk)) continue;
          relax(nk, gk + 1 + (this.doorEdge.has(this.edgeKey(k, nk)) ? 0.6 : 0), null);
        }
        const ps = this.portals.get(k);
        if (ps) for (const p of ps) relax(p.to, gk + p.cost, p);
      }
      if (!found) return null;
      const tiles = [];
      for (let k = goal; k >= 0 && k !== start; k = S.came[k]) tiles.push(k);
      tiles.reverse();
      const pts = [];
      for (const k of tiles) {
        const p = S.via[k];
        if (p) pts.push(...this.shaftPassage(p.a, p.b));
        else pts.push({ x: this.cx(k % W), z: this.cz(Math.floor(k / W)), k });
      }
      if (!sb) { if (pts.length && !pts[pts.length - 1].hard) pts[pts.length - 1] = { x: bx, z: bz, k: goal }; else pts.push({ x: bx, z: bz, k: goal }); }
      // string-pull the open stretches (never past a waypoint on the stairs, nor a doorway in or out of them)
      const out = [...pre];
      let cur = pre.length ? pre[pre.length - 1] : { x: ax, z: az };
      let n = 0;
      while (n < pts.length) {
        let far = n;
        if (!pts[n].hard) for (let m = n + 1; m < Math.min(pts.length, n + 8); m++) {
          if (pts[m].hard) break;
          if (this.losWide(cur.x, cur.z, pts[m].x, pts[m].z)) far = m; else break;
        }
        out.push(pts[far]); cur = pts[far]; n = far + 1;
      }
      out.push(...post);
      return out.length ? out : [{ x: bx, z: bz }];
    }
    losWide(ax, az, bx, bz) {
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, px = (-dz / l) * 0.45, pz = (dx / l) * 0.45;
      return this.los(ax + px, az + pz, bx + px, bz + pz) && this.los(ax - px, az - pz, bx - px, bz - pz) && !this.blockedLine(ax, az, bx, bz);
    }
    blockedLine(ax, az, bx, bz) {
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.0);
      for (let s = 1; s < n; s++) { const t = s / n; if (!this.walkable(this.ti(lerp(ax, bx, t)), this.tj(lerp(az, bz, t)))) return true; }
      return false;
    }
    // somewhere a creature could stand, picked at random (filter: if it'll do). near: only look round there ({ x, z, r },
    // r in metres), or ({ lv }) only on that floor and those under it ({ lv, only: true }: just on that floor, with the
    // hall down into it); anywhere in the building otherwise
    randomWalkable(rng, filter, near) {
      let i0 = 0, i1 = this.W - 1, j0 = 0, j1 = this.H - 1;
      if (near && near.lv != null) {
        const lv = clamp(near.lv, 0, this.levels - 1);
        j0 = lv > 0 ? this.bands[lv] : 0;
        if (near.only) j1 = this.regions[lv].j1 - 1;
      } else if (near) {
        const r = Math.ceil(near.r / TS) + 1, ci = this.ti(near.x), cj = this.tj(near.z);
        i0 = clamp(ci - r, 0, i1); i1 = clamp(ci + r, 0, i1); j0 = clamp(cj - r, 0, j1); j1 = clamp(cj + r, 0, j1);
      }
      for (let t = 0; t < 200; t++) {
        const i = rng.int(i0, i1), j = rng.int(j0, j1);
        if (!this.walkable(i, j)) continue;
        const p = { x: this.cx(i), z: this.cz(j), i, j };
        if (!filter || filter(p)) return p;
      }
      return null;
    }
    nearestLampDist(x, z, power = true) {
      let best = Infinity;
      for (const l of this.lamps) {
        if (l.state === 'off' || (!power && l.state !== 'emergency')) continue;
        const d = Math.hypot(l.x - x, l.z - z); if (d < best) best = d;
      }
      return best;
    }
  }
  function mat4(x, y, z, ry = 0, rx = 0, rz = 0) { return mat(x, y, z, rx, ry, rz); }
  // (a doorway's size, for anything that has to squeeze through one)
  Fac.DW = DW; Fac.DH = DH;
  return Fac;
})();
