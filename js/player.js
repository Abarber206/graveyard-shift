'use strict';
// Input + the local first-person player controller + held-item viewmodel.
const Input = {
  keys: new Set(), pressed: new Set(), mdx: 0, mdy: 0, wheel: 0, lmb: false, rmb: false, lmbP: false, rmbP: false, locked: false, canvas: null, onUnlock: null, onLock: null,
  // a thumbstick (touch): how far right and forward it's pushed, -1..1
  analog: { x: 0, y: 0 },
  init(canvas) {
    this.canvas = canvas;
    const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); };
    addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (['Space', 'Tab', 'KeyF', 'Quote', 'Slash'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.lmb = this.rmb = false; });
    addEventListener('mousemove', (e) => { if (this.locked) { this.mdx += e.movementX; this.mdy += e.movementY; } });
    addEventListener('mousedown', (e) => { if (!this.locked) return; if (e.button === 0) { this.lmb = true; this.lmbP = true; } if (e.button === 2) { this.rmb = true; this.rmbP = true; } });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.lmb = false; if (e.button === 2) this.rmb = false; });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.lmb = this.rmb = false; this.keys.clear(); if (this.onUnlock) this.onUnlock(); }
    });
  },
  // (on a touch screen there's no mouse to capture: locking just means playing, with the same side effects)
  lock() {
    if (Touch.on) { Touch.fullscreen(); if (!this.locked) { this.locked = true; if (this.onLock) this.onLock(); } return; }
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  },
  unlock() {
    if (Touch.on) { if (this.locked) { this.locked = false; this.lmb = this.rmb = false; this.keys.clear(); this.analog.x = this.analog.y = 0; if (this.onUnlock) this.onUnlock(); } return; }
    if (document.pointerLockElement) document.exitPointerLock();
  },
  down(c) { return this.keys.has(c); },
  hit(c) { return this.pressed.has(c); },
  endFrame() { this.pressed.clear(); this.lmbP = this.rmbP = false; this.mdx = this.mdy = 0; this.wheel = 0; },
};

