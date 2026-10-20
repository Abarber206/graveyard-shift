'use strict';
// Supply pods: on the ground, whatever you order comes down out of the sky in a battered capsule that slams in a
// little way from the ship, leaves a smoking crater, and has to be cracked open to get at the goods. (And meteors,
// below: the other thing that comes down out of the sky.)
//
// Each pod is driven by one clock, so every crewmate sees the same fall. It starts negative:
//   -WAIT-GLINT .. -GLINT   nothing yet (the order is on its way)
//   -GLINT .. 0  a glint high in the sky where it will come from: a twinkle that grows, then one sharp sparkle
//   0 .. FALL   streaking down on a steep slant, glowing, trailing smoke, whistling
//   FALL        impact: flash, fireball, thrown dirt, the crater, the ground shakes, the boom arrives late with distance
//   after       half-buried and smoking; "Open supply pod" blows the side hatch off and the order spills into the crater
// (it takes its time: long enough after the order to walk out and watch it come down)
const POD = { FALL: 5.0, H: 560, RUN: 220, LEN: 2.2, R: 0.55, CRATER: 3.0, DEPTH: 0.95, WAIT: 16, GLINT: 5.5 };

const Pods = (() => {
  const list = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  let mats = null;
  function materials() {
    if (mats) return mats;
    // shell: off-white paint, scorched black toward the heat shield; built as a canvas wrapped round the body
    const [c, g] = TEX.canvas(256, 256);
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#d9d3c4'); gr.addColorStop(0.55, '#c7c0b0'); gr.addColorStop(0.85, '#4a4038'); gr.addColorStop(1, '#141210');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#c25a1c'; g.fillRect(0, 54, 256, 16);
    // (the lettering down each flank, clear of the hatch on the front)
    g.fillStyle = '#1e1b17'; g.textAlign = 'center';
    for (const x of [64, 192]) { g.font = 'bold 15px "Share Tech Mono", monospace'; g.fillText('MERCY SALVAGE', x, 100); g.font = 'bold 12px "Share Tech Mono", monospace'; g.fillText('SUPPLY', x, 116); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(20,16,12,${Math.random() * 0.25})`; g.fillRect(Math.random() * 256, 120 + Math.random() * 136, 2 + Math.random() * 5, 1 + Math.random() * 3); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
    mats = {
      shell: new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.35 }),
      shield: new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 0.95, metalness: 0.1 }),
      fin: new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.6, metalness: 0.6 }),
      dark: MATS.get('darkmetal'), hazard: MATS.get('hazard'),
      hot: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.9, 0.3), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }),
      handle: new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.5 }),
      // the hold inside, and the blown hatch (seen from both sides as it tumbles)
      hold: new THREE.MeshStandardMaterial({ color: 0x6e685d, roughness: 0.8, metalness: 0.4, side: THREE.DoubleSide }),
      strap: new THREE.MeshStandardMaterial({ color: 0x8a6a22, roughness: 0.9, side: THREE.DoubleSide }),
    };
    mats.lid = mats.shell.clone(); mats.lid.side = THREE.DoubleSide;
    mats.hazardD = mats.hazard.clone(); mats.hazardD.side = THREE.DoubleSide;
    // the glint: a hot point with four long hairline rays and four short diagonal ones
    {
      const [gc, gg] = TEX.canvas(256, 256), C = 128;
      const core = gg.createRadialGradient(C, C, 0, C, C, 44); core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.3, 'rgba(255,250,235,.75)'); core.addColorStop(1, 'rgba(255,240,210,0)');
      gg.fillStyle = core; gg.fillRect(0, 0, 256, 256);
      gg.globalCompositeOperation = 'lighter';
      const ray = (a, len, w, alpha) => {
        gg.save(); gg.translate(C, C); gg.rotate(a);
        const gr = gg.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, `rgba(255,252,240,${alpha})`); gr.addColorStop(0.6, `rgba(255,248,230,${alpha * 0.45})`); gr.addColorStop(1, 'rgba(255,245,220,0)');
        gg.fillStyle = gr; gg.beginPath(); gg.moveTo(0, -w); gg.lineTo(len, 0); gg.lineTo(0, w); gg.closePath(); gg.fill(); gg.restore();
      };
      for (let i = 0; i < 4; i++) { ray(i * Math.PI / 2, 127, 9, 1); ray(i * Math.PI / 2 + Math.PI / 4, 64, 6, 0.7); }
      const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
      mats.glint = gt;
    }
    return mats;
  }
  // the capsule, nose (heat shield) down along -Y, centre of the body at the origin
  function buildPod() {
    const M = materials(), g = new THREE.Group();
    const mk = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, p = g) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; me.receiveShadow = true; p.add(me); return me; };
    const L = POD.LEN, R = POD.R;
    // the body tapers toward the tail; it's built in pieces round the hatch's opening (angles round from +z, where the
    // hatch is), every piece's paint lined up with the rest (own: keep the piece's own 0..1 mapping instead)
    const by0 = 0.08 - L * 0.31, bh = L * 0.62, rAt = (y) => R - R * 0.14 * (y - by0) / bh;
    const band = (ya, yb, a0, a1, segs, dr = 0, own = false) => {
      const geo = new THREE.CylinderGeometry(rAt(yb) + dr, rAt(ya) + dr, yb - ya, segs, 1, true, a0, a1 - a0), p = geo.attributes.position, uv = geo.attributes.uv;
      if (!own) for (let i = 0; i < uv.count; i++) uv.setXY(i, (a0 + uv.getX(i) * (a1 - a0)) / TAU, (p.getY(i) + (ya + yb) / 2 - by0) / bh);
      return geo.translate(0, (ya + yb) / 2, 0);
    };
    // the opening: about 37 cm across and half a metre high
    const A = 0.36, hy0 = -0.17, hy1 = 0.33;
    mk(band(by0, by0 + bh, A, TAU - A, 22), M.shell, 0, 0, 0);
    mk(band(hy1, by0 + bh, -A, A, 4), M.shell, 0, 0, 0);
    mk(band(by0, hy0, -A, A, 4), M.shell, 0, 0, 0);
    // the hold behind it: a dark metal lining just inside the hull, a floor and a roof, and the hull's own thickness
    // round the edges of the opening
    mk(band(hy0 - 0.01, hy1 + 0.01, A, TAU - A, 18, -0.03), M.hold, 0, 0, 0);
    for (const [y, up] of [[hy0, true], [hy1, false]]) mk(new THREE.CircleGeometry(rAt(y) - 0.004, 20).rotateX(up ? -Math.PI / 2 : Math.PI / 2).translate(0, y, 0), M.hold, 0, 0, 0);
    for (const s of [-1, 1]) {
      const a = s * A, r = rAt((hy0 + hy1) / 2) - 0.015;
      mk(new THREE.PlaneGeometry(0.035, hy1 - hy0).rotateY(a + Math.PI / 2).translate(Math.sin(a) * r, (hy0 + hy1) / 2, Math.cos(a) * r), M.hold, 0, 0, 0);
    }
    // (inside: ribs up the back wall and the empty cargo strap that held the order, so it reads as a hollow)
    const hm = (hy0 + hy1) / 2, inside = (geo, a, y, inr) => geo.rotateY(a).translate(Math.sin(a) * (rAt(y) - inr), y, Math.cos(a) * (rAt(y) - inr));
    for (const a of [Math.PI - 0.55, Math.PI, Math.PI + 0.55]) mk(inside(new THREE.BoxGeometry(0.035, hy1 - hy0, 0.03), a, hm, 0.045), M.dark, 0, 0, 0);
    mk(band(hm - 0.03, hm + 0.03, Math.PI - 0.95, Math.PI + 0.95, 8, -0.062, true), M.strap, 0, 0, 0);
    mk(new THREE.SphereGeometry(R, 24, 12, 0, TAU, Math.PI / 2, Math.PI / 2), M.shield, 0, -L * 0.23, 0, 0, 0, 0).scale.set(1, 0.7, 1);
    // the tail: the body narrows on into a boat-tail cone (no step, no gap round it) capped by the drogue canister,
    // with four small swept fins back along it to keep it falling shield first
    const ty = by0 + bh;
    mk(new THREE.CylinderGeometry(R * 0.6, rAt(ty), 0.26, 24), M.fin, 0, ty + 0.13, 0);
    mk(new THREE.CylinderGeometry(R * 0.36, R * 0.42, 0.12, 18), M.dark, 0, ty + 0.32, 0);
    mk(new THREE.TorusGeometry(0.045, 0.012, 6, 12), M.dark, 0, ty + 0.41, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4, s = new THREE.Shape(); s.moveTo(-0.03, 0); s.lineTo(0.2, 0.2); s.lineTo(0.2, 0.42); s.lineTo(-0.03, 0.5); s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.024, bevelEnabled: false }); geo.translate(0, 0, -0.012);
      const fy = ty - 0.5, f = mk(geo, M.fin, Math.cos(a) * rAt(fy + 0.25), fy, Math.sin(a) * rAt(fy + 0.25)); f.rotation.y = -a;
    }
    // the side hatch: a curved plate lying flush on the hull just over the opening, with a red pull handle, hazard
    // edging and a bolt at each corner (it blows off when the pod is opened; built round its own middle, so it tumbles
    // about that)
    const lid = new THREE.Group(); lid.position.set(0, 0.08, R * 0.93); g.add(lid);
    const LA = A + 0.05, ly0 = hy0 - 0.04, ly1 = hy1 + 0.04, onLid = (geo) => geo.translate(0, -0.08, -R * 0.93);
    const onHull = (geo, a, y, out) => onLid(geo.rotateY(a).translate(Math.sin(a) * (rAt(y) + out), y, Math.cos(a) * (rAt(y) + out)));
    mk(onLid(band(ly0, ly1, -LA, LA, 6, 0.008)), M.lid, 0, 0, 0, 0, 0, 0, lid);
    mk(onLid(band(ly1 - 0.035, ly1, -LA, LA, 6, 0.014, true)), M.hazardD, 0, 0, 0, 0, 0, 0, lid);
    mk(onLid(band(ly0, ly0 + 0.035, -LA, LA, 6, 0.014, true)), M.hazardD, 0, 0, 0, 0, 0, 0, lid);
    // (its seam: a dark line down each side, so it reads as a hatch and not just more hull)
    for (const s of [-1, 1]) mk(onLid(band(ly0, ly1, s > 0 ? LA - 0.014 : -LA, s > 0 ? LA : -LA + 0.014, 1, 0.012, true)), M.dark, 0, 0, 0, 0, 0, 0, lid);
    mk(onHull(new THREE.BoxGeometry(0.045, 0.22, 0.04), 0.2, 0.08, 0.03), M.handle, 0, 0, 0, 0, 0, 0, lid);
    for (const [a, y] of [[-1, ly1 - 0.065], [1, ly1 - 0.065], [-1, ly0 + 0.065], [1, ly0 + 0.065]]) mk(onHull(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8).rotateX(Math.PI / 2), a * (LA - 0.06), y, 0.014), M.dark, 0, 0, 0, 0, 0, 0, lid);
    // heat: a glowing cap over the shield while it falls, fading after impact
    const glow = mk(new THREE.SphereGeometry(R * 1.04, 20, 10, 0, TAU, Math.PI / 2, Math.PI / 2), M.hot.clone(), 0, -L * 0.23, 0); glow.scale.set(1, 0.72, 1); glow.castShadow = false;
    g.userData = { lid, glow };
    return g;
  }
  // a pool of soft round points (smoke, dust, sparks, dirt)
  function particles(n, color, additive, size) {
    const pos = new Float32Array(n * 3), a = new Float32Array(n), s = new Float32Array(n);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aA', new THREE.BufferAttribute(a, 1)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(color) }, uK: { value: size } },
      vertexShader: 'attribute float aA; attribute float aS; varying float vA; uniform float uK; void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aA > 0.0 ? clamp(aS * uK / max(0.5, -mv.z), 1.0, 600.0) : 0.0; }',
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); if (vA <= 0.0) discard; gl_FragColor = vec4(uCol, smoothstep(0.5, 0.05, r) * vA); }',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false;
    const P = []; for (let i = 0; i < n; i++) P.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 1, life: 1, s0: 1, s1: 1, a0: 1, grav: 0, drag: 0 });
    return { pts, P, acc: 0, live: 0 };
  }
  function emit(sys, o) {
    for (const p of sys.P) if (p.t >= 1) { Object.assign(p, { grav: 0, drag: 0.5, a0: 1 }, o, { t: 0 }); return p; }
    return null;
  }
  function stepParticles(sys, dt, groundAt) {
    const pos = sys.pts.geometry.attributes.position, A = sys.pts.geometry.attributes.aA, S = sys.pts.geometry.attributes.aS;
    let live = 0;
    sys.P.forEach((p, i) => {
      if (p.t < 1) {
        p.t += dt / p.life;
        const d = Math.exp(-dt * p.drag); p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.grav > 0 && groundAt) { const gy = groundAt(p.x, p.z); if (p.y < gy) { p.y = gy; p.vx *= 0.3; p.vz *= 0.3; p.vy = 0; } }
        live++;
      }
      const k = Math.min(1, p.t);
      pos.setXYZ(i, p.x, p.y, p.z); A.setX(i, p.t < 1 ? p.a0 * Math.sin(Math.min(1, k * 1.15) * Math.PI) ** 0.7 : 0); S.setX(i, lerp(p.s0, p.s1, Math.sqrt(k)));
    });
    pos.needsUpdate = true; A.needsUpdate = true; S.needsUpdate = true;
    sys.live = live;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  return {
    get list() { return list; },
    // (the glint's star, for a twinkle anywhere else in the sky)
    glintTex() { return materials().glint; },
    // a pod is on its way (everyone): e = { id, x, z, dir, items, t? (for late joiners), opened? }
    spawn(e) {
      const ext = G.ext; if (!ext) return;
      const pod = { id: e.id, x: e.x, z: e.z, dir: e.dir, items: e.items, t: e.t != null ? e.t : -(POD.WAIT + POD.GLINT), opened: !!e.opened, hit: false, open: 0 };
      pod.gy = ext.height(e.x, e.z);
      pod.from = V(e.x + Math.cos(e.dir) * POD.RUN, pod.gy + POD.H, e.z + Math.sin(e.dir) * POD.RUN);
      // at rest: nose buried in the bowl, the tail leaning back the way it came
      const back = V(Math.cos(e.dir), 0, Math.sin(e.dir)), axis = V(0, 1, 0).addScaledVector(back, Math.tan(0.36)).normalize();
      pod.restQ = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis);
      // turn it about its axis so the hatch faces out of the crater, up the slope away from where it came from
      pod.restQ.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(-back.x, -back.z)));
      pod.mesh = buildPod(); R.scene.add(pod.mesh);
      pod.trail = particles(1100, 0x9a948c, false, 300); R.scene.add(pod.trail.pts);
      pod.dirt = particles(90, 0x4a3c30, false, 120); R.scene.add(pod.dirt.pts);
      pod.dust = particles(60, 0x8a8070, false, 900); R.scene.add(pod.dust.pts);
      pod.fire = particles(160, 0xff8a40, true, 420); R.scene.add(pod.fire.pts);
      // the burning head you see streaking across the sky
      pod.head = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: new THREE.Color(2.4, 1.3, 0.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      pod.head.scale.set(7, 7, 1); R.scene.add(pod.head);
      pod.smoke = particles(80, 0x45403a, false, 500); R.scene.add(pod.smoke.pts);
      pod.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: new THREE.Color(3, 2.2, 1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      pod.flash.scale.set(30, 30, 1); R.scene.add(pod.flash);
      pod.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: materials().glint, color: new THREE.Color(5, 4.6, 4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
      pod.glint.position.copy(pod.from); R.scene.add(pod.glint);
      pod.mesh.visible = pod.t >= 0;
      list.push(pod);
      // the whistle of it coming in, heard from where it will land (starting when it does)
      if (pod.t < POD.FALL - 0.2) SFX.play('pod_fall', V(e.x, pod.gy + 40, e.z), { vol: 1.4, ref: 60, dur: POD.FALL - Math.max(0, pod.t), delay: Math.max(0, -pod.t) });
      if (pod.t >= POD.FALL) this.land(pod, true);
      if (pod.opened) this.crack(pod, true);
    },
    // where it is at time t of its fall
    fallPos(pod, t) { const u = clamp(t / POD.FALL, 0, 1), k = u * u * (0.35 + 0.65 * u); return pod.from.clone().lerp(V(pod.x, pod.gy, pod.z), k); },
    land(pod, quiet) {
      pod.hit = true; pod.head.material.opacity = 0;
      G.ext.addCrater(pod.x, pod.z, POD.CRATER, POD.DEPTH);
      G.ext.addCircle(pod.x, pod.z, 0.75);
      pod.gy = G.ext.height(pod.x, pod.z);
      pod.mesh.quaternion.copy(pod.restQ);
      const axis = V(0, 1, 0).applyQuaternion(pod.restQ);
      pod.mesh.position.set(pod.x, pod.gy, pod.z).addScaledVector(axis, POD.LEN * 0.5 - 0.75);
      pod.mesh.userData.glow.material.opacity = quiet ? 0 : 1;
      if (quiet) return;
      const at = V(pod.x, pod.gy + 0.5, pod.z), cam = R.camera.position, d = cam.distanceTo(at), me = G.me();
      // the flash and the fireball, thrown dirt, a dust cloud rolling out low
      pod.flash.position.copy(at).y += 1.5; pod.flashT = 0.35;
      for (let i = 0; i < 30; i++) { const a = rnd(0, TAU), s = rnd(2, 7); emit(pod.fire, { x: at.x, y: at.y + 0.5, z: at.z, vx: Math.cos(a) * s, vy: rnd(2, 8), vz: Math.sin(a) * s, life: rnd(0.35, 0.8), s0: 1.2, s1: 3.2, drag: 3 }); }
      for (let i = 0; i < 80; i++) { const a = rnd(0, TAU), s = rnd(3, 11); emit(pod.dirt, { x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * s, vy: rnd(4, 13), vz: Math.sin(a) * s, life: rnd(1.2, 2.4), s0: rnd(0.4, 1.1), s1: 0.5, grav: 22, drag: 0.4 }); }
      const L = G.ext.lighting(G.round ? G.round.time : 720), day = 0.25 + 0.75 * (1 - L.night), base = G.ext.biome.ground.trail;
      pod.dust.pts.material.uniforms.uCol.value.setRGB(base[0] * day, base[1] * day, base[2] * day);
      pod.smoke.pts.material.uniforms.uCol.value.setRGB(0.17 * day + 0.02, 0.16 * day + 0.02, 0.15 * day + 0.02);
      for (let i = 0; i < 50; i++) { const a = rnd(0, TAU), s = rnd(3, 9); emit(pod.dust, { x: at.x + Math.cos(a) * 1.5, y: at.y + rnd(0, 1), z: at.z + Math.sin(a) * 1.5, vx: Math.cos(a) * s, vy: rnd(0.5, 2.5), vz: Math.sin(a) * s, life: rnd(3, 6.5), s0: 2, s1: 7, drag: 1.4, a0: 0.55 }); }
      // you hear it after you see it, and feel it if you're close
      const delay = d / 340;
      SFX.play('bang', at, { vol: 2.4, ref: 25, delay }); SFX.play('thud', at, { vol: 2, ref: 20, delay: delay + 0.02 });
      SFX.play('debris', at, { vol: 1.2, ref: 15, delay: delay + 0.4 });
      if (me && me.alive && me.zone === 'out') {
        Player.addShake(clamp(1.3 - d / 55, 0, 1));
        if (d < 120) R.fx.flash = Math.max(R.fx.flash, clamp(0.5 - d / 240, 0, 0.5));
      }
    },
    // the hatch blows off (everyone); the host puts the goods in the crater
    crack(pod, quiet) {
      pod.opened = true; pod.open = quiet ? 1.5 : 0.001;
      const lid = pod.mesh.userData.lid;
      if (quiet) { lid.visible = false; return; }
      const hatchW = V(0, 0.08, POD.R * 0.93).applyMatrix4(pod.mesh.matrixWorld);
      SFX.play('vent_air', hatchW, { vol: 1, dur: 1.2, ref: 6 }); SFX.play('hit_metal', hatchW, { vol: 1, ref: 8 });
      // the lid's flight: out along the hatch's facing, tumbling, landing a few metres off
      const n = V(0, 0, 1).applyQuaternion(pod.mesh.quaternion);
      pod.lidFly = { p: hatchW.clone(), v: n.multiplyScalar(5).add(V(0, 3.2, 0)), r: V(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), rest: false };
      pod.mesh.remove(lid); lid.position.copy(hatchW); lid.quaternion.copy(pod.mesh.quaternion); R.scene.add(lid); pod.lid = lid;
      for (let i = 0; i < 18; i++) emit(pod.smoke, { x: hatchW.x, y: hatchW.y, z: hatchW.z, vx: rnd(-1, 1), vy: rnd(0.5, 1.8), vz: rnd(-1, 1), life: rnd(1.2, 2.4), s0: 0.6, s1: 2.2, a0: 0.5 });
    },
    // where the order ends up when the pod is opened (host): around the hatch side, in the bowl
    dropSpots(pod, n) {
      const out = [], back = Math.atan2(Math.sin(pod.dir), Math.cos(pod.dir));
      for (let i = 0; i < n; i++) {
        const a = back + Math.PI + (i - (n - 1) / 2) * 0.55, d = 1.35 + (i % 2) * 0.35, x = pod.x + Math.cos(a) * d, z = pod.z + Math.sin(a) * d;
        out.push({ x: +x.toFixed(2), z: +z.toFixed(2), y: +G.ext.height(x, z).toFixed(2) });
      }
      return out;
    },
    update(dt) {
      const ext = G.ext; if (!ext) return;
      this.meteors.update(dt);
      const gAt = (x, z) => ext.height(x, z);
      for (const pod of list) {
        pod.t += dt;
        if (pod.t < 0) {
          // on its way: a glint high up where it will come from, twinkling, swelling, then one sharp sparkle as it drops
          const k = pod.t + POD.GLINT, g = pod.glint;
          if (k <= 0) { g.material.opacity = 0; continue; }
          const u = k / POD.GLINT, flash = Math.exp(-Math.pow((u - 0.86) / 0.06, 2));
          const tw = 0.5 + 0.3 * Math.sin(k * 21) * Math.sin(k * 6.7);
          g.material.opacity = Math.min(1, sstep(0, 0.3, u) * (tw * (1 - flash) + 1.5 * flash) * (1 - 0.7 * sstep(0.92, 1, u)));
          const s = R.camera.position.distanceTo(pod.from) * (0.06 + 0.03 * u + 0.24 * flash);
          g.scale.set(s, s, 1); g.material.rotation = k * 0.5;
          if (!pod.kira && u > 0.8) { pod.kira = true; SFX.play('glint', null, { vol: 0.5 }); }
          continue;
        }
        if (pod.glint.material.opacity > 0) pod.glint.material.opacity = 0;
        if (!pod.hit) {
          pod.mesh.visible = true;
          const p = this.fallPos(pod, pod.t), q = this.fallPos(pod, pod.t + 0.02), vel = q.clone().sub(p);
          pod.mesh.position.copy(p);
          if (vel.lengthSq() > 1e-8) pod.mesh.quaternion.setFromUnitVectors(V(0, 1, 0), vel.normalize().negate());
          // the trail: smoke left hanging in the air all along the path it covered this frame (it moves metres per
          // frame near the end), and a short tail of fire streaming off the shield
          const seg = Math.max(1, Math.ceil(q.distanceTo(p) / 0.02 * dt / 0.6));
          pod.trail.acc += dt * 260;
          while (pod.trail.acc > 1) { pod.trail.acc--; const b = this.fallPos(pod, pod.t - Math.random() * dt); emit(pod.trail, { x: b.x + rnd(-0.4, 0.4), y: b.y + rnd(-0.4, 0.4), z: b.z + rnd(-0.4, 0.4), vx: rnd(-0.4, 0.4), vy: rnd(0, 0.6), vz: rnd(-0.4, 0.4), life: rnd(3, 5), s0: 1.4, s1: 6.5, drag: 0.6, a0: 0.5 }); }
          for (let k = 0; k < 6 + seg; k++) { const b = this.fallPos(pod, pod.t - (k / (6 + seg)) * dt * 1.6); emit(pod.fire, { x: b.x, y: b.y, z: b.z, vx: rnd(-1, 1), vy: rnd(-1, 1) + 2, vz: rnd(-1, 1), life: 0.22, s0: 2.6, s1: 0.9, drag: 2 }); }
          pod.mesh.userData.glow.material.opacity = 0.9 + Math.random() * 0.1;
          pod.head.position.copy(p); pod.head.material.opacity = 0.85 + Math.random() * 0.15;
          if (pod.t >= POD.FALL) this.land(pod, false);
        } else {
          // cooling: the shield's glow dies away, smoke curls off it for a while
          const since = pod.t - POD.FALL, gl = pod.mesh.userData.glow;
          gl.material.opacity = Math.max(0, 1 - since / 6) * 0.8;
          // thin wisps from the scorched shield, rising and drifting off, thinning out over half a minute
          if (since < 35 && Math.random() < dt * 6 * (1 - since / 35)) { const p = pod.mesh.position; emit(pod.smoke, { x: p.x + rnd(-0.3, 0.3), y: p.y - 0.4 + rnd(0, 0.4), z: p.z + rnd(-0.3, 0.3), vx: rnd(-0.15, 0.15) + 0.35, vy: rnd(1.3, 2.2), vz: rnd(-0.15, 0.15), life: rnd(2.5, 4), s0: 0.45, s1: 2.2, drag: 0.25, a0: 0.22 }); }
        }
        if (pod.flashT > 0) { pod.flashT -= dt; pod.flash.material.opacity = Math.max(0, pod.flashT / 0.35); } else pod.flash.material.opacity = 0;
        // the blown hatch tumbling away and landing
        const lf = pod.lidFly;
        if (lf && !lf.rest) {
          lf.v.y -= 18 * dt; lf.p.addScaledVector(lf.v, dt);
          pod.lid.position.copy(lf.p); pod.lid.rotation.x += lf.r.x * dt; pod.lid.rotation.y += lf.r.y * dt; pod.lid.rotation.z += lf.r.z * dt;
          const gy = gAt(lf.p.x, lf.p.z) + 0.04;
          if (lf.p.y <= gy && lf.v.y < 0) {
            if (Math.abs(lf.v.y) > 3) { lf.v.y *= -0.3; lf.v.x *= 0.5; lf.v.z *= 0.5; lf.r.multiplyScalar(0.4); SFX.play('hit_metal', lf.p, { vol: 0.7, ref: 6 }); }
            else { lf.rest = true; lf.p.y = gy; pod.lid.position.copy(lf.p); pod.lid.rotation.set(-Math.PI / 2, pod.lid.rotation.y, 0); }
          }
        }
        stepParticles(pod.trail, dt); stepParticles(pod.dirt, dt, gAt); stepParticles(pod.dust, dt); stepParticles(pod.fire, dt); stepParticles(pod.smoke, dt);
      }
    },
    // what can be opened from here (local)
    interactables(me, out) {
      for (const pod of list) {
        if (!pod.hit || pod.opened || pod.t < POD.FALL + 1.2) continue;
        const h = V(0, 0.08, POD.R * 0.98).applyMatrix4(pod.mesh.matrixWorld);
        if (h.distanceTo(me.pos) > 4) continue;
        out.push({ kind: 'pod', ref: pod.id, x: h.x, y: h.y, z: h.z, r: 0.5, label: 'Open supply pod' });
      }
    },
    get(id) { return list.find((p) => p.id === id); },
    // On the airless moons and rocks, once in a while, a swarm of meteoroids comes down out of the black sky. There's no
    // air to burn them or slow them, so there's no fireball coming in: just a glint of sunlight on rock streaking down
    // an instant before it hits. Each impact is a white flash, a cone of ejecta thrown out on long, slow arcs in the
    // light gravity (nothing billows: every grain flies on its own and falls), the ground jumping underfoot, and a fresh
    // crater ringed with bright spray. Each strike runs on its own clock, t: how long until it hits.
    meteors: {
      list: [], fx: null,
      // (built when a site on an airless moon goes up, so it's compiled with the rest before anyone sees it)
      prepare() {
        if (this.fx) return;
        const fx = this.fx = { ejecta: particles(1800, 0x9a968e, false, 120), rocks: particles(140, 0x4a4640, false, 95), skim: particles(240, 0x9a968e, false, 260), flash: [], line: [] };
        for (const k of ['ejecta', 'rocks', 'skim']) R.scene.add(fx[k].pts);
        for (let i = 0; i < 4; i++) {
          const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: new THREE.Color(3, 2.9, 2.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
          R.scene.add(f); fx.flash.push(f);
          const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, -500, 0), V(0, -500, 0)]), new THREE.LineBasicMaterial({ color: new THREE.Color(2.6, 2.5, 2.3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
          l.frustumCulled = false; R.scene.add(l); fx.line.push(l);
        }
      },
      // a swarm on its way (everyone): e.list: [{ x, z, r (crater radius), d (its depth), t (seconds till it hits), dir }]
      spawn(e) {
        if (!G.ext) return;
        this.prepare();
        for (const m of e.list) {
          const gy = G.ext.height(m.x, m.z), el = m.el != null ? m.el + (Math.random() - 0.5) * 0.1 : 0.9 + Math.random() * 0.35, L = 900;
          this.list.push(Object.assign({}, m, { gy, from: V(m.x + Math.cos(m.dir) * Math.cos(el) * L, gy + Math.sin(el) * L, m.z + Math.sin(m.dir) * Math.cos(el) * L), hit: false, ft: 0 }));
        }
      },
      impact(s) {
        s.hit = true;
        const ext = G.ext, fx = this.fx;
        ext.addCrater(s.x, s.z, s.r, s.d, true);
        const at = V(s.x, ext.height(s.x, s.z) + 0.3, s.z), k = s.r / 5;
        const f = fx.flash.find((o) => o.material.opacity <= 0) || fx.flash[0]; f.position.copy(at).y += s.r * 0.4; f.scale.setScalar(s.r * 9); s.flash = f; s.ft = 0.3;
        const L = ext.lighting(G.round ? G.round.time : 720), day = 0.3 + 0.7 * (1 - L.night), base = ext.biome.ground.trail;
        for (const sys of [fx.ejecta, fx.skim]) sys.pts.material.uniforms.uCol.value.setRGB(Math.min(1, base[0] * 1.35) * day, Math.min(1, base[1] * 1.35) * day, Math.min(1, base[2] * 1.35) * day);
        fx.rocks.pts.material.uniforms.uCol.value.setRGB(base[0] * 0.6 * day, base[1] * 0.6 * day, base[2] * 0.6 * day);
        // the cone of ejecta, flung up and out and falling back slowly; chunks of rock; a sheet of dust skimming low
        // (the curtain: a thin cone of it, every grain thrown at much the same angle, so it reads as a sheet)
        const cone = rnd(0.7, 0.85);
        for (let i = 0; i < 360 * k; i++) { const a = rnd(0, TAU), e = cone + rnd(-0.12, 0.12) + (Math.random() < 0.15 ? rnd(-0.3, 0.25) : 0), v = rnd(5, 22) * Math.sqrt(k); emit(fx.ejecta, { x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(e) * v, vz: Math.sin(a) * Math.cos(e) * v, life: rnd(5, 9), s0: rnd(0.15, 0.45), s1: rnd(0.5, 1.1), grav: 4, drag: 0, a0: 0.75 }); }
        for (let i = 0; i < 26 * k; i++) { const a = rnd(0, TAU), e = rnd(0.4, 1.1), v = rnd(4, 13); emit(fx.rocks, { x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(e) * v, vz: Math.sin(a) * Math.cos(e) * v, life: rnd(4, 7), s0: rnd(0.25, 0.6), s1: 0.4, grav: 4, drag: 0 }); }
        for (let i = 0; i < 60 * k; i++) { const a = rnd(0, TAU), v = rnd(8, 26); emit(fx.skim, { x: at.x, y: at.y - 0.1, z: at.z, vx: Math.cos(a) * v, vy: rnd(0.3, 1.6), vz: Math.sin(a) * v, life: rnd(2.5, 4.5), s0: 1.5, s1: 4, grav: 4, drag: 0, a0: 0.5 }); }
        // with no air nothing carries the sound: you feel it come up through the ground (and the hull, aboard)
        const cam = R.camera.position, d = cam.distanceTo(at), me = G.me();
        SFX.play('thud', at, { vol: 1.4 * k + 0.6, ref: 30, occl: 0.6, delay: d / 2500 }); SFX.play('bang', at, { vol: 0.9 * k, ref: 25, occl: 0.85, delay: d / 2500 });
        SFX.play('debris', at, { vol: 0.5, ref: 12, occl: 0.6, delay: 1.5 });
        if (me && me.alive) { Player.addShake(clamp((1.6 - d / 70) * (0.5 + 0.5 * k), 0, 1.2)); if (me.zone === 'out' && d < 60) R.fx.flash = Math.max(R.fx.flash, clamp(0.5 - d / 120, 0, 0.5) * k); }
        if (G.isHost) G.hostMeteorHit(s);
      },
      update(dt) {
        const fx = this.fx; if (!fx || !G.ext) return;
        const gAt = (x, z) => G.ext.height(x, z);
        let n = 0;
        for (const s of this.list) {
          s.t -= dt;
          // the glint coming in: sunlight on a rock, streaking down the last instant
          if (!s.hit && s.t < 0.35) {
            const l = s.line || (s.line = fx.line.find((o) => !o.userData.busy) || fx.line[0]); l.userData.busy = true;
            const u = clamp(1 - s.t / 0.35, 0, 1), head = s.from.clone().lerp(V(s.x, s.gy, s.z), u), tail = s.from.clone().lerp(V(s.x, s.gy, s.z), Math.max(0, u - 0.12));
            l.geometry.attributes.position.setXYZ(0, head.x, head.y, head.z); l.geometry.attributes.position.setXYZ(1, tail.x, tail.y, tail.z); l.geometry.attributes.position.needsUpdate = true;
            l.material.opacity = 0.9;
          }
          if (!s.hit && s.t <= 0) { this.impact(s); if (s.line) { s.line.material.opacity = 0; s.line.userData.busy = false; } }
          if (s.ft > 0) { s.ft -= dt; s.flash.material.opacity = Math.max(0, s.ft / 0.3); }
          if (!s.hit || s.ft > 0) n++;
        }
        if (!n) this.list.length = 0;
        stepParticles(fx.ejecta, dt, gAt); stepParticles(fx.rocks, dt, gAt); stepParticles(fx.skim, dt, gAt);
      },
      clear() {
        this.list.length = 0;
        if (this.fx) { for (const o of [this.fx.ejecta.pts, this.fx.rocks.pts, this.fx.skim.pts, ...this.fx.flash, ...this.fx.line]) if (o.parent) o.parent.remove(o); this.fx = null; }
      },
    },
    serialize() { return list.map((p) => ({ id: p.id, x: p.x, z: p.z, dir: p.dir, items: p.items, t: p.t, opened: p.opened })); },
    clear() {
      for (const p of list) { for (const o of [p.mesh, p.trail.pts, p.dirt.pts, p.dust.pts, p.fire.pts, p.smoke.pts, p.flash, p.head, p.lid, p.glint]) if (o && o.parent) o.parent.remove(o); }
      list.length = 0;
      this.meteors.clear();
    },
  };
})();
const Meteors = Pods.meteors;
