// World Engine simulation core — tick loop, avatar state, event emission.
// Pure React state, no external deps. Runs at a configurable tick rate.

const { useState, useEffect, useRef, useCallback, useMemo } = React;
const WE = window.WE_DATA;

// -------- helpers --------
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const rng = (() => {
  let s = 1337;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xfffffff) / 0xfffffff;
  };
})();
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// Map flavor → emotional baseline tendencies
const FLAVOR_BIAS = {
  attention:   { drift: 0.35, hyperfocus: 0.15, stress: 0.20 },
  initiation:  { drift: 0.10, hyperfocus: 0.05, stress: 0.25, resist: 0.55 },
  impulse:     { drift: 0.40, hyperfocus: 0.05, stress: 0.20, blurt: 0.35 },
  memory:      { drift: 0.30, hyperfocus: 0.05, stress: 0.30 },
  time:        { drift: 0.25, hyperfocus: 0.20, stress: 0.20 },
  emotion:     { drift: 0.20, hyperfocus: 0.05, stress: 0.50 },
  focus:       { drift: 0.05, hyperfocus: 0.55, stress: 0.30 },
  frustration: { drift: 0.15, hyperfocus: 0.10, stress: 0.45 },
  planning:    { drift: 0.30, hyperfocus: 0.05, stress: 0.25 },
  transition:  { drift: 0.20, hyperfocus: 0.10, stress: 0.30 },
  monitor:     { drift: 0.25, hyperfocus: 0.10, stress: 0.20 },
  fatigue:     { drift: 0.35, hyperfocus: 0.10, stress: 0.40 },
  effort:      { drift: 0.20, hyperfocus: 0.05, stress: 0.25 },
  stress:      { drift: 0.20, hyperfocus: 0.05, stress: 0.55 },
  sensory:     { drift: 0.30, hyperfocus: 0.20, stress: 0.40 },
  social:      { drift: 0.25, hyperfocus: 0.10, stress: 0.35 },
  identity:    { drift: 0.15, hyperfocus: 0.10, stress: 0.40 },
};

// Build an initial avatar runtime state.
function spawnAvatar(def, room) {
  return {
    ...def,
    state: 'idle',         // idle | working | drifting | hyperfocus | overwhelmed | coached
    emotional: 'neutral',
    focus: 0.65 + rng() * 0.15,
    cogLoad: 0.20 + rng() * 0.10,
    stress: 0.15 + rng() * 0.10,
    burnout: 0.05,
    independence: 0.20 + rng() * 0.30,    // grows over training
    fusionReady: 0.0,                     // Avatar → Advocate progression
    successRate: 0.50,
    scenarioId: null,
    elapsed: 0,                           // minutes in current scenario
    expected: 0,                          // expected minutes
    minutesFocused: 0,
    falseStarts: 0,
    interventions: 0,
    successes: 0,
    failures: 0,
    // spatial — tile-space coords within the world grid
    room: room.id,
    px: room.x + Math.floor(room.w / 2),
    py: room.y + Math.floor(room.h / 2),
    tx: room.x + Math.floor(room.w / 2),
    ty: room.y + Math.floor(room.h / 2),
    moveT: 0,
    facing: 'south',
    lastEventTick: 0,
  };
}

