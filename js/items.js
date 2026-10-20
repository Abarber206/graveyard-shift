'use strict';
// Item definitions (tools from the store + scrap found in facilities) and their procedural meshes.
const ITEMS = {
  // ---- tools ----
  flashlight: { name: 'Flashlight', kind: 'tool', price: 20, weight: 1, battery: 150, light: { power: 1, range: 26, angle: 0.42 }, desc: 'Cheap handheld light. Your best friend down there.' },
  proflash: { name: 'Pro Flashlight', kind: 'tool', price: 38, weight: 1.4, battery: 320, light: { power: 1.9, range: 38, angle: 0.5 }, desc: 'Brighter, wider, lasts longer.' },
  shovel: { name: 'Shovel', kind: 'tool', price: 40, weight: 7, weapon: true, desc: 'Hit things. Some of them stay down.' },
  walkie: { name: 'Walkie-Talkie', kind: 'tool', price: 18, weight: 1, battery: 500, desc: 'Hold to talk to crewmates anywhere. Sometimes picks up... other things.' },
  stun: { name: 'Stun Grenade', kind: 'tool', price: 40, weight: 1, throwable: true, desc: 'Pull, throw. Freezes creatures for a few seconds. Do not watch the flash.' },
  tracker: { name: 'Motion Tracker', kind: 'tool', price: 60, weight: 2, battery: 240, desc: 'Pings anything moving within 25m. Hope it stays quiet.' },
  mappad: { name: 'Survey Pad', kind: 'tool', price: 55, weight: 1.2, battery: 360, screen: true, desc: 'A rugged tablet with the site survey on it: the floor you are on, from above, you in the middle. Hold it to read it, click to switch it on. With the Salvage Locator fitted it pins metal scrap close by.' },
  // ---- snacks & drinks (left click to have it) ----
  cola: { name: 'Kick Cola', kind: 'food', price: 10, weight: 0.4, desc: 'Warm, flat, mostly sugar. Your legs keep going a while longer.' },
  ration: { name: 'Ration Bar', kind: 'food', price: 8, weight: 0.3, desc: 'Company issue. Tastes like the box it came in. Patches you up a little.' },
  nightshift: { name: 'Night Shift', kind: 'food', price: 18, weight: 0.4, desc: 'Energy drink. No two cans do quite the same thing.' },
  mystery: { name: 'Unlabelled Can', kind: 'food', weight: 0.4, desc: '' },
  // ---- scrap ----
  bell: { name: 'Brass Bell', kind: 'scrap', value: [28, 64], weight: 3, noise: 'bell', noiseR: 26 },
  gear: { name: 'Rusted Gear', kind: 'scrap', value: [12, 34], weight: 5 },
  phone: { name: 'Rotary Phone', kind: 'scrap', value: [24, 50], weight: 3, noise: 'ring', noiseR: 18 },
  toy: { name: 'Tin Robot', kind: 'scrap', value: [18, 48], weight: 2, noise: 'toy', noiseR: 16 },
  goldbar: { name: 'Gold Bar', kind: 'scrap', value: [95, 190], weight: 16 },
  axle: { name: 'Large Axle', kind: 'scrap', value: [36, 72], weight: 15, twoHanded: true },
  painting: { name: 'Old Painting', kind: 'scrap', value: [55, 115], weight: 6, twoHanded: true },
  // (things that give light: right-click, or use with nothing in front of you, to light them; see ItemMeshes.glow)
  candelabra: { name: 'Candelabra', kind: 'scrap', value: [40, 85], weight: 4, lamp: { color: 0xffa040, power: 0.7, range: 8, fire: true } },
  doll: { name: 'Doll Head', kind: 'scrap', value: [10, 32], weight: 1 },
  lamp: { name: 'Fancy Lamp', kind: 'scrap', value: [50, 105], weight: 9, twoHanded: true, lamp: { color: 0xffd6a0, power: 1.15, range: 11, y: 0.75 } },
  engine: { name: 'Engine Block', kind: 'scrap', value: [60, 125], weight: 28, twoHanded: true },
  register: { name: 'Cash Register', kind: 'scrap', value: [80, 150], weight: 20, twoHanded: true, noise: 'sell', noiseR: 20 },
  watch: { name: 'Pocket Watch', kind: 'scrap', value: [30, 70], weight: 1 },
  flask: { name: 'Specimen Flask', kind: 'scrap', value: [16, 42], weight: 1 },
  horn: { name: 'Air Horn', kind: 'scrap', value: [20, 48], weight: 2, noise: 'horn', noiseR: 40 },
  mask: { name: 'Porcelain Mask', kind: 'scrap', value: [30, 66], weight: 2 },
  jar: { name: 'Specimen Jar', kind: 'scrap', value: [40, 90], weight: 6, twoHanded: true },
  bolt: { name: 'Big Bolt', kind: 'scrap', value: [18, 38], weight: 4 },
  // (more of what people left behind: office things, kitchen things, workshop things, and a few you'd rather not)
  typewriter: { name: 'Typewriter', kind: 'scrap', value: [34, 76], weight: 9 },
  radio: { name: 'Valve Radio', kind: 'scrap', value: [30, 68], weight: 6, noise: 'radio_tune', noiseR: 22 },
  kettle: { name: 'Copper Kettle', kind: 'scrap', value: [14, 36], weight: 2 },
  camera: { name: 'Box Camera', kind: 'scrap', value: [38, 88], weight: 2, noise: 'camflash', noiseR: 14 },
  trophy: { name: 'Silver Trophy', kind: 'scrap', value: [42, 96], weight: 3 },
  globe: { name: 'Desk Globe', kind: 'scrap', value: [32, 74], weight: 4 },
  skull: { name: 'Ram Skull', kind: 'scrap', value: [22, 58], weight: 1.5 },
  extinguisher: { name: 'Fire Extinguisher', kind: 'scrap', value: [12, 30], weight: 7, noise: 'spray', noiseR: 18 },
  toolbox: { name: 'Toolbox', kind: 'scrap', value: [24, 54], weight: 8 },
  meter: { name: 'Test Meter', kind: 'scrap', value: [26, 60], weight: 3 },
  vase: { name: 'Painted Vase', kind: 'scrap', value: [48, 120], weight: 4 },
  teddy: { name: 'Teddy Bear', kind: 'scrap', value: [8, 28], weight: 0.6, noise: 'growler', noiseR: 12 },
  battery: { name: 'Car Battery', kind: 'scrap', value: [16, 40], weight: 12 },
  circuit: { name: 'Circuit Board', kind: 'scrap', value: [16, 44], weight: 0.5 },
  bottle: { name: 'Old Wine Bottle', kind: 'scrap', value: [12, 34], weight: 1.4 },
  lantern: { name: 'Storm Lantern', kind: 'scrap', value: [18, 44], weight: 2, battery: 420, lamp: { color: 0xffb468, power: 0.9, range: 9, y: 0.1, unsteady: true } },
  core: { name: 'Reactor Core', kind: 'scrap', value: [190, 270], weight: 26, twoHanded: true, core: true },
  // gift boxes: worth a little as they are; open one (left click) and it might be cash, something better, a tool,
  // a snack... or, once in a while, something nobody should ever have wrapped
  gift: { name: 'Gift Box', kind: 'scrap', value: [24, 50], weight: 1.5, gift: true },
  cash: { name: 'Wad of Cash', kind: 'scrap', value: [90, 210], weight: 0.3 },
  bomb: { name: 'Lit Charge', kind: 'tool', weight: 1.2, throwable: true, bomb: true, desc: 'Sputtering. Get rid of it.' },
};
// what each thing is made of, for the sound it makes landing (see SFX drop): metal rings, tin clinks, glass and
// porcelain chime, wood and bone knock, plastic tocks, soft things just thump
const ITEM_MAT = {
  gear: 'metal', axle: 'metal', engine: 'metal', bolt: 'metal', goldbar: 'metal', core: 'metal', toolbox: 'metal', extinguisher: 'metal', typewriter: 'metal', register: 'metal', shovel: 'metal',
  bell: 'tin', candelabra: 'tin', watch: 'tin', horn: 'tin', kettle: 'tin', trophy: 'tin', lantern: 'tin', toy: 'tin', flashlight: 'tin', proflash: 'tin', stun: 'tin', cola: 'tin', nightshift: 'tin', mystery: 'tin', camera: 'tin', lamp: 'tin',
  flask: 'glass', jar: 'glass', bottle: 'glass', vase: 'porcelain', mask: 'porcelain', doll: 'porcelain',
  painting: 'wood', radio: 'wood', globe: 'wood', skull: 'bone',
  phone: 'plastic', walkie: 'plastic', tracker: 'plastic', mappad: 'plastic', battery: 'plastic', meter: 'plastic', circuit: 'plastic',
  teddy: 'soft', gift: 'soft', cash: 'soft', ration: 'soft', bomb: 'soft',
};
// flashlight beam intensity per unit of light power (yours and your crewmates')
const FLASH_K = 75;
// what the Company actually pays out per listed value (store prices are unaffected)
const SCRAP_SCALE = 0.55;
const SHOP_TOOLS = ['flashlight', 'proflash', 'shovel', 'walkie', 'stun', 'tracker', 'mappad', 'cola', 'ration', 'nightshift'];
// What eating or drinking does. Timed perks run on your own body (stamina, legs, eyes); healing goes through the host.
//   drain: stamina use x, regen: stamina recovery x, speed: x, light: exposure x, sway: queasy camera sway
const PERKS = {
  wind: { name: 'SECOND WIND', dur: 75, drain: 0.45 },
  rush: { name: 'SUGAR RUSH', dur: 35, speed: 1.15, drain: 0.7 },
  eyes: { name: 'NIGHT EYES', dur: 90, light: 1.55 },
  steady: { name: 'STEADY NERVES', dur: 70, regen: 1.9, drain: 0.8 },
  mend: { name: 'PATCHED UP', heal: 35 },
  crash: { name: 'SUGAR CRASH', dur: 30, drain: 1.5, regen: 0.5, bad: true },
  queasy: { name: 'QUEASY', dur: 25, speed: 0.9, sway: 1, bad: true },
};
// each snack always refills stamina, then gives its perk (or one picked at random by weight)
const FOOD = {
  cola: { perks: { wind: 1 }, sound: 'can_open' },
  ration: { perks: { mend: 1 }, sound: 'wrapper' },
  nightshift: { perks: { wind: 1, rush: 1, eyes: 1, steady: 1 }, sound: 'can_open' },
  mystery: { perks: { wind: 1, rush: 1, eyes: 0.8, mend: 0.8, steady: 0.6, crash: 1, queasy: 0.9 }, sound: 'can_open' },
};
// where snacks turn up inside, on top of the scrap (break-room lockers, desks, the front office), and which ones
const FOOD_SPOTS = { lockers: 3, office: 2, entrance: 2, storage: 1, corridor: 0.6, morgue: 0.4, lab: 0.4 };
const FOOD_FIND = { mystery: 1.4, cola: 1, ration: 0.8, nightshift: 0.45 };
const SCRAP_TYPES = Object.keys(ITEMS).filter((k) => ITEMS[k].kind === 'scrap' && !ITEMS[k].core);
const UPGRADES = {
  harness: { name: 'Exo-Harness', price: 200, desc: 'Carried weight slows you half as much.' },
  implant: { name: 'Stamina Implant', price: 160, desc: '+60% sprint stamina, faster recovery.' },
  cells: { name: 'Extended Cells', price: 120, desc: 'All batteries last 60% longer.' },
  belt: { name: 'Utility Belt', price: 325, desc: 'A fifth inventory slot.' },
  flood: { name: 'Ship Floodlight', price: 80, desc: 'A powerful lamp on the ship roof. Find your way home.' },
  locator: { name: 'Salvage Locator', price: 110, desc: "A metal detector wired into the ship's radar. A RADAR sweep picks up metal scrap as well as anything moving, and Survey Pads pin metal scrap close by. It cannot find glass, china, wood, cloth or bone." },
  rover: { name: 'Scout Rover', price: 320, desc: 'A remote-control rover with a camera and a cargo basket. Drive it from the console by the airlock. It can be carried, with both hands, slowly.' },
};

