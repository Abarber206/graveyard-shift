'use strict';
// Proximity voice chat: WebRTC audio calls between every pair of players, spatialised with WebAudio.
// Walkie-talkies carry voice across the whole map with a radio filter.
// Your own voice goes out through a little chain: the microphone you picked, its volume, then a gate that's open while
// you talk (open mic: while you're louder than the threshold; push-to-talk: while V is held). The calls carry what comes
// out of the gate, so changing microphone, or turning the mic on halfway through a game, needs no new calls.
const Voice = (() => {
  let raw = null, src = null, chain = null, level = 0, enabled = false, pttDown = false, open = false, hold = 0, held = 0, floorDb = -70;
  const peers = new Map(); // peerId -> entry
  // (when each crewmate was first seen without a call, and how many tries in a row haven't come to anything)
  const seen = new Map(), fails = new Map();
  let wantT = 0;
  const dbOf = (x) => 20 * Math.log10(Math.max(x, 1e-5));
  function makeChain() {
    if (chain || !SFX.ctx) return chain;
    const ctx = SFX.ctx, c = { gain: ctx.createGain(), gate: ctx.createGain(), send: ctx.createGain(), an: ctx.createAnalyser(), dest: ctx.createMediaStreamDestination(), mon: ctx.createGain() };
    c.an.fftSize = 512; c.buf = new Float32Array(c.an.fftSize); c.fbuf = new Float32Array(c.an.frequencyBinCount); c.gain.gain.value = Settings.micVol; c.gate.gain.value = 0; c.send.gain.value = 0; c.mon.gain.value = 0;
    // (the mic test can play you back to yourself: straight to the speakers, past the game's own effects; and with voice
    // chat off nothing goes out over the calls, though the meter and the playback still work)
    c.gain.connect(c.an); c.gain.connect(c.gate); c.gate.connect(c.send); c.send.connect(c.dest); c.gate.connect(c.mon); c.mon.connect(ctx.destination);
    return (chain = c);
  }
  function outStream() { const c = makeChain(); return c ? c.dest.stream : null; }
  // (each call has an entry of its own: a newer call to the same crewmate replaces the old one outright, and nothing the
  // old one does afterwards, closing or failing, touches the new)
  function setup(call, out) {
    const old = peers.get(call.peer); if (old) drop(call.peer, true);
    const e = { peerId: call.peer, call, out, t0: performance.now() };
    peers.set(call.peer, e);
    call.on('stream', (remote) => {
      if (peers.get(call.peer) !== e || e.src || !SFX.ctx) return;
      const ctx = SFX.ctx;
      e.el = new Audio(); e.el.srcObject = remote; e.el.muted = true; e.el.play().catch(() => {});
      e.src = ctx.createMediaStreamSource(remote);
      e.prox = ctx.createGain(); e.prox.gain.value = 0;
      // (the air, and whatever's in the way, takes the edge off a voice: walls and shut doors, the hull, distance, and
      // the speaker's own back turned to you)
      e.lp = ctx.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.frequency.value = 20000; e.lp.Q.value = 0.6;
      // (falling away the way a voice really does, half as loud with each doubling of the distance; and carrying
      // forward, quieter behind the speaker than in front)
      e.panner = ctx.createPanner(); e.panner.panningModel = 'HRTF'; e.panner.distanceModel = 'inverse'; e.panner.refDistance = 1.5; e.panner.rolloffFactor = 1; e.panner.maxDistance = 10000;
      e.panner.coneInnerAngle = 100; e.panner.coneOuterAngle = 300; e.panner.coneOuterGain = 0.5;
      e.src.connect(e.prox); e.prox.connect(e.lp); e.lp.connect(e.panner); e.panner.connect(SFX.bus);
      // (and the room answering: the same however far off they are, so the further away a voice is the more of it is echo)
      e.rv = ctx.createGain(); e.rv.gain.value = 0; e.lp.connect(e.rv); e.rv.connect(SFX.revIn);
      // over the radio: a narrow, boxy band of the voice, driven hard into the little speaker, with the hiss of the
      // channel under it while they're keyed up
      e.radio = ctx.createGain(); e.radio.gain.value = 0;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 480; hp.Q.value = 0.7;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900; lp.Q.value = 1.2;
      const box = ctx.createBiquadFilter(); box.type = 'peaking'; box.frequency.value = 1500; box.Q.value = 1.4; box.gain.value = 6;
      const ws = ctx.createWaveShaper(); const c = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; c[i] = Math.tanh(x * 5) * 0.8; } ws.curve = c;
      e.src.connect(hp); hp.connect(lp); lp.connect(box); box.connect(ws); ws.connect(e.radio); e.radio.connect(SFX.bus);
      e.hiss = ctx.createGain(); e.hiss.gain.value = 0;
      const hs = ctx.createBufferSource(); hs.buffer = hissBuf(); hs.loop = true;
      const hbp = ctx.createBiquadFilter(); hbp.type = 'bandpass'; hbp.frequency.value = 2400; hbp.Q.value = 0.6;
      hs.connect(hbp); hbp.connect(e.hiss); e.hiss.connect(SFX.bus); hs.start(); e.hissSrc = hs;
      e.flat = ctx.createGain(); e.flat.gain.value = 0; e.src.connect(e.flat); e.flat.connect(SFX.bus);
    });
    const gone = () => { if (peers.get(call.peer) === e) drop(call.peer); };
    call.on('close', gone); call.on('error', gone);
  }
  // (a second of white noise for the radio hiss, made once)
  let hissB = null;
  function hissBuf() {
    if (hissB) return hissB;
    const ctx = SFX.ctx; hissB = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = hissB.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return hissB;
  }
  // (failed: it never got going, or went dead: counted, so the next try waits a little longer)
  function drop(peerId, replaced) {
    const e = peers.get(peerId); if (!e) return;
    peers.delete(peerId);
    if (!replaced && !e.ok) fails.set(peerId, (fails.get(peerId) || 0) + 1);
    seen.set(peerId, performance.now());
    for (const k of ['src', 'prox', 'lp', 'panner', 'rv', 'radio', 'hiss', 'flat']) try { e[k] && e[k].disconnect(); } catch (x) { /* ignore */ }
    try { e.hissSrc && e.hissSrc.stop(); } catch (x) { /* ignore */ }
    try { e.call && e.call.close(); } catch (x) { /* ignore */ }
    if (e.el) { e.el.srcObject = null; }
  }
  // Keeping everyone connected. Every crewmate with voice chat on should have a call with every other: whoever's id
  // sorts first dials, straight away; if nothing has come from the other side after a few seconds, the other dials
  // too (a call can be lost on the way, or have been turned away while their voice was off). A call counts as going
  // once its link is actually up (not just agreed: the voice is wired in before the link is tried); one that isn't up
  // in 25 seconds, or whose link has failed, is hung up and tried again, a little later each time.
  function reconcile(ids) {
    const me = Net.myPeerId, peer = Net.peer, now = performance.now();
    for (const id of [...peers.keys()]) if (!ids.includes(id)) drop(id, true);
    for (const m of [seen, fails]) for (const id of [...m.keys()]) if (!ids.includes(id)) m.delete(id);
    for (const [id, e] of peers) {
      const pc = e.call && e.call.peerConnection, st = pc && pc.connectionState, ice = pc && pc.iceConnectionState;
      if (st === 'connected' || ice === 'connected' || ice === 'completed') { if (!e.ok) { e.ok = true; fails.delete(id); } }
      if (st === 'failed' || st === 'closed' || ice === 'failed' || ice === 'closed' || (!e.ok && now - e.t0 > 25000)) drop(id);
    }
    // (dialling needs the matchmaking server: while it's reconnecting, an offer would be lost on the way)
    if (!Settings.voice || !me || !peer || !peer.open || peer.destroyed || peer.disconnected || !SFX.ctx) return;
    for (const id of ids) {
      if (!id || id === me || peers.has(id)) continue;
      if (!seen.has(id)) seen.set(id, now);
      const wait = (me < id ? 0 : 4000) + Math.min(30000, 2500 * ((1 << Math.min(4, fails.get(id) || 0)) - 1));
      if (now - seen.get(id) < wait) continue;
      const stream = outStream(); if (!stream) return;
      const call = peer.call(id, stream);
      if (call) setup(call, true); else seen.set(id, now);
    }
  }
  return {
    // how loud you are coming in (after the mic volume), as a level and in dB
    get level() { return level; },
    get db() { return dbOf(level); },
    get enabled() { return enabled; },
    // (talking: what the others hear, and what the game counts as noise; gateOpen: the mic test's meter)
    get talking() { return enabled && open && Settings.voice; },
    get gateOpen() { return enabled && open; },
    // how loud you're talking, as far as anything listening is concerned (0..1: a whisper under 0.2, talking up to
    // about 0.55, a shout over 0.8; see Brain.voiceR); `carry` is the same with voice chat off, for the mic test
    get loudness() { return this.talking ? held : 0; },
    get carry() { return enabled && open ? held : 0; },
    setPTT(d) { pttDown = d; },
    async enable() {
      if (raw) return true;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
      SFX.init(); const c = makeChain(); if (!c) return false;
      // (the browser's own cleanup: echo cancelling, noise suppression and level evening, all on or all off)
      const clean = Settings.micClean !== false, want = { echoCancellation: clean, noiseSuppression: clean, autoGainControl: clean };
      try {
        try { raw = await navigator.mediaDevices.getUserMedia({ audio: Object.assign({}, want, Settings.micId ? { deviceId: { exact: Settings.micId } } : {}) }); }
        catch (e) { if (!Settings.micId || e.name === 'NotAllowedError') throw e; raw = await navigator.mediaDevices.getUserMedia({ audio: want }); }   // (the one picked has gone: the default)
        src = SFX.ctx.createMediaStreamSource(raw); src.connect(c.gain);
        enabled = true;
        return true;
      } catch (e) { console.warn('mic unavailable', e); raw = null; enabled = false; return false; }
    },
    disable() {
      if (src) src.disconnect(); if (raw) raw.getTracks().forEach((t) => t.stop());
      raw = src = null; enabled = false; level = 0; held = 0; open = false; if (chain) chain.gate.gain.value = 0;
    },
    // a different microphone, or the cleanup turned on or off: open it again (the calls carry on)
    // (and if it never opened, a new pick tries it again)
    async restart() { if (!raw && !Settings.voice) return false; this.disable(); return this.enable(); },
    setMicVol(v) { if (chain) chain.gain.gain.setTargetAtTime(v, SFX.ctx.currentTime, 0.03); },
    monitor(on) { if (chain) chain.mon.gain.setTargetAtTime(on ? 1 : 0, SFX.ctx.currentTime, 0.03); },
    // the microphones (audioinput) or speakers (audiooutput) there are; their names show once the mic is allowed
    async devices(kind) {
      // (until the mic's been allowed the browser lists them without ids, and they can't be picked)
      try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications'); } catch (e) { return []; }
    },
    // (only some browsers can send the game's sound to a particular output)
    get canPickOutput() { return !!(SFX.ctx && SFX.ctx.setSinkId); },
    setOutput(id) { if (SFX.ctx && SFX.ctx.setSinkId) SFX.ctx.setSinkId(id || '').catch(() => {}); },
    // each frame (in a game, and on the mic test): how loud you are, and whether the gate is open (open mic: the moment
    // you're over the threshold, held a moment after so the ends of words aren't clipped)
    tick(dt) {
      if (!chain || !enabled) { open = false; return; }
      chain.an.getFloatTimeDomainData(chain.buf);
      let s = 0; for (let i = 0; i < chain.buf.length; i++) s += chain.buf[i] * chain.buf[i];
      level = damp(level, Math.sqrt(s / chain.buf.length), 12, dt);
      // (and keying a walkie-talkie opens it whatever the mode: a keyed radio sends all the while it's held)
      // (open mic: the gate goes by the threshold, or a little over the room's own steady noise if that's louder, so the
      // hiss of rain or a fan, or the game's own sound from the speakers, never holds it open by itself and goes out to
      // everyone as static; and it shuts a few dB under where it opened, so quiet words don't chop in and out)
      const ldb = dbOf(level);
      floorDb = ldb < floorDb ? damp(floorDb, ldb, 3, dt) : damp(floorDb, ldb, open ? 0.05 : 0.12, dt);
      const thr = Math.max(Settings.micGate, floorDb + 9);
      if (Settings.ptt) open = pttDown;
      else if (ldb > (open ? thr - 5 : thr) || pttDown) { open = true; hold = 0.6; } else if ((hold -= dt) <= 0) open = false;
      chain.gate.gain.setTargetAtTime(open ? 1 : 0, SFX.ctx.currentTime, open ? 0.008 : 0.06);
      // How loud that is, out in the building. The level is taken as it is (after the mic volume, not above the gate, or
      // raising the gate would make a shout count as a whisper), and the voice's colour helps where the browser's own
      // level evening flattens it: a whisper is breath with no voicing in it, low notes missing and the energy high up;
      // a shout brightens the voice. Held a moment (a shout counts for half a second after it), and nothing at all for a
      // push-to-talk key held in silence
      let L = 0;
      const db = dbOf(level);
      if (open && db > -56) {
        chain.an.getFloatFrequencyData(chain.fbuf);
        const bw = SFX.ctx.sampleRate / chain.an.fftSize, fb = chain.fbuf;
        let lo = 0, tot = 0, cen = 0;
        for (let i = 1; i < fb.length; i++) { const f = i * bw; if (f < 80 || f > 8000) continue; const pw = Math.pow(10, fb[i] / 10); tot += pw; cen += pw * f; if (f >= 100 && f <= 900) lo += pw; }
        cen = tot > 0 ? cen / tot : 0;
        const lvl = clamp((db + 52) / 40, 0, 1), bright = clamp((cen - 700) / 1500, 0, 1);
        L = tot > 0 && lo / tot < 0.3 && cen > 1800 ? 0.08 + 0.1 * lvl : clamp(0.15 + 0.6 * lvl + 0.3 * bright * lvl, 0.15, 1);
      }
      held = Math.max(L, held - 1.5 * dt);
      chain.send.gain.setTargetAtTime(Settings.voice ? 1 : 0, SFX.ctx.currentTime, 0.02);
    },
    // A call coming in is always answered, voice on or off (turned away, the caller's end would hang there half-open
    // forever): with it off nothing goes out (the microphone is shut) and nothing is heard (see update). Two calls
    // crossing (both ends dialling at once): the one dialled by whoever's id sorts first is kept, at both ends.
    onCall(call) {
      SFX.init(); const stream = outStream();
      const e = peers.get(call.peer);
      if (e && !e.src && e.out && Net.myPeerId && Net.myPeerId < call.peer) { try { call.close(); } catch (x) { /* ignore */ } return; }
      if (!stream) { try { call.close(); } catch (x) { /* ignore */ } return; }
      call.answer(stream); setup(call, false);
    },
    // (who's aboard, as the host has it, straight away; update() keeps checking from then on)
    connect(peerIds) { reconcile(peerIds); },
    // per-frame: each voice from the speaker's mouth, as it would really reach you. Through the air: falling away with
    // distance, duller from behind them, muffled by whatever's in the way (the facility's walls and shut doors, the
    // floors between levels, the hull of the ship unless the hatch is open), echoing in the room around you. Out on an
    // airless moon or rock there's no air to carry it: outside, you hear each other over the suits' radios instead.
    // Walkie-talkies carry across the whole map; the dead hear everyone, plainly.
    update(game, dt = 1 / 60) {
      this.tick(dt);
      const me = game.localPlayer(); if (!me || !SFX.ctx) return;
      if ((wantT -= dt) <= 0) { wantT = 1.5; reconcile([...game.players.values()].map((p) => p.peerId).filter(Boolean)); }
      // (voice chat turned off: the calls stay up, but nothing of anyone's comes through)
      const iHaveWalkie = game.hasItem(me.id, 'walkie'), vv = Settings.voice ? Settings.voiceVol : 0, t = SFX.ctx.currentTime;
      const vacuum = !!(G.ext && G.ext.biome && G.ext.biome.airless);
      const ear = { x: me.pos.x, y: me.pos.y + (me.crouch ? 1.0 : 1.6), z: me.pos.z }, earAboard = G.ship.inside(me.pos.x, me.pos.y + 0.5, me.pos.z);
      for (const e of peers.values()) {
        if (!e.src) continue;
        const p = game.playerByPeer(e.peerId);
        let prox = 0, radio = 0, flat = 0, lpf = 20000, rv = 0, tx = 0;
        if (p) {
          if (!me.alive) flat = p.alive ? 0.6 : 1;
          else if (p.alive) {
            const at = p.rpos || p.pos, yaw = p.ryaw != null ? p.ryaw : p.yaw, h = { x: at.x, y: at.y + (p.crouch ? 1.0 : 1.6), z: at.z };
            const dx = h.x - ear.x, dy = h.y - ear.y, dz = h.z - ear.z, d = Math.hypot(dx, dy, dz), aboard = G.ship.inside(at.x, at.y + 0.5, at.z);
            // (tx: how strongly they're coming in over a radio right now, walkie-talkie or suit)
            if (p.radio && iHaveWalkie) radio = tx = 1;
            if (p.zone === me.zone) {
              if (vacuum && p.zone === 'out' && !aboard && !earAboard) { const sr = sstep(120, 70, d); radio = Math.max(radio, 0.85 * sr); if (p.talking) tx = Math.max(tx, sr); }
              else {
                // (what's in the way, looked at a few times a second, along three lines a little apart, so a voice
                // comes round a doorway gradually rather than all at once)
                if ((e.occT = (e.occT || 0) - dt) <= 0) {
                  e.occT = 0.12;
                  let o = 0;
                  if (aboard !== earAboard) o = lerp(0.93, 0.3, G.ship.door.t);
                  else if (me.zone === 'in' && G.fac) {
                    if (Math.abs(dy) > 3) o = 0.95;
                    else { const s = 0.7 / Math.max(0.01, Math.hypot(dx, dz)); let b = 0; for (const k of [0, -1, 1]) if (!G.fac.los(ear.x, ear.z, h.x - dz * s * k, h.z + dx * s * k)) b++; o = (b / 3) * 0.9; }
                  }
                  e.occ = o;
                }
                const occ = e.occ || 0, fade = sstep(48, 34, d);
                // (which way they're facing: 1 straight at you, -1 their back to you)
                const fx = -Math.sin(yaw), fz = -Math.cos(yaw), hd = Math.max(0.01, Math.hypot(dx, dz)), c = -(fx * dx + fz * dz) / hd;
                prox = fade * (1 - 0.6 * occ);
                lpf = Math.min(20000 * Math.exp(-d / 45), lerp(3200, 20000, (c + 1) / 2), 20000 * Math.pow(0.021, occ));
                rv = SFX.envRev * 0.4 * fade * (1 + 0.5 * occ);
                SFX.setPannerPos(e.panner, h.x, h.y, h.z);
                if (e.panner.orientationX) { e.panner.orientationX.value = fx; e.panner.orientationY.value = 0; e.panner.orientationZ.value = fz; } else e.panner.setOrientation(fx, 0, fz);
              }
            }
          }
        }
        e.prox.gain.setTargetAtTime(prox * 1.6 * vv, t, 0.05);
        e.lp.frequency.setTargetAtTime(lpf, t, 0.08);
        e.rv.gain.setTargetAtTime(rv * vv, t, 0.08);
        // over the radio: the squelch as they key up and let go, the hiss of the open channel under their voice, and a
        // signal that's never quite steady (it crackles and dips, and now and then breaks up for an instant)
        const on = tx > 0.05;
        if (on !== !!e.onAir) { e.onAir = on; SFX.play(on ? 'squelch_on' : 'squelch_off', null, { vol: 0.55 * vv * Math.max(tx, 0.5) }); }
        const flutter = on ? (Math.random() < 0.015 ? 0.2 : 0.8 + Math.random() * 0.2) : 1;
        e.radio.gain.setTargetAtTime(radio * 1.15 * vv * flutter, t, 0.02);
        e.hiss.gain.setTargetAtTime(on ? 0.045 * vv * tx * (0.6 + Math.random() * 0.8) : 0, t, 0.03);
        e.flat.gain.setTargetAtTime(flat * vv, t, 0.05);
      }
    },
    // (for checking: how each voice is coming through right now)
    get heard() { return [...peers.values()].filter((e) => e.src).map((e) => ({ peer: e.peerId, prox: +e.prox.gain.value.toFixed(3), lowpass: Math.round(e.lp.frequency.value), echo: +e.rv.gain.value.toFixed(3), radio: +e.radio.gain.value.toFixed(3), occluded: +(e.occ || 0).toFixed(2) })); },
    reset() { for (const id of [...peers.keys()]) drop(id, true); seen.clear(); fails.clear(); },
  };
})();
