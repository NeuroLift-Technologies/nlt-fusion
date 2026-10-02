// World Engine — static data: avatars, aides, scenarios, world map
// All 19 ADHD-trait avatars from the NeuroLift roster, plus their paired Aides.

window.WE_DATA = (function () {
  const AVATARS = [
    { id: 'stay_alert', name: 'StayAlert', trait: 'Sustained Attention', tag: 'SA', hue: 200,
      blurb: 'Drifts off long tasks. Vulnerable to hyperfocus.', flavor: 'attention' },
    { id: 'task_kick',  name: 'TaskKickstart', trait: 'Task Initiation', tag: 'TK', hue: 36,
      blurb: 'Knows what to do — can\'t start.', flavor: 'initiation' },
    { id: 'impulsa',    name: 'Impulsa', trait: 'Impulsivity', tag: 'IM', hue: 348,
      blurb: 'Acts before thinking. Quick to switch lanes.', flavor: 'impulse' },
    { id: 'memora',     name: 'Memora', trait: 'Working Memory', tag: 'WM', hue: 268,
      blurb: 'Loses the thread mid-sentence.', flavor: 'memory' },
    { id: 'timeblind',  name: 'TimeBlind', trait: 'Time Blindness', tag: 'TB', hue: 220,
      blurb: 'Now and not-now. No in-between.', flavor: 'time' },
    { id: 'emoflow',    name: 'EmoFlow', trait: 'Emotional Dysregulation', tag: 'ED', hue: 14,
      blurb: 'Feels everything at full volume.', flavor: 'emotion' },
    { id: 'hyperfocus', name: 'HyperFocus', trait: 'Hyperfocus', tag: 'HF', hue: 168,
      blurb: 'Tunnel vision. Forgets to eat.', flavor: 'focus' },
    { id: 'frustguard', name: 'FrustGuard', trait: 'Frustration Tolerance', tag: 'FT', hue: 4,
      blurb: 'Low ceiling on stuck-ness.', flavor: 'frustration' },
    { id: 'planpath',   name: 'PlanPath', trait: 'Planning Deficit', tag: 'PD', hue: 50,
      blurb: 'All ideas, no sequence.', flavor: 'planning' },
    { id: 'shiftease',  name: 'ShiftEase', trait: 'Transition Difficulty', tag: 'TD', hue: 290,
      blurb: 'Sticky between contexts.', flavor: 'transition' },
    { id: 'selfsee',    name: 'SelfSee', trait: 'Self-Monitoring', tag: 'SM', hue: 188,
      blurb: 'Can\'t tell if it\'s working.', flavor: 'monitor' },
    { id: 'impcheck',   name: 'ImpulseCheck', trait: 'Impulse Control', tag: 'IC', hue: 330,
      blurb: 'Knows the stop sign, ignores it.', flavor: 'impulse' },
    { id: 'focusflex',  name: 'FocusFlex', trait: 'Focus Fatigue', tag: 'FF', hue: 240,
      blurb: 'Burns out fast under cognitive load.', flavor: 'fatigue' },
    { id: 'effortmap',  name: 'EffortMap', trait: 'Effort Perception', tag: 'EP', hue: 84,
      blurb: 'Mis-estimates how hard tasks will feel.', flavor: 'effort' },
    { id: 'stressshld', name: 'StressShield', trait: 'Stress Sensitivity', tag: 'SS', hue: 26,
      blurb: 'Spikes early. Recovers slowly.', flavor: 'stress' },
    { id: 'senseguard', name: 'SenseGuard', trait: 'Sensory Sensitivity', tag: 'SG', hue: 158,
      blurb: 'Overwhelmed by noise, light, density.', flavor: 'sensory' },
    { id: 'socialbr',   name: 'SocialBridge', trait: 'Social Challenges', tag: 'SC', hue: 318,
      blurb: 'Loses the social thread quickly.', flavor: 'social' },
    { id: 'senseseek',  name: 'SenseSeek', trait: 'Sensory Seeking', tag: 'SK', hue: 100,
      blurb: 'Needs novelty, motion, input.', flavor: 'sensory' },
    { id: 'idcore',     name: 'IdentityCore', trait: 'Identity Challenges', tag: 'ID', hue: 280,
      blurb: 'Re-negotiates self under stress.', flavor: 'identity' },
  ];

  // Aides are paired by trait expertise.
  const AIDES = {
    stay_alert:  { name: 'Dr. Vance',     style: 'supportive skill-building', focus: 'pomodoro · anchoring · mental-fatigue mgmt' },
    task_kick:   { name: 'Coach Reyes',   style: 'gentle activation',         focus: 'two-minute starts · ladder steps · momentum' },
    impulsa:     { name: 'Dr. Okafor',    style: 'CBT-flavored',              focus: 'pause-name-choose · response delay · cues' },
    memora:      { name: 'Dr. Liang',     style: 'scaffolded',                focus: 'external memory · chunking · loop-backs' },
    timeblind:   { name: 'Coach Patel',   style: 'time-anchored',             focus: 'visible clocks · time-blocking · before/after' },
    emoflow:     { name: 'Dr. Aronson',   style: 'DBT-informed',              focus: 'name-the-wave · grounding · co-regulation' },
    hyperfocus:  { name: 'Coach Mei',     style: 'gentle boundary',           focus: 'externally-paced exits · transition rituals' },
    frustguard:  { name: 'Dr. Kahn',      style: 'frustration-cycle',         focus: 'breath-down · reframe · checkpoint return' },
    planpath:    { name: 'Coach Olsen',   style: 'task scaffolding',          focus: 'reverse-engineer · single next action' },
    shiftease:   { name: 'Dr. Holst',     style: 'transition coaching',       focus: 'warning windows · soft cuts · landing pads' },
    selfsee:     { name: 'Coach Brand',   style: 'metacognitive',             focus: 'noticing prompts · weekly reviews' },
    impcheck:    { name: 'Dr. Okafor',    style: 'CBT-flavored',              focus: 'if-then plans · response slots' },
    focusflex:   { name: 'Dr. Vance',     style: 'energy management',         focus: 'micro-rests · load shedding' },
    effortmap:   { name: 'Coach Olsen',   style: 'effort calibration',        focus: 'estimate-then-measure loops' },
    stressshld:  { name: 'Dr. Aronson',   style: 'arousal regulation',        focus: 'down-regulation · pre-load checks' },
    senseguard:  { name: 'Dr. Holst',     style: 'environmental design',      focus: 'sensory budget · safe-cave breaks' },
    socialbr:    { name: 'Coach Brand',   style: 'social skills',             focus: 'thread-tracking · exits · clarifying' },
    senseseek:   { name: 'Coach Mei',     style: 'stim channeling',           focus: 'movement breaks · texture · novelty' },
    idcore:      { name: 'Dr. Aronson',   style: 'narrative therapy',         focus: 'values check-in · self-compassion' },
  };

  // Scenarios pulled from src/simulation/environment/scenarios.py
  const SCENARIOS = [
    { id: 'wp_1', name: 'Email Processing', cat: 'workplace', room: 'office',
      desc: 'Process and respond to 20 emails', minutes: 30, complexity: 'medium', aversive: 0.4, cog: 0.5, base: 0.7,
      sustained: true, ctx: { interruptions: true, priority: 5 } },
    { id: 'wp_2', name: 'Report Writing', cat: 'workplace', room: 'office',
      desc: 'Write a 2000-word project report', minutes: 90, complexity: 'high', aversive: 0.6, cog: 0.8, base: 0.5,
      sustained: true, ctx: { deadline: true, research: true } },
    { id: 'wp_3', name: 'Meeting Participation', cat: 'workplace', room: 'meeting',
      desc: 'Active 1-hour team meeting', minutes: 60, complexity: 'medium', aversive: 0.3, cog: 0.6, base: 0.6,
      sustained: true, ctx: { participants: 8 } },
    { id: 'wp_4', name: 'Code Review', cat: 'workplace', room: 'office',
      desc: 'Review 500 lines of code', minutes: 45, complexity: 'high', aversive: 0.4, cog: 0.85, base: 0.6,
      sustained: true, ctx: { timeLimit: true } },
    { id: 'wp_5', name: 'Deadline Crunch', cat: 'workplace', room: 'office',
      desc: 'Critical task before end-of-day', minutes: 120, complexity: 'high', aversive: 0.8, cog: 0.9, base: 0.4,
      sustained: true, ctx: { urgency: 'critical' } },
    { id: 'pers_1', name: 'Household Cleaning', cat: 'personal', room: 'home',
      desc: 'Clean and organize bedroom', minutes: 120, complexity: 'medium', aversive: 0.7, cog: 0.3, base: 0.5,
      sustained: false, ctx: { motivation: 'low' } },
    { id: 'pers_2', name: 'Grocery & Cooking', cat: 'personal', room: 'home',
      desc: 'Plan, shop, prepare dinner', minutes: 90, complexity: 'medium', aversive: 0.5, cog: 0.6, base: 0.6,
      sustained: false, ctx: { ingredients: 8 } },
    { id: 'pers_3', name: 'Bill Paying', cat: 'personal', room: 'home',
      desc: 'Review and pay 8 bills', minutes: 45, complexity: 'low', aversive: 0.8, cog: 0.7, base: 0.5,
      sustained: true, ctx: { avoidance: true } },
    { id: 'soc_1', name: 'Phone Conversation', cat: 'social', room: 'phone',
      desc: 'Important phone call', minutes: 15, complexity: 'medium', aversive: 0.6, cog: 0.5, base: 0.6,
      sustained: true, ctx: { anxiety: 0.6 } },
    { id: 'soc_2', name: 'Social Event', cat: 'social', room: 'lounge',
      desc: 'Attend social gathering', minutes: 120, complexity: 'high', aversive: 0.7, cog: 0.8, base: 0.5,
      sustained: false, ctx: { groupSize: 'large', anxiety: 0.7 } },
    { id: 'acad_1', name: 'Study Session', cat: 'academic', room: 'office',
      desc: 'Study for exam', minutes: 120, complexity: 'high', aversive: 0.5, cog: 0.8, base: 0.5,
      sustained: true, ctx: { volume: 'large' } },
  ];

  // Tiny event vocabulary the engine emits as the tick loop runs.
  const EVENT_KINDS = [
    'TASK_START', 'FOCUS_DRIFT', 'FOCUS_RECOVER', 'HYPERFOCUS_ENTER', 'HYPERFOCUS_EXIT',
    'NPC_INTERRUPT', 'NPC_REACTION', 'COACHING_INTERVENTION', 'STRATEGY_APPLIED',
    'STRESS_SPIKE', 'COGNITIVE_LOAD_HIGH', 'BURNOUT_RISK', 'CHECKPOINT_PASSED',
    'TASK_COMPLETE', 'TASK_FAIL', 'TICK', 'ENTITY_MOVED', 'INDEPENDENCE_GAIN'
  ];

  // The world map — a discrete grid of rooms. Each scenario routes to a room.
  // Coordinates are in iso tile space (24 wide × 18 tall logical grid).
  const ROOMS = [
    { id: 'office',  name: 'Workplace',     x:  1, y:  1, w: 10, h:  7, color: '#1f6fb2', floor: '#173855',
      props: [
        { kind: 'desk',     x: 2, y: 2, w: 3, h: 1 },
        { kind: 'monitor',  x: 3, y: 2 },
        { kind: 'plant',    x: 1, y: 6 },
        { kind: 'desk',     x: 6, y: 2, w: 3, h: 1 },
        { kind: 'monitor',  x: 7, y: 2 },
        { kind: 'chair',    x: 3, y: 4 },
        { kind: 'chair',    x: 7, y: 4 },
        { kind: 'whiteboard', x: 9, y: 1 },
      ]},
    { id: 'meeting', name: 'Meeting Room',  x: 12, y:  1, w:  8, h:  5, color: '#7a4ec2', floor: '#332254',
      props: [
        { kind: 'longtable', x: 2, y: 1, w: 5, h: 2 },
        { kind: 'chair',     x: 1, y: 1 },
        { kind: 'chair',     x: 1, y: 2 },
        { kind: 'chair',     x: 6, y: 1 },
        { kind: 'chair',     x: 6, y: 2 },
        { kind: 'screen',    x: 3, y: 0 },
      ]},
    { id: 'home',    name: 'Home',          x:  1, y:  9, w:  9, h:  6, color: '#2d8f6e', floor: '#173f30',
      props: [
        { kind: 'sofa',   x: 1, y: 1, w: 3, h: 1 },
        { kind: 'tv',     x: 2, y: 3 },
        { kind: 'counter', x: 6, y: 1, w: 2, h: 3 },
        { kind: 'fridge', x: 6, y: 1 },
        { kind: 'plant',  x: 8, y: 4 },
      ]},
    { id: 'phone',   name: 'Phone Booth',   x: 11, y:  7, w:  3, h:  3, color: '#c2884a', floor: '#5a3b1d',
      props: [{ kind: 'phone', x: 1, y: 1 }] },
    { id: 'lounge',  name: 'Social Lounge', x: 15, y:  7, w:  7, h:  8, color: '#b25577', floor: '#4d2236',
      props: [
        { kind: 'sofa',  x: 1, y: 2, w: 3, h: 1 },
        { kind: 'sofa',  x: 1, y: 5, w: 3, h: 1 },
        { kind: 'plant', x: 5, y: 1 },
        { kind: 'plant', x: 5, y: 6 },
        { kind: 'table', x: 3, y: 3 },
      ]},
  ];

  // NPCs — populate the world with reactive characters
  const NPCS = [
    { id: 'boss',     name: 'Marcus',  role: 'manager',     room: 'meeting', biased: false, x: 3, y: 1, hue: 220 },
    { id: 'coworker', name: 'Priya',   role: 'coworker',    room: 'office',  biased: true,  x: 8, y: 4, hue: 30  },
    { id: 'friend',   name: 'Jordan',  role: 'friend',      room: 'lounge',  biased: false, x: 3, y: 5, hue: 320 },
    { id: 'stranger', name: 'Ren',     role: 'stranger',    room: 'lounge',  biased: true,  x: 6, y: 3, hue: 100 },
    { id: 'parent',   name: 'Liana',   role: 'family',      room: 'home',    biased: false, x: 5, y: 4, hue: 160 },
    { id: 'caller',   name: 'Voice',   role: 'phone caller', room: 'phone',  biased: false, x: 1, y: 1, hue: 280, invisible: true },
  ];

  // Strategies the Aide picks from based on trait.
  const STRATEGIES = {
    attention:   ['Pomodoro 25/5', 'Attention anchor', 'Distraction immunize', 'Task chunking', 'Mindful refocus'],
    initiation:  ['Two-minute start', 'Ladder step', 'Body double', 'Implementation intent', 'Shrink the task'],
    impulse:     ['Pause-name-choose', 'Response delay', 'If-then plan', 'Cue swap'],
    memory:      ['External memory', 'Loop-back', 'Chunking', 'Visual scaffold'],
    time:        ['Visible clock', 'Time-block', 'Estimate-then-measure', 'Backwards plan'],
    emotion:     ['Name the wave', 'Grounding 5-4-3', 'Co-regulate', 'Window check'],
    focus:       ['Soft cut', 'External exit cue', 'Transition ritual'],
    frustration: ['Breath-down', 'Reframe', 'Checkpoint return'],
    planning:    ['Reverse engineer', 'Single next action', 'Decision board'],
    transition:  ['Warning window', 'Soft cut', 'Landing pad'],
    monitor:     ['Notice prompt', 'Weekly review', 'Self check-in'],
    fatigue:     ['Micro-rest', 'Load shed', 'Energy audit'],
    effort:      ['Estimate vs actual', 'Effort budget'],
    stress:      ['Pre-load check', 'Down-regulate', 'Co-regulate'],
    sensory:     ['Sensory budget', 'Safe cave', 'Headphones / shade'],
    social:      ['Thread anchor', 'Clarifying question', 'Graceful exit'],
    identity:    ['Values check-in', 'Self-compassion script'],
  };

  return { AVATARS, AIDES, SCENARIOS, ROOMS, NPCS, STRATEGIES, EVENT_KINDS };
})();
