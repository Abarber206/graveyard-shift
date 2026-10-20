'use strict';
// Creatures: procedural models, host-side AI, client-side animation + sound.
const MON_DEFS = {
  // (doors: false: it has nothing to work a handle with, and a shut door stops it: see moveTo)
  crawler: { name: 'Crawler', hp: 4, zone: 'in', power: 2, radius: 0.6, height: 1.0, doors: false },
  pale: { name: 'The Pale', hp: 3, zone: 'in', power: 3, radius: 0.4, height: 2.3 },
  mannequin: { name: 'Mannequin', hp: 9999, zone: 'in', power: 2, radius: 0.35, height: 1.7 },
  leech: { name: 'Ceiling Leech', hp: 2, zone: 'in', power: 1, radius: 0.3, height: 0.3, doors: false },
  // (they come a few at a time: swarm, so a handful of them counts as one thing against the site's cap; see hostSpawnInterior)
  roach: { name: 'Roaches', hp: 1, zone: 'in', power: 0.5, radius: 0.18, height: 0.15, doors: false, swarm: true },
  hound: { name: 'Hollow Hound', hp: 5, zone: 'out', power: 2, radius: 0.7, height: 1.2 },
  // (its body fills a corridor; what it steers by is a small core, so it can squeeze through any doorway)
  slime: { name: 'The Seep', hp: 9999, zone: 'in', power: 3, radius: 0.55, height: 2.8 },
  sister: { name: 'The Sisters', hp: 3, zone: 'in', power: 2, radius: 0.32, height: 1.75, radio: true },
  bound: { name: 'The Bound', hp: 4, zone: 'in', power: 2, radius: 0.36, height: 1.8, radio: true },
  // (never one of a site's own: what the core's alarm brings up from below; see G.hostCoreTaken)
  executioner: { name: 'The Executioner', hp: 9999, zone: 'in', power: 4, radius: 0.55, height: 2.6, radio: true },
  // (like the Seep: what it steers by is a small core; its body is a box as wide as a corridor, see Monster.push)
  clown: { name: 'The Clown', hp: 9999, zone: 'in', power: 4, radius: 0.55, height: 2.9, radio: true },
};
const BESTIARY = {
  clown: 'Too big for the building. It walks the lower floors bent double under the ceiling, a shoulder to each wall, and there is no getting past it in a corridor. It has to fold itself through every doorway, slowly. It is slower than you are, and it does not need to be fast: it hears you through the floors, it knows the short way round, and it gets to the corridor you need before you do. Listen for the shoes, the giggle, the music box. In a room you can get round it. Do not let it walk you into a room with one door.',
  crawler: 'Low, eyeless, mostly mouth. It feels movement and hears footsteps: keep still and it may pass you by. Once it notices you it screams, and others come. It charges in a straight line at where you are going and is terrible at corners. It cannot stop quickly. Four solid hits will put it down. It cannot work a door: shut one behind you and it stays shut. Slam one in its face and it hits it full tilt and is left reeling.',
  pale: 'Tall. Patient. It follows from behind and hates being watched, if it can see you looking: in the dark, more than a few steps off, it cannot. Glance at it and it slinks away. Stare at it, or keep looking round at it, and it stops being patient; leave it be a while and it settles again. If your light flickers and you feel watched, turn around.',
  mannequin: 'Only moves when nobody is looking. In the dark, looking does not count: keep a light on it and back away. Invulnerable. Bring a friend to watch it while you leave.',
  leech: 'Clings to ceilings above corridors and doorways, where people pass, and drops onto the head of whoever passes beneath. It moves to where it hears footsteps. Suffocates its host. Look up. Mash [E] to tear it off, or have a crewmate hit it with a shovel. It cannot open a door: it goes round, or waits by one for somebody to open it.',
  roach: 'Roaches the size of a boot, two or three together. They scuttle about in fits and starts, a dash and a dead stop, feelers going. They hear footsteps and feel anyone moving near them, and come at you in a rush along the floor, quicker than you walk but not as quick as you run; one bites at your ankles and is off again, round and back for another. They cannot stand light: put a beam on them and they scatter for the dark. They cannot work a door. One blow kills one.',
  hound: 'Roams the surface after dark. Completely blind; hunts by sound, and close to, by smell: do not stand still next to one, move away quietly. Walk, crouch, keep quiet. One that howls is calling the others. They will follow you into the ship if the hatch is open.',
  sister: 'They come in twos and threes, in what is left of their uniforms. Blind: they go for light. Turn a flashlight on one, or carry a lit lamp past it, and the whole ward comes for you, jerking and stopping and jerking on. Kill the light and keep still and they lose you; they will stand where they stopped, twitching, a long time. Three hits.',
  bound: 'Looks like a body. Lies on the floor like one, in a corridor, in a doorway, round a corner, where people pass; it hears you coming and lies down in your way. It gets up when you are close enough to touch it. No arms, no face, and a hole at the top it retches through: keep out of the mist, it eats through a suit. Slow, but it does not give up easily. Four hits. Walk wide round anything lying down.',
  executioner: 'Nobody has a body cam recording of it from the front. Pulling a core sets off the alarm, and sometimes the alarm brings it up from below: a great figure in an iron hood, dragging a blade longer than you are. You will hear it before you see it. It does not run, it does not stop, and nothing we have so much as marks it. When it lifts the blade, get out of reach. Then get out of the building.',
  slime: 'A wall of slime as wide as the corridor and as high as the ceiling. Slow, but it never stops, and nothing we have hurts it. It feels your footsteps through the floor. Left alone it settles across a corridor you use and waits. Shut a door on it: it cannot open doors, but it will seep under one, or through a barred window, a little at a time, and gather itself again on your side. Touching it burns. Do not let it back you into a dead end.',
};

