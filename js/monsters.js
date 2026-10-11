'use strict';
// Creatures: procedural models, host-side AI, client-side animation + sound.
const MON_DEFS = {
  crawler: { name: 'Crawler', hp: 4, zone: 'in', power: 2, radius: 0.6, height: 1.0 },
  pale: { name: 'The Pale', hp: 3, zone: 'in', power: 3, radius: 0.4, height: 2.3 },
  mannequin: { name: 'Mannequin', hp: 9999, zone: 'in', power: 2, radius: 0.35, height: 1.7 },
  leech: { name: 'Ceiling Leech', hp: 2, zone: 'in', power: 1, radius: 0.3, height: 0.3 },
  hound: { name: 'Hollow Hound', hp: 5, zone: 'out', power: 2, radius: 0.7, height: 1.2 },
  // (its body fills a corridor; what it steers by is a small core, so it can squeeze through any doorway)
  slime: { name: 'The Seep', hp: 9999, zone: 'in', power: 3, radius: 0.55, height: 2.8 },
  sister: { name: 'The Sisters', hp: 3, zone: 'in', power: 2, radius: 0.32, height: 1.75, radio: true },
  bound: { name: 'The Bound', hp: 4, zone: 'in', power: 2, radius: 0.36, height: 1.8, radio: true },
  // (never one of a site's own: what the core's alarm brings up from below; see G.hostCoreTaken)
  executioner: { name: 'The Executioner', hp: 9999, zone: 'in', power: 4, radius: 0.55, height: 2.6, radio: true },
};
const BESTIARY = {
  crawler: 'Low, eyeless, mostly mouth. Once it notices you it charges in a straight line and is terrible at corners. It cannot stop quickly. Four solid hits will put it down. Closed doors buy you a second.',
  pale: 'Tall. Patient. It follows from behind and hates being watched. Glance at it and it slinks away. Stare, and it stops being patient. If your light flickers and you feel watched, turn around.',
  mannequin: 'Only moves when nobody is looking. In the dark, looking does not count: keep a light on it and back away. Invulnerable. Bring a friend to watch it while you leave.',
  leech: 'Clings to ceilings above corridors and drops onto the head of whoever passes beneath. Suffocates its host. Look up. Mash [E] to tear it off, or have a crewmate hit it with a shovel.',
  hound: 'Roams the surface after dark. Completely blind; hunts by sound alone. Walk, crouch, keep quiet. They will follow you into the ship if the hatch is open.',
  sister: 'They come in twos and threes, in what is left of their uniforms. Blind: they go for light. Turn a flashlight on one, or carry a lit lamp past it, and the whole ward comes for you, jerking and stopping and jerking on. Kill the light and keep still and they lose you; they will stand where they stopped, twitching, a long time. Three hits.',
  bound: 'Looks like a body. Lies on the floor like one, in a corridor, in a doorway. It gets up when you are close enough to touch it. No arms, no face, and a hole at the top it retches through: keep out of the mist, it eats through a suit. Slow, but it does not give up easily. Four hits. Walk wide round anything lying down.',
  executioner: 'Nobody has a body cam recording of it from the front. Pulling a core sets off the alarm, and sometimes the alarm brings it up from below: a great figure in an iron hood, dragging a blade longer than you are. You will hear it before you see it. It does not run, it does not stop, and nothing we have so much as marks it. When it lifts the blade, get out of reach. Then get out of the building.',
  slime: 'A wall of slime as wide as the corridor and as high as the ceiling. Slow, but it never stops, and nothing we have hurts it. It feels you through the floor. Left alone it settles across a corridor and waits. Shut a door on it: it cannot open doors, but it will seep under one, or through a barred window, a little at a time, and gather itself again on your side. Touching it burns. Do not let it back you into a dead end.',
};