const Player = (() => {
  const vel = new THREE.Vector3(), kick = new THREE.Vector3();
  // how long use is held on a door before it opens or shuts
  const DOOR_HOLD = 0.5; let holdT = 0, holdOn = null;
  let onGround = true, crouch = false, crouchT = 0, stamina = 1, exhausted = false, bob = 0, stepAcc = 0, shake = 0, roll = 0, prevWade = 0;
  let swingT = 0, swingCd = 0, scanCd = 0, useCd = 0, airT = 0, pantT = 0, fovKick = 0, keyed = false, eatT = 0, unwrapT = 0;
  let target = null;
  // a ship seat (index into G.ship.seats) while sitting in it, and how far into the sitting-down move the view is
  let seat = null, sitT = 0;
  // on the way up the airlock ladder to the roof deck, or back down: up the rungs looking up at the hatch, a blink
  // through the trunk, and out (the deck's ROOF; standing on it, me.roof)
  let climb = null;
  const LADDER = { x: AIRLOCK.x1 - 0.58, z: ROOF.hz };
  function stepClimb(me, dt, cam) {
    const c = climb, F = ROOF; c.t += dt;
    const a = clamp(c.t / 0.5, 0, 1), b = clamp((c.t - 0.5) / 0.55, 0, 1);
    if (c.up) {
      if (c.t < 0.5) { me.pos.set(lerp(c.x0, LADDER.x, Math.min(1, a * 2)), 1.4 * a, lerp(c.z0, LADDER.z, Math.min(1, a * 2))); me.pitch = damp(me.pitch, 0.95, 5, dt); }
      else { if (!c.swap) { c.swap = true; R.fx.fade = 1; me.roof = true; me.pitch = 0.5; } me.pos.set(F.hx, F.y - 1.2 * (1 - b), F.hz); me.pitch = damp(me.pitch, 0, 4, dt); }
    } else {
      if (c.t < 0.5) { me.pos.set(lerp(c.x0, F.hx, Math.min(1, a * 2)), F.y - 1.2 * a, lerp(c.z0, F.hz, Math.min(1, a * 2))); me.pitch = damp(me.pitch, -0.9, 5, dt); }
      else { if (!c.swap) { c.swap = true; R.fx.fade = 1; me.roof = false; me.pitch = -0.5; } me.pos.set(LADDER.x, 1.4 * (1 - b), LADDER.z); me.pitch = damp(me.pitch, 0, 4, dt); }
    }
    // (a rung underfoot every so often)
    c.rung -= dt; if (c.rung <= 0) { c.rung = 0.24; SFX.play('step', null, { surf: 'metal', vol: 0.45, pitch: 1.15 }); }
    if (c.t >= 1.05) {
      // off the top onto the deck, clear of the hatch; or off the bottom rung into the lock
      if (c.up) me.pos.set(F.hx + 0.05, F.y, F.hz - 0.85); else me.pos.set(LADDER.x - 0.1, 0, LADDER.z);
      climb = null; vel.set(0, 0, 0); onGround = true;
    }
    cam.position.set(me.pos.x, me.pos.y + eyeH(), me.pos.z); cam.rotation.set(me.pitch, me.yaw, 0, 'YXZ');
    me.moving = true; me.air = false;
  }
  // light (or put out) the lamp in your hand: everyone sees it, and it stays lit if you set it down
  function toggleLamp(it) {
    const d = ITEMS[it.type];
    if (!it.on && d.battery && it.battery <= 0) { HUD.toast('Battery dead'); return; }
    SFX.play(it.on ? 'click' : d.lamp.fire ? 'match' : 'click', null, { vol: 0.8 });
    it.on = !it.on; G.request({ a: 'lamp', item: it.id, on: it.on });
  }
  function standUp(me) {
    const S = G.ship.seats[seat]; seat = null; me.seat = null;
    if (S) { me.pos.set(S.exit.x, 0, S.exit.z); vel.set(0, 0, 0); }
    SFX.play('soft', null, { vol: 0.6, pitch: 0.8 });
  }
  // perks from snacks: seconds left on each, and what they add up to right now
  const perks = {};
  const fx = { drain: 1, regen: 1, speed: 1, light: 1, sway: 0 };
  function tickPerks(dt) {
    fx.drain = fx.regen = fx.speed = fx.light = 1; fx.sway = 0;
    for (const k in perks) {
      perks[k] -= dt;
      if (perks[k] <= 0) { delete perks[k]; continue; }
      const P = PERKS[k], fade = Math.min(1, perks[k] / 3);   // ease off over the last few seconds
      if (P.drain) fx.drain *= lerp(1, P.drain, fade);
      if (P.regen) fx.regen *= lerp(1, P.regen, fade);
      if (P.speed) fx.speed *= lerp(1, P.speed, fade);
      if (P.light) fx.light *= lerp(1, P.light, fade);
      if (P.sway) fx.sway = Math.max(fx.sway, fade);
    }
  }
  const vm = { root: new THREE.Group(), holder: new THREE.Group(), item: null, type: null, armL: null, armR: null, swayX: 0, swayY: 0, drop: 0 };
  const _vmv = new THREE.Vector3(), _vmp = new THREE.Vector3(), _vmm = new THREE.Vector3();
  let deathCam = null, specIdx = 0, specT = 0;

  function initVM() {
    R.vmScene.add(vm.root); vm.root.add(vm.holder);
    const sleeve = new THREE.MeshStandardMaterial({ color: SUIT_COLORS[0], roughness: 0.85, metalness: 0.2, map: TEX.get('suitWorn') });
    const glove = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.8 });
    // a forearm tapering from the elbow (back toward you) down to a narrower wrist, and a gloved hand
    const arm = () => { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.05, 0.5, 10), sleeve); s.rotation.x = Math.PI / 2; s.position.z = 0.22; g.add(s); const h = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.12), glove); h.position.z = -0.04; g.add(h); g.userData.glove = h; return g; };
    // the arms ride in the holder with the item, so they go wherever it goes (a swing, a drink)
    vm.armR = arm(); vm.armL = arm(); vm.holder.add(vm.armR); vm.holder.add(vm.armL);
    vm.sleeveMat = sleeve;
  }
  function setVM(type, id = 0) {
    const key = type ? itemLook(type, id) : null;
    if (vm.key === key) return;
    vm.type = type; vm.key = key;
    if (vm.item) { vm.holder.remove(vm.item); vm.item = null; }
    vm.drop = 1;
    if (!type) return;
    const m = ItemMeshes.build(type, id);
    vm.lens = null;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; if (o.name === 'lens') { o.material = o.material.clone(); vm.lens = o; } } });
    if (vm.lens) {
      vm.lensGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: 0xfff0d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      vm.lensGlow.scale.set(0.085, 0.085, 1); vm.lens.parent.add(vm.lensGlow); vm.lensGlow.position.copy(vm.lens.position).add(new THREE.Vector3(0, 0, -0.01));
    } else vm.lensGlow = null;
    const h = holdOf(type);
    m.position.set(h.p[0], h.p[1], h.p[2]); m.rotation.set(h.r[0], h.r[1], h.r[2]);
    vm.item = m; vm.holder.add(m);
  }
  function updateVM(dt, me, moveAmt) {
    const two = vm.type && ITEMS[vm.type].twoHanded;
    vm.swayX = damp(vm.swayX, clamp(-Input.mdx * 0.0012, -0.06, 0.06), 8, dt);
    vm.swayY = damp(vm.swayY, clamp(Input.mdy * 0.0012, -0.06, 0.06), 8, dt);
    vm.drop = damp(vm.drop, 0, 9, dt);
    const bx = Math.cos(bob) * 0.012 * moveAmt, by = Math.abs(Math.sin(bob)) * 0.016 * moveAmt;
    vm.root.position.set(vm.swayX + bx, vm.swayY - by - vm.drop * 0.4 - crouchT * 0.01, 0);
    vm.root.visible = me.alive && !!vm.type;
    // swing animation (shovel)
    const s = swingT > 0 ? Math.sin((1 - swingT / 0.45) * Math.PI) : 0;
    vm.holder.rotation.set(-s * 1.1, s * 0.5, s * 0.6);
    vm.holder.position.set(-s * 0.15, s * 0.1, s * 0.1);
    // eating / drinking: the hand brings it in close under your face and tips it back, holds it there a moment.
    // (the holder pivots about the middle of what's held, and that point travels to just below the mouth)
    if (eatT > 0 && vm.type) {
      const p = 1 - eatT / 1.1, e = sstep(0, 0.3, p) * (1 - sstep(0.78, 1, p)), h = holdOf(vm.type);
      vm.holder.rotation.set(1.05 * e, -0.15 * e, 0.08 * e);
      _vmp.set(h.p[0], h.p[1] + 0.05, h.p[2]);
      _vmv.copy(_vmp).lerp(_vmm.set(0.03, -0.085, -0.26), e);
      vm.holder.position.copy(_vmv).sub(_vmp.applyEuler(vm.holder.rotation));
    }
    // tearing a gift open: it's brought up close and worried at
    if (unwrapT > 0) {
      const p = 1 - unwrapT / 0.8, e = sstep(0, 0.2, p) * (1 - sstep(0.85, 1, p)), j = Math.sin(p * 46) * 0.05 * e;
      vm.holder.rotation.set(0.25 * e + j, j * 1.5, -j);
      vm.holder.position.set(-0.08 * e, 0.06 * e + j * 0.3, 0.1 * e);
    }
    // a lit charge spits sparks from its fuse
    if (vm.item && vm.type === 'bomb') { const sp = vm.item.getObjectByName('spark'); if (sp) sp.scale.setScalar(0.6 + Math.random() * 0.9); }
    if (vm.item) {
      // the glove (4 cm ahead of the arm's origin, along the forearm) sits on the item's grip point
      const h = holdOf(vm.type), g = h.grip || [two ? 0.22 : 0.02, -0.06, 0.08], A = vm.armR, gl = A.userData.glove;
      A.rotation.set(h.gr ? h.gr[0] : 0.1, h.gr ? h.gr[1] : two ? 0.25 : 0, h.gr ? h.gr[2] : 0);
      _vmv.set(0, 0, -0.04).applyEuler(A.rotation);
      A.position.set(h.p[0] + g[0] - _vmv.x, h.p[1] + g[1] - _vmv.y, h.p[2] + g[2] - _vmv.z);
      // a fist closed round something small stays square to it, whichever way the forearm comes in
      if (h.fist) { gl.quaternion.copy(A.quaternion).invert().multiply(vm.item.quaternion); gl.scale.set(1.1, 1, 0.8); }
      else { gl.quaternion.identity(); gl.scale.set(1, 1, 1); }
      vm.armL.visible = two;
      vm.armL.position.set(h.p[0] - 0.22, h.p[1] - 0.06, h.p[2] + 0.12); vm.armL.rotation.set(0.1, -0.25, 0);
    }
  }
  function eyeH() { return lerp(1.62, 1.05, crouchT); }
  function surface(me) {
    if (me.zone === 'in') return 'concrete';
    if (me.roof) return 'metal';
    if (G.ship.onFootprint(me.pos.x, me.pos.z) && me.pos.y < 1) return 'metal';
    if (wadeDepth(me) > 0.08) return 'water';
    return G.mode === 'orbit' ? 'metal' : 'dirt';
  }
  // how deep you're standing in the marsh's water (0 out of it)
  function wadeDepth(me) { return me.zone === 'out' && G.mode === 'site' && G.ext && G.ext.water != null ? Math.max(0, G.ext.water - me.pos.y) : 0; }
  function weightOf(me) {
    let w = 0; for (const id of me.slots) { const it = id != null && G.items.get(id); if (it) w += ITEMS[it.type].weight; }
    // (the rover in your arms, and what's in its basket)
    if (me.id === G.localId && Rover.carriedByMe) { w += ROVER.WEIGHT; for (const it of Rover.basket()) w += ITEMS[it.type].weight; }
    return w * (G.run && G.run.upgrades.harness ? 0.5 : 1);
  }
  function selItem(me) { const id = me.slots[me.sel]; return id != null ? G.items.get(id) : null; }

  // ---------------- interactables ----------------
  function findTarget(me) {
    const cam = R.camera;
    const eye = cam.getWorldPosition(new THREE.Vector3()), dir = cam.getWorldDirection(new THREE.Vector3());
    let best = null, bestScore = Infinity;
    const consider = (o) => {
      // something tall (h: half its height) is aimed at anywhere up it: the point on it level with where you're looking
      let oy = o.y;
      if (o.h) { const hd = Math.hypot(o.x - eye.x, o.z - eye.z), hl = Math.hypot(dir.x, dir.z); oy = clamp(eye.y + dir.y * hd / Math.max(hl, 0.05), o.y - o.h, o.y + o.h); }
      const v = new THREE.Vector3(o.x - eye.x, oy - eye.y, o.z - eye.z);
      const along = v.dot(dir);
      if (along < 0.1 || along > 2.6 + (o.r || 0.3)) return;
      const perp = v.clone().sub(dir.clone().multiplyScalar(along)).length();
      if (perp > (o.r || 0.3) + 0.12 + along * 0.08) return;
      const score = along + perp * 2 + (o.pen || 0);
      if (score < bestScore) { bestScore = score; best = o; }
    };
    for (const o of G.interactables(me)) consider(o);
    // only loose items need a line-of-sight check; doors and exits sit on the wall seam itself
    if (best && best.kind === 'item' && me.zone === 'in' && G.fac && !G.fac.los(eye.x, eye.z, best.x, best.z)) best = null;
    return best;
  }

  return {
    init() { initVM(); },
    get crouching() { return crouch; },
    get eye() { return eyeH(); },
    get stamina() { return stamina; },
    get exhausted() { return exhausted; },
    get target() { return target; },
    get weight() { const me = G.me(); return me ? weightOf(me) : 0; },
    setSuit(c) { if (vm.sleeveMat) vm.sleeveMat.color.set(suitHex(c)); },
    spawn(x, y, z, yaw) {
      const me = G.me(); if (!me) return;
      me.pos.set(x, y, z); me.yaw = yaw; me.pitch = 0; vel.set(0, 0, 0); kick.set(0, 0, 0); seat = null; me.seat = null; me.roof = false; climb = null;
      stamina = 1; exhausted = false; deathCam = null;
    },
    knock(kx, kz) { kick.x += kx; kick.z += kz; shake = Math.max(shake, 0.6); },
    get fx() { return fx; },
    get seat() { return seat; },
    get vmItem() { return vm.item; },
    sit(i) {
      const me = G.me(), S = G.ship.seats[i]; if (!me || !S) return;
      seat = i; me.seat = i; sitT = 0; crouch = false;
      me.pos.set(S.x, 0, S.z); me.yaw = S.yaw; me.pitch = Math.max(-0.4, Math.min(0.4, me.pitch)); vel.set(0, 0, 0);
      SFX.play('soft', null, { vol: 0.7 }); SFX.play('creak', new THREE.Vector3(S.x, 0.6, S.z), { vol: 0.15, ref: 1 });
    },
    // a snack went down: stamina back, and its perk (the host picked it). Nothing announces it: you feel it in how
    // long you can run, how fast you get your breath back, how steady the light is.
    ate(perk) {
      stamina = 1; exhausted = false;
      const P = PERKS[perk]; if (!P) return;
      if (P.dur) perks[perk] = P.dur;
      if (P.bad) { delete perks.wind; delete perks.rush; }
    },
    clearPerks() { for (const k in perks) delete perks[k]; tickPerks(0); },
    addShake(s) { shake = Math.max(shake, s); },
    startDeath(cause, from) { deathCam = { t: 0, cause, from }; },
    // up the airlock ladder onto the roof deck, or back down
    climb(up) { const me = G.me(); if (!me || climb) return; if (seat != null) standUp(me); climb = { t: 0, up, x0: me.pos.x, z0: me.pos.z, swap: false, rung: 0.1 }; },
    get climbing() { return !!climb; },
    swing() { swingT = 0.45; },
    resetVM() { setVM(null); },
    // where the walkie-talkie in your hand is on screen (just over the tip of its antenna), for words coming out of it:
    // { x, y } from -1 to 1 like the camera's; null when there isn't one showing
    handSpot() {
      const it = vm.item; if (!it || vm.type !== 'walkie' || !vm.root.visible || !vm.holder.visible || !it.visible) return null;
      it.updateWorldMatrix(true, false);
      const p = it.localToWorld(_vmp.set(-0.012, 0.25, 0.004)).project(R.vmCamera);
      return p.z < 1 ? { x: p.x, y: p.y } : null;
    },
    update(dt) {
      const me = G.me(); if (!me) return;
      const cam = R.camera;
      const ui = HUD.blocking;
      // ---------- left behind: the view is flying out to watch the ship go (G.updateSendoff has it) ----------
      if (G.sendoff) { vm.root.visible = false; return; }
      // ---------- fired: blown out of the hatch, the view riding your body (G.blowout has it) ----------
      if (G.seq && G.seq.kind === 'fired' && G.seq.blown) { vm.root.visible = false; return; }
      // ---------- dead: death cam, then spectate ----------
      if (!me.alive) {
        vm.root.visible = false;
        if (deathCam && deathCam.t < 3.2) {
          deathCam.t += dt;
          const t = deathCam.t;
          const faceKill = deathCam.cause === 'pale' || deathCam.cause === 'mannequin';
          // keep the light on the thing that got you, just long enough to see it
          if (!faceKill || t > 0.55) R.flash.intensity = 0;
          else if (R.flash.intensity < 30) R.flash.intensity = 45;
          const head = new THREE.Vector3(me.pos.x, me.pos.y + 1.5, me.pos.z);
          // (your own body going down: the view rides its head, and you don't see it from inside it)
          const rag = !faceKill && G.myBody && G.myBody.rag;
          if (rag) G.myBody.root.visible = false;
          if (deathCam.from) {
            const m = deathCam.from;
            const look = m.headPos ? m.headPos() : head;
            if (faceKill) {
              const away = cam.position.clone().sub(look).setY(0);
              if (away.lengthSq() < 1e-4) away.set(Math.sin(me.yaw), 0, Math.cos(me.yaw));
              const want = look.clone().addScaledVector(away.normalize(), 0.75); want.y = look.y - 0.08;
              cam.position.lerp(want, Math.min(1, dt * 9));
            } else if (rag) cam.position.lerp(rag.at('head'), 1 - Math.exp(-dt * 14));
            else cam.position.lerp(new THREE.Vector3(me.pos.x, me.pos.y + lerp(1.5, 0.3, Math.min(1, t * 1.5)), me.pos.z), 0.2);
            const q = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
            cam.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(q), Math.min(1, dt * (faceKill ? 16 : 5)));
          } else if (rag) {
            // tumbling with it: where its head goes, facing the way it faces
            cam.position.lerp(rag.at('head'), 1 - Math.exp(-dt * 14)); cam.quaternion.slerp(rag.headQ, 1 - Math.exp(-dt * 8));
          } else {
            cam.position.lerp(new THREE.Vector3(me.pos.x, me.pos.y + lerp(1.5, 0.3, Math.min(1, t * 1.5)), me.pos.z), 0.2);
            cam.rotation.z = damp(cam.rotation.z, 1.2, 3, dt);
          }
          return;
        }
        if (G.myBody) G.myBody.root.visible = true;
        R.flash.intensity = 0;
        // spectate
        const alive = G.alivePlayers();
        specT += dt;
        if (Input.lmbP || Input.hit('Space')) specIdx++;
        HUD.spectate(alive.length ? alive[specIdx % alive.length] : null);
        if (!alive.length) return;
        const p = alive[specIdx % alive.length];
        const yaw = p.yaw;
        const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const head = new THREE.Vector3(p.rpos ? p.rpos.x : p.pos.x, (p.rpos ? p.rpos.y : p.pos.y) + 1.7, p.rpos ? p.rpos.z : p.pos.z);
        let dist = 2.8;
        if (p.zone === 'in' && G.fac) { for (let d = 0.6; d <= 2.8; d += 0.2) { const c = head.clone().addScaledVector(back, d); if (!G.fac.floorAt(G.fac.ti(c.x), G.fac.tj(c.z))) { dist = d - 0.4; break; } } }
        const pos = head.clone().addScaledVector(back, dist); pos.y += 0.35;
        cam.position.lerp(pos, 1 - Math.exp(-dt * 8));
        cam.lookAt(head);
        me.zoneView = p.zone;
        return;
      }
      // ---------- at the rover's console: the view is the rover's (Rover.update has it); you stand still ----------
      if (Rover.driving) { vm.root.visible = false; me.moving = me.sprint = me.air = false; target = null; HUD.prompt(null, me); return; }
      if (climb) { vm.root.visible = false; target = null; HUD.prompt(null, me); stepClimb(me, dt, cam); return; }
      me.zoneView = me.zone;
      // ---------- look ----------
      if (!ui) {
        const s = 0.0022 * Settings.sens;
        me.yaw -= Input.mdx * s;
        me.pitch = clamp(me.pitch - Input.mdy * s * (Settings.invertY ? -1 : 1), -1.52, 1.52);
      }
      // ---------- sitting: look around from the seat; any move key, jump or crouch gets you up ----------
      if (seat != null) {
        const S = G.ship.seats[seat];
        if (!S || me.zone !== 'out' || (!ui && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC'].some((k) => Input.hit(k)))) standUp(me);
        else { const d = angDiff(S.yaw, me.yaw); if (Math.abs(d) > 1.9) me.yaw = S.yaw + Math.sign(d) * 1.9; }
      }
      me.seat = seat;
      // ---------- movement ----------
      const leeched = G.leechOn === me.id;
      let f = 0, st = 0;
      if (!ui && seat == null) {
        f = (Input.down('KeyW') ? 1 : 0) - (Input.down('KeyS') ? 1 : 0); st = (Input.down('KeyD') ? 1 : 0) - (Input.down('KeyA') ? 1 : 0);
        // (a thumbstick says how far as well as which way: a light push is a slow walk)
        if (Input.analog.x || Input.analog.y) { f = Input.analog.y; st = Input.analog.x; }
      }
      // crouch while C is held
      crouch = !ui && seat == null && Input.down('KeyC');
      crouchT = damp(crouchT, crouch ? 1 : 0, 10, dt);
      const moving = (f !== 0 || st !== 0);
      const implant = G.run && G.run.upgrades.implant;
      const adrenaline = (G.adrenaline || 0) > 0;
      const wantSprint = !ui && Input.down('ShiftLeft') && f > 0 && (!exhausted || adrenaline) && !leeched;
      if (wantSprint && crouch) crouch = false;
      const sprint = wantSprint && (stamina > 0 || adrenaline);
      const wmul = clamp(1 - weightOf(me) / 110, 0.45, 1);
      tickPerks(dt);
      // (wading drags at you: the deeper, the slower)
      const wade = wadeDepth(me), wslow = wade > 0.12 ? lerp(0.85, 0.4, clamp(wade / 1.3, 0, 1)) : 1;
      let speed = (sprint ? 6.3 * (adrenaline ? 1.2 : 1) : crouch ? 2.0 : 3.9) * wmul * (leeched ? 0.55 : 1) * fx.speed * wslow;
      const fw = new THREE.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw)), rt = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
      const want = fw.multiplyScalar(f).add(rt.multiplyScalar(st));
      if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed * Math.min(1, Math.hypot(f, st)));
      const acc = onGround ? 11 : 2.2;
      vel.x = damp(vel.x, want.x, acc, dt); vel.z = damp(vel.z, want.z, acc, dt);
      kick.multiplyScalar(Math.exp(-dt * 5));
      vel.y -= 22 * G.gravity(me.zone, me.pos.x, me.pos.y, me.pos.z) * dt;
      if (!ui && seat == null && Input.hit('Space') && onGround && stamina > 0.08 && !leeched) { vel.y = 6.0; stamina -= 0.08; crouch = false; onGround = false; }
      const ox = me.pos.x, oz = me.pos.z;
      me.pos.x += (vel.x + kick.x) * dt; me.pos.z += (vel.z + kick.z) * dt; me.pos.y += vel.y * dt;
      // creatures push you, then the world gets the final say (so a shove can never put you inside a wall)
      for (const m of G.monsters.values()) if (m.def.zone === me.zone) Monster.push(m, me.pos, 0.3);
      Rover.push(me.pos, 0.3, me.zone);
      // up on the roof deck the rail keeps you on it, and the hatch coaming is in the way
      if (me.roof) {
        const F = ROOF;
        me.pos.x = clamp(me.pos.x, F.x0 + 0.3, F.x1 - 0.3); me.pos.z = clamp(me.pos.z, F.z0 + 0.3, F.z1 - 0.3);
        const dx = me.pos.x - F.hx, dz = me.pos.z - F.hz, dd = Math.hypot(dx, dz), rr = 0.78;
        if (dd < rr && dd > 1e-4) { me.pos.x = F.hx + (dx / dd) * rr; me.pos.z = F.hz + (dz / dd) * rr; }
      }
      if (me.zone === 'in' && G.fac) {
        const f = G.fac;
        f.collide(me.pos, 0.32); f.collide(me.pos, 0.32);
        if (!f.floorAt(f.ti(me.pos.x), f.tj(me.pos.z))) {
          if (f.floorAt(f.ti(ox), f.tj(oz))) { me.pos.x = ox; me.pos.z = oz; }
          else { const t = f.nearestWalkable(f.ti(me.pos.x), f.tj(me.pos.z)); if (t) { me.pos.x = f.cx(t[0]); me.pos.z = f.cz(t[1]); } }
          kick.set(0, 0, 0);
        }
      }
      // with the ship in the air, it is only solid for those riding in it; anyone left below walks where it stood
      const shipHere = !G.ship.airborne || G.playerAboard(me);
      if (me.zone !== 'in' && seat == null && !me.roof) { if (G.ext && G.mode !== 'orbit' && !(G.ship.airborne && shipHere)) G.ext.collide(me.pos, 0.32); if (shipHere) G.ship.collide(me.pos, 0.32); }
      if (seat != null) { const S = G.ship.seats[seat]; me.pos.x = S.x; me.pos.z = S.z; vel.set(0, vel.y, 0); kick.set(0, 0, 0); }
      const ground = me.roof ? ROOF.y : me.zone === 'in' && G.fac ? G.fac.floorY(me.pos.x, me.pos.z, me.pos.y) : G.groundAt(me.pos.x, me.pos.z, !shipHere);
      // walking down stairs or a slope keeps your feet on it instead of stepping off into the air every frame
      if (onGround && vel.y <= 0 && me.pos.y > ground && me.pos.y - ground < (me.zone === 'in' ? 0.45 : 0.3)) me.pos.y = ground;
      if (me.pos.y <= ground) {
        if (!onGround && airT > 0.25) { const sf = surface(me); SFX.play('step', null, { surf: sf, vol: 0.7, pitch: 0.8 }); if (sf === 'water') SFX.play('splash', null, { k: 0.8, vol: 0.8 }); shake = Math.max(shake, Math.min(0.3, -vel.y * 0.02)); FX.step(me.pos, sf, Math.min(2, 0.8 + airT), me.zone, null, wadeDepth(me)); }
        me.pos.y = ground; vel.y = Math.max(0, vel.y); onGround = true; airT = 0;
      } else if (me.pos.y - ground > 0.08) { onGround = false; airT += dt; }
      // ceiling
      if (me.zone === 'in' && G.fac) { const c = G.fac.ceilY(me.pos.x, me.pos.z, me.pos.y) - eyeH() - 0.15; if (me.pos.y > c) { me.pos.y = Math.max(ground, c); vel.y = Math.min(0, vel.y); } }
      const hs = Math.hypot(me.pos.x - ox, me.pos.z - oz) / Math.max(dt, 1e-4);
      // stamina
      if (sprint && moving && hs > 1) stamina -= dt / (5.5 * (implant ? 1.6 : 1)) * (adrenaline ? 0.35 : 1) * fx.drain;
      else stamina += dt / ((implant ? 3.2 : 4.6) * (1 + weightOf(me) / 80)) * fx.regen;
      stamina = clamp(stamina, 0, 1);
      if (stamina <= 0 && !exhausted) { exhausted = true; }
      if (exhausted) { pantT -= dt; if (pantT <= 0) { SFX.play('pant', null, { vol: 0.9 }); pantT = 1.0; } if (stamina > 0.35) exhausted = false; }
      // footsteps
      if (onGround && hs > 0.5) {
        stepAcc += hs * dt;
        const stride = sprint ? 2.3 : crouch ? 1.3 : 1.75;
        if (stepAcc > stride) { stepAcc = 0; SFX.play('step', null, { surf: surface(me), vol: crouch ? 0.18 : sprint ? 0.75 : 0.45 }); FX.step(me.pos, surface(me), crouch ? 0.35 : sprint ? 1.3 : 0.8, me.zone, vel, wadeDepth(me)); }
      }
      // wading in: a splash as you break the water
      { const wd = wadeDepth(me); if (wd > 0.25 && prevWade <= 0.25 && hs > 1.2) { FX.splash(new THREE.Vector3(me.pos.x, G.ext.water, me.pos.z), 1, 'out'); SFX.play('splash', null, { k: 1, vol: 0.8 }); } prevWade = wd; }
      bob += hs * dt * 2.1;
      const moveAmt = onGround ? clamp(hs / 4, 0, 1.4) : 0;
      // camera
      shake = Math.max(0, shake - dt * 1.6);
      roll = damp(roll, -st * 0.012 + Math.sin(G.now * 0.0011) * 0.045 * fx.sway, 6, dt);
      cam.position.set(me.pos.x + (Math.random() - 0.5) * shake * 0.12, me.pos.y + eyeH() + Math.sin(bob * 2) * 0.035 * moveAmt + (Math.random() - 0.5) * shake * 0.12, me.pos.z);
      // seated: eyes where a seated head is (a little back, low)
      if (seat != null) { sitT = damp(sitT, 1, 7, dt); const E = G.ship.seats[seat].eye; cam.position.x = lerp(cam.position.x, E.x, sitT); cam.position.y = lerp(cam.position.y, E.y, sitT); cam.position.z = lerp(cam.position.z, E.z, sitT); }
      else sitT = 0;
      cam.rotation.set(me.pitch, me.yaw, roll, 'YXZ');
      fovKick = damp(fovKick, sprint && hs > 3 ? 6 : 0, 5, dt);
      const tf = Settings.fov + fovKick + (G.fovAdd || 0);
      if (Math.abs(cam.fov - tf) > 0.05) { cam.fov = tf; cam.updateProjectionMatrix(); }
      me.crouch = crouch; me.sprint = sprint && hs > 3; me.moving = hs > 0.8; me.air = !onGround && airT > 0.08;
      // ---------- inventory ----------
      // (carrying the rover takes both arms: nothing else comes out of your pockets until it's set down)
      const lugging = Rover.carriedByMe;
      const held = selItem(me);
      const locked2h = lugging || (held && ITEMS[held.type].twoHanded);
      if (!ui) {
        for (let i = 0; i < me.slots.length; i++) if (Input.hit('Digit' + (i + 1))) { if (locked2h) HUD.toast('Hands full — [G] to drop'); else me.sel = i; }
        if (Input.wheel && !locked2h) me.sel = (me.sel + Input.wheel + me.slots.length) % me.slots.length;
        else if (Input.wheel && locked2h) HUD.toast('Hands full — [G] to drop');
      }
      const cur = lugging ? null : selItem(me);
      setVM(cur ? cur.type : null, cur ? cur.id : 0);
      // drop
      if (!ui && Input.hit('KeyG') && lugging) Rover.requestDrop();
      else if (!ui && Input.hit('KeyG') && cur) G.dropHeld();
      // flashlight hotkey
      if (!ui && Input.hit('KeyF')) {
        const fl = me.slots.map((id) => id != null && G.items.get(id)).find((it) => it && ITEMS[it.type].light);
        if (fl) { if (fl.battery > 0) { fl.on = !fl.on; SFX.play('click'); } else HUD.toast('Battery dead'); }
      }
      // batteries
      const cells = G.run && G.run.upgrades.cells ? 1.6 : 1;
      for (const id of me.slots) {
        const it = id != null && G.items.get(id); if (!it) continue;
        const d = ITEMS[it.type];
        if (d.battery && it.on) { it.battery = Math.max(0, it.battery - dt / (d.battery * cells)); if (it.battery <= 0) { it.on = false; SFX.play('click'); HUD.toast(d.name + ': battery dead'); if (d.lamp) G.request({ a: 'lamp', item: it.id, on: false }); } }
      }
      // ---------- use item ----------
      swingT = Math.max(0, swingT - dt); swingCd -= dt; useCd -= dt; scanCd -= dt; eatT = Math.max(0, eatT - dt); unwrapT = Math.max(0, unwrapT - dt);
      me.radio = false;
      if (cur && !ui) {
        const d = ITEMS[cur.type];
        if (Input.lmbP) {
          if (d.light || cur.type === 'tracker') { if (cur.battery > 0) { cur.on = !cur.on; SFX.play('click'); } else HUD.toast('Battery dead'); }
          else if (d.lamp) toggleLamp(cur);
          else if (cur.type === 'shovel' && swingCd <= 0) {
            swingCd = 0.85; swingT = 0.45; SFX.play('swing');
            const e = cam.getWorldPosition(new THREE.Vector3()), dir = cam.getWorldDirection(new THREE.Vector3());
            setTimeout(() => G.request({ a: 'swing', o: [e.x, e.y, e.z], d: [dir.x, dir.y, dir.z] }), 160);
          } else if ((cur.type === 'stun' || d.bomb) && useCd <= 0) {
            useCd = 1; SFX.play(d.bomb ? 'swing' : 'pin');
            const e = cam.getWorldPosition(new THREE.Vector3()), dir = cam.getWorldDirection(new THREE.Vector3());
            G.request({ a: 'throw', item: cur.id, o: [e.x, e.y, e.z], d: [dir.x, dir.y, dir.z] });
          } else if (d.gift && useCd <= 0 && unwrapT <= 0) {
            // tear it open; whatever was inside ends up in your hand
            useCd = 1.4; unwrapT = 0.8; SFX.play('unwrap', null, { vol: 0.8 });
            const id = cur.id; setTimeout(() => G.request({ a: 'gift', item: id }), 700);
          } else if (d.kind === 'food' && useCd <= 0 && eatT <= 0) {
            // up to the mouth first; it is gone once it has gone down
            useCd = 1.4; eatT = 1.1; SFX.play(FOOD[cur.type].sound, null, { vol: 0.8 });
            const id = cur.id; setTimeout(() => G.request({ a: 'eat', item: id }), 650);
          } else if (d.noise && useCd <= 0) { useCd = 1.4; G.request({ a: 'noise', item: cur.id }); }
          else if (cur.type === 'walkie' && G.players.size <= 1 && useCd <= 0) {
            useCd = 2.5; SFX.play('static', null, { dur: 0.4 });
            if (Math.random() < 0.3) setTimeout(() => SFX.play('radio_ghost', null, { vol: 0.8 }), 600);
          }
        }
        // (keying it up: the click of the talk button and the hiss of the channel opening; letting go, the click again)
        if (cur.type === 'walkie' && Input.lmb && cur.battery > 0) {
          me.radio = true; cur.battery = Math.max(0, cur.battery - dt / (d.battery * cells));
          if (!keyed && G.players.size > 1) { keyed = true; SFX.play('radio_key', null, { vol: 0.8 }); SFX.play('squelch_on', null, { vol: 0.35 }); }
        }
      }
      if (keyed && !me.radio) { keyed = false; SFX.play('radio_key', null, { vol: 0.6 }); }
      // leech struggle
      if (leeched && !ui && Input.hit('KeyE')) { G.request({ a: 'struggle' }); shake = Math.max(shake, 0.25); }
      // scan (holding something that gives light, the right button lights it instead)
      if (!ui && Input.rmbP && cur && ITEMS[cur.type].lamp) toggleLamp(cur);
      else if (!ui && Input.rmbP && scanCd <= 0) { scanCd = 1.3; G.scan(); }
      // ---------- interaction ----------
      // (use with a lamp in hand and nothing in front of you lights it; facing a door or anything else, it's used)
      target = ui ? null : findTarget(me);
      // (a door takes a moment: a hand on the handle, the latch, the weight of it swinging; hold use on it until it goes,
      // and let go or look away and it doesn't)
      if (!ui && !leeched && target && target.kind === 'door') {
        if (Input.hit('KeyE')) { holdOn = target.ref; holdT = 0; }
        if (holdOn === target.ref && Input.down('KeyE')) { holdT += dt; if (holdT >= DOOR_HOLD) { G.interact(target); holdOn = null; } }
        else holdOn = null;
      } else {
        holdOn = null;
        if (!ui && !leeched && Input.hit('KeyE') && target) G.interact(target);
        else if (!ui && !leeched && Input.hit('KeyE') && cur && ITEMS[cur.type].lamp) toggleLamp(cur);
      }
      HUD.hold(holdOn ? holdT / DOOR_HOLD : 0);
      HUD.prompt(target, me);
      // flashlight light
      const lights = me.slots.map((id) => id != null && G.items.get(id)).filter((it) => it && ITEMS[it.type].light && it.on);
      const fl = lights.find((it) => it === cur) || lights[0];
      me.flash = fl ? (fl.type === 'proflash' ? 2 : 1) : 0;
      if (fl) {
        const L = ITEMS[fl.type].light, inHand = fl === cur;
        let f = 1;
        if (fl.battery < 0.15) f *= Math.random() < 0.12 ? 0.1 : 0.75 + fl.battery;
        if (G.flicker > 0) f *= Math.random() < G.flicker ? 0.05 : 1;
        R.flash.intensity = FLASH_K * L.power * f * (inHand ? 1 : 0.7);
        R.flash.distance = L.range; R.flash.angle = L.angle;
        R.flash.position.set(inHand ? 0.22 : 0.05, inHand ? -0.18 : -0.42, 0.05);
      } else R.flash.intensity = 0;
      // (the hand lit by the flashlight's spill, or warm from the lamp it's holding)
      const lampLit = cur && ITEMS[cur.type].lamp && cur.on;
      R.vmPoint.intensity = fl ? 1.5 : lampLit ? 2.2 : 0; R.vmPoint.color.setHex(lampLit && !fl ? ITEMS[cur.type].lamp.color : 0xfff2dc);
      updateVM(dt, me, moveAmt);
      if (vm.lens && cur && ITEMS[cur.type].light) {
        const lit = cur.on ? clamp(R.flash.intensity / FLASH_K, 0, 1.5) : 0;
        vm.lens.material.emissiveIntensity = 0.1 + lit * 1.4;
        if (vm.lensGlow) vm.lensGlow.material.opacity = lit * 0.45;
      }
    },
  };
})();
