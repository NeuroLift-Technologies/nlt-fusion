// World Engine — shared sim core: avatars, scenarios, tick logic, hooks.
// Globals exposed at end of file. Consumed by all world views.

// ---------- ADHD-trait Avatars (19 named) ----------
const AVATARS = [
  { id: 'stay_alert',     name: 'StayAlert',       trait: 'Sustained Attention',  initials: 'SA', hue: 172, attn: 0.45, init: 0.85, soc: 0.60 },
  { id: 'task_kickstart', name: 'TaskKickstart',   trait: 'Task Initiation',      initials: 'TK', hue:  38, attn: 0.70, init: 0.30, soc: 0.55 },
  { id: 'focus_flow',     name: 'FocusFlow',       trait: 'Hyperfocus / Switch',  initials: 'FF', hue: 217, attn: 0.55, init: 0.65, soc: 0.45 },
  { id: 'memory_mate',    name: 'MemoryMate',      trait: 'Working Memory',       initials: 'MM', hue: 270, attn: 0.65, init: 0.60, soc: 0.62 },
  { id: 'time_keeper',    name: 'TimeKeeper',      trait: 'Time Perception',      initials: 'TM', hue:   0, attn: 0.60, init: 0.55, soc: 0.50 },
  { id: 'prioritize_it',  name: 'PrioritizeIt',    trait: 'Prioritization',       initials: 'PR', hue: 152, attn: 0.50, init: 0.70, soc: 0.55 },
  { id: 'emo_steady',     name: 'EmoSteady',       trait: 'Emotional Regulation', initials: 'ES', hue: 199, attn: 0.62, init: 0.58, soc: 0.40 },
  { id: 'impulse_guard',  name: 'ImpulseGuard',    trait: 'Impulse Control',      initials: 'IG', hue: 345, attn: 0.55, init: 0.78, soc: 0.42 },
  { id: 'social_cue',     name: 'SocialCue',       trait: 'Social Cues',          initials: 'SC', hue: 258, attn: 0.68, init: 0.60, soc: 0.30 },
  { id: 'transition',     name: 'TransitionEase',  trait: 'Task Switching',       initials: 'TE', hue:  42, attn: 0.50, init: 0.50, soc: 0.55 },
  { id: 'organize_well',  name: 'OrganizeWell',    trait: 'Organization',         initials: 'OW', hue: 189, attn: 0.60, init: 0.55, soc: 0.58 },
  { id: 'follow_thru',    name: 'FollowThru',      trait: 'Task Completion',      initials: 'FT', hue: 138, attn: 0.55, init: 0.45, soc: 0.55 },
  { id: 'listen_in',      name: 'ListenIn',        trait: 'Active Listening',     initials: 'LI', hue:  48, attn: 0.50, init: 0.65, soc: 0.45 },
  { id: 'fidget_flow',    name: 'FidgetFlow',      trait: 'Physical Restless.',   initials: 'FX', hue: 322, attn: 0.45, init: 0.75, soc: 0.60 },
  { id: 'restore_calm',   name: 'RestoreCalm',     trait: 'Stress Recovery',      initials: 'RC', hue: 142, attn: 0.65, init: 0.50, soc: 0.65 },
  { id: 'boundary_set',   name: 'BoundarySet',     trait: 'Boundary Setting',     initials: 'BS', hue:  24, attn: 0.55, init: 0.60, soc: 0.35 },
  { id: 'plan_ahead',     name: 'PlanAhead',       trait: 'Forward Planning',     initials: 'PA', hue: 186, attn: 0.62, init: 0.40, soc: 0.55 },
  { id: 'self_monitor',   name: 'SelfMonitor',     trait: 'Self-Awareness',       initials: 'SM', hue: 290, attn: 0.58, init: 0.58, soc: 0.50 },
  { id: 'motivate_me',    name: 'MotivateMe',      trait: 'Motivation',           initials: 'MV', hue:  52, attn: 0.48, init: 0.25, soc: 0.55 },
];