const MonModels = (() => {
  const mc = {};
  const M = (k, f) => mc[k] || (mc[k] = f());
  const mats = {
    pale: () => M('pale', () => new THREE.MeshStandardMaterial({ map: TEX.get('flesh'), color: 0xa8a092, roughness: 0.6, emissive: 0x050403 })),
    void: () => M('void', () => new THREE.MeshBasicMaterial({ color: 0x000000 })),
    crawl: () => M('crawl', () => new THREE.MeshStandardMaterial({ map: TEX.get('darkflesh'), color: 0x9a8a84, roughness: 0.3, metalness: 0.1 })),
    tooth: () => M('tooth', () => new THREE.MeshStandardMaterial({ color: 0xd8d0b0, roughness: 0.4 })),
    gum: () => M('gum', () => new THREE.MeshStandardMaterial({ color: 0x3a0a0c, roughness: 0.3 })),
    porc: () => M('porcm', () => new THREE.MeshStandardMaterial({ map: TEX.get('porcelain'), color: 0xa89f92, roughness: 0.32, metalness: 0.05 })),
    joint: () => M('joint', () => new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.5 })),
    leech: () => M('leech', () => new THREE.MeshStandardMaterial({ map: TEX.get('darkflesh'), color: 0xb09090, roughness: 0.18, metalness: 0.1 })),
    hound: () => M('hound', () => new THREE.MeshStandardMaterial({ map: TEX.get('darkflesh'), color: 0x6a5450, roughness: 0.6 })),
    leg: () => M('leg', () => new THREE.MeshStandardMaterial({ color: 0x1c1614, roughness: 0.6 })),
    sinew: () => M('sinew', () => new THREE.MeshStandardMaterial({ map: TEX.get('flesh'), color: 0x7a5a52, roughness: 0.45 })),
    claw: () => M('claw', () => new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.35, metalness: 0.1 })),
    sisSkin: () => M('sisSkin', () => new THREE.MeshStandardMaterial({ map: TEX.get('flesh'), color: 0x948884, roughness: 0.55 })),
    smock: () => M('smock', () => new THREE.MeshStandardMaterial({ map: TEX.get('suitWorn'), color: 0xa89c88, roughness: 0.85 })),
    dressing: () => M('dressing', () => new THREE.MeshStandardMaterial({ map: TEX.get('tape'), color: 0xd0c0a0, roughness: 0.9 })),
    scalpel: () => M('scalpel', () => new THREE.MeshStandardMaterial({ map: TEX.get('rust'), color: 0xb0a090, roughness: 0.35, metalness: 0.75 })),
    bound: () => M('bound', () => new THREE.MeshStandardMaterial({ map: TEX.get('darkflesh'), color: 0x9a7a6c, roughness: 0.3, metalness: 0.05 })),
    iron: () => M('iron', () => new THREE.MeshStandardMaterial({ map: TEX.get('rust'), color: 0x9a7a62, roughness: 0.8, metalness: 0.5 })),
    apron: () => M('apron', () => new THREE.MeshStandardMaterial({ map: TEX.get('suitWorn'), color: 0x4a3a32, roughness: 0.75 })),
    deadSkin: () => M('deadSkin', () => new THREE.MeshStandardMaterial({ map: TEX.get('flesh'), color: 0x8a8278, roughness: 0.6 })),
    // the Seep: a glossy jelly you can see into, heaving slowly all over, glowing a little at its edges where the light
    // comes through it (its colour in blotches of darker and paler, square-cut like everything else; which colour, a
    // new one every landing: see SLIME_COLORS)
    slime: () => M('slime', () => {
      const m = new THREE.MeshStandardMaterial({ color: 0x6a7a26, roughness: 0.08, metalness: 0.05, emissive: 0x0a1404, transparent: true, opacity: 0.66 });
      const U = { uT: { value: 0 }, uHeave: { value: 1 } }; m.userData.U = U;
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = 'uniform float uT, uHeave; varying vec3 vSP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vSP = position;
          float wob = sin(position.x * 9.0 + uT * 1.7) * sin(position.y * 7.0 - uT * 1.3) * sin(position.z * 8.0 + uT * 2.1)
            + 0.5 * sin(position.x * 23.0 - uT * 3.1 + position.y * 11.0);
          transformed += normal * wob * 0.035 * uHeave;
          transformed.y -= (1.0 - abs(position.x) * 2.0) * smoothstep(0.6, 1.0, position.y) * 0.04 * (1.0 + sin(uT * 0.9));`);
        sh.fragmentShader = 'varying vec3 vSP;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          { vec3 c = floor(vSP * vec3(14.0, 16.0, 10.0)); float n = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            diffuseColor.rgb *= 0.72 + 0.5 * n; }`).replace('#include <opaque_fragment>', `
          { float fr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.5);
            outgoingLight += diffuseColor.rgb * fr * 0.55; diffuseColor.a = mix(diffuseColor.a, 0.92, fr); }
          #include <opaque_fragment>`);
      };
      m.customProgramCacheKey = () => 'slime';
      return m;
    }),
  };
  const cap = (r, l, s = 8) => new THREE.CapsuleGeometry(r, l, 4, s);
  const sph = (r, s = 12) => new THREE.SphereGeometry(r, s, Math.max(6, Math.floor(s * 0.75)));
  function mk(geo, m, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; parent.add(me); return me; }
  function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
  // limb: two segments hanging down (-Y) from pivot
  function limb(parent, x, y, z, r1, l1, r2, l2, m) {
    const a = grp(parent, x, y, z);
    mk(cap(r1, l1), m, a, 0, -l1 / 2, 0);
    const b = grp(a, 0, -l1, 0);
    mk(cap(r2, l2), m, b, 0, -l2 / 2, 0);
    const end = grp(b, 0, -l2, 0);
    return { a, b, end };
  }
  // a sphere gone lumpy and swollen (a head that's grown wrong, a sack of skin)
  function lumpy(r, seed, k = 0.3, s = 16) {
    const g = sph(r, s), p = g.attributes.position, nz = new Noise2D(seed);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 + nz.fbm(x / r * 1.3 + 4, y / r * 1.3 + z / r * 0.9, 3) * k; p.setXYZ(i, x * f, y * f, z * f); }
    g.computeVertexNormals(); return g;
  }
  function teethRing(parent, r, n, len, inward = true) {
    const g = grp(parent);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const t = mk(new THREE.ConeGeometry(0.018 + Math.random() * 0.01, len * (0.7 + Math.random() * 0.6), 5), mats.tooth(), g, Math.cos(a) * r, Math.sin(a) * r, 0);
      t.rotation.z = a + (inward ? Math.PI / 2 : -Math.PI / 2);
      t.rotation.x = 0.4;
    }
    return g;
  }
  const B = {
    crawler() {
      const root = new THREE.Group(), P = {};
      P.body = grp(root, 0, 0.75, 0);
      const torso = mk(sph(0.5, 14), mats.crawl(), P.body); torso.scale.set(0.95, 0.6, 1.5);
      for (let i = 0; i < 7; i++) mk(new THREE.ConeGeometry(0.05, 0.22, 5), mats.tooth(), P.body, 0, 0.3 - Math.abs(i - 3) * 0.02, -0.6 + i * 0.2, -0.3);
      P.head = grp(P.body, 0, 0.05, 0.75);
      const hd = mk(sph(0.32, 14), mats.crawl(), P.head, 0, 0, 0.12); hd.scale.set(1, 0.85, 1.1);
      mk(new THREE.CircleGeometry(0.22, 18), mats.gum(), P.head, 0, 0, 0.47);
      mk(new THREE.CircleGeometry(0.12, 14), mats.void(), P.head, 0, 0, 0.475);
      P.teeth = teethRing(P.head, 0.2, 16, 0.12); P.teeth.position.z = 0.46;
      P.teeth2 = teethRing(P.head, 0.13, 10, 0.08); P.teeth2.position.z = 0.43;
      P.fl = limb(P.body, -0.45, 0.05, 0.45, 0.08, 0.55, 0.06, 0.6, mats.crawl());
      P.fr = limb(P.body, 0.45, 0.05, 0.45, 0.08, 0.55, 0.06, 0.6, mats.crawl());
      P.bl = limb(P.body, -0.4, -0.05, -0.55, 0.09, 0.4, 0.07, 0.45, mats.crawl());
      P.br = limb(P.body, 0.4, -0.05, -0.55, 0.09, 0.4, 0.07, 0.45, mats.crawl());
      for (const L of [P.fl, P.fr]) for (let c = -1; c <= 1; c++) mk(new THREE.ConeGeometry(0.02, 0.18, 4), mats.tooth(), L.end, c * 0.04, -0.02, 0.07, Math.PI / 2 + 0.3, 0, 0);
      P.body.scale.setScalar(1.18);
      root.userData.parts = P; return root;
    },
    pale() {
      const root = new THREE.Group(), P = {};
      const m = mats.pale(), v = mats.void();
      P.hips = grp(root, 0, 1.5, 0);
      mk(sph(0.12), m, P.hips).scale.set(1.25, 0.7, 0.85);
      P.ll = limb(P.hips, -0.11, 0, 0, 0.048, 0.7, 0.04, 0.72, m);
      P.lr = limb(P.hips, 0.11, 0, 0, 0.048, 0.7, 0.04, 0.72, m);
      for (const L of [P.ll, P.lr]) { mk(sph(0.055, 8), m, L.b); mk(new THREE.BoxGeometry(0.07, 0.035, 0.3), m, L.end, 0, 0, 0.09); }
      P.torso = grp(P.hips, 0, 0.04, 0);
      mk(cap(0.085, 0.6), m, P.torso, 0, 0.36, 0).scale.set(1, 1, 0.8);
      mk(sph(0.17, 12), m, P.torso, 0, 0.56, 0.01).scale.set(1.05, 1.3, 0.72);
      for (let i = 0; i < 5; i++) { const rb = mk(new THREE.TorusGeometry(0.165 - i * 0.008, 0.011, 4, 12, Math.PI), m, P.torso, 0, 0.44 + i * 0.065, 0.015); rb.rotation.set(Math.PI / 2 + 0.35, 0, 0); }
      mk(new THREE.BoxGeometry(0.52, 0.06, 0.1), m, P.torso, 0, 0.8, 0);
      P.neck = grp(P.torso, 0, 0.82, 0.03);
      mk(cap(0.03, 0.28), m, P.neck, 0, 0.15, 0);
      P.head = grp(P.neck, 0, 0.32, 0.02);
      mk(sph(0.14, 16), m, P.head, 0, 0.1, 0).scale.set(0.8, 1.9, 0.95);
      mk(new THREE.BoxGeometry(0.19, 0.035, 0.07), m, P.head, 0, 0.25, 0.07).rotation.z = 0.06;
      const eL = mk(sph(0.05, 10), v, P.head, -0.05, 0.19, 0.095); eL.scale.set(0.9, 2.1, 0.5); eL.rotation.z = -0.28;
      const eR = mk(sph(0.05, 10), v, P.head, 0.052, 0.18, 0.095); eR.scale.set(0.85, 2.3, 0.5); eR.rotation.z = 0.3;
      P.mouth = mk(sph(0.035, 10), v, P.head, 0.005, -0.08, 0.105); P.mouth.scale.set(0.8, 3.4, 0.6);
      P.al = limb(P.torso, -0.25, 0.78, 0, 0.035, 0.74, 0.03, 0.8, m);
      P.ar = limb(P.torso, 0.25, 0.78, 0, 0.035, 0.74, 0.03, 0.8, m);
      for (const L of [P.al, P.ar]) {
        mk(sph(0.045, 8), m, L.b);
        mk(new THREE.BoxGeometry(0.06, 0.09, 0.03), m, L.end, 0, -0.04, 0);
        for (let f = 0; f < 4; f++) mk(new THREE.CylinderGeometry(0.008, 0.004, 0.3, 4), m, L.end, -0.03 + f * 0.02, -0.22, 0.01, 0.12 * (f - 1.5), 0, 0.08 * (f - 1.5));
      }
      root.userData.parts = P; return root;
    },
    mannequin() {
      const root = new THREE.Group(), P = {};
      const m = mats.porc(), j = mats.joint();
      const dark = M('mdark', () => new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9 }));
      P.hips = grp(root, 0, 1.02, 0);
      mk(sph(0.15), m, P.hips).scale.set(1.2, 0.8, 0.9);
      P.ll = limb(P.hips, -0.1, -0.05, 0, 0.065, 0.4, 0.05, 0.42, m);
      P.lr = limb(P.hips, 0.1, -0.05, 0, 0.065, 0.4, 0.05, 0.42, m);
      for (const L of [P.ll, P.lr]) { mk(sph(0.06), j, L.b); mk(new THREE.BoxGeometry(0.09, 0.05, 0.22), m, L.end, 0, -0.03, 0.05); }
      P.torso = grp(P.hips, 0, 0.06, 0);
      mk(sph(0.12), m, P.torso, 0, 0.08, 0).scale.set(1.1, 0.9, 0.8);
      mk(sph(0.19), m, P.torso, 0, 0.4, 0).scale.set(1.1, 1.25, 0.72);
      P.neck = grp(P.torso, 0, 0.64, 0);
      mk(new THREE.CylinderGeometry(0.035, 0.045, 0.2, 8), j, P.neck, 0, 0.08, 0);
      P.head = grp(P.neck, 0, 0.18, 0);
      mk(sph(0.125, 16), m, P.head, 0, 0.1, 0).scale.set(0.82, 1.25, 0.95);
      mk(sph(0.032, 10), dark, P.head, -0.042, 0.13, 0.098).scale.set(1.2, 0.8, 0.5);
      mk(sph(0.032, 10), dark, P.head, 0.042, 0.13, 0.098).scale.set(1.2, 0.8, 0.5);
      mk(new THREE.BoxGeometry(0.075, 0.006, 0.01), dark, P.head, 0, 0.035, 0.112);
      const crack = mk(new THREE.BoxGeometry(0.006, 0.2, 0.01), dark, P.head, 0.03, 0.12, 0.112); crack.rotation.z = 0.35;
      const chip = mk(new THREE.BoxGeometry(0.05, 0.035, 0.02), dark, P.head, -0.05, 0.23, 0.08); chip.rotation.z = 0.5;
      P.al = limb(P.torso, -0.25, 0.56, 0, 0.048, 0.3, 0.042, 0.32, m);
      P.ar = limb(P.torso, 0.25, 0.56, 0, 0.048, 0.3, 0.042, 0.32, m);
      for (const L of [P.al, P.ar]) { mk(sph(0.05), j, L.a); mk(sph(0.045), j, L.b); mk(sph(0.055), m, L.end, 0, -0.03, 0).scale.set(0.8, 1.3, 0.6); }
      root.userData.parts = P; return root;
    },
    leech() {
      const root = new THREE.Group(), P = {};
      P.body = grp(root);
      P.body.scale.setScalar(1.35);
      P.segs = [];
      const rs = [0.12, 0.17, 0.19, 0.18, 0.15, 0.11, 0.07];
      rs.forEach((r, i) => { const s = mk(sph(r, 10), mats.leech(), P.body, 0, 0, 0.3 - i * 0.12); s.scale.set(1.1, 0.75, 1); P.segs.push(s); });
      P.strands = [];
      for (let i = 0; i < 7; i++) {
        const st = grp(P.body, (Math.random() - 0.5) * 0.25, 0.08, 0.25 - i * 0.09);
        const l = 0.25 + Math.random() * 0.45;
        mk(new THREE.CylinderGeometry(0.004, 0.012, l, 4), mats.gum(), st, 0, l / 2, 0);
        P.strands.push(st);
      }
      P.legs = [];
      for (let i = 0; i < 8; i++) {
        const side = i % 2 ? 1 : -1, z = 0.25 - Math.floor(i / 2) * 0.13;
        const l = grp(P.body, side * 0.14, -0.04, z);
        mk(new THREE.CylinderGeometry(0.008, 0.012, 0.28, 4), mats.leg(), l, side * 0.12, -0.08, 0, 0, 0, side * 1.0);
        P.legs.push(l);
      }
      P.mouth = grp(P.body, 0, 0, 0.38);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; mk(new THREE.CylinderGeometry(0.004, 0.01, 0.16, 4), mats.gum(), P.mouth, Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.06, Math.PI / 2 + Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4); }
      root.userData.parts = P; return root;
    },
    // A starved, eyeless thing the size of a pony: a deep ribcage with the ribs standing out under the skin, a pinched
    // waist, heavy haunches, bony plates down the spine; a long blind skull with a heavy brow and flared nostrils over
    // tapered jaws crowded with teeth; long legs on clawed paws; a whip of a tail.
    hound() {
      const root = new THREE.Group(), P = {};
      const m = mats.hound(), sin = mats.sinew(), bone = mats.claw(), gum = mats.gum(), tooth = mats.tooth();
      P.body = grp(root, 0, 1.15, 0);
      mk(sph(0.4, 18), m, P.body, 0, 0.02, 0.3).scale.set(0.8, 0.98, 1.08);
      const waist = mk(cap(0.2, 0.42, 12), m, P.body, 0, 0.04, -0.12, Math.PI / 2); waist.scale.set(1, 1, 0.82);
      mk(sph(0.32, 16), m, P.body, 0, 0.03, -0.5).scale.set(0.98, 0.92, 1.0);
      for (const s of [-1, 1]) mk(sph(0.2, 12), m, P.body, s * 0.2, -0.04, -0.55).scale.set(0.8, 1.15, 1.1);
      // ribs standing out along the flanks
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
        const rb = mk(new THREE.TorusGeometry(0.335 - Math.abs(i - 1.5) * 0.012, 0.018, 5, 12, 1.5), sin, P.body, 0, 0.02, 0.56 - i * 0.085);
        rb.rotation.z = s > 0 ? -0.85 : Math.PI - 0.65;
      }
      // a ridge of bony plates down the spine
      const top = (z) => (z > 0.05 ? 0.4 : z > -0.32 ? 0.24 : 0.32);
      for (let i = 0; i < 11; i++) { const z = 0.62 - i * 0.14, h = 0.09 + (i % 2) * 0.03; mk(new THREE.ConeGeometry(0.03, h, 4), bone, P.body, 0, top(z) + h * 0.35, z, -0.45); }
      // neck: thick, with cords of tendon standing out
      P.neck = grp(P.body, 0, 0.12, 0.62);
      mk(cap(0.13, 0.42, 10), m, P.neck, 0, 0.0, 0.2, Math.PI / 2 + 0.5, 0, 0);
      for (const s of [-1, 1]) mk(cap(0.025, 0.4, 6), sin, P.neck, s * 0.1, -0.02, 0.2, Math.PI / 2 + 0.55, 0, 0);
      // head: a long blind skull, skin grown over where the eyes should be, a heavy brow, flared nostrils
      P.head = grp(P.neck, 0, -0.18, 0.5);
      mk(sph(0.18, 16), m, P.head, 0, 0.06, 0.0).scale.set(0.88, 0.78, 1.3);
      for (const s of [-1, 1]) {
        mk(cap(0.028, 0.1, 6), bone, P.head, s * 0.085, 0.14, 0.1, 0.3, 0, Math.PI / 2 + s * 0.2);
        mk(sph(0.03, 8), sin, P.head, s * 0.09, 0.09, 0.15).scale.set(0.6, 0.8, 0.3);
        mk(new THREE.ConeGeometry(0.045, 0.14, 5), m, P.head, s * 0.1, 0.17, -0.12, -0.9, 0, s * -0.4);
      }
      P.jawU = grp(P.head, 0, 0.03, 0.12);
      const up = mk(new THREE.CylinderGeometry(0.05, 0.11, 0.44, 7), m, P.jawU, 0, 0, 0.2, Math.PI / 2); up.scale.set(1, 1, 0.62);
      for (const s of [-1, 1]) mk(new THREE.BoxGeometry(0.012, 0.03, 0.025), mats.void(), P.jawU, s * 0.025, 0.025, 0.41, 0, s * 0.3, 0);
      P.jawL = grp(P.head, 0, -0.05, 0.1);
      const lo = mk(new THREE.CylinderGeometry(0.04, 0.09, 0.42, 7), m, P.jawL, 0, 0, 0.2, Math.PI / 2); lo.scale.set(1, 1, 0.5);
      const g = mk(new THREE.CylinderGeometry(0.03, 0.075, 0.38, 7), gum, P.jawL, 0, 0.018, 0.2, Math.PI / 2); g.scale.set(1, 1, 0.3);
      for (let i = 0; i < 10; i++) {
        const z = 0.04 + i * 0.038, w = 0.1 - z * 0.13, s = i % 2 ? 1 : -1, big = i === 1 || i === 2;
        mk(new THREE.ConeGeometry(big ? 0.018 : 0.012, big ? 0.12 : 0.07, 4), tooth, P.jawU, s * w, -0.045, z, Math.PI, 0, 0);
        mk(new THREE.ConeGeometry(0.011, 0.065, 4), tooth, P.jawL, -s * w * 0.9, 0.04, z, 0, 0, 0);
      }
      // legs: knobbed joints, long shins, clawed paws
      const leg = (x, z, r1, l1, l2, hind) => {
        const L = limb(P.body, x, -0.1, z, r1, l1, 0.05, l2, m);
        mk(sph(r1 * 1.05, 10), m, L.a, 0, 0, 0);
        mk(sph(0.06, 8), sin, L.b, 0, 0, hind ? -0.02 : 0.02);
        const paw = mk(sph(0.07, 10), m, L.end, 0, -0.01, 0.05); paw.scale.set(1, 0.55, 1.4);
        for (let c = -1; c <= 1; c++) mk(new THREE.ConeGeometry(0.014, 0.08, 4), bone, L.end, c * 0.035, -0.03, 0.15, Math.PI / 2 + 0.35, 0, 0);
        if (hind) mk(new THREE.ConeGeometry(0.02, 0.1, 4), bone, L.b, 0, -0.05, -0.07, -2.2, 0, 0);
        return L;
      };
      P.fl = leg(-0.22, 0.45, 0.075, 0.5, 0.55, false);
      P.fr = leg(0.22, 0.45, 0.075, 0.5, 0.55, false);
      P.bl = leg(-0.24, -0.52, 0.09, 0.45, 0.6, true);
      P.br = leg(0.24, -0.52, 0.09, 0.45, 0.6, true);
      // the tail: a tapering whip in four joints, a couple of bony barbs along it
      P.tail = grp(P.body, 0, 0.08, -0.8);
      let seg = P.tail;
      for (let i = 0; i < 4; i++) {
        const len = 0.26 - i * 0.03, r0 = 0.055 - i * 0.012, r1 = r0 - 0.011;
        const s = grp(seg, 0, 0, i ? -(0.26 - (i - 1) * 0.03) : 0); s.rotation.x = i ? 0.22 : -0.5;
        mk(new THREE.CylinderGeometry(r1, r0, len, 7), m, s, 0, 0, -len / 2, -Math.PI / 2);
        if (i === 1 || i === 2) mk(new THREE.ConeGeometry(0.015, 0.07, 4), bone, s, 0, r0, -len / 2, -0.6);
        seg = s;
      }
      root.userData.parts = P; return root;
    },
    // The Seep: a wall of jelly the width of a corridor and the height of its ceiling, its edges rounded, heaving and
    // sagging, with things it has taken hanging inside it. It's built a metre each way and sized as it goes (see
    // anim_slime). The parts for passing a shut door: a thin sheet under it (or a rope of it through the window's bars,
    // dripping down the far side) and a mound gathering beyond, while the body this side drains away into the gap
    // A Sister: a nurse from a ward that never closed. Thin, in a stained smock, its head a swollen faceless lump bound
    // up in dirty dressings, lolling on a twisted neck, a nurse's cap still pinned to the mess of it; a rusted scalpel
    // in one hand
    sister() {
      const root = new THREE.Group(), P = {};
      const skin = mats.sisSkin(), cloth = mats.smock(), band = mats.dressing(), dark = mats.joint();
      P.hips = grp(root, 0, 0.95, 0);
      mk(sph(0.13, 12), cloth, P.hips).scale.set(1.25, 0.8, 0.9);
      const skirt = mk(new THREE.CylinderGeometry(0.17, 0.26, 0.42, 12, 1, true), cloth, P.hips, 0, -0.16, 0); skirt.material.side = THREE.DoubleSide;
      P.ll = limb(P.hips, -0.085, -0.05, 0, 0.05, 0.46, 0.04, 0.46, skin);
      P.lr = limb(P.hips, 0.085, -0.05, 0, 0.05, 0.46, 0.04, 0.46, skin);
      for (const L of [P.ll, P.lr]) { mk(sph(0.045, 8), skin, L.b); mk(new THREE.BoxGeometry(0.06, 0.05, 0.18), dark, L.end, 0, -0.02, 0.04); }
      P.torso = grp(P.hips, 0, 0.05, 0);
      mk(cap(0.12, 0.32, 10), cloth, P.torso, 0, 0.27, 0).scale.set(1.1, 1, 0.75);
      mk(new THREE.TorusGeometry(0.075, 0.02, 5, 12), cloth, P.torso, 0, 0.5, 0, Math.PI / 2);
      P.neck = grp(P.torso, 0, 0.52, 0.01);
      mk(cap(0.035, 0.12, 6), skin, P.neck, 0, 0.07, 0);
      P.head = grp(P.neck, 0, 0.16, 0);
      mk(lumpy(0.15, 31 + Math.random() * 50, 0.35), skin, P.head, 0, 0.08, 0.01).scale.set(1.0, 1.15, 1.05);
      for (let i = 0; i < 5; i++) { const b = mk(new THREE.TorusGeometry(0.15 - Math.abs(i - 2) * 0.014, 0.024, 5, 14), band, P.head, 0, -0.02 + i * 0.05, 0.01); b.rotation.set(Math.PI / 2 + (i - 2) * 0.2, 0.2 * i, 0.3 * (i % 2 ? 1 : -1)); }
      mk(new THREE.BoxGeometry(0.14, 0.05, 0.08), band, P.head, 0.02, 0.25, -0.02, -0.3, 0, 0.2);
      P.al = limb(P.torso, -0.17, 0.46, 0, 0.035, 0.3, 0.03, 0.3, skin);
      P.ar = limb(P.torso, 0.17, 0.46, 0, 0.035, 0.3, 0.03, 0.3, skin);
      for (const L of [P.al, P.ar]) { mk(sph(0.045, 8), cloth, L.a, 0, -0.02, 0); mk(new THREE.BoxGeometry(0.05, 0.08, 0.025), skin, L.end, 0, -0.04, 0); }
      P.blade = mk(new THREE.BoxGeometry(0.012, 0.03, 0.26), mats.scalpel(), P.ar.end, 0, -0.07, 0.12);
      root.userData.parts = P; return root;
    },
    // The Bound: a body bound up in its own skin, the arms grown in against it like a straitjacket, no head, only a
    // ragged mouth at the top it retches through; on legs that bend wrong. Lying down, it's a body in a bag
    bound() {
      const root = new THREE.Group(), P = {};
      const m = mats.bound(), gum = mats.gum(), sin = mats.sinew();
      P.body = grp(root, 0, 0.9, 0);
      P.ll = limb(P.body, -0.1, 0, 0, 0.06, 0.45, 0.05, 0.48, m);
      P.lr = limb(P.body, 0.1, 0, 0, 0.06, 0.45, 0.05, 0.48, m);
      for (const L of [P.ll, P.lr]) { mk(sph(0.06, 8), sin, L.b); mk(new THREE.BoxGeometry(0.08, 0.05, 0.2), m, L.end, 0, -0.02, 0.05); }
      P.torso = grp(P.body, 0, 0.02, 0);
      mk(lumpy(0.22, 77 + Math.random() * 50, 0.18), m, P.torso, 0, 0.42, 0).scale.set(0.95, 2.1, 0.8);
      // the skin drawn tight round it in bands, the arms' outlines under it
      for (let i = 0; i < 5; i++) mk(new THREE.TorusGeometry(0.2 - Math.abs(i - 2) * 0.02, 0.018, 5, 14), sin, P.torso, 0, 0.18 + i * 0.13, 0, Math.PI / 2 + (i % 2 ? 0.12 : -0.1));
      for (const sx of [-1, 1]) mk(cap(0.05, 0.42, 8), m, P.torso, sx * 0.16, 0.48, 0.07, 0.15, 0, sx * 0.12);
      P.mouth = grp(P.torso, 0, 0.88, 0.02);
      mk(new THREE.TorusGeometry(0.075, 0.03, 6, 12), gum, P.mouth, 0, 0, 0, Math.PI / 2);
      mk(new THREE.CircleGeometry(0.07, 12), mats.void(), P.mouth, 0, 0.005, 0, -Math.PI / 2);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; mk(new THREE.ConeGeometry(0.02, 0.09, 4), sin, P.mouth, Math.cos(a) * 0.08, 0.03, Math.sin(a) * 0.08, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
      P.head = P.mouth;
      root.userData.parts = P; return root;
    },
    // The Executioner: a huge grey figure, bare to the waist over a butcher's long leather apron, its head shut up in
    // a tall riveted iron hood with chains hanging off it, dragging a blade longer than a man
    executioner() {
      const root = new THREE.Group(), P = {};
      const skin = mats.deadSkin(), iron = mats.iron(), apron = mats.apron(), dark = mats.joint();
      P.hips = grp(root, 0, 1.25, 0);
      mk(sph(0.28, 14), skin, P.hips).scale.set(1.1, 0.7, 0.85);
      mk(new THREE.BoxGeometry(0.62, 1.15, 0.06), apron, P.hips, 0, -0.5, 0.24);
      mk(new THREE.BoxGeometry(0.62, 1.1, 0.05), apron, P.hips, 0, -0.5, -0.22);
      P.ll = limb(P.hips, -0.17, -0.05, 0, 0.11, 0.6, 0.09, 0.6, skin);
      P.lr = limb(P.hips, 0.17, -0.05, 0, 0.11, 0.6, 0.09, 0.6, skin);
      for (const L of [P.ll, P.lr]) mk(new THREE.BoxGeometry(0.16, 0.1, 0.32), dark, L.end, 0, -0.03, 0.06);
      P.torso = grp(P.hips, 0, 0.08, 0);
      mk(lumpy(0.3, 11, 0.12), skin, P.torso, 0, 0.42, 0).scale.set(1.25, 1.3, 0.85);
      mk(sph(0.24, 12), skin, P.torso, 0, 0.12, 0.02).scale.set(1.15, 0.9, 0.9);
      P.neck = grp(P.torso, 0, 0.8, 0);
      mk(cap(0.1, 0.1, 8), skin, P.neck, 0, 0.05, 0);
      P.head = grp(P.neck, 0, 0.12, 0);
      // the hood: a tall iron box tapering up, riveted along its seams, a slit for nothing to look out of
      const hood = mk(new THREE.CylinderGeometry(0.16, 0.34, 0.95, 6, 1), iron, P.head, 0, 0.42, -0.04); hood.rotation.y = Math.PI / 6; hood.scale.set(1, 1, 1.15);
      mk(new THREE.BoxGeometry(0.5, 0.06, 0.5), iron, P.head, 0, -0.03, -0.04);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; mk(sph(0.018, 6), dark, P.head, Math.cos(a) * 0.29, 0.04, Math.sin(a) * 0.33 - 0.04); }
      mk(new THREE.BoxGeometry(0.02, 0.32, 0.02), mats.void(), P.head, 0, 0.4, 0.27).rotation.x = -0.17;
      for (const [x, z, l] of [[-0.22, 0.12, 0.5], [0.2, 0.1, 0.35], [0.05, 0.24, 0.6], [-0.1, -0.25, 0.45]]) for (let k = 0; k < l / 0.06; k++) mk(new THREE.TorusGeometry(0.022, 0.006, 4, 8), dark, P.head, x, -0.06 - k * 0.055, z, 0, k % 2 ? Math.PI / 2 : 0, 0);
      P.al = limb(P.torso, -0.42, 0.66, 0, 0.09, 0.55, 0.075, 0.55, skin);
      P.ar = limb(P.torso, 0.42, 0.66, 0, 0.09, 0.55, 0.075, 0.55, skin);
      for (const L of [P.al, P.ar]) { mk(sph(0.11, 10), skin, L.a); mk(sph(0.08, 8), skin, L.end, 0, -0.05, 0).scale.set(1, 1.3, 0.8); }
      // the blade: a great flat slab of rusted iron, hung from the right fist, its tip dragging
      P.blade = grp(P.ar.end, 0, -0.08, 0);
      mk(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6), dark, P.blade, 0, 0, 0, Math.PI / 2, 0, 0);
      const bl = mk(new THREE.BoxGeometry(0.05, 0.36, 1.9), iron, P.blade, 0, -0.06, 1.12); bl.scale.set(1, 1, 1);
      mk(new THREE.BoxGeometry(0.02, 0.1, 1.9), iron, P.blade, 0, -0.25, 1.12);
      P.tip = grp(P.blade, 0, -0.2, 2.05);
      root.userData.parts = P; return root;
    },
    slime() {
      const root = new THREE.Group(), P = {}, m = mats.slime();
      // (a rounded box: a sphere pushed out toward its corners, sitting on the floor)
      const blob = () => {
        const g = new THREE.SphereGeometry(0.5, 36, 26), p = g.attributes.position, f = (c) => Math.sign(c) * Math.pow(Math.min(1, Math.abs(c) * 2), 0.42) * 0.5;
        for (let i = 0; i < p.count; i++) p.setXYZ(i, f(p.getX(i)), f(p.getY(i)), f(p.getZ(i)));
        g.computeVertexNormals(); return g.translate(0, 0.5, 0);
      };
      const geo = blob(), cube = () => new THREE.BoxGeometry(1, 1, 1, 4, 4, 2);
      P.body = mk(geo, m, root);
      // what it has taken: bones, a skull, a length of pipe, a work glove, turning slowly inside it
      const bone = mats.tooth(), dark = mats.joint();
      P.inner = grp(P.body, 0, 0, 0);
      for (const [x, y, z, rx, rz] of [[-0.22, 0.32, 0.05, 0.4, 1.2], [0.18, 0.55, -0.1, -0.8, 0.3], [0.05, 0.22, 0.12, 1.4, -0.5]]) mk(cap(0.012, 0.09, 6), bone, P.inner, x, y, z, rx, 0, rz);
      mk(sph(0.03, 8), bone, P.inner, 0.28, 0.7, 0.05);
      mk(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6), dark, P.inner, -0.3, 0.62, -0.05, 0.3, 0, 1.1);
      mk(new THREE.BoxGeometry(0.035, 0.05, 0.015), dark, P.inner, 0.1, 0.85, 0.1, 0.5, 0.4, 0);
      P.sheet = mk(cube().translate(0, 0.5, 0), m, root); P.stream = mk(cube(), m, root); P.drip = mk(cube().translate(0, 0.5, 0), m, root);
      P.far = mk(geo, m, root);
      for (const k of ['sheet', 'stream', 'drip', 'far']) P[k].visible = false;
      P.U = m.userData.U;
      root.userData.parts = P; return root;
    },
  };
  // the Seep's colour: one of these, a new one every landing (all of them alike on a site, and the same for every
  // crewmate, picked from the landing's seed)
  const SLIME_COLORS = [0x6a7a26, 0x8a1c22, 0x5a2a8a, 0xb07a1a, 0x1f8a80, 0xc8c0a8, 0x2a3f7a, 0x9a3a6a, 0x5aa02a];
  const tintSlime = (seed) => { const m = mats.slime(), c = SLIME_COLORS[new RNG((seed || 1) ^ 0x5eed).int(0, SLIME_COLORS.length - 1)]; m.color.setHex(c); m.emissive.setHex(c).multiplyScalar(0.16); };
  return { tintSlime, build(type) { const g = B[type](); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } }); return g; } };
})();

