'use strict';
// Menus, settings, pause screen, title backdrop and the main loop.
const MenuScene = (() => {
  let fac = null, pts = [], segs = [], total = 0, t = 0, pale = null, paleT = 14, paleShow = 0, active = false, flick = 0, heard = false;
  function build() {
    fac = new Facility(90210, 20);
    fac.build();
    let best = null;
    for (let a = 1; a < fac.rooms.length; a++) for (let b = a + 1; b < fac.rooms.length; b++) {
      const A = fac.rooms[a], B = fac.rooms[b];
      const p = fac.findPath(fac.cx(A.cx), fac.cz(A.cy), fac.cx(B.cx), fac.cz(B.cy));
      if (p && (!best || p.length > best.p.length)) best = { p, s: { x: fac.cx(A.cx), z: fac.cz(A.cy) } };
    }
    pts = best ? [best.s, ...best.p] : [{ x: 0, z: 0 }, { x: 1, z: 0 }];
    for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z); segs.push(l); total += l; }
    pale = MonModels.build('pale'); pale.visible = false;
  }
  function at(s) {
    s = ((s % total) + total) % total;
    for (let i = 0; i < segs.length; i++) { if (s <= segs[i]) { const f = s / segs[i]; return { x: lerp(pts[i].x, pts[i + 1].x, f), z: lerp(pts[i].z, pts[i + 1].z, f) }; } s -= segs[i]; }
    return pts[pts.length - 1];
  }
  return {
    enter() {
      if (!fac) build();
      if (!active) { R.scene.add(fac.group); R.scene.add(pale); active = true; }
      G.ship.group.visible = false; G.ship.space.visible = false;
      R.sun.castShadow = false; R.camera.far = 700; R.camera.updateProjectionMatrix(); R.setFog(null); R.vol.on = false; SFX.chase(0, 0, true);
      for (let i = -1; i < 2; i++) R.setGlow(i, null);
      R.remote.forEach((s, i) => { s.intensity = 0; R.setBeam(i, s, false); });
      R.fx.health = 1; R.fx.leech = 0; R.fx.damage = 0; R.fx.sun = 0;
    },
    leave() {
      if (!active) return;
      R.scene.remove(fac.group); R.scene.remove(pale); active = false;
      G.ship.group.visible = true;
      R.updateLights([], R.camera.position, 'in', 0, 1, true);
    },
    update(dt) {
      t += dt;
      const s = t * 0.75, p = at(s), q = at(s + 3.5);
      const cam = R.camera;
      cam.position.set(p.x, FAC_Y0 + 1.6 + Math.sin(t * 1.6) * 0.03, p.z);
      const look = new THREE.Vector3(q.x, FAC_Y0 + 1.5 + Math.sin(t * 0.3) * 0.15, q.z);
      const m = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
      cam.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(m), 1 - Math.exp(-dt * 2));
      R.scene.background.set(0x000000); R.scene.fog.color.set(0x000000); R.scene.fog.density = 0.075;
      R.hemi.intensity = 0.04; R.sun.intensity = 0;
      R.updateLights(fac.lamps, cam.position, 'in', t, dt, true, (l, f) => fac.setLampVisual(l, f));
      flick -= dt;
      R.flash.intensity = flick > 0 ? (Math.random() < 0.5 ? 0 : 8) : 45;
      R.flash.distance = 22; R.flash.angle = 0.42; R.flash.position.set(0.15, -0.2, 0);
      fac.update(dt);
      // something at the end of the corridor
      paleT -= dt;
      if (paleT <= 0 && !paleShow) {
        const a = at(s + 10);
        if (fac.los(p.x, p.z, a.x, a.z)) {
          pale.position.set(a.x, FAC_Y0, a.z); pale.rotation.y = Math.atan2(p.x - a.x, p.z - a.z); pale.visible = true; paleShow = 2.6; heard = false;
          const P = pale.userData.parts; P.torso.rotation.x = 0.35; P.head.rotation.z = 0.5;
        } else paleT = 1;
      }
      if (paleShow > 0) {
        paleShow -= dt;
        // (it sees you: from where it stands, down the corridor, its shriek landing as the light fails)
        if (paleShow <= 1.3 && !heard) { heard = true; SFX.play('noticed', new THREE.Vector3(pale.position.x, FAC_Y0 + 2, pale.position.z), { vol: 1, ref: 10, rev: 0.9 }); }
        if (paleShow <= 0.35 && flick <= 0) flick = 0.35;
        if (paleShow <= 0) { pale.visible = false; paleShow = 0; paleT = 20 + Math.random() * 15; }
      }
      R.fx.fear = 0.12 + (paleShow > 0 ? 0.25 : 0); R.fx.exposure = 1.25; R.fx.fade = damp(R.fx.fade, 0, 2, dt);
      SFX.setEnv('menu'); SFX.listener(cam);
    },
  };
})();

