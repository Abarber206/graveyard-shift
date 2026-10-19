'use strict';
// Fully procedural audio: every sound in the game is made here, from physical models (see 'the physical models').
const SFX = (() => {
  let ctx = null, master, comp, muffle, sfxBus, ambBus, revIn, noiseBuf, brownBuf, ready = false;
  let envRev = 0.25, occlusionFn = null;
  const loops = {};
  const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _lq = new THREE.Quaternion();

  function makeNoise(sec) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function makeBrown(sec) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    return b;
  }
  function makeIR(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 200 ? i / 200 : 1);
    }
    return b;
  }
  // a room: dense metallic early reflections that die fast (the ship's cabin)
  function makeRoomIR(sec) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec), b = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4) * 0.5;
      for (let k = 0; k < 14; k++) { const at = Math.floor(sr * (0.004 + Math.random() * 0.05)); if (at < len) d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.9 - k * 0.05); }
    }
    return b;
  }
  // open country: a soft diffuse tail plus a few late slap-backs off distant terrain and trees
  function makeOpenIR(sec) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec), b = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.25; d[i] = lp * Math.pow(1 - i / len, 3.2) * (i < sr * 0.02 ? i / (sr * 0.02) : 1) * 0.8; }
      for (let k = 0; k < 4; k++) {
        const at = Math.floor(sr * (0.14 + k * 0.11 + Math.random() * 0.08)), amp = 0.35 / (k + 1);
        for (let j = 0; j < sr * 0.03 && at + j < len; j++) d[at + j] += (Math.random() * 2 - 1) * amp * (1 - j / (sr * 0.03));
      }
    }
    return b;
  }
  const curves = {};
  function distCurve(k) {
    if (curves[k]) return curves[k];
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x)); }
    return (curves[k] = c);
  }

  // ---------- live primitives ----------
  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
  }
  // noise through a filter: air, hiss, rustle, rush (and, through a very narrow band, the whistle of air through a gap)
  function nz(d, t, dur, vol, type = 'bandpass', f0 = 1000, f1 = null, q = 1, a = 0.003, buf = null) {
    const s = ctx.createBufferSource(); s.buffer = buf || noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = ctx.createGain(); env(g, t, a, vol, dur);
    // Air, never static: noise with nothing to stop its top end (a high-passed hiss above all) is the fizz of a dead
    // channel, so the top is rolled off (a hiss above six to nine kilohertz, anything else above eleven); and anything
    // that lasts a while rushes and wavers as moving air does, instead of holding dead steady
    const top = ctx.createBiquadFilter(); top.type = 'lowpass'; top.Q.value = 0.5;
    top.frequency.value = type === 'highpass' ? clamp(Math.max(f0, f1 || 0) * 2.2, 6000, 9000) : 11000;
    s.connect(f); f.connect(top); top.connect(g);
    if (dur > 0.25) {
      const m = ctx.createGain(), n = Math.max(4, Math.ceil(dur * 30)), c = new Float32Array(n); let v = 1, w = 1;
      for (let i = 0; i < n; i++) { w += (0.55 + Math.random() * 0.45 - w) * 0.35; v += (w - v) * 0.5; c[i] = v; }
      m.gain.setValueCurveAtTime(c, t, dur + 0.04); g.connect(m); m.connect(d);
    } else g.connect(d);
    s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
    return f;
  }
  function shaper(d, k) { const w = ctx.createWaveShaper(); w.curve = distCurve(k); w.oversample = '2x'; w.connect(d); return w; }
  function filt(d, type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(d); return b; }
  const rnd = (a, b) => a + Math.random() * (b - a);
  // (one recipe sounding another goes through that one's level: LEVEL)
  const lv = (d, k) => { const g = ctx.createGain(); g.gain.value = LEVEL[k] ?? 1; g.connect(d); return g; };
  // a take played into d at t (never quite the same twice: each time a touch higher or lower, harder or softer, the
  // way the real thing would be)
  function smp(d, t, buf, vol = 1, rate = 1) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.05);
    const g = ctx.createGain(); g.gain.value = vol * rnd(0.86, 1); s.connect(g); g.connect(d); s.start(t); return s;
  }

  // ---------- the physical models ----------
  // Nothing here is a bare tone. A struck thing rings in the modes its shape and what it's made of give it (a bar's, a
  // plate's, a bell's, a drum skin's), set going by how hard and how briefly it was hit; a creak is wood or a hinge
  // sticking and slipping; a voice is air puffed through a throat and shaped by a mouth; a fiddle is a string caught and
  // let go by a bow; a horn or a buzzer is an armature slapping a diaphragm; a drip is a bubble ringing. Each is worked
  // out sample by sample into a take, a few takes of each so no two are quite alike, and kept.
  let SR = 48000;
  const nS = (sec) => Math.max(1, Math.ceil(sec * SR)), wn = () => Math.random() * 2 - 1, arr = (sec) => new Float32Array(nS(sec));
  const add = (y, x, at = 0, k = 1) => { const a = Math.round(at * SR); for (let i = Math.max(0, -a); i < x.length && a + i < y.length; i++) y[a + i] += x[i] * k; return y; };
  const norm = (y, k = 1) => { let p = 1e-9; for (let i = 0; i < y.length; i++) p = Math.max(p, Math.abs(y[i])); for (let i = 0; i < y.length; i++) y[i] *= k / p; return y; };
  const fade = (y, e) => { for (let i = 0; i < y.length; i++) y[i] *= e(i / y.length); return y; };
  const noise = (sec) => { const a = arr(sec); for (let i = 0; i < a.length; i++) a[i] = wn(); return a; };
  const ramp = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
  // (a pitch that drifts the way a voice does, never quite steady: a smooth random wander, depth either way)
  const wander = (knots, depth) => { const k = Array.from({ length: knots + 1 }, () => rnd(-depth, depth)); return (u) => { const x = clamp(u, 0, 1) * knots, i = Math.min(knots - 1, Math.floor(x)), f = x - i, s = f * f * (3 - 2 * f); return k[i] + (k[i + 1] - k[i]) * s; }; };
  // a filter run over x in place: lp / hp / bp, at f Hz or f(u) (u the fraction of the way through: retuned as it goes)
  function bq(x, type, f, q = 0.707) {
    let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const set = (fr) => {
      const w = TAU * clamp(fr, 10, SR * 0.45) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), A0 = 1 + al;
      if (type === 'lp') { b1 = (1 - c) / A0; b0 = b2 = b1 / 2; } else if (type === 'hp') { b1 = -(1 + c) / A0; b0 = b2 = -b1 / 2; } else { b0 = al / A0; b1 = 0; b2 = -b0; }
      a1 = -2 * c / A0; a2 = (1 - al) / A0;
    };
    const fn = typeof f === 'function'; set(fn ? f(0) : f);
    for (let i = 0; i < x.length; i++) {
      if (fn && (i & 31) === 0) set(f(i / x.length));
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; x[i] = v;
    }
    return x;
  }
  // a bank of modes ([freq, amp, t60, glide]) rung by the drive x (from sample at on), added into y. Each is a resonance
  // that rings on for t60 seconds once set going; glide: how far it sags in pitch as it rings down (a struck plate or a
  // drum skin, its stretch easing off)
  function modes(y, x, list, at = 0) {
    for (const [f, a, t60, gl] of list) {
      if (!(f > 20 && f < SR * 0.45) || !a) continue;
      const r = Math.exp(-6.91 / (t60 * SR)), r2 = r * r, n = Math.min(y.length - at, Math.ceil(t60 * SR * 1.05) + x.length);
      let w = TAU * f / SR, a1 = 2 * r * Math.cos(w), b = a * Math.sin(w), y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) {
        if (gl && (i & 63) === 0) { w = TAU * f * (1 - gl * Math.min(1, i / (t60 * SR))) / SR; a1 = 2 * r * Math.cos(w); b = a * Math.sin(w); }
        const v = (i < x.length ? x[i] * b : 0) + a1 * y1 - r2 * y2; y2 = y1; y1 = v; y[at + i] += v;
      }
    }
    return y;
  }
  // a blow: contact for tc seconds (hard things meet for an instant and ring everything; soft or heavy ones press for
  // longer and only stir the low modes), with grit in it
  function blow(tc, grit = 0.15) { const n = Math.max(2, Math.round(tc * SR)), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = Math.sin(Math.PI * i / n) * (1 + grit * wn()); return x; }
  // the shapes things ring in: a free bar's modes, a church bell's (hum, prime, tierce, quint, nominal...), a wine
  // glass's, a drum skin's
  const BAR = [1, 2.756, 5.404, 8.933, 13.34, 18.64], BELL = [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166, 5.433, 6.796];
  const GLASS = [1, 2.32, 4.25, 6.63, 9.38], DRUM = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501, 3.6, 4.06];
  // ...and a plate's, panel's or sheet's first n ([ratio, how much it rings], for its aspect asp), struck somewhere
  // along it, so some modes ring out and others hardly at all
  function plate(n, asp = 1.4) {
    const sx = rnd(0.12, 0.88), sy = rnd(0.12, 0.88), L = [];
    for (let m = 1; m < 8; m++) for (let k = 1; k < 8; k++) L.push([(m * m + k * k * asp * asp) / (1 + asp * asp), 0.15 + Math.abs(Math.sin(m * Math.PI * sx) * Math.sin(k * Math.PI * sy))]);
    return L.sort((a, b) => a[0] - b[0]).slice(0, n);
  }
  // something struck: its modes (ratios over its lowest, f0; or [ratio, amp]), how long the lowest rings (T; hf: how
  // much sooner the high ones die, the material's damping), the blow (tc, grit), tilt (how much weaker the high modes
  // start), glide, and click (the dry tick of the contact itself)
  function struck(o) {
    const y = arr(o.len || o.T * 1.1 + o.tc + 0.03), x = blow(o.tc, o.grit);
    modes(y, x, o.modes.map((m) => {
      const [r, a] = Array.isArray(m) ? m : [m, 1], f = o.f0 * r * (1 + wn() * (o.spread ?? 0.012));
      return [f, a * rnd(0.6, 1.4) / Math.pow(r, o.tilt ?? 0.6), o.T / (1 + (o.hf ?? 1) * f / 1000), o.glide || 0];
    }));
    norm(y);
    if (o.click) { const c = fade(noise(0.003), (u) => (1 - u) * (1 - u)); add(y, norm(bq(c, 'hp', 2500)), 0, o.click); }
    return norm(y);
  }
  // grit: n tiny ticks scattered over dur (gravel underfoot, chitin, crumbs), each ringing at somewhere in f0..f1
  function grains(dur, n, f0, f1, T = 0.004) {
    const y = arr(dur + 0.03);
    for (let i = 0; i < n; i++) { const f = rnd(f0, f1); modes(y, blow(rnd(0.00005, 0.0002), 0.6), [[f, rnd(0.3, 1), T * rnd(0.6, 1.4)], [f * rnd(1.4, 2.6), rnd(0.1, 0.5), T * 0.6]], Math.round(Math.pow(Math.random(), 1.3) * dur * SR)); }
    return norm(y);
  }
  // stick and slip: something dragged against something else (a hinge, a trunk flexing, a hull settling) catching and
  // letting go f(u) times a second, never quite evenly (jit), each slip ringing what it's part of (modes)
  function fric(dur, f, amp, list, jit = 0.25) {
    const N = nS(dur), x = new Float32Array(N);
    for (let n = 0; n < N;) { const u = n / N, T = SR / (f(u) * (1 + wn() * jit)); x[n] = amp(u) * (0.5 + Math.random()); n += Math.max(1, Math.round(T)); }
    return norm(modes(new Float32Array(N + nS(0.3)), x, list));
  }
  // a voice: air puffed through a throat f(u) times a second (each puff a little early or late: jit; louder or softer:
  // shim; every other weaker by sub, for a rough, split voice; open: the longest it stays open; breath hissing through
  // it), then shaped by the mouth, its resonances [freq or freq(u), q, gain] moving as it does; amp(u) how loud; air:
  // breath on its own; clip: a throat strained past what it can do
  function voice(dur, f, o) {
    const N = nS(dur), s = new Float32Array(N);
    for (let n = 0, k = 0; n < N; k++) {
      const u = n / N, T = SR / (f(u) * (1 + wn() * (o.jit || 0.01))), a = o.amp(u) * (1 + wn() * (o.shim || 0.05)) * (k % 2 ? 1 - (o.sub || 0) : 1);
      const Tp = Math.min(0.4 * T, (o.open || 1) * SR), Tn = Tp * 0.4; let prev = 0;
      for (let i = 0; i < T && n + i < N; i++) {
        const g = i < Tp ? 0.5 * (1 - Math.cos(Math.PI * i / Tp)) : i < Tp + Tn ? Math.cos(Math.PI * (i - Tp) / (2 * Tn)) : 0;
        s[n + i] = a * ((g - prev) * Tp * 0.5 + g * wn() * (o.breath || 0)); prev = g;
      }
      n += Math.max(1, Math.round(T));
    }
    if (o.air) for (let i = 0; i < N; i++) s[i] += wn() * o.air * o.amp(i / N);
    const y = new Float32Array(N);
    for (const [fr, q, g] of o.mouth) add(y, bq(Float32Array.from(s), 'bp', fr, q), 0, g);
    if (o.clip) { norm(y); for (let i = 0; i < N; i++) y[i] = Math.tanh(y[i] * o.clip); }
    return norm(y);
  }
  // someone talking, too far off or too faint to make out: their pitch rising and falling, the mouth going from vowel to
  // vowel a syllable at a time, now and then a pause
  function talk(dur, f0 = rnd(100, 135)) {
    const V = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [640, 1190], [490, 1350], [660, 1720]], syl = [];
    for (let a = 0; a < dur;) { const L = rnd(0.08, 0.17); syl.push({ a, L, v: V[(Math.random() * V.length) | 0], k: Math.random() < 0.15 ? 0 : rnd(0.6, 1) }); a += L; }
    const at = (u) => { const s = u * dur; for (const q of syl) if (s < q.a + q.L) return q; return syl[syl.length - 1]; }, dr = wander(5, 0.12);
    return voice(dur, (u) => f0 * (1 + dr(u)), { jit: 0.01, shim: 0.1, breath: 0.2, air: 0.03, amp: (u) => { const q = at(u); return q.k * Math.sqrt(Math.sin(Math.PI * clamp((u * dur - q.a) / q.L, 0, 1))); },
      mouth: [[(u) => at(u).v[0], 5, 1], [(u) => at(u).v[1], 7, 0.6], [2500, 8, 0.2]] });
  }
  // a growl: a slack, low throat rattling (its pulses ragged, every other one weak), shaken by the folds fluttering
  // above it flut times a second, through a near-closed mouth
  function growl(dur, f0, flut, mouth, o = {}) {
    const fl = rnd(0.85, 1.15) * flut, dr = wander(6, 0.08);
    return voice(dur, (u) => f0 * (1 + dr(u)) * (1 + 0.12 * Math.sin(TAU * fl * u * dur)), Object.assign({ jit: 0.15, shim: 0.5, sub: 0.5, breath: 0.6, open: 0.006, air: 0.08,
      amp: (u) => Math.min(1, u * 5) * Math.min(1, (1 - u) * 4) * (0.75 + 0.25 * Math.sin(TAU * fl * u * dur)), mouth }, o));
  }
  // an armature slapping a diaphragm f(u) times a second (a klaxon, a horn, a ballast, a transformer's core, a motor's
  // gears, a fan's blades shoving the air), each slap ringing what it's mounted in (modes); amp(u) how hard; duty how
  // long each slap lasts, of its cycle; clip: the diaphragm hitting its stops
  function buzz(dur, f, amp, list, o = {}) {
    const N = nS(dur), x = new Float32Array(N);
    for (let n = 0; n < N;) {
      const u = n / N, T = SR / (f(u) * (1 + wn() * (o.jit ?? 0.003))), w = Math.max(2, Math.round(T * (o.duty ?? 0.15))), a = amp(u) * (1 + wn() * (o.shim ?? 0.05));
      for (let i = 0; i < w && n + i < N; i++) x[n + i] += a * Math.sin(Math.PI * i / w);
      n += Math.max(1, Math.round(T));
    }
    const y = modes(new Float32Array(N + nS(0.1)), x, list);
    if (o.clip) { norm(y); for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i] * o.clip); }
    return norm(y);
  }
  // a piezo buzzer: the little disc pushed and pulled f(u) times a second, stiff below its resonance and ringing at it
  function piezo(dur, f) {
    const N = nS(dur), x = new Float32Array(N); let ph = 0;
    for (let i = 0; i < N; i++) { ph += f(i / N) / SR; x[i] = (ph % 1 < 0.5 ? 1 : -1) * Math.min(1, i / (SR * 0.003)) * Math.min(1, (N - i) / (SR * 0.004)); }
    const y = bq(Float32Array.from(x), 'lp', 3100, 5); add(y, bq(x, 'bp', 5900, 8), 0, 0.3);
    return norm(bq(y, 'hp', 350));
  }
  // a bubble (Minnaert's): r mm across, it rings at about 3.3/r kHz, rising in pitch as it nears the surface, and dies
  // fast (a drip into a puddle, a gurgle, a glug)
  function bubble(y, at, r, k = 1) {
    const f0 = 3260 / r, d = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5), n = Math.min(y.length - at, Math.ceil(6 / d * SR)); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * f0 * (1 + 0.1 * d * t) / SR; y[at + i] += k * Math.sin(ph) * Math.exp(-d * t) * Math.min(1, i / 24); }
    return y;
  }
  // a bowed string (Smith and Cook's model, as in the STK): the bow drags the string along with it until it slips (the
  // grip falling away as it slides faster), the kink running to the bridge and the nut and back; f(u) the note, bow(u)
  // how fast the bow moves (its sign which way), beta how near the bridge it's bowed (near: glassy and scratchy), press
  // how lightly (lower bites harder), rosin the grain of the hair; then the wooden body it's all strung on
  const BODY = [[1, 1.5667, 0.3133, -0.5509, -0.3925], [1, -1.9537, 0.9542, -1.6357, 0.8697], [1, -1.6683, 0.8852, -1.7674, 0.8735], [1, -1.8585, 0.9653, -1.8498, 0.9516], [1, -1.9299, 0.9621, -1.9354, 0.959], [1, -1.98, 0.9888, -1.9867, 0.9923]];
  // (played a stretch at a time: run(n) works out the next n samples into y, so a long one can be spread over several
  // moments in the background; bowed() plays it straight through)
  function bowing(dur, f, bow, o = {}) {
    const sr = SR, N = nS(dur), y = new Float32Array(N), M = Math.ceil(sr / 28) + 4, nut = new Float32Array(M), br = new Float32Array(M);
    const p = 0.75 - 0.2 * 22050 / sr, slope = o.press ?? 3, beta = o.beta ?? 0.127, ros = o.rosin ?? 0.03, z = BODY.map(() => [0, 0, 0, 0]);
    const tap = (b, w, d) => { let q = w - d; while (q < 0) q += M; const i = q | 0, fr = q - i; return b[i] * (1 - fr) + b[(i + 1) % M] * fr; };
    let w = 0, lp = 0, i = 0;
    return { y, done: () => i >= N, run(n) {
      for (const end = Math.min(N, i + n); i < end; i++) {
        const u = i / N, L = sr / f(u) - 4, bo = tap(br, w, Math.max(1, L * beta)), no = tap(nut, w, Math.max(1, L * (1 - beta)));
        lp = 0.95 * (1 - p) * bo + p * lp;
        const bR = -lp, nR = -no, dv = bow(u) * (1 + ros * wn()) - (bR + nR);
        const g = Math.min(0.98, Math.max(0.01, Math.pow(Math.abs(dv * slope) + 0.75, -4))), nv = dv * g;
        nut[w] = bR + nv; br[w] = nR + nv; w = (w + 1) % M;
        let v = bo;
        for (let k = 0; k < BODY.length; k++) { const c = BODY[k], q = z[k], out = c[0] * v + c[1] * q[0] + c[2] * q[1] - c[3] * q[2] - c[4] * q[3]; q[1] = q[0]; q[0] = v; q[3] = q[2]; q[2] = out; v = out; }
        y[i] = v;
      }
      return this;
    } };
  }
  const bowed = (dur, f, bow, o) => bowing(dur, f, bow, o).run(Infinity).y;
  // a section of strings, a player to each note: dug in hard (bow(u), the same for all) and left to ring, each a little
  // out of tune and time with the rest, sliding by slide over it, with a slow vibrato. section() gives its players (each
  // a bowing; at: how late it comes in), strings() plays them all at once
  const section = (notes, o) => notes.map((f0) => (dur) => {
    const ph = rnd(0, TAU), vr = rnd(4.8, 6.4), det = 1 + wn() * 0.005, k = rnd(0.85, 1.15);
    return Object.assign(bowing(dur, (u) => f0 * det * (1 + 0.006 * Math.sin(TAU * vr * u * dur + ph)) * (1 + (o.slide || 0) * u), (u) => o.bow(u) * k, { beta: (o.beta || 0.08) * rnd(0.85, 1.15), press: o.press || 3, rosin: 0.05 }), { at: rnd(0, 0.025) });
  });
  function strings(dur, notes, o) { const y = arr(dur); for (const pl of section(notes, o)) { const b = pl(dur).run(Infinity); add(y, b.y, b.at); } return y; }
  // the stingers' sections: a sour cluster from the cellos up, the bows biting hard then left to ring; and violins
  // screeching up near the bridge, sliding sharp
  const STING = { dur: 2.8, sr: 32000, notes: [1, 1.059, 1.414, 1.498, 2.12, 2.83, 4.24].map((r) => 98 * r), o: { bow: (u) => 0.26 * Math.exp(-u * 4.5) * Math.min(1, u * 150), beta: 0.06, press: 1.8, slide: -0.04 } };
  const STING_HI = { dur: 1.9, sr: 44100, notes: [1380, 1460, 1550, 1645], o: { bow: (u) => 0.22 * Math.min(1, u * 60) * Math.min(1, (1 - u) * 5), beta: 0.035, press: 2.2, slide: 0.04 } };
  // a big drum: its skin's modes, sagging in pitch as the blow's stretch goes out of them, struck with a soft beater
  const drum = (f0, T) => struck({ modes: DRUM.map((r, i) => [r, [1, 0.6, 0.4, 0.3, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08][i]]), f0, T, hf: 3, tc: 0.006, grit: 0.2, glide: 0.08, tilt: 0.2 });
  // a blast's pressure wave: one huge, low shove (the ground and the air knocked in their lowest modes), then its
  // rumble rolling back off everything round about
  const boom = () => add(struck({ modes: [1, 1.4, 1.9, 2.6, 3.4], f0: rnd(26, 34), T: 1.4, hf: 6, tc: 0.03, grit: 0.3, len: 2.2 }), norm(bq(fade(noise(2.2), (u) => Math.min(1, u * 40) * Math.exp(-u * 4)), 'lp', (u) => 400 * Math.exp(-u * 2.5) + 40, 0.9)), 0, 0.7);
  // a fan: its blades shoving the air bpf times a second, never quite evenly, through the ducts' resonances, with the
  // rush of the air itself
  const fan = (dur, bpf, list) => add(buzz(dur, (u) => bpf * (1 + 0.004 * Math.sin(u * 40)), (u) => 0.8 + 0.2 * Math.sin(u * 23), list, { duty: 0.35, jit: 0.01, shim: 0.15 }), norm(bq(noise(dur + 0.1), 'lp', 300, 0.7)), 0, 0.35);
  // ...made into a seamless loop: the last xf seconds laid in over the first
  function looped(y, xf) {
    const n = nS(xf), N = y.length - n, o = y.slice(0, N);
    for (let i = 0; i < n; i++) { const k = i / n; o[i] = y[N + i] * Math.cos(k * Math.PI / 2) + y[i] * Math.sin(k * Math.PI / 2); }
    return o;
  }
  // the takes: worked out fresh the first n times a sound's wanted (or in the quiet after startup), then one of those.
  // sr: the rate to work it at (low, slow sounds need less)
  // Once it has its n, a sound goes on getting more takes in the background (up to MORE), so that over a night nothing
  // comes round sounding the same twice
  const bank = {}, MORE = 6, more = new Set();
  function toBuf(y) { const b = ctx.createBuffer(1, y.length, SR); b.getChannelData(0).set(norm(y, 0.9)); return b; }
  function take(key, n, make, sr = 32000) {
    const b = bank[key] || (bank[key] = []);
    if (b.length >= n) {
      if (n > 1 && b.length < MORE && !more.has(key)) {
        more.add(key);
        jobs.push(() => { const keep = SR; SR = sr; try { b.push(toBuf(make(b.length))); } finally { SR = keep; more.delete(key); } });
        kick();
      }
      return b[(Math.random() * b.length) | 0];
    }
    const keep = SR; SR = sr;
    try { b.push(toBuf(make(b.length))); } finally { SR = keep; }
    return b[b.length - 1];
  }
  // (some takes several recipes share)
  const bodyThud = () => take('thud_body', 4, () => struck({ modes: [1, 1.5, 2.2, 3.3], f0: rnd(85, 105), T: 0.1, hf: 3, tc: 0.01, grit: 0.5 }));
  const lowThud = () => take('thud_low', 3, () => struck({ modes: [1, 1.5, 2.3], f0: rnd(55, 65), T: 0.25, hf: 3, tc: 0.015, grit: 0.4 }));
  const bassDrum = () => take('bassdrum', 3, () => drum(rnd(50, 58), 1.6), 24000);
  const blast = () => take('boom', 3, boom, 24000);

  // ---------- sound recipes ----------
  const S = {
    // a footstep: the heel, then the rest of the foot rolling down after it, and whatever's underfoot (a deck plate
    // ringing; dirt and grit crunching; concrete's dry scuff)
    step(d, t, o) {
      const surf = o.surf || 'concrete';
      smp(d, t, take('step_' + surf, 6, () => {
        const y = arr(0.3), toe = rnd(0.045, 0.085);
        if (surf === 'metal') {
          for (const [at, k] of [[0, 1], [toe, 0.55]]) add(y, struck({ modes: plate(14, 1.7), f0: rnd(150, 190), T: 0.22, hf: 0.5, tc: 0.0012, grit: 0.4 }), at, k);
          add(y, grains(0.03, 6, 2500, 6000, 0.003), 0, 0.2);
        } else if (surf === 'water') {
          // (wading: the leg pushing through, a slosh, and what it stirs up bubbling to the surface)
          add(y, norm(bq(fade(noise(0.26), (u) => Math.sin(Math.PI * u) ** 0.7 * (1 - u * 0.5)), 'lp', rnd(600, 900), 0.8)), 0, 0.8);
          for (let k = 0; k < 6; k++) bubble(y, nS(rnd(0.03, 0.22)), rnd(1.5, 4.5), rnd(0.15, 0.45));
        } else if (surf === 'dirt') {
          add(y, struck({ modes: [1, 1.8, 2.9], f0: rnd(70, 90), T: 0.06, hf: 3, tc: 0.012, grit: 0.6 }), 0, 0.6);
          add(y, grains(0.12, 70, 900, 4500, 0.003), 0.004, 0.9);
        } else {
          for (const [at, k] of [[0, 1], [toe, 0.5]]) add(y, struck({ modes: [1, 1.7, 2.6, 3.9, 5.1], f0: rnd(85, 110), T: 0.05, hf: 3, tc: 0.004, grit: 0.5, click: 0.25 }), at, k);
          add(y, grains(0.04, 10, 1500, 5000, 0.002), 0.002, 0.25);
        }
        return y;
      }), 1, (o.pitch || 1) * rnd(0.94, 1.06));
    },
    // a body landing hard: the thud of it, the skin slapping
    slap(d, t, o) {
      smp(d, t, take('slap', 4, () => add(struck({ modes: [1, 1.6, 2.3, 3.4], f0: rnd(70, 90), T: 0.12, hf: 2, tc: 0.012, grit: 0.4 }), norm(bq(fade(noise(0.04), (u) => (1 - u) ** 3), 'bp', 1400, 1.5)), 0, 0.4)), 1, (o.pitch || 1) * rnd(0.92, 1.08));
    },
    soft(d, t, o) { const p = (o.pitch || 1) * rnd(0.9, 1.1); nz(d, t, 0.1, 0.25, 'lowpass', 600 * p, 200, 0.7, 0.02); },
    // a switch: the plastic snapping over, and its spring
    click(d, t) {
      smp(d, t, take('click', 4, () => add(add(arr(0.06), struck({ modes: plate(8, 1.2), f0: rnd(1800, 2600), T: 0.025, hf: 0.5, tc: 0.00008, grit: 0.3 })), struck({ modes: plate(8, 1.2), f0: rnd(2200, 3000), T: 0.02, hf: 0.5, tc: 0.00008 }), rnd(0.012, 0.02), 0.45)));
    },
    pickup(d, t) { nz(d, t, 0.12, 0.25, 'bandpass', 2200, 900, 1.5, 0.01); smp(d, t + 0.02, take('grab', 4, () => struck({ modes: [1, 1.9, 3.1], f0: rnd(120, 170), T: 0.06, hf: 3, tc: 0.008, grit: 0.5 })), 0.35); },
    // something dropped: it sounds like what it's made of (o.mat) and how heavy it is (o.w, kg). The floor taking its
    // weight, then the ring or knock or clink of the thing itself, and (if it's hard and not too heavy) a bounce or two
    drop(d, t, o) {
      const w = o.w || 1, m = o.mat || (w > 4 ? 'metal' : 'wood'), hv = clamp(w / 12, 0, 1), cls = hv < 0.15 ? 0 : hv < 0.5 ? 1 : 2;
      smp(d, t, take('drop_' + m + cls, 3, () => {
        const h = [0.08, 0.3, 0.8][cls], y = arr(m === 'metal' || m === 'glass' ? 2 : 1);
        const hit = (at, k) => {
          add(y, struck({ modes: [1, 1.7, 2.6, 3.8], f0: 110 - h * 50, T: 0.08 + h * 0.12, hf: 3, tc: 0.004 + h * 0.01, grit: 0.4 }), at, (0.4 + h * 0.6) * k);
          const M = {
            metal: { modes: plate(18, 1.6), f0: 260 + (1 - h) * 420, T: 0.6 + h * 0.9, hf: 0.25, tc: 0.00025 },
            tin: { modes: plate(14, 1.3), f0: 900, T: 0.35, hf: 0.6, tc: 0.00015, glide: 0.02 },
            glass: { modes: GLASS, f0: 2400 * (1.2 - h * 0.4), T: 0.5, hf: 0.1, tc: 0.00006 },
            porcelain: { modes: [1, 1.62, 2.41, 3.53, 4.7], f0: 1700 * (1.2 - h * 0.4), T: 0.22, hf: 0.4, tc: 0.0001 },
            wood: { modes: plate(12, 2.2), f0: 240 + (1 - h) * 160, T: 0.1, hf: 2.5, tc: 0.0007, grit: 0.3 },
            bone: { modes: BAR, f0: 700, T: 0.06, hf: 2, tc: 0.0003 },
            plastic: { modes: plate(10, 1.3), f0: 520 + (1 - h) * 300, T: 0.05, hf: 2, tc: 0.0005 },
          }[m];
          if (M) add(y, struck(Object.assign({ click: 0.3 }, M)), at, (m === 'wood' || m === 'plastic' || m === 'bone' ? 0.8 : 0.55) * k);
        };
        hit(0, 1);
        if (m !== 'soft' && h < 0.7) { const b1 = 0.09 + rnd(0, 0.06) * (1 - h); hit(b1, 0.35); if (h < 0.3) hit(b1 * 1.7, 0.14); }
        return y;
      }), 0.45 + hv * 0.55, rnd(0.95, 1.05));
    },
    // a door: the latch clacks, the hinges groan as it swings (sticking and slipping, rung through the door's panel)
    door_open(d, t) {
      nz(d, t, 0.03, 0.35, 'highpass', 2500);
      smp(d, t + 0.04, take('hinge', 4, () => { const f0 = rnd(55, 75); return fric(0.85, (u) => f0 * (1 + 0.6 * u + 0.15 * Math.sin(u * 9)), (u) => Math.min(1, u * 6) * (1 - u * 0.4), [[rnd(650, 760), 1, 0.06], [rnd(1350, 1600), 0.6, 0.04], [rnd(2300, 2700), 0.3, 0.03], [rnd(180, 230), 0.5, 0.1]], 0.3); }), 0.5);
    },
    door_close(d, t) { S.door_open(lv(d, 'door_open'), t); smp(d, t + 0.55, take('door_shut', 3, () => struck({ modes: plate(12, 2.4), f0: rnd(85, 105), T: 0.25, hf: 2, tc: 0.003, grit: 0.3, click: 0.3 })), 0.85); nz(d, t + 0.57, 0.03, 0.3, 'highpass', 2500); },
    door_slam(d, t) {
      smp(d, t, take('door_slam', 3, () => add(struck({ modes: plate(16, 2.4), f0: rnd(80, 95), T: 0.45, hf: 1.5, tc: 0.004, grit: 0.4, click: 0.2 }), struck({ modes: [1, 1.62, 2.62], f0: rnd(225, 240), T: 0.8, hf: 0.3, tc: 0.0004 }), 0, 0.25)), 1.1);
      nz(d, t, 0.3, 0.5, 'lowpass', 1200, 150, 0.7);
    },
    swing(d, t) { nz(d, t, 0.25, 0.45, 'bandpass', 300, 1800, 2, 0.08); },
    hit_flesh(d, t) { smp(d, t, bodyThud(), 0.9); nz(d, t, 0.12, 0.6, 'lowpass', 900, 200, 1); nz(d, t + 0.02, 0.2, 0.3, 'bandpass', 500, 300, 3); },
    hit_metal(d, t) { smp(d, t, take('hit_metal', 4, () => struck({ modes: plate(20, 1.5), f0: rnd(290, 330), T: 0.9, hf: 0.25, tc: 0.0002, click: 0.3 })), 0.7); nz(d, t, 0.05, 0.5, 'highpass', 2000); },
    // hurt: the blow landing, and the grunt it knocks out of you
    hurt(d, t) {
      smp(d, t, bodyThud(), 0.9); nz(d, t, 0.2, 0.5, 'lowpass', 700, 150, 1);
      smp(d, t + 0.01, take('grunt', 4, () => { const f0 = rnd(120, 150); return voice(0.3, (u) => f0 * (1 - 0.45 * u), { jit: 0.04, shim: 0.25, breath: 0.5, open: 0.004, amp: (u) => Math.min(1, u * 25) * (1 - u) ** 1.5, mouth: [[rnd(560, 640), 5, 1], [rnd(1050, 1200), 6, 0.6], [2450, 8, 0.25]] }); }), 0.35);
    },
    crunch(d, t) { smp(d, t, take('crunch', 3, () => add(grains(0.28, 26, 500, 2800, 0.012), struck({ modes: [1, 1.6, 2.5], f0: 75, T: 0.15, hf: 3, tc: 0.02 }), 0, 0.8)), 1); },
    neck_snap(d, t) {
      nz(d, t, 0.02, 1, 'highpass', 2500); nz(d, t + 0.025, 0.035, 0.9, 'bandpass', 1800, null, 3);
      nz(d, t, 0.018, 0.85, 'bandpass', 2600, 900, 5, 0.001);
      for (let i = 0; i < 4; i++) nz(d, t + 0.07 + i * 0.03, 0.03, 0.6, 'bandpass', 900 + Math.random() * 900, null, 4);
      smp(d, t, lowThud(), 0.8);
    },
    // the sting when something shows itself: a section of strings stabbing a sour cluster, the bows biting hard, then
    // falling away; and a bass drum under it
    stinger(d, t, o) {
      smp(d, t, take('stinger', 2, () => strings(STING.dur, STING.notes, STING.o), STING.sr), 1, o.pitch || 1);
      smp(d, t, bassDrum(), 0.9);
      nz(d, t, 1.2, 0.3, 'highpass', 5000, 700, 0.5, 0.004);
    },
    // ...and a higher one: violins screeching up near the bridge, sliding sharp
    stinger_hi(d, t) {
      smp(d, t, take('stinger_hi', 2, () => strings(STING_HI.dur, STING_HI.notes, STING_HI.o), STING_HI.sr), 0.9);
      smp(d, t, bassDrum(), 0.6);
    },
    // something down the corridor has seen you: a wet, catching gasp; a rattle deep in its throat, creaking slow and
    // then faster as it draws itself up; and over it a strangled, tearing shriek that tails off into the dark
    noticed(d, t) {
      // a voice: a throat, not an oscillator. It's built a pulse at a time, each a little early or late (jit) and
      // louder or softer (shim), every other one weaker by sub (a rough, split voice), air hissing through each one
      // (breath), at f(u) pulses a second u of the way through, swelling as amp(u); open: the longest a pulse stays open
      const throat = (dur, f, o) => {
        const sr = ctx.sampleRate, N = Math.floor(sr * dur), b = ctx.createBuffer(1, N, sr), w = b.getChannelData(0);
        let n = 0, k = 0, peak = 1e-6;
        while (n < N) {
          const u = n / N, T = sr / (f(u) * (1 + rnd(-1, 1) * o.jit)), a = o.amp(u) * (1 + rnd(-1, 1) * o.shim) * (k++ % 2 ? 1 - (o.sub || 0) : 1);
          const Tp = Math.min(0.4 * T, o.open * sr), Tn = Tp * 0.4;
          let prev = 0;
          for (let i = 0; i < T && n + i < N; i++) {
            const g = i < Tp ? 0.5 * (1 - Math.cos(Math.PI * i / Tp)) : i < Tp + Tn ? Math.cos(Math.PI * (i - Tp) / (2 * Tn)) : 0;
            const v = a * ((g - prev) * Tp * 0.5 + g * (Math.random() * 2 - 1) * o.breath);
            w[n + i] = v; peak = Math.max(peak, Math.abs(v)); prev = g;
          }
          n += Math.max(1, Math.round(T));
        }
        for (let i = 0; i < N; i++) w[i] /= peak;
        const s = ctx.createBufferSource(); s.buffer = b; return s;
      };
      // ...shaped by the mouth and throat it comes out of: formants gliding from one vowel to another ([from, to, Q, gain])
      const mouth = (src, t0, list, gain, to) => {
        const sum = ctx.createGain(); sum.gain.value = gain; sum.connect(to);
        for (const [a, b, q, g] of list) {
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
          bp.frequency.setValueAtTime(a, t0); bp.frequency.linearRampToValueAtTime(b, t0 + src.buffer.duration);
          const gg = ctx.createGain(); gg.gain.value = g; src.connect(bp); bp.connect(gg); gg.connect(sum);
        }
        src.start(t0);
      };
      // the gasp, sucked in hard through the teeth, catching at the end
      nz(d, t, 0.3, 0.32, 'bandpass', 1100, 2500, 1.3, 0.22);
      nz(d, t + 0.04, 0.26, 0.14, 'highpass', 3600, null, 0.7, 0.2);
      nz(d, t + 0.29, 0.03, 0.5, 'bandpass', 1500, 700, 3, 0.002);
      // the rattle: wet, creaking pulses in a slack throat, tightening from a crackle into a croak (thick and muffled:
      // it comes from deep down)
      const croak = throat(1.9, (u) => 22 + 40 * Math.pow(u, 1.2), { jit: 0.35, shim: 0.6, open: 0.004, breath: 0.45, amp: (u) => ramp(u, 0, 0.1) * (1 - ramp(u, 0.72, 1)) });
      mouth(croak, t + 0.3, [[380, 640, 5, 1], [820, 1080, 6, 0.6], [2300, 2550, 8, 0.12], [180, 220, 1.2, 0.7]], 1.3, filt(d, 'lowpass', 1900, 0.7));
      // the shriek: lunging up, wavering, its voice cracking high for a moment, then sinking, rough and split, through
      // a mouth stretched wide
      const drift = wander(9, 0.07);
      const shriek = throat(1.45, (u) => (u < 0.1 ? 300 + 260 * (u / 0.1) : 560 - 150 * ramp(u, 0.1, 1)) * (1 + drift(u)) * (u > 0.34 && u < 0.43 ? 1.42 : 1), { jit: 0.05, shim: 0.32, open: 1, breath: 0.6, sub: 0.45, amp: (u) => ramp(u, 0, 0.04) * Math.pow(1 - u, 1.5) * (1 + 0.25 * Math.sin(u * 61)) });
      mouth(shriek, t + 0.82, [[920, 760, 5, 1], [1650, 2300, 7, 0.8], [3000, 3250, 9, 0.5], [4300, 4300, 10, 0.22]], 0.85, shaper(d, 6));
      // and the breath going out of it after, a ragged rasp
      nz(d, t + 2.05, 0.6, 0.12, 'bandpass', 900, 500, 1.6, 0.05);
      // and the jolt of it, felt more than heard
      smp(d, t + 0.82, bassDrum(), 0.6);
      nz(d, t + 0.82, 0.9, 0.3, 'lowpass', 260, 90, 0.7, 0.02, brownBuf);
    },
    // lub-dub: the valves of your own heart shutting, heard through your chest: two dull thumps, the second softer and
    // a little higher
    heartbeat(d, t, o) {
      smp(d, t, take('lub', 3, () => bq(struck({ modes: [1, 1.45, 2.1, 2.9], f0: rnd(42, 50), T: 0.14, hf: 4, tc: 0.035, grit: 0.15 }), 'lp', 160, 0.7), 16000), 1);
      smp(d, t + (o.gap || 0.22), take('dub', 3, () => bq(struck({ modes: [1, 1.5, 2.3], f0: rnd(55, 65), T: 0.1, hf: 4, tc: 0.022, grit: 0.15 }), 'lp', 190, 0.7), 16000), 0.65);
    },
    crawler_screech(d, t) {
      smp(d, t, take('screech', 3, () => { const f0 = rnd(600, 660), wob = rnd(20, 32);
        return voice(1.4, (u) => f0 * (1 - 0.3 * u) * (1 + 0.06 * Math.sin(TAU * wob * u * 1.4)), { jit: 0.06, shim: 0.4, sub: 0.4, breath: 0.7, amp: (u) => Math.min(1, u * 30) * (1 - u) ** 0.8, clip: 3,
          mouth: [[(u) => (u < 0.25 ? 1100 + 4800 * u : Math.max(800, 2300 - 2200 * (u - 0.25))), 2, 1], [(u) => 3000 - 1500 * u, 3, 0.5], [4200, 6, 0.3]] }); }), 1);
    },
    crawler_growl(d, t) { smp(d, t, take('cgrowl', 3, () => growl(1.4, rnd(42, 50), 19, [[300, 2, 1], [650, 3, 0.4], [1500, 4, 0.1]]), 16000), 1); },
    ceramic(d, t) {
      smp(d, t, take('ceramic', 4, () => struck({ modes: [1, 1.62, 2.41, 3.53, 4.7], f0: rnd(2600, 3600), T: 0.18, hf: 0.3, tc: 0.00007, click: 0.4 })), 1);
      nz(d, t + 0.03, 0.14, 0.22, 'bandpass', 900, 1700, 3, 0.02);
    },
    breath(d, t) { nz(d, t, 1.1, 0.25, 'bandpass', 700, 480, 1.3, 0.45); nz(d, t + 1.25, 1.3, 0.2, 'bandpass', 520, 340, 1.3, 0.3); },
    hiss(d, t) {
      nz(shaper(d, 20), t, 1.4, 0.65, 'highpass', 2600, 4200, 0.7, 0.04);
      smp(d, t, take('hiss_rattle', 3, () => growl(1.4, rnd(70, 85), 31, [[600, 2, 1], [1800, 3, 0.5]], { breath: 1 }), 24000), 0.3);
    },
    leech_drop(d, t) { smp(d, t, bodyThud(), 0.9); nz(d, t, 0.2, 0.7, 'lowpass', 500, 150, 1); nz(d, t + 0.05, 0.3, 0.4, 'bandpass', 500, 1500, 6); },
    squelch(d, t) { for (let i = 0; i < 3; i++) nz(d, t + i * 0.11, 0.09, 0.45, 'bandpass', rnd(350, 900), 200, 5); },
    // the Seep: a heavy, wet slither as it drags itself along (big bubbles glugging up through it)...
    slime_slosh(d, t) {
      nz(d, t, 0.6, 0.55, 'lowpass', 420, 140, 1.2, 0.12, brownBuf);
      for (let i = 0; i < 3; i++) nz(d, t + 0.05 + i * rnd(0.08, 0.15), 0.12, 0.28, 'bandpass', rnd(380, 820), 200, 5, 0.01);
      smp(d, t + 0.12, take('glug', 4, () => bubble(bubble(arr(0.5), 0, rnd(16, 26)), nS(rnd(0.05, 0.12)), rnd(20, 32), 0.6), 16000), 1);
    },
    // a leech nest breathing: the whole wet mass of it heaving in, slow, and settling, small bubbles popping down in
    // its burrows
    nest_breath(d, t) {
      nz(d, t, 1.9, 0.5, 'lowpass', 280, 130, 1.1, 0.7, brownBuf);
      nz(d, t + 0.3, 1.2, 0.18, 'bandpass', 520, 300, 3, 0.4);
      smp(d, t + 0.6, take('nestpop', 4, () => { const y = arr(1.4); for (let i = 0, a = 0; i < 6; i++, a += rnd(0.1, 0.25)) bubble(y, nS(a), rnd(6, 16), rnd(0.3, 0.8)); return y; }, 16000), 0.6);
    },
    // ...bubbles welling up through it and bursting...
    slime_gurgle(d, t) {
      smp(d, t, take('gurgle', 4, () => { const y = arr(1.5); for (let i = 0, a = 0; i < 8; i++, a += rnd(0.06, 0.17)) bubble(y, nS(a), rnd(14, 38), rnd(0.5, 1)); return y; }, 16000), 1);
      nz(d, t, 1.1, 0.3, 'lowpass', 260, 110, 1, 0.25, brownBuf);
    },
    // ...a thin wet hiss as it starts to work its way through the gap under a door...
    slime_seep(d, t) { nz(d, t, 1.4, 0.22, 'bandpass', 1900, 900, 2.5, 0.25); nz(d, t, 1.2, 0.3, 'lowpass', 380, 160, 1, 0.3, brownBuf); },
    // ...dribbling and dripping on the other side all the while...
    slime_drip(d, t) {
      smp(d, t, take('drips', 4, () => { const y = arr(1); for (let i = 0, a = 0; i < 4; i++, a += rnd(0.09, 0.22)) bubble(y, nS(a), rnd(2.5, 4.6), rnd(0.6, 1)); return y; }), 1);
      nz(d, t, 0.6, 0.12, 'bandpass', 1300, 800, 2, 0.1);
    },
    // ...the sizzle of it burning whoever it reaches...
    slime_burn(d, t) { nz(d, t, 0.4, 0.5, 'highpass', 2800, 5200, 0.7, 0.01); nz(d, t, 0.25, 0.35, 'bandpass', 650, 300, 3, 0.01); },
    // ...and the gulp of it taking them whole
    slime_gulp(d, t) {
      nz(d, t, 0.5, 0.8, 'lowpass', 700, 120, 1.5, 0.02, brownBuf);
      smp(d, t, take('gulp_big', 3, () => { const y = add(arr(1.2), struck({ modes: [1, 1.5, 2.2], f0: rnd(60, 80), T: 0.35, hf: 3, tc: 0.03 })); for (let i = 0, a = 0.25; i < 5; i++, a += rnd(0.08, 0.16)) bubble(y, nS(a), rnd(20, 45), 0.7); return y; }, 16000), 1);
    },
    chitter(d, t) { smp(d, t, take('chitter', 4, () => { const y = arr(0.45); for (let i = 0; i < 12; i++) add(y, struck({ modes: plate(6, 1.1), f0: rnd(2000, 3400), T: 0.012, hf: 0.2, tc: 0.00005, grit: 0.5 }), i * 0.032 + rnd(0, 0.006), rnd(0.5, 1)); return y; }), 1); },
    hound_growl(d, t) { smp(d, t, take('hgrowl', 3, () => growl(1.7, rnd(48, 56), 22, [[300, 2, 1], [700, 3, 0.35], [1400, 4, 0.1]]), 16000), 1); },
    hound_roar(d, t) {
      smp(d, t, take('roar', 3, () => { const f0 = rnd(190, 215); return voice(0.85, (u) => f0 * (1 - 0.6 * u), { jit: 0.08, shim: 0.4, sub: 0.35, breath: 0.8, air: 0.15, clip: 2.5, amp: (u) => Math.min(1, u * 12) * (1 - u) ** 0.7, mouth: [[(u) => 900 - 500 * u, 2.5, 1], [(u) => 1500 - 400 * u, 3, 0.6], [2600, 4, 0.35]] }); }), 1);
    },
    howl(d, t) {
      smp(d, t, take('howl', 3, () => { const k = rnd(0.9, 1.1), dr = wander(8, 0.025);
        return voice(3.7, (u) => k * (u < 0.24 ? 240 + 190 * u / 0.24 : u < 0.7 ? 430 - 80 * (u - 0.24) / 0.46 : 350 - 160 * (u - 0.7) / 0.3) * (1 + dr(u)) * (1 + 0.02 * Math.sin(TAU * 5.5 * u * 3.7)), { jit: 0.01, shim: 0.08, breath: 0.35, air: 0.05, amp: (u) => Math.min(1, u * 7) * Math.min(1, (1 - u) * 5),
          mouth: [[(u) => 380 + 320 * Math.sin(Math.PI * Math.min(1, u * 1.4)), 4, 1], [(u) => 850 + 300 * Math.sin(Math.PI * u), 5, 0.5], [2600, 8, 0.08]] }); }, 24000), 1);
    },
    sniff(d, t) { for (let i = 0; i < 3; i++) nz(d, t + i * 0.13, 0.08, 0.22, 'highpass', 2200, null, 0.8, 0.02); },
    // pneumatic door: a valve cracks, air hisses out, the door glides on its rails with the air whistling past its
    // seal, and seats with a thump
    ship_door(d, t) {
      nz(d, t, 0.05, 0.55, 'highpass', 2600, null, 0.7, 0.002);
      nz(d, t + 0.02, 0.95, 0.36, 'bandpass', 4300, 2500, 0.8, 0.012);
      nz(d, t + 0.05, 0.8, 0.12, 'highpass', 7200, 9500, 0.6, 0.06);
      nz(d, t + 0.1, 0.8, 0.12, 'bandpass', 950, 1500, 2.5, 0.18);
      nz(d, t + 0.08, 0.65, 0.3, 'bandpass', 2950, 2650, 40, 0.12);
      smp(d, t + 0.9, take('seal', 3, () => struck({ modes: plate(10, 2), f0: rnd(110, 130), T: 0.15, hf: 2, tc: 0.004, grit: 0.3 })), 0.3);
      nz(d, t + 0.9, 0.07, 0.25, 'lowpass', 1500, 400, 0.7, 0.002);
      nz(d, t + 0.93, 0.3, 0.14, 'highpass', 3200, null, 0.7, 0.01);
    },
    // the burn: the roar of it, and the deep throb of the combustion under it
    engine(d, t, o) {
      const dur = o.dur || 4;
      const lp = filt(d, 'lowpass', 200, 1);
      lp.frequency.setValueAtTime(150, t); lp.frequency.linearRampToValueAtTime(1100, t + dur * 0.4); lp.frequency.linearRampToValueAtTime(140, t + dur);
      const s = ctx.createBufferSource(); s.buffer = brownBuf; s.loop = true;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.2, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.connect(g); g.connect(lp); s.start(t); s.stop(t + dur + 0.1);
      nz(d, t, dur, 0.6, 'lowpass', 55, 95, 5, dur * 0.3, brownBuf);
    },
    // the ship's engines winding up before it lifts: the turbines' blades whirring up through the ducts' resonances,
    // and the air drawn in through the intakes rushing up with them
    spool(d, t) {
      smp(d, t, take('spool', 2, () => fade(add(buzz(7, (u) => 18 + 340 * Math.pow(u, 1.5), (u) => 0.2 + 0.8 * u, [[230, 1, 0.05], [470, 0.7, 0.04], [920, 0.45, 0.03], [1700, 0.25, 0.02]], { duty: 0.3, jit: 0.012, shim: 0.25 }),
        norm(bq(noise(7.1), 'bp', (u) => 240 + 1600 * u * u, 0.8)), 0, 0.45), (u) => Math.min(1, u * 8) * Math.min(1, (1 - u) * 14)), 32000), 1);
    },
    // the mains lighting: a deep whump as the fuel catches (the air in the bells knocked in its lowest modes), then the
    // roar opening up and the jet's tearing hiss on top of it
    ignite(d, t) {
      smp(d, t, take('whump', 2, () => add(struck({ modes: [1, 1.5, 2.2, 3.1], f0: rnd(38, 46), T: 0.6, hf: 5, tc: 0.025, grit: 0.4, len: 1.6 }), norm(bq(fade(noise(1.6), (u) => Math.min(1, u * 30) * Math.exp(-u * 4)), 'lp', (u) => 900 * Math.exp(-u * 3) + 80, 0.8)), 0, 0.8), 32000), 1.2);
      nz(d, t + 0.03, 2.8, 0.7, 'lowpass', 180, 2600, 0.7, 0.18, brownBuf);
      nz(d, t + 0.08, 2.4, 0.22, 'bandpass', 1900, 900, 0.6, 0.25);
    },
    // breaking water: the slap of it, the bubbles knocked under ringing, spray hissing up, the drops pattering back
    splash(d, t, o) {
      const k = o.k ?? 1;
      nz(d, t, 0.07, 0.7 * k, 'bandpass', 800, 350, 0.7, 0.002, brownBuf);
      nz(d, t + 0.01, 0.45, 0.22 * k, 'highpass', 2200, 1300, 0.5, 0.01);
      smp(d, t + 0.015, take('splash_b', 4, () => { const y = arr(0.9); for (let i = 0; i < 16; i++) bubble(y, nS(rnd(0, 0.45)), rnd(1.6, 7), rnd(0.2, 0.7)); return norm(y); }), 0.55 * k);
      smp(d, t + 0.28, take('splash_d', 4, () => { const y = arr(1.1); for (let i = 0; i < 22; i++) bubble(y, nS(rnd(0, 0.8)), rnd(0.8, 2.6), rnd(0.1, 0.35)); return norm(y); }), 0.3 * k);
    },
    // snacks: a ring pull cracking and the fizz, a crinkling wrapper, then gulps or chewing
    can_open(d, t) {
      nz(d, t, 0.012, 0.9, 'bandpass', 3800, null, 4, 0.0005); nz(d, t, 0.04, 0.7, 'highpass', 3500);
      smp(d, t, take('tab', 3, () => struck({ modes: plate(8, 1.1), f0: rnd(2100, 2500), T: 0.06, hf: 0.3, tc: 0.0001 })), 0.12);
      nz(d, t + 0.03, 1.1, 0.22, 'highpass', 5200, 8000, 0.6, 0.02);
      for (let i = 0; i < 3; i++) {
        smp(d, t + 0.6 + i * 0.34, take('gulp', 4, () => bubble(add(arr(0.4), struck({ modes: [1, 1.6, 2.4], f0: rnd(150, 190), T: 0.07, hf: 3, tc: 0.015 })), nS(0.02), rnd(12, 18), 0.25), 16000), 0.5);
        nz(d, t + 0.6 + i * 0.34, 0.1, 0.25, 'lowpass', 600, 200, 1, 0.02);
      }
    },
    wrapper(d, t) {
      for (let i = 0; i < 9; i++) nz(d, t + i * 0.045 + Math.random() * 0.02, 0.05, 0.45, 'bandpass', rnd(3000, 6500), null, 1.5);
      for (let i = 0; i < 4; i++) { nz(d, t + 0.55 + i * 0.22, 0.08, 0.55, 'bandpass', rnd(900, 1800), 500, 2); smp(d, t + 0.55 + i * 0.22, take('chew', 4, () => struck({ modes: [1, 1.7, 2.6], f0: rnd(95, 125), T: 0.05, hf: 3, tc: 0.02, grit: 0.6 }), 16000), 0.3); }
    },
    // a gift: tape tearing, paper ripping away, the lid lifting off
    unwrap(d, t) {
      for (let i = 0; i < 5; i++) nz(d, t + i * 0.07 + Math.random() * 0.03, 0.09, 0.45, 'bandpass', rnd(1800, 4200), rnd(900, 2000), 1.2, 0.004);
      nz(d, t + 0.38, 0.3, 0.55, 'bandpass', 2600, 800, 0.9, 0.01);
      nz(d, t + 0.72, 0.12, 0.35, 'lowpass', 900, 300, 1, 0.01); smp(d, t + 0.72, take('card', 3, () => struck({ modes: plate(10, 1.6), f0: rnd(160, 200), T: 0.05, hf: 2, tc: 0.004, grit: 0.5 })), 0.25);
    },
    // a lit fuse: a spitting hiss, crackling
    fuse(d, t, o) {
      const dur = o.dur || 0.5;
      nz(d, t, dur, 0.28, 'bandpass', rnd(3200, 4200), rnd(2400, 3000), 1.1, 0.01);
      for (let i = 0; i < 6; i++) nz(d, t + Math.random() * dur, 0.015, 0.4, 'highpass', 3000, null, 0.7, 0.001);
    },
    // a blast: the crack, the roar rolling off the walls, the pressure wave, then debris pattering down
    explosion(d, t) {
      nz(d, t, 0.18, 1.2, 'highpass', 1500, null, 0.6, 0.001);
      nz(d, t, 2.4, 1.4, 'lowpass', 4200, 90, 0.6, 0.003, brownBuf);
      smp(d, t, blast(), 1.8);
      nz(shaper(d, 30), t, 0.6, 0.6, 'lowpass', 900, 200, 0.7, 0.002);
      S.debris(d, t + 0.25);
    },
    // a creature's last noise: a drawn-out rattle sinking away, a wet gurgle, the body hitting the floor
    death_rattle(d, t, o) {
      const p = o.pitch || 1;
      smp(d, t, take('rattle', 3, () => voice(1.3, (u) => 160 * Math.pow(45 / 160, u) * (1 + 0.1 * Math.sin(TAU * 23 * u * 1.3)), { jit: 0.3, shim: 0.6, breath: 0.6, sub: 0.3, open: 0.004, air: 0.1, clip: 2, amp: (u) => Math.min(1, u * 15) * (1 - u) ** 0.6, mouth: [[(u) => 700 - 480 * u, 2.5, 1], [(u) => 1300 - 500 * u, 3, 0.4]] }), 24000), 0.5, p);
      nz(d, t, 1.4, 0.3, 'bandpass', 700 * p, 220 * p, 2.5, 0.05);
      for (let i = 0; i < 5; i++) nz(d, t + 0.5 + i * 0.13 + Math.random() * 0.05, 0.08, 0.3, 'bandpass', rnd(300, 700) * p, 200, 6);
      smp(d, t + 0.85, bodyThud(), 0.9); nz(d, t + 0.85, 0.3, 0.6, 'lowpass', 600, 120, 0.7, 0.004);
    },
    // the jump drive winding up: a turbine spooling, its blades' whine climbing out of a swelling hum, the air drawn
    // through it rushing higher
    warp_charge(d, t, o) {
      const dur = Math.round((o.dur || 2.2) * 10) / 10;
      smp(d, t, take('spool' + dur, 2, () => fade(add(buzz(dur, (u) => 90 * Math.pow(10, Math.pow(u, 1.4)), (u) => Math.pow(u, 0.6), [[220, 1, 0.02], [610, 0.8, 0.015], [1450, 0.6, 0.01], [3100, 0.4, 0.008]], { jit: 0.002, duty: 0.08 }),
        buzz(dur, (u) => 45 * (1 + u), (u) => Math.min(1, u * 2), [[90, 1, 0.06], [180, 0.5, 0.04]], { duty: 0.3 }), 0, 0.6), (u) => Math.min(1, u * 1.2) * Math.min(1, (1 - u) * 40))), 0.4);
      const bp = filt(d, 'bandpass', 600, 3); bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(5000, t + dur);
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
      s.connect(g); g.connect(bp); s.start(t); s.stop(t + dur + 0.1);
    },
    warp_in(d, t) {
      smp(d, t, blast(), 1.4); nz(d, t, 1.2, 0.9, 'lowpass', 3000, 120, 0.6, 0.004, brownBuf);
      nz(d, t, 0.6, 0.5, 'highpass', 6000, 1200, 0.5, 0.002); nz(d, t, 0.7, 0.3, 'bandpass', 2400, 180, 30, 0.002);
    },
    warp_out(d, t) {
      nz(d, t, 0.8, 0.5, 'bandpass', 600, 4000, 1, 0.35); nz(d, t, 0.5, 0.25, 'bandpass', 150, 900, 30, 0.3);
      smp(d, t + 0.55, blast(), 1.2); nz(d, t + 0.55, 0.5, 0.6, 'lowpass', 1500, 100, 0.6, 0.004, brownBuf);
    },
    // a supply pod coming in: the shriek of the air tearing past it, falling, over a roar that builds right up to the impact
    pod_fall(d, t, o) {
      const dur = Math.max(0.5, o.dur || 3.5);
      const bp = filt(d, 'bandpass', 1800, 4); bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(480, t + dur);
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + dur * 0.92); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
      s.connect(g); g.connect(bp); s.start(t, Math.random() * 2); s.stop(t + dur + 0.1);
      nz(d, t, dur, 0.4, 'bandpass', 1900, 360, 35, dur * 0.7);
      const lp = filt(d, 'lowpass', 280, 0.7), s2 = ctx.createBufferSource(); s2.buffer = brownBuf; s2.loop = true;
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(1.3, t + dur); g2.gain.linearRampToValueAtTime(0.0001, t + dur + 0.06);
      s2.connect(g2); g2.connect(lp); s2.start(t); s2.stop(t + dur + 0.1);
    },
    // dirt and stones pattering down after an impact
    debris(d, t) { for (let i = 0; i < 28; i++) { const tt = t + Math.pow(Math.random(), 1.6) * 1.8; nz(d, tt, 0.04, rnd(0.08, 0.35), 'bandpass', rnd(500, 2600), null, 2, 0.002); } },
    // an airlock venting to space (a roar of air falling away) or filling again (rising)
    vent_air(d, t, o) {
      const dur = o.dur || 2, fill = !!o.fill;
      const lp = filt(d, 'lowpass', 1000, 0.7);
      lp.frequency.setValueAtTime(fill ? 450 : 7500, t); lp.frequency.exponentialRampToValueAtTime(fill ? 5500 : 350, t + dur);
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.75, t + (fill ? dur * 0.75 : 0.05)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(g); g.connect(lp); s.start(t, Math.random() * 2); s.stop(t + dur + 0.1);
      nz(d, t, dur * 0.8, 0.1, 'bandpass', fill ? 1800 : 3400, fill ? 3600 : 1600, 3, 0.05);
      if (!fill) { smp(d, t, take('hatch_thump', 3, () => struck({ modes: plate(12, 1.8), f0: rnd(80, 100), T: 0.35, hf: 1.5, tc: 0.004, grit: 0.3 })), 0.45); nz(d, t, 0.06, 0.6, 'highpass', 2500, null, 0.7, 0.001); }
    },
    // hydraulics: the pump's motor winding up under load (the whine of its gears), fluid hissing through the valves
    servo(d, t, o) {
      const dur = Math.round((o.dur || 1.5) * 4) / 4;
      smp(d, t, take('servo' + dur, 2, () => fade(buzz(dur, (u) => 150 * (1 + 0.4 * u) * (1 + 0.01 * Math.sin(TAU * 23 * u * dur)), () => 1, [[700, 1, 0.012], [1400, 0.4, 0.008], [300, 0.5, 0.02]], { duty: 0.2, jit: 0.006 }), (u) => Math.min(1, u * dur / 0.12) * Math.min(1, (1 - u) * dur / 0.1))), 0.25, o.pitch || 1);
      nz(d, t, dur, 0.12, 'bandpass', 2600, 1900, 1.5, 0.15);
    },
    // a glint far up in the sky: a soft glassy shimmer, more felt than heard
    glint(d, t) {
      smp(d, t, take('glint', 3, () => { const y = arr(1.4); for (let i = 0; i < 3; i++) add(y, struck({ modes: GLASS, f0: rnd(2000, 2200) * [1, 1.335, 1.68][i], T: 1.1 - i * 0.2, hf: 0.05, tc: 0.0015, grit: 0 }), i * 0.035, 0.5); return y; }), 1);
      nz(d, t, 0.8, 0.035, 'highpass', 6500, 9500, 0.6, 0.08);
    },
    // blast shutters running in their tracks: steel slats clattering against each other over a low grinding roll
    shutter(d, t, o) {
      const dur = o.dur || 1;
      nz(d, t, dur, 0.35, 'lowpass', 380, 160, 0.8, 0.06, brownBuf);
      const n = Math.round(dur * 26);
      for (let i = 0; i < n; i++) {
        const tt = t + (i / n) * dur + Math.random() * 0.02;
        nz(d, tt, 0.025, rnd(0.08, 0.2), 'bandpass', rnd(700, 1600), null, 3, 0.001);
        if (i % 3 === 0) smp(d, tt, take('slat', 6, () => struck({ modes: plate(10, 3), f0: rnd(180, 300), T: 0.08, hf: 1, tc: 0.0006, grit: 0.4 })), 0.1);
      }
    },
    // a heavy latch seating
    clunk(d, t, o) {
      const p = o.pitch || 1;
      smp(d, t, take('clunk', 4, () => add(struck({ modes: plate(14, 1.5), f0: rnd(110, 130), T: 0.3, hf: 1, tc: 0.002, grit: 0.3, click: 0.3 }), struck({ modes: BAR, f0: rnd(400, 420), T: 0.35, hf: 0.3, tc: 0.0003 }), 0, 0.15)), 0.8, p);
      nz(d, t, 0.08, 0.5, 'lowpass', 1400 * p, 300, 0.8);
    },
    // touchdown: the whole ship's weight landing on its struts, its hull ringing with it
    thud(d, t) {
      smp(d, t, take('touchdown', 2, () => struck({ modes: plate(24, 2.2), f0: rnd(55, 66), T: 1.6, hf: 1.2, tc: 0.03, grit: 0.4, len: 2 }), 24000), 1.4);
      nz(d, t, 0.6, 1, 'lowpass', 600, 80, 0.7, 0.004, brownBuf);
      nz(d, t + 0.05, 0.25, 0.35, 'bandpass', 1800, 700, 1.2);
    },
    // a big lever thrown: its ratchet clacking over, the linkage thumping home
    lever(d, t) {
      S.hit_metal(d, t);
      smp(d, t, take('ratchet', 3, () => { const y = arr(0.4); for (let i = 0, a = 0; i < 5; i++, a += rnd(0.025, 0.04)) add(y, struck({ modes: plate(8, 1.2), f0: rnd(1100, 1500), T: 0.03, hf: 0.3, tc: 0.0001 }), a, rnd(0.4, 1)); return add(y, struck({ modes: plate(10, 1.6), f0: 70, T: 0.3, hf: 2, tc: 0.006 }), 0, 0.8); }), 0.8);
      nz(d, t, 0.06, 0.4, 'bandpass', 1500, null, 2);
    },
    key(d, t) { nz(d, t, 0.012, 0.12, 'highpass', 4000); },
    // the consoles' buzzers: a little piezo disc in a grille
    beep(d, t, o) { const f = Math.round((o.f || 880) / 10) * 10; smp(d, t, take('beep' + f, 2, () => piezo(0.12, () => f)), 0.1); },
    err(d, t) {
      smp(d, t, take('err', 2, () => add(add(arr(0.42), piezo(0.18, (u) => 330 - 30 * u)), piezo(0.24, (u) => 247 - 27 * u), 0.13)), 0.13);
      nz(d, t, 0.05, 0.06, 'bandpass', 800, null, 3, 0.002);
    },
    buy(d, t) { smp(d, t, take('buy', 2, () => add(add(arr(0.4), fade(piezo(0.3, () => 880), (u) => Math.exp(-u * 4))), fade(piezo(0.3, () => 1320), (u) => Math.exp(-u * 4)), 0.09)), 0.12); },
    // a sale: the drawer sliding, and the till's little bell
    sell(d, t) { nz(d, t, 0.08, 0.35, 'bandpass', 2500, null, 2); smp(d, t + 0.1, take('ching', 3, () => struck({ modes: BELL, f0: rnd(2050, 2150), T: 1.3, hf: 0.05, tc: 0.0002, tilt: 0.3 })), 0.4); },
    // the scanner: a heavy transducer thumped once, ringing out through a cheap, worn speaker: a low ring that sags and
    // beats as it dies, a dirty rumble rolling outward with the wave, and the speaker crackling under it all
    scan(d, t) {
      smp(d, t, take('scan', 2, () => { const y = struck({ modes: [[1, 1], [1.018, 0.8], [0.5, 1.4], [2.01, 0.25], [3.03, 0.12]], f0: 146, T: 2.4, hf: 0.2, tc: 0.003, grit: 0.2, glide: 0.12, tilt: 0, spread: 0.002, len: 2.8 }); for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i] * 3); return add(norm(y), struck({ modes: [1, 1.5], f0: 70, T: 0.5, hf: 3, tc: 0.012 }), 0, 0.9); }, 24000), 0.6);
      nz(d, t, 0.35, 0.45, 'lowpass', 420, 70, 0.7, 0.004, brownBuf);
      nz(shaper(d, 3), t + 0.05, 1.6, 0.16, 'bandpass', 180, 620, 1.4, 0.25, brownBuf);
      for (let i = 0; i < 7; i++) nz(d, t + 0.1 + Math.pow(Math.random(), 1.4) * 1.6, 0.012, rnd(0.03, 0.08), 'bandpass', rnd(900, 1800), null, 1.5, 0.001);
    },
    // a find showing up as the wave reaches it: a muffled return knocking back off it, not a chirp
    ping(d, t, o) {
      const f = Math.round((o.f || 260) / 20) * 20;
      smp(d, t, take('ping' + f, 2, () => struck({ modes: [[1, 1], [0.5, 0.9], [2.7, 0.2], [4.1, 0.08]], f0: f, T: 0.38, hf: 0.5, tc: 0.003, grit: 0.2, tilt: 0 })), 0.25);
      nz(d, t, 0.05, 0.06, 'bandpass', f * 3, null, 2.5, 0.002);
    },
    // a steel locker: the latch clacks, the hinge squeals, the thin door wobbles
    locker_open(d, t) {
      nz(d, t, 0.02, 0.55, 'highpass', 2600); nz(d, t + 0.004, 0.02, 0.3, 'bandpass', 1500, null, 7, 0.001);
      smp(d, t + 0.04, take('squeak', 4, () => { const f0 = rnd(260, 340), f1 = rnd(420, 620); return fric(0.42, (u) => f0 + (f1 - f0) * u, () => rnd(0.4, 1), [[rnd(1200, 1400), 1, 0.05], [rnd(2500, 2900), 0.4, 0.03]], 0.15); }), 0.35);
      smp(d, t + 0.05, take('locker_wobble', 3, () => struck({ modes: plate(14, 2.6), f0: rnd(400, 460), T: 0.5, hf: 0.4, tc: 0.004, glide: 0.03 })), 0.12);
    },
    locker_close(d, t) {
      smp(d, t, take('locker_shut', 3, () => struck({ modes: plate(18, 2.6), f0: rnd(140, 160), T: 0.7, hf: 0.5, tc: 0.002, grit: 0.3, glide: 0.04, click: 0.25 })), 0.85);
      nz(d, t, 0.1, 0.5, 'lowpass', 1600, 300, 0.7, 0.002);
      nz(d, t + 0.05, 0.02, 0.4, 'highpass', 2600); nz(d, t + 0.054, 0.02, 0.25, 'bandpass', 1300, null, 7, 0.001);
    },
    // a ship's klaxon: a motor-driven rotor hammering a steel diaphragm, faster as it spins up, out of a flared horn;
    // three blasts
    alarm(d, t) {
      const b = take('klaxon', 2, () => buzz(0.55, (u) => 520 + 75 * Math.min(1, u * 3), (u) => Math.min(1, u * 14) * Math.min(1, (1 - u) * 10), [[1050, 1, 0.012], [1700, 0.6, 0.01], [2600, 0.4, 0.008], [560, 0.6, 0.02], [3500, 0.25, 0.006]], { duty: 0.1, jit: 0.004, shim: 0.1, clip: 2.2 }));
      for (let i = 0; i < 3; i++) smp(d, t + i * 0.72, b, 0.12);
    },
    // the power going: the generator running down (its whine sinking and the hum with it), the main contactor dropping
    // out with a slam that rings the cabinet
    power_down(d, t) {
      smp(d, t, take('rundown', 2, () => add(add(buzz(2.6, (u) => 120 * Math.pow(18 / 120, u), (u) => (1 - u) ** 1.2, [[240, 1, 0.03], [480, 0.6, 0.02], [960, 0.3, 0.015], [130, 0.6, 0.05]], { duty: 0.2, jit: 0.01 }),
        struck({ modes: plate(16, 1.4), f0: rnd(225, 240), T: 1.2, hf: 0.4, tc: 0.0015, click: 0.3 }), 0, 0.7), struck({ modes: [1, 1.6, 2.4], f0: 75, T: 0.4, hf: 2, tc: 0.012 }), 0, 0.8), 24000), 1);
      nz(d, t, 0.3, 0.6, 'lowpass', 900, 100, 0.7);
    },
    // ...and coming back: the generator spinning up, then its transformer settling into a hum
    power_up(d, t) {
      smp(d, t, take('spinup', 2, () => fade(add(buzz(1.8, (u) => 25 * Math.pow(120 / 25, u), (u) => Math.min(1, u * 1.5), [[240, 1, 0.03], [480, 0.6, 0.02], [130, 0.6, 0.05]], { duty: 0.2, jit: 0.01 }),
        buzz(0.8, () => 60, (u) => Math.min(1, u * 5) * (1 - u), [[120, 1, 0.05], [240, 0.5, 0.04], [360, 0.2, 0.03]], { duty: 0.4 }), 1, 0.4), (u) => Math.min(1, (1 - u) * 20)), 24000), 0.4);
    },
    // ---- the things from behind the siren ----
    // a Sister's shoes: a hard heel on concrete, ticking, one leg dragging a little
    heel(d, t) { smp(d, t, take('heel', 6, () => add(struck({ modes: [1, 1.7, 2.9, 4.3], f0: rnd(650, 900), T: 0.03, hf: 2, tc: 0.0006, grit: 0.5, click: 0.5 }), grains(0.05, 8, 1500, 5000, 0.002), 0.004, 0.3)), 1); },
    // its joints going: a knuckle-crack, then the cloth and the dressings rasping as it wrenches round
    sister_twitch(d, t) {
      smp(d, t, take('sister_twitch', 6, () => {
        const y = arr(0.7), n = 1 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) add(y, struck({ modes: BAR, f0: rnd(1100, 2400), T: 0.015, hf: 1, tc: 0.0003, grit: 0.8, click: 0.8 }), i * rnd(0.03, 0.09), rnd(0.5, 1));
        add(y, norm(bq(fade(noise(0.4), (u) => Math.sin(Math.PI * u) ** 2), 'bp', rnd(1800, 3200), 1.2)), rnd(0.05, 0.15), 0.25);
        return y;
      }), 1);
    },
    // breath through a wet mouth under the dressings: a slow rattle in, a gurgle out
    sister_breath(d, t) {
      smp(d, t, take('sister_breath', 4, () => add(voice(1.6, (u) => rnd(55, 70) * (1 - 0.15 * u), { jit: 0.2, shim: 0.6, sub: 0.6, breath: 1.4, open: 0.004, air: 0.3, amp: (u) => Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(u * 37)), mouth: [[380, 3, 1], [950, 5, 0.35], [2400, 6, 0.08]] }),
        (() => { const y = arr(1.6); for (let i = 0; i < 9; i++) bubble(y, Math.round(rnd(0.6, 1.5) * SR), rnd(1.2, 3), rnd(0.1, 0.35)); return norm(y); })(), 0, 0.3), 24000), 1);
    },
    // the scalpel: a quick dry swish, the blade ticking off something
    sister_slash(d, t) { nz(d, t, 0.16, 0.5, 'bandpass', 2400, 900, 1.6, 0.02); smp(d, t + 0.1, take('scalpel', 4, () => struck({ modes: plate(8, 6), f0: rnd(2600, 3400), T: 0.12, hf: 0.3, tc: 0.0002, click: 0.6 })), 0.4); },
    // ---- the Clown ----
    // its shoes: a great flat rubber sole slapping the concrete, the wet rubber squealing as the shoe rolls off it, and
    // a moment after, the loose half of the sole flapping down
    clown_step(d, t) {
      smp(d, t, take('clown_step', 6, () => {
        const y = arr(0.5);
        add(y, struck({ modes: plate(10, 2.6), f0: rnd(70, 90), T: 0.12, hf: 3, tc: 0.006, grit: 0.2 }), 0, 1);
        add(y, norm(fric(rnd(0.18, 0.35), (u) => 380 + 340 * u, (u) => Math.sin(Math.PI * u) ** 0.7, [[900, 1, 0.02], [2100, 0.4, 0.015]], 0.08)), 0.03, 0.35);
        add(y, struck({ modes: plate(6, 1.6), f0: rnd(160, 220), T: 0.04, hf: 2, tc: 0.002, grit: 0.4 }), rnd(0.04, 0.07), 0.5);
        return norm(y);
      }), 1);
    },
    // its giggle: "hee-hee-hee" in a cracked falsetto, stepping down each time, then a wheeze drawn back in through its
    // teeth
    clown_giggle(d, t) {
      smp(d, t, take('clown_giggle', 5, () => {
        const n = 5 + ((Math.random() * 4) | 0), rate = rnd(5, 7), f0 = rnd(380, 520), y = arr(n / rate + 1.2);
        for (let i = 0; i < n; i++) add(y, voice(0.75 / rate, (u) => f0 * (1 - i * 0.035) * (1 + 0.08 * Math.sin(u * Math.PI)), { jit: 0.04, shim: 0.3, sub: 0.2, breath: 1.0, open: 0.004, air: 0.25, amp: (u) => Math.sin(Math.PI * u) ** 0.6, mouth: [[270, 5, 1], [2290, 7, 0.6], [3000, 8, 0.25]], clip: 1.6 }), i / rate, 1 - i * 0.05);
        add(y, norm(bq(fade(noise(0.7), (u) => Math.sin(Math.PI * u) ** 2), 'bp', 1100, 12)), n / rate + 0.1, 0.35);
        return norm(y);
      }, 24000), 1);
    },
    // its music box: the comb's tines are bars clamped at one end (their overtones far apart, a music box's clink), some
    // bent off pitch and one snapped (only the pin's click); "Pop Goes the Weasel", the spring running down as it goes,
    // the cylinder catching now and then
    clown_box(d, t) {
      smp(d, t, take('clown_box', 3, () => {
        const TINE = [1, 6.267, 17.55, 34.39], tune = [[0, 2], [0, 1], [2, 2], [2, 1], [4, 1], [7, 1], [4, 1], [0, 2], [-5, 1], [0, 2], [0, 1], [2, 2], [2, 1], [4, 3], [0, 3]];
        const y = arr(6.5), bent = {}; let at = 0.05;
        tune.forEach(([s, b], i) => {
          if (bent[s] == null) bent[s] = rnd(-35, 35);
          const f = 1046.5 * Math.pow(2, s / 12 + bent[s] / 1200), broken = s === 2 && i > 10;
          add(y, struck({ modes: TINE, f0: f, T: broken ? 0.01 : lerp(1.6, 0.6, (s + 5) / 12), hf: 0.5, tc: 0.0002, click: broken ? 1 : 0.15 }), at, broken ? 0.3 : 0.6);
          add(y, struck({ modes: plate(8, 1.5), f0: 420, T: 0.05, hf: 1, tc: 0.001, grit: 0.3 }), at, 0.08);
          at += b * 0.19 * (1 + i * 0.025) + (Math.random() < 0.15 ? rnd(0.15, 0.4) : 0);
        });
        return norm(y);
      }, 24000), 1);
    },
    // its bulb horn: a reed buzzing as the bulb's squeezed, sagging as it empties
    clown_honk(d, t) { smp(d, t, take('clown_honk', 3, () => buzz(0.45, (u) => 330 - 20 * u, (u) => Math.min(1, u * 12) * Math.min(1, (1 - u) * 6), [[660, 1, 0.03], [990, 0.6, 0.02], [1320, 0.5, 0.02], [1980, 0.3, 0.015]], { duty: 0.3, clip: 1.5 })), 1); },
    // a Bound's voice: a moan from inside a sack of skin, low, through a mouth with no throat behind it
    bound_groan(d, t) { smp(d, t, take('bound_groan', 5, () => growl(rnd(1.4, 2.2), rnd(48, 62), rnd(5, 9), [[rnd(260, 320), 3, 1], [rnd(600, 750), 4, 0.25]], { breath: 0.8, clip: 1.5 }), 22050), 1); },
    bound_breath(d, t) { nz(d, t, 1.4, 0.12, 'lowpass', 400, 200, 0.7, 0.5); },
    // ...heaving up what it spits: the gut clenching (a gulping rise), then a wet spray
    bound_retch(d, t) {
      smp(d, t, take('bound_retch', 4, () => {
        const y = arr(1.6);
        add(y, voice(0.85, (u) => rnd(70, 90) * (1 + u * 0.8), { jit: 0.25, shim: 0.7, sub: 0.5, breath: 1.2, open: 0.005, air: 0.25, amp: (u) => Math.min(1, u * 3) * (0.5 + 0.5 * Math.abs(Math.sin(u * 22))), mouth: [[420, 3, 1], [1100, 5, 0.4]], clip: 2 }), 0, 1);
        add(y, norm(bq(fade(noise(0.6), (u) => Math.min(1, u * 30) * (1 - u) ** 1.5), 'bp', (u) => 2200 - u * 1200, 0.9)), 0.9, 0.8);
        for (let i = 0; i < 14; i++) bubble(y, Math.round(rnd(0.9, 1.5) * SR), rnd(0.8, 2.5), rnd(0.1, 0.3));
        return y;
      }, 24000), 1);
    },
    // getting up: its skin stretching and creaking as it folds up off the floor, a wet slap of it finding its feet
    bound_rise(d, t) {
      smp(d, t, take('bound_rise', 3, () => add(fric(1.2, (u) => 30 + 60 * u, (u) => Math.sin(Math.PI * u), [[rnd(180, 240), 1, 0.05], [rnd(420, 520), 0.5, 0.03], [rnd(900, 1100), 0.25, 0.02]], 0.4),
        struck({ modes: [1, 1.6, 2.3, 3.4], f0: rnd(70, 90), T: 0.12, hf: 2, tc: 0.012, grit: 0.4 }), 1.15, 0.8), 24000), 1);
    },
    bound_slam(d, t) { smp(d, t, bodyThud(), 1); smp(d, t + 0.01, lowThud(), 0.6); nz(d, t, 0.15, 0.4, 'lowpass', 700, 150, 1); },
    // the Executioner. Its blade along the concrete: a great slab of iron catching and slipping (each slip ringing the
    // whole length of it), grit grinding under its edge
    blade_drag(d, t) {
      smp(d, t, take('blade_drag', 6, () => add(fric(rnd(0.9, 1.3), (u) => rnd(28, 40) * (1 + 0.3 * Math.sin(u * 9)), (u) => Math.min(1, u * 8) * Math.min(1, (1 - u) * 4) * (0.7 + 0.3 * Math.random()), plate(18, 5.5).map(([r, a]) => [r * rnd(150, 175), a, rnd(0.3, 0.8)]), 0.5),
        grains(1.1, 90, 1500, 6000, 0.002), 0, 0.35), 24000), 1);
    },
    // ...lifted: dragging free with a scrape, the iron ringing as it comes up off the floor
    blade_lift(d, t) { smp(d, t, take('blade_lift', 3, () => add(struck({ modes: plate(20, 5.5), f0: rnd(150, 170), T: 2.2, hf: 0.2, tc: 0.002, grit: 0.4, len: 2.6 }), fric(0.4, () => 60, (u) => 1 - u, [[rnd(900, 1300), 1, 0.05]], 0.5), 0, 0.5), 24000), 0.7); },
    // ...and down: the floor taking the whole weight of it (concrete cracking, the iron ringing, chips flying)
    blade_floor(d, t) {
      nz(d, Math.max(0, t - 0.25), 0.3, 0.5, 'bandpass', 300, 900, 1.2, 0.2);
      smp(d, t, take('blade_floor', 3, () => add(add(struck({ modes: plate(24, 5.5), f0: rnd(140, 165), T: 2.6, hf: 0.15, tc: 0.0015, grit: 0.5, click: 0.5, len: 3 }), struck({ modes: [1, 1.5, 2.3, 3.1], f0: rnd(38, 46), T: 0.6, hf: 4, tc: 0.02, grit: 0.4 }), 0, 1), grains(0.5, 60, 900, 4000, 0.004), 0.01, 0.4), 24000), 1);
    },
    blade_flesh(d, t) { nz(d, Math.max(0, t - 0.25), 0.3, 0.5, 'bandpass', 300, 900, 1.2, 0.2); smp(d, t, bodyThud(), 1); smp(d, t + 0.02, lowThud(), 1); smp(d, t + 0.05, take('blade_floor', 3, () => struck({ modes: plate(24, 5.5), f0: rnd(140, 165), T: 2.6, hf: 0.15, tc: 0.0015, len: 3 }), 24000), 0.5); },
    // its tread: a great weight coming down on bare feet, the chains on its hood swinging and clinking with it
    heavy_step(d, t) {
      smp(d, t, take('heavy_step', 5, () => {
        const y = add(arr(0.9), struck({ modes: [1, 1.5, 2.2, 3.3], f0: rnd(42, 52), T: 0.3, hf: 3, tc: 0.025, grit: 0.4 }), 0, 1);
        for (let i = 0; i < 4; i++) add(y, struck({ modes: [1, 2.76, 5.4], f0: rnd(1500, 2600), T: 0.08, hf: 0.5, tc: 0.0003, grit: 0.4 }), 0.08 + i * rnd(0.05, 0.12), rnd(0.1, 0.25));
        return y;
      }, 24000), 1);
    },
    // the hood shifting on its shoulders: iron grating on iron, the chains
    hood_rattle(d, t) {
      smp(d, t, take('hood_rattle', 4, () => {
        const y = add(arr(1.2), fric(0.6, () => rnd(40, 70), (u) => Math.sin(Math.PI * u), plate(10, 1.2).map(([r, a]) => [r * rnd(220, 260), a, 0.4]), 0.6), 0, 0.6);
        for (let i = 0; i < 7; i++) add(y, struck({ modes: [1, 2.76, 5.4], f0: rnd(1400, 2800), T: 0.07, hf: 0.5, tc: 0.0003 }), rnd(0.1, 0.9), rnd(0.1, 0.3));
        return y;
      }, 24000), 1);
    },
    // a Bound's mist eating through what it lands on
    mist_hiss(d, t) { nz(d, t, 2.5, 0.25, 'highpass', 3000, 5000, 0.7, 0.1); nz(d, t, 2.5, 0.12, 'bandpass', 1200, 700, 2, 0.3); },
    // Pulling the core: the emergency circuit's main breaker thrown somewhere below, a contactor the size of a door
    // slamming home in its cabinet, the slam rolling off down every corridor; the fire shutter on the circuit dropping
    // a slat at a time, quicker and quicker, into its stops; then the ballasts all over the building striking up at once
    em_breaker(d, t, o) {
      smp(d, t, take('em_breaker', 3, () => {
        const y = arr(4.2);
        add(y, struck({ modes: plate(22, 1.3), f0: rnd(48, 62), T: 2.8, hf: 0.25, tc: 0.004, grit: 0.4, glide: 0.015, click: 0.4, len: 3.2 }), 0, 1);
        add(y, struck({ modes: [1, 1.5, 2.3, 3.1], f0: rnd(30, 38), T: 1.2, hf: 4, tc: 0.03, grit: 0.3 }), 0, 0.9);
        let at = rnd(0.15, 0.22), gap = rnd(0.09, 0.12);
        for (let i = 0; i < 14; i++) { add(y, struck({ modes: plate(10, 3), f0: rnd(240, 330), T: 0.18, hf: 0.6, tc: 0.0015, grit: 0.5 }), at, 0.35 * rnd(0.6, 1)); at += gap; gap *= 0.86; }
        add(y, struck({ modes: plate(16, 2.2), f0: rnd(110, 140), T: 1.0, hf: 0.4, tc: 0.003, grit: 0.4 }), at + 0.02, 0.7);
        add(y, buzz(2.6, (u) => 100 * (1 + 0.01 * Math.sin(u * 30)), (u) => Math.min(1, u * 2.5) * (1 - u) ** 1.5, [[100, 1, 0.08], [200, 0.7, 0.06], [300, 0.4, 0.05], [1200, 0.15, 0.01]], { duty: 0.3, jit: 0.02, clip: 1.6 }), at + 0.1, 0.3);
        return y;
      }, 24000), 1, o.rate || 1);
      nz(d, t, 0.5, 0.5, 'lowpass', 700, 80, 0.7);
    },
    // ...and each emergency fitting coming on as the circuit reaches it: its relay clacking over, the contactor seating
    // with a thunk, the little shutter on its cage (if it has one) rattling up, and the ballast catching (after a try
    // or two, some of them) with a buzz. Every fitting has worn its own way, so no two sound alike
    em_lamp(d, t, o) {
      smp(d, t, take('em_lamp', 12, () => {
        const y = arr(1.8);
        add(y, struck({ modes: plate(8, 1.6), f0: rnd(700, 1500), T: 0.06, hf: 0.8, tc: 0.0006, grit: 0.6, click: 0.6 }), 0, 0.5);
        add(y, struck({ modes: plate(12, rnd(1.2, 2.4)), f0: rnd(90, 190), T: rnd(0.3, 0.8), hf: 0.5, tc: 0.002, grit: 0.4 }), rnd(0.005, 0.03), 0.8);
        if (Math.random() < 0.6) {
          let at = rnd(0.05, 0.1), gap = rnd(0.03, 0.06); const f0 = rnd(300, 600);
          for (let i = 0, n = 3 + ((Math.random() * 6) | 0); i < n; i++) { add(y, struck({ modes: plate(8, 3), f0: f0 * rnd(0.95, 1.05), T: 0.08, hf: 0.7, tc: 0.001, grit: 0.5 }), at, 0.3); at += gap; gap *= rnd(0.8, 1.1); }
        }
        const tries = 1 + ((Math.random() * 3) | 0), fb = rnd(98, 122), ring = rnd(1800, 3200), clip = rnd(1.5, 3);
        let at = rnd(0.12, 0.25);
        for (let i = 0; i < tries; i++) {
          const last = i === tries - 1, L = last ? rnd(0.5, 0.9) : rnd(0.04, 0.12);
          add(y, buzz(L, () => fb, (u) => Math.min(1, u * 30) * (last ? (1 - u) ** 2 : 1), [[fb, 1, 0.05], [fb * 2, 0.8, 0.04], [fb * 4, 0.4, 0.02], [ring, 0.25, 0.006]], { duty: rnd(0.1, 0.3), jit: 0.02, clip }), at, 0.35);
          at += L + rnd(0.04, 0.12);
        }
        return y;
      }, 24000), 1, (o.rate || 1) * rnd(0.92, 1.08));
    },
    // the facility's own alarm on the emergency circuit: an old motor siren with its bearings gone, wailing up and
    // sagging, its horn torn so the cone rattles, a bad contact cutting it in and out. It never quite gets going, and
    // never stops
    em_alarm(d, t, o) {
      smp(d, t, take('em_alarm', 6, () => {
        const dur = rnd(2.2, 2.7), dr = wander(8, 0.06), base = rnd(330, 420), top = base * rnd(1.6, 2.1);
        // (where the contact cuts it: a few gaps, some dead, some only weak)
        const cuts = Array.from({ length: 2 + ((Math.random() * 4) | 0) }, () => { const a = Math.random(); return [a, a + rnd(0.02, 0.12), Math.random() < 0.6 ? 0 : rnd(0.15, 0.4)]; });
        const gate = (u) => { let k = 1; for (const [a, b, v] of cuts) if (u > a && u < b) k = Math.min(k, v); return k; };
        const f = (u) => (base + (top - base) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.8)) * (1 + dr(u)) * (1 - 0.15 * ramp(u, 0.8, 1));
        const y = buzz(dur, f, (u) => Math.min(1, u * 8) * Math.min(1, (1 - u) * 6) * gate(u) * (0.75 + 0.25 * Math.sin(u * 60)),
          [[rnd(700, 820), 1, 0.02], [rnd(1250, 1450), 0.7, 0.012], [rnd(2100, 2500), 0.4, 0.008], [rnd(380, 450), 0.6, 0.03], [3400, 0.2, 0.005]], { duty: 0.12, jit: 0.02, shim: 0.3, clip: rnd(3, 5) });
        add(y, fric(dur, (u) => f(u) * 0.5, (u) => Math.min(1, u * 8) * gate(u) * 0.6, [[rnd(1800, 2600), 1, 0.01], [rnd(3500, 4500), 0.5, 0.006]], 0.4), 0, 0.3);
        for (const [a] of cuts) add(y, grains(0.06, 20, 2000, 7000, 0.002), a * dur, 0.25);
        return bq(y, 'hp', 180);
      }, 32000), 1, o.rate || 1);
    },
    metal_bang(d, t) { smp(d, t, take('metal_bang', 3, () => struck({ modes: plate(26, 1.8), f0: rnd(170, 190), T: 2.4, hf: 0.2, tc: 0.0008, glide: 0.02, len: 2.6 }), 24000), 0.6); nz(d, t, 0.12, 0.6, 'lowpass', 1200, 200); },
    drip(d, t) { smp(d, t, take('drip', 5, () => bubble(arr(0.12), 0, rnd(1.6, 2.6))), 1); },
    whisper(d, t) {
      const dur = rnd(1.4, 2.4);
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const b1 = ctx.createBiquadFilter(); b1.type = 'bandpass'; b1.Q.value = 6;
      const b2 = ctx.createBiquadFilter(); b2.type = 'bandpass'; b2.Q.value = 3;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      for (let k = 0, tt = t; tt < t + dur; k++) {
        const syl = rnd(0.06, 0.16);
        b1.frequency.setValueAtTime(rnd(1800, 3200), tt); b2.frequency.setValueAtTime(rnd(4500, 7000), tt);
        g.gain.linearRampToValueAtTime(Math.random() < 0.25 ? 0 : rnd(0.1, 0.32), tt + syl * 0.4);
        tt += syl;
      }
      g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
      s.connect(b1); s.connect(b2); b1.connect(g); b2.connect(g); g.connect(d); s.start(t); s.stop(t + dur + 0.2);
    },
    // knuckles on a door
    knock(d, t) { for (let i = 0; i < 3; i++) { smp(d, t + i * 0.28, take('knuckle', 4, () => struck({ modes: plate(12, 2.2), f0: rnd(120, 145), T: 0.12, hf: 2, tc: 0.002, grit: 0.3, click: 0.15 })), 0.75); nz(d, t + i * 0.28, 0.05, 0.4, 'bandpass', 400, null, 2); } },
    groan(d, t) {
      smp(d, t, take('groan', 3, () => { const dr = wander(6, 0.05); return voice(3.2, (u) => 46 * (1 - 0.22 * u) * (1 + dr(u)), { jit: 0.12, shim: 0.35, sub: 0.3, breath: 0.4, open: 0.006, air: 0.04, amp: (u) => Math.min(1, u * 3) * Math.min(1, (1 - u) * 3) * (0.8 + 0.2 * Math.sin(u * 4.4)), mouth: [[(u) => 420 + 80 * Math.sin(u * 3), 3, 1], [(u) => 780 + 120 * u, 4, 0.5], [2300, 6, 0.08]] }); }, 16000), 1);
      nz(d, t + 0.5, 1.5, 0.12, 'bandpass', 700, 400, 8, 0.4);
    },
    scream(d, t) {
      smp(d, t, take('scream', 3, () => { const dr = wander(10, 0.03); return voice(1.8, (u) => (u < 0.17 ? 650 + 650 * u / 0.17 : 1300 - 420 * (u - 0.17) / 0.83) * (1 + dr(u)) * (1 + 0.025 * Math.sin(TAU * 7 * u * 1.8)), { jit: 0.02, shim: 0.2, breath: 0.4, air: 0.06, clip: 1.6, amp: (u) => Math.min(1, u * 12) * (1 - u) ** 1.2, mouth: [[1050, 4, 1], [1600, 5, 0.7], [2900, 6, 0.4], [3600, 8, 0.2]] }); }), 1);
    },
    run_far(d, t) { for (let i = 0; i < 8; i++) S.step(d, t + i * 0.27, { surf: 'concrete', pitch: 0.9 }); },
    bell(d, t) { smp(d, t, take('bell', 2, () => struck({ modes: BELL, f0: 620, T: 2.6, hf: 0.03, tc: 0.0004, tilt: 0.2, len: 3 }), 24000), 0.45); },
    // a match struck: the scrape along the box, the flare catching, then the soft roar of it settling to a flame
    match(d, t) {
      nz(d, t, 0.09, 0.5, 'bandpass', 2600, 4200, 1.2, 0.004); for (let i = 0; i < 5; i++) nz(d, t + 0.02 + i * 0.016, 0.012, 0.35, 'highpass', 3000, null, 0.7, 0.001);
      nz(d, t + 0.1, 0.35, 0.4, 'bandpass', 1400, 700, 0.6, 0.01); nz(d, t + 0.12, 0.9, 0.12, 'lowpass', 900, 400, 0.5, 0.1, brownBuf);
    },
    // a valve radio warming up and hunting the dial: hiss swelling, stations whistling past as it crosses them, a
    // snatch of someone talking a long way off, then the static again
    radio_tune(d, t) {
      nz(d, t, 2.2, 0.16, 'bandpass', 1600, 2600, 0.5, 0.25);
      for (const [k, f0, f1] of [[0.3, 2600, 900], [0.95, 1800, 3400], [1.5, 3000, 1200]]) nz(d, t + k, 0.35, 0.3, 'bandpass', f0, f1, 30, 0.05);
      smp(filt(filt(d, 'bandpass', 900, 0.9), 'highpass', 300), t + 1.1, take('radio_voice', 3, () => talk(0.65), 24000), 0.12);
    },
    // an old flash gun: the shutter's click, its charging coil singing higher as the capacitor fills, the bulb's pop
    camflash(d, t) {
      nz(d, t, 0.015, 0.35, 'highpass', 3500, null, 0.8, 0.001); nz(d, t + 0.03, 0.02, 0.25, 'bandpass', 1800, null, 3, 0.001);
      smp(d, t + 0.06, take('flash_whine', 2, () => fade(buzz(0.9, (u) => 1800 * Math.pow(7800 / 1800, Math.pow(u, 0.7)), () => 1, [[4000, 1, 0.004], [8000, 0.5, 0.003]], { duty: 0.3, jit: 0.002 }), (u) => Math.min(1, u * 6) * Math.min(1, (1 - u) * 15)), 44100), 0.02);
      nz(d, t + 1.0, 0.09, 0.45, 'bandpass', 2400, 600, 0.7, 0.002);
      smp(d, t + 1.0, take('pop', 3, () => struck({ modes: [1, 1.7, 2.5], f0: rnd(140, 180), T: 0.08, hf: 2, tc: 0.002, grit: 0.5 })), 0.25);
    },
    // a fire extinguisher's blast: a hard rush of gas through the horn, sputtering out
    spray(d, t) { nz(d, t, 1.3, 0.55, 'highpass', 2200, 3800, 0.6, 0.03); nz(d, t, 1.3, 0.3, 'bandpass', 700, 400, 0.8, 0.03, brownBuf); nz(d, t + 1.2, 0.25, 0.25, 'highpass', 3000, null, 0.6, 0.01); },
    // a teddy bear's voice box: a weighted bellows sighing air past a tin reed, out through a little horn
    growler(d, t) { smp(d, t, take('growler', 3, () => voice(0.9, (u) => 210 * Math.pow(120 / 210, u) * (1 + 0.03 * Math.sin(TAU * 7 * u * 0.9)), { jit: 0.01, shim: 0.1, breath: 0.25, open: 0.0015, amp: (u) => Math.min(1, u * 10) * (1 - u * 0.6) * Math.min(1, (1 - u) * 12), mouth: [[(u) => 800 - 300 * u, 3, 1], [1650, 5, 0.4], [3000, 6, 0.15]] })), 1); },
    // a bulb horn squeezed twice: a brass reed buzzing in its little bell
    toot(d, t) { const b = take('toot', 3, () => voice(0.14, (u) => 590 * (1 - 0.01 * u), { jit: 0.005, shim: 0.05, breath: 0.15, open: 0.0006, amp: (u) => Math.min(1, u * 30) * Math.min(1, (1 - u) * 20), mouth: [[1180, 6, 1], [1485, 7, 0.7], [2400, 5, 0.4]] })); smp(d, t, b, 1); smp(d, t + 0.17, b, 1); },
    // a car horn: two electric diaphragm horns sounding together, a little rough
    horn(d, t) { smp(d, t, take('horn', 2, () => { const y = arr(1.2); for (const [f, k] of [[415, 1], [421, 1], [622, 0.65]]) add(y, buzz(1.1, () => f, (u) => Math.min(1, u * 40) * Math.min(1, (1 - u) * 20), [[f * 2.4, 1, 0.01], [1800, 0.7, 0.008], [f, 0.6, 0.03]], { duty: 0.18, jit: 0.002 }), 0, k); norm(y); for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i] * 1.5); return y; }), 1); },
    bang(d, t) { nz(d, t, 0.7, 1, 'lowpass', 8000, 250, 0.5, 0.002); smp(d, t, blast(), 1); },
    // your ears ringing after a blast
    tinnitus(d, t) { nz(d, t, 4.5, 0.6, 'bandpass', 4100, 3950, 80, 0.01); },
    // a grenade's pin pulled: the ring's thin ting, the spring clip
    pin(d, t) { smp(d, t, take('pin', 3, () => struck({ modes: BAR, f0: rnd(2400, 2700), T: 0.15, hf: 0.2, tc: 0.0001, click: 0.4 })), 0.3); nz(d, t, 0.03, 0.3, 'highpass', 3000); },
    // something crawling in the ducts: sheet metal popping and banging under its weight
    vent(d, t) {
      for (let i = 0; i < 16; i++) nz(d, t + i * 0.065 + Math.random() * 0.02, 0.04, 0.5, 'bandpass', rnd(1400, 3200), null, 3);
      smp(d, t + 1, take('duct', 3, () => struck({ modes: plate(16, 3), f0: rnd(120, 160), T: 0.4, hf: 0.8, tc: 0.004, glide: 0.04 })), 0.4);
    },
    static(d, t, o) { nz(d, t, o.dur || 0.3, 0.22, 'bandpass', 2200, null, 0.6, 0.01); },
    // a walkie-talkie: the hard plastic click of its talk button...
    radio_key(d, t) { nz(d, t, 0.008, 0.5, 'highpass', 2800, null, 0.8, 0.0008); nz(d, t + 0.006, 0.02, 0.22, 'bandpass', 1400, null, 4, 0.001); },
    // ...a channel opening on someone: a burst of hiss as the squelch lifts...
    squelch_on(d, t) { nz(d, t, 0.11, 0.42, 'bandpass', 3000, 1900, 0.8, 0.003); },
    // ...and closing: the squelch tail, a rush of static cut off dead
    squelch_off(d, t) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const bp = filt(d, 'bandpass', 2600, 0.7);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4, t + 0.012); g.gain.setValueAtTime(0.4, t + 0.17); g.gain.linearRampToValueAtTime(0.0001, t + 0.18);
      s.connect(g); g.connect(bp); s.start(t, Math.random() * 2); s.stop(t + 0.2);
    },
    radio_ghost(d, t) {
      nz(d, t, 2.4, 0.18, 'bandpass', 2000, null, 0.6, 0.05);
      const bp = filt(d, 'bandpass', 1500, 1.2); const w = shaper(bp, 15);
      S.whisper(w, t + 0.4);
    },
    // a wind-up music box: the pins on its drum plucking the steel comb's teeth, the works ticking under it
    toy(d, t) { smp(d, t, take('toy', 2, () => { const y = arr(1.4); [523, 659, 784, 659, 1046, 988].forEach((f, i) => add(y, struck({ modes: BAR, f0: f, T: 0.6, hf: 0.15, tc: 0.0002, spread: 0.002, tilt: 1 }), i * 0.13, 0.6)); return add(y, grains(0.8, 24, 2500, 4000, 0.004), 0, 0.12); }), 1); },
    // a rotary phone's bells: a hammer trilling between two of them
    ring(d, t) {
      const b = take('ring', 2, () => { const y = arr(1); for (const [f0, off] of [[1630, 0], [1720, 0.025]]) { const x = new Float32Array(nS(0.42)); for (let k = 0; k < 8; k++) x[nS(off + k * 0.05)] = 1; modes(y, x, BELL.map((r) => [f0 * r * (1 + wn() * 0.003), 1 / Math.pow(r, 0.3), 0.6 / (1 + 0.05 * f0 * r / 1000)])); } return y; });
      smp(d, t, b, 1); smp(d, t + 0.55, b, 1);
    },
    // a doorbell chime: felt hammers on three tuned tubes
    chime(d, t) { smp(d, t, take('chime', 2, () => { const y = arr(1.5); [523, 659, 784].forEach((f, i) => add(y, struck({ modes: BAR, f0: f, T: 0.9, hf: 0.05, tc: 0.0015, spread: 0.002, tilt: 1.2 }), i * 0.18, 0.6)); return y; }), 1); },
    thunder(d, t) {
      nz(d, t, 0.25, 0.6, 'highpass', 1800, 600, 0.6, 0.003);
      const lp = filt(d, 'lowpass', 300, 0.7); lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(70, t + 3.5);
      const s = ctx.createBufferSource(); s.buffer = brownBuf; s.loop = true;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.6, t + 0.08);
      for (let k = 1; k < 8; k++) g.gain.linearRampToValueAtTime(rnd(0.5, 1.5) * (1 - k / 9), t + k * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
      s.connect(g); g.connect(lp); s.start(t); s.stop(t + 4);
    },
    // the charging station taking a battery: its transformer humming up, the charger's coil singing higher as it fills
    charge(d, t) {
      smp(d, t, take('charge', 2, () => add(buzz(1.3, (u) => 220 * Math.pow(1400 / 220, u), (u) => Math.min(1, u * 8) * Math.min(1, (1 - u) * 8), [[2000, 1, 0.006], [4200, 0.4, 0.004], [900, 0.4, 0.01]], { duty: 0.3 }),
        buzz(1.3, () => 100, (u) => Math.min(1, u * 4) * Math.min(1, (1 - u) * 4), [[200, 1, 0.04], [300, 0.5, 0.03]], { duty: 0.45 }), 0, 0.4)), 0.08);
      nz(d, t, 1.2, 0.05, 'bandpass', 2400, 5200, 2, 0.1);
    },
    pant(d, t) { nz(d, t, 0.35, 0.12, 'bandpass', 900, 600, 1, 0.1); nz(d, t + 0.42, 0.4, 0.09, 'bandpass', 700, 500, 1, 0.1); },
    gong(d, t) { smp(d, t, take('gong', 2, () => struck({ modes: DRUM.concat([4.6, 5.2, 5.9, 6.6]), f0: 110, T: 3.5, hf: 0.15, tc: 0.004, glide: 0.03, tilt: 0.3, len: 3.8 }), 24000), 0.5); },
    fired(d, t) { S.alarm(lv(d, 'alarm'), t); S.ship_door(d, t + 1.6); nz(d, t + 2.5, 3, 0.8, 'lowpass', 3000, 200, 0.5, 0.05, brownBuf); },
    // ---- ambience one-shots ----
    // a dead trunk flexing in the wind: wood sticking and slipping against itself
    creak(d, t) {
      smp(d, t, take('creak', 5, () => { const dur = rnd(0.7, 1.8), f0 = rnd(55, 120), f1 = f0 * rnd(0.6, 1.5); return fric(dur, (u) => f0 + (f1 - f0) * u, (u) => Math.sin(Math.PI * u) * rnd(0.3, 1), [[rnd(420, 800), 1, 0.05], [rnd(1400, 2300), 0.6, 0.035], [rnd(200, 300), 0.5, 0.08]], 0.35); }, 24000), 1);
    },
    branch_snap(d, t) {
      nz(d, t, 0.03, 0.9, 'highpass', 1800); nz(d, t + 0.01, 0.07, 0.5, 'bandpass', 900, 450, 3);
      for (let i = 0; i < 4; i++) nz(d, t + 0.22 + i * 0.11 + Math.random() * 0.05, 0.05, 0.22, 'bandpass', rnd(400, 1300), null, 2);
      smp(d, t + 0.7, take('branch_land', 3, () => struck({ modes: plate(8, 3), f0: rnd(85, 110), T: 0.08, hf: 2, tc: 0.006, grit: 0.5 })), 0.35);
      nz(d, t + 0.7, 0.12, 0.25, 'lowpass', 700, 200);
    },
    // a crow: a harsh, rasping caw (its syrinx rattling), one to three of them
    caw(d, t, o) {
      const n = o.n || 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) smp(d, t + i * rnd(0.38, 0.6), take('caw', 5, () => { const dur = rnd(0.2, 0.32), f = rnd(470, 620); return voice(dur, (u) => f * (u < 0.15 ? 1.3 - 2 * u : 1 - 0.25 * (u - 0.15)) * (1 + 0.06 * Math.sin(TAU * 36 * u * dur)), { jit: 0.05, shim: 0.35, sub: 0.3, breath: 0.6, open: 0.0007, clip: 3, amp: (u) => Math.min(1, u * 15) * Math.min(1, (1 - u) * 6), mouth: [[rnd(1100, 1500), 2.5, 1], [(u) => 1900 - 700 * u, 3, 0.5], [3200, 4, 0.2]] }); }), 1);
    },
    // a cricket: a file on one wing drawn across a scraper on the other, each tooth's tick ringing the wing at its note
    cricket(d, t, o) {
      const f = Math.round((o.f || rnd(4300, 5200)) / 300) * 300;
      smp(d, t, take('cricket' + f, 3, () => { const y = arr(0.25), n = 3 + Math.floor(Math.random() * 2); for (let s = 0; s < n; s++) { const x = new Float32Array(nS(0.026)); for (let i = 0; i < x.length; i += Math.round(SR / f)) x[i] = Math.sin(Math.PI * i / x.length); modes(y, x, [[f, 1, 0.012], [f * 2, 0.15, 0.008]], nS(s * 0.046)); } return y; }, 44100), 1);
    },
    // an owl: soft, breathy hoots
    owl(d, t) { smp(d, t, take('owl', 3, () => { const y = arr(1.6); for (const [k, l] of [[0, 0.42], [0.62, 0.3], [0.98, 0.55]]) { const f0 = rnd(360, 390); add(y, voice(l, (u) => f0 * (1 - 0.12 * u), { jit: 0.004, shim: 0.03, breath: 0.6, air: 0.1, amp: (u) => Math.min(1, u * 6) * Math.min(1, (1 - u) * 4), mouth: [[380, 6, 1], [700, 6, 0.15]] }), k); } return y; }, 16000), 1); },
    // something huge and metal settling, a long way off: a structure dragging against itself, its great plates ringing
    far_groan(d, t) {
      smp(d, t, take('far_groan', 3, () => { const dur = rnd(3, 5), f = rnd(36, 58), f1 = f * rnd(0.82, 1.18), b = rnd(70, 90); return bq(fric(dur, (u) => f + (f1 - f) * u + 2 * Math.sin(u * 7), (u) => Math.min(1, u * 3) * Math.min(1, (1 - u) * 2.5) * rnd(0.5, 1), plate(20, 2.4).map(([r, a]) => [b * r, a, 1.5 / (1 + r * 0.2)]), 0.3), 'lp', 900, 0.7); }, 16000), 1);
    },
    // pipes ticking as they cool
    pipe_tick(d, t) { const n = 2 + Math.floor(Math.random() * 4); for (let i = 0, tt = t; i < n; i++, tt += rnd(0.12, 0.5)) smp(d, tt, take('pipe_tick', 6, () => struck({ modes: BAR, f0: rnd(530, 990), T: 0.18, hf: 0.2, tc: 0.0001, tilt: 0.2 })), 1); },
    scurry(d, t) { const n = 10 + Math.floor(Math.random() * 14); let tt = t; for (let i = 0; i < n; i++) { tt += rnd(0.025, 0.07); nz(d, tt, 0.02, 0.18, 'bandpass', rnd(2500, 5200), null, 3, 0.002); } if (Math.random() < 0.5) S.chitter(lv(d, 'chitter'), tt + 0.1); },
    // a failing lamp: sparks crackling, its ballast buzzing as it arcs
    zap(d, t) {
      for (let k = 0; k < 7; k++) nz(d, t + rnd(0, 0.3), 0.012, 0.32, 'highpass', 2800, null, 0.7, 0.001);
      smp(d, t, take('arc', 3, () => fade(buzz(0.35, () => 120, () => rnd(0.4, 1), [[900, 1, 0.006], [2100, 0.5, 0.004]], { duty: 0.08, jit: 0.02, shim: 0.6 }), (u) => Math.min(1, (1 - u) * 8))), 0.06);
    },
    // a pump somewhere in the walls, thumping
    thump(d, t) {
      smp(d, t, take('pump', 3, () => struck({ modes: [1, 1.5, 2.3, 3.1], f0: rnd(46, 54), T: 0.45, hf: 3, tc: 0.025, grit: 0.3 }), 16000), 0.55);
      nz(d, t, 0.32, 0.3, 'lowpass', 240, 70, 0.7, 0.01, brownBuf); nz(d, t + 0.05, 0.1, 0.06, 'bandpass', 900, null, 4, 0.002);
    },
    // rain: a drop into a puddle
    plink(d, t) { smp(d, t, take('plink', 6, () => bubble(arr(0.08), 0, rnd(0.8, 1.4))), 1); },
    // a console's buzzer chirping
    chirp(d, t) { smp(d, t, take('chirp', 4, () => { const f = rnd(1200, 2600), y = add(arr(0.2), piezo(0.08, () => f)); return Math.random() < 0.6 ? add(y, piezo(0.08, () => f * (Math.random() < 0.5 ? 1.5 : 0.75)), 0.09, 0.85) : y; }), 0.035); },
    hiss_valve(d, t) { nz(d, t, rnd(0.6, 1.3), 0.12, 'highpass', 3500, 5000, 0.6, 0.05); },
    // the hull ticking as it heats or cools
    hull_tick(d, t) { smp(d, t, take('hull_tick', 6, () => struck({ modes: plate(10, 1.8), f0: rnd(600, 1100), T: 0.08, hf: 0.5, tc: 0.0002, click: 0.2 })), 1); nz(d, t, 0.05, 0.08, 'bandpass', 2200, null, 4, 0.001); },
  };

  // how loud each sound sits in the mix (where its takes need bringing up or down to sit where it always has)
  const LEVEL = {
    spool: 0.7, ignite: 1.2, splash: 0.9, clown_step: 1.1, clown_giggle: 0.7, clown_box: 0.45, clown_honk: 0.4,
    step: 0.31, run_far: 0.31, click: 0.53, pickup: 0.65, door_open: 0.35, crunch: 1.5, stinger: 1.7,
    stinger_hi: 1.1, heartbeat: 0.54, crawler_screech: 0.41, crawler_growl: 1.5, ceramic: 0.23, slime_slosh: 0.27,
    slime_gurgle: 0.22, nest_breath: 0.3, slime_drip: 0.12, chitter: 0.11, hound_growl: 1.6, hound_roar: 0.55, howl: 0.17,
    can_open: 0.71, wrapper: 0.51, death_rattle: 1.4, warp_charge: 1.5, servo: 0.45, glint: 0.12, beep: 0.75,
    err: 1.5, scan: 2, locker_open: 0.6, alarm: 0.62, power_down: 1.6, metal_bang: 1.4, drip: 0.17, knock: 1.3,
    groan: 1.4, scream: 0.23, bell: 1.5, camflash: 1.3, growler: 0.16, toot: 0.078, horn: 0.3, tinnitus: 1.6,
    pin: 0.67, toy: 0.065, ring: 0.089, chime: 0.17, gong: 1.3, charge: 1.8, creak: 0.16, caw: 0.18, cricket: 0.034,
    owl: 0.27, far_groan: 0.7, pipe_tick: 0.15, zap: 0.71, plink: 0.11, chirp: 0.6, hull_tick: 0.12,
    em_breaker: 1.5, em_lamp: 0.5, em_alarm: 0.35, heel: 0.9, sister_twitch: 1.2, sister_slash: 1.5, sister_breath: 0.6, bound_groan: 0.65, bound_retch: 0.75, bound_rise: 1, blade_drag: 0.8, blade_lift: 1, blade_floor: 1.4, heavy_step: 1.3, hood_rattle: 0.5
  };

  // ---------- routing ----------
  function setPannerPos(p, x, y, z) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else p.setPosition(x, y, z);
  }
  function out(pos, o) {
    const g = ctx.createGain(); g.gain.value = o.vol ?? 1;
    let node = g;
    if (pos) {
      let occ = o.occl;
      if (occ == null && occlusionFn) occ = occlusionFn(pos);
      if (occ > 0) {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lerp(16000, 450, occ);
        g.gain.value *= 1 - occ * 0.4;
        node.connect(lp); node = lp;
      }
      const p = ctx.createPanner();
      p.panningModel = o.pan || 'HRTF'; p.distanceModel = 'inverse';
      p.refDistance = o.ref ?? 2; p.maxDistance = 300; p.rolloffFactor = o.roll ?? 1.25;
      setPannerPos(p, pos.x, pos.y, pos.z);
      node.connect(p); p.connect(sfxBus);
      const s = ctx.createGain(); s.gain.value = o.rev ?? envRev; p.connect(s); s.connect(revIn);
    } else {
      node.connect(sfxBus);
      if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; node.connect(s); s.connect(revIn); }
    }
    return g;
  }

  // ---------- ambience loops ----------
  function loopSrc(buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; }
  function lfo(rate, depth, target) { const l = ctx.createOscillator(); l.frequency.value = rate; const g = ctx.createGain(); g.gain.value = depth; l.connect(g); g.connect(target); l.start(); return l; }
  // a bed whose loop is worked out in the quiet after startup, joining in (into to) once it's ready
  function bed(key, make, sr, to, then) { jobs.push(() => { const s = loopSrc(take(key, 1, make, sr)); s.connect(to); if (then) then(s); }); }
  function startAmbience() {
    // facility interior: big fans somewhere in the walls, their blades thumping the air down the ducts, the rumble of
    // the air handling, and a faint hiss
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150; lp.connect(g);
      const b = loopSrc(brownBuf); const bg = ctx.createGain(); bg.gain.value = 0.9; b.connect(bg); bg.connect(lp);
      const fg = ctx.createGain(); fg.gain.value = 0.4; lfo(0.05, 0.06, fg.gain); fg.connect(g);
      bed('fan_hall', () => looped(fan(9.5, 41.2, [[41.2, 1, 0.6], [61.7, 0.6, 0.5], [82.9, 0.35, 0.4], [124, 0.2, 0.3]]), 1), 8000, fg, (f) => lfo(0.03, 0.012, f.playbackRate));
      const h = loopSrc(noiseBuf); const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 5200; hf.Q.value = 0.8;
      const hg = ctx.createGain(); hg.gain.value = 0.012; h.connect(hf); hf.connect(hg); hg.connect(g);
      loops.interior = g;
    }
    // wind: a low rumble, a wide moving body that breathes with the gusts, a whistle that only sings in strong ones,
    // and dry grass hissing. The gust level is driven from ambience().
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      const rum = loopSrc(brownBuf), rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 170;
      const rg = ctx.createGain(); rg.gain.value = 0.45; rum.connect(rlp); rlp.connect(rg); rg.connect(g);
      const body = [];
      for (const pan of [-0.7, 0.7]) {
        const s = loopSrc(noiseBuf), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.8;
        lfo(0.05 + Math.random() * 0.05, 90, bp.frequency);
        const bg = ctx.createGain(); bg.gain.value = 0.3; const p = ctx.createStereoPanner(); p.pan.value = pan; lfo(0.03 + Math.random() * 0.03, 0.3, p.pan);
        s.connect(bp); bp.connect(bg); bg.connect(p); p.connect(g); body.push({ bp, bg });
      }
      const ws = loopSrc(noiseBuf), wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 1200; wbp.Q.value = 14;
      const wg = ctx.createGain(); wg.gain.value = 0; ws.connect(wbp); wbp.connect(wg); wg.connect(g);
      const gs = loopSrc(noiseBuf), ghp = ctx.createBiquadFilter(); ghp.type = 'highpass'; ghp.frequency.value = 3200;
      const gg = ctx.createGain(); gg.gain.value = 0.02; gs.connect(ghp); ghp.connect(gg); gg.connect(g);
      loops.wind = g; loops.windParts = { rg, body, wbp, wg, gg };
    }
    // rain: the hiss of a field of drops plus the low roar of a downpour
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      const s = loopSrc(noiseBuf); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
      s.connect(hp); hp.connect(lp); lp.connect(g);
      const r2 = loopSrc(brownBuf), r2lp = ctx.createBiquadFilter(); r2lp.type = 'lowpass'; r2lp.frequency.value = 500;
      const r2g = ctx.createGain(); r2g.gain.value = 0.5; r2.connect(r2lp); r2lp.connect(r2g); r2g.connect(g);
      loops.rain = g;
    }
    // rain drumming on the hull, heard from inside the ship
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      const s = loopSrc(noiseBuf), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.6;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      const am = ctx.createGain(); am.gain.value = 0.7; lfo(13, 0.25, am.gain); lfo(7.3, 0.15, am.gain);
      s.connect(bp); bp.connect(lp); lp.connect(am); am.connect(g);
      const t2 = loopSrc(brownBuf), t2lp = ctx.createBiquadFilter(); t2lp.type = 'lowpass'; t2lp.frequency.value = 220;
      const t2g = ctx.createGain(); t2g.gain.value = 0.6; t2.connect(t2lp); t2lp.connect(t2g); t2g.connect(g);
      loops.hull = g;
    }
    // fluorescent lamps' buzz: their ballasts' cores humming at twice the mains, the fittings rattling with it
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      const bg = ctx.createGain(); bg.gain.value = 0.09; bg.connect(g);
      bed('ballast', () => looped(buzz(3.5, () => 120, () => 1, [[2600, 1, 0.006], [1300, 0.5, 0.01], [240, 0.9, 0.05], [5200, 0.3, 0.004]], { duty: 0.3, jit: 0.002, shim: 0.08 }), 0.5), 24000, bg);
      loops.buzz = g;
    }
    // orbit: a few cellos and violas holding a slow, cold chord, the bows changing now and then (worked out in the
    // quiet after startup, and joining in once it's ready: see padStart)
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.7; lfo(0.025, 500, lp.frequency); lp.connect(g);
      loops.pad = g; loops.padIn = lp;
    }
    // ship hum: the life support's fans
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      const fg = ctx.createGain(); fg.gain.value = 0.3; fg.connect(g);
      bed('fan_ship', () => looped(fan(7.5, 55, [[55, 1, 0.5], [110, 0.4, 0.4], [165, 0.15, 0.3]]), 1), 8000, fg);
      const s = loopSrc(noiseBuf); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; const sg = ctx.createGain(); sg.gain.value = 0.18;
      s.connect(lp); lp.connect(sg); sg.connect(g);
      loops.ship = g;
    }
    // the ship's thrusters: a roar that follows the throttle (brown rumble, jet hiss, a beating low drone)
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(sfxBus);
      const s = loopSrc(brownBuf), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200; lp.Q.value = 0.8;
      s.connect(lp); lp.connect(g);
      const h = loopSrc(noiseBuf), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.6;
      const hg = ctx.createGain(); hg.gain.value = 0.0; lfo(17, 0.02, hg.gain); h.connect(bp); bp.connect(hg); hg.connect(g);
      // (and the burn's ragged throb, faster as the throttle opens: thrustRate)
      const olp = ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 160; const og = ctx.createGain(); og.gain.value = 0.8;
      olp.connect(og); og.connect(g);
      bed('burn', () => looped(add(buzz(5, () => 38, () => rnd(0.3, 1), [[38, 1, 0.15], [76, 0.6, 0.1], [120, 0.3, 0.06]], { duty: 0.5, jit: 0.25, shim: 0.6 }), norm(bq(noise(5.1), 'lp', 200, 0.7)), 0, 0.5), 0.8), 8000, olp, (o) => { loops.thrustRate = o.playbackRate; });
      loops.thrust = g; loops.thrustLp = lp; loops.thrustHiss = hg;
      // (outside, heard from where the ship is: panned, not made quieter by it, as the game sets its level)
      g.disconnect(); const pan = ctx.createPanner(); pan.panningModel = 'equalpower'; pan.distanceModel = 'linear'; pan.rolloffFactor = 0; g.connect(pan); pan.connect(sfxBus); loops.thrustPan = pan;
    }
    // wind tearing past an open hatch in flight
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(sfxBus);
      const s = loopSrc(noiseBuf), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.7; lfo(0.23, 240, bp.frequency);
      const am = ctx.createGain(); am.gain.value = 0.8; lfo(0.4, 0.25, am.gain);
      const s2 = loopSrc(brownBuf), lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 260;
      s.connect(bp); bp.connect(am); am.connect(g); s2.connect(lp2); lp2.connect(g);
      loops.gale = g;
    }
    // deep space
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      const s = loopSrc(brownBuf); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 90; lp.Q.value = 2; s.connect(lp); lp.connect(g);
      loops.space = g;
    }
  }
  // per environment: bed levels, how much reverb, and which space the reverb sounds like
  const ENVS = {
    menu: { interior: 0.55, wind: 0, rain: 0, hull: 0, ship: 0, space: 0, pad: 0, buzz: 1, rev: 0.4, room: 'hall' },
    interior: { interior: 0.7, wind: 0, rain: 0, hull: 0, ship: 0, space: 0, pad: 0, buzz: 1, rev: 0.5, room: 'hall' },
    exterior: { interior: 0, wind: 0.55, rain: 1, hull: 0, ship: 0, space: 0, pad: 0, buzz: 0, rev: 0.22, room: 'open' },
    ship: { interior: 0, wind: 0.2, rain: 0.25, hull: 1, ship: 0.3, space: 0, pad: 0, buzz: 0, rev: 0.2, room: 'room' },
    orbit: { interior: 0, wind: 0, rain: 0, hull: 0, ship: 0.35, space: 0.5, pad: 0.55, buzz: 0, rev: 0.2, room: 'room' },
    silent: { interior: 0, wind: 0, rain: 0, hull: 0, ship: 0, space: 0, pad: 0, buzz: 0, rev: 0.2, room: 'hall' },
  };
  let curEnv = 'menu', rainAmt = 0, windAmt = 1;
  const rooms = {};
  function applyEnv() {
    if (!ready) return;
    const e = ENVS[curEnv] || ENVS.menu, t = ctx.currentTime;
    loops.interior.gain.setTargetAtTime(e.interior, t, 0.6);
    loops.wind.gain.setTargetAtTime(e.wind * windAmt, t, 0.6);
    loops.rain.gain.setTargetAtTime(e.rain * rainAmt * 0.35, t, 0.6);
    loops.hull.gain.setTargetAtTime(e.hull * rainAmt * 0.3, t, 0.6);
    loops.ship.gain.setTargetAtTime(e.ship, t, 0.6);
    loops.space.gain.setTargetAtTime(e.space, t, 0.6);
    loops.pad.gain.setTargetAtTime(e.pad, t, 2.5);
    if (!e.buzz) loops.buzz.gain.setTargetAtTime(0, t, 0.3);
    for (const k in rooms) rooms[k].gain.setTargetAtTime(k === e.room ? 1 : 0, t, 0.4);
    envRev = e.rev;
  }
  // ---- ambience director: gusts, lamp buzz, and positional one-shots that make each place feel alive ----
  const amb = { gust: 0.4, gustTarget: 0.4, gustT: 0, paramT: 0, timers: {}, buzz: 0 };
  function every(key, dt, min, max, fn) {
    let t = amb.timers[key]; if (t == null) t = rnd(min * 0.3, max);
    t -= dt; if (t <= 0) { fn(); t = rnd(min, max); }
    amb.timers[key] = t;
  }
  const around = (c, r0, r1, y0 = 0, y1 = 0) => { const a = Math.random() * TAU, d = rnd(r0, r1); return new THREE.Vector3(c.x + Math.cos(a) * d, c.y + rnd(y0, y1), c.z + Math.sin(a) * d); };
  // ---------- the chase ----------
  // When something's running you down the music comes in, the way it does in those films: a few violins wailing in a
  // tight, sour cluster up near the bridge, the bows shivering in a tremolo and the notes sliding about; under them two
  // basses bowing a low drone a semitone apart; now and then a bow digging in and scraping; and now and then a voice
  // rising up out of it and falling away. It swells as the thing closes on you (the violins winding higher) and dies
  // away slowly once it's lost you. (The players are worked out in the quiet after startup; any not ready yet sit out.)
  const chase = { g: null, level: 0, nextWail: 0, nextScrape: 0 };
  // a violin up near the bridge, tremolo, its note sliding to somewhere new every second or two
  function chaseViolin(dur, f0) {
    const N = nS(dur), R = new Float32Array(N); let cur = 1, tgt = 1, next = 0, tau = 0.5;
    for (let i = 0; i < N; i++) { if (i >= next) { next = i + nS(rnd(0.8, 2.2)); tgt = rnd(0.94, 1.08); tau = rnd(0.3, 0.9); } cur += (tgt - cur) / (tau * SR); R[i] = cur; }
    const vr = rnd(5, 7), ph = rnd(0, TAU), tr = rnd(11.5, 13.5), tp = rnd(0, TAU), k = rnd(0.16, 0.22);
    return bowing(dur, (u) => f0 * R[Math.min(N - 1, (u * N) | 0)] * (1 + 0.012 * Math.sin(TAU * vr * u * dur + ph)), (u) => k * Math.tanh(2.5 * Math.sin(TAU * tr * u * dur + tp)), { beta: rnd(0.035, 0.06), press: rnd(2.2, 3), rosin: 0.06 });
  }
  // a double bass, low over the fingerboard, the bow changing every few seconds
  function chaseBass(dur, f0) {
    const vr = rnd(4, 5), ph = rnd(0, TAU), bc = rnd(2.5, 3.5), off = rnd(0, bc);
    return bowing(dur, (u) => f0 * (1 + 0.003 * Math.sin(TAU * vr * u * dur + ph)), (u) => { const s = ((u * dur + off) % bc) / bc; return 0.12 * (s < 0.5 ? 1 : -1) * Math.min(1, Math.min(s, Math.abs(s - 0.5), 1 - s) * bc * 8); }, { beta: 0.16, press: 3.5 });
  }
  // a voice, high and thin, rising out of it and falling away
  const wail = () => { const a = rnd(420, 560), b = rnd(820, 1050), c = rnd(500, 650), dr = wander(8, 0.02);
    return voice(3, (u) => (u < 0.55 ? a + (b - a) * Math.sin(u / 0.55 * Math.PI / 2) : b + (c - b) * (u - 0.55) / 0.45) * (1 + dr(u)) * (1 + 0.025 * Math.sin(TAU * 5.5 * u * 3)), { jit: 0.006, shim: 0.06, breath: 0.35, air: 0.04, amp: (u) => Math.min(1, u * 4) * Math.min(1, (1 - u) * 3),
      mouth: [[(u) => 420 + 200 * Math.sin(Math.PI * u), 6, 1], [(u) => 850 + 250 * Math.sin(Math.PI * u), 7, 0.45], [2700, 8, 0.12]] }); };
  // a bow dug in hard and dragged, the string crunching under it
  const scrape = () => { const f0 = rnd(900, 1600), d = rnd(0.35, 0.7); return fade(bowed(d, (u) => f0 * (1 + 0.05 * u), (u) => 0.3 * Math.min(1, u * 20), { beta: 0.02, press: 0.9, rosin: 0.2 }), (u) => Math.min(1, u * 15) * Math.min(1, (1 - u) * 6)); };
  function chaseBuild() {
    const out = ctx.createGain(); out.gain.value = 0; out.connect(sfxBus); chase.g = out;
    chase.hi = ctx.createGain(); chase.hi.gain.value = 0.38; chase.hi.connect(out);
    chase.lo = ctx.createGain(); chase.lo.gain.value = 0.25; chase.lo.connect(filt(out, 'lowpass', 600, 0.7));
  }
  const pick = (key) => { const b = bank[key]; return b && b.length ? b[(Math.random() * b.length) | 0] : null; };
  // level: 0 (nothing after you) to 1 (it's right there); now: cut it at once (leaving the game)
  function chaseTick(dt, level, now) {
    if (!ready || ctx.state !== 'running') return;
    if (!chase.g) { if (level <= 0) return; chaseBuild(); }
    if (!chase.sHi && pick('chase_hi')) { chase.sHi = loopSrc(pick('chase_hi')); chase.sHi.connect(chase.hi); }
    if (!chase.sLo && pick('chase_lo')) { chase.sLo = loopSrc(pick('chase_lo')); chase.sLo.connect(chase.lo); }
    const t = ctx.currentTime;
    chase.level = now ? 0 : damp(chase.level, level, level > chase.level ? 1.4 : 0.3, dt);
    chase.g.gain.setTargetAtTime(Math.pow(chase.level, 1.3) * 0.55, t, now ? 0.01 : 0.1);
    if (chase.level < 0.01) return;
    if (chase.sHi) chase.sHi.playbackRate.setTargetAtTime(1 + chase.level * 0.06, t, 0.6);
    chase.nextWail -= dt;
    if (chase.nextWail <= 0) { chase.nextWail = rnd(3, 7); const b = pick('wail'); if (b) smp(chase.g, t, b, 0.12); }
    chase.nextScrape -= dt;
    if (chase.nextScrape <= 0) { chase.nextScrape = rnd(1.2, 3.5) / (0.4 + chase.level); const b = pick('scrape'); if (b) smp(chase.hi, t, b, rnd(0.2, 0.45)); }
  }
  // ---------- worked out in the quiet ----------
  // The heavy takes (the music, the long drones) and a first take of everything else are worked out a piece at a time
  // just after startup, between frames, so as little as possible has to be made the moment it's first heard.
  const jobs = [];
  let working = false;
  function work() {
    const t0 = performance.now();
    while (jobs.length && performance.now() - t0 < 10) { try { jobs.shift()(); } catch (e) { console.warn('sound prep', e); } }
    if (jobs.length) setTimeout(work, 40); else working = false;
  }
  function kick() { if (!working) { working = true; setTimeout(work, 40); } }
  // a take of several players, worked out a second of it at a time, one player after another, and laid together when
  // the last is done (made a loop, overlapping by xf, if xf)
  function ensemble(key, dur, xf, sr, players) {
    let acc = null;
    players.forEach((pl, i) => {
      let b = null;
      const job = () => {
        const keep = SR; SR = sr;
        try {
          (b || (b = pl(dur + xf))).run(nS(1));
          if (!b.done()) { jobs.unshift(job); return; }
          add(acc || (acc = arr(dur + xf)), b.y, b.at || 0);
          if (i === players.length - 1) (bank[key] || (bank[key] = [])).push(toBuf(xf ? looped(acc, xf) : acc));
        } finally { SR = keep; }
      };
      jobs.push(job);
    });
  }
  // the orbit chord's players: cellos and violas over the fingerboard, the bow swelling and easing through each stroke
  const padPlayer = (f0) => (dur) => { const bc = rnd(3.5, 5.5), off = rnd(0, bc), vr = rnd(4, 5.5), ph = rnd(0, TAU);
    return bowing(dur, (u) => f0 * (1 + 0.003 * Math.sin(TAU * vr * u * dur + ph)), (u) => { const s = ((u * dur + off) % bc) / bc; return 0.07 * (s < 0.5 ? 1 : -1) * Math.sqrt(Math.sin(Math.PI * ((s * 2) % 1))); }, { beta: 0.2, press: 3.5 }); };
  function prepare() {
    ensemble('pad', 12, 2, 24000, [55, 82.41, 110, 130.81, 164.81, 246.94].map(padPlayer));
    ensemble('chase_hi', 9, 1.5, 44100, [1180, 1250, 1325, 1405, 1490].map((f) => (dur) => chaseViolin(dur, f)));
    ensemble('chase_lo', 8, 1.5, 16000, [65.4, 69.3].map((f) => (dur) => chaseBass(dur, f)));
    for (let i = 0; i < 3; i++) jobs.push(() => take('wail', 3, wail, 32000));
    for (let i = 0; i < 4; i++) jobs.push(() => take('scrape', 4, scrape, 44100));
    // (and a first take of every sound, played into nothing)
    const sink = ctx.createGain(), quiet = (name, o = {}) => jobs.push(() => S[name](sink, ctx.currentTime, o));
    for (let i = 0; i < 2; i++) { ensemble('stinger', STING.dur, 0, STING.sr, section(STING.notes, STING.o)); ensemble('stinger_hi', STING_HI.dur, 0, STING_HI.sr, section(STING_HI.notes, STING_HI.o)); }
    for (const surf of ['concrete', 'metal', 'dirt']) quiet('step', { surf });
    for (const mat of ['metal', 'tin', 'glass', 'porcelain', 'wood', 'bone', 'plastic']) quiet('drop', { mat, w: 1 });
    for (const k of Object.keys(S)) if (!['step', 'drop', 'run_far', 'stinger', 'stinger_hi', 'fired'].includes(k)) quiet(k);
    // (every emergency fitting and every turn of the alarm its own: their takes worked out ahead, as they all come at once)
    for (let i = 0; i < 11; i++) quiet('em_lamp');
    for (let i = 0; i < 5; i++) quiet('em_alarm');
    working = true; setTimeout(work, 200);
  }
  // the orbit chord joining in once its players are ready
  function padStart() { if (!loops.padSrc && pick('pad')) { loops.padSrc = loopSrc(pick('pad')); const g = ctx.createGain(); g.gain.value = 0.23; loops.padSrc.connect(g); g.connect(loops.padIn); } }
  function ambience(dt, info) {
    if (!ready || SFX.held || ctx.state !== 'running') return;
    if (!loops.padSrc) padStart();
    const e = curEnv, cam = info.cam, t = ctx.currentTime, play = (n, p, o) => SFX.play(n, p, o);
    // gusts wander between calm and strong; storms gust harder
    amb.gustT -= dt;
    if (amb.gustT <= 0) { amb.gustT = rnd(1.8, 6); amb.gustTarget = clamp(Math.pow(Math.random(), 1.5) * (info.storm ? 1.35 : 1) + (info.storm ? 0.25 : 0), 0, 1.4); }
    // (the ship's own wind, lifting off or firing its mains nearby, comes in as a sudden hard gust: SFX.blastWind)
    const bw = Math.min(1.8, (SFX.blastWind || 0) * 1.5);
    amb.gust = damp(amb.gust, Math.max(amb.gustTarget, bw), bw > amb.gust ? 5 : 0.7, dt);
    amb.paramT -= dt;
    if (amb.paramT <= 0) {
      amb.paramT = 0.12;
      const W = loops.windParts, g = amb.gust;
      W.rg.gain.setTargetAtTime(0.3 + g * 0.45, t, 0.4);
      for (const b of W.body) { b.bg.gain.setTargetAtTime(0.12 + g * 0.45, t, 0.4); b.bp.frequency.setTargetAtTime(300 + g * 520, t, 0.6); }
      W.wg.gain.setTargetAtTime(Math.max(0, g - 0.65) * 0.5, t, 0.5); W.wbp.frequency.setTargetAtTime(900 + g * 900 + Math.random() * 120, t, 0.5);
      W.gg.gain.setTargetAtTime(0.01 + g * 0.05, t, 0.3);
      if (ENVS[e] && ENVS[e].buzz) {
        amb.buzz = info.buzz || 0;
        loops.buzz.gain.setTargetAtTime(amb.buzz * 0.32, t, 0.05);
      }
    }
    if (!cam) return;
    const night = info.night || 0, rain = rainAmt, indoorsShip = e === 'ship';
    if (e === 'exterior' || indoorsShip) {
      const occl = indoorsShip ? 0.65 : 0;
      // the dead forest
      if (info.trees && info.trees.length) every('creak', dt, 6 / (0.6 + amb.gust), 16 / (0.6 + amb.gust), () => {
        let best = null; for (let k = 0; k < 12; k++) { const tr = info.trees[Math.floor(Math.random() * info.trees.length)], d = Math.hypot(tr.x - cam.x, tr.z - cam.z); if (d > 8 && d < 38) { best = tr; break; } }
        if (best) play('creak', new THREE.Vector3(best.x, cam.y + rnd(3, 7), best.z), { vol: 0.5 + amb.gust * 0.4, ref: 6, occl, rev: 0.35 });
      });
      every('snap', dt, 28, 70, () => play('branch_snap', around(cam, 16, 40, 0, 2), { vol: 0.55, ref: 8, occl, rev: 0.4 }));
      if (night < 0.5 && rain < 0.5) every('crow', dt, 14, 38, () => play('caw', around(cam, 30, 70, 8, 20), { vol: 0.55, ref: 14, occl, rev: 0.5 }));
      if (night > 0.4 && rain < 0.5) {
        if (!amb.crickets) amb.crickets = [0, 1, 2, 3, 4].map(() => ({ p: around(cam, 6, 22), f: rnd(4300, 5200), t: rnd(0, 1) }));
        for (const c of amb.crickets) {
          if (Math.hypot(c.p.x - cam.x, c.p.z - cam.z) > 30) c.p = around(cam, 8, 22);
          c.t -= dt;
          if (c.t <= 0) { c.t = rnd(0.45, 1.1) + (Math.random() < 0.1 ? rnd(2, 5) : 0); play('cricket', c.p, { f: c.f, vol: 0.35 * night, ref: 3, occl, rev: 0.15 }); }
        }
        every('owl', dt, 30, 80, () => play('owl', around(cam, 35, 70, 6, 14), { vol: 0.5, ref: 12, occl, rev: 0.5 }));
      }
      if (info.complex) every('groan', dt, 22, 55, () => {
        const p = new THREE.Vector3(info.complex.x + rnd(-15, 15), cam.y + 6, info.complex.z + rnd(-15, 15));
        play(Math.random() < 0.6 ? 'far_groan' : 'metal_bang', p, { vol: 1.1, ref: 30, roll: 0.8, occl, rev: 0.6 });
      });
      if (rain > 0.2) every('drip', dt, 0.15, 0.6, () => play(indoorsShip ? 'hull_tick' : 'plink', indoorsShip ? around(cam, 0.5, 3, 1.4, 2.2) : around(cam, 1, 5, -1, 1), { vol: 0.25 * rain, ref: 2, rev: 0.1, pan: 'equalpower' }));
    }
    if (e === 'interior') {
      every('tick', dt, 5, 14, () => play('pipe_tick', around(cam, 4, 14, 1, 2.5), { vol: 0.45, ref: 3, rev: 0.6 }));
      every('drip2', dt, 3, 9, () => play('drip', around(cam, 3, 10, 0, 0.3), { vol: 0.5, ref: 3, rev: 0.8 }));
      every('scurry', dt, 35, 90, () => play('scurry', around(cam, 6, 14, 0, 0.2), { vol: 0.45, ref: 3, rev: 0.4 }));
      if (info.flickerLamp) every('zap', dt, 2.5, 7, () => play('zap', info.flickerLamp, { vol: 0.5, ref: 3, rev: 0.3 }));
      // a pump somewhere in the building, thumping away: walk toward it and it gets louder
      if (info.machine) every('thump', dt, 2.4, 2.6, () => play('thump', info.machine, { vol: 1.3, ref: 10, roll: 0.9, rev: 0.7 }));
    }
    if (e === 'ship' || e === 'orbit') {
      every('chirp', dt, 9, 26, () => play('chirp', info.console || around(cam, 2, 5, 0, 1), { vol: 0.35, ref: 2, rev: 0.2 }));
      every('valve', dt, 25, 60, () => play('hiss_valve', around(cam, 2, 6, -0.5, 1.5), { vol: 0.4, ref: 2, rev: 0.25 }));
      if (e === 'orbit') every('hullt', dt, 6, 18, () => play('hull_tick', around(cam, 2, 6, 0.5, 2.5), { vol: 0.5, ref: 2, rev: 0.3 }));
    }
  }

  return {
    get ready() { return ready; },
    get ctx() { return ctx; },
    get bus() { return sfxBus; },
    get revIn() { return revIn; },
    // (how much the place you're in echoes: the voices use it too)
    get envRev() { return envRev; },
    held: false, // true while single player is paused: keep audio suspended
    init() {
      if (ctx) { if (ctx.state !== 'running' && ctx.state !== 'closed' && !this.held) ctx.resume().catch(() => {}); return; }
      try {
        // (a slightly roomier buffer than the browser's quickest: a slower machine, busy with a storm and a crew's voices
        // at once, would otherwise run dry now and then and the sound would crackle and drop out)
        const AC = window.AudioContext || window.webkitAudioContext;
        try { ctx = new AC({ latencyHint: 'balanced' }); } catch (e) { ctx = new AC(); }
      } catch (e) { console.warn('No WebAudio', e); return; }
      // (to the speakers or headphones picked in VOICE & MIC, where the browser can choose)
      if (Settings.outId && ctx.setSinkId) ctx.setSinkId(Settings.outId).catch(() => {});
      comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
      master = ctx.createGain(); master.gain.value = Settings.volume;
      muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.5;
      sfxBus = ctx.createGain(); ambBus = ctx.createGain();
      sfxBus.connect(muffle); ambBus.connect(muffle); muffle.connect(master); master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = makeNoise(3); brownBuf = makeBrown(4);
      revIn = ctx.createGain(); revIn.gain.value = 0.6;
      // three acoustic spaces, crossfaded by environment: a long dark concrete hall, a tight metal cabin, open country
      const space = (ir, lpf, gain) => {
        const g = ctx.createGain(); g.gain.value = 0; const conv = ctx.createConvolver(); conv.buffer = ir;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpf;
        const out = ctx.createGain(); out.gain.value = gain;
        revIn.connect(g); g.connect(conv); conv.connect(lp); lp.connect(out); out.connect(muffle);
        return g;
      };
      rooms.hall = space(makeIR(3.6, 2.3), 5200, 1);
      rooms.room = space(makeRoomIR(0.75), 7000, 0.9);
      rooms.open = space(makeOpenIR(2.2), 3200, 1.1);
      SR = ctx.sampleRate; ready = true;
      startAmbience(); applyEnv(); prepare();
    },
    play(name, pos = null, o = {}) {
      if (!ready) return;
      const fn = S[name]; if (!fn) { console.warn('no sound', name); return; }
      try { const g = out(pos, o); g.gain.value *= LEVEL[name] ?? 1; fn(g, ctx.currentTime + (o.delay || 0), o); } catch (e) { console.warn('sound error', name, e); }
    },
    setEnv(e) { if (curEnv !== e) { curEnv = e; applyEnv(); } },
    ambience,
    chase: chaseTick,
    setWeather(rain, wind) { rainAmt = rain; windAmt = wind; applyEnv(); },
    // level 0..1 of the ship's engines as heard here (inside: through the hull; outside, from at), gale 0..1 through
    // an open hatch
    setThrust(level, inside, gale, at) {
      if (!ready) return;
      const t = ctx.currentTime;
      if (loops.thrustPan) { const l = ctx.listener, p = !inside && at ? at : l.positionX ? { x: l.positionX.value, y: l.positionY.value, z: l.positionZ.value } : _v; setPannerPos(loops.thrustPan, p.x, p.y, p.z); }
      loops.thrust.gain.setTargetAtTime(level * (inside ? 0.75 : 1.1), t, 0.12);
      loops.thrustLp.frequency.setTargetAtTime(140 + level * (inside ? 420 : 1300), t, 0.15);
      loops.thrustHiss.gain.setTargetAtTime(level * (inside ? 0.03 : 0.16), t, 0.15);
      if (loops.thrustRate) loops.thrustRate.setTargetAtTime((30 + level * 26) / 38, t, 0.25);
      loops.gale.gain.setTargetAtTime(gale * 0.7, t, 0.25);
    },
    setMuffle(x) { if (ready) muffle.frequency.setTargetAtTime(lerp(20000, 320, clamp(x, 0, 1)), ctx.currentTime, 0.08); },
    setVolume(v) { if (ready) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
    setOcclusion(fn) { occlusionFn = fn; },
    listener(cam) {
      if (!ready) return;
      const l = ctx.listener;
      // (facing down its -Z, the way a camera looks: the game's own view is carried by a plain Object3D, whose
      // getWorldDirection would give +Z and turn every sound round, left for right and front for back)
      const q = cam.getWorldQuaternion(_lq); cam.getWorldPosition(_v); _f.set(0, 0, -1).applyQuaternion(q); _u.set(0, 1, 0).applyQuaternion(q);
      if (l.positionX) {
        l.positionX.value = _v.x; l.positionY.value = _v.y; l.positionZ.value = _v.z;
        l.forwardX.value = _f.x; l.forwardY.value = _f.y; l.forwardZ.value = _f.z;
        l.upX.value = _u.x; l.upY.value = _u.y; l.upZ.value = _u.z;
      } else { l.setPosition(_v.x, _v.y, _v.z); l.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
    },
    setPannerPos,
    // (one sound rendered offline, as it comes out before placing and reverb: for checking levels)
    async render(name, o = {}, sec = 3) {
      const live = ctx, off = new OfflineAudioContext(1, Math.ceil(sec * live.sampleRate), live.sampleRate);
      ctx = off; try { const g = off.createGain(); g.gain.value = (o.vol ?? 1) * (LEVEL[name] ?? 1); g.connect(off.destination); S[name](g, 0.01, o); } finally { ctx = live; }
      return (await off.startRendering()).getChannelData(0);
    },
  };
})();