// ---------- Scenarios (rooms as grids) ----------
// Grid coords are tile units (column, row). Objects/NPCs occupy a tile.
const SCENARIOS = [
  {
    id: 'email_processing',
    name: 'Email Processing',
    location: 'Workplace · Open Office',
    complexity: 0.55,
    duration: 25,
    dysfunction: ['interruption_cascade', 'biased_manager'],
    width: 16, height: 10,
    walls: [], // borders auto-drawn
    objects: [
      { kind: 'desk',       x: 3,  y: 3, w: 2, h: 1, label: 'Workstation', anchor: true },
      { kind: 'monitor',    x: 3,  y: 2, label: 'Inbox · 47 unread' },
      { kind: 'chair',      x: 3,  y: 4 },
      { kind: 'desk',       x: 9,  y: 3, w: 2, h: 1 },
      { kind: 'monitor',    x: 9,  y: 2, label: 'Dashboard' },
      { kind: 'chair',      x: 9,  y: 4 },
      { kind: 'desk',       x: 3,  y: 7, w: 2, h: 1 },
      { kind: 'monitor',    x: 3,  y: 6 },
      { kind: 'chair',      x: 3,  y: 8 },
      { kind: 'desk',       x: 9,  y: 7, w: 2, h: 1 },
      { kind: 'monitor',    x: 9,  y: 6 },
      { kind: 'chair',      x: 9,  y: 8 },
      { kind: 'coffee',     x: 14, y: 1, label: 'Espresso' },
      { kind: 'printer',    x: 14, y: 5, label: 'Printer' },
      { kind: 'plant',      x: 15, y: 8 },
      { kind: 'plant',      x: 0,  y: 0 },
      { kind: 'whiteboard', x: 6,  y: 0, w: 3, h: 1, label: 'Q3 OKRs' },
      { kind: 'door',       x: 0,  y: 5, label: 'Entrance' },
    ],
    npcs: [
      { id: 'marcus',  name: 'Marcus',  role: 'Peer',     bias: 'supportive', x: 6,  y: 4 },
      { id: 'diane',   name: 'Diane',   role: 'Manager',  bias: 'biased',     x: 13, y: 3 },
      { id: 'priya',   name: 'Priya',   role: 'Peer',     bias: 'neutral',    x: 7,  y: 7 },
    ],
    tasks: [
      { id: 't1', label: 'Triage 12 urgent', target: 'monitor', minutes: 6 },
      { id: 't2', label: 'Reply to client', target: 'monitor', minutes: 4 },
      { id: 't3', label: 'Archive newsletters', target: 'monitor', minutes: 3 },
      { id: 't4', label: 'Flag follow-ups', target: 'monitor', minutes: 2 },
    ],
  },
  {
    id: 'deadline_crunch',
    name: 'Deadline Crunch',
    location: 'Workplace · Focus Pod',
    complexity: 0.85,
    duration: 45,
    dysfunction: ['time_pressure', 'shifting_requirements', 'critical_review'],
    width: 14, height: 8,
    objects: [
      { kind: 'desk',       x: 5, y: 3, w: 3, h: 1, anchor: true },
      { kind: 'monitor',    x: 5, y: 2, label: 'Spec · revision 11' },
      { kind: 'monitor',    x: 7, y: 2, label: 'Slack · 23 pings' },
      { kind: 'chair',      x: 6, y: 4 },
      { kind: 'whiteboard', x: 0, y: 1, w: 2, h: 1, label: 'Timeline · OVERDUE' },
      { kind: 'coffee',     x: 12, y: 1, label: '4th coffee' },
      { kind: 'clock',      x: 13, y: 0, label: '23:47' },
      { kind: 'plant',      x: 0, y: 7 },
      { kind: 'door',       x: 0, y: 4 },
    ],
    npcs: [
      { id: 'stakeholder', name: 'Roland',  role: 'Stakeholder', bias: 'biased',     x: 11, y: 4 },
      { id: 'teammate',    name: 'Sasha',   role: 'Peer',        bias: 'supportive', x: 9,  y: 5 },
    ],
    tasks: [
      { id: 't1', label: 'Ship v2 spec',  target: 'monitor', minutes: 18 },
      { id: 't2', label: 'Resolve 12 PR comments', target: 'monitor', minutes: 14 },
      { id: 't3', label: 'Update timeline', target: 'whiteboard', minutes: 6 },
    ],
  },
  {
    id: 'meeting_participation',
    name: 'Meeting Participation',
    location: 'Conference · Pacific Room',
    complexity: 0.70,
    duration: 30,
    dysfunction: ['overlapping_speakers', 'agenda_drift'],
    width: 13, height: 9,
    objects: [
      { kind: 'table',      x: 3, y: 3, w: 6, h: 2, label: 'Conference table', anchor: true },
      { kind: 'chair',      x: 3, y: 2 }, { kind: 'chair', x: 5, y: 2 }, { kind: 'chair', x: 7, y: 2 },
      { kind: 'chair',      x: 3, y: 5 }, { kind: 'chair', x: 5, y: 5 }, { kind: 'chair', x: 7, y: 5 },
      { kind: 'monitor',    x: 10, y: 3, w: 2, h: 1, label: 'Slides · 14/22' },
      { kind: 'whiteboard', x: 0, y: 1, w: 2, h: 1, label: 'Agenda' },
      { kind: 'plant',      x: 12, y: 7 },
      { kind: 'door',       x: 0, y: 7 },
    ],
    npcs: [
      { id: 'host',  name: 'Aisha',  role: 'Host',     bias: 'neutral',    x: 5,  y: 2 },
      { id: 'loud',  name: 'Travis', role: 'Peer',     bias: 'biased',     x: 7,  y: 2 },
      { id: 'ally',  name: 'Jun',    role: 'Peer',     bias: 'supportive', x: 3,  y: 5 },
      { id: 'quiet', name: 'Reema',  role: 'Peer',     bias: 'neutral',    x: 5,  y: 5 },
    ],
    tasks: [
      { id: 't1', label: 'Track agenda', target: 'whiteboard', minutes: 8 },
      { id: 't2', label: 'Speak point ×2', target: 'table', minutes: 10 },
      { id: 't3', label: 'Capture decisions', target: 'monitor', minutes: 7 },
    ],
  },
  {
    id: 'household_cleaning',
    name: 'Household Cleaning',
    location: 'Home · Kitchen',
    complexity: 0.40,
    duration: 20,
    dysfunction: ['low_dopamine_task', 'environment_overwhelm'],
    width: 12, height: 8,
    objects: [
      { kind: 'sink',       x: 2, y: 1, w: 2, h: 1, label: 'Sink · 14 dishes', anchor: true },
      { kind: 'stove',      x: 5, y: 1, w: 2, h: 1, label: 'Stove' },
      { kind: 'fridge',     x: 8, y: 1, label: 'Fridge' },
      { kind: 'table',      x: 4, y: 4, w: 3, h: 2 },
      { kind: 'chair',      x: 3, y: 4 }, { kind: 'chair', x: 7, y: 4 },
      { kind: 'plant',      x: 11, y: 7 }, { kind: 'plant', x: 0, y: 7 },
      { kind: 'door',       x: 11, y: 4, label: 'Living room' },
      { kind: 'window',     x: 0, y: 2, label: 'Window' },
    ],
    npcs: [
      { id: 'partner', name: 'Jess', role: 'Partner', bias: 'supportive', x: 9, y: 5 },
    ],
    tasks: [
      { id: 't1', label: 'Wash dishes',  target: 'sink', minutes: 9 },
      { id: 't2', label: 'Wipe counters', target: 'stove', minutes: 4 },
      { id: 't3', label: 'Clear table', target: 'table', minutes: 4 },
    ],
  },
  {
    id: 'phone_conversation',
    name: 'Phone Conversation',
    location: 'Home · Living Room',
    complexity: 0.50,
    duration: 12,
    dysfunction: ['social_anxiety', 'silence_pressure'],
    width: 10, height: 7,
    objects: [
      { kind: 'sofa',  x: 3, y: 3, w: 3, h: 1, anchor: true, label: 'Sofa' },
      { kind: 'table', x: 4, y: 4 },
      { kind: 'plant', x: 0, y: 0 }, { kind: 'plant', x: 9, y: 6 },
      { kind: 'window', x: 0, y: 2 },
      { kind: 'door', x: 9, y: 3 },
      { kind: 'monitor', x: 7, y: 1, label: 'TV (muted)' },
    ],
    npcs: [
      { id: 'caller', name: 'Dr. Park', role: 'Caller', bias: 'neutral', x: 6, y: 2 },
    ],
    tasks: [
      { id: 't1', label: 'Confirm appt', target: 'sofa', minutes: 4 },
      { id: 't2', label: 'Answer 3 questions', target: 'sofa', minutes: 5 },
      { id: 't3', label: 'Reschedule follow-up', target: 'sofa', minutes: 3 },
    ],
  },
];

