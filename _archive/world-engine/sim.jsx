// World Engine simulation core — life-sim tick loop, object interactions, event emission.
// Pure React state, no external deps. Runs at a configurable tick rate.

const { useState, useEffect, useRef, useCallback, useReducer } = React;
const WE = window.WE_DATA;

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

function getObject(id) {
  return id ? WE.OBJECTS_BY_ID[id] : null;
}

function objectForScenario(sc) {
  if (!sc) return null;
  return getObject(sc.objectId) || WE.OBJECTS.find((o) => o.room === sc.room) || null;
}

function atTile(a) {
  return a.px === a.tx && a.py === a.ty;
}

function pathToObject(a, obj) {
  a.room = obj.room;
  a.tx = obj.tx;
  a.ty = obj.ty;
  a.state = 'walking';
}

function beginScenarioAtObject(a, obj, sc, newEvents) {
  a.currentObjectId = obj.id;
  a.targetObjectId = null;
  a.pendingScenarioId = null;
  a.scenarioId = sc.id;
  a.expected = sc.minutes;
  a.elapsed = 0;
  a.state = 'working';
  a.room = obj.room;
  a.px = obj.tx;
  a.py = obj.ty;
  newEvents.push(mkEvent('INTERACTION_STARTED', a, `using ${obj.name} — ${obj.interaction}`, sc.id, null, {
    objectId: obj.id,
    interaction: obj.interaction,
  }));
  newEvents.push(mkEvent('USE_OBJECT', a, `${obj.interaction} at ${obj.name}`, sc.id, null, { objectId: obj.id }));
  newEvents.push(mkEvent('TASK_START', a, `started ${sc.name}`, sc.id, null, { objectId: obj.id }));
}

function arriveAtObject(a, obj, newEvents) {
  if (a.pendingScenarioId) {
    const sc = WE.SCENARIOS.find((s) => s.id === a.pendingScenarioId);
    if (sc) beginScenarioAtObject(a, obj, sc, newEvents);
    else {
      a.pendingScenarioId = null;
      a.targetObjectId = null;
      a.state = 'idle';
    }
    return;
  }
  if (obj.restGain > 0) {
    a.currentObjectId = obj.id;
    a.targetObjectId = null;
    a.state = 'idle';
    a.energy = clamp(a.energy + obj.restGain);
    newEvents.push(mkEvent('NEED_RECOVER', a, `rested at ${obj.name}`, null, null, { objectId: obj.id }));
  }
}

function queueScenario(a, sc, newEvents) {
  const obj = objectForScenario(sc);
  if (!obj) return false;
  a.pendingScenarioId = sc.id;
  a.targetObjectId = obj.id;
  pathToObject(a, obj);
  newEvents.push(mkEvent('MOVE_TO_OBJECT', a, `heading to ${obj.name}`, sc.id, null, { objectId: obj.id }));
  return true;
}

function queueRest(a, newEvents) {
  const restObj = getObject('home_sofa') || WE.OBJECTS.find((o) => o.restGain > 0);
  if (!restObj || a.targetObjectId === restObj.id) return;
  a.pendingScenarioId = null;
  a.targetObjectId = restObj.id;
  pathToObject(a, restObj);
  newEvents.push(mkEvent('MOVE_TO_OBJECT', a, `heading to ${restObj.name} to recover`, null, null, { objectId: restObj.id }));
}

function spawnAvatar(def, spawnObj) {
  return {
    ...def,
    state: 'idle',
    emotional: 'neutral',
    focus: 0.65 + rng() * 0.15,
    cogLoad: 0.20 + rng() * 0.10,
    stress: 0.15 + rng() * 0.10,
    energy: 0.72 + rng() * 0.12,
    burnout: 0.05,
    independence: 0.20 + rng() * 0.30,
    fusionReady: 0.0,
    successRate: 0.50,
    scenarioId: null,
    pendingScenarioId: null,
    targetObjectId: null,
    currentObjectId: null,
    elapsed: 0,
    expected: 0,
    minutesFocused: 0,
    falseStarts: 0,
    interventions: 0,
    successes: 0,
    failures: 0,
    room: spawnObj.room,
    px: spawnObj.tx,
    py: spawnObj.ty,
    tx: spawnObj.tx,
    ty: spawnObj.ty,
    moveT: 0,
    facing: 'south',
    lastEventTick: 0,
  };
}

function makeInitialWorldState() {
  const spawnObj = getObject(WE.SPAWN_OBJECT_ID) || WE.OBJECTS[0];
  return {
    avatars: WE.AVATARS.map((def) => spawnAvatar(def, spawnObj)),
    events: [],
    interventions: [],
  };
}

function tickMovement(a) {
  if (a.px === a.tx && a.py === a.ty) return false;
  const dx = Math.sign(a.tx - a.px);
  const dy = Math.sign(a.ty - a.py);
  if (rng() < 0.58) {
    a.px += dx;
    if (a.px === a.tx && dy) a.py += dy;
  } else if (dy) {
    a.py += dy;
  } else if (dx) {
    a.px += dx;
  }
  a.facing = dx > 0 ? 'east' : dx < 0 ? 'west' : dy > 0 ? 'south' : 'north';
  return true;
}

