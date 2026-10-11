'use strict';
// Procedural canvas textures + shared materials.
const TEX = (() => {
  const cache = {};
  const r = new RNG(1337);
  function C(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  // a few of the ship's own surfaces (its insulation, ceiling panels, pegboard) are drawn at twice the pixels: same layout
  // in the same coordinates, finer and sharper (everything else keeps the old, grainier resolution)
  const Q = 2;
  function CQ(w, h) { const [c, g] = C(w * Q, h * Q); g.scale(Q, Q); return [c, g]; }
  function finish(c, repeatS = true, repeatT = true) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = repeatT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function speckle(g, w, h, amt, mono = true) {
    // (over the whole canvas, in real pixels, whatever scale it was drawn at)
    const id = g.getImageData(0, 0, g.canvas.width, g.canvas.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (r.next() - 0.5) * amt;
      if (mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      else { d[i] += (r.next() - 0.5) * amt; d[i + 1] += (r.next() - 0.5) * amt; d[i + 2] += (r.next() - 0.5) * amt; }
    }
    g.putImageData(id, 0, 0);
  }
  function blotches(g, w, h, n, color, a0, a1, s0, s1) {
    for (let i = 0; i < n; i++) {
      const x = r.next() * w, y = r.next() * h, rad = r.range(s0, s1);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${color},${r.range(a0, a1)})`); gr.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  // a height canvas (red channel, wrapping) -> tangent-space normal map (+v up, as three.js expects)
  function normalFrom(src, strength) {
    const w = src.width, h = src.height, sd = src.getContext('2d').getImageData(0, 0, w, h).data;
    const [c, g] = C(w, h), id = g.createImageData(w, h), d = id.data;
    const H = (x, y) => sd[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const du = (H(x + 1, y) - H(x - 1, y)) * strength, dv = (H(x, y - 1) - H(x, y + 1)) * strength;
      const l = Math.sqrt(du * du + dv * dv + 1), i = (y * w + x) * 4;
      d[i] = (-du / l * 0.5 + 0.5) * 255; d[i + 1] = (-dv / l * 0.5 + 0.5) * 255; d[i + 2] = (0.5 / l + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    const t = finish(c); t.colorSpace = THREE.NoColorSpace; return t;
  }
  // the hull's plate layout (in a 512 px = 4 m tile), shared by the colour map and its relief
  const HULL_HATCHES = [[300, 30, 70, 50], [60, 300, 90, 60], [380, 410, 50, 70]];
  function hullPlates(fn) { for (let row = 0; row < 4; row++) { const off = (row % 2) * 128; for (let k = -1; k < 3; k++) fn(off + k * 256 + 1.5, row * 128 + 1.5, 253, 125, row, k); } }
  function hullSeams(fn) {
    for (let row = 0; row <= 4; row++) fn(0, row * 128 - 1.5, 512, 3);
    for (let row = 0; row < 4; row++) { const off = (row % 2) * 128; for (let k = -1; k < 3; k++) fn(off + k * 256 - 1.5, row * 128, 3, 128); }
  }
  function hullRivets(fn) {
    for (let row = 0; row <= 4; row++) for (let x = 8; x < 512; x += 16) { fn(x, row * 128 - 6); fn(x, row * 128 + 6); }
    for (let row = 0; row < 4; row++) { const off = (row % 2) * 128; for (let k = -1; k < 3; k++) for (let y = row * 128 + 14; y < row * 128 + 120; y += 16) { const sx = off + k * 256; fn(sx - 6, y); fn(sx + 6, y); } }
  }
  function cracks(g, w, h, n, color = 'rgba(20,18,15,0.55)') {
    g.strokeStyle = color; g.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      let x = r.next() * w, y = r.next() * h, a = r.next() * TAU;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < r.int(6, 18); k++) { a += r.range(-0.7, 0.7); x += Math.cos(a) * r.range(3, 9); y += Math.sin(a) * r.range(3, 9); g.lineTo(x, y); }
      g.stroke();
    }
  }
  function drips(g, w, h, n, fromTop = true) {
    for (let i = 0; i < n; i++) {
      const x = r.next() * w, len = r.range(h * 0.1, h * 0.6), wd = r.range(1, 4);
      const y0 = fromTop ? 0 : h - len;
      const gr = g.createLinearGradient(0, y0, 0, y0 + len);
      gr.addColorStop(0, `rgba(40,30,20,${r.range(0.15, 0.4)})`); gr.addColorStop(1, 'rgba(40,30,20,0)');
      g.fillStyle = gr; g.fillRect(x, y0, wd, len);
    }
  }
  function rivets(g, xs, ys) { for (const x of xs) for (const y of ys) { g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(x + 1, y + 1, 2.2, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); } }

  const build = {
    wallConcrete() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#76736a'; g.fillRect(0, 0, 256, 256);
      blotches(g, 256, 256, 40, '40,38,32', 0.05, 0.2, 10, 50);
      blotches(g, 256, 256, 20, '150,145,130', 0.04, 0.12, 10, 40);
      // painted lower band (1.1m of 3m)
      const bandTop = 256 - Math.round(256 * 1.1 / 3);
      g.fillStyle = '#2d4640'; g.fillRect(0, bandTop, 256, 256 - bandTop);
      for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(118,115,106,.9)'; g.fillRect(r.next() * 256, bandTop + r.next() * (256 - bandTop), r.range(2, 9), r.range(1, 5)); }
      g.fillStyle = '#a8913f'; g.fillRect(0, bandTop - 4, 256, 4);
      g.fillStyle = '#161614'; g.fillRect(0, 248, 256, 8);
      drips(g, 256, 256, 26, true);
      const gr = g.createLinearGradient(0, 200, 0, 256); gr.addColorStop(0, 'rgba(20,16,10,0)'); gr.addColorStop(1, 'rgba(20,16,10,.55)'); g.fillStyle = gr; g.fillRect(0, 200, 256, 56);
      cracks(g, 256, 256, 5);
      speckle(g, 256, 256, 26);
      return finish(c, true, false);
    },
    wallTile() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#4a4c48'; g.fillRect(0, 0, 256, 256);
      const n = 8, s = 256 / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const v = 190 + r.range(-18, 12) | 0;
        const missing = r.chance(0.04);
        g.fillStyle = missing ? '#2c2a26' : `rgb(${v},${v + 4},${v - 2})`;
        g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
      }
      g.fillStyle = '#1e2120'; g.fillRect(0, 256 - 64, 256, 3);
      blotches(g, 256, 256, 30, '70,60,40', 0.08, 0.3, 8, 40);
      drips(g, 256, 256, 18, true);
      cracks(g, 256, 256, 6);
      const gr = g.createLinearGradient(0, 180, 0, 256); gr.addColorStop(0, 'rgba(30,25,15,0)'); gr.addColorStop(1, 'rgba(30,25,15,.5)'); g.fillStyle = gr; g.fillRect(0, 180, 256, 76);
      speckle(g, 256, 256, 14);
      return finish(c, true, false);
    },
    floorConcrete() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#56524a'; g.fillRect(0, 0, 256, 256);
      blotches(g, 256, 256, 50, '30,28,24', 0.05, 0.25, 10, 60);
      blotches(g, 256, 256, 8, '20,16,12', 0.2, 0.45, 8, 26);
      g.strokeStyle = 'rgba(15,14,12,.7)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
      cracks(g, 256, 256, 8);
      speckle(g, 256, 256, 30);
      return finish(c);
    },
    floorTile() {
      const [c, g] = C(256, 256);
      const n = 4, s = 256 / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const dark = (i + j) % 2 === 0;
        g.fillStyle = dark ? '#3c3b37' : '#8d887a'; g.fillRect(i * s, j * s, s, s);
      }
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.5;
      for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(256, i * s); g.stroke(); }
      blotches(g, 256, 256, 40, '35,28,18', 0.08, 0.3, 10, 60);
      cracks(g, 256, 256, 4);
      speckle(g, 256, 256, 22);
      return finish(c);
    },
    ceiling() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#3a3a37'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#1c1c1a'; g.lineWidth = 4;
      for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(256, i * 128); g.stroke(); }
      blotches(g, 256, 256, 14, '70,55,30', 0.1, 0.35, 10, 45);
      speckle(g, 256, 256, 18);
      return finish(c);
    },
    metalPanel() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#5b6266'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const v = r.range(-10, 10) | 0;
        g.fillStyle = `rgb(${88 + v},${96 + v},${101 + v})`; g.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
      }
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, 125, 125); g.strokeRect(129.5, 1.5, 125, 125); g.strokeRect(1.5, 129.5, 125, 125); g.strokeRect(129.5, 129.5, 125, 125);
      rivets(g, [10, 118, 138, 246], [10, 118, 138, 246]);
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
      for (let i = 0; i < 40; i++) { const x = r.next() * 256, y = r.next() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-30, 30), y + r.range(-6, 6)); g.stroke(); }
      blotches(g, 256, 256, 18, '30,22,14', 0.08, 0.25, 8, 40);
      speckle(g, 256, 256, 12);
      return finish(c);
    },
    grate() {
      const [c, g] = C(128, 128);
      g.fillStyle = '#4c5154'; g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 16) {
        const ox = (y / 16) % 2 ? 8 : 0;
        g.save(); g.translate(x + ox + 4, y + 8); g.rotate(((y / 16) % 2 ? 1 : -1) * 0.7);
        g.fillStyle = 'rgba(160,170,175,.35)'; g.fillRect(-5, -1.5, 10, 3); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(-5, 1.5, 10, 1.5);
        g.restore();
      }
      blotches(g, 128, 128, 10, '25,20,15', 0.1, 0.3, 6, 24);
      speckle(g, 128, 128, 16);
      return finish(c);
    },
    rust() {
      const [c, g] = C(128, 128);
      g.fillStyle = '#5a3a24'; g.fillRect(0, 0, 128, 128);
      blotches(g, 128, 128, 40, '130,70,30', 0.15, 0.5, 4, 22);
      blotches(g, 128, 128, 30, '30,20,15', 0.15, 0.4, 3, 16);
      speckle(g, 128, 128, 40, false);
      return finish(c);
    },
    paintedMetal() {
      const [c, g] = C(128, 128);
      g.fillStyle = '#6b6f62'; g.fillRect(0, 0, 128, 128);
      blotches(g, 128, 128, 25, '90,55,30', 0.15, 0.6, 2, 10);
      blotches(g, 128, 128, 10, '20,20,20', 0.1, 0.3, 6, 25);
      speckle(g, 128, 128, 18);
      return finish(c);
    },
    // crew suit paint after years of night shifts: worn through at the edges to dark metal, rust weeping from
    // chips and seams, grime ground in. Light overall, so the suit colour tints it.
    suitWorn() {
      const [c, g] = C(256, 256), rr = new RNG(31);
      g.fillStyle = '#c9c4b8'; g.fillRect(0, 0, 256, 256);
      blotches(g, 256, 256, 30, '120,112,98', 0.15, 0.4, 10, 40);
      // chipped paint: small dark islands of bare metal with a rusty halo
      for (let i = 0; i < 70; i++) {
        const x = rr.next() * 256, y = rr.next() * 256, s = rr.range(1.5, 6);
        g.fillStyle = 'rgba(140,82,44,.55)'; g.beginPath(); g.ellipse(x, y, s * 1.8, s * 1.4, rr.range(0, 3), 0, TAU); g.fill();
        g.fillStyle = 'rgba(52,50,48,.9)'; g.beginPath(); g.ellipse(x, y, s, s * 0.7, rr.range(0, 3), 0, TAU); g.fill();
      }
      // rust weeping down from the chips
      for (let i = 0; i < 40; i++) { const x = rr.next() * 256, y = rr.next() * 256, l = rr.range(10, 50); const gr = g.createLinearGradient(x, y, x, y + l); gr.addColorStop(0, 'rgba(120,64,30,.45)'); gr.addColorStop(1, 'rgba(120,64,30,0)'); g.fillStyle = gr; g.fillRect(x - 1, y, rr.range(1.5, 3.5), l); }
      blotches(g, 256, 256, 18, '40,36,30', 0.1, 0.35, 12, 50);
      speckle(g, 256, 256, 22);
      return finish(c);
    },
    // cabin window glass: nearly clear, a little tint, wiped smears and dust (alpha carries it)
    cabinGlass() {
      const [c, g] = C(256, 256), rr = new RNG(19);
      g.fillStyle = 'rgba(70,90,92,0.07)'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(200,210,205,${rr.range(0.02, 0.05)})`; g.lineWidth = rr.range(8, 22); g.beginPath(); const x = rr.range(0, 256), y = rr.range(0, 256); g.arc(x, y, rr.range(30, 90), rr.range(0, 3), rr.range(3, 6)); g.stroke(); }
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(190,185,170,${rr.range(0.04, 0.14)})`; g.fillRect(rr.next() * 256, rr.next() * 256, 1.5, 1.5); }
      const e = g.createRadialGradient(128, 128, 70, 128, 128, 180); e.addColorStop(0, 'rgba(60,56,48,0)'); e.addColorStop(1, 'rgba(60,56,48,0.18)'); g.fillStyle = e; g.fillRect(0, 0, 256, 256);
      return finish(c);
    },
    // grey cloth tape, wrapped and re-wrapped
    tape() {
      const [c, g] = C(64, 64), rr = new RNG(8);
      g.fillStyle = '#8a8a86'; g.fillRect(0, 0, 64, 64);
      for (let y = 0; y < 64; y += 10) { g.fillStyle = 'rgba(30,30,28,.35)'; g.fillRect(0, y + rr.range(-1, 1), 64, 1.5); }
      blotches(g, 64, 64, 10, '50,46,40', 0.15, 0.4, 3, 12);
      speckle(g, 64, 64, 20);
      return finish(c);
    },
    wood() {
      const [c, g] = C(128, 128);
      for (let i = 0; i < 4; i++) {
        const v = r.range(-12, 12) | 0;
        g.fillStyle = `rgb(${96 + v},${70 + v},${44 + v})`; g.fillRect(0, i * 32, 128, 32);
        g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, i * 32, 128, 2);
        g.strokeStyle = 'rgba(40,25,10,.35)';
        for (let k = 0; k < 6; k++) { g.beginPath(); const y = i * 32 + r.range(4, 30); g.moveTo(0, y); g.bezierCurveTo(40, y + r.range(-3, 3), 80, y + r.range(-3, 3), 128, y); g.stroke(); }
      }
      speckle(g, 128, 128, 18);
      return finish(c);
    },
    crate() {
      const [c, g] = C(128, 128);
      g.fillStyle = '#6e5233'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, i * 21.3, 128, 1.5); }
      g.fillStyle = '#4e3922'; g.fillRect(0, 0, 128, 12); g.fillRect(0, 116, 128, 12); g.fillRect(0, 0, 12, 128); g.fillRect(116, 0, 12, 128);
      g.save(); g.translate(64, 64); g.rotate(Math.PI / 4); g.fillRect(-90, -6, 180, 12); g.restore();
      g.fillStyle = 'rgba(15,10,5,.7)'; g.font = 'bold 16px monospace'; g.fillText('M-S CO', 36, 70);
      speckle(g, 128, 128, 22);
      return finish(c);
    },
    terrain() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#4b4636'; g.fillRect(0, 0, 256, 256);
      blotches(g, 256, 256, 60, '70,72,48', 0.15, 0.4, 8, 40);
      blotches(g, 256, 256, 40, '35,30,22', 0.15, 0.4, 6, 30);
      g.lineWidth = 1;
      for (let i = 0; i < 900; i++) {
        const x = r.next() * 256, y = r.next() * 256, l = r.range(3, 8), v = r.range(-20, 20) | 0;
        g.strokeStyle = `rgba(${95 + v},${98 + v},${62 + v},.55)`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-2, 2), y - l); g.stroke();
      }
      for (let i = 0; i < 120; i++) { const v = r.range(60, 120) | 0; g.fillStyle = `rgba(${v},${v - 4},${v - 12},.6)`; g.fillRect(r.next() * 256, r.next() * 256, r.range(1, 3), r.range(1, 3)); }
      speckle(g, 256, 256, 18);
      return finish(c);
    },
    // ground detail for the other worlds: wet marsh mud, red canyon sand, burnt ash
    terrainMarsh() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#353b2c'; g.fillRect(0, 0, 256, 256);
      blotches(g, 256, 256, 70, '52,64,42', 0.15, 0.45, 8, 40); blotches(g, 256, 256, 40, '20,24,18', 0.2, 0.5, 6, 30);
      blotches(g, 256, 256, 18, '110,120,105', 0.05, 0.14, 6, 22);
      g.lineWidth = 1; for (let i = 0; i < 500; i++) { const x = r.next() * 256, y = r.next() * 256, l = r.range(3, 9), v = r.range(-15, 15) | 0; g.strokeStyle = `rgba(${70 + v},${88 + v},${52 + v},.5)`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-2, 2), y - l); g.stroke(); }
      speckle(g, 256, 256, 16); return finish(c);
    },
    terrainSand() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#8c5f42'; g.fillRect(0, 0, 256, 256);
      blotches(g, 256, 256, 60, '168,116,76', 0.15, 0.4, 8, 46); blotches(g, 256, 256, 40, '96,58,40', 0.15, 0.4, 6, 30);
      for (let i = 0; i < 14; i++) { const y = r.next() * 256; g.fillStyle = `rgba(${r.next() < 0.5 ? '180,130,90' : '110,70,48'},${r.range(0.08, 0.18)})`; g.fillRect(0, y, 256, r.range(2, 6)); }
      cracks(g, 256, 256, 12, 'rgba(60,36,24,.45)');
      for (let i = 0; i < 160; i++) { const v = r.range(120, 190) | 0; g.fillStyle = `rgba(${v},${v * 0.75 | 0},${v * 0.55 | 0},.6)`; g.fillRect(r.next() * 256, r.next() * 256, r.range(1, 3), r.range(1, 3)); }
      speckle(g, 256, 256, 20); return finish(c);
    },
    terrainAsh() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#3b3937'; g.fillRect(0, 0, 256, 256);
      blotches(g, 256, 256, 60, '78,74,70', 0.15, 0.4, 8, 40); blotches(g, 256, 256, 50, '18,16,15', 0.2, 0.5, 6, 30);
      cracks(g, 256, 256, 10, 'rgba(14,12,12,.6)');
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(150,${r.range(40, 70) | 0},20,${r.range(0.15, 0.4)})`; g.fillRect(r.next() * 256, r.next() * 256, 1.5, 1.5); }
      for (let i = 0; i < 140; i++) { const v = r.range(90, 150) | 0; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(r.next() * 256, r.next() * 256, r.range(1, 3), r.range(1, 2)); }
      speckle(g, 256, 256, 16); return finish(c);
    },
    // wind-packed snow: soft drifts, sastrugi ridges, a little grit and the odd rock showing through
    terrainSnow() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#d8dee6'; g.fillRect(0, 0, 256, 256);
      blotches(g, 256, 256, 60, '240,244,250', 0.2, 0.5, 10, 50); blotches(g, 256, 256, 40, '176,186,200', 0.12, 0.3, 8, 34);
      for (let i = 0; i < 70; i++) { const y = r.next() * 256, x = r.next() * 256; g.strokeStyle = `rgba(${r.next() < 0.5 ? '255,255,255' : '160,172,190'},${r.range(0.15, 0.35)})`; g.lineWidth = r.range(1, 2.5); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y - r.range(-4, 4), x + r.range(20, 40), y + r.range(-3, 3)); g.stroke(); }
      blotches(g, 256, 256, 10, '96,100,110', 0.2, 0.45, 2, 7);
      speckle(g, 256, 256, 8); return finish(c);
    },
    // a salt pan: a white crust broken into polygons, their raised rims, a little grey grit in the cracks
    terrainSalt() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#e4dccb'; g.fillRect(0, 0, 256, 256);
      blotches(g, 256, 256, 50, '246,242,232', 0.2, 0.5, 10, 46); blotches(g, 256, 256, 30, '196,186,166', 0.12, 0.3, 8, 30);
      // (a jittered grid of cells, each outlined by a raised rim)
      const N = 6, P = [];
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) P.push([i * 256 / N + (i % N ? r.range(-12, 12) : 0), j * 256 / N + (j % N ? r.range(-12, 12) : 0)]);
      g.lineCap = 'round';
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const p = P[j * (N + 1) + i];
        for (const [di, dj] of [[1, 0], [0, 1]]) { if (i + di > N || j + dj > N) continue; const q = P[(j + dj) * (N + 1) + i + di];
          g.strokeStyle = 'rgba(255,255,250,.85)'; g.lineWidth = 4; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
          g.strokeStyle = 'rgba(120,108,90,.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p[0] + 1, p[1] + 1); g.lineTo(q[0] + 1, q[1] + 1); g.stroke(); }
      }
      speckle(g, 256, 256, 10); return finish(c);
    },
    // basalt: black glassy rock, flow lines, ochre sulphur crusts and ember-red seams
    terrainBasalt() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#26221f'; g.fillRect(0, 0, 256, 256);
      blotches(g, 256, 256, 60, '52,46,42', 0.15, 0.4, 8, 40); blotches(g, 256, 256, 40, '10,9,9', 0.2, 0.5, 6, 30);
      for (let i = 0; i < 30; i++) { const y = r.next() * 256; g.strokeStyle = `rgba(70,64,58,${r.range(0.15, 0.35)})`; g.lineWidth = r.range(1, 3); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + r.range(-10, 10), 170, y + r.range(-10, 10), 256, y); g.stroke(); }
      blotches(g, 256, 256, 14, '170,130,40', 0.08, 0.2, 3, 12);
      cracks(g, 256, 256, 8, 'rgba(160,44,12,.55)');
      speckle(g, 256, 256, 14); return finish(c);
    },
    // old red brick in Flemish bond, sooty and mortar-stained (the mill)
    brick() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#5a4d42'; g.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 16; row++) for (let k = -1; k < 9; k++) {
        const x = k * 32 + (row % 2) * 16, y = row * 16, v = r.range(-22, 18) | 0;
        g.fillStyle = `rgb(${128 + v},${58 + v * 0.6 | 0},${42 + v * 0.4 | 0})`; g.fillRect(x + 1, y + 1, 30, 14);
      }
      blotches(g, 256, 256, 30, '30,24,20', 0.15, 0.45, 8, 40); blotches(g, 256, 256, 14, '170,160,140', 0.05, 0.15, 6, 26);
      drips(g, 256, 256, 18, true); speckle(g, 256, 256, 22); return finish(c);
    },
    // white composite cladding panels with seams and rivets, stained (the biolab)
    labPanel() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#c9cbc4'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 128) { const v = r.range(-10, 8) | 0; g.fillStyle = `rgb(${200 + v},${202 + v},${196 + v})`; g.fillRect(x + 2, y + 2, 124, 60); }
      g.fillStyle = 'rgba(40,44,42,.6)'; for (let y = 0; y <= 256; y += 64) g.fillRect(0, y - 1, 256, 2); for (let x = 0; x <= 256; x += 128) g.fillRect(x - 1, 0, 2, 256);
      blotches(g, 256, 256, 26, '90,100,80', 0.06, 0.2, 6, 30); drips(g, 256, 256, 26, true);
      speckle(g, 256, 256, 10); return finish(c);
    },
    // chain-link fence (alpha)
    fence() {
      const [c, g] = C(64, 64);
      g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(150,152,148,1)'; g.lineWidth = 2;
      for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
      const t = finish(c); return t;
    },
    rock() {
      const [c, g] = C(128, 128);
      g.fillStyle = '#5d5b55'; g.fillRect(0, 0, 128, 128);
      blotches(g, 128, 128, 40, '30,30,28', 0.1, 0.35, 4, 25);
      blotches(g, 128, 128, 30, '120,118,105', 0.06, 0.2, 4, 20);
      blotches(g, 128, 128, 14, '60,70,40', 0.1, 0.3, 4, 12);
      cracks(g, 128, 128, 8);
      speckle(g, 128, 128, 30);
      return finish(c);
    },
    bark() {
      const [c, g] = C(64, 128);
      g.fillStyle = '#2e2924'; g.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 26; i++) { const x = r.next() * 64; g.fillStyle = `rgba(${r.next() < 0.5 ? '10,8,6' : '80,72,62'},${r.range(0.2, 0.5)})`; g.fillRect(x, 0, r.range(1, 4), 128); }
      speckle(g, 64, 128, 25);
      return finish(c);
    },
    hull() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#8a8478'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#a3542c'; g.fillRect(0, 150, 256, 70);
      blotches(g, 256, 256, 70, '60,50,40', 0.1, 0.45, 2, 14);
      blotches(g, 256, 256, 20, '120,60,25', 0.15, 0.4, 4, 18);
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2;
      for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); }
      g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
      rivets(g, [6, 58, 70, 122, 134, 186, 198, 250], [6, 122, 134, 250]);
      drips(g, 256, 256, 30, true);
      speckle(g, 256, 256, 18);
      return finish(c);
    },
    hazard() {
      const [c, g] = C(128, 32);
      g.fillStyle = '#d1a326'; g.fillRect(0, 0, 128, 32);
      g.fillStyle = '#151515';
      for (let x = -32; x < 160; x += 24) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 12, 32); g.lineTo(x + 44, 0); g.lineTo(x + 32, 0); g.fill(); }
      blotches(g, 128, 32, 20, '40,30,20', 0.15, 0.45, 2, 8);
      speckle(g, 128, 32, 25);
      return finish(c);
    },
    door() {
      const [c, g] = C(128, 192);
      g.fillStyle = '#3a4a44'; g.fillRect(0, 0, 128, 192);
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeRect(10, 10, 108, 172);
      g.fillStyle = '#0c0f0e'; g.fillRect(40, 30, 48, 40);
      g.fillStyle = 'rgba(150,190,200,.12)'; g.fillRect(42, 32, 20, 36);
      g.strokeStyle = '#222'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, 50); g.lineTo(88, 50); g.stroke();
      g.fillStyle = '#545a55'; g.fillRect(10, 150, 108, 30);
      // no painted handle: every door gets real hardware on the correct edge (a painted one ends up mirrored on the back face)
      blotches(g, 128, 192, 30, '90,60,30', 0.1, 0.45, 2, 12);
      drips(g, 128, 192, 10, true);
      speckle(g, 128, 192, 18);
      return finish(c);
    },
    bunker() {
      const [c, g] = C(256, 256);
      g.fillStyle = '#6a675e'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 32) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y, 256, 2); }
      for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(r.next() * 256, r.next() * 256, 2, 0, TAU); g.fill(); }
      blotches(g, 256, 256, 60, '30,30,25', 0.1, 0.35, 10, 50);
      blotches(g, 256, 256, 20, '60,70,40', 0.1, 0.3, 10, 40);
      drips(g, 256, 256, 40, true);
      cracks(g, 256, 256, 10);
      speckle(g, 256, 256, 26);
      return finish(c);
    },
    locker() {
      const [c, g] = C(64, 192);
      g.fillStyle = '#4b5a63'; g.fillRect(0, 0, 64, 192);
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; g.strokeRect(3, 3, 58, 186);
      for (let i = 0; i < 6; i++) { g.fillStyle = '#1a1f22'; g.fillRect(16, 18 + i * 6, 32, 3); }
      for (let i = 0; i < 6; i++) { g.fillStyle = '#1a1f22'; g.fillRect(16, 150 + i * 6, 32, 3); }
      g.fillStyle = '#999'; g.fillRect(48, 90, 6, 14);
      blotches(g, 64, 192, 14, '90,55,30', 0.1, 0.4, 2, 10);
      speckle(g, 64, 192, 16);
      return finish(c);
    },
    vent() {
      const [c, g] = C(64, 64);
      g.fillStyle = '#4d5254'; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 8; i++) { g.fillStyle = '#0b0b0b'; g.fillRect(6, 6 + i * 7, 52, 4); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(6, 10 + i * 7, 52, 1); }
      g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 61, 61);
      speckle(g, 64, 64, 20);
      return finish(c);
    },
    blood() {
      const [c, g] = C(128, 128);
      g.clearRect(0, 0, 128, 128);
      const main = (x, y, rad, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(70,4,4,${a})`); gr.addColorStop(0.7, `rgba(55,3,3,${a * 0.8})`); gr.addColorStop(1, 'rgba(50,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); };
      main(64, 64, 34, 0.95);
      for (let i = 0; i < 26; i++) { const a = r.next() * TAU, d = r.range(20, 58); main(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r.range(2, 9), 0.9); }
      return finish(c, false, false);
    },
    smear() {
      const [c, g] = C(256, 64);
      g.clearRect(0, 0, 256, 64);
      for (let i = 0; i < 40; i++) {
        const y = 32 + r.range(-10, 10), x = r.range(0, 200), l = r.range(30, 120);
        const gr = g.createLinearGradient(x, 0, x + l, 0); gr.addColorStop(0, 'rgba(60,4,4,0)'); gr.addColorStop(0.3, `rgba(60,4,4,${r.range(0.2, 0.6)})`); gr.addColorStop(1, 'rgba(60,4,4,0)');
        g.fillStyle = gr; g.fillRect(x, y, l, r.range(1, 5));
      }
      return finish(c, false, false);
    },
    // a hanging vine: a wandering stem with leaves along it (transparent between), tiles top to bottom
    vine() {
      const [c, g] = C(64, 256);
      g.clearRect(0, 0, 64, 256);
      const xs = []; for (let y = 0; y <= 256; y += 4) xs.push(32 + Math.sin(y * 0.045) * 7 + Math.sin(y * 0.13 + 1) * 3);
      g.strokeStyle = '#2b3a1c'; g.lineWidth = 3; g.beginPath(); xs.forEach((x, i) => (i ? g.lineTo(x, i * 4) : g.moveTo(x, 0))); g.stroke();
      for (let i = 0; i < 26; i++) {
        const y = r.range(4, 252), x = xs[Math.round(y / 4)], side = r.chance(0.5) ? 1 : -1, len = r.range(9, 17), a = side * r.range(0.35, 1.1);
        const shade = r.range(0, 1), col = `rgb(${46 + shade * 40 | 0},${70 + shade * 50 | 0},${28 + shade * 22 | 0})`;
        g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2 * side * 0.4); g.fillStyle = col;
        g.beginPath(); g.ellipse(side * len * 0.5, 0, len * 0.55, len * 0.26, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(20,30,12,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(side * len, 0); g.stroke();
        g.restore();
      }
      const t = finish(c, false, true); t.wrapS = THREE.ClampToEdgeWrapping; return t;
    },
    // a patch of moss: soft dark-green blotches thinning out to nothing at the edge
    moss() {
      const [c, g] = C(128, 128);
      g.clearRect(0, 0, 128, 128);
      for (let i = 0; i < 70; i++) {
        const a = r.range(0, TAU), d = Math.pow(r.next(), 0.7) * 46, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, rad = r.range(5, 16);
        const gr = g.createRadialGradient(x, y, 0, x, y, rad), s = r.range(0, 1);
        gr.addColorStop(0, `rgba(${38 + s * 30 | 0},${58 + s * 40 | 0},${22 + s * 14 | 0},${r.range(0.5, 0.85)})`); gr.addColorStop(1, 'rgba(30,50,20,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 160; i++) { const a = r.range(0, TAU), d = Math.pow(r.next(), 0.6) * 50; g.fillStyle = `rgba(90,120,50,${r.range(0.15, 0.45)})`; g.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.5, 1.5); }
      return finish(c, false, false);
    },
    // water that has come through the ceiling for years: dark runs from the top, a tide line of mould at the foot
    stain() {
      const [c, g] = C(256, 256);
      g.clearRect(0, 0, 256, 256);
      { const gr = g.createLinearGradient(0, 0, 0, 70); gr.addColorStop(0, 'rgba(30,26,18,.55)'); gr.addColorStop(1, 'rgba(30,26,18,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 70); }
      for (let i = 0; i < 34; i++) {
        const x = r.range(8, 248), len = r.range(40, 230), wd = r.range(2, 12), a = r.range(0.12, 0.42);
        const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgba(36,30,20,${a})`); gr.addColorStop(0.7, `rgba(42,36,24,${a * 0.6})`); gr.addColorStop(1, 'rgba(42,36,24,0)');
        g.fillStyle = gr; g.fillRect(x - wd / 2, 0, wd, len);
      }
      blotches(g, 256, 60, 10, '34,30,22', 0.15, 0.4, 10, 30);
      // mould and wet grime along the floor line
      for (let i = 0; i < 26; i++) {
        const x = r.next() * 256, y = 256 - r.range(0, 40), rad = r.range(8, 30);
        const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(26,34,20,${r.range(0.25, 0.55)})`); gr.addColorStop(1, 'rgba(26,34,20,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // feather the sides so a stain never ends in a hard edge
      const id = g.getImageData(0, 0, 256, 256), d = id.data;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const e = Math.min(x, 255 - x) / 40; if (e < 1) d[(y * 256 + x) * 4 + 3] *= e * e * (3 - 2 * e); }
      g.putImageData(id, 0, 0);
      return finish(c, false, false);
    },
    flesh() {
      const [c, g] = C(128, 128);
      g.fillStyle = '#a49d92'; g.fillRect(0, 0, 128, 128);
      blotches(g, 128, 128, 30, '120,80,80', 0.1, 0.35, 6, 25);
      blotches(g, 128, 128, 20, '60,50,50', 0.1, 0.3, 4, 18);
      g.strokeStyle = 'rgba(70,30,40,.4)'; g.lineWidth = 1;
      for (let i = 0; i < 18; i++) { let x = r.next() * 128, y = r.next() * 128, a = r.next() * TAU; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 10; k++) { a += r.range(-0.5, 0.5); x += Math.cos(a) * 4; y += Math.sin(a) * 4; g.lineTo(x, y); } g.stroke(); }
      speckle(g, 128, 128, 18);
      return finish(c);
    },
    darkflesh() {
      const [c, g] = C(128, 128);
      g.fillStyle = '#3a2a28'; g.fillRect(0, 0, 128, 128);
      blotches(g, 128, 128, 40, '90,40,35', 0.1, 0.4, 4, 20);
      blotches(g, 128, 128, 25, '10,8,8', 0.2, 0.5, 4, 14);
      for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(160,140,120,.25)'; g.fillRect(0, 10 + i * 12, 128, 2); }
      speckle(g, 128, 128, 22);
      return finish(c);
    },
    porcelain() {
      const [c, g] = C(128, 128);
      g.fillStyle = '#d9d4c8'; g.fillRect(0, 0, 128, 128);
      blotches(g, 128, 128, 20, '150,140,120', 0.05, 0.2, 6, 30);
      cracks(g, 128, 128, 10, 'rgba(30,25,20,.7)');
      blotches(g, 128, 128, 6, '80,40,30', 0.1, 0.3, 2, 8);
      speckle(g, 128, 128, 10);
      return finish(c);
    },
    painting() {
      const [c, g] = C(128, 160);
      const gr = g.createRadialGradient(64, 70, 10, 64, 80, 100); gr.addColorStop(0, '#3b2a20'); gr.addColorStop(1, '#0d0907'); g.fillStyle = gr; g.fillRect(0, 0, 128, 160);
      g.fillStyle = '#1a1210'; g.beginPath(); g.ellipse(64, 140, 46, 40, 0, 0, TAU); g.fill();
      const fg = g.createRadialGradient(64, 66, 4, 64, 70, 34); fg.addColorStop(0, '#c9b8a0'); fg.addColorStop(1, '#5a4636'); g.fillStyle = fg;
      g.beginPath(); g.ellipse(64, 68, 22, 30, 0, 0, TAU); g.fill();
      g.fillStyle = '#050303'; g.beginPath(); g.ellipse(55, 62, 5, 7, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(73, 62, 5, 7, 0, 0, TAU); g.fill();
      g.fillRect(58, 84, 12, 3);
      g.strokeStyle = 'rgba(10,6,4,.6)'; for (let i = 0; i < 40; i++) { g.beginPath(); const x = r.next() * 128; g.moveTo(x, 0); g.lineTo(x + r.range(-6, 6), 160); g.stroke(); }
      speckle(g, 128, 160, 20);
      return finish(c, false, false);
    },
    planet() {
      // neutral-toned world texture; tinted per site through the material colour
      const W = 1024, H = 512;
      const [c, g] = C(W, H);
      const nz = new Noise2D(99), nz2 = new Noise2D(7);
      const id = g.createImageData(W, H), d = id.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = x / W * TAU, v = y / H * Math.PI;
        const px = Math.cos(u) * Math.sin(v) * 3, py = Math.cos(v) * 3, pz = Math.sin(u) * Math.sin(v) * 3;
        const n = nz.fbm(px + pz * 0.5 + 11, py * 1.3 + pz * 0.7, 6);
        const ridge = 1 - Math.abs(nz2.fbm(px * 2.2 + 3, py * 2.2 - pz, 4)) * 2;
        const land = sstep(-0.02, 0.06, n);
        let val = lerp(0.18 + n * 0.25, 0.48 + n * 0.5 + ridge * 0.12, land);
        const pole = sstep(0.82, 0.95, Math.abs(py) / 3); val = lerp(val, 0.95, pole * 0.8);
        const i = (y * W + x) * 4;
        const warm = land * 0.08;
        d[i] = clamp(255 * (val + warm), 0, 255); d[i + 1] = clamp(255 * val, 0, 255); d[i + 2] = clamp(255 * (val - warm + (1 - land) * 0.06), 0, 255); d[i + 3] = 255;
      }
      g.putImageData(id, 0, 0);
      return finish(c, true, false);
    },
    // an airless body: grey dust with a fine grain, darker plains, and craters on craters: mostly small, a few big old
    // basins, each a dark bowl with a raised bright rim (a central peak in the big ones) and an ejecta skirt, a few
    // fresh ones throwing bright rays. Its brightness doubles as its height (low floors, high rims), so TEX.normal
    // reads real relief off it. Neutral, tinted per moon through the material colour
    moonmap() {
      const W = 1024, H = 512;
      const [c, g] = C(W, H);
      const nz = new Noise2D(41), rr = new RNG(4141), val = new Float32Array(W * H), P = new Float32Array(W * H * 3);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = x / W * TAU, v = y / H * Math.PI, i = y * W + x;
        const px = Math.cos(u) * Math.sin(v), py = Math.cos(v), pz = Math.sin(u) * Math.sin(v);
        P[i * 3] = px; P[i * 3 + 1] = py; P[i * 3 + 2] = pz;
        val[i] = 0.56 + nz.fbm(px * 4 + 3, py * 4 + pz * 2, 5) * 0.2 + nz.fbm(px * 22, py * 22 + pz * 11, 3) * 0.07
          - sstep(0.05, 0.25, nz.fbm(px * 1.6 - 5, py * 1.6 + pz, 3)) * 0.15;
      }
      for (let n = 0; n < 1800; n++) {
        const r = Math.pow(rr.next(), 4.5) * 0.22 + 0.004, k = 0.6 + rr.next() * 0.6, ray = rr.next() < 0.04, peak = r > 0.04;
        let cx = rr.range(-1, 1), cy = rr.range(-1, 1), cz = rr.range(-1, 1); const l = Math.hypot(cx, cy, cz) || 1; cx /= l; cy /= l; cz /= l;
        // (only the pixels it can reach: its rows, and the span of each row it covers)
        const reach = r * (ray ? 5 : 2.2), cosR = Math.cos(reach), v0 = Math.acos(cy), u0 = Math.atan2(cz, cx);
        const y0 = Math.max(0, Math.floor((v0 - reach) / Math.PI * H)), y1 = Math.min(H - 1, Math.ceil((v0 + reach) / Math.PI * H));
        for (let y = y0; y <= y1; y++) {
          const sv = Math.sin((y + 0.5) / H * Math.PI), du = sv > 0.03 ? reach / sv : Math.PI;
          const xa = du >= Math.PI ? 0 : Math.floor((u0 - du) / TAU * W), xb = du >= Math.PI ? W - 1 : Math.ceil((u0 + du) / TAU * W);
          for (let xx = xa; xx <= xb; xx++) {
            const x = ((xx % W) + W) % W, i = y * W + x, dot = P[i * 3] * cx + P[i * 3 + 1] * cy + P[i * 3 + 2] * cz;
            if (dot < cosR) continue;
            const dd = Math.acos(Math.min(1, dot)) / r;
            if (dd < 0.85) { val[i] -= 0.08 * k * (1 - dd * dd * 0.75); if (peak && dd < 0.2) val[i] += 0.07 * k * (1 - dd / 0.2); }
            else if (dd < 1.2) val[i] += 0.075 * k * (1 - Math.abs(dd - 1.0) / 0.2);
            else if (dd < 2.2) val[i] += 0.022 * k * (1 - (dd - 1.2) / 1.0);
            if (ray && dd > 1 && dd < 5) val[i] += 0.05 * Math.pow(Math.max(0, Math.sin(Math.atan2(P[i * 3 + 1] - cy, P[i * 3] - cx) * 9 + cz * 7)), 8) * (1 - dd / 5);
          }
        }
      }
      const id = g.createImageData(W, H), d = id.data;
      for (let i = 0; i < W * H; i++) { const k = clamp(val[i], 0.05, 1) * 255; d[i * 4] = k; d[i * 4 + 1] = k * 0.98; d[i * 4 + 2] = k * 0.95; d[i * 4 + 3] = 255; }
      g.putImageData(id, 0, 0);
      return finish(c, true, false);
    },
    // a world's weather seen from space, drawn from the sphere's own points in 3D (so nothing smears into streaks round
    // it): the cloud drawn out a little along the latitudes the way the winds stretch it, swirled, with a band of
    // storms along the equator, clear belts either side of it and the storm tracks further out
    clouds() {
      const W = 1024, H = 512;
      const [c, g] = C(W, H);
      const nz = new Noise2D(3);
      const id = g.createImageData(W, H), d = id.data;
      for (let y = 0; y < H; y++) {
        const v = (y + 0.5) / H * Math.PI, py = Math.cos(v), sv = Math.sin(v), ay = Math.abs(py);
        const band = 0.09 * Math.exp(-Math.pow(py / 0.11, 2)) - 0.11 * Math.exp(-Math.pow((ay - 0.42) / 0.13, 2)) + 0.06 * Math.exp(-Math.pow((ay - 0.74) / 0.12, 2));
        for (let x = 0; x < W; x++) {
          const u = x / W * TAU, px = Math.cos(u) * sv, pz = Math.sin(u) * sv;
          const wx = nz.fbm3(px * 1.6 + 11, py * 1.6, pz * 1.6, 2), wz = nz.fbm3(px * 1.6 - 7, py * 1.6 + 5, pz * 1.6, 2);
          const n = nz.fbm3(px * 3.4 + wx * 1.3, py * 5.2 + wz * 0.8, pz * 3.4 + wz * 1.3, 5);
          const a = sstep(0.02, 0.3, n + band - 0.02);
          const i = (y * W + x) * 4;
          d[i] = d[i + 1] = d[i + 2] = 245; d[i + 3] = a * 210;
        }
      }
      g.putImageData(id, 0, 0);
      return finish(c, true, false);
    },
    // a gas giant's cloud tops: belts and zones of warm and pale cloud running round it, their edges churned into waves
    // and curls where the winds shear past each other, fine streaks drawn out along them, ovals of storm spinning in
    // them, and the poles a cooler grey. Worked from the sphere's own points, so nothing smears where it wraps
    giant() {
      const W = 768, H = 384;
      const [c, g] = C(W, H);
      const nz = new Noise2D(77), rr = new RNG(7777), id = g.createImageData(W, H), d = id.data;
      const storms = Array.from({ length: 9 }, (_, i) => ({ lat: rr.range(-0.75, 0.75), lon: rr.range(0, TAU), w: rr.range(0.05, 0.14) * (i === 0 ? 2.2 : 1), h: rr.range(0.025, 0.05) * (i === 0 ? 2 : 1), k: i === 0 ? -1 : rr.chance(0.6) ? 1 : -1 }));
      const belt = [0.5, 0.33, 0.21], zone = [0.97, 0.91, 0.77], pole = [0.52, 0.56, 0.6], red = [0.74, 0.36, 0.22], white = [1, 0.98, 0.94];
      for (let y = 0; y < H; y++) {
        const v = (y + 0.5) / H * Math.PI, py = Math.cos(v), sv = Math.sin(v);
        for (let x = 0; x < W; x++) {
          const u = x / W * TAU, px = Math.cos(u) * sv, pz = Math.sin(u) * sv;
          const w1 = nz.fbm3(px * 3 + 5, py * 3, pz * 3, 3), w2 = nz.fbm3(px * 10, py * 10 + 7, pz * 10, 2);
          let lat = py + w1 * 0.05 + w2 * 0.012, spot = 0, sk = 0;
          for (const s of storms) {
            let dl = u - s.lon; dl -= TAU * Math.round(dl / TAU);
            const dx = dl * sv / s.w, dy = (py - s.lat) / s.h, r2 = dx * dx + dy * dy;
            if (r2 < 6) { const e = Math.exp(-r2); lat += 0.03 * e * Math.sin(Math.atan2(dy, dx) * 2 + r2 * 1.5) * s.h * 20; if (e > spot) { spot = e; sk = s.k; } }
          }
          const t = sstep(0, 1, 0.5 + 0.34 * Math.sin(lat * 14 + 1.3) + 0.2 * Math.sin(lat * 31 + 0.4) + 0.1 * Math.sin(lat * 53 + 2.2) + nz.fbm3(px * 2, py * 60, pz * 2, 2) * 0.2 + w2 * 0.1);
          let r = lerp(belt[0], zone[0], t), gg = lerp(belt[1], zone[1], t), b = lerp(belt[2], zone[2], t);
          const pk = sstep(0.72, 0.94, Math.abs(py) + w1 * 0.04); r = lerp(r, pole[0], pk); gg = lerp(gg, pole[1], pk); b = lerp(b, pole[2], pk);
          if (spot > 0.05) { const S = sk < 0 ? red : white, a = sstep(0.05, 0.6, spot) * 0.8; r = lerp(r, S[0], a); gg = lerp(gg, S[1], a); b = lerp(b, S[2], a); }
          const i = (y * W + x) * 4;
          d[i] = clamp(r * 255, 0, 255); d[i + 1] = clamp(gg * 255, 0, 255); d[i + 2] = clamp(b * 255, 0, 255); d[i + 3] = 255;
        }
      }
      g.putImageData(id, 0, 0);
      return finish(c, true, false);
    },
    rings() {
      // a ring system's profile from its inner edge (left) to its outer (right): alpha how dense it is, colour how bright.
      // A faint, greyish inner ring of fine ringlets; the broad, dense, bright main ring; a dark division; a fainter
      // outer ring with a thin gap near its edge; and past a clear stretch, one thin bright strand
      const [c, g] = C(1024, 4);
      const nz = new Noise2D(21);
      const id = g.createImageData(1024, 4), d = id.data;
      for (let x = 0; x < 1024; x++) {
        const u = (x + 0.5) / 1024, n = (k, s) => nz.noise(u * k, s) * 0.5 + 0.5;
        let a = 0, b = 0;
        if (u < 0.22) { a = (0.1 + 0.16 * n(90, 0.5) + 0.1 * Math.max(0, Math.sin(u * 420 + n(30, 2) * 6)) ** 6) * sstep(0, 0.04, u); b = 115 + 30 * n(40, 4); }
        else if (u < 0.55) { a = 0.72 + 0.26 * n(60, 1.5) - 0.12 * n(260, 6) ** 3; a *= 1 - 0.25 * sstep(0.22, 0.27, u) * (1 - sstep(0.24, 0.3, u)); b = 215 + 35 * n(50, 7) - 25 * sstep(0.5, 0.55, u); }
        else if (u < 0.6) { a = 0.04 + 0.08 * Math.max(0, Math.sin(u * 900)) ** 4; b = 95; }
        else if (u < 0.9) { a = (0.48 + 0.18 * n(45, 3.3) + 0.1 * n(200, 8)) * (u > 0.855 && u < 0.866 ? 0.02 : 1); b = 165 + 30 * n(35, 5); }
        else if (u > 0.95 && u < 0.962) { a = 0.55 * Math.sin((u - 0.95) / 0.012 * Math.PI); b = 235; }
        for (let y = 0; y < 4; y++) { const i = (y * 1024 + x) * 4; d[i] = b; d[i + 1] = b * 0.93; d[i + 2] = b * 0.82; d[i + 3] = clamp(a, 0, 1) * 255; }
      }
      g.putImageData(id, 0, 0);
      return finish(c, false, false);
    },
    cookie() {
      // flashlight projection: hot centre, reflector ring, dim spill, a little lens grime
      const [c, g] = C(256, 256);
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 126);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.16, '#f2eee6'); gr.addColorStop(0.27, '#a29e96'); gr.addColorStop(0.31, '#d6d2ca');
      gr.addColorStop(0.36, '#8a8680'); gr.addColorStop(0.55, '#4e4c48'); gr.addColorStop(0.8, '#1e1d1c'); gr.addColorStop(1, '#000000');
      g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 126, 0, TAU); g.fill();
      blotches(g, 256, 256, 14, '0,0,0', 0.05, 0.16, 8, 30);
      const t = finish(c, false, false); return t;
    },
    corrugated() {
      const [c, g] = C(256, 128);
      for (let x = 0; x < 256; x++) { const v = 150 + Math.sin(x / 256 * TAU * 16) * 45; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 128); }
      blotches(g, 256, 128, 40, '110,60,30', 0.15, 0.5, 4, 20);
      blotches(g, 256, 128, 20, '20,15,10', 0.1, 0.35, 4, 26);
      drips(g, 256, 128, 30, true);
      speckle(g, 256, 128, 16);
      return finish(c);
    },
    dirtGlass() {
      const [c, g] = C(128, 128);
      g.fillStyle = '#0a0d0e'; g.fillRect(0, 0, 128, 128);
      blotches(g, 128, 128, 20, '60,70,70', 0.1, 0.3, 6, 30);
      for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(140,150,150,.25)'; g.beginPath(); const x = Math.random() * 128; g.moveTo(x, 0); g.lineTo(x + 30, 128); g.stroke(); }
      return finish(c);
    },
    stars() {
      const [c, g] = C(32, 32);
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      return finish(c, false, false);
    },
    glow() {
      const [c, g] = C(64, 64);
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const t = finish(c, false, false); t.colorSpace = THREE.NoColorSpace; return t;
    },
    // quilted insulation blanket for the ship's walls: drab canvas sewn into pillowed diamonds, each puffed up in the
    // middle and pulled tight along the stitching, grubby where hands and shoulders rub
    quilt() {
      const [c, g] = CQ(256, 256), rr = new RNG(55);
      g.fillStyle = '#4b4a3c'; g.fillRect(0, 0, 256, 256);
      const n = 4, s = 256 / n;
      for (let i = -1; i <= n; i++) for (let j = -1; j <= n * 2; j++) {
        const cx = i * s + ((j % 2) ? s / 2 : 0), cy = j * s / 2;
        const gr = g.createRadialGradient(cx, cy, 2, cx, cy, s * 0.62);
        gr.addColorStop(0, 'rgba(150,146,118,.55)'); gr.addColorStop(0.6, 'rgba(90,88,70,.15)'); gr.addColorStop(1, 'rgba(20,20,14,.55)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(cx, cy - s / 2); g.lineTo(cx + s / 2, cy); g.lineTo(cx, cy + s / 2); g.lineTo(cx - s / 2, cy); g.closePath(); g.fill();
      }
      // the stitching runs along the diamonds' edges (diagonals offset half a cell from their centres)
      const o = s / 2;
      g.strokeStyle = 'rgba(18,18,12,.85)'; g.lineWidth = 2.2;
      for (let k = -n; k <= n * 2; k++) { g.beginPath(); g.moveTo(k * s + o, 0); g.lineTo(k * s + o + 256, 256); g.stroke(); g.beginPath(); g.moveTo(k * s + o + 256, 0); g.lineTo(k * s + o, 256); g.stroke(); }
      g.strokeStyle = 'rgba(200,196,170,.18)'; g.lineWidth = 0.8; g.setLineDash([3, 3]);
      for (let k = -n; k <= n * 2; k++) { g.beginPath(); g.moveTo(k * s + o + 2, 0); g.lineTo(k * s + o + 258, 256); g.stroke(); }
      g.setLineDash([]);
      for (let i = 0; i < 26; i++) { const x = rr.next() * 256, y = rr.next() * 256, rad = rr.range(8, 40); const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(30,26,18,${rr.range(0.1, 0.3)})`); gr.addColorStop(1, 'rgba(30,26,18,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      speckle(g, 256, 256, 14);
      return finish(c);
    },
    // perforated steel ceiling panels in a seamed grid, a little grimy
    perf() {
      const [c, g] = CQ(256, 256), rr = new RNG(61);
      g.fillStyle = '#6a6e6c'; g.fillRect(0, 0, 256, 256);
      for (let y = 6; y < 256; y += 8) for (let x = 6 + ((y / 8) % 2) * 4; x < 256; x += 8) { g.fillStyle = 'rgba(12,12,12,.75)'; g.beginPath(); g.arc(x, y, 1.7, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(10,10,10,.85)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 253, 253); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke();
      for (const x of [8, 120, 136, 248]) for (const y of [8, 248]) { g.fillStyle = 'rgba(200,200,190,.35)'; g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.fill(); }
      for (let i = 0; i < 16; i++) { const x = rr.next() * 256, y = rr.next() * 256, rad = rr.range(10, 50); const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(60,48,28,${rr.range(0.08, 0.25)})`); gr.addColorStop(1, 'rgba(60,48,28,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      speckle(g, 256, 256, 10);
      return finish(c);
    },
    // an oil stain on the deck (alpha), with drip spatter and a smear where a boot went through it
    oil() {
      const [c, g] = C(256, 256), rr = new RNG(73);
      g.clearRect(0, 0, 256, 256);
      const blob = (x, y, rad, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(14,11,8,${a})`); gr.addColorStop(0.7, `rgba(20,16,10,${a * 0.8})`); gr.addColorStop(1, 'rgba(20,16,10,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); };
      blob(128, 128, 70, 0.75);
      for (let i = 0; i < 24; i++) { const a = rr.next() * TAU, d = rr.range(30, 110); blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rr.range(4, 22), rr.range(0.4, 0.8)); }
      g.strokeStyle = 'rgba(16,12,8,.45)'; g.lineWidth = 18; g.beginPath(); g.moveTo(150, 140); g.quadraticCurveTo(200, 170, 240, 160); g.stroke();
      return finish(c, false, false);
    },
    // a tool pegboard: perforated hardboard with painted outlines where each tool hangs
    pegboard() {
      const [c, g] = CQ(256, 128);
      g.fillStyle = '#8a7350'; g.fillRect(0, 0, 256, 128);
      for (let y = 6; y < 128; y += 10) for (let x = 6; x < 256; x += 10) { g.fillStyle = 'rgba(30,22,12,.8)'; g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(240,235,220,.75)'; g.lineWidth = 2.5;
      g.strokeRect(20, 20, 14, 80); g.strokeRect(14, 14, 26, 18);
      g.beginPath(); g.moveTo(70, 18); g.lineTo(70, 104); g.moveTo(62, 18); g.lineTo(78, 18); g.lineTo(78, 30); g.lineTo(62, 30); g.closePath(); g.stroke();
      g.beginPath(); g.ellipse(120, 30, 14, 10, 0, 0, TAU); g.moveTo(120, 40); g.lineTo(120, 106); g.stroke();
      g.beginPath(); g.arc(178, 60, 34, -2.6, -0.5); g.stroke();
      g.strokeRect(220, 20, 10, 70);
      blotches(g, 256, 128, 14, '40,30,18', 0.08, 0.25, 6, 30);
      speckle(g, 256, 128, 12);
      return finish(c);
    },
    // a soft, lumpy puff (white; smoke, a spreading pool, a scorch mark are all this tinted)
    puff() {
      const [c, g] = C(128, 128), r = new RNG(5);
      for (let i = 0; i < 28; i++) {
        const a = r.range(0, TAU), d = r.range(0, 28), x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, rad = r.range(14, 34);
        const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }
      const t = finish(c, false, false); t.colorSpace = THREE.NoColorSpace; return t;
    },
    // the dropship's skin: one 4 x 4 m tile of riveted plates (rows of 1 m, staggered joints). Rigid, even plates:
    // only a whisper of tone between them, grime gathered at the seams and below the rivet rows, a few hatches
    // and stencils. The relief (seams, rivets, hatch grooves) is in hullSkinN.
    hullSkin() {
      const [c, g] = C(1024, 1024), rr = new RNG(77);
      g.scale(2, 2);
      g.fillStyle = '#8f897d'; g.fillRect(0, 0, 512, 512);
      hullPlates((x, y, w, h, row, k) => {
        const v = rr.range(-5, 5) | 0;
        g.fillStyle = `rgb(${142 + v},${136 + v},${124 + v})`; g.fillRect(x, y, w, h);
        // each plate is a touch darker toward its lower edge where grime collects
        const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(255,250,240,.05)'); gr.addColorStop(0.7, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,34,26,.16)');
        g.fillStyle = gr; g.fillRect(x, y, w, h);
      });
      // faint streaks below the seams, never blotches: the plate reads as one flat sheet
      for (let i = 0; i < 46; i++) { const x = rr.next() * 512, y = (rr.int(0, 3) * 128) + 4, l = rr.range(18, 70); const gr = g.createLinearGradient(x, y, x, y + l); gr.addColorStop(0, 'rgba(46,40,32,.22)'); gr.addColorStop(1, 'rgba(46,40,32,0)'); g.fillStyle = gr; g.fillRect(x, y, rr.range(1, 2.5), l); }
      // seams + rivet rows
      g.fillStyle = 'rgba(28,25,20,.8)';
      hullSeams((x, y, w, h) => g.fillRect(x, y, w, h));
      hullRivets((x, y) => { g.fillStyle = 'rgba(40,36,30,.55)'; g.fillRect(x - 1.5, y - 1.5, 3, 3); g.fillStyle = 'rgba(215,210,198,.35)'; g.fillRect(x - 1.5, y - 2, 2, 1); });
      // access hatches with corner screws
      for (const [x, y, w, h] of HULL_HATCHES) {
        g.strokeStyle = 'rgba(24,21,17,.7)'; g.lineWidth = 1.5; g.strokeRect(x, y, w, h);
        for (const [sx, sy] of [[x + 5, y + 5], [x + w - 7, y + 5], [x + 5, y + h - 7], [x + w - 7, y + h - 7]]) { g.fillStyle = 'rgba(25,22,18,.8)'; g.fillRect(sx, sy, 2.5, 2.5); }
      }
      g.fillStyle = 'rgba(30,26,20,.55)'; g.font = 'bold 12px monospace'; g.fillText('NO STEP', 152, 222); g.fillText('MS-7', 420, 282);
      g.fillStyle = 'rgba(160,40,20,.5)'; g.fillRect(150, 227, 56, 2.5);
      { const gr = g.createRadialGradient(440, 120, 4, 440, 120, 60); gr.addColorStop(0, 'rgba(24,20,15,.22)'); gr.addColorStop(1, 'rgba(24,20,15,0)'); g.fillStyle = gr; g.fillRect(370, 50, 140, 140); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      speckle(g, 1024, 1024, 6);
      return finish(c);
    },
    // relief for the hull skin: recessed seams, domed rivets, grooved hatch outlines, a slight crown on every plate
    hullSkinN() {
      const S = 1024, k = S / 512, [c, g] = C(S, S);
      g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, S, S);
      g.scale(k, k);
      // plates crown very slightly toward their middles (stiff sheet pulled over ribs)
      hullPlates((x, y, w, h) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgb(118,118,118)'); gr.addColorStop(0.5, 'rgb(136,136,136)'); gr.addColorStop(1, 'rgb(118,118,118)'); g.fillStyle = gr; g.fillRect(x, y, w, h); });
      g.fillStyle = 'rgb(40,40,40)'; hullSeams((x, y, w, h) => g.fillRect(x, y, w, h));
      for (const [x, y, w, h] of HULL_HATCHES) { g.strokeStyle = 'rgb(70,70,70)'; g.lineWidth = 1.6; g.strokeRect(x, y, w, h); }
      hullRivets((x, y) => { const gr = g.createRadialGradient(x, y, 0, x, y, 2.6); gr.addColorStop(0, 'rgb(230,230,230)'); gr.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = gr; g.fillRect(x - 3, y - 3, 6, 6); });
      g.setTransform(1, 0, 0, 1, 0, 0);
      return normalFrom(c, 2.2);
    },
    // a solid stellar disc with a short soft limb (the wide glare is added in post)
    sunDisc() {
      const [c, g] = C(64, 64);
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,.3)');
      gr.addColorStop(0.8, 'rgba(255,255,255,.04)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const t = finish(c, false, false); t.colorSpace = THREE.NoColorSpace; return t;
    },
  };

  // What years of use leave on the flat-coloured things (see MATS.wear): one tiling sheet per kind of surface, three
  // channels. R: how much lighter or darker it's gone (128: as it was made); G: bare metal showing through (chips,
  // scratches); B: its relief (128: flush, lower: sunk). Everything drawn wraps round the edges so the sheet tiles.
  //   paint: grime, chipped edges round little islands of bare metal, scratches, a fine orange-peel grain
  //   metal: mottled, brushed one way, scratched, pitted, grimy
  //   vinyl: a pebbled grain, creases, patches rubbed paler, scuffs
  //   rubber: a fine grain and the odd scuff
  function wearSheet(kind) {
    const N = 256, rr = new RNG({ paint: 11, metal: 23, vinyl: 37, rubber: 41 }[kind] || 5);
    const layer = (v) => { const [c, g] = C(N, N); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, N, N); return g; };
    const T = layer(128), B = layer(0), Hh = layer(128);
    const around = (x, y, r, fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) if (x + ox > -r && x + ox < N + r && y + oy > -r && y + oy < N + r) fn(x + ox, y + oy); };
    const soft = (g, x, y, rad, v, a) => around(x, y, rad, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, rad); gr.addColorStop(0, `rgba(${v},${v},${v},${a})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(px - rad, py - rad, rad * 2, rad * 2); });
    // (a ragged little blob, the same shape in every layer it's drawn into)
    const shape = (rad) => { const k = 9, rot = rr.range(0, TAU); return Array.from({ length: k }, (_, i) => [rot + (i / k) * TAU, rad * rr.range(0.45, 1.15)]); };
    const blob = (g, x, y, sh, grow, v, a) => around(x, y, 40, (px, py) => { g.fillStyle = `rgba(${v},${v},${v},${a})`; g.beginPath(); sh.forEach(([t, q], i) => g[i ? 'lineTo' : 'moveTo'](px + Math.cos(t) * q * grow, py + Math.sin(t) * q * grow)); g.closePath(); g.fill(); });
    const line = (g, x, y, a, len, w, v, al) => around(x, y, len + 2, (px, py) => { g.strokeStyle = `rgba(${v},${v},${v},${al})`; g.lineWidth = w; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); g.stroke(); });
    const P = () => [rr.next() * N, rr.next() * N];
    if (kind === 'paint') {
      for (let i = 0; i < 50; i++) { const [x, y] = P(); soft(T, x, y, rr.range(18, 70), rr.chance(0.5) ? 150 : 104, rr.range(0.15, 0.35)); }
      for (let i = 0; i < 26; i++) { const [x, y] = P(); soft(T, x, y, rr.range(10, 46), 66, rr.range(0.2, 0.42)); }
      for (let i = 0; i < 80; i++) { const [x, y] = P(), a = rr.range(0, TAU), l = rr.range(4, 34); line(T, x, y, a, l, 1, 158, 0.45); line(B, x, y, a, l, 1, 255, 0.4); line(Hh, x, y, a, l, 1, 96, 0.6); }
      for (let i = 0; i < 46; i++) {
        const [x, y] = P(), sh = shape(rr.range(1.4, 5.5));
        blob(T, x, y, sh, 1.6, 156, 0.5); blob(Hh, x, y, sh, 1.6, 146, 0.7);
        blob(T, x, y, sh, 1, 70, 0.9); blob(B, x, y, sh, 1, 255, 0.85); blob(Hh, x, y, sh, 1, 36, 1);
      }
    } else if (kind === 'metal') {
      for (let i = 0; i < 46; i++) { const [x, y] = P(); soft(T, x, y, rr.range(16, 60), rr.chance(0.5) ? 156 : 100, rr.range(0.2, 0.4)); }
      for (let i = 0; i < 420; i++) { const [x, y] = P(); line(T, x, y, rr.range(-0.04, 0.04), rr.range(16, 110), 1, rr.chance(0.5) ? 150 : 108, rr.range(0.12, 0.3)); }
      for (let i = 0; i < 20; i++) { const [x, y] = P(); soft(T, x, y, rr.range(10, 40), 60, rr.range(0.2, 0.45)); }
      for (let i = 0; i < 60; i++) { const [x, y] = P(), a = rr.range(0, TAU), l = rr.range(3, 26); line(B, x, y, a, l, 1, 255, rr.range(0.25, 0.6)); line(Hh, x, y, a, l, 1, 104, 0.5); }
      for (let i = 0; i < 90; i++) { const [x, y] = P(), s = rr.range(0.8, 2.2); around(x, y, 3, (px, py) => { T.fillStyle = 'rgba(70,70,70,.6)'; T.fillRect(px, py, s, s); Hh.fillStyle = 'rgba(80,80,80,.8)'; Hh.fillRect(px, py, s, s); }); }
    } else if (kind === 'vinyl') {
      for (let i = 0; i < 12; i++) { const [x, y] = P(); soft(T, x, y, rr.range(20, 60), 158, rr.range(0.2, 0.4)); }
      for (let i = 0; i < 18; i++) { const [x, y] = P(); soft(T, x, y, rr.range(10, 36), 84, rr.range(0.15, 0.35)); }
      for (let i = 0; i < 34; i++) {
        let [x, y] = P(), a = rr.range(0, TAU); const n = rr.int(3, 7);
        for (let k = 0; k < n; k++) { const l = rr.range(5, 14); line(T, x, y, a, l, 1.5, 92, 0.45); line(Hh, x, y, a, l, 2, 70, 0.7); x += Math.cos(a) * l; y += Math.sin(a) * l; a += rr.range(-0.6, 0.6); }
      }
      for (let i = 0; i < 16; i++) { const [x, y] = P(); line(B, x, y, rr.range(0, TAU), rr.range(3, 10), 2, 255, 0.3); }
    } else {
      for (let i = 0; i < 14; i++) { const [x, y] = P(); soft(T, x, y, rr.range(8, 30), 156, rr.range(0.15, 0.35)); }
    }
    // the fine grain under it all, a pixel at a time: orange peel, brushed steel, the pebbling in vinyl, rubber
    const grain = { paint: [6, 10], metal: [5, 6], vinyl: [7, 26], rubber: [6, 14] }[kind] || [5, 8];
    const [c, g] = C(N, N), out = g.createImageData(N, N), o = out.data;
    const t = T.getImageData(0, 0, N, N).data, b = B.getImageData(0, 0, N, N).data, h = Hh.getImageData(0, 0, N, N).data;
    for (let i = 0; i < o.length; i += 4) {
      const n = rr.next() - 0.5;
      o[i] = clamp(t[i] + n * grain[0] * 2, 0, 255); o[i + 1] = b[i]; o[i + 2] = clamp(h[i] + n * grain[1] * 2, 0, 255); o[i + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    const tx = finish(c); tx.colorSpace = THREE.NoColorSpace; return tx;
  }
  const wearCache = {};

  function sign(text, opts = {}) {
    const w = opts.w || 256, h = opts.h || 64;
    const [c, g] = C(w, h);
    g.fillStyle = opts.bg || '#1b1b18'; g.fillRect(0, 0, w, h);
    if (opts.border !== false) { g.strokeStyle = opts.fg || '#c9c3b0'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8); }
    g.fillStyle = opts.fg || '#c9c3b0';
    g.font = `${opts.bold ? 'bold ' : ''}${opts.size || 26}px "Share Tech Mono", monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = String(text).split('\n');
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (opts.size || 26) * 1.1));
    if (opts.dirty !== false) { blotches(g, w, h, 12, '30,25,20', 0.1, 0.4, 4, 20); speckle(g, w, h, 18); }
    return finish(c, false, false);
  }

  return {
    get(name) { return cache[name] || (cache[name] = build[name]()); },
    // relief for a surface, read off its own tones (dark = sunk: grout, seams, cracks, pits, the gaps in a grating),
    // softened a touch first so it's the shapes that stand out and not the grain
    normal(name, strength = 2) {
      const k = name + '#N' + strength;
      if (cache[k]) return cache[k];
      const base = this.get(name), src = base.image, [c, g] = C(src.width, src.height);
      g.filter = 'blur(1px)'; g.drawImage(src, 0, 0); g.filter = 'none';
      const t = normalFrom(c, strength); t.wrapS = base.wrapS; t.wrapT = base.wrapT;
      return (cache[k] = t);
    },
    sign,
    canvas: C,
    wear(kind) { return wearCache[kind] || (wearCache[kind] = wearSheet(kind)); },
  };
})();

