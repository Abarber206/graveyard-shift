'use strict';
// Particles: one pool of short-lived bits shared by everything that throws them (dust kicked up off the ground, spray
// and droplets, sparks, embers, grit, chips). Two layers, each drawn in a single call however many are flying: glowing
// bits (sparks, embers) added over what's behind them, and solid ones (dust, spray, grit) laid over it, lit by the
// light where they were thrown (see lit). Each bit is a little card turned to face you, stretched back along the way
// it's flying so a fast spark draws as a streak; they fall (or drift up), drag, bounce off the floor or settle on it,
// fade, and go into the mist the way everything else does.
const FX = (() => {
  const N = 1100, L = [];
  const VS = `attribute vec3 aPos; attribute vec3 aVel; attribute vec2 aSz; attribute vec4 aCol;
    varying vec2 vQ; varying vec4 vCol; varying float vLen;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vec4 mvPosition = viewMatrix * vec4(aPos, 1.0);
      vec2 v = (viewMatrix * vec4(aVel, 0.0)).xy; float sp = length(v), len = aSz.y * sp;
      vec2 ax = sp > 1e-4 ? v / sp : vec2(1.0, 0.0), ay = vec2(-ax.y, ax.x);
      // (a streak trails back from the bit itself)
      mvPosition.xy += ax * (position.x * (aSz.x + len) * 0.5 - len * 0.5) + ay * position.y * aSz.x * 0.5;
      gl_Position = projectionMatrix * mvPosition;
      vQ = position.xy; vCol = aCol; vLen = len / (aSz.x + len);
      #include <fog_vertex>
    }`;
  const FS = `varying vec2 vQ; varying vec4 vCol; varying float vLen;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      // round, and along a streak brightest at its head, thinning back down its tail
      float r = length(vQ); if (r > 1.0) discard;
      float head = mix(1.0, smoothstep(-1.0, 1.0, vQ.x), vLen);
      #ifdef GLOW
        gl_FragColor = vec4(vCol.rgb * pow(1.0 - r, 1.5) * vCol.a * head, 1.0);
      #else
        gl_FragColor = vec4(vCol.rgb, smoothstep(1.0, 0.2, r) * vCol.a * head);
      #endif
      #include <fog_fragment>
      #if defined( GLOW ) && defined( USE_FOG )
        gl_FragColor.rgb = max(gl_FragColor.rgb - fogCol * fogAmt, 0.0);
      #endif
    }`;
  function layer(glow) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const at = (n) => new THREE.InstancedBufferAttribute(new Float32Array(N * n), n).setUsage(THREE.DynamicDrawUsage);
    const a = { aPos: at(3), aVel: at(3), aSz: at(2), aCol: at(4) };
    for (const k in a) g.setAttribute(k, a[k]);
    g.instanceCount = 0;
    const lib = THREE.ShaderLib.basic.uniforms, u = { fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, fogNear: { value: 1 }, fogFar: { value: 1000 } };
    for (const k of ['uFogA', 'uFogB', 'uScanA', 'uScanB', 'uShipInv', 'uShipC']) if (lib[k]) u[k] = lib[k];
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, defines: glow ? { GLOW: 1 } : {}, transparent: true, depthWrite: false, fog: true, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = glow ? 6 : 4;
    const P = []; for (let i = 0; i < N; i++) P.push({ t: 1, life: 0 });
    return { mesh, g, a, P, i: 0, n: 0 };
  }
  const rnd = (a, b) => a + Math.random() * (b - a), pick = (v) => (Array.isArray(v) ? rnd(v[0], v[1]) : v);
  const _d = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0), _f = new THREE.Vector3(), _b1 = new THREE.Vector3(), _b2 = new THREE.Vector3();
  // a direction within `spread` (radians) of d: uniform over the cone
  function within(d, spread, out) {
    out.copy(d).normalize(); if (!spread) return out;
    const c = Math.cos(Math.min(Math.PI, spread)), z = c + Math.random() * (1 - c), r = Math.sqrt(Math.max(0, 1 - z * z)), a = Math.random() * TAU;
    _b1.crossVectors(out, Math.abs(out.y) < 0.95 ? _up : _x).normalize(); _b2.crossVectors(out, _b1);
    return out.multiplyScalar(z).addScaledVector(_b1, r * Math.cos(a)).addScaledVector(_b2, r * Math.sin(a));
  }
  const api = {
    on: true,
    init(scene) { L.push(layer(true), layer(false)); for (const l of L) scene.add(l.mesh); },
    // throw n bits from at. o: glow (sparks, embers) or not; dir and spread (radians, round it); speed, life, size
    // (m across), grow (its size by the end), streak (seconds of its flight drawn behind it), color and color1 (what it
    // cools or fades to), alpha, grav (m/s/s down; less than none drifts up), drag (per second), floor (the height it
    // lands on: bounce how much of its fall it keeps, or settle there), r (scattered round at by up to this), vel (the
    // thrower's own velocity, added), die: gone as it lands (droplets into water)
    emit(o) {
      if (!L.length || !api.on) return;
      const l = L[o.glow ? 0 : 1], n = Math.round(pick(o.n ?? 1)), c0 = o.color || [1, 1, 1], c1 = o.color1 || c0, dir = o.dir || _up;
      for (let k = 0; k < n; k++) {
        const p = l.P[l.i]; l.i = (l.i + 1) % N;
        const r = o.r ? pick(o.r) : 0;
        p.x = o.at.x + (r ? rnd(-r, r) : 0); p.y = o.at.y + (r && o.rY !== false ? rnd(-r, r) * (o.flat ? 0.15 : 1) : 0); p.z = o.at.z + (r ? rnd(-r, r) : 0);
        within(dir, o.spread ?? 0.5, _d); const v = pick(o.speed ?? 1);
        p.vx = _d.x * v + (o.vel ? o.vel.x : 0); p.vy = _d.y * v + (o.vel ? o.vel.y : 0); p.vz = _d.z * v + (o.vel ? o.vel.z : 0);
        p.t = 0; p.life = pick(o.life ?? 1); p.s0 = pick(o.size ?? 0.1); p.s1 = p.s0 * (o.grow ?? 1); p.st = o.streak ?? 0;
        const j = o.vary ?? 0.12, jj = 1 + rnd(-j, j);
        p.r0 = c0[0] * jj; p.g0 = c0[1] * jj; p.b0 = c0[2] * jj; p.r1 = c1[0] * jj; p.g1 = c1[1] * jj; p.b1 = c1[2] * jj;
        p.a = o.alpha ?? 1; p.grav = o.grav ?? 9.8; p.drag = o.drag ?? 0; p.floor = o.floor ?? -1e9; p.bounce = o.bounce ?? 0; p.die = !!o.die; p.fadeIn = o.fadeIn ?? 0.06; p.flick = o.flicker || 0;
      }
    },
    update(dt) {
      if (!L.length || dt <= 0) return;
      for (const l of L) {
        const { aPos, aVel, aSz, aCol } = l.a, P = aPos.array, V = aVel.array, S = aSz.array, C = aCol.array; let n = 0;
        for (const p of l.P) {
          if (p.t >= p.life) continue;
          p.t += dt; if (p.t >= p.life) continue;
          p.vy -= p.grav * dt; const dk = Math.exp(-p.drag * dt); p.vx *= dk; p.vy *= dk; p.vz *= dk;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < p.floor) {
            p.y = p.floor;
            if (p.die) { p.t = p.life; continue; }
            if (p.vy < 0) { p.vy = -p.vy * p.bounce; p.vx *= 0.55; p.vz *= 0.55; if (p.vy < 0.5) { p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; } }
          }
          const u = p.t / p.life, a = p.a * Math.min(1, p.t / Math.max(1e-3, p.fadeIn * p.life)) * (1 - u * u) * (p.flick ? 1 - p.flick * Math.random() : 1);
          P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z;
          V[n * 3] = p.vx; V[n * 3 + 1] = p.vy; V[n * 3 + 2] = p.vz;
          S[n * 2] = p.s0 + (p.s1 - p.s0) * u; S[n * 2 + 1] = p.st;
          C[n * 4] = p.r0 + (p.r1 - p.r0) * u; C[n * 4 + 1] = p.g0 + (p.g1 - p.g0) * u; C[n * 4 + 2] = p.b0 + (p.b1 - p.b0) * u; C[n * 4 + 3] = a;
          n++;
        }
        l.g.instanceCount = n; l.mesh.visible = n > 0;
        if (n) for (const k in l.a) l.a[k].needsUpdate = true;
      }
    },
    clear() { for (const l of L) { for (const p of l.P) p.t = p.life; l.g.instanceCount = 0; l.mesh.visible = false; } },
    // how lit a spot is (0 dark .. 1 full daylight), for solid bits that nothing else lights: outside, the time of day
    // (and the ship's lamps, the flashlight); inside, the lamps near it and the flashlight
    lit(p, zone) {
      let k = 0;
      if (zone !== 'in' && G.ext && G.round) { const Lg = G.ext.lighting(G.round.time); k = 0.18 + 0.82 * (1 - Lg.night); }
      else if (zone !== 'in') k = 0.6;
      for (const s of G.lightSources) {
        if (!s.lit || s.state === 'off' || (s.zone && zone && s.zone !== zone)) continue;
        const d = Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z), r = s.range || 6; if (d < r) k += (s.power || 1) * 0.7 * (1 - d / r) ** 2;
      }
      const me = G.me && G.me(), cam = R.camera;
      if (me && me.flash && cam) { const d = cam.position.distanceTo(p); if (d < 14) { cam.getWorldDirection(_s); const c = _s.dot(_d.copy(p).sub(cam.position).normalize()); if (c > 0.85) k += 0.9 * (1 - d / 14) * ((c - 0.85) / 0.15); } }
      return clamp(k, 0.03, 1.2);
    },
  };
  // ---- what throws them ----
  const SNOW = [0.92, 0.95, 1.0], ASH = [0.26, 0.24, 0.23], WATER = [0.62, 0.7, 0.7];
  Object.assign(api, {
    // a foot coming down (or landing: k up to 2): a scuff of dust off the ground (snow, ash, the world's own dirt),
    // spray off water, a puff of grit off a facility floor. who: its velocity, so the scuff trails it
    step(at, surf, k = 1, zone = 'out', vel = null, deep = 0) {
      if (surf === 'metal') return;
      if (surf === 'water') { api.splash(_f.set(at.x, G.ext && G.ext.water != null ? G.ext.water : at.y, at.z), 0.25 * k + Math.min(1, deep) * 0.45, zone); return; }
      const B = G.ext && G.ext.biome, kind = zone === 'in' || surf === 'concrete' ? 'grit' : B && B.motes === 'snow' ? 'snow' : B && (B.motes === 'ash' || B.motes === 'embers') ? 'ash' : G.ext && G.ext.water != null ? 'mud' : 'dust';
      const base = kind === 'snow' ? SNOW : kind === 'ash' ? ASH : kind === 'grit' ? [0.5, 0.48, 0.44] : kind === 'mud' ? B.ground.damp : B ? B.ground.trail : [0.45, 0.4, 0.33];
      const l = api.lit(at, zone), col = [base[0] * l, base[1] * l, base[2] * l], f = at.clone().setY(at.y + 0.04);
      // (wet ground throws no dust: a spatter of mud off the boot instead)
      if (kind === 'mud') { api.emit({ at: f, n: Math.round(4 * k), r: 0.1, dir: _up, spread: 0.8, speed: [0.8, 1.6 + k], grav: 9.8, drag: 0.4, floor: at.y, life: [0.4, 0.8], size: [0.02, 0.04], color: [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5], alpha: 0.95 }); return; }
      api.emit({ at: f, n: Math.round((kind === 'grit' ? 2 : 4) * k), r: 0.12, flat: true, dir: _up, spread: 1.3, speed: [0.25, 0.7 * k], vel: vel ? _v.copy(vel).multiplyScalar(0.25) : null, grav: kind === 'snow' ? 0.4 : -0.12, drag: 2.6, life: [0.7, 1.4], size: [0.12, 0.22], grow: 2.6, color: col, alpha: (kind === 'snow' ? 0.5 : kind === 'grit' ? 0.22 : 0.34) * Math.min(1, k), fadeIn: 0.12 });
      if (kind !== 'grit' && k > 0.8) api.emit({ at: f, n: Math.round(3 * k), r: 0.08, dir: _up, spread: 0.9, speed: [1, 2.2], grav: 9.8, drag: 0.5, floor: at.y, bounce: 0.2, life: [0.3, 0.6], size: [0.015, 0.03], color: [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], alpha: 0.9 });
    },
    // a foot (or a paw, or a claw) coming down anywhere, the ground under it worked out here: the facility's floors,
    // the ship's deck (nothing), the marsh's water, the world's own ground
    foot(at, zone, k = 1) {
      if (k <= 0) return;
      if (zone === 'in') { api.step(at, 'concrete', k * 0.8, 'in'); return; }
      if (G.mode !== 'site' || !G.ext || (G.ship.onFootprint(at.x, at.z) && at.y > SHIP.ground + 0.3) || G.ship.rampAt(at.x, at.z) != null) return;
      const w = G.ext.water;
      api.step(at, w != null && w > at.y + 0.08 ? 'water' : G.ext.paved(at.x, at.z) ? 'concrete' : 'dirt', k, 'out', null, w != null ? w - at.y : 0);
    },
    // what a sound heard somewhere throws off as well (every peer hears the same sounds, so everyone sees the same):
    // a blow landing on flesh, on metal, into a slime; a door smashed in
    onSound(name, at) {
      const zone = at.y < FAC_Y0 + 20 ? 'in' : 'out', fl = zone === 'in' && G.fac ? G.fac.floorY(at.x, at.z, at.y) : G.groundAt ? G.groundAt(at.x, at.z) : at.y - 1.2, l = api.lit(at, zone);
      if (name === 'hit_flesh') api.emit({ at, n: [8, 14], r: 0.1, dir: _up, spread: 1.4, speed: [1.2, 3.6], grav: 9.8, drag: 0.4, floor: fl, die: true, life: 1.5, size: [0.025, 0.05], streak: 0.03, color: [0.32 * l, 0.03 * l, 0.03 * l], alpha: 0.95 });
      else if (name === 'hit_metal') api.sparks(at, { n: [8, 14], spread: 1.6, speed: [2, 5.5], floor: fl });
      else if (name === 'squelch') api.emit({ at, n: [8, 12], r: 0.15, dir: _up, spread: 1.2, speed: [1, 3], grav: 9.8, drag: 0.6, floor: fl, die: true, life: 1.4, size: [0.04, 0.08], streak: 0.02, color: [0.22 * l, 0.42 * l, 0.12 * l], alpha: 0.85 });
      else if (name === 'door_slam') { api.puff(at, { n: [3, 5], r: 0.5, color: [0.42 * l, 0.4 * l, 0.36 * l], alpha: 0.28, speed: [0.2, 0.8], size: [0.3, 0.5] }); api.grit(at.clone().setY(at.y + 1.2), { n: [6, 10], spread: 1.6, speed: [0.5, 2.5], floor: fl, color: [0.3 * l, 0.29 * l, 0.27 * l] }); }
    },
    // water broken: droplets thrown up that fall back in, and a burst of spray hanging over it (k: how hard)
    splash(at, k = 1, zone = 'out') {
      const l = api.lit(at, zone), col = [WATER[0] * l, WATER[1] * l, WATER[2] * l], y = at.y;
      api.emit({ at, n: Math.round(6 + 14 * k), r: 0.15 + 0.15 * k, rY: false, dir: _up, spread: 0.55 + 0.25 * k, speed: [1.2, 2 + 3 * k], grav: 9.8, drag: 0.3, floor: y, die: true, life: 1.2, size: [0.02, 0.045], streak: 0.035, color: col, alpha: 0.85 });
      api.emit({ at: at.clone().setY(y + 0.1), n: Math.round(2 + 5 * k), r: 0.2 * k + 0.1, flat: true, dir: _up, spread: 1.2, speed: [0.2, 0.6 + k], grav: 0.5, drag: 2, life: [0.5, 1.1], size: [0.2, 0.35 + 0.3 * k], grow: 2, color: [col[0] * 1.15, col[1] * 1.15, col[2] * 1.15], alpha: 0.22, fadeIn: 0.1 });
    },
    // sparks off metal (a blade dragged on concrete, a failing lamp, a hit): white-hot streaks cooling to orange as they
    // fly, bouncing off the floor (o: dir, spread, n, speed, floor)
    sparks(at, o = {}) {
      api.emit(Object.assign({ at, glow: true, n: [6, 12], dir: _up, spread: 0.9, speed: [2, 6], grav: 9.8, drag: 0.8, bounce: 0.35, life: [0.35, 0.9], size: [0.018, 0.03], streak: 0.045, color: [2.2, 1.8, 1.1], color1: [1.4, 0.35, 0.05] }, o));
    },
    // embers: slow, drifting, flickering (o as for sparks)
    embers(at, o = {}) {
      api.emit(Object.assign({ at, glow: true, n: [4, 8], dir: _up, spread: 1.2, speed: [0.3, 1.4], grav: -0.6, drag: 1.2, life: [1, 2.4], size: [0.025, 0.045], streak: 0.02, color: [1.8, 0.8, 0.2], color1: [0.6, 0.12, 0.02], flicker: 0.5 }, o));
    },
    // grit and chips flung off a surface: dark bits that bounce and come to rest (col: what they're made of)
    grit(at, o = {}) {
      api.emit(Object.assign({ at, n: [5, 10], dir: _up, spread: 1, speed: [2, 6], grav: 9.8, drag: 0.4, bounce: 0.3, life: [0.8, 1.6], size: [0.025, 0.05], color: [0.18, 0.16, 0.14], alpha: 1, fadeIn: 0.01 }, o));
    },
    // a cloud of dust or smoke rolling out (col already lit)
    puff(at, o = {}) {
      api.emit(Object.assign({ at, n: [4, 7], r: 0.3, dir: _up, spread: 1.4, speed: [0.4, 1.4], grav: -0.2, drag: 1.6, life: [1.2, 2.4], size: [0.4, 0.7], grow: 2.4, color: [0.4, 0.38, 0.35], alpha: 0.35, fadeIn: 0.12 }, o));
    },
  });
  return api;
})();
