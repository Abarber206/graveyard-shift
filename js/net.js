'use strict';
// Peer-to-peer networking over WebRTC (PeerJS). The host's browser is the authoritative server.
const Net = (() => {
  const PREFIX = 'gshift-v1-';
  let peer = null, isHost = false, hostConn = null, code = null;
  const conns = new Map(); // host side: peerId -> { conn, pid }
  const handlers = {};
  const emit = (ev, ...a) => handlers[ev] && handlers[ev](...a);
  const makeCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };
  const opts = { debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }, { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' }] } };

  function wireHostConn(conn) {
    conn.on('open', () => { conns.set(conn.peer, { conn, pid: null }); });
    conn.on('data', (d) => { const c = conns.get(conn.peer); if (c) emit('message', d, c); });
    conn.on('close', () => { const c = conns.get(conn.peer); conns.delete(conn.peer); if (c) emit('leave', c); });
    conn.on('error', (e) => console.warn('conn error', e));
  }
  return {
    get available() { return typeof Peer !== 'undefined'; },
    get isHost() { return isHost; },
    get code() { return code; },
    get active() { return !!peer; },
    get peer() { return peer; },
    get myPeerId() { return peer ? peer.id : null; },
    on(ev, fn) { handlers[ev] = fn; },
    host() {
      return new Promise((resolve, reject) => {
        let attempts = 0, done = false;
        const tryOpen = () => {
          code = makeCode();
          peer = new Peer(PREFIX + code, opts);
          const to = setTimeout(() => { if (!done) { done = true; reject(new Error('Timed out reaching the matchmaking server. Check your connection.')); } }, 14000);
          peer.on('open', () => { clearTimeout(to); if (done) return; done = true; isHost = true; resolve(code); });
          peer.on('error', (e) => {
            if (!done && e.type === 'unavailable-id' && attempts++ < 4) { clearTimeout(to); peer.destroy(); tryOpen(); return; }
            if (!done) { clearTimeout(to); done = true; reject(new Error('Could not create lobby (' + e.type + ').')); return; }
            console.warn('peer error', e);
          });
          peer.on('connection', wireHostConn);
          peer.on('call', (call) => emit('call', call));
          peer.on('disconnected', () => { try { if (peer && !peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } });
        };
        tryOpen();
      });
    },
    join(joinCode) {
      return new Promise((resolve, reject) => {
        let done = false;
        const fail = (msg) => { if (!done) { done = true; reject(new Error(msg)); try { peer && peer.destroy(); } catch (e) { /* ignore */ } peer = null; } };
        peer = new Peer(opts);
        const to = setTimeout(() => fail('Could not reach that lobby. Check the code and try again.'), 16000);
        peer.on('open', () => {
          hostConn = peer.connect(PREFIX + joinCode.toUpperCase(), { reliable: true, serialization: 'json' });
          hostConn.on('open', () => { clearTimeout(to); if (done) return; done = true; code = joinCode.toUpperCase(); isHost = false; resolve(); });
          hostConn.on('data', (d) => emit('message', d));
          hostConn.on('close', () => { if (done) emit('close', 'Lost connection to the host.'); });
          hostConn.on('error', (e) => console.warn('conn error', e));
        });
        peer.on('error', (e) => {
          if (e.type === 'peer-unavailable') fail('No lobby found with code ' + joinCode.toUpperCase() + '.');
          else if (!done) fail('Connection failed (' + e.type + ').');
          else console.warn('peer error', e);
        });
        peer.on('call', (call) => emit('call', call));
        peer.on('disconnected', () => { try { if (peer && !peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } });
      });
    },
    send(msg) { if (hostConn && hostConn.open) hostConn.send(msg); },
    sendTo(c, msg) { if (c && c.conn.open) c.conn.send(msg); },
    broadcast(msg) { for (const c of conns.values()) if (c.pid != null && c.conn.open) c.conn.send(msg); },
    clients() { return [...conns.values()]; },
    close() {
      try { for (const c of conns.values()) c.conn.close(); } catch (e) { /* ignore */ }
      try { if (hostConn) hostConn.close(); } catch (e) { /* ignore */ }
      try { if (peer) peer.destroy(); } catch (e) { /* ignore */ }
      peer = null; hostConn = null; conns.clear(); isHost = false; code = null;
    },
  };
})();
