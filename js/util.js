'use strict';
// ---------- math helpers ----------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// ---------- seeded RNG (mulberry32) ----------
class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  weighted(obj) {
    let total = 0; for (const k in obj) total += obj[k];
    let r = this.next() * total;
    for (const k in obj) { r -= obj[k]; if (r <= 0) return k; }
    return Object.keys(obj)[0];
  }
}
const randSeed = () => (Math.random() * 4294967296) >>> 0;
const R0 = new RNG(randSeed()); // unseeded, cosmetic randomness

// ---------- 2D gradient noise ----------
class Noise2D {
  constructor(seed) {
    const r = new RNG(seed);
    const perm = []; for (let i = 0; i < 256; i++) perm.push(i);
    r.shuffle(perm);
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static grad(h, x, y) {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  }
  noise(x, y) {
    const p = this.p;
    let X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y; X &= 255; Y &= 255;
    const u = Noise2D.fade(x), v = Noise2D.fade(y);
    const a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(
      lerp(Noise2D.grad(p[a], x, y), Noise2D.grad(p[b], x - 1, y), u),
      lerp(Noise2D.grad(p[a + 1], x, y - 1), Noise2D.grad(p[b + 1], x - 1, y - 1), u), v) * 0.7;
  }
  fbm(x, y, oct = 4) {
    let a = 0.5, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * this.noise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }
  // (and in 3D, for things drawn round a sphere: a flat noise wrapped round one smears into streaks)
  static grad3(h, x, y, z) { const g = h & 15, u = g < 8 ? x : y, v = g < 4 ? y : g === 12 || g === 14 ? x : z; return (g & 1 ? -u : u) + (g & 2 ? -v : v); }
  noise3(x, y, z) {
    const p = this.p, gr = Noise2D.grad3;
    let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z; X &= 255; Y &= 255; Z &= 255;
    const u = Noise2D.fade(x), v = Noise2D.fade(y), w = Noise2D.fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(
      lerp(lerp(gr(p[AA], x, y, z), gr(p[BA], x - 1, y, z), u), lerp(gr(p[AB], x, y - 1, z), gr(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(gr(p[AA + 1], x, y, z - 1), gr(p[BA + 1], x - 1, y, z - 1), u), lerp(gr(p[AB + 1], x, y - 1, z - 1), gr(p[BB + 1], x - 1, y - 1, z - 1), u), v), w) * 0.7;
  }
  fbm3(x, y, z, oct = 4) {
    let a = 0.5, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * this.noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }
}

// ---------- storage + settings ----------
const Store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
};

const RES_LEVELS = [
  { label: 'RETRO', h: 240 },
  { label: 'LOW', h: 320 },
  { label: 'MEDIUM', h: 420 },
  { label: 'HIGH', h: 560 },
  { label: 'ULTRA', h: 760 },
];

// a phone or tablet: a finger is the main pointer and there are touch points
const TOUCH_DEVICE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
const Settings = {
  sens: 1, volume: 0.8, fov: 72, res: 2, bright: 1, name: '', suit: 0, voice: false, ptt: false, invertY: false, shadows: true, touch: 0,
  // the air drawn as a real volume (mist, cloud, light shafts): 0 off, 1 low (a lighter version for phones), 2 high;
  // off to start with on a phone
  volumetric: TOUCH_DEVICE ? 0 : 2,
  // voice & mic: which microphone and speakers ('' the default), mic volume, the open-mic threshold (dB), the browser's
  // noise cleanup, and how loud everyone else's voices are
  micId: '', outId: '', micVol: 1, micGate: -40, micClean: true, voiceVol: 1,
  KEYS: ['sens', 'volume', 'fov', 'res', 'bright', 'name', 'suit', 'voice', 'ptt', 'invertY', 'shadows', 'volumetric', 'touch', 'micId', 'outId', 'micVol', 'micGate', 'micClean', 'voiceVol'],
  load() {
    const o = Store.get('gs_settings', null);
    // first time on a phone: a lighter picture to start with (it can be turned up in the settings)
    if (!o && TOUCH_DEVICE) { this.res = 1; this.shadows = false; this.fov = 78; }
    if (o) for (const k of this.KEYS) if (o[k] !== undefined) this[k] = o[k];
    // (saved as on/off before it had a low setting)
    if (typeof this.volumetric === 'boolean') this.volumetric = this.volumetric ? 2 : 0;
  },
  save() { const o = {}; for (const k of this.KEYS) o[k] = this[k]; Store.set('gs_settings', o); },
};

// ---------- misc ----------
const fmtTime = (mins) => {
  const h24 = Math.floor(mins / 60) % 24, m = Math.floor(mins % 60);
  const h12 = ((h24 + 11) % 12) + 1;
  return h12 + ':' + String(m).padStart(2, '0') + (h24 < 12 ? ' AM' : ' PM');
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

// Geometry helper: merge a list of geometries (with optional per-entry matrix) into one non-indexed geometry.
function mergeGeoList(list) {
  const geos = [];
  for (const g of list) {
    let geo = g.geo || g;
    geo = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g.matrix) geo.applyMatrix4(g.matrix);
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    geos.push(geo);
  }
  if (!geos.length) return null;
  return BufferGeometryUtils.mergeGeometries(geos, false);
}

const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _e4 = new THREE.Euler(), _s4 = new THREE.Vector3(), _p4 = new THREE.Vector3();
function mat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e4.set(rx, ry, rz, 'YXZ');
  _q4.setFromEuler(_e4);
  _p4.set(x, y, z); _s4.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p4, _q4, _s4);
}
// A menu, pause screen or report taller than the screen it's on (a phone on its side, say) first splits into two
// columns side by side, and if that's still too tall, shrinks until it fits: nobody has to scroll to reach START.
// room: the height it has (px).
function fitToScreen(el, room) {
  if (!el || !el.isConnected || !el.getClientRects().length) return;
  el.classList.remove('cols'); el.style.zoom = ''; el.style.maxHeight = ''; el.style.overflowY = '';
  if (el.scrollHeight <= room) return;
  if (innerWidth > 560 && el.children.length > 2) el.classList.add('cols');
  const h = el.scrollHeight; if (h <= room) return;
  const z = Math.max(0.6, room / h);
  el.style.zoom = z.toFixed(3);
  // (past the smallest it should go, what's left scrolls)
  if (h * z > room + 1) { el.style.maxHeight = (room / z) + 'px'; el.style.overflowY = 'auto'; }
}
