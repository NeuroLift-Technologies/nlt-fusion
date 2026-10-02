// World Engine simulation hook — live SSE viewer or offline fallback.
// In live mode the Python kernel is authoritative; this module is a pure projection.

const { useState, useEffect, useRef, useCallback } = React;

const LIVE_SERVICE_URL = (() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('live') === '0') return null;
  if (params.get('live') === '1' || window.WE_SERVICE_URL) {
    return window.WE_SERVICE_URL || 'http://127.0.0.1:8765';
  }
  return window.WE_SERVICE_URL || null;
})();

function contractAvatarToSim(id, av, def) {
  const pos = av.position || {};
  const metrics = av.metrics || {};
  const counters = av.counters || {};
  const ext = av.extensions || {};
  return {
    id,
    name: av.name,
    trait: av.trait,
    tag: ext.tag || (def && def.tag) || 'SA',
    hue: ext.hue != null ? ext.hue : (def && def.hue) || 200,
    blurb: (def && def.blurb) || '',
    state: av.state || 'idle',
    emotional: av.emotional_state || 'neutral',
    focus: metrics.focus ?? 0.65,
    cogLoad: metrics.cognitive_load ?? 0.2,
    stress: metrics.stress ?? 0.15,
    burnout: metrics.burnout_risk ?? 0.05,
    independence: metrics.independence ?? 0.2,
    fusionReady: metrics.fusion_readiness ?? 0,
    successRate: metrics.success_rate ?? 0.5,
    scenarioId: av.scenario ? av.scenario.id : null,
    elapsed: av.scenario ? av.scenario.elapsed : 0,
    expected: av.scenario ? av.scenario.expected : 0,
    minutesFocused: counters.minutes_focused || 0,
    falseStarts: counters.false_starts || 0,
    interventions: counters.interventions || 0,
    successes: counters.successes || 0,
    failures: counters.failures || 0,
    room: pos.room_id || 'bedroom',
    px: pos.x ?? 0,
    py: pos.y ?? 0,
    tx: pos.target_x ?? pos.x ?? 0,
    ty: pos.target_y ?? pos.y ?? 0,
    facing: pos.facing || 'south',
    lastEventTick: 0,
  };
}

const EVENT_KIND_MAP = {
  'scenario.assigned': 'TASK_START',
  'struggle.focus_drift': 'FOCUS_DRIFT',
  'aide.coaching_delivered': 'COACHING_INTERVENTION',
  'scenario.completed': 'TASK_COMPLETE',
  'simulation.tick': 'TICK',
};

function contractEventToSim(evt, avatarHue) {
  const kind = EVENT_KIND_MAP[evt.event_type] || evt.event_type;
  return {
    id: evt.event_id,
    t: Date.now(),
    kind,
    text: evt.message,
    who: evt.source ? evt.source.id : null,
    scenarioId: evt.scenario_id,
    avatarId: evt.subject_id,
    avatarName: evt.subject_id,
    avatarHue: avatarHue || 200,
  };
}

function interventionToSim(item) {
  return {
    id: item.intervention_id,
    t: Date.now(),
    kind: 'COACHING_INTERVENTION',
    text: `${item.aide_id} → "${item.strategy}"`,
    who: item.aide_id,
    avatarId: item.avatar_id,
    aide: item.aide_id,
    strategy: item.strategy,
    effectiveness: item.effectiveness,
  };
}

async function postControl(baseUrl, action, payload = {}) {
  const res = await fetch(`${baseUrl}/api/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

function useLiveWorldEngine(serviceUrl, opts = {}) {
  const WE = window.WE_DATA;
  const [avatars, setAvatars] = useState([]);
  const [events, setEvents] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [tickCount, setTickCount] = useState(0);
  const [simTime, setSimTime] = useState(0);
  const [running, setRunning] = useState(true);
  const [connected, setConnected] = useState(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const applyBundle = useCallback((bundle) => {
    const snapshot = bundle.snapshot || bundle;
    const sim = snapshot.simulation || {};
    setTickCount(sim.tick || 0);
    setSimTime(sim.sim_time || 0);
    setRunning(sim.state === 'running');

    const nextAvatars = Object.entries(snapshot.avatars || {}).map(([id, av]) => {
      const def = WE.AVATARS.find(a => a.id === id);
      return contractAvatarToSim(id, av, def);
    });
    setAvatars(nextAvatars.length ? nextAvatars : []);

    if (bundle.events && bundle.events.length) {
      const mapped = bundle.events.map(evt => contractEventToSim(evt, 200));
      setEvents(prev => [...mapped.reverse(), ...prev].slice(0, 80));
    }
    if (bundle.interventions) {
      setInterventions(bundle.interventions.map(interventionToSim).slice(0, 40));
    }
  }, []);

  useEffect(() => {
    let source;
    let cancelled = false;

    (async () => {
      try {
        const sceneRes = await fetch(`${serviceUrl}/api/scene`);
        if (cancelled) return;
        if (sceneRes.ok) {
          const scene = await sceneRes.json();
          if (cancelled) return;
          window.WE_SCENE = scene;
        }
      } catch (_) { /* offline service */ }

      if (cancelled) return;

      source = new EventSource(`${serviceUrl}/api/stream`);
      source.addEventListener('init', (e) => {
        if (cancelled) return;
        setConnected(true);
        applyBundle(JSON.parse(e.data));
      });
      source.addEventListener('update', (e) => {
        if (cancelled) return;
        applyBundle(JSON.parse(e.data));
      });
      source.onerror = () => {
        if (cancelled) return;
        setConnected(false);
      };
    })();

    return () => {
      cancelled = true;
      if (source) source.close();
    };
  }, [serviceUrl, applyBundle]);

  const toggleRun = useCallback(async () => {
    const result = await postControl(serviceUrl, 'toggle');
    if (result.status) applyBundle(result.status);
  }, [serviceUrl, applyBundle]);

  const reset = useCallback(async () => {
    await postControl(serviceUrl, 'reset', { seed: 42, pace: optsRef.current.pace || 2 });
    setEvents([]);
    setInterventions([]);
  }, [serviceUrl]);

  const stepOnce = useCallback(async () => {
    const result = await postControl(serviceUrl, 'step');
    if (result.status) applyBundle(result.status);
  }, [serviceUrl, applyBundle]);

  const assignScenario = useCallback(async (avatarId, scenarioId) => {
    await postControl(serviceUrl, 'assign_scenario', {
      agent_id: avatarId,
      scenario_id: scenarioId,
    });
  }, [serviceUrl]);

  return {
    avatars,
    events,
    interventions,
    tickCount,
    simTime,
    running,
    connected,
    live: true,
    serviceUrl,
    toggleRun,
    reset,
    stepOnce,
    assignScenario,
  };
}

// Legacy offline tick loop retained for ?live=0 demos without the Python service.
window.useWorldEngine = function useWorldEngine(opts = {}) {
  if (LIVE_SERVICE_URL) {
    return useLiveWorldEngine(LIVE_SERVICE_URL, opts);
  }

  const legacy = window._useWorldEngineOffline;
  if (!legacy) {
    throw new Error('Offline sim hook not loaded — include sim-offline.jsx or start the Python service.');
  }
  return legacy(opts);
};