const Menu = (() => {
  const panel = () => $('menupanel');
  let joining = false;
  const btn = (label, fn, opts = {}) => { const b = document.createElement('button'); b.className = 'btn' + (opts.small ? ' small' : ''); b.textContent = label; if (opts.disabled) b.disabled = true; b.onclick = () => { SFX.init(); SFX.play('beep', null, { f: 900, vol: 0.4 }); fn(); }; return b; };
  const html = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d; };
  function set(...nodes) { const p = panel(); p.innerHTML = ''; nodes.flat().forEach((n) => n && p.appendChild(n)); $('menu').classList.add('sub'); fitMenu(); }
  // the menu panel fits the screen: the room it has is the screen less the title over it (which gives way on a short
  // screen to anything past the main menu) and a margin
  function fitMenu() {
    const p = panel(), m = $('menu'), t = $('title');
    if (!p || m.classList.contains('hidden')) return;
    fitToScreen(p, 1e9);
    const cs = getComputedStyle(m), titleH = t.offsetParent ? p.getBoundingClientRect().top - t.getBoundingClientRect().top : 0;
    fitToScreen(p, innerHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - titleH - 14);
  }
  const fitPause = () => { const i = $('pause').querySelector('.inner'); if (i && !$('pause').classList.contains('hidden')) fitToScreen(i, innerHeight - 24); };
  let fitQ = 0;
  const refit = () => { cancelAnimationFrame(fitQ); fitQ = requestAnimationFrame(() => { fitMenu(); fitPause(); HUD.fitSummary(); }); };
  window.addEventListener('resize', refit); window.addEventListener('orientationchange', () => setTimeout(refit, 250));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
  function nameField() {
    const d = html(`<div class="field"><label>YOUR NAME</label><input type="text" id="mname" maxlength="16" placeholder="CREWMATE"></div>`);
    const i = d.querySelector('input'); i.value = Settings.name || '';
    i.addEventListener('input', () => { Settings.name = i.value.trim(); Settings.save(); });
    i.addEventListener('keydown', (e) => e.stopPropagation());
    return d;
  }
  // the suit colour: drag on the wheel (hue round it, saturation out from the middle), brightness on the slider; the
  // robot beside it is repainted to match
  const hsv2rgb = (h, s, v) => { const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)]; };
  const rgb2hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [((h / 6) + 1) % 1, mx ? d / mx : 0, mx]; };
  function suitField() {
    const d = html(`<div class="field"><label>SUIT COLOUR</label><div class="suitpick"><canvas width="168" height="168"></canvas>
      <div class="suitside"><img class="suitprev" alt=""><input type="range" class="suitval" min="22" max="100" step="1"><div class="suithex"><i></i><span></span></div></div></div></div>`);
    const cv = d.querySelector('canvas'), g = cv.getContext('2d'), img = d.querySelector('img'), val = d.querySelector('input'), chip = d.querySelector('.suithex i'), txt = d.querySelector('.suithex span');
    const N = 168, C = N / 2, Rr = C - 4;
    const n0 = suitHex(Settings.suit);
    let [h, s, v] = rgb2hsv(((n0 >> 16) & 255) / 255, ((n0 >> 8) & 255) / 255, (n0 & 255) / 255);
    const toHex = (r, gg, b) => '#' + [r, gg, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
    // sRGB-ish wheel pixels (drawn once per brightness)
    let wheel = null, wheelV = -1;
    const paintWheel = () => {
      if (wheelV !== v) {
        wheel = g.createImageData(N, N); wheelV = v;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const dx = x - C, dy = y - C, r = Math.hypot(dx, dy), i = (y * N + x) * 4;
          if (r > Rr + 1) { wheel.data[i + 3] = 0; continue; }
          const [cr, cg, cb] = hsv2rgb(((Math.atan2(dy, dx) / (2 * Math.PI)) + 1) % 1, Math.min(1, r / Rr), v);
          wheel.data[i] = cr * 255; wheel.data[i + 1] = cg * 255; wheel.data[i + 2] = cb * 255; wheel.data[i + 3] = r > Rr ? (Rr + 1 - r) * 255 : 255;
        }
      }
      g.putImageData(wheel, 0, 0);
      const mx = C + Math.cos(h * 2 * Math.PI) * s * Rr, my = C + Math.sin(h * 2 * Math.PI) * s * Rr;
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.beginPath(); g.arc(mx, my, 7, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = '#f2e6d0'; g.beginPath(); g.arc(mx, my, 7, 0, Math.PI * 2); g.stroke();
    };
    let snapT = null;
    const apply = (final) => {
      const [r, gg, b] = hsv2rgb(h, s, v), hex = toHex(r, gg, b);
      Settings.suit = hex; chip.style.background = hex; txt.textContent = hex.toUpperCase(); paintWheel();
      clearTimeout(snapT);
      // repaint the robot preview once the colour settles (rendering it is not free)
      snapT = setTimeout(() => { try { const a = new Avatar('', hex); a.tag.visible = false; img.src = R.snapshot(a.root, 96, true); a.dispose && a.dispose(); } catch (e) { /* preview only */ } }, final ? 0 : 120);
      if (final) Settings.save();
    };
    const pick = (e, final) => {
      const rc = cv.getBoundingClientRect(), x = (e.clientX - rc.left) * (N / rc.width) - C, y = (e.clientY - rc.top) * (N / rc.height) - C;
      h = ((Math.atan2(y, x) / (2 * Math.PI)) + 1) % 1; s = Math.min(1, Math.hypot(x, y) / Rr); apply(final);
    };
    let drag = false;
    cv.addEventListener('pointerdown', (e) => { drag = true; cv.setPointerCapture(e.pointerId); pick(e, false); SFX.init(); });
    cv.addEventListener('pointermove', (e) => { if (drag) pick(e, false); });
    cv.addEventListener('pointerup', (e) => { if (!drag) return; drag = false; pick(e, true); SFX.play('click', null, { vol: 0.4 }); });
    val.value = Math.round(v * 100);
    val.addEventListener('input', () => { v = val.value / 100; apply(false); });
    val.addEventListener('change', () => apply(true));
    val.addEventListener('keydown', (e) => e.stopPropagation());
    apply(true);
    return d;
  }
  // ---- invites: a hosted copy of the game can hand out ?join=CODE links; a local copy shares the bare code ----
  const isPublicUrl = () => /^https?:$/.test(location.protocol) && !/^(localhost|127(\.\d+){3}|\[::1\]|0\.0\.0\.0)$/.test(location.hostname);
  const inviteLink = (code) => (isPublicUrl() ? location.origin + location.pathname + '?join=' + code : null);
  const codeFrom = (text) => { const m = /join=([a-z0-9]{5})/i.exec(text) || /\b([a-z0-9]{5})\b/i.exec(text.trim()); return m ? m[1].toUpperCase() : ''; };
  function copyText(text) {
    const fallback = () => {
      const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;left:-9999px;opacity:0'; document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } t.remove(); return ok;
    };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, fallback);
    return Promise.resolve(fallback());
  }
  function inviteNodes() {
    const code = Net.code || '', link = inviteLink(code);
    const row = document.createElement('div'); row.className = 'btnrow';
    const copyBtn = (label, text) => {
      const b = btn(label, () => copyText(text).then((ok) => { b.textContent = ok ? 'COPIED' : 'COPY FAILED'; setTimeout(() => (b.textContent = label), 1600); }), { small: true });
      return b;
    };
    if (link) row.appendChild(copyBtn('COPY INVITE LINK', link));
    row.appendChild(copyBtn('COPY CODE', code));
    return [html(`<div class="mtext">LOBBY CODE</div><div class="code">${esc(code)}</div>`), row];
  }
  // TEST CONNECTION: what this network lets through (the matchmaking server, a direct route, each relay), line by
  // line as the answers come in, then a verdict. Run it on both phones when a friend can't get in.
  function netTest() {
    const box = html('<div class="mtext nettest" style="font-size:18px;line-height:20px;white-space:pre-line"></div>'), out = box.firstChild;
    let running = false;
    const b = btn('TEST CONNECTION', async () => {
      if (running) return; running = true; out.textContent = '';
      const line = (t) => { out.textContent = out.textContent.replace(/^Matchmaking server\.\.\.\n?/, '') + t + '\n'; fitMenu(); };
      try { line(await Net.test(line)); } catch (e) { line('Test failed: ' + (e.message || e)); }
      running = false;
    }, { disabled: !Net.available });
    const wrap = document.createElement('div'); wrap.append(b, box);
    return wrap;
  }
  function saveInfo(key) { const s = Store.get(key, null); return s && s.run ? `DAY ${s.run.day} · $${s.run.credits} · QUOTA $${s.run.sold}/$${s.run.quota}` : null; }
  function begin() {
    Menu.hide(); MenuScene.leave(); HUD.show(true);
    Input.lock(); SFX.init();
  }
  // settings rows: a slider for a number in Settings, a button that cycles a setting
  const rowSlider = (rows, label, key, min, max, step, fmt, apply) => {
    const d = html(`<div class="setrow"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><span class="sv"></span></div>`);
    const r = d.querySelector('input'), v = d.querySelector('.sv');
    r.value = Settings[key]; v.textContent = fmt(Settings[key]);
    r.addEventListener('input', () => { Settings[key] = parseFloat(r.value); v.textContent = fmt(Settings[key]); Settings.save(); apply && apply(); });
    rows.push(d);
  };
  const rowToggle = (rows, label, get, setv) => {
    const d = html(`<div class="setrow"><span>${label}</span><button></button></div>`);
    const b = d.querySelector('button'); const upd = () => (b.textContent = get());
    b.onclick = async () => { await setv(); Settings.save(); upd(); }; upd(); rows.push(d);
    return upd;
  };
  // go(nodes) puts a page up (the main menu's panel, or the pause screen's)
  function settingsNodes(back, go) {
    const rows = [];
    const slider = (...a) => rowSlider(rows, ...a), toggle = (...a) => rowToggle(rows, ...a);
    slider(Touch.on ? 'LOOK SENSITIVITY' : 'MOUSE SENSITIVITY', 'sens', 0.2, 3, 0.05, (v) => v.toFixed(2));
    slider('VOLUME', 'volume', 0, 1, 0.01, (v) => Math.round(v * 100) + '%', () => SFX.setVolume(Settings.volume));
    slider('FIELD OF VIEW', 'fov', 55, 100, 1, (v) => v + '°', () => R.resize());
    slider('BRIGHTNESS', 'bright', 0.6, 2, 0.05, (v) => v.toFixed(2));
    toggle('RESOLUTION', () => RES_LEVELS[Settings.res].label + (RES_LEVELS[Settings.res].h ? ' ' + RES_LEVELS[Settings.res].h + 'p' : ''), () => { Settings.res = (Settings.res + 1) % RES_LEVELS.length; R.resize(); });
    toggle('FLASHLIGHT SHADOWS', () => (Settings.shadows ? 'ON' : 'OFF'), () => { Settings.shadows = !Settings.shadows; R.resize(); });
    toggle('VOLUMETRIC FOG', () => ['OFF', 'LOW', 'HIGH'][Settings.volumetric | 0], () => { Settings.volumetric = ((Settings.volumetric | 0) + 1) % 3; R.resize(); });
    toggle('INVERT LOOK Y', () => (Settings.invertY ? 'ON' : 'OFF'), () => { Settings.invertY = !Settings.invertY; });
    toggle('TOUCH CONTROLS', () => ['AUTO', 'ON', 'OFF'][Settings.touch] + (Touch.on ? ' (ON)' : ' (OFF)'), () => { Settings.touch = (Settings.touch + 1) % 3; Touch.apply(); });
    toggle('VOICE & MIC', () => (Settings.voice ? 'ON · SET UP' : 'OFF · SET UP'), () => { const me = () => go(settingsNodes(back, go)); go(voiceNodes(me)); });
    return [html('<div class="mtitle">SETTINGS</div>'), ...rows, html('<div style="height:10px"></div>'), btn('BACK', back)];
  }
  // VOICE & MIC: which microphone and which speakers, how loud you go out and when, how loud everyone else comes in, and
  // a mic test: your voice on a meter against the open-mic threshold (bright while it would be heard), and the chance
  // to hear yourself as the others will
  function voiceNodes(back) {
    const rows = [], slider = (...a) => rowSlider(rows, ...a), toggle = (...a) => rowToggle(rows, ...a);
    SFX.init();
    // (single player stops its sound while paused: wake it for the test, and put it back after)
    const held = SFX.held; if (held && SFX.ctx) SFX.ctx.resume();
    let hear = false;
    const note = html('<div class="mtext vnote" style="font-size:18px;margin:2px 0 6px">Press TEST MIC and talk: the bar lights up while the others would hear you.</div>');
    const say = (t) => { note.firstChild.textContent = t; };
    const leave = () => { Voice.monitor(false); if (!(G.online && Settings.voice)) Voice.disable(); if (held && SFX.held && SFX.ctx) SFX.ctx.suspend(); back(); };
    // (just the device's own name: "Microphone (HyperX Cloud II)" is HYPERX CLOUD II)
    const shortName = (d, i, what) => {
      let s = d.label ? d.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').replace(/^(?:headset |external |internal )?(?:microphone|mic|speakers?|headphones|earphones?)\s*\((.*)\)$/i, '$1') : what + ' ' + (i + 1);
      s = s.toUpperCase(); return s.length > 20 ? s.slice(0, 19) + '…' : s;
    };
    // a device picker: each press moves on to the next one there is, round to DEFAULT
    const picker = (label, kind, key, what, apply) => {
      const d = html(`<div class="setrow"><span>${label}</span><button></button></div>`), b = d.querySelector('button');
      const upd = async () => { const list = await Voice.devices(kind), i = list.findIndex((x) => x.deviceId === Settings[key]); b.textContent = i < 0 ? 'DEFAULT' : shortName(list[i], i, what); };
      b.onclick = async () => {
        const list = await Voice.devices(kind), i = list.findIndex((x) => x.deviceId === Settings[key]);
        if (!list.length) { say('Press TEST MIC first: the browser only lists your devices once the mic is allowed.'); return; }
        Settings[key] = i + 1 < list.length ? list[i + 1].deviceId : ''; Settings.save(); await apply(); upd();
      };
      upd(); rows.push(d); return upd;
    };
    toggle('VOICE CHAT (ONLINE)', () => (Settings.voice ? 'ON' : 'OFF'), () => { Settings.voice = !Settings.voice; if (Settings.voice && G.online) Voice.enable(); });
    const micPick = picker('MICROPHONE', 'audioinput', 'micId', 'MIC', () => Voice.restart());
    if (Voice.canPickOutput) picker('SPEAKERS / HEADPHONES', 'audiooutput', 'outId', 'OUTPUT', () => Voice.setOutput(Settings.outId));
    toggle('VOICE MODE', () => (Settings.ptt ? (Touch.on ? 'HOLD TALK' : 'HOLD V') : 'OPEN MIC'), () => { Settings.ptt = !Settings.ptt; Voice.setPTT(false); });
    slider('MIC VOLUME', 'micVol', 0, 2, 0.05, (v) => Math.round(v * 100) + '%', () => Voice.setMicVol(Settings.micVol));
    slider('OPEN MIC THRESHOLD', 'micGate', -60, -10, 1, (v) => v + ' dB');
    toggle('NOISE SUPPRESSION', () => (Settings.micClean ? 'ON' : 'OFF'), () => { Settings.micClean = !Settings.micClean; return Voice.restart(); });
    slider('VOICES VOLUME', 'voiceVol', 0, 2, 0.05, (v) => Math.round(v * 100) + '%');
    // the test: a meter of your voice, the threshold marked on it
    const meter = html(`<div class="setrow"><span>MIC TEST</span><div style="position:relative;width:200px;height:16px;border:1px solid var(--amber-dim);flex:none"><div class="vfill" style="position:absolute;left:0;top:0;bottom:0;width:0"></div><div class="vmark" style="position:absolute;top:-4px;bottom:-4px;width:2px;background:#e8dccb"></div></div></div>`);
    const fill = meter.querySelector('.vfill'), mark = meter.querySelector('.vmark'), pos = (db) => clamp((db + 60) / 60, 0, 1) * 100 + '%';
    rows.push(meter);
    const testBtn = btn('TEST MIC', async () => {
      say('Asking for the microphone...');
      const ok = await Voice.enable();
      say(ok ? 'Talk: the bar lights up while the others would hear you.' : 'No microphone: allow it for this site in the browser (the icon by the address), then try again.');
      if (ok) micPick();
    }, { small: true });
    const hearBtn = btn('HEAR MYSELF: OFF', () => { hear = !hear; Voice.monitor(hear); hearBtn.textContent = 'HEAR MYSELF: ' + (hear ? 'ON' : 'OFF'); if (hear) say('Use headphones, or you\'ll hear yourself echo.'); }, { small: true });
    let last = performance.now();
    const loop = (now) => {
      if (!document.contains(meter)) { Voice.monitor(false); return; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!G.online) Voice.tick(dt);
      const on = Voice.enabled;
      fill.style.width = on ? pos(Voice.db) : '0';
      fill.style.background = Voice.talking ? 'var(--amber-hi)' : 'var(--amber-dim)';
      mark.style.left = pos(Settings.micGate); mark.style.display = Settings.ptt ? 'none' : '';
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return [html('<div class="mtitle">VOICE & MIC</div>'), ...rows, note, testBtn, hearBtn, html('<div style="height:6px"></div>'), btn('BACK', leave)];
  }
  const HOWTO = `<div class="mtitle">HOW TO PLAY</div>
    <div class="mtext">You are contract salvage crew for <b>Mercy Salvage Co.</b> Each quota period you have <b>3 days</b> to sell enough scrap to meet the <b>profit quota</b>. Miss it and you are terminated.</div>
    <div class="mtext">Land at a site, find the facility entrance, and haul scrap back to the ship. The ship leaves at <b>midnight</b> — anyone not aboard is left behind. Sell from orbit at the terminal; the Company pays better as the deadline approaches.</div>
    <div class="mtext">Things live down there. Listen. Look up. Don't stare. Keep the hatch shut after dark.</div>
    <div class="keys"><span>WASD</span><span>Move</span><span>SHIFT</span><span>Sprint</span><span>C (HOLD)</span><span>Crouch (quiet)</span><span>SPACE</span><span>Jump</span><span>E</span><span>Interact / pick up</span><span>LMB</span><span>Use held item</span><span>RMB</span><span>Scan for scrap</span><span>F</span><span>Toggle flashlight</span><span>G</span><span>Drop item</span><span>1-5 / WHEEL</span><span>Switch slot</span><span>T / ENTER</span><span>Chat</span><span>V</span><span>Push-to-talk (if set)</span><span>ESC</span><span>Pause</span></div>`;
  // on a touch screen the controls are the ones on the glass
  const HOWTO_TOUCH = `<div class="mtitle">HOW TO PLAY</div>
    <div class="mtext">Land, find the facility, haul scrap back to the ship before <b>midnight</b>, sell it from orbit to make <b>quota</b>. Anyone not aboard when the ship leaves is left behind.</div>
    <div class="keys"><span>LEFT THUMB</span><span>Move (push to the rim to sprint)</span><span>DRAG RIGHT</span><span>Look around</span><span>USE</span><span>Use held item (hold for radio)</span><span>E</span><span>Interact, pick up, sit (lights up when you can)</span><span>JUMP / CROUCH</span><span>Crouch stays on till you tap it again</span><span>SCAN</span><span>Scan for scrap</span><span>LIGHT / DROP</span><span>Flashlight, drop held item</span><span>HOTBAR</span><span>Tap a slot to hold it</span><span>II / CHAT</span><span>Pause, chat</span></div>`;
  // installing as an app: the browser offers it (Android, desktop Chrome); on iPhone it's the Share menu
  let installEvt = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (G.mode === 'menu' && !$('menu').classList.contains('hidden')) menu.main(); });
  const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const menu = {
    init() {
      Input.onLock = () => { Menu.pause(false); $('clicktoplay').classList.add('hidden'); };
      MenuScene.enter();
      addEventListener('pointerdown', () => SFX.init());
      addEventListener('keydown', () => SFX.init(), { once: true });
      Input.onUnlock = () => {
        if (G.mode === 'menu' || HUD.termOpen || HUD.chatOpen || $('summary').classList.contains('hidden') === false) return;
        Menu.pause(true);
      };
      $('view').addEventListener('click', () => { if (G.mode !== 'menu' && !HUD.paused && !HUD.termOpen && $('summary').classList.contains('hidden')) Input.lock(); });
      $('clicktoplay').addEventListener('click', () => Input.lock());
      document.addEventListener('pointerlockchange', () => { if (Input.locked) { Menu.pause(false); $('clicktoplay').classList.add('hidden'); } });
      menu.show();
      // opened from an invite link (?join=ABCDE)
      const inv = /[?&#]join=([a-z0-9]{5})\b/i.exec(location.search + location.hash);
      if (inv) { if (Net.available) menu.join(inv[1].toUpperCase()); else menu.main('Online play needs an internet connection (PeerJS failed to load).'); }
    },
    show(msg) {
      $('menu').classList.remove('hidden'); HUD.show(false); $('pause').classList.add('hidden'); HUD.paused = false;
      SFX.held = false; if (SFX.ctx && SFX.ctx.state === 'suspended') SFX.ctx.resume();
      Input.unlock(); MenuScene.enter(); R.fx.static = 0; R.fx.fade = 1;
      menu.main(msg);
    },
    hide() { $('menu').classList.add('hidden'); },
    main(msg) {
      set(
        msg ? html(`<div class="err" style="margin-bottom:10px">${esc(msg)}</div>`) : null,
        btn('SINGLE PLAYER', menu.sp),
        btn('HOST ONLINE GAME', menu.host, { disabled: !Net.available }),
        btn('JOIN ONLINE GAME', menu.join, { disabled: !Net.available }),
        btn('SETTINGS', () => set(settingsNodes(() => menu.main(), set))),
        btn('HOW TO PLAY', () => set(html(Touch.on ? HOWTO_TOUCH : HOWTO), btn('BACK', () => menu.main()))),
        installEvt && !standalone() ? btn('INSTALL APP', () => { const e = installEvt; installEvt = null; e.prompt(); e.userChoice.finally(() => menu.main()); }) : null,
        iOS && !standalone() && location.protocol === 'https:' ? html('<div class="mtext" style="margin-top:8px;font-size:18px">To install: tap Share, then <b>Add to Home Screen</b>.</div>') : null,
        !Net.available ? html('<div class="mtext" style="margin-top:10px;font-size:18px">Online play needs an internet connection (PeerJS failed to load).</div>') : null,
      );
      $('menu').classList.remove('sub'); fitMenu();
    },
    sp() {
      const info = saveInfo('gs_save_sp');
      set(html('<div class="mtitle">SINGLE PLAYER · CREW PROFILE</div>'),
        nameField(), suitField(),
        info ? btn('CONTINUE  —  ' + info, () => { G.startHost({ online: false, name: Settings.name || 'You', cont: true, color: Settings.suit }); begin(); }) : null,
        btn('NEW RUN', () => { if (info) Store.del('gs_save_sp'); G.startHost({ online: false, name: Settings.name || 'You', cont: false, color: Settings.suit }); begin(); }),
        btn('BACK', () => menu.main()));
    },
    host() {
      const info = saveInfo('gs_save_mp');
      const status = html('<div class="err"></div>');
      const go = async (cont) => {
        status.firstChild.textContent = ''; status.firstChild.style.color = 'var(--amber)'; status.firstChild.textContent = 'CREATING LOBBY...';
        try {
          await Net.host();
          if (!cont) Store.del('gs_save_mp');
          G.startHost({ online: true, name: Settings.name || 'Host', cont, color: Settings.suit });
          begin();
          if (Settings.voice) Voice.enable().then((ok) => { if (!ok) HUD.toast('Microphone unavailable — listening only', 4); });
          HUD.notice('LOBBY ' + Net.code, '', false, 5);
          HUD.chat('', 'Lobby ' + Net.code, 'sys');
        } catch (e) { status.firstChild.style.color = ''; status.firstChild.textContent = e.message || String(e); Net.close(); }
      };
      set(html(`<div class="mtitle">HOST ONLINE GAME</div>`),
        nameField(), suitField(),
        info ? btn('CONTINUE  —  ' + info, () => go(true)) : null,
        btn('NEW RUN', () => go(false)),
        status,
        netTest(),
        btn('BACK', () => menu.main()));
    },
    join(prefill) {
      const d = html(`<div class="field"><label>LOBBY CODE</label><input type="text" id="mcode" maxlength="5" placeholder="ABCDE" style="text-transform:uppercase;font-size:40px;letter-spacing:10px"></div>`);
      const ci = d.querySelector('input'); ci.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doJoin(); });
      // pasting a whole invite link (or a message containing the code) just takes the code
      ci.addEventListener('paste', (e) => { const c = codeFrom((e.clipboardData || window.clipboardData).getData('text') || ''); if (c) { e.preventDefault(); ci.value = c; } });
      if (prefill) ci.value = prefill;
      const status = html('<div class="err"></div>');
      const doJoin = async () => {
        if (joining) return;
        const code = ci.value.trim().toUpperCase();
        if (code.length !== 5) { status.firstChild.textContent = 'Codes are 5 characters.'; return; }
        joining = true; status.firstChild.style.color = 'var(--amber)'; status.firstChild.textContent = 'CONNECTING...';
        try {
          await Net.join(code);
          status.firstChild.textContent = 'CONNECTED. BOARDING...';
          Net.send({ t: 'hello', name: Settings.name || 'Crew', v: PROTO, suit: Settings.suit });
          menu._joinStatus = status;
          setTimeout(() => { if (joining && G.mode === 'menu') { joining = false; status.firstChild.style.color = ''; status.firstChild.textContent = 'Host did not respond.'; Net.close(); } }, 12000);
        } catch (e) { joining = false; status.firstChild.style.color = ''; status.firstChild.textContent = e.message || String(e); }
        fitMenu();
      };
      set(html('<div class="mtitle">JOIN ONLINE GAME</div>'),
        nameField(), suitField(), d, btn(prefill ? 'JOIN CREW ' + prefill : 'JOIN', doJoin), status, netTest(), btn('BACK', () => { joining = false; Net.close(); menu.main(); }));
      setTimeout(() => (prefill ? !Settings.name && $('mname').focus() : ci.focus()), 50);
    },
    joined() {
      joining = false; begin();
      if (Settings.voice) Voice.enable().then((ok) => { if (!ok) HUD.toast('Microphone unavailable — listening only', 4); });
      HUD.notice('ABOARD', 'Welcome to the crew.', false, 3);
    },
    joinFailed(reason) {
      joining = false; Net.close();
      if (menu._joinStatus) { menu._joinStatus.firstChild.style.color = ''; menu._joinStatus.firstChild.textContent = reason; }
    },
    pause(show) {
      const p = $('pause');
      if (!show) { p.classList.add('hidden'); HUD.paused = false; SFX.held = false; if (SFX.ctx && SFX.ctx.state === 'suspended') SFX.ctx.resume(); return; }
      if (G.mode === 'menu') return;
      HUD.paused = true; p.classList.remove('hidden');
      // single player genuinely stops: no simulation, no sound
      if (!G.online && SFX.ctx) { SFX.held = true; SFX.ctx.suspend(); }
      const inner = document.createElement('div'); inner.className = 'inner';
      const fill = (nodes) => { inner.innerHTML = ''; nodes.flat().forEach((n) => n && inner.appendChild(n)); fitPause(); };
      const main = () => fill([
        html('<div class="mtitle">' + (G.online ? 'MENU' : 'PAUSED') + '</div>'),
        G.online ? inviteNodes() : null,
        btn('RESUME', () => Input.lock()),
        btn('SETTINGS', () => fill(settingsNodes(main, fill))),
        btn('HOW TO PLAY', () => fill([html(Touch.on ? HOWTO_TOUCH : HOWTO), btn('BACK', main)])),
        btn(G.isHost ? (G.online ? 'END SESSION' : 'QUIT') : 'LEAVE GAME', () => { if (G.isHost && G.mode === 'orbit') G.save(); G.quit(); }),
      ]);
      p.innerHTML = ''; p.appendChild(inner);
      main();
    },
  };
  return menu;
})();

