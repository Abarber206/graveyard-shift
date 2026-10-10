'use strict';
// Fully procedural audio: every sound in the game is synthesized here with WebAudio.
const SFX = (() => {
  let ctx = null, master, comp, muffle, sfxBus, ambBus, revIn, noiseBuf, brownBuf, ready = false;
  let envRev = 0.25, occlusionFn = null;
  const loops = {};
  const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();

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

  // ---------- primitives ----------
  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
  }
  function osc(d, type, f0, f1, t, dur, vol, a = 0.004, detune = 0) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain(); env(g, t, a, vol, dur);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function nz(d, t, dur, vol, type = 'bandpass', f0 = 1000, f1 = null, q = 1, a = 0.003, buf = null) {
    const s = ctx.createBufferSource(); s.buffer = buf || noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = ctx.createGain(); env(g, t, a, vol, dur);
    s.connect(f); f.connect(g); g.connect(d);
    s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
    return f;
  }
  function shaper(d, k) { const w = ctx.createWaveShaper(); w.curve = distCurve(k); w.oversample = '2x'; w.connect(d); return w; }
  function filt(d, type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(d); return b; }
  function vib(o, t, dur, rate, depth) {
    const l = ctx.createOscillator(); l.frequency.value = rate; const g = ctx.createGain(); g.gain.value = depth;
    l.connect(g); g.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- sound recipes ----------
  const S = {
    step(d, t, o) {
      const p = (o.pitch || 1) * rnd(0.88, 1.12), surf = o.surf || 'concrete';
      if (surf === 'metal') { nz(d, t, 0.07, 0.3, 'bandpass', 3000 * p, 1500 * p, 1.2); osc(d, 'triangle', 380 * p, 260 * p, t, 0.12, 0.07); osc(d, 'sine', 110 * p, 60, t, 0.08, 0.3); }
      else if (surf === 'dirt') { nz(d, t, 0.14, 0.42, 'lowpass', 1200 * p, 250, 0.6, 0.012); osc(d, 'sine', 75 * p, 45, t, 0.09, 0.18); }
      else { nz(d, t, 0.075, 0.42, 'bandpass', 1500 * p, 600, 0.8); osc(d, 'sine', 90 * p, 50, t, 0.08, 0.28); }
    },
    slap(d, t, o) { const p = (o.pitch || 1) * rnd(0.9, 1.1); nz(d, t, 0.07, 0.8, 'lowpass', 800 * p, 200, 0.8); osc(d, 'sine', 75 * p, 38, t, 0.12, 0.9); nz(d, t, 0.04, 0.3, 'bandpass', 1400 * p, null, 2); },
    soft(d, t, o) { const p = (o.pitch || 1) * rnd(0.9, 1.1); nz(d, t, 0.1, 0.25, 'lowpass', 600 * p, 200, 0.7, 0.02); },
    click(d, t) { nz(d, t, 0.012, 0.45, 'highpass', 3200); nz(d, t + 0.004, 0.02, 0.25, 'bandpass', 2400, null, 6, 0.001); osc(d, 'sine', 1900, 1200, t, 0.02, 0.04, 0.001); },
    pickup(d, t) { nz(d, t, 0.12, 0.25, 'bandpass', 2200, 900, 1.5, 0.01); osc(d, 'sine', 160, 90, t + 0.02, 0.1, 0.25); },
    drop(d, t, o) {
      osc(d, 'sine', 150 * (o.pitch || 1), 45, t, 0.16, 0.6); nz(d, t, 0.1, 0.35, 'lowpass', 1800, 300, 0.7);
      if (o.metal) { osc(d, 'triangle', 520, 500, t, 0.5, 0.08); osc(d, 'sine', 1310, 1300, t, 0.35, 0.05); }
    },
    door_open(d, t) {
      nz(d, t, 0.03, 0.35, 'highpass', 2500);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      for (let k = 0; k < 14; k++) o.frequency.setValueAtTime(55 + Math.random() * 45 + k * 3, t + 0.05 + k * 0.055);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7; bp.frequency.setValueAtTime(700, t); bp.frequency.linearRampToValueAtTime(1500, t + 0.8);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.15); g.gain.linearRampToValueAtTime(0.35, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(bp); bp.connect(g); g.connect(d); o.start(t); o.stop(t + 1);
    },
    door_close(d, t) { S.door_open(d, t); osc(d, 'sine', 95, 42, t + 0.55, 0.22, 0.8); nz(d, t + 0.55, 0.15, 0.5, 'lowpass', 700, 150, 0.7); nz(d, t + 0.57, 0.03, 0.3, 'highpass', 2500); },
    door_slam(d, t) { osc(d, 'sine', 90, 35, t, 0.35, 1); nz(d, t, 0.3, 0.8, 'lowpass', 1200, 150, 0.7); [233, 377, 610].forEach((f, i) => osc(d, 'sine', f, f * 0.98, t, 0.8 - i * 0.2, 0.1)); },
    swing(d, t) { nz(d, t, 0.25, 0.45, 'bandpass', 300, 1800, 2, 0.08); },
    hit_flesh(d, t) { osc(d, 'sine', 120, 40, t, 0.18, 0.9); nz(d, t, 0.12, 0.6, 'lowpass', 900, 200, 1); nz(d, t + 0.02, 0.2, 0.3, 'bandpass', 500, 300, 3); },
    hit_metal(d, t) { [310, 487, 822, 1260].forEach((f, i) => osc(d, 'sine', f, f * 0.98, t, 0.9 - i * 0.12, 0.25 / (i + 1))); nz(d, t, 0.05, 0.5, 'highpass', 2000); },
    hurt(d, t) { osc(d, 'sine', 100, 40, t, 0.25, 0.9); nz(d, t, 0.2, 0.5, 'lowpass', 700, 150, 1); const w = shaper(d, 50); osc(w, 'sawtooth', 140, 70, t, 0.3, 0.18); },
    crunch(d, t) { for (let i = 0; i < 7; i++) nz(d, t + i * 0.035 + Math.random() * 0.02, 0.05, 0.7, 'bandpass', 600 + Math.random() * 2200, null, 2); osc(d, 'sine', 80, 30, t, 0.5, 1); },
    neck_snap(d, t) {
      nz(d, t, 0.02, 1, 'highpass', 2500); nz(d, t + 0.025, 0.035, 0.9, 'bandpass', 1800, null, 3);
      nz(d, t, 0.018, 0.85, 'bandpass', 2600, 900, 5, 0.001);
      for (let i = 0; i < 4; i++) nz(d, t + 0.07 + i * 0.03, 0.03, 0.6, 'bandpass', 900 + Math.random() * 900, null, 4);
      osc(d, 'sine', 60, 30, t, 0.6, 0.8);
    },
    stinger(d, t, o) {
      const base = 98 * (o.pitch || 1);
      const lp = filt(d, 'lowpass', 6000); lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(380, t + 2.6);
      [1, 1.059, 1.414, 1.498, 2.12, 2.83, 4.24].forEach((r) => osc(lp, 'sawtooth', base * r, base * r * 0.96, t, 2.8, 0.1, 0.008, (Math.random() - 0.5) * 25));
      nz(d, t, 1.2, 0.45, 'highpass', 5000, 700, 0.5, 0.004);
      osc(d, 'sine', 55, 28, t, 1.8, 1, 0.004);
    },
    stinger_hi(d, t) {
      const bp = filt(d, 'bandpass', 1500, 1.5);
      [1380, 1460, 1550, 1645].forEach((f) => { const o = osc(bp, 'sawtooth', f, f * 1.04, t, 1.9, 0.12, 0.02); vib(o, t, 1.9, rnd(5, 9), 25); });
      osc(d, 'sine', 48, 30, t, 1.4, 0.8, 0.004);
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
      const ramp = (u, a, b) => Math.min(1, Math.max(0, (u - a) / (b - a)));
      // (a pitch that drifts the way a voice does, never quite steady: a smooth random wander, depth either way)
      const wander = (knots, depth) => { const k = Array.from({ length: knots + 1 }, () => rnd(-depth, depth)); return (u) => { const x = u * knots, i = Math.min(knots - 1, Math.floor(x)), f = x - i, s = f * f * (3 - 2 * f); return k[i] + (k[i + 1] - k[i]) * s; }; };
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
      osc(d, 'sine', 64, 30, t + 0.82, 1.3, 0.3, 0.01);
      nz(d, t + 0.82, 0.9, 0.3, 'lowpass', 260, 90, 0.7, 0.02, brownBuf);
    },
    heartbeat(d, t) { osc(d, 'sine', 62, 38, t, 0.14, 0.9, 0.005); osc(d, 'sine', 56, 36, t + 0.22, 0.16, 0.65, 0.005); },
    crawler_screech(d, t) {
      const w = shaper(d, 30);
      const bp = filt(w, 'bandpass', 1200, 2);
      bp.frequency.setValueAtTime(1100, t); bp.frequency.linearRampToValueAtTime(2300, t + 0.35); bp.frequency.linearRampToValueAtTime(800, t + 1.3);
      [620, 655, 930, 1310].forEach((f) => { const o = osc(bp, 'sawtooth', f, f * 0.7, t, 1.4, 0.3, 0.03); vib(o, t, 1.4, rnd(20, 32), f * 0.06); });
      nz(w, t, 1.2, 0.35, 'bandpass', 3000, 1500, 1, 0.05);
    },
    crawler_growl(d, t) {
      const lp = filt(d, 'lowpass', 320, 2);
      const o = osc(lp, 'sawtooth', 46, 40, t, 1.4, 0.7, 0.2); vib(o, t, 1.4, 19, 8);
      nz(lp, t, 1.3, 0.5, 'lowpass', 400, null, 1, 0.2, brownBuf);
    },
    ceramic(d, t) {
      osc(d, 'sine', rnd(2800, 4200), null, t, 0.03, 0.22);
      nz(d, t, 0.05, 0.45, 'bandpass', rnd(2300, 4000), null, 4);
      nz(d, t + 0.03, 0.14, 0.22, 'bandpass', 900, 1700, 3, 0.02);
    },
    breath(d, t) { nz(d, t, 1.1, 0.25, 'bandpass', 700, 480, 1.3, 0.45); nz(d, t + 1.25, 1.3, 0.2, 'bandpass', 520, 340, 1.3, 0.3); },
    hiss(d, t) {
      const w = shaper(d, 20);
      nz(w, t, 1.4, 0.65, 'highpass', 2600, 4200, 0.7, 0.04);
      const o = osc(w, 'sawtooth', 78, 58, t, 1.4, 0.3, 0.05); vib(o, t, 1.4, 31, 12);
    },
    leech_drop(d, t) { osc(d, 'sine', 95, 38, t, 0.25, 0.9); nz(d, t, 0.2, 0.7, 'lowpass', 500, 150, 1); nz(d, t + 0.05, 0.3, 0.4, 'bandpass', 500, 1500, 6); },
    squelch(d, t) { for (let i = 0; i < 3; i++) nz(d, t + i * 0.11, 0.09, 0.45, 'bandpass', rnd(350, 900), 200, 5); },
    chitter(d, t) { for (let i = 0; i < 12; i++) { nz(d, t + i * 0.032, 0.014, 0.35, 'bandpass', rnd(2600, 4400), null, 9, 0.001); osc(d, 'sine', rnd(2000, 3200), 1500, t + i * 0.032, 0.012, 0.03, 0.001); } },
    hound_growl(d, t) {
      const lp = filt(d, 'lowpass', 380, 1.5);
      const o = osc(lp, 'sawtooth', 52, 46, t, 1.7, 0.75, 0.25); vib(o, t, 1.7, 22, 9);
      nz(lp, t, 1.6, 0.4, 'lowpass', 320, null, 1, 0.3, brownBuf);
    },
    hound_roar(d, t) {
      const w = shaper(d, 40);
      osc(w, 'sawtooth', 200, 80, t, 0.8, 0.5, 0.02); osc(w, 'sawtooth', 255, 95, t, 0.8, 0.4, 0.02);
      nz(w, t, 0.8, 0.55, 'bandpass', 900, 380, 1.2, 0.02);
    },
    howl(d, t) {
      const bp = filt(d, 'bandpass', 800, 1.8);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(240, t); o.frequency.linearRampToValueAtTime(430, t + 0.9); o.frequency.linearRampToValueAtTime(350, t + 2.6); o.frequency.linearRampToValueAtTime(190, t + 3.6);
      vib(o, t, 3.7, 5.5, 9);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28, t + 0.5); g.gain.linearRampToValueAtTime(0.22, t + 2.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.7);
      o.connect(g); g.connect(bp); o.start(t); o.stop(t + 3.8);
    },
    sniff(d, t) { for (let i = 0; i < 3; i++) nz(d, t + i * 0.13, 0.08, 0.22, 'highpass', 2200, null, 0.8, 0.02); },
    // pneumatic door: a valve cracks, air hisses out, the door glides on its rails with a thin whistle, seals with a puff
    ship_door(d, t) {
      nz(d, t, 0.05, 0.55, 'highpass', 2600, null, 0.7, 0.002);
      nz(d, t + 0.02, 0.95, 0.36, 'bandpass', 4300, 2500, 0.8, 0.012);
      nz(d, t + 0.05, 0.8, 0.12, 'highpass', 7200, 9500, 0.6, 0.06);
      nz(d, t + 0.1, 0.8, 0.12, 'bandpass', 950, 1500, 2.5, 0.18);
      const w = osc(d, 'sine', 2950, 2650, t + 0.08, 0.65, 0.011, 0.12); vib(w, t + 0.08, 0.65, 5, 25);
      osc(d, 'sine', 210, 120, t + 0.9, 0.1, 0.22, 0.002); nz(d, t + 0.9, 0.07, 0.25, 'lowpass', 1500, 400, 0.7, 0.002);
      nz(d, t + 0.93, 0.3, 0.14, 'highpass', 3200, null, 0.7, 0.01);
    },
    engine(d, t, o) {
      const dur = o.dur || 4;
      const lp = filt(d, 'lowpass', 200, 1);
      lp.frequency.setValueAtTime(150, t); lp.frequency.linearRampToValueAtTime(1100, t + dur * 0.4); lp.frequency.linearRampToValueAtTime(140, t + dur);
      const s = ctx.createBufferSource(); s.buffer = brownBuf; s.loop = true;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.2, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.connect(g); g.connect(lp); s.start(t); s.stop(t + dur + 0.1);
      const o2 = osc(filt(d, 'lowpass', 300), 'sawtooth', 38, 70, t, dur, 0.4, dur * 0.3); vib(o2, t, dur, 13, 3);
    },
    // snacks: a ring pull cracking and the fizz, a crinkling wrapper, then gulps or chewing
    can_open(d, t) {
      nz(d, t, 0.012, 0.9, 'bandpass', 3800, null, 4, 0.0005); osc(d, 'sine', 2300, 1400, t, 0.03, 0.08, 0.001); nz(d, t, 0.04, 0.7, 'highpass', 3500);
      nz(d, t + 0.03, 1.1, 0.22, 'highpass', 5200, 8000, 0.6, 0.02);
      for (let i = 0; i < 3; i++) { osc(d, 'sine', rnd(150, 190), 80, t + 0.6 + i * 0.34, 0.13, 0.5, 0.02); nz(d, t + 0.6 + i * 0.34, 0.1, 0.25, 'lowpass', 600, 200, 1, 0.02); }
    },
    wrapper(d, t) {
      for (let i = 0; i < 9; i++) nz(d, t + i * 0.045 + Math.random() * 0.02, 0.05, 0.45, 'bandpass', rnd(3000, 6500), null, 1.5);
      for (let i = 0; i < 4; i++) { nz(d, t + 0.55 + i * 0.22, 0.08, 0.55, 'bandpass', rnd(900, 1800), 500, 2); osc(d, 'sine', 110, 60, t + 0.55 + i * 0.22, 0.07, 0.3); }
    },
    // a gift: tape tearing, paper ripping away, the lid lifting off
    unwrap(d, t) {
      for (let i = 0; i < 5; i++) nz(d, t + i * 0.07 + Math.random() * 0.03, 0.09, 0.45, 'bandpass', rnd(1800, 4200), rnd(900, 2000), 1.2, 0.004);
      nz(d, t + 0.38, 0.3, 0.55, 'bandpass', 2600, 800, 0.9, 0.01);
      nz(d, t + 0.72, 0.12, 0.35, 'lowpass', 900, 300, 1, 0.01); osc(d, 'sine', 180, 120, t + 0.72, 0.08, 0.2);
    },
    // a lit fuse: a spitting hiss, crackling
    fuse(d, t, o) {
      const dur = o.dur || 0.5;
      nz(d, t, dur, 0.28, 'bandpass', rnd(3200, 4200), rnd(2400, 3000), 1.1, 0.01);
      for (let i = 0; i < 6; i++) nz(d, t + Math.random() * dur, 0.015, 0.4, 'highpass', 3000, null, 0.7, 0.001);
    },
    // a blast: the crack, the roar rolling off the walls, a deep thump, then debris pattering down
    explosion(d, t) {
      nz(d, t, 0.18, 1.2, 'highpass', 1500, null, 0.6, 0.001);
      nz(d, t, 2.4, 1.4, 'lowpass', 4200, 90, 0.6, 0.003, brownBuf);
      osc(d, 'sine', 70, 24, t, 1.6, 1.6, 0.002); osc(d, 'triangle', 45, 20, t, 1.1, 0.9, 0.002);
      nz(shaper(d, 30), t, 0.6, 0.6, 'lowpass', 900, 200, 0.7, 0.002);
      S.debris(d, t + 0.25);
    },
    // a creature's last noise: a drawn-out rattle sinking away, a wet gurgle, the body hitting the floor
    death_rattle(d, t, o) {
      const p = o.pitch || 1, w = shaper(d, 40);
      const a = osc(w, 'sawtooth', 160 * p, 45 * p, t, 1.3, 0.22, 0.02); vib(a, t, 1.3, 23, 18 * p);
      nz(d, t, 1.4, 0.3, 'bandpass', 700 * p, 220 * p, 2.5, 0.05);
      for (let i = 0; i < 5; i++) nz(d, t + 0.5 + i * 0.13 + Math.random() * 0.05, 0.08, 0.3, 'bandpass', rnd(300, 700) * p, 200, 6);
      osc(d, 'sine', 85, 34, t + 0.85, 0.4, 0.9); nz(d, t + 0.85, 0.3, 0.6, 'lowpass', 600, 120, 0.7, 0.004);
    },
    // the jump drive: winding up (a climbing whine over a swelling hum), punching through, dropping out
    warp_charge(d, t, o) {
      const dur = o.dur || 2.2;
      const a = osc(d, 'sine', 90, 900, t, dur, 0.12, dur * 0.85); vib(a, t, dur, 7, 6);
      osc(d, 'sine', 45, 90, t, dur, 0.35, dur * 0.8);
      const bp = filt(d, 'bandpass', 600, 3); bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(5000, t + dur);
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
      s.connect(g); g.connect(bp); s.start(t); s.stop(t + dur + 0.1);
    },
    warp_in(d, t) {
      osc(d, 'sine', 70, 28, t, 1.4, 1.2, 0.004); nz(d, t, 1.2, 0.9, 'lowpass', 3000, 120, 0.6, 0.004, brownBuf);
      nz(d, t, 0.6, 0.5, 'highpass', 6000, 1200, 0.5, 0.002); osc(d, 'sine', 2400, 180, t, 0.7, 0.08, 0.002);
    },
    warp_out(d, t) {
      nz(d, t, 0.8, 0.5, 'bandpass', 600, 4000, 1, 0.35); osc(d, 'sine', 150, 900, t, 0.5, 0.06, 0.3);
      osc(d, 'sine', 60, 30, t + 0.55, 0.9, 1.1, 0.004); nz(d, t + 0.55, 0.5, 0.6, 'lowpass', 1500, 100, 0.6, 0.004, brownBuf);
    },
    // a supply pod coming in: a falling shriek over a roar that builds right up to the impact
    pod_fall(d, t, o) {
      const dur = Math.max(0.5, o.dur || 3.5);
      const bp = filt(d, 'bandpass', 1800, 4); bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(480, t + dur);
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + dur * 0.92); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
      s.connect(g); g.connect(bp); s.start(t, Math.random() * 2); s.stop(t + dur + 0.1);
      osc(d, 'sine', 1900, 360, t, dur, 0.07, dur * 0.7);
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
      if (!fill) { osc(d, 'sine', 90, 40, t, 0.4, 0.4, 0.003); nz(d, t, 0.06, 0.6, 'highpass', 2500, null, 0.7, 0.001); }
    },
    // hydraulics: a rising motor whine with a hiss of fluid
    servo(d, t, o) {
      const dur = o.dur || 1.5, p = o.pitch || 1;
      const bp = filt(d, 'bandpass', 700 * p, 2.5);
      const m = osc(bp, 'sawtooth', 150 * p, 210 * p, t, dur, 0.22, 0.12); vib(m, t, dur, 23, 4);
      osc(d, 'triangle', 300 * p, 420 * p, t, dur, 0.04, 0.12);
      nz(d, t, dur, 0.12, 'bandpass', 2600, 1900, 1.5, 0.15);
    },
    // a glint far up in the sky: a soft glassy shimmer, more felt than heard
    glint(d, t) {
      [2093, 2794, 3520].forEach((f, i) => osc(d, 'sine', f, f * 1.006, t + i * 0.035, 1.1 - i * 0.2, 0.022, 0.05));
      nz(d, t, 0.8, 0.035, 'highpass', 6500, 9500, 0.6, 0.08);
    },
    // blast shutters running in their tracks: steel slats clattering against each other over a low grinding roll
    shutter(d, t, o) {
      const dur = o.dur || 1;
      nz(d, t, dur, 0.35, 'lowpass', 380, 160, 0.8, 0.06, brownBuf);
      const n = Math.round(dur * 26);
      for (let i = 0; i < n; i++) { const tt = t + (i / n) * dur + Math.random() * 0.02; nz(d, tt, 0.025, rnd(0.08, 0.2), 'bandpass', rnd(700, 1600), null, 3, 0.001); if (i % 3 === 0) osc(d, 'sine', rnd(180, 260), 120, tt, 0.05, 0.05, 0.002); }
    },
    // a heavy latch seating
    clunk(d, t, o) { const p = o.pitch || 1; osc(d, 'sine', 120 * p, 55 * p, t, 0.22, 0.8); nz(d, t, 0.08, 0.5, 'lowpass', 1400 * p, 300, 0.8); [410, 655].forEach((f) => osc(d, 'sine', f * p, f * p * 0.98, t, 0.35, 0.06)); },
    // touchdown: the whole ship's weight landing on its struts
    thud(d, t) {
      osc(d, 'sine', 64, 30, t, 0.8, 1.3, 0.004); nz(d, t, 0.6, 1, 'lowpass', 600, 80, 0.7, 0.004, brownBuf);
      [97, 151, 236, 352].forEach((f, i) => osc(d, 'sine', f, f * 0.97, t + 0.02, 1.6 - i * 0.25, 0.11));
      nz(d, t + 0.05, 0.25, 0.35, 'bandpass', 1800, 700, 1.2);
    },
    lever(d, t) { S.hit_metal(d, t); osc(d, 'sine', 70, 40, t, 0.3, 0.8); nz(d, t, 0.06, 0.4, 'bandpass', 1500, null, 2); },
    key(d, t) { nz(d, t, 0.012, 0.12, 'highpass', 4000); },
    // console tones: rounded electronic blips rather than chiptune squares
    beep(d, t, o) { const f = o.f || 880; osc(d, 'sine', f, f * 0.995, t, 0.12, 0.09, 0.004); osc(d, 'sine', f * 2, f * 2, t, 0.06, 0.02, 0.003); },
    err(d, t) { osc(d, 'sine', 330, 300, t, 0.18, 0.12, 0.004); osc(d, 'sine', 247, 220, t + 0.13, 0.24, 0.12, 0.004); nz(d, t, 0.05, 0.06, 'bandpass', 800, null, 3, 0.002); },
    buy(d, t) { [[880, 0], [1320, 0.09]].forEach(([f, k]) => { osc(d, 'sine', f, f, t + k, 0.6, 0.08, 0.002); osc(d, 'sine', f * 2.76, f * 2.76, t + k, 0.25, 0.02, 0.002); }); },
    sell(d, t) { nz(d, t, 0.08, 0.35, 'bandpass', 2500, null, 2); [2093, 2637, 3136, 4186].forEach((f) => osc(d, 'sine', f, null, t + 0.1, 1.3, 0.1)); },
    // the scanner: a heavy sonar pulse out of a cheap, worn speaker. A sub thump, a low tone that sags and beats as it
    // dies, a dirty rumble rolling outward with the wave, and the speaker crackling under it all.
    scan(d, t) {
      osc(d, 'sine', 72, 30, t, 0.7, 0.9, 0.004); nz(d, t, 0.35, 0.45, 'lowpass', 420, 70, 0.7, 0.004, brownBuf);
      // the tone: two slightly detuned voices through a lowpassed overdrive, falling a little as it fades
      const grit = filt(shaper(filt(d, 'lowpass', 900, 0.8), 6), 'lowpass', 1400, 0.7);
      for (const [f, v] of [[146, 0.16], [148.6, 0.12]]) osc(grit, 'triangle', f, f * 0.88, t + 0.02, 2.4, v, 0.03);
      osc(d, 'sine', 73, 64, t + 0.02, 2.6, 0.22, 0.05);
      // the wave rolling out: a low rush whose band opens a little as it goes, never up into the bright range
      nz(shaper(d, 3), t + 0.05, 1.6, 0.16, 'bandpass', 180, 620, 1.4, 0.25, brownBuf);
      // the speaker: a few dry crackles in the tail
      for (let i = 0; i < 7; i++) nz(d, t + 0.1 + Math.pow(Math.random(), 1.4) * 1.6, 0.012, rnd(0.03, 0.08), 'bandpass', rnd(900, 1800), null, 1.5, 0.001);
    },
    // a find showing up as the wave reaches it: a muffled return knocking back off it, not a chirp
    ping(d, t, o) {
      const f = o.f || 260;
      osc(d, 'sine', f, f * 0.9, t, 0.35, 0.16, 0.006); osc(d, 'sine', f * 0.5, f * 0.46, t, 0.4, 0.14, 0.01);
      nz(d, t, 0.05, 0.06, 'bandpass', f * 3, null, 2.5, 0.002);
    },
    // a steel locker: the latch clacks, the hinge complains, the thin door wobbles
    locker_open(d, t) {
      nz(d, t, 0.02, 0.55, 'highpass', 2600); nz(d, t + 0.004, 0.02, 0.3, 'bandpass', 1500, null, 7, 0.001);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(rnd(260, 340), t + 0.04); o.frequency.linearRampToValueAtTime(rnd(420, 620), t + 0.45);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      for (let tt = t + 0.04; tt < t + 0.45;) { const gl = rnd(0.012, 0.03); g.gain.setValueAtTime(rnd(0.05, 0.22), tt); g.gain.setValueAtTime(0, tt + gl * 0.5); tt += gl; }
      o.connect(g); g.connect(filt(d, 'bandpass', 1300, 6)); o.start(t); o.stop(t + 0.5);
      [430, 870, 1330].forEach((f, i) => osc(d, 'sine', f, f * 0.995, t + 0.05, 0.5 - i * 0.1, 0.05 / (i + 1), 0.002));
    },
    locker_close(d, t) {
      osc(d, 'sine', 150, 60, t, 0.16, 0.7, 0.002); nz(d, t, 0.1, 0.5, 'lowpass', 1600, 300, 0.7, 0.002);
      [510, 780, 1240].forEach((f, i) => osc(d, 'sine', f, f * 0.99, t, 0.7 - i * 0.15, 0.08 / (i + 1), 0.002));
      nz(d, t + 0.05, 0.02, 0.4, 'highpass', 2600); nz(d, t + 0.054, 0.02, 0.25, 'bandpass', 1300, null, 7, 0.001);
    },
    // a ship's klaxon: two detuned horn reeds through a metal bell, three blasts
    alarm(d, t) {
      const w = shaper(filt(d, 'bandpass', 1050, 1.4), 6);
      for (let i = 0; i < 3; i++) { const tt = t + i * 0.72, a = osc(w, 'sawtooth', 548, 590, tt, 0.52, 0.12, 0.03); osc(w, 'sawtooth', 553, 596, tt, 0.52, 0.1, 0.03); vib(a, tt, 0.52, 6, 7); }
    },
    power_down(d, t) {
      osc(filt(d, 'lowpass', 600), 'sawtooth', 120, 18, t, 2.6, 0.5, 0.01);
      osc(d, 'sine', 80, 30, t, 0.5, 0.9); nz(d, t, 0.3, 0.6, 'lowpass', 900, 100, 0.7);
      [233, 377].forEach((f) => osc(d, 'sine', f, f, t, 1.2, 0.12));
    },
    power_up(d, t) { osc(filt(d, 'lowpass', 900), 'sawtooth', 25, 120, t, 1.8, 0.35, 1.2); osc(d, 'sine', 60, 60, t + 1.5, 0.8, 0.2, 0.05); },
    metal_bang(d, t) { [180, 263, 410, 690].forEach((f) => osc(d, 'sine', f, f * 0.99, t, 2.4, 0.2)); nz(d, t, 0.12, 0.6, 'lowpass', 1200, 200); },
    drip(d, t) { osc(d, 'sine', rnd(1300, 2000), 500, t, 0.05, 0.15); },
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
    knock(d, t) { for (let i = 0; i < 3; i++) { osc(d, 'sine', 130, 70, t + i * 0.28, 0.1, 0.8); nz(d, t + i * 0.28, 0.05, 0.4, 'bandpass', 400, null, 2); } },
    groan(d, t) {
      const lp = filt(d, 'lowpass', 260, 7);
      const o = osc(lp, 'sawtooth', 46, 36, t, 3.2, 0.45, 0.8); vib(o, t, 3.2, 0.7, 3);
      nz(d, t + 0.5, 1.5, 0.12, 'bandpass', 700, 400, 8, 0.4);
    },
    scream(d, t) {
      const bp = filt(d, 'bandpass', 1100, 4);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(650, t); o.frequency.linearRampToValueAtTime(1300, t + 0.3); o.frequency.linearRampToValueAtTime(880, t + 1.7);
      vib(o, t, 1.8, 7, 30);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g); g.connect(bp); o.start(t); o.stop(t + 1.9);
    },
    run_far(d, t) { for (let i = 0; i < 8; i++) S.step(d, t + i * 0.27, { surf: 'concrete', pitch: 0.9 }); },
    bell(d, t) { [1, 2.4, 3.9, 5.2].forEach((r, i) => osc(d, 'sine', 620 * r, null, t, 2.6 - i * 0.4, 0.25 / (i + 1))); },
    toot(d, t) { for (const k of [0, 0.17]) { osc(d, 'square', 1180, 1165, t + k, 0.12, 0.07, 0.004); osc(d, 'square', 1485, 1470, t + k, 0.12, 0.04, 0.004); } },
    horn(d, t) { const w = shaper(d, 10); osc(w, 'sawtooth', 415, 410, t, 1.1, 0.35, 0.02); osc(w, 'sawtooth', 421, 418, t, 1.1, 0.35, 0.02); osc(w, 'sawtooth', 622, 615, t, 1.1, 0.22, 0.02); },
    bang(d, t) { nz(d, t, 0.7, 1, 'lowpass', 8000, 250, 0.5, 0.002); osc(d, 'sine', 70, 28, t, 0.9, 1, 0.002); },
    tinnitus(d, t) { osc(d, 'sine', 4100, 3950, t, 4.5, 0.06, 0.01); },
    pin(d, t) { osc(d, 'triangle', 2600, 2400, t, 0.12, 0.08); nz(d, t, 0.03, 0.3, 'highpass', 3000); },
    vent(d, t) { for (let i = 0; i < 16; i++) nz(d, t + i * 0.065 + Math.random() * 0.02, 0.04, 0.5, 'bandpass', rnd(1400, 3200), null, 3); osc(d, 'sine', 140, 80, t + 1, 0.2, 0.4); },
    static(d, t, o) { nz(d, t, o.dur || 0.3, 0.22, 'bandpass', 2200, null, 0.6, 0.01); },
    radio_ghost(d, t) {
      nz(d, t, 2.4, 0.18, 'bandpass', 2000, null, 0.6, 0.05);
      const bp = filt(d, 'bandpass', 1500, 1.2); const w = shaper(bp, 15);
      S.whisper(w, t + 0.4);
    },
    // a wind-up tin music box
    toy(d, t) { [523, 659, 784, 659, 1046, 988].forEach((f, i) => { osc(d, 'triangle', f, f, t + i * 0.13, 0.45, 0.05, 0.002); osc(d, 'sine', f * 3.01, f * 3.01, t + i * 0.13, 0.12, 0.012, 0.002); }); nz(d, t, 0.8, 0.02, 'bandpass', 3000, null, 3, 0.05); },
    // a rotary phone's bells: a hammer trilling between two bells
    ring(d, t) { for (let i = 0; i < 2; i++) for (let k = 0; k < 16; k++) { const tt = t + i * 0.55 + k * 0.025, f = k % 2 ? 1630 : 1720; osc(d, 'sine', f, f, tt, 0.09, 0.05, 0.001); osc(d, 'sine', f * 2.4, f * 2.4, tt, 0.04, 0.012, 0.001); } },
    chime(d, t) { [523, 659, 784].forEach((f, i) => osc(d, 'sine', f, null, t + i * 0.18, 0.9, 0.1)); },
    thunder(d, t) {
      nz(d, t, 0.25, 0.6, 'highpass', 1800, 600, 0.6, 0.003);
      const lp = filt(d, 'lowpass', 300, 0.7); lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(70, t + 3.5);
      const s = ctx.createBufferSource(); s.buffer = brownBuf; s.loop = true;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.6, t + 0.08);
      for (let k = 1; k < 8; k++) g.gain.linearRampToValueAtTime(rnd(0.5, 1.5) * (1 - k / 9), t + k * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
      s.connect(g); g.connect(lp); s.start(t); s.stop(t + 4);
    },
    charge(d, t) { osc(d, 'sine', 220, 1400, t, 1.3, 0.08, 0.05); osc(d, 'sine', 440, 2800, t, 1.3, 0.02, 0.05); nz(d, t, 1.2, 0.05, 'bandpass', 2400, 5200, 2, 0.1); },
    pant(d, t) { nz(d, t, 0.35, 0.12, 'bandpass', 900, 600, 1, 0.1); nz(d, t + 0.42, 0.4, 0.09, 'bandpass', 700, 500, 1, 0.1); },
    gong(d, t) { [110, 220.5, 331, 447].forEach((f, i) => osc(d, 'sine', f, f, t, 3.5 - i * 0.5, 0.25 / (i + 1), 0.01)); },
    fired(d, t) { S.alarm(d, t); S.ship_door(d, t + 1.6); nz(d, t + 2.5, 3, 0.8, 'lowpass', 3000, 200, 0.5, 0.05, brownBuf); },
    // ---- ambience one-shots ----
    // a dead trunk flexing in the wind: stick-slip grains through resonant wood
    creak(d, t) {
      const dur = rnd(0.7, 1.8), f0 = rnd(55, 120);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * rnd(0.6, 1.5), t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      for (let tt = t; tt < t + dur;) { const gl = rnd(0.014, 0.045); g.gain.setValueAtTime(rnd(0.08, 0.5) * Math.sin(Math.PI * (tt - t) / dur), tt); g.gain.setValueAtTime(0, tt + gl * 0.55); tt += gl; }
      o.connect(g); g.connect(filt(d, 'bandpass', rnd(420, 800), 7)); g.connect(filt(d, 'bandpass', rnd(1400, 2300), 9));
      o.start(t); o.stop(t + dur + 0.05);
    },
    branch_snap(d, t) {
      nz(d, t, 0.03, 0.9, 'highpass', 1800); nz(d, t + 0.01, 0.07, 0.5, 'bandpass', 900, 450, 3);
      for (let i = 0; i < 4; i++) nz(d, t + 0.22 + i * 0.11 + Math.random() * 0.05, 0.05, 0.22, 'bandpass', rnd(400, 1300), null, 2);
      osc(d, 'sine', 95, 50, t + 0.7, 0.14, 0.35); nz(d, t + 0.7, 0.12, 0.25, 'lowpass', 700, 200);
    },
    caw(d, t, o) {
      const n = o.n || 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const tt = t + i * rnd(0.38, 0.6), dur = rnd(0.2, 0.32), f = rnd(470, 620);
        const bp = filt(shaper(d, 22), 'bandpass', rnd(1100, 1500), 2.5);
        const os = ctx.createOscillator(); os.type = 'sawtooth';
        os.frequency.setValueAtTime(f * 1.3, tt); os.frequency.exponentialRampToValueAtTime(f, tt + 0.05); os.frequency.exponentialRampToValueAtTime(f * 0.8, tt + dur);
        vib(os, tt, dur, 36, 22);
        const g = ctx.createGain(); env(g, tt, 0.015, 0.4, dur); os.connect(g); g.connect(bp); os.start(tt); os.stop(tt + dur + 0.05);
        nz(bp, tt, dur, 0.12, 'bandpass', 1900, 1200, 2, 0.01);
      }
    },
    cricket(d, t, o) { const f = o.f || rnd(4300, 5200), n = 3 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) osc(d, 'sine', f, f * 0.985, t + i * 0.046, 0.028, 0.05, 0.003); },
    owl(d, t) { const lp = filt(d, 'lowpass', 800); [[0, 0.42], [0.62, 0.3], [0.98, 0.55]].forEach(([k, l]) => osc(lp, 'sine', rnd(360, 390), 330, t + k, l, 0.22, 0.07)); },
    // something huge and metal settling, a long way off
    far_groan(d, t) {
      const dur = rnd(3, 5), f = rnd(36, 58), lp = filt(d, 'lowpass', 520, 1);
      const o = osc(lp, 'sawtooth', f, f * rnd(0.82, 1.18), t, dur, 0.4, 1.1); vib(o, t, dur, 0.35, 2);
      osc(filt(d, 'bandpass', rnd(280, 640), 14), 'sawtooth', f * 4, f * 4 * rnd(0.88, 1.12), t + 0.4, dur * 0.8, 0.14, 0.8);
      [rnd(150, 260), rnd(390, 520)].forEach((ff) => osc(d, 'sine', ff, ff * 0.995, t + dur * 0.55, 2.6, 0.035, 0.01));
    },
    pipe_tick(d, t) { const n = 2 + Math.floor(Math.random() * 4), f = rnd(1700, 3200); for (let i = 0; i < n; i++) { const tt = t + i * rnd(0.12, 0.5); osc(d, 'triangle', f * rnd(0.97, 1.03), null, tt, 0.05, 0.1, 0.001); osc(d, 'sine', f * 0.31, null, tt, 0.18, 0.04, 0.001); } },
    scurry(d, t) { const n = 10 + Math.floor(Math.random() * 14); let tt = t; for (let i = 0; i < n; i++) { tt += rnd(0.025, 0.07); nz(d, tt, 0.02, 0.18, 'bandpass', rnd(2500, 5200), null, 3, 0.002); } if (Math.random() < 0.5) S.chitter(d, tt + 0.1); },
    zap(d, t) { for (let k = 0; k < 7; k++) nz(d, t + rnd(0, 0.3), 0.012, 0.32, 'highpass', 2800, null, 0.7, 0.001); osc(filt(d, 'bandpass', 900, 2), 'sawtooth', 120, 120, t, 0.35, 0.06, 0.005); },
    thump(d, t) { osc(d, 'sine', 50, 34, t, 0.4, 0.55, 0.01); nz(d, t, 0.32, 0.3, 'lowpass', 240, 70, 0.7, 0.01, brownBuf); nz(d, t + 0.05, 0.1, 0.06, 'bandpass', 900, null, 4, 0.002); },
    plink(d, t) { osc(d, 'sine', rnd(2400, 4200), rnd(1500, 2500), t, 0.05, 0.08, 0.001); },
    chirp(d, t) { const f = rnd(1200, 2600); osc(d, 'sine', f, f * 0.98, t, 0.08, 0.035, 0.003); if (Math.random() < 0.6) osc(d, 'sine', f * (Math.random() < 0.5 ? 1.5 : 0.75), null, t + 0.09, 0.08, 0.03, 0.003); },
    hiss_valve(d, t) { nz(d, t, rnd(0.6, 1.3), 0.12, 'highpass', 3500, 5000, 0.6, 0.05); },
    hull_tick(d, t) { osc(d, 'triangle', rnd(600, 1100), null, t, 0.08, 0.06, 0.001); nz(d, t, 0.05, 0.08, 'bandpass', 2200, null, 4, 0.001); },
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
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
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
  function startAmbience() {
    // facility interior: deep drone + air handling rumble + faint hiss
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150; lp.connect(g);
      const b = loopSrc(brownBuf); const bg = ctx.createGain(); bg.gain.value = 0.9; b.connect(bg); bg.connect(lp);
      [41.2, 61.7, 82.9].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f;
        lfo(0.03 + i * 0.017, 1.4, o.frequency);
        const og = ctx.createGain(); og.gain.value = i === 2 ? 0.05 : 0.16; lfo(0.05 + i * 0.03, 0.06, og.gain);
        o.connect(og); og.connect(g); o.start();
      });
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
    // fluorescent buzz near lit lamps
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.4;
      const og = ctx.createGain(); og.gain.value = 0.06; o.connect(bp); bp.connect(og); og.connect(g);
      const o2 = ctx.createOscillator(); o2.frequency.value = 240; const og2 = ctx.createGain(); og2.gain.value = 0.05; o2.connect(og2); og2.connect(g);
      o.start(); o2.start();
      loops.buzz = g; loops.buzzTone = og;
    }
    // orbit: a slow, cold chord that swells and thins
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 2; lfo(0.025, 320, lp.frequency); lp.connect(g);
      [55, 82.41, 110, 130.81, 164.81, 246.94].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12;
        lfo(0.04 + i * 0.013, 5, o.detune);
        const og = ctx.createGain(); og.gain.value = 0.03; lfo(0.017 + i * 0.009, 0.026, og.gain);
        o.connect(og); og.connect(lp); o.start();
      });
      loops.pad = g;
    }
    // ship hum
    {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
      [55, 110, 165].forEach((f, i) => { const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = [0.14, 0.05, 0.02][i]; o.connect(og); og.connect(g); o.start(); });
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
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38; lfo(7.5, 1.6, o.frequency);
      const olp = ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 160; const og = ctx.createGain(); og.gain.value = 0.3;
      o.connect(olp); olp.connect(og); og.connect(g); o.start();
      loops.thrust = g; loops.thrustLp = lp; loops.thrustHiss = hg; loops.thrustOsc = o;
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
      const o = ctx.createOscillator(); o.frequency.value = 33; lfo(0.02, 2, o.frequency); const og = ctx.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(g); o.start();
      const s = loopSrc(brownBuf); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 90; s.connect(lp); lp.connect(g);
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
  function ambience(dt, info) {
    if (!ready || SFX.held || ctx.state !== 'running') return;
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
      if (rain > 0.2) every('drip', dt, 0.15, 0.6, () => play(indoorsShip ? 'hull_tick' : 'plink', indoorsShip ? around(cam, 0.5, 3, 1.4, 2.2) : around(cam, 1, 5, -1, 1), { vol: 0.25 * rain, ref: 2, rev: 0.1 }));
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
    held: false, // true while single player is paused: keep audio suspended
    init() {
      if (ctx) { if (ctx.state === 'suspended' && !this.held) ctx.resume(); return; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { console.warn('No WebAudio', e); return; }
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
      ready = true;
      startAmbience(); applyEnv();
    },
    play(name, pos = null, o = {}) {
      if (!ready) return;
      const fn = S[name]; if (!fn) { console.warn('no sound', name); return; }
      try { fn(out(pos, o), ctx.currentTime + (o.delay || 0), o); } catch (e) { console.warn('sound error', name, e); }
    },
    setEnv(e) { if (curEnv !== e) { curEnv = e; applyEnv(); } },
    ambience,
    setWeather(rain, wind) { rainAmt = rain; windAmt = wind; applyEnv(); },
    // level 0..1 of the ship's engines as heard here (inside: through the hull), gale 0..1 through an open hatch
    setThrust(level, inside, gale) {
      if (!ready) return;
      const t = ctx.currentTime;
      loops.thrust.gain.setTargetAtTime(level * (inside ? 0.75 : 1.1), t, 0.12);
      loops.thrustLp.frequency.setTargetAtTime(140 + level * (inside ? 420 : 1300), t, 0.15);
      loops.thrustHiss.gain.setTargetAtTime(level * (inside ? 0.03 : 0.16), t, 0.15);
      loops.thrustOsc.frequency.setTargetAtTime(30 + level * 26, t, 0.25);
      loops.gale.gain.setTargetAtTime(gale * 0.7, t, 0.25);
    },
    setMuffle(x) { if (ready) muffle.frequency.setTargetAtTime(lerp(20000, 320, clamp(x, 0, 1)), ctx.currentTime, 0.08); },
    setVolume(v) { if (ready) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
    setOcclusion(fn) { occlusionFn = fn; },
    listener(cam) {
      if (!ready) return;
      const l = ctx.listener;
      cam.getWorldPosition(_v); cam.getWorldDirection(_f); _u.set(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
      if (l.positionX) {
        l.positionX.value = _v.x; l.positionY.value = _v.y; l.positionZ.value = _v.z;
        l.forwardX.value = _f.x; l.forwardY.value = _f.y; l.forwardZ.value = _f.z;
        l.upX.value = _u.x; l.upY.value = _u.y; l.upZ.value = _u.z;
      } else { l.setPosition(_v.x, _v.y, _v.z); l.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
    },
    setPannerPos,
  };
})();