const _dp = new THREE.Vector3(), _sl = new THREE.Vector3(), _sl2 = new THREE.Vector3();
class Monster {
  constructor(game, id, type, x, y, z) {
    this.g = game; this.id = id; this.type = type; this.def = MON_DEFS[type];
    this.pos = new THREE.Vector3(x, y, z); this.ry = Math.random() * TAU;
    this.state = type === 'leech' ? 'crawl' : type === 'hound' ? 'wander' : type === 'pale' ? 'lurk' : type === 'sister' ? 'stand' : type === 'bound' ? 'lie' : type === 'executioner' ? 'walk' : 'roam';
    this.st = 0; this.hp = this.def.hp; this.extra = -1;
    this.target = null; this.goal = null; this.path = null; this.pathT = 0; this.pathGoal = null;
    this.stun = 0; this.atk = 0; this.anger = 0; this.stare = 0; this.seenCd = 0; this.speedNow = 0; this.grip = 100; this.dmgAcc = 0;
    this.scanT = Math.random(); this.stuckT = 0; this.spawnT = 0; this.cool = 0; this.lastSeenT = 0; this.observed = false;
    // presentation
    this.mesh = MonModels.build(type); this.P = this.mesh.userData.parts;
    this.mesh.position.copy(this.pos);
    this.rpos = this.pos.clone(); this.rry = this.ry; this.buf = []; this.vis = { speed: 0, stepAcc: 0, t: Math.random() * 10, sfx: 2 + Math.random() * 4, lastState: this.state, pose: -999 };
    if (type === 'mannequin') this.extra = Math.floor(Math.random() * 1e6);
    if (type === 'slime') { MonModels.tintSlime(game.round && game.round.seed); this.swallowed = []; }
  }
  get dead() { return this.state === 'dead'; }
  forward() { return { x: Math.sin(this.ry), z: Math.cos(this.ry) }; }
  center() { return new THREE.Vector3(this.rpos.x, this.rpos.y + this.def.height * 0.6, this.rpos.z); }
  headPos() {
    const h = this.P.head;
    if (h) { const v = new THREE.Vector3(); h.getWorldPosition(v); return v; }
    return this.center();
  }
  // ---------------- host-side movement helpers ----------------
  setState(s) { if (this.state !== s) { this.state = s; this.st = 0; } }
  turnTo(ang, rate, dt) { const d = angDiff(this.ry, ang); this.ry += clamp(d, -rate * dt, rate * dt); }
  collide() {
    const p = this.pos, r = this.def.radius;
    if (this.def.zone === 'in') {
      if (!this.g.fac) return false;
      const hit = this.g.fac.collide(p, r);
      // walkers follow the floor (down the stairs too); a leech keeps to the ceiling and sets its own height
      if (this.type !== 'leech') p.y = this.g.fac.floorY(p.x, p.z, p.y);
      return hit;
    }
    let hit = this.g.ext ? this.g.ext.collide(p, r) : false;
    if (this.g.ship.collide(p, r)) hit = true;
    p.y = this.g.groundAt(p.x, p.z);
    return hit;
  }
  stepToward(tx, tz, speed, dt, turnRate = 8) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return 0;
    this.turnTo(Math.atan2(dx, dz), turnRate, dt);
    const s = Math.min(d, speed * dt);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += (dx / d) * s; this.pos.z += (dz / d) * s;
    this.collide();
    this.speedNow = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    return d;
  }
  // follow a path to (gx,gz). returns remaining straight distance.
  moveTo(gx, gz, speed, dt, opts = {}) {
    const fac = this.g.fac;
    if (this.def.zone !== 'in' || !fac) return this.stepToward(gx, gz, speed, dt);
    this.pathT -= dt;
    const moved = !this.pathGoal || Math.hypot(this.pathGoal.x - gx, this.pathGoal.z - gz) > 1.5;
    if (!this.path || this.pathT <= 0 || moved) {
      this.path = fac.findPath(this.pos.x, this.pos.z, gx, gz, false, this.pos.y, opts.gy) || [{ x: gx, z: gz }];
      this.pathGoal = { x: gx, z: gz }; this.pathT = 0.5 + Math.random() * 0.3;
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - this.pos.x, this.path[0].z - this.pos.z) < 0.5) this.path.shift();
    const wp = this.path[0];
    // doors in the way
    const ci = fac.ti(this.pos.x), cj = fac.tj(this.pos.z), ni = fac.ti(wp.x), nj = fac.tj(wp.z);
    const di = Math.sign(ni - ci), dj = Math.sign(nj - cj);
    let tx = wp.x, tz = wp.z;
    if (di || dj) {
      const ti = di ? ci + di : ci, tj = di ? cj : cj + dj;
      // (opts.doors false: it can't open one, and only notes the shut door it's come up against)
      const door = fac.closedDoorBetween(ci, cj, ti, tj);
      if (door && Math.hypot(door.x - this.pos.x, door.z - this.pos.z) < 1.8) { if (opts.doors === false) this.doorAhead = door; else this.g.monsterOpenDoor(this, door); }
      // line up square with a doorway before going through it, or it catches on the jamb (or behind the open leaf)
      const d = fac.doorBetween(ci, cj, ti, tj);
      if (d) {
        const lat = (this.pos.x - d.x) * -d.nz + (this.pos.z - d.z) * d.nx, side = Math.sign((this.pos.x - d.x) * d.nx + (this.pos.z - d.z) * d.nz) || 1;
        if (Math.abs(lat) > 0.3) { tx = d.x + d.nx * side * 1.6; tz = d.z + d.nz * side * 1.6; }
      }
    }
    this.stepToward(tx, tz, speed, dt, opts.turn || 9);
    return Math.hypot(gx - this.pos.x, gz - this.pos.z);
  }
  randomGoal(minD, maxD, filter) {
    if (this.def.zone === 'in' && this.g.fac) {
      const fac = this.g.fac;
      for (let t = 0; t < 30; t++) {
        const p = fac.randomWalkable(R0);
        if (!p) break;
        const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
        if (d >= minD && d <= maxD && (!filter || filter(p))) return p;
      }
      return fac.randomWalkable(R0) || { x: this.pos.x, z: this.pos.z };
    }
    const a = Math.random() * TAU, d = minD + Math.random() * (maxD - minD);
    let x = this.pos.x + Math.cos(a) * d, z = this.pos.z + Math.sin(a) * d;
    const l = Math.hypot(x, z); if (l > 150) { x *= 150 / l; z *= 150 / l; }
    return { x, z };
  }
  playersIn() { return this.g.alivePlayers().filter((p) => p.zone === this.def.zone); }
  // perception: sight (range + forward cone + line of sight), bumping into you, or hearing you
  senses(p, sight, cone, near = 4) {
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < near) return true;
    if (d < sight) {
      const f = this.forward(), dot = (dx * f.x + dz * f.z) / (d || 1);
      if (dot > cone && (!this.g.fac || this.def.zone !== 'in' || this.g.fac.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z, true))) return true;
    }
    for (const n of this.g.noises) if (n.pid === p.id && n.zone === this.def.zone && n.age < 0.4 && Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < n.r) return true;
    return false;
  }
  detect(sight, cone, near) {
    let best = null, bd = Infinity;
    for (const p of this.playersIn()) {
      if (!this.senses(p, sight, cone, near)) continue;
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  hearNoise(scale = 1) {
    let best = null, bd = Infinity;
    for (const n of this.g.noises) {
      if (n.zone !== this.def.zone || n.age > 0.35) continue;
      const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
      if (d < n.r * scale && d < bd) { bd = d; best = n; }
    }
    return best;
  }
  // keep a fading memory of where the target was last perceived
  track(tgt, sight, cone, near, memory, dt) {
    if (this.senses(tgt, sight, cone, near)) { this.memory = memory; this.lastKnown = { x: tgt.pos.x, z: tgt.pos.z, y: tgt.pos.y }; this.aware = true; }
    else { this.aware = false; this.memory = (this.memory || 0) - dt; }
  }
  nearestPlayer(maxD) {
    let best = null, bd = maxD;
    for (const p of this.playersIn()) { const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  // ---------------- host AI ----------------
  hostUpdate(dt) {
    if (this.dead) return;
    this.st += dt; this.spawnT += dt; this.atk -= dt;
    if (this.stun > 0) { this.stun -= dt; this.speedNow = 0; if (this.type === 'leech' && this.state === 'attached') this.detach(); return; }
    // safety: never stay embedded in solid geometry
    const fac = this.g.fac;
    if (this.def.zone === 'in' && fac && this.state !== 'attached' && !fac.floorAt(fac.ti(this.pos.x), fac.tj(this.pos.z))) {
      const t = fac.nearestWalkable(fac.ti(this.pos.x), fac.tj(this.pos.z));
      if (t) { this.pos.x = fac.cx(t[0]); this.pos.z = fac.cz(t[1]); if (this.type !== 'leech') this.pos.y = fac.floorY(this.pos.x, this.pos.z, this.pos.y); this.path = null; }
    }
    this['ai_' + this.type](dt);
  }
  ai_crawler(dt) {
    const fac = this.g.fac;
    this.scanT -= dt;
    const scan = () => {
      if (this.scanT > 0) return null;
      this.scanT = 0.25;
      const f = this.forward();
      for (const p of this.playersIn()) {
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > 22) continue;
        const dot = (dx * f.x + dz * f.z) / (d || 1);
        if ((dot > 0.15 || d < 5) && fac.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z, true)) return p;
      }
      return null;
    };
    const hear = () => {
      for (const n of this.g.noises) if (n.zone === 'in' && n.age < 0.3 && Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < n.r * 0.8) return n;
      return null;
    };
    switch (this.state) {
      case 'roam': case 'search': case 'investigate': {
        if (!this.goal || this.st > (this.state === 'roam' ? 18 : 9)) { if (this.state !== 'roam') this.setState('roam'); this.goal = this.randomGoal(6, 30); this.st = 0; }
        const rem = this.moveTo(this.goal.x, this.goal.z, this.state === 'roam' ? 2.2 : 3.6, dt);
        if (rem < 1) { this.goal = null; if (this.state !== 'roam') this.setState('roam'); }
        const p = scan();
        if (p) { this.target = p.id; this.setState('spot'); this.extra = p.id; break; }
        const n = hear();
        if (n) { this.goal = { x: n.x, z: n.z }; this.setState('investigate'); }
        break;
      }
      case 'spot': {
        const p = this.g.players.get(this.target);
        if (!p || !p.alive || p.zone !== 'in') { this.setState('roam'); break; }
        this.turnTo(Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 6, dt);
        this.speedNow = 0;
        if (this.st > 0.75) { this.setState('charge'); this.charge = 2.5; this.lastSeenT = 0; }
        break;
      }
      case 'charge': {
        const p = this.g.players.get(this.target);
        if (!p || !p.alive || p.zone !== 'in') { this.setState('roam'); this.goal = null; break; }
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        const sees = fac.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z, true);
        this.lastSeenT = sees ? 0 : this.lastSeenT + dt;
        if (sees) this.lastKnown = { x: p.pos.x, z: p.pos.z, y: p.pos.y };
        const aim = this.lastKnown || p.pos;
        this.turnTo(Math.atan2(aim.x - this.pos.x, aim.z - this.pos.z), 1.7, dt);
        this.charge = Math.min(11, this.charge + 7 * dt);
        const f = this.forward(), ox = this.pos.x, oz = this.pos.z, want = this.charge * dt;
        // bash doors
        const ci = fac.ti(ox), cj = fac.tj(oz), ni = fac.ti(ox + f.x * 1.2), nj = fac.tj(oz + f.z * 1.2);
        // a door slammed in its face: it goes straight through, and is left reeling
        if (ni !== ci || nj !== cj) {
          const door = fac.closedDoorBetween(ci, cj, ni, nj);
          if (door) { this.g.monsterBreakDoor(this, door); this.stun = 2.5; this.charge = 0; this.speedNow = 0; this.setState('search'); this.goal = this.lastKnown || null; break; }
        }
        this.pos.x += f.x * want; this.pos.z += f.z * want;
        this.collide();
        const got = Math.hypot(this.pos.x - ox, this.pos.z - oz);
        this.speedNow = got / Math.max(dt, 1e-4);
        if (want > 0.05 && got < want * 0.35 && this.charge > 6) { this.stun = 1.4; this.charge = 0; this.g.emitSound('door_slam', this.pos, { vol: 0.8 }); this.setState('search'); this.goal = this.lastKnown || null; break; }
        for (const q of this.playersIn()) {
          if (this.atk > 0) break;
          if (Math.hypot(q.pos.x - this.pos.x, q.pos.z - this.pos.z) < 1.5) {
            const k = clamp(this.charge / 11, 0.5, 1);
            this.g.hurtPlayer(q.id, Math.round(45 * k), 'crawler', f.x * 9 * k, f.z * 9 * k);
            this.atk = 1.2; this.charge *= 0.3;
          }
        }
        if (this.lastSeenT > 1.6 || this.st > 7) { this.setState('search'); this.goal = this.lastKnown || null; this.extra = -1; }
        break;
      }
      default: this.setState('roam');
    }
  }
  ai_pale(dt) {
    const fac = this.g.fac;
    this.seenCd -= dt; this.cool -= dt;
    let tgt = this.target != null ? this.g.players.get(this.target) : null;
    if (tgt && (!tgt.alive || tgt.zone !== 'in')) { tgt = null; this.target = null; }
    // it has to find you first: see you, hear you, or wander right into you
    if (!tgt && this.cool <= 0 && this.state !== 'drag') {
      const p = this.detect(20, -0.2, 4);
      if (p) { this.target = p.id; tgt = p; this.memory = 25; this.lastKnown = { x: p.pos.x, z: p.pos.z, y: p.pos.y }; if (this.state === 'lurk') this.setState('stalk'); }
      else if (this.state === 'lurk') { const n = this.hearNoise(); if (n) { this.goal = { x: n.x, z: n.z }; this.st = 0; } }
    }
    if (tgt) {
      this.track(tgt, 26, -0.35, 9, 25, dt);
      if (this.memory <= 0) { this.target = null; tgt = null; if (this.state === 'stalk') this.setState('lurk'); }
    }
    this.extra = this.target != null ? this.target : -1;
    const eye = { x: this.pos.x, y: this.pos.y + 2.1, z: this.pos.z };
    let seenByTarget = false, seenByAny = false;
    for (const p of this.playersIn()) {
      if (this.g.canSee(p, eye, 28, 0.6)) { seenByAny = true; if (p.id === this.target) seenByTarget = true; }
    }
    if (!seenByTarget) this.stare = Math.max(0, this.stare - dt * 0.5);
    switch (this.state) {
      case 'lurk': {
        if (!this.goal || this.st > 14) { this.goal = this.randomGoal(8, 30); this.st = 0; }
        if (this.moveTo(this.goal.x, this.goal.z, 2.0, dt) < 1) this.goal = null;
        if (tgt) this.setState('stalk');
        break;
      }
      case 'stalk': {
        if (!tgt) { this.setState('lurk'); break; }
        if (!this.aware) {
          // lost you: creep to where it last noticed you and listen
          const rem = this.moveTo(this.lastKnown.x, this.lastKnown.z, 2.8, dt, { gy: this.lastKnown.y });
          if (rem < 1.5) this.memory -= dt * 2;
          if (seenByAny) { this.fleeGoal = this.hiddenSpot(tgt); this.setState('flee'); }
          break;
        }
        const fx = -Math.sin(tgt.yaw), fz = -Math.cos(tgt.yaw);
        let gx = tgt.pos.x - fx * 3.2, gz = tgt.pos.z - fz * 3.2;
        if (!fac.walkable(fac.ti(gx), fac.tj(gz))) { gx = tgt.pos.x; gz = tgt.pos.z; }
        const d = Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z);
        // lingers behind you... then closes in
        this.creep = d < 5 && !seenByTarget ? (this.creep || 0) + dt : Math.max(0, (this.creep || 0) - dt * 2);
        if (this.creep > 0.9 && !this.breathed) { this.breathed = true; this.g.emitSound('breath', new THREE.Vector3(this.pos.x, this.pos.y + 2.1, this.pos.z), { vol: 1.6, ref: 1.5 }); }
        if (this.creep <= 0) this.breathed = false;
        if (this.creep > 2.6) { gx = tgt.pos.x; gz = tgt.pos.z; }
        this.moveTo(gx, gz, this.creep > 2.6 ? 2.8 : d > 14 ? 4.6 : d > 5 ? 3.0 : 2.4, dt, { gy: tgt.pos.y });
        if (seenByAny) {
          if (seenByTarget) { if (this.seenCd <= 0) { this.anger += 1; this.seenCd = 1.2; } this.stare += dt; }
          if (this.anger >= 4) { this.setState('chase'); break; }
          this.fleeGoal = this.hiddenSpot(tgt); this.setState('flee'); break;
        }
        if (d < 1.4 && !seenByTarget) { this.killAt = { x: tgt.pos.x, z: tgt.pos.z }; this.g.killPlayer(tgt.id, 'pale', this.id); this.setState('drag'); this.goal = this.randomGoal(15, 35); this.target = null; this.anger = 0; this.creep = 0; }
        break;
      }
      case 'flee': {
        if (seenByTarget) this.stare += dt;
        if (this.stare > 2.2 || this.anger >= 4) { this.setState('chase'); this.g.emitSound('hiss', this.pos, { vol: 1.2 }); break; }
        const rem = this.moveTo(this.fleeGoal.x, this.fleeGoal.z, 7.5, dt);
        if ((rem < 1 || this.st > 4) && !seenByAny) this.setState('stalk');
        if (rem < 1 && seenByAny) this.fleeGoal = this.hiddenSpot(tgt);
        break;
      }
      case 'chase': {
        if (!tgt) { this.setState('lurk'); break; }
        if (this.st < 0.05) this.g.emitSound('hiss', this.pos, { vol: 1.2 });
        this.moveTo(tgt.pos.x, tgt.pos.z, 8.6, dt, { gy: tgt.pos.y });
        if (Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) < 1.4) { this.killAt = { x: tgt.pos.x, z: tgt.pos.z }; this.g.killPlayer(tgt.id, 'pale', this.id); this.setState('drag'); this.goal = this.randomGoal(15, 35); this.target = null; }
        if (this.st > 9) { this.anger = 0; this.stare = 0; this.fleeGoal = this.hiddenSpot(tgt); this.setState('flee'); }
        break;
      }
      case 'drag': {
        if (this.st < 1.4 && this.killAt) { this.turnTo(Math.atan2(this.killAt.x - this.pos.x, this.killAt.z - this.pos.z), 25, dt); this.speedNow = 0; break; }
        if (!this.goal) this.goal = this.randomGoal(15, 35);
        this.moveTo(this.goal.x, this.goal.z, 3.2, dt);
        if (this.st > 7) { this.cool = 25; this.anger = 0; this.stare = 0; this.setState('lurk'); }
        break;
      }
      default: this.setState('lurk');
    }
  }
  // The Sisters: blind, and drawn to light: a beam turned on one, a lamp carried past it, any light at all right up
  // against it. Noise only makes them turn their heads. Once one's drawn, the others near it come too, jerking along,
  // stopping, jerking on. Put the light out and keep still and they lose you, and stand where they stopped, twitching.
  // Close enough to touch, they find you anyway
  ai_sister(dt) {
    const fac = this.g.fac;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.2;
      const head = { x: this.pos.x, y: this.pos.y + 1.5, z: this.pos.z };
      let lit = null;
      for (const p of this.playersIn()) {
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z), lamp = this.g.carriesLight(p);
        if (d > 30 || Math.abs(p.pos.y - this.pos.y) > 3) continue;
        if ((p.flash && this.g.canSee(p, head, p.flash === 2 ? 30 : 21, 0.93)) || (lamp && d < 11 && fac.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z, true)) || (d < 1.7)) { lit = p; break; }
      }
      if (lit) {
        if (this.state !== 'drawn') {
          this.setState('drawn');
          // (and the rest of the ward with it)
          for (const o of this.g.monsters.values()) if (o !== this && o.type === 'sister' && !o.dead && o.state !== 'drawn' && Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 16) { o.target = lit.id; o.lastKnown = { x: lit.pos.x, z: lit.pos.z, y: lit.pos.y }; o.setState('drawn'); }
        }
        this.target = lit.id; this.lastKnown = { x: lit.pos.x, z: lit.pos.z, y: lit.pos.y }; this.lastLit = 0;
      }
    }
    this.lastLit = (this.lastLit || 0) + dt;
    switch (this.state) {
      case 'drawn': {
        const tgt = this.target != null ? this.g.players.get(this.target) : null;
        if (!tgt || !tgt.alive || tgt.zone !== 'in' || !this.lastKnown) { this.setState('stand'); this.target = null; break; }
        this.extra = tgt.id;
        // (jerking along: a lurch, a stop, a lurch)
        const go = Math.sin(this.st * 6.3 + this.id) > -0.35 ? 1 : 0.1;
        const rem = this.moveTo(this.lastKnown.x, this.lastKnown.z, 3.7 * go, dt, { gy: this.lastKnown.y });
        const d = Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z);
        if (d < 1.35 && Math.abs(tgt.pos.y - this.pos.y) < 1.5 && this.atk <= 0) {
          this.atk = 1.3; const n = Math.max(d, 0.3);
          this.g.emitSound('sister_slash', this.center(), { vol: 1 });
          this.g.hurtPlayer(tgt.id, 30, 'sister', (tgt.pos.x - this.pos.x) / n * 3, (tgt.pos.z - this.pos.z) / n * 3);
        }
        // lost the light: on to where it was last, then stand there
        if (this.lastLit > 1.5 && rem < 1) { this.setState('stand'); this.target = null; this.extra = -1; }
        if (this.lastLit > 14) { this.setState('stand'); this.target = null; this.extra = -1; }
        break;
      }
      default: {
        if (this.state !== 'stand') this.setState('stand');
        this.extra = -1;
        // now and then a few steps somewhere, slowly
        if (!this.goal && this.st > 10 + (this.id % 7) * 2) { this.goal = this.randomGoal(2, 8); this.st = 0; }
        if (this.goal) { if (this.moveTo(this.goal.x, this.goal.z, 0.8, dt) < 0.6 || this.st > 12) { this.goal = null; this.st = 0; } }
        else this.speedNow = 0;
      }
    }
  }
  // The Bound: lies still where it fell until someone's near enough to touch it, then gets up and comes for them,
  // lurching, swaying, retching up a caustic mist at whoever keeps out of its reach. Loses you, and it goes and lies
  // down again somewhere
  ai_bound(dt) {
    const fac = this.g.fac;
    this.cool -= dt;
    let tgt = this.target != null ? this.g.players.get(this.target) : null;
    if (tgt && (!tgt.alive || tgt.zone !== 'in')) { tgt = null; this.target = null; }
    switch (this.state) {
      case 'rise': {
        this.speedNow = 0;
        if (tgt) this.turnTo(Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), 2, dt);
        if (this.st > 1.5) this.setState(tgt ? 'lurch' : 'shamble');
        break;
      }
      case 'lurch': {
        if (!tgt) { this.setState('shamble'); this.goal = this.randomGoal(4, 14); break; }
        this.track(tgt, 18, -0.3, 5, 10, dt);
        if (this.memory <= 0) { this.target = null; this.extra = -1; this.setState('shamble'); this.goal = this.randomGoal(4, 14); break; }
        this.extra = tgt.id;
        const d = Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z);
        this.moveTo(this.lastKnown.x, this.lastKnown.z, 2.8 * (0.55 + 0.45 * Math.abs(Math.sin(this.st * 2.6))), dt, { gy: this.lastKnown.y, turn: 5 });
        if (d < 1.3 && Math.abs(tgt.pos.y - this.pos.y) < 1.5 && this.atk <= 0) {
          this.atk = 1.6; const n = Math.max(d, 0.3);
          this.g.emitSound('bound_slam', this.center(), { vol: 1 });
          this.g.hurtPlayer(tgt.id, 22, 'bound', (tgt.pos.x - this.pos.x) / n * 7, (tgt.pos.z - this.pos.z) / n * 7);
        }
        if (this.aware && d > 3 && d < 9 && this.cool <= 0 && fac.los(this.pos.x, this.pos.z, tgt.pos.x, tgt.pos.z)) { this.setState('spit'); this.spitAt = { x: tgt.pos.x, y: tgt.pos.y, z: tgt.pos.z }; this.spat = false; }
        break;
      }
      case 'spit': {
        this.speedNow = 0;
        this.turnTo(Math.atan2(this.spitAt.x - this.pos.x, this.spitAt.z - this.pos.z), 4, dt);
        if (this.st > 0.9 && !this.spat) {
          this.spat = true; this.cool = 6 + Math.random() * 3;
          const f = this.forward();
          this.g.emit({ e: 'mist', x: +this.spitAt.x.toFixed(2), y: +this.spitAt.y.toFixed(2), z: +this.spitAt.z.toFixed(2), fx: +(this.pos.x + f.x * 0.2).toFixed(2), fy: +(this.pos.y + 1.75).toFixed(2), fz: +(this.pos.z + f.z * 0.2).toFixed(2) });
        }
        if (this.st > 1.7) this.setState(tgt ? 'lurch' : 'shamble');
        break;
      }
      case 'shamble': {
        this.extra = -1;
        if (!this.goal) this.goal = this.randomGoal(5, 18);
        const p = this.detect(14, 0.1, 3);
        if (p) { this.target = p.id; this.memory = 10; this.lastKnown = { x: p.pos.x, z: p.pos.z, y: p.pos.y }; this.setState('lurch'); break; }
        if (this.moveTo(this.goal.x, this.goal.z, 1.3, dt) < 0.8 || this.st > 25) { this.goal = null; this.setState('lie'); }
        break;
      }
      default: {
        // lying there like a body
        if (this.state !== 'lie') this.setState('lie');
        this.speedNow = 0; this.extra = -1;
        const p = this.nearestPlayer(2.6);
        if (p && Math.abs(p.pos.y - this.pos.y) < 1.5) { this.target = p.id; this.memory = 10; this.lastKnown = { x: p.pos.x, z: p.pos.z, y: p.pos.y }; this.setState('rise'); this.g.emitSound('bound_rise', this.center(), { vol: 1.2 }); }
        else if (this.st > 60 + (this.id % 5) * 10) this.setState('shamble');
      }
    }
  }
  // The Executioner: no senses to speak of, and it needs none: it walks toward the nearest of you, wherever you are in
  // the building, never hurrying, never stopping; up close it lifts the blade (slowly: there's a moment to get out of
  // reach) and brings it down
  ai_executioner(dt) {
    const fac = this.g.fac;
    let tgt = null, bd = Infinity;
    for (const p of this.playersIn()) { const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) + Math.abs(p.pos.y - this.pos.y) * 6; if (d < bd) { bd = d; tgt = p; } }
    if (!tgt) { if (this.state !== 'swing') { this.setState('stand'); this.speedNow = 0; this.extra = -1; } }
    if (this.state === 'swing') {
      this.speedNow = 0;
      if (tgt && this.st < 1.05) this.turnTo(Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), 1.4, dt);
      if (this.st >= 1.05 && !this.struck) {
        this.struck = true;
        const f = this.forward(); let hit = false;
        for (const p of this.playersIn()) {
          const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
          if (d < 2.9 && Math.abs(p.pos.y - this.pos.y) < 1.6 && (dx * f.x + dz * f.z) / (d || 1) > 0.3) { this.g.killPlayer(p.id, 'executioner', this.id); hit = true; }
        }
        this.g.emitSound(hit ? 'blade_flesh' : 'blade_floor', new THREE.Vector3(this.pos.x + f.x * 2, this.pos.y + 0.2, this.pos.z + f.z * 2), { vol: 1.3, ref: 6 });
        this.g.addNoise(this.pos, 30, 'in', null);
      }
      if (this.st > 2.5) { this.struck = false; this.setState(tgt ? 'walk' : 'stand'); }
      return;
    }
    if (!tgt) return;
    if (this.state !== 'walk') this.setState('walk');
    this.extra = tgt.id;
    this.moveTo(tgt.pos.x, tgt.pos.z, 2.2, dt, { gy: tgt.pos.y, turn: 3 });
    const d = Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z);
    if (d < 2.3 && Math.abs(tgt.pos.y - this.pos.y) < 1.5 && fac.los(this.pos.x, this.pos.z, tgt.pos.x, tgt.pos.z)) { this.setState('swing'); this.g.emitSound('blade_lift', this.center(), { vol: 1.2, ref: 5 }); }
  }
  hiddenSpot(tgt) {
    const fac = this.g.fac;
    let best = null, bs = -Infinity;
    for (let t = 0; t < 14; t++) {
      const p = fac.randomWalkable(R0, (q) => { const d = Math.hypot(q.x - this.pos.x, q.z - this.pos.z); return d > 6 && d < 24; });
      if (!p) continue;
      const vis = tgt ? fac.los(tgt.pos.x, tgt.pos.z, p.x, p.z, true) : false;
      const s = (vis ? -100 : 0) + (tgt ? Math.hypot(p.x - tgt.pos.x, p.z - tgt.pos.z) : 0) - Math.hypot(p.x - this.pos.x, p.z - this.pos.z) * 0.3;
      if (s > bs) { bs = s; best = p; }
    }
    return best || this.randomGoal(6, 20);
  }
  ai_mannequin(dt) {
    let observed = false;
    const c = { x: this.pos.x, y: this.pos.y + 1.4, z: this.pos.z };
    for (const p of this.playersIn()) {
      const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
      if (d > 45) continue;
      if (this.g.canSee(p, c, 45, 0.5) && (d < 6 || this.g.isLit(c))) { observed = true; break; }
    }
    if (this.spawnT < 2.5) observed = true;
    if (observed) {
      if (!this.observed) this.speedNow = 0;
      this.observed = true; this.speedNow = 0; return;
    }
    if (this.observed) { this.extra = Math.floor(Math.random() * 1e6); }
    this.observed = false;
    let tgt = this.target != null ? this.g.players.get(this.target) : null;
    if (tgt && (!tgt.alive || tgt.zone !== 'in')) { tgt = null; this.target = null; }
    if (!tgt) { const p = this.detect(30, -1, 3); if (p) { tgt = p; this.target = p.id; this.memory = 12; this.lastKnown = { x: p.pos.x, z: p.pos.z, y: p.pos.y }; } }
    if (tgt) { this.track(tgt, 30, -1, 3, 12, dt); if (this.memory <= 0) { tgt = null; this.target = null; } }
    if (tgt) {
      this.setState('hunt');
      const rem = this.moveTo(this.lastKnown.x, this.lastKnown.z, 9.8, dt, { turn: 20, gy: this.lastKnown.y });
      if (!this.aware && rem < 1.2) this.memory -= dt * 3;
      if (Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) < 1.05) this.g.killPlayer(tgt.id, 'mannequin', this.id);
    } else {
      this.setState('roam');
      const n = this.hearNoise();
      if (n) { this.goal = { x: n.x, z: n.z }; this.st = 0; }
      if (!this.goal || this.st > 15) { this.goal = this.randomGoal(8, 30); this.st = 0; }
      if (this.moveTo(this.goal.x, this.goal.z, n ? 6 : 3.5, dt) < 1) this.goal = null;
    }
  }
  ai_leech(dt) {
    const fac = this.g.fac;
    const ceilY = () => fac.ceilY(this.pos.x, this.pos.z, this.pos.y - 3) - 0.18, floorY = () => fac.floorY(this.pos.x, this.pos.z, this.pos.y);
    switch (this.state) {
      case 'crawl': {
        if (!this.goal) {
          // somewhere along a low corridor ceiling on its own level (it never crawls down a stairwell)
          const lv = fac.levelAt(this.pos.x, this.pos.z, this.pos.y - 3);
          this.goal = this.randomGoal(5, 22, (p) => fac.grid[fac.idx(p.i, p.j)] === 1 && fac.ceilAt(p.x, p.z) <= 3.6 && fac.lvl[fac.idx(p.i, p.j)] === lv) || this.randomGoal(5, 20, (p) => fac.lvl[fac.idx(p.i, p.j)] === lv);
          this.st = 0;
        }
        const rem = this.moveTo(this.goal.x, this.goal.z, 1.6, dt);
        this.pos.y = ceilY();
        if (rem < 0.6 || this.st > 25) { this.setState('wait'); this.goal = null; }
        break;
      }
      case 'wait': {
        this.pos.y = ceilY(); this.speedNow = 0;
        for (const p of this.playersIn()) {
          if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.05) { this.victim = p.id; this.setState('drop'); this.g.emitSound('leech_drop', this.pos, { vol: 0.9 }); break; }
        }
        if (this.st > 70) this.setState('crawl');
        break;
      }
      case 'drop': {
        const v = this.g.players.get(this.victim);
        const targetY = v ? v.pos.y + 1.75 : floorY() + 0.2;
        this.pos.y = Math.max(targetY, this.pos.y - dt * 14);
        if (this.st > 0.3) {
          if (v && v.alive && v.zone === 'in' && Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z) < 1.4) {
            this.setState('attached'); this.grip = 100; this.extra = v.id; this.dmgAcc = 0;
            this.g.leechAttach(this, v.id);
          } else { this.setState('fallen'); this.pos.y = floorY(); }
        }
        break;
      }
      case 'attached': {
        const v = this.g.players.get(this.victim);
        if (!v || !v.alive || v.zone !== 'in') { this.detach(); break; }
        this.pos.set(v.pos.x, v.pos.y + 1.7, v.pos.z); this.ry = v.yaw + Math.PI;
        this.dmgAcc += dt * 9;
        if (this.dmgAcc >= 4.5) { this.g.hurtPlayer(v.id, Math.floor(this.dmgAcc), 'leech', 0, 0, true); this.dmgAcc -= Math.floor(this.dmgAcc); }
        if (this.grip <= 0) this.detach();
        break;
      }
      case 'fallen': {
        this.pos.y = floorY();
        if (!this.goal) this.goal = this.randomGoal(3, 10);
        this.moveTo(this.goal.x, this.goal.z, 2.4, dt);
        if (this.st > 4) { this.goal = null; this.setState('crawl'); this.pos.y = ceilY(); }
        break;
      }
      default: this.setState('crawl');
    }
  }
  detach() {
    if (this.state !== 'attached') return;
    const vid = this.victim;
    this.victim = null; this.extra = -1;
    this.setState('fallen'); this.pos.y = this.g.fac ? this.g.fac.floorY(this.pos.x, this.pos.z, this.pos.y) : this.pos.y; this.goal = null;
    this.g.leechDetach(this, vid);
  }
  ai_hound(dt) {
    this.scanT -= dt;
    const loud = () => {
      let best = null, bd = Infinity;
      for (const n of this.g.noises) {
        if (n.zone !== 'out' || n.age > 0.35) continue;
        const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
        if (d < n.r && d < bd) { bd = d; best = n; }
      }
      return best ? { n: best, d: bd } : null;
    };
    const bite = () => {
      if (this.atk > 0) return;
      for (const p of this.playersIn()) if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.6 && Math.abs(p.pos.y - this.pos.y) < 2) {
        const f = this.forward(); this.g.hurtPlayer(p.id, 60, 'hound', f.x * 6, f.z * 6); this.atk = 1.5;
        if (!p.alive) { this.setState('eat'); }
        return;
      }
    };
    const h = loud();
    if (h && this.state !== 'lunge' && this.state !== 'eat') {
      if (h.d < 9) { this.lunge = { x: h.n.x, z: h.n.z }; this.setState('lunge'); this.g.emitSound('hound_roar', this.pos, { vol: 1.4 }); }
      else if (this.state !== 'chase') { this.goal = { x: h.n.x, z: h.n.z }; if (this.state !== 'investigate') { this.setState('investigate'); this.g.emitSound('hound_growl', this.pos, { vol: 1.1 }); } }
      else this.goal = { x: h.n.x, z: h.n.z };
    }
    switch (this.state) {
      case 'wander': {
        if (!this.goal || this.st > 14) { this.goal = this.randomGoal(10, 40); this.st = 0; }
        if (this.stepToward(this.goal.x, this.goal.z, 2.2, dt, 2.5) < 1.5) this.goal = null;
        break;
      }
      case 'investigate': {
        if (!this.goal) { this.setState('wander'); break; }
        const rem = this.stepToward(this.goal.x, this.goal.z, 5.2, dt, 3);
        if (rem < 1.5) { this.goal = null; this.setState('sniff'); }
        if (this.st > 15) this.setState('wander');
        bite();
        break;
      }
      case 'sniff': { this.speedNow = 0; if (this.st > 3.5) this.setState('wander'); bite(); break; }
      case 'lunge': {
        const f = this.forward();
        this.turnTo(Math.atan2(this.lunge.x - this.pos.x, this.lunge.z - this.pos.z), 4, dt);
        const ox = this.pos.x, oz = this.pos.z;
        this.pos.x += f.x * 13 * dt; this.pos.z += f.z * 13 * dt; this.collide();
        this.speedNow = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
        bite();
        if (this.st > 0.75) { this.goal = { x: this.lunge.x, z: this.lunge.z }; this.setState('chase'); }
        break;
      }
      case 'chase': {
        if (!this.goal) { this.setState('wander'); break; }
        this.stepToward(this.goal.x, this.goal.z, 8.5, dt, 4);
        bite();
        if (this.st > 3) { this.setState('investigate'); }
        break;
      }
      case 'eat': { this.speedNow = 0; if (this.st > 6) this.setState('wander'); break; }
      default: this.setState('wander');
    }
    // stuck detection
    if (this.speedNow < 0.3 && (this.state === 'wander' || this.state === 'investigate')) { this.stuckT += dt; if (this.stuckT > 1.5) { this.goal = this.randomGoal(8, 20); this.stuckT = 0; } } else this.stuckT = 0;
  }
  // The Seep: it feels for crewmates through the floor (anyone near enough on its own level, through walls, or a noise
  // it picks up) and comes after them slowly, without ever stopping; with nobody about it creeps off down a corridor and
  // settles across it, a wall in the way, until something comes near. It never opens a door. At a shut one it seeps
  // through, under it or through the bars of its window, a little at a time, and gathers itself on the other side (all
  // at once if somebody opens the door on it). extra: who it's after, or while seeping the door's id plus how far through
  ai_slime(dt) {
    const fac = this.g.fac;
    if (this.state === 'seep') {
      const d = fac.doors[this.door];
      if (!d) { this.setState('creep'); this.extra = -1; return; }
      this.seepK = Math.min(1, this.seepK + dt / (d.open || d.broken ? 0.9 : d.pane === 'bars' ? 7 : 11));
      this.extra = d.id + Math.min(0.999, this.seepK); this.speedNow = 0;
      if (this.seepK >= 1) {
        const s = this.seepSide;
        this.pos.x = d.x + d.nx * s * 1.3; this.pos.z = d.z + d.nz * s * 1.3; this.pos.y = fac.floorY(this.pos.x, this.pos.z, d.y + 0.5);
        this.ry = Math.atan2(d.nx * s, d.nz * s); this.path = null; this.door = null; this.extra = -1;
        this.setState(this.target != null ? 'hunt' : 'creep');
      }
      this.engulf();
      return;
    }
    let tgt = this.target != null ? this.g.players.get(this.target) : null;
    if (tgt && (!tgt.alive || tgt.zone !== 'in' || Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) > 34)) { tgt = null; this.target = null; }
    if (!tgt) { const p = this.nearestPlayer(22); if (p && Math.abs(p.pos.y - this.pos.y) < 3) { tgt = p; this.target = p.id; } }
    this.doorAhead = null;
    if (tgt) {
      this.setState('hunt'); this.extra = tgt.id;
      this.moveTo(tgt.pos.x, tgt.pos.z, 1.25, dt, { doors: false, turn: 2.5, gy: tgt.pos.y });
    } else {
      this.extra = -1;
      const n = this.hearNoise(0.8);
      if (n) { this.goal = { x: n.x, z: n.z }; this.setState('creep'); }
      if (this.state === 'block') this.speedNow = 0;
      else {
        this.setState('creep');
        if (!this.goal || this.st > 45) { this.goal = this.randomGoal(8, 30, (p) => fac.grid[fac.idx(p.i, p.j)] === 1); this.st = 0; }
        if (this.moveTo(this.goal.x, this.goal.z, 0.8, dt, { doors: false, turn: 2 }) < 1) { this.goal = null; this.setState('block'); this.blockT = 35 + Math.random() * 55; }
      }
      if (this.state === 'block' && this.st > this.blockT) this.setState('creep');
    }
    // up against a shut door: through it, a little at a time
    const d = this.doorAhead;
    if (d && !d.open && !d.broken) {
      const along = (this.pos.x - d.x) * d.nx + (this.pos.z - d.z) * d.nz;
      if (Math.abs(along) < 1.6) {
        this.door = d.id; this.seepSide = -Math.sign(along) || 1; this.seepK = 0; this.setState('seep'); this.extra = d.id;
        this.g.emitSound('slime_seep', new THREE.Vector3(d.x, d.y + 0.3, d.z), { vol: 1.1, ref: 4 });
      }
    }
    this.engulf();
  }
  // whoever it reaches is shoved on ahead of it and burned; backed into a corner, swallowed
  engulf() {
    if (this.atk > 0) return;
    const f = this.forward(), sx = f.z, sz = -f.x;
    for (const p of this.playersIn()) {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, along = dx * f.x + dz * f.z, lat = dx * sx + dz * sz;
      if (Math.abs(p.pos.y - this.pos.y) > 2.5 || along < -0.95 || along > 1.25 || Math.abs(lat) > 1.45) continue;
      this.atk = 0.3;
      this.g.emitSound('slime_burn', p.pos, { vol: 1 });
      if (p.hp <= 9) this.g.killPlayer(p.id, 'slime', this.id);
      else this.g.hurtPlayer(p.id, 9, 'slime', f.x * 5, f.z * 5);
    }
  }
  onHit(dmg, fromPid) {
    if (this.dead) return;
    // (a blow just sinks into it: it shudders, and stops a moment)
    if (this.type === 'slime') { this.g.emitSound('squelch', this.center(), {}); this.stun = Math.max(this.stun, 0.8); return; }
    if (this.type === 'mannequin' || this.type === 'executioner') { this.g.emitSound('hit_metal', this.type === 'executioner' ? this.center() : this.pos, {}); return; }
    this.hp -= dmg;
    this.g.emitSound('hit_flesh', this.center(), {});
    if (this.type === 'leech' && this.state === 'attached') this.detach();
    if (this.hp <= 0) { this.setState('dead'); this.extra = -1; this.speedNow = 0; if (this.type === 'leech' && this.g.fac) this.pos.y = this.g.fac.floorY(this.pos.x, this.pos.z, this.pos.y); this.g.monsterDied(this); return; }
    this.stun = Math.max(this.stun, 0.35);
    if (fromPid == null || !this.g.players.has(fromPid)) return;
    if (this.type === 'crawler') { this.target = fromPid; this.extra = fromPid; this.setState('spot'); }
    if (this.type === 'pale') { this.anger += 2; this.target = fromPid; this.fleeGoal = this.hiddenSpot(this.g.players.get(fromPid)); this.setState(this.anger >= 4 ? 'chase' : 'flee'); }
    if (this.type === 'hound') { const p = this.g.players.get(fromPid); if (p) { this.lunge = { x: p.pos.x, z: p.pos.z }; this.setState('lunge'); } }
    if (this.type === 'sister' || this.type === 'bound') {
      const p = this.g.players.get(fromPid); this.target = fromPid; this.memory = 10; this.lastKnown = { x: p.pos.x, z: p.pos.z, y: p.pos.y }; this.lastLit = 0;
      this.setState(this.type === 'sister' ? 'drawn' : this.state === 'lie' ? 'rise' : 'lurch');
    }
  }
  serialize() { return [this.id, this.type, +this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2), +this.ry.toFixed(2), this.state, this.extra, this.stun > 0 ? 1 : 0]; }
  applySnap(a, now) {
    this.buf.push({ t: now, x: a[2], y: a[3], z: a[4], ry: a[5] });
    if (this.buf.length > 12) this.buf.shift();
    this.state = a[6]; this.extra = a[7]; this.stunned = a[8] === 1;
  }
  // ---------------- presentation (every peer) ----------------
  present(dt, isHost, now, localPlayer) {
    const prevX = this.rpos.x, prevZ = this.rpos.z, prevY = this.rpos.y;
    if (isHost) { this.rpos.copy(this.pos); this.rry = this.ry; this.stunned = this.stun > 0; }
    else if (this.buf.length) {
      const rt = now - 110;
      let a = this.buf[0], b = this.buf[this.buf.length - 1];
      for (let i = 0; i < this.buf.length - 1; i++) if (this.buf[i].t <= rt && this.buf[i + 1].t >= rt) { a = this.buf[i]; b = this.buf[i + 1]; break; }
      const t = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1) : 1;
      const tx = lerp(a.x, b.x, t), ty = lerp(a.y, b.y, t), tz = lerp(a.z, b.z, t);
      if (Math.hypot(tx - this.rpos.x, tz - this.rpos.z) > 6) this.rpos.set(tx, ty, tz); else this.rpos.set(tx, ty, tz);
      this.rry = a.ry + angDiff(a.ry, b.ry) * t;
    }
    const v = this.vis;
    const sp = Math.hypot(this.rpos.x - prevX, this.rpos.z - prevZ) / Math.max(dt, 1e-4);
    v.speed = damp(v.speed, Math.min(sp, 16), 10, dt);
    v.t += dt;
    this.mesh.position.copy(this.rpos);
    this.mesh.rotation.y = this.rry;
    if (v.lastState !== this.state) { this.onStateChange(v.lastState, this.state, localPlayer); v.lastState = this.state; v.sT = 0; } else v.sT = (v.sT || 0) + dt;
    if (this.dead) { v.deathT = (v.deathT || 0) + dt; v.tw = this.twitchK(); }
    this['anim_' + this.type](dt, v, localPlayer);
    if (this.dead) this.presentDeath(v);
    // footsteps
    v.stepAcc += Math.hypot(this.rpos.x - prevX, this.rpos.z - prevZ);
    const stride = { crawler: 1.1, pale: 1.4, mannequin: 0.5, leech: 99, hound: 1.6, sister: 0.55, bound: 0.8, executioner: 1.25 }[this.type];
    if (v.stepAcc > stride && v.speed > 0.4) {
      v.stepAcc = 0;
      const ln = localPlayer && Math.hypot(localPlayer.pos.x - this.rpos.x, localPlayer.pos.z - this.rpos.z);
      if (this.type === 'crawler') SFX.play('slap', this.rpos, { vol: 0.9 + v.speed * 0.06 });
      else if (this.type === 'pale') { if (v.speed > 3 || ln < 5) SFX.play('soft', this.rpos, { vol: v.speed > 5 ? 0.9 : 0.35 }); }
      else if (this.type === 'mannequin') SFX.play('ceramic', this.rpos, { vol: 1.1 });
      else if (this.type === 'hound') SFX.play('step', this.rpos, { surf: 'dirt', vol: 0.9, pitch: 0.6 });
      else if (this.type === 'sister') SFX.play('heel', this.rpos, { vol: 0.8 });
      else if (this.type === 'bound') SFX.play('soft', this.rpos, { vol: 0.7 });
      else if (this.type === 'executioner') { SFX.play('heavy_step', this.rpos, { vol: 1.3, ref: 5 }); if (localPlayer && Math.hypot(localPlayer.pos.x - this.rpos.x, localPlayer.pos.z - this.rpos.z) < 9) Player.addShake(0.08); }
    }
    // the Executioner's blade, dragging along the floor behind it the whole way, throwing sparks off the concrete
    if (this.type === 'executioner') {
      const P = this.P; P.tip.getWorldPosition(_sl);
      if (!this.glow && this.g.lightSources) { this.glow = { x: 0, y: 0, z: 0, color: 0xff8a3a, power: 0, state: 'on', zone: 'in', range: 4, lit: 1 }; this.g.lightSources.push(this.glow); }
      const drag = this.state === 'walk' && v.speed > 0.3;
      if (this.glow) { this.glow.x = _sl.x; this.glow.y = _sl.y + 0.15; this.glow.z = _sl.z; this.glow.power = drag && Math.random() < 0.35 ? 0.25 + Math.random() * 0.5 : 0; }
      v.dragT = (v.dragT || 0) - dt;
      if (drag && v.dragT <= 0) { v.dragT = 0.5 + Math.random() * 0.25; SFX.play('blade_drag', _sl.clone(), { vol: 1.1, ref: 5, rev: 0.8 }); }
    }
    // ambient creature sounds
    v.sfx -= dt;
    if (v.sfx <= 0 && !this.dead) {
      v.sfx = 4 + Math.random() * 7;
      const ln = localPlayer ? Math.hypot(localPlayer.pos.x - this.rpos.x, localPlayer.pos.z - this.rpos.z) : 99;
      if (this.type === 'crawler' && this.state !== 'charge') SFX.play('crawler_growl', this.center(), { vol: 0.8 });
      if (this.type === 'pale' && ln < 7 && this.extra === (localPlayer && localPlayer.id) && this.state === 'stalk') { SFX.play('breath', this.headPos(), { vol: 0.6, ref: 1 }); v.sfx = 3 + Math.random() * 3; }
      if (this.type === 'leech' && this.state === 'wait' && ln < 6) { SFX.play('chitter', this.rpos, { vol: 0.5 }); v.sfx = 2 + Math.random() * 3; }
      if (this.type === 'hound' && (this.state === 'wander' || this.state === 'sniff')) SFX.play(Math.random() < 0.5 ? 'sniff' : 'hound_growl', this.center(), { vol: 0.6 });
      if (this.type === 'sister') { SFX.play(Math.random() < 0.6 ? 'sister_twitch' : 'sister_breath', this.headPos(), { vol: 0.8, ref: 2.5 }); v.sfx = 2 + Math.random() * 4; }
      if (this.type === 'bound' && this.state !== 'lie') { SFX.play('bound_groan', this.headPos(), { vol: 0.9, ref: 3 }); v.sfx = 3 + Math.random() * 4; }
      if (this.type === 'bound' && this.state === 'lie' && ln < 6) { SFX.play('bound_breath', this.center(), { vol: 0.35, ref: 1.5 }); v.sfx = 5 + Math.random() * 6; }
      if (this.type === 'executioner') { SFX.play('hood_rattle', this.headPos(), { vol: 0.8, ref: 4 }); v.sfx = 3 + Math.random() * 4; }
    }
  }
  onStateChange(from, to, lp) {
    if (this.type === 'crawler' && to === 'spot') SFX.play('crawler_screech', this.center(), { vol: 1.5, ref: 3 });
    if (this.type === 'leech' && to === 'attached') SFX.play('squelch', this.rpos, { vol: 1 });
    if (this.type === 'slime' && to === 'hunt') SFX.play('slime_gurgle', this.center(), { vol: 1.3, ref: 5 });
    if (this.type === 'leech' && from === 'attached') SFX.play('chitter', this.rpos, { vol: 1 });
    if (this.type === 'sister' && to === 'drawn') SFX.play('sister_twitch', this.headPos(), { vol: 1.3, ref: 3 });
    if (this.type === 'bound' && to === 'spit') SFX.play('bound_retch', this.headPos(), { vol: 1.3, ref: 4 });
    if (to === 'dead') { SFX.play('crunch', this.center(), { vol: 0.9 }); this.onDeath(); }
  }
  // Dying, as everyone sees it: a last rattle, the body going down (falling, not snapping into a pose), a few
  // twitches that die away, the colour draining out of it, and a dark pool spreading out underneath.
  onDeath() {
    const v = this.vis; v.deathT = 0;
    SFX.play('death_rattle', this.center(), { vol: 1.1, pitch: { crawler: 0.85, pale: 1.25, hound: 0.65, leech: 1.9, sister: 1.4, bound: 0.75 }[this.type] || 1 });
    // its own copies of its materials, so only this one goes grey
    const seen = new Map(); this.deadMats = [];
    this.mesh.traverse((o) => {
      if (!o.isMesh || o.userData.scanMark || !o.material || !o.material.isMeshStandardMaterial) return;
      let c = seen.get(o.material);
      if (!c) { c = o.material.clone(); seen.set(o.material, c); this.deadMats.push({ m: c, col: c.color.clone(), em: c.emissive.clone() }); }
      o.material = c;
    });
    const inside = this.def.zone === 'in', grp = inside ? this.g.fac && this.g.fac.group : this.g.ext && this.g.ext.group;
    if (grp) {
      const r = { crawler: 1.6, pale: 1.2, hound: 1.85, leech: 0.7, sister: 1.0, bound: 1.3 }[this.type] || 1.2;
      const gy = inside ? this.g.fac.floorY(this.rpos.x, this.rpos.z, this.rpos.y + 0.5) : this.g.ext.height(this.rpos.x, this.rpos.z);
      this.pool = new THREE.Mesh(new THREE.CircleGeometry(r, 22), new THREE.MeshStandardMaterial({ map: TEX.get('puff'), color: this.type === 'leech' ? 0x26380c : 0x4a0707, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.12, metalness: 0.3 }));
      this.pool.rotation.set(-Math.PI / 2, 0, Math.random() * TAU); this.pool.position.set(this.rpos.x, gy + 0.012, this.rpos.z); this.pool.scale.setScalar(0.05);
      grp.add(this.pool);
    }
  }
  // 0..1 through the fall: it drops faster and faster, hits, and settles with a small bounce
  deadK() { const t = clamp((this.vis.deathT || 0) / 0.75, 0, 1); return t < 0.8 ? Math.pow(t / 0.8, 2) : 1 - Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.06; }
  // the nerves firing a few last times: sudden jerks, fewer and smaller, then nothing
  twitchK() { const v = this.vis, k = Math.exp(-(v.deathT || 0) * 1.3); if (Math.random() < 0.07 && v.deathT > 0.6) v.twk = (Math.random() - 0.5) * 1.4 * k; v.twk = (v.twk || 0) * 0.82; return v.twk; }
  presentDeath(v) {
    const t = v.deathT;
    if (this.deadMats && t < 4) { const k = sstep(0, 3.5, t); for (const d of this.deadMats) { d.m.color.copy(d.col).multiplyScalar(1 - 0.55 * k); d.m.emissive.copy(d.em).multiplyScalar(1 - k); } }
    if (this.pool && t < 9) {
      const b = this.P.body || this.P.hips || this.P.torso;
      if (b && t < 1.2) { b.getWorldPosition(_dp); this.pool.position.x = _dp.x; this.pool.position.z = _dp.z; }
      this.pool.scale.setScalar(0.05 + 0.95 * (1 - Math.exp(-t * 0.5)));
    }
  }
  anim_crawler(dt, v) {
    const P = this.P, t = v.t, s = v.speed;
    const g = Math.min(1, s / 6), ph = t * (4 + s * 1.3);
    P.body.position.y = 0.75 + Math.abs(Math.sin(ph)) * 0.12 * g + Math.sin(t * 2) * 0.02;
    const rear = this.state === 'spot' ? Math.min(1, (this.vis.t % 100) * 0 + 1) : 0;
    P.body.rotation.x = damp(P.body.rotation.x, this.dead ? 0 : this.state === 'spot' ? -0.55 : this.stunned ? 0.3 : g * 0.15, 8, dt);
    const sw = Math.sin(ph) * (0.25 + g * 0.9);
    P.fl.a.rotation.x = sw - 0.4; P.fr.a.rotation.x = -sw - 0.4; P.bl.a.rotation.x = -sw * 0.8 + 0.2; P.br.a.rotation.x = sw * 0.8 + 0.2;
    P.fl.b.rotation.x = -0.9 + Math.max(0, Math.cos(ph)) * 0.8; P.fr.b.rotation.x = -0.9 + Math.max(0, -Math.cos(ph)) * 0.8;
    P.bl.b.rotation.x = 0.6; P.br.b.rotation.x = 0.6;
    for (const L of [P.fl, P.bl]) L.a.rotation.z = -0.35; for (const L of [P.fr, P.br]) L.a.rotation.z = 0.35;
    const open = this.state === 'spot' || this.state === 'charge' ? 1.25 + Math.sin(t * 30) * 0.08 : 0.9 + Math.sin(t * 3) * 0.05;
    P.teeth.scale.setScalar(damp(P.teeth.scale.x, open, 10, dt));
    P.head.rotation.x = Math.sin(t * 1.3) * 0.08 + (this.state === 'spot' ? -0.3 : 0);
    P.head.rotation.z = Math.sin(t * 9.7) * 0.03 * (1 - g) + (Math.random() < 0.01 ? (Math.random() - 0.5) * 0.4 : 0);
    if (this.dead) {
      // it rolls over onto its back, legs curling up into the air like a dead insect's, the mouth gone slack
      const f = this.deadK(), tw = v.tw, th = Math.PI * f;
      P.body.position.y = lerp(0.75, 0.5, f); P.body.rotation.x = 0;
      const by = P.body.position.y * 1.0;
      this.mesh.rotation.z = th; this.mesh.position.y = this.rpos.y + (by + 0.34) * (1 - Math.cos(th)) / 2;
      for (const [L, s] of [[P.fl, -1], [P.fr, 1], [P.bl, -1], [P.br, 1]]) {
        L.a.rotation.x = lerp(L.a.rotation.x, -0.2 + tw * 0.8, f); L.a.rotation.z = lerp(L.a.rotation.z, s * 0.75, f);
        L.b.rotation.x = lerp(L.b.rotation.x, -1.7 - tw * 0.6, f);
      }
      P.head.rotation.set(0.35 * f + tw * 0.3, 0, 0.2 * f); P.teeth.scale.setScalar(1.12);
    }
  }
  anim_pale(dt, v, lp) {
    const P = this.P, t = v.t, s = v.speed;
    const ph = t * (2 + s * 1.2), g = Math.min(1, s / 3);
    const fleeing = this.state === 'flee' || this.state === 'chase';
    const hunch = this.state === 'chase' ? 0.55 : fleeing ? 0.75 : 0.35;
    P.torso.rotation.x = damp(P.torso.rotation.x, hunch, 4, dt);
    P.hips.position.y = 1.5 - (fleeing ? 0.3 : 0.06) + Math.abs(Math.sin(ph)) * 0.05 * g;
    const sw = Math.sin(ph) * 0.7 * g;
    P.ll.a.rotation.x = sw - (fleeing ? 0.4 : 0.1); P.lr.a.rotation.x = -sw - (fleeing ? 0.4 : 0.1);
    P.ll.b.rotation.x = 0.3 + Math.max(0, -Math.sin(ph)) * 1.2 * g + (fleeing ? 0.4 : 0);
    P.lr.b.rotation.x = 0.3 + Math.max(0, Math.sin(ph)) * 1.2 * g + (fleeing ? 0.4 : 0);
    const reach = this.state === 'chase' || this.state === 'drag' ? -1.3 : fleeing ? 0.6 : 0.05;
    P.al.a.rotation.x = damp(P.al.a.rotation.x, reach - sw * 0.3, 6, dt); P.ar.a.rotation.x = damp(P.ar.a.rotation.x, reach + sw * 0.3, 6, dt);
    P.al.a.rotation.z = -0.12; P.ar.a.rotation.z = 0.12;
    P.al.b.rotation.x = -0.2 - Math.sin(t * 0.7) * 0.1; P.ar.b.rotation.x = -0.25 + Math.sin(t * 0.8) * 0.1;
    // head tracks the local player when close, with twitches
    let look = 0;
    if (lp) { const dx = lp.pos.x - this.rpos.x, dz = lp.pos.z - this.rpos.z; look = clamp(angDiff(this.rry, Math.atan2(dx, dz)), -1.2, 1.2); }
    P.neck.rotation.x = -hunch * 0.6 + 0.2;
    P.head.rotation.y = damp(P.head.rotation.y, look, 5, dt);
    if (Math.random() < dt * 1.5) P.head.rotation.z = (Math.random() - 0.5) * 0.9; else P.head.rotation.z = damp(P.head.rotation.z, Math.sin(t * 0.5) * 0.2, 3, dt);
    P.mouth.scale.y = this.state === 'chase' || this.state === 'drag' ? 5.5 + Math.sin(t * 25) * 1.2 : 3.4;
    if (this.dead) {
      // it topples backwards like a felled tree, arms flung out, head lolling to one side
      const f = this.deadK(), tw = v.tw;
      this.mesh.rotation.x = -Math.PI / 2 * f; this.mesh.position.y = this.rpos.y + 0.2 * f;
      P.torso.rotation.x = lerp(P.torso.rotation.x, 0.05, f);
      P.al.a.rotation.set(lerp(P.al.a.rotation.x, -0.5 + tw, f), 0, -1.15 * f); P.ar.a.rotation.set(lerp(P.ar.a.rotation.x, -0.3 - tw * 0.6, f), 0, 1.25 * f);
      P.al.b.rotation.x = -0.5 * f; P.ar.b.rotation.x = -0.8 * f;
      P.ll.a.rotation.x = lerp(P.ll.a.rotation.x, 0.1, f); P.lr.a.rotation.x = lerp(P.lr.a.rotation.x, -0.25 + tw * 0.5, f); P.ll.b.rotation.x = 0.15 * f; P.lr.b.rotation.x = 0.5 * f;
      P.head.rotation.set(0, 0.5 * f, 0.7 * f + tw * 0.2); P.mouth.scale.y = 5;
    }
  }
  // a Sister: jerky, the limbs snapping from one pose to the next rather than moving through them; the head lolling
  // and wrenching round on its neck; the scalpel arm raised when it's after someone, and slashing when it's close
  anim_sister(dt, v) {
    const P = this.P, t = v.t, s = v.speed, drawn = this.state === 'drawn';
    const q = (x, n) => Math.round(x * n) / n;
    const ph = q(t * (2 + s * 1.5), 3), g = Math.min(1, s / 2.5), sw = Math.sin(ph * 2.6) * 0.55 * g;
    P.ll.a.rotation.x = sw; P.lr.a.rotation.x = -sw; P.ll.b.rotation.x = 0.1 + Math.max(0, -sw) * 0.9; P.lr.b.rotation.x = 0.1 + Math.max(0, sw) * 0.9;
    P.ll.a.rotation.z = 0.08; P.lr.a.rotation.z = -0.08;
    P.hips.position.y = 0.95 + Math.abs(Math.sin(ph * 2.6)) * 0.03 * g;
    P.torso.rotation.x = damp(P.torso.rotation.x, drawn ? 0.25 : 0.12, 5, dt);
    // twitches: now and then a joint snaps somewhere else and holds there
    if (Math.random() < dt * (drawn ? 4 : 1.4)) v.tw2 = { h: (Math.random() - 0.5) * 1.6, n: (Math.random() - 0.5) * 0.9, s: (Math.random() - 0.5) * 0.6, k: 1 };
    const T = v.tw2 || { h: 0, n: 0, s: 0, k: 0 }; T.k = Math.max(0, T.k - dt * 1.8);
    P.neck.rotation.set(0.25 + T.n * T.k, 0, 0.5 + Math.sin(t * 0.4) * 0.15 + T.h * T.k);
    P.head.rotation.set(Math.sin(t * 0.7) * 0.1, T.h * T.k * 0.6, 0.2);
    P.torso.rotation.z = T.s * T.k;
    const slash = drawn && v.sT % 1.3 < 0.3 && s < 1.5 ? Math.sin((v.sT % 1.3) / 0.3 * Math.PI) : 0;
    P.ar.a.rotation.x = damp(P.ar.a.rotation.x, drawn ? -1.9 + slash * 2.2 : -0.1 + sw * 0.2, 14, dt); P.ar.b.rotation.x = drawn ? -0.6 : -0.15;
    P.al.a.rotation.x = -sw * 0.3 + (drawn ? -0.4 : 0); P.al.b.rotation.x = -0.3; P.al.a.rotation.z = -0.1; P.ar.a.rotation.z = 0.15;
    if (this.dead) {
      // down on its knees, then forward onto its face
      const f = this.deadK(), tw = v.tw;
      this.mesh.rotation.x = Math.PI / 2 * f; this.mesh.position.y = this.rpos.y + 0.12 * f;
      P.ll.a.rotation.x = lerp(P.ll.a.rotation.x, -0.4, f); P.lr.a.rotation.x = lerp(P.lr.a.rotation.x, -0.2 + tw, f);
      P.ll.b.rotation.x = 1.2 * f; P.lr.b.rotation.x = 1.0 * f;
      P.al.a.rotation.set(-2.6 * f, 0, -0.3); P.ar.a.rotation.set(-2.4 * f + tw * 0.4, 0, 0.4); P.neck.rotation.set(0.6 * f, 0, 0.9 * f);
    }
  }
  // the Bound: lying flat on its back like a body; getting up all at once from the waist, as if pulled; lurching on
  // its wrong-bent legs, swaying from side to side; rearing back to retch, and pitching forward to spew it out
  anim_bound(dt, v) {
    const P = this.P, t = v.t, s = v.speed, st = this.state;
    const lie = st === 'lie' ? 1 : st === 'rise' ? 1 - sstep(0.1, 1.3, v.sT) : 0;
    v.lie = v.lie == null ? lie : damp(v.lie, lie, st === 'rise' ? 30 : 4, dt);
    this.mesh.rotation.x = -Math.PI / 2 * v.lie; this.mesh.position.y = this.rpos.y + 0.18 * v.lie;
    const g = Math.min(1, s / 2.5), ph = t * (2.2 + s * 1.6), sw = Math.sin(ph) * 0.6 * g;
    P.ll.a.rotation.x = sw * (1 - v.lie); P.lr.a.rotation.x = -sw * (1 - v.lie);
    P.ll.b.rotation.x = (-0.35 - Math.max(0, sw) * 0.6) * (1 - v.lie); P.lr.b.rotation.x = (-0.35 - Math.max(0, -sw) * 0.6) * (1 - v.lie);
    P.torso.rotation.z = Math.sin(ph * 0.5) * 0.25 * g + Math.sin(t * 0.8) * 0.04;
    const rear = st === 'spit' ? (v.sT < 0.9 ? -0.5 * sstep(0, 0.9, v.sT) : lerp(-0.5, 0.6, sstep(0.9, 1.05, v.sT)) * (1 - sstep(1.2, 1.7, v.sT))) : 0;
    P.torso.rotation.x = damp(P.torso.rotation.x, rear + (st === 'lurch' ? 0.12 : 0) + (st === 'lie' ? Math.sin(t * 0.6) * 0.01 : 0), 12, dt);
    P.mouth.scale.setScalar(st === 'spit' && v.sT > 0.8 && v.sT < 1.3 ? 1.5 : 1 + Math.sin(t * 3) * 0.05);
    if (this.dead) {
      const f = this.deadK(), tw = v.tw;
      this.mesh.rotation.x = -Math.PI / 2 * Math.max(f, v.lie); this.mesh.position.y = this.rpos.y + 0.18 * f;
      P.ll.a.rotation.x = 0.2 * f + tw * 0.5; P.lr.a.rotation.x = -0.3 * f; P.ll.b.rotation.x = -0.6 * f; P.lr.b.rotation.x = -0.2 * f;
      P.torso.rotation.set(0, 0, 0.3 * f + tw * 0.2);
    }
  }
  // the Executioner: a slow heavy walk, the blade hung from its right fist trailing along the floor; lifting it back
  // and up over its shoulder (slowly), and bringing it down all at once
  anim_executioner(dt, v) {
    const P = this.P, t = v.t, s = v.speed;
    const g = Math.min(1, s / 2), ph = t * (1.6 + s * 0.9), sw = Math.sin(ph) * 0.45 * g;
    P.ll.a.rotation.x = sw; P.lr.a.rotation.x = -sw; P.ll.b.rotation.x = 0.1 + Math.max(0, -Math.sin(ph)) * 0.6 * g; P.lr.b.rotation.x = 0.1 + Math.max(0, Math.sin(ph)) * 0.6 * g;
    P.hips.position.y = 1.25 - Math.abs(Math.cos(ph)) * 0.05 * g;
    P.hips.rotation.z = Math.sin(ph) * 0.05 * g;
    P.torso.rotation.y = Math.sin(ph) * 0.08 * g;
    P.neck.rotation.x = 0.25 + Math.sin(t * 0.5) * 0.04;
    P.al.a.rotation.set(-sw * 0.6, 0, -0.15); P.al.b.rotation.x = -0.25;
    let ax, bx, bl;
    if (this.state === 'swing') {
      const u = v.sT;
      // up and back over the shoulder, held there, then down
      const up = sstep(0, 0.95, u), down = sstep(1.0, 1.2, u), back = 1 - sstep(1.6, 2.4, u);
      ax = lerp(lerp(0.25, -2.9, up), 0.6, down) * back + 0.25 * (1 - back);
      bx = lerp(-0.4, -0.2, up); bl = lerp(lerp(0.35, -0.6, up), 1.3, down) * back + 0.35 * (1 - back);
      P.torso.rotation.x = lerp(-0.15 * up, 0.35, down) * back;
    } else { ax = 0.25 + sw * 0.2; bx = -0.1; bl = 0.35 + Math.sin(t * 7) * 0.01 * g; P.torso.rotation.x = damp(P.torso.rotation.x, 0.08, 4, dt); }
    P.ar.a.rotation.set(ax, 0, 0.12); P.ar.b.rotation.x = bx;
    // (the blade's pitch: its tip down on the floor behind, while it drags)
    P.blade.rotation.x = bl + 2.3;
  }
  anim_mannequin(dt, v) {
    const P = this.P;
    if (this.dead) return;
    if (v.speed > 0.6) {
      const ph = v.t * 18;
      P.torso.rotation.x = 0.35; P.al.a.rotation.x = -1.4; P.ar.a.rotation.x = -1.5; P.al.b.rotation.x = 0; P.ar.b.rotation.x = 0;
      P.ll.a.rotation.x = Math.sin(ph) * 0.9; P.lr.a.rotation.x = -Math.sin(ph) * 0.9; P.ll.b.rotation.x = 0.6; P.lr.b.rotation.x = 0.6;
      P.head.rotation.set(-0.3, 0, Math.sin(v.t * 40) * 0.2);
      v.pose = -1;
      return;
    }
    if (v.pose !== this.extra) {
      v.pose = this.extra;
      const r = new RNG(this.extra + 7);
      P.head.rotation.set(r.range(-0.6, 0.5), r.range(-0.9, 0.9), r.range(-1.0, 1.0));
      const reachy = r.chance(0.6);
      P.al.a.rotation.set(reachy ? r.range(-1.7, -1.1) : r.range(-0.4, 0.4), 0, r.range(-0.5, 0.1));
      P.ar.a.rotation.set(reachy ? r.range(-1.8, -1.0) : r.range(-2.8, 0.3), 0, r.range(-0.1, 0.6));
      P.al.b.rotation.x = r.range(-1.2, 0); P.ar.b.rotation.x = r.range(-1.2, 0);
      P.torso.rotation.set(r.range(-0.1, 0.4), r.range(-0.4, 0.4), r.range(-0.2, 0.2));
      P.ll.a.rotation.x = r.range(-0.5, 0.3); P.lr.a.rotation.x = r.range(-0.5, 0.3);
      P.ll.b.rotation.x = r.range(0, 0.5); P.lr.b.rotation.x = r.range(0, 0.5);
      P.neck.rotation.z = r.range(-0.3, 0.3);
    }
  }
  anim_leech(dt, v, lp) {
    const P = this.P, t = v.t;
    const onCeil = this.state === 'crawl' || this.state === 'wait';
    this.mesh.rotation.x = damp(this.mesh.rotation.x, onCeil ? Math.PI : this.state === 'attached' ? 1.2 : 0, 10, dt);
    this.mesh.rotation.z = onCeil ? 0 : 0;
    P.segs.forEach((s, i) => { s.position.x = Math.sin(t * 6 + i * 0.9) * 0.03 * (v.speed > 0.2 || this.state === 'attached' ? 1.5 : 0.3); s.scale.y = 0.75 + Math.sin(t * 3 + i) * 0.05; });
    P.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 14 + i * 1.7) * (v.speed > 0.2 || this.state === 'attached' ? 0.5 : 0.08); });
    P.mouth.rotation.z += dt * (this.state === 'attached' ? 6 : 1);
    P.strands.forEach((s, i) => { s.rotation.x = Math.sin(t * 1.3 + i * 2.1) * 0.25; s.rotation.z = Math.cos(t * 1.1 + i) * 0.25; });
    // local victim does not see the leech model (screen overlay instead)
    this.mesh.visible = !(this.state === 'attached' && lp && this.extra === lp.id && lp.alive);
    if (this.dead) {
      // on its back on the floor, curling up, its legs folding in
      const f = this.deadK();
      this.mesh.rotation.x = Math.PI * f; this.mesh.position.y = this.rpos.y + 0.12 * f;
      P.segs.forEach((s, i) => { s.position.x = 0; s.scale.y = lerp(0.75, 0.55, f); s.position.y = Math.sin((i / 6) * Math.PI) * 0.07 * f; });
      P.legs.forEach((l, i) => { l.rotation.x = 1.3 * f + v.tw * (i % 2 ? 1 : -1); });
    }
  }
  // The Seep, as everyone sees it: a jelly filling the corridor from wall to wall and up to the ceiling (squeezing down
  // to the size of a doorway to go through an open one), heaving all over and wobbling as it gets going or stops. At a
  // shut door the body this side drains away into it while a sheet of it slides under (or a rope of it pours through
  // the window's bars and drips down the far side) and a mound gathers on the other side, swelling into the whole of it.
  // Those it has swallowed hang inside it, turning slowly; it can't take them through a door, and leaves them there
  anim_slime(dt, v, lp) {
    const P = this.P, fac = this.g.fac; if (!fac) return;
    const U = P.U; U.uT.value = performance.now() / 1000;
    const moving = v.speed > 0.15;
    // (the jelly wobbles when it sets off or stops: a spring that's kicked by every change in its speed)
    v.jv = (v.jv || 0) + ((v.speed - (v.lastSp || 0)) * 2.2 - (v.jy || 0) * 38 - (v.jv || 0) * 3.2) * dt; v.jy = (v.jy || 0) + v.jv * dt; v.lastSp = v.speed;
    const jig = clamp(v.jy, -0.12, 0.12);
    U.uHeave.value = damp(U.uHeave.value, this.state === 'hunt' ? 1.6 : moving ? 1.25 : 0.8, 2, dt);
    const H = clamp(fac.ceilAt(this.rpos.x, this.rpos.z) - 0.06, 2.2, 3.4), W0 = 2.74, D0 = 1.7, DW = Facility.DW, DH = Facility.DH;
    // the nearest doorway, looked for now and then
    if ((v.doorT = (v.doorT || 0) - dt) <= 0) {
      v.doorT = 0.25; v.nd = null; let bd = 2.4;
      for (const d of fac.doors) { if (Math.abs(d.y - this.rpos.y) > 2) continue; const dd = Math.hypot(d.x - this.rpos.x, d.z - this.rpos.z); if (dd < bd) { bd = dd; v.nd = d; } }
    }
    const seepD = this.state === 'seep' && this.extra >= 0 ? fac.doors[Math.floor(this.extra)] : null;
    for (const k of ['sheet', 'stream', 'drip', 'far']) P[k].visible = false;
    if (!seepD) {
      let w = W0, h = H;
      if (v.nd && !v.nd.broken) { const nd = v.nd, dn = Math.abs((this.rpos.x - nd.x) * nd.nx + (this.rpos.z - nd.z) * nd.nz), k = sstep(0.3, 1.9, dn); w = lerp(DW - 0.12, W0, k); h = lerp(DH - 0.04, H, k); }
      const s = P.body.scale;
      P.body.position.set(0, 0, 0); P.body.rotation.y = 0;
      s.set(damp(s.x, w, 5, dt) * (1 - jig * 0.5), damp(s.y, h, 5, dt) * (1 + jig), D0 * (1 - jig * 0.6));
      v.seepFrom = null;
    } else {
      // through a shut door: k how far, the far side's direction (fx, fz) the way it's going
      const d = seepD, k = this.extra - Math.floor(this.extra);
      if (!v.seepFrom) v.seepFrom = Math.sign((d.x - this.rpos.x) * d.nx + (d.z - this.rpos.z) * d.nz) || 1;
      const s = v.seepFrom, fx = d.nx * s, fz = d.nz * s, bars = d.pane === 'bars', yaw = Math.atan2(fx, fz) - this.rry;
      this.mesh.updateMatrixWorld(true);
      const place = (o, x, y, z, sx, sy, sz) => { o.position.copy(this.mesh.worldToLocal(_sl.set(x, y, z))); o.rotation.set(0, yaw, 0); o.scale.set(sx, sy, sz); o.visible = true; };
      const nearD = Math.max(0.1, D0 * (1 - k)), farD = Math.max(0.1, D0 * k);
      place(P.body, d.x - fx * (0.08 + nearD / 2), d.y, d.z - fz * (0.08 + nearD / 2), W0 * (1 - 0.3 * k), H * (1 - 0.75 * k), nearD);
      place(P.far, d.x + fx * (0.08 + farD / 2), d.y, d.z + fz * (0.08 + farD / 2), lerp(0.7, W0, k), H * Math.pow(k, 0.75) + 0.04, farD);
      const flow = sstep(0.01, 0.06, k) * (1 - sstep(0.94, 1, k));
      if (flow > 0) {
        if (bars) {
          const py = (Pane.y0 + Pane.y1) / 2;
          place(P.stream, d.x, d.y + py, d.z, Pane.W * 0.8, 0.22 * flow, 0.5);
          place(P.drip, d.x + fx * 0.32, d.y, d.z + fz * 0.32, 0.24 * flow, py, 0.18);
        } else place(P.sheet, d.x, d.y, d.z, DW - 0.25, 0.05 * flow + 0.01, 0.62);
      }
    }
    // light: the jelly gathers whatever light falls on it (a flashlight on it, a lamp near it) and throws it back round
    // the corridor in its own colour, glowing through; in the dark, only the faintest glow of its own
    const mat = P.body.material, cen = this.center();
    if ((v.litT = (v.litT || 0) - dt) <= 0) { v.litT = 0.2; v.litTo = this.g.isLit(cen) ? 1 : 0; }
    v.lit = damp(v.lit || 0, v.litTo || 0, 3, dt);
    if (!this.glow && this.g.lightSources) { this.glow = { x: 0, y: 0, z: 0, color: 0, power: 0.15, state: 'on', zone: 'in', range: 9, lit: 1 }; this.g.lightSources.push(this.glow); }
    if (this.glow) { const g = this.glow; g.x = cen.x; g.y = cen.y; g.z = cen.z; g.color = mat.color.getHex(); g.power = 0.12 + 0.8 * v.lit; }
    mat.emissive.copy(mat.color).multiplyScalar(0.14 + 0.6 * v.lit);
    // a glossy wet trail where it's been, a sheet across the floor in its colour, faintly aglow like the rest of it (so
    // in the dark you can see where it's gone), slowly drying away
    const tm = Monster.trailMat || (Monster.trailMat = new THREE.MeshStandardMaterial({ map: TEX.get('puff'), roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const tg = Monster.trailGeo || (Monster.trailGeo = new THREE.CircleGeometry(0.5, 16));
    v.trailAcc = (v.trailAcc || 0) + (v.tx != null ? Math.hypot(this.rpos.x - v.tx, this.rpos.z - v.tz) : 0); v.tx = this.rpos.x; v.tz = this.rpos.z;
    if (v.trailAcc > 0.7 && !seepD && fac.group) {
      v.trailAcc = 0;
      const m = tm.clone(); m.color.copy(mat.color); m.emissive.copy(mat.color).multiplyScalar(0.22);
      const patch = new THREE.Mesh(tg, m), fy = fac.floorY(this.rpos.x, this.rpos.z, this.rpos.y + 0.5);
      patch.rotation.set(-Math.PI / 2, 0, -this.rry); patch.scale.set(P.body.scale.x * 0.92, 1.5, 1); patch.position.set(this.rpos.x, fy + 0.012, this.rpos.z);
      fac.group.add(patch); (this.trail || (this.trail = [])).push({ o: patch, t: 0 });
      if (this.trail.length > 70) { const old = this.trail.shift(); old.o.parent && old.o.parent.remove(old.o); old.o.material.dispose(); }
    }
    if (this.trail) for (const tp of this.trail) { tp.t += dt; tp.o.material.opacity = 0.6 * (1 - sstep(40, 130, tp.t)); }
    // what it's taken: drawn in from where they fell, then held inside, turning, carried along; left at a door
    if (this.swallowed && this.swallowed.length) {
      this.mesh.updateMatrixWorld(true);
      for (let i = this.swallowed.length - 1; i >= 0; i--) {
        const b = this.swallowed[i];
        if (seepD) { const fy = fac.floorY(b.body.root.position.x, b.body.root.position.z, b.body.root.position.y + 0.5); b.body.root.position.y = fy; b.body.root.rotation.x = 0; b.body.root.rotation.z = 0; this.swallowed.splice(i, 1); continue; }
        b.k = Math.min(1, b.k + dt / 1.6);
        const to = this.mesh.localToWorld(_sl.set(b.lx, b.ly, 0)), r = b.body.root;
        r.position.lerp(to, b.k < 1 ? sstep(0, 1, b.k) * 0.15 : 0.2);
        b.spin += dt * 0.12; r.rotation.set(0.35 * Math.sin(b.spin * 0.7) + b.tilt * sstep(0, 1, b.k), b.yaw + b.spin, 0.25 * Math.cos(b.spin));
      }
    }
    // its sounds: a wet slither as it moves, a gurgle now and then, a thin trickle all the while it's coming through
    if ((v.slosh = (v.slosh || 0) - dt) <= 0) {
      v.slosh = seepD ? 0.7 + Math.random() * 0.5 : 1.1 + Math.random() * 0.8;
      const ln = lp ? Math.hypot(lp.pos.x - this.rpos.x, lp.pos.z - this.rpos.z) : 99;
      if (seepD) SFX.play('slime_drip', _sl2.set(seepD.x, seepD.y + 0.2, seepD.z), { vol: 0.9, ref: 3 });
      else if (moving) SFX.play('slime_slosh', this.center(), { vol: 1, ref: 4 });
      else if (ln < 18 && Math.random() < 0.35) SFX.play('slime_gurgle', this.center(), { vol: 0.8, ref: 4 });
    }
  }
  anim_hound(dt, v) {
    const P = this.P, t = v.t, s = v.speed;
    const g = Math.min(1, s / 8), ph = t * (3 + s * 1.1);
    P.body.position.y = 1.15 - (this.state === 'sniff' || this.state === 'investigate' ? 0.15 : 0) + Math.abs(Math.sin(ph)) * 0.12 * g;
    const sw = Math.sin(ph) * (0.2 + g * 0.8);
    P.fl.a.rotation.x = sw; P.fr.a.rotation.x = -sw; P.bl.a.rotation.x = -sw * 0.9 + 0.3; P.br.a.rotation.x = sw * 0.9 + 0.3;
    P.fl.b.rotation.x = -0.3 - Math.max(0, Math.cos(ph)) * 0.7; P.fr.b.rotation.x = -0.3 - Math.max(0, -Math.cos(ph)) * 0.7;
    P.bl.b.rotation.x = -0.9; P.br.b.rotation.x = -0.9;
    const roar = this.state === 'lunge' || this.state === 'chase' || this.state === 'eat';
    P.jawL.rotation.x = damp(P.jawL.rotation.x, roar ? 0.9 + Math.sin(t * 20) * 0.1 : 0.08 + Math.sin(t * 2) * 0.05, 10, dt);
    P.jawU.rotation.x = damp(P.jawU.rotation.x, roar ? -0.35 : 0, 10, dt);
    P.neck.rotation.x = this.state === 'sniff' ? 0.4 + Math.sin(t * 6) * 0.15 : this.state === 'eat' ? 0.8 : 0;
    P.neck.rotation.y = Math.sin(t * 0.9) * 0.3 * (1 - g);
    P.tail.rotation.y = Math.sin(t * 2) * 0.3;
    if (this.dead) {
      // it keels over onto its side, legs locked straight, jaw hanging open, tail limp
      const f = this.deadK(), tw = v.tw;
      this.mesh.rotation.z = Math.PI / 2 * f; this.mesh.position.y = this.rpos.y + 0.36 * f;
      for (const L of [P.fl, P.fr, P.bl, P.br]) { L.a.rotation.x = lerp(L.a.rotation.x, 0.25 + tw * 0.7, f); L.b.rotation.x = lerp(L.b.rotation.x, -0.12, f); }
      P.jawL.rotation.x = 0.55; P.jawU.rotation.x = -0.1; P.neck.rotation.set(0.25 * f, 0, 0); P.tail.rotation.y = 0.2;
    }
  }
}
