'use strict';
// Crew body-cams on the ship's main screen. Every crewmate's helmet camera gets a slice of it: the whole screen for
// one, halves for two, thirds for three, then a grid. Each slice is that crewmate's own view, run through a cheap
// low-light camera (gain, a green cast, scanlines, grain), tagged with their name and where they are. Dead crew show
// a lost signal. The quota sits along the top.
//
// It renders only while you're in the ship near enough to see it, a few times a second, at low resolution.
//
// The arrow buttons under it page through CAMS, a MAP that follows each crewmate in turn, and the HULL CAMS (the ship's
// own cameras, round the hull and in the bay). The map shows the walls, doors and blast
// doors (with their codes) of the level they're on, seen from above, every crewmate on it, and whatever a RADAR sweep
// has picked up.
const CrewCam = (() => {
  // (W, H, BAR: the main screen's; a Survey Pad's map swaps its own in while it's drawn, see pad)
  let W = 768, H = 336, BAR = 26;
  const FPS = 8, NEAR = 15;
  const _cl = new THREE.Vector3(), _cs = new THREE.Vector3();
  let rt = null, canvas = null, g = null, otex = null, mat = null, cam = null, self = null, timer = 0, last = '';
  let mcv = null, mg = null, mtex = null, view = 0, sweep = null, blips = [];
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _t = new THREE.Vector3();

  // slices for n feeds, in render-target pixels (y up from the bottom), under the status bar
  function layout(n) {
    const h0 = H - BAR, cols = n <= 3 ? n : Math.ceil(n / 2), rows = n <= 3 ? 1 : 2, out = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols, rowN = r === rows - 1 ? n - cols * (rows - 1) : cols;
      const w = Math.floor(W / rowN), h = Math.floor(h0 / rows);
      out.push({ x: c * w, y: h0 - (r + 1) * h, w: c === rowN - 1 ? W - c * w : w, h });
    }
    return out;
  }
  function init(ship) {
    rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
    [canvas, g] = TEX.canvas(W, H);
    otex = new THREE.CanvasTexture(canvas); otex.colorSpace = THREE.SRGBColorSpace;
    [mcv, mg] = TEX.canvas(W, H);
    mtex = new THREE.CanvasTexture(mcv); mtex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.ShaderMaterial({
      uniforms: { tFeed: { value: rt.texture }, tOver: { value: otex }, tMap: { value: mtex }, uMap: { value: 0 }, uT: { value: 0 }, uLive: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tFeed, tOver, tMap; uniform float uT, uLive, uMap; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tFeed, vUv).rgb * uLive;
          c = c * 2.6; c = c / (1.0 + c);                                   // low-light gain, rolled off
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(l), c, 0.5) * vec3(0.82, 1.0, 0.86);                  // washed out, a little green
          c = mix(c, texture2D(tMap, vUv).rgb, uMap);                        // or the map, on the same old tube
          c *= 0.86 + 0.14 * sin(vUv.y * 680.0 + uT * 3.0);                  // scanlines
          c += (h(floor(vUv * vec2(384.0, 168.0)) + fract(uT * 7.3)) - 0.5) * 0.07 * (1.0 - 0.8 * uMap);
          vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 0.9;                     // the tube darkens at its edges
          vec4 o = texture2D(tOver, vUv); c = mix(c, o.rgb, o.a);
          gl_FragColor = vec4(c * 1.2, 1.0); }`,
      toneMapped: false, fog: false,
    });
    ship.monMesh.material = mat;
    cam = new THREE.PerspectiveCamera(72, 1, 0.08, 320);
    self = null;
  }
  // a stand-in for yourself, seen only in the other crew's feeds
  function selfAvatar() {
    const me = G.me(); if (!me) return null;
    if (!self || self.color !== me.color) { if (self) self.av.dispose(); self = { av: new Avatar('', me.color), color: me.color }; self.av.tag.visible = false; R.scene.add(self.av.root); self.av.root.visible = false; }
    return self.av;
  }
  // where a crewmate's helmet camera is and which way it looks (drawn positions: carried with the ship in flight)
  function eyeOf(p, isMe) {
    if (isMe) { cam.position.copy(R.camera.position); cam.quaternion.copy(R.camera.quaternion); return; }
    const seat = p.seat != null && G.ship.seats[p.seat];
    const pos = seat ? seat.eye.clone() : new THREE.Vector3(p.rpos.x, p.rpos.y + (p.crouch ? 1.05 : 1.62), p.rpos.z);
    _q.setFromEuler(_e.set(p.rpitch || 0, p.ryaw || 0, 0, 'YXZ'));
    if (G.shipMoved && G.playerAboard(p)) { pos.applyMatrix4(G.shipM); _q.premultiply(G.shipQ); }
    cam.position.copy(pos); cam.quaternion.copy(_q);
  }
  function where(p) {
    if (!p.alive) return 'NO LIFE SIGNS';
    if (p.zone === 'in') return G.fac && G.fac.levels > 1 ? 'FACILITY · ' + G.fac.levelName(p.pos.y) : 'FACILITY';
    if (G.inShip(p)) return 'SHIP';
    return 'OUTSIDE · ' + Math.round(Math.hypot(p.pos.x, p.pos.z)) + 'm';
  }
  // the status bar along the top: quota, days, credits (and, on the map, whose it is)
  function drawBar(label) {
    const run = G.run;
    g.fillStyle = 'rgba(8,10,8,0.92)'; g.fillRect(0, 0, W, BAR);
    g.font = '20px "VT323", monospace'; g.textBaseline = 'middle'; g.fillStyle = '#f2a65a';
    if (!run) return;
    g.fillText('QUOTA $' + run.sold + ' / $' + run.quota, 10, BAR / 2 + 1);
    g.textAlign = 'center'; g.fillText(label, W / 2, BAR / 2 + 1);
    g.textAlign = 'right'; g.fillText((run.daysLeft > 0 ? run.daysLeft + (run.daysLeft === 1 ? ' DAY' : ' DAYS') : 'DEADLINE') + '  ·  $' + run.credits, W - 10, BAR / 2 + 1); g.textAlign = 'left';
  }
  // ---------- the map ----------
  const posOf = (p) => (p.id === G.localId ? { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw } : { x: p.rpos.x, y: p.rpos.y, z: p.rpos.z, yaw: p.ryaw || 0 });
  const arrow = (x, y, yaw, size, col, ring) => {
    const fx = -Math.sin(yaw), fy = -Math.cos(yaw), rx = -fy, ry = fx;
    mg.fillStyle = col; mg.strokeStyle = 'rgba(0,0,0,.85)'; mg.lineWidth = 2;
    mg.beginPath(); mg.moveTo(x + fx * size, y + fy * size); mg.lineTo(x - fx * size * 0.6 + rx * size * 0.65, y - fy * size * 0.6 + ry * size * 0.65);
    mg.lineTo(x - fx * size * 0.25, y - fy * size * 0.25); mg.lineTo(x - fx * size * 0.6 - rx * size * 0.65, y - fy * size * 0.6 - ry * size * 0.65); mg.closePath(); mg.stroke(); mg.fill();
    if (ring) { mg.strokeStyle = col; mg.lineWidth = 1.5; mg.beginPath(); mg.arc(x, y, size * 1.6, 0, TAU); mg.stroke(); }
  };
  const tag = (text, x, y, col, bg = 'rgba(2,8,4,.8)') => {
    mg.font = '16px "VT323", monospace'; mg.textBaseline = 'middle'; mg.textAlign = 'center';
    const w = mg.measureText(text).width + 8; mg.fillStyle = bg; mg.fillRect(x - w / 2, y - 8, w, 16);
    mg.fillStyle = col; mg.fillText(text, x, y + 1); mg.textAlign = 'left';
  };
  // the level someone's on, seen from above, centred on them
  function drawFacMap(p, crew, t, more) {
    const fac = G.fac, S = 7, P = posOf(p), L = fac.levelAt(P.x, P.z, P.y), cx = P.x, cz = P.z, my = BAR + (H - BAR) / 2;
    const X = (x) => W / 2 + (x - cx) * S, Y = (z) => my + (z - cz) * S;
    const i0 = fac.ti(cx - W / 2 / S) - 1, i1 = fac.ti(cx + W / 2 / S) + 1, j0 = fac.tj(cz - (H - BAR) / 2 / S) - 1, j1 = fac.tj(cz + (H - BAR) / 2 / S) + 1;
    const onL = (k) => { if (k < 0 || !fac.grid[k]) return false; if (fac.grid[k] === 4) { const s = fac.shafts[fac.shaftOf[k]]; return L >= s.top && L <= s.bot; } return fac.lvl[k] === L; };
    const tileX = (i) => X(fac.ox + i * FAC_TS), tileY = (j) => Y(fac.oz + j * FAC_TS), TSs = FAC_TS * S;
    // floors
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = fac.idx(i, j); if (!onL(k)) continue;
      mg.fillStyle = fac.grid[k] === 4 ? '#14240e' : fac.grid[k] === 2 ? '#0d2615' : '#0a1f11';
      mg.fillRect(tileX(i), tileY(j), TSs + 0.5, TSs + 0.5);
    }
    // walls: wherever you can't walk straight through on this level
    mg.strokeStyle = '#59e07a'; mg.lineWidth = 2; mg.beginPath();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = fac.idx(i, j); if (!onL(k)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = fac.idx(i + dx, j + dy);
        let open = fac.connected(k, nk) && onL(nk);
        // a stairwell's doorway only exists on its own level
        if (open && (fac.grid[k] === 4) !== (fac.grid[nk] === 4)) { const e = fac.exitEdge.get(fac.edgeKey(k, nk)); open = !!e && e.lv === L; }
        if (open) continue;
        const ax = tileX(i + (dx > 0 ? 1 : 0)), ay = tileY(j + (dy > 0 ? 1 : 0));
        if (dx) { mg.moveTo(ax, tileY(j)); mg.lineTo(ax, tileY(j + 1)); } else { mg.moveTo(tileX(i), ay); mg.lineTo(tileX(i + 1), ay); }
      }
    }
    mg.stroke();
    // doors (amber), stairwells, exits
    mg.strokeStyle = '#d8a040'; mg.lineWidth = 3;
    for (const d of fac.doors) if (fac.lvl[d.a] === L && !d.broken) {
      const tx = -d.nz, tz = d.nx; mg.beginPath(); mg.moveTo(X(d.x - tx * 0.75), Y(d.z - tz * 0.75)); mg.lineTo(X(d.x + tx * 0.75), Y(d.z + tz * 0.75)); mg.stroke();
    }
    for (const s of fac.shafts) {
      if (L < s.top || L > s.bot) continue;
      const x = X(s.x0), y = Y(s.z0), w = 6 * S, h = 12 * S;
      mg.strokeStyle = '#8fd060'; mg.lineWidth = 1;
      for (let q = 1; q < 8; q++) { mg.beginPath(); mg.moveTo(x + 4, y + h * 0.25 + q * h * 0.5 / 8); mg.lineTo(x + w - 4, y + h * 0.25 + q * h * 0.5 / 8); mg.stroke(); }
      tag('STAIRS ' + s.name, x + w / 2, y + h / 2, '#b8f080');
    }
    if (L === 0) for (const ex of fac.exits) tag(ex.kind === 'fire' ? 'FIRE EXIT' : 'EXIT', X(ex.x), Y(ex.z), '#ff6a50');
    // blast doors: a heavy bar across the corridor (red while down) and the code to type at the terminal
    for (const d of fac.blasts) {
      if (d.lv !== L) continue;
      const tx = -d.nz, tz = d.nx, down = !(d.open && d.anim > 0.6);
      mg.strokeStyle = down ? '#ff3a24' : 'rgba(255,200,70,.45)'; mg.lineWidth = down ? 5 : 2;
      mg.beginPath(); mg.moveTo(X(d.x - tx * 1.5), Y(d.z - tz * 1.5)); mg.lineTo(X(d.x + tx * 1.5), Y(d.z + tz * 1.5)); mg.stroke();
      tag(d.code, X(d.x) + d.nz * 16, Y(d.z) - 14 + d.nx * 0, down ? '#ffd040' : 'rgba(255,208,64,.6)');
    }
    // what the radar found
    drawBlips(X, Y, t, (b) => b.zone === 'in' && b.lv === L);
    if (more) more(X, Y, (o) => fac.levelAt(o.x, o.z, o.y) === L);
    // the crew on this level
    for (const q of crew) {
      if (!q.alive || q.zone !== 'in') continue;
      const Q = posOf(q); if (fac.levelAt(Q.x, Q.z, Q.y) !== L) continue;
      const col = suitCss(q.color), isP = q === p, x = X(Q.x), y = Y(Q.z);
      arrow(x, y, Q.yaw, isP ? 9 : 7, col, isP);
      tag(String(q.name).toUpperCase().slice(0, 12), x, y + 17, col);
    }
    return L;
  }
  // outside: the ship, the way into the facility, any supply pods, the crew out in the open
  function drawExtMap(p, crew, t, more) {
    const S = 2.4, P = posOf(p), cx = G.inShip(p) ? 0 : P.x, cz = G.inShip(p) ? 0 : P.z, my = BAR + (H - BAR) / 2;
    const X = (x) => W / 2 + (x - cx) * S, Y = (z) => my + (z - cz) * S;
    mg.strokeStyle = 'rgba(80,200,110,.12)'; mg.lineWidth = 1;
    for (let gx = Math.floor((cx - 180) / 20) * 20; gx < cx + 180; gx += 20) { mg.beginPath(); mg.moveTo(X(gx), BAR); mg.lineTo(X(gx), H); mg.stroke(); }
    for (let gz = Math.floor((cz - 80) / 20) * 20; gz < cz + 80; gz += 20) { mg.beginPath(); mg.moveTo(0, Y(gz)); mg.lineTo(W, Y(gz)); mg.stroke(); }
    // the ship's outline, nose to +x
    mg.strokeStyle = '#59e07a'; mg.lineWidth = 2; mg.beginPath();
    mg.moveTo(X(-7.4), Y(-4.3)); mg.lineTo(X(3.7), Y(-4.3)); mg.lineTo(X(8.2), Y(-1.9)); mg.lineTo(X(9.9), Y(0)); mg.lineTo(X(8.2), Y(1.9)); mg.lineTo(X(3.7), Y(4.3)); mg.lineTo(X(-7.4), Y(4.3)); mg.closePath(); mg.stroke();
    tag('SHIP', X(-1.5), Y(0), '#59e07a');
    if (G.ext) for (const o of G.ext.interact) tag(o.which === 'fire' ? 'FIRE EXIT' : 'ENTRANCE', X(o.x), Y(o.z), '#ff6a50');
    for (const pod of Pods.list) if (pod.hit) tag(pod.opened ? 'POD (EMPTY)' : 'SUPPLY POD', X(pod.x), Y(pod.z), '#ffd040');
    drawBlips(X, Y, t, (b) => b.zone === 'out');
    if (more) more(X, Y, () => true);
    for (const q of crew) {
      if (!q.alive || q.zone !== 'out') continue;
      const Q = posOf(q), col = suitCss(q.color), isP = q === p, x = X(Q.x), y = Y(Q.z);
      arrow(x, y, Q.yaw, isP ? 8 : 6, col, isP);
      if (!G.inShip(q)) tag(String(q.name).toUpperCase().slice(0, 12), x, y + 15, col);
    }
  }
  function drawBlips(X, Y, t, which) {
    blips = blips.filter((b) => t - b.at < 10);
    for (const b of blips) {
      if (!which(b)) continue;
      const a = 1 - (t - b.at) / 10, x = X(b.x), y = Y(b.z);
      if (b.item) { pin(x, y, a); continue; }
      mg.fillStyle = `rgba(255,60,40,${a})`; mg.beginPath(); mg.arc(x, y, 5, 0, TAU); mg.fill();
      mg.strokeStyle = `rgba(255,60,40,${a * 0.5})`; mg.lineWidth = 1.5; mg.beginPath(); mg.arc(x, y, 5 + (t - b.at) * 6 % 14, 0, TAU); mg.stroke();
    }
  }
  // metal scrap lying about (not carried, not aboard): what the Salvage Locator can find. Glass, china, wood, cloth and
  // bone it can't
  const metalScrap = (it) => it.holder == null && !it.inShip && it.basket == null && ITEMS[it.type].kind === 'scrap' && (ITEM_MAT[it.type] === 'metal' || ITEM_MAT[it.type] === 'tin');
  // an amber pin (a find of the Salvage Locator's)
  const pin = (x, y, a) => { mg.fillStyle = `rgba(255,190,60,${a})`; mg.beginPath(); mg.moveTo(x, y - 6); mg.lineTo(x + 5, y); mg.lineTo(x, y + 6); mg.lineTo(x - 5, y); mg.closePath(); mg.fill(); };
  // A Survey Pad's screen: the same map as the main screen's, on the pad in your hands, following you: the floor you're on
  // (or the ground round the ship), north up, and with the Salvage Locator fitted, the metal scrap within 30 m pinned on
  // it. A few frames a second, on its own canvas, with the pad's size swapped in for the main screen's while it draws
  let pcv = null, pg = null, ptex = null, pmat = null, ptimer = 0;
  function padMat() {
    if (!pmat) { [pcv, pg] = TEX.canvas(384, 288); ptex = new THREE.CanvasTexture(pcv); ptex.colorSpace = THREE.SRGBColorSpace; pmat = new THREE.MeshBasicMaterial({ map: ptex, toneMapped: false }); }
    return pmat;
  }
  function pad(p, dt) {
    padMat(); if ((ptimer -= dt) > 0) return; ptimer = 1 / 6;
    const keep = [mg, W, H, BAR], t = performance.now() / 1000, crew = [...G.players.values()];
    mg = pg; W = 384; H = 288; BAR = 0;
    try {
      mg.fillStyle = '#020a05'; mg.fillRect(0, 0, W, H);
      const P = posOf(p), loc = G.run && G.run.upgrades.locator;
      const pins = loc ? (X, Y, ok) => { for (const it of G.items.values()) if (metalScrap(it) && (it.pos.y < FAC_Y0 + 60) === (p.zone === 'in') && Math.hypot(it.pos.x - P.x, it.pos.z - P.z) < 30 && ok(it.pos)) pin(X(it.pos.x), Y(it.pos.z), 0.7 + 0.3 * Math.sin(t * 4 + it.id)); } : null;
      let where = '';
      if (G.mode === 'orbit' || !G.round) {
        mg.fillStyle = '#59e07a'; mg.font = '26px "VT323", monospace'; mg.textAlign = 'center'; mg.textBaseline = 'middle'; mg.fillText('NO SURVEY DATA IN ORBIT', W / 2, H / 2); mg.textAlign = 'left';
      } else if (p.zone === 'in' && G.fac) where = G.fac.levelLabel(drawFacMap(p, crew, t, pins));
      else { drawExtMap(p, crew, t, pins); where = G.inShip(p) ? 'SHIP' : 'OUTSIDE'; }
      mg.fillStyle = 'rgba(2,10,5,.75)'; mg.fillRect(0, 0, W, 26);
      mg.fillStyle = '#59e07a'; mg.font = '22px "VT323", monospace'; mg.textBaseline = 'middle'; mg.fillText('N ▲  ' + where, 6, 13);
      if (loc) { mg.fillStyle = '#ffbe3c'; mg.textAlign = 'right'; mg.fillText('◆ LOCATOR', W - 6, 13); mg.textAlign = 'left'; }
      // (scanlines, and the glass a touch brighter toward the top)
      mg.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < H; y += 3) mg.fillRect(0, y, W, 1);
    } finally { [mg, W, H, BAR] = keep; }
    ptex.needsUpdate = true;
  }
  // a radar sweep from whoever the map follows: a line rolls round and anything alive it crosses lights up
  function runSweep(p, t) {
    if (!sweep) return;
    const P = posOf(p), u = (t - sweep.t0) / 2.6;
    if (u > 1) { sweep = null; return; }
    const inside = p.zone === 'in' && G.fac, lv = inside ? G.fac.levelAt(P.x, P.z, P.y) : 0, range = inside ? 48 : 130, ang = u * TAU;
    for (const m of G.monsters.values()) {
      if (m.dead || sweep.seen.has(m.id) || m.def.zone !== (inside ? 'in' : 'out')) continue;
      const mx = m.rpos.x, mz = m.rpos.z, d = Math.hypot(mx - P.x, mz - P.z);
      if (d > range || (inside && G.fac.levelAt(mx, mz, m.rpos.y) !== lv)) continue;
      let b = Math.atan2(mx - P.x, -(mz - P.z)); if (b < 0) b += TAU;
      if (b <= ang) { sweep.seen.add(m.id); blips.push({ x: mx, z: mz, at: t, zone: inside ? 'in' : 'out', lv }); SFX.play('ping', null, { f: 105, vol: 0.35 }); }
    }
    // (with the Salvage Locator fitted, the metal scrap it crosses too: a higher ping)
    if (G.run && G.run.upgrades.locator) for (const it of G.items.values()) {
      if (sweep.seen.has('i' + it.id) || !metalScrap(it) || (it.pos.y < FAC_Y0 + 60) !== !!inside) continue;
      const d = Math.hypot(it.pos.x - P.x, it.pos.z - P.z);
      if (d > range || (inside && G.fac.levelAt(it.pos.x, it.pos.z, it.pos.y) !== lv)) continue;
      let b = Math.atan2(it.pos.x - P.x, -(it.pos.z - P.z)); if (b < 0) b += TAU;
      if (b <= ang) { sweep.seen.add('i' + it.id); blips.push({ x: it.pos.x, z: it.pos.z, at: t, zone: inside ? 'in' : 'out', lv, item: true }); SFX.play('ping', null, { f: 190, vol: 0.2 }); }
    }
    // the sweep line itself
    const my = BAR + (H - BAR) / 2;
    mg.strokeStyle = 'rgba(120,255,150,.55)'; mg.lineWidth = 2; mg.beginPath(); mg.moveTo(W / 2, my); mg.lineTo(W / 2 + Math.sin(ang) * 400, my - Math.cos(ang) * 400); mg.stroke();
    const gr = mg.createRadialGradient(W / 2, my, 0, W / 2, my, 380); gr.addColorStop(0, 'rgba(90,255,130,.08)'); gr.addColorStop(1, 'rgba(90,255,130,0)');
    mg.fillStyle = gr; mg.beginPath(); mg.moveTo(W / 2, my); mg.arc(W / 2, my, 400, -Math.PI / 2 + ang - 0.5, -Math.PI / 2 + ang); mg.closePath(); mg.fill();
  }
  function drawMap(p, crew, t) {
    mg.fillStyle = '#020a05'; mg.fillRect(0, 0, W, H);
    let where = '';
    if (!p.alive) where = 'NO LIFE SIGNS';
    else if (G.mode === 'orbit' || !G.round) where = 'IN ORBIT';
    else if (p.zone === 'in' && G.fac) { const L = drawFacMap(p, crew, t); where = 'FACILITY · ' + G.fac.levelLabel(L); }
    else { drawExtMap(p, crew, t); where = G.inShip(p) ? 'SHIP' : 'OUTSIDE'; }
    if (p.alive && G.round && G.mode !== 'orbit') runSweep(p, t);
    if (!p.alive || G.mode === 'orbit' || !G.round) {
      mg.fillStyle = p.alive ? '#59e07a' : '#ff6a50'; mg.font = '30px "VT323", monospace'; mg.textAlign = 'center'; mg.textBaseline = 'middle';
      mg.fillText(p.alive ? 'NO SURVEY DATA IN ORBIT' : 'SIGNAL LOST', W / 2, H / 2); mg.textAlign = 'left';
    }
    // a north tick and the scale
    mg.fillStyle = '#59e07a'; mg.font = '16px "VT323", monospace'; mg.textBaseline = 'middle'; mg.fillText('N ▲', 10, BAR + 14);
    mtex.needsUpdate = true;
    g.clearRect(0, 0, W, H);
    drawBar('◀  MAP: ' + String(p.name).toUpperCase().slice(0, 12) + ' · ' + where + '  ▶');
    if (sweep) { g.fillStyle = '#ff6a50'; g.font = '18px "VT323", monospace'; g.textBaseline = 'middle'; g.fillText('RADAR SWEEP', 10, H - 14); }
    otex.needsUpdate = true;
  }
  function drawOverlay(crew, rects, t) {
    g.clearRect(0, 0, W, H);
    drawBar('◀  CAMS  ▶');
    crew.forEach((p, i) => {
      const r = rects[i], x = r.x, y = H - r.y - r.h;   // canvas y runs down
      g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, r.w - 3, r.h - 3);
      if (!p.alive) {
        g.fillStyle = 'rgba(20,4,4,0.92)'; g.fillRect(x + 3, y + 3, r.w - 6, r.h - 6);
        for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(200,200,200,${Math.random() * 0.25})`; g.fillRect(x + Math.random() * r.w, y + Math.random() * r.h, 3, 1); }
        g.fillStyle = '#ff5a40'; g.textAlign = 'center'; g.font = '26px "VT323", monospace'; g.fillText('SIGNAL LOST', x + r.w / 2, y + r.h / 2); g.textAlign = 'left';
      }
      g.font = '18px "VT323", monospace';
      const tag = String(p.name).toUpperCase().slice(0, 14);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 6, y + 6, g.measureText(tag).width + 12, 20);
      g.fillStyle = '#e8f0e0'; g.fillText(tag, x + 12, y + 17);
      const wh = where(p); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 6, y + r.h - 26, g.measureText(wh).width + 12, 20);
      g.fillStyle = p.alive ? '#a8d8a0' : '#ff7a60'; g.fillText(wh, x + 12, y + r.h - 15);
      if (p.alive && (t * 1.1) % 1 < 0.6) { g.fillStyle = '#ff3a2a'; g.beginPath(); g.arc(x + r.w - 16, y + 16, 5, 0, TAU); g.fill(); g.fillStyle = '#e8f0e0'; g.fillText('REC', x + r.w - 52, y + 17); }
    });
    otex.needsUpdate = true;
  }
  function update(dt) {
    if (!rt || !G.ship || !G.run) return;
    const t = performance.now() / 1000;
    mat.uniforms.uT.value = t;
    // only while someone here could see it: you in the ship (or on its ramp), near the screen and looking its way.
    // (Standing round the ship outside, its feeds aren't worth rendering the whole site over again for)
    const me = G.me(); if (!me) return;
    const screen = G.ship.monMesh.getWorldPosition(new THREE.Vector3());
    const eye = R.camera.position, lc = G.ship.group.worldToLocal(_cl.copy(eye)), pr = _cs.copy(screen).project(R.camera);
    const near = me.zone === 'out' && eye.distanceTo(screen) < NEAR && (G.ship.onFootprint(lc.x, lc.z) || G.ship.rampAt(lc.x, lc.z) != null) && pr.z < 1 && Math.abs(pr.x) < 1.2 && Math.abs(pr.y) < 1.2;
    mat.uniforms.uLive.value = 1;
    if (!near) return;
    timer -= dt; if (timer > 0) return;
    const crew = [...G.players.values()].sort((a, b) => a.id - b.id);
    view = view % (crew.length + 2);
    // the map: drawn, not rendered, so it can run smoothly
    if (view > 0 && view <= crew.length) { timer = 1 / 15; mat.uniforms.uMap.value = 1; drawMap(crew[view - 1], crew, t); return; }
    mat.uniforms.uMap.value = 0;
    timer = 1 / FPS;
    if (view === crew.length + 1) { hullCams(me, t); return; }
    // (everyone else's body-cams: each of you sees the rest of the crew's feeds, never your own; alone, there's nobody
    // else's to show, so the ship's own cameras)
    const cams = crew.filter((p) => p.id !== G.localId);
    if (!cams.length) { hullCams(me, t); return; }
    const rects = layout(cams.length);
    const sa = selfAvatar(), mon = G.ship.monMesh, ext = G.ext && G.ext.group, extV = ext && ext.visible;
    mon.visible = false;   // (never draw the screen into itself)
    R.rig();
    cams.forEach((p, i) => {
      const r = rects[i]; if (!p.alive) return;
      eyeOf(p, false);
      // (each lit the way it is where they are: see G.feedLight)
      R.rig(true); if (ext) ext.visible = extV;
      // (the body-cams don't march the air: they get the flat mist back while they're drawn)
      if (R.vol.on && G.ext) R.scene.fog.density = G.ext.fogDen || 0.0075;
      G.feedLight(p, cam.position); if (ext && p.zone === 'in') ext.visible = false;
      cam.aspect = r.w / r.h; cam.updateProjectionMatrix();
      // you appear in everyone else's feed
      if (sa) { sa.root.visible = me.alive; const mp = me.pos.clone(); let q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, me.yaw, 0)); if (G.camCarried) { mp.applyMatrix4(G.shipM); q = q.premultiply(G.shipQ); } sa.root.position.copy(mp); sa.root.quaternion.copy(q); sa.update(0.016, { at: me.pos, yaw: me.yaw, speed: me.moving ? 3 : 0, crouch: me.crouch, sit: me.seat != null, pitch: me.pitch }); }
      const av = p.avatar; if (av) av.root.visible = false;
      R.renderView(cam, rt, r.x, r.y, r.w, r.h);
      if (av) av.root.visible = p.alive;
    });
    R.rig(true); if (ext) ext.visible = extV;
    if (sa) sa.root.visible = false;
    mon.visible = true;
    const key = cams.map((p) => p.id + where(p) + p.alive).join() + (G.run.sold + '/' + G.run.quota + G.run.credits + G.run.daysLeft) + Math.floor(t * 1.1 % 1 < 0.6);
    if (key !== last) { last = key; drawOverlay(cams, rects, t); }
  }
  // the ship's own cameras on its hull: four feeds on the same old tube, live wherever the ship is (space and the world
  // below from orbit, the sky on the way down, the site once it's landed). The tripod's feed only once it's set up on
  // the ground; until then the nose camera's takes its place. You show up in them the way you do in the crew's feeds.
  function hullCams(me, t) {
    const S = G.ship, down = S.groundCamUp, cams = S.hullCams.filter((c) => (down ? !c.space : !c.ground)), rects = layout(cams.length);
    S.monMesh.visible = false;
    const fd0 = R.scene.fog.density; if (R.vol.on && G.ext) R.scene.fog.density = G.ext.fogDen || 0.0075;
    const sa = selfAvatar();
    if (sa) {
      const mp = me.pos.clone(); let q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, me.yaw, 0));
      if (G.shipMoved && G.playerAboard(me)) { mp.applyMatrix4(G.shipM); q = q.premultiply(G.shipQ); }
      sa.root.visible = me.alive && me.zone === 'out'; sa.root.position.copy(mp); sa.root.quaternion.copy(q);
      sa.update(0.016, { at: me.pos, yaw: me.yaw, speed: me.moving ? 3 : 0, crouch: me.crouch, sit: me.seat != null, pitch: me.pitch });
    }
    // (the ground camera is wherever the crew have set it up, watching the way it faces; carried, it sees what its
    // carrier faces. Down in the plant its signal has all that rock to get through: the further down, the weaker,
    // c.k from 1 down to a tenth, the picture choppier and snowier and now and then lost altogether)
    const gc = [...G.items.values()].find((it) => it.type === 'shipcam');
    const groundAt = (c) => {
      if (!gc) return false;
      const h = gc.holder != null ? G.players.get(gc.holder) : null;
      c.zone = h ? h.zone : G.itemZone(gc);
      const at = h ? (h.id === G.localId ? h.pos : h.rpos) : gc.pos;
      c.k = c.zone === 'in' && G.fac ? clamp(0.8 - 0.14 * G.fac.levelAt(at.x, at.z, at.y), 0.1, 1) : 1;
      if (c.zone === 'in' && !G.fac) return false;
      if (h) { const at = h.id === G.localId ? h.pos : h.rpos, yaw = h.id === G.localId ? h.yaw : h.ryaw || h.yaw, pt = h.id === G.localId ? h.pitch : h.rpitch || 0;
        c.pos = (c.pos || new THREE.Vector3()).set(at.x - Math.sin(yaw) * 0.6, at.y + 1.25, at.z - Math.cos(yaw) * 0.6); c.look = (c.look || new THREE.Vector3()).set(c.pos.x - Math.sin(yaw) * 10, c.pos.y + Math.sin(pt) * 10, c.pos.z - Math.cos(yaw) * 10); }
      else { const p = gc.vis || gc.pos, fx = -Math.sin(gc.ry), fz = -Math.cos(gc.ry);
        c.pos = (c.pos || new THREE.Vector3()).set(p.x + fx * 0.17, p.y + 1.28, p.z + fz * 0.17); c.look = (c.look || new THREE.Vector3()).set(c.pos.x + fx * 10, c.pos.y - 0.6, c.pos.z + fz * 10); }
      return true;
    };
    const liveOf = (c) => c.inside || !c.ground || (down && groundAt(c) && !(c.drop > 0));
    let weak = false;
    cams.forEach((c, i) => {
      const r = rects[i];
      // (a weak signal: now and then it drops out altogether for a moment, and the picture only comes through every
      // few frames, the feed hanging in between)
      if (c.ground && down && gc && groundAt(c) && c.k < 1) {
        weak = true; if (c.drop > 0) c.drop -= 1 / FPS; else if (Math.random() < 0.05 * (1 - c.k) * (1 - c.k)) c.drop = 0.15 + Math.random() * 0.5;
        if ((c.skip = (c.skip || 0) + 1) < 1 + Math.floor((1 - c.k) * 7)) return; c.skip = 0;
      } else c.drop = 0;
      if (!liveOf(c)) return;
      cam.position.copy(c.pos); _t.copy(c.look); cam.up.set(0, 1, 0);
      if (G.shipMoved) { cam.position.applyMatrix4(G.shipM); _t.applyMatrix4(G.shipM); cam.up.applyQuaternion(G.shipQ); }
      cam.lookAt(_t); cam.fov = 82; cam.aspect = r.w / r.h; cam.updateProjectionMatrix();
      // (down in the plant it sees the plant's own dark, its lamps and whoever's flashlight is about, as a crewmate's
      // feed does, not the daylight by the ship)
      const ext = c.zone === 'in' && G.ext && G.ext.group, extV = ext && ext.visible;
      if (ext) { R.rig(); G.feedLight({ zone: 'in' }, cam.position); ext.visible = false; if (R.vol.on) R.scene.fog.density = Math.max(R.scene.fog.density, 0.07); }
      R.renderView(cam, rt, r.x, r.y, r.w, r.h);
      if (ext) { R.rig(true); ext.visible = extV; if (R.vol.on && G.ext) R.scene.fog.density = G.ext.fogDen || 0.0075; }
    });
    cam.fov = 72; cam.up.set(0, 1, 0); R.scene.fog.density = fd0;
    if (sa) sa.root.visible = false;
    S.monMesh.visible = true;
    const key = 'hull' + down + cams.map(liveOf).join() + Math.floor(t * 1.1 % 1 < 0.6) + (weak ? Math.floor(t * 9) : '') + (G.run.sold + '/' + G.run.quota + G.run.credits + G.run.daysLeft);
    if (key === last) return;
    last = key;
    g.clearRect(0, 0, W, H); drawBar('◀  SHIP CAMS  ▶');
    cams.forEach((c, i) => {
      const r = rects[i], x = r.x, y = H - r.y - r.h;
      g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, r.w - 3, r.h - 3);
      const live = liveOf(c);
      if (!live) {
        g.fillStyle = 'rgba(6,8,6,0.95)'; g.fillRect(x + 3, y + 3, r.w - 6, r.h - 6);
        for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(200,200,200,${Math.random() * 0.18})`; g.fillRect(x + Math.random() * r.w, y + Math.random() * r.h, 3, 1); }
        g.fillStyle = '#a8d8a0'; g.textAlign = 'center'; g.font = '22px "VT323", monospace'; g.fillText(c.ground && down && gc ? 'NO SIGNAL' : 'NO EXTERIOR FEED', x + r.w / 2, y + r.h / 2); g.textAlign = 'left';
      }
      // (the weak signal's snow and tearing over the picture, and how much of it is getting through)
      if (live && c.ground && c.k < 1) {
        const n = Math.round((1 - c.k) * 520);
        for (let k = 0; k < n; k++) { g.fillStyle = `rgba(${200 + Math.random() * 55 | 0},${200 + Math.random() * 55 | 0},${200 + Math.random() * 55 | 0},${0.12 + Math.random() * 0.5 * (1 - c.k)})`; g.fillRect(x + Math.random() * r.w, y + Math.random() * r.h, 2 + Math.random() * 6, 1 + (Math.random() < 0.2 ? 1 : 0)); }
        for (let k = 0, m = Math.random() < (1 - c.k) ? 1 + Math.floor(Math.random() * 3) : 0; k < m; k++) { const ty = y + Math.random() * r.h; g.fillStyle = `rgba(230,230,220,${0.1 + 0.25 * (1 - c.k)})`; g.fillRect(x + 3, ty, r.w - 6, 2 + Math.random() * 5); }
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + r.w - 118, y + r.h - 26, 112, 20); g.fillStyle = c.k > 0.5 ? '#a8d8a0' : c.k > 0.25 ? '#f2c060' : '#ff7a60'; g.font = '18px "VT323", monospace'; g.fillText('SIGNAL ' + Math.round(c.k * 100) + '%', x + r.w - 110, y + r.h - 15);
      }
      g.font = '18px "VT323", monospace';
      const tag = (c.inside ? '' : 'EXT · ') + c.name;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 6, y + 6, g.measureText(tag).width + 12, 20);
      g.fillStyle = '#e8f0e0'; g.fillText(tag, x + 12, y + 17);
      if (live && (t * 1.1) % 1 < 0.6) { g.fillStyle = '#ff3a2a'; g.beginPath(); g.arc(x + r.w - 16, y + 16, 5, 0, TAU); g.fill(); g.fillStyle = '#e8f0e0'; g.fillText('REC', x + r.w - 52, y + 17); }
    });
    otex.needsUpdate = true;
  }
  // the buttons under the screen: page through the views (CAMS, a map following each crewmate, then the hull cameras)
  function cycle(dir) {
    const n = G.players.size + 2;
    view = (((view + dir) % n) + n) % n; timer = 0; last = '';
  }
  // RADAR: sweep around whoever the map follows (from the cams it picks the first crewmate out in the field)
  function radar() {
    const crew = [...G.players.values()].sort((a, b) => a.id - b.id);
    if (view === 0 || view === crew.length + 1) { const i = crew.findIndex((p) => p.alive && !G.inShip(p)); view = (i >= 0 ? i : crew.findIndex((p) => p.id === G.localId)) + 1; }
    sweep = { t0: performance.now() / 1000, seen: new Set() }; timer = 0; last = '';
  }
  function reset() { view = 0; sweep = null; blips = []; }
  function setView(v) { if (v === view) return; view = v | 0; timer = 0; last = ''; }
  return { init, update, layout, cycle, radar, reset, setView, pad, padMat, get view() { return view; } };
})();