// ------------------------------------------------------------------
let lastT = performance.now(), lastFrameAt = performance.now(), lastBgAt = 0;
// Browsers stop animation frames in hidden tabs. A host who alt-tabs must not freeze the world for the whole crew,
// so while the host's frames are stalled the simulation keeps stepping from a worker-driven timer (no rendering).
function backgroundTick() {
  const now = performance.now();
  if (now - lastFrameAt < 250 || !G.online || !G.isHost || G.mode === 'menu') { lastBgAt = now; return; }
  let left = Math.min(1, (now - lastBgAt) / 1000); lastBgAt = now;
  try { while (left > 0.0005) { const dt = Math.min(0.05, left); G.update(dt); left -= dt; } } catch (e) { console.error(e); }
  Input.endFrame();
}
function startBackgroundTicker() {
  const fallback = () => setInterval(backgroundTick, 50);
  try {
    const w = new Worker(URL.createObjectURL(new Blob(['setInterval(function () { postMessage(0); }, 50);'], { type: 'text/javascript' })));
    w.onmessage = backgroundTick;
    w.onerror = () => { w.terminate(); fallback(); };
  } catch (e) { fallback(); }
}
function frame(now) {
  requestAnimationFrame(frame);
  lastFrameAt = performance.now();
  const dt = Math.min(0.05, Math.max(0.0001, (now - lastT) / 1000)); lastT = now;
  try {
    if (G.mode === 'menu') MenuScene.update(dt);
    else if (!(HUD.paused && !G.online)) G.update(dt);
    R.render(now / 1000);
  } catch (e) { console.error(e); }
  // if the browser has not granted mouse capture (or it was lost), offer an explicit click target
  const needClick = G.mode !== 'menu' && !Input.locked && !HUD.termOpen && !HUD.paused && !HUD.chatOpen && $('summary').classList.contains('hidden');
  const ctp = $('clicktoplay');
  if (needClick === ctp.classList.contains('hidden')) ctp.classList.toggle('hidden', !needClick);
  Touch.update();
  Input.endFrame();
}

window.startGame = function () {
  Settings.load();
  MATS.warmAll();
  R.init($('view'));
  Input.init($('view'));
  Player.init();
  HUD.init();
  Touch.apply();
  G.init();
  Menu.init();
  $('loading').classList.add('hidden');
  window.__GS = { G, R, SFX, HUD, Player, Net, Menu };
  requestAnimationFrame(frame);
  startBackgroundTicker();
};
