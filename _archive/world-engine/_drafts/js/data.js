// World Engine — static data: avatars, aides, scenarios, world map.
//
// Roster: 19 ADHD-trait avatars. IDs use clean snake_case that matches
// the Python repo convention (src/avatars/adhd_traits/*). The first two
// (stay_alert, task_kickstart) align directly with existing Avatar
// implementations; the remaining 17 are design proposals for the full
// roster. See docs/specs/world-engine-prototype-schema.md.
//
// Contract:
//   - every avatar.id must have a matching entry in AIDES
//   - every avatar.flavor must be a key in STRATEGIES
//   - every scenario.room must be a ROOMS[id]

window.WE_DATA = (function () {
  const AVATARS = [
    { id: 'stay_alert',      name: 'StayAlert',      trait: 'Sustained Attention',     tag: 'SA', hue: 200, flavor: 'attention',
      blurb: 'Drifts off long tasks. Vulnerable to hyperfocus.' },
    { id: 'task_kickstart',  name: 'TaskKickstart',  trait: 'Task Initiation',         tag: 'TK', hue:  36, flavor: 'initiation',
      blurb: 'Knows what to do — can\'t start.' },
    { id: 'focus_flow',      name: 'FocusFlow',      trait: 'Hyperfocus / Switching',  tag: 'FF', hue: 168, flavor: 'focus',
      blurb: 'Tunnel vision. Forgets to switch.' },
    { id: 'memory_mate',     name: 'MemoryMate',     trait: 'Working Memory',          tag: 'MM', hue: 268, flavor: 'memory',
      blurb: 'Loses the thread mid-sentence.' },
    { id: 'time_keeper',     name: 'TimeKeeper',     trait: 'Time Perception',         tag: 'TM', hue: 220, flavor: 'time',
      blurb: 'Now and not-now. No in-between.' },
    { id: 'prioritize_it',   name: 'PrioritizeIt',   trait: 'Prioritization',          tag: 'PR', hue:  84, flavor: 'planning',
      blurb: 'All ideas, no rank order.' },
    { id: 'emo_steady',      name: 'EmoSteady',      trait: 'Emotional Regulation',    tag: 'ES', hue:  14, flavor: 'emotion',
      blurb: 'Feels everything at full volume.' },
    { id: 'impulse_guard',   name: 'ImpulseGuard',   trait: 'Impulse Control',         tag: 'IG', hue: 348, flavor: 'impulse',
      blurb: 'Knows the stop sign, ignores it.' },
    { id: 'social_cue',      name: 'SocialCue',      trait: 'Social Cues',             tag: 'SC', hue: 318, flavor: 'social',
      blurb: 'Loses the social thread quickly.' },
    { id: 'transition_ease', name: 'TransitionEase', trait: 'Task Switching',          tag: 'TE', hue: 290, flavor: 'transition',
      blurb: 'Sticky between contexts.' },
    { id: 'organize_well',   name: 'OrganizeWell',   trait: 'Organization',            tag: 'OW', hue: 188, flavor: 'planning',
      blurb: 'Visual zones blur fast.' },
    { id: 'follow_through',  name: 'FollowThrough',  trait: 'Task Completion',         tag: 'FT', hue: 138, flavor: 'initiation',
      blurb: 'Starts strong, fades at the finish.' },
    { id: 'listen_in',       name: 'ListenIn',       trait: 'Active Listening',        tag: 'LI', hue:  48, flavor: 'monitor',
      blurb: 'Mind walks during conversations.' },
    { id: 'fidget_flow',     name: 'FidgetFlow',     trait: 'Physical Restlessness',   tag: 'FX', hue: 322, flavor: 'sensory',
      blurb: 'Needs motion to think.' },
    { id: 'restore_calm',    name: 'RestoreCalm',    trait: 'Stress Recovery',         tag: 'RC', hue: 142, flavor: 'stress',
      blurb: 'Spikes early, recovers slow.' },
    { id: 'boundary_set',    name: 'BoundarySet',    trait: 'Boundary Setting',        tag: 'BS', hue:  24, flavor: 'social',
      blurb: 'Says yes when meaning no.' },
    { id: 'plan_ahead',      name: 'PlanAhead',      trait: 'Forward Planning',        tag: 'PA', hue: 186, flavor: 'planning',
      blurb: 'Future-blind under load.' },
    { id: 'self_monitor',    name: 'SelfMonitor',    trait: 'Self-Awareness',          tag: 'SM', hue: 280, flavor: 'monitor',
      blurb: 'Can\'t tell if it\'s working.' },
    { id: 'motivate_me',     name: 'MotivateMe',     trait: 'Motivation',              tag: 'MV', hue:  52, flavor: 'effort',
      blurb: 'Why-power is low. Reward feels distant.' },
  ];

  // Aides paired 1:1 with each avatar by trait expertise.
  const AIDES = {
    stay_alert:      { name: 'Dr. Vance',    style: 'supportive skill-building', focus: 'pomodoro · anchoring · mental-fatigue mgmt' },
    task_kickstart:  { name: 'Coach Reyes',  style: 'gentle activation',         focus: 'two-minute starts · ladder steps · momentum' },
    focus_flow:      { name: 'Coach Mei',    style: 'gentle boundary',           focus: 'externally-paced exits · transition rituals' },
    memory_mate:     { name: 'Dr. Liang',    style: 'scaffolded',                focus: 'external memory · chunking · loop-backs' },
    time_keeper:     { name: 'Coach Patel',  style: 'time-anchored',             focus: 'visible clocks · time-blocking · before/after' },
    prioritize_it:   { name: 'Coach Olsen',  style: 'task scaffolding',          focus: 'Eisenhower sort · MIT method · one-thing rule' },
    emo_steady:      { name: 'Dr. Aronson',  style: 'DBT-informed',              focus: 'name-the-wave · grounding · co-regulation' },
    impulse_guard:   { name: 'Dr. Okafor',   style: 'CBT-flavored',              focus: 'pause-name-choose · response delay · cues' },
    social_cue:      { name: 'Coach Brand',  style: 'social skills',             focus: 'thread-tracking · cue-cards · graceful exits' },
    transition_ease: { name: 'Dr. Holst',    style: 'transition coaching',       focus: 'warning windows · soft cuts · landing pads' },
    organize_well:   { name: 'Coach Olsen',  style: 'environmental design',      focus: 'container method · visual zones · single-touch' },
    follow_through:  { name: 'Coach Reyes',  style: 'completion ritual',         focus: 'finish-before-new · done lists · last-mile' },
    listen_in:       { name: 'Coach Brand',  style: 'metacognitive',             focus: 'active recap · note-anchors · question prompts' },
    fidget_flow:     { name: 'Coach Mei',    style: 'stim channeling',           focus: 'movement breaks · stim objects · stand-desk' },
    restore_calm:    { name: 'Dr. Aronson',  style: 'arousal regulation',        focus: 'down-regulation · sensory reset · walk breaks' },
    boundary_set:    { name: 'Dr. Okafor',   style: 'assertion training',        focus: 'script rehearsal · pre-approved no · time-bound yes' },
    plan_ahead:      { name: 'Coach Olsen',  style: 'forward planning',          focus: 'tomorrow lists · calendar blocks · if-then plans' },
    self_monitor:    { name: 'Coach Brand',  style: 'metacognitive',             focus: 'check-in chimes · mood logs · 5-min retros' },
    motivate_me:     { name: 'Dr. Vance',    style: 'energy management',         focus: 'reward stacking · why-anchor · body-double' },
  };

  // Scenarios — IDs and metadata mirror src/simulation/environment/scenarios.py.
  // Each scenario routes the avatar to a ROOMS[id].
  const SCENARIOS = [
    { id: 'wp_1', name: 'Email Processing',     cat: 'workplace', room: 'office',
      desc: 'Process and respond to 20 emails',  minutes: 30,  complexity: 'medium', aversive: 0.4, cog: 0.5,  base: 0.7,
      sustained: true,  ctx: { interruptions: true, priority: 5 } },
    { id: 'wp_2', name: 'Report Writing',       cat: 'workplace', room: 'office',
      desc: 'Write a 2000-word project report',  minutes: 90,  complexity: 'high',   aversive: 0.6, cog: 0.8,  base: 0.5,
      sustained: true,  ctx: { deadline: true, research: true } },
    { id: 'wp_3', name: 'Meeting Participation', cat: 'workplace', room: 'meeting',
      desc: 'Active 1-hour team meeting',        minutes: 60,  complexity: 'medium', aversive: 0.3, cog: 0.6,  base: 0.6,
      sustained: true,  ctx: { participants: 8 } },
    { id: 'wp_4', name: 'Code Review',          cat: 'workplace', room: 'office',
      desc: 'Review 500 lines of code',          minutes: 45,  complexity: 'high',   aversive: 0.4, cog: 0.85, base: 0.6,
      sustained: true,  ctx: { timeLimit: true } },
    { id: 'wp_5', name: 'Deadline Crunch',      cat: 'workplace', room: 'office',
      desc: 'Critical task before end-of-day',   minutes: 120, complexity: 'high',   aversive: 0.8, cog: 0.9,  base: 0.4,
      sustained: true,  ctx: { urgency: 'critical' } },
    { id: 'pers_1', name: 'Household Cleaning', cat: 'personal',  room: 'home',
      desc: 'Clean and organize bedroom',        minutes: 120, complexity: 'medium', aversive: 0.7, cog: 0.3,  base: 0.5,
      sustained: false, ctx: { motivation: 'low' } },
    { id: 'pers_2', name: 'Grocery & Cooking',  cat: 'personal',  room: 'home',
      desc: 'Plan, shop, prepare dinner',        minutes: 90,  complexity: 'medium', aversive: 0.5, cog: 0.6,  base: 0.6,
      sustained: false, ctx: { ingredients: 8 } },
    { id: 'pers_3', name: 'Bill Paying',        cat: 'personal',  room: 'home',
      desc: 'Review and pay 8 bills',            minutes: 45,  complexity: 'low',    aversive: 0.8, cog: 0.7,  base: 0.5,
      sustained: true,  ctx: { avoidance: true } },
    { id: 'soc_1', name: 'Phone Conversation',  cat: 'social',    room: 'phone',
      desc: 'Important phone call',              minutes: 15,  complexity: 'medium', aversive: 0.6, cog: 0.5,  base: 0.6,
      sustained: true,  ctx: { anxiety: 0.6 } },
    { id: 'soc_2', name: 'Social Event',        cat: 'social',    room: 'lounge',
      desc: 'Attend social gathering',           minutes: 120, complexity: 'high',   aversive: 0.7, cog: 0.8,  base: 0.5,
      sustained: false, ctx: { groupSize: 'large', anxiety: 0.7 } },
    { id: 'acad_1', name: 'Study Session',      cat: 'academic',  room: 'office',
      desc: 'Study for exam',                    minutes: 120, complexity: 'high',   aversive: 0.5, cog: 0.8,  base: 0.5,
      sustained: true,  ctx: { volume: 'large' } },
  ];

  // Event vocabulary emitted by the tick loop.
  const EVENT_KINDS = [
    'TASK_START', 'FOCUS_DRIFT', 'FOCUS_RECOVER', 'HYPERFOCUS_ENTER', 'HYPERFOCUS_EXIT',
    'NPC_INTERRUPT', 'NPC_REACTION', 'COACHING_INTERVENTION', 'STRATEGY_APPLIED',
    'STRESS_SPIKE', 'COGNITIVE_LOAD_HIGH', 'BURNOUT_RISK', 'CHECKPOINT_PASSED',
    'TASK_COMPLETE', 'TASK_FAIL', 'TICK', 'ENTITY_MOVED', 'INDEPENDENCE_GAIN'
  ];

  // World map — discrete grid of rooms in iso tile space (24 × 18 logical).
  const ROOMS = [
    { id: 'office',  name: 'Workplace',     x:  1, y:  1, w: 10, h:  7, color: '#1f6fb2', floor: '#173855',
      props: [
        { kind: 'desk',       x: 2, y: 2, w: 3, h: 1 },
        { kind: 'monitor',    x: 3, y: 2 },
        { kind: 'plant',      x: 1, y: 6 },
        { kind: 'desk',       x: 6, y: 2, w: 3, h: 1 },
        { kind: 'monitor',    x: 7, y: 2 },
        { kind: 'chair',      x: 3, y: 4 },
        { kind: 'chair',      x: 7, y: 4 },
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
        { kind: 'sofa',    x: 1, y: 1, w: 3, h: 1 },
        { kind: 'tv',      x: 2, y: 3 },
        { kind: 'counter', x: 6, y: 1, w: 2, h: 3 },
        { kind: 'fridge',  x: 6, y: 1 },
        { kind: 'plant',   x: 8, y: 4 },
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

  // NPCs — reactive characters placed in rooms.
  const NPCS = [
    { id: 'boss',     name: 'Marcus', role: 'manager',      room: 'meeting', biased: false, x: 3, y: 1, hue: 220 },
    { id: 'coworker', name: 'Priya',  role: 'coworker',     room: 'office',  biased: true,  x: 8, y: 4, hue:  30 },
    { id: 'friend',   name: 'Jordan', role: 'friend',       room: 'lounge',  biased: false, x: 3, y: 5, hue: 320 },
    { id: 'stranger', name: 'Ren',    role: 'stranger',     room: 'lounge',  biased: true,  x: 6, y: 3, hue: 100 },
    { id: 'parent',   name: 'Liana',  role: 'family',       room: 'home',    biased: false, x: 5, y: 4, hue: 160 },
    { id: 'caller',   name: 'Voice',  role: 'phone caller', room: 'phone',   biased: false, x: 1, y: 1, hue: 280, invisible: true },
  ];

  // Coaching strategies keyed by avatar flavor.
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
    effort:      ['Estimate vs actual', 'Effort budget', 'Reward stacking'],
    stress:      ['Pre-load check', 'Down-regulate', 'Co-regulate'],
    sensory:     ['Sensory budget', 'Safe cave', 'Headphones / shade'],
    social:      ['Thread anchor', 'Clarifying question', 'Graceful exit'],
    identity:    ['Values check-in', 'Self-compassion script'],
  };

  return { AVATARS, AIDES, SCENARIOS, ROOMS, NPCS, STRATEGIES, EVENT_KINDS };
})();
