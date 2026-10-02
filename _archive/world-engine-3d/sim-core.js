// Pure sim core extracted from sim.jsx — vanilla JS, no React.
// Uses the same WE_DATA structures from data.js.
window.WE_SIM_CORE = (function () {
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const rng = (() => {
    let s = 1337;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return (s & 0xfffffff) / 0xfffffff;
    };
  })();
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

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

  function spawnAvatar(def, room) {
    return {
      ...def,
      state: 'idle',
      emotional: 'neutral',
      focus: 0.65 + rng() * 0.15,
      cogLoad: 0.20 + rng() * 0.10,
      stress: 0.15 + rng() * 0.10,
      burnout: 0.05,
      independence: 0.20 + rng() * 0.30,
      fusionReady: 0.0,
      successRate: 0.50,
      scenarioId: null,
      elapsed: 0,
      expected: 0,
      minutesFocused: 0,
      falseStarts: 0,
      interventions: 0,
      successes: 0,
      failures: 0,
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

  function makeInitialWorldState() {
    const WE = window.WE_DATA;
    return {
      avatars: WE.AVATARS.map((def, i) => spawnAvatar(def, WE.ROOMS[i % WE.ROOMS.length])),
      events: [],
      interventions: [],
    };
  }

  function mkEvent(kind, avatar, text, scenarioId = null, who = null, meta = {}) {
    return {
      id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      t: Date.now(),
      kind, text, who, scenarioId,
      avatarId: avatar.id, avatarName: avatar.name, avatarHue: avatar.hue,
      ...meta,
    };
  }

  function tickWorld(state, action) {
    const { ts, dysOn, threshold } = action;
    const WE = window.WE_DATA;
    const newEvents = [];
    const newInterventions = [];

    const nextAvatars = state.avatars.map(av => {
      const a = { ...av };
      const bias = FLAVOR_BIAS[a.flavor] || FLAVOR_BIAS.attention;

      // Spatial movement
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
        const room = WE.ROOMS.find(r => r.id === a.room);
        if (room) {
          a.tx = room.x + Math.floor(rng() * room.w);
          a.ty = room.y + Math.floor(rng() * room.h);
        }
      }

      // Assign scenario
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

      // Scenario progress
      if (a.scenarioId) {
        const sc = WE.SCENARIOS.find(s => s.id === a.scenarioId);
        a.elapsed += ts;

        const loadGain = (sc.cog * 0.04) * ts;
        a.cogLoad = clamp(a.cogLoad + loadGain * (dysOn ? 1 : 0.4));
        if (sc.sustained && dysOn) {
          a.focus = clamp(a.focus - bias.drift * 0.02 * ts);
        }
        if (sc.aversive > 0.5 && dysOn) {
          a.stress = clamp(a.stress + bias.stress * 0.015 * ts);
        }

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

        if (['office', 'meeting', 'lounge'].includes(a.room) && rng() < 0.04 * ts && dysOn) {
          const roomNpcs = WE.NPCS.filter(n => n.room === a.room && !n.invisible);
          if (roomNpcs.length > 0) {
            const npc = pick(roomNpcs);
            a.focus = clamp(a.focus - 0.08);
            a.cogLoad = clamp(a.cogLoad + 0.05);
            newEvents.push(mkEvent('NPC_INTERRUPT', a, `${npc.name} interrupted`, null, npc.name));
          }
        }

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
          a.cogLoad = clamp(a.cogLoad - 0.20);
        }
      } else {
        a.cogLoad = clamp(a.cogLoad - 0.01 * ts);
        a.stress = clamp(a.stress - 0.015 * ts);
        a.focus = clamp(a.focus + 0.005 * ts, 0, 0.85);
        if (a.state !== 'idle') a.state = 'idle';
      }

      if (a.stress > 0.7) a.burnout = clamp(a.burnout + 0.003 * ts);
      else a.burnout = clamp(a.burnout - 0.001 * ts);

      return a;
    });

    return {
      avatars: nextAvatars,
      events: newEvents.length
        ? [...newEvents.reverse(), ...state.events].slice(0, 80)
        : state.events,
      interventions: newInterventions.length
        ? [...newInterventions.reverse(), ...state.interventions].slice(0, 40)
        : state.interventions,
    };
  }

  return { makeInitialWorldState, tickWorld, spawnAvatar, mkEvent, rng, clamp, FLAVOR_BIAS };
})();