const MonModels = (() => {
  const mc = {};
  const M = (k, f) => mc[k] || (mc[k] = f());
  // A creature's skin: its texture looked up three ways round in each part's own space, at so many sheets a metre (s),
  // so it's the same grain on a finger as on a back, never stretched along a limb or pinched into rings at the top of a
  // round part, and it moves with the part; with relief read off its own tones (b: how deep), as MATS.wear does
  function tri(m, s = 2.5, b = 1) {
    const U = { uTriS: { value: s }, uTriB: { value: b } };
    m.userData.tri = [s, b];
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vTriP; varying vec3 vTriN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 triS = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
        vTriP = position * triS; vTriN = normal / triS;`);
      sh.fragmentShader = 'uniform float uTriS, uTriB; varying vec3 vTriP; varying vec3 vTriN;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec3 tq = vTriP * uTriS, tw = pow(abs(normalize(vTriN)), vec3(4.0)); tw /= tw.x + tw.y + tw.z;
          vec4 triC = texture2D(map, tq.zy) * tw.x + texture2D(map, tq.xz + 0.37) * tw.y + texture2D(map, tq.xy + 0.71) * tw.z;
          diffuseColor *= triC;
          float triH = dot(triC.rgb, vec3(0.3333));`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec3 sp = -vViewPosition, dx = dFdx(sp), dy = dFdy(sp); float hx = dFdx(triH) * uTriB * 0.003, hy = dFdy(triH) * uTriB * 0.003;
            vec3 r1 = cross(dy, normal), r2 = cross(normal, dx); float dd = dot(dx, r1);
            normal = normalize(abs(dd) * normal - sign(dd) * (hx * r1 + hy * r2)); }`);
    };
    m.customProgramCacheKey = () => 'monTri';
    return m;
  }
  // (a copy of one, for a body going grey, keeps it: three doesn't copy onBeforeCompile)
  const retri = (c, m) => (m.userData.tri ? tri(c, m.userData.tri[0], m.userData.tri[1]) : c);
  const S = (o, s, b) => tri(new THREE.MeshStandardMaterial(o), s, b);
  const mats = {
    pale: () => M('pale', () => S({ map: TEX.get('flesh'), color: 0xa8a092, roughness: 0.6, emissive: 0x050403 }, 3, 1)),
    void: () => M('void', () => new THREE.MeshBasicMaterial({ color: 0x000000 })),
    crawl: () => M('crawl', () => new THREE.MeshStandardMaterial({ map: TEX.get('darkflesh'), color: 0x9a8a84, roughness: 0.3, metalness: 0.1 })),
    tooth: () => M('tooth', () => new THREE.MeshStandardMaterial({ color: 0xd8d0b0, roughness: 0.4 })),
    gum: () => M('gum', () => new THREE.MeshStandardMaterial({ color: 0x3a0a0c, roughness: 0.3 })),
    porc: () => M('porcm', () => S({ map: TEX.get('porcelain'), color: 0xa89f92, roughness: 0.32, metalness: 0.05 }, 2, 0.6)),
    joint: () => M('joint', () => new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.5 })),
    leech: () => M('leech', () => new THREE.MeshStandardMaterial({ map: TEX.get('darkflesh'), color: 0xb09090, roughness: 0.18, metalness: 0.1 })),
    // a roach's: a glossy chestnut shell, wing cases a shade paler, the legs and belly near black
    roach: () => M('roach', () => S({ map: TEX.get('darkflesh'), color: 0x7a4422, roughness: 0.2, metalness: 0.25 }, 7, 0.5)),
    roachWing: () => M('roachWing', () => S({ map: TEX.get('darkflesh'), color: 0x9a5a2a, roughness: 0.16, metalness: 0.25 }, 5, 0.4)),
    roachLeg: () => M('roachLeg', () => new THREE.MeshStandardMaterial({ color: 0x24140a, roughness: 0.35, metalness: 0.15 })),
    hound: () => M('hound', () => new THREE.MeshStandardMaterial({ map: TEX.get('darkflesh'), color: 0x6a5450, roughness: 0.6 })),
    leg: () => M('leg', () => new THREE.MeshStandardMaterial({ color: 0x1c1614, roughness: 0.6 })),
    sinew: () => M('sinew', () => S({ map: TEX.get('flesh'), color: 0x7a5a52, roughness: 0.45 }, 4, 1)),
    claw: () => M('claw', () => new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.35, metalness: 0.1 })),
    sisSkin: () => M('sisSkin', () => S({ map: TEX.get('flesh'), color: 0x948884, roughness: 0.55 }, 3, 1)),
    smock: () => M('smock', () => S({ map: TEX.get('suitWorn'), color: 0xa89c88, roughness: 0.85, side: THREE.DoubleSide }, 1.6, 0.8)),
    dressing: () => M('dressing', () => S({ map: TEX.get('tape'), color: 0xd0c0a0, roughness: 0.9 }, 3, 1)),
    scalpel: () => M('scalpel', () => S({ map: TEX.get('rust'), color: 0xb0a090, roughness: 0.35, metalness: 0.75 }, 6, 0.5)),
    bound: () => M('bound', () => new THREE.MeshStandardMaterial({ map: TEX.get('darkflesh'), color: 0x9a7a6c, roughness: 0.3, metalness: 0.05 })),
    iron: () => M('iron', () => S({ map: TEX.get('rust'), color: 0x9a7a62, roughness: 0.8, metalness: 0.5 }, 1.6, 2)),
    apron: () => M('apron', () => S({ map: TEX.get('suitWorn'), color: 0x4a3a32, roughness: 0.75, side: THREE.DoubleSide }, 1.4, 1)),
    // the Clown's: a faded polka-dot suit, striped trousers, chalk-white greasepaint gone to crazing, glossy red (nose,
    // shoes, grin), grimy gloves and ruff, rust-orange hair, a little wooden music box
    clownSuit: () => M('clownSuit', () => S({ map: TEX.get('clownDots'), color: 0x958a72, roughness: 0.9, side: THREE.DoubleSide }, 1.4, 0.8)),
    clownPants: () => M('clownPants', () => S({ map: TEX.get('clownStripe'), color: 0x9a8e80, roughness: 0.9 }, 1.6, 0.8)),
    paint: () => M('paint', () => S({ map: TEX.get('greasepaint'), color: 0xc8c2b4, roughness: 0.55 }, 4, 1.2)),
    clownRed: () => M('clownRed', () => new THREE.MeshStandardMaterial({ color: 0x6a120e, roughness: 0.3, metalness: 0.05 })),
    glove: () => M('glove', () => S({ map: TEX.get('tape'), color: 0xa8a090, roughness: 0.8 }, 3, 0.6)),
    ruff: () => M('ruff', () => S({ map: TEX.get('tape'), color: 0xc0b48a, roughness: 0.9, side: THREE.DoubleSide }, 3, 0.5)),
    hair: () => M('hair', () => new THREE.MeshStandardMaterial({ color: 0x9a4a1a, roughness: 0.9 })),
    glint: () => M('glint', () => new THREE.MeshBasicMaterial({ color: 0xffe0a0 })),
    boxWood: () => M('boxWood', () => S({ map: TEX.get('wood'), color: 0x8a6a4a, roughness: 0.7 }, 3, 1)),
    deadSkin: () => M('deadSkin', () => S({ map: TEX.get('flesh'), color: 0x8a8278, roughness: 0.6 }, 2.2, 1.2)),
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
  // (a round part of a long body: its poles fore and aft, so a banded skin's bands ring the body like ribs instead of
  // closing into a bullseye on its back)
  const sphZ = (r, s) => sph(r, s).rotateX(Math.PI / 2);
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
      const torso = mk(sphZ(0.5, 14), mats.crawl(), P.body); torso.scale.set(0.95, 0.6, 1.5);
      for (let i = 0; i < 7; i++) mk(new THREE.ConeGeometry(0.05, 0.22, 5), mats.tooth(), P.body, 0, 0.3 - Math.abs(i - 3) * 0.02, -0.6 + i * 0.2, -0.3);
      P.head = grp(P.body, 0, 0.05, 0.75);
      const hd = mk(sphZ(0.32, 14), mats.crawl(), P.head, 0, 0, 0.12); hd.scale.set(1, 0.85, 1.1);
      mk(new THREE.CircleGeometry(0.22, 18), mats.gum(), P.head, 0, 0, 0.47);
      mk(new THREE.CircleGeometry(0.12, 14), mats.void(), P.head, 0, 0, 0.475);
      P.teeth = teethRing(P.head, 0.2, 16, 0.12); P.teeth.position.z = 0.46;
      P.teeth2 = teethRing(P.head, 0.13, 10, 0.08); P.teeth2.position.z = 0.43;
      P.fl = limb(P.body, -0.45, 0.05, 0.45, 0.08, 0.44, 0.06, 0.42, mats.crawl());
      P.fr = limb(P.body, 0.45, 0.05, 0.45, 0.08, 0.44, 0.06, 0.42, mats.crawl());
      P.bl = limb(P.body, -0.4, -0.05, -0.55, 0.09, 0.4, 0.07, 0.43, mats.crawl());
      P.br = limb(P.body, 0.4, -0.05, -0.55, 0.09, 0.4, 0.07, 0.43, mats.crawl());
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
      P.hips = grp(root, 0, 0.875, 0);
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
    // A roach as long as a boot: the shield over its head, the two wing cases down its back (parted a little at the
    // tail), the ribbed belly showing under them, six spined legs splayed wide (the hind pair longest), feelers longer
    // than it is and the two little prongs at its tail. Facing +z, its belly a few fingers off the floor
    roach() {
      const root = new THREE.Group(), P = {}, sh = mats.roach(), wing = mats.roachWing(), dk = mats.roachLeg();
      P.body = grp(root, 0, 0.075, 0);
      mk(sphZ(0.1, 14), dk, P.body, 0, -0.012, -0.05).scale.set(0.92, 0.34, 1.75);
      // (the ridges where its belly plates meet, round the underside and up its flanks)
      for (const [z, r] of [[-0.08, 0.086], [-0.12, 0.08], [-0.16, 0.068], [-0.2, 0.045]]) mk(new THREE.TorusGeometry(r, 0.005, 4, 14, Math.PI), dk, P.body, 0, -0.012, z, 0, 0, Math.PI).scale.set(1, 0.37, 1);
      for (const s of [-1, 1]) mk(sphZ(0.1, 14), wing, P.body, s * 0.043, 0.012, -0.075, 0, s * 0.05, s * 0.06).scale.set(0.6, 0.24, 2.0);
      mk(sphZ(0.1, 14), sh, P.body, 0, 0.018, 0.14).scale.set(1.08, 0.3, 0.72);
      P.head = grp(P.body, 0, -0.01, 0.21);
      mk(sph(0.042, 10), sh, P.head).scale.set(1.1, 0.8, 0.9);
      for (const s of [-1, 1]) {
        mk(sph(0.016, 8), mats.void(), P.head, s * 0.036, 0.006, 0.012).scale.set(0.7, 1.2, 0.8);
        mk(cap(0.005, 0.035, 5), dk, P.head, s * 0.014, -0.03, 0.03, 0.6, 0, s * 0.2);
      }
      // (the feelers: two lengths each, so they can sweep and whip)
      P.ant = [-1, 1].map((s) => {
        const a = grp(P.head, s * 0.02, 0.012, 0.03);
        mk(new THREE.CylinderGeometry(0.0035, 0.005, 0.16, 5).rotateX(Math.PI / 2).translate(0, 0, 0.08), dk, a);
        const b = grp(a, 0, 0, 0.16);
        mk(new THREE.CylinderGeometry(0.0015, 0.0035, 0.22, 4).rotateX(Math.PI / 2).translate(0, 0, 0.11), dk, b);
        return { a, b, s };
      });
      for (const s of [-1, 1]) mk(new THREE.ConeGeometry(0.008, 0.06, 5), dk, P.body, s * 0.03, 0, -0.25, -Math.PI / 2 + 0.2, 0, -s * 0.25);
      // the legs: hip out and up to the knee, then the shin down and out to the floor; each pair's knee bent so its foot
      // just meets the floor, the front pair reaching forward and the hind pair back
      const hy = P.body.position.y - 0.012, TH = 1.85;
      P.legs = [];
      [[0.1, 0.7, 0.07, 0.09], [0.03, -0.05, 0.08, 0.11], [-0.05, -0.75, 0.1, 0.15]].forEach(([z, fw, l1, l2], row) => {
        for (const s of [-1, 1]) {
          const L = limb(P.body, s * 0.05, -0.012, z, 0.011, l1, 0.007, l2, dk);
          for (let k = 0; k < 3; k++) mk(new THREE.ConeGeometry(0.003, 0.026, 3), dk, L.b, 0, -l2 * (0.3 + k * 0.22), 0, 0, 0, -s * 2.05);
          L.s = s; L.fw = fw; L.th = TH; L.kn = TH - Math.acos(clamp((hy - l1 * Math.cos(TH)) / l2, 0, 1));
          // (tripod gait: front and hind on one side with the middle on the other)
          L.ph = (row === 1 ? s > 0 : s < 0) ? 0 : Math.PI;
          P.legs.push(L);
        }
      });
      root.userData.parts = P; return root;
    },
    // A fat, glistening grub as long as an arm, built as a chain: each of its segments hangs off the one before (P.joints,
    // head first), so the whole body can bend: snake as it scuttles, coil, arch, and curl over an edge with its head
    // already round the corner and its tail still on the ceiling. A pair of jointed legs on each segment but the first
    // and the last (P.legs: hip, knee), a blind round mouth ringed with hooked teeth (P.mouth), two feelers, and strands
    // of slime hanging off it. Its head is its origin: it leads with its mouth
    leech() {
      const root = new THREE.Group(), P = {}, m = mats.leech(), gum = mats.gum(), lm = mats.leg(), tooth = mats.tooth();
      P.body = grp(root);
      P.body.scale.setScalar(1.35);
      const rs = [0.1, 0.14, 0.17, 0.185, 0.19, 0.18, 0.165, 0.14, 0.11, 0.075], L = 0.1;
      P.joints = []; P.segs = []; P.legs = []; P.strands = [];
      let parent = P.body;
      rs.forEach((r, i) => {
        const j = grp(parent, 0, 0, i ? -L : 0); P.joints.push(j); parent = j;
        const sg = mk(sphZ(r, 10), m, j, 0, 0, -L * 0.45); sg.scale.set(1.12, 0.7, 0.78); P.segs.push(sg);
        // (the soft dark fold between it and the next)
        if (i < rs.length - 1) mk(new THREE.CylinderGeometry(r * 0.86, rs[i + 1] * 0.86, L * 0.4, 9), gum, j, 0, -r * 0.08, -L * 0.95, Math.PI / 2).scale.set(1.08, 1, 0.66);
        if (i > 0 && i < rs.length - 1) for (const sd of [-1, 1]) {
          const hip = grp(j, sd * r * 0.92, -r * 0.3, -L * 0.45), knee = grp(hip, sd * 0.12, 0.05, 0);
          mk(new THREE.CylinderGeometry(0.008, 0.013, 0.13, 5), lm, hip, sd * 0.06, 0.025, 0, 0, 0, -sd * 1.17);
          mk(new THREE.CylinderGeometry(0.004, 0.009, 0.18, 5), lm, knee, sd * 0.025, -0.085, 0, 0, 0, sd * 0.3);
          P.legs.push({ hip, knee, sd, i });
        }
        if (i % 2 === 1 && i < 9) { const st = grp(j, (i % 4 === 1 ? -1 : 1) * r * 0.4, r * 0.55, -L * 0.4), l = 0.2 + (i % 3) * 0.14; mk(new THREE.CylinderGeometry(0.004, 0.012, l, 4), gum, st, 0, l / 2, 0); P.strands.push(st); }
      });
      // the mouth: a ring of hooked teeth round a wet dark hole, and two feelers over it
      P.mouth = grp(P.joints[0], 0, 0, 0.07);
      mk(new THREE.CircleGeometry(0.06, 12), gum, P.mouth, 0, 0, -0.005);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, tg = grp(P.mouth, Math.cos(a) * 0.065, Math.sin(a) * 0.065, 0); tg.rotation.z = a; mk(new THREE.ConeGeometry(0.012, 0.08, 4), tooth, tg, 0, 0, 0.03, Math.PI / 2 - 0.5, 0, 0); }
      P.feelers = [];
      for (const sd of [-1, 1]) { const f = grp(P.joints[0], sd * 0.05, 0.07, 0.02); mk(new THREE.CylinderGeometry(0.003, 0.007, 0.24, 4), lm, f, 0, 0.1, 0.06, 0.6, 0, 0); P.feelers.push(f); }
      root.userData.parts = P; return root;
    },
    // A starved, eyeless thing the size of a pony: a deep ribcage with the ribs standing out under the skin, a pinched
    // waist, heavy haunches, bony plates down the spine; a long blind skull with a heavy brow and flared nostrils over
    // tapered jaws crowded with teeth; long legs on clawed paws; a whip of a tail.
    hound() {
      const root = new THREE.Group(), P = {};
      const m = mats.hound(), sin = mats.sinew(), bone = mats.claw(), gum = mats.gum(), tooth = mats.tooth();
      P.body = grp(root, 0, 1.15, 0);
      mk(sphZ(0.4, 18), m, P.body, 0, 0.02, 0.3).scale.set(0.8, 0.98, 1.08);
      const waist = mk(cap(0.2, 0.42, 12), m, P.body, 0, 0.04, -0.12, Math.PI / 2); waist.scale.set(1, 1, 0.82);
      mk(sphZ(0.32, 16), m, P.body, 0, 0.03, -0.5).scale.set(0.98, 0.92, 1.0);
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
      mk(sphZ(0.18, 16), m, P.head, 0, 0.06, 0.0).scale.set(0.88, 0.78, 1.3);
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
      mk(new THREE.CylinderGeometry(0.17, 0.26, 0.42, 12, 1, true), cloth, P.hips, 0, -0.16, 0);
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
      const skirt = mk(new THREE.CylinderGeometry(0.3, 0.4, 1.15, 12, 1, true), apron, P.hips, 0, -0.52, 0); skirt.scale.set(1.1, 1, 0.85);
      mk(new THREE.TorusGeometry(0.3, 0.035, 5, 14), dark, P.hips, 0, 0.04, 0, Math.PI / 2).scale.set(1.1, 0.85, 1);
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
      P.blade.scale.setScalar(1.2);
      root.userData.parts = P; return root;
    },
    // The Clown: huge cracked red shoes, baggy striped trousers, a barrel of a body in a faded polka-dot suit with
    // pom-pom buttons, a filthy ruff drooping on one side, a chalk-white face with sunk eyes under painted black
    // diamonds that have run, a red grin smeared far wider than the dark slit of its mouth, a cracked red nose, rust-
    // orange tufts over its ears, a battered little hat; long arms in baggy sleeves ending in big grimy gloves; a bulb
    // horn on its belt and a wooden music box hung round its neck, its crank turning by itself
    clown() {
      const root = new THREE.Group(), P = {};
      const suit = mats.clownSuit(), pants = mats.clownPants(), paint = mats.paint(), red = mats.clownRed(), glove = mats.glove(), dark = mats.joint(), vd = mats.void(), hair = mats.hair(), ruff = mats.ruff();
      P.hips = grp(root, 0, 1.55, 0);
      mk(sph(0.42, 14), pants, P.hips).scale.set(1.35, 0.8, 1.05);
      const leg = (x) => {
        const L = limb(P.hips, x, -0.1, 0, 0.17, 0.72, 0.15, 0.72, pants);
        mk(sph(0.19, 10), pants, L.b).scale.set(1, 0.8, 1);
        const shoe = grp(L.end, 0, -0.04, 0.12);
        mk(sph(0.2, 12), red, shoe, 0, 0.04, 0.24).scale.set(1.05, 0.72, 1.5);
        mk(sph(0.16, 10), red, shoe, 0, 0.05, -0.06).scale.set(0.9, 0.8, 1.1);
        mk(sph(0.07, 8), mats.boxWood(), shoe, 0.08, 0.1, 0.3).scale.set(1, 0.4, 1.2);
        mk(new THREE.BoxGeometry(0.3, 0.05, 0.86), dark, shoe, 0, -0.08, 0.1);
        L.flap = mk(new THREE.BoxGeometry(0.28, 0.03, 0.3), dark, shoe, 0, -0.1, 0.4);
        return L;
      };
      P.ll = leg(-0.32); P.lr = leg(0.32);
      P.torso = grp(P.hips, 0, 0.1, 0);
      mk(lumpy(0.55, 23, 0.06, 18), suit, P.torso, 0, 0.55, 0).scale.set(1.5, 1.2, 1.1);
      for (let i = 0; i < 3; i++) mk(sph(0.06, 8), red, P.torso, 0, 0.3 + i * 0.28, 0.6 - Math.abs(i - 1) * 0.05);
      mk(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4), dark, P.torso, 0.1, 0.92, 0.48, 0.5, 0, 0.25);
      P.box = grp(P.torso, 0.16, 0.64, 0.66);
      mk(new THREE.BoxGeometry(0.22, 0.15, 0.13), mats.boxWood(), P.box);
      P.crank = grp(P.box, 0.12, 0, 0); mk(new THREE.BoxGeometry(0.02, 0.11, 0.02), dark, P.crank, 0, 0.045, 0);
      P.ruff = grp(P.torso, 0, 1.16, 0);
      for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU, droop = 0.15 + 0.35 * Math.max(0, Math.cos(a - 0.8)), g = grp(P.ruff); g.rotation.y = a; mk(new THREE.ConeGeometry(0.09, 0.36, 4), ruff, g, 0.32, -droop * 0.2, 0, 0, 0, -Math.PI / 2 - droop); }
      P.neck = grp(P.torso, 0, 1.2, 0.02);
      mk(cap(0.12, 0.14, 8), paint, P.neck, 0, 0.06, 0);
      P.head = grp(P.neck, 0, 0.32, 0.04);
      mk(sph(0.34, 18), paint, P.head).scale.set(1, 1.15, 0.95);
      for (const s of [-1, 1]) {
        mk(sph(0.09, 10), vd, P.head, s * 0.12, 0.08, 0.26).scale.set(1, 1.25, 0.6);
        mk(sph(0.012, 6), mats.glint(), P.head, s * 0.12, 0.07, 0.3);
        mk(new THREE.BoxGeometry(0.11, 0.11, 0.01), vd, P.head, s * 0.12, 0.08, 0.3, 0, 0, Math.PI / 4).scale.set(1, 1.8, 1);
        mk(new THREE.BoxGeometry(0.012, 0.13, 0.01), vd, P.head, s * 0.12 + 0.012, -0.05, 0.29);
        for (let k = 0; k < 4; k++) mk(new THREE.ConeGeometry(0.065, 0.26, 5), hair, P.head, s * (0.3 + k * 0.025), 0.14 - k * 0.06, -0.04 + k * 0.03, 0, 0, s * (-1.15 - k * 0.15));
      }
      mk(sph(0.085, 12), red, P.head, 0, -0.02, 0.36);
      mk(new THREE.TorusGeometry(0.085, 0.006, 4, 16), dark, P.head, 0, -0.02, 0.36, 0.3, 0.6, 0);
      mk(new THREE.TorusGeometry(0.2, 0.035, 6, 18, Math.PI * 0.9), red, P.head, 0, -0.04, 0.25, 0, 0, Math.PI * 1.05).scale.set(1, 0.62, 0.55);
      P.jaw = grp(P.head, 0, -0.12, 0.2);
      mk(new THREE.BoxGeometry(0.22, 0.035, 0.08), vd, P.jaw, 0, -0.03, 0.06);
      for (let k = 0; k < 4; k++) mk(new THREE.BoxGeometry(0.03, 0.04, 0.02), mats.tooth(), P.head, -0.06 + k * 0.04, -0.13, 0.29);
      const hat = grp(P.head, 0.1, 0.36, 0); hat.rotation.z = -0.4;
      mk(new THREE.ConeGeometry(0.1, 0.28, 10), suit, hat, 0, 0.12, 0); mk(sph(0.05, 8), red, hat, 0, 0.28, 0);
      P.al = limb(P.torso, -0.84, 1.02, 0, 0.17, 0.85, 0.15, 0.8, suit);
      P.ar = limb(P.torso, 0.84, 1.02, 0, 0.17, 0.85, 0.15, 0.8, suit);
      for (const L of [P.al, P.ar]) {
        mk(sph(0.16, 10), suit, L.a); mk(sph(0.15, 10), suit, L.b).scale.set(1, 0.8, 1);
        L.hand = grp(L.end, 0, -0.02, 0);
        mk(sph(0.11, 10), glove, L.hand, 0, -0.06, 0).scale.set(1.1, 0.8, 1.3);
        for (let k = 0; k < 4; k++) mk(cap(0.03, 0.12, 6), glove, L.hand, -0.06 + k * 0.04, -0.17, 0.06);
      }
      P.horn = grp(P.hips, 0.44, 0.05, 0.26);
      mk(sph(0.07, 8), red, P.horn); mk(new THREE.ConeGeometry(0.06, 0.16, 8, 1, true), mats.iron(), P.horn, 0.1, 0, 0, 0, 0, -Math.PI / 2);
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
  // (built in their own units; drawn so they stand as tall as MON_DEFS says: the Pale and the Executioner were 2.95 and
  // 3.26 m, through every doorway's lintel and, the Executioner, every corridor's 3 m ceiling)
  const FIT = { pale: 0.8, executioner: 0.8, sister: 0.9, mannequin: 0.87, clown: 0.92 };
  return { tintSlime, retri, FIT, build(type) { const g = B[type](); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } }); if (FIT[type]) g.scale.setScalar(FIT[type]); return g; } };
})();

const _dp = new THREE.Vector3(), _sp = new THREE.Vector3(), _sl = new THREE.Vector3(), _sl2 = new THREE.Vector3(), _bx = new THREE.Box3(), _hp = new THREE.Vector3(), _ft = new THREE.Vector3();
// the long ones' heads, kept out of the walls as well as their middles (how far ahead of its centre, how wide)
const MON_FRONT = { crawler: [0.85, 0.32], hound: [1.0, 0.3] };
// which way a body goes down, from its feet (relative to its facing), and how far it reaches lying there
const MON_FALL = { pale: [Math.PI, 2.4], sister: [0, 1.85], hound: [-Math.PI / 2, 1.5], bound: [Math.PI, 1.8] };
// What each one goes by (host; see Brain). tau: how long what it knows of you stays good (s). ear: how keen its hearing
// is, K its ear for each kind of noise (step, voice, item, door, bang). eye: what it sees by, keeping hold of you; find:
// noticing you in the first place (range, cone, dark: how near it makes you out without light, touch)
const MON_CFG = {
  crawler: { tau: 6, ear: 0.9, K: { step: 1.3 } },
  pale: { tau: 40, ear: 1, eye: { range: 26, cone: -0.35, dark: 8, touch: 1.2 }, find: { range: 20, cone: -0.2, dark: 8, touch: 1.2 } },
  mannequin: { tau: 20, ear: 0.8, eye: { range: 30, cone: -1, dark: 8, touch: 1.0 } },
  leech: { tau: 8, ear: 2.4, K: { voice: 0.6 } },
  roach: { tau: 5, ear: 0.8, K: { step: 1.4 } },
  hound: { tau: 8, ear: 1 },
  slime: { tau: 15, ear: 1, K: { step: 1.5, voice: 0.3, door: 0.6 } },
  sister: { tau: 10, ear: 1 },
  bound: { tau: 12, ear: 0.6, eye: { range: 18, cone: -0.3, dark: 6, touch: 1.5 }, find: { range: 14, cone: 0.1, dark: 6, touch: 1.5 } },
  executioner: { tau: 60, ear: 1 },
  clown: { tau: 30, ear: 1.4, K: { step: 1.5, door: 1 }, eye: { range: 30, cone: 0.2, dark: 7, touch: 1.5 } },
};
class Monster {
  constructor(game, id, type, x, y, z) {
    this.g = game; this.id = id; this.type = type; this.def = MON_DEFS[type]; this.cfg = MON_CFG[type]; this.mem = new Map();
    this.pos = new THREE.Vector3(x, y, z); this.ry = Math.random() * TAU;
    this.state = type === 'leech' ? 'crawl' : type === 'hound' ? 'wander' : type === 'pale' ? 'lurk' : type === 'sister' ? 'stand' : type === 'bound' ? 'lie' : type === 'executioner' ? 'walk' : 'roam';
    this.st = 0; this.hp = this.def.hp; this.extra = -1;
    this.target = null; this.goal = null; this.path = null; this.pathT = 0; this.pathGoal = null;
    this.stun = 0; this.atk = 0; this.anger = 0; this.stare = 0; this.seenCd = 0; this.speedNow = 0; this.grip = 100; this.dmgAcc = 0;
    this.scanT = Math.random(); this.stuckT = 0; this.spawnT = 0; this.cool = 0; this.lastSeenT = 0; this.observed = false;
    // presentation
    this.mesh = MonModels.build(type); this.P = this.mesh.userData.parts;
    this.mesh.rotation.order = 'YXZ';
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
    // (a hound squeezes through the hatch after you, and back out again)
    if (this.g.ship.collide(p, Math.min(r, 0.5))) hit = true;
    p.y = this.g.groundAt(p.x, p.z);
    return hit;
  }
  // one step toward (tx, tz), in hops no longer than most of its own width (so nothing fast ever skips through a door or
  // a stair rail), and with something in the way, feeling round it (the side that gets it furthest, kept to a moment)
  // rather than shoving into it
  stepToward(tx, tz, speed, dt, turnRate = 8) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { this.speedNow = 0; return 0; }
    this.turnTo(Math.atan2(dx, dz), turnRate, dt);
    // (it goes the way it's facing: coming round it slows, and a heavy slow-turning one all but stops to turn, instead
    // of sliding sideways or backwards while its body swings round)
    speed *= clamp(0.3 + 0.7 * Math.cos(angDiff(this.ry, Math.atan2(dx, dz))), 0.12, 1);
    const s = Math.min(d, speed * dt), ox = this.pos.x, oz = this.pos.z, oy = this.pos.y, ux = dx / d, uz = dz / d;
    let ax = ux, az = uz;
    if (this.slideT > 0) { this.slideT -= dt; const c = Math.cos(this.slideA), n = Math.sin(this.slideA); ax = ux * c - uz * n; az = ux * n + uz * c; }
    this.hop(ax, az, s);
    if (s > 0.003 && (this.pos.x - ox) * ax + (this.pos.z - oz) * az < s * 0.3) {
      // blocked: try angling off either way, more and more, and keep the first that moves it well
      let best = null, bs = -Infinity;
      const pref = this.slideSide || (Math.random() < 0.5 ? 1 : -1);
      for (const a of [0.6, 1.0, 1.4, 1.75]) {
        for (const sd of [pref, -pref]) {
          const c = Math.cos(a * sd), n = Math.sin(a * sd), vx = ux * c - uz * n, vz = ux * n + uz * c;
          this.pos.set(ox, oy, oz); this.hop(vx, vz, s);
          const mx = this.pos.x - ox, mz = this.pos.z - oz, moved = Math.hypot(mx, mz), sc = moved + (mx * ux + mz * uz) * 0.5 + (sd === pref ? 0.05 * s : 0);
          if (moved > s * 0.55 && sc > bs) { bs = sc; best = { a: a * sd, sd, x: this.pos.x, y: this.pos.y, z: this.pos.z }; }
        }
        if (best) break;
      }
      // an open door's leaf in its way (not the door it's going through): it shoves it shut as it passes
      const fac = this.def.zone === 'in' && this.g.fac, lf = fac && fac.leafAt(this.pos, this.def.radius);
      if (lf && (!this.doorPass || this.doorPass.d !== lf) && this.g.monsterShoveDoor) this.g.monsterShoveDoor(this, lf);
      if (best) { this.pos.set(best.x, best.y, best.z); this.slideA = best.a; this.slideSide = best.sd; this.slideT = 0.35; }
      else { this.pos.set(ox, oy, oz); this.hop(ux, uz, s); this.slideT = 0; this.slideSide = -pref; }
    }
    this.speedNow = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    return d;
  }
  hop(ux, uz, s) {
    const n = Math.max(1, Math.ceil(s / Math.max(0.12, this.def.radius * 0.6)));
    for (let i = 0; i < n; i++) { this.pos.x += ux * s / n; this.pos.z += uz * s / n; this.collide(); }
  }
  // follow a path to (gx,gz). returns remaining straight distance.
  moveTo(gx, gz, speed, dt, opts = {}) {
    const fac = this.g.fac;
    if (this.def.zone !== 'in' || !fac) return this.stepToward(gx, gz, speed, dt);
    const r = this.def.radius;
    // a short way round whatever it got stuck on, first
    if (this.detour && !opts.detour) {
      const dt0 = this.detour;
      dt0.t -= dt;
      if (dt0.t <= 0 || Math.hypot(dt0.x - this.pos.x, dt0.z - this.pos.z) < 0.6) { this.detour = null; this.path = null; }
      else { const keep = this.path, kg = this.pathGoal; this.path = dt0.path; this.pathGoal = { x: dt0.x, z: dt0.z }; this.moveTo(dt0.x, dt0.z, speed, dt, Object.assign({}, opts, { detour: true, gy: undefined })); dt0.path = this.path; this.path = keep; this.pathGoal = kg; return Math.hypot(gx - this.pos.x, gz - this.pos.z); }
    }
    this.pathT -= dt;
    // (one that can't work a door goes round the shut ones, or if there's no way round, as near as it can get: up to the
    // door, where it waits, scratching at it, until somebody opens it)
    const handles = this.def.doors !== false;
    const moved = !this.pathGoal || Math.hypot(this.pathGoal.x - gx, this.pathGoal.z - gz) > 1.5;
    if (!this.path || this.pathT <= 0 || moved) {
      this.path = fac.findPath(this.pos.x, this.pos.z, gx, gz, false, this.pos.y, opts.gy, r + 0.05, !handles) || [{ x: gx, z: gz }];
      this.pathGoal = { x: gx, z: gz }; this.pathT = 0.5 + Math.random() * 0.3;
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - this.pos.x, this.path[0].z - this.pos.z) < (this.path[0].hard ? 0.5 : Math.max(0.5, Math.min(1.2, speed * dt * 1.5)))) { this.path.shift(); this.prog = null; }
    const wp = this.path[0];
    let tx = wp.x, tz = wp.z;
    // a doorway on the way to the next waypoint: open it (or, opts.doors false, only note the shut door it's come up
    // against), then go through it square: onto its centre line where it stands, straight through, and on past the open
    // leaf before turning toward its hinge
    let dp = this.doorPass;
    const hit = fac.doorAlong(this.pos.x, this.pos.z, wp.x, wp.z, 2.6 + r);
    if (dp && ((hit !== dp.d && dp.near) || this.st - dp.t0 > 5 || this.st < dp.t0)) dp = this.doorPass = null;
    if (!dp && hit) dp = this.doorPass = { d: hit, side: Math.sign((this.pos.x - hit.x) * hit.nx + (this.pos.z - hit.z) * hit.nz) || 1, t0: this.st, near: true };
    if (dp) {
      const d = dp.d, nx = d.nx, nz = d.nz, along = (this.pos.x - d.x) * nx + (this.pos.z - d.z) * nz, lat = (this.pos.x - d.x) * -nz + (this.pos.z - d.z) * nx;
      if (!d.open && !d.broken && Math.hypot(d.x - this.pos.x, d.z - this.pos.z) < 1.8 + r) { if (opts.doors === false || !handles) this.doorAhead = d; else this.g.monsterOpenDoor(this, d); }
      const s = dp.side, nextW = this.path[1] && Math.hypot(wp.x - d.x, wp.z - d.z) < 2.4 ? this.path[1] : wp;
      const leaf = d.open && !d.broken && d.dir === -s, hinge = ((nextW.x - d.x) * -nz + (nextW.z - d.z) * nx) < -0.3;
      const exitD = leaf && hinge ? 1.53 + 0.1 + r : r + 0.4;
      if (along * s > -r * 0.5) {
        dp.near = along * s > 0.05;
        const tol = Math.max(0.06, 0.8 - r - 0.08);
        if (Math.abs(lat) > tol + (dp.through ? 0.15 : 0)) { dp.through = false; const k = Math.max(r + 0.3, Math.min(1.4, along * s)); tx = d.x + nx * s * k; tz = d.z + nz * s * k; }
        else { dp.through = true; tx = d.x - nx * s * exitD; tz = d.z - nz * s * exitD; }
      } else if (-along * s < exitD - 0.15 && Math.abs(lat) < 0.9) { dp.near = false; tx = d.x - nx * s * exitD; tz = d.z - nz * s * exitD; }
      else dp = this.doorPass = null;
    }
    // stuck (no headway toward the waypoint for a while): a fresh route, then a few steps somewhere else close by
    const dw = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    if (!this.prog || dw < this.prog.d - 0.3 || Math.hypot(tx - this.prog.x, tz - this.prog.z) > 0.6) this.prog = { d: dw, t: 0, x: tx, z: tz }; else this.prog.t += dt;
    if (this.prog.t > 1.2 && speed > 0.3) {
      this.prog = null; this.path = null; this.doorPass = null;
      if ((this.stuckN = (this.stuckN || 0) + 1) >= 2 && !opts.detour) {
        this.stuckN = 0;
        const p = fac.randomWalkable(R0, (q) => { const e = Math.hypot(q.x - this.pos.x, q.z - this.pos.z); return e > 2 && e < 7 && fac.lvl[fac.idx(q.i, q.j)] === fac.lvl[fac.idx(fac.ti(this.pos.x), fac.tj(this.pos.z))]; }, { x: this.pos.x, z: this.pos.z, r: 7 });
        if (p) this.detour = { x: p.x, z: p.z, t: 3, path: null };
      }
      return Math.hypot(gx - this.pos.x, gz - this.pos.z);
    }
    if (this.prog.t === 0) this.stuckN = Math.max(0, (this.stuckN || 0) - dt);
    this.stepToward(tx, tz, speed, dt, opts.turn || 9);
    return Math.hypot(gx - this.pos.x, gz - this.pos.z);
  }
  // Keeping one of the crew (at pos, radius r) out of a creature's body, on every peer, against where it's drawn: a
  // ring round most of them. The Seep fills the corridor it's in wall to wall, a slab as deep as its body: there's no
  // getting past it there (in a room, round it). A leech is nobody's obstacle
  static push(m, pos, r) {
    if (m.dead || m.type === 'leech') return;
    const at = m.rpos, dx = pos.x - at.x, dz = pos.z - at.z;
    if (((m.type === 'slime' && m.state !== 'seep') || m.type === 'clown') && G.fac) {
      const ry = m.rry, fx = Math.sin(ry), fz = Math.cos(ry), sx = Math.cos(ry), sz = -Math.sin(ry), al = dx * fx + dz * fz, la = dx * sx + dz * sz, A = 0.85 + r;
      if (Math.abs(al) >= A || Math.abs(la) > 3.4 || Math.abs(pos.y - at.y) > 2) return;
      const cap = m.type === 'clown' && m.state === 'duck' ? 0.8 : 1.45, fh = G.fac.freeHalf(at.x, at.z, ry), L = Math.min(fh[0], cap), Rr = Math.min(fh[1], cap);
      if (la <= -L - r || la >= Rr + r) return;
      // (out by the nearest face it can: in front, behind, or to a side with room to stand there)
      let da = A - al, dl = 0;
      if (al + A < Math.abs(da)) da = -A - al;
      if (fh[0] > L + 2 * r && la + L + r < Math.abs(da)) { dl = -L - r - la; da = 0; }
      if (fh[1] > Rr + 2 * r && Rr + r - la < Math.abs(da || dl || Infinity)) { dl = Rr + r - la; da = 0; }
      pos.x += fx * da + sx * dl; pos.z += fz * da + sz * dl;
      return;
    }
    const d = Math.hypot(dx, dz), rr = m.def.radius + r;
    if (d < rr && d > 1e-3) { pos.x = at.x + (dx / d) * rr; pos.z = at.z + (dz / d) * rr; }
  }
  // creatures don't stand inside one another: any two on the same floor closer than their two widths are eased apart
  // (the Executioner and the Seep give way to nothing; a leech up on the ceiling, or riding someone, is out of it), and
  // the walls get the last word. Called on the host after every creature has moved.
  static separate(g, dt) {
    const L = []; for (const m of g.monsters.values()) if (!m.dead && m.state !== 'attached' && m.state !== 'seep' && !(m.type === 'leech' && m.state !== 'fallen')) L.push(m);
    const heavy = (m) => m.type === 'executioner' || m.type === 'slime' || m.type === 'clown';
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      if (a.def.zone !== b.def.zone || Math.abs(a.pos.y - b.pos.y) > 1.6) continue;
      let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      const r = a.def.radius + b.def.radius; if (d >= r) continue;
      if (d < 1e-3) { const t = (a.id * 2.399) % TAU; dx = Math.cos(t); dz = Math.sin(t); d = 1; } else { dx /= d; dz /= d; }
      const wa = heavy(a) ? 0 : heavy(b) ? 1 : 0.5, wb = heavy(b) ? 0 : heavy(a) ? 1 : 0.5, push = Math.min(r - (d === 1 ? 0 : d), 4 * dt);
      if (wa) { a.pos.x -= dx * push * wa; a.pos.z -= dz * push * wa; a.collide(); }
      if (wb) { b.pos.x += dx * push * wb; b.pos.z += dz * push * wb; b.collide(); }
    }
  }
  // somewhere to go: indoors, a walk of between minD and maxD (never off across the building; see Facility.localGoal),
  // mostly on its own floor but now and then up or down the nearest stairwell, so what roams a floor drifts on to the
  // next in time; each tile weighted by score(k, metres) if given (filter: a yes or no on each, and its own floor only);
  // outdoors, a point at that range
  randomGoal(minD, maxD, filter, score) {
    if (this.def.zone === 'in' && this.g.fac) {
      const fac = this.g.fac, W = fac.W;
      const sc = filter || score ? (k, d) => { if (filter) { const i = k % W, j = (k - i) / W; if (!filter({ x: fac.cx(i), z: fac.cz(j), i, j, k })) return 0; } return score ? score(k, d) : 1; } : null;
      const g = fac.localGoal(this.pos.x, this.pos.z, this.feetY(), minD, maxD * 1.25, R0, sc, !filter && R0.next() < 0.2 ? 'walk' : 'floor');
      return g || (filter || score ? null : { x: this.pos.x, z: this.pos.z });
    }
    const a = Math.random() * TAU, d = minD + Math.random() * (maxD - minD);
    let x = this.pos.x + Math.cos(a) * d, z = this.pos.z + Math.sin(a) * d;
    const l = Math.hypot(x, z); if (l > 150) { x *= 150 / l; z *= 150 / l; }
    return { x, z };
  }
  playersIn() { return this.g.alivePlayers().filter((p) => p.zone === this.def.zone); }
  // what its feet are on (a leech up on the ceiling: the floor under it)
  feetY() { return this.type === 'leech' && this.state !== 'fallen' && this.state !== 'dead' && this.g.fac ? this.g.fac.floorY(this.pos.x, this.pos.z, this.pos.y - 2.5) : this.pos.y; }
  // perception (see Brain): the one of the crew it notices first, seen (by eye o) or heard; where they were is
  // remembered (lastKnown). null if nobody
  detect(o) {
    const s = Brain.look(this, o, (p) => p.zone === this.def.zone);
    if (s) { const r = Brain.remember(this, s.p, s.c, 'seen'); this.lastKnown = { x: r.x, z: r.z, y: r.y }; return s.p; }
    const h = Brain.hear(this, this.cfg.ear, this.cfg.K);
    const p = h && h.pid != null && this.g.players.get(h.pid);
    if (p && p.alive && p.zone === this.def.zone) { const r = Brain.noted(this, h, 0.4 + 0.4 * h.loud); this.lastKnown = { x: r.x, z: r.z, y: r.y }; return p; }
    return null;
  }
  // keeping hold of tgt: seen or heard, where they are is remembered (aware); neither, and memory (s) runs down
  track(tgt, o, memory, dt) {
    const c = Brain.sees(this, tgt, o);
    let h = null;
    if (!c) { h = Brain.hear(this, this.cfg.ear, this.cfg.K); if (h && h.pid !== tgt.id) h = null; }
    if (c > 0 || h) {
      const r = c > 0 ? Brain.remember(this, tgt, c, 'seen') : Brain.noted(this, h, 0.4 + 0.4 * h.loud);
      this.memory = memory; this.lastKnown = { x: r.x, z: r.z, y: r.y }; this.aware = true;
    } else { this.aware = false; this.memory = (this.memory || 0) - dt; }
  }
  nearestPlayer(maxD, filter) {
    let best = null, bd = maxD;
    for (const p of this.playersIn()) { const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z); if (d < bd && (!filter || filter(p))) { bd = d; best = p; } }
    return best;
  }
  // Places on its own floor to lie in wait, a walk of up to maxM away: just inside or beside a doorway, or round the
  // corner of a corridor, each scored by how much the crew come by (where they've been walking, the building's narrow
  // places, `route`: tiles they'll walk) and how late whoever comes along would see it. near ({ x, z, r }): only round
  // there. ceiling: up on the ceiling instead, where it's low enough to drop from, over a doorway's middle (everyone who
  // comes through passes under it) or a corridor that's walked. Best first; null if it can't look just now
  ambushSpots(maxM, near, route, ceiling) {
    const fac = this.g.fac, nv = fac.nav(), W = fac.W, F = Brain.from(this, maxM, 'floor', true); if (!F) return null;
    const my = this.feetY(), out = [], seen = new Set(), q = { x: 0, y: 0, z: 0 };
    const add = (x, z, k, base) => {
      if (!(F[k] <= maxM) || (near && Math.hypot(x - near.x, z - near.z) > near.r)) return;
      const key = Math.round(x * 2) * 100003 + Math.round(z * 2); if (seen.has(key)) return; seen.add(key);
      if (ceiling) { if (fac.ceil[k] > 3.6) return; }
      else { q.x = x; q.z = z; q.y = fac.tileY(k); if (fac.collide(q, 0.45)) return; }
      out.push({ x, z, y: fac.tileY(k), k, base });
    };
    for (const d of fac.doors) {
      if (d.broken || Math.abs(d.y - my) > 1 || Math.abs(d.x - this.pos.x) > maxM || Math.abs(d.z - this.pos.z) > maxM) continue;
      for (const s of [1, -1]) for (const lat of ceiling ? [0] : [-1, 1]) {
        const x = d.x + d.nx * s * (ceiling ? 0.65 : 0.95) - d.nz * lat * 1.05, z = d.z + d.nz * s * (ceiling ? 0.65 : 0.95) + d.nx * lat * 1.05;
        const k = fac.idx(fac.ti(x), fac.tj(z)); if (k >= 0 && nv.isN[k]) add(x, z, k, ceiling ? 1.6 : 1.1);
      }
    }
    for (let i = 0; i < nv.nvis; i++) {
      const k = nv.vis[i]; if (fac.room[k] >= 0) continue;
      if (nv.bend[k]) add(fac.cx(k % W), fac.cz((k - (k % W)) / W), k, 0.9);
      else if (nv.choke[k] > 0.25 || Brain.heat(k) > 0.1) add(fac.cx(k % W), fac.cz((k - (k % W)) / W), k, 0.6);
    }
    for (const c of out) { const k = c.k; c.s = c.base * (0.3 + 2 * Brain.heat(k) + Math.min(1.5, nv.choke[k])) + (route && route.has(k) ? 2 : 0); }
    out.sort((a, b) => b.s - a.s);
    // (seen from a way off along where people come, it's less use: looked at for the likeliest few only)
    if (!ceiling) for (const c of out.slice(0, 10)) {
      let ex = 0; const v = fac.visFrom(c.k), i0 = c.k % W, j0 = (c.k - i0) / W;
      for (const n of v) { const i = n % W, j = (n - i) / W; if ((i - i0) * (i - i0) + (j - j0) * (j - j0) > 2.3 && (nv.choke[n] > 0.25 || Brain.heat(n) > 0.1)) ex++; }
      c.s /= 1 + ex / 4;
    }
    return out.sort((a, b) => b.s - a.s);
  }
  // one of the best few of them, at random (the better the likelier)
  pickSpot(list) {
    if (!list || !list.length) return null;
    const top = list.slice(0, 5); let tot = 0; for (const c of top) tot += c.s * c.s;
    let x = R0.next() * tot; for (const c of top) { x -= c.s * c.s; if (x <= 0) return c; }
    return top[0];
  }
  // within reach: near enough, on its own storey, and nothing solid between (a blow or a grab never goes through a wall,
  // round a corner or across to the flight above)
  reaches(p, r, dy = 1.5) {
    if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) >= r || Math.abs(p.pos.y - this.pos.y) >= dy) return false;
    return this.def.zone !== 'in' || !this.g.fac || this.clearTo(p);
  }
  // A blow from one of the cleverer ones: a killing one once the director's let it loose on p and the warnings have come
  // (Brain.mayKill); until then a wound it leaves you to run with, never the last of your health. true if it killed
  strike(p, cause, wound = 30) {
    if (Brain.mayKill(this, p)) { this.killAt = { x: p.pos.x, z: p.pos.z }; this.g.killPlayer(p.id, cause, this.id); return true; }
    const f = this.forward(); this.g.hurtPlayer(p.id, Math.max(0, Math.min(wound, p.hp - 6)), cause, f.x * 5, f.z * 5);
    return false;
  }
  // nothing solid between it and p: no wall, and not the rail between a stairwell's flights
  clearTo(p) {
    const fac = this.g.fac;
    return fac.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z) && !fac.acrossRail(this.pos.x, this.pos.z, this.pos.y, p.pos.x, p.pos.z, p.pos.y);
  }
  // how far it would have to walk to (x, y, z): along the corridors and up and down the stairs, not as the crow flies
  // (Infinity if there's no way)
  walkLen(x, z, y) {
    const fac = this.g.fac;
    if (this.def.zone !== 'in' || !fac) return Math.hypot(x - this.pos.x, z - this.pos.z);
    if (Math.abs(y - this.pos.y) < 1.5 && Math.hypot(x - this.pos.x, z - this.pos.z) < 4 && fac.los(this.pos.x, this.pos.z, x, z)) return Math.hypot(x - this.pos.x, z - this.pos.z);
    const w = fac.findPath(this.pos.x, this.pos.z, x, z, false, this.pos.y, y);
    if (!w) return Infinity;
    let l = 0, px = this.pos.x, pz = this.pos.z, py = this.pos.y;
    for (const q of w) { const qy = q.y != null ? q.y : py; l += Math.hypot(q.x - px, q.z - pz, qy - py); px = q.x; pz = q.z; py = qy; }
    return l;
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
  // The Crawler: eyeless. It feels movement in the air ahead of it (anyone moving about in front of it, lit or not;
  // someone keeping still a few steps off isn't there to it) and it hears, footsteps best. Once it has you it screeches,
  // which brings any other of its kind near enough to hear (round by another way), then charges at where you're going,
  // dead straight, turning badly. Lose it and it runs on the way you were going, then noses through the nearest rooms.
  ai_crawler(dt) {
    const fac = this.g.fac;
    this.scanT -= dt;
    const feel = () => {
      if (this.scanT > 0) return null;
      this.scanT = 0.2;
      const f = this.forward(); let best = null, bd = Infinity;
      for (const p of this.playersIn()) {
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > 22 || Math.abs(p.pos.y - this.pos.y) > 2.5) continue;
        const e = Brain.P.get(p.id);
        if (d > 3 && !(e ? e.spd > 1 : p.moving)) continue;
        if (d > 5 && (dx * f.x + dz * f.z) / (d || 1) < 0.15) continue;
        if (d < bd && this.clearTo(p)) { bd = d; best = p; }
      }
      if (best) Brain.remember(this, best, 1, 'felt');
      return best;
    };
    switch (this.state) {
      case 'roam': case 'search': case 'investigate': {
        const p = feel();
        if (p) { this.spotted(p); break; }
        const h = Brain.hear(this, this.cfg.ear, this.cfg.K);
        if (h && (this.state !== 'investigate' || h.loud > (this.heardL || 0) + 0.1 || this.st > 3)) {
          this.setState('investigate'); this.goal = { x: h.x, z: h.z, y: h.y }; this.heardL = h.loud; this.flank = null;
          if (h.pid != null) { this.target = h.pid; Brain.noted(this, h, 0.3 + 0.5 * h.loud); }
        }
        if (this.state === 'roam') {
          // (wandering, it keeps to where the crew have been)
          if (!this.goal || this.st > 18) { this.goal = this.randomGoal(6, 30, null, (k) => 1 + 4 * Brain.heat(k)); this.st = 0; }
          if (this.moveTo(this.goal.x, this.goal.z, 2.2, dt) < 1) this.goal = null;
        } else if (this.state === 'investigate') {
          const rem = this.moveTo(this.goal.x, this.goal.z, 3.6, dt, { gy: this.goal.y });
          if (rem < 1.2 || this.st > 9) {
            if (this.flank) { this.goal = this.flank; this.flank = null; this.st = 0; }
            else { this.setState('search'); this.plan = this.sweepPlan(this.goal); this.planT = 0; }
          }
        } else this.searching(dt, 3.6);
        break;
      }
      case 'spot': {
        const p = this.g.players.get(this.target);
        if (!p || !p.alive || p.zone !== 'in') { this.setState('roam'); break; }
        this.turnTo(Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 6, dt);
        this.speedNow = 0;
        if (this.clearTo(p)) { Brain.remember(this, p, 1, 'felt'); this.lastKnown = { x: p.pos.x, z: p.pos.z, y: p.pos.y }; }
        if (this.st > 0.75) { this.setState('charge'); this.charge = 2.5; this.lastSeenT = 0; }
        break;
      }
      case 'charge': {
        const p = this.g.players.get(this.target);
        if (!p || !p.alive || p.zone !== 'in') { this.setState('roam'); this.goal = null; break; }
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        const sees = d < 22 && Math.abs(p.pos.y - this.pos.y) < 2.5 && this.clearTo(p);
        this.lastSeenT = sees ? 0 : this.lastSeenT + dt;
        // (at where you'll be by the time it gets there, as near as it can tell from which way you're going)
        let aim = this.lastKnown || p.pos;
        if (sees) {
          Brain.remember(this, p, 1, 'felt'); this.lastKnown = { x: p.pos.x, z: p.pos.z, y: p.pos.y };
          const e = Brain.P.get(p.id), k = Math.min(0.6, d / 11); aim = { x: p.pos.x + (e ? e.vx * k : 0), z: p.pos.z + (e ? e.vz * k : 0) };
        }
        this.turnTo(Math.atan2(aim.x - this.pos.x, aim.z - this.pos.z), 1.7, dt);
        this.charge = Math.min(11, this.charge + 7 * dt);
        const f = this.forward(), ox = this.pos.x, oz = this.pos.z, want = this.charge * dt;
        // bash doors
        const ci = fac.ti(ox), cj = fac.tj(oz), ni = fac.ti(ox + f.x * 1.2), nj = fac.tj(oz + f.z * 1.2);
        // a door slammed in its face: it hits it full tilt (the whole door bangs in its frame) and is left reeling on
        // this side of it
        if (ni !== ci || nj !== cj) {
          const door = fac.closedDoorBetween(ci, cj, ni, nj);
          if (door) { this.g.emitSound('door_slam', new THREE.Vector3(door.x, door.y + 1, door.z), { vol: 1.5, ref: 5 }); this.g.emitSound('crunch', this.pos, { vol: 0.8 }); this.g.addNoise(new THREE.Vector3(door.x, door.y + 1, door.z), 18, 'in', null, 'bang', this.id); this.stun = 2.5; this.charge = 0; this.speedNow = 0; this.setState('search'); this.plan = this.sweepPlan(); this.planT = 0; break; }
        }
        this.hop(f.x, f.z, want);
        const got = Math.hypot(this.pos.x - ox, this.pos.z - oz);
        this.speedNow = got / Math.max(dt, 1e-4);
        if (want > 0.05 && got < want * 0.35 && this.charge > 6) { this.stun = 1.4; this.charge = 0; this.g.emitSound('door_slam', this.pos, { vol: 0.8 }); this.setState('search'); this.plan = this.sweepPlan(); this.planT = 0; break; }
        for (const q of this.playersIn()) {
          if (this.atk > 0) break;
          if (this.reaches(q, 1.5)) {
            const k = clamp(this.charge / 11, 0.5, 1);
            this.g.hurtPlayer(q.id, Math.round(45 * k), 'crawler', f.x * 9 * k, f.z * 9 * k);
            this.atk = 1.2; this.charge *= 0.3;
          }
        }
        if (this.lastSeenT > 1.6 || this.st > 7) { this.setState('search'); this.plan = this.sweepPlan(); this.planT = 0; this.extra = -1; }
        break;
      }
      default: this.setState('roam');
    }
  }
  // Roaches: a few of them, scuttling about in fits and starts (a dash, a dead stop with the feelers going, a dash on).
  // They hear footsteps and feel anyone moving about close by, and come for them in a rush along the floor, quicker
  // than a walk and slower than a run; a bite at the ankles and it's off a few steps, then round and back for another.
  // A beam on one and it scatters for the dark, and the others close by with it.
  ai_roach(dt) {
    this.scanT -= dt; this.cool -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.2;
      const at = { x: this.pos.x, y: this.pos.y + 0.1, z: this.pos.z };
      let lit = null;
      for (const p of this.playersIn()) if (p.flash && this.g.canSee(p, at, p.flash === 2 ? 18 : 12, 0.94)) { lit = p; break; }
      if (lit) {
        if (this.state !== 'flee' || this.back != null) for (const o of this.g.monsters.values()) {
          if (o.type === 'roach' && !o.dead && (o === this || (o.state !== 'flee' && Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 5 && Math.abs(o.pos.y - this.pos.y) < 2))) o.scatter(lit);
        }
      } else if (this.cool <= 0 && (this.state === 'roam' || this.state === 'freeze' || this.state === 'rush')) {
        let best = null, bd = 9;
        for (const p of this.playersIn()) {
          const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z), e = Brain.P.get(p.id);
          if (d < bd && Math.abs(p.pos.y - this.pos.y) < 2 && (d < 2.5 || (e ? e.spd > 1.2 : p.moving)) && this.clearTo(p)) { bd = d; best = p; }
        }
        const h = best ? null : Brain.hear(this, this.cfg.ear, this.cfg.K), hp = h && h.pid != null && h.loud > 0.2 ? this.g.players.get(h.pid) : null;
        if (best && this.state !== 'rush') this.rush(best);
        else if (hp && this.state !== 'rush') this.rush(hp, { x: h.x, z: h.z, y: h.y });
        else if (hp && hp.id === this.target) { this.lastKnown = { x: h.x, z: h.z, y: h.y }; this.lastSeenT = Math.min(this.lastSeenT, 1); }
      }
    }
    switch (this.state) {
      case 'roam': {
        if (this.st > (this.dash || 1.2)) { this.setState('freeze'); this.dash = 0.4 + Math.random() * 1.8; if (Math.random() < 0.5) this.goal = null; break; }
        if (!this.goal) this.goal = this.randomGoal(3, 14, null, (k) => 1 + 2 * Brain.heat(k)) || this.randomGoal(3, 14);
        if (this.moveTo(this.goal.x, this.goal.z, 3.6, dt) < 0.6) this.goal = null;
        break;
      }
      case 'freeze': {
        this.speedNow = 0;
        if (this.st > (this.dash || 1)) { this.setState('roam'); this.dash = 0.5 + Math.random() * 1.6; }
        break;
      }
      case 'rush': {
        const p = this.g.players.get(this.target);
        if (!p || !p.alive || p.zone !== 'in') { this.target = null; this.setState('freeze'); break; }
        const sees = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 14 && Math.abs(p.pos.y - this.pos.y) < 2.5 && this.clearTo(p);
        if (sees) { this.lastKnown = { x: p.pos.x, z: p.pos.z, y: p.pos.y }; this.lastSeenT = 0; } else this.lastSeenT += dt;
        const g = this.lastKnown, rem = this.moveTo(g.x, g.z, 4.6, dt, { gy: g.y });
        if (this.atk <= 0 && this.reaches(p, 0.75)) {
          const f = this.forward();
          this.g.hurtPlayer(p.id, 5, 'roach', f.x * 1.5, f.z * 1.5); this.g.emitSound('roach_bite', this.pos, {});
          this.atk = 1.2; this.cool = 2.5 + Math.random() * 2; this.goal = this.randomGoal(3, 7); this.setState('flee'); this.back = p.id;
          break;
        }
        if ((!sees && (this.lastSeenT > 3 || rem < 0.8)) || this.st > 14) { this.target = null; this.cool = 3; this.dash = 1 + Math.random(); this.setState('freeze'); }
        break;
      }
      case 'flee': {
        if (!this.goal) this.goal = this.randomGoal(3, 8);
        const rem = this.moveTo(this.goal.x, this.goal.z, 5.2, dt);
        if (rem < 0.6 || this.st > 4) {
          const p = this.back != null ? this.g.players.get(this.back) : null;
          this.goal = null; this.back = null;
          if (p && p.alive && p.zone === 'in' && this.cool <= 0 && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 10 && Math.abs(p.pos.y - this.pos.y) < 2) this.rush(p);
          else { this.dash = 0.8 + Math.random() * 1.5; this.setState('freeze'); }
        }
        break;
      }
      default: this.setState('roam');
    }
  }
  rush(p, at) { this.target = p.id; this.back = null; this.lastKnown = at || { x: p.pos.x, z: p.pos.z, y: p.pos.y }; this.lastSeenT = 0; this.setState('rush'); }
  // (off from a beam: a few strides away, as far from whoever's holding it as it can find)
  scatter(p) {
    const fac = this.g.fac, W = fac.W;
    this.target = null; this.back = null; this.cool = 2.5 + Math.random() * 2;
    this.goal = this.randomGoal(4, 10, null, (k) => { const i = k % W, dx = fac.cx(i) - p.pos.x, dz = fac.cz((k - i) / W) - p.pos.z; return 0.05 + dx * dx + dz * dz; });
    this.setState('flee'); this.st = 0;
  }
  // found you: the screech, and any other of its kind within earshot comes too, round by another way
  spotted(p) {
    this.target = p.id; this.extra = p.id; this.setState('spot'); this.plan = null; this.flank = null;
    this.lastKnown = { x: p.pos.x, z: p.pos.z, y: p.pos.y };
    Brain.call(this, 25, (o) => { if (o.state === 'roam' || o.state === 'search' || o.state === 'investigate') o.flankTo(p, this); });
  }
  // called in on p by another: it makes for whichever way into where p is lies furthest from the one that called it
  flankTo(p, lead) {
    const fac = this.g.fac, nv = fac.nav(), W = fac.W, e = Brain.P.get(p.id);
    let best = null, bs = -Infinity;
    const a = e && e.k >= 0 && nv.areas[nv.area[e.k]];
    if (a) for (const { n } of a.nb.values()) {
      const x = fac.cx(n % W), z = fac.cz((n - (n % W)) / W), s = Math.hypot(x - lead.pos.x, z - lead.pos.z) - 0.5 * Math.hypot(x - this.pos.x, z - this.pos.z);
      if (s > bs) { bs = s; best = { x, z, y: fac.tileY(n) }; }
    }
    Brain.remember(this, p, 0.7, 'called');
    this.target = p.id; this.setState('investigate'); this.heardL = 1;
    this.goal = best || { x: p.pos.x, z: p.pos.z, y: p.pos.y }; this.flank = best ? { x: p.pos.x, z: p.pos.z, y: p.pos.y } : null;
  }
  // where to look for someone it's lost: where it last had them, on along the way they were going, then the nearest
  // rooms and corridors round there
  sweepPlan(from) {
    const fac = this.g.fac, nv = fac.nav(), W = fac.W, r = this.target != null ? Brain.recall(this, this.target) : null, o = r || from || this.lastKnown, pts = [];
    if (!o) return pts;
    pts.push({ x: o.x, z: o.z, y: o.y });
    if (r) { const a = Brain.ahead(r.x, r.z, r.vx, r.vz, Math.min(6, Brain.age(r) + 2)); if (Math.hypot(a.x - r.x, a.z - r.z) > 2) pts.push({ x: a.x, z: a.z, y: r.y }); }
    const last = pts[pts.length - 1], k = fac.nodeAt(last.x, last.z, last.y), ar = k >= 0 && nv.areas[nv.area[k]];
    if (ar) {
      const nb = [...ar.nb.keys()].map((b) => nv.areas[b]).filter((b) => b.lv === ar.lv);
      const at = (b) => ({ x: fac.cx(b.k % W), z: fac.cz((b.k - (b.k % W)) / W), y: fac.tileY(b.k) });
      nb.sort((p, q) => { const a1 = at(p), a2 = at(q); return Math.hypot(a1.x - last.x, a1.z - last.z) - Math.hypot(a2.x - last.x, a2.z - last.z); });
      for (const b of nb.slice(0, 2)) pts.push(at(b));
    }
    return pts;
  }
  // going over a search plan, a few seconds at most to each place; done, it gives up and wanders
  searching(dt, speed) {
    if (!this.plan || !this.plan.length) { this.setState('roam'); this.goal = null; this.target = null; this.extra = -1; return; }
    const g = this.plan[0]; this.planT = (this.planT || 0) + dt;
    if (this.moveTo(g.x, g.z, speed, dt, { gy: g.y }) < 1.2 || this.planT > 8) { this.plan.shift(); this.planT = 0; }
  }
  ai_pale(dt) {
    const fac = this.g.fac;
    this.seenCd -= dt; this.cool -= dt;
    // (what a glance has stirred up settles again in a minute or so: only looks close together tip it over)
    if (this.state !== 'chase') this.anger = Math.max(0, this.anger - dt * 0.1);
    let tgt = this.target != null ? this.g.players.get(this.target) : null;
    if (tgt && (!tgt.alive || tgt.zone !== 'in')) { tgt = null; this.target = null; }
    // it has to find you first: see you, hear you, or wander right into you
    if (!tgt && this.cool <= 0 && this.state !== 'drag') {
      const p = this.detect(this.cfg.find);
      if (p) { this.target = p.id; tgt = p; this.memory = 25; if (this.state === 'lurk') this.setState('stalk'); }
      else if (this.state === 'lurk') { const n = Brain.hear(this, this.cfg.ear); if (n) { this.goal = { x: n.x, z: n.z }; this.st = 0; } }
    }
    if (tgt) {
      this.track(tgt, this.cfg.eye, 25, dt);
      if (this.memory <= 0) { this.target = null; tgt = null; if (this.state === 'stalk') this.setState('lurk'); }
    }
    // let loose on someone (see Brain's director), it knows where they are, wherever they go
    const prey = this.state !== 'drag' ? Brain.prey(this) : null;
    if (prey && prey.alive && prey.zone === 'in') {
      if (this.target !== prey.id) { this.target = prey.id; this.anger = 0; if (this.state === 'lurk') this.setState('stalk'); }
      tgt = prey; this.memory = 25; this.aware = true; this.lastKnown = { x: prey.pos.x, z: prey.pos.z, y: prey.pos.y };
    }
    this.extra = this.target != null ? this.target : -1;
    // (a look only counts if there's light to see it by: a lamp near it or a beam on it, or close enough to make it out
    // in the dark; see Brain.seenBy)
    const seers = Brain.seenBy(this, { eye: 2.1, range: 28, dot: 0.6 }, this.seers || (this.seers = []));
    const seenByAny = seers.length > 0, seenByTarget = seers.some((p) => p.id === this.target);
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
          // lost you: creep to where it last noticed you and listen; then try where you went to ground last time
          const rem = this.moveTo(this.lastKnown.x, this.lastKnown.z, 2.8, dt, { gy: this.lastKnown.y });
          if (rem < 1.5) { const h = !this.searched && this.hideNear(tgt); if (h) { this.lastKnown = h; this.searched = true; } else this.memory -= dt * 2; }
          if (seenByAny) { this.fleeGoal = this.hiddenSpot(tgt); this.setState('flee'); }
          break;
        }
        const fx = -Math.sin(tgt.yaw), fz = -Math.cos(tgt.yaw);
        let gx = tgt.pos.x - fx * 3.2, gz = tgt.pos.z - fz * 3.2;
        if (!fac.walkable(fac.ti(gx), fac.tj(gz))) { gx = tgt.pos.x; gz = tgt.pos.z; }
        const d = Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z);
        // lingers behind you... then closes in
        this.searched = false;
        this.creep = d < 5 && !seenByTarget ? (this.creep || 0) + dt : Math.max(0, (this.creep || 0) - dt * 2);
        // (let loose but not yet free to kill: it lingers there behind you, breathing, while the warnings come)
        if (prey === tgt && !Brain.mayKill(this, tgt)) this.creep = Math.min(this.creep, 2.2);
        if (this.creep > 0.9 && !this.breathed) { this.breathed = true; this.g.emitSound('breath', new THREE.Vector3(this.pos.x, this.pos.y + 2.1, this.pos.z), { vol: 1.6, ref: 1.5 }); }
        if (this.creep <= 0) this.breathed = false;
        if (this.creep > 2.6) { gx = tgt.pos.x; gz = tgt.pos.z; }
        // (unseen and a way off it moves fast; let loose on someone heading home, it gets ahead of them on their way out
        // and waits there, out of their sight)
        let sp = this.creep > 2.6 ? 2.8 : d > 14 ? (seenByAny ? 3.0 : 6.5) : d > 5 ? 3.0 : 2.4, gy = tgt.pos.y;
        if (prey === tgt && d > 14 && Brain.homebound(tgt)) {
          if ((this.cutT = (this.cutT || 0) - dt) <= 0) { this.cutT = 2; this.cut = Brain.cutoff(this, tgt, 6.5); }
          if (this.cut) { gx = this.cut.x; gz = this.cut.z; gy = this.cut.y; if (Math.hypot(gx - this.pos.x, gz - this.pos.z) < 1) sp = 0; }
        } else this.cut = null;
        if (sp > 0) this.moveTo(gx, gz, sp, dt, { gy });
        else { this.speedNow = 0; this.turnTo(Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), 3, dt); }
        // (let loose on you and free to kill, being seen doesn't send it off any more: it comes for you)
        if (seenByTarget && prey === tgt && Brain.mayKill(this, tgt)) { this.setState('chase'); this.g.emitSound('hiss', this.pos, { vol: 1.2 }); break; }
        if (seenByAny) {
          if (seenByTarget) { if (this.seenCd <= 0) { this.anger += 1; this.seenCd = 1.2; } this.stare += dt; }
          if (this.anger >= 4) { this.setState('chase'); break; }
          this.fleeGoal = this.hiddenSpot(tgt); this.setState('flee'); break;
        }
        if (!seenByTarget && this.reaches(tgt, 1.4)) {
          if (this.strike(tgt, 'pale')) { this.setState('drag'); this.goal = this.randomGoal(15, 35); this.target = null; this.anger = 0; this.creep = 0; }
          else { this.creep = 0; this.cool = 20; this.fleeGoal = this.hiddenSpot(tgt); this.target = null; this.setState('flee'); }
        }
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
        if (this.reaches(tgt, 1.4)) {
          if (this.strike(tgt, 'pale', 40)) { this.setState('drag'); this.goal = this.randomGoal(15, 35); this.target = null; }
          else { this.anger = 0; this.stare = 0; this.cool = 20; this.fleeGoal = this.hiddenSpot(tgt); this.target = null; this.setState('flee'); }
        }
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
  // The Sisters: blind, and drawn to light: a beam turned on one, a lamp carried past it, someone moving about under a
  // lamp close by, any light at all right up against it. Noise only turns their heads, a twitch toward it and no more.
  // Once one's drawn, the others a short walk from it come too, jerking along, stopping, jerking on. Put the light out
  // and keep still and they lose you, and stand where they stopped, twitching. Close enough to touch, they find you anyway
  ai_sister(dt) {
    const fac = this.g.fac;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.2;
      const head = { x: this.pos.x, y: this.pos.y + 1.5, z: this.pos.z };
      let lit = null;
      for (const p of this.playersIn()) {
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (d > 30 || Math.abs(p.pos.y - this.pos.y) > 3) continue;
        const e = Brain.P.get(p.id), sight = () => fac.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z, true);
        if ((p.flash && this.g.canSee(p, head, p.flash === 2 ? 30 : 21, 0.93)) || (d < 11 && this.g.carriesLight(p) && sight())
          || (d < 8 && e && e.spd > 1 && Brain.lit(e.k) && sight()) || this.reaches(p, 1.7, 3)) { lit = p; break; }
      }
      if (lit) {
        const at = { x: lit.pos.x, z: lit.pos.z, y: lit.pos.y };
        if (this.state !== 'drawn') {
          this.setState('drawn');
          // (and the rest of the ward with it: those a short walk off, on its own floor)
          Brain.call(this, 16, (o) => { if (o.state === 'drawn' || Math.abs(o.pos.y - this.pos.y) > 3) return; o.target = lit.id; o.lastKnown = at; o.lastLit = 0; o.setState('drawn'); });
        }
        // (one of them that has the light keeps the whole drawn ward on it)
        for (const o of this.g.monsters.values()) if (o.type === 'sister' && !o.dead && o.state === 'drawn' && o.target === lit.id) { o.lastKnown = at; o.lastLit = 0; }
        this.target = lit.id; this.lastKnown = at; this.lastLit = 0;
      } else if (this.state !== 'drawn' && !(this.jerk && this.jerk.t > 0)) {
        // a noise: the head goes round to it, and a twitch or two that way
        const h = Brain.hear(this, this.cfg.ear);
        if (h && h.loud > 0.15) this.jerk = { a: Math.atan2(h.x - this.pos.x, h.z - this.pos.z), t: 1.1, n: 1 + (this.id % 2) };
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
        if (this.atk <= 0 && this.reaches(tgt, 1.35)) {
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
        const j = this.jerk;
        if (j && j.t > 0) {
          j.t -= dt; this.turnTo(j.a, 9, dt);
          // (a twitch: a jolt of a step, then still again)
          if (Math.sin(((1.1 - j.t) / 1.1) * j.n * TAU) > 0.7) this.stepToward(this.pos.x + Math.sin(j.a), this.pos.z + Math.cos(j.a), 2.2, dt, 9); else this.speedNow = 0;
          break;
        }
        // now and then a few steps somewhere close by on its own floor, slowly
        if (!this.goal && this.st > 10 + (this.id % 7) * 2) { this.goal = this.randomGoal(2, 8); this.st = 0; }
        if (this.goal) { if (this.moveTo(this.goal.x, this.goal.z, 0.8, dt) < 0.6 || this.st > 12) { this.goal = null; this.st = 0; } }
        else this.speedNow = 0;
      }
    }
  }
  // The Bound: lies still like a body, across a corridor or just inside a doorway where people pass, and gets up when
  // someone's close enough to touch it, or makes a noise right by it. It listens, lying there: footsteps a way off and
  // nobody coming its way, it gets up and goes to lie down again where they'll come by (round a corner, beside a doorway:
  // somewhere you don't see it till you're on it). Up, it lurches after you, retching a caustic mist at where you're
  // headed when you keep out of its reach. Lose it, and it lies down again across the way you'll go back
  ai_bound(dt) {
    const fac = this.g.fac;
    this.cool -= dt; this.moveCd = (this.moveCd || 0) - dt;
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
        if (!tgt) { this.setState('shamble'); this.goal = this.lieSpot(); break; }
        this.track(tgt, this.cfg.eye, 10, dt);
        if (this.memory <= 0) { const r = Brain.recall(this, tgt.id); this.target = null; this.extra = -1; this.setState('shamble'); this.goal = this.lieSpot(r); break; }
        this.extra = tgt.id;
        const d = Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z);
        this.moveTo(this.lastKnown.x, this.lastKnown.z, 2.8 * (0.55 + 0.45 * Math.abs(Math.sin(this.st * 2.6))), dt, { gy: this.lastKnown.y, turn: 5 });
        if (this.atk <= 0 && this.reaches(tgt, 1.3)) {
          this.atk = 1.6; const n = Math.max(d, 0.3);
          this.g.emitSound('bound_slam', this.center(), { vol: 1 });
          this.g.hurtPlayer(tgt.id, 22, 'bound', (tgt.pos.x - this.pos.x) / n * 7, (tgt.pos.z - this.pos.z) / n * 7);
        }
        // (the mist goes where you'll be when it lands, a moment after the retch)
        if (this.aware && d > 3 && d < 9 && this.cool <= 0 && fac.los(this.pos.x, this.pos.z, tgt.pos.x, tgt.pos.z)) {
          const e = Brain.P.get(tgt.id), a = e ? Brain.ahead(tgt.pos.x, tgt.pos.z, e.vx, e.vz, 0.9) : tgt.pos;
          this.setState('spit'); this.spitAt = { x: a.x, y: tgt.pos.y, z: a.z }; this.spat = false;
        }
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
        if (!this.goal) this.goal = this.lieSpot() || this.randomGoal(5, 18);
        const p = this.detect(this.cfg.find);
        if (p) { this.target = p.id; this.memory = 10; this.setState('lurch'); break; }
        if (this.moveTo(this.goal.x, this.goal.z, 1.3, dt) < 0.7 || this.st > 30) { this.goal = null; this.ry += this.roomiest(this.pos.x, this.pos.y, this.pos.z, this.ry + Math.PI, 1.8); this.setState('lie'); this.passT = 0; }
        break;
      }
      default: {
        // lying there like a body (where it was put down at first, turned so it lies along the floor, not into a wall)
        if (this.state !== 'lie') this.setState('lie');
        if (!this.laid) { this.laid = true; this.ry += this.roomiest(this.pos.x, this.pos.y, this.pos.z, this.ry + Math.PI, 1.8); }
        this.speedNow = 0; this.extra = -1;
        let p = this.nearestPlayer(2.6, (q) => this.reaches(q, 2.6));
        if (!p && this.nearestPlayer(6, (q) => Math.abs(q.pos.y - this.pos.y) < 2)) this.passT = 0; else this.passT = (this.passT || 0) + dt;
        // (listening: a footstep or a word right by it is as good as a touch; further off, it goes to lie in their way)
        this.scanT -= dt;
        const h = !p && this.scanT <= 0 ? ((this.scanT = 0.3), Brain.hear(this, 2.4)) : null;
        if (h && h.pd < 3 && h.pid != null) p = this.g.players.get(h.pid);
        if (p && p.alive) { this.target = p.id; this.memory = 10; Brain.remember(this, p, 1, 'touch'); this.lastKnown = { x: p.pos.x, z: p.pos.z, y: p.pos.y }; this.setState('rise'); this.g.emitSound('bound_rise', this.center(), { vol: 1.2 }); break; }
        if (h && h.kind === 'step' && h.pd > 6 && this.passT > 6 && this.moveCd <= 0) {
          const g = this.lieSpot(null, h);
          this.moveCd = g ? 20 : 4;
          if (g && Math.hypot(g.x - this.pos.x, g.z - this.pos.z) > 2) { this.goal = g; this.setState('shamble'); break; }
        }
        if (this.passT > 90 + (this.id % 5) * 15) { this.goal = this.lieSpot(); this.setState('shamble'); }
      }
    }
  }
  // somewhere to lie: by a doorway or round a corner on its floor, where the crew come by and see it late. r: someone
  // it lost (lying across their way back out, within reach). h: footsteps it heard (near where they were made, out of
  // sight of there)
  lieSpot(r, h) {
    const fac = this.g.fac;
    const route = r && r.k >= 0 ? new Set(fac.route(fac.homeField(), r.k, 14)) : null;
    let C = this.ambushSpots(h ? Math.min(32, h.pd + 10) : 22, h ? { x: h.x, z: h.z, r: 10 } : null, route);
    // (not right where they were, and better somewhere they couldn't see it from there)
    if (C && h) { C = C.filter((c) => Math.hypot(c.x - h.x, c.z - h.z) > 3); for (const c of C) if (fac.los(c.x, c.z, h.x, h.z)) c.s *= 0.4; C.sort((a, b) => b.s - a.s); }
    const c = this.pickSpot(C);
    return c ? { x: c.x, z: c.z, y: c.y } : null;
  }
  // The Executioner: no senses to speak of, and it needs none: it walks toward the nearest of you, wherever you are in
  // the building, never hurrying, never stopping; up close it lifts the blade (slowly: there's a moment to get out of
  // reach) and brings it down
  ai_executioner(dt) {
    const fac = this.g.fac;
    // (nearest by the way it would have to walk, through the building and up and down the stairs, weighed again every
    // couple of seconds; it keeps to the one it chose for a while, and then only turns to another a good deal nearer,
    // so it never swings back and forth between two of you)
    let tgt = this.target != null ? this.g.players.get(this.target) : null;
    if (tgt && (!tgt.alive || tgt.zone !== 'in')) { tgt = null; this.target = null; }
    this.held = (this.held || 0) + dt; this.pickT = (this.pickT || 0) - dt;
    if (!tgt || (this.pickT <= 0 && this.held > 8)) {
      this.pickT = 3;
      // (the walk is never shorter than the straight line, so anyone already too far that way isn't walked to at all)
      let best = tgt, bd = tgt ? this.walkLen(tgt.pos.x, tgt.pos.z, tgt.pos.y) * 0.75 : Infinity;
      for (const p of this.playersIn()) {
        if (p === tgt || Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z, p.pos.y - this.pos.y) >= bd) continue;
        const d = this.walkLen(p.pos.x, p.pos.z, p.pos.y); if (d < bd) { bd = d; best = p; }
      }
      if (!best) best = this.nearestPlayer(Infinity);
      if (best && best !== tgt) { tgt = best; this.target = best.id; this.held = 0; }
    }
    // let loose on someone (see Brain's director), it goes for them and nobody else
    const prey = Brain.prey(this);
    if (prey && prey.alive && prey.zone === 'in' && this.state !== 'swing') { tgt = prey; this.target = prey.id; this.held = 0; }
    if (!tgt) { if (this.state !== 'swing') { this.setState('stand'); this.speedNow = 0; this.extra = -1; } }
    if (this.state === 'swing') {
      this.speedNow = 0;
      if (tgt && this.st < 1.05) this.turnTo(Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), 1.4, dt);
      if (this.st >= 1.05 && !this.struck) {
        this.struck = true;
        const f = this.forward(); let hit = false;
        for (const p of this.playersIn()) {
          const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
          if (d < 2.9 && Math.abs(p.pos.y - this.pos.y) < 1.6 && (dx * f.x + dz * f.z) / (d || 1) > 0.3 && this.clearTo(p)) { this.strike(p, 'executioner', 45); hit = true; }
        }
        this.g.emitSound(hit ? 'blade_flesh' : 'blade_floor', new THREE.Vector3(this.pos.x + f.x * 2, this.pos.y + 0.2, this.pos.z + f.z * 2), { vol: 1.3, ref: 6 });
        this.g.addNoise(this.pos, 30, 'in', null, 'bang', this.id);
      }
      if (this.st > 2.5) { this.struck = false; this.setState(tgt ? 'walk' : 'stand'); }
      return;
    }
    if (!tgt) return;
    this.extra = tgt.id;
    const d = Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), close = d < 4 && Math.abs(tgt.pos.y - this.pos.y) < 1.5 && fac.los(this.pos.x, this.pos.z, tgt.pos.x, tgt.pos.z);
    // Not let loose on them: it comes right up and stands over them a few seconds, blade on the floor, then turns and
    // walks off a while
    this.backT = (this.backT || 0) - dt;
    if (this.backT > 0) { if (this.state !== 'walk') this.setState('walk'); if (!this.away || this.moveTo(this.away.x, this.away.z, 2.2, dt, { gy: this.away.y, turn: 3 }) < 1) this.away = this.randomGoal(15, 30); return; }
    if (close && !Brain.mayKill(this, tgt)) {
      if (this.state !== 'stand') this.setState('stand');
      this.speedNow = 0; this.turnTo(Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), 1.4, dt);
      if (this.st > 4) { this.backT = 12; this.away = this.randomGoal(15, 30); }
      return;
    }
    if (this.state !== 'walk') this.setState('walk');
    // (it walks while it's watched; unwatched it covers the ground a good deal faster; let loose on someone heading home,
    // it goes to meet them on their way out)
    const seen = Brain.seenBy(this, { eye: 2.2, range: 35, dot: 0.55 }, this.seers || (this.seers = [])).length > 0;
    let gx = tgt.pos.x, gz = tgt.pos.z, gy = tgt.pos.y, sp = seen ? 2.2 : 4.0;
    if (prey === tgt && d > 14 && Brain.homebound(tgt)) {
      if ((this.cutT = (this.cutT || 0) - dt) <= 0) { this.cutT = 2; this.cut = Brain.cutoff(this, tgt, 4.0); }
      if (this.cut) { gx = this.cut.x; gz = this.cut.z; gy = this.cut.y; if (Math.hypot(gx - this.pos.x, gz - this.pos.z) < 1) sp = 0; }
    } else this.cut = null;
    if (sp > 0) this.moveTo(gx, gz, sp, dt, { gy, turn: 3 });
    else { this.speedNow = 0; this.turnTo(Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), 1.4, dt); }
    if (d < 2.3 && close) { this.setState('swing'); this.g.emitSound('blade_lift', this.center(), { vol: 1.2, ref: 5 }); }
  }
  // the nearest place on its floor within 25 m where p went to ground after a fright before (Brain.hides), or null
  hideNear(p) {
    const fac = this.g.fac, W = fac.W; let best = null, bd = 25;
    for (const k of Brain.hides(p.id)) { const x = fac.cx(k % W), z = fac.cz((k - (k % W)) / W), y = fac.tileY(k); const d = Math.hypot(x - this.pos.x, z - this.pos.z); if (d < bd && Math.abs(y - this.feetY()) < 2.5) { bd = d; best = { x, z, y }; } }
    return best;
  }
  // somewhere on its own floor, a walk of 6 to 24 m, out of tgt's sight and well away from them
  hiddenSpot(tgt) {
    const fac = this.g.fac, W = fac.W;
    const score = (k) => { const x = fac.cx(k % W), z = fac.cz((k - (k % W)) / W); if (!tgt) return 1; return (fac.los(tgt.pos.x, tgt.pos.z, x, z, true) ? 0.02 : 1) * (1 + Math.min(20, Math.hypot(x - tgt.pos.x, z - tgt.pos.z)) / 10); };
    return this.randomGoal(6, 24, null, score) || this.randomGoal(6, 20);
  }
  ai_mannequin(dt) {
    // (watched: someone looking its way, with light to see it by; and for a moment after, since what's on a crewmate's
    // screen is a little behind)
    if (Brain.seenBy(this, { eye: 1.4, range: 45, dot: 0.5 }, this.seers || (this.seers = [])).length || this.spawnT < 2.5) this.obsT = Math.max(this.obsT || 0, 0.15);
    else this.obsT = (this.obsT || 0) - dt;
    const observed = this.obsT > 0;
    if (observed) {
      if (!this.observed) this.speedNow = 0;
      this.observed = true; this.speedNow = 0; return;
    }
    if (this.observed) { this.extra = Math.floor(Math.random() * 1e6); }
    this.observed = false;
    let tgt = this.target != null ? this.g.players.get(this.target) : null;
    if (tgt && (!tgt.alive || tgt.zone !== 'in')) { tgt = null; this.target = null; }
    if (!tgt) { const p = this.detect(this.cfg.eye); if (p) { tgt = p; this.target = p.id; this.memory = 12; } }
    if (tgt) { this.track(tgt, this.cfg.eye, 12, dt); if (this.memory <= 0) { tgt = null; this.target = null; } }
    // let loose on someone (see Brain's director), it knows where they are
    const prey = Brain.prey(this);
    if (prey && prey.alive && prey.zone === 'in') { tgt = prey; this.target = prey.id; this.memory = 12; this.aware = true; this.lastKnown = { x: prey.pos.x, z: prey.pos.z, y: prey.pos.y }; }
    if (tgt) {
      this.setState('hunt');
      // (close to any of you it keeps to a pace a crewmate's screen, a moment behind, can't catch it covering)
      let near = Infinity; for (const p of this.playersIn()) near = Math.min(near, Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z));
      const rem = this.moveTo(this.lastKnown.x, this.lastKnown.z, near < 6 ? 4.5 : 9.8, dt, { turn: 20, gy: this.lastKnown.y });
      if (!this.aware && rem < 1.2) this.memory -= dt * 3;
      // (not let loose on you: it has its hands on you a moment, then stands stock still a while, and is gone)
      if (this.reaches(tgt, 1.05) && !this.strike(tgt, 'mannequin', 25)) { this.obsT = 6; this.target = null; this.goal = this.randomGoal(10, 25); }
    } else {
      this.setState('roam');
      const n = Brain.hear(this, this.cfg.ear);
      if (n) { this.goal = { x: n.x, z: n.z }; this.st = 0; }
      if (!this.goal || this.st > 15) { this.goal = this.randomGoal(8, 30); this.st = 0; }
      if (this.moveTo(this.goal.x, this.goal.z, n ? 6 : 3.5, dt) < 1) this.goal = null;
    }
  }
  ai_leech(dt) {
    const fac = this.g.fac;
    // It goes the way a thing that clings does: over the ceiling, and where the ceiling steps down (a doorway's lintel,
    // a tall room giving onto a corridor) down the wall to it, at the wall, and where it steps up again, up the wall on
    // the far side before it goes on; never up or down through the open air.
    // (the doors round about, looked up again once it has gone a few metres)
    if (!this.nearDoors || Math.hypot(this.pos.x - this.nearDoors.x, this.pos.z - this.nearDoors.z) > 3) this.nearDoors = { x: this.pos.x, z: this.pos.z, l: fac.doors.filter((d) => Math.abs(d.x - this.pos.x) < 5.5 && Math.abs(d.z - this.pos.z) < 5.5) };
    // (the ceiling over a point: the room's, or a doorway's lintel right in the doorway)
    const over = (x, z) => {
      const y0 = this.pos.y - 3; let c = fac.floorAt(fac.ti(x), fac.tj(z)) ? fac.ceilY(x, z, y0) : Infinity;
      for (const d of this.nearDoors.l) {
        if (Math.abs(d.y - y0) > 3) continue;
        const along = (x - d.x) * d.nx + (z - d.z) * d.nz, lat = (x - d.x) * -d.nz + (z - d.z) * d.nx;
        if (Math.abs(along) < 0.22 && Math.abs(lat) < 0.9) c = Math.min(c, d.y + Facility.DH);
      }
      return c;
    };
    // (where it should cling: the ceiling over it, or one a step lower just ahead, climbed down to at the wall first)
    const ceilY = () => {
      const f = this.forward(); let c = Math.min(over(this.pos.x, this.pos.z), over(this.pos.x + f.x * 0.3, this.pos.z + f.z * 0.3));
      return (c === Infinity ? fac.ceilY(this.pos.x, this.pos.z, this.pos.y - 3) : c) - 0.18;
    }, floorY = () => fac.floorY(this.pos.x, this.pos.z, this.pos.y);
    // (it climbs at 2.5 m/s, and goes nowhere while it's climbing: true while it's still on the way)
    const cling = () => { const c = ceilY(); this.pos.y += clamp(c - this.pos.y, -2.5 * dt, 2.5 * dt); return Math.abs(this.pos.y - c) > 0.15; };
    switch (this.state) {
      case 'crawl': {
        if (!this.goal) {
          // somewhere on a low ceiling on its own floor (it never crawls down a stairwell) where the crew will pass under
          // (one of a nest's brood mostly keeps by it, over the ways in)
          this.goal = (this.home && !this.heardAt && Math.random() < 0.75 && this.homeGoal()) || this.perch(this.heardAt) || this.randomGoal(4, 16, (p) => fac.ceilAt(p.x, p.z) <= 3.6) || this.randomGoal(3, 10);
          this.hurry = !!this.heardAt; this.heardAt = null; this.st = 0;
        }
        // (down on the floor, it was knocked off or fell: it scuttles to the nearest wall, turns its back to the room
        // and goes straight up it to the ceiling; up against the wall, or whatever's standing in front of it, or getting
        // no nearer, it starts up from there, and once it's started it keeps going till it's up)
        if (!this.climb && this.pos.y - floorY() < 0.3 && ceilY() - this.pos.y > 0.6) {
          if (!this.wallAt) { this.wallAt = this.nearestWall(); this.wallT = 0; this.wallD = Infinity; this.wallProg = 0; }
          const w = this.wallAt;
          if (w) {
            const d = Math.hypot(w.wx - this.pos.x, w.wz - this.pos.z);
            this.wallT += dt; this.wallProg += dt;
            if (d < this.wallD - 0.05) { this.wallD = d; this.wallProg = 0; }
            if (d > this.def.radius + 0.3 && this.wallProg < 0.7 && this.wallT < 4) { this.moveTo(w.wx, w.wz, 1.8, dt); this.pos.y = floorY(); break; }
            this.ry = this.rry = Math.atan2(this.pos.x - w.wx, this.pos.z - w.wz);
          }
          this.wallAt = null; this.climb = true;
        }
        if (cling()) { this.speedNow = 0; break; }
        this.climb = false;
        // (someone it's after: it keeps its eye on them and heads for where they're going; up over them, it lets go)
        if (this.stalk != null) {
          const p = this.g.players.get(this.stalk);
          if (!p || !p.alive || p.zone !== 'in' || this.st > 20) this.stalk = null;
          else {
            if (this.seesBelow(p, 12)) { this.lostT = 0; const e = Brain.P.get(p.id); this.goal = { x: p.pos.x + (e ? e.vx * 0.5 : 0), z: p.pos.z + (e ? e.vz * 0.5 : 0) }; }
            else if ((this.lostT = (this.lostT || 0) + dt) > 3) this.stalk = null;
            if (this.tryDrop()) break;
          }
        }
        // (scuttling, when it's heard someone)
        // (it goes like a bug: a quick scuttle, then dead still a moment, then another; shorter stops in a hurry)
        this.scutT = (this.scutT || 0) - dt;
        if (this.scutT <= 0) { this.still = !this.still; this.scutT = this.still ? 0.12 + Math.random() * (this.hurry ? 0.2 : 0.55) : 0.35 + Math.random() * 0.9; }
        if (this.still) { this.speedNow = 0; if (this.st > 25) { this.setState('wait'); this.goal = null; this.nearT = 0; } break; }
        const rem = this.moveTo(this.goal.x, this.goal.z, (this.hurry ? 2.3 : 1.6) * 1.45, dt);
        cling();
        if ((rem < 0.5 && this.stalk == null) || this.st > 25) { this.setState('wait'); this.goal = null; this.nearT = 0; this.stalk = null; }
        break;
      }
      case 'wait': {
        cling(); this.speedNow = 0;
        // whoever's below it and about to pass under: it lets go (reaching for where they'll be as it falls)
        if (this.tryDrop()) break;
        let close = false;
        for (const p of this.playersIn()) { const dy = this.pos.y - p.pos.y; if (dy > 0 && dy < 5 && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 8) close = true; }
        // someone in sight down there, not coming its way: it goes after them across the ceiling, scuttling
        if (this.st > 1.5) {
          for (const p of this.playersIn()) if (this.seesBelow(p, 10)) { this.stalk = p.id; this.lostT = 0; this.goal = { x: p.pos.x, z: p.pos.z }; this.hurry = true; this.setState('crawl'); break; }
          if (this.state !== 'wait') break;
        }
        this.nearT = close ? 0 : (this.nearT || 0) + dt;
        // footsteps somewhere off, and nobody's come by here a while: it goes to meet them
        this.scanT -= dt;
        if (this.scanT <= 0) {
          this.scanT = 0.5;
          const h = this.st > 5 && this.nearT > 4 ? Brain.hear(this, this.cfg.ear, this.cfg.K) : null;
          if (h && h.pd > 6) { this.heardAt = { x: h.x, z: h.z, y: h.y, pd: h.pd }; this.setState('crawl'); break; }
        }
        if (this.st > 90 || (this.st > 35 && this.nearT > 30)) this.setState('crawl');
        break;
      }
      case 'drop': {
        const v = this.g.players.get(this.victim);
        const targetY = v ? v.pos.y + 1.75 : floorY() + 0.2;
        this.pos.y = Math.max(targetY, this.pos.y - dt * 14);
        // (falling, it reaches out a little for them)
        if (this.dropTo) { const dx = this.dropTo.x - this.pos.x, dz = this.dropTo.z - this.pos.z, dd = Math.hypot(dx, dz), s = Math.min(dd, 4 * dt); if (dd > 0.01) { this.pos.x += dx / dd * s; this.pos.z += dz / dd * s; fac.collide(this.pos, this.def.radius); } }
        if (this.st > 0.3) {
          if (v && v.alive && v.zone === 'in' && Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z) < 1.4 && Math.abs(v.pos.y + 1.75 - this.pos.y) < 1) {
            this.setState('attached'); this.grip = 100; this.extra = v.id; this.dmgAcc = 0;
            this.g.leechAttach(this, v.id);
          } else { this.setState('fallen'); this.pos.y = floorY(); }
          this.dropTo = null;
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
        // (it scrabbles off a little way, then makes for the wall and goes back up)
        this.moveTo(this.goal.x, this.goal.z, 2.4, dt);
        if (this.st > 1.4) { this.goal = null; this.setState('crawl'); }
        break;
      }
      default: this.setState('crawl');
    }
  }
  // whoever's right under it (or about to be): it lets go, reaching for where they'll be as it falls
  tryDrop() {
    for (const p of this.playersIn()) {
      const dy = this.pos.y - p.pos.y; if (dy <= 0 || dy > 7) continue;
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z), e = Brain.P.get(p.id);
      const ax = p.pos.x + (e ? e.vx * 0.3 : 0), az = p.pos.z + (e ? e.vz * 0.3 : 0);
      if ((d < 1.05 || Math.hypot(ax - this.pos.x, az - this.pos.z) < 0.9) && this.clearTo(p)) { this.victim = p.id; this.dropTo = { x: ax, z: az }; this.stalk = null; this.setState('drop'); this.g.emitSound('leech_drop', this.pos, { vol: 0.9 }); return true; }
    }
    return false;
  }
  // somewhere about the nest it came out of: up by it, or over one of the ways into its room
  homeGoal() {
    const n = this.g.fac.nest; if (!n || Math.abs(this.pos.y - (n.Y + n.h)) > 2) return null;
    const s = n.spots[Math.floor(Math.random() * n.spots.length)];
    return { x: s.x + (Math.random() - 0.5) * 0.6, z: s.z + (Math.random() - 0.5) * 0.6 };
  }
  // someone it can see down below it, on this floor, within r (and not already right underneath)
  seesBelow(p, r) {
    const dy = this.pos.y - p.pos.y, d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    return p.alive && p.zone === 'in' && dy > 0.5 && dy < 6 && d < r && this.g.fac.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z, true);
  }
  // the nearest wall round about, felt for in a ring (within 4 m): where to stand against it (x, z) and the point on it
  // (wx, wz). null if there's none that near
  nearestWall() {
    const fac = this.g.fac, x0 = this.pos.x, z0 = this.pos.z; let best = null, bd = 4;
    for (let a = 0; a < 16; a++) {
      const ux = Math.sin((a / 16) * TAU), uz = Math.cos((a / 16) * TAU);
      for (let d = 0.3; d < bd; d += 0.25) if (!fac.los(x0, z0, x0 + ux * d, z0 + uz * d)) { bd = d; best = { x: x0 + ux * Math.max(0, d - 0.4), z: z0 + uz * Math.max(0, d - 0.4), wx: x0 + ux * d, wz: z0 + uz * d }; break; }
    }
    return best;
  }
  // somewhere on the ceiling to wait (see ambushSpots): over the middle of a doorway, where whoever comes through passes
  // right under it, or a corridor the crew use; having heard someone, as near there as it can get
  perch(heard) {
    const c = this.pickSpot(this.ambushSpots(heard ? Math.min(30, heard.pd + 8) : 22, heard ? { x: heard.x, z: heard.z, r: 9 } : null, null, true));
    return c ? { x: c.x, z: c.z, y: c.y } : null;
  }
  detach() {
    if (this.state !== 'attached') return;
    const vid = this.victim;
    this.victim = null; this.extra = -1;
    this.setState('fallen'); this.pos.y = this.g.fac ? this.g.fac.floorY(this.pos.x, this.pos.z, this.pos.y) : this.pos.y; this.goal = null;
    this.g.leechDetach(this, vid);
  }
  // The Hollow Hound: blind, it goes by sound. A noise near enough and it lunges at it, howling (and the howl brings the
  // rest of the pack); further off, it goes to see. Close to someone keeping still it smells them: it noses about a
  // moment, then bites, if they're still there (moving off quietly is how to live). It goes round the ship, not into
  // its hull; through the hatch only after someone it heard inside
  ai_hound(dt) {
    const h = Brain.hear(this, this.cfg.ear);
    const near = (r) => { let best = null, bd = r; for (const p of this.playersIn()) { const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z); if (d < bd && Math.abs(p.pos.y - this.pos.y) < 2) { bd = d; best = p; } } return best; };
    const bite = (p) => {
      if (this.atk > 0 || !p) return;
      const f = this.forward(); this.g.hurtPlayer(p.id, 60, 'hound', f.x * 6, f.z * 6); this.atk = 1.5;
      if (!p.alive) this.setState('eat');
    };
    // (someone at its jaws: heard just now, or moving, it has them; keeping still, it has to find them by the smell)
    const jaws = () => {
      const p = near(2.2); if (!p) return;
      const e = Brain.P.get(p.id), moving = (e ? e.spd > 0.6 : p.moving) || (h && h.pid === p.id && h.loud > 0.3);
      if (moving) { if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.6) bite(p); }
      else if (this.state !== 'sniff') { this.setState('sniff'); this.scent = p.id; }
    };
    if (h && this.state !== 'lunge' && this.state !== 'eat') {
      if (h.pd < 9) this.lungeAt(h.x, h.z);
      else if (this.state !== 'chase') { this.goal = { x: h.x, z: h.z }; if (this.state !== 'investigate') { this.setState('investigate'); this.g.emitSound('hound_growl', this.pos, { vol: 1.1 }); } }
      else this.goal = { x: h.x, z: h.z };
    }
    switch (this.state) {
      case 'wander': {
        // (aboard, after someone it followed in: the way out is along the bay to the airlock and down the ramp)
        if (this.g.ship.inside(this.pos.x, this.pos.y + 0.5, this.pos.z)) { const dx = (SHIP.doorX0 + SHIP.doorX1) / 2, aisle = Math.abs(this.pos.x - dx) > 0.3 && this.pos.z < 2; this.goal = null; this.stepToward(dx, aisle ? 1.3 : 8.5, 2.2, dt, 6); break; }
        if (!this.goal || this.st > 14) { this.goal = this.randomGoal(10, 40); this.st = 0; }
        if (this.steer(this.goal.x, this.goal.z, 2.2, dt, 2.5) < 1.5) this.goal = null;
        jaws();
        break;
      }
      case 'investigate': {
        if (!this.goal) { this.setState('wander'); break; }
        const rem = this.steer(this.goal.x, this.goal.z, 5.2, dt, 3);
        if (rem < 1.5) { this.goal = null; this.setState('sniff'); this.scent = null; }
        if (this.st > 15) this.setState('wander');
        jaws();
        break;
      }
      case 'sniff': {
        // nosing about: whoever's keeping still close by, it creeps up on by the smell, and after a moment bites
        const p = this.scent != null ? this.g.players.get(this.scent) : near(2.2);
        if (p && p.alive && p.zone === 'out') {
          const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
          if (d > 2.6) { this.scent = null; this.speedNow = 0; }
          else { if (d > 1.2) this.stepToward(p.pos.x, p.pos.z, 0.7, dt, 3); else { this.turnTo(Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 3, dt); this.speedNow = 0; } if (this.st > 1.2 && d < 1.6) bite(p); }
        } else this.speedNow = 0;
        if (this.st > 3.5) { this.scent = null; this.setState('wander'); }
        break;
      }
      case 'lunge': {
        const f = this.forward();
        this.turnTo(Math.atan2(this.lunge.x - this.pos.x, this.lunge.z - this.pos.z), 4, dt);
        const ox = this.pos.x, oz = this.pos.z;
        this.hop(f.x, f.z, 13 * dt);
        this.speedNow = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
        // (committed, at what it heard: whoever's in its way gets bitten)
        const p = near(1.6); if (p) bite(p);
        if (this.st > 0.75) { this.goal = { x: this.lunge.x, z: this.lunge.z }; this.setState('chase'); }
        break;
      }
      case 'chase': {
        if (!this.goal) { this.setState('wander'); break; }
        this.steer(this.goal.x, this.goal.z, 8.5, dt, 4);
        jaws();
        if (this.st > 3) { this.setState('investigate'); }
        break;
      }
      case 'eat': { this.speedNow = 0; if (this.st > 6) this.setState('wander'); break; }
      default: this.setState('wander');
    }
    // stuck (nosing round the ship's legs, or against a wall): no headway toward where it's going for a couple of
    // seconds, whatever it's doing, and it gives up on it and goes somewhere else
    if (this.goal && (this.state === 'wander' || this.state === 'investigate' || this.state === 'chase')) {
      const d = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
      if (this.hwGoal !== this.goal || d < this.hw - 0.5) { this.hwGoal = this.goal; this.hw = d; this.stuckT = 0; }
      else if ((this.stuckT += dt) > 2) { this.goal = this.randomGoal(8, 20); this.stuckT = 0; if (this.state === 'chase') this.setState('investigate'); }
    } else this.stuckT = 0;
  }
  // at a noise near enough: the lunge, and the howl that brings the rest of the pack within a long way to look
  lungeAt(x, z) {
    this.lunge = { x, z }; this.setState('lunge'); this.g.emitSound('hound_roar', this.pos, { vol: 1.4 });
    Brain.call(this, 60, (o) => { if (o.state === 'wander' || o.state === 'sniff' || o.state === 'investigate') { o.goal = { x, z }; o.setState('investigate'); } });
  }
  // outdoors, straight at (tx, tz), unless the ship's hull is in the way: round the nearer end of it. Somewhere aboard:
  // up the ramp and in at the hatch. Returns how far it still is
  steer(tx, tz, speed, dt, turn) {
    const ship = this.g.ship, dx = (SHIP.doorX0 + SHIP.doorX1) / 2, x = this.pos.x, z = this.pos.z;
    let wx = tx, wz = tz;
    if (!ship.inside(x, this.pos.y + 0.5, z)) {
      if (ship.inside(tx, 0.5, tz)) {
        // (in by the ramp: to its foot, then straight up it)
        const onRamp = Math.abs(x - dx) < 0.7 && z > 3.6 && z < 9.5;
        if (onRamp) { wx = dx; wz = 2.6; } else { wx = dx; wz = 8.6; }
      }
      const w = Monster.rectDetour(x, z, wx, wz, -7.55, 8.6, -4.45, 4.45, 1.5);
      if (w) { wx = w.x; wz = w.z; }
    }
    this.stepToward(wx, wz, speed, dt, turn);
    return Math.hypot(tx - this.pos.x, tz - this.pos.z);
  }
  // the way round a box (x0..x1, z0..z1) in the way of a straight walk from a to b: the corner (grown by m) to make for
  // first, or null if the box isn't in the way (or a is in it)
  static rectDetour(ax, az, bx, bz, x0, x1, z0, z1, m) {
    const cross = (px, pz, qx, qz) => {
      // (the segment against the box, by slabs; just touching it doesn't count)
      let t0 = 0, t1 = 1; const dx = qx - px, dz = qz - pz;
      for (const [o, d, lo, hi] of [[px, dx, x0, x1], [pz, dz, z0, z1]]) {
        if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) return false; continue; }
        let a = (lo - o) / d, b = (hi - o) / d; if (a > b) { const t = a; a = b; b = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 >= t1) return false;
      }
      return t1 - t0 > 1e-6;
    };
    if ((ax > x0 && ax < x1 && az > z0 && az < z1) || !cross(ax, az, bx, bz)) return null;
    const C = [[x0 - m, z0 - m], [x1 + m, z0 - m], [x1 + m, z1 + m], [x0 - m, z1 + m]];
    let best = null, bl = Infinity;
    for (let i = 0; i < 4; i++) {
      // (one it's already at doesn't count: on to the next leg from there)
      const [px, pz] = C[i], l = Math.hypot(px - ax, pz - az); if (l < 0.8 || cross(ax, az, px, pz)) continue;
      if (!cross(px, pz, bx, bz)) { const L = l + Math.hypot(bx - px, bz - pz); if (L < bl) { bl = L; best = { x: px, z: pz }; } }
      for (const j of [(i + 1) % 4, (i + 3) % 4]) { const [qx, qz] = C[j], L = l + Math.hypot(qx - px, qz - pz) + Math.hypot(bx - qx, bz - qz); if (L < bl && !cross(qx, qz, bx, bz)) { bl = L; best = { x: px, z: pz }; } }
    }
    return best;
  }
  // The Seep: it feels for crewmates through the floor (footsteps on its own floor, through walls and doors, a run from
  // further off, a voice hardly at all; anyone right up against it whether they move or not) and comes after them slowly,
  // without ever stopping, to where it last felt them. With nobody about it creeps off and settles across a corridor the
  // crew use, between them and the way out, a wall in the way, until something comes near; but never where it would shut
  // anybody in. It never opens a door. At a shut one it seeps through, under it or through the bars of its window, a
  // little at a time, and gathers itself on the other side (all at once if somebody opens the door on it). extra: who
  // it's after, or while seeping the door's id plus how far through
  // The Clown: too big for the building. Bent double under the ceiling, a shoulder to each wall, nobody gets past it
  // in a corridor (see Monster.push), and every doorway it has to fold itself through, slowly. It's slower than you,
  // even unwatched, and slower still while you look at it; it doesn't need to be quick. It hears you through the floors
  // (feet best), knows the short way round, and gets to the corridor you'll need before you do, and stands in it: it
  // herds rather than chases. It never pens you in for long with no way out: it gives you a while, then backs off.
  // Let loose on you by the director (see Brain), it comes on; until then, getting caught by it hurts, and it laughs.
  ai_clown(dt) {
    const fac = this.g.fac, my = this.feetY();
    const look = Brain.look(this, this.cfg.eye);
    if (look) Brain.remember(this, look.p, look.c, 'seen');
    const h = Brain.hear(this, this.cfg.ear, this.cfg.K);
    if (h) Brain.noted(this, h, Math.min(1, 0.4 + h.loud));
    const prey = Brain.prey(this);
    if (prey && prey.alive && prey.zone === 'in') Brain.remember(this, prey, 1, 'known');
    let mem = Brain.freshest(this), tgt = mem ? this.g.players.get(mem.pid) : null;
    // (it never goes up to the ground floor after anyone)
    if (tgt && tgt !== prey && fac.levelAt(tgt.pos.x, tgt.pos.z, tgt.pos.y) === 0) { Brain.forget(this, tgt.id); mem = null; tgt = null; }
    this.extra = tgt ? tgt.id : -1;
    // its pace: a crawl through a doorway, slower than crouching while it's watched, and never as quick as a walk
    const seen = Brain.seenBy(this, { eye: 2.4, range: 35, dot: 0.55 }, this.seers || (this.seers = [])).length > 0;
    const dp = this.doorPass, duck = !!(dp && Math.hypot(dp.d.x - this.pos.x, dp.d.z - this.pos.z) < 1.6);
    const vMax = duck ? 0.8 : seen ? 1.5 : 3.3, v0 = this.v || 0;
    this.v = v0 > vMax ? Math.max(vMax, v0 - 3 * dt) : Math.min(vMax, v0 + 0.8 * dt);
    if (this.state === 'grab') {
      this.speedNow = 0;
      const g = this.g.players.get(this.grabbing);
      if (g) this.turnTo(Math.atan2(g.pos.x - this.pos.x, g.pos.z - this.pos.z), 2, dt);
      if (this.st > 1.0 && !this.struck) {
        this.struck = true;
        if (g && g.alive && this.reaches(g, 1.9)) { this.g.emitSound('clown_honk', this.center(), { vol: 1.2, ref: 4 }); if (!this.strike(g, 'clown', 15)) this.g.emitSound('clown_giggle', this.headPos(), { vol: 1.2, ref: 4 }); }
      }
      if (this.st > 1.8) { this.struck = false; this.backT = 10; this.away = this.randomGoal(12, 25); this.setState('roam'); }
      return;
    }
    if (duck && this.state !== 'duck') { this.preDuck = this.state; this.setState('duck'); } else if (!duck && this.state === 'duck') this.setState(this.preDuck || 'roam');
    const st = (s) => { if (!duck) this.setState(s); };
    // backing off: giving whoever it had cornered their chance
    this.backT = (this.backT || 0) - dt;
    if (this.backT > 0) { st('roam'); if (!this.away || this.moveTo(this.away.x, this.away.z, this.v, dt, { gy: this.away.y }) < 1.2) this.away = this.randomGoal(12, 25); return; }
    if (!tgt) {
      st('roam'); this.cut = null;
      // (now and then it stops dead, to listen)
      if ((this.listenT = (this.listenT == null ? 5 : this.listenT) - dt) < 0) { this.speedNow = 0; if (this.listenT < -2.5) this.listenT = 6 + Math.random() * 8; return; }
      if (!this.goal || this.st > 25) { this.goal = this.randomGoal(10, 30, null, (k) => 1 + 3 * Brain.heat(k)); this.st = 0; }
      if (this.moveTo(this.goal.x, this.goal.z, this.v, dt) < 1.2) this.goal = null;
      return;
    }
    const d = Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), near = Math.abs(tgt.pos.y - my) < 2;
    const face = () => { this.speedNow = 0; this.turnTo(Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), 1.5, dt); };
    // close enough to take hold of them: it reaches out
    if (near && d < 1.7 && this.clearTo(tgt) && Brain.age(mem) < 1) { this.grabbing = tgt.id; this.struck = false; this.setState('grab'); return; }
    // lost them: where it last heard or saw them
    if (Brain.age(mem) > 4) { st('track'); this.cut = null; if (this.moveTo(mem.x, mem.z, this.v, dt, { gy: mem.y }) < 1.2) Brain.forget(this, mem.pid); return; }
    // let loose on them: it comes on
    if (Brain.mayKill(this, tgt)) { st('herd'); this.cut = null; this.moveTo(tgt.pos.x, tgt.pos.z, this.v, dt, { gy: tgt.pos.y }); return; }
    // herding: ahead of them on their way out, to stand in it; failing that, a few metres behind them, never closer
    if ((this.cutT = (this.cutT || 0) - dt) <= 0) { this.cutT = 3; if (this.state !== 'block' || d > 30) this.cut = Brain.cutoff(this, tgt, 3.3); }
    if (this.cut) {
      if (this.moveTo(this.cut.x, this.cut.z, this.v, dt, { gy: this.cut.y }) < 1) {
        if (this.state !== 'block') { st('block'); this.g.emitSound('clown_giggle', this.headPos(), { vol: 1.1, ref: 5 }); }
        face();
        // (if that leaves them no way out at all, it's a shorter while before it lets them go)
        if (this.st > (fac.trapped(Brain.node(tgt.pos.x, tgt.pos.z, tgt.pos.y), [Brain.node(this.pos.x, this.pos.z, my)]) ? 30 : 40)) { this.cut = null; this.backT = 15; this.away = this.randomGoal(15, 30); }
      } else st('herd');
      return;
    }
    st('herd');
    if (d > 6 || !near) this.moveTo(tgt.pos.x, tgt.pos.z, this.v, dt, { gy: tgt.pos.y }); else face();
  }
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
    if (tgt && (!tgt.alive || tgt.zone !== 'in')) { tgt = null; this.target = null; }
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.25;
      const h = Brain.hear(this, this.cfg.ear, this.cfg.K, { mode: 'floor', max: 22 });
      const p = h && h.pid != null && this.g.players.get(h.pid);
      if (p && p.alive && p.zone === 'in' && (!tgt || p === tgt || h.loud > 0.5)) { tgt = p; this.target = p.id; Brain.noted(this, h, 0.5 + 0.5 * h.loud); }
      for (const q of this.playersIn()) if (Math.hypot(q.pos.x - this.pos.x, q.pos.z - this.pos.z) < 2.5 && Math.abs(q.pos.y - this.pos.y) < 1.6 && this.clearTo(q)) { tgt = q; this.target = q.id; Brain.remember(this, q, 1, 'touch'); break; }
    }
    const r = tgt ? Brain.recall(this, tgt.id) : null;
    if (tgt && !r) { tgt = null; this.target = null; }
    this.doorAhead = null;
    if (r) {
      this.setState('hunt'); this.extra = tgt.id;
      const rem = this.moveTo(r.x, r.z, 1.25, dt, { doors: false, turn: 2.5, gy: r.y });
      // (where it last felt them, and nothing since: it gives them up)
      if (rem < 1 && Brain.age(r) > 4) { Brain.forget(this, tgt.id); this.target = null; }
    } else {
      this.extra = -1;
      if (this.state === 'block') { this.speedNow = 0; if (this.st > this.blockT) { this.setState('creep'); this.goal = null; } }
      else {
        if (this.state !== 'creep') { this.setState('creep'); this.goal = null; }
        if (!this.goal || this.st > 45) { this.goal = this.blockSpot() || this.randomGoal(8, 30, (p) => fac.grid[fac.idx(p.i, p.j)] === 1) || this.randomGoal(4, 20); this.st = 0; }
        if (this.moveTo(this.goal.x, this.goal.z, 0.8, dt, { doors: false, turn: 2 }) < 1) {
          this.goal = null;
          if (this.leavesWayOut(fac.nodeAt(this.pos.x, this.pos.z, this.pos.y))) { this.setState('block'); this.blockT = 35 + Math.random() * 55; }
        }
      }
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
  // where to settle: across a corridor the crew have to use (the narrow places on the way out, where they've been
  // walking), between them and the way out if any are about on its floor, and only where it leaves everyone a way out
  blockSpot() {
    const fac = this.g.fac, nv = fac.nav(), home = fac.homeField(), crew = [];
    for (const p of this.playersIn()) { const e = Brain.P.get(p.id); if (e && e.k >= 0) crew.push(e.k); }
    const score = (k) => {
      if (fac.grid[k] !== 1) return 0;
      let s = 0.15 + Math.min(2, nv.choke[k]) * (0.5 + 2 * Brain.heat(k));
      for (const c of crew) if (fac.lvl[c] === fac.lvl[k] && home[k] < home[c]) { s *= 1.6; break; }
      return s * s;
    };
    const w = this.wayOut();
    for (let t = 0; t < 3; t++) { const g = this.randomGoal(6, 34, null, score); if (!g) return null; if (this.leavesWayOut(g.k, w)) return g; }
    return null;
  }
  // With it lying across tile k (and anything else of its kind settled somewhere), can everybody inside still get out,
  // and every floor from here down still reach its stairs up?
  leavesWayOut(k, w = this.wayOut()) {
    const fac = this.g.fac; if (k < 0) return false;
    const after = fac.trapped(w.check, [k, ...w.others]);
    return after.every((t, i) => !t || w.before[i] || w.check[i] === k || (w.lv[i] && fac.lvl[w.check[i]] < fac.lvl[k]));
  }
  // what has to stay reachable from the ways out: everybody inside, and every floor's stairs up (as things stand, with
  // whatever else of its kind is already lying across a way)
  wayOut() {
    const fac = this.g.fac, nv = fac.nav(), others = [], check = [], lv = [];
    for (const o of this.g.monsters.values()) if (o !== this && !o.dead && o.type === 'slime' && o.state === 'block') others.push(fac.nodeAt(o.pos.x, o.pos.z, o.pos.y));
    for (const p of this.playersIn()) { const e = Brain.P.get(p.id); if (e && e.k >= 0) { check.push(e.k); lv.push(0); } }
    for (const q of nv.upList) { check.push(q); lv.push(1); }
    return { others, check, lv, before: fac.trapped(check, others) };
  }
  // whoever it reaches is shoved on ahead of it and burned; backed into a corner, swallowed
  engulf() {
    if (this.atk > 0) return;
    const f = this.forward(), sx = f.z, sz = -f.x;
    for (const p of this.playersIn()) {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, along = dx * f.x + dz * f.z, lat = dx * sx + dz * sz;
      if (Math.abs(p.pos.y - this.pos.y) > 1.6 || along < -0.95 || along > 1.25 || Math.abs(lat) > 1.45 || (this.g.fac && !this.clearTo(p))) continue;
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
    // (the Clown only staggers, honks, and laughs)
    if (this.type === 'clown') { this.g.emitSound('clown_honk', this.center(), { vol: 1.1, ref: 4 }); this.stun = Math.max(this.stun, 0.4); return; }
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
      this.rpos.set(tx, ty, tz);
      this.rry = a.ry + angDiff(a.ry, b.ry) * t;
    }
    const v = this.vis;
    // (a jump of more than a stride in a frame is a teleport: through a door it seeped under, out of a wall, onto a
    // ceiling; it isn't a burst of speed for its legs to flail at)
    const moved = Math.hypot(this.rpos.x - prevX, this.rpos.z - prevZ), sp = moved > 1.5 ? v.speed : moved / Math.max(dt, 1e-4);
    v.speed = damp(v.speed, Math.min(sp, 16), 10, dt);
    v.t += dt;
    this.mesh.position.copy(this.rpos);
    this.mesh.rotation.y = this.rry + (this.dead ? v.fallYaw || 0 : 0);
    if (MON_FRONT[this.type]) { this.headRoom(v, dt); this.mesh.position.x += v.hx; this.mesh.position.z += v.hz; }
    if (v.lastState !== this.state) { this.onStateChange(v.lastState, this.state, localPlayer); v.lastState = this.state; v.sT = 0; } else v.sT = (v.sT || 0) + dt;
    if (this.dead) { v.deathT = (v.deathT || 0) + dt; v.tw = this.twitchK(); }
    this['anim_' + this.type](dt, v, localPlayer);
    if (this.dead) this.presentDeath(v, dt);
    // footsteps, as a foot comes down (walk() says when), so the sound lands with the foot
    if (v.stepNow) {
      v.stepNow = false;
      if (!this.dead && v.speed > 0.4) {
      const ln = localPlayer && Math.hypot(localPlayer.pos.x - this.rpos.x, localPlayer.pos.z - this.rpos.z);
      // (and what it kicks up: the big ones a cloud of grit and dust, the rest a scuff)
      if (ln < 30) FX.foot(this.rpos, this.zone, ({ executioner: 1.7, clown: 1.4, hound: 1.1, slime: 0 })[this.type] ?? 0.6);
      if (this.type === 'crawler') SFX.play('slap', this.rpos, { vol: 0.9 + v.speed * 0.06 });
      else if (this.type === 'pale') { if (v.speed > 3 || ln < 5) SFX.play('soft', this.rpos, { vol: v.speed > 5 ? 0.9 : 0.35 }); }
      else if (this.type === 'mannequin') SFX.play('ceramic', this.rpos, { vol: 1.1 });
      else if (this.type === 'hound') SFX.play('step', this.rpos, { surf: 'dirt', vol: 0.9, pitch: 0.6 });
      else if (this.type === 'sister') SFX.play('heel', this.rpos, { vol: 0.8 });
      else if (this.type === 'bound') SFX.play('soft', this.rpos, { vol: 0.7 });
      else if (this.type === 'clown') SFX.play('clown_step', this.rpos, { vol: v.speed > 2.5 ? 1.2 : 0.8, ref: 4 });
      else if (this.type === 'executioner') { SFX.play('heavy_step', this.rpos, { vol: 1.3, ref: 5 }); if (localPlayer && Math.hypot(localPlayer.pos.x - this.rpos.x, localPlayer.pos.z - this.rpos.z) < 9) Player.addShake(0.08); }
      }
    }
    // the Executioner's blade, dragging along the floor behind it the whole way, throwing sparks off the concrete
    if (this.type === 'executioner') {
      const P = this.P; P.tip.getWorldPosition(_sl);
      if (!this.glow && this.g.lightSources) { this.glow = { x: 0, y: 0, z: 0, color: 0xff8a3a, power: 0, state: 'on', zone: 'in', range: 4, lit: 1 }; this.g.lightSources.push(this.glow); }
      const drag = this.state === 'walk' && v.speed > 0.3;
      if (this.glow) { this.glow.x = _sl.x; this.glow.y = _sl.y + 0.15; this.glow.z = _sl.z; this.glow.power = drag && Math.random() < 0.3 ? 0.12 + Math.random() * 0.3 : 0; }
      v.dragT = (v.dragT || 0) - dt;
      if (drag && v.dragT <= 0) { v.dragT = 0.5 + Math.random() * 0.25; SFX.play('blade_drag', _sl.clone(), { vol: 1.1, ref: 5, rev: 0.8 }); }
      // (the sparks themselves, sprayed back off the edge where it bites, skittering along the floor)
      if (drag && Math.random() < dt * 14) { const a = this.rry; FX.sparks(_sl, { n: [1, 4], dir: _sp.set(-Math.sin(a) * 0.7, 0.7, -Math.cos(a) * 0.7), spread: 0.8, speed: [1.5, 4.5], floor: this.rpos.y, life: [0.25, 0.7] }); }
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
      // the Clown: its music box winding through its tune (heard through walls), or its giggle
      if (this.type === 'clown') { const box = Math.random() < 0.6, near = this.state === 'block' || this.state === 'herd'; if (box) { this.P.box.getWorldPosition(_sl); SFX.play('clown_box', _sl.clone(), { vol: near ? 1.2 : 0.8, ref: 6 }); } else { SFX.play('clown_giggle', this.headPos(), { vol: 0.9, ref: 4 }); v.gig = 1.2; } v.sfx = box ? 8 + Math.random() * 6 : 5 + Math.random() * 6; }
    }
  }
  onStateChange(from, to, lp) {
    if (this.type === 'crawler' && to === 'spot') SFX.play('crawler_screech', this.center(), { vol: 1.5, ref: 3 });
    if (this.type === 'leech' && to === 'attached') SFX.play('squelch', this.rpos, { vol: 1 });
    if (this.type === 'roach' && to === 'rush' && Math.random() < 0.6) SFX.play('roach_hiss', this.center(), { vol: 0.8 });
    if (this.type === 'slime' && to === 'hunt') SFX.play('slime_gurgle', this.center(), { vol: 1.3, ref: 5 });
    if (this.type === 'leech' && from === 'attached') SFX.play('chitter', this.rpos, { vol: 1 });
    if (this.type === 'sister' && to === 'drawn') SFX.play('sister_twitch', this.headPos(), { vol: 1.3, ref: 3 });
    if (this.type === 'bound' && to === 'spit') SFX.play('bound_retch', this.headPos(), { vol: 1.3, ref: 4 });
    if (this.type === 'clown' && (to === 'block' || to === 'grab')) this.vis.gig = 1.4;
    if (this.type === 'clown' && to === 'duck') SFX.play('creak', this.center(), { vol: 0.9, ref: 4 });
    if (to === 'dead') { SFX.play('crunch', this.center(), { vol: 0.9 }); this.onDeath(); }
  }
  // Dying, as everyone sees it: a last rattle, the body going down (falling, not snapping into a pose), a few
  // twitches that die away, the colour draining out of it, and a dark pool spreading out underneath.
  onDeath() {
    const v = this.vis; v.deathT = 0;
    SFX.play('death_rattle', this.center(), { vol: 1.1, pitch: { crawler: 0.85, pale: 1.25, hound: 0.65, leech: 1.9, roach: 2.4, sister: 1.4, bound: 0.75 }[this.type] || 1 });
    // its own copies of its materials, so only this one goes grey
    const seen = new Map(); this.deadMats = [];
    this.mesh.traverse((o) => {
      if (!o.isMesh || o.userData.scanMark || !o.material || !o.material.isMeshStandardMaterial) return;
      let c = seen.get(o.material);
      if (!c) { c = MonModels.retri(o.material.clone(), o.material); seen.set(o.material, c); this.deadMats.push({ m: c, col: c.color.clone(), em: c.emissive.clone() }); }
      o.material = c;
    });
    const inside = this.def.zone === 'in', grp = inside ? this.g.fac && this.g.fac.group : this.g.ext && this.g.ext.group;
    // which way it goes down: its own way (back, forward, onto its side) unless that's into a wall, then the nearest way
    // round from it with room for it (from where it fell, so it falls the same way for everyone)
    const FL = MON_FALL[this.type];
    v.fallYaw = 0; v.lift = 0;
    if (FL && inside && this.g.fac && !(this.type === 'bound' && v.lie > 0.5)) v.fallYaw = this.roomiest(this.rpos.x, this.rpos.y, this.rpos.z, this.rry + FL[0], FL[1]);
    if (grp) {
      const r = { crawler: 1.6, pale: 1.2, hound: 1.85, leech: 0.7, roach: 0.3, sister: 1.0, bound: 1.3 }[this.type] || 1.2;
      const gy = inside ? this.g.fac.floorY(this.rpos.x, this.rpos.z, this.rpos.y + 0.5) : this.g.ext.height(this.rpos.x, this.rpos.z);
      this.pool = new THREE.Mesh(new THREE.CircleGeometry(r, 22), new THREE.MeshStandardMaterial({ map: TEX.get('puff'), color: this.type === 'leech' ? 0x26380c : this.type === 'roach' ? 0x3a3010 : 0x4a0707, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.12, metalness: 0.3 }));
      this.pool.rotation.set(-Math.PI / 2, 0, Math.random() * TAU); this.pool.position.set(this.rpos.x, gy + 0.012, this.rpos.z); this.pool.scale.setScalar(0.05);
      grp.add(this.pool);
    }
  }
  // everything this one made for itself (its parts' shapes, the grey copies of its materials, the pool under it, the
  // Seep's trail), let go when the site is torn down
  dispose() {
    this.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (this.deadMats) for (const d of this.deadMats) d.m.dispose();
    if (this.pool) { if (this.pool.parent) this.pool.parent.remove(this.pool); this.pool.geometry.dispose(); this.pool.material.dispose(); }
    if (this.trail) for (const tp of this.trail) { if (tp.o.parent) tp.o.parent.remove(tp.o); tp.o.material.dispose(); }
  }
  // a long one's head, where it's drawn: a circle out in front of it pushed out of whatever it's in, and how far
  // that moved it (the model is drawn that much back from the wall; its AI keeps its own small footprint)
  headRoom(v, dt) {
    const fr = MON_FRONT[this.type]; if (!fr || this.dead) { v.hx = v.hz = 0; return; }
    const fx = Math.sin(this.rry), fz = Math.cos(this.rry), q = { x: this.rpos.x + fx * fr[0], y: this.rpos.y + 0.5, z: this.rpos.z + fz * fr[0] }, ox = q.x, oz = q.z;
    if (this.def.zone === 'in') { if (this.g.fac) this.g.fac.collide(q, fr[1]); } else { if (this.g.ext) this.g.ext.collide(q, fr[1]); if (this.g.ship) this.g.ship.collide(q, fr[1]); }
    v.hx = damp(v.hx || 0, q.x - ox, 14, dt); v.hz = damp(v.hz || 0, q.z - oz, 14, dt);
  }
  // how far a body has room to lie from (x, z) at angle a (out to len), on its own storey
  lieRoom(x, y, z, a, len) {
    const fac = this.g.fac; if (!fac) return len;
    const k0 = fac.idx(fac.ti(x), fac.tj(z)), lv0 = k0 >= 0 ? fac.lvl[k0] : -1, q = { x, y: y + 0.3, z };
    for (let d = 0.3; d <= len; d += 0.15) {
      q.x = x + Math.sin(a) * d; q.y = y + 0.3; q.z = z + Math.cos(a) * d;
      const k = fac.idx(fac.ti(q.x), fac.tj(q.z));
      if (k < 0 || !fac.grid[k] || (fac.grid[k] !== 4 && fac.lvl[k] !== lv0) || fac.collide(q, 0.2)) return d;
    }
    return len + 1;
  }
  // its own way (a0), or the nearest way round from it, in eighths of a turn, with room for the body; else the roomiest
  roomiest(x, y, z, a0, len) {
    let best = 0, bd = -1;
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) { const d = this.lieRoom(x, y, z, a0 + k * Math.PI / 4, len); if (d > len) return k * Math.PI / 4; if (d > bd) { bd = d; best = k; } }
    return best * Math.PI / 4;
  }
  // ---------------- presentation helpers ----------------
  // the room it has where it's drawn, for the big ones (every peer works it out for itself, a few times a second): l / r,
  // how far it is to the nearest thing on its left / right (rock, a doorway's jambs, a shut door, whatever's standing
  // there), out to 1.8 m; up, the headroom over the floor it covers front to back (half: how far that reaches each way),
  // a doorway's lintel included from a little before it's under it
  room(v, dt, half) {
    const fac = this.g.fac;
    if (!fac || this.def.zone !== 'in') return null;
    if (v.room && (v.roomT -= dt) > 0) return v.room;
    v.roomT = 0.12;
    const x = this.rpos.x, y = this.rpos.y, z = this.rpos.z, fx = Math.sin(this.rry), fz = Math.cos(this.rry), q = { x, y, z };
    const k0 = fac.idx(fac.ti(x), fac.tj(z)), lv0 = k0 >= 0 ? fac.lvl[k0] : -1, sh0 = k0 >= 0 && fac.grid[k0] === 4;
    const reach = (sx, sz) => {
      for (let d = 0.2; d <= 1.8; d += 0.1) {
        q.x = x + sx * d; q.y = y + 1.0; q.z = z + sz * d;
        const k = fac.idx(fac.ti(q.x), fac.tj(q.z));
        if (k < 0 || !fac.grid[k] || (!sh0 && fac.grid[k] !== 4 && fac.lvl[k] !== lv0) || fac.collide(q, 0.05)) return d - 0.05;
      }
      return 1.8;
    };
    // (its own +x is its right: (cos yaw, -sin yaw))
    const r = reach(fz, -fx), l = reach(-fz, fx);
    let up = Infinity;
    for (let k = -1; k <= 1; k++) { const px = x + fx * half * k, pz = z + fz * half * k; if (fac.floorAt(fac.ti(px), fac.tj(pz))) up = Math.min(up, fac.ceilY(px, pz, y + 0.5) - y); }
    for (const d of fac.doors) {
      if (Math.abs(d.y - y) > 2 || Math.abs(d.x - x) > half + 2.5 || Math.abs(d.z - z) > half + 2.5) continue;
      const along = (x - d.x) * d.nx + (z - d.z) * d.nz, lat = (x - d.x) * -d.nz + (z - d.z) * d.nx;
      if (Math.abs(along) < half + 0.9 && Math.abs(lat) < Facility.DW / 2 + 0.4) up = Math.min(up, d.y + Facility.DH - y);
    }
    return (v.room = { l, r, up: up === Infinity ? 3 : up });
  }
  // a tall one under a doorway's lintel (or a low ceiling) stoops: how far (m) its head has to come down, eased
  stoop(v, dt, top, half) {
    const rm = this.room(v, dt, half), want = rm ? Math.max(0, top - (rm.up - 0.08)) : 0;
    return (v.duck = damp(v.duck || 0, want, 6, dt));
  }
  // ...by bending at the knees (up to a quarter of it, legs of two lengths l) and the rest from the hips (Lt: from its
  // hips to the top of its head), its head tipped back up to look ahead. dm in its own units
  bow(dm, hips, torso, neck, Lt, legs, l) {
    const hip = Math.min(dm * 0.25, 0.22), k = Math.acos(clamp(1 - hip / (2 * l), -1, 1));
    hips.position.y -= hip;
    for (const L of legs) { L.a.rotation.x -= k; L.b.rotation.x += 2 * k; }
    const p0 = torso.rotation.x, p1 = Math.acos(clamp(Math.cos(p0) - (dm - hip) / Lt, -1, 1));
    if (p1 > p0) { torso.rotation.x = p1; if (neck) neck.rotation.x -= (p1 - p0) * 0.6; }
  }
  // Legs that walk: each foot set down on the floor (the step under it, on a stair) and left exactly there until it
  // lifts, so it can't slide, then carried up and through to its next spot half a stride ahead of its hip; the leg's two
  // joints bent to reach wherever its foot is. legs: [limb, thigh, shin (its own units), knee (1 bends back, -1
  // forward), phase (0..1), sole (m, joint to the bottom of the foot), sounds (a footstep when it comes down)];
  // R: half a stride (m), lift: how high a foot's carried (m), duty: how much of a stride each foot is down. The stride's
  // phase goes on with the ground covered (and a little after it stops, until every foot's down). Returns the phase
  walk(v, dt, legs, R, lift, duty) {
    const s = v.speed, fx = Math.sin(this.rry), fz = Math.cos(this.rry), fac = this.g.fac, inside = this.def.zone === 'in';
    const floor = (x, z) => (inside ? (fac && fac.floorY ? fac.floorY(x, z, this.rpos.y + 0.5) : this.rpos.y) : this.g.groundAt ? this.g.groundAt(x, z) : this.rpos.y);
    const F = v.feet || (v.feet = legs.map(() => ({ down: true, x: NaN, y: 0, z: 0, lx: 0, ly: 0, lz: 0 })));
    const swinging = F.some((f) => !f.down);
    v.ph = (v.ph || 0) + dt * (s > 0.08 ? Math.PI * duty * s / R : swinging ? 6 : 0);
    legs.forEach(([L, l1, l2, kb, off, sole, snd], i) => {
      const f = F[i]; let u = (v.ph / TAU + off) % 1; if (u < 0) u += 1;
      L.a.rotation.x = 0; L.b.rotation.x = 0;
      L.a.getWorldPosition(_hp);
      const reach = (l1 + l2) * L.a.parent.matrixWorld.getMaxScaleOnAxis();
      // (first time, or flung far from it by a teleport: its foot put back under its hip)
      if (!(Math.hypot(f.x - _hp.x, f.z - _hp.z) < reach * 1.6)) { f.x = _hp.x; f.z = _hp.z; f.y = floor(f.x, f.z); f.down = true; }
      if (u < duty) {
        if (!f.down) { f.down = true; f.y = floor(f.x, f.z); if (snd) v.stepNow = true; }
      } else {
        if (f.down) { f.down = false; f.lx = f.x; f.ly = f.y; f.lz = f.z; }
        const k = (u - duty) / (1 - duty), e = k * k * (3 - 2 * k), ax = _hp.x + fx * R, az = _hp.z + fz * R, ay = floor(ax, az);
        f.x = lerp(f.lx, ax, e); f.z = lerp(f.lz, az, e); f.y = lerp(f.ly, ay, e) + lift * Math.sin(Math.PI * k);
      }
      // (its two joints: in the plane the leg swings in, the hip to the foot, bent at the knee by the lengths)
      _ft.set(f.x, f.y + sole, f.z); L.a.parent.worldToLocal(_ft); _ft.sub(L.a.position);
      const dz = _ft.z, dy = _ft.y / Math.cos(L.a.rotation.z), d = Math.max(1e-3, Math.min(Math.hypot(dz, dy), (l1 + l2) * 0.999));
      const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), K = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
      L.a.rotation.x = Math.atan2(-dz, -dy) - kb * A; L.b.rotation.x = kb * (Math.PI - K);
      // (and the foot kept level with the floor, not tipped up or its toes dug into it with the shin)
      L.end.rotation.x = -(L.a.rotation.x + L.b.rotation.x) * (f.down ? 1 : 0.6);
    });
    return v.ph;
  }
  // hips at a height its legs reach the floor from, half a stride out (Lm: a leg's length, its own units; R in m)
  hipsFor(Lm, R, pivot) { const r = R / this.mesh.scale.y; return Math.sqrt(Math.max(0.01, Lm * Lm - r * r)) * 0.96 - pivot; }
  // 0..1 through the fall: it drops faster and faster, hits, and settles with a small bounce
  deadK() { const t = clamp((this.vis.deathT || 0) / 0.75, 0, 1); return t < 0.8 ? Math.pow(t / 0.8, 2) : 1 - Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.06; }
  // the nerves firing a few last times: sudden jerks, fewer and smaller, then nothing
  twitchK() { const v = this.vis, k = Math.exp(-(v.deathT || 0) * 1.3); if (Math.random() < 0.07 && v.deathT > 0.6) v.twk = (Math.random() - 0.5) * 1.4 * k; v.twk = (v.twk || 0) * 0.82; return v.twk; }
  presentDeath(v, dt) {
    const t = v.deathT;
    // (it comes to rest on the floor under it: its lowest point set down on it, not half through it or over it)
    if (t < 2.5) {
      const fac = this.g.fac, fy = this.def.zone === 'in' ? (fac ? fac.floorY(this.rpos.x, this.rpos.z, this.rpos.y + 0.5) : this.rpos.y) : this.g.ext ? this.g.ext.height(this.rpos.x, this.rpos.z) : this.rpos.y;
      _bx.setFromObject(this.mesh);
      v.lift = clamp(damp(v.lift || 0, fy + 0.01 - _bx.min.y, 12, dt || 0.016), -0.5, 0.8);
    }
    this.mesh.position.y += v.lift || 0;
    if (this.deadMats && t < 4) { const k = sstep(0, 3.5, t); for (const d of this.deadMats) { d.m.color.copy(d.col).multiplyScalar(1 - 0.55 * k); d.m.emissive.copy(d.em).multiplyScalar(1 - k); } }
    if (this.pool && t < 9) {
      const b = this.P.body || this.P.hips || this.P.torso;
      if (b && t < 1.2) { b.getWorldPosition(_dp); this.pool.position.x = _dp.x; this.pool.position.z = _dp.z; }
      this.pool.scale.setScalar(0.05 + 0.95 * (1 - Math.exp(-t * 0.5)));
    }
  }
  anim_crawler(dt, v) {
    const P = this.P, t = v.t, s = v.speed;
    const g = Math.min(1, s / 6);
    P.body.position.y = 0.72 + Math.sin(t * 2) * 0.02;
    P.body.rotation.x = damp(P.body.rotation.x, this.dead ? 0 : this.state === 'spot' ? -0.55 : this.stunned ? 0.3 : g * 0.15, 8, dt);
    // its legs splay two metres across: alongside a wall, or through a doorway, it draws them in on that side
    const rm = this.room(v, dt, 1.2), fold = (c) => (rm ? clamp((c - 0.5) / 0.55, 0.1, 1) : 1);
    v.zl = damp(v.zl == null ? -0.35 : v.zl, -0.35 * fold(rm && rm.l), 8, dt); v.zr = damp(v.zr == null ? 0.35 : v.zr, 0.35 * fold(rm && rm.r), 8, dt);
    P.fl.a.rotation.z = P.bl.a.rotation.z = v.zl; P.fr.a.rotation.z = P.br.a.rotation.z = v.zr;
    if (!this.dead) this.walk(v, dt, [[P.fl, 0.44, 0.42, -1, 0, 0.07, 1], [P.fr, 0.44, 0.42, -1, 0.5, 0.07, 1], [P.bl, 0.4, 0.43, 1, 0.5, 0.08, 0], [P.br, 0.4, 0.43, 1, 0, 0.08, 0]], Math.min(0.42, 0.14 + s * 0.04), 0.1 + g * 0.12, 0.55);
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
  // A roach: its legs a blur of tripods when it runs (front and hind on one side with the middle on the other, swinging
  // forward lifted and pushing back down), its feelers sweeping, whipping back when it dashes and twitching when it
  // stops; dead, it's over on its back with its legs folding up, the last of them still pedalling a while
  anim_roach(dt, v, lp) {
    const P = this.P, t = v.t, s = v.speed, g = Math.min(1, s / 4);
    v.ph = (v.ph || 0) + dt * TAU * Math.min(16, s * 4.2);
    const f = this.dead ? this.deadK() : 0, tw = this.dead ? v.tw : 0;
    for (const L of P.legs) {
      const u = v.ph + L.ph, sw = g > 0.05 ? Math.sin(u) * 0.35 * Math.min(1, g * 2) : Math.sin(t * 7 + L.ph * 3 + L.fw) * 0.03;
      const lift = g > 0.05 ? Math.max(0, Math.cos(u)) * 0.35 : 0;
      // (the swing: forward is round toward its head; on the right that's a turn one way, on the left the other)
      const th = lerp(L.th + lift, 1.2 + Math.sin(t * 9 + L.ph + L.fw * 4) * tw * 0.6, f), kn = lerp(L.kn + lift * 0.6, 2.2, f);
      L.a.rotation.set(0, -L.s * (L.fw + sw), L.s * th); L.b.rotation.set(0, 0, -L.s * kn);
    }
    P.body.position.y = 0.075 + (g > 0.05 ? Math.abs(Math.sin(v.ph)) * 0.004 : 0);
    v.atw = Math.random() < dt * (s > 0.3 ? 1 : 3) ? (Math.random() - 0.5) * 0.6 : (v.atw || 0) * Math.exp(-dt * 6);
    for (const A of P.ant) {
      const sweep = Math.sin(t * (3 + A.s * 0.4) + A.s) * (0.35 - g * 0.25), back = g * 0.3;
      A.a.rotation.set(-0.35 + back * 0.6 + Math.sin(t * 2.3 + A.s) * 0.12, A.s * (0.35 + sweep + v.atw * A.s) - A.s * back, 0);
      A.b.rotation.set(0.15 + Math.sin(t * 5 + A.s * 2) * 0.12 + g * 0.2, A.s * (0.1 + Math.sin(t * 4.1 + A.s) * 0.15), 0);
    }
    P.head.rotation.x = this.state === 'rush' ? 0.15 : Math.sin(t * 1.7) * 0.05;
    // (and the patter of its claws as it goes: a dry, quick ticking)
    v.skT = (v.skT || 0) - dt;
    if (!this.dead && s > 1.2 && v.skT <= 0) {
      v.skT = 0.28 + Math.random() * 0.22;
      if (lp && Math.hypot(lp.pos.x - this.rpos.x, lp.pos.z - this.rpos.z) < 16) SFX.play('skitter', this.rpos, { vol: 0.5 + Math.min(0.6, s * 0.12) });
    }
    if (this.dead) {
      const th = Math.PI * f;
      this.mesh.rotation.z = th; this.mesh.position.y = this.rpos.y + 0.11 * (1 - Math.cos(th)) / 2 + Math.sin(th) * 0.06;
      for (const A of P.ant) A.a.rotation.x = lerp(A.a.rotation.x, 0.1 + tw * 0.4, f);
    }
  }
  anim_pale(dt, v, lp) {
    const P = this.P, t = v.t, s = v.speed, S = this.mesh.scale.y;
    const fleeing = this.state === 'flee' || this.state === 'chase';
    const hunch = this.state === 'chase' ? 0.55 : fleeing ? 0.75 : 0.35;
    // (v.tilt: its lean before any stoop, so a stoop doesn't feed on itself frame after frame)
    v.tilt = damp(v.tilt == null ? hunch : v.tilt, hunch, 4, dt); P.torso.rotation.x = v.tilt;
    const R = Math.min(0.5, 0.12 + s * 0.07);
    v.hip = damp(v.hip || 1.4, this.hipsFor(1.42, R, 0) - (fleeing ? 0.22 : 0), 6, dt);
    P.hips.position.y = v.hip;
    const reach = this.state === 'chase' || this.state === 'drag' ? -1.3 : fleeing ? 0.6 : 0.05;
    const sw = Math.sin(v.ph || 0) * Math.min(1, s / 3) * 0.7;
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
      this.mesh.rotation.x = -Math.PI / 2 * f; this.mesh.position.y = this.rpos.y + 0.2 * f * S;
      P.torso.rotation.x = lerp(P.torso.rotation.x, 0.05, f);
      P.al.a.rotation.set(lerp(P.al.a.rotation.x, -0.5 + tw, f), 0, -1.15 * f); P.ar.a.rotation.set(lerp(P.ar.a.rotation.x, -0.3 - tw * 0.6, f), 0, 1.25 * f);
      P.al.b.rotation.x = -0.5 * f; P.ar.b.rotation.x = -0.8 * f;
      P.ll.a.rotation.x = lerp(P.ll.a.rotation.x, 0.1, f); P.lr.a.rotation.x = lerp(P.lr.a.rotation.x, -0.25 + tw * 0.5, f); P.ll.b.rotation.x = 0.15 * f; P.lr.b.rotation.x = 0.5 * f;
      P.head.rotation.set(0, 0.5 * f, 0.7 * f + tw * 0.2); P.mouth.scale.y = 5;
      return;
    }
    // under a doorway's lintel it folds itself down to pass
    const duck = this.stoop(v, dt, 2.32, 0.4);
    if (duck > 0.005) this.bow(duck / S, P.hips, P.torso, P.neck, 1.45, [], 0.71);
    this.walk(v, dt, [[P.ll, 0.7, 0.72, 1, 0, 0.02, 1], [P.lr, 0.7, 0.72, 1, 0.5, 0.02, 1]], R, 0.1 + Math.min(0.15, s * 0.03), s > 5 ? 0.42 : 0.58);
  }
  // a Sister: jerky, the limbs snapping from one pose to the next rather than moving through them; the head lolling
  // and wrenching round on its neck; the scalpel arm raised when it's after someone, and slashing when it's close
  anim_sister(dt, v) {
    const P = this.P, t = v.t, s = v.speed, drawn = this.state === 'drawn', S = this.mesh.scale.y;
    const R = Math.min(0.3, 0.08 + s * 0.06);
    P.hips.position.y = damp(P.hips.position.y, this.hipsFor(0.92, R, 0.05), 6, dt);
    P.ll.a.rotation.z = 0.08; P.lr.a.rotation.z = -0.08;
    P.torso.rotation.x = damp(P.torso.rotation.x, drawn ? 0.25 : 0.12, 5, dt);
    // twitches: now and then a joint snaps somewhere else and holds there
    if (Math.random() < dt * (drawn ? 4 : 1.4)) v.tw2 = { h: (Math.random() - 0.5) * 1.6, n: (Math.random() - 0.5) * 0.9, s: (Math.random() - 0.5) * 0.6, k: 1 };
    const T = v.tw2 || { h: 0, n: 0, s: 0, k: 0 }; T.k = Math.max(0, T.k - dt * 1.8);
    P.neck.rotation.set(0.25 + T.n * T.k, 0, 0.5 + Math.sin(t * 0.4) * 0.15 + T.h * T.k);
    P.head.rotation.set(Math.sin(t * 0.7) * 0.1, T.h * T.k * 0.6, 0.2);
    P.torso.rotation.z = T.s * T.k;
    const sw = Math.sin(v.ph || 0) * Math.min(1, s / 2.5) * 0.55;
    const slash = drawn && v.sT % 1.3 < 0.3 && s < 1.5 ? Math.sin((v.sT % 1.3) / 0.3 * Math.PI) : 0;
    P.ar.a.rotation.x = damp(P.ar.a.rotation.x, drawn ? -1.9 + slash * 2.2 : -0.1 + sw * 0.2, 14, dt); P.ar.b.rotation.x = drawn ? -0.6 : -0.15;
    P.al.a.rotation.x = -sw * 0.3 + (drawn ? -0.4 : 0); P.al.b.rotation.x = -0.3; P.al.a.rotation.z = -0.1; P.ar.a.rotation.z = 0.15;
    if (this.dead) {
      // down on its knees, then forward onto its face, its arms out ahead of it along the floor
      const f = this.deadK(), tw = v.tw;
      this.mesh.rotation.x = Math.PI / 2 * f; this.mesh.position.y = this.rpos.y + 0.12 * f;
      P.ll.a.rotation.x = lerp(P.ll.a.rotation.x, -0.4, f); P.lr.a.rotation.x = lerp(P.lr.a.rotation.x, -0.2 + tw, f);
      P.ll.b.rotation.x = 1.2 * f; P.lr.b.rotation.x = 1.0 * f;
      P.al.a.rotation.set(-3.0 * f, 0, -0.3); P.ar.a.rotation.set(-2.95 * f + tw * 0.3, 0, 0.4); P.neck.rotation.set(0.6 * f, 0, 0.9 * f);
      return;
    }
    // (jerking from one pose to the next: the legs' stride held, then snapped on)
    const ph0 = v.ph || 0; this.walk(v, dt, [[P.ll, 0.46, 0.46, 1, 0, 0.045 * S, 1], [P.lr, 0.46, 0.46, 1, 0.5, 0.045 * S, 1]], R, 0.08, 0.6);
    if (Math.floor(v.ph / 0.87) === Math.floor(ph0 / 0.87) && v.legHold) { P.ll.a.rotation.x = v.legHold[0]; P.ll.b.rotation.x = v.legHold[1]; P.lr.a.rotation.x = v.legHold[2]; P.lr.b.rotation.x = v.legHold[3]; }
    else v.legHold = [P.ll.a.rotation.x, P.ll.b.rotation.x, P.lr.a.rotation.x, P.lr.b.rotation.x];
  }
  // the Bound: lying flat on its back like a body; getting up all at once from the waist, as if pulled; lurching on
  // its wrong-bent legs, swaying from side to side; rearing back to retch, and pitching forward to spew it out
  anim_bound(dt, v) {
    const P = this.P, t = v.t, s = v.speed, st = this.state;
    const lie = st === 'lie' ? 1 : st === 'rise' ? 1 - sstep(0.1, 1.3, v.sT) : 0;
    v.lie = v.lie == null ? lie : damp(v.lie, lie, st === 'rise' ? 30 : 4, dt);
    this.mesh.rotation.x = -Math.PI / 2 * v.lie; this.mesh.position.y = this.rpos.y + 0.18 * v.lie;
    const g = Math.min(1, s / 2.5), R = Math.min(0.32, 0.08 + s * 0.08);
    P.body.position.y = lerp(this.hipsFor(0.93, R, 0), 0.9, v.lie);
    P.torso.rotation.z = Math.sin((v.ph || 0) * 0.5) * 0.25 * g + Math.sin(t * 0.8) * 0.04;
    const rear = st === 'spit' ? (v.sT < 0.9 ? -0.5 * sstep(0, 0.9, v.sT) : lerp(-0.5, 0.6, sstep(0.9, 1.05, v.sT)) * (1 - sstep(1.2, 1.7, v.sT))) : 0;
    P.torso.rotation.x = damp(P.torso.rotation.x, rear + (st === 'lurch' ? 0.12 : 0) + (st === 'lie' ? Math.sin(t * 0.6) * 0.01 : 0), 12, dt);
    P.mouth.scale.setScalar(st === 'spit' && v.sT > 0.8 && v.sT < 1.3 ? 1.5 : 1 + Math.sin(t * 3) * 0.05);
    if (this.dead) {
      const f = this.deadK(), tw = v.tw;
      this.mesh.rotation.x = -Math.PI / 2 * Math.max(f, v.lie); this.mesh.position.y = this.rpos.y + 0.18 * f;
      P.ll.a.rotation.x = 0.2 * f + tw * 0.5; P.lr.a.rotation.x = -0.3 * f; P.ll.b.rotation.x = -0.6 * f; P.lr.b.rotation.x = -0.2 * f;
      P.torso.rotation.set(0, 0, 0.3 * f + tw * 0.2);
      return;
    }
    // (on its knees that bend the wrong way; lying, its legs just lie there)
    if (v.lie < 0.05) this.walk(v, dt, [[P.ll, 0.45, 0.48, -1, 0, 0.045, 1], [P.lr, 0.45, 0.48, -1, 0.5, 0.045, 1]], R, 0.12, 0.6);
    else { v.feet = null; P.ll.a.rotation.x = P.lr.a.rotation.x = 0; P.ll.b.rotation.x = P.lr.b.rotation.x = -0.35 * (1 - v.lie); }
  }
  // the Executioner: a slow heavy walk, the blade hung from its right fist trailing along the floor; lifting it back
  // and up over its shoulder (slowly), and bringing it down all at once
  anim_executioner(dt, v) {
    const P = this.P, t = v.t, s = v.speed, S = this.mesh.scale.y, fac = this.g.fac;
    // (a long slow stride; its feet set down and left where they land, see walk())
    const g = Math.min(1, s / 2), R = Math.min(0.45, 0.15 + s * 0.13), ph = v.ph || 0, sw = Math.sin(ph) * 0.45 * g;
    v.hipY = damp(v.hipY == null ? 1.2 : v.hipY, this.hipsFor(1.2, R, 0.05), 6, dt); P.hips.position.y = v.hipY;
    P.hips.rotation.z = Math.sin(ph) * 0.05 * g;
    P.torso.rotation.y = Math.sin(ph) * 0.08 * g;
    P.neck.rotation.x = 0.25 + Math.sin(t * 0.5) * 0.04;
    P.al.a.rotation.set(-sw * 0.6, 0, -0.15); P.al.b.rotation.x = -0.25;
    // (three poses, worked out so the blade's tip is where it should be: dragging on the floor behind it; lifted back
    // over its shoulder, under a corridor's ceiling; and brought down on the floor out in front, as far as it reaches)
    const DRAG = [0.25 + sw * 0.2, -0.1, 0.04 - sw * 0.1, 0.08], UP = [-2.2, -1.6, -1.5, -0.15], DOWN = [-1.0, -0.2, -1.0, 0.35];
    let k = DRAG;
    const swing = this.state === 'swing';
    if (swing) {
      const u = v.sT, up = sstep(0, 0.95, u), down = sstep(1.0, 1.2, u), back = sstep(1.6, 2.4, u);
      k = DRAG.map((d, i) => { const a = lerp(lerp(d, UP[i], up), DOWN[i], down); return lerp(a, d, back); });
    }
    const [ax, bx, bl, tx] = k;
    v.tilt = damp(v.tilt == null ? tx : v.tilt, tx, swing ? 30 : 4, dt); P.torso.rotation.x = v.tilt;
    // stooping through a doorway (it stands 2.6 m; a doorway is 2.4)
    if (!swing) { const duck = this.stoop(v, dt, 2.62, 0.5); if (duck > 0.005) this.bow(duck / S, P.hips, P.torso, P.neck, 1.9, [], 0.6); }
    P.ar.a.rotation.set(ax, 0, 0.12); P.ar.b.rotation.x = bx; P.blade.rotation.set(bl + 2.3, 0, 0);
    if (this.dead) return;
    this.walk(v, dt, [[P.ll, 0.6, 0.6, 1, 0, 0.08 * S, 1], [P.lr, 0.6, 0.6, 1, 0.5, 0.08 * S, 1]], R, 0.14, 0.62);
    // the blade is dragged, so it trails along the way it came (v.tow: where its tip is, kept its length behind the
    // grip): round a corner it follows the floor behind it rather than swinging through the wall, and its tip lies on
    // the floor under it (on a stair, the step) instead of in it
    if (swing) { v.tow = null; return; }
    P.blade.getWorldPosition(_sl);
    const len = 2.05 * P.blade.scale.z * S, hx = _sl.x, hz = _sl.z, fy0 = fac ? fac.floorY(hx, hz, this.rpos.y + 0.5) : this.rpos.y;
    const r = Math.sqrt(Math.max(0.25, len * len - (_sl.y - fy0) * (_sl.y - fy0)));
    if (!v.tow || Math.hypot(v.tow.x - hx, v.tow.z - hz) > r * 1.8) v.tow = { x: hx - Math.sin(this.rry) * r, z: hz - Math.cos(this.rry) * r };
    const dx = v.tow.x - hx, dz = v.tow.z - hz, dl = Math.hypot(dx, dz) || 1;
    v.tow.x = hx + dx / dl * r; v.tow.z = hz + dz / dl * r;
    // (where that would lay it in a wall, it's pulled round in behind)
    if (fac && !fac.floorAt(fac.ti(v.tow.x), fac.tj(v.tow.z))) { v.tow.x = hx - Math.sin(this.rry) * r; v.tow.z = hz - Math.cos(this.rry) * r; }
    const fy = fac ? fac.floorY(v.tow.x, v.tow.z, this.rpos.y + 0.5) : this.rpos.y;
    P.blade.lookAt(_sl2.set(v.tow.x, fy + 0.03 + 0.2 * P.blade.scale.z * S, v.tow.z));
  }
  anim_mannequin(dt, v) {
    const P = this.P, S = this.mesh.scale.y;
    if (this.dead) return;
    if (v.speed > 0.6) {
      // (a scurry: it ran in place at walking pace, its feet sliding; now they're set down, see walk())
      const R = Math.min(0.42, 0.12 + v.speed * 0.03);
      P.torso.rotation.x = 0.35; P.al.a.rotation.x = -1.4; P.ar.a.rotation.x = -1.5; P.al.b.rotation.x = 0; P.ar.b.rotation.x = 0;
      P.head.rotation.set(-0.3, 0, Math.sin(v.t * 40) * 0.2);
      P.hips.position.y = this.hipsFor(0.82, R, 0.05);
      this.walk(v, dt, [[P.ll, 0.4, 0.42, 1, 0, 0.055 * S, 1], [P.lr, 0.4, 0.42, 1, 0.5, 0.055 * S, 1]], R, 0.16, 0.45);
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
      // (set down on its feet at once: a frozen pose doesn't settle while you watch)
      P.hips.position.y = 0.875; this.mesh.updateMatrixWorld(true);
      let lo = Infinity; for (const f of [P.ll.end, P.lr.end]) { f.getWorldPosition(_dp); lo = Math.min(lo, _dp.y); }
      P.hips.position.y -= (lo - 0.055 * S - this.mesh.position.y) / S; v.gnd = P.hips.position.y - 0.875;
    }
  }
  anim_leech(dt, v, lp) {
    const P = this.P, t = v.t, fac = this.g.fac, J = P.joints, st = this.state;
    // (up off the floor: upside down on the ceiling by rolling over, so it still goes head first: flipped end over end
    // it went tail first)
    const up = !fac || this.rpos.y - fac.floorY(this.rpos.x, this.rpos.z, this.rpos.y) > 0.5;
    const onCeil = (st === 'crawl' || st === 'wait') && up;
    // (climbing, it stands up on the wall: going down, head first and belly to the wall in front of it; going up, head
    // first and belly to the wall behind it)
    v.vy = damp(v.vy || 0, (this.rpos.y - (v.lastY ?? this.rpos.y)) / Math.max(dt, 1e-3), 10, dt); v.lastY = this.rpos.y;
    const climb = (st === 'crawl' || st === 'wait') && Math.abs(v.vy) > 0.5 ? -Math.sign(v.vy) * 1.45 : 0;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.z = damp(this.mesh.rotation.z, onCeil ? Math.PI : 0, 10, dt);
    this.mesh.rotation.x = damp(this.mesh.rotation.x, st === 'attached' ? 1.0 : climb, 9, dt);
    const moving = v.speed > 0.15 && !this.dead, att = st === 'attached', falling = st === 'drop';
    // (each scuttle starts with the patter of its feet on the plaster, heard overhead if you're near)
    if (moving && !v.wasMoving && lp && (v.patT || 0) <= t && this.rpos.distanceTo(lp.pos) < 11) { v.patT = t + 0.5; SFX.play('scurry', this.rpos, { vol: 0.55, ref: 2.5 }); }
    v.wasMoving = moving;
    // its gait runs on with the ground it covers (scuttling, the legs blur), and barely at all while it's still
    v.gp = (v.gp || 0) + dt * (att ? 14 : moving ? 7 + v.speed * 8 : 0.5);
    // (what pitch the head had a moment ago: each segment back takes the turn the head took a little earlier, so over an
    // edge it curls, head round the corner and tail still where it was)
    const H = v.hist || (v.hist = []); H.unshift([t, this.mesh.rotation.x]); if (H.length > 90) H.length = 90;
    const pitchAt = (tq) => { for (const h of H) if (h[0] <= tq) return h[1]; return H[H.length - 1][1]; };
    // (still, now and then it rears its head up and sweeps it, tasting the air; scuttling, it snakes)
    const rear = moving || att ? 0 : 0.5 + 0.5 * Math.sin(t * 0.7 + this.id), wave = att ? 0.25 : moving ? 0.26 * Math.min(1, v.speed / 1.4) + 0.06 : 0.07;
    let prev = this.mesh.rotation.x;
    for (let i = 0; i < J.length; i++) {
      const j = J[i], abs = i ? pitchAt(t - i * 0.07) : prev, rel = i ? abs - prev : 0; prev = abs;
      let yaw = wave * Math.sin(v.gp * (moving ? 0.45 : 0.6) - i * 0.75) * (i ? 1 : 0.6), pitch = rel;
      if (!this.dead) {
        pitch += moving ? 0.06 * Math.sin(v.gp * 0.9 - i * 0.8) : 0.035 * Math.sin(t * 1.4 - i * 0.6);
        if (i <= 2) pitch -= rear * (i === 1 ? 0.32 : 0.16);
        if (att) pitch += 0.2 + 0.06 * Math.sin(t * 9 - i);
        if (falling) { yaw *= 0.3; pitch = 0.06 * Math.sin(t * 20 + i); }
        if (!moving && !att && i > 6) pitch -= 0.12 * (0.5 + 0.5 * Math.sin(t * 0.5 + this.id * 2)); // (the tail curling up)
      } else { const f = this.deadK(); yaw = 0.08 * Math.sin(i) * f; pitch = -0.38 * f; }
      j.rotation.set(pitch, yaw, 0);
      P.segs[i].scale.y = 0.7 + 0.05 * Math.sin(t * 2.6 - i * 0.5) + (att ? 0.06 * Math.sin(t * 12 - i) : 0);
    }
    // the legs: a ripple running down each side from the head (the two sides out of step), each leg swung forward lifted
    // and set down, pulled back flat; still, they shift and twitch; gripping, they clamp down hard; dying, they fold up
    for (const L of P.legs) {
      const sd = L.sd, ph = v.gp - L.i * 0.85 + (sd > 0 ? Math.PI : 0), sw = Math.sin(ph), lift = Math.max(0, Math.cos(ph));
      let swing = 0.12, raise = 0, bend = 0;
      if (this.dead) { const f = this.deadK(); raise = 1.1 * f + v.tw * (L.i % 2 ? 0.4 : -0.4); bend = 1.0 * f; }
      else if (att) { swing = 0.25 * Math.sin(t * 13 + L.i); raise = -0.45; bend = 0.7; }
      else if (falling) { swing = 0.5 * Math.sin(t * 24 + L.i * 1.3); raise = 0.6; bend = 0.2; }
      else if (moving) { swing = 0.12 + 0.42 * sw; raise = 0.55 * lift; bend = 0.55 * lift; }
      else { const tw = Math.max(0, Math.sin(t * 3.1 + L.i * 2.3 + this.id)) ** 8; swing = 0.12 + 0.12 * tw; raise = 0.35 * tw; bend = 0.3 * tw; }
      L.hip.rotation.set(0, sd * swing, sd * raise); L.knee.rotation.z = -sd * bend;
    }
    // the mouth working (gaping wide on a head), the feelers flicking, the slime swaying
    const gape = att ? 0.55 + 0.25 * Math.sin(t * 7) : moving ? 0.15 + 0.1 * Math.sin(t * 5) : 0.08 + 0.08 * Math.sin(t * 1.7);
    P.mouth.scale.set(1 + gape, 1 + gape, 1); P.mouth.rotation.z += dt * (att ? 5 : 0.6);
    P.feelers.forEach((f, i) => { f.rotation.x = 0.25 * Math.sin(t * (moving ? 11 : 4.3) + i * 2) - rear * 0.3; f.rotation.z = 0.3 * Math.sin(t * (moving ? 9 : 3.1) + i * 1.3); });
    P.strands.forEach((s, i) => { s.rotation.x = Math.sin(t * 1.3 + i * 2.1) * 0.25 - v.speed * 0.15; s.rotation.z = Math.cos(t * 1.1 + i) * 0.25; });
    // local victim does not see the leech model (screen overlay instead)
    this.mesh.visible = !(att && lp && this.extra === lp.id && lp.alive);
    if (this.dead) { const f = this.deadK(); this.mesh.rotation.z = Math.PI * f; this.mesh.rotation.x = 0; this.mesh.position.y = this.rpos.y + 0.12 * f; P.strands.forEach((s) => { s.scale.y = lerp(1, 0.12, f); }); }
  }
  // The Seep, as everyone sees it: a jelly filling the corridor from wall to wall and up to the ceiling (squeezing down
  // to the size of a doorway to go through an open one), heaving all over and wobbling as it gets going or stops. At a
  // shut door the body this side drains away into it while a sheet of it slides under (or a rope of it pours through
  // the window's bars and drips down the far side) and a mound gathers on the other side, swelling into the whole of it.
  // Those it has swallowed hang inside it, turning slowly; it can't take them through a door, and leaves them there
  anim_clown(dt, v) {
    const P = this.P, t = v.t, s = v.speed, S = this.mesh.scale.y;
    // (slow, it tiptoes with its knees high; quicker, long loping strides with its head bobbing)
    const R = Math.min(0.8, 0.28 + s * 0.2), ph = v.ph || 0, g = Math.min(1, s / 1.5);
    v.hipY = damp(v.hipY == null ? 1.5 : v.hipY, this.hipsFor(1.44, R, 0.1), 6, dt); P.hips.position.y = v.hipY;
    P.torso.rotation.set(0.5 + Math.sin(ph * 2) * 0.04 * g, Math.sin(ph) * 0.1 * g, 0);
    P.neck.rotation.x = -0.45 + Math.sin(t * 0.7) * 0.05 + (s > 2.5 ? Math.sin(ph * 2) * 0.08 : 0);
    P.head.rotation.z = 0.32 + Math.sin(t * 0.9) * 0.05 + (Math.random() < 0.004 ? 0.3 : 0);
    // arms: out to both walls when it's herding or standing across a corridor, reaching when it takes hold, otherwise
    // hanging long, knuckles low
    const spread = this.state === 'block' || this.state === 'herd' ? 1 : 0, reach = this.state === 'grab' ? sstep(0, 0.9, v.sT) : 0;
    v.spread = damp(v.spread || 0, spread, 2, dt);
    for (const [L, sd] of [[P.al, -1], [P.ar, 1]]) {
      L.a.rotation.set(-0.35 - reach * 1.1 + Math.sin(ph + (sd > 0 ? Math.PI : 0)) * 0.3 * g * (1 - v.spread), 0, sd * (0.4 + v.spread * 0.8));
      L.b.rotation.x = -0.3 - reach * 0.25;
    }
    // the giggle: the jaw dropping and the shoulders shaking with it
    v.gig = Math.max(0, (v.gig || 0) - dt);
    P.jaw.rotation.x = v.gig > 0 ? 0.25 + Math.sin(t * 56) * 0.12 : 0.04;
    P.torso.position.y = 0.1 + (v.gig > 0 ? Math.sin(t * 56) * 0.012 : 0);
    P.crank.rotation.x += dt * 3;
    // folded down under a low ceiling or through a doorway (upright it stands near 3 m; a doorway is 2.4)
    const duck = this.stoop(v, dt, 3.15, 1.1); if (duck > 0.005) this.bow(duck / S, P.hips, P.torso, P.neck, 2.1, [], 0.72);
    if (this.dead) return;
    this.walk(v, dt, [[P.ll, 0.72, 0.72, 1, 0, 0.14 * S, 1], [P.lr, 0.72, 0.72, 1, 0.5, 0.14 * S, 1]], R, s < 1.8 ? 0.32 : 0.2, 0.6);
    for (const L of [P.ll, P.lr]) L.flap.rotation.x = Math.max(0, -L.end.rotation.x) * 0.8;
  }
  anim_slime(dt, v, lp) {
    const P = this.P, fac = this.g.fac; if (!fac) return;
    const U = P.U; U.uT.value = performance.now() / 1000;
    const moving = v.speed > 0.15;
    // (the jelly wobbles when it sets off or stops: a spring that's kicked by every change in its speed)
    v.jv = (v.jv || 0) + ((v.speed - (v.lastSp || 0)) * 2.2 - (v.jy || 0) * 38 - (v.jv || 0) * 3.2) * dt; v.jy = (v.jy || 0) + v.jv * dt; v.lastSp = v.speed;
    const jig = clamp(v.jy, -0.12, 0.12);
    U.uHeave.value = damp(U.uHeave.value, this.state === 'hunt' ? 1.6 : moving ? 1.25 : 0.8, 2, dt);
    const W0 = 2.74, D0 = 1.7, DW = Facility.DW, DH = Facility.DH, rm = this.room(v, dt, D0 / 2);
    const H = Math.min(clamp(fac.ceilAt(this.rpos.x, this.rpos.z) - 0.06, 2.2, 3.4), rm ? rm.up - 0.1 : 9);
    // the nearest doorway, looked for now and then
    if ((v.doorT = (v.doorT || 0) - dt) <= 0) {
      v.doorT = 0.25; v.nd = null; let bd = 2.4;
      for (const d of fac.doors) { if (Math.abs(d.y - this.rpos.y) > 2) continue; const dd = Math.hypot(d.x - this.rpos.x, d.z - this.rpos.z); if (dd < bd) { bd = dd; v.nd = d; } }
    }
    const seepD = this.state === 'seep' && this.extra >= 0 ? fac.doors[Math.floor(this.extra)] : null;
    for (const k of ['sheet', 'stream', 'drip', 'far']) P[k].visible = false;
    if (!seepD) {
      // (as wide as the corridor where it is, wall to wall and no further, and centred in it: it was always 2.74 m, so
      // off the corridor's middle or across a bend it went on into the rock)
      let w = rm ? clamp(rm.l + rm.r - 0.12, 0.8, W0) : W0, h = H;
      const cx = rm ? clamp((rm.r - rm.l) / 2, -0.7, 0.7) : 0;
      // (squeezing down to a doorway it's going through: one it's only passing, in the wall beside it, it leaves be)
      const nd = v.nd, lat = nd ? Math.abs((this.rpos.x - nd.x) * -nd.nz + (this.rpos.z - nd.z) * nd.nx) : 9;
      if (nd && !nd.broken && lat < 1.2) { const dn = Math.abs((this.rpos.x - nd.x) * nd.nx + (this.rpos.z - nd.z) * nd.nz), k = sstep(0.3, 1.9, dn); w = Math.min(w, lerp(DW - 0.12, W0, k)); h = Math.min(h, lerp(DH - 0.08, H, k)); }
      const s = P.body.scale;
      P.body.position.set(damp(P.body.position.x, cx, 6, dt), 0, 0); P.body.rotation.y = 0;
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
    const g = Math.min(1, s / 8);
    P.body.position.y = damp(P.body.position.y, 1.02 - (this.state === 'sniff' || this.state === 'investigate' ? 0.12 : 0) - g * 0.08, 6, dt);
    if (!this.dead) this.walk(v, dt, [[P.fl, 0.5, 0.55, -1, 0, 0.05, 1], [P.fr, 0.5, 0.55, -1, 0.5, 0.05, 1], [P.bl, 0.45, 0.6, -1, 0.5, 0.05, 0], [P.br, 0.45, 0.6, -1, 0, 0.05, 0]], Math.min(0.55, 0.16 + s * 0.045), 0.12 + g * 0.18, s > 6 ? 0.4 : 0.55);
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
