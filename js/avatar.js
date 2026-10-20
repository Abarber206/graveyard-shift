'use strict';
// Crew robot: an industrial salvage unit painted in the crew's colour. Used for other players and for corpses.
//
// Rig conventions (the model faces -Z):
//   a limb hanging straight down swings FORWARD with a positive X rotation,
//   knees flex with a NEGATIVE X rotation (the shin folds back),
//   elbows flex with a POSITIVE X rotation (the forearm comes forward).
const SUIT_COLORS = [0xc8692a, 0x2f7f86, 0xb89a2c, 0x9a9a92, 0x7a3a8a, 0x3a7a3a];
// a crew colour is any '#rrggbb' picked on the wheel (an old save may still hold an index into the presets)
const suitHex = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? parseInt(c.slice(1), 16) : SUIT_COLORS[((c | 0) % SUIT_COLORS.length + SUIT_COLORS.length) % SUIT_COLORS.length]);
const suitCss = (c) => '#' + suitHex(c).toString(16).padStart(6, '0');

const ROBOT = { hip: 1.0, hipOff: 0.04, thigh: 0.44, shin: 0.44, foot: 0.09, upper: 0.32, fore: 0.31, shoulderY: 0.56, shoulderX: 0.29 };
// The rig is built in the units above (visor 1.94 m up) and the whole body drawn at this scale, so its visor sits
// right where the player's eyes are (1.62 m standing; 1.26 seated, just at the seat's eye point) and it stands about
// 1.75 m tall. What it holds is drawn at full size.
const AV_SCALE = 1.62 / 1.94;
// how each item is held on the avatar
const HOLD_STYLE = { flashlight: 'aim', proflash: 'aim', tracker: 'low', mappad: 'low', walkie: 'low', stun: 'low', shovel: 'tool' };

const RobotKit = (() => {
  const geo = {};
  const once = (k, f) => geo[k] || (geo[k] = f());
  // chamfered box centred on the origin: reads as machined plate rather than a plain cube
  function bev(w, h, d, b) {
    const s = new THREE.Shape(), hw = w / 2 - b, hh = h / 2 - b;
    s.moveTo(-hw, -hh); s.lineTo(hw, -hh); s.lineTo(hw, hh); s.lineTo(-hw, hh); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -Math.max(0.001, d - 2 * b) / 2); g.computeVertexNormals();
    return g;
  }
  // a faceted limb shell hanging down from y = 0
  function shell(r0, r1, len, seg = 8) { const g = new THREE.CylinderGeometry(r0, r1, len, seg); g.translate(0, -len / 2, 0); return g; }
  function axle(r, len, seg = 10) { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateZ(Math.PI / 2); return g; }
  const mats = {};
  const shared = (k, f) => mats[k] || (mats[k] = f());
  return {
    bev: (k, w, h, d, b) => once('b' + k, () => bev(w, h, d, b)),
    shell: (k, r0, r1, len, seg) => once('s' + k, () => shell(r0, r1, len, seg)),
    axle: (k, r, len) => once('a' + k, () => axle(r, len)),
    sphere: (k, r, w = 12, h = 8) => once('o' + k, () => new THREE.SphereGeometry(r, w, h)),
    cyl: (k, r0, r1, len, seg = 10) => once('c' + k, () => new THREE.CylinderGeometry(r0, r1, len, seg)),
    box: (k, w, h, d) => once('x' + k, () => new THREE.BoxGeometry(w, h, d)),
    dome: (k, r) => once('d' + k, () => { const g = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.75, 1); return g; }),
    hose: (k, pts) => once('h' + k, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.016, 6, false)),
    frame: () => shared('frame', () => new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.42, metalness: 0.65 })),
    joint: () => shared('joint', () => new THREE.MeshStandardMaterial({ color: 0x55595e, roughness: 0.32, metalness: 0.8 })),
    rubber: () => shared('rubber', () => new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.9 })),
    chrome: () => shared('chrome', () => new THREE.MeshStandardMaterial({ color: 0x8f948f, roughness: 0.45, metalness: 0.9 })),
    tape: () => shared('tape', () => new THREE.MeshStandardMaterial({ map: TEX.get('tape'), roughness: 0.95 })),
    canvas: () => shared('canvas', () => new THREE.MeshStandardMaterial({ color: 0x5e5642, roughness: 1, map: TEX.get('tape') })),
  };
})();