function tickScenario(a, sc, ts, dysOn, threshold, bias, newEvents, newInterventions) {
  a.elapsed += ts;

  const loadGain = (sc.cog * 0.04) * ts;
  a.cogLoad = clamp(a.cogLoad + loadGain * (dysOn ? 1 : 0.4));
  if (sc.sustained && dysOn) {
    a.focus = clamp(a.focus - bias.drift * 0.02 * ts);
  }
  if (sc.aversive > 0.5 && dysOn) {
    a.stress = clamp(a.stress + bias.stress * 0.015 * ts);
  }
  a.energy = clamp(a.energy - WE.MOTIVE_DECAY.energyPerMinute * ts * 1.15);

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
    const roomNpcs = WE.NPCS.filter((n) => n.room === a.room && !n.invisible);
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
    a.currentObjectId = null;
    a.state = 'idle';
    a.elapsed = 0;
    a.cogLoad = clamp(a.cogLoad - 0.20);
  }
}

function worldReducer(state, action) {
  switch (action.type) {
    case 'tick': {
      const { ts, dysOn, threshold } = action;
      const newEvents = [];
      const newInterventions = [];
      const decay = WE.MOTIVE_DECAY;

      const nextAvatars = state.avatars.map((av) => {
        const a = { ...av };
        const bias = FLAVOR_BIAS[a.flavor] || FLAVOR_BIAS.attention;

        if (a.state === 'walking' || a.targetObjectId) {
          tickMovement(a);
          if (atTile(a) && a.targetObjectId) {
            const obj = getObject(a.targetObjectId);
            if (obj) arriveAtObject(a, obj, newEvents);
          }
        }

        if (a.scenarioId) {
          const sc = WE.SCENARIOS.find((s) => s.id === a.scenarioId);
          if (sc) tickScenario(a, sc, ts, dysOn, threshold, bias, newEvents, newInterventions);
        } else if (!a.targetObjectId && !a.pendingScenarioId) {
          a.energy = clamp(a.energy - decay.energyPerMinute * ts);
          if (a.energy < decay.lowEnergyThreshold && a.state === 'idle' && rng() < 0.08 * ts) {
            newEvents.push(mkEvent('NEED_LOW', a, 'energy running low', null, null, { motive: 'energy', value: a.energy }));
          }
          if (a.energy < decay.lowEnergyThreshold && !a.scenarioId && rng() < 0.06 * ts) {
            queueRest(a, newEvents);
          } else if (rng() < decay.autonomyPickRate * ts) {
            queueScenario(a, pick(WE.SCENARIOS), newEvents);
          }
          a.cogLoad = clamp(a.cogLoad - 0.01 * ts);
          a.stress = clamp(a.stress - 0.015 * ts);
          a.focus = clamp(a.focus + 0.005 * ts, 0, 0.85);
          if (a.state !== 'walking') a.state = 'idle';
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
    case 'assign': {
      const { avatarId, scenario } = action;
      const sc = scenario || WE.SCENARIOS.find((s) => s.id === action.scenarioId);
      if (!sc) return state;
      const assignEvents = [];
      const avatars = state.avatars.map((a) => {
        if (a.id !== avatarId) return a;
        const next = { ...a, scenarioId: null, currentObjectId: null, elapsed: 0, expected: sc.minutes };
        if (!queueScenario(next, sc, assignEvents)) return a;
        return next;
      });
      return {
        avatars,
        events: assignEvents.length
          ? [...assignEvents.reverse(), ...state.events].slice(0, 80)
          : state.events,
        interventions: state.interventions,
      };
    }
    case 'reset':
      return makeInitialWorldState();
    default:
      return state;
  }
}

window.useWorldEngine = function useWorldEngine(opts = {}) {
  const {
    tickHz = 4,
    timeScale = 1.0,
    dysfunctionOn = true,
    urgencyThreshold = 0.6,
  } = opts;

  const [tickCount, setTickCount] = useState(0);
  const [simTime, setSimTime] = useState(0);
  const [running, setRunning] = useState(true);
  const [world, dispatch] = useReducer(worldReducer, undefined, makeInitialWorldState);

  const optsRef = useRef({ dysfunctionOn, urgencyThreshold, timeScale });
  optsRef.current = { dysfunctionOn, urgencyThreshold, timeScale };

  const stepOnce = useCallback(() => {
    const cur = optsRef.current;
    setTickCount((t) => t + 1);
    setSimTime((t) => t + cur.timeScale);
    dispatch({
      type: 'tick',
      ts: cur.timeScale,
      dysOn: cur.dysfunctionOn,
      threshold: cur.urgencyThreshold,
    });
  }, []);

  const assignScenario = useCallback((avatarId, scenarioId) => {
    const scenario = WE.SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return;
    dispatch({ type: 'assign', avatarId, scenario });
  }, []);

  useEffect(() => {
    if (!running) return;
    const ms = 1000 / tickHz;
    const id = setInterval(() => stepOnce(), ms);
    return () => clearInterval(id);
  }, [running, tickHz, stepOnce]);

  const toggleRun = useCallback(() => setRunning((r) => !r), []);
  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
    setTickCount(0);
    setSimTime(0);
  }, []);

  return {
    avatars: world.avatars,
    events: world.events,
    interventions: world.interventions,
    tickCount, simTime, running,
    toggleRun, reset, stepOnce, assignScenario,
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
window._useWorldEngineOffline = window.useWorldEngine;
