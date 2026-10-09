'use strict';
// HUD, terminal, chat, scan labels, motion tracker, summaries.
const HUD = (() => {
  const icons = {};
  let chatOpen = false, termOpen = false, paused = false, overlay = false;
  let noticeT = 0, toastT = 0, lastSlots = '', labels = [], bubbles = [], promptKey = '', trackerSweep = 0, trackerBeepT = 0, pings = 0;
  let termHistory = [], termHistIdx = -1, lastCmd = '', tearTimer = null, staminaActive = 0, lastW = '';
  const proj = new THREE.Vector3();
  const QUICK = ['store', 'sites', 'sell', 'quota', 'scan', 'bestiary', 'crew', 'help'];

  function buildIcons() {
    for (const k of Object.keys(ITEMS)) { try { icons[k] = R.snapshot(ItemMeshes.build(k), 80); } catch (e) { icons[k] = null; } }
  }
  function slotHTML(me) {
    const it = (id) => (id != null ? G.items.get(id) : null);
    return me.slots.map((id, i) => {
      const x = it(id), d = x && ITEMS[x.type];
      let inner = `<span class="num">${i + 1}</span>`;
      if (x) {
        inner += icons[x.type] ? `<img src="${icons[x.type]}" width="52" height="52" style="image-rendering:pixelated">` : '';
        inner += `<span class="nm">${esc(d.name)}</span>`;
        if (d.battery) inner += `<div class="bat"><div style="width:${Math.round(x.battery * 100)}%"></div></div>`;
        if (x.on) inner += '<span class="on"></span>';
      }
      return `<div class="slot${i === me.sel ? ' sel' : ''}">${inner}</div>`;
    }).join('');
  }
  const seg = (s) => (s.cmd ? `<span class="cmd ${s.c || ''}" data-cmd="${esc(s.cmd)}">${esc(s.t)}</span>` : `<span class="${s.c || ''}">${esc(s.t)}</span>`);
  function termLine(l) {
    if (typeof l === 'string') return l.trim() ? esc(l) : '&nbsp;';
    if (l.segs) return l.segs.map(seg).join('');
    return seg(l);
  }
  function show(lines, echo) {
    const out = $('term-out');
    out.innerHTML = (echo ? `<div class="echo">&gt; ${esc(echo.toUpperCase())}</div>` : '') + lines.map((l) => `<div>${termLine(l)}</div>`).join('');
    [...out.children].forEach((k, i) => { k.classList.add('rv'); k.style.animationDelay = Math.min(i * 22, 500) + 'ms'; });
    out.scrollTop = 0;
    setTimeout(updateMore, 60); setTimeout(updateMore, 700);
    for (const b of $('term-bar').children) b.classList.toggle('on', echo && echo.split(' ')[0] === b.dataset.cmd);
  }
  function updateMore() { const o = $('term-out'); $('term-more').classList.toggle('on', o.scrollHeight - o.scrollTop - o.clientHeight > 8); }
  function home() {
    show([
      { t: 'MERCY OS v2.31 ................... BOOT', c: 'dim' },
      { t: 'MEMORY CHECK ..................... OK', c: 'dim' },
      { t: 'COMPANY UPLINK ................... SECURE', c: 'dim' },
      ' ',
      { t: 'MERCY SALVAGE CO. — FIELD TERMINAL', c: 'hi' },
      { t: '"Your safety is our second priority."', c: 'dim' },
      ' ',
      'Pick a command from the bar above, or type one below.',
      { segs: [{ t: 'New here? Try ' }, { t: '[ STORE ]', cmd: 'store', c: 'btn' }, { t: ' for gear, then pull the lever in the cockpit to land.' }] },
    ]);
  }
  function runTerm(cmd) {
    cmd = cmd.trim(); if (!cmd) return;
    termHistory.unshift(cmd); termHistIdx = -1;
    const c = cmd.toLowerCase();
    if (c === 'clear' || c === 'cls' || c === 'home') { home(); return; }
    if (c === 'exit' || c === 'quit' || c === 'close') { HUD.closeTerminal(true); return; }
    lastCmd = c;
    SFX.play('beep', null, { f: 1200 });
    G.request({ a: 'term', cmd: c });
  }
  function tear() {
    if (!termOpen) return;
    const s = $('term-screen');
    s.style.setProperty('--tear', (10 + Math.random() * 75) + '%');
    s.classList.add('tear');
    setTimeout(() => s.classList.remove('tear'), 90 + Math.random() * 90);
    tearTimer = setTimeout(tear, 2200 + Math.random() * 4200);
  }
  return {
    get blocking() { return chatOpen || termOpen || paused || overlay || !Input.locked; },
    get termOpen() { return termOpen; },
    get chatOpen() { return chatOpen; },
    set paused(v) { paused = v; },
    get paused() { return paused; },
    set overlay(v) { overlay = v; },
    init() {
      buildIcons();
      const ci = $('chatinput');
      ci.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { const t = ci.value.trim(); if (t) G.request({ a: 'chat', text: t.slice(0, 120), radio: G.holdingWalkie() }); HUD.closeChat(); }
        if (e.key === 'Escape') HUD.closeChat();
      });
      // (a phone's keyboard has no Escape: putting it away closes the chat)
      ci.addEventListener('blur', () => { if (Touch.on && chatOpen) setTimeout(() => HUD.closeChat(), 0); });
      const ti = $('term-input');
      ti.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { runTerm(ti.value); ti.value = ''; }
        else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); HUD.closeTerminal(true); }
        else if (e.key === 'ArrowUp') { termHistIdx = Math.min(termHistory.length - 1, termHistIdx + 1); if (termHistory[termHistIdx]) ti.value = termHistory[termHistIdx]; e.preventDefault(); }
        else if (e.key === 'ArrowDown') { termHistIdx = Math.max(-1, termHistIdx - 1); ti.value = termHistIdx >= 0 ? termHistory[termHistIdx] : ''; e.preventDefault(); }
        else if (e.key === 'PageDown' || e.key === 'PageUp') { $('term-out').scrollTop += (e.key === 'PageDown' ? 1 : -1) * 200; updateMore(); e.preventDefault(); }
        else SFX.play('key');
      });
      $('term-out').addEventListener('click', (e) => { const c = e.target.closest('.cmd'); if (c) runTerm(c.dataset.cmd); if (!Touch.on) ti.focus(); });
      $('term-out').addEventListener('scroll', updateMore);
      $('term-exit').addEventListener('click', () => HUD.closeTerminal(true));
      $('terminal').addEventListener('mousedown', (e) => { if (e.target.id === 'terminal') HUD.closeTerminal(true); });
      const bar = $('term-bar');
      for (const c of QUICK) { const b = document.createElement('button'); b.textContent = c.toUpperCase(); b.dataset.cmd = c; b.onclick = () => { runTerm(c); if (!Touch.on) ti.focus(); }; bar.appendChild(b); }
    },
    show(v) { $('hud').classList.toggle('hidden', !v); },
    vitals(hp, st, exh, w) {
      const s = $('stamina');
      $('stfill').style.width = Math.round(st * 100) + '%';
      s.classList.toggle('exhausted', exh);
      const now = performance.now();
      if (st < 0.995 || exh) staminaActive = now;
      s.classList.toggle('show', now - staminaActive < 1400);
      const wt = w > 0.5 ? Math.round(w) + ' KG' : '';
      if (wt !== lastW) { lastW = wt; $('weight').textContent = wt; }
    },
    clock(text, sub, warn) {
      $('clocktime').textContent = text; $('clocksub').textContent = sub || '';
      $('clock').classList.toggle('warn', !!warn);
    },
    lobby(code, n) { $('lobbycode').innerHTML = code ? `LOBBY <span style="color:var(--amber-hi)">${esc(code)}</span><br><span style="font-size:17px;opacity:.7">${n} CREW</span>` : ''; },
    slots(me) {
      const key = me.slots.join(',') + '|' + me.sel + '|' + me.slots.map((id) => { const x = id != null && G.items.get(id); return x ? (x.on ? 1 : 0) + ':' + Math.round(x.battery * 20) : ''; }).join(',');
      if (key !== lastSlots) { lastSlots = key; $('slots').innerHTML = slotHTML(me); }
      const id = me.slots[me.sel], x = id != null && G.items.get(id);
      $('iteminfo').innerHTML = x ? esc(ITEMS[x.type].name) + (ITEMS[x.type].kind === 'scrap' ? ` <span style="color:var(--amber-hi)">$${x.value}</span>` : '') + (ITEMS[x.type].twoHanded ? ' <span style="opacity:.6">[TWO-HANDED]</span>' : '') : '';
    },
    prompt(t) {
      let html = '';
      if (t) {
        html = `<span class="key">E</span>${esc(t.label)}`;
        if (t.value) html += ` <span class="val">$${t.value}</span>`;
        if (t.warn) html += `<br><span class="warn" style="font-size:20px">${esc(t.warn)}</span>`;
      }
      if (html !== promptKey) { promptKey = html; $('prompt').innerHTML = html; }
    },
    notice(title, sub = '', danger = false, dur = 4) {
      $('noticetitle').textContent = title; $('noticesub').textContent = sub;
      const n = $('notice'); n.classList.add('show'); n.classList.toggle('danger', danger);
      noticeT = dur;
    },
    toast(t, dur = 2) { const e = $('toast'); e.textContent = t; e.classList.add('show'); toastT = dur; },
    chat(name, text, cls = '') {
      const log = $('chatlog');
      const d = document.createElement('div'); d.className = 'msg ' + cls;
      d.innerHTML = name ? `<span style="opacity:.7">${esc(name)}:</span> ${esc(text)}` : esc(text);
      log.appendChild(d);
      while (log.children.length > 8) log.removeChild(log.firstChild);
      setTimeout(() => d.classList.add('fade'), 9000);
    },
    openChat() { if (termOpen) return; chatOpen = true; $('chat').classList.add('open'); const ci = $('chatinput'); ci.value = ''; setTimeout(() => ci.focus(), 0); },
    closeChat() { chatOpen = false; $('chat').classList.remove('open'); $('chatinput').blur(); },
    termStats(run) { const el = $('term-stats'); if (el && run) el.textContent = `CREDITS $${run.credits}  ·  QUOTA $${run.sold}/$${run.quota}  ·  ${run.daysLeft > 0 ? run.daysLeft + 'D LEFT' : 'DEADLINE'}`; },
    openTerminal() {
      termOpen = true; $('terminal').classList.remove('hidden');
      Input.unlock();
      if (G.run) HUD.termStats(G.run);
      const s = $('term-screen'); s.classList.remove('boot'); void s.offsetWidth; s.classList.add('boot');
      home();
      // (on a touch screen the keyboard only comes up when you tap the command line; the buttons cover most things)
      if (!Touch.on) setTimeout(() => $('term-input').focus(), 0);
      SFX.play('beep', null, { f: 660 }); SFX.play('static', null, { dur: 0.25, vol: 0.5 });
      G.ship.drawTerminal(['MERCY OS  v2.31', '----------------', 'USER SESSION', 'ACTIVE', '> _']);
      clearTimeout(tearTimer); tearTimer = setTimeout(tear, 1500);
    },
    closeTerminal(relock) {
      if (!termOpen) return;
      termOpen = false; $('terminal').classList.add('hidden'); $('term-input').blur();
      clearTimeout(tearTimer);
      G.ship.drawTerminal();
      if (relock) Input.lock();
    },
    termPrint(lines) { if (termOpen) show(lines, lastCmd); },
    // Words hanging in the air: what someone says out loud bobs over their head; a radio call bobs up over every other
    // walkie-talkie, wherever it is. Each letter bounces in turn. anchor: a function giving the spot (ship/world
    // coordinates, as positions are kept) or 'hand' for the set in your own hand; only seen from close enough.
    bubble(anchor, text, kind, zone) {
      const el = document.createElement('div'); el.className = 'bubble ' + kind;
      const letters = [...String(text).slice(0, 80)].map((ch, i) => `<span style="animation-delay:${(i * 0.045).toFixed(3)}s">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
      el.innerHTML = `<b>${kind === 'radio' ? '<i>))) </i>' : ''}${letters}</b>`;
      el.style.opacity = 0;
      $('bubbles').appendChild(el);
      bubbles.push({ el, anchor, zone, kind, t: 0, life: 4.5 + Math.min(6, text.length * 0.06) });
      if (bubbles.length > 14) bubbles.shift().el.remove();
    },
    // scan markers: a diamond on the find, a stem and a tag; each stays hidden until the scan wave reaches it
    scan(list, speed) {
      const host = $('scanlabels');
      for (const l of labels) l.el.remove();
      pings = 0;
      labels = list.map((o) => {
        const el = document.createElement('div');
        el.className = 'slabel ' + (o.kind || 'item');
        const val = o.value ? `<span class="v">$${o.value}</span>` : '';
        const sub = o.sub ? `<span class="s">${esc(o.sub)}</span>` : o.d != null ? `<span class="s">${Math.round(o.d)}m</span>` : '';
        el.innerHTML = `<div class="mk"></div><div class="stem"></div><div class="tag"><b>${esc(o.text)}</b>${val}${sub}</div>`;
        el.style.opacity = 0;
        host.appendChild(el);
        return { el, x: o.x, y: o.y, z: o.z, t: 5.5, delay: speed ? (o.d || 0) / speed : 0, kind: o.kind || 'item', popped: false, track: o.track || null };
      });
    },
    tracker(on, blips) {
      const c = $('tracker'); c.classList.toggle('on', on);
      if (!on) return;
      const g = c.getContext('2d'), W = 180, cx = 90, cy = 150;
      g.clearRect(0, 0, W, W);
      g.fillStyle = 'rgba(6,18,8,.82)'; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 140, -Math.PI * 0.82, -Math.PI * 0.18); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(120,255,140,.35)'; g.lineWidth = 1;
      for (const rr of [35, 70, 105, 140]) { g.beginPath(); g.arc(cx, cy, rr, -Math.PI * 0.82, -Math.PI * 0.18); g.stroke(); }
      trackerSweep = (trackerSweep + 1 / 60 / 1.4) % 1;
      const sr = trackerSweep * 140;
      g.strokeStyle = 'rgba(160,255,170,.8)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, sr, -Math.PI * 0.82, -Math.PI * 0.18); g.stroke();
      let nearest = 99;
      for (const b of blips) {
        const r = (b.d / 25) * 140; if (r > 140) continue;
        nearest = Math.min(nearest, b.d);
        const px = cx + Math.sin(b.a) * r, py = cy - Math.cos(b.a) * r;
        const age = Math.abs(sr - r) < 18 ? 1 : 0.45;
        g.fillStyle = `rgba(190,255,190,${age})`; g.beginPath(); g.arc(px, py, b.big ? 6 : 4, 0, TAU); g.fill();
      }
      g.fillStyle = '#9dff9a'; g.font = '16px "VT323", monospace'; g.fillText(nearest < 99 ? nearest.toFixed(1) + 'm' : '--', 8, 172);
      trackerBeepT -= 1 / 60;
      if (trackerBeepT <= 0) { trackerBeepT = nearest < 99 ? clamp(nearest / 25, 0.18, 1.2) : 1.4; SFX.play('beep', null, { f: nearest < 99 ? 1400 + (25 - nearest) * 30 : 900, vol: 0.5 }); }
    },
    spectate(p) {
      const e = $('spectate');
      e.classList.add('on');
      e.innerHTML = p ? `SPECTATING <span style="color:var(--amber-hi)">${esc(p.name.toUpperCase())}</span><br><span style="font-size:18px;opacity:.6">[CLICK] NEXT CREWMATE</span>` : '<span style="color:var(--red)">ALL CREW LOST</span>';
    },
    hideSpectate() { $('spectate').classList.remove('on'); },
    // a cinematic: bars close in top and bottom, the play HUD fades out of the way
    letterbox(on) { $('bars').classList.toggle('on', on); $('hud').classList.toggle('cine', on); },
    struggle(on) { $('struggle').classList.toggle('on', on); $('struggle').innerHTML = on ? 'SOMETHING IS ON YOUR HEAD<br><span style="font-size:22px">MASH [E] TO TEAR IT OFF</span>' : ''; },
    voice(t) { $('voiceind').textContent = t || ''; },
    summary(html, btnLabel, onClose) {
      const s = $('summary');
      s.innerHTML = `<div class="panel">${html}<button class="btn" id="sumclose">${esc(btnLabel || 'CONTINUE')}</button></div>`;
      s.classList.remove('hidden'); overlay = true;
      Input.unlock();
      $('sumclose').onclick = () => { s.classList.add('hidden'); overlay = false; if (onClose) onClose(); else Input.lock(); };
    },
    hideSummary() { $('summary').classList.add('hidden'); overlay = false; },
    update(dt) {
      if (noticeT > 0) { noticeT -= dt; if (noticeT <= 0) $('notice').classList.remove('show'); }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
      const cam = R.camera, W = innerWidth, H = innerHeight;
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i];
        if (l.delay > 0) { l.delay -= dt; if (l.delay > 0) continue; }
        if (!l.popped) {
          l.popped = true; l.el.classList.add('pop');
          // each return is a low knock; a creature's is the deepest of all
          if (pings++ < 8) SFX.play('ping', null, { f: { rich: 330, sig: 190, big: 220, player: 280, mon: 105, dead: 150 }[l.kind] || 250, vol: l.kind === 'sig' || l.kind === 'dead' ? 0.3 : l.kind === 'mon' ? 0.6 : 0.4 });
        }
        l.t -= dt;
        if (l.t <= 0) { l.el.remove(); labels.splice(i, 1); continue; }
        // a creature's mark follows it
        if (l.track) { const p = l.track(); l.x = p.x; l.y = p.y; l.z = p.z; }
        // marks on things aboard ride along with the ship in flight
        G.carryIfAboard(proj.set(l.x, l.y, l.z)).project(cam);
        const behind = proj.z > 1;
        l.el.style.left = ((proj.x * 0.5 + 0.5) * W) + 'px';
        l.el.style.top = ((-proj.y * 0.5 + 0.5) * H) + 'px';
        l.el.style.opacity = behind ? 0 : Math.min(1, l.t);
      }
      // words in the air: they follow what's speaking, shrink with distance, and fade out past earshot
      const me = G.me(), eye = G.simCam.position;
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]; b.t += dt;
        if (b.t > b.life) { b.el.remove(); bubbles.splice(i, 1); continue; }
        const fade = Math.min(1, b.t / 0.15) * Math.min(1, (b.life - b.t) / 0.6);
        if (b.anchor === 'hand') { b.el.style.left = (W * 0.96) + 'px'; b.el.style.top = (H * 0.62) + 'px'; b.el.style.transform = 'translate(-100%,-100%)'; b.el.style.opacity = fade; continue; }
        const p = b.anchor(); if (!p) { b.el.style.opacity = 0; continue; }
        const range = b.kind === 'radio' ? 18 : 22, d = p.distanceTo(eye);
        const zone = me ? G.zoneOf(me) : 'out';
        let seen = d < range && (!b.zone || b.zone === zone);
        if (seen && zone === 'in' && G.fac && d > 3) seen = G.fac.los(eye.x, eye.z, p.x, p.z);
        G.carryIfAboard(proj.copy(p)).project(cam);
        if (!seen || proj.z > 1) { b.el.style.opacity = 0; continue; }
        b.el.style.left = ((proj.x * 0.5 + 0.5) * W) + 'px';
        b.el.style.top = ((-proj.y * 0.5 + 0.5) * H) + 'px';
        b.el.style.transform = `translate(-50%,-100%) scale(${clamp(5 / (d + 2), 0.5, 1.25).toFixed(3)})`;
        b.el.style.opacity = fade * (1 - sstep(range * 0.7, range, d));
      }
    },
    clearLabels() { for (const l of labels) l.el.remove(); labels = []; },
    reset() {
      HUD.clearLabels(); $('chatlog').innerHTML = ''; for (const b of bubbles) b.el.remove(); bubbles = []; $('term-out').innerHTML = ''; lastSlots = ''; promptKey = '';
      HUD.closeChat(); termOpen = false; clearTimeout(tearTimer); $('terminal').classList.add('hidden'); HUD.hideSummary(); HUD.hideSpectate(); HUD.letterbox(false); HUD.struggle(false);
      $('notice').classList.remove('show'); $('tracker').classList.remove('on');
    },
  };
})();
