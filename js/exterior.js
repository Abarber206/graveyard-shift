'use strict';
// Procedural outdoor landing site: terrain, dead forest, a winding trail, the processing-plant complex
// (facility entrance), fire exit, pylons, wrecks, sky + weather.

// A ringed world's rings, worked out the same way wherever they're seen from (the sky over its moon or rock, or from
// orbit round any of them). They're a flat sheet of ice and rock round the world's middle, as dense at each distance out
// as the ring texture says, with lanes swept clear by whatever goes round inside them. Each line of sight is followed
// to where it crosses the sheet, so they're right however near or far: the world (and anything else out there) hides
// what's behind it; sunlight lights the face it falls on and filters through to the other, where the thin parts glow and
// the thick ones go dark; seen slantwise even the thin parts close up; the world's shadow and the shadows of its moons and
// rocks fall across them, sharp; and their own shadow lies across the world (and whatever's inside them) in bands.
// Everything is in one space: the world's centre uRingC, the sheet's normal uRingN, uRingR (inner and outer edge in
// the world's radii, the world's radius, 1 if there are rings at all), two lanes in uRingGap (radius, half-width), and
// up to three other bodies in uRingOcc (centre, radius) that hide the rings and shade them (a negative radius: one that
// only hides them).
const Rings = {
  uniforms() {
    return { uRingMap: { value: TEX.get('rings') }, uRingC: { value: new THREE.Vector3() }, uRingN: { value: new THREE.Vector3(0, 1, 0) }, uRingR: { value: new THREE.Vector4(1.3, 3, 1, 0) },
      uRingGap: { value: new THREE.Vector4() }, uRingOcc: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] }, uRingCol: { value: new THREE.Color(1, 1, 1) } };
  },
  // today's rings (ringsToday) round a world of this tint; k: how bright they come out in that view
  set(U, sys, tint, k = 1) {
    if (!sys) { U.uRingR.value.w = 0; return; }
    U.uRingR.value.set(sys.in, sys.out, U.uRingR.value.z || 1, 1);
    const g = sys.gaps || []; U.uRingGap.value.set(g[0] ? g[0][0] : 0, g[0] ? g[0][1] : 0, g[1] ? g[1][0] : 0, g[1] ? g[1][1] : 0);
    U.uRingMap.value = TEX.get(sys.map || 'rings');
    if (sys.col != null) U.uRingCol.value.set(sys.col).multiplyScalar(k); else U.uRingCol.value.set(tint).lerp(_ringW, 0.3).multiplyScalar(k);
  },
  GLSL: `uniform sampler2D uRingMap; uniform vec3 uRingC, uRingN, uRingCol; uniform vec4 uRingR, uRingGap; uniform vec4 uRingOcc[3];
    // the sheet r of the world's radii out: its colour, and how dense it is (alpha)
    vec4 ringTx(float r) { return texture2D(uRingMap, vec2(clamp((r - uRingR.x) / (uRingR.y - uRingR.x), 0.0, 1.0), 0.5)); }
    // fine ringlets, far finer than the texture: there close up, fading out before they're fine enough to shimmer
    float ringN1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(fract(sin(i * 12.9898) * 43758.5453), fract(sin((i + 1.0) * 12.9898) * 43758.5453), f); }
    float ringFine(float r) { float k = r * 2400.0; return mix(1.0, 0.4 + 1.2 * ringN1(k) * ringN1(k * 0.31 + 7.0), 1.0 - smoothstep(0.2, 0.8, fwidth(k))); }
    // and broader bands of brighter and duller ice, coarse enough to show even where the sheet is seen edge-on
    float ringBands(float r) { float k = r * 90.0, k2 = r * 23.0; return mix(1.0, 0.72 + 0.5 * ringN1(k) * (0.6 + 0.4 * ringN1(k2 + 3.0)), 1.0 - smoothstep(0.25, 0.9, fwidth(k))); }
    // its optical depth there (nothing, up to about 3 in the thick of the main ring), the lanes cut clean
    float ringTau(float r, float a) {
      float g0 = max(uRingGap.y, 1e-6), g1 = max(uRingGap.w, 1e-6);
      return -log(1.0 - 0.94 * a) * 1.1 * step(uRingR.x, r) * step(r, uRingR.y) * uRingR.w
        * smoothstep(g0 * 0.9, g0, abs(r - uRingGap.x)) * smoothstep(g1 * 0.9, g1, abs(r - uRingGap.z));
    }
    // how much sunlight is left at P once it's come through the rings, toward the sun S
    float ringThrough(vec3 P, vec3 S) {
      float sn = dot(S, uRingN), t = dot(uRingC - P, uRingN) / (abs(sn) < 1e-4 ? 1e-4 : sn);
      float r = length(P + S * t - uRingC) / uRingR.z;
      return exp(-ringTau(r, ringTx(r).a) * step(0.0, t) / max(abs(sn), 0.03));
    }
    // where a line first meets a sphere (centre, radius): -1 if it misses, 0 if it starts inside
    float ringHit(vec3 o, vec3 d, vec4 s) { vec3 oc = o - s.xyz; float b = dot(oc, d), h = b * b - dot(oc, oc) + s.w * s.w; if (h < 0.0) return -1.0; h = sqrt(h); return -b + h < 0.0 ? -1.0 : max(-b - h, 0.0); }
    // how much of the sun a sphere leaves showing at P: a sharp shadow, with only the sliver of penumbra the sun's disc gives
    float ringSun(vec3 P, vec3 S, vec4 s) { vec3 rel = s.xyz - P; float t = dot(rel, S); if (t <= 0.0 || s.w <= 0.0) return 1.0; float pen = t * 0.0047 + s.w * 0.002; return smoothstep(s.w - pen, s.w + pen, length(rel - S * t)); }
    // the rings along a line of sight from o in direction d, the sun toward S: colour and cover, and how far off (t)
    vec4 ringSee(vec3 o, vec3 d, vec3 S, out float t) {
      float dn = dot(d, uRingN); t = dot(uRingC - o, uRingN) / (abs(dn) < 1e-6 ? 1e-6 : dn);
      vec3 P = o + d * t; float r = length(P - uRingC) / uRingR.z;
      vec4 tx = ringTx(r); float fine = ringFine(r), bands = ringBands(r), tau = ringTau(r, tx.a) * fine;
      if (t <= 0.0 || tau < 1e-4) return vec4(0.0);
      vec4 W = vec4(uRingC, uRingR.z); float h = ringHit(o, d, W);
      if (h >= 0.0 && h < t) return vec4(0.0);
      for (int i = 0; i < 3; i++) { h = ringHit(o, d, uRingOcc[i]); if (uRingOcc[i].w != 0.0 && h >= 0.0 && h < t) return vec4(0.0); }
      float mu = max(abs(dn), 0.01), sn = dot(S, uRingN), mu0 = max(abs(sn), 0.01), cover = 1.0 - exp(-tau / mu);
      float lit = ringSun(P, S, W);
      for (int i = 0; i < 3; i++) lit *= ringSun(P, S, uRingOcc[i]);
      // (the sunlit face: light scattered back off it; the far face: only what scatters on through)
      float IF = sn * dot(o - uRingC, uRingN) > 0.0 ? mu0 / (mu0 + mu) * (1.0 - exp(-tau * (1.0 / mu0 + 1.0 / mu)))
        : 0.75 * (abs(mu - mu0) < 0.003 ? tau / mu * exp(-tau / mu) : mu0 / (mu - mu0) * (exp(-tau / mu) - exp(-tau / mu0)));
      // (the thick rings are the bright ones, the thin ones dusky, so the rings keep their bands even edge-on)
      float alb = mix(0.45, 1.15, smoothstep(0.08, 1.8, tau)) * bands * mix(1.0, fine, 0.5);
      return vec4(tx.rgb * uRingCol * alb * (IF * lit * 1.5 + 0.004 * cover) / max(cover, 1e-3), cover);
    }
`,
  // (the same, worked out here: how much sunlight reaches P through the rings, for the sun on the ground and the glare)
  through(U, P, S) {
    const N = U.uRingN.value, C = U.uRingC.value, R4 = U.uRingR.value; if (!R4.w) return 1;
    const sn = S.dot(N), t = (C.dot(N) - P.dot(N)) / (Math.abs(sn) < 1e-4 ? 1e-4 : sn); if (t <= 0) return 1;
    const r = _ringP.copy(P).addScaledVector(S, t).sub(C).length() / R4.z;
    if (r < R4.x || r > R4.y) return 1;
    if (!Rings.prof) { const im = TEX.get('rings').image, d = im.getContext('2d').getImageData(0, 0, im.width, 1).data; Rings.prof = Float32Array.from({ length: im.width }, (_, i) => d[i * 4 + 3] / 255); }
    const pr = Rings.prof, g = U.uRingGap.value, a = pr[Math.round(clamp((r - R4.x) / (R4.y - R4.x), 0, 1) * (pr.length - 1))];
    const lane = (c, w) => (w > 0 ? sstep(w * 0.9, w, Math.abs(r - c)) : 1);
    return Math.exp(-(-Math.log(1 - 0.94 * a) * 1.1 * lane(g.x, g.y) * lane(g.z, g.w)) / Math.max(Math.abs(sn), 0.03));
  },
};
const _ringW = new THREE.Color(1, 1, 1), _ringP = new THREE.Vector3(), _pollen = new THREE.Color(1.3, 1.25, 0.5);
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
  // a hothouse world: an overgrown hydroponic farm under a warm green haze, everything dripping and growing
  verdigris: {
    relief: 'hills', water: null, terrainTex: 'terrainMarsh',
    ground: { a: [0.66, 0.78, 0.52], b: [0.54, 0.66, 0.42], damp: [0.36, 0.44, 0.3], moss: [0.52, 0.72, 0.4], rock: [0.55, 0.6, 0.5], trail: [0.52, 0.46, 0.36], yard: [0.56, 0.6, 0.52] },
    trees: { n: 380, snag: 0.04, swamp: 0.5, bark: 0x6a7a4a, charred: 0 },
    rocks: { n: 60, big: 0.1, tint: 0x6a7a5a, spires: 0 },
    deadwood: { logs: 40, stumps: 16, charred: false },
    grass: { kind: 'fern', dens: 0.5, h: 1.3 },
    sky: { top: [0.85, 1.0, 0.75], hor: [0.95, 1.06, 0.72], sun: [1.05, 1.0, 0.78], hemi: [0.85, 1.0, 0.75], dim: 0.95, fogAdd: 0.01 },
    motes: 'pollen', plant: 'farm', sign: 'VERDIGRIS AGRICULTURAL',
    vehicles: { colors: [0x4a6a3a, 0xa8a088, 0x8a5a2a], van: 0.6, burnt: false },
  },
  // an ice world: wind-scoured snowfields and frozen rock under a hard white sky, snow always coming down
  rimefall: {
    relief: 'hills', water: null, terrainTex: 'terrainSnow',
    ground: { a: [1.0, 1.0, 1.02], b: [0.9, 0.93, 0.97], damp: [0.72, 0.76, 0.82], moss: [0.94, 0.96, 1.0], rock: [0.62, 0.64, 0.68], trail: [0.7, 0.7, 0.72], yard: [0.76, 0.78, 0.82] },
    trees: { n: 90, snag: 0.5, swamp: 0, bark: 0x34343a, charred: 0 },
    rocks: { n: 160, big: 0.2, tint: 0x6a6e78, spires: 6 },
    deadwood: { logs: 10, stumps: 12, charred: false },
    grass: { kind: 'frost', dens: 0.14, h: 0.7 },
    sky: { top: [0.85, 0.95, 1.12], hor: [1.08, 1.12, 1.2], sun: [0.95, 1.0, 1.1], hemi: [0.9, 1.0, 1.15], dim: 1.05, fogAdd: 0.008 },
    motes: 'snow', plant: 'depot', sign: 'RIMEFALL COLD STORAGE',
    vehicles: { colors: [0xb8c8d0, 0x8a2a20, 0x4a5a6a], van: 0.7, burnt: false },
  },
  // a moor: low rolling heather and peat under a bruised violet sky, mist lying in the hollows
  agnes: {
    relief: 'hills', water: null, terrainTex: 'terrain',
    ground: { a: [0.64, 0.52, 0.58], b: [0.54, 0.44, 0.48], damp: [0.36, 0.32, 0.34], moss: [0.5, 0.5, 0.42], rock: [0.58, 0.56, 0.56], trail: [0.46, 0.4, 0.36], yard: [0.52, 0.5, 0.5] },
    trees: { n: 70, snag: 0.7, swamp: 0.1, bark: 0x4a4440, charred: 0 },
    rocks: { n: 110, big: 0.2, tint: 0x7a7672, spires: 0 },
    deadwood: { logs: 14, stumps: 18, charred: false },
    grass: { kind: 'heather', dens: 0.44, h: 0.8 },
    sky: { top: [0.86, 0.8, 0.98], hor: [0.95, 0.88, 1.0], sun: [1.0, 0.92, 0.95], hemi: [0.9, 0.85, 1.0], dim: 0.9, fogAdd: 0.01 },
    motes: 'spores', plant: 'asylum', sign: 'ST. AGNES SANATORIUM',
    vehicles: { colors: [0x2a2a2a, 0xd8d8d0, 0x5a2a2a], van: 0.5, burnt: false },
  },
  // a drowned coast: grey mudflats and black tidal pools, driftwood, rusting hulks, rain off the sea
  brinewell: {
    relief: 'marsh', water: -0.5, terrainTex: 'terrainMarsh',
    ground: { a: [0.86, 0.9, 0.98], b: [0.74, 0.78, 0.86], damp: [0.5, 0.54, 0.6], moss: [0.7, 0.8, 0.8], rock: [0.66, 0.68, 0.72], trail: [0.82, 0.8, 0.78], yard: [0.74, 0.74, 0.78] },
    trees: { n: 20, snag: 1, swamp: 0, bark: 0x5a5a58, charred: 0 },
    rocks: { n: 140, big: 0.25, tint: 0x3a3e42, spires: 0 },
    deadwood: { logs: 54, stumps: 4, charred: false },
    grass: { kind: 'dry', dens: 0.2, h: 0.9, tint: [0.78, 0.86, 0.8] },
    sky: { top: [0.78, 0.88, 0.95], hor: [0.85, 0.95, 1.0], sun: [0.95, 1.0, 1.0], hemi: [0.8, 0.9, 0.95], dim: 0.85, fogAdd: 0.008 },
    motes: 'spores', plant: 'dock', sign: 'BRINEWELL DRY DOCK',
    vehicles: { colors: [0x2a4a6a, 0xa86a2a, 0x6a6a6a], van: 0.5, burnt: false },
  },
  // a dead salt sea: a white crust out to the horizon, cracked in polygons, under a bleached yellow sky
  saltreach: {
    relief: 'flats', water: null, terrainTex: 'terrainSalt',
    ground: { a: [1.0, 0.98, 0.94], b: [0.92, 0.9, 0.85], damp: [0.8, 0.76, 0.7], moss: [0.95, 0.92, 0.86], rock: [0.7, 0.66, 0.6], trail: [0.72, 0.68, 0.62], yard: [0.66, 0.64, 0.6] },
    trees: { n: 0, snag: 0, swamp: 0, bark: null, charred: 0 },
    rocks: { n: 40, big: 0.1, tint: 0xc8c0b0, spires: 0 },
    deadwood: { logs: 0, stumps: 0, charred: false },
    grass: { kind: 'none', dens: -1, h: 0.5 },
    sky: { top: [1.05, 1.0, 0.8], hor: [1.2, 1.12, 0.85], sun: [1.15, 1.05, 0.85], hemi: [1.1, 1.05, 0.9], dim: 1.08, fogAdd: 0.004 },
    motes: 'dust', plant: 'refinery', sign: 'SALTREACH BRINE WORKS',
    vehicles: { colors: [0xd8d8d0, 0xc89a2a, 0x8a3a2a], van: 0.4, burnt: false },
  },
  // a volcanic world: black basalt mesas and glassy flows under a sulphur sky, embers on the wind
  vesper: {
    relief: 'canyon', water: null, terrainTex: 'terrainBasalt',
    ground: { a: [0.44, 0.42, 0.42], b: [0.36, 0.34, 0.34], damp: [0.26, 0.24, 0.24], moss: [0.42, 0.38, 0.32], rock: [0.32, 0.31, 0.32], trail: [0.44, 0.4, 0.36], yard: [0.42, 0.4, 0.39] },
    trees: { n: 30, snag: 1, swamp: 0, bark: 0x1a1816, charred: 1 },
    rocks: { n: 260, big: 0.3, tint: 0x2a2828, spires: 40 },
    deadwood: { logs: 10, stumps: 20, charred: true },
    grass: { kind: 'ash', dens: 0.06, h: 0.5 },
    sky: { top: [0.9, 0.62, 0.4], hor: [1.2, 0.86, 0.45], sun: [1.15, 0.75, 0.4], hemi: [1.0, 0.7, 0.5], dim: 0.85, fogAdd: 0.008 },
    motes: 'embers', plant: 'foundry', sign: 'VESPER SMELTING CO.',
    vehicles: { colors: [0x2a2624, 0x5a3a2a], van: 0.4, burnt: true },
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
  const _ecl = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
  class Ext {
    constructor(seed, site, weather, key) {
      this.seed = seed; this.site = site; this.weather = weather;
      const bk = (site && site.biome) || key; this.key = BIOMES[bk] ? bk : 'ashgrove'; this.biome = BIOMES[this.key];
      // (a moon with dust of its own colour: ice, sulphur, soot, rust)
      if (site && site.ground) { const k = site.ground, tint = (c) => [c[0] * k[0], c[1] * k[1], c[2] * k[2]], G0 = this.biome.ground; this.biome = Object.assign({}, this.biome, { ground: Object.fromEntries(Object.entries(G0).map(([n, c]) => [n, tint(c)])), rocks: Object.assign({}, this.biome.rocks, { tint: new THREE.Color(this.biome.rocks.tint).multiply(new THREE.Color(k[0], k[1], k[2])).getHex() }) }); }
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
      if (R === 'flats') {
        // a dead sea bed: flat to the horizon, only the faintest swell to it
        return n.fbm(x * 0.004, z * 0.004, 3) * 2.4 + n.noise(x * 0.05, z * 0.05) * 0.15;
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
    // bowl is laid over it), and keep anything from growing in it. (fresh: a meteor's, on an airless moon: not scorched
    // but ringed with bright spray thrown out in rays, the floor a little darker)
    addCrater(x, z, r, d, fresh) {
      this.impacts.push({ x, z, r, d });
      // (coarse vertices inside rd sink well below the bowl; the bowl reaches a full grid diagonal past them, so no
      // coarse triangle that dips can show outside it)
      const rd = r + 0.6, R = fresh ? Math.max(rd + 3, r * 2.6) : rd + 3.0, g = this.terrainGeo, pos = g.attributes.position, col = g.attributes.color, G2 = this.grid;
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
        if (fresh) {
          const an = Math.atan2(vz - z, vx - x), ph = x * 0.37 + z * 0.11, rays = Math.pow(Math.max(0, Math.sin(an * 9 + ph) * Math.sin(an * 5.3 + ph * 1.7)), 2) * sstep(2.6, 1.1, q) * sstep(0.9, 1.15, q);
          const lit = clamp(lip * 2.6 + rays * 1.1 + sstep(1.9, 1.0, q) * sstep(0.9, 1.0, q) * 0.45, 0, 1), fl = sstep(1, 0.55, q) * 0.3;
          for (let k = 0; k < 3; k++) bc[i * 3 + k] = lerp(c[k] * (1 - fl), Math.min(1, c[k] * 1.8 + 0.1), lit);
          continue;
        }
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
    // (the land and the rest are each built in pieces, so a landing can put them together a frame or so apart: see
    // G.stageSite)
    buildLand() { const g = this.landGen(); let r; do r = g.next(); while (!r.done); return r.value; }
    *landGen() {
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
        if (i % 9000 === 8999) yield;
        const x = pos.getX(i), z = pos.getZ(i), h = this.height(x, z);
        pos.setY(i, h); this.grid.h[i] = h;
        uv.setXY(i, x / 5, z / 5);
        trails[i] = sstep(3.2, 1.2, this.pathInfo(x, z).d) * (0.75 + 0.25 * this.noise.noise(x * 0.4, z * 0.4));
        yards[i] = sstep(48, 30, Math.hypot(x - this.center.x, z - this.center.z));
        const pads = Math.max(sstep(19, 14, Math.hypot(x, z)), sstep(8, 5, Math.hypot(x - this.fire.x, z - this.fire.z)));
        this.grid.bare[i] = Math.max(sstep(0.15, 0.45, trails[i]), sstep(0.3, 0.7, yards[i]), pads);
      }
      geo.computeVertexNormals();
      yield;
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
      yield;
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
      yield;
      this.buildDeadwood(grp);
      yield;
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
    buildRest() { const g = this.restGen(); let r; do r = g.next(); while (!r.done); return r.value; }
    *restGen() {
      const grp = this.group;
      this.buildComplex(grp); yield;
      this.buildFireExit(grp); this.buildPylons(grp); yield;
      this.buildWrecks(grp); yield;
      this.buildWorldExtras(grp); this.buildLampPosts(grp); this.buildSky(grp); yield;
      this.buildRanges(grp); yield;
      yield* this.buildClouds(grp);
      this.buildRain(grp); this.buildGroundCover(grp); this.buildPuddles(grp); this.buildCrows(grp); this.buildMotes(grp);
      this.group = grp;
      return grp;
    }
    // ---------------- the far country ----------------
    // Ranges all round the site beyond where anyone walks, foothills rising to the high ground: the shape of this
    // world's land (rolling ridges, terraced mesas, volcanoes over an ash plain, low rises and lone mesas across the
    // flats, jagged snowy peaks), coloured from its own ground and rock, lit by its sun. They stand in the ground mist:
    // their feet lost in it, their tops clearing it on a fine day, all of it gone in fog (and sharp and black-shadowed
    // where there's no air at all). Drawn with their own haze (see update), not the scene's fog, which would swallow
    // anything this far out.
    buildRanges(grp) {
      const BI = this.biome, rel = BI.relief, snowy = BI.terrainTex === 'terrainSnow', P = BI.ground, nz = new Noise2D(this.seed + 313), rr = new RNG(this.seed + 314);
      const A = 384, RN = 18, R0 = 186, R1 = 465, amp = { hills: 85, marsh: 26, canyon: 64, craters: 44, flats: 12 }[rel] || 55;
      // (volcanoes on the skyline over the ash, and lone flat-topped mesas standing out of the flats)
      const peaks = [];
      if (rel === 'craters' || rel === 'flats') for (let i = 0; i < (rel === 'craters' ? 3 : 4); i++) { const a = rr.range(0, TAU), r = rr.range(330, 430); peaks.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: rr.range(0.8, 1.5), w: rr.range(40, 75) }); }
      const H = (x, z, r) => {
        // (two lines of country: nearer, lower hills standing in the mist, paler for it; then the high range behind,
        // its peaks clear of it and darker)
        const t = (r - R0) / (R1 - R0), env = sstep(0.3, 0.75, t) * (0.55 + 0.45 * sstep(0.6, 1, t)), nearEnv = sstep(0.01, 0.08, t) * (1 - sstep(0.3, 0.5, t));
        const near = (nz.fbm(x * 0.012 + 40, z * 0.012, 3) * 0.5 + 0.5) * (0.3 + 0.7 * (1 - Math.abs(nz.noise(x * 0.02 - 7, z * 0.02)))) * 0.6 * nearEnv * (rel === 'flats' ? 0.5 : 1);
        let h;
        if (rel === 'canyon') { const v = (nz.fbm(x * 0.006, z * 0.006, 4) * 0.5 + 0.5) * 4, f = v - Math.floor(v); h = (Math.floor(v) + sstep(0.72, 0.95, f)) / 4 * 1.5; }
        else if (rel === 'marsh') h = (nz.fbm(x * 0.008, z * 0.008, 3) * 0.5 + 0.5) * 0.9;
        else if (rel === 'flats') h = (nz.fbm(x * 0.005, z * 0.005, 3) * 0.5 + 0.5) * 0.5;
        else { const rd = 1 - Math.abs(nz.noise(x * 0.007, z * 0.007)); h = rd * rd * 0.9 + (nz.fbm(x * 0.016 + 9, z * 0.016, 4) * 0.5 + 0.5) * 0.45; if (snowy) h *= 1.5; }
        h = (h * env + near) * amp;
        for (const c of peaks) {
          const d = Math.hypot(x - c.x, z - c.z);
          if (rel === 'craters') h += c.h * 110 * Math.pow(Math.max(0, 1 - d / c.w), 1.4) - c.h * 22 * Math.max(0, 1 - d / (c.w * 0.2));
          else h = Math.max(h, c.h * 34 * sstep(c.w * 1.2, c.w, d) * (0.94 + 0.06 * nz.noise(x * 0.05, z * 0.05)));
        }
        // (the nearer hills start just past where anyone can walk, rising off the land itself; their near edge dips
        // under it, so no seam shows)
        return h + this.height(x, z) * (1 - sstep(190, 260, r)) + 0.3 - 8 * (1 - sstep(R0, R0 + 3, r));
      };
      const nv = (A + 1) * (RN + 1), pos = new Float32Array(nv * 3), idx = [];
      for (let j = 0; j <= RN; j++) for (let i = 0; i <= A; i++) {
        const a = (i / A) * TAU, r = R0 + (R1 - R0) * Math.pow(j / RN, 1.3), x = Math.cos(a) * r, z = Math.sin(a) * r, k = (j * (A + 1) + i) * 3;
        pos[k] = x; pos[k + 1] = H(x, z, r); pos[k + 2] = z;
      }
      for (let j = 0; j < RN; j++) for (let i = 0; i < A; i++) { const a = j * (A + 1) + i, b = a + 1, c = a + A + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      // the ground's own colours: its earth on the gentle slopes, its rock on the steep ones (canyon strata in bands), snow
      // on the high flat parts of a snowy world
      const nrm = geo.attributes.normal, col = new Float32Array(nv * 3), hmax = amp * (snowy ? 1.5 : 1) * 1.1;
      for (let i = 0; i < nv; i++) {
        const y = pos[i * 3 + 1], ny = nrm.getY(i), steep = sstep(0.9, 0.7, ny), v = 0.85 + 0.3 * (nz.noise(pos[i * 3] * 0.03, pos[i * 3 + 2] * 0.03) * 0.5 + 0.5);
        // (seen from this far, the colour's gone out of it: greyed toward the rock, darker, a little cold)
        const rad = Math.hypot(pos[i * 3], pos[i * 3 + 2]), far = sstep(200, 330, rad);
        const c = [0, 1, 2].map((k) => { const g0 = lerp(P.a[k], P.rock[k], steep), gr = (P.rock[0] + P.rock[1] + P.rock[2]) / 3; return lerp(g0 * 0.5, lerp(g0, gr, 0.45) * 0.3 * [0.94, 0.97, 1.04][k], far) * v; });
        if (rel === 'canyon') { const band = 0.88 + 0.14 * Math.sin(y * 0.9 + nz.noise(pos[i * 3] * 0.01, pos[i * 3 + 2] * 0.01) * 2); c[0] *= band; c[1] *= band * 0.97; c[2] *= band * 0.94; }
        if (snowy) { const sn = sstep(0.42, 0.6, y / hmax) * sstep(0.55, 0.8, ny); for (let k = 0; k < 3; k++) c[k] = lerp(c[k], 0.82, sn); }
        col.set(c, i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // (the top of the fog bank, all the way round: a few metres over the highest the land rises that way, out to its edge)
      const tops = new Float32Array(64);
      for (let k = 0; k < 64; k++) { const a = (k / 64) * TAU; let m = -1e9; for (let r = 90; r <= 190; r += 8) m = Math.max(m, this.height(Math.cos(a) * r, Math.sin(a) * r)); tops[k] = m + 4; }
      const tops0 = tops.slice(); for (let k = 0; k < 64; k++) tops[k] = Math.max(tops0[k], tops0[(k + 1) % 64], tops0[(k + 63) % 64]);
      const U = (v) => ({ value: v });
      this.rangeMat = new THREE.ShaderMaterial({
        uniforms: { uSun: U(new THREE.Vector3(0, 1, 0)), uSunCol: U(new THREE.Color(1, 1, 1)), uSky: U(new THREE.Color(0.7, 0.7, 0.7)), uGround: U(new THREE.Color(0x1a1712)), uFog: U(new THREE.Color(0.5, 0.5, 0.5)), uScatter: U(new THREE.Color(0, 0, 0)), uSunK: U(1), uHemiK: U(1), uD: U(0.005), uF: U(0.045), uTopAdd: U(0), uTop: U(tops) },
        vertexShader: `varying vec3 vW, vN, vC;
          void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vC = color; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: `uniform vec3 uSun, uSunCol, uSky, uGround, uFog, uScatter; uniform float uSunK, uHemiK, uD, uF, uTopAdd, uTop[64]; varying vec3 vW, vN, vC;
          void main(){
            vec3 n = normalize(vN);
            vec3 lit = vC * (uSunCol * uSunK * max(dot(n, uSun), 0.0) + mix(uGround, uSky, n.y * 0.5 + 0.5) * uHemiK) * 0.3183;
            // the mist thickest low down: a line of sight to their feet goes through all of it, one to the peaks above most
            vec3 v = vW - cameraPosition; float dist = length(v), sd = max(dot(v / dist, uSun), 0.0);
            vec3 fc = uFog + uScatter * (pow(sd, 5.0) * 0.55 + pow(sd, 40.0) * 0.9);
            float hz = 1.0 - exp(-dist * uD * (0.2 + 0.8 * exp(-max(vW.y, 0.0) * uF)));
            // (and nothing shows through the fog bank lying over the land between: below its top, which is as high as
            // the land rises that way, they're lost in it; above, they come out of it softly)
            float fa = atan(vW.z, vW.x) / 6.2831853 * 64.0 + 64.0, fi = floor(fa);
            float top = mix(uTop[int(mod(fi, 64.0))], uTop[int(mod(fi + 1.0, 64.0))], fa - fi) + uTopAdd;
            hz = max(hz, 0.92 * (1.0 - smoothstep(top, top + 26.0, vW.y)) * step(0.002, uD));
            gl_FragColor = vec4(mix(lit, fc, clamp(hz, 0.0, 1.0)), 1.0); }`,
        vertexColors: true, fog: false,
      });
      const m = new THREE.Mesh(geo, this.rangeMat); m.frustumCulled = false; grp.add(m); this.ranges = m;
      this.rangeH = H; this.rangeTops = tops;
    }
    // ---------------- cloud and mist ----------------
    // Soft particles: big churning cloud banks hanging among the ranges at half their height, and along the top of the
    // fog bank lying over the land between (so you can see how big the hills are), drifting slowly round on the wind;
    // and near you, low wisps of ground mist trailing over the land, thicker at dawn and by night. Each is a camera-
    // facing card held level, its shape a soft envelope eaten into by two layers of noise sliding past each other so
    // it billows and churns. They're lit like cloud: bright tops, shaded undersides, a bright rim when the sun is behind
    // them, the sky's light in the shadows; hazed with distance like the ranges; and they thin away wherever they meet
    // the ground or a hillside, so no hard line shows where a card cuts into the land.
    *buildClouds(grp) {
      this.clouds = null;
      if (this.biome.airless || !this.rangeH) return;
      const r = new RNG(this.seed + 1212), wx = this.weather, H = this.rangeH, tops = this.rangeTops;
      // (the height of whatever's under any spot, land or range, out to well past the ranges: for the soft edges)
      const HN = 256, HS = 980, HMIN = -30, HMAX = 230, hd = new Uint8Array(HN * HN);
      const ground = (x, z) => { const rr = Math.hypot(x, z); return rr < 200 ? Math.max(this.height(x, z), rr > 186 ? H(x, z, rr) : -1e9) : rr < 465 ? H(x, z, rr) : this.height(x, z) * 0; };
      for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
        if (i === 0 && (j & 63) === 63) yield;
        const x = ((i + 0.5) / HN - 0.5) * HS, z = ((j + 0.5) / HN - 0.5) * HS;
        hd[j * HN + i] = clamp(Math.round((ground(x, z) - HMIN) / (HMAX - HMIN) * 255), 0, 255);
      }
      const htex = new THREE.DataTexture(hd, HN, HN, THREE.RedFormat, THREE.UnsignedByteType); htex.magFilter = htex.minFilter = THREE.LinearFilter; htex.needsUpdate = true;
      this.heightTex = htex; this.heightBox = [HS, HMIN, HMAX];
      // (tiling cloud noise: smooth value noise on a wrapping lattice, a few octaves)
      const NN = 128, nd = new Uint8Array(NN * NN * 4), nr = new RNG(this.seed + 1313);
      const lat = [8, 16, 32].map((P) => { const g = Array.from({ length: P * P }, () => nr.next()); return { P, g }; });
      const vn = (L, x, y) => { const P = L.P, fx = x * P, fy = y * P, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), at = (a, b) => L.g[((b % P + P) % P) * P + ((a % P + P) % P)];
        return lerp(lerp(at(ix, iy), at(ix + 1, iy), sx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy); };
      for (let j = 0; j < NN; j++) for (let i = 0; i < NN; i++) {
        const x = i / NN, y = j / NN, v = vn(lat[0], x, y) * 0.55 + vn(lat[1], x, y) * 0.3 + vn(lat[2], x, y) * 0.15, k = (j * NN + i) * 4;
        nd[k] = nd[k + 1] = nd[k + 2] = nd[k + 3] = clamp(Math.round(v * 255), 0, 255);
      }
      const ntex = new THREE.DataTexture(nd, NN, NN); ntex.wrapS = ntex.wrapT = THREE.RepeatWrapping; ntex.magFilter = ntex.minFilter = THREE.LinearFilter; ntex.needsUpdate = true;
      // where they hang: banks among the ranges (more of them, lower and greyer, when it's wet), a broken layer along
      // the top of the fog bank, and the ground wisps (placed round the camera, wrapping as it moves)
      const C = [], add = (x, y, z, w, h, a, kind, drift) => C.push([x, y, z, w, h, r.next(), a, drift, kind]);
      const wet = wx === 'rain' ? 1 : wx === 'storm' ? 1.5 : 0, nBank = Math.round(22 + wet * 14), topAt = (a) => tops[Math.floor((((a / TAU) % 1) + 1) % 1 * 64)];
      for (let c = 0; c < nBank; c++) {
        const a = r.range(0, TAU), rad = r.range(250, 430), x0 = Math.cos(a) * rad, z0 = Math.sin(a) * rad;
        const hill = H(x0, z0, rad), top = topAt(a), y0 = Math.max(top + 6, lerp(top, hill, r.range(0.35, 0.7)) - wet * 8);
        const n = r.int(4, 9), tx = -Math.sin(a), tz = Math.cos(a), dr = r.range(0.0004, 0.0009) * (r.chance(0.8) ? 1 : -1);
        for (let k = 0; k < n; k++) { const u = r.range(-1, 1) * 45; add(x0 + tx * u + Math.cos(a) * r.range(-14, 14), y0 + r.range(-5, 7), z0 + tz * u + Math.sin(a) * r.range(-14, 14), r.range(38, 85), r.range(14, 30), r.range(0.75, 1.0) * (0.85 + wet * 0.15), 0, dr); }
      }
      for (let k = 0; k < 40; k++) { const a = r.range(0, TAU), rad = r.range(205, 300); add(Math.cos(a) * rad, topAt(a) + r.range(-3, 6), Math.sin(a) * rad, r.range(60, 120), r.range(10, 18), r.range(0.35, 0.6), 0, 0.0005); }
      const nW = wx === 'fog' ? 30 : 70;
      for (let k = 0; k < nW; k++) { const a = r.range(0, TAU), rad = r.range(25, 110); add(Math.cos(a) * rad, r.range(0.6, 2.5), Math.sin(a) * rad, r.range(10, 26), r.range(2.5, 5.5), r.range(0.1, 0.22), 1, 0); }
      const n = C.length, q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
      g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv); g.instanceCount = n;
      const ip = new Float32Array(n * 3), is = new Float32Array(n * 2), im = new Float32Array(n * 4);
      C.forEach((c, i) => { ip.set([c[0], c[1], c[2]], i * 3); is.set([c[3], c[4]], i * 2); im.set([c[5], c[6], c[7], c[8]], i * 4); });
      g.setAttribute('iPos', new THREE.InstancedBufferAttribute(ip, 3)); g.setAttribute('iSize', new THREE.InstancedBufferAttribute(is, 2)); g.setAttribute('iMisc', new THREE.InstancedBufferAttribute(im, 4));
      const U = (v) => ({ value: v }), ru = this.rangeMat.uniforms;
      this.cloudMat = new THREE.ShaderMaterial({
        uniforms: { tH: U(htex), tN: U(ntex), uHB: U(new THREE.Vector4(-HS / 2, -HS / 2, HS, 0)), uHR: U(new THREE.Vector2(HMIN, HMAX)), uOrg: U(new THREE.Vector3()), uTime: U(0), uWind: U(new THREE.Vector2(0.9, 0.35)), uVis: U(new THREE.Vector2(1, 1)),
          uSun: ru.uSun, uSunCol: ru.uSunCol, uSky: ru.uSky, uFog: ru.uFog, uScatter: ru.uScatter, uSunK: ru.uSunK, uHemiK: ru.uHemiK, uD: ru.uD, uF: ru.uF, uShipInv: this.shipInv },
        vertexShader: `uniform sampler2D tH; uniform vec4 uHB; uniform vec2 uHR, uWind; uniform vec3 uOrg; uniform float uTime;
          attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iMisc;
          varying vec2 vUv; varying vec3 vW, vR; varying float vA, vSeed, vKind;
          float groundH(vec2 xz) { return mix(uHR.x, uHR.y, texture2D(tH, (xz - uHB.xy) / uHB.z).r); }
          void main(){
            vec3 c = iPos;
            if (iMisc.w < 0.5) { float a = uTime * iMisc.z, cs = cos(a), sn = sin(a); c.xz = vec2(c.x * cs - c.z * sn, c.x * sn + c.z * cs); }
            else {
              // (ground wisps ride the wind and wrap round wherever you are, hugging the land under them)
              vec2 cl = cameraPosition.xz - uOrg.xz;
              c.xz += uWind * uTime * (0.5 + iMisc.x * 0.7); c.xz = cl + mod(c.xz - cl + 110.0, 220.0) - 110.0;
              c.y += groundH(c.xz);
            }
            vec3 wc = c + uOrg, toCam = cameraPosition - wc; toCam.y = 0.0;
            vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toCam + vec3(0.0001))));
            vec3 w = wc + right * position.x * iSize.x + vec3(0.0, 1.0, 0.0) * (position.y + 0.15) * iSize.y;
            vW = w; vR = right; vUv = uv; vSeed = iMisc.x; vKind = iMisc.w;
            // (a wisp thins away as you walk into it; one far out, as it reaches the end of its round)
            float d = length(cameraPosition - wc);
            vA = iMisc.y * (iMisc.w > 0.5 ? smoothstep(8.0, 26.0, d) * (1.0 - smoothstep(85.0, 108.0, d)) : 1.0);
            gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
          }`,
        fragmentShader: `uniform sampler2D tH, tN; uniform vec4 uHB; uniform vec2 uHR, uVis; uniform vec3 uOrg, uSun, uSunCol, uSky, uFog, uScatter; uniform float uTime, uSunK, uHemiK, uD, uF; uniform mat4 uShipInv;
          varying vec2 vUv; varying vec3 vW, vR; varying float vA, vSeed, vKind;
          float groundH(vec2 xz) { return mix(uHR.x, uHR.y, texture2D(tH, (xz - uHB.xy) / uHB.z).r); }
          void main(){
            // the shape: a soft envelope, flatter underneath, eaten into by two layers of noise sliding past each other
            vec2 e = (vUv - 0.5) * 2.0; e.y = e.y > 0.0 ? e.y : e.y * 1.6;
            float env = 1.0 - smoothstep(0.35, 1.0, length(e));
            float n1 = texture2D(tN, vUv * vec2(1.3, 0.8) + vSeed * 7.3 + vec2(uTime * 0.0035, 0.0)).r, n2 = texture2D(tN, vUv * vec2(2.9, 1.7) - vSeed * 3.1 + vec2(-uTime * 0.006, uTime * 0.002)).r;
            float dens = smoothstep(0.3, 0.68, env * (0.45 + n1 * 0.75 + n2 * 0.45));
            // lit like cloud: as if a rounded mass, its top toward the sky, the underside and the thick of it in shadow
            vec3 nrm = normalize(vR * e.x * 0.8 + vec3(0.0, 1.0, 0.0) * (e.y * 0.7 + 0.45) + normalize(cameraPosition - vW) * 0.6);
            float ndl = dot(nrm, uSun) * 0.5 + 0.5, self = mix(0.5, 1.0, smoothstep(-0.6, 0.6, e.y)) * mix(1.0, 0.72, dens * dens);
            vec3 v = normalize(vW - cameraPosition); float sd = max(dot(v, uSun), 0.0);
            vec3 lit = (uSunCol * uSunK * (ndl * self + pow(sd, 8.0) * (1.0 - dens) * 1.6) + uSky * uHemiK * 0.95) * 0.3183 * 0.9;
            // hazed with distance, as the ranges are
            float dist = length(vW - cameraPosition), hz = 1.0 - exp(-dist * uD * (0.2 + 0.8 * exp(-max(vW.y - uOrg.y, 0.0) * uF)));
            vec3 fc = uFog + uScatter * (pow(sd, 5.0) * 0.55 + pow(sd, 40.0) * 0.9);
            vec3 col = mix(lit, fc, clamp(hz, 0.0, 1.0) * 0.85);
            // thinning away where it meets the land or a hillside
            float gh = groundH(vW.xz - uOrg.xz) + uOrg.y, soft = smoothstep(gh - 0.5, gh + (vKind > 0.5 ? 2.0 : 12.0), vW.y);
            float a = dens * vA * soft * (vKind > 0.5 ? uVis.y : uVis.x);
            // (and none of it in the ship)
            vec3 sl = (uShipInv * vec4(vW, 1.0)).xyz;
            if (a < 0.004 || (sl.x > -18.6 && sl.x < 12.6 && abs(sl.z) < 5.2 && sl.y > -1.1 && sl.y < 5.3)) discard;
            gl_FragColor = vec4(col, a);
          }`,
        transparent: true, depthWrite: false, fog: false,
      });
      const mesh = new THREE.Mesh(g, this.cloudMat); mesh.frustumCulled = false; mesh.renderOrder = 2; grp.add(mesh); this.clouds = mesh;
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
      } else if (kind === 'fern') {
        // lush ferns and broad leaves, every shade of green
        for (let i = 0; i < 18; i++) {
          const x0 = rr.range(20, 108), a = rr.range(-1.1, 1.1), l = rr.range(50, 110), v = rr.range(-18, 18) | 0, ex = x0 + Math.sin(a) * l * 0.6, ey = 128 - Math.cos(a * 0.6) * l;
          g.strokeStyle = `rgb(${54 + v},${96 + v},${40 + v})`; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, 128); g.quadraticCurveTo(x0, ey + 20, ex, ey); g.stroke();
          for (let k = 1; k < 9; k++) { const t = k / 9, px = lerp(x0, ex, t), py = lerp(128, ey, t), w = (1 - t) * 13 + 3; g.fillStyle = `rgb(${66 + v},${118 + v},${46 + v})`; g.beginPath(); g.ellipse(px - w * 0.5, py, w * 0.6, 2.2, -0.5, 0, TAU); g.ellipse(px + w * 0.5, py, w * 0.6, 2.2, 0.5, 0, TAU); g.fill(); }
        }
      } else if (kind === 'frost') {
        // stiff, frozen stalks rimed white
        for (let i = 0; i < 26; i++) { const v = rr.range(-10, 10) | 0; blade(rr.range(14, 114), rr.range(24, 70), rr.range(-6, 6), rr.range(1.2, 2.2), rr.chance(0.6) ? `rgb(${210 + v},${220 + v},${232 + v})` : `rgb(${120 + v},${118 + v},${110 + v})`); }
      } else if (kind === 'heather') {
        // low, wiry heather: dark stems crowded with purple flower-heads
        for (let i = 0; i < 30; i++) {
          const x0 = rr.range(12, 116), h = rr.range(30, 70), bend = rr.range(-10, 10), v = rr.range(-14, 14) | 0;
          blade(x0, h, bend, rr.range(1.2, 2), `rgb(${70 + v},${58 + v},${48 + v})`);
          for (let k = 0; k < 5; k++) { g.fillStyle = rr.chance(0.75) ? `rgb(${126 + v},${70 + v},${120 + v})` : `rgb(${150 + v},${110 + v},${150 + v})`; g.fillRect(x0 + bend * (0.6 + k * 0.08) + rr.range(-3, 3), 128 - h * (0.55 + k * 0.09), 3, 3); }
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
      // What's lying on the ground among it, by what grows here: drifts of dead leaves and twigs in the woods, broken
      // reed stalks by the marsh, grit and dry sticks in the canyon, ash flakes and char, frozen leaves rimed white. Each
      // a little patch drawn on one flat card, laid on the slope; plus the junk people leave by trails and yards
      // (crumpled paper, rusted cans).
      {
        const LK = { dry: [0.5, 0.06], heather: [0.35, 0.04], fern: [0.45, 0.06], reeds: [0.25, 0], scrub: [0.3, 0.05], ash: [0.35, 0.05], frost: [0.3, 0.03] }[kind] || [0, 0];
        this.litterDens = LK;
        const [lc, lg] = TEX.canvas(128, 128), lr = new RNG(this.seed + 17); lg.clearRect(0, 0, 128, 128);
        const P = (a) => a[lr.int(0, a.length - 1)];
        const leaf = (x, y, l, w, a, col) => { lg.save(); lg.translate(x, y); lg.rotate(a); lg.fillStyle = col; lg.beginPath(); lg.ellipse(0, 0, l, w, 0, 0, TAU); lg.fill(); lg.strokeStyle = 'rgba(30,20,10,.55)'; lg.lineWidth = 0.8; lg.beginPath(); lg.moveTo(-l * 1.3, 0); lg.lineTo(l * 0.9, 0); lg.stroke(); lg.restore(); };
        const stick = (x, y, l, a, w, col) => { lg.strokeStyle = col; lg.lineWidth = w; lg.lineCap = 'round'; lg.beginPath(); lg.moveTo(x, y); lg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); lg.stroke(); };
        const chip = (x, y, r, col) => { lg.fillStyle = col; lg.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, q = r * lr.range(0.6, 1.2); lg[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q); } lg.closePath(); lg.fill(); };
        const spot = () => { const a = lr.range(0, TAU), d = Math.sqrt(lr.next()) * 50; return [64 + Math.cos(a) * d, 64 + Math.sin(a) * d]; };
        for (let i = 0; i < 34; i++) {
          const [x, y] = spot();
          if (kind === 'dry' || kind === 'heather' || kind === 'fern') { if (lr.chance(0.85)) leaf(x, y, lr.range(5, 9), lr.range(2.5, 4.5), lr.range(0, TAU), P(['#7a4a22', '#94602a', '#6a5426', '#a8782e', '#5a3a1c', '#7c6a34'])); else stick(x, y, lr.range(10, 24), lr.range(0, TAU), 2, '#3e2e20'); }
          else if (kind === 'reeds') stick(x, y, lr.range(14, 34), lr.range(0, TAU), lr.range(1.5, 2.6), P(['#8a7a50', '#a09060', '#6e6440']));
          else if (kind === 'scrub') { if (lr.chance(0.6)) chip(x, y, lr.range(1.5, 4), P(['#8a7868', '#6e6054', '#a08a74'])); else stick(x, y, lr.range(8, 18), lr.range(0, TAU), 1.4, '#6a5a48'); }
          else if (kind === 'ash') chip(x, y, lr.range(2, 5), P(['#3a3836', '#24221f', '#5a5652', '#141210']));
          else if (kind === 'frost') leaf(x, y, lr.range(5, 8), lr.range(2.5, 4), lr.range(0, TAU), P(['#b8c0c4', '#8a8478', '#d8e0e4']));
        }
        const ltex = new THREE.CanvasTexture(lc); ltex.colorSpace = THREE.SRGBColorSpace;
        const lgeo = new THREE.PlaneGeometry(0.8, 0.8); lgeo.rotateX(-Math.PI / 2);
        const lmat = new THREE.MeshLambertMaterial({ map: ltex, alphaTest: 0.5, side: THREE.DoubleSide });
        this.litter = new THREE.InstancedMesh(lgeo, lmat, 1600); this.litter.count = 0;
        this.litter.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1600 * 3), 3);
        const twig = new THREE.CylinderGeometry(0.009, 0.016, 1, 4); twig.rotateZ(Math.PI / 2);
        this.twigs = new THREE.InstancedMesh(twig, MATS.get('bark'), 400); this.twigs.count = 0;
        const paper = new THREE.IcosahedronGeometry(1, 0), can = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10); can.rotateZ(Math.PI / 2);
        this.paper = new THREE.InstancedMesh(paper, MATS.get('paper'), 120); this.paper.count = 0;
        this.cans = new THREE.InstancedMesh(can, MATS.get('rust'), 120); this.cans.count = 0;
        for (const m of [this.litter, this.twigs, this.paper, this.cans]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.receiveShadow = true; grp.add(m); }
        this.twigs.castShadow = true;
      }
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
          const tint = hash(i, j, 7), v = 0.5 + tint * 0.22, gt = GR.tint || [1, 0.98, 0.9];
          gi.setColorAt(ng, col.setRGB(v * gt[0], v * gt[1], v * gt[2]));
          ng++;
        }
        if (d < 26 && hash(i, j, 8) < 0.07 + bare * 0.18 && np < 900) {
          const s = 0.03 + Math.pow(hash(i, j, 9), 3) * 0.16;
          m4.makeRotationY(hash(i, j, 10) * TAU); m4.scale(new THREE.Vector3(s, s, s * (0.7 + hash(i, j, 11) * 0.6))); m4.setPosition(x, y, z);
          pi.setMatrixAt(np++, m4);
        }
      }
      // the litter, the twigs, the junk (laid on the slope of the ground under them)
      if (this.litter) {
        const LI = this.litter, TW = this.twigs, PA = this.paper, CA = this.cans, LD = this.litterDens, q = new THREE.Quaternion(), qy = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), sc = new THREE.Vector3(), at = new THREE.Vector3();
        let nl = 0, nt = 0, npa = 0, nc = 0;
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const x = (i + hash(i, j, 21)) * cell, z = (j + hash(i, j, 22)) * cell, d = Math.hypot(x - cx, z - cz);
          if (d > 30) continue;
          const y = this.gridAt(this.grid.h, x, z), bare = this.gridAt(this.grid.bare, x, z);
          if (this.water != null && y < this.water + 0.05) continue;
          nrm.set(this.gridAt(this.grid.h, x - 0.7, z) - this.gridAt(this.grid.h, x + 0.7, z), 1.4, this.gridAt(this.grid.h, x, z - 0.7) - this.gridAt(this.grid.h, x, z + 0.7)).normalize();
          q.setFromUnitVectors(up, nrm);
          const patch = this.noise.noise(x * 0.11 + 30, z * 0.11) * 0.5 + 0.5;
          if (hash(i, j, 23) < LD[0] * (1 - bare * 0.6) * (0.4 + patch) && nl < 1600) {
            const k = 0.6 + hash(i, j, 24) * 0.9;
            qy.setFromAxisAngle(up, hash(i, j, 25) * TAU); m4.compose(at.set(x, y + 0.03, z), q.clone().multiply(qy), sc.set(k, 1, k)); LI.setMatrixAt(nl, m4);
            const v = 0.38 + hash(i, j, 26) * 0.3; LI.setColorAt(nl++, col.setRGB(v, v * 0.95, v * 0.9));
          }
          if (hash(i, j, 27) < LD[1] * (1 - bare * 0.5) && nt < 400) {
            const l = 0.3 + hash(i, j, 28) * 0.9; qy.setFromAxisAngle(up, hash(i, j, 29) * TAU);
            m4.compose(at.set(x, y + 0.02, z), q.clone().multiply(qy), sc.set(l, 1 + hash(i, j, 30), 1 + hash(i, j, 30))); TW.setMatrixAt(nt++, m4);
          }
          // (junk only where people went: the trail, the yards, round the ship)
          if (bare > 0.3 && hash(i, j, 31) < 0.035) {
            qy.setFromAxisAngle(up, hash(i, j, 32) * TAU);
            if (hash(i, j, 33) < 0.55 && npa < 120) { const k = 0.035 + hash(i, j, 34) * 0.04; m4.compose(at.set(x, y + k * 0.6, z), qy, sc.set(k, k * 0.8, k * 1.1)); PA.setMatrixAt(npa++, m4); }
            else if (nc < 120) { const k = hash(i, j, 35) < 0.5 ? 1 : 0.6; m4.compose(at.set(x, y + 0.03 * k, z), q.clone().multiply(qy), sc.set(1, k, 1)); CA.setMatrixAt(nc++, m4); }
          }
        }
        LI.count = nl; TW.count = nt; PA.count = npa; CA.count = nc;
        for (const m of [LI, TW, PA, CA]) m.instanceMatrix.needsUpdate = true; LI.instanceColor.needsUpdate = true;
      }
      gi.count = ng; pi.count = np;
      gi.instanceMatrix.needsUpdate = true; gi.instanceColor.needsUpdate = true; pi.instanceMatrix.needsUpdate = true;
    }
    // in the rain: standing water in the ruts and low spots of the trail and the yards, black and shining
    buildPuddles(grp) {
      if (!(this.weather === 'rain' || this.weather === 'storm') || this.biome.airless || this.water != null) return;
      const r = new RNG(this.seed + 808), m = MATS.get('puddle'), geo = new THREE.CircleGeometry(1, 14); geo.rotateX(-Math.PI / 2);
      for (let t = 0, n = 0; t < 400 && n < 34; t++) {
        const x = r.range(-150, 150), z = r.range(-150, 150);
        if (this.gridAt(this.grid.bare, x, z) < 0.45 || Math.hypot(x, z) < 15) continue;
        const h = this.height(x, z), lo = Math.min(this.height(x + 1.5, z), this.height(x - 1.5, z), this.height(x, z + 1.5), this.height(x, z - 1.5));
        if (h - lo > 0.12) continue;
        const pm = new THREE.Mesh(geo, m), s = r.range(0.4, 1.3); pm.scale.set(s * r.range(1, 1.8), 1, s); pm.rotation.y = r.range(0, TAU); pm.position.set(x, h + 0.025, z); pm.receiveShadow = true; grp.add(pm); n++;
      }
    }
    // a few crows wheeling slowly high over the place by day (none where there's no air, gone to roost by night)
    buildCrows(grp) {
      this.crows = [];
      if (this.biome.airless) return;
      const r = new RNG(this.seed + 909), mat = new THREE.MeshLambertMaterial({ color: 0x0c0c0e }), n = r.int(3, 6);
      const cx = this.center.x + r.range(-20, 20), cz = this.center.z + r.range(-20, 20);
      for (let i = 0; i < n; i++) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat); body.scale.set(0.8, 0.7, 2.2); g.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat); head.position.set(0, 0.03, -0.28); g.add(head);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), mat); beak.rotation.x = -Math.PI / 2; beak.position.set(0, 0.02, -0.4); g.add(beak);
        const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.22), mat); tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0, 0.36); g.add(tail);
        const wings = [-1, 1].map((sd) => { const w = new THREE.Group(); const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.24), mat); p.geometry.translate(sd * 0.31, 0, 0); p.rotation.x = -Math.PI / 2; w.add(p); g.add(w); return w; });
        for (const o of [body, head, beak, tail]) o.castShadow = true;
        tail.material.side = THREE.DoubleSide;
        g.scale.setScalar(1.4); grp.add(g);
        this.crows.push({ g, wings, cx, cz, rad: r.range(14, 30), alt: r.range(26, 44), sp: r.range(0.12, 0.22) * (r.chance(0.5) ? 1 : -1), ph: r.range(0, TAU), fl: r.range(0, 10) });
      }
      mat.side = THREE.DoubleSide;
    }
    // spores and ash drifting on the wind around the camera
    buildMotes(grp) {
      const n = 520, p = new Float32Array(n * 3), s = new Float32Array(n), rr = new RNG(this.seed + 61);
      for (let i = 0; i < n; i++) { p.set([rr.range(-14, 14), rr.range(-6, 10), rr.range(-14, 14)], i * 3); s[i] = rr.next(); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
      // what drifts depends on the world: spores, fireflies over the marsh, canyon dust, falling ash and embers
      // (wind, fall, wander, how many are embers): snow comes down steadily; embers ride up on the heat
      const M = { spores: [1, 0.05, 0, 0], fireflies: [0.25, 0.0, 1, 0], dust: [2.4, 0.0, 0, 0], ash: [0.45, 0.7, 0, 0.07], snow: [0.7, 1.5, 0, 0], pollen: [0.4, 0.02, 0.35, 0], embers: [0.8, -0.35, 0, 0.55] }[this.biome.motes] || [1, 0.05, 0, 0];
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
      // what the place was built from: brick mill, white-clad lab, rust-streaked corrugated pump house, black ruin; pale
      // blue cladding at the cold store, sage panels at the farm, dark old brick at the sanatorium, sea-green sheds at the
      // docks, white-painted steel at the refinery, soot-black firebrick at the foundry
      const conc = (w, h) => PL === 'mill' ? MATS.rep('brick', Math.max(1, w / 4), Math.max(1, h / 4))
        : PL === 'lab' ? MATS.rep('labPanel', Math.max(1, w / 6), Math.max(1, h / 6))
        : PL === 'pump' ? MATS.rep('corrugated', Math.max(1, w / 3), Math.max(1, h / 3), 0xa0704e)
        : PL === 'ruin' ? MATS.rep('bunker', Math.max(1, w / 7), Math.max(1, h / 7), 0x5a5550)
        : PL === 'depot' ? MATS.rep('corrugated', Math.max(1, w / 3), Math.max(1, h / 3), 0xa4b4c0)
        : PL === 'farm' ? MATS.rep('labPanel', Math.max(1, w / 6), Math.max(1, h / 6), 0xa8b896)
        : PL === 'asylum' ? MATS.rep('brick', Math.max(1, w / 4), Math.max(1, h / 4), 0x9a8a80)
        : PL === 'dock' ? MATS.rep('corrugated', Math.max(1, w / 3), Math.max(1, h / 3), 0x4f7f86)
        : PL === 'refinery' ? MATS.rep('painted', Math.max(1, w / 5), Math.max(1, h / 5), 0xdcd6c4)
        : PL === 'foundry' ? MATS.rep('brick', Math.max(1, w / 4), Math.max(1, h / 4), 0x4a3a36)
        : MATS.rep('bunker', Math.max(1, w / 7), Math.max(1, h / 7));
      const dark = MATS.get('darkmetal'), rust = MATS.get('rust');
      const snow = this.snowMat || (this.snowMat = new THREE.MeshStandardMaterial({ color: 0xe6edf4, roughness: 0.95 }));
      const roof = PL === 'lab' ? MATS.rep('labPanel', 6, 4, 0x9a9c96) : PL === 'mill' ? MATS.rep('corrugated', 12, 8, 0x4a4844) : PL === 'depot' ? snow
        : PL === 'farm' ? MATS.rep('corrugated', 12, 8, 0x56684a) : PL === 'asylum' ? MATS.rep('bunker', 8, 6, 0x3a3c44) : PL === 'dock' ? MATS.rep('rust', 8, 6) : dark;
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
      } else if (PL === 'depot') {
        // a radio mast on the tower, its light blinking through the snow
        this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 22, 8), dark), 35, 42 + 11, -27, b);
        for (const y of [46, 50.5, 55, 59.5]) this.place(grp, B(3.4 - (y - 46) * 0.14, 0.12, 0.12, dark), 35, y, -27, b);
        this.blinkLight(grp, b, 35, 64.3, -27, 0xff2010, 1.6);
      } else if (PL === 'farm') {
        // grain silos behind the hall: ribbed bins with conical caps, and the bucket elevator leg that fills them
        for (const [x, z, r0, h] of [[10, -45, 3.4, 26], [18.5, -45, 3.4, 26], [26.5, -44.5, 2.6, 20]]) {
          this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, h + 2, 24), MATS.rep('corrugated', 6, 3, 0xb8b8a8)), x, h / 2 - 1, z, b);
          this.place(grp, new THREE.Mesh(new THREE.ConeGeometry(r0 * 1.05, 2.6, 24), MATS.rep('corrugated', 6, 1, 0x8a8a7a)), x, h + 1.3, z, b);
          this.circLocal(b, x, z, r0 + 0.2);
        }
        this.place(grp, B(1.2, 31, 1.2, dark), 14.2, 14.5, -40.6, b);
        this.place(grp, B(9.5, 0.8, 0.8, dark), 14.2, 29.6, -43, b, 0, Math.PI / 2);
      } else if (PL === 'asylum') {
        // the bell tower: a steep slate spire, and a clock on every face, stopped
        this.place(grp, new THREE.Mesh(new THREE.ConeGeometry(10.4, 17, 4), MATS.rep('bunker', 4, 4, 0x34363e)), 35, 42 + 8.5, -27, b, 0, Math.PI / 4);
        const face = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.8 }), hand = MATS.get('dark');
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2, ox = Math.sin(a) * 7.03, oz = Math.cos(a) * 7.03;
          this.place(grp, new THREE.Mesh(new THREE.CircleGeometry(2.6, 28), face), 35 + ox, 36, -27 + oz, b, 0, a);
          this.place(grp, B(0.22, 1.9, 0.06), 35 + ox * 1.003, 36.8, -27 + oz * 1.003, b, 0, a, 0.5).material = hand;
          this.place(grp, B(0.26, 1.3, 0.06), 35 + ox * 1.006, 36, -27 + oz * 1.006, b, 0, a, 2.4).material = hand;
        }
        for (const [x, z] of [[-18, -10], [-18, -30], [14, -10], [14, -30]]) this.place(grp, B(2.2, 5, 1.4, MATS.rep('brick', 1, 1, 0x7a6a62)), x, 31, z, b);
      } else if (PL === 'dock') {
        // the harbour-master's cab on the tower, glazed all round, its port and starboard lights
        const gl = new THREE.MeshStandardMaterial({ map: TEX.get('dirtGlass'), roughness: 0.2, metalness: 0.5 });
        this.place(grp, B(15.4, 3.6, 15.4, gl), 35, 43.8, -27, b); this.place(grp, B(16.4, 0.7, 16.4, dark), 35, 45.9, -27, b);
        this.blinkLight(grp, b, 28.2, 46.6, -20.2, 0xff2010, 2.4); this.blinkLight(grp, b, 41.8, 46.6, -20.2, 0x20ff60, 2.4);
      } else if (PL === 'refinery') {
        // the flare stack, off behind the hall, still burning off the gas; distillation columns on the roof
        this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 58, 12), MATS.rep('painted', 1, 8, 0xb8b0a0)), 24, 29, -46, b); this.circLocal(b, 24, -46, 1.4);
        // (its guy wires, out to the ground on four sides)
        for (let k = 0; k < 4; k++) this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 30, 4), dark), 24 + Math.cos(k * 1.57) * 3, 15, -46 + Math.sin(k * 1.57) * 3, b, -Math.sin(k * 1.57) * 0.2, 0, Math.cos(k * 1.57) * 0.2);
        this.flame(grp, b, 24, 59.2, -46, 1.6);
        for (const [x, z, h] of [[-15, -32, 24], [-8.5, -32, 30]]) {
          this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, h, 16), MATS.rep('painted', 2, 6, 0xd0c8b4)), x, 25.2 + h / 2, z, b);
          for (let y = 25.2 + 5; y < 25.2 + h; y += 6) this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.15, 16), MATS.rep('grate', 3, 3)), x, y, z, b);
        }
      } else if (PL === 'foundry') {
        // three great stacks, their mouths still glowing from the furnaces under them
        const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.7, 0.18) });
        for (const [x, z, rad] of [[10, -33, 3.2], [18.5, -35, 3.2], [26.5, -31, 2.8]]) {
          this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.85, rad, 44, 18), MATS.rep('brick', 3, 8, 0x3a2c28)), x, 24 + 22, z, b);
          this.place(grp, new THREE.Mesh(new THREE.TorusGeometry(rad * 0.8, 0.35, 6, 18), glow), x, 68.2, z, b, Math.PI / 2);
          this.flame(grp, b, x, 68.6, z, 0.9);
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
      } else if (PL === 'depot') {
        // the refrigeration plant's ammonia tanks, lying on their saddles, frosted white
        for (const [x, z] of [[-33, 7], [-44, 4]]) {
          const tm = MATS.rep('painted', 3, 1, 0xdfe6ea);
          this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 10, 20), tm), x, 3.6, z, b, Math.PI / 2);
          for (const s2 of [-1, 1]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 10), tm); cap.scale.set(1, 1, 0.45); this.place(grp, cap, x, 3.6, z + s2 * 5, b); this.place(grp, B(4.4, 1.6, 0.8, dark), x, 0.8, z + s2 * 3.4, b); }
          this.place(grp, new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 11), snow), x, 6.1, z, b);
          this.obbLocal(b, x, z, 2.5, 6.2);
        }
      } else if (PL === 'farm') {
        // two water tanks for the irrigation, green-painted, with their ladders
        for (const [x, z] of [[-33, 7], [-44, 4]]) {
          this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 9, 24), MATS.rep('painted', 3, 2, 0x56784a)), x, 4.5 - 0.5, z, b);
          this.place(grp, new THREE.Mesh(new THREE.ConeGeometry(4, 1.6, 24), MATS.rep('painted', 3, 1, 0x46603c)), x, 8.8, z, b);
          this.place(grp, B(0.5, 9, 0.1, dark), x, 4.5, z + 3.85, b);
          this.circLocal(b, x, z, 4);
        }
      } else if (PL === 'asylum') {
        // the chapel: a small gabled hall with a bell-cote over the door, beside the graveyard
        const cx = -40, cz = 8;
        this.place(grp, B(10, 7, 14, conc(10, 7)), cx, 3.5, cz, b); this.obbLocal(b, cx, cz, 5.2, 7.2);
        this.place(grp, this.gable(11, 4.6, 14.8, roof), cx, 7, cz, b);
        this.place(grp, B(1.6, 2.4, 1.6, conc(2, 2)), cx, 12.4, cz + 6.4, b); this.place(grp, new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 4), roof), cx, 14.7, cz + 6.4, b, 0, Math.PI / 4);
        this.place(grp, B(1.8, 3.2, 0.1, MATS.get('wood')), cx, 1.6, cz + 7.03, b);
        for (const z of [cz - 4, cz, cz + 4]) for (const sx of [-1, 1]) this.place(grp, this.plane(1.1, 2.6, new THREE.MeshStandardMaterial({ map: TEX.get('dirtGlass'), roughness: 0.2, metalness: 0.5 })), cx + sx * 5.02, 3.8, z, b, 0, sx * Math.PI / 2);
      } else if (PL === 'refinery') {
        // spheres for the gas, up on their legs, a walkway round each one's middle
        for (const [x, z] of [[-33, 7], [-44, 4]]) {
          this.place(grp, new THREE.Mesh(new THREE.SphereGeometry(4.4, 24, 16), MATS.rep('painted', 3, 2, 0xe8e2d0)), x, 7.4, z, b);
          this.place(grp, new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.12, 6, 28), dark), x, 7.4, z, b, Math.PI / 2);
          for (let k = 0; k < 8; k++) { const a = k * TAU / 8, lx = x + Math.cos(a) * 3.9, lz = z + Math.sin(a) * 3.9; this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7.4, 6), dark), lx, 3.7, lz, b); this.circLocal(b, lx, lz, 0.3); }
        }
      } else if (PL === 'foundry') {
        // the blast furnace: a tapering stack of riveted plate, its tap hole glowing at the foot
        const cx = -36, cz = 6;
        this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.6, 24, 18), MATS.rep('rust', 3, 6, 0x5a4038)), cx, 11, cz, b); this.circLocal(b, cx, cz, 4.8);
        this.place(grp, new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.6, 8, 24), dark), cx, 16, cz, b, Math.PI / 2);
        this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 14, 10), MATS.rep('rust', 1, 3)), cx + 6, 16, cz - 4, b, 0, 0, 0.5);
        this.place(grp, B(1.4, 1.2, 0.3, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 0.2) })), cx, 1.2, cz + 4.4, b);
        const tw = this.toWorld(b, cx, cz + 5.5); this.lights.push({ x: tw.x, y: b.y + 1.5, z: tw.z, color: 0xff6a20, power: 1.8, state: 'flicker', phase: 2, zone: 'out', range: 14, lit: 1 });
      } else {
        for (const [x, z] of [[-33, 7], [-44, 4]]) {
          const tk = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 15, 24), MATS.rep('rust', 3, 2, PL === 'ruin' ? 0x3a3230 : PL === 'dock' ? 0x6a8a84 : undefined)); this.place(grp, tk, x, 7.5 - 1, z, b);
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
      const SC = { lab: ['#e2e4de', '#1e3a2e'], ruin: ['#141110', '#6a1a12'], depot: ['#dfe6ea', '#1a3a5a'], farm: ['#2e4a26', '#e8e0b0'], asylum: ['#1a1614', '#c8b88a'], dock: ['#1e3a40', '#e8e8d8'], refinery: ['#c8a028', '#1a1a1a'], foundry: ['#141010', '#e86a20'] }[PL] || ['#1d1c19', '#cfc6ae'];
      this.place(grp, this.plane(26, 3.6, signMat(this.biome.sign, { w: 1024, h: 140, size: 96, bg: SC[0], fg: SC[1] })), 0, 19.8, -0.96, b);
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
      // (a few still lit; at the foundry, half of them glowing with the furnaces)
      const winLit = new THREE.MeshBasicMaterial({ color: PL === 'foundry' ? 0x9a3a08 : 0x5a3010 });
      for (const y of [12.5, 16]) for (let x = -25.5; x <= 25.5; x += 4.5) {
        if (Math.abs(x) < 4) continue;
        this.place(grp, this.plane(2.4, 1.7, PL !== 'ruin' && rr.chance(PL === 'foundry' ? 0.5 : 0.08) ? winLit : winDark), x, y, -0.95, b);
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
      } else if (PL === 'depot') {
        // the cold store: refrigeration units on the roof, icicles all along the eaves, snow drifted against the walls
        for (const [x, z] of [[-18, -12], [-6, -12], [6, -30], [18, -30]]) {
          this.place(grp, B(5, 1.8, 4, MATS.rep('metal', 2, 1, 0xb8c4cc)), x, 26.1, z, b);
          for (const dx of [-1.2, 1.2]) this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.25, 16), dark), x + dx, 27.1, z, b);
        }
        const ice = new THREE.MeshStandardMaterial({ color: 0xdcecff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }), parts = [];
        for (let x = -27.5; x <= 27.5; x += rr.range(0.5, 1.3)) { const l = rr.range(0.4, 2.2); const g = new THREE.ConeGeometry(rr.range(0.08, 0.18), l, 5); g.rotateX(Math.PI); parts.push({ geo: g, matrix: mat(x, 24 - l / 2, -0.8) }); }
        if (parts.length) this.place(grp, new THREE.Mesh(mergeGeoList(parts), ice), 0, 0, 0, b);
        for (const x of [-25, -10.5, 10.5, 25, -40, -33]) { const d = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), this.snowMat); d.scale.set(rr.range(3, 5), rr.range(0.8, 1.6), rr.range(1.4, 2.2)); this.place(grp, d, x, 0, x < -28 ? 0 : -0.2, b); }
      } else if (PL === 'farm') {
        // glasshouses on the low wing's roof (glass and white ribs, half of it fogged), and the farm going to seed: vines
        // climbing the walls
        const gl = MATS.get('glass'), rib = MATS.rep('painted', 1, 1, 0xd8dcd0);
        for (const x of [-46, -34]) {
          const v = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 28, 20, 1, true, -Math.PI / 2, Math.PI), gl); this.place(grp, v, x, 13.8, -16, b, -Math.PI / 2, 0, 0).renderOrder = 3;
          for (let z = -29; z <= -3; z += 3.25) this.place(grp, new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.1, 4, 20, Math.PI), rib), x, 13.8, z, b);
        }
        const vm = MATS.get('vine');
        for (let i = 0; i < 16; i++) { const x = rr.range(-27, 27), h = rr.range(5, 15); if (Math.abs(x) < 6) continue; this.place(grp, this.plane(rr.range(2, 4), h, vm), x, 24.6 - h / 2, -0.9, b); }
        for (let i = 0; i < 6; i++) { const h = rr.range(4, 10); this.place(grp, this.plane(rr.range(2, 3.5), h, vm), 28.05, 24 - h / 2, rr.range(-36, -4), b, 0, Math.PI / 2); }
      } else if (PL === 'asylum') {
        // pitched slate roofs on the old blocks, and the graveyard by the chapel: rows of headstones and crosses, leaning
        const sl = MATS.rep('bunker', 8, 6, 0x3a3c44);
        this.place(grp, this.gable(39.4, 10, 57.4, sl), 0, 25.2, -20, b, 0, Math.PI / 2);
        this.place(grp, this.gable(25, 6, 31, sl), -40, 13.4, -16, b);
        const stone = MATS.rep('bunker', 1, 1, 0x8a8a84);
        for (let row = 0; row < 4; row++) for (let k = 0; k < 6; k++) {
          const x = -27 + k * 2.4 + rr.range(-0.3, 0.3), z = 3 + row * 3 + rr.range(-0.3, 0.3), w = this.toWorld(b, x, z);
          if (this.pathInfo(w.x, w.z).d < 3.2 || rr.chance(0.15)) continue;
          const lean = rr.range(-0.18, 0.18), ry = rr.range(-0.15, 0.15);
          if (rr.chance(0.3)) { this.place(grp, B(0.18, 1.4, 0.16, stone), x, 0.6, z, b, lean, ry); this.place(grp, B(0.8, 0.18, 0.16, stone), x, 1.0, z, b, lean, ry); }
          else { this.place(grp, B(0.75, 0.95, 0.18, stone), x, 0.45, z, b, lean, ry); this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.375, 0.375, 0.18, 12, 1, false, 0, Math.PI), stone), x, 0.92, z, b, Math.PI / 2 + lean, ry, Math.PI / 2); }
          this.obbLocal(b, x, z, 0.4, 0.15, ry);
        }
      } else if (PL === 'dock') {
        // a gantry crane straddling the stacked containers, and a ship's hull run aground beyond the yard
        const yl = MATS.rep('painted', 1, 4, 0xc8a020);
        for (const [x, z] of [[20, 6], [34, 6], [20, 21], [34, 21]]) { this.place(grp, B(0.9, 18, 0.9, yl), x, 9, z, b); this.circLocal(b, x, z, 0.6); }
        for (const z of [6, 21]) this.place(grp, B(15.6, 1.3, 1.1, yl), 27, 18.5, z, b);
        for (const x of [20, 34]) this.place(grp, B(1.1, 1.3, 16.2, yl), x, 18.5, 13.5, b);
        this.place(grp, B(3, 2.2, 3.4, yl), 25, 20.4, 13.5, b);
        this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 10, 4), dark), 25, 14, 13.5, b);
        this.place(grp, B(1, 0.8, 0.6, dark), 25, 8.8, 13.5, b);
        const hp = this.toWorld(b, -52, 24);
        if (Math.hypot(hp.x - this.fire.x, hp.z - this.fire.z) > 28) {
          const hull = MATS.rep('rust', 6, 2, 0x6a5a50);
          this.place(grp, B(30, 8, 9, hull), -52, 2.2, 24, b, 0.04, 0.6, 0.16);
          const bow = new THREE.Mesh(new THREE.ConeGeometry(6.4, 10, 4), hull); bow.scale.set(0.7, 1, 1);
          this.place(grp, bow, -52 + Math.cos(0.6) * 19.5, 2.6, 24 - Math.sin(0.6) * 19.5, b, 0.04, 0.6 + Math.PI / 4, 0.16 - Math.PI / 2);
          this.place(grp, B(8, 5, 6, MATS.rep('rust', 2, 1, 0x8a8a84)), -56, 8, 26, b, 0.04, 0.6, 0.16);
          this.obbLocal(b, -52, 24, 15, 4.5, 0.6);
        }
      } else if (PL === 'refinery') {
        // a pipe rack out from the hall over to the gas spheres: frames, and a bundle of lines along the top
        for (const x of [-20, -27, -37]) { this.place(grp, B(0.4, 13.6, 0.4, dark), x, 6.8, 0.6, b); this.place(grp, B(0.4, 13.6, 0.4, dark), x, 6.8, 2.6, b); this.place(grp, B(0.4, 0.4, 2.4, dark), x, 13.4, 1.6, b); this.obbLocal(b, x, 1.6, 0.3, 1.2); }
        for (const [z, r0, c] of [[1.0, 0.35, 0xb8b0a0], [1.7, 0.45, 0xc8a028], [2.3, 0.3, 0x9a6a4a]]) this.place(grp, new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, 22, 10), MATS.rep('painted', 4, 1, c)), -30, 13.8 + r0, z, b, 0, 0, Math.PI / 2);
      } else if (PL === 'foundry') {
        // a channel of slag still glowing as it runs off from the furnace to the heap
        const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.55, 0.12) });
        const pts = [[-36, 10], [-39, 14], [-44, 16], [-49, 15]];
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], l = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
          const y = (x, z) => { const w = this.toWorld(b, x, z); return this.height(w.x, w.z) - b.y; };
          this.place(grp, B(l, 0.1, 0.8, hot), (x0 + x1) / 2, y((x0 + x1) / 2, (z0 + z1) / 2) + 0.06, (z0 + z1) / 2, b, 0, ry);
          this.place(grp, B(l, 0.4, 0.3, dark), (x0 + x1) / 2, y((x0 + x1) / 2, (z0 + z1) / 2) + 0.1, (z0 + z1) / 2 + 0.55, b, 0, ry);
        }
        const mw = this.toWorld(b, -43, 15); this.lights.push({ x: mw.x, y: b.y + 1.2, z: mw.z, color: 0xff5a18, power: 1.6, state: 'flicker', phase: 5, zone: 'out', range: 14, lit: 1 });
        const heap = new THREE.Mesh(new THREE.ConeGeometry(7, 6, 12), MATS.rep('rock', 3, 2, 0x2a2624)); this.place(grp, heap, -52, 2.5, 17, b); this.circLocal(b, -52, 17, 6.5);
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
    // a pitched roof: a triangular prism w across, h high, l long (its ridge along z)
    gable(w, h, l, m) {
      const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: l, bevelEnabled: false }); g.translate(0, 0, -l / 2);
      return new THREE.Mesh(g, m);
    }
    // a flame burning at the top of a stack: a flickering tongue of fire, a glow round it, and its light on the ground
    flame(grp, b, lx, ly, lz, s) {
      const w = this.toWorld(b, lx, lz), y = b.y + ly;
      const tongue = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: 0xff5a18, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      tongue.position.set(w.x, y + 2.2 * s, w.z); halo.position.set(w.x, y + 1.5 * s, w.z); halo.scale.set(16 * s, 16 * s, 1); grp.add(halo, tongue);
      (this.flames || (this.flames = [])).push({ sp: tongue, s, ph: lx * 1.7 + lz });
      this.lights.push({ x: w.x, y: y + 2, z: w.z, color: 0xff8a30, power: 2.2 * s, state: 'flicker', phase: lx, zone: 'out', range: 30 * s, lit: 1 });
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
      const chrome = burnt ? rust : MATS.get('hardware');
      const add = (geo, m, px, py, pz, rx = 0, ryy = 0, rz = 0) => { if (burnt && m === glass) return null; const me = new THREE.Mesh(geo, m); me.position.set(px, py, pz); me.rotation.set(rx, ryy, rz); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
      const Bx = (w, h, d) => new THREE.BoxGeometry(w, h, d), Cy = (r, h, s = 16) => new THREE.CylinderGeometry(r, r, h, s);
      const pm = () => (rr.chance(burnt ? 0.5 : 0.25) ? rust : paint);
      // (some windows long since gone)
      const pane = () => (rr.chance(0.3) ? null : glass);
      if (burnt) g.position.y -= 0.12;
      add(Bx(1.7, 0.25, 4.9), dark, 0, 0.55, 0);
      // lower body / rocker panels: everything above sits directly on this, no daylight between parts
      add(Bx(1.92, 0.42, 5.3), paint, 0, 0.88, 0.08);
      const van = rr.chance(VB.van), front = van ? 2.36 : 2.76, back = -2.6;
      // a door hanging open on one side, now and then (its window gone with it)
      const open = !van && rr.chance(0.2) ? (rr.chance(0.5) ? 1 : -1) : 0;
      if (van) {
        add(Bx(1.95, 1.9, 3.5), pm(), 0, 1.65, -0.65);
        add(Bx(1.95, 1.15, 1.25), pm(), 0, 1.22, 1.72);
        { const p = pane(); if (p) add(Bx(1.85, 0.65, 0.05), p, 0, 1.98, 1.25, -0.5); }
        for (const s of [-1, 1]) { const p = pane(); if (p) add(Bx(0.03, 0.5, 0.8), p, s * 0.985, 1.95, 0.75); }
        add(Bx(1.6, 0.35, 0.05), dark, 0, 0.98, 2.36);
        // (a sliding side door's seams, the rear doors' split, a roof rack on some)
        for (const s of [-1, 1]) { add(Bx(0.012, 1.3, 0.02), dark, s * 0.98, 1.45, -0.2); add(Bx(0.012, 1.3, 0.02), dark, s * 0.98, 1.45, 0.75); add(Bx(0.02, 0.05, 0.16), chrome, s * 0.985, 1.25, 0.6); }
        add(Bx(0.02, 1.5, 0.012), dark, 0, 1.5, -2.405);
        if (rr.chance(0.5)) { for (const s of [-1, 1]) add(Bx(0.04, 0.06, 3.0), steel, s * 0.85, 2.64, -0.65); for (let i = 0; i < 4; i++) add(Bx(1.7, 0.04, 0.05), steel, 0, 2.66, -1.9 + i * 0.85); }
      } else {
        add(Bx(1.9, 0.95, 1.5), pm(), 0, 1.38, 0.55);
        add(Bx(1.8, 0.08, 1.15), paint, 0, 1.89, 0.45);
        { const p = pane(); if (p) add(Bx(1.7, 0.66, 0.04), p, 0, 1.56, 1.3, -0.42); }
        for (const s of [-1, 1]) { const p = s === open ? null : pane(); if (p) add(Bx(0.03, 0.42, 0.85), p, s * 0.955, 1.6, 0.45); }
        add(Bx(1.85, 0.5, 1.45), pm(), 0, 1.08, 2.0, 0.05);
        add(Bx(1.6, 0.4, 0.05), dark, 0, 1.0, 2.73);
        add(Bx(1.9, 0.1, 2.1), paint, 0, 0.92, -1.3);
        for (const s of [-1, 1]) add(Bx(0.08, 0.5, 2.1), pm(), s * 0.91, 1.2, -1.3);
        if (rr.chance(0.5)) add(Bx(1.9, 0.5, 0.08), paint, 0, 1.2, -2.35); else add(Bx(1.9, 0.08, 0.5), paint, 0, 0.72, -2.6, 0.2);
        // the door seams and handles down each side (and the door that's hanging open)
        for (const s of [-1, 1]) {
          for (const sz of [1.25, -0.2]) add(Bx(0.012, 0.85, 0.02), dark, s * 0.962, 1.2, sz);
          add(Bx(0.02, 0.04, 0.14), chrome, s * 0.965, 1.22, 0.05);
          if (s === open) { const d = add(Bx(0.06, 0.9, 1.4), paint, 0, 0, 0); d.geometry.translate(0, 0, -0.7); d.position.set(s * 0.97, 1.25, 1.25); d.rotation.y = -s * rr.range(0.7, 1.2); }
        }
        // mirrors on stalks, the wipers, an aerial on some
        for (const s of [-1, 1]) { add(Bx(0.18, 0.03, 0.03), dark, s * 1.02, 1.35, 1.22); add(Bx(0.05, 0.12, 0.16), dark, s * 1.1, 1.38, 1.2); }
        for (const s of [-1, 1]) add(Bx(0.55, 0.02, 0.03), dark, s * 0.38, 1.25, 1.52, -0.42, 0, s * 0.15);
        if (rr.chance(0.4)) add(Cy(0.005, 0.8, 4), steel, 0.8, 1.6, 2.2, 0.15, 0, 0);
      }
      // round headlights in chrome rims (some smashed), a grille between them, the tail lights, the plate
      const lamp = new THREE.MeshBasicMaterial({ color: 0x40382a }), tail = new THREE.MeshStandardMaterial({ color: 0x5a1210, roughness: 0.4 });
      const hy = van ? 1.25 : 1.1;
      for (const s of [-1, 1]) {
        add(Cy(0.12, 0.05), chrome, s * 0.62, hy, front + 0.01, Math.PI / 2);
        if (!rr.chance(0.3)) add(Cy(0.095, 0.02), lamp, s * 0.62, hy, front + 0.035, Math.PI / 2); else add(Cy(0.095, 0.02), dark, s * 0.62, hy, front + 0.02, Math.PI / 2);
        add(Bx(0.26, 0.12, 0.04), tail, s * 0.72, 1.0, back);
      }
      add(Bx(0.85, 0.24, 0.04), dark, 0, hy, front + 0.01);
      for (let i = 0; i < 3; i++) add(Bx(0.8, 0.025, 0.02), chrome, 0, hy - 0.07 + i * 0.07, front + 0.035);
      {
        const pl = new THREE.MeshStandardMaterial({ map: TEX.sign('MS ' + rr.int(10, 99) + ' ' + String.fromCharCode(65 + rr.int(0, 25), 65 + rr.int(0, 25), 65 + rr.int(0, 25)), { w: 128, h: 40, size: 22, bold: true, bg: '#d8d0b0', fg: '#1a1a14' }), roughness: 0.6 });
        add(Bx(0.42, 0.12, 0.01), pl, 0, 0.98, back - 0.025).rotation.y = Math.PI;
      }
      add(Bx(2.0, 0.18, 0.15), steel, 0, 0.72, 2.82); add(Bx(2.0, 0.18, 0.15), steel, 0, 0.72, -2.64);
      // The wheels: a tyre with a steel rim, its lug nuts, the odd hubcap; now and then a flat. A wheel that's gone is
      // still plain to see: either the corner's been propped on a block, the bare brake drum showing, with the tyre lying
      // in the grass nearby; or the car has dropped onto the drum, that corner down in the dirt.
      const loose = [];
      let dropX = 0, dropZ = 0;
      for (const [wx, wz] of [[-0.92, 1.7], [0.92, 1.7], [-0.92, -1.55], [0.92, -1.55]]) {
        const s = Math.sign(wx);
        // (the dark of the wheel arch over it)
        add(Bx(0.03, 0.26, 1.0), dark, wx * 1.045, 0.86, wz);
        add(Bx(0.36, 0.1, 1.05), paint, wx * 1.02, 0.92, wz);
        if (burnt) { add(Cy(0.25, 0.2, 12), rust, wx * 0.95, 0.27, wz, 0, 0, Math.PI / 2); continue; }
        if (rr.chance(0.14)) {
          add(Cy(0.2, 0.16, 14), dark, wx * 0.95, 0.42, wz, 0, 0, Math.PI / 2);
          for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; add(Cy(0.012, 0.05, 6), steel, wx * 0.95 + s * 0.09, 0.42 + Math.cos(a) * 0.1, wz + Math.sin(a) * 0.1, 0, 0, Math.PI / 2); }
          if (rr.chance(0.55)) add(Bx(0.32, 0.22, 0.38), this.rockMat || dark, wx * 0.95, 0.11, wz);
          else { dropX += s; dropZ += Math.sign(wz); }
          if (rr.chance(0.75)) loose.push({ x: wx * 0.95 + s * rr.range(1.3, 2.4), z: wz + rr.range(-1.2, 1.2), lean: rr.chance(0.3) });
          continue;
        }
        const flat = rr.chance(0.15), t = add(Cy(0.42, 0.26, 18), rubber, wx, flat ? 0.37 : 0.42, wz, 0, 0, Math.PI / 2);
        if (flat) { t.scale.set(0.82, 1, 1.06); g.rotation.z += s * 0.012; }
        add(Cy(0.26, 0.27, 14), steel, wx, flat ? 0.37 : 0.42, wz, 0, 0, Math.PI / 2);
        add(Cy(0.09, 0.28, 10), dark, wx, flat ? 0.37 : 0.42, wz, 0, 0, Math.PI / 2);
        if (rr.chance(0.4)) add(Cy(0.22, 0.02, 16), chrome, wx + s * 0.14, flat ? 0.37 : 0.42, wz, 0, 0, Math.PI / 2);
        else for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; add(Cy(0.016, 0.03, 6), chrome, wx + s * 0.14, (flat ? 0.37 : 0.42) + Math.cos(a) * 0.12, wz + Math.sin(a) * 0.12, 0, 0, Math.PI / 2); }
      }
      // (a corner down on its drum: the whole car tips that way)
      if (dropX || dropZ) { g.rotation.z += dropX * 0.12; g.rotation.x -= dropZ * 0.05; g.position.y -= 0.06; }
      grp.add(g);
      this.addObb(x, z, 1.05, 2.85, ry);
      // the tyres that came off, in the grass beside it (one leaning on the car)
      g.updateMatrixWorld(true);
      for (const l of loose) {
        const w = g.localToWorld(new THREE.Vector3(l.x, 0, l.z)), tg = new THREE.Group(), h = this.height(w.x, w.z);
        const tyre = new THREE.Mesh(Cy(0.42, 0.26, 18), rubber), rim = new THREE.Mesh(Cy(0.26, 0.27, 14), steel), hub = new THREE.Mesh(Cy(0.09, 0.28, 10), dark);
        for (const m of [tyre, rim, hub]) { m.castShadow = m.receiveShadow = true; tg.add(m); }
        if (l.lean) { tg.position.set(w.x, h + 0.41, w.z); tg.rotation.set(0, ry + rr.range(-0.3, 0.3), Math.PI / 2 - 0.35, 'YXZ'); }
        else { tg.position.set(w.x, h + 0.12, w.z); tg.rotation.set(rr.range(-0.08, 0.08), rr.range(0, TAU), rr.range(-0.08, 0.08)); }
        grp.add(tg);
      }
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
          sunDir: U(new THREE.Vector3(0, 1, 0)), sunCol: U(new THREE.Color(0, 0, 0)), uCore: U(new THREE.Color(0, 0, 0)), moonDir: U(new THREE.Vector3(-0.5, 0.6, -0.6).normalize()),
          cloudLit: U(new THREE.Color(0.6, 0.6, 0.6)), cloudDark: U(new THREE.Color(0.3, 0.3, 0.3)),
          uTime: U(0), cover: U(0.5), haze: U(0.5), night: U(0), seed: U((this.seed % 1000) * 0.137), inCloud: U(0),
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          uniform vec3 top, hor, fogCol, scatter, sunDir, sunCol, uCore, moonDir, cloudLit, cloudDark;
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
            // (with no air to soften it, the sun is a small white disc as blinding as it is from space: bright enough for
            // the glare round it, which shows only while the disc itself can be seen)
            c += uCore * smoothstep(0.99972, 0.99982, sd);
            // a thin high layer of wisps, streaked out and drifting its own way (the deck below passes in front of it)
            if (h > 0.0) {
              vec2 q2 = d.xz / (h + 0.35) * 0.55 + vec2(-uTime * 0.0012, uTime * 0.0004) + seed * 1.7;
              float w2 = fbm(q2 * vec2(1.0, 3.2) + 11.0);
              float c2 = smoothstep(1.0 - cover * 0.75, 1.15 - cover * 0.75, w2) * smoothstep(0.02, 0.25, h) * 0.55;
              c = mix(c, mix(cloudLit, vec3(1.0), 0.15) * 1.05 + sunCol * pow(sd, 6.0) * 0.3, c2);
            }
            // drifting cloud deck, lit from the sun's side, darker underneath
            if (h > -0.02) {
              vec2 q = d.xz / (max(h, 0.0) + 0.1) * 1.4 + vec2(uTime * 0.002, uTime * 0.0008) + seed;
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
      // (the sky draws first, at the back: the dome, the stars, then the bodies in it; so smoke, dust and everything else
      // down here, drawn after, passes in front of them, while a world with no air between blots out the stars behind it)
      this.stars = new THREE.Points(sg, this.starMat); this.stars.renderOrder = -9.5; grp.add(this.stars);
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
      this.bodies = []; this.eclipsers = []; this.ringU = null; this.bodiesG = new THREE.Group(); this.worldG = new THREE.Group(); this.sky.add(this.bodiesG, this.worldG);
      // (where they start in the sky is this landing's; they drift round from there by the site's own clock, so every
      // crewmate sees the same sky, and the same eclipse at the same moment)
      this.skyRot0 = new RNG(this.seed + 77).range(0, TAU);
      // (seen from a moon, the world it circles holds its place for the landing: mostly off in the north, where the sun
      // never goes; now and then right across the sun's road, and then it swallows the sun for a while)
      { const rw = new RNG(this.seed + 91); this.worldRot = rw.next() < 0.3 ? rw.range(0, TAU) : rw.range(-0.8, 0.8); this.worldG.rotation.y = this.worldRot; }
      if (list.length) this.moon.visible = false;
      const rr = new RNG(this.seed + 31);
      // (drawn at the very back of the depth range, so they're behind everything on the ground however big they are;
      // under a black airless sky they're solid, their night side blotting out the stars)
      const far = 'gl_Position.z = gl_Position.w * 0.99995;';
      // (so which is in front of which goes by how far off each really is: anything beyond the world is drawn before
      // it, and hidden behind it where they cross; anything this side of it after it and its clouds, over them. Left
      // to the usual sort they'd swap places as you turned your head, and the world would swallow the rock)
      const wd0 = (list.find((b) => b.kind === 'planet') || {}).dist, order = (b) => b.dist == null ? -9 : (wd0 != null && b.dist < wd0 ? -6.5 : -12) - b.dist * 1e-4;
      let rf = null;
      for (let b of list) {
        // (seen from a ringed world's moon or rock, the other one is out in the rings' plane, where it really is)
        if (b.place && rf) b = Object.assign({}, b, rf.place(b.place));
        // (a moon or rock's orbit brings it in close some days and takes it far out on others, round the sky as well)
        // (today's sky comes already worked out from where everything really is: see G.skyToday)
        const near = b.fixed || b.kind === 'planet' ? 1 : 0.6 + rr.next() * 0.9, swing = b.fixed || b.kind === 'planet' ? 0 : rr.range(-0.5, 0.5);
        const r = D * Math.sin(Math.min(b.giant ? 0.97 : 0.78, b.r / near)), geo = b.kind === 'rock' ? new THREE.IcosahedronGeometry(1, 3) : new THREE.SphereGeometry(1, 64, 32);
        if (b.kind === 'rock') {
          // (a lumpy, broken potato of a thing)
          const p = geo.attributes.position, nz = new Noise2D(7 + rr.next() * 100);
          for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + nz.fbm(x * 1.6 + 3, y * 1.6 + z * 1.2, 3) * 0.55; p.setXYZ(i, x * k * 1.25, y * k * 0.8, z * k); }
          geo.computeVertexNormals();
        }
        // (an airless moon or rock is harsh: its craters' slopes catch the light or fall into shadow, and the line
        // between its day and night is a knife edge; the world, with its air, is softer)
        const harsh = b.kind === 'planet' ? 0 : 1;
        // (a ringed world: its rings, laid out round it as they really are from here; see ringFrame)
        const RU = b.ringSys ? (rf = this.ringFrame(b, D)).U : null, RG = RU ? Rings.GLSL : '';
        const mat = new THREE.ShaderMaterial({
          uniforms: Object.assign({ map: { value: TEX.get(b.kind === 'planet' ? b.giant || 'planet' : 'moonmap') }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uCol: { value: new THREE.Color(b.tint) }, uAtmo: { value: new THREE.Color(b.atmo != null ? b.atmo : 0x000000) }, uVis: { value: 1 }, uHarsh: { value: harsh }, uBump: { value: r * 0.35 * harsh } }, RU || {}),
          vertexShader: `varying vec3 vN; varying vec2 vUv; varying vec3 vV; varying vec3 vW;
            void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vV = cameraPosition - wp.xyz; vW = wp.xyz;
              gl_Position = projectionMatrix * viewMatrix * wp; ${far} }`,
          fragmentShader: `${RG} uniform sampler2D map; uniform vec3 uSun, uCol, uAtmo; uniform float uVis, uHarsh, uBump; varying vec3 vN; varying vec2 vUv; varying vec3 vV; varying vec3 vW;
            void main(){ vec3 n = normalize(vN); float l = dot(n, uSun);
              // (the rings' shadow lying across it in bands)
              ${RU ? 'l *= ringThrough(vW - cameraPosition, uSun);' : ''}
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
        const m = new THREE.Mesh(geo, mat), el = b.el, az = b.az + swing;
        m.position.set(Math.cos(az) * Math.cos(el) * D, Math.sin(el) * D, Math.sin(az) * Math.cos(el) * D); m.scale.setScalar(r);
        m.rotation.set(rr.range(-0.4, 0.4), rr.range(0, TAU), rr.range(-0.3, 0.3)); m.renderOrder = b.kind === 'planet' ? -9 : order(b); m.frustumCulled = false;
        // (seen from a moon, the other one goes in the world's frame: where it is is reckoned from where the world is)
        const G0 = b.kind === 'planet' || b.withWorld ? this.worldG : this.bodiesG;
        G0.add(m); this.bodies.push(m); this.eclipsers.push({ m, kind: b.kind, tint: b.tint, atmo: b.atmo, world: G0 === this.worldG });
        if (b.kind !== 'planet') continue;
        // the world overhead: its weather turning slowly over the day side (a giant's banded cloud is its weather), and
        // (Nadir, the Hollow, Halcyon) its rings
        if (!b.giant) {
        const cl = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 32), new THREE.ShaderMaterial({
          uniforms: Object.assign({ map: { value: TEX.get('clouds') }, uSun: mat.uniforms.uSun, uVis: mat.uniforms.uVis, uK: { value: 1.012 } }, RU || {}),
          vertexShader: `varying vec3 vN; varying vec2 vUv; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; ${far} }`,
          // (thinning out toward the limb, seen edge-on, and gone by the world's own edge, so they never stand up off it
          // in ragged streaks; uK is how far above the ground the layer floats)
          fragmentShader: `${RG} uniform sampler2D map; uniform vec3 uSun; uniform float uVis, uK; varying vec3 vN; varying vec2 vUv; varying vec3 vW;
            void main(){ vec3 n = normalize(vN); float e = sqrt(1.0 - 1.0 / (uK * uK)), l = dot(n, uSun), a = texture2D(map, vUv).a * 0.85 * smoothstep(e, e + 0.25, dot(n, normalize(cameraPosition - vW)));
              float rs = ${RU ? 'ringThrough(vW - cameraPosition, uSun)' : '1.0'};
              gl_FragColor = vec4(vec3(0.95) * smoothstep(-0.05, 0.3, l) * (0.3 + 0.8 * max(l, 0.0)) * (0.25 + 0.75 * rs) * uVis, a * smoothstep(-0.2, 0.15, l)); }`,
          transparent: true, depthWrite: false, fog: false,
        }));
        cl.position.copy(m.position); cl.scale.setScalar(r); cl.rotation.copy(m.rotation); cl.renderOrder = m.renderOrder + 1; cl.frustumCulled = false; G0.add(cl); this.bodies.push(cl);
        // (and a thin high layer above that, its own wisps, slowly drifting over the deck below)
        const hi = new THREE.Mesh(cl.geometry, cl.material.clone()); Object.assign(hi.material.uniforms, cl.material.uniforms, { uK: { value: 1.025 } });
        hi.position.copy(m.position); hi.scale.setScalar(r * 1.025); hi.rotation.set(m.rotation.x + 0.4, m.rotation.y + 2.1, m.rotation.z - 0.3); hi.renderOrder = m.renderOrder + 2; hi.frustumCulled = false;
        G0.add(hi); this.bodies.push(hi); (this.highClouds || (this.highClouds = [])).push(hi);
        }
        if (RU) {
          // the rings: drawn on a dome round the eye, each point of it following its line of sight out to the sheet,
          // behind everything on the ground, over the world and anything else up there where they pass in front
          const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.ShaderMaterial({
            uniforms: Object.assign({ uSun: mat.uniforms.uSun, uVis: mat.uniforms.uVis }, RU),
            vertexShader: `varying vec3 vD; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vD = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; ${far} }`,
            fragmentShader: `${RG} uniform vec3 uSun; uniform float uVis; varying vec3 vD;
              void main(){ float t; vec4 c = ringSee(vec3(0.0), normalize(vD), uSun, t); if (c.a < 0.003) discard; gl_FragColor = vec4(c.rgb * uVis, c.a); }`,
            transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
          }));
          dome.renderOrder = -6; dome.frustumCulled = false; G0.add(dome); this.bodies.push(dome);
        }
      }
    }
    // The rings round the world in this sky (b: today's planet entry, from G.skyToday). The sky is the real layout
    // shrunk to fit, the world's centre D out, so s (= D / how many of its radii off it is) is one of its radii. Where
    // we stand on this moon or rock (this landing's) decides how the rings lie across the sky. A moon rides a little
    // above or below their plane; a rock inside them sits right in it, in its lane, so we're just above it, by how far
    // up its side we are. The other one goes where it really is, out in that plane (place).
    ringFrame(b, D) {
      const U = Rings.uniforms(), s = D / b.dist, rot = this.worldRot, me = b.me, Rs = me.size * s;
      const wd = new THREE.Vector3(Math.cos(b.az) * Math.cos(b.el), Math.sin(b.el), Math.sin(b.az) * Math.cos(b.el));
      const roll = new RNG(this.seed + 93).range(-0.9, 0.9);
      const t1 = new THREE.Vector3().crossVectors(_Y, wd).normalize(), t2 = new THREE.Vector3().crossVectors(wd, t1);
      const N0 = new THREE.Vector3().crossVectors(wd, t1.clone().multiplyScalar(Math.cos(roll)).addScaledVector(t2, Math.sin(roll))).normalize();
      if (N0.y < 0) N0.negate();
      const eps = me.ring ? Math.asin(clamp(Rs * N0.y / D, -1, 1)) : me.eps, C = wd.clone().multiplyScalar(D);
      const N = N0.clone().multiplyScalar(Math.cos(eps)).addScaledVector(wd, -Math.sin(eps)).normalize();
      // (in the rings' plane: e1 from the world out toward us, e2 a quarter of the way round from that)
      const e1 = wd.clone().negate().addScaledVector(N, wd.dot(N)).normalize(), e2 = new THREE.Vector3().crossVectors(N, e1);
      Rings.set(U, b.ringSys, b.tint, 0.6); U.uRingR.value.z = s;
      U.uRingC.value.copy(C).applyAxisAngle(_Y, rot); U.uRingN.value.copy(N).applyAxisAngle(_Y, rot);
      // (the ground underfoot hides the half of the sky below us, and throws its own shadow out across the rings)
      U.uRingOcc.value[1].set(0, -Rs * 1.003, 0, Rs);
      this.ringU = U;
      return { U, place: (p) => {
        const c = Math.cos(p.eps) * p.dist * s, pos = C.clone().addScaledVector(e1, Math.cos(p.dphi) * c).addScaledVector(e2, Math.sin(p.dphi) * c).addScaledVector(N, Math.sin(p.eps) * p.dist * s);
        const L = pos.length(), d = pos.clone().divideScalar(L), rad = p.size * s, w = pos.applyAxisAngle(_Y, rot);
        U.uRingOcc.value[0].set(w.x, w.y, w.z, rad);
        return { az: Math.atan2(d.z, d.x), el: Math.asin(clamp(d.y, -1, 1)), r: Math.max(0.006, Math.asin(Math.min(0.5, rad / L))), dist: L / s };
      } };
    }
    // the sky's bodies: lit by the sun, veiled by cloud and weather, drifting slowly across the sky over the day
    updateSkyBodies(L, t) {
      if (!this.bodies.length) return;
      const vis = this.biome.airless ? 1 : (1 - L.cover * 0.8) * (this.weather === 'fog' ? 0.25 : 1);
      this.bodiesG.rotation.y = this.skyRot0 + (this.skyMins || 0) * 0.0012;
      for (const m of this.bodies) { const u = m.material.uniforms; u.uSun.value.copy(L.sunDir); u.uVis.value = vis * (1 + 0.7 * L.night); }
      if (this.highClouds) for (const c of this.highClouds) c.rotateY(0.00025);
      this.updateAsteroid(L);
    }
    // Something on its way in (G.round.doom): first a new star, sunlight off it brighter than any of the real ones;
    // then a speck with a shape, a lumpy rock, its night side black against the stars; then filling the sky. It holds
    // its place, because it's coming straight at us; it only grows (as the time left to impact shrinks).
    updateAsteroid(L) {
      const d = G.round && G.round.doom;
      if (!d) { if (this.roid) this.roid.visible = false; return; }
      const D = 400;
      if (!this.roid) {
        const geo = new THREE.IcosahedronGeometry(1, 4), p = geo.attributes.position, nz = new Noise2D(this.seed + 13);
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + nz.fbm(x * 1.4 + 5, y * 1.4 + z * 1.1, 4) * 0.6; p.setXYZ(i, x * k * 1.35, y * k * 0.85, z * k); }
        geo.computeVertexNormals();
        this.roid = new THREE.Mesh(geo, new THREE.ShaderMaterial({
          uniforms: { map: { value: TEX.get('moonmap') }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uGlint: { value: 0 } },
          vertexShader: 'varying vec3 vN; varying vec2 vUv; void main(){ vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99995; }',
          fragmentShader: `uniform sampler2D map; uniform vec3 uSun; uniform float uGlint; varying vec3 vN; varying vec2 vUv;
            void main(){ float l = dot(normalize(vN), uSun); vec3 c = texture2D(map, vUv).rgb * vec3(0.62, 0.57, 0.52) * (0.03 + 1.1 * smoothstep(-0.02, 0.25, l) * max(l, 0.0));
              gl_FragColor = vec4(c + vec3(1.0, 0.96, 0.88) * uGlint, 1.0); }`,
          transparent: true, depthWrite: false, fog: false,
        }));
        this.roid.renderOrder = -5; this.roid.frustumCulled = false; this.sky.add(this.roid);
      }
      const left = d.at - (G.round.time || 0), ang = clamp(0.55 / Math.max(left, 0.3), 0.004, 1.25);
      this.roid.visible = true;
      this.roid.position.set(Math.cos(d.az) * Math.cos(d.el), Math.sin(d.el), Math.sin(d.az) * Math.cos(d.el)).multiplyScalar(D);
      this.roid.scale.setScalar(D * Math.sin(ang)); this.roid.rotation.set(0.4, (G.round.time || 0) * 0.01, 0.2);
      const u = this.roid.material.uniforms; u.uSun.value.copy(L.sunDir); u.uGlint.value = clamp(1 - ang / 0.025, 0, 1) * 1.6;
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
      if (this.flames) for (const f of this.flames) { const k = 0.8 + 0.22 * Math.sin(t * 13 + f.ph) * Math.sin(t * 7.3 + f.ph * 2) + 0.08 * Math.sin(t * 31 + f.ph); f.sp.scale.set(5 * f.s * k, 8 * f.s * (2 - k), 1); }
      const gusty = this.weather === 'storm' ? 1.8 : this.weather === 'rain' ? 1.3 : 1;
      this.windU.value = t * gusty;
      // the crows: round and round on the wind, a few flaps then a long glide, banking into the turn
      if (this.crows && this.crows.length) {
        const away = L && L.night > 0.6;
        for (const c of this.crows) {
          c.g.visible = !away; if (away) continue;
          const a = c.ph + t * c.sp + Math.sin(t * 0.07 + c.ph) * 0.4, r = c.rad * (1 + 0.15 * Math.sin(t * 0.11 + c.fl));
          c.g.position.set(c.cx + Math.cos(a) * r, this.height(c.cx, c.cz) + c.alt + Math.sin(t * 0.3 + c.fl) * 2, c.cz + Math.sin(a) * r);
          c.g.rotation.set(0, Math.atan2(-Math.sin(a) * Math.sign(c.sp), Math.cos(a) * Math.sign(c.sp)) + Math.PI, -Math.sign(c.sp) * 0.35, 'YXZ');
          const cyc = (t * 0.45 + c.fl) % 4, flap = cyc < 1.2 ? Math.sin(cyc * TAU * 2.5) * 0.55 : 0.08;
          c.wings[0].rotation.z = flap; c.wings[1].rotation.z = -flap;
        }
      }
      if (!cam) return;
      if (!this.coverAt || Math.hypot(cam.x - this.coverAt.x, cam.z - this.coverAt.z) > 7) this.fillGroundCover(cam.x, cam.z);
      const mu = this.moteMat.uniforms; mu.uTime.value = t * gusty; mu.uCam.value.copy(cam);
      if (L) {
        const mk = this.biome.motes, wet = this.weather === 'rain' || this.weather === 'storm';
        mu.uCol.value.copy(L.hor).multiplyScalar(mk === 'dust' ? 1.5 : mk === 'ash' ? 0.9 : mk === 'snow' ? 1.9 : 1.25).lerp(L.sunColor, 0.2 * (1 - L.night));
        if (mk === 'pollen') mu.uCol.value.lerp(_pollen, 0.5);
        mu.uGlow.value = mk === 'fireflies' ? L.night : 0;
        mu.uOp.value = mk === 'none' ? 0 : mk === 'fireflies' ? (wet ? 0.2 : 0.35 + L.night * 0.65) : mk === 'embers' ? 0.75 : (wet ? 0.15 : mk === 'dust' ? 0.8 : mk === 'ash' ? 0.75 : mk === 'snow' ? 0.9 : 0.55) * (1 - L.night * (mk === 'ash' || mk === 'snow' ? 0.3 : 0.6));
        // the far ranges: lit the way the land is, hazed as the mist is today (thinner higher up; on a foggy day, gone)
        if (this.rangeMat) {
          const ru = this.rangeMat.uniforms;
          ru.uSun.value.copy(L.sunDir); ru.uSunCol.value.copy(L.sunColor); ru.uSunK.value = L.sun; ru.uSky.value.copy(L.hemiSky); ru.uHemiK.value = L.hemi;
          ru.uFog.value.copy(L.fog); ru.uScatter.value.copy(L.scatter);
          ru.uD.value = R.vol.on ? 0 : L.fogDen * 0.4; ru.uF.value = 0.024; ru.uTopAdd.value = clamp((L.fogDen - 0.008) * 2400, 0, 220);
        }
        // the cloud and the mist: drifting by the site's own clock; the banks gone in a fog, the ground mist thickest at
        // dawn and by night
        // (with the volumetric air on, it carries the mist and the cloud itself: see R.vol)
        if (this.clouds) this.clouds.visible = !R.vol.on;
        if (R.vol.on && this.heightTex) {
          const vu = R.vol.mat.uniforms, h = (G.round ? G.round.time : 480) / 60, wet = this.weather === 'rain' ? 1 : this.weather === 'storm' ? 1.5 : 0, dawn = 1 - sstep(7.5, 10.5, h);
          vu.tH.value = this.heightTex; this.group.getWorldPosition(vu.uOrg.value); vu.uFar.value = 600; vu.uHB.value.set(-this.heightBox[0] / 2, -this.heightBox[0] / 2, this.heightBox[0], 0); vu.uHR.value.set(this.heightBox[1], this.heightBox[2]);
          vu.uSunDir.value.copy(L.sunDir); vu.uFogCol.value.copy(L.fog); vu.uScat.value.copy(L.scatter); vu.uShipInv.value.copy(this.shipInv.value);
          vu.uDen.value.set(L.fogDen * 1.1, L.fogFalloff, L.fogDen * (0.6 + 1.6 * Math.max(L.night, dawn)), 1.8);
          let top = 0; for (const v of this.rangeTops || [30]) top += v; top /= (this.rangeTops || [30]).length;
          vu.uCloud.value.set(this.weather === 'fog' ? 0 : (0.02 + wet * 0.012) * (1 - L.night * 0.3), top + 12 - wet * 6, 45, 200);
          vu.uWind.value.set(0.9, 0.35).multiplyScalar(gusty);
        }
        if (this.cloudMat) {
          const cu = this.cloudMat.uniforms, h = (G.round ? G.round.time : 480) / 60;
          cu.uTime.value = t; this.group.getWorldPosition(cu.uOrg.value);
          cu.uVis.value.set(this.weather === 'fog' ? 0 : 1 - L.night * 0.5, (this.weather === 'fog' ? 0.6 : 0.7) + 0.6 * Math.max(L.night, 1 - sstep(7.5, 10.5, h)));
        }
        const su = this.skyMat.uniforms;
        su.top.value.copy(L.top); su.hor.value.copy(L.hor); su.fogCol.value.copy(L.fog); su.scatter.value.copy(L.scatter);
        su.sunDir.value.copy(L.sunDir); su.sunCol.value.copy(L.sunColor).multiplyScalar(L.sunGlow);
        su.uCore.value.setRGB(34, 31, 27).multiplyScalar(this.biome.airless ? clamp(L.sun / 5, 0, 1) : 0);
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
      // (under cloud, a sunset barely shows: the dusk colour is muted the more of the sky is overcast)
      const duskTint = dusk * (1 - overcast * 0.6);
      const top = C(0x6f7d88).lerp(C(0x4a4f5a), overcast).lerp(C(0x3a2c44), duskTint).lerp(C(0x04060a), night);
      const hor = C(0x9aa3a6).lerp(C(0x7c8286), overcast).lerp(C(0xa0573a), duskTint * 0.85).lerp(C(0x0b0e13), night);
      // the world's own sky: a murky green marsh, a dusty orange canyon, the Hollow's permanent red dusk
      const SK = this.biome.sky, tint = (c, a) => c.multiply(new THREE.Color(a[0], a[1], a[2]));
      tint(top, SK.top).multiplyScalar(SK.dim); tint(hor, SK.hor).multiplyScalar(SK.dim);
      // (mist that thins as it goes up and greys what's far off long before it hides it: a clear day's lets you make out
      // shapes a couple of hundred metres off; rain and storms close it in; a foggy day is a wall)
      const fogDen = (wx === 'fog' ? 0.042 : wx === 'storm' ? 0.02 : wx === 'rain' ? 0.016 : 0.0075) + night * 0.008 + SK.fogAdd * 0.8;
      const sunColor = tint(C(0xfff2dd).lerp(C(0xff8a4a), dusk), SK.sun);
      const L = {
        // (the mist takes the colour of the light in it: a soft grey a shade darker than the sky low down, never a white sheet)
        top, hor, fog: hor.clone().multiplyScalar(0.78).lerp(top, 0.12), fogDen,
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
        fogFalloff: wx === 'fog' ? 0.06 : 0.065,
      };
      // no air: a black sky by day as well as by night with the stars always out, a hard white sun and deep shadows,
      // nothing to scatter it (no fog to speak of, no cloud, no haze)
      if (this.biome.airless) {
        const k = 1 - night;
        L.top = C(0x020203); L.hor = C(0x050506).lerp(C(0x0b0b0d), k); L.fog = C(0x030304); L.fogDen = 0.0035;
        L.hemi = 0.08 + 0.1 * k; L.sun = 5.0 * day; L.stars = 1; L.scatter = C(0x000000); L.sunGlow = 0.25 * k;
        L.cloudLit = L.hor.clone(); L.cloudDark = L.top.clone(); L.cover = 0; L.haze = 0; L.fogFalloff = 0.02;
      }
      // what's in the sky has its say: a body crossing the sun's face is an eclipse (from a moon, the world overhead
      // can swallow the sun whole for a while, and the place goes dark but for that world's glowing rim); and seen
      // from a moon at night, that world lights the ground, more the more of its day side faces this way
      // (a ringed world's rings, when the sun is behind them from here: its light comes through thinned, or not at all)
      if (this.ringU) { const tr = Rings.through(this.ringU, _ecl.set(0, 0, 0), L.sunDir); L.sun *= tr; L.sunGlow *= tr; L.scatter.multiplyScalar(tr); }
      if (this.eclipsers && this.eclipsers.length) {
        const ry = this.skyRot0 + mins * 0.0012, v = _ecl; this.skyMins = mins;
        for (const e of this.eclipsers) {
          v.copy(e.m.position).applyAxisAngle(_Y, e.world ? this.worldRot : ry); const d = v.length(), ang = Math.asin(Math.min(0.999, e.m.scale.x / d)); v.divideScalar(d);
          const show = sstep(ang - 0.012, ang + 0.025, Math.acos(clamp(v.dot(L.sunDir), -1, 1)));
          if (show < 1) { L.sun *= show; L.sunGlow *= show; L.scatter.multiplyScalar(show); L.hemi *= 1 - 0.55 * (1 - show) * day; L.peek = Math.max(L.peek || 0, day * sstep(0, 0.08, show) * (1 - sstep(0.3, 1, show))); }
          if (e.kind === 'planet' && this.biome.airless) {
            const face = (1 - v.dot(L.sunDir)) / 2;
            L.hemi += (0.06 + 0.14 * face) * (0.4 + 0.6 * night); L.hemiSky = L.hemiSky.clone().lerp(new THREE.Color(e.atmo != null ? e.atmo : e.tint), 0.5 * face);
          }
        }
      }
      return L;
    }
  }
  return Ext;
})();