// ---------- Aide coaching techniques (drawn from repo) ----------
const COACHING_TECHNIQUES = {
  stay_alert:     ['Pomodoro · 15min', 'Anchor breath', 'Workspace reset', 'Distraction immunize', 'Refocus prompt'],
  task_kickstart: ['2-minute rule', 'Identify smallest step', 'Body-doubling', 'Implementation intent', 'Reduce friction'],
  focus_flow:     ['Set hyperfocus alarm', 'Pre-switch ritual', 'Time-box transition', 'External cue'],
  memory_mate:    ['Externalize working memory', 'Visual checklist', 'Repeat-back', 'Spaced rehearsal'],
  time_keeper:    ['Time visualization', 'Buffer +25%', 'Deadline backcast', 'Anchor events'],
  prioritize_it:  ['Eisenhower sort', 'One-thing rule', 'MIT method'],
  emo_steady:     ['Affect labeling', 'Box breathing', 'Cognitive reframe', 'Validation prompt'],
  impulse_guard:  ['STOP technique', '10-second delay', 'Pre-commitment'],
  social_cue:     ['Mirror script', 'Cue card', 'Pause-and-check'],
  transition:     ['5-min warning', 'Transition object', 'Soft launch'],
  organize_well:  ['Container method', 'Visual zones', 'Single-touch rule'],
  follow_thru:    ['Finish-before-new', 'Completion ritual', 'Done list'],
  listen_in:      ['Active recap', 'Note-anchor', 'Question prompt'],
  fidget_flow:    ['Movement break', 'Stim object', 'Stand desk cue'],
  restore_calm:   ['Sensory reset', 'Walk break', 'Cold water cue'],
  boundary_set:   ['Script rehearsal', 'Pre-approved no', 'Time-bound yes'],
  plan_ahead:     ['Tomorrow list', 'Calendar block', 'If-then plan'],
  self_monitor:   ['Check-in chime', 'Mood log', '5-min retro'],
  motivate_me:    ['Reward stacking', 'Why anchor', 'Body-double'],
};

