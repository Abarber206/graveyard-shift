'use strict';
// Proximity voice chat: WebRTC audio calls between every pair of players, spatialised with WebAudio.
// Walkie-talkies carry voice across the whole map with a radio filter.
// Your own voice goes out through a little chain: the microphone you picked, its volume, then a gate that's open while
// you talk (open mic: while you're louder than the threshold; push-to-talk: while V is held). The calls carry what comes
// out of the gate, so changing microphone, or turning the mic on halfway through a game, needs no new calls.
const Voice = (() => {
  let raw = null, src = null, chain = null, level = 0, enabled = false, pttDown = false, open = false, hold = 0;
  const peers = new Map(); // peerId -> entry
  const dbOf = (x) => 20 * Math.log10(Math.max(x, 1e-5));
  function makeChain() {
    if (chain || !SFX.ctx) return chain;
    const ctx = SFX.ctx, c = { gain: ctx.createGain(), gate: ctx.createGain(), an: ctx.createAnalyser(), dest: ctx.createMediaStreamDestination(), mon: ctx.createGain() };
    c.an.fftSize = 512; c.buf = new Float32Array(c.an.fftSize); c.gain.gain.value = Settings.micVol; c.gate.gain.value = 0; c.mon.gain.value = 0;
    // (the mic test can play you back to yourself: straight to the speakers, past the game's own effects)
    c.gain.connect(c.an); c.gain.connect(c.gate); c.gate.connect(c.dest); c.gate.connect(c.mon); c.mon.connect(ctx.destination);
    return (chain = c);
  }
  function outStream() { const c = makeChain(); return c ? c.dest.stream : null; }
  function setup(call) {
    const e = peers.get(call.peer) || { peerId: call.peer };
    e.call = call; peers.set(call.peer, e);
    call.on('stream', (remote) => {
      if (e.src || !SFX.ctx) return;
      const ctx = SFX.ctx;
      e.el = new Audio(); e.el.srcObject = remote; e.el.muted = true; e.el.play().catch(() => {});
      e.src = ctx.createMediaStreamSource(remote);
      e.prox = ctx.createGain(); e.prox.gain.value = 0;
      e.panner = ctx.createPanner(); e.panner.panningModel = 'HRTF'; e.panner.distanceModel = 'inverse'; e.panner.refDistance = 2; e.panner.rolloffFactor = 1.4; e.panner.maxDistance = 100;
      e.src.connect(e.prox); e.prox.connect(e.panner); e.panner.connect(SFX.bus);
      const rv = ctx.createGain(); rv.gain.value = 0.25; e.panner.connect(rv); rv.connect(SFX.revIn);
      e.radio = ctx.createGain(); e.radio.gain.value = 0;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.1;
      const ws = ctx.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 3); } ws.curve = c;
      e.src.connect(bp); bp.connect(ws); ws.connect(e.radio); e.radio.connect(SFX.bus);
      e.flat = ctx.createGain(); e.flat.gain.value = 0; e.src.connect(e.flat); e.flat.connect(SFX.bus);
    });
    call.on('close', () => drop(call.peer));
    call.on('error', () => drop(call.peer));
  }
  function drop(peerId) {
    const e = peers.get(peerId); if (!e) return;
    try { e.src && e.src.disconnect(); e.call && e.call.close(); } catch (x) { /* ignore */ }
    if (e.el) { e.el.srcObject = null; }
    peers.delete(peerId);
  }
  return {
    // how loud you are coming in (after the mic volume), as a level and in dB
    get level() { return level; },
    get db() { return dbOf(level); },
    get enabled() { return enabled; },
    get talking() { return enabled && open; },
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
      raw = src = null; enabled = false; level = 0; open = false; if (chain) chain.gate.gain.value = 0;
    },
    // a different microphone, or the cleanup turned on or off: open it again (the calls carry on)
    async restart() { if (!raw) return false; this.disable(); return this.enable(); },
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
      if (Settings.ptt) open = pttDown;
      else if (dbOf(level) > Settings.micGate) { open = true; hold = 0.45; } else if ((hold -= dt) <= 0) open = false;
      chain.gate.gain.setTargetAtTime(open ? 1 : 0, SFX.ctx.currentTime, open ? 0.008 : 0.06);
    },
    onCall(call) { call.answer(outStream()); setup(call); },
    // call every peer we know that has a "larger" id (the others call us)
    connect(peerIds) {
      const me = Net.myPeerId; if (!me || !Net.peer || !SFX.ctx) return;
      for (const id of peerIds) {
        if (!id || id === me || peers.has(id)) continue;
        if (me < id) { const call = Net.peer.call(id, outStream()); if (call) setup(call); }
      }
      for (const id of [...peers.keys()]) if (!peerIds.includes(id)) drop(id);
    },
    // per-frame: position each voice, apply proximity / radio / death rules
    update(game) {
      this.tick(1 / 60);
      const me = game.localPlayer(); if (!me) return;
      const iHaveWalkie = game.hasItem(me.id, 'walkie'), vv = Settings.voiceVol;
      for (const e of peers.values()) {
        if (!e.src) continue;
        const p = game.playerByPeer(e.peerId);
        let prox = 0, radio = 0, flat = 0;
        if (p) {
          if (!me.alive) flat = p.alive ? 0.6 : 1;
          else if (p.alive) {
            prox = p.zone === me.zone ? 1 : 0;
            if (p.radio && iHaveWalkie) radio = 1;
            const h = { x: p.pos.x, y: p.pos.y + 1.6, z: p.pos.z };
            SFX.setPannerPos(e.panner, h.x, h.y, h.z);
          }
        }
        const t = SFX.ctx.currentTime;
        e.prox.gain.setTargetAtTime(prox * 1.4 * vv, t, 0.05);
        e.radio.gain.setTargetAtTime(radio * 1.1 * vv, t, 0.05);
        e.flat.gain.setTargetAtTime(flat * vv, t, 0.05);
      }
    },
    reset() { for (const id of [...peers.keys()]) drop(id); },
  };
})();
