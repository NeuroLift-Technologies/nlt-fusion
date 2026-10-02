/**
 * Live bridge — streams the real Python engine into the 3D viewer.
 *
 * Two modes:
 *   - Live (server running):  index.html?live=1[&ws=ws://host:port/ws]
 *       opens a WebSocket to server.py, joins as a spectator ("observe"),
 *       and maps each contract-v1 snapshot / tick event onto the sim-core
 *       world state the renderer already understands.
 *   - Offline (no server): classic seeded sim-core tick, unchanged.
 *
 * Contract v1 -> sim-core mapping:
 *   avatar.id            -> avatar.id
 *   avatar.name          -> avatar.name
 *   avatar.state         -> avatar.state   (idle/working/... ring colors)
 *   avatar.emotional_state -> avatar.emotional
 *   avatar.metrics.*     -> avatar.focus/cogLoad/stress/burnout/...
 *   avatar.position      -> avatar.px/py  (tile coords)
 *   entity.position/name -> furniture + NPC markers
 */
window.WE_LIVE = (function () {
  'use strict';

  function isLiveMode() {
    try {
      return new URLSearchParams(window.location.search).has('live');
    } catch (e) { return false; }
  }

  function wsUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('ws')) return params.get('ws');
    } catch (e) { /* fall through */ }
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname || '127.0.0.1';
    // server.py defaults to 8765; the viewer is usually served from another
    // port (or file://), so keep the default. Override with ?ws=... to
    // point at a remote host or a custom --port.
    return `${proto}://${host}:8765/ws`;
  }

  function avatarHue(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
  }

  /** Map one contract avatar onto the iso-world avatar shape. */
  function mapAvatar(id, av) {
    const pos = av.position || { x: 0, y: 0 };
    const m = av.metrics || {};
    return {
      id,
      name: av.name || id,
      trait: av.trait || '',
      blurb: av.trait || '',
      hue: avatarHue(av.name || id),
      flavor: 'attention',
      state: av.state || 'idle',
      emotional: av.emotional_state || 'neutral',
      focus: m.focus ?? 0.6,
      cogLoad: m.cognitive_load ?? 0.2,
      stress: m.stress ?? 0.2,
      burnout: m.burnout_risk ?? 0.0,
      independence: m.independence ?? 0.2,
      fusionReady: m.fusion_readiness ?? 0.0,
      successRate: m.success_rate ?? 0.5,
      scenarioId: (av.scenario && av.scenario.id) || null,
      elapsed: (av.scenario && av.scenario.elapsed) || 0,
      expected: (av.scenario && av.scenario.expected) || 0,
      room: av.room || 'living_room',
      px: pos.x, py: pos.y, tx: pos.x, ty: pos.y,
      moveT: 0, facing: 'south', lastEventTick: 0,
      // Filled in by the status poller below (contract avatar views carry
      // metrics, not needs; needs come from the /ws status feed).
      needs: av.needs || null,
    };
  }

  function mapSnapshotToWorldState(snap) {
    const avatars = Object.entries(snap.avatars || {}).map(
      ([id, av]) => mapAvatar(id, av));
    return { avatars, events: [], interventions: [] };
  }

  function applyTickEvents(worldState, events) {
    if (!events || !events.length) return worldState;
    const mapped = events.slice(0, 20).map(e => ({
      id: e.event_id || String(Math.random()),
      t: Date.now(),
      kind: e.event_type || 'TICK',
      text: e.message || e.event_type || '',
      who: null, scenarioId: e.scenario_id || null,
      avatarId: e.subject_id || null,
      avatarName: '', avatarHue: 200,
    }));
    return {
      avatars: worldState.avatars,
      events: [...mapped.reverse(), ...worldState.events].slice(0, 80),
      interventions: worldState.interventions,
    };
  }

  /**
   * Connect as a spectator. Calls onState(worldState) on every snapshot and
   * tick-batch, and onStatus(text) with connection status for the HUD.
   * Returns a handle with .close().
   */
  function connect({ onState, onStatus }) {
    const url = wsUrl();
    let worldState = { avatars: [], events: [], interventions: [] };
    let closed = false;
    let socket = null;
    let poller = null;
    const emit = () => onState && onState(worldState);

    function startPoller() {
      if (poller) return;
      // Poll REST snapshots for positions + needs (cheap, 1Hz), since
      // WS ticks carry events only.
      const restUrl = url.replace(/^ws/, 'http').replace(/\/ws$/, '/api/world');
      poller = setInterval(async () => {
        try {
          const res = await fetch(restUrl);
          if (!res.ok) return;
          const snap = await res.json();
          const mapped = mapSnapshotToWorldState(snap);
          mapped.events = worldState.events; // keep WS-fed event feed
          // Keep needs previously learned from status messages
          const oldNeeds = {};
          for (const av of worldState.avatars) {
            if (av.needs) oldNeeds[av.id] = av.needs;
          }
          for (const av of mapped.avatars) {
            if (!av.needs && oldNeeds[av.id]) av.needs = oldNeeds[av.id];
          }
          worldState = mapped;
          emit();
        } catch (e) { /* next poll */ }
      }, 1000);
    }

    try {
      socket = new WebSocket(url);
    } catch (e) {
      onStatus && onStatus('live · starting (offline sim until server connects)');
      startPoller(); // REST polls succeed once server.py is up
      return { close() { closed = true; if (poller) clearInterval(poller); } };
    }
    socket.addEventListener('open', () => {
      onStatus && onStatus('live · connected');
      socket.send(JSON.stringify({ type: 'observe' }));
    });
    socket.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === 'snapshot') {
        worldState = mapSnapshotToWorldState(msg);
        emit();
        startPoller();
      } else if (msg.type === 'tick') {
        worldState = applyTickEvents(worldState, msg.events);
        // Positions only arrive with the next snapshot; request a light
        // refresh each tick so movement stays smooth.
        emit();
      } else if (msg.type === 'you' && msg.you) {
        // Status feed carries Sims-style needs not in the contract view.
        const target = worldState.avatars.find(a => a.id === msg.avatar_id);
        if (target && msg.you.needs) target.needs = msg.you.needs;
      }
    });
    socket.addEventListener('close', () => {
      if (!closed) onStatus && onStatus('live · disconnected — offline sim');
    });
    socket.addEventListener('error', () => {
      onStatus && onStatus('live · server unreachable — offline sim');
    });

    startPoller();

    return {
      close() {
        closed = true;
        clearInterval(poller);
        try { socket.close(); } catch (e) { /* ignore */ }
      },
    };
  }

  return { isLiveMode, wsUrl, connect, mapAvatar, mapSnapshotToWorldState };
})();
