'use strict';
// Creatures: procedural models, host-side AI, client-side animation + sound.
const MON_DEFS = {
  crawler: { name: 'Crawler', hp: 4, zone: 'in', power: 2, radius: 0.6, height: 1.0 },
  pale: { name: 'The Pale', hp: 3, zone: 'in', power: 3, radius: 0.4, height: 2.3 },
  mannequin: { name: 'Mannequin', hp: 9999, zone: 'in', power: 2, radius: 0.35, height: 1.7 },
  leech: { name: 'Ceiling Leech', hp: 2, zone: 'in', power: 1, radius: 0.3, height: 0.3 },
  hound: { name: 'Hollow Hound', hp: 5, zone: 'out', power: 2, radius: 0.7, height: 1.2 },
};
const BESTIARY = {
  crawler: 'Low, eyeless, mostly mouth. Once it notices you it charges in a straight line and is terrible at corners. It cannot stop quickly. Four solid hits will put it down. Closed doors buy you a second.',
  pale: 'Tall. Patient. It follows from behind and hates being watched. Glance at it and it slinks away. Stare, and it stops being patient. If your light flickers and you feel watched, turn around.',
  mannequin: 'Only moves when nobody is looking. In the dark, looking does not count: keep a light on it and back away. Invulnerable. Bring a friend to watch it while you leave.',
  leech: 'Clings to ceilings above corridors and drops onto the head of whoever passes beneath. Suffocates its host. Look up. Mash [E] to tear it off, or have a crewmate hit it with a shovel.',
  hound: 'Roams the surface after dark. Completely blind; hunts by sound alone. Walk, crouch, keep quiet. They will follow you into the ship if the hatch is open.',
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
  };
  return { build(type) { const g = B[type](); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } }); return g; } };
})();