// ---------- Sim hook ----------
// Drives a population of agents through a scenario.
// Each agent owns: position, target, task, focus, stress, cognitiveLoad, emotionalState, mood, burnoutRisk.
// Time advances at `timeScale` × wall-clock; one sim-minute = 1 second × timeScale.
const EMOTIONS = ['focused', 'calm', 'neutral', 'tense', 'frustrated', 'overwhelmed', 'energized', 'flat'];

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, lo=0, hi=1) { return Math.max(lo, Math.min(hi, v)); }

function makeAgent(avatar, scenario, idx, count) {
  // place around the room, near anchor object if any
  const anchor = scenario.objects.find(o => o.anchor) || { x: scenario.width/2, y: scenario.height/2 };
  const angle = (idx / count) * Math.PI * 2;
  const x = clamp(anchor.x + Math.cos(angle) * 2.5, 1, scenario.width - 2);
  const y = clamp(anchor.y + Math.sin(angle) * 2, 1, scenario.height - 2);
  return {
    id: avatar.id,
    avatar,
    x, y,
    tx: x, ty: y,         // target
    speed: 0.6 + Math.random() * 0.2,
    task: scenario.tasks[idx % scenario.tasks.length],
    taskProgress: 0,
    focus: avatar.attn + rand(-0.05, 0.05),
    stress: rand(0.10, 0.30),
    cognitiveLoad: rand(0.20, 0.40),
    emotional: 'neutral',
    mood: rand(0.5, 0.7),
    burnoutRisk: rand(0.05, 0.15),
    independence: rand(0.25, 0.55),
    completed: 0,
    interventions: 0,
    lastEvent: 0,
    facing: Math.random() * Math.PI * 2,
  };
}