class Avatar {
  constructor(name, suit = 0) {
    const K = RobotKit, color = new THREE.Color(suitHex(suit)).lerp(new THREE.Color(0x8a8578), 0.18);
    // old paint, worn through and rusting; nothing on the suit gives off light of its own
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.22, map: TEX.get('suitWorn') });
    const glow = new THREE.MeshStandardMaterial({ color: 0x0e1113, roughness: 0.12, metalness: 0.75 });        // smoked visor glass
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x24170c, roughness: 0.3, metalness: 0.5 });     // the power cell's grimy window
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x2a0a08, roughness: 0.4 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const tipMat = K.rubber();
    const tape = K.tape(), rust = MATS.get('rust');
    this.mats = { paint, glow, lampMat, tipMat };
    const frame = K.frame(), joint = K.joint(), rubber = K.rubber(), chrome = K.chrome();
    const mk = (g, m, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz);
      me.castShadow = true; me.receiveShadow = true; parent.add(me); return me;
    };
    const R = ROBOT;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.body.scale.setScalar(AV_SCALE); this.root.add(this.body);
    // ---- pelvis ----
    this.hips = new THREE.Group(); this.hips.position.y = R.hip; this.body.add(this.hips);
    mk(K.bev('pelvis', 0.34, 0.16, 0.22, 0.03), frame, this.hips);
    mk(K.bev('hipPlate', 0.26, 0.12, 0.05, 0.015), paint, this.hips, 0, -0.01, -0.12);
    for (const s of [-1, 1]) mk(K.bev('hipSide', 0.05, 0.13, 0.16, 0.012), paint, this.hips, s * 0.18, -0.02, 0);
    // ---- torso (twists against the hips) ----
    this.torso = new THREE.Group(); this.torso.position.y = 0.08; this.hips.add(this.torso);
    mk(K.cyl('abd', 0.11, 0.12, 0.2), frame, this.torso, 0, 0.1, 0);
    for (const y of [0.05, 0.15]) mk(K.cyl('ring', 0.128, 0.128, 0.024, 14), joint, this.torso, 0, y, 0);
    mk(K.bev('chest', 0.5, 0.4, 0.3, 0.05), paint, this.torso, 0, 0.42, 0);
    mk(K.bev('vent', 0.28, 0.15, 0.04, 0.012), frame, this.torso, 0, 0.37, -0.15);
    for (let i = 0; i < 4; i++) mk(K.box('slat', 0.24, 0.012, 0.012), joint, this.torso, 0, 0.32 + i * 0.033, -0.172);
    mk(K.box('hz', 0.13, 0.028, 0.006), MATS.get('hazard'), this.torso, -0.15, 0.56, -0.152);
    this.statusLed = mk(K.box('led', 0.03, 0.03, 0.01), ledMat, this.torso, 0.16, 0.56, -0.153);
    // a canvas pouch belted on, and a dented replacement plate bolted over the right shoulder in bare rusted steel
    mk(K.bev('pouch', 0.12, 0.1, 0.07, 0.015), K.canvas(), this.hips, -0.13, -0.03, -0.13);
    mk(K.box('belt', 0.36, 0.035, 0.24), K.canvas(), this.hips, 0, 0.045, 0);
    mk(K.dome('patch', 0.13), rust, this.torso, 0.29, R.shoulderY + 0.045, 0, 0, 0, -0.1);
    mk(K.bev('collar', 0.3, 0.07, 0.22, 0.02), frame, this.torso, 0, 0.645, 0.01);
    for (const s of [-1, 1]) mk(K.dome('pad', 0.125), paint, this.torso, s * R.shoulderX, R.shoulderY + 0.03, 0);
    // backpack power unit
    mk(K.bev('pack', 0.38, 0.44, 0.17, 0.03), frame, this.torso, 0, 0.42, 0.235);
    for (const s of [-1, 1]) {
      mk(K.cyl('can', 0.055, 0.055, 0.36, 12), paint, this.torso, s * 0.12, 0.42, 0.335);
      mk(K.cyl('canCap', 0.06, 0.06, 0.03, 12), joint, this.torso, s * 0.12, 0.615, 0.335);
    }
    this.core = mk(K.box('core', 0.05, 0.28, 0.02), coreMat, this.torso, 0, 0.42, 0.33);
    // a coolant hose looping from the pack round to the collar
    { const V = (x, y, z) => new THREE.Vector3(x, y, z); mk(K.hose('hose', [V(-0.12, 0.62, 0.33), V(-0.2, 0.7, 0.22), V(-0.17, 0.69, 0.04)]), rubber, this.torso); }
    mk(K.cyl('ant', 0.008, 0.008, 0.46, 5), chrome, this.torso, 0.14, 0.86, 0.29);
    mk(K.cyl('antTape', 0.014, 0.014, 0.05, 8), tape, this.torso, 0.14, 0.7, 0.29);
    this.tip = mk(K.sphere('tip', 0.02, 8, 6), tipMat, this.torso, 0.14, 1.09, 0.29);
    mk(K.cyl('neck', 0.06, 0.07, 0.1), frame, this.torso, 0, 0.7, 0);
    // ---- head ----
    this.head = new THREE.Group(); this.head.position.y = 0.74; this.torso.add(this.head);
    mk(K.bev('helm', 0.28, 0.24, 0.3, 0.05), paint, this.head, 0, 0.12, 0);
    mk(K.bev('crest', 0.06, 0.05, 0.27, 0.015), paint, this.head, 0, 0.255, 0.01);
    mk(K.bev('face', 0.24, 0.13, 0.04, 0.012), frame, this.head, 0, 0.11, -0.15);
    this.visor = mk(K.box('visor', 0.2, 0.034, 0.01), glow, this.head, 0, 0.12, -0.172);
    mk(K.box('chin', 0.12, 0.03, 0.02), joint, this.head, 0, 0.045, -0.16);
    for (const s of [-1, 1]) { mk(K.axle('ear', 0.055, 0.05), frame, this.head, s * 0.155, 0.11, 0.01); mk(K.axle('earCap', 0.035, 0.012), joint, this.head, s * 0.183, 0.11, 0.01); }
    this.lamp = mk(K.box('lamp', 0.06, 0.05, 0.07), lampMat, this.head, 0.16, 0.19, -0.08);
    // ---- arms ----
    const arm = (side) => {
      const g = new THREE.Group(); g.position.set(side * R.shoulderX, R.shoulderY, 0); this.torso.add(g);
      mk(K.sphere('shoulder', 0.072), joint, g);
      mk(K.shell('upper', 0.066, 0.056, 0.26), paint, g, 0, -0.04, 0);
      mk(K.cyl('urod', 0.025, 0.025, 0.3, 6), chrome, g, 0, -0.16, 0.05);
      const elbow = new THREE.Group(); elbow.position.y = -R.upper; g.add(elbow);
      mk(K.axle('elbow', 0.05, 0.13), joint, elbow);
      mk(K.shell('fore', 0.06, 0.048, 0.24), paint, elbow, 0, -0.025, 0);
      // the left forearm has been taped back together
      if (side < 0) for (const y of [-0.09, -0.15]) mk(K.cyl('foreTape', 0.059, 0.057, 0.035, 10), tape, elbow, 0, y, 0, 0, 0, 0.06);
      mk(K.cyl('wrist', 0.045, 0.045, 0.03, 10), frame, elbow, 0, -0.275, 0);
      const hand = new THREE.Group(); hand.position.y = -0.29; elbow.add(hand);
      mk(K.bev('palm', 0.08, 0.1, 0.055, 0.012), frame, hand, 0, -0.05, 0);
      for (const f of [-1, 1]) mk(K.box('finger', 0.026, 0.07, 0.04), rubber, hand, f * 0.022, -0.125, -0.008, 0.25, 0, 0);
      mk(K.box('thumb', 0.024, 0.06, 0.03), rubber, hand, -side * 0.048, -0.075, -0.02, 0.2, 0, side * 0.35);
      // items sit in the grip: its -Z runs out along the fingers, its +Y faces the front of the forearm
      const grip = new THREE.Group(); grip.position.set(0, -0.08, -0.02); grip.rotation.x = -Math.PI / 2; hand.add(grip);
      return { g, elbow, hand, grip };
    };
    this.armL = arm(-1); this.armR = arm(1);
    // ---- legs ----
    const leg = (side) => {
      const g = new THREE.Group(); g.position.set(side * 0.11, -R.hipOff, 0); this.hips.add(g);
      mk(K.sphere('hipBall', 0.072), joint, g);
      mk(K.shell('thigh', 0.088, 0.07, 0.36), paint, g, 0, -0.04, 0);
      mk(K.cyl('trod', 0.04, 0.04, 0.42, 8), frame, g, 0, -0.22, 0);
      const knee = new THREE.Group(); knee.position.y = -R.thigh; g.add(knee);
      mk(K.axle('knee', 0.064, 0.16), joint, knee);
      mk(K.bev('kneePad', 0.12, 0.13, 0.06, 0.015), paint, knee, 0, 0.0, -0.07);
      mk(K.shell('shin', 0.075, 0.058, 0.34), paint, knee, 0, -0.03, 0);
      if (side > 0) mk(K.cyl('shinTape', 0.072, 0.07, 0.05, 10), tape, knee, 0, -0.17, 0, 0, 0, -0.08);
      else mk(K.bev('thighPatch', 0.1, 0.12, 0.03, 0.01), rust, g, 0, -0.2, -0.085);
      mk(K.cyl('piston', 0.018, 0.018, 0.3, 6), chrome, knee, 0, -0.21, 0.075);
      mk(K.cyl('pistonB', 0.03, 0.03, 0.12, 8), frame, knee, 0, -0.1, 0.075);
      const ankle = new THREE.Group(); ankle.position.y = -R.shin; knee.add(ankle);
      mk(K.sphere('ankle', 0.05, 10, 6), joint, ankle);
      mk(K.bev('foot', 0.13, 0.08, 0.27, 0.02), frame, ankle, 0, -0.05, -0.045);
      mk(K.bev('toe', 0.135, 0.05, 0.07, 0.015), paint, ankle, 0, -0.04, -0.16);
      mk(K.box('sole', 0.14, 0.012, 0.28), rubber, ankle, 0, -0.087, -0.045);
      return { g, knee, ankle };
    };
    this.legL = leg(-1); this.legR = leg(1);
    // two-handed loads ride in front of the chest
    this.carry = new THREE.Group(); this.torso.add(this.carry);
    // name tag
    const [c, g] = TEX.canvas(256, 48);
    g.font = '30px "VT323", monospace'; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 4, 256, 40);
    g.fillStyle = '#ffd29a'; g.fillText(String(name).slice(0, 16).toUpperCase(), 128, 34);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    this.tag.scale.set(1.2, 0.225, 1); this.tag.position.y = 2.0; this.root.add(this.tag);
    // animation state
    this.dead = false; this.held = null; this.heldType = null; this.style = null; this.carryDim = null;
    this.phase = Math.random() * TAU; this.vel = new THREE.Vector3(); this.lastPos = null; this.lastYaw = null;
    this.legYaw = 0; this.moveBlend = 0; this.runBlend = 0; this.air = 0; this.crouchBlend = 0; this.yawRate = 0;
    this.t = Math.random() * 10; this.look = { yaw: 0, target: 0, timer: 2 };
  }
  // both arms round something that isn't an item in their hands (the rover, drawn on its own): just the pose.
  // (hw: half its width across the chest; d: how far it reaches out in front, both in metres)
  setHug(hw, d) {
    if (this.heldKey === 'hug') return;
    this.setHeld(null); this.heldKey = 'hug'; this.style = 'carry2';
    const zc = -0.2 * AV_SCALE - d / 2;
    this.carryDim = { hw: Math.min(0.3, (hw + 0.02) / AV_SCALE), z: zc / AV_SCALE };
  }
  setHeld(type, id = 0) {
    const key = type ? itemLook(type, id) : null;
    if (key === this.heldKey) return;
    if (this.held) { this.held.parent && this.held.parent.remove(this.held); this.held = null; }
    this.heldType = type; this.heldKey = key; this.style = null;
    if (!type) return;
    const m = ItemMeshes.build(type, id);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const two = ITEMS[type] && ITEMS[type].twoHanded, S = AV_SCALE;
    // (held things are drawn at their true size: the wrapper undoes the body's scale; offsets inside it are in metres)
    const w = new THREE.Group(); w.scale.setScalar(1 / S); w.add(m);
    this.style = two ? 'carry2' : HOLD_STYLE[type] || 'carry1';
    if (this.style === 'carry2') {
      // hug the load against the chest: its back face just in front of the chest plate
      const zc = -0.2 * S - size.z / 2;
      m.position.set(-mid.x, 0.34 * S - mid.y, zc - mid.z);
      this.carryDim = { hw: Math.min(0.3, (size.x / 2 + 0.02) / S), z: zc / S };
      this.carry.add(w);
    } else {
      if (this.style === 'tool') m.position.set(-mid.x, -mid.y, -box.max.z + 0.12);           // grab the shovel near its T-grip
      else if (this.style === 'aim') m.position.set(-mid.x, -mid.y, -mid.z + 0.03);           // torch body in the palm
      else m.position.set(-mid.x, -box.min.y - Math.min(0.05, size.y * 0.3), -mid.z);          // sits in the palm, upright
      this.armR.grip.add(w);
    }
    this.held = w;
  }
  setLamp(on) { this.mats.lampMat.color.set(on ? 0xfff2c8 : 0x333333); }
  // 2-bone arm IK in the arm's swing plane: target (y, z) relative to the shoulder; returns [shoulder, elbow]
  static armIK(ty, tz) {
    const L1 = ROBOT.upper, L2 = ROBOT.fore + 0.08;
    const d = clamp(Math.hypot(ty, tz), 0.12, L1 + L2 - 0.005);
    const th = Math.atan2(-tz, -ty);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const g = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    return [th - a, Math.PI - g];
  }
  // vertical reach of a leg for a given hip and knee angle (keeps the planted foot on the ground)
  static legReach(th, kn) { const R = ROBOT; return R.hipOff + R.thigh * Math.cos(th) + R.shin * Math.cos(th + kn) + R.foot; }
  update(dt, s) {
    if (this.dead) return;
    this.t += dt;
    // ---- motion, measured from where the root actually went (or, riding the ship, where they went in it: the
    // ship carrying them through the air is not them walking) ----
    const p = s.at || this.root.position, yaw = s.yaw != null ? s.yaw : this.root.rotation.y;
    if (!this.lastPos) { this.lastPos = p.clone(); this.lastYaw = yaw; }
    const inv = 1 / Math.max(dt, 1e-3);
    let vx = (p.x - this.lastPos.x) * inv, vy = (p.y - this.lastPos.y) * inv, vz = (p.z - this.lastPos.z) * inv;
    if (Math.abs(vx) + Math.abs(vz) > 30 || Math.abs(vy) > 30) vx = vy = vz = 0; // teleports
    this.lastPos.copy(p);
    this.yawRate = damp(this.yawRate, angDiff(this.lastYaw, yaw) * inv, 8, dt); this.lastYaw = yaw;
    this.vel.x = damp(this.vel.x, vx, 9, dt); this.vel.y = damp(this.vel.y, vy, 9, dt); this.vel.z = damp(this.vel.z, vz, 9, dt);
    const fwd = -Math.sin(yaw) * this.vel.x - Math.cos(yaw) * this.vel.z;
    const side = Math.cos(yaw) * this.vel.x - Math.sin(yaw) * this.vel.z;
    const speed = Math.hypot(fwd, side);
    const crouch = s.crouch ? 1 : 0;
    this.crouchBlend = damp(this.crouchBlend, crouch, 10, dt);
    this.moveBlend = damp(this.moveBlend, clamp((speed - 0.3) / 0.9, 0, 1), 10, dt);
    this.runBlend = damp(this.runBlend, clamp((speed - 4.2) / 1.6, 0, 1), 6, dt);
    // off the ground only when they really are (walking down stairs drops you fast, but your feet stay on the steps)
    this.air = damp(this.air, (s.air != null ? s.air : Math.abs(this.vel.y) > 1.6) ? 1 : 0, 10, dt);
    const mv = this.moveBlend, run = this.runBlend, cr = this.crouchBlend;
    // legs turn toward the travel direction (upper body keeps facing the aim); walking backwards runs the cycle in reverse
    const dirA = Math.atan2(side, fwd), back = Math.abs(dirA) > 1.95 && speed > 0.3;
    const ly = back ? angDiff(0, dirA - Math.PI) : dirA;
    this.legYaw = damp(this.legYaw, clamp(ly, -0.75, 0.75) * mv, 8, dt);
    // shuffle the feet when turning on the spot
    const shuffle = clamp(Math.abs(this.yawRate) / 2.5, 0, 1) * (1 - mv);
    const stepLen = lerp(lerp(1.1, 1.55, run), 0.75, cr);
    this.phase += (back ? -1 : 1) * (speed / (2 * stepLen)) * TAU * dt + shuffle * 7 * dt;
    const gait = Math.max(mv, shuffle * 0.35);
    // ---- legs ----
    const amp = lerp(0.5, 0.68, run) * lerp(1, 0.6, cr) * gait;
    const kneeLift = lerp(1.0, 1.75, run) * gait;
    const legPose = (ph) => {
      const sw = Math.sin(ph), swing = Math.max(0, Math.cos(ph));
      let th = sw * amp + cr * 1.2 + run * 0.12;
      let kn = -(Math.pow(swing, 1.3) * kneeLift + 0.1 * gait) - cr * 2.15;
      // airborne: tuck
      th = lerp(th, 0.55 + sw * 0.25, this.air); kn = lerp(kn, -1.0 - swing * 0.4, this.air);
      return [th, kn];
    };
    let [thL, knL] = legPose(this.phase), [thR, knR] = legPose(this.phase + Math.PI);
    // sitting: hips down on the cushion, thighs out level, shins hanging to the floor
    const sit = this.sitBlend = damp(this.sitBlend || 0, s.sit ? 1 : 0, 8, dt);
    if (sit > 0.001) { thL = lerp(thL, 1.45, sit); thR = lerp(thR, 1.45, sit); knL = lerp(knL, -1.5, sit); knR = lerp(knR, -1.5, sit); }
    const reach = Math.max(Avatar.legReach(thL, knL), Avatar.legReach(thR, knR));
    this.hips.position.y = damp(this.hips.position.y, lerp(lerp(reach, ROBOT.hip - 0.12, this.air * 0.5), 0.57, sit), 20, dt);
    this.hips.rotation.y = (this.legYaw + Math.sin(this.phase) * 0.07 * gait) * (1 - sit);
    this.hips.rotation.z = Math.cos(this.phase) * 0.03 * gait;
    const setLeg = (L, th, kn, ph) => {
      L.g.rotation.set(th, 0, 0); L.knee.rotation.x = kn;
      // feet stay flat on the ground, toes push off as the leg leaves it
      const push = Math.max(0, -Math.sin(ph)) * Math.max(0, Math.cos(ph) + 0.2) * 0.5 * gait;
      L.ankle.rotation.x = -(th + kn) * (1 - this.air * 0.5) + push;
    };
    setLeg(this.legL, thL, knL, this.phase); setLeg(this.legR, thR, knR, this.phase + Math.PI);
    // ---- torso + head ----
    const pitch = s.pitch || 0;
    const breathe = Math.sin(this.t * 1.7) * 0.012 * (1 - mv);
    this.torso.rotation.x = lerp(-(0.06 * mv + 0.2 * run) - cr * 0.32 + pitch * 0.12 + breathe, 0.1 + breathe, sit);
    // seated, the body stays square to the seat and the head follows the view (s.look: how far round from straight
    // ahead it is); past what a neck turns, the shoulders twist round with it
    const look = s.look != null ? clamp(s.look, -1.9, 1.9) : null, twist = look != null ? look - clamp(look, -1.3, 1.3) : 0;
    this.torso.rotation.y = (-this.legYaw - Math.sin(this.phase) * 0.1 * gait) * (1 - sit) + twist;
    // idle robots scan around now and then
    const L = this.look; L.timer -= dt;
    if (L.timer <= 0) { L.timer = 2 + Math.random() * 4; L.target = mv < 0.2 && Math.random() < 0.6 ? (Math.random() - 0.5) * 0.9 : 0; }
    L.yaw = damp(L.yaw, mv < 0.2 ? L.target : 0, 5, dt);
    this.head.rotation.set(clamp(pitch * 0.75, -0.75, 0.75), look != null ? look - twist : L.yaw, 0);
    // ---- arms ----
    const armAmp = lerp(0.38, 0.75, run) * gait * (1 - cr * 0.5);
    const elbowRest = 0.22 + run * 1.15 + cr * 0.35;
    const free = (A, sideSign, ph) => {
      // (seated, the hands rest on the knees)
      A.g.rotation.set(lerp(Math.sin(ph) * armAmp + cr * 0.25 + this.air * 0.4, 0.62, sit), 0, sideSign * lerp(0.1 + this.air * 0.45, 0.12, sit));
      A.elbow.rotation.x = lerp(elbowRest + Math.max(0, Math.sin(ph)) * 0.3 * gait, 0.95, sit);
    };
    // the left arm swings with the right leg and vice versa
    const phL = this.phase + Math.PI, phR = this.phase;
    const st = this.style, swing = s.swing || 0;
    if (st === 'carry2' && this.carryDim) {
      for (const [A, sd] of [[this.armL, -1], [this.armR, 1]]) {
        const [sh, el] = Avatar.armIK(0.34 - ROBOT.shoulderY - 0.02, this.carryDim.z + 0.04);
        A.g.rotation.set(sh, 0, -sd * Math.asin(clamp((ROBOT.shoulderX - this.carryDim.hw) / 0.55, 0, 0.6)));
        A.elbow.rotation.x = el;
      }
    } else {
      free(this.armL, -1, phL);
      if (!st) free(this.armR, 1, phR);
      else if (st === 'aim') {
        // the forearm (and the torch in it) points where they are looking
        const el = 0.3, total = Math.PI / 2 + clamp(pitch, -1.1, 1.1) * 0.9;
        this.armR.g.rotation.set(total - el - this.torso.rotation.x, 0, -0.06); this.armR.elbow.rotation.x = el;
      } else if (st === 'low') {
        const el = 1.05, total = 1.25 + pitch * 0.35;
        this.armR.g.rotation.set(total - el, 0, -0.12); this.armR.elbow.rotation.x = el;
      } else if (st === 'tool') {
        // carried low and ready; a swing lifts it overhead and chops down
        const sh = lerp(0.3 + Math.sin(phR) * armAmp * 0.4, 2.7, swing), el = lerp(0.55, 0.35, swing);
        this.armR.g.rotation.set(sh, 0, 0.08); this.armR.elbow.rotation.x = el;
      } else {
        const el = 1.2, sh = 0.32 + Math.sin(phR) * armAmp * 0.25;
        this.armR.g.rotation.set(sh, 0, 0.12); this.armR.elbow.rotation.x = el;
      }
    }
  }
  setDead(seed = 1) {
    this.dead = true;
    const r = new RNG(seed), R = ROBOT;
    // collapsed on its back against the power pack, limbs dropped to the ground, systems dark
    // (lying on the back, a negative X rotation swings a limb down toward the ground)
    this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 0.36 * AV_SCALE, -R.hip * AV_SCALE);
    this.hips.position.y = R.hip; this.hips.rotation.set(0, 0, 0); this.torso.rotation.set(r.range(-0.35, -0.15), r.range(-0.15, 0.15), 0);
    this.armL.g.rotation.set(r.range(-0.6, -0.15), 0, -r.range(0.4, 1.2)); this.armL.elbow.rotation.x = r.range(0.1, 1.2);
    this.armR.g.rotation.set(r.range(-0.6, -0.15), 0, r.range(0.4, 1.2)); this.armR.elbow.rotation.x = r.range(0.1, 1.2);
    this.legL.g.rotation.set(r.range(-0.36, -0.22), 0, -r.range(0.05, 0.25)); this.legL.knee.rotation.x = -r.range(0, 0.4); this.legL.ankle.rotation.x = 0.4;
    this.legR.g.rotation.set(r.range(-0.36, -0.22), 0, r.range(0.05, 0.25)); this.legR.knee.rotation.x = -r.range(0, 0.4); this.legR.ankle.rotation.x = 0.4;
    this.head.rotation.set(r.range(-0.2, 0.3), r.range(-1, 1), r.range(-0.3, 0.3));
    this.tag.visible = false;
    this.setHeld(null); this.setLamp(false);
  }
  // gone limp (see Ragdoll): from the pose it's in now, thrown at vel (m/s) and turning at spin (rad/s, round its hips)
  goLimp(env, vel, spin) {
    this.dead = true; this.tag.visible = false; this.setHeld(null); this.setLamp(false);
    this.rag = new Ragdoll(this, env, vel, spin);
  }
  dispose() { this.root.parent && this.root.parent.remove(this.root); }
}

