'use strict';
// The scout rover: a little remote-control truck with a camera on a mast, a headlight, and a wire basket on its back.
// It's a ship upgrade from the store and parks in the bay beside the airlock. Whoever takes the console by it drives:
// their view becomes the rover's camera (grainier the further it gets from the ship), and it'll go down the ramp, out
// across the ground and in through the facility doors. The crew can load what they find into its basket; whatever's in
// the basket is aboard once the rover is. Left outside when the ship goes, it's lost. It can be carried, too: both
// hands, and it's heavy enough to slow you right down.
//
// Whoever drives it moves it (the way your own body is yours); everyone else sees it through the host's snapshots. The
// host decides who drives and what goes in and out of the basket.
const ROVER = { WEIGHT: 30, SPEED: 4.4, REV: 1.9, TURN: 2.2, R: 0.32, SLOTS: 3, RANGE: 140, DOCK: { x: -0.55, z: 2.0, yaw: Math.PI }, CONSOLE: { x: -0.55, z: 3.62 } };

const Rover = (() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const S = { owned: false, x: ROVER.DOCK.x, y: 0, z: ROVER.DOCK.z, yaw: ROVER.DOCK.yaw, zone: 'out', driver: null, carrier: null, lit: false };
  let mesh = null, wheels = [], lamp = null, lampGlow = null, led = null, buf = [], driving = false, v = 0, vy = 0, camYaw = 0, camPitch = -0.12, spin = 0;
  let pitch = 0, roll = 0, noiseT = 0, feed = null, feedCam = null, feedT = 0, screen = null, overlay = null, hornT = 0, driveT = 0, spd = 0;
  const _p = V(0, 0, 0), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
  // forward along the rover's nose (its local +x), for a heading
  const fwd = (yaw) => V(Math.cos(yaw), 0, -Math.sin(yaw));
  const groundAt = (x, z, y, zone) => zone === 'in' && G.fac ? G.fac.floorY(x, z, y) : G.groundAt(x, z);

  // ---------- the model ----------
  function build() {
    const g = new THREE.Group(), body = MATS.rep('painted', 1, 1, 0xc9a227), dark = MATS.get('darkmetal'), blk = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
    const add = (geo, m, x, y, z, parent = g) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
    // a low yellow chassis with a black bumper band, the deck it carries, a sloped nose with the headlight in it
    add(new THREE.BoxGeometry(0.62, 0.14, 0.4), body, 0, 0.2, 0);
    add(new THREE.BoxGeometry(0.66, 0.05, 0.44), blk, 0, 0.14, 0);
    { const n = add(new THREE.BoxGeometry(0.14, 0.1, 0.38), body, 0.3, 0.22, 0); n.rotation.z = -0.5; }
    lamp = add(new THREE.CircleGeometry(0.035, 12), new THREE.MeshBasicMaterial({ color: 0x333333 }), 0.352, 0.225, 0); lamp.rotation.y = Math.PI / 2; lamp.rotation.x = 0;
    lamp.rotation.set(0, Math.PI / 2, 0); lamp.castShadow = false;
    lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: 0xfff0d0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    lampGlow.position.set(0.37, 0.225, 0); lampGlow.scale.set(0.35, 0.35, 1); g.add(lampGlow);
    // four chunky wheels on stub axles
    for (const [x, z] of [[0.2, 0.23], [0.2, -0.23], [-0.2, 0.23], [-0.2, -0.23]]) {
      const w = new THREE.Group(); w.position.set(x, 0.11, z); g.add(w);
      const tire = add(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14), blk, 0, 0, 0, w); tire.rotation.x = Math.PI / 2;
      const hub = add(new THREE.CylinderGeometry(0.05, 0.05, 0.085, 8), dark, 0, 0, 0, w); hub.rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) { const t = add(new THREE.BoxGeometry(0.022, 0.2, 0.086), blk, 0, 0, 0, w); t.rotation.z = (i / 3) * Math.PI; }
      wheels.push(w);
    }
    // the camera on its mast at the front, an aerial at the back with a light that blinks while it's live
    add(new THREE.CylinderGeometry(0.015, 0.02, 0.24, 8), dark, 0.2, 0.39, 0);
    add(new THREE.BoxGeometry(0.1, 0.07, 0.09), dark, 0.22, 0.52, 0);
    { const l = add(new THREE.CylinderGeometry(0.025, 0.028, 0.03, 10), blk, 0.28, 0.52, 0); l.rotation.z = Math.PI / 2; }
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.42, 5), dark, -0.26, 0.48, 0.15);
    led = add(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: 0x220a06 }), -0.26, 0.69, 0.15);
    // the basket: a wire cage over the back of the deck
    const wire = MATS.get('steelBolt'), bx = -0.08, bw = 0.4, bd = 0.34, bh = 0.15, by = 0.27;
    add(new THREE.BoxGeometry(bw, 0.008, bd), MATS.rep('grate', 0.4, 0.35), bx, by, 0);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.CylinderGeometry(0.006, 0.006, bh, 4), wire, bx + dx * bw / 2, by + bh / 2, dz * bd / 2);
    for (const s of [-1, 1]) { add(new THREE.BoxGeometry(bw, 0.008, 0.008), wire, bx, by + bh, s * bd / 2); add(new THREE.BoxGeometry(0.008, 0.008, bd), wire, bx + s * bw / 2, by + bh, 0); }
    for (let i = 1; i < 4; i++) for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.003, 0.003, bh, 3), wire, bx - bw / 2 + (i / 4) * bw, by + bh / 2, s * bd / 2);
    g.visible = false; R.scene.add(g);
    return g;
  }
  // the console in the bay: a pedestal with a sloped panel, a stick and buttons, and a little tube showing what the
  // rover sees; a stencil saying what it is
  function buildConsole(ship) {
    const C = ROVER.CONSOLE, g = new THREE.Group(); g.position.set(C.x, 0, C.z); ship.group.add(g);
    const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
    const paint = MATS.rep('painted', 0.6, 0.6, 0x5f6a5c), dark = MATS.get('darkmetal');
    add(new THREE.BoxGeometry(0.62, 0.86, 0.34), paint, 0, 0.43, 0.02);
    { const t = add(new THREE.BoxGeometry(0.66, 0.05, 0.36), dark, 0, 0.88, -0.02); t.rotation.x = -0.25; }
    { const st = add(new THREE.CylinderGeometry(0.012, 0.014, 0.16, 8), dark, -0.12, 0.98, -0.06); st.rotation.x = -0.25; add(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: 0xa01a10, roughness: 0.4 }), -0.12, 1.06, -0.08); }
    for (let i = 0; i < 4; i++) { const b = add(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 10), new THREE.MeshStandardMaterial({ color: [0x1c8a3a, 0xc4961e, 0x8a1c14, 0x2c4a6e][i], emissive: [0x1c8a3a, 0xc4961e, 0x8a1c14, 0x2c4a6e][i], emissiveIntensity: 0.25 }), 0.06 + (i % 2) * 0.07, 0.915, -0.04 - Math.floor(i / 2) * 0.07); b.rotation.x = -0.25; }
    // the screen in its housing, tipped up toward whoever stands there
    const hous = add(new THREE.BoxGeometry(0.5, 0.36, 0.2), dark, 0, 1.23, 0.1); hous.rotation.x = 0.18;
    feed = new THREE.WebGLRenderTarget(256, 192, { depthBuffer: true });
    screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.ShaderMaterial({
      uniforms: { tFeed: { value: feed.texture }, uLive: { value: 0 }, uT: { value: 0 }, uNoise: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tFeed; uniform float uLive, uT, uNoise; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tFeed, vUv).rgb * 2.4; c = c / (1.0 + c);
          float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, 0.5) * vec3(0.82, 1.0, 0.86);
          c *= 0.86 + 0.14 * sin(vUv.y * 420.0 + uT * 3.0);
          float n = h(floor(vUv * vec2(128.0, 96.0)) + fract(uT * 7.3));
          c = mix(c, vec3(n * 0.7), clamp(uNoise, 0.0, 1.0)) * uLive + vec3(0.02, 0.05, 0.03) * (1.0 - uLive) * n;
          vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 1.1;
          gl_FragColor = vec4(c * 1.15, 1.0); }`,
      toneMapped: false, fog: false,
    }));
    screen.position.set(0, 1.235, -0.0); screen.rotation.set(0.18 + Math.PI, 0, Math.PI); g.add(screen);
    screen.position.z = 0.1 - 0.101 * Math.cos(0.18); screen.position.y = 1.23 + 0.101 * Math.sin(0.18);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.07), new THREE.MeshStandardMaterial({ map: TEX.sign('ROVER CONTROL', { w: 256, h: 44, size: 30, bg: '#1b1b18', fg: '#e0b040', border: false }), roughness: 0.7 }));
    sign.position.set(0, 0.74, -0.151); sign.rotation.y = Math.PI; g.add(sign);
    feedCam = new THREE.PerspectiveCamera(78, 256 / 192, 0.05, 260);
    ship.col(C.x - 0.33, C.x + 0.33, C.z - 0.17, C.z + 0.25, 'rover');
    ship.interact.push({ kind: 'rover', x: C.x, y: 1.0, z: C.z - 0.2, r: 0.45 });
    g.visible = false;
    return g;
  }
  let consoleG = null;

  // ---------- state ----------
  const R0 = {
    init(ship) {
      mesh = build(); consoleG = buildConsole(ship);
      overlay = document.createElement('div'); overlay.id = 'rovercam'; overlay.className = 'hidden';
      overlay.innerHTML = '<div class="rc-tag">ROVER-1 · <span class="rc-link">LINK 100%</span></div><div class="rc-rec">● REC</div><div class="rc-hint">W A S D DRIVE · F LIGHT · SPACE HORN · E LET GO</div>';
      document.body.appendChild(overlay);
    },
    get owned() { return S.owned; },
    get state() { return S; },
    get driving() { return driving; },
    get zone() { return S.zone; },
    get carriedByMe() { return S.owned && S.carrier != null && S.carrier === G.localId; },
    // set it down just in front of you, on whatever floor is there
    requestDrop() {
      const me = G.me(); if (!me) return;
      const f = V(-Math.sin(me.yaw), 0, -Math.cos(me.yaw)); let x = me.pos.x + f.x * 0.7, z = me.pos.z + f.z * 0.7;
      if (me.zone === 'in' && G.fac && !G.fac.los(me.pos.x, me.pos.z, x, z)) { x = me.pos.x; z = me.pos.z; }
      G.request({ a: 'roverDrop', x, y: groundAt(x, z, me.pos.y + 0.3, me.zone), z, yaw: me.yaw + Math.PI / 2, zone: me.zone });
    },
    setOwned(on) { if (on && !S.owned) R0.dock(); S.owned = !!on; mesh.visible = consoleG.visible = S.owned; if (!on && driving) R0.stopDriving(); },
    // back on its spot in the bay
    dock() { Object.assign(S, { x: ROVER.DOCK.x, y: 0, z: ROVER.DOCK.z, yaw: ROVER.DOCK.yaw, zone: 'out', lit: false }); buf = []; v = 0; vy = 0; },
    // aboard: in the ship, on its deck
    aboard() { return S.zone === 'out' && G.ship.onFootprint(S.x, S.z) && S.y > -0.5 && S.y < 1; },
    basket() { return [...G.items.values()].filter((it) => it.basket != null).sort((a, b) => a.basket - b.basket); },
    freeSlot() { const used = new Set(R0.basket().map((it) => it.basket)); for (let i = 0; i < ROVER.SLOTS; i++) if (!used.has(i)) return i; return -1; },
    // where a basket slot sits in the world right now (drawn position)
    slotPos(i, out) {
      const lx = -0.17 + (i % 2) * 0.17, lz = i === 2 ? 0 : (i ? 0.07 : -0.07), ly = 0.3 + (i === 2 ? 0.08 : 0);
      out.set(lx, ly, lz).applyEuler(_e.set(roll, S.yaw, pitch, 'YXZ')).add(_p.set(S.x, S.y, S.z));
      return out;
    },
    serialize() { return { x: S.x, y: S.y, z: S.z, yaw: S.yaw, zone: S.zone, driver: S.driver, carrier: S.carrier, lit: S.lit }; },
    apply(o) { if (o) { Object.assign(S, o); buf = []; } },
    // the pose that goes over the network (driver -> host -> everyone)
    netPose() { return [+S.x.toFixed(2), +S.y.toFixed(2), +S.z.toFixed(2), +S.yaw.toFixed(3), S.zone === 'in' ? 1 : 0, S.lit ? 1 : 0]; },
    applyNet(a) {
      if (driving) return;
      const zone = a[4] ? 'in' : 'out';
      if (zone !== S.zone) buf = [];
      S.zone = zone; S.lit = !!a[5];
      buf.push({ t: G.now, x: a[0], y: a[1], z: a[2], yaw: a[3] }); if (buf.length > 10) buf.shift();
      if (buf.length === 1) Object.assign(S, { x: a[0], y: a[1], z: a[2], yaw: a[3] });
    },
    startDriving() { driving = true; driveT = 0; buf = []; camYaw = 0; camPitch = -0.12; v = 0; overlay.classList.remove('hidden'); $('hud').classList.add('cine', 'rc'); SFX.play('servo', null, { vol: 0.5, dur: 0.4, pitch: 1.6 }); },
    stopDriving() { if (!driving) return; driving = false; v = 0; buf = []; overlay.classList.add('hidden'); $('hud').classList.remove('cine', 'rc'); R.fx.static = 0; R.flash.intensity = 0; SFX.play('static', null, { dur: 0.25, vol: 0.5 }); },
    // the link: clear by the ship, grainier the further out it goes, worse still under ground
    link() {
      if (S.zone === 'in') { const d = G.fac ? G.fac.gloomAt(S.y) : 0; return clamp(0.82 - 0.22 * d - Math.min(0.2, Math.hypot(S.x, S.z) * 0.0012), 0.15, 0.85); }
      return clamp(1 - Math.max(0, Math.hypot(S.x, S.z) - 25) / ROVER.RANGE, 0.12, 1);
    },

    // ---------- every frame ----------
    update(dt) {
      if (!S.owned) return;
      const me = G.me();
      if (S.carrier != null) carried(dt); else if (driving) drive(dt, me); else follow(dt);
      present(dt);
      if (G.isHost) hostTick(dt);
      renderFeed(dt, me);
    },

    // it's solid: you walk round it, not through it (unless it's in someone's arms)
    push(p, rad, zone) {
      if (!S.owned || S.carrier != null || zone !== S.zone || p.y > S.y + 0.6 || p.y < S.y - 1.2) return;
      const dx = p.x - S.x, dz = p.z - S.z, d = Math.hypot(dx, dz), r = ROVER.R + rad;
      if (d < r && d > 1e-4) { p.x = S.x + (dx / d) * r; p.z = S.z + (dz / d) * r; }
    },
    // the console, and the basket when you're standing by the rover
    interactables(me, out) {
      if (!S.owned || driving || S.carrier != null) return;
      if (me.zone !== S.zone || Math.hypot(me.pos.x - S.x, me.pos.z - S.z) > 1.6 || Math.abs(me.pos.y - S.y) > 1.5) return;
      if (S.driver == null) out.push({ kind: 'roverPick', ref: 0, x: S.x, y: S.y + 0.2, z: S.z, r: 0.4, label: 'Pick up the rover (heavy)' });
      const id = me.slots[me.sel], held = id != null && G.items.get(id), p = R0.slotPos(1, V(0, 0, 0));
      if (held && R0.freeSlot() >= 0) out.push({ kind: 'basketPut', ref: held.id, x: p.x, y: p.y + 0.1, z: p.z, r: 0.45, label: 'Put ' + ITEMS[held.type].name + ' in the rover\'s basket' });
      else {
        const top = R0.basket().slice(-1)[0];
        if (top && me.slots.indexOf(null) >= 0 && !held) out.push({ kind: 'basketTake', ref: top.id, x: p.x, y: p.y + 0.1, z: p.z, r: 0.45, label: 'Take ' + ITEMS[top.type].name + ' from the basket', value: ITEMS[top.type].kind === 'scrap' ? top.value : 0 });
      }
    },
  };

  // ---------- driving (on the driver's own machine) ----------
  function drive(dt, me) {
    const I = Input, ui = HUD.blocking;
    if (!me || !me.alive || G.flight) { G.request({ a: 'undrive' }); R0.stopDriving(); return; }
    driveT += dt;
    if (!ui && I.hit('KeyE') && driveT > 0.3) { G.request({ a: 'undrive' }); R0.stopDriving(); return; }
    const link = R0.link();
    let thr = 0, steer = 0;
    if (!ui) {
      thr = (I.down('KeyW') ? 1 : 0) - (I.down('KeyS') ? 1 : 0); steer = (I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0);
      if (I.analog.x || I.analog.y) { thr = I.analog.y; steer = I.analog.x; }
      const s = 0.0022 * Settings.sens;
      camYaw = clamp(camYaw - I.mdx * s, -1.4, 1.4); camPitch = clamp(camPitch - I.mdy * s * (Settings.invertY ? -1 : 1), -0.9, 0.6);
      // (left alone while it's driving forward, the camera swings back to look where it's going)
      if (!I.mdx && thr > 0) camYaw = damp(camYaw, 0, 0.9, dt);
      if (I.hit('KeyF')) { S.lit = !S.lit; SFX.play('click'); }
      if (I.hit('Space') && hornT <= 0) { hornT = 0.8; G.request({ a: 'roverHorn' }); }
    }
    hornT -= dt;
    // (a weak link makes it sluggish to answer)
    const want = thr > 0 ? thr * ROVER.SPEED : thr * ROVER.REV, resp = 3.2 * (0.4 + 0.6 * link);
    v = damp(v, want, resp, dt);
    if (Math.abs(v) > 0.05) S.yaw -= steer * ROVER.TURN * dt * clamp(Math.abs(v) / 1.6, 0.35, 1) * Math.sign(v);
    else S.yaw -= steer * ROVER.TURN * 0.6 * dt;
    // move, then push out of anything solid; the ground (or the floor down there) carries it
    const f = fwd(S.yaw), ox = S.x, oz = S.z;
    const p = _p.set(S.x + f.x * v * dt, S.y, S.z + f.z * v * dt);
    if (S.zone === 'in' && G.fac) { const F = G.fac; F.collide(p, ROVER.R); F.collide(p, ROVER.R); if (!F.floorAt(F.ti(p.x), F.tj(p.z))) p.set(ox, S.y, oz); }
    else { if (G.ext && G.mode !== 'orbit') G.ext.collide(p, ROVER.R); G.ship.collide(p, ROVER.R); }
    // (and it can't drive through people)
    for (const q of G.players.values()) {
      if (!q.alive || q.zone !== S.zone) continue;
      const at = q.id === G.localId ? q.pos : q.rpos, dx = p.x - at.x, dz = p.z - at.z, d = Math.hypot(dx, dz), r = ROVER.R + 0.3;
      if (d < r && d > 1e-4 && Math.abs(at.y - S.y) < 1.2) { p.x = at.x + (dx / d) * r; p.z = at.z + (dz / d) * r; }
    }
    S.x = p.x; S.z = p.z;
    const moved = Math.hypot(S.x - ox, S.z - oz);
    if (Math.abs(v) > 0.3 && moved < Math.abs(v) * dt * 0.3) v *= 0.6;   // ran into something
    const gy = groundAt(S.x, S.z, S.y + 0.3, S.zone);
    if (S.y > gy + 0.02) { vy -= 18 * G.gravity(S.zone, S.x, S.y, S.z) * dt; S.y = Math.max(gy, S.y + vy * dt); } else { S.y = gy; vy = 0; }
    spin += (v * dt) / 0.11;
    // through a facility door, in or out
    portals();
    // the view: from the camera on its mast, panned and tilted by the driver
    const cam = R.camera, mp = V(0.31, 0.52, 0).applyEuler(_e.set(roll, S.yaw, pitch, 'YXZ')).add(V(S.x, S.y, S.z));
    cam.position.copy(mp); cam.rotation.set(camPitch + pitch * 0.5, S.yaw - Math.PI / 2 + camYaw, roll * 0.5, 'YXZ'); cam.updateMatrixWorld();
    if (Math.abs(cam.fov - 78) > 0.05) { cam.fov = 78; cam.updateProjectionMatrix(); }
    me.zoneView = S.zone;
    // its headlight is the flashlight the renderer already carries on the view
    R.flash.intensity = S.lit ? 34 : 0; R.flash.distance = 22; R.flash.angle = 0.6; R.flash.position.set(0, -0.15, 0);
    R.fx.static = clamp((1 - link) * 1.1, 0, 0.9);
    overlay.querySelector('.rc-link').textContent = 'LINK ' + Math.round(link * 100) + '%';
  }
  // the facility's doors: drive up to one and you're through it (the way a person goes through)
  function portals() {
    if (!G.ext || !G.fac) return;
    if (S.zone === 'out') {
      for (const o of G.ext.interact) if (o.kind === 'enter' && Math.hypot(o.x - S.x, o.z - S.z) < 1.4) {
        const ex = G.fac.exits.find((e) => e.kind === o.which) || G.fac.exits[0];
        S.zone = 'in'; S.x = ex.spawn.x; S.z = ex.spawn.z; S.y = G.fac.floorY(S.x, S.z, FAC_Y0 + 0.3); S.yaw = ex.spawn.yaw + Math.PI / 2; v = 0;
        SFX.play('door_open', null, { vol: 0.5 }); R.fx.fade = 1; return;
      }
    } else {
      for (const ex of G.fac.exits) if (Math.hypot(ex.x - S.x, ex.z - S.z) < 0.9) {
        const sp = ex.kind === 'fire' && G.ext.fire.spawn ? G.ext.fire.spawn : G.ext.entrance.spawn;
        S.zone = 'out'; S.x = sp.x; S.z = sp.z; S.y = sp.y; S.yaw = sp.yaw + Math.PI / 2; v = 0;
        SFX.play('door_open', null, { vol: 0.5 }); R.fx.fade = 1; return;
      }
    }
  }
  // ---------- carried: held out in front of whoever's got it, both hands ----------
  function carried(dt) {
    const p = G.players.get(S.carrier); if (!p) return;
    const mine = p.id === G.localId, at = mine ? p.pos : (p.rpos || p.pos), yaw = mine ? p.yaw : (p.ryaw || p.yaw);
    const f = V(-Math.sin(yaw), 0, -Math.cos(yaw));
    S.x = at.x + f.x * 0.38; S.z = at.z + f.z * 0.38; S.y = at.y + 0.9; S.yaw = yaw; S.zone = p.zone || 'out';
    buf = [];
  }
  // ---------- everyone else: follow the snapshots ----------
  function follow(dt) {
    if (buf.length < 2) { if (buf.length === 1) Object.assign(S, { x: buf[0].x, y: buf[0].y, z: buf[0].z, yaw: buf[0].yaw }); spd = 0; return; }
    const t = G.now - 110;
    let a = buf[0], b = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) if (buf[i].t <= t && buf[i + 1].t >= t) { a = buf[i]; b = buf[i + 1]; break; }
    const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1, ox = S.x, oz = S.z;
    S.x = lerp(a.x, b.x, k); S.y = lerp(a.y, b.y, k); S.z = lerp(a.z, b.z, k); S.yaw = a.yaw + angDiff(a.yaw, b.yaw) * k;
    const d = Math.hypot(S.x - ox, S.z - oz), f = fwd(S.yaw);
    spin += (d * Math.sign((S.x - ox) * f.x + (S.z - oz) * f.z)) / 0.11; spd = d / Math.max(dt, 1e-3);
  }
  // ---------- the host: the noise it makes, and what it's carrying ----------
  function hostTick(dt) {
    noiseT -= dt;
    const moving = driving ? Math.abs(v) > 0.4 : spd > 0.4;
    if (noiseT <= 0 && moving && S.driver != null && G.mode !== 'orbit') { noiseT = 0.7; G.addNoise(V(S.x, S.y + 0.2, S.z), 6, S.zone, null, 'step'); }
  }
  // ---------- drawing it ----------
  function present(dt) {
    // settle on the ground: lean with the slope under its wheels (unless someone's carrying it)
    if (S.carrier != null) { pitch = damp(pitch, 0, 8, dt); roll = damp(roll, 0.2, 8, dt); }   // (tipped toward whoever's carrying it)
    else if (S.zone === 'out' || G.fac) {
      const f = fwd(S.yaw), r = V(f.z, 0, -f.x);
      const h = (dx, dz) => groundAt(S.x + dx, S.z + dz, S.y + 0.3, S.zone);
      const hf = h(f.x * 0.25, f.z * 0.25), hb = h(-f.x * 0.25, -f.z * 0.25), hr = h(r.x * 0.2, r.z * 0.2), hl = h(-r.x * 0.2, -r.z * 0.2);
      pitch = damp(pitch, clamp(Math.atan2(hf - hb, 0.5), -0.5, 0.5), 10, dt); roll = damp(roll, clamp(Math.atan2(hr - hl, 0.4), -0.4, 0.4), 10, dt);
    }
    mesh.position.set(S.x, S.y, S.z); mesh.rotation.set(roll, S.yaw, pitch, 'YXZ');
    for (const w of wheels) w.rotation.z = -spin;
    // aboard a flying ship it rides along
    if (G.shipMoved && G.posAboard(mesh.position)) { mesh.position.applyMatrix4(G.shipM); mesh.quaternion.premultiply(G.shipQ); }
    const live = S.driver != null, t = performance.now() / 1000;
    led.material.color.setHex(live && t % 1 < 0.2 ? 0xff3020 : 0x220a06);
    lamp.material.color.setHex(S.lit ? 0xfff2d0 : 0x333333); lampGlow.material.opacity = S.lit && !driving ? 0.8 : 0;
  }
  // the console's tube: what the rover sees, a few times a second, while someone's near enough to watch
  function renderFeed(dt, me) {
    const live = S.driver != null, sh = screen.material.uniforms;
    sh.uT.value = performance.now() / 1000; sh.uLive.value = live ? 1 : 0;
    feedT -= dt; if (feedT > 0 || !live || !me || me.zone !== 'out') return;
    const cp = consoleG.getWorldPosition(V(0, 0, 0)); if (R.camera.position.distanceTo(cp) > 9 && !driving) return;
    feedT = 1 / 8;
    const mp = V(0.31, 0.52, 0).applyEuler(_e.set(roll, S.yaw, pitch, 'YXZ')).add(V(S.x, S.y, S.z));
    feedCam.position.copy(mp); feedCam.rotation.set(-0.12 + pitch * 0.5, S.yaw - Math.PI / 2, 0, 'YXZ');
    if (G.shipMoved && G.posAboard(mp)) { feedCam.position.applyMatrix4(G.shipM); feedCam.quaternion.premultiply(G.shipQ); }
    feedCam.updateMatrixWorld();
    sh.uNoise.value = clamp((1 - R0.link()) * 1.1, 0, 0.9);
    // (the outside world only shows if the rover is out in it; under ground, the screen is all it gets)
    if (S.zone === 'in' || G.zoneOf(me) === S.zone) { screen.visible = false; R.renderView(feedCam, feed, 0, 0, 256, 192); screen.visible = true; }
  }
  return R0;
})();