function findTargetTile(scenario, taskTargetKind) {
  const cands = scenario.objects.filter(o => o.kind === taskTargetKind);
  const o = cands[Math.floor(Math.random() * Math.max(1, cands.length))] || scenario.objects[0];
  return { x: o.x + (o.w ? o.w/2 : 0.5), y: o.y + (o.h ? o.h/2 : 0.5) - 0.5 };
}

function useWorldSim({ scenarioId, avatarIds, timeScale = 1, running = true, dysfunction = true, urgency = 0.5, onEvent = null, seed = 0 }) {
  const scenario = React.useMemo(() => SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0], [scenarioId]);
  const avatars = React.useMemo(
    () => avatarIds.map(id => AVATARS.find(a => a.id === id)).filter(Boolean),
    [avatarIds]
  );

  const [tick, setTick] = React.useState(0);
  const [simSeconds, setSimSeconds] = React.useState(0);
  const agentsRef = React.useRef([]);
  const eventsRef = React.useRef([]);
  const interventionsRef = React.useRef([]);

  // (Re)build agents when scenario/avatars change
  React.useEffect(() => {
    agentsRef.current = avatars.map((a, i) => makeAgent(a, scenario, i, avatars.length));
    eventsRef.current = [{
      t: 0, kind: 'SESSION_START', tone: 'system',
      text: `Session opened · ${scenario.name} · ${avatars.length} avatars present`,
    }];
    interventionsRef.current = [];
    setSimSeconds(0);
    setTick(t => t + 1);
  }, [scenario.id, avatars.map(a => a.id).join(','), seed]);

  // Tick loop
  React.useEffect(() => {
    if (!running) return;
    let raf, last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000) * timeScale;
      last = now;
      stepWorld(agentsRef.current, scenario, dt, { dysfunction, urgency, eventsRef, interventionsRef, onEvent });
      setSimSeconds(s => s + dt);
      setTick(t => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, timeScale, dysfunction, urgency, scenario.id]);

  return {
    scenario,
    agents: agentsRef.current,
    events: eventsRef.current,
    interventions: interventionsRef.current,
    simSeconds,
    tick,
  };
}

function stepWorld(agents, scenario, dt, opts) {
  for (const ag of agents) {
    stepAgent(ag, scenario, dt, opts, agents);
  }
}