// A body gone limp. Its joints are points tied together at their real lengths (verlet): the trunk (hips, chest,
// shoulders) held rigid, the head nearly so, the limbs flopping, elbows and knees bending only the way they do and
// nothing folding through the body. It falls, tumbles and rolls to rest on whatever is under it, and the robot is drawn
// hanging off the points. env, the world it fell in: g (the pull down, or gAt(p) where it differs), floor(x, z, y),
// ceil(x, z, y), push(p, r) (out of walls), fric (how much of its slide it keeps a step along the floor) and wind(p, a)
// (a rush of air: a pull on each point); in empty space none of them, and it just drifts and turns.
const RAG = { pel: 0, chest: 1, head: 2, shL: 3, shR: 4, elL: 5, elR: 6, haL: 7, haR: 8, hiL: 9, hiR: 10, knL: 11, knR: 12, ftL: 13, ftR: 14 };
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rc = new THREE.Vector3(), _rd = new THREE.Vector3(), _rm = new THREE.Matrix4(), _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _rDown = new THREE.Vector3(0, -1, 0);
class Ragdoll {
  constructor(av, env, vel, spin) {
    this.av = av; this.env = env; this.t = 0; this.still = 0; this.asleep = false; this.acc = 0; this.headQ = new THREE.Quaternion();
    av.root.updateMatrixWorld(true);
    const w = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z)), A = RAG;
    this.p = [w(av.hips), w(av.torso, 0, 0.6, 0), w(av.head, 0, 0.12, 0), w(av.armL.g), w(av.armR.g), w(av.armL.elbow), w(av.armR.elbow), w(av.armL.hand, 0, -0.06, 0), w(av.armR.hand, 0, -0.06, 0),
      w(av.legL.g), w(av.legR.g), w(av.legL.knee), w(av.legR.knee), w(av.legL.ankle), w(av.legR.ankle)];
    this.r = [0.16, 0.17, 0.15, 0.1, 0.1, 0.06, 0.06, 0.06, 0.06, 0.09, 0.09, 0.07, 0.07, 0.07, 0.07];
    // (where each point was a moment ago: thrown, and turning round the hips)
    const h = 1 / 60, c = this.p[A.pel];
    this.o = this.p.map((q) => q.clone().sub(_ra.copy(vel || _rDown.clone().setY(0)).add(_rb.crossVectors(spin || _rc.set(0, 0, 0), _rd.subVectors(q, c))).multiplyScalar(h)));
    const L = (a, b) => this.p[a].distanceTo(this.p[b]);
    this.cs = [];
    const tie = (a, b, k = 1) => this.cs.push([a, b, L(a, b), k, 0]), apart = (a, b, d) => this.cs.push([a, b, d, 1, 1]);
    const T = [A.pel, A.chest, A.shL, A.shR, A.hiL, A.hiR];
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) tie(T[i], T[j]);
    tie(A.head, A.chest, 0.7); tie(A.head, A.shL, 0.7); tie(A.head, A.shR, 0.7);
    for (const [a, b, c2] of [[A.shL, A.elL, A.haL], [A.shR, A.elR, A.haR], [A.hiL, A.knL, A.ftL], [A.hiR, A.knR, A.ftR]]) {
      tie(a, b); tie(b, c2); apart(a, c2, 0.45 * (L(a, b) + L(b, c2)));
    }
    for (const [a, b, d] of [[A.haL, A.pel, 0.2], [A.haR, A.pel, 0.2], [A.haL, A.chest, 0.22], [A.haR, A.chest, 0.22], [A.haL, A.head, 0.22], [A.haR, A.head, 0.22], [A.haL, A.haR, 0.1],
      [A.knL, A.knR, 0.16], [A.ftL, A.ftR, 0.14], [A.knL, A.chest, 0.35], [A.knR, A.chest, 0.35], [A.ftL, A.chest, 0.45], [A.ftR, A.chest, 0.45], [A.elL, A.pel, 0.16], [A.elR, A.pel, 0.16]]) apart(a, b, d);
    // (drawn from here on in world terms: the root stays put, the body is placed on the hips)
    av.root.position.set(0, 0, 0); av.root.rotation.set(0, 0, 0); av.body.rotation.set(0, 0, 0);
    av.hips.position.set(0, 0, 0); av.hips.rotation.set(0, 0, 0); av.torso.position.y = 0.08; av.torso.rotation.set(0, 0, 0);
    av.root.updateMatrixWorld(true);
    this.pose();
  }
  step(dt) {
    if (this.asleep) return;
    this.acc = Math.min(this.acc + dt, 0.1);
    let n = 0;
    while (this.acc >= 1 / 60) { this.acc -= 1 / 60; this.sub(1 / 60); n++; }
    if (n) this.pose();
  }
  sub(h) {
    const P = this.p, O = this.o, E = this.env, A = RAG, fr = E.fric ?? 0.82;
    this.t += h;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], o = O[i], vx = (p.x - o.x) * 0.996, vy = (p.y - o.y) * 0.996, vz = (p.z - o.z) * 0.996, g = E.gAt ? E.gAt(p) : E.g || 0;
      o.copy(p); p.x += vx; p.y += vy - g * h * h; p.z += vz;
      if (E.wind) { E.wind(p, _ra); p.addScaledVector(_ra, h * h); }
    }
    for (let it = 0; it < 8; it++) {
      for (const c of this.cs) {
        const a = P[c[0]], b = P[c[1]], d = _ra.subVectors(b, a), l = d.length();
        if (l < 1e-6 || (c[4] && l >= c[2])) continue;
        d.multiplyScalar(((l - c[2]) / l) * 0.5 * c[3]); a.add(d); b.sub(d);
      }
      // (knees fold back, elbows forward: the joint is kept to its side of the line from the limb's root to its end)
      if (it === 4) {
        const up = _rb.subVectors(P[A.chest], P[A.pel]).normalize(), fw = _rc.crossVectors(up, _rd.subVectors(P[A.shR], P[A.shL])).normalize();
        for (const [a, j, e, s] of [[A.hiL, A.knL, A.ftL, 1], [A.hiR, A.knR, A.ftR, 1], [A.shL, A.elL, A.haL, -1], [A.shR, A.elR, A.haR, -1]]) {
          const ab = _ra.subVectors(P[e], P[a]), l2 = ab.lengthSq(); if (l2 < 1e-6) continue;
          const off = _rd.subVectors(P[j], P[a]).addScaledVector(ab, -_rd.dot(ab) / l2), f = off.dot(fw) * s;
          if (f < 0.03) P[j].addScaledVector(fw, (0.03 - f) * s * 0.6);
        }
      }
      if (E.floor) for (let i = 0; i < P.length; i++) {
        const p = P[i], r = this.r[i], f = E.floor(p.x, p.z, p.y);
        if (p.y - r < f) {
          p.y = f + r; const o = O[i];
          // (dragging on the ground: it skids and stops rather than sliding on for ever)
          o.y = p.y; o.x = p.x - (p.x - o.x) * fr; o.z = p.z - (p.z - o.z) * fr;
        }
        if (E.ceil) { const cy = E.ceil(p.x, p.z, p.y); if (p.y + r > cy) p.y = cy - r; }
      }
    }
    if (E.push) for (let i = 0; i < P.length; i++) E.push(P[i], this.r[i]);
    let m = 0; for (let i = 0; i < P.length; i++) m = Math.max(m, P[i].distanceToSquared(O[i]));
    this.still = m < 4e-6 ? this.still + h : 0;
    if (this.still > 0.6 || this.t > 14) this.asleep = !!E.floor;
  }
  // the robot hung off the points: the hips and trunk square to them, each limb pointed down its two points, the head
  // turned to them (headQ: how it faces in the world)
  pose() {
    const av = this.av, P = this.p, A = RAG;
    const up = _ra.subVectors(P[A.chest], P[A.pel]).normalize();
    const rt = _rb.subVectors(P[A.shR], P[A.shL]).add(_rc.subVectors(P[A.hiR], P[A.hiL])); rt.addScaledVector(up, -rt.dot(up)).normalize();
    const qT = _rq.setFromRotationMatrix(_rm.makeBasis(rt, up, _rc.crossVectors(rt, up)));
    av.body.quaternion.copy(qT); av.body.position.copy(P[A.pel]);
    const aim = (o, parentQ, a, b) => { const d = _rd.subVectors(P[b], P[a]).normalize().applyQuaternion(_rq2.copy(parentQ).invert()); o.quaternion.setFromUnitVectors(_rDown, d); };
    for (const [arm, s, e, hd] of [[av.armL, A.shL, A.elL, A.haL], [av.armR, A.shR, A.elR, A.haR]]) {
      aim(arm.g, qT, s, e); const q1 = new THREE.Quaternion().multiplyQuaternions(qT, arm.g.quaternion); aim(arm.elbow, q1, e, hd);
    }
    for (const [leg, s, e, ft] of [[av.legL, A.hiL, A.knL, A.ftL], [av.legR, A.hiR, A.knR, A.ftR]]) {
      aim(leg.g, qT, s, e); const q1 = new THREE.Quaternion().multiplyQuaternions(qT, leg.g.quaternion); aim(leg.knee, q1, e, ft); leg.ankle.rotation.set(0.25, 0, 0);
    }
    const hu = _rd.subVectors(P[A.head], P[A.chest]).normalize(), hr = _rc.copy(rt).addScaledVector(hu, -rt.dot(hu)).normalize();
    this.headQ.setFromRotationMatrix(_rm.makeBasis(hr, hu, _ra.crossVectors(hr, hu)));
    av.head.quaternion.copy(qT).invert().multiply(this.headQ);
  }
  // where its head is, and its middle
  at(k) { return this.p[k === 'head' ? RAG.head : RAG.pel]; }
}