const _dp = new THREE.Vector3();
class Monster {
  constructor(game, id, type, x, y, z) {
    this.g = game; this.id = id; this.type = type; this.def = MON_DEFS[type];
    this.pos = new THREE.Vector3(x, y, z); this.ry = Math.random() * TAU;
    this.state = type === 'leech' ? 'crawl' : type === 'hound' ? 'wander' : type === 'pale' ? 'lurk' : 'roam';
    this.st = 0; this.hp = this.def.hp; this.extra = -1;
    this.target = null; this.goal = null; this.path = null; this.pathT = 0; this.pathGoal = null;
    this.stun = 0; this.atk = 0; this.anger = 0; this.stare = 0; this.seenCd = 0; this.speedNow = 0; this.grip = 100; this.dmgAcc = 0;
    this.scanT = Math.random(); this.stuckT = 0; this.spawnT = 0; this.cool = 0; this.lastSeenT = 0; this.observed = false;
    // presentation
    this.mesh = MonModels.build(type); this.P = this.mesh.userData.parts;
    this.mesh.position.copy(this.pos);
    this.rpos = this.pos.clone(); this.rry = this.ry; this.buf = []; this.vis = { speed: 0, stepAcc: 0, t: Math.random() * 10, sfx: 2 + Math.random() * 4, lastState: this.state, pose: -999 };
    if (type === 'mannequin') this.extra = Math.floor(Math.random() * 1e6);
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
      const door = fac.closedDoorBetween(ci, cj, ti, tj);
      if (door && Math.hypot(door.x - this.pos.x, door.z - this.pos.z) < 1.8) this.g.monsterOpenDoor(this, door);
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
      if (dot > cone && (!this.g.fac || this.def.zone !== 'in' || this.g.fac.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z))) return true;
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
        if ((dot > 0.15 || d < 5) && fac.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) return p;
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
        const sees = fac.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
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
  hiddenSpot(tgt) {
    const fac = this.g.fac;
    let best = null, bs = -Infinity;
    for (let t = 0; t < 14; t++) {
      const p = fac.randomWalkable(R0, (q) => { const d = Math.hypot(q.x - this.pos.x, q.z - this.pos.z); return d > 6 && d < 24; });
      if (!p) continue;
      const vis = tgt ? fac.los(tgt.pos.x, tgt.pos.z, p.x, p.z) : false;
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
  onHit(dmg, fromPid) {
    if (this.dead) return;
    if (this.type === 'mannequin') { this.g.emitSound('hit_metal', this.pos, {}); return; }
    this.hp -= dmg;
    this.g.emitSound('hit_flesh', this.center(), {});
    if (this.type === 'leech' && this.state === 'attached') this.detach();
    if (this.hp <= 0) { this.setState('dead'); this.extra = -1; this.speedNow = 0; if (this.type === 'leech' && this.g.fac) this.pos.y = this.g.fac.floorY(this.pos.x, this.pos.z, this.pos.y); this.g.monsterDied(this); return; }
    this.stun = Math.max(this.stun, 0.35);
    if (fromPid == null || !this.g.players.has(fromPid)) return;
    if (this.type === 'crawler') { this.target = fromPid; this.extra = fromPid; this.setState('spot'); }
    if (this.type === 'pale') { this.anger += 2; this.target = fromPid; this.fleeGoal = this.hiddenSpot(this.g.players.get(fromPid)); this.setState(this.anger >= 4 ? 'chase' : 'flee'); }
    if (this.type === 'hound') { const p = this.g.players.get(fromPid); if (p) { this.lunge = { x: p.pos.x, z: p.pos.z }; this.setState('lunge'); } }
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
    if (v.lastState !== this.state) { this.onStateChange(v.lastState, this.state, localPlayer); v.lastState = this.state; }
    if (this.dead) { v.deathT = (v.deathT || 0) + dt; v.tw = this.twitchK(); }
    this['anim_' + this.type](dt, v, localPlayer);
    if (this.dead) this.presentDeath(v);
    // footsteps
    v.stepAcc += Math.hypot(this.rpos.x - prevX, this.rpos.z - prevZ);
    const stride = { crawler: 1.1, pale: 1.4, mannequin: 0.5, leech: 99, hound: 1.6 }[this.type];
    if (v.stepAcc > stride && v.speed > 0.4) {
      v.stepAcc = 0;
      const ln = localPlayer && Math.hypot(localPlayer.pos.x - this.rpos.x, localPlayer.pos.z - this.rpos.z);
      if (this.type === 'crawler') SFX.play('slap', this.rpos, { vol: 0.9 + v.speed * 0.06 });
      else if (this.type === 'pale') { if (v.speed > 3 || ln < 5) SFX.play('soft', this.rpos, { vol: v.speed > 5 ? 0.9 : 0.35 }); }
      else if (this.type === 'mannequin') SFX.play('ceramic', this.rpos, { vol: 1.1 });
      else if (this.type === 'hound') SFX.play('step', this.rpos, { surf: 'dirt', vol: 0.9, pitch: 0.6 });
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
    }
  }
  onStateChange(from, to, lp) {
    if (this.type === 'crawler' && to === 'spot') SFX.play('crawler_screech', this.center(), { vol: 1.5, ref: 3 });
    if (this.type === 'leech' && to === 'attached') SFX.play('squelch', this.rpos, { vol: 1 });
    if (this.type === 'leech' && from === 'attached') SFX.play('chitter', this.rpos, { vol: 1 });
    if (to === 'dead') { SFX.play('crunch', this.center(), { vol: 0.9 }); this.onDeath(); }
  }
  // Dying, as everyone sees it: a last rattle, the body going down (falling, not snapping into a pose), a few
  // twitches that die away, the colour draining out of it, and a dark pool spreading out underneath.
  onDeath() {
    const v = this.vis; v.deathT = 0;
    SFX.play('death_rattle', this.center(), { vol: 1.1, pitch: { crawler: 0.85, pale: 1.25, hound: 0.65, leech: 1.9 }[this.type] || 1 });
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
      const r = { crawler: 1.6, pale: 1.2, hound: 1.85, leech: 0.7 }[this.type] || 1.2;
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
