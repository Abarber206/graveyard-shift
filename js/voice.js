'use strict';
// Proximity voice chat: WebRTC audio calls between every pair of players, spatialised with WebAudio.
// Walkie-talkies carry voice across the whole map with a radio filter.
const Voice = (() => {
  let stream = null, silent = null, analyser = null, buf = null, level = 0, enabled = false, pttDown = false;
  const peers = new Map(); // peerId -> entry
  function outStream() {
    if (stream) return stream;
    if (!silent && SFX.ctx) silent = SFX.ctx.createMediaStreamDestination().stream;
    return silent;
  }
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
    get level() { return level; },
    get enabled() { return enabled; },
    get talking() { return enabled && (Settings.ptt ? pttDown : level > 0.035); },
    setPTT(d) { pttDown = d; if (stream) stream.getAudioTracks().forEach((t) => (t.enabled = !Settings.ptt || d)); },
    async enable() {
      if (stream) return true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        enabled = true;
        const ctx = SFX.ctx; analyser = ctx.createAnalyser(); analyser.fftSize = 512; buf = new Float32Array(analyser.fftSize);
        ctx.createMediaStreamSource(stream).connect(analyser);
        if (Settings.ptt) stream.getAudioTracks().forEach((t) => (t.enabled = false));
        return true;
      } catch (e) { console.warn('mic unavailable', e); enabled = false; return false; }
    },
    disable() { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; enabled = false; level = 0; },
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
      if (analyser) {
        analyser.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        level = damp(level, Math.sqrt(s / buf.length), 12, 1 / 60);
      }
      const me = game.localPlayer(); if (!me) return;
      const iHaveWalkie = game.hasItem(me.id, 'walkie');
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
        e.prox.gain.setTargetAtTime(prox * 1.4, t, 0.05);
        e.radio.gain.setTargetAtTime(radio * 1.1, t, 0.05);
        e.flat.gain.setTargetAtTime(flat, t, 0.05);
      }
    },
    reset() { for (const id of [...peers.keys()]) drop(id); },
  };
})();
