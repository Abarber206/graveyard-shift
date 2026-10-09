'use strict';
// Touch controls for phones and tablets. A thumbstick under the left thumb (it appears wherever you put it down; push it
// to the rim to sprint), drag anywhere on the right to look, and the buttons under the right thumb. They drive the same
// Input the keyboard and mouse do, so the game doesn't know the difference. There's no mouse capture on a touch screen:
// "locked" just means you're playing (not in a menu, the terminal or chat). Settings.touch: 0 auto, 1 on, 2 off.
const Touch = (() => {
  const R0 = 46, LOOK = 1.7;   // stick radius (px); look speed against the mouse's
  const T = { on: false };
  let root, pad, base, knob, crouchOn = false, shown = false;
  const stick = { id: null, x0: 0, y0: 0 }, look = { id: null, x: 0, y: 0 };
  // the buttons: what each does, its label, where it sits (right, bottom, size in px from the bottom-right corner,
  // all scaled by SC); jump is the big one under the resting thumb, use just above it
  const SC = 0.8;
  const BTNS = [
    { k: 'jump', label: 'JUMP', at: [26, 40, 88] },
    { k: 'e', label: 'E', at: [128, 24, 68], box: true },
    { k: 'use', label: 'USE', at: [34, 146, 62] },
    { k: 'crouch', label: 'CROUCH', at: [116, 112, 58] },
    { k: 'scan', label: 'SCAN', at: [200, 54, 54] },
    { k: 'light', label: 'LIGHT', at: [38, 226, 50] },
    { k: 'drop', label: 'DROP', at: [108, 190, 50] },
  ];
  const TOP = [
    { k: 'pause', label: 'II', side: 'left' },
    { k: 'chat', label: 'CHAT', side: 'left' },
  ];
  const el = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
  function press(k) {
    const I = Input;
    switch (k) {
      case 'use': I.lmb = true; I.lmbP = true; break;
      case 'scan': I.rmb = true; I.rmbP = true; break;
      case 'e': I.pressed.add('KeyE'); I.keys.add('KeyE'); break;
      case 'jump': I.pressed.add('Space'); crouch(false); break;
      case 'crouch': crouch(!crouchOn); break;
      case 'light': I.pressed.add('KeyF'); break;
      case 'drop': I.pressed.add('KeyG'); break;
      case 'talk': I.keys.add('KeyV'); break;
      case 'pause': Input.unlock(); break;
      case 'chat': HUD.openChat(); break;
    }
  }
  function release(k) {
    const I = Input;
    if (k === 'use') I.lmb = false;
    else if (k === 'scan') I.rmb = false;
    else if (k === 'e') I.keys.delete('KeyE');
    else if (k === 'talk') I.keys.delete('KeyV');
  }
  function crouch(on) { crouchOn = on; if (on) Input.keys.add('KeyC'); else Input.keys.delete('KeyC'); root && root.querySelector('[data-k=crouch]').classList.toggle('on', on); }
  // a button: held while the finger is on it (even if it slides off), let go when it lifts
  function button(b, cls) {
    const d = el('tbtn ' + cls + (b.box ? ' box' : ''), `<span>${b.label}</span>`); d.dataset.k = b.k;
    d.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { d.setPointerCapture(e.pointerId); } catch (_) { /* (not a live pointer) */ } d.classList.add('down'); press(b.k); if (navigator.vibrate) navigator.vibrate(8); });
    const up = (e) => { if (!d.classList.contains('down')) return; d.classList.remove('down'); release(b.k); };
    d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up); d.addEventListener('lostpointercapture', up);
    return d;
  }
  function setStick(dx, dy) {
    const len = Math.hypot(dx, dy), k = len > R0 ? R0 / len : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const m = Math.min(1, len / R0), a = len > 1 ? 1 / len : 0;
    Input.analog.x = dx * a * m; Input.analog.y = -dy * a * m;
    // pushed out past the rim, forward: sprint
    const sprint = len > R0 * 1.25 && -dy / Math.max(1, len) > 0.6;
    if (sprint) Input.keys.add('ShiftLeft'); else Input.keys.delete('ShiftLeft');
    base.classList.toggle('sprint', sprint);
  }
  function parkStick() { base.style.left = ''; base.style.top = ''; base.classList.remove('live', 'sprint'); knob.style.transform = ''; Input.analog.x = Input.analog.y = 0; Input.keys.delete('ShiftLeft'); }
  // (re)read the setting: built the first time it's wanted, hidden when it's not
  T.apply = () => {
    T.on = Settings.touch === 1 || (Settings.touch !== 2 && TOUCH_DEVICE);
    document.body.classList.toggle('touch', T.on);
    $('clicktoplay').firstChild.textContent = T.on ? 'TAP TO CONTINUE' : 'CLICK TO CONTINUE';
    if (root) { root.style.display = T.on ? '' : 'none'; if (!T.on) { shown = false; root.classList.remove('on'); parkStick(); } }
    if (T.on && !root) build();
  };
  function build() {
    root = el('', ''); root.id = 'touch'; document.body.appendChild(root);
    pad = el('tpad'); root.appendChild(pad);
    base = el('tstick', '<div class="tknob"></div>'); knob = base.firstChild; root.appendChild(base);
    for (const b of BTNS) { const d = button(b, 'act'); const [r, bt, s] = b.at.map((v) => Math.round(v * SC)); Object.assign(d.style, { right: `calc(${r}px + env(safe-area-inset-right))`, bottom: bt + 'px', width: s + 'px', height: s + 'px', fontSize: Math.round(s * (b.box ? 0.42 : 0.24)) + 'px' }); root.appendChild(d); }
    const bar = el('ttop'); for (const b of TOP) bar.appendChild(button(b, 'small')); root.appendChild(bar);
    const talk = button({ k: 'talk', label: 'TALK' }, 'act talk'); root.appendChild(talk);
    // the left of the screen moves you, the rest looks around
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.clientX < innerWidth * 0.42 && stick.id == null) {
        stick.id = e.pointerId; stick.x0 = e.clientX; stick.y0 = e.clientY;
        base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; base.classList.add('live');
        Input.pressed.add('KeyW');   // (gets you up out of a seat)
        setStick(0, 0);
      } else if (look.id == null) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
      try { pad.setPointerCapture(e.pointerId); } catch (_) { /* (not a live pointer) */ }
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === stick.id) setStick(e.clientX - stick.x0, e.clientY - stick.y0);
      else if (e.pointerId === look.id) { Input.mdx += (e.clientX - look.x) * LOOK; Input.mdy += (e.clientY - look.y) * LOOK; look.x = e.clientX; look.y = e.clientY; }
    });
    const end = (e) => { if (e.pointerId === stick.id) { stick.id = null; parkStick(); } if (e.pointerId === look.id) look.id = null; };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    // the hotbar: tap a slot to hold what's in it
    $('slots').addEventListener('pointerdown', (e) => { if (!T.on) return; const s = e.target.closest('.slot'); if (!s) return; e.preventDefault(); const i = [...$('slots').children].indexOf(s); if (i >= 0) Input.pressed.add('Digit' + (i + 1)); });
  }
  // shown only while you're actually playing; the dead get just the button that switches who they watch
  T.update = () => {
    if (!T.on) return;
    const me = G.me && G.me();
    const play = G.mode !== 'menu' && Input.locked && !HUD.blocking && !G.sendoff && !!me;
    if (play !== shown) { shown = play; root.classList.toggle('on', play); if (!play) { stick.id = look.id = null; parkStick(); for (const k of ['use', 'scan', 'e', 'talk']) release(k); root.querySelectorAll('.down').forEach((d) => d.classList.remove('down')); } }
    if (!play) return;
    root.classList.toggle('dead', !me.alive);
    root.querySelector('[data-k=use] span').textContent = me.alive ? 'USE' : 'NEXT';
    root.querySelector('[data-k=e]').classList.toggle('ready', !!Player.target || Rover.driving);
    root.querySelector('.talk').classList.toggle('hidden', !(G.online && Settings.voice && Settings.ptt));
  };
  // full screen and on its side, if the browser lets a page ask (it has to be in answer to a tap)
  T.fullscreen = () => {
    if (!T.on || document.fullscreenElement || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) return;
    const d = document.documentElement, rq = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!rq) return;
    try { const p = rq.call(d, { navigationUI: 'hide' }); if (p && p.then) p.then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {}); } catch (e) { /* not allowed here */ }
  };
  return T;
})();