const ItemMeshes = (() => {
  const mc = {};
  // (w: how it's worn, as MATS.wear; finer than on the ship's fittings, for something held up to your face)
  const M = (k, o, w) => mc[k] || (mc[k] = w ? MATS.wear(new THREE.MeshStandardMaterial(o), Object.assign({ s: 3 }, w)) : new THREE.MeshStandardMaterial(o));
  const PAINT = { kind: 'paint', k: [0.45, 0.4, 0.0008, 0.25], bare: 0x8a8e90 }, METAL = (bare) => ({ kind: 'metal', k: [0.4, 0.2, 0.0005], bare });
  const m = {
    gold: () => M('gold', { color: 0xd4a640, metalness: 1, roughness: 0.32 }, METAL(0xf0d890)),
    brass: () => M('brass', { color: 0xa88a45, metalness: 0.9, roughness: 0.4 }, METAL(0xd8c08a)),
    steel: () => M('steel', { color: 0x9aa0a4, metalness: 0.85, roughness: 0.35 }, METAL(0xd0d4d6)),
    dsteel: () => M('dsteel', { color: 0x4a4e52, metalness: 0.8, roughness: 0.45 }, METAL(0x9a9ea2)),
    black: () => M('black', { color: 0x161616, roughness: 0.6 }, Object.assign({}, PAINT, { k: [0.55, 0.25, 0.0006, 0.7], bare: 0x505356 })),
    yellow: () => M('yellow', { color: 0xd6a21c, roughness: 0.55 }, PAINT),
    red: () => M('red', { color: 0x9a1d16, roughness: 0.5 }, PAINT),
    blue: () => M('blue', { color: 0x2c4a7a, roughness: 0.5 }, PAINT),
    green: () => M('green', { color: 0x3b5a35, roughness: 0.6 }, PAINT),
    cream: () => M('cream', { color: 0xd9cfb6, roughness: 0.4 }, PAINT),
    porcelain: () => M('porc', { map: TEX.get('porcelain'), roughness: 0.25 }),
    wood: () => MATS.get('wood'),
    rust: () => MATS.get('rust'),
    lens: () => M('lens', { color: 0xfff4d0, emissive: 0xfff0c0, emissiveIntensity: 0.3, roughness: 0.1 }),
    glass: () => M('iglass', { color: 0xbfd8d0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }),
    goo: () => M('goo', { color: 0x6a7a2a, roughness: 0.2, emissive: 0x1a2005, transparent: true, opacity: 0.8 }),
    flesh: () => M('iflesh', { map: TEX.get('flesh'), roughness: 0.4 }),
    canvas: () => M('canvas', { map: TEX.get('painting'), roughness: 0.9 }),
    coreGlow: () => M('coreGlow', { color: 0x9fffe0, emissive: 0x40ffc0, emissiveIntensity: 2.2, roughness: 0.2 }),
    screen: () => M('scr', { color: 0x0a2a10, emissive: 0x20ff60, emissiveIntensity: 0.8 }),
    eyeRed: () => M('eyeRed', { color: 0x300000, emissive: 0xff2010, emissiveIntensity: 1.2 }),
    candle: () => M('candle', { color: 0xe8e0c8, roughness: 0.8 }),
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r1, r2, h, s = 12) => new THREE.CylinderGeometry(r1, r2, h, s);
  const sph = (r, s = 12) => new THREE.SphereGeometry(r, s, Math.max(6, s * 0.75));
  function add(g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; me.receiveShadow = true; g.add(me); return me;
  }
  // a box with softened edges (moulded plastic, pressed tin), w x h x d overall, centred
  function rbox(w, h, d, r = 0.006) {
    const s = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
    s.moveTo(-x, -y); s.lineTo(x, -y); s.lineTo(x, y); s.lineTo(-x, y); s.lineTo(-x, -y);
    const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 2, curveSegments: 4 });
    geo.translate(0, 0, -Math.max(0.001, d - 2 * r) / 2);
    return geo;
  }
  // a lathe from (radius, height) pairs
  const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  // a drawn texture, made once (key), drawn by draw(context, width, height)
  const tx = (key, w, h, draw) => mc['tx:' + key] || (mc['tx:' + key] = (() => { const [cv, x] = TEX.canvas(w, h); draw(x, w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })());
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // a green radar face: range rings, crosshairs, the sweep and a couple of blips
  function radarTex() {
    const [cv, x] = TEX.canvas(128, 128);
    x.fillStyle = '#031006'; x.fillRect(0, 0, 128, 128);
    const gr = x.createConicGradient ? x.createConicGradient(-0.6, 64, 64) : null;
    if (gr) { gr.addColorStop(0, 'rgba(60,255,120,.55)'); gr.addColorStop(0.18, 'rgba(60,255,120,0)'); gr.addColorStop(1, 'rgba(60,255,120,0)'); x.fillStyle = gr; x.beginPath(); x.arc(64, 64, 60, 0, TAU); x.fill(); }
    x.strokeStyle = 'rgba(90,255,140,.7)'; x.lineWidth = 2;
    for (const r of [20, 40, 60]) { x.beginPath(); x.arc(64, 64, r, 0, TAU); x.stroke(); }
    x.beginPath(); x.moveTo(4, 64); x.lineTo(124, 64); x.moveTo(64, 4); x.lineTo(64, 124); x.stroke();
    x.fillStyle = '#b8ffcc'; for (const [a, b] of [[88, 40], [42, 90]]) { x.beginPath(); x.arc(a, b, 4, 0, TAU); x.fill(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // a torch pointing down -Z: knurled grip, tail cap, flared head, polished reflector, lens
  function torch(g, r, rh, len, headMat, bodyMat) {
    const y = rh + 0.002, H = Math.PI / 2;
    add(g, cyl(r, r, len, 14), bodyMat, 0, y, 0.02, H);
    for (let i = 0; i < 7; i++) add(g, new THREE.TorusGeometry(r + 0.001, 0.0032, 4, 14), m.dsteel(), 0, y, -0.035 + i * (len * 0.6 / 7));
    add(g, cyl(r + 0.003, r + 0.003, 0.022, 14), m.dsteel(), 0, y, 0.02 + len / 2, H);
    add(g, box(0.012, 0.008, 0.02), m.red(), 0, y + r + 0.002, -0.03);
    const head = len * 0.32;
    add(g, cyl(r, rh, head, 18), headMat, 0, y, 0.02 - len / 2 - head / 2 + 0.005, H);
    add(g, cyl(rh + 0.003, rh + 0.003, 0.012, 18), m.dsteel(), 0, y, 0.02 - len / 2 - head + 0.006, H);
    add(g, new THREE.ConeGeometry(rh * 0.92, head * 0.7, 18, 1, true), M('refl', { color: 0xdedede, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }), 0, y, 0.02 - len / 2 - head * 0.5, H);
    const lens = add(g, cyl(rh * 0.9, rh * 0.9, 0.003, 18), m.lens(), 0, y, 0.02 - len / 2 - head - 0.001, H);
    lens.name = 'lens';
  }
  // a drinks can: a printed sleeve wrapped right round, pressed lid with a ring pull, a rolled bottom rim
  function can(g, key, r, h, label, opts, worn) {
    const mat = mc['can:' + key] || (() => {
      const t = TEX.sign(label, Object.assign({ w: 256, h: 128, border: false, dirty: !!worn }, opts)); t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1);
      // printed aluminium: mostly the paint you see (full metalness reads black with nothing around to reflect)
      return (mc['can:' + key] = new THREE.MeshStandardMaterial({ map: t, metalness: worn ? 0.2 : 0.3, roughness: worn ? 0.7 : 0.42 }));
    })();
    const body = add(g, cyl(r, r, h * 0.86, 22), mat, 0, h * 0.5, 0);
    if (worn) { body.rotation.z = 0.04; body.scale.set(1, 1, 0.9); }
    add(g, cyl(r * 0.84, r, h * 0.07, 22), m.steel(), 0, h * 0.965, 0);
    add(g, cyl(r, r * 0.84, h * 0.07, 22), m.steel(), 0, h * 0.035, 0);
    add(g, new THREE.TorusGeometry(r * 0.3, 0.0025, 4, 12), m.steel(), r * 0.15, h + 0.002, 0, Math.PI / 2);
    add(g, box(r * 0.5, 0.002, r * 0.28), m.dsteel(), -r * 0.25, h + 0.001, 0);
  }
  const B = {
    cola(g) { can(g, 'cola', 0.033, 0.122, 'KICK  COLA', { size: 34, bold: true, bg: '#a3201a', fg: '#f4e8d2' }); },
    nightshift(g) { can(g, 'night', 0.028, 0.16, 'NIGHT SHIFT', { size: 30, bold: true, bg: '#101410', fg: '#b6ff3a' }); },
    mystery(g) { can(g, 'mystery', 0.033, 0.122, '', { bg: '#6d6a62' }, true); },
    ration(g) {
      const mat = mc.ration || (mc.ration = new THREE.MeshStandardMaterial({ map: TEX.sign('RATION\nMERCY SALVAGE', { w: 256, h: 96, size: 26, bold: true, bg: '#6b6436', fg: '#1d1b10' }), roughness: 0.8 }));
      add(g, box(0.13, 0.024, 0.05), mat, 0, 0.012, 0);
      for (const x of [-0.068, 0.068]) add(g, box(0.012, 0.016, 0.048), M('crimp', { color: 0x5d5630, roughness: 0.9 }), x, 0.012, 0);
    },
    flashlight(g) { torch(g, 0.021, 0.036, 0.17, m.yellow(), m.black()); },
    proflash(g) { torch(g, 0.025, 0.046, 0.22, m.dsteel(), m.blue()); },
    shovel(g) {
      add(g, cyl(0.02, 0.02, 1.0), m.wood(), 0, 0.03, 0.15, Math.PI / 2);
      add(g, box(0.16, 0.025, 0.04), m.black(), 0, 0.03, 0.66);
      add(g, box(0.22, 0.02, 0.28), m.dsteel(), 0, 0.02, -0.48);
      add(g, cyl(0.03, 0.02, 0.1), m.dsteel(), 0, 0.03, -0.33, Math.PI / 2);
    },
    // a rugged handset: moulded body, speaker slots, a little lit screen, a keypad, side talk button, channel knob,
    // a rubber antenna, a belt clip on the back
    walkie(g) {
      const body = M('walkieBody', { color: 0x2b2e2a, roughness: 0.7 }), rub = M('rubber', { color: 0x151515, roughness: 0.9 }), key = M('wkey', { color: 0x5a5d58, roughness: 0.6 });
      add(g, rbox(0.066, 0.15, 0.036, 0.008), body, 0, 0.075, 0);
      for (let i = 0; i < 6; i++) add(g, box(0.042, 0.0025, 0.002), rub, 0, 0.117 + i * 0.0055, -0.0182);
      add(g, box(0.046, 0.021, 0.003), m.screen(), 0, 0.084, -0.0182);
      for (let i = 0; i < 9; i++) add(g, box(0.011, 0.007, 0.004), key, -0.015 + (i % 3) * 0.015, 0.06 - Math.floor(i / 3) * 0.011, -0.0185);
      add(g, box(0.006, 0.03, 0.014), rub, -0.035, 0.1, 0);
      add(g, cyl(0.007, 0.007, 0.014, 10), rub, 0.018, 0.157, 0.004);
      add(g, cyl(0.0042, 0.0085, 0.085, 8), rub, -0.017, 0.192, 0.004); add(g, sph(0.006, 6), rub, -0.017, 0.236, 0.004);
      add(g, box(0.03, 0.06, 0.006), rub, 0, 0.09, 0.021);
      add(g, box(0.005, 0.004, 0.003), m.eyeRed(), 0.022, 0.141, -0.0182);
    },
    stun(g) { add(g, cyl(0.035, 0.035, 0.12), m.green(), 0, 0.06, 0); add(g, cyl(0.02, 0.02, 0.03), m.dsteel(), 0, 0.135, 0); add(g, new THREE.TorusGeometry(0.02, 0.004, 6, 12), m.steel(), 0.03, 0.14, 0, 0, 0, Math.PI / 2); },
    // a handheld motion tracker: an olive shell with a round radar face in a rubber bezel, two buttons, a stub
    // antenna, and a rubber grip toward you
    tracker(g) {
      const shell = M('trkShell', { color: 0x3c4236, roughness: 0.6, metalness: 0.2 }), rub = M('rubber', { color: 0x151515, roughness: 0.9 });
      const face = mc.radar || (mc.radar = new THREE.MeshStandardMaterial({ color: 0x041206, emissive: 0xffffff, emissiveMap: radarTex(), emissiveIntensity: 0.9, roughness: 0.25 }));
      add(g, rbox(0.15, 0.04, 0.12, 0.012), shell, 0, 0.026, -0.01);
      add(g, cyl(0.047, 0.051, 0.01, 28), rub, 0, 0.05, -0.016);
      add(g, cyl(0.041, 0.041, 0.002, 28), face, 0, 0.0555, -0.016);
      add(g, box(0.012, 0.006, 0.012), m.red(), 0.056, 0.048, 0.028); add(g, box(0.012, 0.006, 0.012), m.yellow(), 0.056, 0.048, 0.008);
      add(g, cyl(0.005, 0.009, 0.05, 8), rub, -0.058, 0.05, -0.064, -0.6, 0, 0);
      add(g, rbox(0.045, 0.034, 0.1, 0.014), rub, 0, 0.02, 0.095);
      for (let i = 0; i < 4; i++) add(g, box(0.047, 0.003, 0.006), shell, 0, 0.037, 0.06 + i * 0.022);
    },
    // a survey pad: a rugged grey slab with rubber bumpers on its corners, a glass screen (dark until it's switched on in
    // your hands: see Player.setVM), a row of hard buttons under it and a hand strap across the back
    mappad(g) {
      const shell = M('padShell', { color: 0x4a4c48, roughness: 0.55, metalness: 0.25 }), rub = M('rubber', { color: 0x151515, roughness: 0.9 });
      const glass = M('padGlass', { color: 0x050807, roughness: 0.08, metalness: 0.4 });
      add(g, rbox(0.21, 0.018, 0.158, 0.006), shell, 0, 0.011, 0);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, rbox(0.03, 0.024, 0.03, 0.008), rub, x * 0.096, 0.012, z * 0.07);
      const scr = add(g, new THREE.PlaneGeometry(0.168, 0.118), glass, 0, 0.0205, -0.008, -Math.PI / 2); scr.name = 'screen';
      for (let i = 0; i < 3; i++) add(g, box(0.018, 0.004, 0.008), i === 1 ? m.red() : rub, -0.03 + i * 0.03, 0.021, 0.064);
      add(g, box(0.15, 0.006, 0.03), rub, 0, -0.001, 0.0);
    },
    // a brass hand bell: flared skirt with a thick lip, a turned wooden handle, the clapper hanging inside
    bell(g) {
      const brass2 = M('brass2', { color: 0xb08d42, metalness: 0.9, roughness: 0.32, side: THREE.DoubleSide });
      add(g, lathe([[0.076, 0], [0.078, 0.006], [0.07, 0.016], [0.058, 0.04], [0.049, 0.066], [0.044, 0.088], [0.038, 0.1], [0.024, 0.109], [0.001, 0.112]], 28), brass2, 0, 0, 0);
      add(g, new THREE.TorusGeometry(0.075, 0.004, 6, 28), brass2, 0, 0.003, 0, Math.PI / 2);
      add(g, cyl(0.014, 0.019, 0.012, 14), m.brass(), 0, 0.116, 0);
      add(g, lathe([[0.001, 0.12], [0.012, 0.12], [0.015, 0.13], [0.01, 0.15], [0.011, 0.16], [0.017, 0.188], [0.018, 0.205], [0.012, 0.214], [0.001, 0.216]], 14), m.wood(), 0, 0, 0);
      add(g, cyl(0.002, 0.002, 0.07, 5), m.dsteel(), 0, 0.075, 0); add(g, sph(0.012, 8), m.dsteel(), 0, 0.038, 0);
    },
    gear(g) {
      add(g, cyl(0.15, 0.15, 0.05, 16), m.rust(), 0, 0.025, 0);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; add(g, box(0.06, 0.05, 0.05), m.rust(), Math.cos(a) * 0.17, 0.025, Math.sin(a) * 0.17, 0, -a, 0); }
      add(g, cyl(0.04, 0.04, 0.06, 8), m.dsteel(), 0, 0.03, 0);
    },
    // a black bakelite rotary phone: sloped body, a finger wheel with its ten holes over the number card, the
    // handset resting in its cradle, and the curly cord
    phone(g) {
      const bak = M('bakelite', { color: 0x0f0e0d, roughness: 0.22, metalness: 0.1 });
      const body = cyl(0.08, 0.112, 0.085, 4); body.rotateY(Math.PI / 4); body.scale(1, 1, 1.12);
      add(g, body, bak, 0, 0.0425, 0);
      add(g, box(0.17, 0.008, 0.19), M('felt', { color: 0x2a2320, roughness: 1 }), 0, 0.003, 0);
      const dial = new THREE.Group(); dial.position.set(0, 0.075, -0.045); dial.rotation.x = -0.5; g.add(dial);
      add(dial, cyl(0.048, 0.05, 0.008, 28), m.cream(), 0, 0, 0);
      add(dial, cyl(0.045, 0.045, 0.004, 28), M('dialRing', { color: 0xc8c8c0, metalness: 0.8, roughness: 0.3 }), 0, 0.006, 0);
      for (let i = 0; i < 10; i++) { const a = Math.PI * 0.62 + (i / 10) * Math.PI * 1.55; add(dial, cyl(0.0075, 0.0075, 0.006, 10), bak, Math.cos(a) * 0.032, 0.007, Math.sin(a) * 0.032); }
      add(dial, cyl(0.014, 0.014, 0.006, 16), m.red(), 0, 0.008, 0);
      add(dial, box(0.006, 0.008, 0.016), m.steel(), 0.04, 0.009, 0.02, 0, 0.6, 0);
      for (const x of [-0.06, 0.06]) add(g, box(0.02, 0.03, 0.03), bak, x, 0.092, 0.03);
      const hs = new THREE.Group(); hs.position.set(0, 0.118, 0.03); g.add(hs);
      add(hs, cyl(0.014, 0.014, 0.15, 10), bak, 0, 0, 0, 0, 0, Math.PI / 2);
      for (const s of [-1, 1]) { add(hs, cyl(0.03, 0.022, 0.03, 16), bak, s * 0.085, -0.012, 0); add(hs, cyl(0.02, 0.02, 0.022, 10), bak, s * 0.072, -0.004, 0, 0, 0, s * 0.6); }
      // the cord: a tight coil from the back of the body round to the handset
      const pts = [], A = new THREE.Vector3(0.07, 0.03, 0.07), B = new THREE.Vector3(0.1, 0.1, 0.03);
      for (let i = 0; i <= 120; i++) {
        const t = i / 120, c = new THREE.Vector3().lerpVectors(A, B, t); c.x += Math.sin(t * Math.PI) * 0.06; c.z += Math.sin(t * Math.PI) * 0.03;
        const a = t * 22 * TAU; c.y += Math.cos(a) * 0.006; c.z += Math.sin(a) * 0.006; pts.push(c);
      }
      add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.0022, 4), bak, 0, 0, 0).castShadow = false;
    },
    // a wind-up tin robot: pressed red tin with rivets, a domed silver head with red eyes and a grille mouth, a chest
    // panel with dials, claw hands, an antenna, and the key in its back
    toy(g) {
      const tin = M('tinRed', { color: 0x9c2418, roughness: 0.38, metalness: 0.55 }), sil = M('tinSil', { color: 0xb8bcc0, roughness: 0.3, metalness: 0.85 });
      for (const s of [-1, 1]) { add(g, rbox(0.034, 0.07, 0.04, 0.005), sil, s * 0.025, 0.055, 0); add(g, rbox(0.044, 0.02, 0.062, 0.005), tin, s * 0.025, 0.01, -0.008); }
      add(g, rbox(0.1, 0.11, 0.07, 0.012), tin, 0, 0.145, 0);
      add(g, box(0.062, 0.05, 0.003), sil, 0, 0.15, -0.036);
      add(g, cyl(0.008, 0.008, 0.004, 12), m.yellow(), -0.015, 0.158, -0.038, Math.PI / 2); add(g, cyl(0.008, 0.008, 0.004, 12), m.red(), 0.015, 0.158, -0.038, Math.PI / 2);
      for (let i = 0; i < 3; i++) add(g, box(0.04, 0.003, 0.002), m.black(), 0, 0.133 + i * 0.006, -0.0385);
      for (const [x, y] of [[-0.042, 0.19], [0.042, 0.19], [-0.042, 0.1], [0.042, 0.1]]) add(g, sph(0.004, 6), sil, x, y, -0.035);
      add(g, cyl(0.028, 0.032, 0.012, 16), sil, 0, 0.205, 0);
      add(g, cyl(0.035, 0.035, 0.045, 18), sil, 0, 0.232, 0);
      add(g, new THREE.SphereGeometry(0.035, 18, 8, 0, TAU, 0, Math.PI / 2), sil, 0, 0.2545, 0);
      for (const s of [-1, 1]) add(g, cyl(0.009, 0.009, 0.006, 12), m.eyeRed(), s * 0.014, 0.24, -0.034, Math.PI / 2);
      add(g, box(0.03, 0.009, 0.004), m.black(), 0, 0.222, -0.035);
      add(g, cyl(0.002, 0.002, 0.045, 5), sil, 0, 0.31, 0); add(g, sph(0.007, 8), m.eyeRed(), 0, 0.335, 0);
      for (const s of [-1, 1]) {
        const arm = new THREE.Group(); arm.position.set(s * 0.06, 0.185, 0); arm.rotation.set(-0.35, 0, s * 0.18); g.add(arm);
        add(arm, sph(0.013, 10), sil, 0, 0, 0); add(arm, cyl(0.011, 0.011, 0.075, 10), sil, 0, -0.04, 0);
        for (const k of [-1, 1]) add(arm, box(0.006, 0.022, 0.012), tin, k * 0.007, -0.086, 0, 0, 0, k * 0.3);
      }
      add(g, cyl(0.003, 0.003, 0.02, 6), sil, 0, 0.15, 0.044, Math.PI / 2);
      for (const s of [-1, 1]) { const w = add(g, sph(0.013, 10), m.brass(), s * 0.013, 0.15, 0.056); w.scale.set(1, 0.7, 0.25); }
    },
    goldbar(g) { const geo = cyl(0.07, 0.1, 0.06, 4); geo.rotateY(Math.PI / 4); geo.scale(1.6, 1, 0.8); add(g, geo, m.gold(), 0, 0.03, 0); },
    axle(g) { add(g, cyl(0.04, 0.04, 1.1), m.dsteel(), 0, 0.12, 0, 0, 0, Math.PI / 2); add(g, cyl(0.12, 0.12, 0.05, 16), m.rust(), -0.5, 0.12, 0, 0, 0, Math.PI / 2); add(g, cyl(0.12, 0.12, 0.05, 16), m.rust(), 0.5, 0.12, 0, 0, 0, Math.PI / 2); },
    // an old oil painting in a gilt frame: which one depends on the piece (most of them you'd rather not hang)
    painting(g, seed) {
      const v = (seed | 0) % PAINTINGS, w = 0.55, h = 0.7;
      const mat = mc['paint' + v] || (mc['paint' + v] = new THREE.MeshStandardMaterial({ map: paintTex(v), roughness: 0.8 }));
      const gilt = M('gilt', { color: 0x8f7134, metalness: 0.85, roughness: 0.45 }), lip = M('giltDark', { color: 0x3a2c14, metalness: 0.5, roughness: 0.6 });
      add(g, box(w, h, 0.02), mat, 0, h / 2 + 0.02, 0);
      add(g, box(w + 0.08, 0.05, 0.05), gilt, 0, h + 0.04, 0); add(g, box(w + 0.08, 0.05, 0.05), gilt, 0, 0.02, 0);
      add(g, box(0.05, h, 0.05), gilt, -w / 2 - 0.02, h / 2 + 0.02, 0); add(g, box(0.05, h, 0.05), gilt, w / 2 + 0.02, h / 2 + 0.02, 0);
      for (const s of [-1, 1]) { add(g, box(w, 0.012, 0.012), lip, 0, s > 0 ? h + 0.012 : 0.028, 0.016); add(g, box(0.012, h - 0.01, 0.012), lip, s * (w / 2 - 0.004), h / 2 + 0.02, 0.016); }
      for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) add(g, sph(0.03, 8), gilt, x * (w / 2 + 0.02), h / 2 + 0.02 + y * (h / 2 + 0.02), 0.012).scale.set(1, 1, 0.5);
    },
    candelabra(g) {
      add(g, cyl(0.07, 0.09, 0.03, 12), m.brass(), 0, 0.015, 0); add(g, cyl(0.012, 0.015, 0.3, 8), m.brass(), 0, 0.17, 0);
      add(g, box(0.28, 0.015, 0.015), m.brass(), 0, 0.28, 0);
      // (its candles, and their flames when they're lit: a bright core in a softer outer flame, the wick showing)
      const fl = new THREE.MeshStandardMaterial({ color: 0x3a2008, emissive: 0xffa040, emissiveIntensity: 0, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false });
      const core = new THREE.MeshStandardMaterial({ color: 0x3a2a10, emissive: 0xfff0c0, emissiveIntensity: 0, roughness: 1 }), glow = [];
      for (const x of [-0.13, 0, 0.13]) {
        add(g, cyl(0.02, 0.015, 0.03, 8), m.brass(), x, 0.3, 0); add(g, cyl(0.012, 0.012, 0.09, 8), m.candle(), x, 0.36, 0);
        add(g, cyl(0.0012, 0.0012, 0.012, 4), m.black(), x, 0.41, 0);
        const f = add(g, new THREE.SphereGeometry(0.009, 8, 6), fl, x, 0.424, 0); f.scale.set(1, 2.3, 1); f.castShadow = false;
        const c = add(g, new THREE.SphereGeometry(0.004, 6, 5), core, x, 0.418, 0); c.scale.set(1, 1.8, 1); c.castShadow = false;
        glow.push({ m: fl, k: 2.2, mesh: f }, { m: core, k: 3, mesh: c });
      }
      g.userData.glow = glow;
    },
    // a porcelain doll's head: glass eye, rosebud mouth, blushed cheeks, ringlets of brown hair... and one eye
    // socket empty, a crack running down from it
    doll(g) {
      const por = m.porcelain(), hair = M('dollHair', { color: 0x4a2c18, roughness: 0.75 }), dark = M('void', { color: 0x050403, roughness: 1 });
      add(g, cyl(0.028, 0.034, 0.03, 14), por, 0, 0.015, 0);
      const head = add(g, sph(0.08, 22), por, 0, 0.1, 0); head.scale.set(0.96, 1.08, 1);
      add(g, sph(0.016, 12), M('sclera', { color: 0xf2efe6, roughness: 0.15 }), -0.029, 0.112, -0.064);
      add(g, sph(0.0105, 10), M('iris', { color: 0x2c4a6a, roughness: 0.1, metalness: 0.2 }), -0.03, 0.112, -0.076);
      add(g, sph(0.005, 6), dark, -0.03, 0.112, -0.0855);
      const sock = add(g, sph(0.016, 10), dark, 0.029, 0.112, -0.066); sock.scale.set(1, 1.1, 0.6);
      for (const s of [-1, 1]) add(g, box(0.026, 0.0035, 0.004), hair, s * 0.03, 0.135, -0.07, 0, 0, s * -0.18);
      for (const s of [-1, 1]) { const c = add(g, sph(0.016, 10), M('blush', { color: 0xd88a80, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false }), s * 0.046, 0.085, -0.06); c.scale.set(1, 0.7, 0.35); c.castShadow = false; }
      const lips = add(g, sph(0.009, 10), M('lips', { color: 0x9a1b1b, roughness: 0.3 }), 0, 0.066, -0.077); lips.scale.set(1.5, 0.7, 0.6);
      for (const [x, y, rz] of [[0.033, 0.098, 0.3], [0.036, 0.085, -0.2], [0.04, 0.072, 0.25]]) add(g, box(0.0018, 0.014, 0.003), dark, x, y, -0.071, 0, 0, rz);
      // ringlets over the crown and down the back
      const rr = new RNG(9);
      for (let i = 0; i < 22; i++) {
        const th = rr.range(0, 1.25), ph = rr.range(0, TAU); if (th > 0.6 && Math.sin(ph) < -0.2) continue;
        const r = 0.08, x = Math.sin(th) * Math.cos(ph) * r * 0.96, y = 0.1 + Math.cos(th) * r * 1.08, z = Math.sin(th) * Math.sin(ph) * r;
        add(g, sph(rr.range(0.02, 0.028), 8), hair, x * 1.05, y + 0.006, z * 1.05);
      }
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) add(g, sph(0.016 - k * 0.002, 8), hair, s * 0.07, 0.09 - k * 0.022, 0.03);
    },
    lamp(g) {
      add(g, cyl(0.12, 0.14, 0.05, 14), m.brass(), 0, 0.025, 0); add(g, cyl(0.015, 0.015, 0.7, 8), m.brass(), 0, 0.4, 0);
      // (its shade glows through, warm, when the bulb inside is lit)
      const shade = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffb060, emissiveIntensity: 0 });
      const bulb = new THREE.MeshStandardMaterial({ color: 0x4a4030, emissive: 0xfff0d0, emissiveIntensity: 0, roughness: 0.3 });
      add(g, cyl(0.12, 0.22, 0.24, 14, 1), shade, 0, 0.78, 0); add(g, sph(0.035, 10), bulb, 0, 0.74, 0);
      g.userData.glow = [{ m: shade, k: 0.45 }, { m: bulb, k: 3 }];
    },
    // a storm lantern: a tin base and a hood, a glass globe in a wire guard, the bulb inside (switch it on and it glows,
    // warm and a little unsteady), a wire bail to carry it by
    lantern(g) {
      const tin = M('lanternTin', { color: 0x4a5a3a, roughness: 0.5, metalness: 0.5 }, Object.assign({}, PAINT, { bare: 0x8a8e90 }));
      const glass = M('lanternGlass', { color: 0xd8e4dc, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false });
      add(g, cyl(0.07, 0.075, 0.05, 18), tin, 0, 0.025, 0);
      add(g, cyl(0.05, 0.05, 0.11, 18), glass, 0, 0.105, 0).castShadow = false;
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; add(g, cyl(0.0025, 0.0025, 0.11, 4), m.dsteel(), Math.cos(a) * 0.056, 0.105, Math.sin(a) * 0.056); }
      for (const y of [0.075, 0.135]) add(g, new THREE.TorusGeometry(0.056, 0.0025, 4, 18), m.dsteel(), 0, y, 0, Math.PI / 2);
      add(g, cyl(0.03, 0.07, 0.04, 18), tin, 0, 0.18, 0); add(g, cyl(0.012, 0.03, 0.03, 12), tin, 0, 0.215, 0);
      add(g, new THREE.TorusGeometry(0.07, 0.003, 4, 16, Math.PI), m.dsteel(), 0, 0.2, 0);
      const bulb = new THREE.MeshStandardMaterial({ color: 0x4a3a20, emissive: 0xffb060, emissiveIntensity: 0, roughness: 0.4 });
      add(g, sph(0.02, 10), bulb, 0, 0.1, 0).castShadow = false; add(g, cyl(0.006, 0.006, 0.03, 6), m.dsteel(), 0, 0.068, 0);
      g.userData.glow = [{ m: bulb, k: 3.2 }];
    },
    // an old four-cylinder: iron block on its oil pan, the head with a chipped red rocker cover, plugs and leads,
    // a rusted exhaust manifold down one side, pulleys and a belt on the front, the flywheel at the back
    engine(g) {
      const iron = M('iron', { color: 0x3b3e41, roughness: 0.75, metalness: 0.55 }), rust = m.rust(), blk = m.black();
      const red = M('rocker', { color: 0x7a2015, roughness: 0.5, metalness: 0.4 });
      add(g, box(0.5, 0.07, 0.26), m.dsteel(), 0, 0.035, 0); add(g, box(0.54, 0.012, 0.31), iron, 0, 0.074, 0);
      add(g, box(0.54, 0.24, 0.3), iron, 0, 0.2, 0);
      for (let i = 0; i < 4; i++) add(g, box(0.02, 0.2, 0.31), iron, -0.18 + i * 0.12, 0.2, 0);
      add(g, box(0.55, 0.08, 0.26), iron, 0, 0.36, 0);
      add(g, rbox(0.5, 0.05, 0.17, 0.016), red, 0, 0.423, -0.02);
      for (let i = 0; i < 4; i++) add(g, cyl(0.008, 0.008, 0.012, 6), m.steel(), -0.2 + i * 0.13, 0.451, -0.02);
      add(g, cyl(0.022, 0.022, 0.03, 10), blk, 0.12, 0.46, -0.02);
      for (let i = 0; i < 4; i++) {
        const x = -0.18 + i * 0.12;
        add(g, cyl(0.007, 0.007, 0.04, 6), m.cream(), x, 0.39, -0.14, Math.PI / 2 - 0.4);
        add(g, new THREE.TorusGeometry(0.06, 0.004, 4, 10, Math.PI * 0.7), blk, x, 0.43, -0.13, 0, Math.PI / 2, 0);
        add(g, cyl(0.022, 0.022, 0.09, 10), rust, x, 0.33, 0.175, Math.PI / 2 - 0.3);
      }
      add(g, cyl(0.032, 0.032, 0.5, 12), rust, 0, 0.29, 0.21, 0, 0, Math.PI / 2);
      add(g, cyl(0.03, 0.03, 0.15, 12), rust, 0.3, 0.26, 0.24, 0.4, 0, 0);
      add(g, box(0.035, 0.3, 0.22), iron, 0.285, 0.2, -0.01);
      add(g, cyl(0.075, 0.075, 0.035, 22), m.dsteel(), 0.32, 0.12, 0, 0, 0, Math.PI / 2);
      add(g, cyl(0.05, 0.05, 0.03, 18), m.dsteel(), 0.32, 0.31, 0.02, 0, 0, Math.PI / 2);
      add(g, cyl(0.048, 0.048, 0.09, 16), M('alt', { color: 0x8a8a84, metalness: 0.7, roughness: 0.4 }), 0.29, 0.33, -0.16, 0, 0, Math.PI / 2);
      add(g, box(0.012, 0.2, 0.018), blk, 0.335, 0.215, 0.01, 0.1);
      add(g, cyl(0.16, 0.16, 0.03, 28), m.dsteel(), -0.29, 0.19, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.16, 0.008, 4, 40), rust, -0.305, 0.19, 0, 0, Math.PI / 2, 0);
    },
    // an ornate brass cash register: a wooden plinth with its till drawer, the stepped bank of keys, the window
    // where the sale flags pop up, a crank at the side
    register(g) {
      const brass = M('regBrass', { color: 0xa98a44, metalness: 0.85, roughness: 0.38 }), dark = m.dsteel();
      add(g, box(0.44, 0.06, 0.38), m.wood(), 0, 0.03, 0);
      add(g, box(0.4, 0.075, 0.33), brass, 0, 0.098, 0.01);
      add(g, box(0.36, 0.06, 0.012), brass, 0, 0.098, -0.162); add(g, cyl(0.006, 0.006, 0.08, 8), dark, 0, 0.098, -0.172, 0, 0, Math.PI / 2);
      add(g, rbox(0.4, 0.12, 0.25, 0.02), brass, 0, 0.195, 0.05);
      for (let r = 0; r < 3; r++) {
        const plate = add(g, box(0.36, 0.012, 0.05), dark, 0, 0.17 + r * 0.032, -0.105 + r * 0.04); plate.rotation.x = -0.35;
        for (let k = 0; k < 7; k++) {
          const x = -0.15 + k * 0.05, y = 0.183 + r * 0.032, z = -0.105 + r * 0.04;
          add(g, cyl(0.004, 0.004, 0.022, 6), dark, x, y, z);
          add(g, cyl(0.013, 0.013, 0.006, 14), m.cream(), x, y + 0.012, z);
          add(g, new THREE.TorusGeometry(0.013, 0.002, 4, 14), dark, x, y + 0.012, z, Math.PI / 2);
        }
      }
      add(g, box(0.3, 0.1, 0.1), brass, 0, 0.305, 0.12);
      const win = mc.regWin || (mc.regWin = new THREE.MeshStandardMaterial({ map: TEX.sign('$  1 . 25', { w: 256, h: 64, size: 34, bold: true, bg: '#e8dfc4', fg: '#2a1a10' }), roughness: 0.5 }));
      add(g, box(0.2, 0.05, 0.004), win, 0, 0.31, 0.068);
      add(g, new THREE.TorusGeometry(0.11, 0.012, 6, 20, Math.PI), brass, 0, 0.355, 0.12);
      add(g, cyl(0.012, 0.012, 0.02, 10), dark, 0.215, 0.15, 0.06, 0, 0, Math.PI / 2);
      add(g, box(0.01, 0.12, 0.016), dark, 0.228, 0.1, 0.06, 0.5); add(g, cyl(0.012, 0.012, 0.04, 10), m.wood(), 0.24, 0.05, 0.03, 0, 0, Math.PI / 2);
    },
    watch(g) { add(g, cyl(0.04, 0.04, 0.015, 16), m.gold(), 0, 0.008, 0); add(g, cyl(0.034, 0.034, 0.002, 16), m.cream(), 0, 0.017, 0); add(g, new THREE.TorusGeometry(0.01, 0.003, 4, 8), m.gold(), 0, 0.008, -0.05, Math.PI / 2); },
    flask(g) {
      const pts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.06, 0), new THREE.Vector2(0.06, 0.08), new THREE.Vector2(0.02, 0.14), new THREE.Vector2(0.018, 0.2)];
      add(g, new THREE.LatheGeometry(pts, 12), m.glass(), 0, 0, 0); add(g, cyl(0.055, 0.055, 0.06, 12), m.goo(), 0, 0.035, 0);
      add(g, cyl(0.02, 0.02, 0.025, 8), m.black(), 0, 0.21, 0);
    },
    horn(g) { add(g, cyl(0.035, 0.035, 0.12, 12), m.red(), 0, 0.06, 0); add(g, cyl(0.06, 0.012, 0.12, 12, 1), m.steel(), 0, 0.14, -0.06, -Math.PI / 2.4); add(g, box(0.03, 0.02, 0.03), m.black(), 0, 0.13, 0.02); },
    // a porcelain mask lying face up: blank, serene, gold-rimmed empty eyes, painted lips, a black tear, its ribbon
    // ties trailing
    mask(g) {
      const por = M('maskmat', { map: TEX.get('porcelain'), roughness: 0.25, side: THREE.DoubleSide }), gold = m.gold(), dark = M('void', { color: 0x050403, roughness: 1 });
      const face = new THREE.Group(); face.rotation.x = Math.PI / 2; g.add(face);
      const shell = new THREE.SphereGeometry(0.1, 28, 20, Math.PI, Math.PI, 0.18, 2.75); shell.scale(1, 1.3, 0.6);
      add(face, shell, por, 0, 0, 0);
      const zs = (x, y) => -0.6 * Math.sqrt(Math.max(0, 0.01 - x * x - (y / 1.3) ** 2));
      for (const s of [-1, 1]) {
        const x = s * 0.036, y = 0.03, z = zs(x, y) - 0.0015;
        const eye = add(face, new THREE.CircleGeometry(0.017, 16), dark, x, y, z, 0, Math.PI + s * 0.35, 0); eye.scale.set(1.25, 0.75, 1); eye.castShadow = false;
        const rim = add(face, new THREE.TorusGeometry(0.017, 0.0022, 5, 18), gold, x, y, z - 0.001, 0, s * 0.35, 0); rim.scale.set(1.25, 0.75, 1);
      }
      const lip = add(face, sph(0.012, 10), M('lips', { color: 0x9a1b1b, roughness: 0.3 }), 0, -0.07, zs(0, -0.07) + 0.004); lip.scale.set(1.5, 0.5, 0.5);
      const tear = add(face, box(0.0035, 0.03, 0.002), dark, 0.034, -0.002, zs(0.034, -0.002) - 0.001, 0, 0.3, 0.05); tear.castShadow = false;
      for (const s of [-1, 1]) { const t = add(g, box(0.1, 0.002, 0.012), M('ribbon2', { color: 0x4a0d12, roughness: 0.7 }), s * 0.14, 0.002, 0.02, 0, s * 0.3, 0); t.castShadow = false; }
    },
    jar(g) {
      add(g, cyl(0.14, 0.14, 0.42, 16), m.glass(), 0, 0.21, 0); add(g, cyl(0.135, 0.135, 0.34, 16), m.goo(), 0, 0.18, 0);
      const s = add(g, sph(0.07, 10), m.flesh(), 0, 0.2, 0); s.scale.set(1, 1.4, 0.9);
      add(g, cyl(0.15, 0.15, 0.04, 16), m.dsteel(), 0, 0.44, 0);
    },
    bolt(g) { add(g, cyl(0.035, 0.035, 0.36, 10), m.dsteel(), 0, 0.04, 0, 0, 0, Math.PI / 2); add(g, cyl(0.07, 0.07, 0.06, 6), m.dsteel(), -0.2, 0.065, 0, 0, 0, Math.PI / 2); },
    // a faded red parcel: patterned paper gone dull and grubby, a gold ribbon both ways round and a bow on top
    gift(g) {
      const paper = mc.gift || (mc.gift = (() => {
        const [cv, x] = TEX.canvas(128, 128), r = new RNG(31);
        x.fillStyle = '#6e1a19'; x.fillRect(0, 0, 128, 128);
        x.fillStyle = 'rgba(226,192,110,.32)';
        for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if ((i + j) % 2 === 0) { x.save(); x.translate(i * 12.8 + 6, j * 12.8 + 6); x.rotate(Math.PI / 4); x.fillRect(-2.6, -2.6, 5.2, 5.2); x.restore(); }
        for (let k = 0; k < 34; k++) { x.fillStyle = `rgba(36,18,10,${r.range(0.03, 0.14)})`; x.fillRect(r.next() * 128, r.next() * 128, r.range(8, 36), r.range(3, 12)); }
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({ map: t, roughness: 0.78 });
      })());
      const rib = M('ribbon', { color: 0xc49a34, roughness: 0.38, metalness: 0.45 });
      const s = 0.22, h = 0.16;
      const body = add(g, box(s, h, s), paper, 0, h / 2, 0); body.rotation.z = 0.015;
      add(g, box(s + 0.014, 0.04, s + 0.014), paper, 0, h - 0.012, 0);
      add(g, box(0.034, h + 0.012, s + 0.018), rib, 0, (h + 0.012) / 2, 0);
      add(g, box(s + 0.018, h + 0.012, 0.034), rib, 0, (h + 0.012) / 2, 0);
      for (const sd of [-1, 1]) {
        const loop = add(g, new THREE.TorusGeometry(0.036, 0.011, 6, 14), rib, sd * 0.034, h + 0.04, 0, 0, sd * 0.35, sd * 0.55); loop.scale.set(1, 0.75, 1);
        add(g, box(0.022, 0.004, 0.07), rib, sd * 0.02, h + 0.014, sd * 0.05, 0, sd * 0.5, 0);
      }
      add(g, sph(0.017, 8), rib, 0, h + 0.022, 0);
    },
    // a banded stack of old notes
    cash(g) {
      const note = mc.cash || (mc.cash = new THREE.MeshStandardMaterial({ map: TEX.sign('100', { w: 128, h: 64, size: 30, bold: true, bg: '#6c7a5c', fg: '#2a3222' }), roughness: 0.85 }));
      for (let i = 0; i < 4; i++) add(g, box(0.156, 0.011, 0.068), note, (i % 2 - 0.5) * 0.006, 0.006 + i * 0.011, (i % 3 - 1) * 0.004, 0, (i - 1.5) * 0.04, 0);
      add(g, box(0.032, 0.05, 0.072), M('band', { color: 0xd6cdae, roughness: 0.8 }), 0, 0.024, 0);
    },
    // three sticks taped together, a short fuse spitting sparks
    bomb(g) {
      const stick = M('dyn', { color: 0x8a1e15, roughness: 0.6 }), tape = M('tape', { color: 0x34332f, roughness: 0.9 });
      for (const [y, z] of [[0.028, -0.029], [0.028, 0.029], [0.076, 0]]) add(g, cyl(0.028, 0.028, 0.2, 12), stick, 0, y, z, 0, 0, Math.PI / 2);
      for (const x of [-0.055, 0.055]) add(g, cyl(0.064, 0.064, 0.03, 12), tape, x, 0.045, 0, 0, 0, Math.PI / 2);
      const fz = add(g, cyl(0.004, 0.004, 0.09, 5), M('fusecord', { color: 0x2a2018, roughness: 0.9 }), 0.13, 0.1, 0, 0, 0, Math.PI / 2 - 0.7);
      fz.castShadow = false;
      const sp = add(g, sph(0.014, 6), M('spark', { color: 0xffd080, emissive: 0xffa040, emissiveIntensity: 5 }), 0.16, 0.13, 0); sp.name = 'spark';
    },
    // a heavy black office typewriter: four banks of round keys in chrome rims stepping up to the platen, the space
    // bar, the carriage with its knobs and return lever, and a page still in it, typed to the bottom (the same line,
    // all the way down)
    typewriter(g) {
      const body = M('twBody', { color: 0x1a1b19, roughness: 0.32, metalness: 0.25 }, Object.assign({}, PAINT, { k: [0.5, 0.3, 0.0006, 0.6], bare: 0x5a5c5e })), key = m.cream(), chrome = m.steel(), rub = M('rubber', { color: 0x151515, roughness: 0.9 });
      const page = M('twPage', { map: tx('page', 128, 160, (x, w, h) => {
        x.fillStyle = '#e6dfca'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(30,26,22,.85)'; x.font = '7px monospace';
        ['NIGHT SHIFT LOG', 'DAY 41', ''].concat(new Array(14).fill('IT KNOWS THE DOOR CODES')).forEach((l, i) => x.fillText(l, 9, 14 + i * 8.5));
        const r = new RNG(5); for (let i = 0; i < 24; i++) { x.fillStyle = `rgba(120,90,40,${r.range(0.04, 0.12)})`; x.fillRect(r.next() * w, r.next() * h, r.range(6, 20), r.range(4, 12)); }
      }), roughness: 0.95, side: THREE.DoubleSide });
      add(g, rbox(0.32, 0.05, 0.28, 0.012), body, 0, 0.025, 0);
      add(g, rbox(0.3, 0.07, 0.15, 0.014), body, 0, 0.085, 0.055);
      for (let r = 0; r < 4; r++) for (let c = 0; c < (r === 0 ? 9 : 11); c++) {
        const x = -0.125 + c * 0.025 + (r % 2) * 0.008 + (r === 0 ? 0.025 : 0), z = -0.12 + r * 0.024, y = 0.058 + r * 0.011;
        add(g, cyl(0.0013, 0.0013, 0.022, 4), chrome, x, y - 0.012, z);
        add(g, cyl(0.0082, 0.0082, 0.004, 10), key, x, y, z);
        add(g, new THREE.TorusGeometry(0.0084, 0.0013, 4, 10), chrome, x, y, z, Math.PI / 2);
      }
      add(g, rbox(0.17, 0.008, 0.016, 0.003), key, 0, 0.05, -0.142);
      add(g, cyl(0.022, 0.022, 0.31, 16), rub, 0, 0.135, 0.105, 0, 0, Math.PI / 2);
      for (const s of [-1, 1]) add(g, cyl(0.017, 0.017, 0.024, 14), body, s * 0.168, 0.135, 0.105, 0, 0, Math.PI / 2);
      add(g, box(0.27, 0.008, 0.018), chrome, 0, 0.152, 0.08);
      add(g, new THREE.PlaneGeometry(0.19, 0.22), page, 0, 0.235, 0.12, 0.2, Math.PI, 0).castShadow = false;
      add(g, box(0.006, 0.006, 0.08), chrome, -0.2, 0.16, 0.07, 0, 0.6, 0.3);
    },
    // a valve radio in a walnut case with an arched top: cloth over the speaker behind wooden fretwork, a round tuning
    // dial in a brass ring, two bakelite knobs (switch it on and it hunts through the static)
    radio(g) {
      const wood = M('walnut', { color: 0x5a3820, roughness: 0.42 }, { kind: 'paint', k: [0.5, 0.3, 0.0008, 0.3], bare: 0x8a6040, s: 3 }), cloth = M('grille', { color: 0x7a6440, roughness: 1 }, { kind: 'vinyl', k: [0.6, 0, 0.0008, 0.3], s: 4 }), bak = M('bakelite', { color: 0x0f0e0d, roughness: 0.22, metalness: 0.1 });
      add(g, box(0.34, 0.2, 0.17), wood, 0, 0.112, 0);
      { const arch = new THREE.CylinderGeometry(0.17, 0.17, 0.17, 28, 1, false, Math.PI / 2, Math.PI); arch.rotateX(Math.PI / 2); add(g, arch, wood, 0, 0.212, 0); }
      add(g, box(0.25, 0.17, 0.004), cloth, 0, 0.225, -0.086);
      for (let i = 0; i < 6; i++) add(g, box(0.012, 0.18, 0.008), wood, -0.1 + i * 0.04, 0.228, -0.09);
      add(g, box(0.27, 0.012, 0.01), wood, 0, 0.145, -0.088);
      add(g, cyl(0.036, 0.036, 0.006, 24), m.cream(), 0, 0.08, -0.087, Math.PI / 2);
      add(g, box(0.002, 0.03, 0.002), m.red(), 0.008, 0.085, -0.091, 0, 0, -0.5);
      add(g, new THREE.TorusGeometry(0.037, 0.004, 5, 24), m.brass(), 0, 0.08, -0.089);
      for (const s of [-1, 1]) { add(g, cyl(0.02, 0.022, 0.02, 14), bak, s * 0.11, 0.075, -0.093, Math.PI / 2); add(g, box(0.003, 0.016, 0.004), m.cream(), s * 0.11, 0.082, -0.104); }
      for (const [x, z] of [[-0.14, -0.06], [0.14, -0.06], [-0.14, 0.06], [0.14, 0.06]]) add(g, box(0.03, 0.012, 0.03), bak, x, 0.006, z);
    },
    // a copper kettle gone brown with handling: a squat belly, a lid with a black knob, the spout, a carry handle over
    // the top with a wooden grip
    kettle(g) {
      const cu = M('copper', { color: 0xa8643a, metalness: 0.85, roughness: 0.38 }, METAL(0xf0b080));
      add(g, lathe([[0.001, 0], [0.08, 0], [0.092, 0.012], [0.098, 0.05], [0.092, 0.09], [0.075, 0.115], [0.05, 0.13], [0.046, 0.136], [0.001, 0.138]], 24), cu, 0, 0, 0);
      add(g, lathe([[0.001, 0.138], [0.045, 0.138], [0.04, 0.148], [0.012, 0.152], [0.001, 0.153]], 18), cu, 0, 0, 0);
      add(g, sph(0.013, 10), m.black(), 0, 0.16, 0);
      add(g, cyl(0.009, 0.02, 0.13, 10), cu, 0.105, 0.085, 0, 0, 0, -0.75);
      add(g, new THREE.TorusGeometry(0.075, 0.007, 6, 16, Math.PI), m.dsteel(), 0, 0.12, 0);
      add(g, cyl(0.013, 0.013, 0.07, 10), m.wood(), 0, 0.195, 0, 0, 0, Math.PI / 2);
    },
    // a box camera in cracked black leatherette with chrome trim: the lens out front, a viewfinder, the shutter button,
    // and a flash gun clipped to its side with the bulb in a polished dish (fire it and it pops)
    camera(g) {
      const lea = M('leather', { color: 0x1a1816, roughness: 0.62 }, { kind: 'vinyl', k: [0.6, 0.1, 0.0008, 0.5], bare: 0x3a3632, s: 4 }), chrome = m.steel(), glass = M('camLens', { color: 0x0c1014, metalness: 0.7, roughness: 0.06 });
      add(g, rbox(0.16, 0.1, 0.09, 0.008), lea, 0, 0.056, 0);
      add(g, box(0.164, 0.016, 0.094), chrome, 0, 0.112, 0); add(g, box(0.164, 0.008, 0.094), chrome, 0, 0.004, 0);
      add(g, cyl(0.034, 0.036, 0.05, 22), chrome, 0, 0.058, -0.065, Math.PI / 2);
      add(g, cyl(0.03, 0.03, 0.02, 22), m.black(), 0, 0.058, -0.088, Math.PI / 2);
      add(g, cyl(0.024, 0.024, 0.003, 22), glass, 0, 0.058, -0.098, Math.PI / 2);
      add(g, box(0.042, 0.026, 0.05), chrome, -0.045, 0.132, -0.01); add(g, box(0.03, 0.016, 0.003), glass, -0.045, 0.132, -0.036);
      add(g, cyl(0.007, 0.007, 0.012, 10), chrome, 0.05, 0.126, 0.02);
      add(g, box(0.02, 0.06, 0.03), m.black(), 0.092, 0.084, 0);
      add(g, new THREE.CylinderGeometry(0.04, 0.012, 0.03, 18, 1, true), M('reflDish', { color: 0xdedede, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }), 0.1, 0.155, -0.01, -Math.PI / 2);
      add(g, sph(0.011, 10), m.lens(), 0.1, 0.155, -0.006);
      add(g, cyl(0.004, 0.004, 0.05, 6), chrome, 0.1, 0.12, 0);
    },
    // a silver loving cup on a wooden plinth: two looping handles, and a brass plate with the name rubbed off
    trophy(g) {
      const silver = M('silver', { color: 0xc4c8cc, metalness: 0.95, roughness: 0.22, side: THREE.DoubleSide }, METAL(0xf4f6f8));
      add(g, box(0.12, 0.05, 0.12), m.wood(), 0, 0.025, 0); add(g, box(0.13, 0.008, 0.13), m.wood(), 0, 0.054, 0);
      add(g, box(0.07, 0.022, 0.002), m.brass(), 0, 0.027, -0.061);
      add(g, lathe([[0.001, 0.058], [0.034, 0.058], [0.034, 0.064], [0.012, 0.08], [0.009, 0.12], [0.018, 0.13], [0.046, 0.15], [0.06, 0.19], [0.066, 0.24], [0.07, 0.25], [0.064, 0.25], [0.058, 0.2], [0.001, 0.15]], 28), silver, 0, 0, 0);
      for (const s of [-1, 1]) add(g, new THREE.TorusGeometry(0.032, 0.005, 6, 14, Math.PI * 1.2), silver, s * 0.066, 0.2, 0, 0, 0, s > 0 ? -Math.PI * 0.6 : Math.PI * 0.4);
    },
    // a desk globe, its oceans gone the colour of weak tea: on a brass half-meridian and a turned wooden stand
    globe(g) {
      const map = tx('globe', 256, 128, (x, w, h) => {
        x.fillStyle = '#5f7a6a'; x.fillRect(0, 0, w, h);
        const r = new RNG(77); x.fillStyle = '#b8a070';
        for (let i = 0; i < 9; i++) { let cx = r.range(0, w), cy = r.range(20, h - 20); for (let k = 0; k < 26; k++) { x.beginPath(); x.ellipse(cx, cy, r.range(4, 14), r.range(3, 10), r.range(0, 3), 0, TAU); x.fill(); cx += r.range(-9, 9); cy += r.range(-6, 6); } }
        x.strokeStyle = 'rgba(40,30,20,.35)'; x.lineWidth = 0.6;
        for (let i = 0; i <= 12; i++) { x.beginPath(); x.moveTo(i * w / 12, 0); x.lineTo(i * w / 12, h); x.stroke(); }
        for (let j = 1; j < 6; j++) { x.beginPath(); x.moveTo(0, j * h / 6); x.lineTo(w, j * h / 6); x.stroke(); }
        x.fillStyle = 'rgba(150,110,40,.25)'; x.fillRect(0, 0, w, h);
      });
      const gm = M('globeMat', { map, roughness: 0.4 }, { kind: 'paint', k: [0.4, 0, 0.0005, 0.3], s: 4 });
      add(g, cyl(0.07, 0.085, 0.022, 22), m.wood(), 0, 0.011, 0); add(g, cyl(0.009, 0.013, 0.07, 10), m.brass(), 0, 0.055, 0);
      const tilt = new THREE.Group(); tilt.position.set(0, 0.19, 0); tilt.rotation.z = 0.41; g.add(tilt);
      add(tilt, sph(0.1, 28), gm, 0, 0, 0);
      add(tilt, new THREE.TorusGeometry(0.108, 0.004, 6, 36, Math.PI * 1.1), m.brass(), 0, 0, 0, 0, Math.PI / 2, -Math.PI * 0.55);
      add(tilt, cyl(0.004, 0.004, 0.24, 6), m.brass(), 0, 0, 0);
    },
    // a ram's skull, picked clean and gone yellow: the long face, dark sockets, worn teeth, the horns curling back
    skull(g) {
      const bone = M('bone', { color: 0xd6c9aa, roughness: 0.72 }, { kind: 'paint', k: [0.65, 0, 0.0008, 0.3], s: 4 }), dark = M('void', { color: 0x050403, roughness: 1 });
      const horn = M('hornMat', { color: 0x5c4c38, roughness: 0.55 }, METAL(0x8a7a60));
      add(g, sph(0.055, 16), bone, 0, 0.065, 0.03).scale.set(1, 0.95, 1.1);
      add(g, cyl(0.02, 0.042, 0.13, 14), bone, 0, 0.045, -0.06, -Math.PI / 2 - 0.25, 0, 0).scale.set(1, 1, 0.75);
      for (const s of [-1, 1]) add(g, sph(0.017, 10), dark, s * 0.036, 0.075, -0.012).scale.set(1, 1.1, 0.7);
      add(g, box(0.014, 0.03, 0.01), dark, 0, 0.05, -0.112, 0.3);
      for (let i = 0; i < 5; i++) add(g, box(0.006, 0.008, 0.007), m.cream(), (i - 2) * 0.009, 0.022, -0.1 + Math.abs(i - 2) * 0.006);
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 28; i++) { const t = i / 28, a = 2.5 - t * Math.PI * 1.7, rr = 0.06 * (1 - 0.5 * t); pts.push(V3(s * (0.04 + 0.05 * t), 0.075 + Math.sin(a) * rr, 0.06 + Math.cos(a) * rr)); }
        add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.013, 8), horn, 0, 0, 0);
      }
    },
    // a red fire extinguisher, its label peeling: the domed bottle, the squeeze valve with its pin, a pressure gauge, the
    // black hose clipped down its side to the horn (squeeze it and it hisses)
    extinguisher(g) {
      const red = m.red(), blk = m.black();
      const lbl = M('extLabel', { map: tx('extLabel', 128, 64, (x, w, h) => {
        x.fillStyle = '#e4dcc4'; x.fillRect(0, 0, 54, h); x.fillStyle = '#9a1d16'; x.fillRect(54, 0, w - 54, h);
        x.fillStyle = '#9a1d16'; x.font = 'bold 9px monospace'; x.fillText('FIRE', 6, 16); x.fillText('EXTING-', 6, 28); x.fillText('UISHER', 6, 40);
        x.fillStyle = '#1a1814'; x.font = '6px monospace'; x.fillText('CO2  5KG', 6, 54);
        const r = new RNG(3); for (let i = 0; i < 18; i++) { x.fillStyle = `rgba(60,40,20,${r.range(0.05, 0.2)})`; x.fillRect(r.next() * 54, r.next() * h, r.range(4, 12), r.range(3, 8)); }
      }), roughness: 0.6 });
      add(g, cyl(0.06, 0.06, 0.34, 20), red, 0, 0.175, 0); add(g, sph(0.06, 18), red, 0, 0.345, 0).scale.set(1, 0.5, 1);
      add(g, new THREE.CylinderGeometry(0.0605, 0.0605, 0.12, 20, 1, true), lbl, 0, 0.17, 0);
      add(g, cyl(0.058, 0.06, 0.008, 20), blk, 0, 0.004, 0);
      add(g, cyl(0.016, 0.018, 0.04, 10), m.steel(), 0, 0.39, 0);
      add(g, box(0.1, 0.01, 0.022), blk, 0.02, 0.428, 0, 0, 0, 0.12); add(g, box(0.09, 0.01, 0.022), m.steel(), 0.02, 0.405, 0);
      add(g, cyl(0.012, 0.012, 0.008, 12), m.cream(), -0.026, 0.39, -0.01, Math.PI / 2); add(g, new THREE.TorusGeometry(0.012, 0.002, 4, 12), m.steel(), -0.026, 0.39, -0.014);
      add(g, new THREE.TorusGeometry(0.008, 0.0015, 4, 10), m.steel(), 0.045, 0.41, 0.0, Math.PI / 2);
      add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0.014, 0.385, 0), V3(0.05, 0.38, 0), V3(0.068, 0.32, 0.01), V3(0.07, 0.2, 0.01), V3(0.068, 0.11, 0)]), 20, 0.008, 6), blk, 0, 0, 0);
      add(g, cyl(0.012, 0.018, 0.05, 10), blk, 0.068, 0.085, 0);
    },
    // a red steel toolbox, dented and scuffed: the lid's seam and its two catches, a folding handle, a padlock loop
    toolbox(g) {
      const red = m.red(), st = m.steel(), blk = m.black();
      add(g, box(0.4, 0.15, 0.17), red, 0, 0.075, 0);
      add(g, box(0.404, 0.045, 0.174), red, 0, 0.168, 0); add(g, box(0.406, 0.004, 0.176), blk, 0, 0.146, 0);
      for (const s of [-1, 1]) { add(g, box(0.03, 0.034, 0.008), st, s * 0.12, 0.142, -0.089); add(g, cyl(0.004, 0.004, 0.012, 6), st, s * 0.12, 0.156, -0.094, Math.PI / 2); add(g, box(0.012, 0.03, 0.02), st, s * 0.07, 0.2, 0); }
      add(g, cyl(0.011, 0.011, 0.16, 10), blk, 0, 0.215, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.012, 0.003, 4, 10), st, 0, 0.142, -0.092);
    },
    // a bench test meter in a grey-green case: a big dial (VOLTS) behind its bezel, the range knob, red and black jacks,
    // a carrying handle over the top
    meter(g) {
      const cs = M('meterCase', { color: 0x4c5446, roughness: 0.55 }, PAINT);
      const face = M('meterFace', { map: tx('meterFace', 128, 72, (x, w, h) => {
        x.fillStyle = '#e4dcc4'; x.fillRect(0, 0, w, h); x.strokeStyle = '#1a1814'; x.lineWidth = 1.5;
        x.beginPath(); x.arc(64, 78, 58, Math.PI * 1.2, Math.PI * 1.8); x.stroke();
        for (let i = 0; i <= 10; i++) { const a = Math.PI * (1.2 + 0.06 * i), r0 = i % 5 ? 52 : 47; x.beginPath(); x.moveTo(64 + Math.cos(a) * r0, 78 + Math.sin(a) * r0); x.lineTo(64 + Math.cos(a) * 58, 78 + Math.sin(a) * 58); x.stroke(); }
        x.fillStyle = '#1a1814'; x.font = 'bold 10px monospace'; x.textAlign = 'center'; x.fillText('VOLTS', 64, 60);
        x.strokeStyle = '#a01a10'; x.beginPath(); x.moveTo(64, 78); x.lineTo(64 + Math.cos(Math.PI * 1.62) * 56, 78 + Math.sin(Math.PI * 1.62) * 56); x.stroke();
      }), roughness: 0.3 });
      add(g, rbox(0.2, 0.14, 0.12, 0.012), cs, 0, 0.07, 0);
      add(g, box(0.16, 0.085, 0.006), m.black(), 0, 0.095, -0.059);
      add(g, box(0.15, 0.075, 0.003), face, 0, 0.095, -0.0625);
      add(g, cyl(0.016, 0.018, 0.018, 14), m.black(), -0.05, 0.03, -0.065, Math.PI / 2); add(g, box(0.003, 0.012, 0.004), m.cream(), -0.05, 0.036, -0.075);
      add(g, cyl(0.006, 0.006, 0.012, 8), m.red(), 0.03, 0.03, -0.064, Math.PI / 2); add(g, cyl(0.006, 0.006, 0.012, 8), m.black(), 0.06, 0.03, -0.064, Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.07, 0.006, 5, 16, Math.PI), m.black(), 0, 0.14, 0);
    },
    // a tall painted vase, blue on white: bands of scrolls, a flowering branch round the belly, crazed all over
    vase(g) {
      const map = tx('vase', 256, 256, (x, w, h) => {
        x.fillStyle = '#e8e4d8'; x.fillRect(0, 0, w, h); const r = new RNG(55), blue = '#24407a';
        x.fillStyle = blue; for (const y of [18, 40, 214, 236]) x.fillRect(0, y, w, 4);
        x.strokeStyle = blue; x.lineWidth = 2;
        for (let i = 0; i < 16; i++) { x.beginPath(); x.arc(i * 16 + 8, 30, 6, 0, Math.PI); x.stroke(); x.beginPath(); x.arc(i * 16 + 8, 225, 6, Math.PI, TAU); x.stroke(); }
        x.lineWidth = 3; x.beginPath(); x.moveTo(0, 150); for (let i = 1; i <= 8; i++) x.quadraticCurveTo(i * 32 - 16, 150 + (i % 2 ? -30 : 30), i * 32, 150); x.stroke();
        for (let i = 0; i < 24; i++) {
          const cx = r.range(0, w), cy = r.range(90, 200);
          x.fillStyle = blue; for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; x.beginPath(); x.arc(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 3.5, 0, TAU); x.fill(); }
          x.fillStyle = '#e8e4d8'; x.beginPath(); x.arc(cx, cy, 2.5, 0, TAU); x.fill();
        }
        x.strokeStyle = 'rgba(80,70,50,.25)'; x.lineWidth = 0.6;
        for (let i = 0; i < 70; i++) { let px = r.range(0, w), py = r.range(0, h); x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += r.range(-12, 12); py += r.range(-12, 12); x.lineTo(px, py); } x.stroke(); }
      });
      const por = M('vaseMat', { map, roughness: 0.18, side: THREE.DoubleSide });
      add(g, lathe([[0.001, 0], [0.055, 0], [0.065, 0.02], [0.1, 0.1], [0.112, 0.17], [0.098, 0.24], [0.06, 0.3], [0.04, 0.33], [0.042, 0.36], [0.056, 0.38], [0.05, 0.384], [0.036, 0.37]], 28), por, 0, 0, 0);
    },
    // a moth-eaten teddy bear: one button eye (the other a loose thread), a torn ear leaking stuffing, a stitched belly,
    // the nose worn bald (squeeze it and the voice box groans)
    teddy(g) {
      const fur = M('fur', { color: 0x6c4a2c, roughness: 1 }, { kind: 'vinyl', k: [0.7, 0, 0.0015, 0.5], s: 5 }), muz = M('furPale', { color: 0x9c7a54, roughness: 1 }, { kind: 'vinyl', k: [0.6, 0, 0.001, 0.4], s: 5 });
      const blk = m.black(), stuff = M('stuffing', { color: 0xe6e0d0, roughness: 1 });
      add(g, sph(0.07, 16), fur, 0, 0.08, 0.01).scale.set(1, 1.12, 0.85);
      add(g, sph(0.055, 16), fur, 0, 0.19, -0.002);
      add(g, sph(0.026, 12), muz, 0, 0.178, -0.048).scale.set(1.1, 0.85, 0.9);
      add(g, sph(0.009, 8), blk, 0, 0.188, -0.072);
      add(g, cyl(0.008, 0.008, 0.004, 10), blk, -0.022, 0.205, -0.047, Math.PI / 2 - 0.3);
      add(g, box(0.0015, 0.016, 0.0015), m.cream(), 0.022, 0.196, -0.05, 0, 0, 0.3);
      add(g, sph(0.021, 10), fur, -0.042, 0.236, 0).scale.set(1, 1, 0.45);
      add(g, sph(0.018, 10), fur, 0.044, 0.232, 0).scale.set(1, 0.8, 0.45);
      add(g, sph(0.012, 8), stuff, 0.05, 0.245, -0.004);
      for (const s of [-1, 1]) {
        const a = add(g, sph(0.026, 10), fur, s * 0.07, 0.11, -0.005); a.scale.set(0.8, 1.5, 0.8); a.rotation.z = s * 0.5;
        add(g, sph(0.03, 10), fur, s * 0.042, 0.03, -0.045).scale.set(0.9, 0.75, 1.4);
        add(g, sph(0.018, 8), muz, s * 0.042, 0.03, -0.085).scale.set(1, 1, 0.3);
      }
      add(g, box(0.0025, 0.07, 0.002), M('stitch', { color: 0x2a1a10, roughness: 1 }), 0, 0.08, -0.05);
    },
    // a car battery: a black case with its cells' ribs along the top, a label, the lead posts (one red cap) and a
    // strap handle
    battery(g) {
      const cs = M('batCase', { color: 0x1a1a1a, roughness: 0.6 }, Object.assign({}, PAINT, { k: [0.6, 0.15, 0.0008, 0.7], bare: 0x3a3a3a })), lead = M('lead', { color: 0x7a7c7e, metalness: 0.6, roughness: 0.55 }, METAL(0xb8babc));
      const lbl = M('batLabel', { map: tx('batLabel', 128, 64, (x, w, h) => {
        x.fillStyle = '#c8a020'; x.fillRect(0, 0, w, h); x.fillStyle = '#141414'; x.fillRect(0, 44, w, 20);
        x.font = 'bold 17px monospace'; x.textAlign = 'center'; x.fillText('HEAVY DUTY', 64, 28);
        x.fillStyle = '#c8a020'; x.font = 'bold 13px monospace'; x.fillText('12V   880A', 64, 59);
        const r = new RNG(8); for (let i = 0; i < 20; i++) { x.fillStyle = `rgba(20,16,10,${r.range(0.08, 0.3)})`; x.fillRect(r.next() * w, r.next() * h, r.range(4, 14), r.range(3, 9)); }
      }), roughness: 0.7 });
      add(g, box(0.26, 0.18, 0.17), cs, 0, 0.09, 0);
      add(g, box(0.264, 0.014, 0.174), cs, 0, 0.187, 0);
      for (let i = 0; i < 5; i++) add(g, box(0.004, 0.006, 0.15), cs, -0.1 + i * 0.05, 0.197, 0);
      add(g, box(0.16, 0.08, 0.002), lbl, 0, 0.09, -0.0855);
      for (const [x, c] of [[-0.09, m.black()], [0.09, m.red()]]) { add(g, cyl(0.012, 0.014, 0.024, 10), lead, x, 0.206, -0.05); add(g, cyl(0.017, 0.017, 0.012, 10), c, x, 0.2, -0.05); }
      add(g, new THREE.TorusGeometry(0.12, 0.006, 4, 16, Math.PI), m.black(), 0, 0.19, 0.03);
    },
    // a circuit board pulled out of something: green board, copper traces, black chips on their legs, a few
    // capacitors, a finned heat sink, gold fingers along one edge
    circuit(g) {
      const pcb = M('pcb', { map: tx('pcb', 128, 96, (x, w, h) => {
        x.fillStyle = '#1f5a30'; x.fillRect(0, 0, w, h); const r = new RNG(12);
        x.strokeStyle = 'rgba(190,170,90,.55)'; x.lineWidth = 1.2;
        for (let i = 0; i < 40; i++) {
          let px = r.range(4, w - 4), py = r.range(4, h - 4); x.beginPath(); x.moveTo(px, py);
          for (let k = 0; k < 3; k++) { if (r.chance(0.5)) px = clamp(px + r.range(-30, 30), 2, w - 2); else py = clamp(py + r.range(-20, 20), 2, h - 2); x.lineTo(px, py); }
          x.stroke(); x.fillStyle = 'rgba(210,190,110,.8)'; x.beginPath(); x.arc(px, py, 1.6, 0, TAU); x.fill();
        }
        x.fillStyle = 'rgba(230,230,220,.75)'; x.font = '7px monospace'; x.fillText('MS-7  REV C', 6, 10); x.fillText('U4', 60, 50);
      }), roughness: 0.45 }, { kind: 'paint', k: [0.4, 0.1, 0.0004, 0.3], bare: 0x9a8a50, s: 4 });
      add(g, box(0.2, 0.004, 0.14), pcb, 0, 0.004, 0);
      for (const [x, z, w, d] of [[-0.04, -0.02, 0.05, 0.03], [0.04, 0.03, 0.036, 0.036], [0.05, -0.035, 0.03, 0.018]]) {
        add(g, box(w, 0.006, d), m.black(), x, 0.009, z);
        for (let k = 0; k < Math.round(w / 0.006); k++) for (const s of [-1, 1]) add(g, box(0.002, 0.004, 0.004), m.steel(), x - w / 2 + 0.003 + k * 0.006, 0.007, z + s * (d / 2 + 0.002));
      }
      for (const [x, z, c] of [[-0.075, 0.035, 0x1a3a6a], [-0.06, 0.042, 0x1a1a1a], [0.0, 0.05, 0x1a3a6a]]) add(g, cyl(0.007, 0.007, 0.02, 10), M('cap' + c, { color: c, roughness: 0.4 }), x, 0.016, z);
      add(g, box(0.03, 0.004, 0.025), m.steel(), -0.075, 0.008, -0.04); for (let i = 0; i < 5; i++) add(g, box(0.002, 0.016, 0.025), m.steel(), -0.087 + i * 0.006, 0.018, -0.04);
      add(g, box(0.12, 0.0045, 0.01), m.gold(), 0, 0.004, 0.072);
    },
    // a dusty wine bottle, still corked: dark green glass, a faded label, the foil gone dull
    bottle(g) {
      const gl = M('bottleGlass', { color: 0x16301a, roughness: 0.08, metalness: 0.3 });
      const lbl = M('wineLabel', { map: tx('wineLabel', 128, 64, (x, w, h) => {
        x.fillStyle = '#d8ccaa'; x.fillRect(0, 0, w, h); x.strokeStyle = '#5a1a14'; x.lineWidth = 2; x.strokeRect(4, 4, 56, h - 8);
        x.fillStyle = '#3a1a10'; x.font = 'italic 11px serif'; x.textAlign = 'center'; x.fillText('Chateau', 32, 24); x.fillText('Mercy', 32, 38); x.font = '8px serif'; x.fillText('1891', 32, 52);
        const r = new RNG(19); for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(80,60,30,${r.range(0.1, 0.35)})`; x.fillRect(r.next() * w, r.next() * h, r.range(4, 12), r.range(3, 8)); }
      }), roughness: 0.9 });
      add(g, lathe([[0.001, 0.004], [0.034, 0], [0.037, 0.01], [0.037, 0.19], [0.03, 0.22], [0.015, 0.255], [0.014, 0.3], [0.016, 0.305], [0.001, 0.306]], 20), gl, 0, 0, 0);
      add(g, new THREE.CylinderGeometry(0.0375, 0.0375, 0.08, 20, 1, true), lbl, 0, 0.1, 0);
      add(g, cyl(0.0155, 0.0155, 0.03, 12), M('foil', { color: 0x5a1a18, metalness: 0.6, roughness: 0.5 }), 0, 0.293, 0);
    },
    core(g) {
      add(g, cyl(0.2, 0.2, 0.08, 16), m.dsteel(), 0, 0.04, 0); add(g, cyl(0.2, 0.2, 0.08, 16), m.dsteel(), 0, 0.72, 0);
      add(g, cyl(0.12, 0.12, 0.6, 16), m.coreGlow(), 0, 0.38, 0);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; add(g, box(0.04, 0.62, 0.04), m.dsteel(), Math.cos(a) * 0.17, 0.38, Math.sin(a) * 0.17); }
      add(g, box(0.1, 0.05, 0.12), m.yellow(), 0, 0.79, 0);
    },
  };
  return {
    // light a lamp's glow in a model of it (the piece itself, the one in your hand, the one in a crewmate's): k 0 for out
    glow(g, k) { g.traverse((o) => { const L = o.userData && o.userData.glow; if (L) for (const e of L) { e.m.emissiveIntensity = e.k * k; if (e.mesh) e.mesh.visible = k > 0.01; } }); },
    // (seed: the item's id, for things that differ piece to piece, like which painting it is)
    build(type, seed = 0) {
      const g = new THREE.Group();
      (B[type] || B.gear)(g, seed);
      g.userData.type = type;
      return g;
    },
  };
})();
// what a piece looks like can depend on the piece: only paintings, so far
const itemLook = (type, id) => (type === 'painting' ? type + ':' + ((id | 0) % PAINTINGS) : type);

// The paintings left on the walls. Six you'd rather not have looked at, three that are almost a relief.
const PAINTINGS = 9;
function paintTex(v) {
  const W = 256, H = 326, [cv, x] = TEX.canvas(W, H), r = new RNG(101 + v * 17);
  const lin = (x0, y0, x1, y1, stops) => { const gr = x.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  const rad = (cx, cy, r1, stops) => { const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  const ell = (cx, cy, rx, ry, fill, rot = 0) => { x.fillStyle = fill; x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, TAU); x.fill(); };
  const poly = (pts, fill) => { x.fillStyle = fill; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) x.lineTo(p[0], p[1]); x.closePath(); x.fill(); };
  // a sitter: dark ground, shoulders in a dark dress, a pale oval face lit from the left
  const sitter = (cx, cy, s, bg, dress, skin) => {
    if (bg) { x.fillStyle = rad(cx - 30, cy - 20, 260, bg); x.fillRect(0, 0, W, H); }
    poly([[cx - 95 * s, H], [cx - 70 * s, cy + 80 * s], [cx - 20 * s, cy + 58 * s], [cx + 20 * s, cy + 58 * s], [cx + 70 * s, cy + 80 * s], [cx + 95 * s, H]], dress);
    x.fillStyle = skin; x.fillRect(cx - 13 * s, cy + 30 * s, 26 * s, 34 * s);
    ell(cx, cy, 36 * s, 47 * s, rad(cx - 12 * s, cy - 12 * s, 60 * s, [[0, skin], [1, 'rgba(60,40,30,1)']]));
  };
  const strokes = (n, cols, x0, y0, w, h, len) => { for (let i = 0; i < n; i++) { x.strokeStyle = r.pick(cols); x.lineWidth = r.range(1, 3); x.beginPath(); const px = x0 + r.next() * w, py = y0 + r.next() * h; x.moveTo(px, py); x.lineTo(px + r.range(-len, len), py + r.range(-len, len) * 0.4); x.stroke(); } };
  switch (v) {
    case 0: { // the sitter: a patient Victorian lady with no eyes at all, and a smile that goes on too long
      sitter(128, 130, 1, [[0, '#3c3a26'], [1, '#0d0c08']], '#14110e', '#d4c6aa');
      ell(128, 92, 40, 26, '#1c140e'); ell(128, 74, 18, 14, '#1c140e');
      for (let i = 0; i < 12; i++) ell(100 + i * 5, 196 + Math.sin(i) * 2, 5, 3, 'rgba(225,215,190,.7)');
      ell(114, 128, 9, 7, '#020101'); ell(142, 128, 9, 7, '#020101'); ell(114, 128, 1.3, 1.3, '#f4f0e0'); ell(142, 128, 1.3, 1.3, '#f4f0e0');
      x.strokeStyle = '#3a1210'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(98, 150); x.quadraticCurveTo(128, 172, 158, 150); x.stroke();
      x.strokeStyle = 'rgba(30,10,8,.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(96, 148); x.lineTo(92, 142); x.moveTo(160, 148); x.lineTo(164, 142); x.stroke();
      break;
    }
    case 1: { // a lady in red whose face someone has gone at with a knife
      sitter(128, 132, 1, [[0, '#7a5a24'], [1, '#1e1408']], '#5a1010', '#d8bfa0');
      ell(128, 96, 42, 22, '#3a2410'); ell(96, 120, 12, 30, '#3a2410'); ell(160, 120, 12, 30, '#3a2410');
      for (let i = 0; i < 70; i++) { x.strokeStyle = r.chance(0.75) ? `rgba(235,228,210,${r.range(0.5, 0.95)})` : 'rgba(90,10,8,.8)'; x.lineWidth = r.range(0.8, 2.4); x.beginPath(); const px = 128 + r.range(-34, 34), py = 132 + r.range(-40, 40); x.moveTo(px, py); x.lineTo(px + r.range(-26, 26), py + r.range(-30, 30)); x.stroke(); }
      x.fillStyle = 'rgba(120,10,8,.55)'; for (let i = 0; i < 5; i++) x.fillRect(118 + i * 6, 170, 1.5, r.range(20, 60));
      break;
    }
    case 2: { // a long corridor, a door at the end, and someone very tall standing in it
      x.fillStyle = '#0b0a08'; x.fillRect(0, 0, W, H);
      const vx = 128, vy = 140, d = [100, 112, 156, 200];
      poly([[0, 0], [W, 0], [d[2], d[0]], [d[1], d[0]]], '#1a1712');
      poly([[0, H], [W, H], [d[2], d[3]], [d[1], d[3]]], lin(0, d[3], 0, H, [[0, '#1c140c'], [1, '#3a2a18']]));
      poly([[0, 0], [d[1], d[0]], [d[1], d[3]], [0, H]], lin(0, 0, d[1], 0, [[0, '#2e3a2a'], [1, '#0e120c']]));
      poly([[W, 0], [d[2], d[0]], [d[2], d[3]], [W, H]], lin(W, 0, d[2], 0, [[0, '#2a3626'], [1, '#0e120c']]));
      for (let i = 1; i < 7; i++) { const t = i / 7; x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(t * d[1], d[0] * t); x.lineTo(t * d[1], H - (H - d[3]) * t); x.stroke(); }
      x.fillStyle = rad(vx, vy, 40, [[0, '#6a5a3a'], [1, '#1c1810']]); x.fillRect(d[1], d[0], d[2] - d[1], d[3] - d[0]);
      ell(vx, 150, 6, 40, '#d8d6cc'); ell(vx, 104, 4.5, 6, '#e0ded4'); x.fillStyle = '#d8d6cc'; x.fillRect(vx - 9, 120, 2, 44); x.fillRect(vx + 7, 120, 2, 44);
      x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(vx - 1.5, 103, 1, 1.4); x.fillRect(vx + 0.5, 103, 1, 1.4);
      break;
    }
    case 3: { // a family portrait, and the thing standing behind them that nobody painted on purpose
      x.fillStyle = rad(128, 120, 230, [[0, '#4a4430'], [1, '#100e08']]); x.fillRect(0, 0, W, H);
      ell(128, 110, 70, 120, 'rgba(4,3,2,.92)');
      ell(104, 62, 5, 3.5, '#f6f2e6'); ell(152, 62, 5, 3.5, '#f6f2e6');
      x.strokeStyle = 'rgba(4,3,2,.9)'; x.lineWidth = 9; x.lineCap = 'round';
      x.beginPath(); x.moveTo(70, 120); x.quadraticCurveTo(40, 170, 58, 214); x.moveTo(186, 120); x.quadraticCurveTo(216, 170, 198, 214); x.stroke();
      sitter(74, 186, 0.62, null, '#1e1a2a', '#d2c0a4'); ell(74, 158, 22, 12, '#2a1a0e');
      sitter(182, 182, 0.66, null, '#141210', '#ccb89c'); ell(182, 152, 18, 9, '#3a2a18');
      sitter(128, 226, 0.48, null, '#3a2a40', '#dcc8ac'); ell(128, 206, 16, 9, '#c89a50');
      for (const [cx, cy, s] of [[74, 186, 0.62], [182, 182, 0.66], [128, 226, 0.48]]) { ell(cx - 11 * s, cy - 2 * s, 3 * s, 2 * s, '#1a1008'); ell(cx + 11 * s, cy - 2 * s, 3 * s, 2 * s, '#1a1008'); }
      x.lineCap = 'butt';
      break;
    }
    case 4: { // moonlit woods, and a pale shape standing among the trees, facing you
      x.fillStyle = lin(0, 0, 0, H, [[0, '#0e1626'], [0.6, '#1a2230'], [1, '#0a0c0e']]); x.fillRect(0, 0, W, H);
      ell(190, 60, 18, 18, rad(190, 60, 18, [[0, '#f4f0dc'], [1, '#c8c4b0']])); ell(190, 60, 60, 60, rad(190, 60, 60, [[0, 'rgba(200,200,180,.25)'], [1, 'rgba(0,0,0,0)']]));
      for (let i = 0; i < 26; i++) { const tx = r.range(-10, W + 10), tw = r.range(4, 18), dark = r.range(0.02, 0.1); x.fillStyle = `rgb(${dark * 255 | 0},${dark * 255 + 4 | 0},${dark * 255 + 8 | 0})`; x.fillRect(tx, r.range(-20, 60), tw, H); }
      ell(96, 196, 7, 30, '#cfd0c8'); ell(96, 160, 6, 8, '#d8d8d0');
      x.fillStyle = lin(0, 230, 0, H, [[0, 'rgba(160,170,180,0)'], [1, 'rgba(150,160,170,.5)']]); x.fillRect(0, 230, W, H - 230);
      break;
    }
    case 5: { // a calm sea at night, a lighthouse, and the size of what's under the water
      x.fillStyle = lin(0, 0, 0, 140, [[0, '#0a0e18'], [1, '#232a36']]); x.fillRect(0, 0, W, 140);
      x.fillStyle = lin(0, 140, 0, H, [[0, '#1a2430'], [1, '#05080c']]); x.fillRect(0, 140, W, H - 140);
      x.fillStyle = '#05070a'; x.fillRect(206, 96, 12, 44); poly([[204, 96], [220, 96], [212, 86]], '#05070a');
      x.fillStyle = lin(212, 92, 40, 70, [[0, 'rgba(255,240,180,.55)'], [1, 'rgba(255,240,180,0)']]); poly([[212, 90], [30, 50], [30, 110]], x.fillStyle);
      ell(128, 250, 120, 50, 'rgba(0,0,0,.6)'); ell(150, 238, 12, 7, 'rgba(210,200,150,.55)'); ell(150, 238, 3, 6, 'rgba(10,8,4,.8)');
      x.strokeStyle = 'rgba(160,180,200,.18)'; x.lineWidth = 1; for (let i = 0; i < 40; i++) { const y = r.range(145, H), px = r.range(0, W); x.beginPath(); x.moveTo(px, y); x.lineTo(px + r.range(8, 30), y); x.stroke(); }
      poly([[80, 150], [104, 150], [98, 156], [86, 156]], '#0a0806'); x.fillStyle = '#0a0806'; x.fillRect(91, 132, 1.5, 18);
      break;
    }
    case 6: { // pretty: hills at sunset, the sky going from gold to rose to violet, still water below
      x.fillStyle = lin(0, 0, 0, 200, [[0, '#4a3a6a'], [0.45, '#d06a5a'], [0.8, '#f0b060'], [1, '#f8d890']]); x.fillRect(0, 0, W, 200);
      ell(150, 176, 22, 22, '#fff0c0');
      for (const [y0, col] of [[160, '#7a4a6a'], [176, '#5a3452'], [190, '#3a2438']]) { x.fillStyle = col; x.beginPath(); x.moveTo(0, H); for (let i = 0; i <= 16; i++) x.lineTo(i * 16, y0 + Math.sin(i * 0.9 + y0) * 10 + r.range(-3, 3)); x.lineTo(W, H); x.fill(); }
      x.fillStyle = lin(0, 205, 0, H, [[0, '#e0a060'], [1, '#3a2438']]); x.fillRect(0, 205, W, H - 205);
      for (let i = 0; i < 20; i++) { x.fillStyle = `rgba(255,230,170,${r.range(0.2, 0.5)})`; x.fillRect(150 - r.range(5, 30), 210 + i * 5, r.range(10, 50), 1.5); }
      for (const tx of [40, 58, 210]) { x.fillStyle = '#20141e'; x.fillRect(tx, 150, 3, 50); ell(tx + 1.5, 146, 12, 18, '#20141e'); }
      break;
    }
    case 7: { // pretty: flowers in a blue vase on a dark table
      x.fillStyle = rad(128, 120, 220, [[0, '#3a3424'], [1, '#0e0c08']]); x.fillRect(0, 0, W, H);
      x.fillStyle = '#2a1a10'; x.fillRect(0, 250, W, H - 250); x.fillStyle = 'rgba(255,220,160,.12)'; x.fillRect(0, 250, W, 3);
      for (let i = 0; i < 14; i++) { x.strokeStyle = '#2e4a22'; x.lineWidth = 2; x.beginPath(); x.moveTo(128, 200); x.quadraticCurveTo(128 + r.range(-40, 40), 150, 128 + r.range(-70, 70), r.range(60, 150)); x.stroke(); }
      for (let i = 0; i < 16; i++) ell(128 + r.range(-80, 80), r.range(70, 180), r.range(5, 10), r.range(10, 18), '#3a5a2a', r.range(0, 3));
      for (let i = 0; i < 18; i++) {
        const cx = 128 + r.range(-75, 75), cy = r.range(55, 165), col = r.pick(['#d8302a', '#f0c040', '#f4f0e8', '#d86a9a', '#e8783a']), pr = r.range(7, 13);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; ell(cx + Math.cos(a) * pr * 0.6, cy + Math.sin(a) * pr * 0.6, pr * 0.55, pr * 0.35, col, a); }
        ell(cx, cy, pr * 0.3, pr * 0.3, '#5a3a10');
      }
      ell(128, 228, 34, 30, lin(94, 0, 162, 0, [[0, '#1a2a5a'], [0.4, '#4a6aaa'], [1, '#101a3a']])); x.fillStyle = '#2a3a6a'; x.fillRect(116, 190, 24, 14); ell(128, 190, 14, 4, '#3a4a7a');
      break;
    }
    default: { // pretty: snowy peaks over a still lake, their reflection in it, pines along the shore
      x.fillStyle = lin(0, 0, 0, 170, [[0, '#4a7ab0'], [1, '#c8dcea']]); x.fillRect(0, 0, W, 170);
      for (let i = 0; i < 5; i++) ell(r.range(20, 230), r.range(20, 70), r.range(20, 40), r.range(6, 10), 'rgba(255,255,255,.6)');
      const peaks = [[-20, 170], [50, 70], [100, 130], [150, 50], [220, 120], [280, 170]];
      const mount = (flip) => { const f = (y) => (flip ? 340 - y : y); poly(peaks.map(([a, b]) => [a, f(b)]).concat([[280, f(170)], [-20, f(170)]]), flip ? 'rgba(70,90,110,.7)' : '#4a5a6a'); if (!flip) for (const [a, b] of [[50, 70], [150, 50]]) poly([[a, b], [a - 16, b + 26], [a + 16, b + 26]], '#eef2f4'); };
      mount(false);
      x.fillStyle = lin(0, 170, 0, H, [[0, '#7a9ab8'], [1, '#2a3a4a']]); x.fillRect(0, 170, W, H - 170);
      mount(true);
      for (let i = 0; i < 14; i++) { const tx = i < 7 ? r.range(0, 60) : r.range(196, 256), th = r.range(30, 60); poly([[tx, 172 - th], [tx - 9, 174], [tx + 9, 174]], '#1a2a1e'); }
      x.strokeStyle = 'rgba(255,255,255,.15)'; for (let i = 0; i < 30; i++) { const y = r.range(180, H), px = r.range(0, W); x.beginPath(); x.moveTo(px, y); x.lineTo(px + r.range(10, 30), y); x.stroke(); }
    }
  }
  // brushwork, then age: varnish gone yellow, a dark falloff to the edges, fine cracks all over, dust
  strokes(260, ['rgba(255,255,255,.035)', 'rgba(0,0,0,.05)'], 0, 0, W, H, 10);
  x.fillStyle = 'rgba(130,95,30,.14)'; x.fillRect(0, 0, W, H);
  x.fillStyle = rad(W / 2, H / 2, W * 0.85, [[0.55, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.6)']]); x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(20,14,8,.32)'; x.lineWidth = 0.7;
  for (let i = 0; i < 90; i++) { let px = r.range(0, W), py = r.range(0, H); x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += r.range(-9, 9); py += r.range(-9, 9); x.lineTo(px, py); } x.stroke(); }
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${r.chance(0.5) ? '230,220,200' : '10,8,6'},${r.range(0.05, 0.2)})`; x.fillRect(r.range(0, W), r.range(0, H), 1, 1); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// How items sit in the first-person hand (position relative to camera, rotation) and on avatars.
const HOLD = {
  default: { p: [0.28, -0.3, -0.55], r: [0, 0, 0] },
  flashlight: { p: [0.26, -0.24, -0.42], r: [0.05, 0, 0] },
  proflash: { p: [0.26, -0.24, -0.42], r: [0.05, 0, 0] },
  shovel: { p: [0.36, -0.36, -0.6], r: [-0.2, 0.15, -0.2] },
  walkie: { p: [0.22, -0.28, -0.42], r: [0.2, 0, 0] },
  stun: { p: [0.24, -0.28, -0.45], r: [0, 0, 0] },
  tracker: { p: [0.0, -0.26, -0.42], r: [0.6, 0, 0] },
  mappad: { p: [0.0, -0.085, -0.33], r: [1.15, 0, 0] },
  painting: { p: [0, -1.2, -0.95], r: [0.15, 0, 0] },
  axle: { p: [0, -0.52, -0.78], r: [0, 0, 0] },
  lamp: { p: [0, -1.18, -0.85], r: [0, 0, 0] },
  engine: { p: [0, -0.82, -0.85], r: [0.15, 0, 0] },
  register: { p: [0, -0.74, -0.8], r: [0.15, 0, 0] },
  jar: { p: [0, -0.8, -0.8], r: [0, 0, 0] },
  core: { p: [0, -1.1, -0.85], r: [0, 0, 0] },
  goldbar: { p: [0.22, -0.3, -0.5], r: [0, 0.3, 0] },
  typewriter: { p: [0.16, -0.4, -0.6], r: [0.1, -0.2, 0] },
  radio: { p: [0.18, -0.42, -0.6], r: [0.05, -0.25, 0] },
  battery: { p: [0.2, -0.48, -0.6], r: [0, -0.2, 0] },
  toolbox: { p: [0.22, -0.5, -0.62], r: [0, -0.2, 0] },
  globe: { p: [0.2, -0.44, -0.6], r: [0, 0, 0] },
  vase: { p: [0.22, -0.46, -0.6], r: [0, 0, 0] },
  extinguisher: { p: [0.24, -0.5, -0.55], r: [0, 0, 0] },
  lantern: { p: [0.2, -0.33, -0.5], r: [0.15, 0, 0] },
  candelabra: { p: [0.22, -0.5, -0.6], r: [0, 0, 0] },
  // snacks are held in a fist closed round the lower part (grip: where the fist sits, from the item's origin; gr: how
  // the forearm comes in, from below and to the right so it never hides what's in the hand)
  cola: { p: [0.17, -0.2, -0.5], r: [0.12, 0.6, 0], grip: [0.01, 0.03, 0.008], gr: [1.0, 0.5, 0], fist: true },
  nightshift: { p: [0.17, -0.22, -0.5], r: [0.12, 0.6, 0], grip: [0.01, 0.034, 0.008], gr: [1.0, 0.5, 0], fist: true },
  mystery: { p: [0.17, -0.2, -0.5], r: [0.12, 0.6, 0], grip: [0.01, 0.03, 0.008], gr: [1.0, 0.5, 0], fist: true },
  ration: { p: [0.16, -0.18, -0.46], r: [0.6, 0.4, 0.1], grip: [0.05, 0.016, 0.0], gr: [0.9, 0.5, 0], fist: true },
};
const holdOf = (type) => HOLD[type] || HOLD.default;