const EVENT_KINDS = {
  TASK_START:           { tone: 'task' },
  TASK_PROGRESS:        { tone: 'task' },
  TASK_COMPLETE:        { tone: 'success' },
  FOCUS_DRIFT:          { tone: 'warn' },
  HYPERFOCUS:           { tone: 'warn' },
  DISTRACTION:          { tone: 'warn' },
  NPC_INTERACTION:      { tone: 'social' },
  NPC_INTERRUPT:        { tone: 'warn' },
  COACHING_INTERVENTION:{ tone: 'aide' },
  EMOTIONAL_SHIFT:      { tone: 'mood' },
  BURNOUT_WARNING:      { tone: 'danger' },
  RECOVERY:             { tone: 'success' },
  DYSFUNCTION_INJECT:   { tone: 'danger' },
};

function logEvent(opts, simT, kind, agent, text, extra = {}) {
  const e = { t: simT, kind, tone: EVENT_KINDS[kind]?.tone || 'system', agent: agent?.id, agentName: agent?.avatar?.name, text, ...extra };
  opts.eventsRef.current.unshift(e);
  if (opts.eventsRef.current.length > 200) opts.eventsRef.current.length = 200;
  if (kind === 'COACHING_INTERVENTION') {
    opts.interventionsRef.current.unshift(e);
    if (opts.interventionsRef.current.length > 60) opts.interventionsRef.current.length = 60;
  }
  if (opts.onEvent) opts.onEvent(e);
}

