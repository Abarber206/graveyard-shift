'use strict';
// Peer-to-peer networking over WebRTC (PeerJS). The host's browser is the authoritative server.
// Phones are the hard case. On mobile data (and plenty of Wi-Fi) both ends sit behind NATs that won't take a direct
// connection, so everything rides on a relay (TURN) in between. There are two sets of free relays here, reached on
// the ports that get through the strictest networks (80 and 443, over UDP, TCP and TLS). A phone also pauses a page
// in the background, which drops a host off the matchmaking server; back on screen it takes the same code again.
const Net = (() => {
  const PREFIX = 'gshift-v1-';
  let peer = null, isHost = false, hostConn = null, code = null;
  const conns = new Map(); // host side: peerId -> { conn, pid }
  const handlers = {};
  const emit = (ev, ...a) => handlers[ev] && handlers[ev](...a);
  const makeCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };

  // ---- SHA-1 and HMAC (small and synchronous, so they work anywhere, even in the game opened as a file) ----
  function sha1(bytes) {
    const n = bytes.length, words = new Uint32Array((((n + 8) >> 6) + 1) * 16), w = new Uint32Array(80);
    for (let i = 0; i < n; i++) words[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
    words[n >> 2] |= 0x80 << (24 - (n & 3) * 8);
    words[words.length - 1] = n * 8;
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    for (let i = 0; i < words.length; i += 16) {
      for (let t = 0; t < 16; t++) w[t] = words[i + t];
      for (let t = 16; t < 80; t++) { const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]; w[t] = (x << 1) | (x >>> 31); }
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let t = 0; t < 80; t++) {
        const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
        const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
        const tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0;
        e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = tmp;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    const out = new Uint8Array(20);
    [h0, h1, h2, h3, h4].forEach((h, i) => { out[i * 4] = h >>> 24; out[i * 4 + 1] = (h >>> 16) & 255; out[i * 4 + 2] = (h >>> 8) & 255; out[i * 4 + 3] = h & 255; });
    return out;
  }
  const utf8 = (s) => new TextEncoder().encode(s);
  function hmacSha1(key, msg) {
    let k = utf8(key); if (k.length > 64) k = sha1(k);
    const kp = new Uint8Array(64); kp.set(k);
    const m = utf8(msg), inner = new Uint8Array(64 + m.length), outer = new Uint8Array(84);
    for (let i = 0; i < 64; i++) { inner[i] = kp[i] ^ 0x36; outer[i] = kp[i] ^ 0x5c; }
    inner.set(m, 64); outer.set(sha1(inner), 64);
    return sha1(outer);
  }
  const b64 = (u8) => btoa(String.fromCharCode(...u8));

  // ---- the routes between two players ----
  // Open Relay is Metered's free public TURN service. It takes short-lived credentials signed with the shared secret
  // it publishes for public use (the TURN REST scheme coturn uses): username "expiry:name", password
  // base64(HMAC-SHA1(secret, username)). They're worked out here, so nobody needs an account.
  const OPEN = 'staticauth.openrelay.metered.ca', OPEN_SECRET = 'openrelayprojectsecret';
  const OPEN_URLS = { udp: [`turn:${OPEN}:80`, `turn:${OPEN}:443`], tcp: [`turn:${OPEN}:80?transport=tcp`, `turn:${OPEN}:443?transport=tcp`], tls: [`turns:${OPEN}:443?transport=tcp`] };
  const PEERJS_URLS = ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'];
  const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] };
  function openRelay(urls) {
    const username = (Math.floor(Date.now() / 1000) + 24 * 3600) + ':gshift';
    return { urls, username, credential: b64(hmacSha1(OPEN_SECRET, username)) };
  }
  const peerjsRelay = () => ({ urls: PEERJS_URLS, username: 'peerjs', credential: 'peerjsp' });
  const iceServers = () => [STUN, openRelay([...OPEN_URLS.udp, ...OPEN_URLS.tcp, ...OPEN_URLS.tls]), peerjsRelay()];
  const opts = () => ({ debug: 1, config: { iceServers: iceServers() } });

  // ---- host ----
  function wireHostConn(conn) {
    conn.on('open', () => { conns.set(conn.peer, { conn, pid: null }); });
    conn.on('data', (d) => { const c = conns.get(conn.peer); if (c) emit('message', d, c); });
    conn.on('close', () => { const c = conns.get(conn.peer); conns.delete(conn.peer); if (c) emit('leave', c); });
    conn.on('error', (e) => console.warn('conn error', e));
  }
  function wirePeer(p) {
    p.on('connection', wireHostConn);
    p.on('call', (call) => emit('call', call));
    p.on('disconnected', () => { try { if (p === peer && !p.destroyed) p.reconnect(); } catch (e) { /* ignore */ } });
  }
  // A host's phone that pauses the page drops off the matchmaking server, so nobody can find the lobby. As soon as
  // the game is on screen again (and every few seconds while it is) the lobby is put back up under the same code.
  // (Crew already aboard are connected straight to the host and never needed the server.)
  let relisting = false;
  function keepListed() {
    if (!isHost || !peer || !code || document.hidden) return;
    if (!peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (e) { /* tried again next time */ } return; }
    if (peer.destroyed && !relisting) {
      // the old registration was lost entirely: take the same code again (the server may hold it a little while)
      relisting = true;
      const p = new Peer(PREFIX + code, opts()); wirePeer(p);
      p.on('open', () => { relisting = false; });
      p.on('error', (e) => { relisting = false; if (e.type === 'unavailable-id') { try { p.destroy(); } catch (err) { /* ignore */ } } });
      peer = p;
    }
  }
  setInterval(keepListed, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) keepListed(); });
  window.addEventListener('pageshow', keepListed);
  window.addEventListener('online', keepListed);

  // ---- the network test: what this network lets through ----
  // Gathers routes with each server on its own: a direct route found through STUN, and a relayed one through each
  // relay by each way in. A relayed route means that relay took our credentials and will carry the game.
  function gather(servers, ms) {
    return new Promise((resolve) => {
      const found = []; let pc, fin = false, to;
      const finish = () => { if (fin) return; fin = true; clearTimeout(to); try { pc && pc.close(); } catch (e) { /* ignore */ } resolve(found); };
      try { pc = new RTCPeerConnection({ iceServers: servers }); } catch (e) { finish(); return; }
      pc.createDataChannel('t');
      pc.onicecandidate = (e) => { if (!e.candidate) finish(); else if (e.candidate.candidate) found.push(e.candidate.type || (/ typ (\w+)/.exec(e.candidate.candidate) || [])[1]); };
      to = setTimeout(finish, ms);
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(finish);
    });
  }
  function reachServer(ms) {
    return new Promise((resolve) => {
      let p, done = false;
      const end = (ok) => { if (done) return; done = true; clearTimeout(to); try { p.destroy(); } catch (e) { /* ignore */ } resolve(ok); };
      const to = setTimeout(() => end(false), ms);
      try { p = new Peer(opts()); } catch (e) { end(false); return; }
      p.on('open', () => end(true)); p.on('error', () => end(false));
    });
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
          peer = new Peer(PREFIX + code, opts()); wirePeer(peer);
          const p = peer;
          const to = setTimeout(() => { if (!done) { done = true; reject(new Error('Could not reach the matchmaking server. Check your connection and try again.')); } }, 15000);
          p.on('open', () => { clearTimeout(to); if (done) return; done = true; isHost = true; resolve(code); });
          p.on('error', (e) => {
            if (!done && e.type === 'unavailable-id' && attempts++ < 4) { clearTimeout(to); p.destroy(); tryOpen(); return; }
            if (!done) { clearTimeout(to); done = true; reject(new Error('Could not create a lobby (' + e.type + '). Check your connection and try again.')); return; }
            console.warn('peer error', e);
          });
        };
        tryOpen();
      });
    },
    join(joinCode) {
      const want = joinCode.toUpperCase();
      return new Promise((resolve, reject) => {
        let done = false, found = false, to = null;
        const fail = (msg) => { if (!done) { done = true; clearTimeout(to); reject(new Error(msg)); try { peer && peer.destroy(); } catch (e) { /* ignore */ } peer = null; hostConn = null; } };
        const NO_ROUTE = 'Found lobby ' + want + ', but your networks couldn\'t link up. Run TEST CONNECTION on both phones, or try again on the same Wi-Fi.';
        peer = new Peer(opts());
        // (a relayed link can take a while to set up on mobile data)
        to = setTimeout(() => fail(found ? NO_ROUTE : 'Could not reach the matchmaking server. Check your connection and try again.'), 30000);
        peer.on('open', () => {
          found = true;
          hostConn = peer.connect(PREFIX + want, { reliable: true, serialization: 'json' });
          hostConn.on('open', () => { if (done) return; done = true; clearTimeout(to); code = want; isHost = false; resolve(); });
          hostConn.on('data', (d) => emit('message', d));
          hostConn.on('close', () => { if (done) emit('close', 'Lost connection to the host.'); });
          hostConn.on('error', (e) => console.warn('conn error', e));
          // every route tried and none of them works: say so now, rather than at the end of the wait
          const c = hostConn, watchIce = () => {
            if (done || c !== hostConn) return;
            const pc = c.peerConnection; if (!pc) { setTimeout(watchIce, 150); return; }
            pc.addEventListener('iceconnectionstatechange', () => { if (pc.iceConnectionState === 'failed') fail(NO_ROUTE); });
          };
          watchIce();
        });
        peer.on('error', (e) => {
          if (e.type === 'peer-unavailable') fail('No lobby found with code ' + want + '. Check the code, and that the host has the game open on screen (phones pause it in the background).');
          else if (!done) fail(found ? NO_ROUTE : 'Could not reach the matchmaking server (' + e.type + '). Check your connection and try again.');
          else console.warn('peer error', e);
        });
        peer.on('call', (call) => emit('call', call));
        peer.on('disconnected', () => { try { if (peer && !peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } });
      });
    },
    // out(text) is called with each finding as it comes in; resolves with a one-line verdict
    async test(out) {
      out('Matchmaking server...');
      const [server, direct, udp, tcp, tls, pj] = await Promise.all([
        reachServer(12000), gather([STUN], 6000),
        gather([openRelay(OPEN_URLS.udp)], 9000), gather([openRelay(OPEN_URLS.tcp)], 9000), gather([openRelay(OPEN_URLS.tls)], 9000), gather([peerjsRelay()], 9000),
      ]);
      const relayed = (list) => list.includes('relay');
      const ok = (b) => (b ? 'OK' : 'FAILED');
      out('Matchmaking server: ' + (server ? 'OK' : 'UNREACHABLE'));
      out('Direct route: ' + (direct.includes('srflx') ? 'OK' : 'none'));
      out('Open Relay  UDP ' + ok(relayed(udp)) + ' · TCP ' + ok(relayed(tcp)) + ' · TLS ' + ok(relayed(tls)));
      out('PeerJS relay: ' + ok(relayed(pj)));
      const anyRelay = [udp, tcp, tls, pj].some(relayed);
      return !server ? 'This network can\'t reach the matchmaking server. Online play won\'t work on it.'
        : anyRelay ? 'This network can play online.'
          : 'No relay gets through this network. You may only be able to play with friends on the same Wi-Fi.';
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
    // (for checking the relay credentials against a known answer)
    _hmac: (k, m) => b64(hmacSha1(k, m)),
  };
})();
