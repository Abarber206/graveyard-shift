'use strict';
// The crew's dropship: cargo bay (terminal, quota monitor, charger, hatch) + cockpit (seats, consoles,
// launch lever, windshield). +X is the nose, +Z is starboard (the hatch side). Floor top is y = 0.
// (ground: the landing pad's height under the deck; the ship stands on its legs with the belly clear of it)
const SHIP = { doorX0: -3.15, doorX1: -1.85, doorH: 2.15, h: 3.4, ground: -1.2 };
// the airlock chamber inside the outer hatch (x span, and the z of its inner wall; the outer wall is the hull at z 4)
const AIRLOCK = { x0: -3.62, x1: -1.38, z0: 2.55, ix0: -3.05, ix1: -1.95, ih: 2.15 };
// the roof deck: a railed platform up on the crown over the bay (its floor at y, inside x0..x1, z0..z1), reached by a
// ladder in the airlock and a hatch (hx, hz) up through its ceiling and the hull
const ROOF = { x0: -4.4, x1: -0.6, z0: -0.6, z1: 3.9, y: 5.15, hx: -1.85, hz: 3.0, rail: 1.05 };
// a delivery in orbit, second by second: the inner door shuts and the drone shows far off, a blinking light that takes
// its time coming in (long enough for the crew to gather at the portholes); the lock vents and the hatch opens, the
// drone comes in, sets the order down, backs out and leaves; the hatch shuts and the lock repressurises
const DELIVERY = { close: 0.3, appear: 0.8, open: 9.6, arrive: 12.2, inside: 13.0, drop: 13.5, spawn: 13.5, leave: 14.2, out: 15.0, gone: 16.6, shut: 16.0, sealed: 17.6, end: 18.0 };

const Ship = (() => {
  const H = 3.4, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const CK = { x0: 3.7, x1: 8.2, w0: 3.2, w1: 1.9, roof: 2.9, sill: 1.0, wsTop: 6.6 }; // cockpit plan
  const halfAt = (x) => CK.w0 - (x - CK.x0) * ((CK.w0 - CK.w1) / (CK.x1 - CK.x0));
  const _dh = new THREE.Vector3(), _washInv = new THREE.Matrix4(), _washP = new THREE.Vector3(), _smN = new THREE.Vector3(), _smB = new THREE.Vector3(), _smJ = new THREE.Vector3(), _smD = new THREE.Vector3(), _occ = new THREE.Vector3(), _lf = new THREE.Vector3(), _lu = new THREE.Vector3(), _lc = new THREE.Vector3(), _camP = new THREE.Vector3(0, 1.6, 0), _pq = new THREE.Quaternion();
  // turning the ship round in space (see orbit): the turn, the full turn; dropping out of a jump the world ends up dead
  // ahead, and coming down out of orbit the ship lines itself up with its orbit (the two frames it matches, and the
  // world's turning under it as it goes round)
  const _eye = new THREE.Vector3(), _tq = new THREE.Quaternion(), _tqFull = new THREE.Quaternion(), _tqI = new THREE.Quaternion(), _Dw = new THREE.Vector3(), _ahead = new THREE.Vector3(1, -0.03, 0).normalize();
  const _gA = new THREE.Matrix4(), _gB = new THREE.Matrix4(), _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3(), _g3 = new THREE.Vector3(), _gF = new THREE.Vector3(), _gTr = new THREE.Quaternion();
  const _gS = new THREE.Vector3(), _gN = new THREE.Vector3(), _gM = new THREE.Vector3(), _gX = new THREE.Vector3(), _gV = new THREE.Vector3();
  const _rw = new THREE.Vector3(), _rv = new THREE.Vector3(), _rq = new THREE.Quaternion();
  const _drop = new THREE.Vector3(), _gP = new THREE.Vector3(), _gC = new THREE.Vector3();
  // (how the way round the world is spread over the descent, t seconds after the lever: the ordinary way round gathers
  // pace as the ship gets low, the ground racing by beneath faster and faster into the air, the way an orbit quickens
  // as it shrinks; any extra way round, to come down into daylight, goes only once it's low, where it reads as the
  // ground rushing by. High up, with the whole world in the glass, it hardly turns: it's far too big to)
  // how fast the world turns under the ship coming down, t seconds after the lever, from an orbit h0 up (a share,
  // scaled to the trip): the lower an orbit, the quicker it goes round (as its radius to the -3/2), and the ship's own
  // way round only takes over from its parked orbit's slow drift little by little, through the burn and the long fall
  const glideW = (t, h0) => Math.pow((1 + ENTRY.hAir) / (1 + G.glideAlt(h0, t)), 2) * (0.02 + 0.98 * sstep(ENTRY.burn - 1, ENTRY.air - 4, t));
  // (and the extra way round some days need, to bring the sun up: gone round once the ship's low, a third of the
  // world's radius up and under, where it reads as the ground rushing by rather than the world spinning)
  const glideWx = (t, h0) => sstep(0.35, 0.15, G.glideAlt(h0, t)) * (1 - sstep(ENTRY.air - 2, ENTRY.air + 2, t));
  // how much of the parked orbit's own clock has been held back, t seconds after the lever: it drifts on through the
  // swing, slowing, and is still by the burn (the integral of sstep(turn0, burn)); all told it runs on glideDrift() s
  const glideHold = (t) => { const a = ENTRY.turn0, b = ENTRY.burn, u = clamp((t - a) / (b - a), 0, 1); return t < a ? 0 : (b - a) * (u * u * u - u * u * u * u / 2) + Math.max(0, t - b); };
  const glideDrift = () => ENTRY.turn0 + (ENTRY.burn - ENTRY.turn0) / 2;
  // ---- the outer hull's shape ----
  // One smooth skin wraps the whole cabin; the bay and flight deck keep their own walls inside it, and the space
  // between is the ship's hidden works. Every cross-section is two superellipse quarters meeting at the widest line
  // (half-width A at height ym): a dome above (exponent nu) running into a flat crown ft wide at height T, a fuller
  // curve below (nl) running into a flat belly fb wide at B. Along the ship, keys are joined by monotone cubics
  // (Fritsch-Carlson: the slope carries through every key, nothing overshoots), so the skin reads as one taut sheet.
  const curve = (pts) => {
    const n = pts.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d[i] = (pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(d[i]) < 1e-9) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return (x) => {
      if (x <= pts[0][0]) return pts[0][1];
      if (x >= pts[n - 1][0]) return pts[n - 1][1];
      let i = 0; while (x > pts[i + 1][0]) i++;
      const h = pts[i + 1][0] - pts[i][0], t = (x - pts[i][0]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * pts[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (3 * t2 - 2 * t3) * pts[i + 1][1] + (t3 - t2) * h * m[i + 1];
    };
  };
  // the tail ends in the engine bulkhead at x0; ahead of the windshield the nose closes in a cap from cap to x1, pointed
  // seen from above and rounded seen side on (a shark's), onto a tip at yc
  const HULL = { x0: -16.2, x1: 12.6, cap: CK.x1, yc: 0.4 };
  // the engines: the main bell in the tail bulkhead (its height and radius, the plane it fires from), and the two
  // nacelles slung either side of the tail on stub pylons (height, offset, radius; where they start and where their
  // bells fire from)
  const ENGINES = { main: [2.12, 0.8], mx: HULL.x0 - 0.7, side: [1.3, 5.5, 0.82], nx0: -8.2, nx1: -15.7 };
  ENGINES.sx = ENGINES.nx1 + 0.4 - ENGINES.side[2] * 0.92 * 0.87;
  // A lean hauler: the skin hugs the cabin (a rounded box in section, its crown flat enough to carry the roof deck),
  // the nose runs out long and low past the windshield, and the tail tapers to the engine bulkhead between the nacelles
  const hA = curve([[-16.2, 2.3], [-15.2, 2.95], [-13.8, 3.6], [-12.0, 4.1], [-10.2, 4.42], [-8.6, 4.54], [-7.4, 4.56], [3.0, 4.56], [3.7, 4.54], [4.6, 4.12], [5.4, 3.72], [6.2, 3.38], [7.0, 3.1], [8.2, 2.78], [9.4, 2.56], [10.6, 2.36], [12.6, 2.1]]);
  const hYm = curve([[-16.2, 2.0], [-14.0, 1.75], [-11.0, 1.5], [-8.6, 1.42], [3.7, 1.42], [5.0, 1.32], [6.6, 1.0], [8.2, 0.55], [12.6, 0.45]]);
  const hB = curve([[-16.2, 1.05], [-15.2, 0.55], [-13.8, 0.0], [-12.0, -0.42], [-10.2, -0.66], [-8.6, -0.75], [3.7, -0.75], [6.6, -0.72], [8.2, -0.66], [12.6, -0.42]]);
  const hFb = curve([[-16.2, 0.4], [-14.0, 1.0], [-11.0, 1.9], [-8.6, 2.4], [3.7, 2.4], [6.6, 1.6], [8.2, 1.2], [12.6, 0.7]]);
  const hNu = curve([[-16.2, 3.0], [-7.4, 3.4], [3.7, 3.4], [5.0, 3.0], [6.6, 2.6], [8.2, 2.4], [12.6, 2.2]]);
  const hNl = curve([[-16.2, 3.0], [-7.4, 3.4], [3.7, 3.4], [8.2, 2.6], [12.6, 2.2]]);
  // the crown: flat and level over the bay, sweeping down over the flight deck to the brow; across the windshield the
  // skin is a plane just proud of the glass; ahead of it the nose drops away below the pilots' sightline
  const hTa = curve([[-16.2, 3.2], [-15.2, 3.62], [-13.8, 3.98], [-12.0, 4.24], [-10.2, 4.4], [-8.6, 4.48], [-7.0, 4.53], [3.0, 4.55], [3.7, 4.38], [5.0, 3.86], [6.0, 3.42], [6.6, 3.12]]);
  const hFa = curve([[-16.2, 0.6], [-14.0, 1.2], [-11.0, 1.7], [-8.6, 1.86], [3.0, 1.86], [4.6, 1.92], [5.6, 2.16], [6.6, halfAt(6.6) + 0.17]]);
  const hTn = curve([[8.2, 1.02], [10.4, 1.0], [12.6, 0.85]]);
  const hFn = curve([[8.2, halfAt(8.2) + 0.17], [9.0, 1.2], [9.6, 0], [12.6, 0]]);
  const hullSec = (x) => {
    const p = { A: hA(x), ym: hYm(x), B: hB(x), fb: hFb(x), nu: hNu(x), nl: hNl(x) };
    if (x <= CK.wsTop) { p.T = hTa(x); p.ft = hFa(x); }
    else if (x < CK.x1) { p.T = 3.12 + ((x - CK.wsTop) / (CK.x1 - CK.wsTop)) * (1.02 - 3.12); p.ft = halfAt(x) + 0.17; }
    else { p.T = hTn(x); p.ft = hFn(x); }
    if (x > HULL.cap) {
      const u = (x - HULL.cap) / (HULL.x1 - HULL.cap), c = Math.sqrt(Math.max(0, 1 - u * u)), cw = Math.max(0, 1 - Math.pow(u, 1.7)) * Math.pow(c, 0.25), yc = HULL.yc;
      p.A *= cw; p.ft *= cw; p.fb *= cw; p.T = yc + (p.T - yc) * c; p.B = yc + (p.B - yc) * c; p.ym = yc + (p.ym - yc) * c;
    }
    return p;
  };
  const se = (s, n) => Math.pow(Math.max(0, 1 - Math.pow(clamp(s, 0, 1), n)), 1 / n);
  // the skin's half-width at height y, its height on top / underneath at z
  const skinW = (x, y) => { const p = hullSec(x); return y >= p.ym ? p.ft + (p.A - p.ft) * se((y - p.ym) / (p.T - p.ym), p.nu) : p.fb + (p.A - p.fb) * se((p.ym - y) / (p.ym - p.B), p.nl); };
  const skinTop = (x, z) => { const p = hullSec(x), a = Math.abs(z); return a <= p.ft ? p.T : p.ym + (p.T - p.ym) * se((a - p.ft) / (p.A - p.ft), p.nu); };
  const skinBot = (x, z) => { const p = hullSec(x), a = Math.abs(z); return a <= p.fb ? p.B : p.ym - (p.ym - p.B) * se((a - p.fb) / (p.A - p.fb), p.nl); };
  // a point on the upper quarter at parameter t (0 at the widest line, 1 at the crown), and the tilt of its normal
  // from vertical
  const upperAt = (x, t) => {
    const p = hullSec(x), f = (k) => { const a = clamp(k, 0, 1) * Math.PI / 2; return [p.ft + (p.A - p.ft) * Math.pow(Math.cos(a), 2 / p.nu), p.ym + (p.T - p.ym) * Math.pow(Math.sin(a), 2 / p.nu)]; };
    const [z, y] = f(t), [z0, y0] = f(t - 0.02), [z1, y1] = f(t + 0.02);
    return { z, y, tilt: Math.atan2(y1 - y0, z0 - z1) };
  };
  // the cabin's openings, as they come through the skin: the bay portholes (x, side), the hatch with the ramp's slot
  // under its sill, and the flight deck's side windows (x0, x1, y0, y1 on the skin, corner radius r)
  const PORTS = [[-2.2, -1], [-5.0, -1], [2.5, 1], [-5.8, 1]], PORT_R = 0.44;
  const DOOR = { x0: SHIP.doorX0 - 0.12, x1: SHIP.doorX1 + 0.12, y0: -0.32, y1: SHIP.doorH + 0.12, r: 0.32 };
  const WIN = { x0: 4.3, x1: 6.8, y0: 1.08, y1: 2.62, r: 0.2 };
  // the ramp: it slides out flat from under the deck through the slot, then hinges down at its top edge to the ground
  const RAMP = { z0: 4.47, y0: -0.14, len: 3.2 };
  RAMP.ang = Math.asin((RAMP.y0 - SHIP.ground) / RAMP.len);

  // ---- the weather seen from orbit ----
  // Each world's sky has its own character, and each day its own weather on top of it (see setWeather): how much of
  // it is cloud (cover), how stormy (storm: how many lows wind up and how hard), how much of that is tropical storms
  // (trop: tight spirals round a clear eye), fields of cells (cells), streaks along the jet streams (jet), how tall
  // the heaps stand (tall), the thin high wisps over it all (cirrus), and the cloud's own colour where it isn't white
  // (Vesper's is ash). great: one vast storm that never blows itself out (the Hollow's).
  const WEATHER = {
    ashgrove: { cover: 0.5, storm: 0.6, trop: 0.35, cells: 0.5, jet: 0.6, tall: 0.6, cirrus: 0.5 },
    verdigris: { cover: 0.62, storm: 0.7, trop: 0.9, cells: 0.25, jet: 0.4, tall: 0.95, cirrus: 0.7 },
    kessler: { cover: 0.56, storm: 0.8, trop: 0.5, cells: 0.4, jet: 0.7, tall: 0.7, cirrus: 0.5 },
    rimefall: { cover: 0.36, storm: 0.45, trop: 0, cells: 0.3, jet: 1, tall: 0.3, cirrus: 1 },
    agnes: { cover: 0.72, storm: 0.45, trop: 0.1, cells: 1, jet: 0.3, tall: 0.3, cirrus: 0.25 },
    nadir: { cover: 0.58, storm: 1, trop: 0.4, cells: 0.3, jet: 0.8, tall: 0.8, cirrus: 0.6 },
    brinewell: { cover: 0.6, storm: 0.9, trop: 1, cells: 0.6, jet: 0.5, tall: 0.85, cirrus: 0.5 },
    saltreach: { cover: 0.12, storm: 0.15, trop: 0.2, cells: 0.15, jet: 0.4, tall: 0.5, cirrus: 0.35 },
    hollow: { cover: 0.7, storm: 1, trop: 0.5, cells: 0.3, jet: 0.6, tall: 1, cirrus: 0.4, great: 1 },
    vesper: { cover: 0.3, storm: 0.3, trop: 0.1, cells: 0.2, jet: 0.5, tall: 0.6, cirrus: 0.2, col: [0.6, 0.55, 0.52] },
  };
  // the cloud shell's span, in the world's radii: from its base up to the tallest tops, and the high wisps above
  const CLOUD = { base: 1.004, top: 1.016, cirrus: 1.0195, hull: 1.0215, NV: 10 };
  // how much the clouds cost, by the picture setting: (RETRO, LOW) a smaller weather map, a few steps through the
  // shell and a short look toward the sun; (MEDIUM) more; (HIGH, ULTRA) the most
  const cloudTier = () => (Settings.res <= 1 ? 0 : Settings.res === 2 ? 1 : 2);
  const CLOUD_TIER = [{ w: 1024, steps: 4, taps: 2, detail: 1, band: 32 }, { w: 2048, steps: 8, taps: 3, detail: 2, band: 32 }, { w: 2048, steps: 12, taps: 4, detail: 3, band: 32 }];
  // The storms turn while you watch: everything within a storm's reach is looked up turned back round its middle
  // (the nearest storm's, smoothly less toward the edge of its reach), so its spiral slowly winds on. Shared by the
  // cloud and the shadows it throws on the ground. (uVort: middle and radius, in the cloud's own frame; uVturn: how
  // far it has turned)
  const CLOUD_SPIN = `uniform vec4 uVort[${CLOUD.NV}]; uniform float uVturn[${CLOUD.NV}];
    vec4 cloudSpinAt(vec3 n){
      float best = 0.0, ang = 0.0; vec3 ax = vec3(0.0, 1.0, 0.0);
      for (int i = 0; i < ${CLOUD.NV}; i++){ vec4 v = uVort[i]; if (v.w <= 0.0) continue;
        float w = 1.0 - smoothstep(1.0, 5.0, (2.0 - 2.0 * dot(n, v.xyz)) / (v.w * v.w));
        if (w > best){ best = w; ax = v.xyz; ang = uVturn[i]; } }
      return vec4(ax, ang * best);
    }
    vec3 cloudTurn(vec3 n, vec4 s){ float c = cos(s.w), si = sin(s.w); return n * c + cross(s.xyz, n) * si + s.xyz * dot(s.xyz, n) * (1.0 - c); }
    vec2 cloudUV(vec3 n){ return vec2(fract(atan(n.z, -n.x) / 6.2831853), 1.0 - acos(clamp(n.y, -1.0, 1.0)) / 3.14159265); }
  `;
  // The day's weather map, worked out on the graphics card (a band of rows a frame, see stepWeather): for each point of
  // the sphere, r how much cloud, g how high its tops stand, b the high wisps, a how much shadow it throws. It starts
  // from swirled noise (noise looked up through noise, so it curls and folds the way air does), drawn out along the
  // latitudes where the westerlies shear it. Over that: the belts of weather round a world, a band of towering cloud
  // along the equator where the trade winds meet, clear belts either side, the storm tracks further out; the storms,
  // everything near each one wound round it (opposite ways either side of the equator) with its own shape added in: a
  // low's comma wound into its middle and the long curve of its cold front trailing off toward the equator, a tropical
  // storm's tight bands round a clear eye; fields of cells (closed, puffs filling each; or open, walls round clear
  // middles); popcorn cumulus over the clear belts; ragged, streaky edges; the jet streams' streaks of high cloud.
  const WX_GEN_FS = `precision highp float;
    uniform vec2 uSize; uniform vec3 uSeed; uniform vec4 uLook, uLook2, uJet; uniform vec4 uVort[${CLOUD.NV}], uVk[${CLOUD.NV}]; uniform float uDet;
    vec3 h33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0; }
    float gn(vec3 p){ vec3 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      return mix(mix(mix(dot(h33(i), f), dot(h33(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x),
                     mix(dot(h33(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)), dot(h33(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x), u.y),
                 mix(mix(dot(h33(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)), dot(h33(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x),
                     mix(dot(h33(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)), dot(h33(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z); }
    const mat3 ROT = mat3(0.0, 0.8, 0.6, -0.8, 0.36, -0.48, -0.6, -0.48, 0.64);
    float fbm(vec3 p, int oct){ float s = 0.0, a = 0.5; for (int i = 0; i < 7; i++){ if (i >= oct) break; s += a * gn(p); p = ROT * p * 2.03; a *= 0.5; } return s; }
    vec2 worley(vec3 p){ vec3 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
      for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
        vec3 o = vec3(float(x), float(y), float(z)), r = o + 0.5 + 0.45 * h33(i + o) - f; float d = dot(r, r);
        if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      return sqrt(vec2(d1, d2)); }
    void main(){
      vec2 uv = gl_FragCoord.xy / uSize;
      float ph = uv.x * 6.2831853, th = (1.0 - uv.y) * 3.14159265;
      vec3 p = vec3(-cos(ph) * sin(th), cos(th), sin(ph) * sin(th));
      float lat = asin(clamp(p.y, -1.0, 1.0)), alat = abs(lat);
      // the storms
      vec3 q = p; float st = 0.0, stTop = 0.0, eye = 1.0, cir = 0.0;
      for (int i = 0; i < ${CLOUD.NV}; i++){
        vec4 v = uVort[i], k = uVk[i]; if (v.w <= 0.0) continue;
        float cd = dot(p, v.xyz); if (cd < 0.3) continue;
        vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), v.xyz)), e2 = cross(v.xyz, e1);
        vec2 l = vec2(dot(p, e1), dot(p, e2)) / v.w; float rho = length(l), phi = atan(l.y, l.x);
        if (rho > 5.5) continue;
        float tw = k.x * exp(-rho * rho * 0.6), c = cos(tw), s = sin(tw);
        q = q * c + cross(v.xyz, q) * s + v.xyz * dot(v.xyz, q) * (1.0 - c);
        float sg = sign(k.x), lr = log(max(rho, 0.02));
        if (k.y < 0.5) {
          float arm = smoothstep(0.3, 0.95, 0.5 + 0.5 * cos(phi - k.w - sg * 1.5 * lr)) * exp(-rho * rho * 0.55);
          float dphi = phi - k.w - sg * 0.5 * lr; dphi -= 6.2831853 * floor(dphi / 6.2831853 + 0.5);
          float fr = exp(-pow(dphi * rho / 0.2, 2.0)) * smoothstep(0.4, 1.0, rho) * smoothstep(5.0, 2.2, rho) * k.z;
          st += arm * 0.8 + fr * 0.75 - exp(-rho * rho * 3.0) * 0.15; stTop = max(stTop, max(arm * 0.7, fr * 0.6));
          cir += fr * 0.5 + arm * 0.3;
        } else {
          float bands = smoothstep(0.25, 0.9, 0.5 + 0.5 * cos(2.0 * (phi - k.w - sg * 2.3 * lr))) * exp(-rho * 0.8) * smoothstep(0.15, 0.4, rho);
          float core = exp(-pow(rho / 0.45, 2.0)), e = smoothstep(0.04, 0.085, rho);
          st += (core * 1.4 + bands * 1.0) * e - (1.0 - e) * 2.0; stTop = max(stTop, (core * 1.1 + bands * 0.6) * e);
          eye = min(eye, e); cir += exp(-rho * rho * 0.3) * 0.7 * e;
        }
      }
      // swirled noise, drawn out along the latitudes
      vec3 Q = q * 2.1 + uSeed;
      float sh = 1.0 + 1.1 * smoothstep(0.3, 0.85, alat) * (1.0 - smoothstep(1.15, 1.45, alat));
      vec3 Qs = vec3(Q.x, q.y * 2.1 * sh + uSeed.y, Q.z); // (stretched about the world's own frame, not the day's offset into the noise)
      vec3 w = vec3(fbm(Qs * 1.2 + vec3(1.7, 9.2, 3.1), 4), fbm(Qs * 1.2 + vec3(8.3, 2.8, 5.5), 4), fbm(Qs * 1.2 + vec3(4.1, 6.3, 1.2), 4));
      float f = fbm(Qs * 2.0 + w * 2.4, 6);
      // the belts of weather
      float itcz = 0.07 * sin(ph * 2.0 + uSeed.x) + 0.04 * sin(ph * 5.0 + uSeed.y);
      float tro = exp(-pow((lat - itcz) / 0.1, 2.0));
      float zon = 0.22 * tro - 0.24 * exp(-pow((alat - 0.47) / 0.15, 2.0)) + 0.14 * exp(-pow((alat - 0.95) / 0.22, 2.0)) - 0.06 * smoothstep(1.25, 1.5, alat);
      float F = f * 1.6 + zon + st * uLook.y + (uLook.x - 0.42) * 0.9;
      float cov = smoothstep(-0.04, 0.3, F);
      // ragged, streaky edges
      float wsp = fbm(vec3(q.x * 7.0, q.y * 10.0, q.z * 7.0) + w * 3.0 + uSeed, 4);
      cov = clamp(cov + wsp * 1.8 * cov * (1.0 - cov), 0.0, 1.0);
      // fields of cells
      vec2 wo = worley(q * 34.0 + uSeed * 1.7);
      float creg = smoothstep(-0.05, 0.25, fbm(Q * 0.8 + 17.0, 3)) * exp(-pow((alat - 0.55) / 0.3, 2.0)) * uLook.z;
      float closed = smoothstep(0.03, 0.22, wo.y - wo.x) * smoothstep(0.85, 0.3, wo.x), open = 1.0 - smoothstep(0.02, 0.11, wo.y - wo.x);
      float cells = mix(closed * 0.9, open * 0.8, smoothstep(-0.1, 0.1, gn(Q * 0.6 + 5.0)));
      cov = mix(cov, max(cov, cells * smoothstep(-0.45, -0.05, F)), creg);
      // popcorn cumulus over the clear belts
      float pop = smoothstep(0.22, 0.5, gn(q * uDet + uSeed * 3.1)) * smoothstep(0.1, -0.2, F) * smoothstep(-0.75, -0.3, F);
      pop *= (0.35 + 0.65 * exp(-pow(lat / 0.6, 2.0))) * (0.4 + uLook2.z * 0.6) * smoothstep(-0.1, 0.2, fbm(Q * 1.4 + 9.0, 3));
      cov = max(cov, pop * 0.85) * eye;
      // how tall: heaped up where it's thick, highest in the storms and along the equator, cauliflower tops
      float bil = abs(gn(q * 26.0 + uSeed)) * 0.6 + abs(gn(q * 61.0 - uSeed)) * 0.4;
      float top = mix(0.22, 0.62, smoothstep(0.1, 0.9, F)) + stTop * 0.4 + tro * 0.25 * smoothstep(0.0, 0.5, F) + pop * 0.3;
      top = mix(top, 0.18 + 0.12 * cells, creg * (1.0 - smoothstep(0.1, 0.6, F)));
      top = clamp(top * (0.62 + 0.75 * bil) * uLook.w, 0.05, 1.0);
      // the jet streams' streaks
      float lj = uJet.x + uJet.y * sin(ph * uJet.z + uJet.w + sign(lat) * 1.3);
      float jb = exp(-pow((alat - lj) / 0.12, 2.0));
      float streak = fbm(vec3(p.x * 4.0, (alat - lj) * 60.0 + sign(lat) * 7.0, p.z * 4.0) + w * 0.6 + uSeed, 3) + fbm(Q * 1.6 + 31.0, 3) * 0.8;
      cir = clamp((cir * 0.6 + jb * smoothstep(0.1, 0.45, streak) * uLook2.x * 0.55) * uLook2.y * (0.5 + 0.5 * smoothstep(-0.2, 0.2, f + 0.1)), 0.0, 1.0);
      float sha = clamp(cov * (0.55 + 0.45 * smoothstep(0.1, 0.6, top)) + cir * 0.2, 0.0, 1.0);
      gl_FragColor = vec4(cov, top, cir, sha);
    }`;
  // The cloud itself, from orbit or falling through it: each pixel's line of sight marched through the shell between
  // the cloud's base and the tallest tops, the cloud there as thick as the map says and standing as tall, so its edges
  // are thin and soft with the ground showing through, the heaps stand up off the deck and toward the limb crowd
  // together and hide what's behind them. It's lit the way cloud is: darker the deeper into it the sunlight has to
  // come (bright tops, dim undersides), the faces of the heaps turned to the sun brighter than their far faces, and in
  // the shadow of any taller heap between it and the sun (stepped toward the sun over the map, so under a low sun the
  // shadows run long). Toward the terminator the light comes in long and low and turns orange, and the tallest tops
  // still catch it after the deck below has gone dark; thin cloud lit from behind glows. Sky light fills in the shade.
  // Over it all, the high wisps in a thin sheet, thicker seen edge-on. Finer detail fades in as it comes close enough
  // to show (falling through it). As before, the moons and the rings throw their shadows on it, and diving in, it
  // opens over the site.
  const CLOUD_VS = 'varying vec3 vPos; varying vec3 vWP; void main(){ vPos = position; vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
  // the renderer's pixels to the page's (for anything drawn a set number of pixels across)
  const pxRatio = () => (R.renderer ? Math.min(2, R.renderer.getPixelRatio()) : 1);
  const CLOUD_FS = () => `precision highp sampler3D;
    ${Rings.GLSL}${CLOUD_SPIN}
    uniform sampler2D uMap; uniform sampler3D uNoise;
    uniform vec3 uCamL, uSunL, uAmb, uCol; uniform vec4 uShell; uniform float uFade, uCirRot, uSunI, uTexel;
    uniform vec4 uPdCast[3]; uniform vec3 uPdSunW; uniform vec4 uFlash[6];
    varying vec3 vPos; varying vec3 vWP;
    vec3 sunCol(float m){ return mix(vec3(1.0, 0.34, 0.1), vec3(1.0, 0.96, 0.9), smoothstep(0.0, 0.3, m)) * smoothstep(-0.02, 0.05, m); }
    vec3 dW;
    float det(vec3 P){
      float d = 0.0;
      #if DETAIL > 0
      if (dW.x > 0.0) d += (textureLod(uNoise, P * 0.0417, 0.0).r - 0.5) * dW.x;
      #endif
      #if DETAIL > 1
      if (dW.y > 0.0) d += (textureLod(uNoise, P * 0.125 + 0.37, 0.0).r - 0.5) * dW.y * 0.7;
      #endif
      #if DETAIL > 2
      if (dW.z > 0.0) d += (textureLod(uNoise, P * 0.4 + 0.71, 0.0).r - 0.5) * dW.z * 0.5;
      #endif
      return d * 1.6;
    }
    void main(){
      vec3 ro = uCamL, rd = normalize(vPos - uCamL);
      float Rb = uShell.x, Rt = uShell.y, Rc = uShell.z, Rp = uShell.w, span = Rt - Rb;
      float b = dot(ro, rd), c0 = dot(ro, ro), dT = b * b - c0 + Rt * Rt, sq = sqrt(max(dT, 0.0));
      float t0 = max(-b - sq, 0.0), t1 = -b + sq, dB = b * b - c0 + Rb * Rb, dP = b * b - c0 + Rp * Rp;
      if (dB > 0.0) { float tb = -b - sqrt(dB); if (tb > 0.0) t1 = min(t1, tb); }
      float tP = dP > 0.0 && -b - sqrt(dP) > 0.0 ? -b - sqrt(dP) : 1e9;
      // (the footprint of this pixel on the cloud: for filtering the map, and fading in the fine detail)
      vec3 Pe = ro + rd * t0, dpx = dFdx(Pe), dpy = dFdy(Pe), n0 = normalize(Pe);
      vec2 uv0 = cloudUV(n0), gx = cloudUV(normalize(Pe + dpx)) - uv0, gy = cloudUV(normalize(Pe + dpy)) - uv0;
      gx.x -= floor(gx.x + 0.5); gy.x -= floor(gy.x + 0.5);
      float fp = max(length(dpx), length(dpy));
      dW = vec3(1.0) - smoothstep(vec3(0.5), vec3(1.0), fp / vec3(3.0, 1.0, 0.3));
      vec4 sp = cloudSpinAt(n0);
      float T = 1.0, ww = 0.0, sw = 0.0, accA = 0.0; vec3 accS = vec3(0.0), Pw = vec3(0.0);
      if (dT > 0.0 && t1 > t0) {
        float dt = (t1 - t0) / float(STEPS), jit = 0.35 + 0.3 * fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
        for (int i = 0; i < STEPS; i++) {
          float t = t0 + (float(i) + jit) * dt;
          vec3 P = ro + rd * t; float r = length(P); vec3 n = P / r;
          vec4 m = textureGrad(uMap, cloudUV(cloudTurn(n, sp)), gx, gy);
          float dn = det(P), cv = clamp(m.r + dn * (0.3 + 0.5 * (1.0 - m.r)), 0.0, 1.0), tp = m.g * (1.0 + dn * 0.35), h = (r - Rb) / span;
          float dens = cv * cv * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(tp * 0.5, tp, h));
          if (dens < 0.002) continue;
          float a = 1.0 - exp(-dens * dt * 0.9), mu = dot(n, uSunL), muE = mu + sqrt(2.0 * max(r - Rp, 0.0) / Rp);
          // (the sunlight comes down into it from the tops, and is the dimmer the deeper in it has to come)
          float sunT = exp(-cv * max(tp - h, 0.0) * span * 0.45 / max(mu, 0.12)), wg = T * a;
          accS += wg * sunCol(muE) * sunT; accA += wg * (0.3 + 0.7 * clamp(h / max(tp, 0.05), 0.0, 1.0));
          Pw += wg * P; ww += wg; sw += wg * m.g * smoothstep(0.05, 0.5, m.r);
          T *= 1.0 - a; if (T < 0.02) break;
        }
      }
      float alpha = 1.0 - T; vec3 col = vec3(0.0);
      if (ww > 1e-4) {
        Pw /= ww; sw /= ww; float rw = length(Pw); vec3 nw = Pw / rw; float hw = (rw - Rb) / span;
        float mu = dot(nw, uSunL); vec3 st = uSunL - nw * mu; float stl = length(st); st /= max(stl, 1e-4);
        float tanE = mu / max(stl, 0.04);
        // (how the cloud slopes toward the sun, a little way off; then stepping on toward the sun over the map: any
        // heap standing up into the sunbeam between here and the sun shades this)
        float d0 = max(uTexel * 1.5, fp * 1.5);
        float s0 = textureGrad(uMap, cloudUV(cloudTurn(normalize(nw + st * (d0 / rw)), sp)), gx, gy).g;
        float slope = (s0 - sw) * span / d0, shadow = 1.0, reach = clamp(span * 0.9 / max(tanE, 0.06), span * 0.6, span * 6.0), tj = fract(sin(dot(floor(gl_FragCoord.xy), vec2(39.346, 11.135))) * 43758.5453);
        for (int k = 1; k <= TAPS; k++) {
          float d = reach * pow((float(k) - tj) / float(TAPS), 1.7);
          vec4 mk = textureGrad(uMap, cloudUV(cloudTurn(normalize(nw + st * (d / rw)), sp)), gx, gy);
          float sk = mk.g * smoothstep(0.05, 0.5, mk.r), yk = hw + (d * tanE + d * d / (2.0 * rw)) / span;
          shadow *= 1.0 - smoothstep(-0.06, 0.2, sk - yk) * smoothstep(0.15, 0.7, mk.r) * 0.6;
        }
        // (the faces of the heaps turned to the sun brighter, their far faces dimmer)
        float NL = (mu - slope * stl) / sqrt(1.0 + slope * slope), lam = clamp((NL + 0.25) / 1.25, 0.0, 1.0);
        // (the moons' shadows, and the rings')
        vec3 wp = cameraPosition + normalize(vWP - cameraPosition) * length(Pw - ro);
        float shd = 1.0;
        for (int i = 0; i < 3; i++) { vec4 c = uPdCast[i]; if (c.w > 0.0) { vec3 rel = c.xyz - wp; float tt = dot(rel, uPdSunW);
          if (tt > 0.0) { float d = length(rel - uPdSunW * tt), pen = c.w * 0.04 + tt * 0.0093; shd *= mix(0.05, 1.0, smoothstep(c.w - pen, c.w + pen, d)); } } }
        shd *= mix(0.12, 1.0, ringThrough(wp, uPdSunW));
        float g = max(dot(rd, uSunL), 0.0), fwd = 1.0 + 2.0 * pow(g, 6.0) * (1.0 - alpha * 0.7);
        vec3 amb = uAmb * 0.3 * smoothstep(-0.12, 0.4, mu) + vec3(0.0008, 0.001, 0.0016);
        col = (accS * lam * shadow * shd * fwd * uSunI + amb * accA) * uCol;
        // (lightning flickering deep in a storm, lighting the cloud round it from inside: a knot of light where the stroke
        // is, and the cloud for miles round glowing with it, brightest where it's thickest so its own billows show; on
        // the night side a storm the size of a country flickering far below, fainter by day)
        { float dk = 1.0 - 0.55 * smoothstep(-0.12, 0.3, mu);
          for (int i = 0; i < 6; i++) { vec4 L = uFlash[i]; if (L.w > 0.0) { float e = 1.0 - dot(nw, L.xyz);
            col += vec3(0.62, 0.7, 1.0) * L.w * dk * accA * (5.0 * exp(-e / 0.0001) + 3.0 * accA * exp(-e / 0.008)); } } }
      }
      // the high wisps: a thin sheet over it all (or, from under it, behind it)
      float dc = b * b - c0 + Rc * Rc;
      if (dc > 0.0) {
        float sc = sqrt(dc), tc = c0 > Rc * Rc ? -b - sc : -b + sc;
        if (tc > 0.0 && tc < tP) {
          vec3 nc = normalize(ro + rd * tc);
          float cr = cos(uCirRot), sr = sin(uCirRot); vec3 ncr = vec3(cr * nc.x + sr * nc.z, nc.y, -sr * nc.x + cr * nc.z);
          float ci = textureGrad(uMap, cloudUV(cloudTurn(ncr, sp)), gx, gy).b;
          float ca = 1.0 - exp(-ci * 0.45 / max(abs(dot(rd, nc)), 0.1));
          float mu = dot(nc, uSunL), muE = mu + sqrt(2.0 * (Rc - Rp) / Rp);
          vec3 cc = (sunCol(muE) * clamp((mu + 0.5) / 1.5, 0.0, 1.0) * uSunI * 0.8 + uAmb * 0.25 * smoothstep(-0.3, 0.4, mu)) * ca * uCol;
          if (c0 > Rc * Rc) { col = cc + col * (1.0 - ca); alpha = ca + alpha * (1.0 - ca); }
          else { col += cc * (1.0 - alpha); alpha += ca * (1.0 - alpha); }
        }
      }
      gl_FragColor = vec4(col, alpha) * uFade;
    }`;

  class ShipObj {
    constructor() {
      this.group = new THREE.Group(); this.group.name = 'ship';
      this.space = new THREE.Group(); this.space.name = 'space';
      this.door = { open: false, t: 0 };
      this.cols = []; this.obbs = []; this.lights = []; this.interact = []; this.tops = [];
      this.blinkers = []; this.leverT = 0; this.screenT = 0; this.beaconOn = false; this.airborne = false;
      this.termPos = V(2.65, 1.3, -3.4);
      this.leverPos = V(6.5, 1.15, 0);
      this.build();
      this.buildSpace();
      // the cabin lights' positions in ship coordinates (their world positions follow the ship in flight)
      for (const l of this.lights) l.local = V(l.x, l.y, l.z);
    }
    // carry the cabin lights with the ship's current transform
    placeLights(m) { for (const l of this.lights) { const p = l.local.clone().applyMatrix4(m); l.x = p.x; l.y = p.y; l.z = p.z; } }
    // ---------- helpers ----------
    mesh(geo, mat, parent = this.group) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
    box(w, h, d, mat, x, y, z, ry = 0, parent = this.group) { const m = this.mesh(new THREE.BoxGeometry(w, h, d), mat, parent); m.position.set(x, y, z); m.rotation.y = ry; return m; }
    cyl(r1, r2, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 16) { const m = this.mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; }
    strut(a, b, t, mat) { const len = a.distanceTo(b); const m = this.mesh(new THREE.BoxGeometry(t, t, len), mat); m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); return m; }
    extrude(shape, depth, mat, m4) { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 20 }); if (m4) g.applyMatrix4(m4); return this.mesh(g, mat); }
    col(x0, x1, z0, z1, tag) { const c = { x0, x1, z0, z1, tag }; this.cols.push(c); return c; }
    // the flat top of something aboard at height y over x0..x1, z0..z1 (the desk, the table, a rack's shelf): what's put
    // down over it comes to rest there; k 'open' for a shelf with room under it, 'on' for clutter standing on the top at
    // y (a mug, the monitor, the stock on a shelf; see restOn)
    top(x0, x1, z0, z1, y, k) { this.tops.push({ x0, x1, z0, z1, y, k }); }
    // where something let go of at hand height y over (x, z) aboard comes to rest, the eye's line at height aim there:
    // the deck, or the top of whatever it's over (set on it, if it stands a little higher than the hand), the shelf looked at
    restAt(x, z, y, aim = y, h = 0) { return restOn(this.tops, x, z, y, aim, 0, h); }
    restY(x, z, y, aim) { return this.restAt(x, z, y, aim).y; }
    // nothing stands on top t within (mx, mz) of (x, z) yet
    clearOn(t, x, z, mx, mz) { return !busyOn(this.tops, t, x, z, mx, mz); }
    // how far from (x, z) along (dx, dz), up to d, something can be put down aboard: a wall or a console's body stops it
    // short (it's never put through one), though it passes over the tops of desks and shelves (on)
    reach(x, z, dx, dz, d, on) {
      let k = 0, gap = 0;
      for (let s = 0.05; s < d + 0.01; s += 0.05) {
        const qx = x + dx * s, qz = z + dz * s; if (!this.inside(qx, 0.3, qz)) break;
        // (the edge of a desk's or a rack's footprint short of its top is crossed, not stopped on; and from a seat, the
        // seat's own footprint round you)
        if (!on(qx, qz) && this.collide(_drop.set(qx, 0, qz), 0.15)) { if (k > 0 && (gap += 0.05) > 0.32) break; continue; }
        gap = 0; k = s;
      }
      return k;
    }
    obb(x, z, hw, hd, ry) { this.obbs.push({ x, z, hw, hd, ry }); }
    // ---- detail buckets: hundreds of small parts, merged per material into a handful of meshes ----
    put(m, geo, matrix) { (this.bk[m] || (this.bk[m] = [])).push({ geo, matrix }); }
    pb(m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { this.put(m, new THREE.BoxGeometry(w, h, d), mat(x, y, z, rx, ry, rz)); }
    // (an open one, a bell or a sleeve, is solid from inside too: see twoSided)
    pc(m, r1, r2, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12, open = false) { const g = new THREE.CylinderGeometry(r1, r2, h, seg, 1, open); this.put(m, open ? twoSided(g) : g, mat(x, y, z, rx, ry, rz)); }
    // a mug standing at (x, y, z) (the middle of its foot): a tapered body, hollow and empty, with a rolled rim, and a
    // handle out on the side toward a (round from +x)
    mug(x, y, z, a = 0) {
      const prof = [[0, 0], [0.036, 0], [0.038, 0.004], [0.041, 0.094], [0.042, 0.1], [0.0385, 0.1], [0.037, 0.094], [0.0345, 0.014], [0.03, 0.009], [0, 0.009]].map(([r, h]) => new THREE.Vector2(r, h));
      this.put('white', new THREE.LatheGeometry(prof, 24), mat(x, y, z));
      this.put('white', new THREE.TorusGeometry(0.027, 0.0065, 8, 14, Math.PI), mat(x + Math.cos(a) * 0.0395, y + 0.052, z + Math.sin(a) * 0.0395, 0, -a, -Math.PI / 2));
    }
    ps(m, r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 10) { this.put(m, new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), mat(x, y, z, 0, 0, 0, sx, sy, sz)); }
    pt(m, R, r, x, y, z, rx = 0, ry = 0, rz = 0, seg = 16, arc = TAU) { this.put(m, new THREE.TorusGeometry(R, r, 6, seg, arc), mat(x, y, z, rx, ry, rz)); }
    pq(m, w, h, x, y, z, rx = 0, ry = 0, rz = 0) { this.put(m, new THREE.PlaneGeometry(w, h), mat(x, y, z, rx, ry, rz)); }
    tube(m, pts, r, seg = 24, rad = 6) { this.put(m, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rad, false), new THREE.Matrix4()); }
    // a box spanning two points (struts, braces)
    beam(m, a, b, w, d = w) {
      const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      this.put(m, new THREE.BoxGeometry(w, len, d), new THREE.Matrix4().compose(mid, q, V(1, 1, 1)));
    }
    flushBuckets() {
      for (const k in this.bk) {
        const geo = mergeGeoList(this.bk[k]); if (!geo) continue;
        const m = new THREE.Mesh(geo, this.cm[k] || MATS.get(k));
        m.castShadow = !k.startsWith('glow') && k !== 'net' && k !== 'oil' && k !== 'glass'; m.receiveShadow = true; this.group.add(m);
      }
      this.bk = {};
    }
    // a sign as its own textured plane (text, colours as TEX.sign)
    sign(text, w, h, x, y, z, ry, opts) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: TEX.sign(text, opts), transparent: !!opts.clear, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 }));
      m.position.set(x, y, z); m.rotation.y = ry; this.group.add(m); return m;
    }
    // straight wall along X at the given z with round portholes (the cabin side; the hull skin outside is separate)
    sideWall(z, side, x0, x1, holes, gap) {
      const s = new THREE.Shape(); s.moveTo(x0, 0); s.lineTo(x1, 0); s.lineTo(x1, H); s.lineTo(x0, H); s.closePath();
      for (const hx of holes) { const p = new THREE.Path(); p.absarc(hx, 1.75, 0.42, 0, TAU, true); s.holes.push(p); }
      if (gap) { const p = new THREE.Path(); p.moveTo(gap[0], 0.001); p.lineTo(gap[0], SHIP.doorH); p.lineTo(gap[1], SHIP.doorH); p.lineTo(gap[1], 0.001); p.closePath(); s.holes.push(p); }
      const zStart = side > 0 ? z : z - 0.17;
      this.extrude(s, 0.17, MATS.rep('metal', 0.34, 0.34), new THREE.Matrix4().makeTranslation(0, 0, zStart));
      for (const hx of holes) this.porthole(hx, z, side);
    }
    porthole(x, z, side) {
      const glass = this.mesh(new THREE.CircleGeometry(0.42, 24), this.glassMat); glass.position.set(x, 1.75, z + side * 0.1); glass.rotation.y = side > 0 ? Math.PI : 0; glass.castShadow = false;
      // inner trim ring, a steel sleeve through the wall gap, and a heavy outer ring that seats on the hull skin
      this.pt('darkmetal', 0.43, 0.045, x, 1.75, z - side * 0.02, 0, 0, 0, 24);
      this.pc('tunnel', 0.425, 0.425, 0.2, x, 1.75, z + side * 0.25, Math.PI / 2, 0, 0, 24, true);
      this.pt('darkmetal', 0.455, 0.055, x, 1.75, z + side * 0.355, 0, 0, 0, 24);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; this.ps('steelBolt', 0.016, x + Math.cos(a) * 0.43, 1.75 + Math.sin(a) * 0.43, z - side * 0.06, 1, 1, 1, 6); this.ps('steelBolt', 0.018, x + Math.cos(a + 0.4) * 0.52, 1.75 + Math.sin(a + 0.4) * 0.52, z + side * 0.36, 1, 1, 1, 6); }
    }
    // a hard hat: a tough dome with a ridge down the crown and a rib either side, a brim with a peak at the front, the
    // suspension band inside; its base at (x, y, z), turned by (rx, ry, rz)
    hardHat(m, x, y, z, rx, ry, rz) {
      const M = mat(x, y, z, rx, ry, rz), add = (k, geo, lm) => this.put(k, geo, M.clone().multiply(lm)), S = [1, 0.9, 1.18];
      add(m, new THREE.SphereGeometry(0.135, 22, 10, 0, TAU, 0, Math.PI / 2), mat(0, 0, 0, 0, 0, 0, ...S));
      add(m, new THREE.TorusGeometry(0.135, 0.012, 6, 24, Math.PI).rotateY(Math.PI / 2), mat(0, 0, 0, 0, 0, 0, ...S));
      // (the side ribs run alongside the ridge, front to back)
      for (const s of [-1, 1]) add(m, new THREE.TorusGeometry(Math.sqrt(0.135 * 0.135 - 0.055 * 0.055), 0.008, 5, 20, Math.PI).rotateY(Math.PI / 2).translate(s * 0.055, 0, 0), mat(0, 0, 0, 0, 0, 0, ...S));
      add(m, new THREE.CylinderGeometry(0.158, 0.163, 0.012, 26), mat(0, 0.004, 0, 0, 0, 0, 1, 1, 1.2));
      add(m, new THREE.CylinderGeometry(0.11, 0.11, 0.01, 16, 1, false, -Math.PI / 2, Math.PI), mat(0, 0.005, 0.12, 0, 0, 0, 1.25, 1, 0.8));
      add('black', new THREE.TorusGeometry(0.118, 0.009, 4, 20).rotateX(Math.PI / 2), mat(0, 0.045, 0, 0, 0, 0, 1, 1, 1.16));
      add('black', new THREE.CircleGeometry(0.128, 20).rotateX(Math.PI / 2), mat(0, 0.002, 0, 0, 0, 0, 1, 1, 1.18));
    }
    // a coat hook: a plate on the wall, an arm out (local +z, turned by ry) and an upturned tip things hang from
    wallHook(x, y, z, ry) {
      const M = mat(x, y, z, 0, ry, 0), add = (k, geo, lm) => this.put(k, geo, M.clone().multiply(lm));
      add('darkmetal', new THREE.BoxGeometry(0.05, 0.09, 0.012), mat(0, -0.01, 0.006));
      for (const yy of [0.02, -0.04]) add('steelBolt', new THREE.CylinderGeometry(0.006, 0.006, 0.006, 6).rotateX(Math.PI / 2), mat(0, yy, 0.014));
      add('steelBolt', new THREE.CylinderGeometry(0.008, 0.008, 0.095, 8).rotateX(Math.PI / 2), mat(0, 0, 0.055));
      add('steelBolt', new THREE.CylinderGeometry(0.008, 0.008, 0.035, 8), mat(0, 0.017, 0.1));
      add('steelBolt', new THREE.SphereGeometry(0.011, 8, 6), mat(0, 0.036, 0.1));
    }
    // a work jacket hung up by its collar: the body, the sleeves hanging, a collar, a zip, pockets, a band of reflective
    // tape; hung from (x, y, z), facing local +z turned by ry
    jacket(x, y, z, ry) {
      const M = mat(x, y, z, 0, ry, 0), add = (k, geo, lm) => this.put(k, geo, M.clone().multiply(lm));
      add('olive', new THREE.CapsuleGeometry(0.15, 0.36, 4, 14), mat(0, -0.34, 0, 0, 0, 0, 1.35, 1, 0.55));
      for (const s of [-1, 1]) {
        add('olive', new THREE.CapsuleGeometry(0.055, 0.42, 4, 10), mat(s * 0.235, -0.38, 0.015, 0, 0, s * 0.12));
        add('olive', new THREE.BoxGeometry(0.11, 0.1, 0.02), mat(s * 0.1, -0.5, 0.083, 0, 0, 0));
        add('black', new THREE.BoxGeometry(0.1, 0.008, 0.022), mat(s * 0.1, -0.452, 0.084, 0, 0, 0));
      }
      add('olive', new THREE.TorusGeometry(0.075, 0.032, 6, 16).rotateX(Math.PI / 2), mat(0, -0.03, 0, 0, 0, 0, 1.2, 1, 0.75));
      add('black', new THREE.BoxGeometry(0.012, 0.6, 0.01), mat(0, -0.34, 0.084, 0, 0, 0));
      add('yellow', new THREE.BoxGeometry(0.408, 0.04, 0.172), mat(0, -0.42, 0, 0, 0, 0));
      // on a wire coat hanger: its hook over the coat hook, its neck down into the collar
      add('steelBolt', new THREE.TorusGeometry(0.026, 0.004, 4, 12, Math.PI * 1.3), mat(0, 0.05, -0.02, 0, 0, 0));
      add('steelBolt', new THREE.CylinderGeometry(0.004, 0.004, 0.06, 5), mat(0, 0.005, -0.02, 0, 0, 0));
      add('steelBolt', new THREE.CylinderGeometry(0.004, 0.004, 0.4, 5).rotateZ(Math.PI / 2), mat(0, -0.06, -0.01, 0, 0, 0));
    }
    // ---------- build ----------
    build() {
      const g = this.group, dm = MATS.get('darkmetal'), hz = MATS.get('hazard');
      const metal = MATS.rep('metal', 3, 1), hull = MATS.rep('hull', 3, 1);
      // window glass: a faint grey-green tint with smudges and grime at the edges, unlit, so the cabin lamps never
      // turn into blooming hot spots on it
      this.glassMat = new THREE.MeshBasicMaterial({ map: TEX.get('cabinGlass'), color: 0x9fb4b4, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
      // rain on the outside of it (k: how hard; V: the air going past the glass, in the ship's own frame; inv: the world
      // to the ship): beads sitting on it and runs trickling down when it's still, and, the faster it flies, the beads
      // torn off and the runs dragged back across it in streaks by the wind. Only on glass out in the weather.
      const GU = (this.glassU = { uRainK: { value: 0 }, uRainT: { value: 0 }, uRainV: { value: V() }, uGlassInv: { value: new THREE.Matrix4() } });
      this.glassMat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, GU);
        sh.vertexShader = 'varying vec3 vGW, vGN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGW = (modelMatrix * vec4(position, 1.0)).xyz; vGN = normalize(mat3(modelMatrix) * normal);');
        sh.fragmentShader = `uniform float uRainK, uRainT; uniform vec3 uRainV; uniform mat4 uGlassInv; varying vec3 vGW, vGN;
          float rgH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          ` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          if (uRainK > 0.002) {
            vec3 P = (uGlassInv * vec4(vGW, 1.0)).xyz, N = normalize(mat3(uGlassInv) * vGN);
            if (P.x > 3.7 || abs(P.z) > 3.9) {
              // (which way the water runs over this pane: the wind over it, and its own weight)
              vec3 F = uRainV + vec3(0.0, -1.2, 0.0); F -= N * dot(F, N); float sp = length(F);
              vec3 A = sp > 0.01 ? F / sp : vec3(0.0, -1.0, 0.0), B = normalize(cross(N, A));
              vec2 q = vec2(dot(P, A), dot(P, B));
              float w = 0.0, run = min(sp, 70.0);
              { vec2 c = q * 30.0, i = floor(c), f = fract(c) - 0.5, o = vec2(rgH(i + 3.1), rgH(i + 7.7)) - 0.5; float r = 0.1 + 0.18 * rgH(i + 1.3);
                w += step(rgH(i), 0.4 * uRainK * (1.0 - smoothstep(4.0, 25.0, run))) * smoothstep(r, r * 0.55, length(f - o * 0.6)); }
              { float st = 1.0 + run * 0.3; vec2 c = vec2((q.x - uRainT * (0.15 + run * 0.9)) / st, q.y) * 36.0, i = floor(c), f = fract(c) - 0.5; float hw = 0.05 + 0.07 * rgH(i + 5.0);
                w += step(rgH(i + 11.0), (0.12 + 0.3 * smoothstep(2.0, 20.0, run)) * uRainK) * smoothstep(hw, hw * 0.4, abs(f.y + (rgH(i + 2.0) - 0.5) * 0.6)) * smoothstep(0.5, 0.15, abs(f.x)); }
              w = clamp(w, 0.0, 1.0);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.84, 0.9), w * 0.55); diffuseColor.a = max(diffuseColor.a, w * 0.5);
            }
          }`);
      };
      this.glassMat.customProgramCacheKey = () => 'shipGlassRain';
      this.bk = {};
      this.makeMaterials();
      // ===== cargo bay shell (the cabin side; the curved hull skin wraps around it in buildHull) =====
      this.box(11.05, 0.15, 8.34, [metal, metal, MATS.rep('grate', 11, 8.6), metal, metal, metal], -1.825, -0.075, 0);
      this.box(11.05, 0.1, 8.34, metal, -1.825, H + 0.05, 0);
      this.box(0.3, H, 8.34, metal, -7.2, H / 2, 0); // back wall
      this.sideWall(-4.0, -1, -7.05, 3.6, [-2.2, -5.0]);
      this.sideWall(4.0, 1, -7.05, 3.6, [2.5, -5.8], [SHIP.doorX0, SHIP.doorX1]);
      // bulkhead between bay and cockpit
      this.box(0.2, H, 3.1, metal, 3.6, H / 2, -2.65);
      this.box(0.2, H, 3.1, metal, 3.6, H / 2, 2.65);
      this.box(0.2, H - 2.4, 2.2, metal, 3.6, 2.4 + (H - 2.4) / 2, 0);
      this.box(0.12, 2.4, 0.12, hz, 3.6, 1.2, -1.1); this.box(0.12, 2.4, 0.12, hz, 3.6, 1.2, 1.1);
      // the ramp under the hatch (it slides back under the deck for flight); its origin is its top edge
      { const geo = new THREE.BoxGeometry(DOOR.x1 - DOOR.x0, 0.1, RAMP.len); geo.translate(0, -0.05, RAMP.len / 2);
        this.ramp = this.mesh(geo, MATS.rep('grate', 1.6, RAMP.len)); this.ramp.position.x = (SHIP.doorX0 + SHIP.doorX1) / 2; }
      this.rampT = 1; this.rampTarget = 1;
      this.doorCol = this.col(SHIP.doorX0, SHIP.doorX1, 3.95, 4.3, 'door');
      this.col(-7.4, -7.0, -4.3, 4.3); this.col(-7.4, 3.7, -4.3, -3.98); this.col(-7.4, SHIP.doorX0, 3.98, 4.3); this.col(SHIP.doorX1, 3.7, 3.98, 4.3);
      this.col(3.5, 3.72, -4.3, -1.1); this.col(3.5, 3.72, 1.1, 4.3);
      this.buildCockpit();
      this.buildBay();
      this.buildBayDetail();
      this.buildBayUpgrade();
      this.buildCockpitDetail();
      this.buildHull();
      this.buildAirlock();
      this.buildShutters();
      this.buildRobot();
      this.buildExterior();
      this.buildRoofDeck();
      this.flushBuckets();
      this.mergeStatic();
    }
    // Hundreds of the ship's parts are meshes of their own: merged by material into one mesh each, the ship draws in a
    // few dozen calls instead of several hundred (a phone can't keep up with that many, and the shadow pass doubles
    // it). What the ship keeps hold of (it moves, swaps, lights up or comes and goes) keeps its own; the parts that only
    // ride along with one (a leg's struts, a door's hardware) are merged into it. Anything see-through, drawn in a set
    // order or with its own shadow is left alone. Then the small things inside the cabin (labels, gauges, papers) are
    // set apart, to be left out while you're too far outside to see them (see update)
    mergeStatic() {
      const held = new Set(), seen = new Set(), noop = THREE.Object3D.prototype.onBeforeRender;
      const hold = (v, depth) => {
        if (!v || typeof v !== 'object' || depth > 4 || seen.has(v)) return;
        seen.add(v);
        if (v.isObject3D) { held.add(v); return; }
        if (v.isMaterial || v.isTexture || v.isBufferGeometry) return;
        if (Array.isArray(v)) { for (const x of v) hold(x, depth + 1); return; }
        if (v.constructor === Object) for (const k in v) hold(v[k], depth + 1);
      };
      for (const k of Object.keys(this)) if (k !== 'group') hold(this[k], 0);
      const ok = (o) => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.children.length || !o.frustumCulled || o.renderOrder || o.customDepthMaterial || o.onBeforeRender !== noop) return false;
        const m = o.material, g = o.geometry;
        return !Array.isArray(m) && !m.transparent && !m.alphaTest && !!g.attributes.normal && !g.morphAttributes.position && Object.keys(g.attributes).every((n) => n === 'position' || n === 'normal' || n === 'uv');
      };
      this.group.updateMatrixWorld(true);
      const under = (root) => {
        const inv = root.matrixWorld.clone().invert(), by = new Map();
        const walk = (o) => { for (const c of o.children) { if (held.has(c) || !c.visible) continue; if (ok(c)) { const key = c.material.uuid + (c.castShadow ? '+c' : '') + (c.receiveShadow ? '+r' : ''); if (!by.has(key)) by.set(key, []); by.get(key).push(c); } walk(c); } };
        walk(root);
        for (const list of by.values()) {
          if (list.length < 2) continue;
          const geo = mergeGeoList(list.map((o) => ({ geo: o.geometry, matrix: inv.clone().multiply(o.matrixWorld) })));
          if (!geo) continue;
          const me = new THREE.Mesh(geo, list[0].material); me.castShadow = list[0].castShadow; me.receiveShadow = list[0].receiveShadow;
          for (const o of list) o.parent.remove(o);
          root.add(me);
        }
      };
      under(this.group);
      for (const r of held) { let p = r.parent; while (p && p !== this.group) p = p.parent; if (p) under(r); }
      this.cabinBits = new THREE.Group(); this.cabinBits.name = 'cabin bits';
      const sp = new THREE.Sphere();
      for (const o of [...this.group.children]) {
        if (held.has(o) || !o.isMesh || !o.geometry) continue;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        sp.copy(o.geometry.boundingSphere).applyMatrix4(o.matrix);
        if (sp.radius < 0.9 && this.inside(sp.center.x, sp.center.y, sp.center.z)) { this.group.remove(o); this.cabinBits.add(o); }
      }
      this.group.add(this.cabinBits);
    }
    // ---------- the roof deck: a grating platform on stilts over the crown, a safety rail round it, and the hatch up
    // into it from a ladder in the airlock (somewhere to ride the takeoff and landing out in the wind) ----------
    buildRoofDeck() {
      const R = ROOF, D = 'darkmetal', Y = 'yellow', cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2, w = R.x1 - R.x0, d = R.z1 - R.z0;
      // (the grating stops round the hatch: it's a hole, down into the trunk)
      const hh = 0.46;
      [[R.x0, R.hx - hh, R.z0, R.z1], [R.hx + hh, R.x1, R.z0, R.z1], [R.hx - hh, R.hx + hh, R.z0, R.hz - hh], [R.hx - hh, R.hx + hh, R.hz + hh, R.z1]].forEach(([a, b, c, e], i) => {
        this.cm['deckGrate' + i] = MATS.rep('grate', b - a, e - c); this.pb('deckGrate' + i, b - a, 0.05, e - c, (a + b) / 2, R.y - 0.025, (c + e) / 2);
      });
      // its frame, and stilts down onto the hull (longer toward the shoulder, where the crown falls away)
      for (const z of [R.z0, R.z1]) this.pb(D, w, 0.12, 0.08, cx, R.y - 0.11, z);
      for (const x of [R.x0, R.x1]) this.pb(D, 0.08, 0.12, d, x, R.y - 0.11, cz);
      for (let i = 0; i < 4; i++) this.pb(D, 0.06, 0.08, d, R.x0 + (i + 0.5) * w / 4, R.y - 0.09, cz);
      for (const x of [R.x0 + 0.15, cx, R.x1 - 0.15]) for (const z of [R.z0 + 0.15, cz, R.z1 - 0.15]) {
        const top = skinTop(x, z), h = R.y - 0.17 - top + 0.1; if (h <= 0.05) continue;
        this.pc(D, 0.045, 0.06, h, x, top - 0.1 + h / 2, z, 0, 0, 0, 8);
        this.pc(D, 0.12, 0.12, 0.03, x, top + 0.01, z, 0, 0, 0, 10);
      }
      // the rail: posts, a top and a mid rail in safety yellow, a kick plate along the bottom
      const edge = (ax, az, bx, bz) => {
        const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.95)), ry = -Math.atan2(bz - az, bx - ax);
        for (let i = 0; i <= n; i++) { const t = i / n; this.pc(Y, 0.025, 0.025, R.rail, ax + (bx - ax) * t, R.y + R.rail / 2, az + (bz - az) * t, 0, 0, 0, 6); }
        for (const [h, r] of [[R.rail, 0.028], [R.rail * 0.52, 0.02]]) this.pc(Y, r, r, len, (ax + bx) / 2, R.y + h, (az + bz) / 2, 0, ry, Math.PI / 2, 6);
        this.pb(D, len, 0.1, 0.02, (ax + bx) / 2, R.y + 0.05, (az + bz) / 2, 0, ry, 0);
      };
      edge(R.x0, R.z0, R.x1, R.z0); edge(R.x1, R.z0, R.x1, R.z1); edge(R.x1, R.z1, R.x0, R.z1); edge(R.x0, R.z1, R.x0, R.z0);
      // the hatch: a raised round coaming over the trunk up through the hull, its lid swung open, a grab hoop
      const top = skinTop(R.hx, R.hz), th = R.y - top;
      this.pc(D, 0.46, 0.46, th + 0.05, R.hx, top + th / 2 - 0.02, R.hz, 0, 0, 0, 20, true);
      this.pc(D, 0.46, 0.46, 0.32, R.hx, R.y + 0.16, R.hz, 0, 0, 0, 20, true);
      this.pt('hazard', 0.47, 0.035, R.hx, R.y + 0.32, R.hz, Math.PI / 2, 0, 0, 24);
      this.pc(D, 0.5, 0.5, 0.06, R.hx, R.y + 0.36 + 0.45, R.hz + 0.56, Math.PI / 2 + 0.2, 0, 0, 20);
      this.pc('steelBolt', 0.06, 0.06, 0.12, R.hx, R.y + 0.34, R.hz + 0.47, 0, 0, Math.PI / 2, 8);
      // (the ladder's grab hoop: up over the top of the coaming from the head of one rail to the other)
      this.pt(Y, 0.22, 0.022, AIRLOCK.x1 - 0.2, R.y + 0.32, R.hz, 0, Math.PI / 2, 0, 12, Math.PI);
      // the trunk: open right through, its own walls seen from within, from the coaming down to the airlock's ceiling,
      // so looking down it you see the ladder going down into the lit chamber
      {
        const y0 = SHIP.h - 0.02, y1 = R.y + 0.32, lin = new THREE.Mesh(new THREE.CylinderGeometry(0.445, 0.445, y1 - y0, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.8, metalness: 0.35, side: THREE.BackSide }));
        lin.position.set(R.hx, (y0 + y1) / 2, R.hz); lin.receiveShadow = true; this.group.add(lin);
      }
      // and below, in the airlock: a steel ladder up the chamber's front wall to a hatch in its ceiling
      const lx = AIRLOCK.x1 - 0.2, H = SHIP.h;
      // (its rails run on up through the hatch in the ceiling and the trunk to the top of the coaming, the hoop over them)
      const LH = R.y + 0.32;
      for (const s of [-1, 1]) {
        this.pc('steelBolt', 0.022, 0.022, LH, lx, LH / 2, R.hz + s * 0.22, 0, 0, 0, 6);
        for (const y of [0.4, 1.6, 2.8]) this.pb(D, 0.14, 0.04, 0.04, lx + 0.08, y, R.hz + s * 0.22);
      }
      for (let y = 0.3; y < LH - 0.15; y += 0.3) this.pc('steelBolt', 0.016, 0.016, 0.44, lx, y, R.hz, Math.PI / 2, 0, 0, 6);
      // the hatch in the airlock's ceiling: a framed round opening up into the trunk
      for (const s of [-1, 1]) { this.pb(D, 1.08, 0.06, 0.1, R.hx, H - 0.03, R.hz + s * 0.49); this.pb(D, 0.1, 0.06, 0.88, R.hx + s * 0.49, H - 0.03, R.hz); }
      this.pb('hazard', 1.1, 0.02, 0.07, R.hx, H - 0.065, R.hz - 0.55); this.pb('hazard', 1.1, 0.02, 0.07, R.hx, H - 0.065, R.hz + 0.55);
      this.col(lx - 0.05, AIRLOCK.x1, R.hz - 0.28, R.hz + 0.28);
      // you take hold of the ladder by looking at the rungs themselves (anywhere up them), not just near it
      this.interact.push({ kind: 'ladder', x: lx - 0.04, y: 1.6, z: R.hz, r: 0.1, h: 1.3 });
      this.interact.push({ kind: 'roofHatch', x: R.hx, y: R.y + 0.4, z: R.hz, r: 0.3 });
    }
    // ---------- the airlock: a slim outer hatch in the hull, a small chamber, an inner door into the bay ----------
    buildAirlock() {
      const A = AIRLOCK, D = 'darkmetal', W = SHIP.doorX1 - SHIP.doorX0, Hd = SHIP.doorH, cx = (SHIP.doorX0 + SHIP.doorX1) / 2;
      const dm = MATS.get('darkmetal'), wallM = MATS.rep('metal', 0.5, 0.5), hullM = this.cm.hullPanel;
      // a rectangle with rounded top corners, standing on y = 0 (centred on x = 0)
      const archR = (w, h, r) => { const s = new THREE.Shape(), a = -w / 2, b = w / 2; s.moveTo(a, 0); s.lineTo(b, 0); s.lineTo(b, h - r); s.quadraticCurveTo(b, h, b - r, h); s.lineTo(a + r, h); s.quadraticCurveTo(a, h, a, h - r); s.closePath(); return s; };
      const ext = (shape, depth, bevel) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 10 });
      const meshAt = (geo, m, x, y, z, ry = 0, parent = this.group) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.y = ry; me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
      // trim around an opening that stands on the floor: an arch-shaped frame open at the bottom (one outline running
      // up the outside, over, down, and back up the inside; a hole touching the floor would not triangulate)
      const trimShape = (w, h, ri, t) => {
        const s = new THREE.Shape(), a = w / 2, A = a + t, H = h + t, ro = ri + t;
        s.moveTo(-A, 0); s.lineTo(-A, H - ro); s.quadraticCurveTo(-A, H, -A + ro, H); s.lineTo(A - ro, H); s.quadraticCurveTo(A, H, A, H - ro); s.lineTo(A, 0);
        s.lineTo(a, 0); s.lineTo(a, h - ri); s.quadraticCurveTo(a, h, a - ri, h); s.lineTo(-a + ri, h); s.quadraticCurveTo(-a, h, -a, h - ri); s.lineTo(-a, 0); s.closePath();
        return s;
      };
      // trim rings around an opening: rounded, low, crisp
      const trim = (w, h, z, ry, m) => meshAt(ext(trimShape(w, h, 0.2, 0.12), 0.045, 0.008), m, cx, 0, z, ry);
      trim(W, Hd, 4.345, 0, hullM);                          // on the hull
      trim(W, Hd, 4.0 - 0.045, 0, dm);                       // inside the chamber, on the outer wall
      // the outer hatch: a pressed plate with a small round window, a recessed grab and a seal edge; it slides into the wall
      const door = new THREE.Group(); door.position.set(cx, 0, 4.22); this.group.add(door);
      { const s = archR(W - 0.02, Hd - 0.01, 0.19), win = new THREE.Path(); win.absarc(0, 1.55, 0.15, 0, TAU, true); s.holes.push(win);
        const g = ext(s, 0.05, 0.01); g.translate(0, 0, -0.025); meshAt(g, hullM, 0, 0, 0, 0, door);
        const gl = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), this.glassMat); gl.position.set(0, 1.55, 0); door.add(gl);
        for (const z of [-0.04, 0.04]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 6, 24), dm); ring.position.set(0, 1.55, z); door.add(ring); }
        for (const z of [-0.045, 0.045]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.03), dm); h.position.set(W / 2 - 0.16, 1.05, z); door.add(h); }
        // the stripe stands proud of the plate both sides, so it never flickers through the face
        const band = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.09, 0.084), MATS.get('hazard')); band.position.set(0, 0.16, 0); door.add(band); }
      this.doorMesh = door;
      // the chamber: two side walls and an inner wall, all up to the ceiling
      const depth = 4.0 - A.z0, zc = (4.0 + A.z0) / 2;
      for (const x of [A.x0 + 0.04, A.x1 - 0.04]) this.box(0.08, H, depth, wallM, x, H / 2, zc);
      this.box(A.ix0 - A.x0, H, 0.1, wallM, (A.x0 + A.ix0) / 2, H / 2, A.z0);
      this.box(A.x1 - A.ix1, H, 0.1, wallM, (A.x1 + A.ix1) / 2, H / 2, A.z0);
      this.box(A.ix1 - A.ix0, H - A.ih, 0.1, wallM, cx, A.ih + (H - A.ih) / 2, A.z0);
      const iw = A.ix1 - A.ix0;
      trim(iw, A.ih, A.z0 + 0.05, 0, dm); trim(iw, A.ih, A.z0 - 0.05 - 0.045, 0, dm);
      this.sign('CHECK SEAL BEFORE\nCYCLING THE LOCK', 0.5, 0.2, A.x0 + 0.085, 1.8, zc, Math.PI / 2, { w: 256, h: 100, size: 22, bg: '#d8cfb0', fg: '#2a2418' });
      // the inner door: two halves on the bay side that part into the wall either side (the left one carries the
      // little window), with a rubber seal where they meet
      const leafM = MATS.rep('painted', 0.6, 0.6, 0x8d8a80), hw = iw / 2;
      this.idoorLeaves = [-1, 1].map((s) => {
        const g = new THREE.Group(); g.position.set(cx + s * hw / 2, 0, A.z0 - 0.14); this.group.add(g);
        const sh = new THREE.Shape(), a = -hw / 2, b = hw / 2, r = 0.19, h = A.ih - 0.01;
        // only the outer top corner is rounded, so the two halves together make the arch
        if (s < 0) { sh.moveTo(a, 0); sh.lineTo(b, 0); sh.lineTo(b, h); sh.lineTo(a + r, h); sh.quadraticCurveTo(a, h, a, h - r); sh.closePath(); }
        else { sh.moveTo(a, 0); sh.lineTo(b, 0); sh.lineTo(b, h - r); sh.quadraticCurveTo(b, h, b - r, h); sh.lineTo(a, h); sh.closePath(); }
        const geo = ext(sh, 0.045, 0.008); geo.translate(0, 0, -0.022); meshAt(geo, leafM, 0, 0, 0, 0, g);
        const seal = new THREE.Mesh(new THREE.BoxGeometry(0.02, h - 0.02, 0.06), MATS.get('rubber')); seal.position.set(-s * (hw / 2 - 0.01), h / 2, 0); g.add(seal);
        const band = new THREE.Mesh(new THREE.BoxGeometry(hw - 0.06, 0.08, 0.078), MATS.get('hazard')); band.position.set(0, 0.15, 0); g.add(band);
        const hd = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.03), dm); hd.position.set(-s * (hw / 2 - 0.09), 1.05, -0.045); g.add(hd);
        if (s < 0) { const pane = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.012), this.glassMat); pane.position.set(0, 1.62, -0.03); g.add(pane); }
        return { g, s, x0: cx + s * hw / 2 };
      });
      this.idoor = { open: true, t: 1 };
      // a slim pocket either side on the bay wall: the halves slide away into them out of sight
      for (const s of [-1, 1]) {
        const xa = cx + s * (hw - 0.01), xb = cx + s * (2 * hw + 0.07), xm = (xa + xb) / 2, wp = Math.abs(xb - xa), hp = A.ih + 0.04;
        this.box(wp, hp, 0.03, wallM, xm, hp / 2, A.z0 - 0.225);
        this.box(0.03, hp, 0.2, wallM, xb, hp / 2, A.z0 - 0.14);
        this.pb(D, wp + 0.03, 0.03, 0.23, xm, hp + 0.015, A.z0 - 0.13);
        this.pb(D, 0.035, hp, 0.04, xa, hp / 2, A.z0 - 0.225);
        this.col(Math.min(xa, xb), Math.max(xa, xb), A.z0 - 0.25, A.z0 - 0.04);
      }
      // a track above it, and the pressure lamp over the opening (green: you can go through; red: the lock is cycling)
      this.pb(D, iw * 2 + 0.2, 0.06, 0.06, cx, A.ih + 0.1, A.z0 - 0.17);
      this.airLampMat = new THREE.MeshStandardMaterial({ color: 0x0a1a0a, emissive: 0x30ff60, emissiveIntensity: 0.5 });
      { const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.04), this.airLampMat); l.position.set(cx, A.ih + 0.32, A.z0 - 0.1); this.group.add(l);
        const l2 = l.clone(); l2.position.z = A.z0 + 0.1; this.group.add(l2);
        this.pb(D, 0.24, 0.1, 0.05, cx, A.ih + 0.32, A.z0 - 0.08); this.pb(D, 0.24, 0.1, 0.05, cx, A.ih + 0.32, A.z0 + 0.08); }
      this.sign('AIRLOCK', 0.7, 0.14, cx, A.ih + 0.55, A.z0 - 0.085, Math.PI, { w: 256, h: 52, size: 36, bg: '#1b1b18', fg: '#e0b040' });
      this.sign('OUTER HATCH', 0.8, 0.12, cx, Hd + 0.3, 3.99, Math.PI, { w: 256, h: 40, size: 28, bg: '#1b1b18', fg: '#e0b040' });
      // inside: a caged lamp, a handrail each side, the hatch controls, hazard plates on the floor
      this.pt(D, 0.08, 0.008, cx, 3.25, zc, Math.PI / 2, 0, 0, 12); this.pc('glowWarm', 0.06, 0.06, 0.03, cx, 3.28, zc, 0, 0, 0, 12);
      this.lights.push({ x: cx, y: 3.0, z: zc, color: 0xffb070, power: 0.4, state: 'on', zone: 'out', range: 4, lit: 1, ship: true, phase: 2 });
      for (const x of [A.x0 + 0.13, A.x1 - 0.13]) { this.pc(D, 0.018, 0.018, 1.0, x, 1.15, zc, Math.PI / 2, 0, 0, 8); for (const dz of [-0.5, 0.5]) this.pb(D, 0.05, 0.03, 0.03, x + Math.sign(cx - x) * -0.03, 1.15, zc + dz); }
      this.pb('hazard', W, 0.008, 0.5, cx, 0.004, 3.7); this.pb('grate', A.x1 - A.x0 - 0.16, 0.006, depth - 0.1, cx, 0.003, zc);
      // hatch controls: one inside the chamber, one on the hull beside the hatch
      const ctl = (x, y, z, ry) => {
        const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; this.group.add(g);
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.05), dm); g.add(b);
        for (const [yy, c] of [[0.07, 0x1c8a3a], [-0.06, 0x8a1c14]]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.4 })); k.rotation.x = Math.PI / 2; k.position.set(0, yy, 0.035); g.add(k); }
      };
      ctl(A.x1 - 0.09, 1.35, 3.45, -Math.PI / 2);
      // (the outside one is on the hull beside the doorway, flat to the skin, clear of the hatch when it's open)
      const hx = DOOR.x1 + 0.34, hz = skinW(hx, 1.3);
      ctl(hx, 1.3, hz + 0.02, 0);
      // and the inner door's own: one on the bay wall beside it, one inside the chamber
      ctl(-1.65, 1.3, A.z0 - 0.26, Math.PI); ctl(-1.67, 1.3, A.z0 + 0.07, 0);
      // (worked by pressing the buttons themselves, not by looking at the door)
      this.interact.push({ kind: 'hatch', x: A.x1 - 0.13, y: 1.35, z: 3.45, r: 0.16 });
      this.interact.push({ kind: 'hatch', x: hx, y: 1.3, z: hz + 0.06, r: 0.16 });
      this.interact.push({ kind: 'idoor', x: -1.65, y: 1.3, z: A.z0 - 0.3, r: 0.16 });
      this.interact.push({ kind: 'idoor', x: -1.67, y: 1.3, z: A.z0 + 0.11, r: 0.16 });
      // walls and the inner door are solid (the door only while it's shut)
      this.col(A.x0, A.x0 + 0.08, A.z0 - 0.06, 4.0); this.col(A.x1 - 0.08, A.x1, A.z0 - 0.06, 4.0);
      this.col(A.x0, A.ix0, A.z0 - 0.06, A.z0 + 0.06); this.col(A.ix1, A.x1, A.z0 - 0.06, A.z0 + 0.06);
      this.idoorCol = this.col(A.ix0, A.ix1, A.z0 - 0.07, A.z0 + 0.07, 'idoor');
    }
    // ---------- blast shutters: armoured slat curtains that roll down outside every window for the burning parts of
    // a flight (into the air and out of it), each from a roller housing along the top of its opening ----------
    buildShutters() {
      const [cv, g] = TEX.canvas(128, 256);
      // four slats per tile: each a pressed steel strip, lit along its top lip, grimy in the groove below
      for (let i = 0; i < 4; i++) {
        const y = i * 64, gr = g.createLinearGradient(0, y, 0, y + 64);
        gr.addColorStop(0, '#8a8d8c'); gr.addColorStop(0.12, '#5f6262'); gr.addColorStop(0.8, '#3f4242'); gr.addColorStop(0.9, '#262828'); gr.addColorStop(1, '#141515');
        g.fillStyle = gr; g.fillRect(0, y, 128, 64);
        for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(${90 + Math.random() * 40 | 0},${50 + Math.random() * 20 | 0},30,${0.08 + Math.random() * 0.18})`; g.fillRect(Math.random() * 128, y + 8 + Math.random() * 46, 2 + Math.random() * 10, 1 + Math.random() * 3); }
        for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(200,205,205,.12)'; g.fillRect(Math.random() * 128, y + 10 + Math.random() * 40, 6 + Math.random() * 30, 1); }
        for (const x of [8, 120]) { g.fillStyle = 'rgba(20,20,20,.7)'; g.fillRect(x - 3, y + 30, 6, 6); g.fillStyle = 'rgba(190,190,185,.35)'; g.fillRect(x - 3, y + 30, 5, 2); }
      }
      const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const bump = new THREE.CanvasTexture(cv); bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
      this.shutterMat = new THREE.MeshStandardMaterial({ map: tex, bumpMap: bump, bumpScale: 2.5, metalness: 0.55, roughness: 0.6, side: THREE.DoubleSide });
      const railMat = MATS.get('darkmetal'), TILE = 0.44, up = V(0, 1, 0);
      this.rollers = []; this.shut = { t: 0, target: 0 };
      // a roller curtain between a top edge (TL-TR) and the bottom of its opening (BL-BR); its slats ride down with
      // the curtain's bottom edge, and a heavy rail runs along that edge
      const roller = (TL, TR, BL, BR, parent = this.group, rail = 0.026) => {
        const geo = new THREE.BufferGeometry(), pos = new Float32Array(12), uv = new Float32Array(8);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex([0, 2, 1, 1, 2, 3]);
        const m = new THREE.Mesh(geo, this.shutterMat); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.visible = false; parent.add(m);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(rail, rail, 1, 8), railMat); bar.castShadow = true; bar.visible = false; parent.add(bar);
        const len = TL.distanceTo(BL), wT = TL.distanceTo(TR), wB = BL.distanceTo(BR), bl = V(), br = V(), d = V();
        this.rollers.push((p) => {
          m.visible = bar.visible = p > 0.002;
          if (!m.visible) return;
          bl.lerpVectors(TL, BL, p); br.lerpVectors(TR, BR, p);
          pos.set([TL.x, TL.y, TL.z, TR.x, TR.y, TR.z, bl.x, bl.y, bl.z, br.x, br.y, br.z]);
          const vt = (p * len) / TILE, wb = lerp(wT, wB, p);
          uv.set([0, vt, wT, vt, (wT - wb) / 2, 0, (wT + wb) / 2, 0]);
          geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
          d.subVectors(br, bl); bar.position.addVectors(bl, br).multiplyScalar(0.5); bar.scale.set(1, d.length() + 0.04, 1); bar.quaternion.setFromUnitVectors(up, d.normalize());
        });
      };
      const housing = (A, B, r, parent = this.group) => {
        const d = V().subVectors(B, A), h = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), railMat);
        h.position.addVectors(A, B).multiplyScalar(0.5); h.quaternion.setFromUnitVectors(up, d.normalize()); h.castShadow = true; parent.add(h);
      };
      // the windshield: one wide curtain outside both panes, rolling down the slope from a housing on the brow
      {
        const hw = halfAt(CK.wsTop), n = V(CK.roof - CK.sill, CK.x1 - CK.wsTop, 0).normalize(), off = n.clone().multiplyScalar(0.13);
        const TL = V(CK.wsTop, CK.roof, -hw - 0.06).add(off), TR = V(CK.wsTop, CK.roof, hw + 0.06).add(off);
        const BL = V(CK.x1, CK.sill, -CK.w1 - 0.06).add(off), BR = V(CK.x1, CK.sill, CK.w1 + 0.06).add(off);
        roller(TL, TR, BL, BR, this.group, 0.035);
        const upSlope = V(CK.wsTop - CK.x1, CK.roof - CK.sill, 0).normalize().multiplyScalar(0.05), ho = n.clone().multiplyScalar(0.06).add(upSlope);
        housing(TL.clone().add(ho), TR.clone().add(ho), 0.085);
      }
      // the cockpit's side windows: inside the lined opening, outside the glass, from under the top lining
      {
        const L = Math.hypot(CK.x1 - CK.x0, CK.w0 - CK.w1), th = Math.atan2(CK.w0 - CK.w1, CK.x1 - CK.x0), uTop = ((CK.wsTop - CK.x0) / (CK.x1 - CK.x0)) * L;
        for (const side of [-1, 1]) {
          const dir = V(Math.cos(th), 0, -side * Math.sin(th)), out = V(Math.sin(th), 0, side * Math.cos(th));
          const at = (u, v) => V(CK.x0, v, side * CK.w0).addScaledVector(dir, u).addScaledVector(out, 0.2);
          roller(at(0.35, 2.45), at(uTop - 0.2, 2.45), at(0.35, 1.25), at(uTop - 0.2, 1.25));
        }
      }
      // the bay portholes: a square plate in the wall gap, seen only through the round opening
      for (const [x, z, side] of [[-2.2, -4.0, -1], [-5.0, -4.0, -1], [2.5, 4.0, 1], [-5.8, 4.0, 1]]) {
        const zc = z + side * 0.2;
        roller(V(x - 0.46, 2.22, zc), V(x + 0.46, 2.22, zc), V(x - 0.46, 1.28, zc), V(x + 0.46, 1.28, zc));
      }
      // the little window in the outer hatch: a cover plate on its outer face (it rides along when the hatch slides)
      roller(V(-0.2, 1.75, 0.045), V(0.2, 1.75, 0.045), V(-0.2, 1.35, 0.045), V(0.2, 1.35, 0.045), this.doorMesh, 0.014);
      housing(V(-0.22, 1.77, 0.04), V(0.22, 1.77, 0.04), 0.022, this.doorMesh);
    }
    // close or open every shutter (the ship animates them: a fast hard slam shut, a slower grind open)
    setShutters(closed) {
      const tgt = closed ? 1 : 0;
      if (this.shut.target === tgt) return;
      this.shut.target = tgt;
      SFX.play('servo', null, { vol: 0.9, dur: closed ? 0.75 : 1.5, pitch: closed ? 0.8 : 0.65 });
      SFX.play('shutter', null, { vol: 0.8, dur: closed ? 0.75 : 1.5 });
    }
    // straight to open or shut, silently (a new game, or joining mid-flight)
    snapShutters(closed) { const v = closed ? 1 : 0; this.shut.t = this.shut.target = v; for (const r of this.rollers) r(v); }
    makeMaterials() {
      const S = (o) => new THREE.MeshStandardMaterial(o), B = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
      const L = (r, g, b) => new THREE.MeshStandardMaterial({ color: new THREE.Color(r * 0.25, g * 0.25, b * 0.25), emissive: new THREE.Color(r, g, b), emissiveIntensity: 0.42, roughness: 0.3 });
      // a dial face for the analog gauges
      const [gc, gg] = TEX.canvas(128, 128);
      gg.fillStyle = '#d9d2bd'; gg.beginPath(); gg.arc(64, 64, 62, 0, TAU); gg.fill();
      gg.fillStyle = '#141414'; gg.beginPath(); gg.arc(64, 64, 56, 0, TAU); gg.fill();
      gg.strokeStyle = '#b02a1a'; gg.lineWidth = 7; gg.beginPath(); gg.arc(64, 64, 46, -0.35, 0.75); gg.stroke();
      gg.strokeStyle = '#e8e2d0'; gg.lineWidth = 2;
      for (let i = 0; i <= 20; i++) { const a = -Math.PI * 1.25 + (i / 20) * Math.PI * 1.5, r0 = i % 5 ? 44 : 38; gg.beginPath(); gg.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); gg.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52); gg.stroke(); }
      gg.fillStyle = '#e8e2d0'; gg.font = '13px "Share Tech Mono", monospace'; gg.textAlign = 'center'; gg.fillText('PSI x100', 64, 96);
      const gaugeTex = new THREE.CanvasTexture(gc); gaugeTex.colorSpace = THREE.SRGBColorSpace;
      // cargo netting (alpha-tested)
      const [nc, ng] = TEX.canvas(128, 128);
      ng.clearRect(0, 0, 128, 128); ng.strokeStyle = '#5b5a44'; ng.lineWidth = 5;
      for (let i = -128; i < 256; i += 32) { ng.beginPath(); ng.moveTo(i, 0); ng.lineTo(i + 128, 128); ng.stroke(); ng.beginPath(); ng.moveTo(i + 128, 0); ng.lineTo(i, 128); ng.stroke(); }
      const netTex = new THREE.CanvasTexture(nc); netTex.colorSpace = THREE.SRGBColorSpace; netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(5, 3.5);
      this.cm = {
        red: S({ color: 0xa3231a, roughness: 0.42, metalness: 0.25 }),
        white: S({ color: 0xd2cdc0, roughness: 0.55 }),
        green: S({ color: 0x3f5b3a, roughness: 0.45, metalness: 0.35 }),
        yellow: S({ color: 0xc4961e, roughness: 0.5, metalness: 0.25 }),
        orange: S({ color: 0xc2541a, roughness: 0.75 }),
        olive: S({ color: 0x4a4934, roughness: 0.95 }),
        black: S({ color: 0x151617, roughness: 0.45 }),
        cork: S({ color: 0x8d6b43, roughness: 1 }),
        brass: S({ color: 0xa88a45, metalness: 0.9, roughness: 0.38 }),
        pad: S({ color: 0x302c28, roughness: 0.8 }),
        blue: S({ color: 0x2c4a6e, roughness: 0.5, metalness: 0.2 }),
        tunnel: S({ color: 0x23262a, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }),
        gauge: S({ map: gaugeTex, roughness: 0.25, emissive: 0xffffff, emissiveMap: gaugeTex, emissiveIntensity: 0.15 }),
        net: S({ map: netTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }),
        noteY: S({ color: 0xe6cf63, roughness: 0.9, side: THREE.DoubleSide }),
        noteP: S({ color: 0xd98aa0, roughness: 0.9, side: THREE.DoubleSide }),
        noteB: S({ color: 0x8cc4d8, roughness: 0.9, side: THREE.DoubleSide }),
        // indicator lamps: small lit lenses set in the panels, dim enough that they never read as lights floating in the dark
        glowRed: L(0.95, 0.12, 0.06), glowAmber: L(0.95, 0.55, 0.1), glowGreen: L(0.25, 0.9, 0.35), glowBlue: L(0.3, 0.6, 1.0),
        glowWarm: B(1.7, 1.4, 0.95),
      };
      // all of it worn the way a working ship wears: chipped and scuffed paint, padding gone shiny and creased, brass
      // rubbed bright (see MATS.wear)
      for (const n of ['red', 'white', 'green', 'yellow', 'orange', 'blue', 'olive']) MATS.wear(this.cm[n], { kind: 'paint', k: [0.55, 0.42, 0.002, 0.25], bare: 0x6a6e70, edge: 0.018 });
      MATS.wear(this.cm.black, { kind: 'paint', k: [0.55, 0.28, 0.0015, 0.7], bare: 0x484b4e, edge: 0.012 });
      MATS.wear(this.cm.pad, { kind: 'vinyl', k: [0.55, 0.05, 0.0016, 0.6], bare: 0x2a2420, s: 1.6 });
      MATS.wear(this.cm.brass, { kind: 'metal', k: [0.4, 0.15, 0.0008], bare: 0xd8c08a, s: 2 });
      MATS.wear(this.cm.cork, { kind: 'vinyl', k: [0.5, 0, 0.002, 0.3], s: 2 });
    }
    buildCockpit() {
      const dm = MATS.get('darkmetal');
      const L = Math.hypot(CK.x1 - CK.x0, CK.w0 - CK.w1), th = Math.atan2(CK.w0 - CK.w1, CK.x1 - CK.x0);
      const uTop = ((CK.wsTop - CK.x0) / (CK.x1 - CK.x0)) * L;
      // angled side walls with side windows
      for (const side of [-1, 1]) {
        const mk = (depth, off, mat) => {
          const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(L, 0); s.lineTo(L, CK.sill); s.lineTo(uTop, CK.roof); s.lineTo(0, CK.roof); s.closePath();
          const hole = new THREE.Path(); hole.moveTo(0.35, 1.25); hole.lineTo(uTop - 0.2, 1.25); hole.lineTo(uTop - 0.2, 2.45); hole.lineTo(0.35, 2.45); hole.closePath(); s.holes.push(hole);
          const m4 = new THREE.Matrix4().makeTranslation(CK.x0, 0, side * CK.w0).multiply(new THREE.Matrix4().makeRotationY(side > 0 ? th : -th));
          m4.multiply(new THREE.Matrix4().makeTranslation(0, 0, side > 0 ? off : -off - depth));
          return this.extrude(s, depth, mat, m4);
        };
        mk(0.16, 0, MATS.rep('metal', 0.34, 0.34));
        const wg = new THREE.Mesh(new THREE.PlaneGeometry(uTop - 0.55, 1.2), this.glassMat); wg.castShadow = false;
        wg.position.set(CK.x0 + Math.cos(th) * ((uTop + 0.15) / 2), 1.85, side * (CK.w0 - Math.sin(th) * ((uTop + 0.15) / 2)) + side * 0.09);
        wg.rotation.y = side > 0 ? th : -th; this.group.add(wg);
        const dir = V(Math.cos(th), 0, -side * Math.sin(th)), out = V(Math.sin(th), 0, side * Math.cos(th)), ry = side > 0 ? th : -th;
        const at = (u, v, o) => V(CK.x0, v, side * CK.w0).addScaledVector(dir, u).addScaledVector(out, o);
        const u0 = 0.35, u1 = uTop - 0.2, um = (u0 + u1) / 2;
        // the opening is lined right through to the hull skin, then framed on the outside
        const lining = (u, v, w, h) => { const p = at(u, v, 0.215); this.pb('darkmetal', w, h, 0.13, p.x, p.y, p.z, 0, ry, 0); };
        lining(um, 2.46, u1 - u0, 0.03); lining(um, 1.24, u1 - u0, 0.03); lining(u0 - 0.01, 1.85, 0.03, 1.2); lining(u1 + 0.01, 1.85, 0.03, 1.2);
        const bar = (u, v, w, h) => { const p = at(u, v, 0.335); this.pb('darkmetal', w, h, 0.07, p.x, p.y, p.z, 0, ry, 0); };
        bar(um, 2.5, u1 - u0 + 0.22, 0.11); bar(um, 1.2, u1 - u0 + 0.22, 0.11); bar(u0 - 0.05, 1.85, 0.11, 1.4); bar(u1 + 0.05, 1.85, 0.11, 1.4);
        for (let i = 0; i < 6; i++) { const p = at(u0 + (u1 - u0) * (i / 5), 2.5, 0.375); this.ps('steelBolt', 0.018, p.x, p.y, p.z, 1, 1, 1, 6); const q = at(u0 + (u1 - u0) * (i / 5), 1.2, 0.375); this.ps('steelBolt', 0.018, q.x, q.y, q.z, 1, 1, 1, 6); }
        this.obb(CK.x0 + Math.cos(th) * L / 2, side * (CK.w0 - Math.sin(th) * L / 2), L / 2, 0.14, ry);
        // and keep people outside off the skin
        const sk = at(L / 2, 0, 0.2); this.obb(sk.x, sk.z, L / 2, 0.14, ry);
      }
      // floor, roof, chin
      const trap = (xa, wa, xb, wb) => { const s = new THREE.Shape(); s.moveTo(xa, -wa); s.lineTo(xb, -wb); s.lineTo(xb, wb); s.lineTo(xa, wa); s.closePath(); return s; };
      const flat = (shape, y0, depth, mat) => this.extrude(shape, depth, mat, new THREE.Matrix4().makeTranslation(0, y0, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
      flat(trap(CK.x0, 3.3, 8.25, 2.05), 0, 0.2, MATS.rep('grate', 1, 1));
      flat(trap(CK.x0, CK.w0 + 0.2, CK.wsTop, halfAt(CK.wsTop) + 0.2), CK.roof + 0.2, 0.2, MATS.rep('metal', 0.34, 0.34));
      // windshield
      const wsGeo = new THREE.BufferGeometry();
      const a = V(CK.x1, CK.sill, -CK.w1), b = V(CK.x1, CK.sill, CK.w1), c = V(CK.wsTop, CK.roof, halfAt(CK.wsTop)), d = V(CK.wsTop, CK.roof, -halfAt(CK.wsTop));
      wsGeo.setFromPoints([a, b, c, a, c, d]); wsGeo.computeVertexNormals();
      const ws = new THREE.Mesh(wsGeo, this.glassMat); this.group.add(ws);
      this.strut(V(CK.x1, CK.sill, 0), V(CK.wsTop, CK.roof, 0), 0.07, dm);
      // (two more posts split it into four panes, an airliner's cockpit glazing)
      for (const s of [-1, 1]) this.strut(V(CK.x1, CK.sill, s * CK.w1 * 0.52), V(CK.wsTop, CK.roof, s * halfAt(CK.wsTop) * 0.52), 0.07, dm);
      this.strut(a, d, 0.1, dm); this.strut(b, c, 0.1, dm);
      this.strut(V(CK.x1, CK.sill, -CK.w1), V(CK.x1, CK.sill, CK.w1), 0.12, dm);
      this.strut(c, d, 0.12, dm);
      // dashboard: body + slanted console top with screens and buttons
      this.box(0.75, 0.88, 2 * CK.w1 - 0.1, MATS.get('painted'), 7.85, 0.44, 0);
      const top = this.box(0.85, 0.1, 2 * CK.w1 - 0.1, dm, 7.8, 0.93, 0); top.rotation.z = 0.35;
      const nrm = V(-Math.sin(0.35), Math.cos(0.35), 0), tan = V(Math.cos(0.35), Math.sin(0.35), 0), across = V(0, 0, 1);
      const surf = (along, z, lift = 0.056) => V(7.8, 0.93, 0).addScaledVector(tan, along).addScaledVector(across, z).addScaledVector(nrm, lift);
      this.screens = [];
      for (let i = 0; i < 3; i++) {
        const cv = TEX.canvas(256, 160), tex = new THREE.CanvasTexture(cv[0]); tex.colorSpace = THREE.SRGBColorSpace;
        const geo = new THREE.PlaneGeometry(0.72, 0.42);
        geo.applyMatrix4(new THREE.Matrix4().makeBasis(across, tan, nrm).setPosition(surf(0.08, -1.05 + i * 1.05, 0.058)));
        const scr = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex })); this.group.add(scr);
        this.screens.push({ cv, tex, kind: i });
      }
      // the key banks: worn charcoal keycaps, the odd function key painted red, amber or green, and over each of those a
      // little lit lamp (dim, so it reads as a lens in the panel and not a light of its own)
      const btnGeo = new THREE.BoxGeometry(0.036, 0.022, 0.036), btnMat = MATS.wear(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.1 }), { kind: 'paint', k: [0.5, 0.2, 0.0006, 0.6], bare: 0x8a8a86, s: 3 });
      const btns = new THREE.InstancedMesh(btnGeo, btnMat, 60); const col = new THREE.Color(), pal = [0x242422, 0x353430, 0x242422, 0x8a2a1c, 0x353430, 0x242422, 0x9a7a28, 0x2c2b28, 0x2a5a34];
      const lamp = { 3: 'glowRed', 6: 'glowAmber', 8: 'glowGreen' };
      const bm = new THREE.Matrix4(), q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, nrm, tan.clone().negate()));
      for (let i = 0; i < 60; i++) {
        const row = i % 3, colI = Math.floor(i / 3), k = (i * 7 + row) % pal.length;
        bm.compose(surf(-0.3 + row * 0.07, -1.7 + colI * 0.18, 0.06), q, V(1, 1, 1)); btns.setMatrixAt(i, bm);
        btns.setColorAt(i, col.set(pal[k]));
        if (lamp[k]) { const p = surf(-0.3 + row * 0.07, -1.7 + colI * 0.18 + 0.042, 0.054); this.pb(lamp[k], 0.012, 0.006, 0.012, p.x, p.y, p.z, 0, 0, 0.35); }
      }
      btns.instanceColor.needsUpdate = true; this.group.add(btns); this.buttons = btns;
      this.box(0.06, 0.06, 2 * CK.w1 - 0.3, new THREE.MeshBasicMaterial({ color: 0x5a1008 }), 7.48, 0.2, 0);
      this.col(7.4, 8.5, -2.05, 2.05);
      // seats
      for (const s of [-1, 1]) this.seat(6.15, s * 0.95);
      this.col(5.75, 6.55, 0.62, 1.28); this.col(5.75, 6.55, -1.28, -0.62);
      // somewhere to sit: where you sit (cushion), your eyes, the way you face, where you step out
      this.seats = this.seats || [];
      for (const s of [-1, 1]) this.seats.push({ x: 6.17, z: s * 0.95, y: 0.49, yaw: -Math.PI / 2, eye: V(6.02, 1.2, s * 0.95), exit: { x: 5.35, z: s * 0.95 } });
      // centre pedestal + launch lever: a heavy T-handled lever swinging through a slotted quadrant gate between two
      // curved guard rails, a hazard-striped deck plate, a lamp that shows it's live
      this.box(0.5, 0.76, 0.5, MATS.get('painted'), 6.65, 0.38, 0);
      const pt = this.box(0.56, 0.06, 0.56, dm, 6.65, 0.79, 0); pt.rotation.z = 0.12;
      this.box(0.3, 0.025, 0.46, MATS.get('hazard'), 6.66, 0.825, 0).rotation.z = 0.12;
      const PV = V(6.65, 0.86, 0);
      // the quadrant: a half-drum the lever rises out of, with a dark slot along its crown, and its two guard rails
      { const q = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 20, 1, false, -Math.PI / 2, Math.PI), dm); q.rotation.x = -Math.PI / 2; q.position.copy(PV); q.castShadow = true; this.group.add(q); }
      this.pt('black', 0.152, 0.014, PV.x, PV.y, PV.z, 0, 0, 0, 20, Math.PI);
      for (const dz of [-0.13, 0.13]) {
        this.pt('steelBolt', 0.3, 0.014, PV.x, PV.y, PV.z + dz, 0, 0, 0.35, 20, Math.PI - 0.7);
        for (const a of [0.35, Math.PI - 0.35]) this.pc('steelBolt', 0.016, 0.016, 0.14, PV.x + Math.cos(a) * 0.3, 0.9, PV.z + dz, 0, 0, 0, 8);
      }
      const lv = new THREE.Group(); lv.position.copy(PV); this.group.add(lv);
      const lm = (geo, m, x, y, z, rx = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.x = rx; me.castShadow = true; lv.add(me); return me; };
      const red = new THREE.MeshStandardMaterial({ color: 0xc01a10, roughness: 0.35, emissive: 0x200000 });
      lm(new THREE.BoxGeometry(0.05, 0.4, 0.04), MATS.get('steelBolt'), 0, 0.2, 0);
      lm(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), dm, 0, 0.0, 0, Math.PI / 2);
      lm(new THREE.CylinderGeometry(0.034, 0.034, 0.22, 12), this.cm.black, 0, 0.42, 0, Math.PI / 2);
      for (const z of [-0.12, 0.12]) lm(new THREE.SphereGeometry(0.038, 12, 8), red, 0, 0.42, z);
      lm(new THREE.BoxGeometry(0.06, 0.05, 0.06), red, 0, 0.36, 0);
      lv.rotation.z = 0.45; this.lever = lv;
      this.pb('glowAmber', 0.05, 0.02, 0.05, 6.82, 0.85, -0.17, 0, 0, 0.12); this.pb('darkmetal', 0.08, 0.02, 0.08, 6.82, 0.84, -0.17, 0, 0, 0.12);
      this.sign('LAUNCH', 0.3, 0.09, 6.395, 0.62, 0, -Math.PI / 2, { w: 256, h: 76, size: 50, bg: '#1b1b18', fg: '#e0b040' });
      this.col(6.38, 6.92, -0.27, 0.27);
      this.interact.push({ kind: 'lever', x: this.leverPos.x, y: this.leverPos.y, z: this.leverPos.z, r: 0.42 });
      // the jump drive's lever, out beside the port seat on a pedestal of its own: smaller than LAUNCH, a green knob,
      // and a lamp that lights green once a course is plotted at the terminal (ROUTE). Pulling it makes the jump (or
      // the hop across to a moon); the LAUNCH lever only ever lands and takes off
      {
        const JX = 6.5, JZ = -1.72, JY = 0.78;
        this.box(0.34, 0.72, 0.34, MATS.get('painted'), JX, 0.36, JZ);
        this.box(0.4, 0.05, 0.4, dm, JX, 0.735, JZ);
        this.box(0.2, 0.02, 0.3, MATS.get('hazard'), JX, 0.765, JZ);
        { const q = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 16, 1, false, -Math.PI / 2, Math.PI), dm); q.rotation.x = -Math.PI / 2; q.position.set(JX, JY, JZ); q.castShadow = true; this.group.add(q); }
        const jl = new THREE.Group(); jl.position.set(JX, JY, JZ); this.group.add(jl);
        const green = new THREE.MeshStandardMaterial({ color: 0x1f9a6a, roughness: 0.35, emissive: 0x041a10 });
        for (const [geo, m, y] of [[new THREE.BoxGeometry(0.035, 0.3, 0.03), MATS.get('steelBolt'), 0.15], [new THREE.SphereGeometry(0.048, 14, 10), green, 0.32]]) { const me = new THREE.Mesh(geo, m); me.position.y = y; me.castShadow = true; jl.add(me); }
        jl.rotation.z = 0.45; this.jumpLever = jl; this.jumpT = 0;
        this.jumpLamp = new THREE.MeshBasicMaterial({ color: 0x0c2a1c });
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), this.jumpLamp); lamp.position.set(JX + 0.12, 0.775, JZ + 0.13); this.group.add(lamp);
        this.sign('JUMP', 0.24, 0.08, JX - 0.175, 0.55, JZ, -Math.PI / 2, { w: 256, h: 84, size: 54, bg: '#1b1b18', fg: '#40e0a0' });
        this.col(JX - 0.2, JX + 0.2, JZ - 0.2, JZ + 0.2);
        this.jumpPos = V(JX, 1.0, JZ);
        this.interact.push({ kind: 'jump', x: JX, y: 1.0, z: JZ, r: 0.36 });
      }
      // overhead panel
      this.box(1.4, 0.09, 1.5, dm, 5.8, CK.roof - 0.05, 0);
      const ob = new THREE.InstancedMesh(btnGeo, btnMat, 24);
      for (let i = 0; i < 24; i++) { bm.compose(V(5.3 + (i % 6) * 0.2, CK.roof - 0.1, -0.55 + Math.floor(i / 6) * 0.36), new THREE.Quaternion(), V(1, 1, 1)); ob.setMatrixAt(i, bm); ob.setColorAt(i, col.set(pal[(i * 5) % pal.length])); }
      ob.instanceColor.needsUpdate = true; this.group.add(ob);
      // cockpit glow
      this.lights.push({ x: 5.6, y: 2.55, z: 0, color: 0xffc89a, power: 0.45, state: 'on', zone: 'out', range: 6, lit: 1, ship: true, phase: 1 });
    }
    // a pilot's seat: pedestal on floor rails, bolstered cushion and back, headrest wings, armrests with a
    // control pad, and a five-point harness (shoulder straps over the backrest, lap belt, crotch strap, buckle)
    seat(x, z) {
      const L = 'seat', D = 'darkmetal', tilt = 0.14, bx = x - 0.27;
      for (const s of [-1, 1]) this.pb(D, 0.9, 0.04, 0.06, x, 0.02, z + s * 0.2);
      this.pb(D, 0.3, 0.06, 0.3, x, 0.07, z); this.pc(D, 0.07, 0.09, 0.26, x, 0.23, z);
      this.pb(D, 0.5, 0.05, 0.5, x + 0.02, 0.35, z);
      this.pb(L, 0.56, 0.11, 0.48, x + 0.02, 0.43, z);
      for (const s of [-1, 1]) this.pb(L, 0.56, 0.14, 0.07, x + 0.02, 0.46, z + s * 0.26);
      this.pb(L, 0.13, 0.86, 0.48, bx, 0.92, z, 0, 0, tilt);
      for (const s of [-1, 1]) this.pb(L, 0.15, 0.8, 0.08, bx + 0.02, 0.92, z + s * 0.27, 0, 0, tilt);
      this.pb(L, 0.14, 0.26, 0.36, x - 0.35, 1.47, z, 0, 0, tilt);
      for (const s of [-1, 1]) this.pb(L, 0.12, 0.24, 0.07, x - 0.33, 1.47, z + s * 0.2, 0, -s * 0.35, tilt);
      this.pb(D, 0.06, 0.9, 0.42, bx - 0.09, 0.95, z, 0, 0, tilt);
      for (const s of [-1, 1]) {
        this.pb(D, 0.44, 0.05, 0.08, x - 0.02, 0.66, z + s * 0.33);
        this.pb('pad', 0.36, 0.05, 0.09, x - 0.02, 0.705, z + s * 0.33);
        this.pb('black', 0.1, 0.03, 0.07, x + 0.1, 0.74, z + s * 0.33);
        this.pb('glowAmber', 0.015, 0.008, 0.015, x + 0.08, 0.757, z + s * 0.33 + 0.015);
        this.pb('glowGreen', 0.015, 0.008, 0.015, x + 0.12, 0.757, z + s * 0.33 - 0.015);
        // shoulder strap: over the top of the backrest, down the chest to the buckle
        this.beam('orange', V(bx - 0.06, 1.38, z + s * 0.12), V(bx + 0.1, 1.3, z + s * 0.13), 0.012, 0.055);
        this.beam('orange', V(x + 0.02, 0.62, z + s * 0.07), V(bx + 0.1, 1.3, z + s * 0.13), 0.012, 0.055);
        this.beam('orange', V(x + 0.05, 0.5, z + s * 0.24), V(x + 0.05, 0.6, z + s * 0.05), 0.012, 0.055);
      }
      this.beam('orange', V(x + 0.24, 0.49, z), V(x + 0.05, 0.6, z), 0.012, 0.055);
      this.pc('steelBolt', 0.045, 0.045, 0.02, x + 0.03, 0.61, z, 0, 0, Math.PI / 2 - 0.4, 14);
    }
    buildBay() {
      const dm = MATS.get('darkmetal');
      // the terminal: a steel desk with a drawer pedestal, a hulking old CRT terminal on a stand, a worn keyboard and a
      // trackball, and the computer itself under the desk (drive bays, a column of lights), cabled up behind
      {
        const D = 'darkmetal', P = 'painted', x0 = 1.9, x1 = 3.4, z0 = -3.95, z1 = -2.95, top = 0.9, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        this.pb(P, x1 - x0, 0.045, z1 - z0, cx, top - 0.0225, cz); this.top(x0 + 0.02, x1 - 0.02, z0 + 0.02, z1 - 0.02, top);
        // (what's on it: the monitor on its stand, the coffee machine, a mug, the desk lamp, the trackball, the keyboard)
        for (const [a, b, c, d] of [[2.12, 3.18, -4, -3.55], [1.92, 2.12, -3.87, -3.62], [2.0, 2.14, -3.2, -3.1], [3.0, 3.38, -3.88, -3.47], [3.03, 3.17, -3.09, -2.95], [2.29, 2.95, -3.27, -3.05]]) this.top(a, b, c, d, top, 'on');
        this.pc(P, 0.024, 0.024, x1 - x0, cx, top - 0.024, z1, 0, 0, Math.PI / 2, 10);
        this.pb('pad', 0.9, 0.005, 0.42, 2.75, top + 0.0025, -3.18);
        // the pedestal: three drawers with pulls (the bottom one won't quite shut)
        const px = x0 + 0.24, ph = top - 0.045;
        this.pb(P, 0.46, ph, 0.94, px, ph / 2, cz);
        for (let i = 0; i < 3; i++) { const y = 0.15 + i * 0.27, out = i === 0 ? 0.05 : 0; this.pb(P, 0.42, 0.24, 0.02, px, y, z1 + 0.012 + out); this.pb('steelBolt', 0.15, 0.02, 0.025, px, y + 0.07, z1 + 0.032 + out); this.pb('paper', 0.08, 0.035, 0.004, px, y + 0.03, z1 + 0.024 + out); }
        // the right-hand side panel, a modesty panel at the back, a footrest bar
        this.pb(P, 0.04, ph, 0.94, x1 - 0.02, ph / 2, cz);
        this.pb(P, x1 - x0 - 0.5, 0.42, 0.025, cx + 0.23, 0.6, z0 + 0.07);
        this.pc('steelBolt', 0.014, 0.014, x1 - x0 - 0.5, cx + 0.23, 0.13, -3.45, 0, 0, Math.PI / 2, 8);
        // the computer: a grey tower under the desk, drive bays, status lights, a vent grille down the side
        const tx = 3.07, tz = -3.5;
        this.pb('white', 0.2, 0.52, 0.5, tx, 0.26, tz);
        for (let i = 0; i < 3; i++) { this.pb('black', 0.15, 0.035, 0.008, tx, 0.44 - i * 0.055, tz + 0.252); this.pb('black', 0.02, 0.006, 0.006, tx + 0.05, 0.44 - i * 0.055, tz + 0.257); }
        for (let i = 0; i < 4; i++) this.pb(i === 2 ? 'glowAmber' : 'glowGreen', 0.012, 0.012, 0.006, tx - 0.06, 0.26 - i * 0.03, tz + 0.253);
        this.pc('black', 0.022, 0.022, 0.01, tx + 0.05, 0.2, tz + 0.252, Math.PI / 2, 0, 0, 12);
        for (let i = 0; i < 7; i++) this.pb('black', 0.004, 0.012, 0.36, tx + 0.102, 0.12 + i * 0.045, tz);
        this.tube('black', [V(2.65, 1.2, -3.98), V(2.8, 0.88, -3.94), V(3.0, 0.55, -3.9), V(3.06, 0.42, -3.76)], 0.014, 14);
        this.tube('black', [V(2.5, top + 0.01, -3.25), V(2.55, top + 0.02, -3.55), V(2.62, 0.86, -3.94)], 0.006, 10);
        // the monitor: a deep tapered shell, a heavy bezel with a chin of knobs and a brand plate, on a stand
        const mg = new THREE.Group(); mg.position.set(2.65, 1.37, -3.69); mg.rotation.x = -0.15; this.group.add(mg);
        const shell = MATS.rep('painted', 0.5, 0.5, 0xb4ae9a);
        const mm = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; mg.add(me); return me; };
        for (const [w, h, x, y] of [[1.06, 0.07, 0, 0.31], [1.06, 0.13, 0, -0.34], [0.09, 0.56, -0.485, -0.005], [0.09, 0.56, 0.485, -0.005]]) mm(new THREE.BoxGeometry(w, h, 0.075), shell, x, y, 0);
        { const g = new THREE.BoxGeometry(1.0, 0.7, 0.27); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) { p.setX(i, p.getX(i) * 0.62); p.setY(i, p.getY(i) * 0.62); } g.computeVertexNormals(); mm(g, shell, 0, -0.01, -0.17); }
        mm(new THREE.BoxGeometry(0.9, 0.58, 0.02), MATS.get('darkmetal'), 0, -0.005, 0.0);
        for (const kx of [0.3, 0.38]) { const k = mm(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12), MATS.get('darkmetal'), kx, -0.345, 0.045); k.rotation.x = Math.PI / 2; }
        mm(new THREE.BoxGeometry(0.014, 0.014, 0.01), this.cm.glowGreen, 0.43, -0.345, 0.04);
        { const pl = mm(new THREE.PlaneGeometry(0.2, 0.045), new THREE.MeshStandardMaterial({ map: TEX.sign('MERCY  T-400', { w: 256, h: 56, size: 30, bg: '#2a2824', fg: '#c9b88a', border: false }), roughness: 0.6 }), -0.32, -0.345, 0.038); pl.castShadow = false; }
        this.termCanvas = TEX.canvas(256, 160);
        this.termTex = new THREE.CanvasTexture(this.termCanvas[0]); this.termTex.colorSpace = THREE.SRGBColorSpace;
        { const scr = mm(new THREE.PlaneGeometry(0.88, 0.55), new THREE.MeshBasicMaterial({ map: this.termTex }), 0, -0.005, 0.012); scr.castShadow = false; }
        this.pb('darkmetal', 0.1, 0.16, 0.1, 2.65, top + 0.08, -3.7); this.pb('darkmetal', 0.38, 0.025, 0.3, 2.65, top + 0.0125, -3.7);
        // the keyboard: a sloped steel base, rows of worn keys, a spacebar; a trackball beside it
        { const kb = mat(2.62, top + 0.02, -3.16, 0.07, 0, 0), add = (m, w, h, d, x, y, z) => this.put(m, new THREE.BoxGeometry(w, h, d), kb.clone().multiply(mat(x, y, z)));
          add('darkmetal', 0.66, 0.03, 0.22, 0, 0, 0);
          for (let r = 0; r < 4; r++) for (let c = 0; c < 14; c++) add(r === 0 || c === 0 || c === 13 ? 'black' : 'white', 0.034, 0.016, 0.034, -0.273 + c * 0.042, 0.022, -0.07 + r * 0.042);
          add('white', 0.24, 0.016, 0.034, 0, 0.022, 0.098); }
        this.pb('black', 0.13, 0.03, 0.13, 3.1, top + 0.015, -3.02); this.ps('red', 0.032, 3.1, top + 0.035, -3.02, 1, 1, 1, 12);
      }
      this.drawTerminal();
      this.col(1.88, 3.42, -4.0, -2.93);
      this.interact.push({ kind: 'terminal', x: this.termPos.x, y: 1.2, z: -3.2, r: 0.75 });
      // quota monitor
      this.monCanvas = TEX.canvas(512, 224);
      this.monTex = new THREE.CanvasTexture(this.monCanvas[0]); this.monTex.colorSpace = THREE.SRGBColorSpace;
      this.box(2.3, 1.05, 0.08, dm, 0.0, 2.3, -3.95);
      const mon = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 0.94), new THREE.MeshBasicMaterial({ map: this.monTex })); mon.position.set(0.0, 2.3, -3.905); this.group.add(mon);
      this.monMesh = mon;   // the main screen (the crew body-cams take it over, see crewcam.js)
      // its controls, on a small panel under it: previous view, radar sweep, next view
      this.box(0.86, 0.3, 0.08, dm, 0.0, 1.5, -3.93);
      for (const [x, act, label, col] of [[-0.27, 'prev', '◀', 0x34342f], [0, 'radar', 'RADAR', 0x6a1810], [0.27, 'next', '▶', 0x34342f]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.04), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.15, roughness: 0.5 }));
        b.position.set(x, 1.45, -3.875); this.group.add(b);
        this.sign(label, 0.17, 0.05, x, 1.565, -3.884, 0, { w: 128, h: 38, size: 28, bold: true, bg: '#1b1b18', fg: '#d0a040', border: false, dirty: false });
        this.interact.push({ kind: 'monitor', act, x, y: 1.45, z: -3.84, r: 0.11 });
      }
      // the charging station: a heavy yellow unit on a bolted backplate, hazard-striped down its sides; a cradle across its
      // face (a black bezel, brass contacts at the back, a lip to stand a torch on); a little readout over it (READY, a
      // bar that fills while it charges, FULL) beside a high-voltage plate, a row of lamps under its cap that chase while
      // it works; its feed comes down a conduit from the ceiling, and a cable runs down to the cell on the deck
      {
        const cx = -3.6, cy = 1.32, zf = -3.805, D = 'darkmetal', SB = 'steelBolt';
        this.pb(D, 0.64, 0.74, 0.025, cx, cy, -3.965);
        for (const a of [-1, 1]) for (const b of [-1, 1]) this.ps(SB, 0.014, cx + a * 0.29, cy + b * 0.335, -3.952, 1, 1, 0.6, 6);
        this.pb('yellow', 0.5, 0.56, 0.15, cx, cy, -3.88);
        for (const s of [-1, 1]) this.pb('hazard', 0.03, 0.5, 0.152, cx + s * 0.236, cy - 0.005, -3.88);
        this.pb(D, 0.54, 0.045, 0.18, cx, cy + 0.3, -3.88); this.pb(D, 0.54, 0.03, 0.17, cx, cy - 0.295, -3.882);
        for (const s of [-1, 1]) this.ps(SB, 0.009, cx + s * 0.2, cy + 0.3, zf - 0.005, 1, 0.6, 1, 6);
        // the cradle
        this.pb('black', 0.34, 0.15, 0.02, cx, cy - 0.09, zf + 0.004); this.pb('rubber', 0.3, 0.11, 0.006, cx, cy - 0.09, zf + 0.015);
        for (const s of [-1, 1]) { this.pb('brass', 0.035, 0.055, 0.008, cx + s * 0.07, cy - 0.09, zf + 0.019); this.pb('brass', 0.008, 0.02, 0.004, cx + s * 0.07, cy - 0.055, zf + 0.022); }
        this.pb(D, 0.36, 0.022, 0.085, cx, cy - 0.177, zf + 0.04); this.pb(D, 0.36, 0.045, 0.012, cx, cy - 0.158, zf + 0.078);
        // the readout in a black bezel, and the high-voltage plate beside it
        this.pb('black', 0.27, 0.115, 0.012, cx - 0.06, cy + 0.13, zf + 0.004);
        const [cv, cg] = TEX.canvas(128, 48), ctex = new THREE.CanvasTexture(cv); ctex.colorSpace = THREE.SRGBColorSpace; ctex.magFilter = THREE.NearestFilter;
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.09), new THREE.MeshBasicMaterial({ map: ctex })); scr.position.set(cx - 0.06, cy + 0.13, zf + 0.0112); this.group.add(scr);
        {
          const [wc, wg] = TEX.canvas(64, 58);
          wg.fillStyle = '#e8b018'; wg.strokeStyle = '#141414'; wg.lineWidth = 5; wg.lineJoin = 'round';
          wg.beginPath(); wg.moveTo(32, 5); wg.lineTo(60, 53); wg.lineTo(4, 53); wg.closePath(); wg.fill(); wg.stroke();
          wg.fillStyle = '#141414'; wg.beginPath(); wg.moveTo(36, 16); wg.lineTo(24, 36); wg.lineTo(31, 36); wg.lineTo(27, 49); wg.lineTo(40, 29); wg.lineTo(33, 29); wg.lineTo(37, 16); wg.closePath(); wg.fill();
          const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace;
          const w = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.09), new THREE.MeshStandardMaterial({ map: wt, transparent: true, alphaTest: 0.5, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
          w.position.set(cx + 0.14, cy + 0.13, zf + 0.002); this.group.add(w);
        }
        this.sign('CHARGE  48V DC', 0.22, 0.04, cx, cy - 0.235, zf + 0.002, 0, { w: 256, h: 46, size: 30, bold: true, bg: '#141414', fg: '#e8b018', border: false, dirty: false });
        // its lamps (each its own, so they can chase)
        this.chg = { g: cg, tex: ctex, t: null, last: null, lamps: [] };
        for (let i = 0; i < 5; i++) {
          const m = new THREE.MeshBasicMaterial({ color: 0x0c140c }), l = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.016, 0.01), m);
          l.position.set(cx - 0.12 + i * 0.06, cy + 0.235, zf + 0.004); this.group.add(l); this.chg.lamps.push(m);
          this.pb('black', 0.032, 0.026, 0.006, cx - 0.12 + i * 0.06, cy + 0.235, zf + 0.0005);
        }
        this.drawCharger();
        // the feed down from the ceiling, clamped to the wall, into the top of the unit
        this.pc(D, 0.022, 0.022, H - 0.15 - (cy + 0.32), cx + 0.16, (H - 0.15 + cy + 0.32) / 2, -3.935, 0, 0, 0, 8);
        for (let y = cy + 0.6; y < H - 0.3; y += 0.55) { this.pb(D, 0.07, 0.03, 0.03, cx + 0.16, y, -3.955); this.ps(SB, 0.008, cx + 0.16, y, -3.935, 1, 1, 1, 5); }
        this.pc(D, 0.035, 0.035, 0.04, cx + 0.16, cy + 0.33, -3.935, 0, 0, 0, 10);
      }
      this.interact.push({ kind: 'charger', x: -3.6, y: 1.3, z: -3.75, r: 0.5 });
      // storage racks at the back + engine-room door
      for (const z of [-2.6, 2.6]) {
        for (const y of [0.05, 0.9, 1.75]) this.box(0.7, 0.05, 2.0, MATS.get('painted'), -6.65, y, z);
        for (const dz of [-0.95, 0.95]) this.box(0.05, 2.2, 0.05, dm, -6.3, 1.1, z + dz);
        this.col(-7.05, -6.25, z - 1.0, z + 1.0);
      }
      this.box(1.1, 2.3, 0.06, MATS.get('door'), -7.03, 1.15, 0, Math.PI / 2);
      { const hw = []; DoorKit.lever(hw, 1.1, 0.06); DoorKit.hinges(hw, 2.3); const m = DoorKit.mesh(DoorKit.place(hw, mat(-0.55, 0, 0))); m.position.set(-7.03, 0, 0); m.rotation.y = Math.PI / 2; this.group.add(m); }
      const es = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: TEX.sign('ENGINE ROOM', { w: 256, h: 64, size: 30, bg: '#1b1b18', fg: '#d0a040' }) }));
      es.position.set(-6.99, 2.5, 0); es.rotation.y = Math.PI / 2; this.group.add(es);
      // the crew's corner under the starboard porthole: a padded bench on a steel frame, a table bolted to the deck, and
      // what's left of lunch and last night's card game
      {
        const D = 'darkmetal', bz = 3.62, tx = 2.55, tz = 2.95, ty = 0.76;
        this.pb('pad', 1.5, 0.09, 0.42, 2.55, 0.465, bz); this.pb(D, 1.52, 0.04, 0.44, 2.55, 0.4, bz); this.top(1.82, 3.28, bz - 0.2, bz + 0.18, 0.51);
        for (const x of [1.86, 3.24]) for (const z of [bz - 0.17, bz + 0.17]) this.pb(D, 0.04, 0.38, 0.04, x, 0.19, z);
        this.pb(D, 1.4, 0.03, 0.03, 2.55, 0.1, bz - 0.17);
        this.pb('pad', 1.5, 0.34, 0.08, 2.55, 0.74, 3.86, -0.12, 0, 0);
        // the table: a scuffed wooden top on a steel rim, one heavy post, a foot plate bolted down
        this.pb('wood', 1.3, 0.045, 0.62, tx, ty - 0.0225, tz); this.pb(D, 1.32, 0.025, 0.64, tx, ty - 0.055, tz); this.top(tx - 0.64, tx + 0.64, tz - 0.3, tz + 0.3, ty);
        for (const [a, b, c, d] of [[2.69, 2.77, 2.84, 2.94], [2.45, 2.59, 3.1, 3.2], [2.86, 2.96, 3.06, 3.2], [2.83, 3.11, 2.73, 2.93], [2.0, 2.1, 2.76, 2.86]]) this.top(a, b, c, d, ty, 'on');
        this.pc(D, 0.05, 0.06, ty - 0.07, tx, (ty - 0.07) / 2, tz, 0, 0, 0, 12); this.pc(D, 0.24, 0.27, 0.025, tx, 0.0125, tz, 0, 0, 0, 18);
        for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; this.pc('steelBolt', 0.014, 0.014, 0.012, tx + Math.cos(a) * 0.2, 0.028, tz + Math.sin(a) * 0.2, 0, 0, 0, 6); }
        // a hand of cards fanned out, the deck, a card face-down; two mugs; a lunchbox; a thermos; a pair of dice
        for (let i = 0; i < 5; i++) this.pq('paper', 0.058, 0.084, tx - 0.36 + i * 0.03, ty + 0.002 + i * 0.0004, tz + 0.1, -Math.PI / 2, 0, 0.45 - i * 0.22);
        this.pq('red', 0.058, 0.084, tx + 0.02, ty + 0.002, tz - 0.12, -Math.PI / 2, 0, 0.3);
        this.pb('white', 0.064, 0.022, 0.09, tx + 0.18, ty + 0.011, tz - 0.06, 0, 0.2, 0); this.pb('red', 0.065, 0.003, 0.091, tx + 0.18, ty + 0.0235, tz - 0.06, 0, 0.2, 0);
        for (const [mx, mz, r] of [[tx - 0.05, tz + 0.2, 0], [tx + 0.36, tz + 0.16, 2]]) this.mug(mx, ty, mz, r);
        this.pb('red', 0.26, 0.12, 0.15, tx + 0.42, ty + 0.06, tz - 0.12, 0, -0.15, 0); this.pb('black', 0.27, 0.008, 0.155, tx + 0.42, ty + 0.1, tz - 0.12, 0, -0.15, 0);
        this.pt('black', 0.055, 0.008, tx + 0.42, ty + 0.12, tz - 0.12, 0, -0.15, 0, 10, Math.PI);
        this.pc('green', 0.045, 0.045, 0.26, tx - 0.5, ty + 0.13, tz - 0.14, 0, 0, 0, 14); this.pc('black', 0.048, 0.048, 0.055, tx - 0.5, ty + 0.285, tz - 0.14, 0, 0, 0, 14);
        for (const [dx, dz, r] of [[0.02, 0.08, 0.3], [0.06, 0.05, 1.1]]) this.pb('white', 0.022, 0.022, 0.022, tx + 0.2 + dx, ty + 0.011, tz + dz, 0, r, 0);
        this.col(1.75, 3.35, 3.4, 4.0); this.col(1.9, 3.2, 2.64, 3.26);
        // room on the bench for two, facing the table (hemmed in by it, so getting up you slide out the end or round it)
        this.seats = this.seats || [];
        for (const [x, ex, ez] of [[2.15, 1.45, 3.0], [2.95, 3.0, 2.3]]) this.seats.push({ x, z: bz, y: 0.5, yaw: 0, eye: V(x, 1.18, bz + 0.05), exit: { x: ex, z: ez } });
      }
      // floor marking
      const mk = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), new THREE.MeshBasicMaterial({ map: TEX.sign('SCRAP\nSTORAGE', { w: 256, h: 180, size: 30, bg: 'rgba(0,0,0,0)', fg: 'rgba(210,170,40,.55)', dirty: false }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      mk.rotation.x = -Math.PI / 2; mk.position.set(-4.6, 0.004, -2.3); this.group.add(mk);
      // ceiling lights, pipes, cable trays, beacon
      // (the tubes dim with the cabin lights when the power dips)
      this.tubeMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6 }); this.tubeBase = this.tubeMat.color.clone();
      for (const x of [-4.5, 0.5]) {
        this.box(0.35, 0.1, 1.6, MATS.get('lampHousing'), x, H - 0.06, 0);
        const tube = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 1.45), this.tubeMat); tube.position.set(x, H - 0.12, 0); this.group.add(tube);
        this.lights.push({ x, y: H - 0.3, z: 0, color: 0xffe8c8, power: 1.1, state: 'on', zone: 'out', range: 10, lit: 1, ship: true, phase: x });
      }
      for (const z of [-3.55, 3.55]) { const p = this.cyl(0.07, 0.07, 10.5, MATS.get('rust'), -1.75, H - 0.2, z, 0, 0, Math.PI / 2, 8); p.castShadow = false; }
      for (const z of [-2.2, 2.2]) this.box(10.4, 0.05, 0.4, dm, -1.75, H - 0.35, z);
      const bc = new THREE.Group(); bc.position.set(-0.9, H - 0.2, 2.4); this.group.add(bc);
      const bmat = new THREE.MeshBasicMaterial({ color: 0x331a00 });
      const bcore = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 10), bmat); bc.add(bcore);
      const bfin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.18), MATS.get('darkmetal')); bfin.position.x = 0.05; bc.add(bfin);
      this.beacon = { group: bc, mat: bmat, fin: bfin };
      // outside hatch lamp
      this.lights.push({ x: -2.5, y: 3.2, z: 5.0, color: 0xffa040, power: 0.7, state: 'on', zone: 'out', range: 8, lit: 1, ship: true, phase: 0 });
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2), new THREE.MeshBasicMaterial({ color: 0xffa040 })); sl.position.set(-2.5, 3.0, 4.42); this.group.add(sl);
    }
    // ---------- cargo bay dressing ----------
    buildBayDetail() {
      const D = 'darkmetal', SB = 'steelBolt', sx = { w: 256, h: 64, size: 34, bg: '#1b1b18', fg: '#d0a040' };
      // structural I-beam ribs on the side walls (wherever nothing else is mounted), with gussets into the ceiling
      const rib = (x, side) => {
        const zw = side * 4.0, n = -side, Z = (d) => zw + n * d;
        this.pb(D, 0.2, H, 0.025, x, H / 2, Z(0.0125)); this.pb(D, 0.035, H, 0.14, x, H / 2, Z(0.095)); this.pb(D, 0.17, H, 0.025, x, H / 2, Z(0.177));
        for (let y = 0.25; y < H - 0.1; y += 0.42) for (const dx of [-0.065, 0.065]) this.ps(SB, 0.011, x + dx, y, Z(0.192), 1, 1, 1, 5);
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.55, 0); sh.lineTo(0, -0.55); sh.closePath();
        const e1 = V(0, 0, n), e2 = V(0, 1, 0), e3 = new THREE.Vector3().crossVectors(e1, e2);
        this.put(D, new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false }), new THREE.Matrix4().makeBasis(e1, e2, e3).setPosition(V(x, H, zw).addScaledVector(e3, -0.0125)));
      };
      for (const x of [-6.4, -4.35, -2.95, -1.45, 1.55]) rib(x, -1);
      for (const x of [-6.6, -4.7, 0.1, 1.5]) rib(x, 1);
      // ceiling cross-beams
      for (const x of [-6.0, -3.0, -0.05, 2.3]) { this.pb(D, 0.14, 0.12, 8.0, x, H - 0.06, 0); this.pb(D, 0.18, 0.022, 8.0, x, H - 0.13, 0); }
      // air duct down the ceiling, wall to wall (it runs into the back wall and the bulkhead): collars, hangers, grilles
      this.pc('painted', 0.2, 0.2, 10.65, -1.775, 3.02, -1.1, 0, 0, Math.PI / 2, 18);
      for (let x = -6.6; x <= 3.2; x += 1.4) { this.pt(D, 0.205, 0.018, x, 3.02, -1.1, 0, Math.PI / 2, 0, 18); this.pb(D, 0.03, 0.16, 0.03, x, 3.3, -1.1); }
      for (const x of [-5.3, -2.3, 0.9]) { this.pb(D, 0.5, 0.06, 0.28, x, 2.8, -1.1); this.pb('vent', 0.44, 0.012, 0.22, x, 2.768, -1.1); }
      // conduits with clamps, and sprinkler heads
      for (const z of [1.25, 1.36]) this.pc(D, 0.022, 0.022, 10.65, -1.775, 3.2, z, 0, 0, Math.PI / 2, 8);
      for (let x = -6.5; x < 3.3; x += 1.2) this.pb(D, 0.05, 0.2, 0.2, x, 3.29, 1.305);
      for (const x of [-5, -1.5, 2]) for (const z of [-1.7, 1.7]) { this.pc(SB, 0.018, 0.028, 0.05, x, 3.375, z, 0, 0, 0, 8); this.pc('red', 0.03, 0.03, 0.006, x, 3.348, z, 0, 0, 0, 8); }
      // cable bundles sagging between the ribs
      const droop = (xa, xb, side, y, sag, r) => { const z = side * 3.93; this.tube('cable', [V(xa, y, z), V(xa * 0.75 + xb * 0.25, y - sag * 0.75, z), V((xa + xb) / 2, y - sag, z), V(xa * 0.25 + xb * 0.75, y - sag * 0.75, z), V(xb, y, z)], r, 22); };
      for (const [a, b, s] of [[-6.4, -4.35, 0.28], [-4.35, -2.95, 0.2], [-2.95, -1.45, 0.22], [-1.45, 1.55, 0.04]]) { droop(a, b, -1, 3.0, s, 0.02); droop(a, b, -1, 3.07, s * 0.7, 0.013); }
      for (const [a, b, s] of [[-6.6, -4.7, 0.26], [-4.7, 0.1, 0.08], [0.1, 1.5, 0.22]]) { droop(a, b, 1, 3.0, s, 0.02); droop(a, b, 1, 3.07, s * 0.7, 0.013); }
      // hazard kick strip at the foot of the walls, rubber bump rail at hip height
      const strip = (m, x0, x1, side, y, h, d) => this.pb(m, x1 - x0, h, d, (x0 + x1) / 2, y, side * (4.0 - d / 2));
      strip('hazard', -7.05, 3.5, -1, 0.07, 0.14, 0.012); strip('hazard', -7.05, AIRLOCK.x0, 1, 0.07, 0.14, 0.012); strip('hazard', AIRLOCK.x1, 3.5, 1, 0.07, 0.14, 0.012);
      strip('rubber', -7.05, -5.65, -1, 0.95, 0.08, 0.05); strip('rubber', -4.55, 1.85, -1, 0.95, 0.08, 0.05);
      strip('rubber', -7.05, AIRLOCK.x0, 1, 0.95, 0.08, 0.05); strip('rubber', AIRLOCK.x1, 0.15, 1, 0.95, 0.08, 0.05); strip('rubber', 1.25, 3.5, 1, 0.95, 0.08, 0.05);
      for (const s of [-1, 1]) this.pb('hazard', 0.012, 0.14, 3.3, -7.044, 0.07, s * 2.35);
      // fold-down jump seats with harnesses
      const jump = (x, side) => {
        const zw = side * 4.0, n = -side, Z = (d) => zw + n * d;
        this.pb('pad', 0.42, 0.56, 0.06, x, 0.98, Z(0.04)); this.pb(D, 0.46, 0.04, 0.03, x, 1.27, Z(0.02));
        this.pb('pad', 0.42, 0.07, 0.4, x, 0.47, Z(0.25));
        for (const dx of [-0.21, 0.21]) { this.pb(D, 0.025, 0.035, 0.42, x + dx, 0.43, Z(0.25)); this.beam(D, V(x + dx, 0.12, Z(0.02)), V(x + dx, 0.42, Z(0.43)), 0.025); }
        for (const dx of [-0.09, 0.09]) this.beam('orange', V(x + dx * 0.4, 0.58, Z(0.12)), V(x + dx, 1.25, Z(0.075)), 0.05, 0.008);
        this.pb(SB, 0.07, 0.05, 0.02, x, 0.62, Z(0.125));
      };
      for (const x of [-5.35, -4.85]) jump(x, -1);
      for (const x of [0.45, 0.95]) jump(x, 1);
      this.seats = this.seats || [];
      for (const [x, side] of [[-5.35, -1], [-4.85, -1], [0.45, 1], [0.95, 1]]) {
        const n = -side, Z = (d) => side * 4.0 + n * d;
        this.seats.push({ x, z: Z(0.25), y: 0.5, yaw: n > 0 ? Math.PI : 0, eye: V(x, 1.18, Z(0.2)), exit: { x, z: Z(0.95) } });
      }
      this.col(-5.6, -4.6, -4.0, -3.55); this.col(0.2, 1.2, 3.55, 4.0);
      // oxygen bottles strapped under the port porthole
      this.pb(D, 0.62, 0.06, 0.3, -2.2, 0.03, -3.83);
      for (const x of [-2.38, -2.02]) {
        this.pc('green', 0.11, 0.11, 1.0, x, 0.56, -3.83, 0, 0, 0, 16); this.ps('green', 0.11, x, 1.06, -3.83, 1, 0.7, 1, 12);
        this.pc('brass', 0.03, 0.035, 0.08, x, 1.17, -3.83, 0, 0, 0, 10); this.pt('black', 0.035, 0.012, x, 1.23, -3.83, Math.PI / 2, 0, 0, 10);
      }
      for (const y of [0.35, 0.85]) { this.pb('orange', 0.62, 0.05, 0.02, -2.2, y, -3.708); this.pb(SB, 0.05, 0.06, 0.03, -1.88, y, -3.75); }
      this.sign('O2', 0.16, 0.1, -2.38, 0.6, -3.715, 0, { w: 128, h: 80, size: 54, bg: '#e2dccb', fg: '#24361f', border: false, dirty: false });
      this.col(-2.55, -1.85, -4.0, -3.68);
      // rolling tool chest under the quota monitor, with a few things left on top
      this.pb('red', 2.1, 0.92, 0.48, 0, 0.5, -3.76); this.pb(D, 2.14, 0.04, 0.52, 0, 0.98, -3.76);
      for (let i = 0; i < 4; i++) { const y = 0.2 + i * 0.2; this.pb('black', 2.06, 0.012, 0.006, 0, y + 0.095, -3.518); for (const x of [-0.5, 0.5]) this.pb('hardware', 0.5, 0.025, 0.03, x, y, -3.505); }
      for (const x of [-0.95, 0.95]) this.pc('black', 0.045, 0.045, 0.04, x, 0.045, -3.6, Math.PI / 2, 0, 0, 10);
      this.pb('yellow', 0.5, 0.2, 0.22, -0.55, 1.1, -3.8); this.pt('black', 0.1, 0.012, -0.55, 1.2, -3.8, 0, 0, 0, 10, Math.PI);
      this.pb('black', 0.3, 0.18, 0.12, 0.35, 1.09, -3.85); this.pc('black', 0.008, 0.008, 0.3, 0.46, 1.33, -3.85, 0, 0, 0, 6); this.pb('glowGreen', 0.07, 0.03, 0.005, 0.3, 1.13, -3.788);
      this.pb(SB, 0.28, 0.012, 0.035, 0.78, 1.008, -3.64, 0, 0.4, 0); this.pb(SB, 0.05, 0.012, 0.07, 0.9, 1.008, -3.7, 0, 0.4, 0);
      this.mug(-0.05, 1.0, -3.6);
      this.col(-1.08, 1.08, -4.0, -3.5); this.top(-1.05, 1.05, -3.98, -3.52, 1.0);
      for (const [a, b, c, d] of [[-0.8, -0.3, -3.91, -3.69], [0.2, 0.5, -3.91, -3.79], [-0.09, 0.04, -3.64, -3.56], [-0.43, 0.43, -3.98, -3.85]]) this.top(a, b, c, d, 1.0, 'on');
      // the charger's battery pack and its cable
      this.pb('yellow', 0.42, 0.32, 0.3, -3.6, 0.16, -3.8); this.pb('black', 0.08, 0.05, 0.06, -3.72, 0.345, -3.8); this.pb('red', 0.08, 0.05, 0.06, -3.48, 0.345, -3.8);
      this.tube('cable', [V(-3.75, 1.02, -3.88), V(-3.84, 0.72, -3.74), V(-3.76, 0.42, -3.66), V(-3.72, 0.37, -3.78)], 0.016, 16); this.pc('darkmetal', 0.025, 0.02, 0.04, -3.75, 1.03, -3.88, 0, 0, 0, 8);
      this.col(-3.82, -3.38, -4.0, -3.63); this.top(-3.81, -3.39, -3.95, -3.65, 0.32); this.top(-3.77, -3.67, -3.84, -3.76, 0.32, 'on'); this.top(-3.53, -3.43, -3.84, -3.76, 0.32, 'on');
      // intercom with a coiled handset cord
      this.pb('painted', 0.24, 0.34, 0.07, -6.0, 1.45, -3.965); this.pb('vent', 0.16, 0.1, 0.01, -6.0, 1.55, -3.928);
      this.pb('black', 0.06, 0.24, 0.06, -5.92, 1.4, -3.9); this.pb('glowRed', 0.02, 0.02, 0.006, -6.08, 1.58, -3.927);
      { const pts = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * TAU * 9; pts.push(V(-5.92 + Math.cos(a) * 0.02, 1.27 - t * 0.38, -3.9 + Math.sin(a) * 0.02)); } this.tube('black', pts, 0.005, 120, 4); }
      // low cargo net holding kit bags against the starboard wall
      this.pq('net', 1.6, 1.15, -5.65, 0.68, 3.72, 0, Math.PI, 0);
      for (const [x, y, rz] of [[-6.1, 0.24, 0.1], [-5.45, 0.22, -0.05]]) this.put('olive', new THREE.CapsuleGeometry(0.2, 0.45, 4, 10), mat(x, y, 3.82, 0, 0, Math.PI / 2 + rz));
      this.ps('olive', 0.18, -5.75, 0.6, 3.84, 1.3, 1, 0.9, 10);
      // (a crate on its own past the net, between the rib and the airlock)
      this.pb('crate', 0.4, 0.36, 0.34, -4.15, 0.18, 3.76, 0, 0.12, 0); this.col(-4.4, -3.9, 3.55, 4.0);
      for (let i = 0; i < 5; i++) this.pc(SB, 0.012, 0.012, 0.06, -6.4 + i * 0.4, 1.25, 3.97, Math.PI / 2, 0, 0, 6);
      this.pb('orange', 1.6, 0.04, 0.02, -5.65, 1.25, 3.72);
      this.col(-6.5, -4.8, 3.6, 4.0);
      // hose reel by the hatch
      this.pb(D, 0.1, 0.5, 0.05, -4.33, 1.3, 3.975); this.pc(D, 0.06, 0.06, 0.2, -4.33, 1.35, 3.88, Math.PI / 2, 0, 0, 10);
      for (const dz of [-0.075, 0.075]) this.pc(D, 0.25, 0.25, 0.015, -4.33, 1.35, 3.88 + dz, Math.PI / 2, 0, 0, 20);
      for (let i = 0; i < 3; i++) this.pt('red', 0.19, 0.022, -4.33, 1.35, 3.84 + i * 0.04, 0, 0, 0, 16);
      this.tube('red', [V(-4.15, 1.28, 3.84), V(-4.12, 1.0, 3.8), V(-4.2, 0.75, 3.76)], 0.022, 12); this.pc('brass', 0.025, 0.035, 0.12, -4.2, 0.69, 3.76, 0, 0, 0, 10);
      // mission timer by the bulkhead
      this.pb('black', 0.46, 0.17, 0.06, 3.2, 2.62, 3.965);
      this.sign('00:00:00', 0.4, 0.12, 3.2, 2.62, 3.932, Math.PI, { w: 256, h: 76, size: 54, bg: '#140302', fg: '#ff3a1c', border: false, dirty: false });
      // crew lockers either side of the engine-room door, helmets on hooks, a breaker panel
      for (const s of [-1, 1]) {
        const z = s * 1.1;
        // (plain painted steel, with the vented door on its front only)
        this.pb('lockerBody', 0.44, 2.0, 0.58, -6.83, 1.0, z); this.pb('locker', 0.01, 1.97, 0.55, -6.605, 1.0, z);
        for (let i = 0; i < 5; i++) this.pb('black', 0.006, 0.02, 0.36, -6.598, 1.75 - i * 0.05, z);
        this.pb('hardware', 0.03, 0.18, 0.025, -6.59, 1.0, z - s * 0.2);
        this.sign(s < 0 ? 'CREW 01' : 'CREW 02', 0.3, 0.07, -6.596, 1.88, z, Math.PI / 2, { w: 256, h: 60, size: 40, bg: '#e8e2d0', fg: '#222', border: false });
        this.col(-7.05, -6.6, z - 0.3, z + 0.3);
      }
      for (const [z, m, t] of [[0.92, 'yellow', 0.12], [1.28, 'white', -0.1]]) { this.wallHook(-7.04, 2.29, z, Math.PI / 2); this.hardHat(m, -7.05 + 0.193, 2.276, z, -0.15, Math.PI / 2 + t * 0.4, 0); }
      this.pb('painted', 0.1, 0.6, 0.55, -7.0, 2.45, -1.1);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) this.pb('black', 0.02, 0.07, 0.04, -6.945, 2.27 + r * 0.16, -1.32 + c * 0.088);
      for (let c = 0; c < 5; c++) this.pb(c === 3 ? 'glowRed' : 'glowGreen', 0.006, 0.015, 0.015, -6.948, 2.71, -1.28 + c * 0.1);
      this.pc(D, 0.03, 0.03, 0.66, -7.0, 3.07, -1.1, 0, 0, 0, 8);
      // pipework around the engine-room door: a valve wheel, a pressure gauge
      for (const s of [-1, 1]) { this.pc('rust', 0.045, 0.045, H, -7.0, H / 2, s * 0.68, 0, 0, 0, 10); this.ps('rust', 0.06, -7.0, 2.85, s * 0.68, 1, 1, 1, 8); for (const y of [0.6, 1.9]) this.pt(D, 0.05, 0.012, -7.0, y, s * 0.68, Math.PI / 2, 0, 0, 10); }
      this.pc('rust', 0.045, 0.045, 1.36, -7.0, 2.85, 0, Math.PI / 2, 0, 0, 10);
      this.pc(D, 0.025, 0.025, 0.12, -6.95, 1.55, -0.68, 0, 0, Math.PI / 2, 8); this.pt('red', 0.11, 0.013, -6.89, 1.55, -0.68, 0, Math.PI / 2, 0, 16);
      for (let i = 0; i < 3; i++) this.pb('red', 0.01, 0.22, 0.012, -6.89, 1.55, -0.68, i * Math.PI / 3, 0, 0);
      this.pc(D, 0.075, 0.075, 0.04, -6.94, 1.75, 0.68, 0, 0, Math.PI / 2, 16); this.pt(SB, 0.075, 0.008, -6.918, 1.75, 0.68, 0, Math.PI / 2, 0, 16);
      this.put('gauge', new THREE.CircleGeometry(0.068, 20), mat(-6.917, 1.75, 0.68, 0, Math.PI / 2, 0));
      this.pb('red', 0.004, 0.05, 0.004, -6.912, 1.75 + Math.cos(0.6) * 0.022, 0.68 + Math.sin(0.6) * 0.022, 0.6, 0, 0);
      // a caged work light over the door
      this.pt(D, 0.07, 0.007, -6.92, 3.15, 0, 0, 0, 0, 12); this.pt(D, 0.07, 0.007, -6.92, 3.15, 0, Math.PI / 2, 0, 0, 12); this.ps('glowWarm', 0.045, -6.92, 3.15, 0, 1, 1, 1, 10);
      this.lights.push({ x: -6.6, y: 3.0, z: 0, color: 0xffc890, power: 0.45, state: 'on', zone: 'out', range: 5.5, lit: 1, ship: true, phase: 4 });
      // stock on the back racks
      const sy = [0.075, 0.925, 1.775];
      for (const z of [-2.6, 2.6]) for (const y of sy) this.top(-6.98, -6.32, z - 0.92, z + 0.92, y, 'open');
      for (const [a, b, c, d, l] of [[-6.96, -6.4, -3.48, -2.92, 0], [-6.9, -6.4, -2.8, -2.3, 0], [-6.8, -6.6, -3.44, -2.76, 1], [-6.84, -6.48, -2.45, -1.95, 1], [-6.84, -6.46, -3.39, -3.01, 2], [-6.94, -6.46, -2.62, -2.18, 2],
        [-7, -6.4, 1.95, 2.65, 0], [-6.87, -6.45, 2.91, 3.54, 0], [-6.86, -6.48, 1.87, 2.33, 1], [-6.72, -6.48, 2.71, 3.09, 1], [-6.93, -6.43, 1.94, 2.46, 2], [-6.95, -6.37, 2.79, 3.41, 2]]) this.top(a, b, c, d, sy[l], 'on');
      this.pb('crate', 0.5, 0.42, 0.5, -6.68, sy[0] + 0.21, -3.2, 0, 0.1, 0); this.pb('crate', 0.45, 0.34, 0.45, -6.65, sy[0] + 0.17, -2.55, 0, -0.08, 0);
      for (const z of [-3.35, -3.1, -2.85]) { this.pc('green', 0.09, 0.09, 0.32, -6.7, sy[1] + 0.16, z, 0, 0, 0, 12); this.pc('black', 0.03, 0.03, 0.04, -6.7, sy[1] + 0.34, z, 0, 0, 0, 8); }
      this.pb('red', 0.36, 0.2, 0.5, -6.66, sy[1] + 0.1, -2.2); this.pt('black', 0.12, 0.012, -6.66, sy[1] + 0.2, -2.2, 0, Math.PI / 2, 0, 10, Math.PI);
      for (let i = 0; i < 4; i++) this.pt('cable', 0.16, 0.025, -6.65, sy[2] + 0.03 + i * 0.05, -3.2, Math.PI / 2, 0, 0, 16);
      this.pb('crate', 0.4, 0.3, 0.36, -6.7, sy[2] + 0.15, -2.4, 0, 0.2, 0);
      this.pb('crate', 0.6, 0.5, 0.7, -6.7, sy[0] + 0.25, 2.3);
      for (const z of [3.05, 3.4]) { this.pb('yellow', 0.42, 0.3, 0.28, -6.66, sy[0] + 0.15, z); this.pb('black', 0.43, 0.04, 0.29, -6.66, sy[0] + 0.25, z); }
      this.pb('white', 0.38, 0.22, 0.46, -6.67, sy[1] + 0.11, 2.1); this.pb('red', 0.006, 0.12, 0.04, -6.477, sy[1] + 0.11, 2.1); this.pb('red', 0.006, 0.04, 0.12, -6.477, sy[1] + 0.11, 2.1);
      for (const z of [2.75, 2.9, 3.05]) this.pc('black', 0.03, 0.035, 0.24, -6.6, sy[1] + 0.035, z, 0, 0, Math.PI / 2, 10);
      for (let i = 0; i < 3; i++) this.pb('olive', 0.5, 0.08, 0.55, -6.66, sy[2] + 0.04 + i * 0.08, 3.1, 0, i * 0.08, 0);
      this.hardHat('orange', -6.68, sy[2], 2.2, 0, 0.7, 0);
      // the terminal corner: a stool, a cold coffee, papers, a desk lamp, sticky notes on the monitor
      this.pc('pad', 0.19, 0.19, 0.07, 3.05, 0.62, -2.55, 0, 0, 0, 16); this.pc(D, 0.025, 0.025, 0.55, 3.05, 0.32, -2.55, 0, 0, 0, 8);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; this.beam(D, V(3.05, 0.08, -2.55), V(3.05 + Math.cos(a) * 0.26, 0.03, -2.55 + Math.sin(a) * 0.26), 0.03); }
      this.pt(D, 0.15, 0.012, 3.05, 0.3, -2.55, Math.PI / 2, 0, 0, 16);
      this.mug(2.05, 0.9, -3.15);
      // (the papers lie on the desk mat, between the keyboard and the trackball, clear of both)
      this.pq('paper', 0.21, 0.29, 3.075, 0.9058, -3.245, -Math.PI / 2, 0.05, 0); this.pq('paper', 0.21, 0.29, 3.08, 0.9064, -3.25, -Math.PI / 2, -0.07, 0);
      this.pc(D, 0.07, 0.08, 0.03, 3.3, 0.915, -3.8, 0, 0, 0, 12);
      this.beam(D, V(3.3, 0.93, -3.8), V(3.25, 1.25, -3.7), 0.015); this.beam(D, V(3.25, 1.25, -3.7), V(3.12, 1.2, -3.55), 0.015);
      this.pc(D, 0.04, 0.09, 0.1, 3.1, 1.15, -3.52, 0.5, 0, 0, 12); this.ps('glowWarm', 0.03, 3.1, 1.11, -3.5, 1, 1, 1, 8);
      // (the sticky notes on the monitor's bezel, laid in its own tilted frame just proud of its face)
      const onBezel = (m, x, y, rz) => this.pq(m, 0.07, 0.07, 2.65 + x, 1.37 + y * Math.cos(0.15) + 0.039 * Math.sin(0.15), -3.69 - y * Math.sin(0.15) + 0.039 * Math.cos(0.15), -0.15, 0, rz);
      onBezel('noteY', -0.48, 0.24, 0.1); onBezel('noteP', 0.485, -0.27, -0.08); onBezel('noteB', 0.49, -0.157, 0.05);
      // bulkhead (bay side): flight deck sign, first-aid kit, extinguisher, notice board
      this.sign('FLIGHT DECK', 1.0, 0.2, 3.49, 2.95, 0, -Math.PI / 2, sx);
      this.pb('white', 0.1, 0.4, 0.5, 3.45, 1.45, -2.0); this.pb('red', 0.006, 0.26, 0.07, 3.397, 1.45, -2.0); this.pb('red', 0.006, 0.07, 0.26, 3.397, 1.45, -2.0); this.pb('hardware', 0.02, 0.03, 0.12, 3.395, 1.29, -2.0);
      this.pb(D, 0.03, 0.5, 0.12, 3.485, 0.6, 2.0);
      this.pc('red', 0.085, 0.085, 0.5, 3.38, 0.58, 2.0, 0, 0, 0, 16); this.ps('red', 0.085, 3.38, 0.83, 2.0, 1, 0.6, 1, 12);
      this.pc(D, 0.03, 0.035, 0.08, 3.38, 0.9, 2.0, 0, 0, 0, 8); this.pb(D, 0.13, 0.02, 0.03, 3.355, 0.95, 2.0);
      this.tube('black', [V(3.4, 0.92, 2.03), V(3.33, 0.88, 2.1), V(3.31, 0.6, 2.1), V(3.32, 0.45, 2.07)], 0.012, 12);
      this.sign('FIRE', 0.24, 0.12, 3.49, 1.05, 2.0, -Math.PI / 2, { w: 128, h: 64, size: 40, bg: '#a01810', fg: '#f4e8d8', border: false, dirty: false });
      this.pb('cork', 0.03, 0.75, 1.0, 3.485, 1.95, 3.0);
      for (const z of [2.48, 3.52]) this.pb(D, 0.04, 0.8, 0.03, 3.48, 1.95, z); for (const y of [1.56, 2.34]) this.pb(D, 0.04, 0.03, 1.07, 3.48, y, 3.0);
      this.pq('paper', 0.21, 0.28, 3.468, 2.05, 2.7, 0, -Math.PI / 2, 0.08); this.pq('paper', 0.21, 0.29, 3.468, 2.02, 3.18, 0, -Math.PI / 2, -0.05); this.pq('noteY', 0.1, 0.1, 3.468, 1.75, 3.38, 0, -Math.PI / 2, -0.1);
      for (const [y, z] of [[2.17, 2.7], [2.15, 3.18], [1.79, 3.38]]) this.ps('red', 0.012, 3.46, y, z, 1, 1, 1, 6);
      this.sign('DAYS WITHOUT AN\nINCIDENT:  0', 0.5, 0.22, 3.466, 1.7, 2.84, -Math.PI / 2, { w: 256, h: 112, size: 26, bg: '#e8e0c8', fg: '#2a2620' });
      // airlock: a hazard plate on the bay floor in front of the inner door; cargo stencil on the port wall
      this.pb('hazard', AIRLOCK.ix1 - AIRLOCK.ix0 + 0.2, 0.008, 0.38, (AIRLOCK.ix0 + AIRLOCK.ix1) / 2, 0.004, AIRLOCK.z0 - 0.465);   // (stops short of the door pockets)
      this.sign('SECURE ALL CARGO BEFORE FLIGHT', 1.3, 0.12, -3.6, 2.6, -3.99, 0, { w: 512, h: 48, size: 30, bg: 'rgba(0,0,0,0)', fg: 'rgba(28,24,18,.8)', border: false, dirty: false, clear: true });
      // tie-down rings set into the floor
      for (const x of [-5.5, -2.5, 0.5]) for (const z of [-2.6, 0, 2.6]) { this.pb(SB, 0.14, 0.012, 0.14, x, 0.006, z); this.pt(SB, 0.06, 0.012, x, 0.02, z, Math.PI / 2, 0, 0, 10, Math.PI); }
      // red emergency lights high on the walls
      for (const x of [-5.6, -0.3, 2.95]) for (const s of [-1, 1]) { this.pb(D, 0.16, 0.1, 0.08, x, 3.05, s * 3.96); this.pb('glowRed', 0.12, 0.06, 0.012, x, 3.05, s * 3.917); }
    }
    // ---------- the bay, lived in: padded insulation blankets on the upper walls, perforated ceiling panels, deck
    // hatches and oil stains, and the things a crew piles up (a clock that keeps site time, the coffee machine, an
    // axe case, a pegboard missing half its tools, the Company's posters, an overflowing bin) ----------
    buildBayUpgrade() {
      const D = 'darkmetal', SB = 'steelBolt';
      // insulation blankets between the ribs, above the bump rail, trimmed top and bottom; holes round the portholes
      const y0 = 1.06, y1 = 2.98, qm = MATS.rep('quilt', 0.8, 0.8);
      const blanket = (side, x0, x1, holes) => {
        const f = side > 0 ? -1 : 1;   // (starboard is drawn mirrored, then turned round to face into the bay)
        const s = new THREE.Shape(); s.moveTo(f * x0, y0); s.lineTo(f * x1, y0); s.lineTo(f * x1, y1); s.lineTo(f * x0, y1); s.closePath();
        for (const hx of holes) { const p = new THREE.Path(); p.absarc(f * hx, 1.75, 0.52, 0, TAU, true); s.holes.push(p); }
        const g = new THREE.ShapeGeometry(s, 28); if (side > 0) g.rotateY(Math.PI);
        g.translate(0, 0, side * (4.0 - 0.018));
        this.mesh(g, qm).castShadow = false;
        for (const y of [y0, y1]) this.pb(D, x1 - x0, 0.05, 0.03, (x0 + x1) / 2, y, side * (4.0 - 0.03));
        for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.6) for (const y of [y0, y1]) this.ps(SB, 0.01, x, y, side * (4.0 - 0.047), 1, 1, 1, 5);
      };
      blanket(-1, -7.05, 3.5, [-2.2, -5.0]);
      blanket(1, -7.05, AIRLOCK.x0, [-5.8]);
      blanket(1, AIRLOCK.x1, 3.5, [2.5]);
      // cobwebs up in the corners, under the pipes where no broom reaches: grey with dust, catching the light (the bay's
      // back corners and the bulkhead's, and up in the airlock)
      {
        const [c, g] = TEX.canvas(256, 256), r = new RNG(4127), hx = 124, hy = 96;
        g.strokeStyle = 'rgba(240,236,228,0.85)'; g.lineWidth = 1.2; g.lineCap = 'round';
        // (the spokes out to the walls and the top; the bottom edge hangs free, a looser frame thread across it)
        const sp = [];
        for (let i = 0; i < 13; i++) { const a = -Math.PI + (i + r.range(-0.3, 0.3)) * (TAU / 13), dx = Math.cos(a), dy = Math.sin(a), k = Math.min(dx ? (dx > 0 ? 254 - hx : hx - 2) / Math.abs(dx) : 1e9, dy ? (dy > 0 ? (226 - hy) * 0.8 : hy - 2) / Math.abs(dy) : 1e9); sp.push([a, k]); }
        for (const [a, k] of sp) { g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(a) * k, hy + Math.sin(a) * k); g.stroke(); }
        // (the spiral, each turn sagging in a little between the spokes, and broken here and there)
        for (let rr = 7; rr < 150; rr += r.range(6.5, 9.5)) for (let i = 0; i < sp.length; i++) {
          const [a0, k0] = sp[i], [a1, k1] = sp[(i + 1) % sp.length]; if (rr > Math.min(k0, k1) - 3 || r.chance(0.12)) continue;
          const am = (a0 + a1 + (a1 < a0 ? TAU : 0)) / 2;
          g.beginPath(); g.moveTo(hx + Math.cos(a0) * rr, hy + Math.sin(a0) * rr); g.quadraticCurveTo(hx + Math.cos(am) * rr * 0.9, hy + Math.sin(am) * rr * 0.9, hx + Math.cos(a1) * rr, hy + Math.sin(a1) * rr); g.stroke();
        }
        // (loose strands hanging off it, and dust caught along the threads)
        g.strokeStyle = 'rgba(236,232,224,0.45)';
        for (let i = 0; i < 6; i++) { const x = r.range(40, 216), y = r.range(120, 190), l = r.range(18, 50); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + r.range(-8, 8), y + l * 0.6, x + r.range(-4, 4), y + l); g.stroke(); }
        g.fillStyle = 'rgba(220,214,204,0.55)';
        for (let i = 0; i < 160; i++) { const [a, k] = sp[r.int(0, sp.length - 1)], d = r.range(4, k); g.fillRect(hx + Math.cos(a) * d - 0.8, hy + Math.sin(a) * d - 0.8, r.range(1, 2.4), r.range(1, 2.4)); }
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const wm = new THREE.MeshStandardMaterial({ map: tex, color: 0xd6d1c8, roughness: 1, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        // (a sheet across the corner from (ax, az) on one wall to (bx, bz) on the other, y0 up to y1)
        const web = (ax, az, bx, bz, y0, y1, flip) => {
          const a = new THREE.Vector3(ax, 0, az), b = new THREE.Vector3(bx, 0, bz), e1 = b.clone().sub(a), w = e1.length(); e1.divideScalar(w);
          const e2 = new THREE.Vector3(0, 1, 0), e3 = new THREE.Vector3().crossVectors(e1, e2), geo = new THREE.PlaneGeometry(w, y1 - y0);
          if (flip) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
          const m = new THREE.Mesh(geo, wm); m.matrixAutoUpdate = false; m.matrix.makeBasis(e1, e2, e3).setPosition(a.add(b).multiplyScalar(0.5).setY((y0 + y1) / 2));
          m.castShadow = false; m.renderOrder = 2; this.group.add(m);
        };
        web(-6.97, -3.4, -6.55, -3.95, 2.25, 3.08, false); web(-6.97, 3.5, -6.72, 3.95, 2.4, 3.08, true);
        web(3.47, -3.35, 2.9, -3.95, 2.3, 3.08, true); web(3.47, 3.4, 2.95, 3.95, 2.4, 3.08, false);
        web(-3.52, 3.62, -3.24, 3.95, 2.5, 3.08, true);
      }
      // perforated steel panels over the whole ceiling
      // (with the roof hatch's opening cut in it, over the airlock)
      {
        const W = 10.55, Dp = 8.0, sh = new THREE.Shape(); sh.moveTo(-W / 2, -Dp / 2); sh.lineTo(W / 2, -Dp / 2); sh.lineTo(W / 2, Dp / 2); sh.lineTo(-W / 2, Dp / 2); sh.closePath();
        const ho = new THREE.Path(); ho.absarc(ROOF.hx + 1.775, ROOF.hz, 0.44, 0, TAU, true); sh.holes.push(ho);
        const g = new THREE.ShapeGeometry(sh, 24), p = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / W, (p.getY(i) + Dp / 2) / Dp);
        const c = this.mesh(g, MATS.rep('perf', W / 1.3, Dp / 1.3)); c.rotation.x = Math.PI / 2; c.position.set(-1.775, H - 0.004, 0); c.castShadow = false;
      }
      // deck access hatches: a framed plate with a lift handle and four bolts
      for (const [x, z] of [[-4.0, 0.7], [-1.0, -1.6], [1.6, 0.9]]) {
        this.pb('metal', 0.9, 0.012, 0.9, x, 0.006, z);
        for (const s of [-1, 1]) { this.pb(D, 0.94, 0.008, 0.025, x, 0.004, z + s * 0.46); this.pb(D, 0.025, 0.008, 0.94, x + s * 0.46, 0.004, z); }
        this.pb(D, 0.16, 0.014, 0.04, x, 0.013, z + 0.3); this.pt(SB, 0.04, 0.007, x, 0.016, z + 0.3, Math.PI / 2, 0, 0, 8, Math.PI);
        for (const a of [-1, 1]) for (const b of [-1, 1]) this.ps(SB, 0.013, x + a * 0.39, 0.013, z + b * 0.39, 1, 0.5, 1, 6);
      }
      // where oil and boots have been
      for (const [x, z, s] of [[-6.5, 0.4, 1.3], [-4.3, 3.45, 0.9], [0.7, -3.15, 1.0], [-3.7, -3.3, 0.8], [2.6, 1.6, 0.7]]) this.put('oil', new THREE.PlaneGeometry(s, s), mat(x, 0.004, z, -Math.PI / 2, (x * 7.1) % TAU, 0));
      // anti-slip tread in front of the engine-room door and the flight-deck doorway
      for (let i = 0; i < 3; i++) { this.pb('rubber', 0.08, 0.004, 1.1, -6.75 + i * 0.16, 0.003, 0); this.pb('rubber', 0.08, 0.004, 2.0, 3.3 - i * 0.16, 0.003, 0); }
      // a wall clock on the bulkhead (it keeps the site's time while you're down there)
      {
        const [cv, g] = TEX.canvas(256, 256); this.clock = { g, cv, tex: new THREE.CanvasTexture(cv), min: -1 }; this.clock.tex.colorSpace = THREE.SRGBColorSpace;
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), new THREE.MeshStandardMaterial({ map: this.clock.tex, roughness: 0.35 }));
        face.position.set(3.458, 2.45, -2.9); face.rotation.y = -Math.PI / 2; this.group.add(face);
        this.pt(D, 0.18, 0.018, 3.458, 2.45, -2.9, 0, Math.PI / 2, 0, 32); this.pc(D, 0.18, 0.18, 0.03, 3.482, 2.45, -2.9, 0, 0, Math.PI / 2, 32);
        this.drawClock(8 * 60);
      }
      // a fire axe behind glass on the bulkhead
      {
        const x = 3.47, z = -3.4, y = 1.45;
        this.pb('white', 0.04, 0.95, 0.36, x + 0.01, y, z);
        for (const s of [-1, 1]) { this.pb('red', 0.07, 1.0, 0.04, x - 0.02, y, z + s * 0.18); this.pb('red', 0.07, 0.04, 0.4, x - 0.02, y + s * 0.48, z); }
        this.beam('wood', V(x - 0.04, y - 0.4, z + 0.05), V(x - 0.04, y + 0.36, z - 0.02), 0.03, 0.035);
        this.pb('red', 0.03, 0.08, 0.2, x - 0.04, y + 0.33, z - 0.06); this.pb('steelBolt', 0.025, 0.07, 0.05, x - 0.04, y + 0.33, z - 0.17);
        this.pb('glass', 0.006, 0.92, 0.32, x - 0.055, y, z);
        this.sign('IN EMERGENCY\nBREAK GLASS', 0.3, 0.1, x - 0.06, y + 0.58, z, -Math.PI / 2, { w: 256, h: 84, size: 26, bold: true, bg: '#a01810', fg: '#f4e8d8', border: false, dirty: false });
      }
      // the coffee machine on the terminal desk, a cold half-pot on the warmer
      {
        const x = 2.02, z = -3.74;
        this.pb('black', 0.2, 0.03, 0.24, x, 0.915, z); this.pb('black', 0.18, 0.34, 0.08, x, 1.07, z - 0.085); this.pb('black', 0.2, 0.06, 0.22, x, 1.235, z - 0.01);
        this.pc('glass', 0.058, 0.064, 0.14, x, 1.0, z + 0.035, 0, 0, 0, 16); this.pc('black', 0.055, 0.06, 0.06, x, 0.962, z + 0.035, 0, 0, 0, 16);
        this.pc('black', 0.048, 0.048, 0.016, x, 1.075, z + 0.035, 0, 0, 0, 16); this.pt('black', 0.035, 0.007, x + 0.075, 1.01, z + 0.035, 0, 0, 0, 10, Math.PI);
        this.pb('glowRed', 0.016, 0.016, 0.004, x - 0.06, 1.235, z + 0.1);
      }
      // a pegboard over the port rack: painted outlines for every tool, half of them gone
      {
        const pg = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), MATS.get('pegboard')); pg.position.set(-7.04, 2.65, -2.6); pg.rotation.y = Math.PI / 2; this.group.add(pg);
        for (const s of [-1, 1]) this.pb(D, 0.03, 0.74, 0.03, -7.03, 2.65, -2.6 + s * 0.71);
        const zA = (u) => -2.6 - (u / 256 - 0.5) * 1.4, yA = (v) => 2.65 + (0.5 - v / 128) * 0.7;
        this.pc('wood', 0.014, 0.016, 0.42, -6.99, (yA(30) + yA(104)) / 2, zA(70), 0, 0, 0, 8); this.pb(SB, 0.04, 0.035, 0.1, -6.99, yA(24), zA(70));
        this.pt(SB, 0.045, 0.012, -6.99, yA(30), zA(120), 0, Math.PI / 2, 0, 12); this.pb(SB, 0.012, 0.36, 0.022, -6.99, (yA(40) + yA(106)) / 2, zA(120));
        for (const u of [27, 70, 120, 178, 225]) this.pc(SB, 0.004, 0.004, 0.05, -7.01, yA(12), zA(u), 0, 0, Math.PI / 2, 5);
      }
      // the Company's posters
      const poster = (title, sub, x, y, z, ry, w, h, bg, fg, mark) => {
        const [cv, g] = TEX.canvas(256, Math.round(256 * h / w));
        const H2 = cv.height; g.fillStyle = bg; g.fillRect(0, 0, 256, H2);
        g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(10, 10, 236, H2 - 20);
        if (mark) mark(g, H2);
        g.fillStyle = fg; g.textAlign = 'center'; g.font = 'bold 34px "Share Tech Mono", monospace';
        title.split('\n').forEach((l, i, a) => g.fillText(l, 128, H2 * 0.62 + (i - (a.length - 1) / 2) * 36));
        g.font = '15px "Share Tech Mono", monospace'; g.fillText(sub, 128, H2 - 26);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,30,20,${Math.random() * 0.12})`; g.fillRect(Math.random() * 256, Math.random() * H2, Math.random() * 40, Math.random() * 20); }
        g.fillStyle = 'rgba(230,220,190,.5)'; g.beginPath(); g.moveTo(256, 0); g.lineTo(226, 0); g.lineTo(256, 30); g.fill();
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1 }));
        m.position.set(x, y, z); m.rotation.y = ry; this.group.add(m);
        for (const [a, b] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const p = V(a * (w / 2 - 0.03), b * (h / 2 - 0.03), 0.004).applyAxisAngle(V(0, 1, 0), ry).add(V(x, y, z)); this.ps('red', 0.008, p.x, p.y, p.z, 1, 1, 1, 6); }
      };
      poster('KEEP THE\nHATCH SHUT\nAFTER DARK', 'THEY HEAR YOU  ·  MERCY SALVAGE CO.', -0.62, 2.05, 3.972, Math.PI, 0.55, 0.78, '#1a1512', '#d84a2a', (g, h) => {
        g.fillStyle = '#d84a2a'; g.beginPath(); g.ellipse(128, h * 0.27, 70, 30, 0, 0, TAU); g.fill();
        g.fillStyle = '#1a1512'; g.beginPath(); g.moveTo(70, h * 0.27); g.lineTo(196, h * 0.27 - 8); g.lineTo(196, h * 0.27 + 8); g.closePath(); g.fill();
        for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(120 + i * 12, h * 0.27 + 2); g.lineTo(126 + i * 12, h * 0.27 + 14); g.lineTo(132 + i * 12, h * 0.27 + 2); g.fill(); }
      });
      poster('EVERY SCRAP\nCOUNTS', 'QUOTA IS LIFE  ·  MERCY SALVAGE CO.', 2.65, 2.35, -3.972, 0, 0.72, 0.5, '#d9b24a', '#1d1a14', (g, h) => {
        g.strokeStyle = '#1d1a14'; g.lineWidth = 5; g.beginPath(); g.arc(128, h * 0.3, 26, 0, TAU); g.stroke();
        g.font = 'bold 26px "Share Tech Mono", monospace'; g.fillStyle = '#1d1a14'; g.textAlign = 'center'; g.fillText('M', 128, h * 0.3 + 9);
      });
      // a bin by the terminal, overflowing, and the one that missed
      {
        const x = 1.42, z = -3.25;
        this.pc('tunnel', 0.16, 0.14, 0.42, x, 0.21, z, 0, 0, 0, 18, true); this.pc(D, 0.14, 0.14, 0.01, x, 0.005, z, 0, 0, 0, 18); this.pt(D, 0.16, 0.008, x, 0.42, z, Math.PI / 2, 0, 0, 18);
        for (const [dx, dy, dz, r] of [[0, 0.4, 0, 0.06], [0.06, 0.43, 0.04, 0.045], [-0.05, 0.42, -0.05, 0.05], [0.04, 0.46, -0.04, 0.04]]) this.ps('paper', r, x + dx, dy, z + dz, 1, 0.85, 1, 7);
        this.ps('paper', 0.04, x + 0.3, 0.035, z + 0.25, 1, 0.8, 1, 7);
        this.col(x - 0.17, x + 0.17, z - 0.17, z + 0.17);
      }
    }
    // the charging station's readout: READY (and the cell's voltage) while it waits; charging, a bar of blocks filling
    // as it goes; then FULL for a moment. t: seconds since it started charging (null: idle)
    drawCharger(t = null) {
      const { g, tex } = this.chg, W = 128, Hh = 48, ink = '#6dff8a';
      g.fillStyle = '#031208'; g.fillRect(0, 0, W, Hh);
      g.fillStyle = ink; g.font = 'bold 15px "Share Tech Mono", monospace'; g.textBaseline = 'top';
      const k = t == null ? 0 : Math.min(1, t / 2.4);
      g.fillText(t == null ? 'READY' : k < 1 ? 'CHARGING' : 'FULL', 6, 5);
      if (t == null) g.fillText('48.2V', 74, 5);
      // (the bar: ten blocks, outlined)
      g.strokeStyle = ink; g.lineWidth = 2; g.strokeRect(6, 26, 104, 15); g.fillRect(110, 30, 5, 7);
      const n = t == null ? 0 : Math.floor(k * 10 + (k < 1 && (t * 6) % 1 < 0.5 ? 1 : 0));
      for (let i = 0; i < Math.min(10, n); i++) g.fillRect(9 + i * 10, 29, 8, 9);
      g.fillStyle = 'rgba(0,0,0,.28)'; for (let y = 0; y < Hh; y += 3) g.fillRect(0, y, W, 1);
      tex.needsUpdate = true;
    }
    // someone has just put something on charge
    charging() { if (this.chg) this.chg.t = 0; }
    // the clock's face: hours and minutes from minutes past midnight
    drawClock(m) {
      const { g, tex } = this.clock, c = 128;
      g.fillStyle = '#e4dcc4'; g.fillRect(0, 0, 256, 256);
      const gr = g.createRadialGradient(c, c, 60, c, c, 130); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(80,60,30,.35)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#1c1a16';
      for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU, r0 = i % 5 ? 112 : 98; g.lineWidth = i % 5 ? 2 : 6; g.beginPath(); g.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0); g.lineTo(c + Math.sin(a) * 120, c - Math.cos(a) * 120); g.stroke(); }
      g.fillStyle = '#1c1a16'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 30px "Share Tech Mono", monospace';
      for (const [n, a] of [['12', 0], ['3', 0.25], ['6', 0.5], ['9', 0.75]]) g.fillText(n, c + Math.sin(a * TAU) * 78, c - Math.cos(a * TAU) * 78);
      g.font = '14px "Share Tech Mono", monospace'; g.fillText('MERCY SALVAGE', c, c + 42);
      const hand = (a, len, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(c - Math.sin(a) * 14, c + Math.cos(a) * 14); g.lineTo(c + Math.sin(a) * len, c - Math.cos(a) * len); g.stroke(); };
      hand(((m % 720) / 720) * TAU, 62, 9, '#1c1a16'); hand(((m % 60) / 60) * TAU, 96, 5, '#1c1a16');
      g.fillStyle = '#a01810'; g.beginPath(); g.arc(c, c, 7, 0, TAU); g.fill();
      tex.needsUpdate = true;
    }
    // ---------- flight deck dressing ----------
    buildCockpitDetail() {
      const D = 'darkmetal', SB = 'steelBolt';
      const th = Math.atan2(CK.w0 - CK.w1, CK.x1 - CK.x0);
      const basis = (X, Z, pos) => { const Y = new THREE.Vector3().crossVectors(Z, X).normalize(); return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(pos); };
      // flight sticks between each pilot's knees, and rudder pedals under the dash
      for (const z of [-0.95, 0.95]) {
        this.pb(D, 0.2, 0.08, 0.2, 6.88, 0.04, z); this.pc('rubber', 0.07, 0.09, 0.08, 6.88, 0.12, z, 0, 0, 0, 12);
        this.pc(D, 0.018, 0.018, 0.48, 6.86, 0.38, z, 0, 0, 0.12, 8);
        this.pc('black', 0.034, 0.03, 0.15, 6.83, 0.68, z, 0, 0, 0.12, 10); this.ps('black', 0.036, 6.825, 0.76, z, 1, 0.8, 1, 10);
        this.pc('red', 0.012, 0.012, 0.014, 6.82, 0.785, z, 0, 0, 0, 8); this.pb('black', 0.02, 0.04, 0.012, 6.87, 0.66, z);
        for (const dz of [-0.13, 0.13]) { this.pb('rubber', 0.18, 0.03, 0.09, 7.3, 0.12, z + dz, 0, 0, 0.6); this.pb(D, 0.03, 0.12, 0.03, 7.36, 0.06, z + dz); }
      }
      this.pb('rubber', 2.2, 0.012, 3.0, 6.6, 0.006, 0);
      // side consoles along both walls under the windows: screen, button banks, throttles, a mug, a clipboard
      for (const side of [-1, 1]) {
        const dir = V(Math.cos(th), 0, -side * Math.sin(th)), nin = V(-Math.sin(th), 0, -side * Math.cos(th)), ry = side > 0 ? th : -th, tilt = 0.25;
        const W = (u, o, y) => V(CK.x0, y, side * CK.w0).addScaledVector(dir, u).addScaledVector(nin, o);
        const u0 = 1.35, u1 = 3.3, um = (u0 + u1) / 2, dep = 0.44;
        const c = W(um, dep / 2, 0.45); this.pb('painted', u1 - u0, 0.9, dep, c.x, c.y, c.z, 0, ry, 0);
        const t = W(um, dep / 2 + 0.02, 0.93); this.pb(D, u1 - u0 + 0.04, 0.05, dep + 0.08, t.x, t.y, t.z, -side * tilt, ry, 0);
        const topY = (o) => 0.955 - (o - (dep / 2 + 0.02)) * Math.tan(tilt) + 0.006;
        const nTop = V(0, Math.cos(tilt), 0).addScaledVector(nin, Math.sin(tilt)).normalize();
        // screen
        const sp = W(1.8, 0.25, topY(0.25) + 0.004);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ map: TEX.sign(side < 0 ? 'COMMS  CH 4\nSIG  -71dB\nLINK  OK' : 'ENG  1  OK\nENG  2  OK\nRCS  ARM', { w: 256, h: 160, size: 30, bg: '#031008', fg: '#5dff7a', border: false, dirty: false }) }));
        scr.geometry.applyMatrix4(basis(dir.clone().multiplyScalar(-side), nTop, sp)); this.group.add(scr);   // (the right way up, standing in the aisle facing it)
        // button banks
        for (let i = 0; i < 10; i++) for (let r = 0; r < 2; r++) { const o = 0.16 + r * 0.14, p = W(2.2 + i * 0.07, o, topY(o)); this.pb(['glowAmber', 'glowGreen', 'black', 'glowRed', 'black'][(i + r * 3) % 5], 0.032, 0.014, 0.032, p.x, p.y, p.z, -side * tilt, ry, 0); }
        // throttle quadrant by the pilot's hand
        { const b = W(3.0, 0.3, topY(0.3)); this.pb('black', 0.22, 0.06, 0.16, b.x, b.y + 0.03, b.z, -side * tilt, ry, 0);
          for (const k of [-1, 1]) { const p0 = W(3.0, 0.3 + k * 0.04, topY(0.3) + 0.05), p1 = W(3.09, 0.3 + k * 0.04, topY(0.3) + 0.24); this.beam(D, p0, p1, 0.016); this.ps(k < 0 ? 'black' : 'red', 0.03, p1.x, p1.y, p1.z, 1, 1, 1, 8); } }
        if (side > 0) { const m = W(1.55, 0.3, topY(0.3)); this.pc('black', 0.05, 0.05, 0.03, m.x, m.y + 0.015, m.z, 0, 0, 0, 12); this.mug(m.x, m.y + 0.03, m.z, Math.PI); }
        else { const m = W(1.47, 0.27, topY(0.27) + 0.008);   // (the clipboard at the end, clear of the screen)
          this.put('cork', new THREE.BoxGeometry(0.24, 0.012, 0.32), basis(dir, nTop, m)); this.put('paper', new THREE.PlaneGeometry(0.2, 0.27), basis(dir, nTop, m.clone().addScaledVector(nTop, 0.008))); }
        const oc = W(um, dep / 2, 0); this.obb(oc.x, oc.z, (u1 - u0) / 2, dep / 2, ry);
        // sun visor hinged at the top of the windshield
        this.pc(D, 0.012, 0.012, 0.8, 6.62, 2.86, side * 0.95, Math.PI / 2, 0, 0, 6); this.pb('pad', 0.02, 0.32, 0.75, 6.67, 2.71, side * 0.95, 0, 0, 0.35);
        // cable runs along the roof edge
        const e = (x, y) => V(x, y, side * (halfAt(x) - 0.14));
        this.tube('cable', [e(3.8, 2.84), e(4.6, 2.79), e(5.4, 2.84), e(6.2, 2.8), e(6.55, 2.85)], 0.022, 24);
        this.tube('black', [e(3.8, 2.8), e(4.7, 2.76), e(5.5, 2.81), e(6.5, 2.79)], 0.014, 24);
        // grab handle
        this.pt(D, 0.09, 0.013, 4.75, 2.88, side * 1.7, 0, 0, Math.PI, 12, Math.PI);
      }
      // dash: a row of analog gauges, toggle switches, a bobblehead and sticky notes
      for (const [i, z] of [-1.62, -1.3, -0.45, -0.15, 0.15, 0.45, 1.3, 1.62].entries()) {
        this.put('gauge', new THREE.CircleGeometry(0.07, 20), mat(7.468, 0.64, z, 0, -Math.PI / 2, 0));
        this.pt(SB, 0.072, 0.009, 7.47, 0.64, z, 0, Math.PI / 2, 0, 18);
        const a = -0.9 + ((i * 0.83) % 1.8);
        this.pb('red', 0.004, 0.05, 0.004, 7.462, 0.64 + Math.cos(a) * 0.022, z - Math.sin(a) * 0.022, -a, 0, 0);
      }
      for (let z = -1.7; z <= 1.71; z += 0.17) { this.pb('black', 0.015, 0.03, 0.025, 7.468, 0.42, z); this.pc(SB, 0.005, 0.005, 0.045, 7.45, 0.44, z, 0, 0, 0.5, 6); }
      this.pb('yellow', 0.05, 0.06, 0.04, 7.72, 0.99, 1.68); this.pc(SB, 0.006, 0.006, 0.03, 7.72, 1.03, 1.68, 0, 0, 0, 6); this.ps('yellow', 0.035, 7.72, 1.07, 1.68, 1, 1, 1, 10);
      this.pb('glowAmber', 0.006, 0.008, 0.012, 7.687, 1.075, 1.67); this.pb('glowAmber', 0.006, 0.008, 0.012, 7.687, 1.075, 1.69);
      this.pq('noteY', 0.07, 0.07, 7.7, 0.965, -1.62, -(Math.PI / 2 - 0.35), -Math.PI / 2, 0.2); this.pq('noteP', 0.07, 0.07, 7.78, 0.99, -1.7, -(Math.PI / 2 - 0.35), -Math.PI / 2, -0.15);
      // pedestal knobs
      for (const z of [-0.18, 0.18]) this.pc('black', 0.025, 0.025, 0.03, 6.5, 0.81, z, 0, 0, 0, 10);
      // overhead: toggle banks, a striped emergency handle, a dome light
      for (let r = 0; r < 2; r++) for (let c = 0; c < 9; c++) { const x = 5.25 + c * 0.13, z = r ? 0.62 : -0.62; this.pb('black', 0.05, 0.02, 0.04, x, CK.roof - 0.105, z); this.pc(SB, 0.006, 0.006, 0.05, x + 0.012, CK.roof - 0.135, z, 0, 0, 0.5, 6); }
      this.pc(D, 0.006, 0.006, 0.15, 5.05, 2.73, 0, 0, 0, 0, 6); this.pb('hazard', 0.04, 0.04, 0.22, 5.05, 2.64, 0);
      this.sign('DO NOT PULL', 0.4, 0.06, 5.095, 2.85, 0, -Math.PI / 2, { w: 256, h: 40, size: 30, bg: '#1b1b18', fg: '#ff5a3a', border: false, dirty: false });
      this.pc(D, 0.14, 0.14, 0.04, 4.6, 2.88, 0, 0, 0, 0, 16); this.pc('glowWarm', 0.11, 0.11, 0.01, 4.6, 2.857, 0, 0, 0, 0, 16);
      // aft of the seats: an avionics rack, a route chart, a jacket and a hard hat on hooks
      this.pb(D, 0.5, 2.2, 1.0, 3.96, 1.1, -2.3);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) this.pb((r * 7 + c * 3) % 5 ? 'glowGreen' : 'glowAmber', 0.006, 0.015, 0.015, 4.213, 0.75 + r * 0.14, -2.6 + c * 0.11);
      this.pb('vent', 0.006, 0.3, 0.8, 4.213, 0.32, -2.3); this.pb('vent', 0.006, 0.25, 0.8, 4.213, 2.0, -2.3); this.pb('hardware', 0.03, 0.4, 0.025, 4.225, 1.3, -1.86);
      this.col(3.7, 4.25, -2.82, -1.78);
      {
        const [cc, cg] = TEX.canvas(256, 192);
        cg.fillStyle = '#d8cfb4'; cg.fillRect(0, 0, 256, 192);
        cg.strokeStyle = 'rgba(60,80,90,.25)'; cg.lineWidth = 1; for (let i = 0; i < 256; i += 16) { cg.beginPath(); cg.moveTo(i, 0); cg.lineTo(i, 192); cg.stroke(); } for (let i = 0; i < 192; i += 16) { cg.beginPath(); cg.moveTo(0, i); cg.lineTo(256, i); cg.stroke(); }
        cg.fillStyle = '#2a2620'; cg.font = 'bold 13px monospace'; cg.fillText('MERCY SALVAGE CO. - ROUTE CHART', 10, 16);
        const P = [[50, 70, 'ASHGROVE'], [140, 50, 'KESSLER'], [200, 120, 'NADIR'], [90, 150, 'THE HOLLOW']];
        cg.setLineDash([4, 4]); cg.strokeStyle = '#8a2a1a'; cg.lineWidth = 1.5; cg.beginPath(); P.forEach(([x, y], i) => (i ? cg.lineTo(x, y) : cg.moveTo(x, y))); cg.stroke(); cg.setLineDash([]);
        for (const [x, y, n] of P) { cg.fillStyle = '#4a5a60'; cg.beginPath(); cg.arc(x, y, 9, 0, TAU); cg.fill(); cg.fillStyle = '#2a2620'; cg.font = '10px monospace'; cg.fillText(n, x - 20, y + 22); }
        cg.strokeStyle = '#b02010'; cg.lineWidth = 2; cg.beginPath(); cg.moveTo(84, 144); cg.lineTo(96, 156); cg.moveTo(96, 144); cg.lineTo(84, 156); cg.stroke();
        const tx = new THREE.CanvasTexture(cc); tx.colorSpace = THREE.SRGBColorSpace;
        const chart = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.75), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.9 }));
        chart.position.set(3.712, 1.8, 2.25); chart.rotation.y = Math.PI / 2; this.group.add(chart);
        this.pb(D, 0.02, 0.79, 0.03, 3.715, 1.8, 1.735); this.pb(D, 0.02, 0.79, 0.03, 3.715, 1.8, 2.765);
      }
      for (const z of [1.45, 1.75]) this.wallHook(3.71, 1.61, z, Math.PI / 2);
      this.jacket(3.8, 1.594, 1.45, Math.PI / 2);
      // (a hat sits on its hook by the headband inside it and leans back until its brim rests on the wall)
      this.hardHat('yellow', 3.7 + 0.193, 1.596, 1.75, -0.15, Math.PI / 2 - 0.05, 0);
    }
    // ---------- outer hull ----------
    // The skin (shaped by hullSec above) is lofted nose to tail. The cabin's openings are cut out of it per pixel in its
    // shader, so every edge is exact, and each is lined through the hull's thickness to the cabin: a sleeve for each
    // porthole, a doorway for the hatch with the ramp's slot under its sill, a deep reveal for each of the flight
    // deck's side windows. They're glazed flush with the skin and ringed in dark paint, the way airliners wear them.
    buildHull() {
      const tex = TEX.get('hullSkin'), ntex = TEX.get('hullSkinN');
      const skinMat = new THREE.MeshStandardMaterial({ map: tex, normalMap: ntex, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.55, metalness: 0.4, vertexColors: true });
      const ptex = tex.clone(); ptex.repeat.set(0.25, 0.25); ptex.needsUpdate = true;
      const pntex = ntex.clone(); pntex.repeat.set(0.25, 0.25); pntex.needsUpdate = true;
      const panelMat = new THREE.MeshStandardMaterial({ map: ptex, normalMap: pntex, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.55, metalness: 0.4, color: 0xd8d8d6 });
      this.cm.hullPanel = panelMat;
      // outer glazing: dark and glossy from outside, invisible from within (it's single-sided)
      const outGlass = new THREE.MeshStandardMaterial({ color: 0x0b1116, roughness: 0.06, metalness: 0.85, transparent: true, opacity: 0.42, depthWrite: false });
      const addMesh = (geo, m) => { const me = new THREE.Mesh(geo, m); me.castShadow = true; me.receiveShadow = true; this.group.add(me); return me; };
      // ---- the openings, tested per pixel in ship coordinates (the skin's shadow has them too) ----
      const f = (v) => v.toFixed(4);
      const wsL = Math.hypot(CK.x1 - CK.wsTop, CK.roof - CK.sill), wsU = [(CK.wsTop - CK.x1) / wsL, (CK.roof - CK.sill) / wsL], wsN = [wsU[1], -wsU[0]];
      const holes = `varying vec3 vHullP;
        float hullBox(vec2 p, vec2 c, vec2 h, float r) { vec2 q = abs(p - c) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
        bool hullHole(vec3 p) {
          float az = abs(p.z);
          if (p.y > 3.6 && length(p.xz - vec2(${f(ROOF.hx)}, ${f(ROOF.hz)})) < 0.44) return true;
          if (az > 4.0 && p.x > -7.4 && p.x < 3.7) {
            ${PORTS.map(([x, s]) => `if (p.z * ${f(s)} > 0.0 && length(p.xy - vec2(${f(x)}, 1.75)) < ${f(PORT_R)}) return true;`).join('\n            ')}
            if (p.z > 0.0 && p.y > ${f(DOOR.y0)} && hullBox(p.xy, vec2(${f((DOOR.x0 + DOOR.x1) / 2)}, ${f((DOOR.y1 + DOOR.y0 - 1) / 2)}), vec2(${f((DOOR.x1 - DOOR.x0) / 2)}, ${f((DOOR.y1 - DOOR.y0 + 1) / 2)}), ${f(DOOR.r)}) < 0.0) return true;
          }
          if (az > 1.5 && hullBox(p.xy, vec2(${f((WIN.x0 + WIN.x1) / 2)}, ${f((WIN.y0 + WIN.y1) / 2)}), vec2(${f((WIN.x1 - WIN.x0) / 2)}, ${f((WIN.y1 - WIN.y0) / 2)}), ${f(WIN.r)}) < 0.0) return true;
          vec2 d = p.xy - vec2(${f(CK.x1)}, ${f(CK.sill)});
          float s = dot(d, vec2(${f(wsU[0])}, ${f(wsU[1])})), h = dot(d, vec2(${f(wsN[0])}, ${f(wsN[1])}));
          return s > -0.04 && s < ${f(wsL + 0.04)} && h > -0.2 && h < 0.35 && az < ${f(CK.w1 + 0.05)} + ${f(halfAt(CK.wsTop) - CK.w1)} * s / ${f(wsL)};
        }
`;
      // (and the paint, on the skin itself: charcoal below the chine, the top of the nose dark ahead of the glass, and the
      // livery, an orange cheatline with a dark pinstripe under it tapering off at both ends, broken by the hatch; each
      // edge crisp at any distance, and never a hair off the skin to flicker against it, seen however low along it)
      const paint = `#include <color_fragment>
          { float aa = fwidth(vHullP.y) + 0.002;
            diffuseColor.rgb *= mix(0.46, 1.0, smoothstep(0.36 - aa, 0.36 + aa, vHullP.y));
            diffuseColor.rgb *= mix(1.0, 0.4, step(${f(CK.x1 + 0.05)}, vHullP.x) * smoothstep(0.62 - aa, 0.62 + aa, vHullP.y));
            float tp = smoothstep(-13.6, -11.6, vHullP.x) * (1.0 - smoothstep(8.6, 10.4, vHullP.x));
            tp *= 1.0 - step(0.0, vHullP.z) * step(${f(DOOR.x0 - 0.15)}, vHullP.x) * step(vHullP.x, ${f(DOOR.x1 + 0.15)});
            float ob = 1.0 - smoothstep(0.17 * tp - aa, 0.17 * tp + aa, abs(vHullP.y - 0.74)), pb = 1.0 - smoothstep(0.025 * tp - aa, 0.025 * tp + aa, abs(vHullP.y - 0.5));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.539, 0.037, 0.010), ob * step(0.001, tp));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.0075, 0.008, 0.0085), pb * step(0.001, tp)); }`;
      const cut = (m, painted) => {
        m.onBeforeCompile = (sh) => {
          sh.vertexShader = 'varying vec3 vHullP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHullP = position;');
          sh.fragmentShader = holes + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (hullHole(vHullP)) discard;');
          if (painted) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', paint);
        };
        m.customProgramCacheKey = () => (painted ? 'hullSkin' : 'hullHoles');
        return m;
      };
      cut(skinMat, true);
      // ---- the skin ----
      // half a section (the +z side), from the bottom centre round to the top centre: [z, y]
      const halfSec = (p) => {
        const pts = [];
        for (let i = 0; i <= 3; i++) pts.push([(p.fb * i) / 3, p.B]);
        for (let i = 1; i <= 12; i++) { const a = (1 - i / 12) * Math.PI / 2; pts.push([p.fb + (p.A - p.fb) * Math.pow(Math.cos(a), 2 / p.nl), p.ym - (p.ym - p.B) * Math.pow(Math.sin(a), 2 / p.nl)]); }
        for (let i = 1; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; pts.push([p.ft + (p.A - p.ft) * Math.pow(Math.cos(a), 2 / p.nu), p.ym + (p.T - p.ym) * Math.pow(Math.sin(a), 2 / p.nu)]); }
        for (let i = 1; i <= 4; i++) pts.push([p.ft * (1 - i / 4), p.T]);
        return pts;
      };
      const loop = (half) => { const out = half.slice(); for (let k = half.length - 2; k >= 0; k--) out.push([-half[k][0], half[k][1]]); return out; };
      const girth = (pts) => { let s = 0; for (let j = 1; j < pts.length; j++) s += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); return s; };
      // stations: fine through the curves, coarse along the constant body, bunched into the nose cap
      const st = [], run = (a, b, n) => { for (let i = 0; i < n; i++) st.push(+lerp(a, b, i / n).toFixed(4)); };
      run(HULL.x0, -7.4, 34); run(-7.4, 1.0, 8); run(1.0, CK.wsTop, 28); run(CK.wsTop, CK.x1, 8);
      for (let i = 0; i <= 26; i++) st.push(+(HULL.cap + (HULL.x1 - HULL.cap) * Math.sin((i / 26) * Math.PI / 2)).toFixed(4));
      {
        // around the hull, texture runs by the fraction of each section's own girth (scaled to the bay's), so plate
        // seams follow the hull lines and converge where it tapers
        const vref = girth(loop(halfSec(hullSec(0)))), pos = [], uv = [], col = [], idx = [];
        let M = 0;
        for (const x of st) {
          const pts = loop(halfSec(hullSec(x))), k = vref / (girth(pts) || 1);
          let s = 0; M = pts.length;
          pts.forEach(([z, y], j) => {
            if (j) s += Math.hypot(z - pts[j - 1][0], y - pts[j - 1][1]);
            pos.push(x, y, z); uv.push(x / 4, (s * k) / 4);
            // grime: darker toward the belly, sooty toward the engines; the radome a darker grey
            const c = (0.52 + 0.48 * sstep(-0.9, 1.2, y)) * (0.68 + 0.32 * sstep(HULL.x0 + 0.6, HULL.x0 + 3.7, x)) * (x > HULL.x1 - 0.75 ? 0.62 : 1);
            col.push(c, c, c * 0.98);
          });
        }
        for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < M - 1; j++) { const a = i * M + j, b = a + M; idx.push(a, b, b + 1, a, b + 1, a + 1); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
        addMesh(geo, skinMat).customDepthMaterial = cut(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
      }
      // tail end: the engine bulkhead closing the skin
      {
        const pts = loop(halfSec(hullSec(HULL.x0))).filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-4), sh = new THREE.Shape();
        pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
        const geo = new THREE.ShapeGeometry(sh); geo.applyMatrix4(new THREE.Matrix4().makeBasis(V(0, 0, 1), V(0, 1, 0), V(-1, 0, 0)).setPosition(HULL.x0, 0, 0));
        addMesh(geo, MATS.get('darkmetal'));
        // a heavy lip round the end of the skin
        const lip = pts.map(([z, y]) => V(HULL.x0 - 0.01, y, z)); this.tube('darkmetal', lip, 0.05, lip.length * 2, 6);
      }
      // ---- lining, glazing and paint round the openings ----
      const D = { lining: [], band: [] };
      const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...a, ...c, ...d);
      const sk = (x, y, s, e = 0) => [x, y, s * (skinW(x, y) + e)];
      // a rounded rectangle's outline, n points a side, from the lower back corner along the bottom, up the front, back
      // along the top and down the back, closed (topOnly: only the top corners are rounded)
      const rrect = (x0, x1, y0, y1, r, n, topOnly) => {
        const out = [], cs = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        for (let c = 0; c < 4; c++) for (let i = 0; i < n; i++) {
          const [ax, ay] = cs[c], [bx, by] = cs[(c + 1) % 4], t = i / n;
          let px = lerp(ax, bx, t), py = lerp(ay, by, t);
          const cx = clamp(px, x0 + r, x1 - r), cy = clamp(py, y0 + r, y1 - r);
          if (r > 0 && px !== cx && py !== cy && (!topOnly || py > y1 - r)) { const l = Math.hypot(px - cx, py - cy); px = cx + ((px - cx) / l) * r; py = cy + ((py - cy) / l) * r; }
          out.push([px, py]);
        }
        out.push(out[0]); return out;
      };
      // a pane of glass lying in the skin over a rounded rectangle
      const pane = (x0, x1, y0, y1, r, s) => {
        const nx = 24, ny = 10, pos = [], idx = [];
        for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
          let x = lerp(x0, x1, i / nx), y = lerp(y0, y1, j / ny);
          const cx = clamp(x, x0 + r, x1 - r), cy = clamp(y, y0 + r, y1 - r), l = Math.hypot(x - cx, y - cy);
          if (l > r) { x = cx + ((x - cx) / l) * r; y = cy + ((y - cy) / l) * r; }
          pos.push(...sk(x, y, s, -0.004));
        }
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 2, d = a + nx + 1;
          if (s > 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
        const me = addMesh(geo, outGlass); me.castShadow = false;
      };
      // the flight deck's side windows: from the frame round each opening in the cabin wall out to the skin, a reveal
      // that splays forward (the way the pilots look), glazed at the skin
      {
        const th = Math.atan2(CK.w0 - CK.w1, CK.x1 - CK.x0), Lw = Math.hypot(CK.x1 - CK.x0, CK.w0 - CK.w1), uTop = ((CK.wsTop - CK.x0) / (CK.x1 - CK.x0)) * Lw;
        for (const s of [-1, 1]) {
          const dir = V(Math.cos(th), 0, -s * Math.sin(th)), out = V(Math.sin(th), 0, s * Math.cos(th));
          const at = (u, v) => V(CK.x0, v, s * CK.w0).addScaledVector(dir, u).addScaledVector(out, 0.3).toArray();
          const inner = rrect(0.35, uTop - 0.2, 1.25, 2.45, 0, 16).map(([u, v]) => at(u, v));
          const rim = rrect(WIN.x0, WIN.x1, WIN.y0, WIN.y1, WIN.r, 16), ring = rrect(WIN.x0 - 0.11, WIN.x1 + 0.11, WIN.y0 - 0.11, WIN.y1 + 0.11, WIN.r + 0.11, 16);
          for (let i = 0; i < inner.length - 1; i++) {
            quad(D.lining, inner[i], inner[i + 1], sk(...rim[i + 1], s, 0.002), sk(...rim[i], s, 0.002));
            quad(D.band, sk(...rim[i], s, 0.006), sk(...rim[i + 1], s, 0.006), sk(...ring[i + 1], s, 0.006), sk(...ring[i], s, 0.006));
          }
          pane(WIN.x0, WIN.x1, WIN.y0, WIN.y1, WIN.r, s);
        }
      }
      // the windshield: the skin runs just proud of the glass; a reveal down each side and under the brow, and a dark
      // surround painted on the skin
      {
        const hwT = halfAt(CK.wsTop) + 0.05, hwB = CK.w1 + 0.05, kT = (1.02 - 3.12) / (CK.x1 - CK.wsTop);
        const g = (sv) => [CK.x1 + wsU[0] * sv, CK.sill + wsU[1] * sv];
        // the skin's height over the glass at sv (along the glass's normal, onto the skin's plane)
        const hs = (sv) => { const [gx, gy] = g(sv); return Math.max(0, (3.12 + (gx - CK.wsTop) * kT - gy) / (wsN[1] - wsN[0] * kT)); };
        for (let i = 0; i < 10; i++) for (const s of [-1, 1]) {
          const a = (i / 10) * wsL, b = ((i + 1) / 10) * wsL, za = s * lerp(hwB, hwT, a / wsL), zb = s * lerp(hwB, hwT, b / wsL);
          const [ax, ay] = g(a), [bx, by] = g(b), ha = hs(a), hb = hs(b);
          quad(D.lining, [ax, ay, za], [bx, by, zb], [bx + wsN[0] * hb, by + wsN[1] * hb, zb], [ax + wsN[0] * ha, ay + wsN[1] * ha, za]);
        }
        { const sv = wsL + 0.04, [gx, gy] = g(sv), h = hs(wsL); quad(D.lining, [gx, gy, -hwT], [gx, gy, hwT], [gx + wsN[0] * h, gy + wsN[1] * h + 0.06, hwT], [gx + wsN[0] * h, gy + wsN[1] * h + 0.06, -hwT]); }
        const xT = CK.wsTop + 0.076, xB = CK.x1 + 0.036, top = ([x, z]) => [x, skinTop(x, z) + 0.005, z];
        const inn = [[xB, -hwB], [xB, hwB], [xT, hwT], [xT, -hwT]], outr = [[xB + 0.1, -hwB - 0.1], [xB + 0.1, hwB + 0.1], [CK.wsTop + 0.005, hwT + 0.1], [CK.wsTop + 0.005, -hwT - 0.1]];
        const P = (L, e, t) => { const a = L[e], b = L[(e + 1) % 4]; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; };
        for (let e = 0; e < 4; e++) for (let i = 0; i < 12; i++) quad(D.band, top(P(inn, e, i / 12)), top(P(inn, e, (i + 1) / 12)), top(P(outr, e, (i + 1) / 12)), top(P(outr, e, i / 12)));
      }
      // the bay portholes: a sleeve out from the cabin's porthole to the skin, a ring and flush glass there
      for (const [x, s] of PORTS) {
        const zo = skinW(x, 1.75), len = zo + 0.01 - 4.35;
        this.pc('tunnel', PORT_R, PORT_R, len, x, 1.75, s * (4.35 + len / 2), Math.PI / 2, 0, 0, 24, true);
        this.pt('darkmetal', PORT_R + 0.035, 0.04, x, 1.75, s * (zo + 0.005), 0, 0, 0, 24);
        const gl = new THREE.Mesh(new THREE.CircleGeometry(PORT_R, 24), outGlass); gl.position.set(x, 1.75, s * (zo - 0.004)); gl.rotation.y = s > 0 ? 0 : Math.PI; this.group.add(gl);
      }
      // the hatch stands at the back of a doorway through the hull; under its sill, the slot the ramp runs out of
      {
        const cx = (SHIP.doorX0 + SHIP.doorX1) / 2, w = DOOR.x1 - DOOR.x0;
        const rim = rrect(DOOR.x0, DOOR.x1, DOOR.y0, DOOR.y1, DOOR.r, 14, true), ring = rrect(DOOR.x0 - 0.1, DOOR.x1 + 0.1, DOOR.y0 - 0.1, DOOR.y1 + 0.1, DOOR.r + 0.1, 14, true);
        for (let i = 0; i < rim.length - 1; i++) {
          const [x0, y0] = rim[i], [x1, y1] = rim[i + 1];
          quad(D.lining, [x0, y0, 4.17], [x1, y1, 4.17], sk(x1, y1, 1, 0.002), sk(x0, y0, 1, 0.002));
          quad(D.band, sk(x0, y0, 1, 0.006), sk(x1, y1, 1, 0.006), sk(...ring[i + 1], 1, 0.006), sk(...ring[i], 1, 0.006));
        }
        const zs = skinW(cx, 0) + 0.04;
        this.pb('darkmetal', w, 0.06, zs - 4.17, cx, -0.03, (4.17 + zs) / 2);
        this.pb('hazard', w - 0.1, 0.006, 0.1, cx, 0.003, zs - 0.08);
        this.pb('darkmetal', w, 0.02, 3.6, cx, -0.34, 4.17 - 1.8);
        for (const x of [DOOR.x0, DOOR.x1]) this.pb('darkmetal', 0.02, 0.2, 3.6, x, -0.24, 4.17 - 1.8);
        this.pb('darkmetal', w, 0.2, 0.02, cx, -0.24, 0.57);
      }
      const mk = (pos, m) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return addMesh(g, m); };
      mk(D.lining, this.cm.tunnel);
      mk(D.band, new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.4, metalness: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })).castShadow = false;
      // (the livery is painted on the skin: see paint)
      // a raised seam along each shoulder
      for (const s of [-1, 1]) { const pts = []; for (let x = -11; x <= 5.01; x += 1) { const u = upperAt(x, 0.5); pts.push(V(x, u.y, s * u.z)); } this.tube('darkmetal', pts, 0.03, 48, 6); }
      // belly lights
      for (const x of [-6, 2.5]) { const y = skinBot(x, 0); this.pc('darkmetal', 0.16, 0.18, 0.06, x, y, 0, 0, 0, 0, 14); this.pc('glowWarm', 0.11, 0.11, 0.012, x, y - 0.035, 0, 0, 0, 0, 14); }
      // people outside walk round the skin, not through it: boxes stepping along its plan (the cabin's own walls, inside,
      // keep theirs)
      const wmax = (a, b) => { let m = 0; for (let i = 0; i <= 4; i++) m = Math.max(m, hullSec(lerp(a, b, i / 4)).A); return m + 0.05; };
      for (let i = 0; i < 9; i++) { const a = lerp(HULL.x0, -7.4, i / 9), b = lerp(HULL.x0, -7.4, (i + 1) / 9), w = wmax(a, b); this.col(a, b, -w, w); }
      const wb = wmax(-7.4, 3.7);
      this.col(-7.4, 3.7, -wb, -4.17); this.col(-7.4, DOOR.x0, 4.17, wb); this.col(DOOR.x1, 3.7, 4.17, wb);
      for (let i = 0; i < 9; i++) { const a = lerp(3.7, CK.x1, i / 9), b = lerp(3.7, CK.x1, (i + 1) / 9), w = wmax(a, b), z0 = halfAt(a) + 0.36; this.col(a, b, z0, w); this.col(a, b, -w, -z0); }
      for (let i = 0; i < 5; i++) { const a = lerp(CK.x1, HULL.x1, i / 5), b = lerp(CK.x1, HULL.x1, (i + 1) / 5), w = wmax(a, b); this.col(a, b, -w, w); }
    }
    buildExterior() {
      const dm = MATS.get('darkmetal');
      this.engineGlows = [];
      const glowDisc = (r, x, y, z, faceX) => { const gl = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: 0x331208 })); gl.position.set(x, y, z); gl.rotation.y = faceX; this.group.add(gl); this.engineGlows.push(gl); };
      // a cylinder standing along an axis
      const pcAx = (m, r1, r2, h, p, axis, seg = 12) => this.put(m, new THREE.CylinderGeometry(r1, r2, h, seg), new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis.clone().normalize()), V(1, 1, 1)));
      // the engines: the main bell set into the tail's bulkhead, and a nacelle either side of the tail on a stub pylon,
      // each bell with a lip, a rusted throat, a centre cone and its glow
      const X0 = HULL.x0;
      const bell = (r, x, y, z) => {
        this.pc('darkmetal', r, r * 0.78, r * 0.9, x - r * 0.42, y, z, 0, 0, Math.PI / 2, 24, true);
        this.pt('darkmetal', r, r * 0.06, x - r * 0.87, y, z, 0, Math.PI / 2, 0, 24);
        this.pc('rust', r * 0.6, r * 0.6, r * 0.4, x - r * 0.2, y, z, 0, 0, Math.PI / 2, 20, true);
        this.pc('darkmetal', 0.0, r * 0.3, r * 0.7, x - r * 0.45, y, z, 0, 0, Math.PI / 2, 16);
        glowDisc(r * 0.6, x - r * 0.22, y, z, -Math.PI / 2);
      };
      bell(ENGINES.main[1], X0, ENGINES.main[0], 0);
      // (where the main engine fires from, for the flight's sound and the burn it leaves on the ground)
      this.exhaust = V(ENGINES.mx, ENGINES.main[0], 0);
      this.exhausts = [this.exhaust, V(ENGINES.sx, ENGINES.side[0], ENGINES.side[1]), V(ENGINES.sx, ENGINES.side[0], -ENGINES.side[1])];
      this.col(X0 - 0.7, X0, -1.6, 1.6);
      // a flat swept surface (fin, pylon, strake) from its planform in (x, out): rounded edges, thickness t, then
      // placed by m4 (its root runs along x at out = 0, its upper face at y = 0 before placing)
      const surface = (pts, t, m4, m = this.cm.hullPanel) => {
        const sh = new THREE.Shape(); pts.forEach(([x, w], i) => (i ? sh.lineTo(x, w) : sh.moveTo(x, w))); sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: Math.min(0.06, t * 0.3), bevelSize: Math.min(0.08, t * 0.4), bevelSegments: 3, curveSegments: 4 });
        g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)); g.applyMatrix4(m4);
        // (a mirrored copy is wound inside out: swap two corners of every triangle to turn it the right way round)
        if (m4.determinant() < 0) for (const a of Object.values(g.attributes)) { const n = a.itemSize, v = a.array; for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) { const t = v[(i + 1) * n + k]; v[(i + 1) * n + k] = v[(i + 2) * n + k]; v[(i + 2) * n + k] = t; } }
        return this.mesh(g, m);
      };
      const mirror = new THREE.Matrix4().makeScale(1, 1, -1);
      // the nacelles: long round pods either side of the tail, an intake ring with its fan up front, a bell out the back,
      // a raised spine of panels along the top and the nav light (red to port, green to starboard) in each nose; a
      // swept pylon fairs each one into the hull
      {
        const [ny, nz, nr] = ENGINES.side, a = ENGINES.nx0, b = ENGINES.nx1, len = a - b, ax = (m, r1, r2, h, x, y, z, seg = 24, open) => this.pc(m, r1, r2, h, x, y, z, 0, 0, Math.PI / 2, seg, open);
        for (const s of [-1, 1]) {
          const z = s * nz;
          ax('hullPanel', nr, nr, len - 1.8, (a + b) / 2 + 0.1, ny, z, 28);
          ax('hullPanel', nr, nr * 0.86, 0.8, a - 0.4, ny, z, 28, true);
          this.pt('darkmetal', nr * 0.86, 0.06, a, ny, z, 0, Math.PI / 2, 0, 28);
          ax('black', nr * 0.8, nr * 0.8, 0.05, a - 0.35, ny, z, 24);
          ax('darkmetal', nr * 0.3, 0.0, 0.5, a - 0.12, ny, z, 16);
          for (let i = 0; i < 9; i++) this.pb('darkmetal', 0.05, nr * 1.5, 0.03, a - 0.33, ny, z, (i / 9) * Math.PI, 0, 0);
          ax('hullPanel', nr * 0.9, nr, 0.6, b + 0.7, ny, z, 28);
          for (const x of [a - 1.1, (a + b) / 2, b + 1.0]) this.pt('darkmetal', nr + 0.01, 0.025, x, ny, z, 0, Math.PI / 2, 0, 28);
          this.pb('darkmetal', len - 1.8, 0.1, 0.32, (a + b) / 2, ny + nr - 0.01, z);
          ax('orange', nr + 0.012, nr + 0.012, 0.42, a - 1.45, ny, z, 28);
          bell(nr * 0.92, b + 0.4, ny, z);
          this.navLight(a - 0.3, ny + nr * 0.72, z + s * nr * 0.5, s < 0 ? 0xff2010 : 0x20ff40, false);
          const m4 = new THREE.Matrix4().makeTranslation(0, ny + 0.12, 0); if (s < 0) m4.multiply(mirror);
          surface([[a - 1.2, 3.0], [a - 2.4, nz - 0.2], [b + 1.6, nz - 0.2], [b + 0.9, 3.0]], 0.24, m4);
          this.col(b - 0.6, a, s > 0 ? nz - nr - 0.05 : -nz - nr - 0.05, s > 0 ? nz + nr + 0.05 : -nz + nr + 0.05);
        }
      }
      // a tall swept fin up the tail's spine, its root following the crown, a strobe in its tip
      {
        const xr = -8.9, yr = skinTop(xr, 0) - 0.06, slope = Math.atan2(yr - (skinTop(-15.4, 0) - 0.06), xr + 15.4);
        const m4 = new THREE.Matrix4().makeTranslation(xr, yr, 0).multiply(new THREE.Matrix4().makeRotationZ(slope)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.08)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        surface([[0.2, 0], [-6.6, 0], [-7.1, 2.45], [-5.1, 2.45]], 0.16, m4);
        this.beam('darkmetal', V(0.2, -0.08, 0).applyMatrix4(m4), V(-5.1, -0.08, 2.45).applyMatrix4(m4), 0.05, 0.07);
        const tip = V(-6.3, -0.08, 2.55).applyMatrix4(m4); this.navLight(tip.x, tip.y, tip.z, 0xffffff, true);
      }
      // a sharp chine down each flank, low on the hull, from the nose back to the pylons (broken by the hatch): it
      // throws a long shadow line that keeps the hull from reading as one round lump
      {
        const y = 0.36, out = (x) => 0.04 + 0.14 * sstep(9.6, 5.0, x) * sstep(-13.8, -9.4, x) + 0.16 * sstep(-6.5, -9.2, x) * sstep(-13.8, -11.8, x);
        const strip = (x0, x1, s) => {
          const pts = [], n = Math.max(4, Math.ceil((x0 - x1) / 0.4));
          for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n); pts.push([x, skinW(x, y) + out(x)]); }
          for (let i = n; i >= 0; i--) { const x = lerp(x0, x1, i / n); pts.push([x, skinW(x, y) - 0.25]); }
          const m4 = new THREE.Matrix4().makeTranslation(0, y + 0.03, 0); if (s < 0) m4.multiply(mirror);
          surface(pts, 0.06, m4, this.cm.black);
        };
        strip(10.4, -13.0, -1); strip(10.4, DOOR.x1 + 0.1, 1); strip(DOOR.x0 - 0.1, -13.0, 1);
      }
      // pitot probes on the flanks of the nose, landing lights tucked under the chin
      for (const sd of [-1, 1]) {
        const px = 9.4, py = 0.42, pz = skinW(px, py);
        this.pc('darkmetal', 0.035, 0.035, 0.06, px, py, sd * (pz + 0.02), Math.PI / 2, 0, 0, 8);
        this.pc('steelBolt', 0.01, 0.01, 0.34, px + 0.17, py, sd * (pz + 0.05), 0, 0, Math.PI / 2, 6);
        const lp = V(10.2, skinBot(10.2, 0.5) + 0.01, sd * 0.5), ax = V(0.3, -0.95, 0).normalize();
        pcAx('darkmetal', 0.09, 0.09, 0.1, lp, ax, 12);
        pcAx('glowWarm', 0.068, 0.068, 0.012, lp.clone().addScaledVector(ax, 0.052), ax, 12);
      }
      // landing legs: each swings down and out from a bay in the belly onto a broad pad, and folds back up into it
      this.gear = []; this.gearT = 1; this.gearTarget = 1;
      for (const [x, s] of [[-6.4, -1], [-6.4, 1], [2.6, -1], [2.6, 1]]) {
        const leg = new THREE.Group(); leg.position.set(x, skinBot(x, 3.0) + 0.12, s * 3.0); this.group.add(leg);
        const part = (geo, m, a, b) => {
          const me = new THREE.Mesh(geo, m); me.castShadow = true; me.receiveShadow = true;
          if (b) { me.position.copy(a).add(b).multiplyScalar(0.5); me.quaternion.setFromUnitVectors(V(0, 0, 1), b.clone().sub(a).normalize()); } else me.position.copy(a);
          leg.add(me); return me;
        };
        const foot = V(0.3, SHIP.ground + 0.05 - leg.position.y, s * 1.0), knee = V(-0.55, 0.05, 0), mid = V(0.25, foot.y * 0.6, s * 0.62);
        part(new THREE.BoxGeometry(0.22, 0.22, foot.length()), dm, V(0, 0, 0), foot);
        part(new THREE.BoxGeometry(0.1, 0.1, knee.distanceTo(mid)), MATS.get('steelBolt'), knee, mid);
        // a hydraulic ram along the strut, and the pad on a ball joint
        part(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10).rotateX(Math.PI / 2), MATS.get('steelBolt'), V(0.05, foot.y * 0.1, s * 0.2), V(0.2, foot.y * 0.55, s * 0.6));
        part(new THREE.SphereGeometry(0.13, 10, 8), dm, foot.clone().add(V(0, 0.05, 0)));
        part(new THREE.CylinderGeometry(0.42, 0.48, 0.1, 18), dm, foot.clone().add(V(0, -0.02, s * 0.05)));
        part(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 14).rotateZ(Math.PI / 2), dm, V(0, 0, 0));
        this.gear.push({ leg, s });
      }
      this.buildThrusters();
      // roof: antenna, dish, vents, floodlight, each seated on the curve of the crown
      const tilt = (x, z) => Math.atan(-(skinTop(x, z + 0.05) - skinTop(x, z - 0.05)) / 0.1);
      { const y = skinTop(-3.0, -2.2); this.cyl(0.03, 0.03, 2.2, dm, -3.0, y + 1.1, -2.2, 0, 0, 0, 6); this.navLight(-3.0, y + 2.22, -2.2, 0xff2010, true); }
      // (the dish: a flange on the crown, a mast, a hinge at its head; the bowl turned up and out on it, and the feed
      // horn held out at its focus on three struts)
      {
        const y = skinTop(0.6, -2.05), g = new THREE.Group(); g.position.set(0.6, y, -2.05); this.group.add(g);
        const add = (geo, m, x, yy, z, par, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, yy, z); me.rotation.set(rx, ry, rz); me.castShadow = true; me.receiveShadow = true; par.add(me); return me; };
        add(new THREE.CylinderGeometry(0.16, 0.19, 0.05, 14), dm, 0, 0.0, 0, g);
        add(new THREE.CylinderGeometry(0.045, 0.055, 0.62, 8), dm, 0, 0.33, 0, g);
        const h = new THREE.Group(); h.position.set(0, 0.64, 0); h.rotation.y = 0.4; g.add(h);
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), dm, 0, 0, 0, h, 0, 0, Math.PI / 2);
        const t = new THREE.Group(); t.rotation.x = -0.8; h.add(t);
        const f = 0.32, Rd = 0.58, pts = []; for (let i = 0; i <= 10; i++) { const rr = (i / 10) * Rd; pts.push(new THREE.Vector2(rr, 0.08 + rr * rr / (4 * f))); }
        add(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: 0xd2cec2, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide }), 0, 0, 0, t);
        add(new THREE.CylinderGeometry(0.06, 0.04, 0.09, 10), dm, 0, 0.045, 0, t);
        const fy = 0.08 + f; add(new THREE.CylinderGeometry(0.035, 0.025, 0.09, 10), dm, 0, fy, 0, t);
        for (let k = 0; k < 3; k++) {
          const a = k * TAU / 3 + 0.5, rr = Rd * 0.94, rim = V(Math.cos(a) * rr, 0.08 + rr * rr / (4 * f), Math.sin(a) * rr), tip = V(0, fy - 0.04, 0);
          const o = add(new THREE.CylinderGeometry(0.008, 0.008, rim.distanceTo(tip), 5), dm, 0, 0, 0, t); o.position.copy(rim).add(tip).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(V(0, 1, 0), tip.clone().sub(rim).normalize());
        }
      }
      for (const [x, z] of [[-5.5, 1.95], [-1.0, -1.95], [1.0, 1.85]]) this.box(1.0, 0.3, 0.7, MATS.get('vent'), x, skinTop(x, z) + 0.08, z).rotation.x = tilt(x, z);
      // RCS thruster quads seated on the rounded shoulders, nozzles out along the skin's normal and fore and aft (where
      // each nozzle's mouth is and which way it fires, for the puffs in space)
      this.rcs = [];
      for (const [x, s] of [[-6.6, -1], [-6.6, 1], [3.1, -1], [3.1, 1]]) {
        const u = upperAt(x, 0.45), n = V(0, Math.cos(u.tilt), s * Math.sin(u.tilt)), p = V(x, u.y, s * u.z);
        this.pb('darkmetal', 0.55, 0.3, 0.45, x, u.y, s * u.z, s * u.tilt, 0, 0);
        pcAx('darkmetal', 0.1, 0.06, 0.18, p.clone().addScaledVector(n, 0.2), n, 10);
        this.rcs.push({ p: p.clone().addScaledVector(n, 0.3), d: n.clone() });
        for (const dx of [-1, 1]) {
          pcAx('darkmetal', 0.08, 0.05, 0.14, p.clone().addScaledVector(n, 0.05).add(V(dx * 0.32, 0, 0)), V(dx, 0, 0), 10);
          this.rcs.push({ p: p.clone().addScaledVector(n, 0.05).add(V(dx * 0.4, 0, 0)), d: V(dx, 0, 0) });
        }
      }
      // and out on the nose, a pair of retro nozzles facing forward (the braking burn) and a pair of steering ones
      // facing out to the sides, set into the skin just below the pilots' sightline
      for (const s of [-1, 1]) {
        for (const [x, z, d] of [[10.4, 1.05, V(1, 0.12, s * 0.22)], [11.5, 0.7, V(0, 0.35, s)]]) {
          const p = V(x, skinTop(x, s * z) + 0.03, s * z); d.normalize();
          pcAx('darkmetal', 0.075, 0.05, 0.12, p, d, 10);
          this.rcs.push({ p: p.clone().addScaledVector(d, 0.1), d });
        }
      }
      { const y = skinTop(2.0, 2.4);
        this.floodHead = this.box(0.7, 0.45, 0.6, dm, 2.0, y + 0.22, 2.4);
        this.floodLens = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: 0x222222 })); this.floodLens.position.set(2.0, y + 0.22, 2.71); this.group.add(this.floodLens);
        this.flood = new THREE.SpotLight(0xfff0d8, 0, 90, 0.55, 0.5, 1.2);
        this.flood.position.set(2.0, y + 0.3, 2.8); this.flood.target.position.set(2.0, 0, 30);
        this.group.add(this.flood); this.group.add(this.flood.target); }
      // the ship's cameras (their feeds are a page on the bay's main screen): a housing on a bracket, the lens, a red
      // light. They watch where the crew come and go: over the hatch looking down the ramp, on a tripod out on the
      // ground (wherever the crew have set it up), on the tail looking back, and one inside, up in a corner of the bay.
      // Away from the ground (in space, and flying) the tripod's packed away and the one on the spine over the cockpit
      // takes its place on the screen, looking out ahead past the nose
      this.hullCams = [];
      const hc = (name, p, look, inside, rig, space) => {
        const dir = look.clone().sub(p).normalize();
        // (it sees from just in front of its lens)
        this.hullCams.push({ name, pos: p.clone().addScaledVector(dir, 0.16), look, inside: !!inside, ground: !!rig, space: !!space });
        const M = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir), V(1, 1, 1));
        const at = rig ? (geo, m, x, y, z) => { const me = new THREE.Mesh(geo.applyMatrix4(M.clone().multiply(mat(x, y, z))), this.cm[m] || MATS.get(m)); me.castShadow = true; rig.add(me); }
          : (geo, m, x, y, z) => this.put(m, geo, M.clone().multiply(mat(x, y, z)));
        at(new THREE.BoxGeometry(0.15, 0.12, 0.24), 'darkmetal', 0, 0, -0.04);
        at(new THREE.BoxGeometry(0.19, 0.012, 0.3), 'darkmetal', 0, 0.068, -0.02);
        at(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 12).rotateX(Math.PI / 2), 'black', 0, 0, 0.1);
        at(new THREE.CircleGeometry(0.034, 12), 'glass', 0, 0, 0.126);
        at(new THREE.BoxGeometry(0.014, 0.014, 0.01), 'glowRed', 0.05, 0.04, 0.085);
        at(new THREE.BoxGeometry(0.05, 0.05, 0.16), 'darkmetal', 0, 0, -0.22);
      };
      hc('HATCH', V(-2.5, 2.66, skinW(-2.5, 2.66) + 0.13), V(-2.5, SHIP.ground, 8.5));
      // (the ground camera on its tripod is a thing the crew can carry and set up anywhere: G's 'shipcam' item; it comes
      // out with the ramp and is packed away for flight. Its feed's place in the list: where it is is worked out live)
      this.hullCams.push({ name: 'GROUND', ground: true, item: 'shipcam' });
      hc('NOSE', V(3.6, skinTop(3.6, 0) + 0.12, 0), V(60, -9, -4), false, null, true);
      hc('BAY', V(3.25, 3.18, 3.55), V(-4.5, 0.3, -1.8), true);
      hc('TAIL', V(HULL.x0 + 0.4, skinTop(HULL.x0 + 0.4, 0.4) + 0.1, 0.4), V(-45, SHIP.ground, 0.4));
      // name plate and hull number, laid on the skin
      const decal = (m, x, y, s) => {
        const d = 0.05, n = V(-(skinW(x + d, y) - skinW(x - d, y)) / (2 * d), -(skinW(x, y + d) - skinW(x, y - d)) / (2 * d), s).normalize();
        m.position.set(x, y, s * (skinW(x, y) + 0.012)); m.lookAt(m.position.clone().add(n)); this.group.add(m);
      };
      decal(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.42), new THREE.MeshStandardMaterial({ map: TEX.sign('MS-7  "LAST CALL"', { w: 512, h: 120, size: 50, bg: '#8a8478', fg: '#1a1a1a', border: false }), roughness: 0.7 })), 0.1, 2.45, 1);
      decal(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({ map: TEX.sign('07', { w: 256, h: 128, size: 100, bg: 'rgba(0,0,0,0)', fg: '#d8d0c0', border: false }), transparent: true, roughness: 0.7 })), -6.4, 1.9, -1);
    }
    // ---------- flight: lift jets under the belly, the main engines' exhaust, their light, the dust they raise ----------
    buildThrusters() {
      const plumeMat = (hot, cool) => new THREE.ShaderMaterial({
        uniforms: { uI: { value: 0 }, uT: { value: 0 }, uHot: { value: new THREE.Color(...hot) }, uCool: { value: new THREE.Color(...cool) } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ vUv = uv; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uI, uT; uniform vec3 uHot, uCool; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){
            float along = vUv.y;                                   // 1 at the nozzle, 0 at the tail
            float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
            float f = 0.8 + 0.2 * sin(uT * 53.0 + vUv.x * 31.4 + along * 24.0) * sin(uT * 31.0 - along * 13.0);
            float a = pow(along, 1.7) * core * f * uI;
            gl_FragColor = vec4(mix(uCool, uHot, pow(along, 3.0)) * a * 2.4, a); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      });
      this.liftMat = plumeMat([1.0, 0.82, 0.6], [1.0, 0.36, 0.08]);
      this.mainMat = plumeMat([0.85, 0.9, 1.0], [1.0, 0.42, 0.12]);
      const plumeGeo = new THREE.CylinderGeometry(0.26, 0.85, 1, 18, 1, true); plumeGeo.translate(0, -0.5, 0);
      this.plumes = [];
      const plume = (m, x, y, z, rz, len) => { const p = new THREE.Mesh(plumeGeo, m); p.position.set(x, y, z); p.rotation.z = rz; p.userData.len = len; p.frustumCulled = false; p.renderOrder = 5; this.group.add(p); this.plumes.push(p); return p; };
      // four lift jets in the belly, each in a cowled ring with a glowing throat
      this.liftJets = [];
      for (const [x, z] of [[-5.2, -2.3], [-5.2, 2.3], [1.6, -2.3], [1.6, 2.3]]) {
        const y = skinBot(x, z); this.liftJets.push([x, y - 0.4, z]);
        this.pc('darkmetal', 0.42, 0.48, 0.16, x, y - 0.08, z, 0, 0, 0, 20, true);
        this.pt('darkmetal', 0.44, 0.05, x, y - 0.16, z, Math.PI / 2, 0, 0, 20);
        for (let i = 0; i < 6; i++) this.pb('darkmetal', 0.04, 0.05, 0.62, x, y - 0.1, z, 0, (i / 6) * Math.PI, 0);
        const gl = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshBasicMaterial({ color: 0x331208 })); gl.position.set(x, y - 0.05, z); gl.rotation.x = Math.PI / 2; this.group.add(gl); this.engineGlows.push(gl);
        plume(this.liftMat, x, y - 0.08, z, 0, 3.2);
      }
      // the main engines push out of the tail
      for (const s of [-1, 1]) plume(this.mainMat, ENGINES.sx, ENGINES.side[0], s * ENGINES.side[1], -Math.PI / 2, 4.6).scale.set(0.82, 1, 0.82);
      plume(this.mainMat, ENGINES.mx, ENGINES.main[0], 0, -Math.PI / 2, 4.2).scale.set(0.7, 1, 0.7);
      // the jets light up whatever is under them
      this.thrustLight = new THREE.PointLight(0xffa25a, 0, 38, 2); this.thrustLight.position.set(-1.8, -2.4, 0); this.group.add(this.thrustLight);
      this.lift = 0; this.main = 0;
      // the dust (or spray, or ash) the jets tear up off the ground: world-space, not part of the ship
      const N = 260, pos = new Float32Array(N * 3), age = new Float32Array(N), sz = new Float32Array(N);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aAge', new THREE.BufferAttribute(age, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
      this.washMat = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color(0.5, 0.46, 0.4) }, uGlow: { value: new THREE.Color(0, 0, 0) }, uOp: { value: 0.32 } },
        vertexShader: `attribute float aAge; attribute float aSize; varying float vA; varying float vLow;
          void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aAge; vLow = aSize;
            gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * 520.0 / max(0.5, -mv.z), 0.0, 900.0); }`,
        fragmentShader: `uniform vec3 uCol, uGlow; uniform float uOp; varying float vA; varying float vLow;
          void main(){ float r = length(gl_PointCoord - 0.5); if (vA <= 0.0 || vA >= 1.0) discard;
            float a = smoothstep(0.5, 0.05, r) * sin(vA * 3.14159) * uOp;
            gl_FragColor = vec4(uCol + uGlow * (1.0 - vA), a); }`,
        transparent: true, depthWrite: false,
      });
      this.wash = new THREE.Points(g, this.washMat); this.wash.frustumCulled = false; this.wash.visible = false;
      this.washP = []; for (let i = 0; i < N; i++) this.washP.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 1, life: 1, s0: 1 });
      this.washAcc = 0;
      // smoke: what the lift jets churn up round the ship as it spools up and hovers, the trail the mains pour out when
      // they open up, the cloud the burst blows across the ground, and what curls up off the scorch it leaves behind.
      // World-space puffs, each its own shade of grey and paler on top, fresh ones still glowing from the flame; they
      // swell, roll along the ground rather than through it, drift off downwind and thin out
      {
        const SN = 900, sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SN * 3), 3));
        for (const k of ['aAge', 'aSize', 'aHot', 'aShade']) sg.setAttribute(k, new THREE.BufferAttribute(new Float32Array(SN), 1));
        this.smokeMat = new THREE.ShaderMaterial({
          uniforms: { uCol: { value: new THREE.Color(0.34, 0.33, 0.32) }, uFire: { value: new THREE.Color(1.6, 0.62, 0.18) } },
          vertexShader: `attribute float aAge, aSize, aHot, aShade; varying float vA, vD, vH, vS;
            void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aAge; vD = -mv.z; vH = aHot; vS = aShade;
              gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * 520.0 / max(0.5, -mv.z), 0.0, 1200.0); }`,
          fragmentShader: `uniform vec3 uCol, uFire; varying float vA, vD, vH, vS;
            void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q); if (vA <= 0.0 || vA >= 1.0) discard;
              float a = smoothstep(0.5, 0.12, r) * smoothstep(0.0, 0.05, vA) * pow(1.0 - vA, 1.4) * 0.62 * exp(-vD / 900.0);
              vec3 cool = uCol * vS * (1.08 - q.y * 0.35);
              gl_FragColor = vec4(mix(mix(cool, uFire, vH), cool, smoothstep(0.015, 0.1, vA)), a); }`,
          transparent: true, depthWrite: false,
        });
        this.smoke = new THREE.Points(sg, this.smokeMat); this.smoke.frustumCulled = false; this.smoke.visible = false;
        this.smokeP = []; for (let i = 0; i < SN; i++) this.smokeP.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 1, life: 1, s0: 1, grow: 4, hot: 0, shade: 1 });
        this.smokeI = 0; this.smokeAcc = 0; this.liftAcc = 0; this.scorchAcc = 0; this.smokeFrom = null;
      }
      // the scorch the burst leaves: a big black patch blown into the ground where the flame hit, ragged and streaked
      // outward, with embers smouldering in its middle for a while (pixel art, like everything else down there)
      {
        const N = 48, base = document.createElement('canvas'), emb = document.createElement('canvas'); base.width = base.height = emb.width = emb.height = N;
        const bx = base.getContext('2d'), ex = emb.getContext('2d'), bi = bx.createImageData(N, N), ei = ex.createImageData(N, N);
        let sd = 91; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
        const rays = []; for (let i = 0; i < 9; i++) rays.push([rnd() * TAU, 0.2 + rnd() * 0.3, 0.08 + rnd() * 0.12]);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const x = ((i + 0.5) / N) * 2 - 1, y = ((j + 0.5) / N) * 2 - 1, d = Math.hypot(x, y), a = Math.atan2(y, x), o = (j * N + i) * 4;
          let edge = 0.55 + 0.07 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7 + 2) + (rnd() - 0.5) * 0.06;
          for (const [ra, len, w] of rays) { const da = Math.abs(Math.atan2(Math.sin(a - ra), Math.cos(a - ra))); if (da < w) edge += len * (1 - da / w); }
          if (d >= edge) continue;
          const core = d < edge * 0.55, c = core ? 5 : 12 + Math.floor(rnd() * 12);
          bi.data[o] = c; bi.data[o + 1] = c * 0.86; bi.data[o + 2] = c * 0.72;
          bi.data[o + 3] = d > edge * 0.82 && rnd() < 0.45 ? 0 : core ? 245 : Math.round(140 + 100 * (1 - d / edge));   // (a ragged pixel edge)
          if (d < edge * 0.5 && rnd() < 0.1) { ei.data[o] = 255; ei.data[o + 1] = 80 + rnd() * 90; ei.data[o + 2] = 20; ei.data[o + 3] = 255; }
        }
        bx.putImageData(bi, 0, 0); ex.putImageData(ei, 0, 0);
        const tx = (c) => { const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; };
        const geo = new THREE.PlaneGeometry(1, 1, 16, 16).rotateX(-Math.PI / 2);
        this.scorchMat = new THREE.MeshBasicMaterial({ map: tx(base), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
        this.emberMat = new THREE.MeshBasicMaterial({ map: tx(emb), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, fog: false });
        this.scorch = new THREE.Group(); this.scorch.visible = false;
        this.scorch.add(new THREE.Mesh(geo, this.scorchMat)); const em = new THREE.Mesh(geo, this.emberMat); em.renderOrder = 1; this.scorch.add(em);
        this.scorch.children.forEach((m) => { m.frustumCulled = false; });
        this.scorchT = 0; this.scorchC = new THREE.Vector3();
      }
      // burning bits the burst flings out: charred chunks that come down round the scorch and burn on for a while, each
      // with a little pixel flame and its own thread of smoke (they go in the scene with the scorch)
      {
        const F = ['...r....', '...rr...', '..rorr..', '..roor..', '.rooor..', '.rooyor.', '.royyor.', 'rooyyoor', 'royyyyor', 'royywyor', '.ryywyr.', '..rrrr..'];
        const C = { r: '#c0300c', o: '#ff7a1a', y: '#ffd040', w: '#fff4c0' }, c = document.createElement('canvas'); c.width = 8; c.height = 12;
        const x = c.getContext('2d'); F.forEach((row, j) => [...row].forEach((ch, i) => { if (C[ch]) { x.fillStyle = C[ch]; x.fillRect(i, j, 1, 1); } }));
        const ft = new THREE.CanvasTexture(c); ft.magFilter = ft.minFilter = THREE.NearestFilter; ft.generateMipmaps = false; ft.colorSpace = THREE.SRGBColorSpace;
        const char = new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 1, emissive: 0x3a0e02, emissiveIntensity: 0.6 }), box = new THREE.BoxGeometry(1, 0.6, 0.8);
        this.bits = [];
        for (let i = 0; i < 14; i++) {
          const g = new THREE.Group(), ch = new THREE.Mesh(box, char), fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
          ch.castShadow = true; fl.center.set(0.5, 0.05); g.add(ch); g.add(fl); g.visible = false; this.scorch.add(g);
          this.bits.push({ g, ch, fl, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 1, life: 0, size: 0.5, landed: true, acc: 0 });
        }
      }
      // the fire's light: the flame out of the mains while they burn close by, the scorch glowing as it smoulders, and
      // the two biggest burning bits (sources for the renderer's lamp pool, seen from further off than lamps)
      const fire = (color, range) => ({ x: 0, y: 0, z: 0, color, power: 0, state: 'fire', zone: 'out', range, lit: 1, phase: Math.random() * 9, far: 110 });
      this.fireLights = [fire(0xffa04a, 34), fire(0xff6a20, 18), fire(0xff7a2a, 10), fire(0xff7a2a, 10)];
    }
    // ---------- the Company's delivery drone (in orbit it brings purchases in through the airlock) ----------
    buildRobot() {
      const g = new THREE.Group(); g.visible = false; this.group.add(g);
      const body = MATS.rep('painted', 1, 1, 0xc9a227), dark = MATS.get('darkmetal'), blk = this.cm.black;
      const mk = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, p = g) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; me.receiveShadow = true; p.add(me); return me; };
      // chassis: a squat rounded box with a black bumper band, a sensor head at the front (-z)
      const s = new THREE.Shape(); s.moveTo(-0.27, -0.24); s.lineTo(0.27, -0.24); s.quadraticCurveTo(0.31, -0.24, 0.31, -0.2); s.lineTo(0.31, 0.2); s.quadraticCurveTo(0.31, 0.24, 0.27, 0.24); s.lineTo(-0.27, 0.24); s.quadraticCurveTo(-0.31, 0.24, -0.31, 0.2); s.lineTo(-0.31, -0.2); s.quadraticCurveTo(-0.31, -0.24, -0.27, -0.24);
      const cg = new THREE.ExtrudeGeometry(s, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3 }); cg.rotateX(-Math.PI / 2); cg.translate(0, -0.12, 0);
      mk(cg, body, 0, 0, 0);
      mk(new THREE.BoxGeometry(0.66, 0.06, 0.54), blk, 0, -0.06, 0);
      mk(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 16), dark, 0, 0.08, -0.28, Math.PI / 2);
      mk(new THREE.CircleGeometry(0.06, 16), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.8 }), 0, 0.08, -0.341, 0, Math.PI);
      mk(new THREE.SphereGeometry(0.015, 8, 6), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 0.6 }), 0.045, 0.12, -0.338);
      mk(new THREE.PlaneGeometry(0.3, 0.08), new THREE.MeshStandardMaterial({ map: TEX.sign('MERCY  D-4', { w: 256, h: 64, size: 34, bg: '#1b1b18', fg: '#e0b040', border: false }), roughness: 0.7 }), 0, 0.05, 0.271);
      // four cold-gas thrusters on outriggers; their puffs and glow are what you see moving it
      this.robotJets = [];
      for (const [x, z] of [[-0.38, -0.28], [0.38, -0.28], [-0.38, 0.28], [0.38, 0.28]]) {
        mk(new THREE.BoxGeometry(0.12, 0.04, 0.04), dark, x * 0.75, 0, z, 0, Math.atan2(z, x), 0);
        mk(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 12), dark, x, 0, z);
        mk(twoSided(new THREE.CylinderGeometry(0.03, 0.045, 0.05, 10, 1, true)), blk, x, -0.07, z);
        const jet = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: 0x9fd8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
        jet.position.set(x, -0.14, z); jet.scale.set(0.22, 0.32, 1); g.add(jet); this.robotJets.push(jet);
      }
      // two clamp arms reaching under the cargo cradle
      for (const sx of [-1, 1]) {
        mk(new THREE.BoxGeometry(0.04, 0.2, 0.04), dark, sx * 0.2, -0.2, 0);
        mk(new THREE.BoxGeometry(0.04, 0.04, 0.16), dark, sx * 0.2, -0.3, 0);
        mk(new THREE.BoxGeometry(0.05, 0.08, 0.03), blk, sx * 0.2, -0.33, -0.08); mk(new THREE.BoxGeometry(0.05, 0.08, 0.03), blk, sx * 0.2, -0.33, 0.08);
      }
      this.robotCargo = new THREE.Group(); this.robotCargo.position.y = -0.36; g.add(this.robotCargo);
      // a strobe on top, so it shows as a blinking light long before it's anything more
      this.robotBeacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: 0xffc060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.robotBeacon.position.set(0, 0.22, 0); g.add(this.robotBeacon);
      this.robot = g;
    }
    // the order slung under the drone, laid out just as it will be set down (items: [{type, x, z}] in ship coords)
    setRobotCargo(items) {
      while (this.robotCargo.children.length) this.robotCargo.remove(this.robotCargo.children[0]);
      const cx = (SHIP.doorX0 + SHIP.doorX1) / 2, cz = AIRLOCK.z0 + 0.8;
      for (const it of items) { const m = ItemMeshes.build(it.type); m.position.set(it.x - cx, -0.02, it.z - cz); this.robotCargo.add(m); }
    }
    // the drone at time t of a delivery (ship coordinates): approach, in through the hatch, set down, back out, away
    poseRobot(t) {
      const g = this.robot, D = DELIVERY, cx = (SHIP.doorX0 + SHIP.doorX1) / 2;
      if (!g) return;
      if (t < D.appear || t > D.gone) { g.visible = false; return; }
      g.visible = true;
      let x = cx, y = 1.1, z = 4.9, yaw = 0, jet = 0.3;
      const ease = (a) => 1 - Math.pow(1 - clamp(a, 0, 1), 3);
      // (from far off on the starboard side, drifting in and slowing as it nears the hatch)
      if (t < D.arrive) { const a = clamp((t - D.appear) / (D.arrive - D.appear), 0, 1), u = 1 - Math.pow(1 - a, 2.2); z = lerp(320, 4.9, u); x = cx + 70 * (1 - u) * (1 - u); y = lerp(30, 1.1, u); jet = 0.4 + (1 - u) * 0.4; }
      else if (t < D.inside) { const u = sstep(D.arrive, D.inside, t); z = lerp(4.9, AIRLOCK.z0 + 0.8, u); y = lerp(1.1, 1.0, u); jet = 0.35; }
      else if (t < D.drop) { const u = sstep(D.inside, D.drop, t); z = AIRLOCK.z0 + 0.8; y = lerp(1.0, 0.72, u); jet = 0.25; }
      else if (t < D.leave) { const u = sstep(D.drop, D.leave, t); z = AIRLOCK.z0 + 0.8; y = lerp(0.72, 1.1, u); jet = 0.35; }
      else if (t < D.out) { const u = sstep(D.leave, D.out, t); z = lerp(AIRLOCK.z0 + 0.8, 5.4, u); jet = 0.5; }
      else { const u = (t - D.out) / (D.gone - D.out), a = u * u; z = 5.4 + 48 * a; x = cx - 9 * a; y = 1.1 + 5 * a; yaw = Math.PI * sstep(0, 0.35, u); jet = 0.9; }
      // hovering: a little bob and sway, tilting into its motion
      const k = performance.now() / 1000;
      g.position.set(x + Math.sin(k * 1.7) * 0.012, y + Math.sin(k * 2.3) * 0.015, z);
      g.rotation.set(Math.sin(k * 1.3) * 0.03, yaw, Math.sin(k * 1.9) * 0.03);
      for (const j of this.robotJets) j.material.opacity = jet * (0.55 + Math.random() * 0.45);
      // the strobe stays a point of light however far off it is
      { const b = this.robotBeacon, d = g.position.length(); b.material.opacity = (k * 1.4) % 1 < 0.14 ? 1 : 0.18; b.scale.setScalar(Math.max(0.35, d * 0.03)); }
      this.robotCargo.visible = t < D.drop;
    }
    // lift: belly jets 0..1, main: tail engines 0..1
    setThrust(lift, main) {
      this.lift = lift; this.main = main;
      for (const p of this.plumes) {
        const isLift = p.material === this.liftMat, k = isLift ? lift : main;
        p.visible = k > 0.02;
        p.scale.y = p.userData.len * (0.35 + k * 0.85);
      }
      this.liftMat.uniforms.uI.value = lift * 1.15; this.mainMat.uniforms.uI.value = main * 1.1;
      this.setEngines(Math.max(lift, main, 0.1));
    }
    // dust thrown up from the ground below the ship: strength 0..1 at ground point (cx, gy, cz)
    updateWash(dt, strength, cx, gy, cz, groundAt, color, glow) {
      const P = this.washP, pos = this.wash.geometry.attributes.position, age = this.wash.geometry.attributes.aAge, sz = this.wash.geometry.attributes.aSize, vac = this.washVac;
      this.washAcc += dt * strength * 150;
      let live = 0;
      // dust is never inside the hull: low over the ground, the puffs kicked up under the belly would otherwise sit in
      // the cabin and show through its floor (they are hidden while they're within the hull's walls)
      const inv = _washInv.copy(this.group.matrixWorld).invert(), lp = _washP;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.t >= 1 && this.washAcc >= 1) {
          this.washAcc -= 1;
          const a = Math.random() * TAU, r = 1 + Math.random() * 5, sp = (7 + Math.random() * 11) * (0.5 + strength * 0.7);
          p.x = cx + Math.cos(a) * r; p.z = cz + Math.sin(a) * r; p.y = gy + 0.3 + Math.random() * 0.5;
          p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 0.4 + Math.random() * (vac ? 2.6 : 1.6); p.t = 0; p.life = 1.4 + Math.random() * 1.8; p.s0 = 0.8 + Math.random() * 1.2;
        }
        if (p.t < 1) {
          p.t += dt / p.life;
          // with no air (vac) it isn't a cloud: each grain flies out on its own arc and falls back, and nothing billows
          if (vac) p.vy -= dt * 1.6;
          else { const drag = Math.exp(-dt * 1.6); p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag + dt * 0.4; }
          p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
          const gh = groundAt(p.x, p.z) + 0.25; if (p.y < gh) { p.y = gh; if (vac && p.vy < 0) p.t = 1; }
          live++;
        }
        lp.set(p.x, p.y, p.z).applyMatrix4(inv);
        const inHull = this.onFootprint(lp.x, lp.z) && lp.y > -1.6 && lp.y < 5.6;
        pos.setXYZ(i, p.x, p.y, p.z); age.setX(i, inHull ? 0 : Math.min(p.t, 1)); sz.setX(i, Math.min(4.2, p.s0 * (1 + p.t * (vac ? 0.5 : 3.2))));
      }
      if (this.washAcc > 4) this.washAcc = 4;
      pos.needsUpdate = true; age.needsUpdate = true; sz.needsUpdate = true;
      this.wash.visible = live > 0;
      this.washMat.uniforms.uCol.value.copy(color); this.washMat.uniforms.uGlow.value.copy(glow);
    }
    // one puff of smoke (into the oldest slot)
    puff(x, y, z, vx, vy, vz, life, s0, grow, hot) {
      const p = this.smokeP[this.smokeI]; this.smokeI = (this.smokeI + 1) % this.smokeP.length;
      p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.t = 0; p.life = life; p.s0 = s0; p.grow = grow; p.hot = hot; p.shade = 0.72 + Math.random() * 0.45;
    }
    // the ship's smoke, every frame it flies (P: its flight pose): the lift jets churn it up off the ground under the
    // belly while it's low; the mains idle out a thin wisp, and once they open up, a thick trail strung along the path
    // the tail swept this frame (so a fast ship leaves it unbroken); and the scorch it left smoulders
    updateSmoke(dt, P, color, groundAt) {
      const M = this.group.matrixWorld, R = Math.random, sx = this.group.position.x, sz = this.group.position.z, gy = groundAt(sx, sz);
      const nz = _smN.set(ENGINES.mx - 0.6, ENGINES.main[0], 0).applyMatrix4(M), back = _smB.set(-1, 0, 0).transformDirection(M), from = this.smokeFrom || nz;
      this.smokeAcc = Math.min(this.smokeAcc + dt * (130 * P.burst + 8 * clamp(P.main - 0.25, 0, 1)), 40);
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        const u = R(), sp = 10 + R() * 12, big = P.burst > 0.5;
        this.puff(lerp(from.x, nz.x, u) + (R() - 0.5) * 0.8, lerp(from.y, nz.y, u) + (R() - 0.5) * 0.8, lerp(from.z, nz.z, u) + (R() - 0.5) * 0.8,
          back.x * sp + (R() - 0.5) * 3, back.y * sp + (R() - 0.5) * 3, back.z * sp + (R() - 0.5) * 3, big ? 4.5 + R() * 3.5 : 2 + R(), big ? 1.8 + R() * 1.8 : 0.6 + R() * 0.5, big ? 5 : 3, big ? 1 : 0.4);
      }
      this.smokeFrom = (this.smokeFrom || new THREE.Vector3()).copy(nz);
      // (blown down out of the belly, it hits the ground and rolls out from under the ship)
      const low = 1 - sstep(5, 24, this.group.position.y - gy);
      this.liftAcc = Math.min(this.liftAcc + dt * 36 * P.lift * low, 20);
      while (this.liftAcc >= 1) {
        this.liftAcc -= 1;
        const j = this.liftJets[(R() * 4) | 0], at = _smJ.set(j[0], j[1], j[2]).applyMatrix4(M), dn = _smD.set(0, -1, 0).transformDirection(M), sp = 7 + R() * 7;
        this.puff(at.x, at.y, at.z, dn.x * sp + (R() - 0.5) * 3, dn.y * sp, dn.z * sp + (R() - 0.5) * 3, 3 + R() * 3, 1.2 + R() * 1.2, 4, 0.2 * R());
      }
      // the scorch: a few wisps curling up off it while it's still hot
      if (this.scorchT > 0.2) {
        this.scorchAcc += dt * 9 * this.scorchT;
        while (this.scorchAcc >= 1) {
          this.scorchAcc -= 1;
          const a = R() * TAU, r = Math.sqrt(R()) * 5, x = this.scorchC.x + Math.cos(a) * r, z = this.scorchC.z + Math.sin(a) * r;
          this.puff(x, groundAt(x, z) + 0.4, z, (R() - 0.5) * 0.6, 1 + R() * 1.4, (R() - 0.5) * 0.6, 4 + R() * 3, 0.7 + R() * 0.6, 4, 0.15 * R());
        }
      }
      this.stepSmoke(dt, color, groundAt, gy);
    }
    // move and draw the puffs: they slow to the wind (and a gentle rise), roll along the ground instead of through it,
    // and are hidden while inside the hull (like the dust)
    stepSmoke(dt, color, groundAt, gy) {
      const P = this.smokeP, A = this.smoke.geometry.attributes, inv = _washInv.copy(this.group.matrixWorld).invert(), lp = _washP;
      const sx = this.group.position.x, sz = this.group.position.z, drag = Math.exp(-dt * 1.3), k = 1 - drag, vac = this.washVac;
      let live = 0;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.t < 1) {
          // (with no air there's no cloud to hang about: the exhaust flies out, falls back and is gone in moments)
          p.t += dt / p.life * (vac ? 3 : 1);
          if (vac) p.vy -= dt * 1.6;
          else { p.vx = p.vx * drag + 1.6 * k; p.vy = p.vy * drag + 0.7 * k; p.vz = p.vz * drag + 0.7 * k; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < gy + 30) {
            const size = p.s0 * (1 + p.t * p.grow), gh = groundAt(p.x, p.z) + size * 0.22;
            if (p.y < gh) {
              p.y = gh;
              if (p.vy < 0) { let dx = p.x - sx, dz = p.z - sz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; const s = -p.vy * 0.8; p.vx += dx * s; p.vz += dz * s; p.vy = 0.3; }
            }
          }
          live++;
        }
        lp.set(p.x, p.y, p.z).applyMatrix4(inv);
        const inHull = this.onFootprint(lp.x, lp.z) && lp.y > -1.6 && lp.y < 5.6;
        A.position.setXYZ(i, p.x, p.y, p.z); A.aAge.setX(i, inHull ? 0 : Math.min(p.t, 1)); A.aSize.setX(i, p.s0 * (1 + Math.min(p.t, 1) * p.grow)); A.aHot.setX(i, p.hot); A.aShade.setX(i, p.shade);
      }
      for (const k2 of ['position', 'aAge', 'aSize', 'aHot', 'aShade']) A[k2].needsUpdate = true;
      this.smoke.visible = live > 0;
      this.smokeMat.uniforms.uCol.value.copy(color);
      // the embers in the scorch dim and flicker out over half a minute
      if (this.scorchT > 0) { this.scorchT = Math.max(0, this.scorchT - dt / 30); this.emberMat.opacity = Math.pow(this.scorchT, 1.3) * (0.75 + Math.random() * 0.25); }
      this.stepFire(dt, groundAt);
    }
    // the burning bits (thrown, tumbling, landing, burning down), and where the fire's light is
    stepFire(dt, groundAt) {
      const R = Math.random, [flame, glow, b0, b1] = this.fireLights;
      // (the flame out of the mains, a few metres down the exhaust, as bright as they're burning)
      const at = _smJ.set(ENGINES.mx - 4, ENGINES.main[0], 0).applyMatrix4(this.group.matrixWorld);
      flame.x = at.x; flame.y = at.y; flame.z = at.z; flame.power = clamp((this.main - 0.5) * 6, 0, 8);
      glow.x = this.scorchC.x; glow.y = this.scorchC.y + 1.5; glow.z = this.scorchC.z; glow.power = 3.2 * this.scorchT * this.scorchT;
      let big = [null, null];
      for (const b of this.bits) {
        if (b.t >= b.life) { b.g.visible = false; continue; }
        b.t += dt;
        if (!b.landed) {
          b.vy -= 18 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
          b.ch.rotation.x += dt * b.vx * 0.6; b.ch.rotation.z += dt * b.vz * 0.6;
          const gh = groundAt(b.x, b.z) + b.size * 0.25;
          if (b.y <= gh) { b.y = gh; if (b.vy < -5) { b.vy *= -0.25; b.vx *= 0.45; b.vz *= 0.45; } else b.landed = true; }
        }
        // burning down: a flame that dances, shrinks and goes out, and a thread of smoke while it lasts
        const k = 1 - sstep(b.life * 0.55, b.life, b.t);
        b.g.position.set(b.x, b.y, b.z); b.g.visible = true;
        b.fl.material.opacity = k * (0.7 + 0.3 * R());
        b.fl.scale.set(b.size * (1.0 + 0.25 * R()) * k + 0.01, b.size * (1.5 + 0.6 * R()) * k + 0.01, 1);
        b.acc += dt * 2.2 * k;
        while (b.acc >= 1) { b.acc -= 1; this.puff(b.x, b.y + b.size, b.z, (R() - 0.5) * 0.4, 1.2 + R(), (R() - 0.5) * 0.4, 3 + R() * 2, 0.4 + b.size * 0.6, 4, 0.3); }
        const lit = k * b.size;
        if (!big[0] || lit > big[0].lit) { big[1] = big[0]; big[0] = { b, lit }; } else if (!big[1] || lit > big[1].lit) big[1] = { b, lit };
      }
      [b0, b1].forEach((L, i) => { const e = big[i]; L.power = e ? 2.4 * e.lit : 0; if (e) { L.x = e.b.x; L.y = e.b.y + 0.8; L.z = e.b.z; } });
    }
    // the burst, where the flame hits the ground: a cloud of smoke blown out across it, a ring of dust racing out
    // ahead of that, and the scorch burned into it
    burstAt(x, y, z, groundAt) {
      const R = Math.random;
      for (let i = 0; i < 90; i++) {
        const a = R() * TAU, sp = 5 + R() * 14, r = R() * 3;
        this.puff(x + Math.cos(a) * r, y + 0.5 + R() * 2, z + Math.sin(a) * r, Math.cos(a) * sp, 0.5 + R() * 4, Math.sin(a) * sp, 5 + R() * 5, 2.2 + R() * 2.2, 3, 0.7 * R());
      }
      let n = 0;
      for (const p of this.washP) {
        if (p.t < 1 || n++ > 150) continue;
        const a = R() * TAU, sp = 14 + R() * 16;
        p.x = x + Math.cos(a) * 2; p.z = z + Math.sin(a) * 2; p.y = y + 0.3; p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 0.5 + R() * 2; p.t = 0; p.life = 1.5 + R() * 1.6; p.s0 = 1 + R() * 1.4;
      }
      this.wash.visible = true;
      // (the patch itself, laid over the ground's own lumps, turned however it happens to land)
      const geo = this.scorch.children[0].geometry, pos = geo.attributes.position, uv = geo.attributes.uv, S = 17, a = (x * 12.9898 + z * 78.233) % TAU, ca = Math.cos(a), sa = Math.sin(a);
      for (let i = 0; i < pos.count; i++) {
        const lx = uv.getX(i) - 0.5, lz = 0.5 - uv.getY(i), wx = x + (lx * ca - lz * sa) * S, wz = z + (lx * sa + lz * ca) * S;
        pos.setXYZ(i, wx, groundAt(wx, wz) + 0.06, wz);
      }
      pos.needsUpdate = true; geo.computeBoundingSphere();
      this.scorch.visible = true; this.scorchT = 1; this.scorchC.set(x, y, z); this.scorchAcc = 0;
      // and burning bits of whatever was there, flung out every way to come down round it
      for (const b of this.bits) {
        const a = R() * TAU, sp = 5 + R() * 11;
        Object.assign(b, { x: x + Math.cos(a) * 1.5, y: y + 1, z: z + Math.sin(a) * 1.5, vx: Math.cos(a) * sp, vy: 5 + R() * 6, vz: Math.sin(a) * sp, t: 0, life: 14 + R() * 16, size: 0.3 + R() * R() * 0.6, landed: false, acc: 0 });
        b.ch.scale.setScalar(b.size); b.ch.rotation.set(R() * 3, R() * 3, R() * 3);
      }
    }
    clearSmoke() {
      for (const p of this.smokeP) p.t = 1;
      this.smoke.visible = false; this.smokeFrom = null; this.smokeAcc = this.liftAcc = this.scorchAcc = 0;
      this.scorch.visible = false; this.scorchT = 0;
      for (const b of this.bits) { b.t = b.life = 0; b.g.visible = false; }
      for (const L of this.fireLights) L.power = 0;
    }
    // on the ground with gear down and the ramp out, or stowed for flight (no animation)
    setLanded(on) { this.gearT = this.gearTarget = on ? 1 : 0; this.rampT = this.rampTarget = on ? 1 : 0; this.poseGear(); }
    // the ground camera's tripod is out only while the ship is down with its ramp out
    get groundCamUp() { return this.rampT > 0.95 && !this.airborne; }
    poseGear() {
      // the legs swing out and down from their bays in the belly
      for (const g of this.gear) g.leg.rotation.x = g.s * 2.85 * (1 - sstep(0, 1, this.gearT));
      // the ramp runs out flat through its slot under the sill, then tips down onto the ground
      const r = this.rampT, rp = this.ramp;
      rp.position.set((SHIP.doorX0 + SHIP.doorX1) / 2, RAMP.y0, lerp(RAMP.z0 - RAMP.len - 0.3, RAMP.z0, sstep(0, 0.6, r)));
      rp.rotation.x = RAMP.ang * sstep(0.6, 1, r);
    }
    navLight(x, y, z, color, blink) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color })); m.position.set(x, y, z); this.group.add(m);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
      sp.scale.set(0.9, 0.9, 1); sp.position.copy(m.position); this.group.add(sp);
      this.blinkers.push({ m, sp, color: new THREE.Color(color), blink, phase: Math.random() * 3 });
    }
    // ---------- orbit backdrop ----------
    buildSpace() {
      const sp = this.space;
      // mostly faint white stars, a few bright ones, barely tinted; drawn as soft round points so they never read as specks on the glass
      const n = 2400, p = new Float32Array(n * 3), cols = new Float32Array(n * 3), sz = new Float32Array(n), r = new RNG(4242);
      for (let i = 0; i < n; i++) {
        const v = V(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize().multiplyScalar(30000);
        p.set([v.x, v.y, v.z], i * 3);
        const t = r.next(), m = Math.pow(r.next(), 4), b = 0.14 + m * 1.3;
        cols.set(t < 0.12 ? [b, b * 0.92, b * 0.82] : t < 0.24 ? [b * 0.88, b * 0.93, b] : [b, b, b], i * 3);
        sz[i] = 1.4 + m * 1.8;
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3)); sg.setAttribute('aCol', new THREE.BufferAttribute(cols, 3)); sg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
      // stars are a backdrop: drawn first (opaque queue, additive) and never in front of the planet or its rings
      this.stars = new THREE.Points(sg, new THREE.ShaderMaterial({
        uniforms: { uFade: { value: 1 } },
        vertexShader: 'attribute vec3 aCol; attribute float aSize; varying vec3 vC; void main(){ vC = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999; gl_PointSize = aSize; }',
        fragmentShader: 'uniform float uFade; varying vec3 vC; void main(){ float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vC * a * uFade, 1.0); }',
        depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      this.stars.renderOrder = -100; this.stars.frustumCulled = false;
      sp.add(this.stars);
      // hyperspace: starlight drawn out into streaks rushing past along the ship's axis (+x is the nose)
      {
        const n = 900, pos = new Float32Array(n * 6), end = new Float32Array(n * 2), seed = new Float32Array(n * 2), rr = new RNG(77);
        for (let i = 0; i < n; i++) {
          const a = rr.range(0, TAU), rad = 18 + Math.pow(rr.next(), 0.8) * 320, x = rr.range(-3000, 3000), y = Math.cos(a) * rad, z = Math.sin(a) * rad, s = rr.next();
          pos.set([x, y, z, x, y, z], i * 6); end.set([0, 1], i * 2); seed.set([s, s], i * 2);
        }
        const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); wg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1)); wg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
        this.warp = new THREE.LineSegments(wg, new THREE.ShaderMaterial({
          uniforms: { uT: { value: 0 }, uK: { value: 0 }, uLen: { value: 0 } },
          vertexShader: `uniform float uT, uK, uLen; attribute float aEnd; attribute float aSeed; varying float vA; varying float vE; varying float vS;
            void main(){ vec3 p = position; float L = 6000.0; vS = aSeed;
              p.x = mod(p.x - uT * (2200.0 + aSeed * 1800.0) + L * 0.5, L) - L * 0.5;
              p.x -= aEnd * uLen * (0.6 + aSeed * 0.8);
              vE = aEnd; vA = uK * smoothstep(3000.0, 900.0, abs(p.x)) * (0.35 + aSeed * 0.65);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); gl_Position.z = gl_Position.w * 0.9998; }`,
          // (each streak's tail takes on the faintest tint of the spectrum)
          fragmentShader: `varying float vA; varying float vE; varying float vS;
            void main(){ vec3 rb = 0.5 + 0.5 * cos(6.2832 * (vS * 1.7 + vE * 0.35 + vec3(0.0, 0.33, 0.67)));
              vec3 c = mix(vec3(1.4, 1.5, 1.8), mix(vec3(0.35, 0.55, 1.4), rb * 1.3, 0.18), vE); gl_FragColor = vec4(c * vA * (1.0 - vE * 0.85), 1.0); }`,
          depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        this.warp.frustumCulled = false; this.warp.visible = false; this.warp.renderOrder = -90; sp.add(this.warp);
      }
      // the tear: going this fast, space itself splits ahead of the nose. A hairline crack first, then a ragged rip
      // that gapes open (white-hot, rainbow-fringed edges, light pouring through from the other side), rushes in and
      // swallows the ship; on the way out it zips shut around it. uK: 0 shut, a crack, 1 wide open
      this.portal = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uK: { value: 0 } },
        vertexShader: 'varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uT, uK; varying vec2 vU;
          float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
          float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
          void main(){
            // tilted, ragged, widest in the middle and tapering to points
            vec2 p = vec2(0.93 * vU.x - 0.37 * vU.y, 0.37 * vU.x + 0.93 * vU.y);
            float y = p.y / 0.92, ends = 1.0 - smoothstep(0.78, 1.0, abs(y));
            float spine = 0.08 * sin(y * 3.3 + 1.7) + (n1(y * 9.0 + 3.0) - 0.5) * 0.15 + (n1(y * 31.0 + uT * 0.8) - 0.5) * 0.045;
            float d = abs(p.x - spine);
            float w = clamp(uK, 0.0, 1.4) * 0.3 * pow(max(0.0, 1.0 - y * y), 0.85) * (0.65 + 0.7 * n1(y * 5.0 + 11.0));
            float inside = (1.0 - smoothstep(w - 0.012, w + 0.004, d)) * ends;
            // through it: light streaming out of a point beyond
            float a = atan(p.y, p.x - spine) * 3.0;
            float rays = n1(a * 7.0 + uT * 2.5) * n1(a * 19.0 - uT * 4.0);
            vec3 deep = mix(vec3(0.5, 0.72, 1.45), vec3(1.7, 1.7, 1.8), smoothstep(0.15, 0.6, rays));
            // the torn edge, white-hot, with a prismatic fringe and a glow bleeding out into space
            float e = d - w;
            float rim = exp(-abs(e) * 80.0) * smoothstep(0.0, 0.05, w);
            vec3 prism = 0.5 + 0.5 * cos(6.2832 * (e * 7.0 + y * 0.7 - uT * 0.45 + vec3(0.0, 0.33, 0.67)));
            float glow = exp(-max(e, 0.0) * 8.0) * 0.4;
            // the crack it starts from, flickering, running ahead of the opening
            float crack = exp(-d * 300.0) * (0.6 + 0.4 * n1(y * 40.0 + uT * 20.0)) * (1.0 - smoothstep(0.0, 0.08, w));
            vec3 c = deep * inside * 1.15 + (vec3(1.6, 1.6, 1.7) * rim + prism * glow * 1.3 + vec3(1.3, 1.4, 1.8) * crack * 2.0) * ends;
            // (what's through it hides what's behind it, the planet and its clouds; its edges and glow only add light)
            float k = smoothstep(0.0, 0.12, uK);
            gl_FragColor = vec4(c * k, inside * k);
          }`,
        depthTest: false, depthWrite: false, transparent: true,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      }));
      this.portal.rotation.y = -Math.PI / 2; this.portal.visible = false; this.portal.frustumCulled = false; this.portal.renderOrder = 20; sp.add(this.portal);
      // ...and inside it, a tunnel: streaks of light rushing back past the ship along with the starlight
      this.tunnel = new THREE.Mesh(new THREE.CylinderGeometry(160, 160, 6000, 40, 1, true), new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uK: { value: 0 } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9997; }',
        // (long streaks of light running the length of it, blue-white with only a hint of colour, flowing back past)
        fragmentShader: `uniform float uT, uK; varying vec3 vP;
          float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
          float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
          void main(){
            float x = vP.y, a = atan(vP.z, vP.x);
            float streak = pow(n1(a * 9.0 + 3.0), 6.0) * (0.6 + 0.4 * n1(x * 0.002 + uT * 9.0 + a * 4.0)) + pow(n1(a * 23.0 + 7.0), 10.0) * 0.6;
            vec3 rb = mix(0.5 + 0.5 * cos(6.2832 * (a * 0.16 + uT * 0.2 + vec3(0.0, 0.33, 0.67))), vec3(0.6, 0.75, 1.05), 0.85);
            float fade = smoothstep(3000.0, 600.0, abs(x));
            gl_FragColor = vec4(rb * streak * 0.8 * fade * uK, 1.0);
          }`,
        side: THREE.BackSide, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      this.tunnel.rotation.z = -Math.PI / 2; this.tunnel.visible = false; this.tunnel.frustumCulled = false; this.tunnel.renderOrder = -95; sp.add(this.tunnel);
      // coming down out of orbit (see orbit); 0..1: how far we've come in after a jump (arrival)
      this.glide = null; this.arrive = 1; this.inWarp = false;
      // the current height above the surface
      this.alt = 1e4;
      // the planet system: pgroup is placed along our elliptical orbit each frame, tilt carries the axial tilt
      this.R = 900;
      this.pgroup = new THREE.Group(); sp.add(this.pgroup);
      this.tilt = new THREE.Group(); this.pgroup.add(this.tilt);
      this.planetMat = new THREE.MeshStandardMaterial({ map: TEX.get('planet'), roughness: 0.95, metalness: 0, fog: false });
      this.planet = new THREE.Mesh(new THREE.SphereGeometry(this.R, 96, 64), this.planetMat); this.tilt.add(this.planet);
      // Rings (Nadir's, the Hollow's), round this world or round the world in the sky over its moon or rock: drawn on a
      // dome round the eye, each point of it following its line of sight out to the sheet (see Rings), so they're right
      // however near or far they reach, out past the end of the view or in round the ship. They sit at their true depth,
      // so the world and anything else out there hides them where it's in front; their shadows fall on everything.
      this.ringU = Rings.uniforms(); this.ringSunU = { value: V(1, 0, 0) };
      this.ringSky = new THREE.Mesh(new THREE.SphereGeometry(200, 48, 24), new THREE.ShaderMaterial({
        uniforms: Object.assign({ uSun: this.ringSunU }, this.ringU),
        vertexShader: 'varying vec3 vD; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vD = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; }',
        fragmentShader: Rings.GLSL + `uniform vec3 uSun; uniform mat4 projectionMatrix; varying vec3 vD;
          void main(){ float t; vec3 d = normalize(vD); vec4 c = ringSee(cameraPosition, d, uSun, t); if (c.a < 0.003) discard;
            // (the far side, seen past the world's edge, lies behind its air: it sinks into the glow at the limb rather
            // than cutting across it; the thicker the air the line of sight grazes through, the less of it shows)
            vec3 oc = cameraPosition - uRingC; float tca = -dot(oc, d), h = sqrt(max(dot(oc, oc) - tca * tca, 0.0)) - uRingR.z;
            if (t > tca) c.a *= exp(-2.4 * exp(-max(h, 0.0) / (uRingR.z * 0.013)));
            if (c.a < 0.003) discard;
            vec4 cp = projectionMatrix * viewMatrix * vec4(cameraPosition + d * t, 1.0); gl_FragDepthEXT = clamp(cp.z / cp.w * 0.5 + 0.5, 0.0, 0.9999999);
            gl_FragColor = c; }`,
        extensions: { fragDepth: true }, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      }));
      this.ringSky.renderOrder = 4; this.ringSky.frustumCulled = false; this.ringSky.visible = false; sp.add(this.ringSky);
      this.planetDetail();
      // the air: light scattered along each line of sight through a thin shell whose density falls off with height.
      // Edge-on it piles up into a bright, soft limb that thins away into space; over the face of the world it's a
      // faint haze, heavier toward the edges; the day side glows, the night side doesn't, and along the line between
      // them the light comes through long and low and turns orange. Looking toward the sun, it brightens.
      this.atmo = new THREE.Mesh(new THREE.SphereGeometry(this.R * 1.06, 96, 64), new THREE.ShaderMaterial({
        uniforms: { sunDir: { value: V(1, 0.3, 0).normalize() }, tint: { value: new THREE.Color(0x88aaff) }, uC: { value: V() }, uR: { value: this.R } },
        transparent: true, depthWrite: false, side: THREE.FrontSide, fog: false, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform vec3 sunDir, tint, uC; uniform float uR; varying vec3 vW;
          void main(){
            vec3 rd = normalize(vW - cameraPosition), oc = cameraPosition - uC;
            float Ra = uR * 1.06, H = uR * 0.013;
            float tca = -dot(oc, rd), b2 = dot(oc, oc) - tca * tca, hA = sqrt(max(Ra * Ra - b2, 0.0));
            float t0 = max(tca - hA, 0.0), t1 = tca + hA;
            if (b2 < uR * uR && tca > 0.0) t1 = tca - sqrt(uR * uR - b2);
            float ds = max(t1 - t0, 0.0) / 12.0, od = 0.0; vec3 acc = vec3(0.0);
            for (int i = 0; i < 12; i++) {
              vec3 p = oc + rd * (t0 + ds * (float(i) + 0.5));
              float r = length(p), d = exp(-max(r - uR, 0.0) / H) * ds;
              float mu = dot(p / r, sunDir), lit = smoothstep(-0.2, 0.22, mu);
              vec3 col = mix(vec3(1.0, 0.38, 0.12), tint, smoothstep(-0.02, 0.38, mu));
              acc += col * lit * d * exp(-od);
              od += d * 7.0 / uR;
            }
            float c = dot(rd, sunDir), phase = 0.7 * (1.0 + c * c) + 0.9 * pow(max(c, 0.0), 14.0);
            vec3 s = 1.0 - exp(-acc * (13.0 / uR) * phase);
            gl_FragColor = vec4(s * 1.25, 1.0);
          }`,
      }));
      this.pgroup.add(this.atmo);
      // the sun sits far beyond the planet so the planet genuinely eclipses it.
      // Only a small, blinding HDR core lives in the scene; the glare around it is drawn by the post pass,
      // which checks that the core is really visible (not behind the planet, a wall or a window frame).
      this.sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('sunDisc'), color: new THREE.Color(34, 31, 27), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
      this.sunCore.scale.set(340, 340, 1); sp.add(this.sunCore);
      // another of the company's ships, parked in a lower orbit: a speck of sunlit hull crawling across the face of the
      // world, a glint off its panels now and then, its strobe winking; so you can see the size of what you're about
      // to fall into (it goes round in the world's own frame, pgroup's: see orbit)
      {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
        this.speckU = { uT: { value: 0 }, uLit: { value: 1 }, uPx: { value: 9 } };
        this.speck = new THREE.Points(g, new THREE.ShaderMaterial({
          uniforms: this.speckU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
          vertexShader: 'uniform float uPx; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPx; }',
          fragmentShader: `uniform float uT, uLit;
            void main(){
              vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d) * 4.0, s = fract(uT / 1.7);
              float hull = (0.55 + 4.0 * pow(max(0.0, sin(uT * 0.23)), 80.0)) * uLit;
              float strobe = (s < 0.04 || abs(s - 0.13) < 0.02) ? 2.2 : 0.0, nav = step(0.5, fract(uT * 0.45 + 0.2));
              vec3 c = vec3(1.0, 0.95, 0.86) * hull * exp(-r2 * 10.0) + vec3(1.0) * strobe * exp(-r2 * 12.0) + vec3(1.0, 0.12, 0.08) * 0.7 * nav * exp(-r2 * 14.0);
              gl_FragColor = vec4(c, 1.0);
            }`,
        }));
        this.speck.frustumCulled = false; this.speck.renderOrder = 3; this.pgroup.add(this.speck);
      }
      // atmospheric entry: a sheath of burning air around the hull, brightest where it rams into the belly and nose,
      // torn into ragged streaks that stream back past the windows (it's part of the backdrop pass, so only the
      // windows ever show it; it lies past that pass's near plane and over the planet)
      this.plasma = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 32), new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uK: { value: 0 }, uV: { value: V(0.3, -0.95, 0).normalize() }, uAir: { value: new THREE.Color(1, 0.55, 0.3) } },
        transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uT, uK; uniform vec3 uV, uAir; varying vec3 vP;
          float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
          void main(){
            vec3 d = normalize(vP), a = normalize(uV);
            vec3 b = normalize(abs(a.y) < 0.9 ? cross(a, vec3(0,1,0)) : cross(a, vec3(1,0,0))), c = cross(a, b);
            float face = dot(d, a), u = dot(d, b), w = dot(d, c);
            // streaks: fine across the flow, long along it, racing downstream
            vec3 q = vec3(u * 7.0, w * 7.0, face * 1.3 + uT * 3.2);
            float s = n3(q) * 0.55 + n3(q * vec3(2.3, 2.3, 1.7) + 9.1) * 0.3 + n3(q * vec3(5.0, 5.0, 3.0) + 3.7) * 0.15;
            float flick = 0.75 + 0.25 * n3(vec3(uT * 9.0, u * 2.0, w * 2.0));
            float ram = smoothstep(0.05, 1.0, face);
            float streak = smoothstep(0.42, 0.85, s) * smoothstep(-0.45, 0.6, face);
            float k = (ram * ram * 1.1 + streak * 0.9) * flick * uK;
            // the burning air takes the colour of this world's air: deep in the streaks, white-hot where it rams the hull
            vec3 air = pow(uAir / max(max(uAir.r, uAir.g), max(uAir.b, 0.01)), vec3(2.2));
            vec3 col = mix(mix(vec3(0.9, 0.16, 0.05), air * 1.1, 0.62), mix(vec3(1.6, 0.85, 0.42), air * 1.5 + 0.2, 0.5), clamp(ram * ram + streak * 0.35, 0.0, 1.0));
            gl_FragColor = vec4(col * k, 1.0);
          }`,
      }));
      this.plasma.visible = false; this.plasma.frustumCulled = false; this.plasma.renderOrder = 10;
      sp.add(this.plasma);
      // sinking into the air the sky comes up around the ship: the world's own colour, pale along the horizon,
      // deeper overhead, a thin haze over the ground below (on the day side; the night side stays black)
      this.airSky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.ShaderMaterial({
        uniforms: { uK: { value: 0 }, uUp: { value: V(0, 1, 0) }, uTint: { value: new THREE.Color(0x88aaff) } },
        transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uK; uniform vec3 uUp, uTint; varying vec3 vP;
          void main(){ float e = dot(normalize(vP), uUp), hz = pow(1.0 - clamp(abs(e), 0.0, 1.0), 4.0);
            vec3 c = uTint * (e > 0.0 ? 0.16 + 0.6 * hz : 0.1 + 0.45 * hz) * uK; gl_FragColor = vec4(c, 1.0); }`,
      }));
      this.airSky.visible = false; this.airSky.renderOrder = 5; this.airSky.frustumCulled = false; sp.add(this.airSky);
      this.sunDir = V(1, 0.3, 0).normalize();
      this.setOrbit(1, {});
      this.space.visible = false;
    }
    // A world is only as big as the detail you can find on it. The texture alone goes soft long before the ship gets
    // close, and a blurry ball reads as a small one, so the surface and the clouds carry fractal detail that keeps
    // resolving as you fall: each finer octave fades in once it is a few pixels across (so nothing ever shimmers),
    // and lights the land as relief. Low over it, the air thickens into haze toward the horizon.
    planetDetail() {
      // (the day's weather map, drawn into by stepWeather; until the first is done the cloud isn't shown. The storms in
      // it: where, and how far round they've turned since)
      const tier = CLOUD_TIER[this.wxTier = cloudTier()];
      this.wxRT = new THREE.WebGLRenderTarget(tier.w, tier.w / 2, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, generateMipmaps: true, depthBuffer: false });
      this.wxRT.texture.anisotropy = 4;
      this.vortU = { value: Array.from({ length: CLOUD.NV }, () => new THREE.Vector4()) }; this.vturnU = { value: new Array(CLOUD.NV).fill(0) };
      const U = this.pdU = { haze: { value: 0 }, tint: { value: new THREE.Color(0x88aaff) }, bump: { value: this.R * 0.3 }, cmap: { value: this.wxRT.texture }, crot: { value: 0 }, cfade: { value: 0 }, cres: { value: tier.w / TAU }, sunObj: { value: V(1, 0, 0) }, air: { value: 1 }, cast: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, sunW: { value: V(1, 0, 0) }, gas: { value: 0 }, scar: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) } };
      const NOISE = `varying vec3 vPDir; float pdHeight = 0.0, pdSea = 0.0;
        float pdh(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        // craters, one or none to each cell of a grid over the sphere at this scale, most of them small: a bowl sunk
        // below a raised rim, its ejecta thrown out round it; alb, how the rim and the floor catch the light
        float pdCraters(vec3 p, out float alb){
          vec3 b = floor(p - 0.5); float h = 0.0; alb = 0.0;
          for (int k = 0; k < 8; k++){
            vec3 c = b + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
            if (pdh(c + 3.7) > 0.62) continue;
            vec3 o = c + 0.25 + 0.5 * vec3(pdh(c + 11.1), pdh(c + 23.3), pdh(c + 37.7));
            float r = 0.09 + 0.36 * pow(pdh(c + 51.9), 2.4), d = length(p - o) / r;
            if (d > 1.6) continue;
            float di = min(d, 1.0), rim = exp(-pow((d - 1.0) / 0.16, 2.0));
            h += r * (0.42 * (di * di - 1.0) + 0.14 * rim + 0.03 * smoothstep(0.85, 1.15, d) * (1.6 - d) / 0.6);
            alb += 0.16 * rim - 0.1 * (1.0 - smoothstep(0.55, 0.95, d));
          }
          return h;
        }
        float pdn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(pdh(i), pdh(i + vec3(1,0,0)), f.x), mix(pdh(i + vec3(0,1,0)), pdh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(pdh(i + vec3(0,0,1)), pdh(i + vec3(1,0,1)), f.x), mix(pdh(i + vec3(0,1,1)), pdh(i + vec3(1,1,1)), f.x), f.y), f.z); }
        float pdFbm(vec3 p, float f0, float lac, float gain, out float hgt){
          float d = 0.0, a = 1.0, f = f0; hgt = 0.0;
          for (int i = 0; i < 8; i++){
            vec3 q = p * f; float w = 1.0 - smoothstep(0.3, 0.85, length(fwidth(q)));
            float n = pdn(q + float(i) * 17.31) - 0.5;
            d += n * a * w; hgt += n * w / f;
            f *= lac; a *= gain;
          }
          return d;
        }
        // ridged: sharp crests at every scale, so land reads as ranges, valleys and drainage rather than mottling
        float pdRidge(vec3 p, float f0, float lac, float gain, out float hgt, out float tone){
          float d = 0.0, a = 1.0, f = f0, prev = 1.0; hgt = 0.0; tone = 0.0;
          for (int i = 0; i < 8; i++){
            vec3 q = p * f; float fw = length(fwidth(q)), w = 1.0 - smoothstep(0.3, 0.85, fw);
            float n = pdn(q + float(i) * 17.31), r = 1.0 - abs(n * 2.0 - 1.0); r *= r;
            float k = (r * (0.55 + 0.45 * prev) - 0.36) * w;
            // (relief only from crests several pixels across: finer ones would shade in 2x2 blocks)
            d += k * a; hgt += k / f * (1.0 - smoothstep(0.12, 0.38, fw)); tone += (pdn(q * 0.5 + 41.7) - 0.5) * a * w;
            prev = mix(prev, r, w); f *= lac; a *= gain;
          }
          return d;
        }
        `;
      const vert = (sh) => { sh.vertexShader = 'varying vec3 vPDir;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPDir = position;'); };
      this.planetMat.onBeforeCompile = (sh) => {
        sh.uniforms.uPdHaze = U.haze; sh.uniforms.uPdTint = U.tint; sh.uniforms.uPdBump = U.bump; sh.uniforms.uPdCMap = U.cmap; sh.uniforms.uPdCRot = U.crot; sh.uniforms.uPdCFade = U.cfade; sh.uniforms.uPdCRes = U.cres; sh.uniforms.uVort = this.vortU; sh.uniforms.uVturn = this.vturnU; sh.uniforms.uPdSun = U.sunObj; sh.uniforms.uPdAir = U.air; sh.uniforms.uPdCast = U.cast; sh.uniforms.uPdSunW = U.sunW; sh.uniforms.uPdGas = U.gas; sh.uniforms.uPdScar = U.scar;
        Object.assign(sh.uniforms, this.ringU);
        vert(sh); sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('void main() {', NOISE + Rings.GLSL + CLOUD_SPIN + 'uniform float uPdHaze, uPdBump, uPdCRot, uPdCFade, uPdCRes, uPdAir, uPdGas; uniform vec3 uPdTint, uPdSun, uPdSunW; uniform vec4 uPdCast[3], uPdScar[4]; varying vec3 vWP; uniform sampler2D uPdCMap;\nvoid main() {')
          .replace('#include <map_fragment>', `#include <map_fragment>
            {
              // land (bright in the texture) gets rough, mottled ground and real relief; the sea stays nearly flat
              // (an airless moon has no ranges, no sea and no cloud: just its craters, lightly mottled)
              // (a gas giant has neither: its banded cloud is drawn as it is)
              float land = smoothstep(0.07, 0.15, dot(sampledDiffuseColor.rgb, vec3(0.3333))) * uPdAir * (1.0 - uPdGas);
              vec3 pp = normalize(vPDir);
              float sh, sea = pdFbm(pp, 30.0, 2.6, 0.75, sh);
              float lh, tone, rid = pdRidge(pp, 34.0, 2.55, 0.78, lh, tone);
              // crests catch the light as bare rock, the low ground between them is darker; the tone wanders a little
              vec3 landC = diffuseColor.rgb * clamp(1.0 + rid * 1.5, 0.25, 2.2) * mix(vec3(1.06, 0.95, 0.82), vec3(0.86, 0.98, 1.08), clamp(0.5 + tone * 1.2, 0.0, 1.0));
              vec3 seaC = diffuseColor.rgb * clamp(1.0 + sea * 0.3, 0.6, 1.4);
              diffuseColor.rgb = mix(mix(seaC, landC, land), diffuseColor.rgb, uPdGas);
              // (a giant's cloud close up: fine streaks drawn out along its bands, finer than its map, fading out before
              // they're too fine to show)
              if (uPdGas > 0.5) {
                vec3 q1 = vec3(pp.x * 30.0, pp.y * 260.0, pp.z * 30.0), q2 = q1 * 2.7;
                float s = (pdn(q1) - 0.5) * (1.0 - smoothstep(0.3, 0.9, length(fwidth(q1)))) + (pdn(q2 + 7.1) - 0.5) * 0.6 * (1.0 - smoothstep(0.3, 0.9, length(fwidth(q2))));
                diffuseColor.rgb *= 1.0 + s * 0.22;
              }
              pdHeight = lh * land;
              pdSea = (1.0 - land) * uPdAir * (1.0 - uPdGas);
              // (an airless world: craters inside craters, at every size, the smaller the more of them; closer in, ever
              // smaller ones turn up in the floors of the big ones in its map and between them, the way they do on a
              // real moon, so it never runs out of detail however near you come)
              if (uPdAir < 0.5 && uPdGas < 0.5) {
                float fw0 = length(fwidth(pp)), f = 22.0, ch = 0.0, ca = 0.0;
                for (int o = 0; o < 5; o++) {
                  float fw = fw0 * f, w = 1.0 - smoothstep(0.06, 0.25, fw); if (w <= 0.0) break;
                  float al, hh = pdCraters(pp * f + float(o) * 31.7, al);
                  ch += hh / f * (1.0 - smoothstep(0.04, 0.15, fw)); ca += al * w; f *= 2.7;
                }
                pdHeight += ch * 0.8; diffuseColor.rgb *= clamp(1.0 + ca, 0.6, 1.5);
              }
              // (on an airless moon or rock, the fresh craters today's meteors left, big enough to see from up here: a
              // darker floor, a bright raised rim, a splash of bright rays thrown out round it)
              if (uPdAir < 0.5) for (int i = 0; i < 4; i++) {
                vec4 sc = uPdScar[i]; if (sc.w <= 0.0) continue;
                float a = acos(clamp(dot(pp, sc.xyz), -1.0, 1.0)) / sc.w; if (a > 6.0) continue;
                vec3 t1 = normalize(cross(sc.xyz, abs(sc.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(sc.xyz, t1);
                float an = atan(dot(pp, t2), dot(pp, t1));
                float rays = pow(max(0.0, sin(an * 9.0 + float(i) * 2.1) * sin(an * 5.3 + 1.7)), 2.0) * smoothstep(6.0, 1.2, a) * smoothstep(0.9, 1.2, a);
                float fl = 1.0 - smoothstep(0.75, 1.0, a), rim = exp(-pow((a - 1.0) / 0.16, 2.0)), halo = smoothstep(2.4, 1.0, a) * step(1.0, a);
                diffuseColor.rgb *= (1.0 - 0.35 * fl) * (1.0 + 0.9 * rim + 0.45 * halo + 0.8 * rays);
                pdHeight += sc.w * (-0.5 * fl * (1.0 - a * a) + 0.25 * rim);
              }
              // the clouds' shadows, thrown off away from the sun, the further the lower it is (looked up where the
              // cloud is, toward the sun, in the cloud shell's own frame, turned with its storms)
              float smu = dot(pp, uPdSun);
              vec3 cs = normalize(pp + (uPdSun - pp * smu) * (0.009 / max(smu, 0.18)));
              float ca = cos(uPdCRot), sa = sin(uPdCRot);
              cs = vec3(ca * cs.x + sa * cs.z, cs.y, -sa * cs.x + ca * cs.z);
              float cov = textureLod(uPdCMap, cloudUV(cloudTurn(cs, cloudSpinAt(cs))), log2(max(1.0, length(fwidth(pp)) * uPdCRes))).a;
              diffuseColor.rgb *= 1.0 - 0.62 * smoothstep(0.05, 0.75, cov) * uPdAir * (1.0 - uPdGas) * uPdCFade;
            }`)
          // (the sea is smooth: the sun glints off it, a small bright patch on the vast curve of the world)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.32, pdSea);')
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            {
              vec3 sp = -vViewPosition, dx = dFdx(sp), dy = dFdy(sp);
              float hx = dFdx(pdHeight) * uPdBump, hy = dFdy(pdHeight) * uPdBump;
              vec3 r1 = cross(dy, normal), r2 = cross(normal, dx); float dt = dot(dx, r1);
              normal = normalize(abs(dt) * normal - sign(dt) * (hx * r1 + hy * r2));
            }`)
          .replace('#include <opaque_fragment>', `
            #if NUM_DIR_LIGHTS > 0
            {
              // aerial perspective: low over the world, the ground toward the horizon sinks into lit haze
              vec3 gn = normalize(vNormal); float mu = clamp(dot(gn, normalize(vViewPosition)), 0.0, 1.0);
              float lit = smoothstep(-0.2, 0.45, dot(gn, directionalLights[0].direction));
              outgoingLight = mix(outgoingLight, uPdTint * (0.05 + 0.55 * lit), pow(1.0 - mu, 2.5) * uPdHaze);
              // the shadows of what circles it: dark round spots sliding over its day side, soft at the edge (the further
              // off the moon, the softer)
              for (int i = 0; i < 3; i++) { vec4 c = uPdCast[i]; if (c.w > 0.0) { vec3 rel = c.xyz - vWP; float tt = dot(rel, uPdSunW);
                if (tt > 0.0) { float d = length(rel - uPdSunW * tt), pen = c.w * 0.04 + tt * 0.0093; outgoingLight *= mix(0.05, 1.0, smoothstep(c.w - pen, c.w + pen, d)); } } }
              // (and the rings' shadow, in bands: as dark as the rings are thick)
              outgoingLight *= mix(0.04, 1.0, ringThrough(vWP, uPdSunW));
              // (no air to soften it: a hard line between day and night, and the night side black)
              outgoingLight = mix(outgoingLight * smoothstep(-0.015, 0.08, dot(gn, directionalLights[0].direction)) + totalEmissiveRadiance, outgoingLight, uPdAir);
            }
            #endif
            #include <opaque_fragment>`);
      };
      this.planetMat.customProgramCacheKey = () => 'planetDetail';
      // (the sky over a moon still draws its world's weather from the painted map: made now, at the start, rather than
      // in the middle of a landing)
      TEX.get('clouds');
      // The cloud deck: one shell round the world, its weather from the day's map, drawn as a volume (see CLOUD_FS)
      const Rw = this.R, cu = this.cloudU = Object.assign({
        uMap: { value: this.wxRT.texture }, uNoise: { value: R.vol.noise || null }, uCamL: { value: V() }, uSunL: { value: V(1, 0, 0) },
        uAmb: { value: new THREE.Color() }, uCol: { value: new THREE.Color(1, 1, 1) }, uShell: { value: new THREE.Vector4(Rw * CLOUD.base, Rw * CLOUD.top, Rw * CLOUD.cirrus, Rw) },
        uFade: { value: 0 }, uCirRot: { value: 0 }, uSunI: { value: 1.55 }, uTexel: { value: TAU * Rw * CLOUD.top / tier.w },
        uPdCast: U.cast, uPdSunW: U.sunW, uVort: this.vortU, uVturn: this.vturnU, uFlash: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4()) },
      }, this.ringU);
      const cm = new THREE.ShaderMaterial({ uniforms: cu, vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS(), defines: {}, transparent: true, premultipliedAlpha: true, depthWrite: false, fog: false });
      this.clouds = new THREE.Mesh(new THREE.SphereGeometry(Rw * CLOUD.hull, 96, 48), cm); this.clouds.visible = false; this.tilt.add(this.clouds);
      // (where the eye and the sun are in the cloud's own frame, for whichever view is drawing it)
      const inv = new THREE.Matrix4(), cp = V();
      this.clouds.onBeforeRender = (r, sc, cam) => {
        inv.copy(this.clouds.matrixWorld).invert(); cu.uCamL.value.copy(cp.setFromMatrixPosition(cam.matrixWorld)).applyMatrix4(inv);
        cu.uSunL.value.copy(this.sunDir).transformDirection(inv);
        // (from inside the shell, falling through it, its far side is what's drawn, over everything behind it)
        const inside = cu.uCamL.value.length() < Rw * CLOUD.hull * 0.999;
        cm.side = inside ? THREE.BackSide : THREE.FrontSide; cm.depthTest = !inside;
      };
      // the day's weather is worked out by WX_GEN_FS into wxRT, a band of rows at a time
      this.wxMat = new THREE.ShaderMaterial({
        uniforms: { uSize: { value: new THREE.Vector2(tier.w, tier.w / 2) }, uSeed: { value: V() }, uLook: { value: new THREE.Vector4() }, uLook2: { value: new THREE.Vector4() }, uJet: { value: new THREE.Vector4() },
          uVort: this.vortU, uVk: { value: Array.from({ length: CLOUD.NV }, () => new THREE.Vector4()) }, uDet: { value: 60 } },
        vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: WX_GEN_FS, depthTest: false, depthWrite: false,
      });
      const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      const wm = new THREE.Mesh(tri, this.wxMat); wm.frustumCulled = false;
      this.wxScene = new THREE.Scene(); this.wxScene.add(wm); this.wxCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.wx = { want: null, row: -1, fade: 0, t: 0, ready: false, warm: 0 };
      this.setCloudTier(this.wxTier);
    }
    // the clouds' cost, by the picture setting (CLOUD_TIER): their shader's loops, and the size of the weather map
    setCloudTier(k) {
      const t = CLOUD_TIER[k], m = this.clouds.material;
      m.defines.STEPS = t.steps; m.defines.TAPS = t.taps; m.defines.DETAIL = t.detail; m.needsUpdate = true;
      m.customProgramCacheKey = () => 'cloudDeck' + k;
      if (this.wxRT.width !== t.w) { this.wxRT.setSize(t.w, t.w / 2); this.wxMat.uniforms.uSize.value.set(t.w, t.w / 2); }
      this.pdU.cres.value = t.w / TAU; this.cloudU.uTexel.value = TAU * this.R * CLOUD.top / t.w; this.wxMat.uniforms.uDet.value = t.w > 1024 ? 64 : 40;
    }
    // The day's weather over the world we're circling, decided by the day and the world (seed: the orbit's), so every
    // crewmate sees the same sky: its character (WEATHER) give or take, and today's storms. The lows ride the storm
    // tracks, winding the opposite way either side of the equator; the tropical storms keep to the tropics; none
    // overlaps another. (key: the world; it's worked out over the next few frames, see stepWeather)
    setWeather(seed, key) {
      const W = WEATHER[key] || WEATHER.ashgrove, r = new RNG((seed ^ 0x2f6b9e3d) >>> 0), g = this.wxMat.uniforms;
      g.uSeed.value.set(r.range(-40, 40), r.range(-40, 40), r.range(-40, 40));
      g.uLook.value.set(clamp(W.cover + r.range(-0.12, 0.12), 0.04, 0.9), W.storm * r.range(0.8, 1.2), W.cells * r.range(0.6, 1.2), clamp(W.tall * r.range(0.85, 1.15), 0.2, 1));
      g.uLook2.value.set(W.jet, W.cirrus * r.range(0.7, 1.2), W.trop, 0);
      g.uJet.value.set(r.range(0.72, 0.95), r.range(0.04, 0.13), r.int(3, 6), r.range(0, TAU));
      const list = [], place = (latA, latB, rad, kind, spin) => {
        for (let k = 0; k < 30; k++) {
          const lat = r.range(latA, latB) * (r.chance(0.5) ? 1 : -1), lon = r.range(0, TAU), c = V(-Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat));
          if (list.some((o) => o.c.angleTo(c) < (o.rad + rad) * 2.2)) continue;
          return list.push({ c, rad, kind, spin: spin * (lat > 0 ? -1 : 1), front: kind ? 0 : r.range(0.5, 1), arm: r.range(0, TAU) });
        }
      };
      if (W.great) place(0.3, 0.5, 0.42, 1, 4.5);
      for (let i = Math.round(W.storm * W.trop * r.range(0, 3.5)); i > 0; i--) place(0.2, 0.42, r.range(0.06, 0.11), 1, r.range(5, 7.5));
      for (let i = Math.round(W.storm * r.range(2, 6.5)); i > 0 && list.length < CLOUD.NV; i--) place(0.62, 1.05, r.range(0.14, 0.26), 0, r.range(2.5, 4.2) * (0.6 + 0.4 * W.storm));
      this.wxStorms = list;
      for (let i = 0; i < CLOUD.NV; i++) {
        const s = list[i], v = this.vortU.value[i], k = g.uVk.value[i];
        if (!s) { v.set(0, 0, 0, 0); k.set(0, 0, 0, 0); continue; }
        v.set(s.c.x, s.c.y, s.c.z, s.rad); k.set(s.spin, s.kind, s.front, s.arm);
        // (a tropical storm's middle goes round in about ten minutes, a low's in twenty-odd: either way slowly enough
        // that it's only ever seen winding on, never spinning)
        s.w = Math.sign(s.spin) * TAU / (s.kind ? 600 : 1400);
      }
      this.cloudU.uCol.value.setRGB(...(W.col || [1, 1, 1]));
      this.wx.want = true;
    }
    // Each frame in orbit: today's weather map drawn a band of rows at a time (never a stall), once its shader's ready,
    // then faded in; a new day's fades the old out first. The storms wind on.
    stepWeather(dt) {
      const X = this.wx, rr = R.renderer; if (!rr) return;
      if (!this.cloudU.uNoise.value) this.cloudU.uNoise.value = R.vol.noise;
      const tier = cloudTier();
      if (tier !== this.wxTier) { this.wxTier = tier; X.want = true; X.fade = Math.min(X.fade, 0.001); X.warm = 0; this.setCloudTier(tier); }
      if (X.want) {
        X.fade = Math.max(0, X.fade - dt * 3);
        if (X.fade <= 0) { X.want = false; X.row = 0; X.ready = false; }
      }
      if (X.row >= 0) {
        // (both shaders compiled first, off the main thread where the browser can)
        if (X.warm === 0) { X.warm = 1; let n = 0; const ok = () => { if (++n === 2) X.warm = 2; }; R.precompile(this.wxScene, ok, this.wxScene); R.precompile(this.clouds, ok, R.bgScene); }
        if (X.warm === 2) {
          const T = this.wxRT, H = T.height, n = Math.min(CLOUD_TIER[tier].band, H - X.row), keep = rr.getRenderTarget();
          T.scissor.set(0, X.row, T.width, n); T.scissorTest = true; T.texture.generateMipmaps = X.row + n >= H;
          rr.setRenderTarget(T); rr.render(this.wxScene, this.wxCam); rr.setRenderTarget(keep);
          X.row += n; if (X.row >= H) { X.row = -1; X.ready = true; X.t = 0; }
        }
      }
      if (X.ready && !X.want) X.fade = Math.min(1, X.fade + dt / 1.5);
      X.t += dt;
      if (this.wxStorms) this.wxStorms.forEach((s, i) => { this.vturnU.value[i] = s.w * X.t; });
      this.stepLightning(dt);
      this.cloudU.uFade.value = this.pdU.cfade.value = X.fade * X.fade * (3 - 2 * X.fade);
      this.clouds.visible = this.cloudsOn && X.fade > 0;
    }
    // lightning, the way real storms throw it: several thunderstorm cells going at once, each flickering in its own patch
    // of sky for a while (a flash every second or two somewhere in it, two or three strokes at a time, now and then the
    // whole cell going off together) before it dies
    // out and another starts up somewhere else; in today's big storms most of all, else anywhere along the tropics and
    // the storm tracks (it only shows where there's cloud to light). Just what the eye sees; nobody else needs the same
    stepLightning(dt) {
      const F = this.cloudU.uFlash.value, st = this.wxStorms || [], fl = this.flashes || (this.flashes = []), cells = this.lCells || (this.lCells = []);
      const on = this.clouds.visible && !this.airless;
      for (let i = cells.length - 1; i >= 0; i--) if ((cells[i].life -= dt) <= 0) cells.splice(i, 1);
      // (mostly in today's big storms, else along the tropics and the storm tracks; and where they'd be seen: on the face
      // of the world turned to the ship, on its night side or the dusk along it, where lightning shows; by day it's lost
      // in the glare off the cloud tops)
      const cv = this.cloudU.uCamL.value, look = cv.lengthSq() > 0 ? (this._lLook || (this._lLook = new THREE.Vector3())).copy(cv).normalize() : null, sv = this.cloudU.uSunL.value;
      while (on && cells.length < 4) {
        let c;
        for (let k = 0; k < 16; k++) {
          if (st.length && Math.random() < 0.75) { const s = st[Math.floor(Math.random() * st.length)]; c = _gV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5); c.addScaledVector(s.c, -c.dot(s.c)).normalize().multiplyScalar(s.rad * Math.sqrt(Math.random()) * 0.9).add(s.c); }
          else { const lat = (Math.random() < 0.5 ? Math.random() * 0.35 : 0.6 + Math.random() * 0.45) * (Math.random() < 0.5 ? 1 : -1), lon = Math.random() * TAU; c = _gV.set(-Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat)); }
          if (!look || (c.normalize().dot(look) > 0.3 && (c.dot(sv) < 0.15 || k > 10))) break;
        }
        cells.push({ c: c.clone().normalize(), life: 6 + Math.random() * 18, r: 0.015 + Math.random() * 0.03, next: Math.random() * 4 });
      }
      for (const c of on ? cells : []) {
        if ((c.next -= dt) > 0) continue;
        c.next = 2.5 + Math.random() * 5.5;
        // (a stroke, or now and then the whole cell going off at once, one flash setting off the next across it)
        for (let n = Math.random() < 0.2 ? 2 + Math.floor(Math.random() * 2) : 1, d = 0; n > 0; n--, d += 0.04 + Math.random() * 0.12) {
          const v = _gV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5); v.addScaledVector(c.c, -v.dot(c.c)).normalize().multiplyScalar(c.r * Math.random());
          let k = -1; for (let j = 0; j < 6; j++) if (!fl[j]) { k = j; break; }
          if (k < 0) k = this.flashK = ((this.flashK || 0) + 1) % 6;
          fl[k] = { d: c.c.clone().add(v).normalize(), t: -d, n: 1 + Math.floor(Math.random() * 3), k: 0.5 + Math.random() };
        }
      }
      for (let i = 0; i < 6; i++) {
        const f = fl[i]; if (!f) { F[i].w = 0; continue; }
        f.t += dt; if (f.t < 0) { F[i].w = 0; continue; }
        const u = f.t / 0.11, ph = u - Math.floor(u);
        F[i].set(f.d.x, f.d.y, f.d.z, u < f.n ? f.k * Math.pow(Math.sin(Math.min(1, ph / 0.55) * Math.PI), 2) * (1 - 0.3 * Math.floor(u)) : 0);
        if (u >= f.n) fl[i] = null;
      }
    }
    setPlanet(tint, atmo, airless, giant) {
      this.planetMat.color.set(tint); this.atmo.material.uniforms.tint.value.set(atmo); this.pdU.tint.value.set(atmo); this.plasma.material.uniforms.uAir.value.set(atmo); this.cloudU.uAmb.value.set(atmo);
      // (an airless moon or rock: cratered grey dust, no cloud, no air to glow at the limb or to burn coming down)
      this.airless = !!airless;
      // (its night side is black, like the world's: nothing but the stars behind it to show where it ends)
      // (a gas giant: no ground, its cloud tops are all there is, banded, and nothing drifts over them)
      const map = TEX.get(airless ? 'moonmap' : giant || 'planet'), pm = this.planetMat;
      if (pm.map !== map) { pm.map = map; pm.normalMap = airless ? TEX.normal('moonmap', 3) : null; pm.normalScale.set(2.4, 2.4); pm.needsUpdate = true; }
      this.pdU.air.value = airless ? 0 : 1; this.pdU.gas.value = giant ? 1 : 0;
      this.cloudsOn = !airless && !giant; this.clouds.visible = this.cloudsOn && this.wx.fade > 0;
      this.atmo.visible = !airless;
    }
    // the fresh craters on the moon or rock we're circling (G.run.scars): where round it, in its own frame, and how wide
    setScars(list) { this.pdU.scar.value.forEach((v, i) => { const s = list[i]; if (s) v.set(Math.cos(s.lat) * Math.cos(s.lon), Math.sin(s.lat), Math.cos(s.lat) * Math.sin(s.lon), s.r); else v.set(0, 0, 0, 0); }); }
    // The asteroid that was on its way in to the moon or rock we left, coming down on it while we watch from orbit: on
    // the moon we're circling, or on that one out there among the others. It falls in out of the dark, a lumpy rock
    // catching the sun, faster and faster; a flash that lights the whole limb; then a plume of molten rock and dust
    // thrown up and out, glowing at first and cooling to grey, hanging there a long while. The scar it leaves is one
    // of the moon's scars (setScars) once the dust is down.
    impactTarget(site, route) { return site === route ? this.planet : this.bodiesG && this.bodiesG.children.find((m) => m.userData.key === site) || null; }
    // (where on it, in its own frame: round toward the limb from the middle of the face we see, so the plume shows)
    impactAt(site, route) {
      const m = this.impactTarget(site, route); if (!m) return null;
      m.updateMatrixWorld(true);
      const c = m.worldToLocal(_camP.clone()).normalize(), side = V().crossVectors(c, Math.abs(c.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).normalize();
      const p = c.multiplyScalar(Math.cos(0.9)).addScaledVector(side, Math.sin(0.9)).normalize();
      return { lat: +Math.asin(clamp(p.y, -1, 1)).toFixed(4), lon: +Math.atan2(p.z, p.x).toFixed(4) };
    }
    impact(site, route, lat, lon, lead = 8) {
      const m = this.impactTarget(site, route); if (!m) return;
      if (this.imp) this.clearImpact();
      const rl = m === this.planet ? this.R : 1, rw = m === this.planet ? this.R : m.scale.x;
      const n = V(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)), side = V().crossVectors(n, Math.abs(n.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).normalize();
      const g = new THREE.Group(); m.add(g);
      // (the rock, coming in at a slant)
      const geo = new THREE.IcosahedronGeometry(1, 2), pp = geo.attributes.position, nz = new Noise2D(31);
      for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), k = 1 + nz.fbm(x * 1.5, y * 1.5 + z, 3) * 0.6; pp.setXYZ(i, x * k * 1.3, y * k * 0.8, z * k); }
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: TEX.get('moonmap'), color: 0x8a8278, roughness: 1, metalness: 0, fog: false, flatShading: true }));
      rock.scale.setScalar(rl * 0.05); rock.frustumCulled = false; g.add(rock);
      const from = n.clone().multiplyScalar(0.55).addScaledVector(side, 0.85).normalize().multiplyScalar(rl * 3.2).addScaledVector(n, rl);
      // (the flash)
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: new THREE.Color(4, 3.6, 3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
      flash.position.copy(n).multiplyScalar(rl * 1.02); g.add(flash);
      // (the plume: every grain on its own way up and out, slowing as it goes, falling back over a long while)
      const N = 1400, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), sz = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = Math.random() * TAU, sp = Math.pow(Math.random(), 0.6), up = 0.25 + Math.random() * 0.9, t2 = V().crossVectors(n, side);
        const v = n.clone().multiplyScalar(up).addScaledVector(side, Math.cos(a) * sp).addScaledVector(t2, Math.sin(a) * sp).multiplyScalar((0.18 + Math.random() * 0.5) * 0.12);
        pos.set([n.x * rl * 1.005, n.y * rl * 1.005, n.z * rl * 1.005], i * 3); vel.set([v.x * rl, v.y * rl, v.z * rl], i * 3); sz[i] = 0.5 + Math.random() * 1.5;
      }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('aV', new THREE.BufferAttribute(vel, 3)); pg.setAttribute('aS', new THREE.BufferAttribute(sz, 1));
      const pm = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uSize: { value: rw * 0.006 }, uSun: { value: this.sunDir } },
        vertexShader: `attribute vec3 aV; attribute float aS; uniform float uT, uSize; varying float vS; void main(){
            float f = 6.0 * (1.0 - exp(-uT / 6.0)) - 0.004 * uT * uT; vec3 p = position + aV * max(f, 0.0) * 0.5;
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vS = aS; gl_PointSize = clamp(aS * uSize * 600.0 / -mv.z, 1.0, 9.0); }`,
        fragmentShader: `uniform float uT; varying float vS; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
            vec3 hot = vec3(1.6, 0.75, 0.3), dust = vec3(0.55, 0.52, 0.48);
            float cool = smoothstep(1.0, 10.0, uT + vS * 2.0), a = smoothstep(0.5, 0.1, r) * smoothstep(0.0, 0.3, uT) * (1.0 - smoothstep(25.0, 55.0, uT));
            gl_FragColor = vec4(mix(hot, dust, cool), a * mix(0.9, 0.5, cool)); }`,
        transparent: true, depthWrite: false, fog: false,
      });
      const plume = new THREE.Points(pg, pm); plume.frustumCulled = false; plume.visible = false; g.add(plume);
      this.imp = { g, rock, from, to: n.clone().multiplyScalar(rl), flash, plume, rw, ps: m === this.planet ? 1 : m.scale.x, t: -lead, lead };
    }
    clearImpact() {
      const I = this.imp; if (!I) return;
      if (I.g.parent) I.g.parent.remove(I.g);
      I.rock.geometry.dispose(); I.plume.geometry.dispose(); I.plume.material.dispose(); I.flash.material.dispose(); I.rock.material.dispose();
      this.imp = null;
    }
    stepImpact(dt) {
      const I = this.imp; if (!I) return;
      I.t += dt;
      if (I.t < 0) {
        // (falling in: slowly at first, then all at once)
        const u = Math.pow(1 + I.t / I.lead, 2.5); I.rock.position.copy(I.from).lerp(I.to, u); I.rock.rotation.x += dt * 0.4; I.rock.rotation.y += dt * 0.25;
        return;
      }
      if (I.rock.visible) {
        I.rock.visible = false; I.plume.visible = true;
        R.fx.flash = Math.max(R.fx.flash, 0.35); Player.addShake(0.15);
        SFX.play('thud', null, { vol: 0.5 });
      }
      I.flash.material.opacity = I.t < 0.12 ? I.t / 0.12 : Math.max(0, 1 - (I.t - 0.12) / 5) ** 2;
      I.flash.scale.setScalar(I.rw * lerp(0.25, 0.9, Math.min(1, I.t / 2)) / I.ps);
      I.plume.material.uniforms.uT.value = I.t;
      if (I.t > 60) this.clearImpact();
    }
    // what circles this world (or, orbiting a moon, the world it belongs to): spheres and lumps hung round it in the
    // sky, lit by the same sun so they wax and wane, placed just off its limb as the ship sees it from its orbit
    // (each: kind moon / rock / planet, size and orbit in this world's radii, ang round the limb, off past it)
    setBodies(list, rings) {
      const R = this.R, o = this.orb;
      // (rings round the world we're circling: in its middle, the tilt's plane; see orbit() for the rest)
      this.ringPlanet = this.ringOwn && rings ? this.planet : null; this.ringN0 = V(0, 1, 0);
      if (this.ringPlanet) { Rings.set(this.ringU, rings, this.planetMat.color, 0.8); this.ringU.uRingR.value.z = R; }
      if (!this.bodiesG) { this.bodiesG = new THREE.Group(); this.pgroup.add(this.bodiesG); }
      for (const m of [...this.bodiesG.children]) { this.bodiesG.remove(m); if (!m.userData.shared) m.geometry.dispose(); }
      // (the ones that orbit, slowly; everything that can throw a shadow on the world we're circling, or be in its shadow)
      this.bodyRims = []; this.bodyOrbits = []; this.casters = [];
      // (circling a moon or rock, with the world it belongs to out there: see planGlide)
      this.byWorld = list.some((b) => b.kind === 'planet');
      if (!this.occU) { this.occU = { value: new THREE.Vector4() }; this.sunWU = { value: this.sunDir }; }
      // a moon, rock or world out there: lit by the sun, dark in the shadow of the world we're circling when it passes
      // behind it, and (a moon or rock) black past its terminator, the backdrop's soft fill light not wrapping round it.
      // (A moon is drawn far nearer the world than it really is, just off its limb, so the shadows are reckoned where it
      // really is, uLift.xyz further out: else it would sit half in the world's shadow, or the rings', much of the time.
      // uLift.w: 0 for one that never comes near enough the moon we're circling to fall in its shadow.)
      const shade = (mat, harsh, lift, giant) => {
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uOcc = this.occU; sh.uniforms.uSunW = this.sunWU; sh.uniforms.uLift = lift; Object.assign(sh.uniforms, this.ringU);
          sh.vertexShader = 'varying vec3 vWP, vOP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vOP = position;');
          sh.fragmentShader = Rings.GLSL + 'uniform vec4 uOcc, uLift; uniform vec3 uSunW; varying vec3 vWP, vOP;\n' + sh.fragmentShader
            // (a giant seen from one of its moons, filling half the sky: its cloud close up, fine streaks drawn out along
            // its bands, finer and finer, each fading out before it's too fine to show; so it never goes soft)
            .replace('#include <map_fragment>', giant ? `#include <map_fragment>
            {
              vec3 pp = normalize(vOP), q = vec3(pp.x * 30.0, pp.y * 260.0, pp.z * 30.0); float s = 0.0, a = 1.0;
              for (int i = 0; i < 4; i++) {
                vec3 i0 = floor(q + float(i) * 7.1), f = fract(q + float(i) * 7.1); f = f * f * (3.0 - 2.0 * f);
                #define GH(c) fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453)
                float n = mix(mix(mix(GH(i0), GH(i0 + vec3(1,0,0)), f.x), mix(GH(i0 + vec3(0,1,0)), GH(i0 + vec3(1,1,0)), f.x), f.y),
                              mix(mix(GH(i0 + vec3(0,0,1)), GH(i0 + vec3(1,0,1)), f.x), mix(GH(i0 + vec3(0,1,1)), GH(i0 + vec3(1,1,1)), f.x), f.y), f.z);
                #undef GH
                s += (n - 0.5) * a * (1.0 - smoothstep(0.3, 0.9, length(fwidth(q)))); q *= 2.7; a *= 0.62;
              }
              diffuseColor.rgb *= 1.0 + s * 0.24;
            }` : '#include <map_fragment>')
            .replace('#include <opaque_fragment>', `{
              vec3 P = vWP + uLift.xyz, rel = uOcc.xyz - P; float tt = dot(rel, uSunW);
              // (in the world's shadow it isn't quite black where the world has rings: their sunlit ice still lights it, dimly)
              if (tt > 0.0 && uLift.w > 0.0) { float d = length(rel - uSunW * tt), pen = uOcc.w * 0.03 + tt * 0.0093, e = smoothstep(uOcc.w - pen, uOcc.w + pen, d);
                outgoingLight = outgoingLight * mix(0.02, 1.0, e) + diffuseColor.rgb * uRingCol * (0.05 * uRingR.w * (1.0 - e)); }
              outgoingLight *= mix(0.04, 1.0, ringThrough(P, uSunW));
              ${harsh ? '#if NUM_DIR_LIGHTS > 0\n outgoingLight *= smoothstep(-0.015, 0.08, dot(nonPerturbedNormal, directionalLights[0].direction));\n #endif' : ''}
            }
            #include <opaque_fragment>`);
        };
        mat.customProgramCacheKey = () => (harsh ? 'bodyHarsh' : giant ? 'bodyGiant' : 'bodySoft');
      };
      const a = (o.ra + o.rp) / 2, cam = new THREE.Vector3().copy(o.D).multiplyScalar(-a), lim = Math.asin(Math.min(0.99, R / a));
      // A stream of big rocks going round the world near our own orbit (fewer round a moon or rock): each a little faster
      // or slower than we are, so it drifts past the windshield, overtaking or falling behind and coming round again,
      // tumbling slowly; a few pass close enough to fill it for a moment. Lit like everything else out here, and dark in
      // the world's shadow
      {
        if (!this.driftGeos) this.driftGeos = [0, 1, 2, 3, 4].map((v) => {
          const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, nz = new Noise2D(300 + v * 17), sq = [1.4, 1, 0.75, 1.2, 0.9][v];
          for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + nz.fbm(x * 1.7 + v, y * 1.7 + z * 1.3, 4) * 0.6; p.setXYZ(i, x * k * sq, y * k * (2 - sq) * 0.7, z * k); }
          g.computeVertexNormals(); return g;
        });
        const dr = new RNG(Math.round(a) * 31 + list.length * 7), small = list.some((b) => b.kind === 'planet'), n = small ? dr.int(10, 14) : dr.int(22, 30);
        const mats = [0x7a746c, 0x6a5e52, 0x8a847a].map((c) => { const m = new THREE.MeshStandardMaterial({ map: TEX.get('moonmap'), color: c, roughness: 1, metalness: 0, fog: false, flatShading: true, normalMap: TEX.normal('moonmap', 3), normalScale: new THREE.Vector2(2.2, 2.2) }); shade(m, true, { value: new THREE.Vector4(0, 0, 0, 1) }); return m; });
        this.drift = [];
        for (let i = 0; i < n; i++) {
          const size = dr.range(5, 18) * (dr.chance(0.2) ? 2.6 : 1);
          // (how far in or out of our orbit it goes, and above or below it: never through where we are)
          const close = dr.chance(0.25), ang = dr.range(0, TAU), off = close ? dr.range(45, 130) + size * 2 : dr.range(150, 0.16 * a);
          const m = new THREE.Mesh(this.driftGeos[i % 5], mats[i % 3]); m.userData.shared = true;
          m.scale.set(size * dr.range(0.8, 1.2), size * dr.range(0.8, 1.2), size * dr.range(0.8, 1.2)); m.rotation.set(dr.range(0, TAU), dr.range(0, TAU), 0); m.frustumCulled = false;
          this.bodiesG.add(m);
          // (most of them inside our orbit, between us and the world, where they cross the view)
          this.drift.push({ m, dr: Math.abs(Math.cos(ang)) * off * (dr.chance(0.7) ? -1 : 1), h: Math.sin(ang) * off * 0.6, th0: dr.range(-Math.PI, Math.PI), w: dr.range(0.004, 0.018) * (dr.chance(0.5) ? 1 : -1), ax: V(dr.range(-1, 1), dr.range(-1, 1), dr.range(-1, 1)).normalize(), sp: dr.range(0.02, 0.1) });
        }
      }
      const u = new THREE.Vector3().crossVectors(o.D, new THREE.Vector3(0, 1, 0)).normalize(), v = new THREE.Vector3().crossVectors(u, o.D).normalize();
      const rr = new RNG(list.length * 977 + Math.round(a));
      for (const b of list) {
        // (the world a moon belongs to rises up from behind it, a vast arc filling the sky past its limb)
        // (their orbits are their own: from one day to the next a moon or rock swings in close or out far, and round)
        const near = b.near ?? (b.kind === 'planet' ? 1 : 0.5 + rr.next() * 1.2), ang = b.near != null || b.kind === 'planet' ? b.ang : b.ang + rr.range(-0.6, 0.6);
        const al = b.kind === 'planet' ? lim * 0.8 + b.off : lim + b.off * 1.8, w = u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang));
        // (a ringed world is as big as it really is next to the moon or rock we're circling, only kept inside the view's far reach)
        let rad = b.size * R * (b.kind === 'planet' ? 1 : 0.765);
        if (b.rings) { const d = 1 / Math.sin(b.ar); rad = Math.min(rad, 37000 / Math.sqrt(d * d - 1)); }
        const L = b.kind === 'planet' ? rad / Math.sin(b.ar || 0.5) : a + b.orbit * R * (b.kind === 'moon' ? 0.22 : 0.32) * near;
        const pos = cam.clone().addScaledVector(o.D.clone().multiplyScalar(Math.cos(al)).addScaledVector(w, Math.sin(al)), L);
        // a rock inside the rings is really in them, in its lane, as far out as it is today: wherever round it shows
        // best from here, out through the windshield a little way off dead ahead (and not behind the world)
        const ringRock = b.ring && this.ringPlanet === this.planet;
        if (ringRock) {
          const n = V(0, 1, 0).applyQuaternion(this.tilt.quaternion), e1 = V(1, 0, 0).applyQuaternion(this.tilt.quaternion), e2 = V().crossVectors(n, e1), dd = b.orbit * near * R;
          let bs = 1e9;
          for (let i = 0; i < 180; i++) {
            const f = i / 180 * TAU, p = e1.clone().multiplyScalar(Math.cos(f) * dd).addScaledVector(e2, Math.sin(f) * dd), vv = p.clone().sub(cam), dist = vv.length(); vv.divideScalar(dist);
            const tc = -cam.dot(vv), c2 = cam.lengthSq() - tc * tc, hid = c2 < R * R * 1.02 && tc - Math.sqrt(Math.max(0, R * R * 1.02 - c2)) < dist;
            const sc = Math.abs(Math.acos(clamp(vv.x, -1, 1)) - 0.32) + Math.abs(vv.y) * 0.5 + (hid ? 10 : 0);
            if (sc < bs) { bs = sc; pos.copy(p); }
          }
        }
        let geo;
        if (b.kind === 'rock') {
          geo = new THREE.IcosahedronGeometry(1, 4); const p = geo.attributes.position, nz = new Noise2D(rr.next() * 1000);
          for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + nz.fbm(x * 1.6 + 3, y * 1.6 + z * 1.2, 4) * 0.55; p.setXYZ(i, x * k * 1.3, y * k * 0.78, z * k); }
          geo.computeVertexNormals();
        } else geo = new THREE.SphereGeometry(1, 64, 32);
        const map = TEX.get(b.kind === 'planet' ? b.giant || 'planet' : 'moonmap'), nm = b.kind === 'planet' ? null : TEX.normal('moonmap', 3);
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, color: b.tint, roughness: 1, metalness: 0, fog: false, flatShading: b.kind === 'rock', normalMap: nm, normalScale: new THREE.Vector2(2.2, 2.2) }));
        // (round the world it belongs to, a moon or rock really goes round b.orbit of its radii out; seen from one of
        // that world's moons, the other is far off, never in our moon's shadow)
        const sib = b.kind !== 'planet' && list.some((x) => x.kind === 'planet');
        m.userData.lift = { value: new THREE.Vector4(0, 0, 0, sib ? 0 : 1) };
        m.userData.real = b.kind === 'planet' || sib ? 0 : b.orbit * R * near; m.userData.ringRock = ringRock; m.userData.key = b.key; m.userData.world = b.kind === 'planet';
        shade(m.material, b.kind !== 'planet', m.userData.lift, b.kind === 'planet' && !!b.giant);
        m.position.copy(pos); m.scale.setScalar(rad); m.rotation.set(rr.range(-0.5, 0.5), rr.range(0, TAU), rr.range(-0.3, 0.3)); m.frustumCulled = false;
        this.bodiesG.add(m); this.casters.push(m);
        // (a moon or rock goes slowly round, a moon in about forty minutes, a rock in under twenty: its own way round,
        // tipped a little, mostly across the sky so it circles the world rather than hiding behind it)
        // (one in the rings goes round in them, the way they go round, slowly)
        if (ringRock) this.bodyOrbits.push({ m, base: pos.clone(), axis: V(0, 1, 0).applyQuaternion(this.tilt.quaternion), speed: TAU / 6000 });
        else if (b.kind !== 'planet') {
          const bn = pos.clone().normalize(), want = o.D.clone().negate().addScaledVector(v, 0.35);
          this.bodyOrbits.push({ m, base: pos.clone(), axis: want.addScaledVector(bn, -want.dot(bn)).normalize(), speed: (b.kind === 'moon' ? TAU / 4800 : TAU / 2200) * (rr.next() < 0.5 ? 1 : -1) });
        }
        // a world with air (seen from one of its moons) wears a thin glowing limb on its sunlit side, and its rings
        if (b.atmo != null) {
          const rim = new THREE.Mesh(new THREE.SphereGeometry(1.03, 48, 24), new THREE.ShaderMaterial({
            uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) }, uCol: { value: new THREE.Color(b.atmo) } },
            vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
            fragmentShader: 'uniform vec3 uSun, uCol; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(uCol * f * smoothstep(-0.3, 0.5, dot(vN, uSun)) * 1.4, 1.0); }',
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
          }));
          rim.position.copy(pos); rim.scale.setScalar(rad); rim.frustumCulled = false; this.bodiesG.add(rim); this.bodyRims.push(rim.material.uniforms.uSun);
        }
        // Its rings lie in the plane everything round it circles in. Circling a rock that's inside them, they're a floor of
        // ice running away to the world, with a lane swept clear round the rock's orbit (and we're a little above it);
        // circling its moon, a little above or below them, so they're seen opened out that far.
        if (b.rings && rings) {
          const c = pos.clone().negate().normalize(), cd = cam.clone().normalize(), X = cd.clone().addScaledVector(c, -cd.dot(c)), xl = Math.max(X.length(), 1e-3); X.divideScalar(xl);
          const Y = V().crossVectors(c, X), eps = b.me.ring ? 0 : b.me.eps, want = rr.range(0.2, 0.45);
          const psi = Math.acos(clamp((Math.sin(want) - Math.sin(eps) * cd.dot(c)) / (Math.cos(eps) * xl), -1, 1)) * (rr.next() < 0.5 ? 1 : -1);
          this.ringN0 = c.clone().multiplyScalar(Math.sin(eps)).addScaledVector(X, Math.cos(eps) * Math.cos(psi)).addScaledVector(Y, Math.cos(eps) * Math.sin(psi)).normalize();
          // (our own lane goes right round where we are, and is as wide as the rock we're circling keeps it)
          const sys = Object.assign({}, rings, { gaps: rings.gaps.map((g) => (b.me.ring && Math.abs(g[0] - pos.length() / rad) < 0.5 ? [pos.length() / rad, 2.4 * R / rad] : g)) });
          this.ringPlanet = m; Rings.set(this.ringU, sys, b.tint, 0.8);
        }
      }
    }
    // A new elliptical orbit: sometimes we swing in close, sometimes the whole world hangs far off like Saturn from a moon.
    // The ship holds its attitude so the planet stays framed in the windshield; our motion around it moves the sun.
    // (byGiant: round one of a giant's moons, which parks higher, so the moon sits small in the glass against the giant)
    setOrbit(seed, look, byGiant) {
      const r = new RNG(seed), R = this.R;
      const D = V(1, r.range(0.04, 0.16), r.range(-0.42, -0.1)).normalize();
      const N0 = V(0, 1, 0).sub(D.clone().multiplyScalar(D.y)).normalize();
      const N = N0.clone().applyAxisAngle(D, r.range(-0.6, 0.6)).normalize();
      // each day's orbit has its own size (sometimes the world fills the windshield, sometimes you see all of it),
      // but it is nearly circular and slow, so the planet never visibly swells or shrinks while you're aboard; it takes
      // half an hour or so to go round, and the world turns the other way under it (spin), so the ground under it
      // creeps by and the day and night slide over it as you watch, far too big to see move quickly
      // (round a giant the ship rides low over it, so it fills the whole windshield and runs on past it; round one of
      // its moons it stands well off, the moon a small ball against the wall of the giant, several times its size)
      const a = R * (look.giant ? r.range(1.25, 1.7) : byGiant ? r.range(5.5, 8) : r.range(1.6, 3.6)), e = r.range(0.02, 0.07);
      this.turn = 0; this.glide = null;
      this.orb = { D, N, B: new THREE.Vector3().crossVectors(N, D).normalize(), rp: a * (1 - e), ra: a * (1 + e), period: r.range(600, 840) * 2.5, phase: r.range(0, TAU), sunPhase: r.range(1.2, 2.2), spin: r.range(0.004, 0.009) * 0.85 };
      this.tilt.rotation.set(r.range(-0.35, 0.35), 0, r.range(0.2, 0.55));
      // (and its own weather today: the same seed, the world's own character)
      if (!look.airless && !look.giant) this.setWeather(seed, typeof SITE_LOOK === 'undefined' ? null : Object.keys(SITE_LOOK).find((k) => SITE_LOOK[k] === look));
      // (rings: only round the worlds that have them; never round an airless moon or rock)
      this.ringOwn = !!look.rings && !look.airless; this.ringPlanet = null; this.hold = 0;
      // (the other ship today: lower down, so it goes round faster, coming across the face of the world toward us)
      const r2 = R * r.range(1.15, 1.4), w0 = TAU / this.orb.period;
      this.speckO = { r: r2, N: N.clone().applyAxisAngle(D, r.range(0.08, 0.3) * (r.chance(0.5) ? 1 : -1)), a0: r.range(-0.7, -0.4), w: w0 * Math.pow(a / r2, 1.5) - w0, t0: null };
    }
    // how near the closest of the world's surfaces is: the ground, or the shell of its cloud or its air, as the ship
    // sinks past them (so the backdrop's near plane never cuts into one)
    clearance() { const a = this.alt, R = this.R; return Math.min(a, Math.abs(a - R * 0.06), Math.abs(a - R * (CLOUD.hull - 1))); }
    // where the sun is from the ship (its orbit's own framing), this far round the orbit
    sunAt(nu) { const o = this.orb, sa = o.sunPhase - nu; return _gS.copy(o.D).multiplyScalar(Math.cos(sa)).addScaledVector(o.B, Math.sin(sa)).addScaledVector(o.N, 0.18).normalize(); }
    // the ship's attitude coming down (in the orbit's own framing): the world's centre to b1, below the nose, and the
    // axis A the world turns on under it out to the side, so the ship flies along the way it's going
    glideFrame(A, b1) {
      _gA.makeBasis(this.orb.D, A, _gF.crossVectors(this.orb.D, A)).transpose();
      return _tqFull.setFromRotationMatrix(_gB.makeBasis(b1, _g2.set(0, 0, 1), _g3.crossVectors(b1, _g2)).multiply(_gA));
    }
    // Which way round the world the ship goes coming down, and how far (g.A, the axis the world turns on under it, and
    // the trip, g.kb the pace it goes round at), picked so it always comes down out of the dark into the morning, as the
    // site is when it lands, wherever it was when the lever went: the sun about ENTRY.sunUp over the ground beneath by
    // the time the shutters close, from deep in the night side going further round to get there, the sun coming up
    // over the horizon. Of the ways that do, the one that means the shortest turn and the least extra way round, and
    // leaves the sun off to the side or behind, lighting the ground ahead rather than showing only its shadowed side,
    // and never behind anything out there. g.dur is how long the turn takes (the further, the longer: a ship this size
    // swings round slowly).
    // Over a moon or rock (byWorld) the sun stays where it really is: no further round to bring it up, and of the ways
    // down, the one that leaves it about as high as it was when the lever went, and never brings it up over the
    // ground's edge or out from behind the world on the way. So the ship comes down in daylight only if the sun really
    // is on that side, and in the dark over the night side or in the world's shadow (g.ecl: the world hiding the sun at
    // the bottom, so the site opens in its eclipse).
    planGlide(g, nu, b1) {
      const o = this.orb, E = ENTRY, R = this.R, lo = Math.sin(E.sunUp - 0.14), hi = Math.sin(E.sunUp + 0.14), s0 = this.sunAt(nu).clone();
      const n0 = _gN.crossVectors(o.D, s0); if (n0.lengthSq() < 1e-6) n0.copy(o.N); n0.normalize();
      const m0 = _gM.crossVectors(o.D, n0);
      const axis = (b, out) => out.copy(n0).multiplyScalar(Math.cos(b)).addScaledVector(m0, Math.sin(b));
      const sunAfter = (b, f) => _gV.copy(s0).applyAxisAngle(axis(b, _gX), f), up = (b, f) => -sunAfter(b, f).dot(o.D);
      const turn = (b) => 2 * Math.acos(Math.min(1, Math.abs(this.glideFrame(axis(b, _gX), b1).w)));
      // (where the ship is over the ground, h of the world's radius up and f round: in this framing everything out
      // there holds still and the ship goes round)
      const at = (b, f, h, out) => out.copy(o.D).multiplyScalar(-R * (1 + h)).applyAxisAngle(axis(b, _gX), -f);
      // (and how much of the sun shows from there, past the ground's edge and everything out there, as orbit() has it)
      const shows = (P) => { const d = P.length(), am = Math.asin(Math.min(0.999, R * 1.02 / d)); return sstep(am - 0.015, am + 0.05, Math.acos(clamp(-P.dot(s0) / d, -1, 1))) * (1 - this.sunHidden(P, s0, 0.015).k); };
      // (the ordinary way round, and how high the ship is, every half second on the way down)
      let ib = 0, ix = 0; const way = [];
      for (let t = 0; t < E.white; t += 0.05) { if (way.length * 0.5 <= t) way.push({ f: ib, h: G.glideAlt(g.h0, t) }); ib += glideW(t, g.h0) * 0.05; ix += glideWx(t, g.h0) * 0.05; }
      way.push({ f: ib, h: G.glideAlt(g.h0, E.white) }); for (const w of way) w.f *= E.trip / ib;
      const u0 = -s0.dot(o.D);
      let best = 0, trip = E.trip, tb = 0, cost = Infinity;
      for (let i = 0; i < 96; i++) {
        const b = (i / 96) * TAU - Math.PI, t = turn(b);
        let f = E.trip, rise = 0;
        if (this.byWorld) {
          // (how far it comes up out of the lowest it's been, on the way down)
          let low = 1; for (const w of way) { const v = shows(at(b, w.f, w.h, _gP)); rise = Math.max(rise, v - low); low = Math.min(low, v); }
        } else if (up(b, f) < lo) {
          // (as far round as this heading needs to bring the sun up, if it's still down)
          let a = f, z = E.tripMax;
          if (up(b, z) < lo) f = z;
          else { for (let k = 0; k < 20; k++) { const m = (a + z) / 2; if (up(b, m) < lo) a = m; else z = m; } f = z; }
        }
        const u = up(b, f), sv = sunAfter(b, f), fw = _gF.crossVectors(axis(b, _gX), o.D);
        const ahead = sv.addScaledVector(o.D, -sv.dot(o.D)).normalize().dot(fw), mv = Math.sqrt(Math.max(0, 1 - s0.dot(axis(b, _gX)) ** 2));
        const c = t + 0.8 * Math.max(0, ahead - 0.2) + (this.byWorld
          ? 5 * Math.abs(u - u0) + mv + 12 * rise
          : 6 * (Math.max(0, lo - u) + Math.max(0, u - hi)) + 1.2 * (f - E.trip) + 8 * this.sunHidden(at(b, f, E.hEnd, _gP), s0).k);
        if (c < cost) { cost = c; best = b; trip = f; tb = t; }
      }
      g.A = axis(best, new THREE.Vector3());
      g.dur = 3.8 + 4 * tb / Math.PI;
      // (only with the sun up over the ground there: on the night side it's just night)
      if (this.byWorld) { const h = this.sunHidden(at(best, trip, E.hEnd, _gP), s0); g.ecl = h.k > 0.5 && h.m.userData.world && up(best, trip) > 0; }
      g.kb = Math.min(trip, E.trip) / ib; g.kx = Math.max(0, trip - E.trip) / ix;
      // (how far round it has gone at any moment, worked out once: the same however the frames fall, and for anyone
      // who joins partway down)
      const n = Math.ceil((E.white + 30) / 0.05) + 1, tab = (g.phiT = new Float32Array(n));
      for (let i = 1; i < n; i++) { const t = (i - 0.5) * 0.05; tab[i] = tab[i - 1] + (g.kb * glideW(t, g.h0) + g.kx * glideWx(t, g.h0)) * 0.05; }
    }
    // how much of the sun s is hidden, seen from P (in the orbit's own framing, from the middle of the world we
    // circle), by whatever else is out there: k, and m, the one hiding most of it (edge: how soft their edges are)
    sunHidden(P, s, edge = 0.06) {
      const h = { k: 0, m: null };
      for (const m of this.casters || []) {
        const v = _gC.copy(m.position).sub(P), d = v.length(), am = Math.asin(Math.min(0.999, m.scale.x / d)), ang = Math.acos(clamp(v.dot(s) / d, -1, 1));
        const k = 1 - sstep(am - 0.004, am + edge, ang);
        if (k > h.k) { h.k = k; h.m = m; }
      }
      return h;
    }
    orbit(dt, tNow) {
      const o = this.orb, R = this.R, g = this.glide;
      // (coming down, the ship's own way round the world takes over from the orbit's: see below)
      // (the parked orbit's own slow drift carries on through the swing, dying away by the burn)
      if (g) { if (g.hold0 == null) g.hold0 = this.hold || 0; this.hold = g.hold0 + glideHold(g.t); }
      const t = tNow - (this.hold || 0);
      const a = (o.ra + o.rp) / 2, e = (o.ra - o.rp) / (o.ra + o.rp);
      const M = o.phase + t * TAU / o.period;
      this.stepImpact(dt);
      let E = M; for (let i = 0; i < 5; i++) E = M + e * Math.sin(E);
      let dist = a * (1 - e * Math.cos(E));
      const dOrb = dist;
      const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
      // arriving from a jump the world swells up out of the distance (as the gap closes, not the distance: steadily)
      if (this.arrive < 1) dist *= Math.exp(Math.log(14) * (1 - this.arrive));
      // In orbit the world hangs off to one side of the windshield, and the whole sky (world, sun, stars) turns
      // together when the ship does. Dropping out of a jump nose-on to the world, the ship eases round into its
      // orbit's framing (turn: 1 nose-on, 0 the orbit's framing).
      let q;
      if (!g) q = _tq.copy(_tqI).slerp(_tqFull.setFromUnitVectors(o.D, _ahead), this.turn || 0);
      else {
        // Coming down out of orbit the way a spacecraft does. First the ship swings round, slow and steady on its
        // thrusters, to fly along its orbit with its belly to the world (turn: 0 the orbit's framing, 1 swung round).
        // Then it sinks round the world (hr: its height over the ground, a share of the world's radius, set by the
        // descent), lower and lower and faster and faster, the way a smaller orbit goes round quicker, until it
        // skims into the top of the air.
        if (g.hr != null) dist = R * (1 + g.hr);
        // (the horizon holds a little above the nose; as the world grows the ship pitches up to keep it there, so the
        // disc under the nose spreads out into a flattening horizon with the ground laid out below it)
        const dl = Math.asin(Math.min(0.999, R / dist)) - 0.16;
        _g1.set(Math.cos(dl), -Math.sin(dl), 0);
        // (planned for where the orbit will have drifted to by the time it's still)
        if (!g.A) this.planGlide(g, nu + (TAU / o.period) * Math.max(0, glideDrift() - (g.t - glideHold(g.t))), _g1);
        q = _tq.copy(_tqI).slerp(this.glideFrame(g.A, _g1), g.turn);
        // all the way down the world turns under the ship, and the sun and stars wheel round with it
        { const tab = g.phiT, f = g.t / 0.05, i = Math.min(tab.length - 2, Math.floor(f)); g.phi = tab[i] + (tab[i + 1] - tab[i]) * (f - i); }
        _gTr.setFromAxisAngle(g.A, g.phi);
      }
      const D = _Dw.copy(o.D).applyQuaternion(q);
      this.alt = dist - R;
      this.pgroup.position.copy(D).multiplyScalar(dist); this.pgroup.quaternion.copy(q);
      if (g) this.pgroup.quaternion.multiply(_gTr);
      this.pgroup.visible = !this.inWarp;
      // (skimming in belly first, the burning air rams the belly and the underside of the nose: it glows up from below
      // the windshield and streams back past it)
      if (g) this.plasma.material.uniforms.uV.value.crossVectors(_gF.copy(g.A).applyQuaternion(q), D).multiplyScalar(0.2).add(D).normalize();
      else this.plasma.material.uniforms.uV.value.copy(D);
      // the world turns beneath us; the sun appears to wheel around as we travel along the orbit
      this.planet.rotation.y = nu + t * o.spin;
      // (the cloud rides round with the ground under it: the ship passes over it the way it passes over the ground, the
      // wind carrying it along a touch behind; the high layer drifts on slowly by itself. The angle along the orbit is
      // taken unwrapped, so it never jumps a little once a lap)
      const nuU = nu + TAU * Math.round((E - nu) / TAU);
      this.clouds.rotation.y = nuU * 0.997 + t * o.spin * 0.92; this.cloudU.uCirRot.value = t * o.spin * 0.03;
      this.pdU.crot.value = this.planet.rotation.y - this.clouds.rotation.y;
      this.stepWeather(dt);
      this.sunDir.copy(this.sunAt(nu));
      if (g) this.sunDir.applyQuaternion(_gTr);
      this.sunDir.applyQuaternion(q);
      this.sunCore.position.copy(this.sunDir).multiplyScalar(15000);
      this.stars.rotation.set(0, 0, 0); this.stars.rotateOnAxis(o.N, -nu); if (g) this.stars.quaternion.premultiply(_gTr); this.stars.quaternion.premultiply(q);
      this.atmo.material.uniforms.sunDir.value.copy(this.sunDir);
      if (this.bodyRims) for (const u of this.bodyRims) u.value.copy(this.sunDir);
      // what circles the world, slowly going round it; where they are for the shadows they throw on it, and its on them
      if (this.bodyOrbits) {
        for (const bo of this.bodyOrbits) bo.m.position.copy(bo.base).applyAxisAngle(bo.axis, t * bo.speed);
        // (the stream of rocks: each at its own height on our orbit, round from us by how far it's drifted)
        if (this.speckO && this.speck) {
          const k = this.speckO; if (k.t0 == null) k.t0 = t;
          const P = this.speck.position.copy(o.D).multiplyScalar(-k.r).applyAxisAngle(k.N, k.a0 + (t - k.t0) * k.w);
          // (in the world's shadow it's only its lights)
          const W = _gC.copy(P).applyQuaternion(this.pgroup.quaternion), sd = W.dot(this.sunDir);
          this.speckU.uLit.value = sd > 0 ? 1 : sstep(R * 0.98, R * 1.04, W.addScaledVector(this.sunDir, -sd).length());
          this.speckU.uT.value = tNow; this.speckU.uPx.value = 9 * pxRatio();
        }
        if (this.drift) for (const d of this.drift) { d.m.position.copy(o.D).multiplyScalar(-(dOrb + d.dr)).addScaledVector(o.N, d.h).applyAxisAngle(o.N, d.th0 + t * d.w); d.m.rotateOnAxis(d.ax, d.sp * dt); }
        this.pgroup.updateMatrixWorld(true);
        this.planet.getWorldPosition(_occ); this.occU.value.set(_occ.x, _occ.y, _occ.z, R);
        // (each moon's shadows reckoned from where it really is: just where we see it, but out along our line of sight
        // to it as far as its orbit takes it from the world)
        for (const m of this.casters) {
          const L = m.userData.lift.value, k = m.userData.real; L.x = L.y = L.z = 0; if (!k) continue;
          m.getWorldPosition(_lf); _lu.copy(_lf).sub(_camP).normalize(); _lc.copy(_camP).sub(_occ);
          const b = _lu.dot(_lc), h = b * b - _lc.lengthSq() + k * k; if (h < 0) continue;
          _lu.multiplyScalar(Math.sqrt(h) - b).add(_camP).sub(_lf); L.x = _lu.x; L.y = _lu.y; L.z = _lu.z;
        }
        const C = this.pdU.cast.value;
        for (let i = 0; i < 3; i++) { const m = this.casters[i]; if (m) { m.getWorldPosition(_occ); C[i].set(_occ.x, _occ.y, _occ.z, m.scale.x); } else C[i].set(0, 0, 0, 0); }
      }
      // the rings, where they are now: round the world they belong to, and hidden and shaded by everything else out here
      // (the moon or rock we're circling among them)
      {
        const rp = this.ringPlanet, U = this.ringU;
        this.ringSky.visible = !!rp && !this.inWarp;
        U.uRingR.value.w = rp ? 1 : 0;
        if (rp) {
          this.pgroup.updateMatrixWorld(true);
          rp.getWorldPosition(U.uRingC.value); U.uRingR.value.z = rp === this.planet ? R : rp.scale.x;
          U.uRingN.value.copy(this.ringN0).transformDirection(rp === this.planet ? this.tilt.matrixWorld : this.bodiesG.matrixWorld);
          const occ = U.uRingOcc.value; let n = 0;
          if (rp !== this.planet) { this.planet.getWorldPosition(_occ); occ[n++].set(_occ.x, _occ.y, _occ.z, R); }
          // (a moon drawn in near the world, off where it really is, hides the rings behind it but throws no shadow on
          // them, which it would where it isn't (radius < 0); a rock in its lane in them really is there, and does)
          for (const m of this.casters || []) if (m !== rp && n < 3) { m.getWorldPosition(_occ); occ[n++].set(_occ.x, _occ.y, _occ.z, m.userData.ringRock ? m.scale.x : -m.scale.x); }
          while (n < 3) occ[n++].set(0, 0, 0, 0);
          this.ringSunU.value.copy(this.sunDir);
        }
      }
      this.pdU.sunW.value.copy(this.sunDir);
      // the air shell is seen from outside, or (sinking into it) from within: then its far side is drawn, over
      // everything out there (where the ground cuts the line of sight the shader stops it there). It turns over right
      // at the shell, so it never blinks out on the way in
      this.atmo.updateWorldMatrix(true, false); this.atmo.getWorldPosition(this.atmo.material.uniforms.uC.value);
      { const inAir = this.alt < R * 0.06 + 2; this.atmo.material.side = inAir ? THREE.BackSide : THREE.FrontSide; this.atmo.material.depthTest = !inAir; }
      // the sun as the planet's surface sees it (for where cloud shadows fall)
      this.planet.updateWorldMatrix(false, false); this.pdU.sunObj.value.copy(this.sunDir).applyQuaternion(_pq.setFromRotationMatrix(this.planet.matrixWorld).invert());
      {
        const a = this.airSky.material.uniforms, up = _dh.copy(D).negate();
        const k = sstep(R * 0.06, R * 0.012, this.alt) * sstep(-0.25, 0.35, up.dot(this.sunDir));
        a.uK.value = k; a.uUp.value.copy(up); a.uTint.value.copy(this.atmo.material.uniforms.tint.value);
        this.airSky.visible = k > 0.002 && !this.inWarp && !this.airless;
        this.pdU.haze.value = this.airless ? 0 : sstep(R * 0.45, R * 0.02, this.alt) * 0.8;
      }
      // eclipse when the sun slips behind the planet's disc
      const angR = Math.asin(Math.min(0.999, R * 1.02 / dist)), ang = Math.acos(clamp(this.sunDir.dot(D), -1, 1));
      let vis = sstep(angR - 0.015, angR + 0.05, ang) * (this.inWarp ? 0 : 1);
      // (and while a moon or rock crosses the sun's face: the glare and the light through the windows dim with it)
      if (this.casters) for (const m of this.casters) {
        m.getWorldPosition(_occ).sub(_camP); const dd = _occ.length(), am = Math.asin(Math.min(0.999, m.scale.x / dd));
        vis *= sstep(am - 0.004, am + 0.015, Math.acos(clamp(this.sunDir.dot(_occ.divideScalar(dd)), -1, 1)));
      }
      // (and while it's behind the rings from here, as much of it as comes through them)
      if (this.ringSky.visible) vis *= Rings.through(this.ringU, _camP, this.sunDir);
      this.sunCore.material.opacity = vis;
      return { dir: this.sunDir, vis, dist };
    }
    // ---------- screens ----------
    drawTerminal(lines) {
      const [c, g] = this.termCanvas;
      g.fillStyle = '#031006'; g.fillRect(0, 0, 256, 160);
      g.fillStyle = '#5dff7a'; g.font = '16px "Share Tech Mono", monospace';
      (lines || ['MERCY OS  v2.31', '----------------', 'TERMINAL READY', '', '> _']).forEach((l, i) => g.fillText(l, 12, 26 + i * 22));
      for (let y = 0; y < 160; y += 3) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y, 256, 1); }
      this.termTex.needsUpdate = true;
    }
    drawMonitor(run) {
      const [c, g] = this.monCanvas;
      g.fillStyle = '#0d0703'; g.fillRect(0, 0, 512, 224);
      g.fillStyle = '#f2a65a'; g.textBaseline = 'top';
      g.font = '30px "VT323", monospace'; g.fillText('PROFIT QUOTA', 20, 14);
      g.font = '62px "VT323", monospace'; g.fillText('$' + run.sold + ' / $' + run.quota, 20, 46);
      g.font = '30px "VT323", monospace';
      g.fillText(run.daysLeft > 0 ? 'DEADLINE: ' + run.daysLeft + (run.daysLeft === 1 ? ' DAY' : ' DAYS') : 'DEADLINE: TODAY - SELL & SUBMIT', 20, 118);
      g.fillText('CREDITS: $' + run.credits, 20, 152);
      g.fillStyle = '#7a4a20'; g.fillText('CYCLE ' + run.cycle, 400, 152);
      for (let y = 0; y < 224; y += 3) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y, 512, 1); }
      this.monTex.needsUpdate = true;
    }
    drawScreens(t, status) {
      for (const s of this.screens) {
        const [c, g] = s.cv;
        g.fillStyle = '#020a05'; g.fillRect(0, 0, 256, 160);
        if (s.kind === 0) {
          g.strokeStyle = 'rgba(80,255,130,.5)'; g.lineWidth = 1;
          g.beginPath(); g.arc(128, 84, 48, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(128, 84, 70, 26, -0.3, 0, TAU); g.stroke();
          const a = t * 0.4; g.fillStyle = '#9dffb0'; g.beginPath(); g.arc(128 + Math.cos(a) * 70 * Math.cos(-0.3) - Math.sin(a) * 26 * Math.sin(-0.3), 84 + Math.cos(a) * 70 * Math.sin(-0.3) + Math.sin(a) * 26 * Math.cos(-0.3), 4, 0, TAU); g.fill();
          g.font = '15px "Share Tech Mono", monospace'; g.fillText('NAV // ' + status, 10, 18);
        } else if (s.kind === 1) {
          g.font = '15px "Share Tech Mono", monospace'; g.fillStyle = '#ffb060'; g.fillText('SHIP STATUS', 10, 18);
          const rows = [['HULL', 0.82], ['FUEL', 0.41 + Math.sin(t * 0.1) * 0.01], ['O2', 0.97], ['PWR', 0.66 + Math.sin(t * 2.3) * 0.03]];
          rows.forEach(([n, v], i) => { g.fillStyle = '#ffb060'; g.fillText(n, 10, 48 + i * 26); g.fillStyle = 'rgba(255,176,96,.25)'; g.fillRect(70, 38 + i * 26, 170, 12); g.fillStyle = v < 0.5 ? '#ff5040' : '#ffb060'; g.fillRect(70, 38 + i * 26, 170 * v, 12); });
        } else {
          g.font = '14px "Share Tech Mono", monospace'; g.fillStyle = '#7dff9a';
          for (let i = 0; i < 8; i++) { const r = new RNG(Math.floor(t * 3) * 13 + i); g.fillText(r.int(1000, 9999) + ' ' + r.int(10, 99) + '.' + r.int(0, 9) + ' ' + ['OK', 'OK', 'OK', 'WARN', 'OK'][r.int(0, 4)], 10, 20 + i * 18); }
        }
        for (let y = 0; y < 160; y += 3) { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, y, 256, 1); }
        s.tex.needsUpdate = true;
      }
    }
    // ---------- queries ----------
    setDoor(open) { this.door.open = open; }
    inside(x, y, z) {
      if (y < -1.5 || y > H + 0.5) return false;
      if (x > -7.05 && x < 3.6 && Math.abs(z) < 4) return true;
      return x >= 3.6 && x < 8.15 && Math.abs(z) < halfAt(x);
    }
    // the deck (and the hatch's sill out to the skin)
    onFootprint(x, z) { return (x > -7.4 && x < 3.7 && Math.abs(z) < 4.3) || (x >= 3.7 && x < 8.45 && Math.abs(z) < halfAt(x) + 0.12) || (x > DOOR.x0 && x < DOOR.x1 && z >= 4.3 && z < RAMP.z0); }
    rampAt(x, z) { const run = RAMP.len * Math.cos(RAMP.ang); return x > DOOR.x0 && x < DOOR.x1 && z >= RAMP.z0 && z < RAMP.z0 + run ? RAMP.y0 - (z - RAMP.z0) * Math.tan(RAMP.ang) : null; }
    collide(p, rad) {
      let hit = false;
      if (p.x < -19 || p.x > 13 || Math.abs(p.z) > 6) return false;
      for (const c of this.cols) {
        // an open hatch in flight is a window, not a way out
        if (c.tag === 'door' && this.door.t > 0.6 && !this.airborne) continue;
        if (c.tag === 'idoor' && this.idoor.t > 0.6) continue;
        if (c.tag === 'rover' && !Rover.owned) continue;
        if (circleBox(p, rad, c.x0, c.x1, c.z0, c.z1)) hit = true;
      }
      for (const o of this.obbs) if (obbCollide(p, rad, o)) hit = true;
      return hit;
    }
    update(dt, time, mode) {
      // (the air going past the glass, in the ship's own frame, for the rain on it: how fast the ship is moving)
      if (this.glassU) {
        const U = this.glassU, M = this.group.matrixWorld; U.uGlassInv.value.copy(M).invert(); U.uRainT.value = time;
        _rw.setFromMatrixPosition(M);
        if (this.rwPrev && dt > 0) { _rv.copy(this.rwPrev).sub(_rw).divideScalar(dt); if (_rv.lengthSq() > 250 * 250) _rv.set(0, 0, 0); _rv.applyQuaternion(_rq.setFromRotationMatrix(M).invert()); U.uRainV.value.lerp(_rv, 1 - Math.exp(-4 * dt)); }
        (this.rwPrev || (this.rwPrev = V())).copy(_rw);
      }
      // (the cabin's small things only while you're aboard or near enough outside to see in)
      if (this.cabinBits) { const e = this.group.worldToLocal(_eye.copy(R.camera.position)), dx = Math.max(0, -7.4 - e.x, e.x - 8.2), dz = Math.max(0, Math.abs(e.z) - 4.3); this.cabinBits.visible = Math.hypot(dx, dz) < 9 && e.y > -6 && e.y < 14; }
      // the bay clock: site time down there, the ship's own (the real time) up here
      if (this.clock) {
        const sm = this.clockMinutes ? this.clockMinutes() : null, d = new Date();
        const m = sm == null ? d.getHours() * 60 + d.getMinutes() : Math.floor(sm);
        if (m !== this.clock.min) { this.clock.min = m; this.drawClock(m); }
      }
      const tgt = this.door.open ? 1 : 0;
      this.door.t = damp(this.door.t, tgt, 3.2, dt);
      if (Math.abs(this.door.t - tgt) < 0.003) this.door.t = tgt;
      this.doorMesh.position.x = (SHIP.doorX0 + SHIP.doorX1) / 2 + sstep(0, 1, this.door.t) * (SHIP.doorX1 - SHIP.doorX0 + 0.12);
      // the inner door's halves part; its lamp shows whether the lock is safe to go through
      const it = this.idoor.open ? 1 : 0;
      this.idoor.t = damp(this.idoor.t, it, 3.6, dt); if (Math.abs(this.idoor.t - it) < 0.003) this.idoor.t = it;
      const hw = (AIRLOCK.ix1 - AIRLOCK.ix0) / 2;
      for (const L of this.idoorLeaves) L.g.position.x = L.x0 + L.s * hw * sstep(0, 1, this.idoor.t);
      // blast shutters: they slam down fast (speeding up as they fall, seating with a bang) and grind back up slowly
      {
        const st = this.shut;
        if (st.t !== st.target) {
          const was = st.t;
          st.t = st.target > st.t ? Math.min(1, st.t + dt / 0.75) : Math.max(0, st.t - dt / 1.5);
          const p = st.target > 0 ? st.t * st.t : sstep(0, 1, st.t);
          for (const r of this.rollers) r(p);
          if (st.t === 1 && was < 1) { SFX.play('clunk', null, { vol: 1.2, pitch: 0.6 }); SFX.play('thud', null, { vol: 0.35 }); }
        }
      }
      const unsafe = this.lockCycling || (this.door.t > 0.02 && mode !== 'site' && mode !== 'leaving');
      this.airLampMat.emissive.setHex(unsafe ? 0xff2a14 : 0x30ff60); this.airLampMat.emissiveIntensity = unsafe ? 0.45 + 0.35 * (Math.sin(time * 6) > 0 ? 1 : 0) : 0.5;
      this.leverT = damp(this.leverT, 0, 3, dt);
      this.lever.rotation.z = 0.45 - this.leverT * 0.9;
      if (this.jumpLever) { this.jumpT = damp(this.jumpT, 0, 3, dt); this.jumpLever.rotation.z = 0.45 - this.jumpT * 0.9; }
      for (const b of this.blinkers) {
        const on = !b.blink || ((time + b.phase) % 1.6) < 0.12;
        b.m.material.color.copy(b.color).multiplyScalar(on ? 1 : 0.15); b.sp.material.opacity = on ? 0.85 : 0;
      }
      const spin = this.beaconOn;
      this.beacon.group.rotation.y += dt * (spin ? 9 : 0);
      this.beacon.mat.color.set(spin ? (Math.sin(time * 9) > 0 ? 0xffa020 : 0x553300) : 0x331a00);
      // the charging station: its readout, and its lamps (one green while it waits; chasing while it charges; all lit full)
      if (this.chg) {
        const c = this.chg;
        if (c.t != null) { c.t += dt; if (c.t > 4.6) c.t = null; }
        const s = c.t == null ? -1 : Math.floor(c.t * 8);
        if (s !== c.last) {
          c.last = s; this.drawCharger(c.t);
          c.lamps.forEach((m, i) => m.color.setHex(c.t == null ? (i === 0 ? 0x2a9a3a : 0x0c140c) : c.t >= 2.4 ? 0x3aff5a : (s % 6) >= i + 1 ? 0xffb020 : 0x1a1408));
        }
      }
      this.screenT -= dt;
      if (this.screenT <= 0) { this.screenT = 0.25; this.drawScreens(time, mode === 'orbit' ? 'IN ORBIT' : this.airborne ? 'IN FLIGHT' : mode === 'site' ? 'LANDED' : 'TRANSIT'); }
      // gear and ramp run on hydraulics: they whine while they move and clunk home
      const gearWas = this.gearT, rampWas = this.rampT;
      this.gearT = clamp(this.gearT + Math.sign(this.gearTarget - this.gearT) * dt / 2.2, Math.min(this.gearT, this.gearTarget), Math.max(this.gearT, this.gearTarget));
      this.rampT = clamp(this.rampT + Math.sign(this.rampTarget - this.rampT) * dt / 1.4, Math.min(this.rampT, this.rampTarget), Math.max(this.rampT, this.rampTarget));
      const gm = this.gearT !== gearWas, rm = this.rampT !== rampWas;
      if (gm || rm) this.poseGear();
      if (gm && !this.gearMoving) SFX.play('servo', new THREE.Vector3(-2, -0.3, 0), { dur: 2.2, vol: 0.7 });
      if (!gm && this.gearMoving) SFX.play('clunk', new THREE.Vector3(-2, -0.3, 0), { vol: 0.8 });
      if (rm && !this.rampMoving) SFX.play('servo', new THREE.Vector3(-2.5, -0.2, 4.4), { dur: 1.4, vol: 0.9, pitch: 1.3 });
      if (!rm && this.rampMoving) SFX.play('clunk', new THREE.Vector3(-2.5, -0.2, 4.4), { vol: 0.7, pitch: 1.3 });
      this.gearMoving = gm; this.rampMoving = rm;
      // the jets' flicker, and the light they throw
      this.liftMat.uniforms.uT.value = time; this.mainMat.uniforms.uT.value = time;
      this.thrustLight.intensity = this.lift * 900 * (0.85 + Math.random() * 0.3);
    }
    pullLever() { this.leverT = 1; }
    pullJump() { this.jumpT = 1; }
    // the jump lever's lamp: lit green while a course is plotted
    setCourse(on) { if (this.jumpLamp) this.jumpLamp.color.set(on ? 0x46ffa8 : 0x0c2a1c); }
    setFlood(on) { this.flood.intensity = on ? 900 : 0; this.floodLens.material.color.set(on ? 0xfff6e0 : 0x222222); }
    setEngines(f) { for (const gl of this.engineGlows) gl.material.color.setRGB(0.2 + f * 0.8, 0.07 + f * 0.4, 0.03 + f * 0.1); }
  }
  return ShipObj;
})();