function stepAgent(ag, scenario, dt, opts, all) {
  // movement toward target
  const dx = ag.tx - ag.x, dy = ag.ty - ag.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 0.05) {
    const v = ag.speed * dt * (1 - ag.stress * 0.3);
    ag.x += (dx / dist) * Math.min(v, dist);
    ag.y += (dy / dist) * Math.min(v, dist);
    ag.facing = Math.atan2(dy, dx);
  } else {
    // at target — work on task
    ag.taskProgress += dt * (0.012 + ag.focus * 0.02) * (1 - ag.cognitiveLoad * 0.4);
  }

  // organic state drift
  const drift = (avatarHue) => (Math.sin((Date.now() / 1000 + avatarHue) * 0.3) + 1) / 2;
  ag.focus = clamp(ag.focus + (ag.avatar.attn - ag.focus) * dt * 0.4 + (drift(ag.avatar.hue) - 0.5) * dt * 0.15);
  ag.cognitiveLoad = clamp(ag.cognitiveLoad + dt * 0.012 - (ag.focus > 0.6 ? dt * 0.006 : 0));
  ag.stress = clamp(ag.stress + dt * (0.005 + ag.cognitiveLoad * 0.008) * (opts.dysfunction ? 1.4 : 0.9) - dt * 0.004);
  ag.mood = clamp(ag.mood - dt * 0.005 + (ag.focus > 0.55 ? dt * 0.004 : 0));
  ag.burnoutRisk = clamp(ag.stress * 0.6 + ag.cognitiveLoad * 0.25 + (1 - ag.mood) * 0.15);

  // emotional state from trait
  if (ag.stress > 0.75) ag.emotional = 'overwhelmed';
  else if (ag.stress > 0.55) ag.emotional = 'tense';
  else if (ag.cognitiveLoad > 0.7) ag.emotional = 'frustrated';
  else if (ag.focus > 0.72) ag.emotional = 'focused';
  else if (ag.focus > 0.55 && ag.mood > 0.6) ag.emotional = 'energized';
  else if (ag.mood < 0.4) ag.emotional = 'flat';
  else ag.emotional = 'neutral';

  // random events — gated by avatar trait
  const simT = Date.now();
  if (simT - ag.lastEvent > 1400 + Math.random() * 2200) {
    ag.lastEvent = simT;
    const r = Math.random();
    const traitKey = ag.avatar.id === 'transition' ? 'transition' : ag.avatar.id;
    // pick event based on agent state
    if (ag.taskProgress >= 1) {
      ag.completed += 1;
      ag.taskProgress = 0;
      // pick next task
      const nextIdx = (scenario.tasks.indexOf(ag.task) + 1) % scenario.tasks.length;
      ag.task = scenario.tasks[nextIdx];
      const t = findTargetTile(scenario, ag.task.target);
      ag.tx = t.x; ag.ty = t.y;
      logEvent(opts, opts.eventsRef.current[0]?.t || 0, 'TASK_COMPLETE', ag, `Completed “${scenario.tasks[(nextIdx + scenario.tasks.length - 1) % scenario.tasks.length].label}”`);
      ag.stress = clamp(ag.stress - 0.08);
      ag.mood = clamp(ag.mood + 0.05);
      ag.independence = clamp(ag.independence + 0.02);
    } else if (r < 0.18 && ag.avatar.id === 'stay_alert' && opts.dysfunction) {
      ag.focus = clamp(ag.focus - 0.18);
      ag.cognitiveLoad = clamp(ag.cognitiveLoad + 0.08);
      logEvent(opts, simT, 'FOCUS_DRIFT', ag, `Attention drifted from ${ag.task.label}`);
    } else if (r < 0.30 && opts.dysfunction) {
      // NPC interrupt
      const npc = pick(scenario.npcs);
      ag.cognitiveLoad = clamp(ag.cognitiveLoad + 0.10);
      ag.stress = clamp(ag.stress + (npc.bias === 'biased' ? 0.10 : 0.04));
      logEvent(opts, simT, 'NPC_INTERRUPT', ag, `${npc.name} (${npc.role}) interrupted`, { npc: npc.id });
    } else if (r < 0.40) {
      const npc = pick(scenario.npcs);
      ag.mood = clamp(ag.mood + (npc.bias === 'supportive' ? 0.05 : 0));
      logEvent(opts, simT, 'NPC_INTERACTION', ag, `Exchanged with ${npc.name}`, { npc: npc.id });
    } else if (r < 0.50) {
      logEvent(opts, simT, 'TASK_PROGRESS', ag, `${Math.floor(ag.taskProgress * 100)}% on “${ag.task.label}”`);
    }

    // sometimes walk to a new spot
    if (Math.random() < 0.25 && dist < 0.1) {
      const t = findTargetTile(scenario, ag.task.target);
      ag.tx = clamp(t.x + rand(-0.8, 0.8), 0.5, scenario.width - 1);
      ag.ty = clamp(t.y + rand(-0.8, 0.8), 0.5, scenario.height - 1);
    }
  }

  // Aide intervention when crossing threshold
  if (ag.stress > opts.urgency || ag.burnoutRisk > 0.7 || ag.cognitiveLoad > 0.8) {
    if (Math.random() < dt * 0.6) {
      const tech = pick(COACHING_TECHNIQUES[ag.avatar.id] || COACHING_TECHNIQUES.stay_alert);
      ag.stress = clamp(ag.stress - 0.18);
      ag.cognitiveLoad = clamp(ag.cognitiveLoad - 0.10);
      ag.mood = clamp(ag.mood + 0.07);
      ag.focus = clamp(ag.focus + 0.10);
      ag.interventions += 1;
      logEvent(opts, Date.now(), 'COACHING_INTERVENTION', ag, `Aide applied “${tech}”`, { technique: tech });
    }
  }
}

// ---------- Helpers exposed for views ----------
function emotionalColor(emo) {
  switch (emo) {
    case 'focused':     return '#5eead4';
    case 'energized':   return '#fbbf24';
    case 'calm':        return '#67e8f9';
    case 'neutral':     return '#94a3b8';
    case 'tense':       return '#fb923c';
    case 'frustrated':  return '#fb7185';
    case 'overwhelmed': return '#ef4444';
    case 'flat':        return '#64748b';
    default:            return '#94a3b8';
  }
}

function formatSimTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

Object.assign(window, {
  AVATARS, SCENARIOS, COACHING_TECHNIQUES,
  useWorldSim, emotionalColor, formatSimTime,
});
