'use strict';
// Peer-to-peer networking over WebRTC (PeerJS). The host's browser is the authoritative server.
// Phones are the hard case. On mobile data (and plenty of Wi-Fi) both ends sit behind NATs that won't take a direct
// connection, so everything rides on a relay (TURN) in between, when one is set up (see RELAYS below). A phone also
// pauses a page in the background, which drops a host off the matchmaking server; back on screen it takes the same
// code again.
const Net = (() => {
  const PREFIX = 'gshift-v1-';
  let peer = null, isHost = false, hostConn = null, code = null;
  const conns = new Map(); // host side: peerId -> { conn, pid }
  const handlers = {};
  const emit = (ev, ...a) => handlers[ev] && handlers[ev](...a);
  const makeCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };

  // ---- the routes between two players ----
  // A direct route (found through STUN) works between most home networks. Phones on mobile data, and strict Wi-Fi,
  // need a relay (TURN) in between, and every relay needs an account somewhere: the free public ones this used to lean
  // on (Open Relay's and PeerJS's) have shut down. To add one, put its servers in RELAYS ({ urls, username,
  // credential }), or point RELAY_URL at an address that hands out short-lived ones as JSON (a list of ice servers, or
  // { iceServers: [...] }): Metered's TURN credentials link does, or a small Cloudflare Worker in front of Cloudflare's.
  const RELAYS = [];
  const RELAY_URL = '';
  const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] };
  // (handed-out credentials are fetched before hosting, joining or testing, and kept for half an hour)
  let fetched = [], fetchedAt = 0;
  function loadRelays() {
    if (!RELAY_URL || Date.now() - fetchedAt < 30 * 60 * 1000) return Promise.resolve();
    const get = fetch(RELAY_URL, { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      const l = Array.isArray(j) ? j : j && j.iceServers;
      if (Array.isArray(l) && l.length) { fetched = l; fetchedAt = Date.now(); }
    });
    return Promise.race([get, new Promise((r) => setTimeout(r, 5000))]).catch(() => {});
  }
  const relays = () => [...RELAYS, ...fetched];
  const iceServers = () => [STUN, ...relays()];
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
      return loadRelays().then(() => new Promise((resolve, reject) => {
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
      }));
    },
    join(joinCode) {
      const want = joinCode.toUpperCase();
      return loadRelays().then(() => new Promise((resolve, reject) => {
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
      }));
    },
    // out(text) is called with each finding as it comes in; resolves with a one-line verdict
    async test(out) {
      out('Matchmaking server...');
      await loadRelays();
      const list = relays();
      const [server, direct, ...each] = await Promise.all([reachServer(12000), gather([STUN], 6000), ...list.map((s) => gather([s], 9000))]);
      const route = direct.includes('srflx'), relay = each.some((l) => l.includes('relay'));
      out('Matchmaking server: ' + (server ? 'OK' : 'UNREACHABLE'));
      out('Direct route: ' + (route ? 'OK' : 'none'));
      out('Relay: ' + (!list.length ? 'none set up yet' : relay ? 'OK' : 'FAILED'));
      return !server ? 'This network can\'t reach the matchmaking server. Online play won\'t work on it.'
        : relay ? 'This network can play online.'
          : route ? 'Direct connections work from here, so most friends can join. Two phones on mobile data may not reach each other without a relay.'
            : 'Nothing gets through from this network but the same Wi-Fi: only friends on it can join.';
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