// ---------------- shared materials ----------------
const MATS = (() => {
  const cache = {};
  const S = (o) => new THREE.MeshStandardMaterial(o);
  // Wear on a flat-coloured material (TEX.wear): looked up three ways round in the object's own space, so it's the same
  // size on a bolt as on a bulkhead, never stretched along a long box, and rides along with the ship in flight instead
  // of sliding over it. o.kind: paint | metal | vinyl | rubber; o.k: [how far the tone wanders, how much bare metal
  // shows, how deep the relief is (m), how far it rubs paler]; o.bare: the colour under the paint; o.s: sheets per metre.
  // It darkens and lightens what's there, so it stays the colour it was painted; relief comes from the sheet's own
  // heights, read off as the pixels go by (no normal map needed).
  function wear(mat, o) {
    const k = o.k || [0.4, 0.3, 0.002, 0], U = { tWear: { value: TEX.wear(o.kind) }, uWear: { value: new THREE.Vector4(k[0], k[1], k[2], k[3] || 0) }, uWearS: { value: o.s || 1.1 }, uBare: { value: new THREE.Color(o.bare ?? 0x6a6e70) }, uEdge: { value: o.edge || 0 } };
    mat.userData.wear = { kind: o.kind, k, s: o.s, bare: o.bare, tint: o.tint, edge: o.edge };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWearP; varying vec3 vWearN; varying vec2 vWearUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWearP = position; vWearN = normal; vWearUv = uv;');
      sh.fragmentShader = 'uniform sampler2D tWear; uniform vec4 uWear; uniform float uWearS, uEdge; uniform vec3 uBare; varying vec3 vWearP; varying vec3 vWearN; varying vec2 vWearUv;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 wq = vWearP * uWearS, wb = pow(abs(normalize(vWearN)), vec3(4.0)); wb /= wb.x + wb.y + wb.z;
          vec3 ws = texture2D(tWear, wq.zy).rgb * wb.x + texture2D(tWear, wq.xz).rgb * wb.y + texture2D(tWear, wq.xy).rgb * wb.z;
          // (paint rubbed off along the edges and corners, raggedly: how far this is from its face's edge, in metres,
          // from how fast the face's own 0..1 coordinates run across the screen against how fast the surface does)
          float wearE = 0.0;
          if (uEdge > 0.0) {
            vec2 e2 = min(vWearUv, 1.0 - vWearUv), ux = dFdx(vWearUv), uy = dFdy(vWearUv);
            float dp = max(length(dFdx(vWearP)), length(dFdy(vWearP)));
            float ed = min(e2.x * dp / max(max(abs(ux.x), abs(uy.x)), 1e-6), e2.y * dp / max(max(abs(ux.y), abs(uy.y)), 1e-6));
            float rag = texture2D(tWear, wq.zy * 2.7 + wq.xz * 1.3).r;
            wearE = (1.0 - smoothstep(uEdge * 0.3, uEdge, ed)) * smoothstep(0.34, 0.52, rag + 0.35 * (1.0 - ed / uEdge));
          }
          diffuseColor.rgb *= mix(1.0, ws.r * 2.0, uWear.x) * (1.0 + uWear.w * max(ws.r - 0.5, 0.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, uBare, max(ws.g * uWear.y, wearE * 0.85));
          ws.g = max(ws.g, wearE);
          float wearH = ws.b - 0.3 * wearE;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor - ws.g * uWear.y * 0.25 + (0.5 - ws.r) * 0.3 * uWear.x, 0.05, 1.0);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec3 sp = -vViewPosition, dx = dFdx(sp), dy = dFdy(sp); float hx = dFdx(wearH) * uWear.z, hy = dFdy(wearH) * uWear.z;
            vec3 r1 = cross(dy, normal), r2 = cross(normal, dx); float dt = dot(dx, r1);
            normal = normalize(abs(dt) * normal - sign(dt) * (hx * r1 + hy * r2)); }`);
    };
    mat.customProgramCacheKey = () => 'wear';
    return mat;
  }
  // (copies of a worn material (MATS.rep, MATS.aged) wear the same way)
  const rewear = (m, base) => (base.userData.wear ? wear(m, base.userData.wear) : m);
  // a surface with relief: its colour map plus a normal map read off it (k: how deep the relief goes)
  const N = (tex, k, o) => S(Object.assign({ map: TEX.get(tex), normalMap: TEX.normal(tex, k), normalScale: new THREE.Vector2(1, 1) }, o));
  const defs = {
    wall: () => N('wallConcrete', 1.8, { roughness: 0.93, metalness: 0 }),
    wallTile: () => N('wallTile', 2, { roughness: 0.55, metalness: 0 }),
    floor: () => N('floorConcrete', 1.8, { roughness: 0.85 }),
    floorTile: () => N('floorTile', 0.8, { roughness: 0.5 }),
    ceiling: () => N('ceiling', 1.5, { roughness: 0.95 }),
    metal: () => N('metalPanel', 2.2, { roughness: 0.6, metalness: 0.45 }),
    grate: () => N('grate', 3, { roughness: 0.55, metalness: 0.5 }),
    rust: () => N('rust', 2.2, { roughness: 0.9, metalness: 0.3 }),
    // painted steel, gone grubby, chipped down to rust (its colour: the drab green-grey it was painted, which anything
    // repainted another colour (MATS.rep) is tinted by, the way it always was)
    painted: () => wear(S({ color: 0x5f6357, roughness: 0.72, metalness: 0.3 }), { tint: true, kind: 'paint', k: [0.55, 0.5, 0.0025, 0.2], bare: 0x4a2c1a, s: 1, edge: 0.02 }),
    wood: () => N('wood', 1.6, { roughness: 0.9 }),
    crate: () => N('crate', 1.6, { roughness: 0.9 }),
    terrain: () => S({ map: TEX.get('terrain'), roughness: 1, vertexColors: true }),
    rock: () => S({ map: TEX.get('rock'), bumpMap: TEX.get('rock'), bumpScale: 2, roughness: 0.95, flatShading: true }),
    bark: () => S({ map: TEX.get('bark'), roughness: 1 }),
    hull: () => S({ map: TEX.get('hull'), bumpMap: TEX.get('hull'), bumpScale: 1, roughness: 0.7, metalness: 0.35 }),
    hazard: () => S({ map: TEX.get('hazard'), roughness: 0.7 }),
    door: () => N('door', 1.6, { roughness: 0.65, metalness: 0.4 }),
    bunker: () => N('bunker', 2, { roughness: 0.95 }),
    locker: () => N('locker', 1.8, { roughness: 0.6, metalness: 0.4 }),
    vent: () => N('vent', 3, { roughness: 0.7, metalness: 0.4 }),
    dark: () => wear(S({ color: 0x141414, roughness: 0.8 }), { kind: 'metal', k: [0.45, 0.25, 0.0012], bare: 0x3a3c3e }),
    darkmetal: () => wear(S({ color: 0x23262a, roughness: 0.5, metalness: 0.6 }), { kind: 'metal', k: [0.5, 0.3, 0.0015], bare: 0x5c6064, edge: 0.01 }),
    rubber: () => wear(S({ color: 0x0e0e0e, roughness: 0.95 }), { kind: 'rubber', k: [0.6, 0, 0.0015, 0.6] }),
    cloth: () => wear(S({ color: 0x8f8a7c, roughness: 1 }), { kind: 'vinyl', k: [0.35, 0, 0.0012, 0.2] }),
    sheet: () => S({ color: 0xb9b5a8, roughness: 1 }),
    darkflesh: () => S({ map: TEX.get('darkflesh'), roughness: 0.35 }),
    steelBolt: () => wear(S({ color: 0x9aa0a4, metalness: 0.85, roughness: 0.35 }), { kind: 'metal', k: [0.35, 0.15, 0.0008], bare: 0xd0d4d6, s: 2 }),
    hardware: () => wear(S({ color: 0xa3a59e, metalness: 0.85, roughness: 0.3 }), { kind: 'metal', k: [0.35, 0.15, 0.0008], bare: 0xd0d4d6, s: 2 }),
    brick: () => N('brick', 2.2, { roughness: 0.92 }),
    labPanel: () => N('labPanel', 1.5, { roughness: 0.55, metalness: 0.12 }),
    carGlass: () => S({ color: 0x0a0d0f, roughness: 0.12, metalness: 0.6 }),
    // (worn vinyl upholstery, a dark oxblood brown, rubbed paler where people sit)
    seat: () => wear(S({ color: 0x3a2c26, roughness: 0.5 }), { kind: 'vinyl', k: [0.6, 0.05, 0.0018, 0.7], bare: 0x2a2420, s: 1.6 }),
    corrugated: () => S({ map: TEX.get('corrugated'), roughness: 0.75, metalness: 0.3 }),
    glass: () => new THREE.MeshStandardMaterial({ color: 0x9fb6bd, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.18, depthWrite: false }),
    liquid: () => new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.2, transparent: true, opacity: 0.55, emissive: 0x0c1a06, depthWrite: false }),
    blood: () => new THREE.MeshStandardMaterial({ map: TEX.get('blood'), transparent: true, roughness: 0.25, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    smear: () => new THREE.MeshStandardMaterial({ map: TEX.get('smear'), transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    stain: () => new THREE.MeshStandardMaterial({ map: TEX.get('stain'), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    vine: () => new THREE.MeshStandardMaterial({ map: TEX.get('vine'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }),
    moss: () => new THREE.MeshStandardMaterial({ map: TEX.get('moss'), transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    puddle: () => new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    paper: () => S({ color: 0xb8b2a0, roughness: 1, side: THREE.DoubleSide }),
    beige: () => wear(S({ color: 0x5e594c, roughness: 0.55 }), { kind: 'paint', k: [0.5, 0.35, 0.002, 0.2], bare: 0x4a2c1a, edge: 0.018 }),
    quilt: () => N('quilt', 3.2, { roughness: 0.95 }),
    perf: () => N('perf', 2.5, { roughness: 0.6, metalness: 0.4 }),
    oil: () => new THREE.MeshStandardMaterial({ map: TEX.get('oil'), transparent: true, roughness: 0.15, metalness: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    pegboard: () => N('pegboard', 2, { roughness: 0.9 }),
    cable: () => wear(S({ color: 0x111111, roughness: 0.7 }), { kind: 'rubber', k: [0.5, 0, 0.001, 0.4], s: 2 }),
    lampHousing: () => wear(S({ color: 0x2b2d2c, roughness: 0.6, metalness: 0.5 }), { kind: 'metal', k: [0.45, 0.25, 0.0012], bare: 0x5c6064 }),
    screenGreen: () => new THREE.MeshBasicMaterial({ color: 0x2bff6a }),
    ledRed: () => new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    ledGreen: () => new THREE.MeshBasicMaterial({ color: 0x33ff55 }),
    ledAmber: () => new THREE.MeshBasicMaterial({ color: 0xffa020 }),
  };
  const repCache = {}, agedCache = {};
  // a surface on a lower level: darker and browner with grime, duller, its paint and metal gone flat
  const AGE_TINT = [null, [0.72, 0.66, 0.56], [0.55, 0.52, 0.42], [0.45, 0.42, 0.34]];
  return {
    get(name) { if (!cache[name]) { if (!defs[name]) throw new Error('No material ' + name); cache[name] = defs[name](); } return cache[name]; },
    wear,
    // every shared material (and its textures) made up front, while the game loads, not mid-landing
    warmAll() { for (const k in defs) this.get(k); },
    aged(name, lv) {
      const k = name + '@' + lv;
      if (agedCache[k]) return agedCache[k];
      const m = this.get(name).clone(), t = AGE_TINT[Math.min(3, lv)] || AGE_TINT[3];
      m.color = m.color.clone().multiply(new THREE.Color(t[0], t[1], t[2]));
      if (m.roughness != null) m.roughness = Math.min(1, m.roughness + 0.12 * lv);
      if (m.metalness) m.metalness *= 0.6;
      return (agedCache[k] = rewear(m, this.get(name)));
    },
    // same material, with its textures tiled rx * ry times (for big surfaces)
    rep(name, rx, ry, color) {
      const k = name + ':' + rx + 'x' + ry + ':' + (color || '');
      if (repCache[k]) return repCache[k];
      const base = this.get(name), m = base.clone();
      for (const slot of ['map', 'bumpMap', 'normalMap']) if (base[slot]) { m[slot] = base[slot].clone(); m[slot].repeat.set(rx, ry); m[slot].wrapS = m[slot].wrapT = THREE.RepeatWrapping; m[slot].needsUpdate = true; }
      // (a worn painted surface keeps its old drab under a new colour, as the old paint texture used to tint it)
      if (color != null) { m.color = new THREE.Color(color); if (base.userData.wear && base.userData.wear.tint) m.color.multiply(base.color).multiplyScalar(2.0); }
      return (repCache[k] = rewear(m, base));
    },
  };
})();