// ---------- the main simulation hook ----------
window.useWorldEngine = function useWorldEngine(opts = {}) {
  const {
    tickHz = 4,
    timeScale = 1.0,           // sim minutes per tick at scale 1.0
    dysfunctionOn = true,
    urgencyThreshold = 0.6,
    activeAvatarIds = WE.AVATARS.map(a => a.id),
  } = opts;

  const [tickCount, setTickCount] = useState(0);
  const [simTime, setSimTime] = useState(0);       // minutes since boot
  const [running, setRunning] = useState(true);
  const [avatars, setAvatars] = useState(() => {
    return WE.AVATARS.map((def, i) => {
      // distribute initial spawn across rooms
      const room = WE.ROOMS[i % WE.ROOMS.length];
      return spawnAvatar(def, room);
    });
  });
  const [events, setEvents] = useState([]);        // ring buffer of recent events
  const [interventions, setInterventions] = useState([]); // aide coaching cards

  // Mutable refs so the interval callback always sees fresh values.
  const stateRef = useRef({ avatars, events, interventions, dysfunctionOn, urgencyThreshold, timeScale });
  stateRef.current = { avatars, events, interventions, dysfunctionOn, urgencyThreshold, timeScale };

  const pushEvent = useCallback((evt) => {
    setEvents(prev => {
      const next = [evt, ...prev];
      return next.slice(0, 80);
    });
  }, []);

  const pushIntervention = useCallback((ev) => {
    setInterventions(prev => [ev, ...prev].slice(0, 40));
  }, []);

  // Run a single tick.
  const stepOnce = useCallback(() => {
    const nowTick = stateRef.current.__tick = (stateRef.current.__tick || 0) + 1;
    setTickCount(t => t + 1);
    setSimTime(t => t + stateRef.current.timeScale);

    setAvatars(prev => {
      const ts = stateRef.current.timeScale;
      const dysOn = stateRef.current.dysfunctionOn;
      const threshold = stateRef.current.urgencyThreshold;
      const newEvents = [];
      const newInterventions = [];

      const next = prev.map(av => {
        const a = { ...av };
        const bias = FLAVOR_BIAS[a.flavor] || FLAVOR_BIAS.attention;

        // --- spatial movement (toward target tile) ---
        if (a.px !== a.tx || a.py !== a.ty) {
          const dx = Math.sign(a.tx - a.px);
          const dy = Math.sign(a.ty - a.py);
          if (Math.random() < 0.55) {
            a.px += dx;
            if (a.px === a.tx && dy) a.py += dy;
          } else if (dy) {
            a.py += dy;
          } else if (dx) {
            a.px += dx;
          }
          a.facing = dx > 0 ? 'east' : dx < 0 ? 'west' : dy > 0 ? 'south' : 'north';
        } else if (a.state === 'working' && rng() < 0.15) {
          // gentle wander inside the room
          const room = WE.ROOMS.find(r => r.id === a.room);
          if (room) {
            a.tx = room.x + Math.floor(rng() * room.w);
            a.ty = room.y + Math.floor(rng() * room.h);
          }
        }

        // --- assign scenario if idle ---
        if (!a.scenarioId && rng() < 0.18) {
          const sc = pick(WE.SCENARIOS);
          a.scenarioId = sc.id;
          a.expected = sc.minutes;
          a.elapsed = 0;
          a.state = 'working';
          const room = WE.ROOMS.find(r => r.id === sc.room);
          if (room) {
            a.room = room.id;
            a.tx = room.x + Math.floor(rng() * room.w);
            a.ty = room.y + Math.floor(rng() * room.h);
          }
          newEvents.push(mkEvent('TASK_START', a, `started ${sc.name}`, sc.id));
        }

        // --- active scenario progress ---
        if (a.scenarioId) {
          const sc = WE.SCENARIOS.find(s => s.id === a.scenarioId);
          a.elapsed += ts;

          // build up cognitive load + slow drift in focus
          const loadGain = (sc.cog * 0.04) * ts;
          a.cogLoad = clamp(a.cogLoad + loadGain * (dysOn ? 1 : 0.4));
          if (sc.sustained && dysOn) {
            a.focus = clamp(a.focus - bias.drift * 0.02 * ts);
          }
          if (sc.aversive > 0.5 && dysOn) {
            a.stress = clamp(a.stress + bias.stress * 0.015 * ts);
          }

          // probabilistic events
          if (dysOn && rng() < bias.drift * 0.06 * ts && sc.sustained) {
            a.state = 'drifting';
            a.focus = clamp(a.focus - 0.10);
            newEvents.push(mkEvent('FOCUS_DRIFT', a, 'lost focus mid-task'));
          }
          if (dysOn && rng() < bias.hyperfocus * 0.04 * ts) {
            a.state = 'hyperfocus';
            a.cogLoad = clamp(a.cogLoad + 0.08);
            newEvents.push(mkEvent('HYPERFOCUS_ENTER', a, 'tunneled into a subtask'));
          }
          if (a.stress > 0.7 && rng() < 0.20 * ts) {
            newEvents.push(mkEvent('STRESS_SPIKE', a, `stress at ${(a.stress * 100).toFixed(0)}%`));
          }
          if (a.cogLoad > 0.85 && a.state !== 'overwhelmed') {
            a.state = 'overwhelmed';
            newEvents.push(mkEvent('COGNITIVE_LOAD_HIGH', a, 'cognitive load critical'));
          }

          // NPC interruption — workplace + meeting + lounge
          if (['office', 'meeting', 'lounge'].includes(a.room) && rng() < 0.04 * ts && dysOn) {
            const npc = pick(WE.NPCS.filter(n => n.room === a.room && !n.invisible)) || WE.NPCS[0];
            if (npc) {
              a.focus = clamp(a.focus - 0.08);
              a.cogLoad = clamp(a.cogLoad + 0.05);
              newEvents.push(mkEvent('NPC_INTERRUPT', a, `${npc.name} interrupted`, null, npc.name));
            }
          }

          // Aide coaching intervention — when stress/cogLoad exceeds threshold
          const urgency = Math.max(a.stress, a.cogLoad, 1 - a.focus);
          if (urgency > threshold && rng() < 0.35) {
            const aide = WE.AIDES[a.id];
            const strategies = WE.STRATEGIES[a.flavor] || WE.STRATEGIES.attention;
            const strategy = pick(strategies);
            const effectiveness = 0.4 + rng() * 0.45;
            a.stress = clamp(a.stress - 0.25 * effectiveness);
            a.cogLoad = clamp(a.cogLoad - 0.20 * effectiveness);
            a.focus = clamp(a.focus + 0.15 * effectiveness);
            a.state = 'coached';
            a.interventions += 1;
            const evt = mkEvent('COACHING_INTERVENTION', a,
              `${aide.name} → "${strategy}"`, null, aide.name, { strategy, effectiveness });
            newEvents.push(evt);
            newInterventions.push({ ...evt, avatarId: a.id, aide: aide.name });
          }

          // Scenario complete / fail
          if (a.elapsed >= a.expected) {
            const successChance = (sc.base + (a.focus - 0.5) * 0.4 - a.stress * 0.3) * (1 + a.independence * 0.2);
            const success = rng() < clamp(successChance, 0.1, 0.95);
            if (success) {
              a.successes += 1;
              a.independence = clamp(a.independence + 0.02);
              a.fusionReady = clamp(a.fusionReady + 0.015);
              a.successRate = (a.successRate * 0.85) + 0.15;
              newEvents.push(mkEvent('TASK_COMPLETE', a, `${sc.name} ✓`));
            } else {
              a.failures += 1;
              a.stress = clamp(a.stress + 0.10);
              a.successRate = (a.successRate * 0.85);
              newEvents.push(mkEvent('TASK_FAIL', a, `${sc.name} — incomplete`));
            }
            a.scenarioId = null;
            a.state = 'idle';
            a.elapsed = 0;
            // small recovery
            a.cogLoad = clamp(a.cogLoad - 0.20);
          }
        } else {
          // idle decay
          a.cogLoad = clamp(a.cogLoad - 0.01 * ts);
          a.stress = clamp(a.stress - 0.015 * ts);
          a.focus = clamp(a.focus + 0.005 * ts, 0, 0.85);
          if (a.state !== 'idle') a.state = 'idle';
        }

        // burnout slowly accumulates with sustained high stress
        if (a.stress > 0.7) a.burnout = clamp(a.burnout + 0.003 * ts);
        else a.burnout = clamp(a.burnout - 0.001 * ts);

        return a;
      });

      // flush events / interventions (outside React update cycle)
      if (newEvents.length) {
        setEvents(prev => [...newEvents.reverse(), ...prev].slice(0, 80));
      }
      if (newInterventions.length) {
        setInterventions(prev => [...newInterventions.reverse(), ...prev].slice(0, 40));
      }
      return next;
    });
  }, []);

  // tick loop
  useEffect(() => {
    if (!running) return;
    const ms = 1000 / tickHz;
    const id = setInterval(() => stepOnce(), ms);
    return () => clearInterval(id);
  }, [running, tickHz, stepOnce]);

  const toggleRun = useCallback(() => setRunning(r => !r), []);
  const reset = useCallback(() => {
    setAvatars(WE.AVATARS.map((def, i) => spawnAvatar(def, WE.ROOMS[i % WE.ROOMS.length])));
    setEvents([]);
    setInterventions([]);
    setTickCount(0);
    setSimTime(0);
  }, []);

  return {
    avatars, events, interventions, tickCount, simTime, running,
    toggleRun, reset, stepOnce,
  };
};

function mkEvent(kind, avatar, text, scenarioId = null, who = null, meta = {}) {
  return {
    id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    t: Date.now(),
    kind, text, who, scenarioId,
    avatarId: avatar.id, avatarName: avatar.name, avatarHue: avatar.hue,
    ...meta,
  };
}

// expose
window.WE_SIM = { spawnAvatar, mkEvent };
