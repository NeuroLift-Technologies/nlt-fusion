// World Engine — static data: avatars, aides, scenarios, world map.
window.WE_DATA = (function () {
  const AVATARS = [
    { id: 'stay_alert', name: 'StayAlert', trait: 'Sustained Attention', tag: 'SA', hue: 200, flavor: 'attention', blurb: 'Drifts off long tasks. Vulnerable to hyperfocus.' },
  ];

  const AIDES = {
    stay_alert: { name: 'Dr. Vance', style: 'supportive skill-building', focus: 'pomodoro · anchoring · mental-fatigue mgmt' },
  };

  const SCENARIOS = [
    { id: 'wp_1', name: 'Email Processing', cat: 'workplace', room: 'office', desc: 'Process and respond to 20 emails', minutes: 30, complexity: 'medium', aversive: 0.4, cog: 0.5, base: 0.7, sustained: true, ctx: { interruptions: true, priority: 5 } },
    { id: 'wp_2', name: 'Report Writing', cat: 'workplace', room: 'office', desc: 'Write a 2000-word project report', minutes: 90, complexity: 'high', aversive: 0.6, cog: 0.8, base: 0.5, sustained: true, ctx: { deadline: true, research: true } },
  ];

  const EVENT_KINDS = ['TASK_START', 'FOCUS_DRIFT', 'FOCUS_RECOVER', 'HYPERFOCUS_ENTER', 'HYPERFOCUS_EXIT', 'NPC_INTERRUPT', 'COACHING_INTERVENTION', 'STRESS_SPIKE', 'COGNITIVE_LOAD_HIGH', 'TASK_COMPLETE', 'TASK_FAIL', 'TICK'];

  const ROOMS = [
    { id: 'office', name: 'Workplace', x: 1, y: 1, w: 10, h: 7, color: '#1f6fb2', floor: '#173855',
      props: [
        { kind: 'desk', x: 2, y: 2, w: 3, h: 1 },
        { kind: 'monitor', x: 3, y: 2 },
        { kind: 'plant', x: 1, y: 6 },
        { kind: 'desk', x: 6, y: 2, w: 3, h: 1 },
        { kind: 'monitor', x: 7, y: 2 },
        { kind: 'chair', x: 3, y: 4 },
        { kind: 'chair', x: 7, y: 4 },
        { kind: 'whiteboard', x: 9, y: 1 },
      ]},
    { id: 'meeting', name: 'Meeting Room', x: 12, y: 1, w: 8, h: 5, color: '#7a4ec2', floor: '#332254',
      props: [
        { kind: 'longtable', x: 2, y: 1, w: 5, h: 2 },
        { kind: 'chair', x: 1, y: 1 },
        { kind: 'chair', x: 1, y: 2 },
        { kind: 'chair', x: 6, y: 1 },
        { kind: 'chair', x: 6, y: 2 },
        { kind: 'screen', x: 3, y: 0 },
      ]},
    { id: 'home', name: 'Home', x: 1, y: 9, w: 9, h: 6, color: '#2d8f6e', floor: '#173f30',
      props: [
        { kind: 'sofa', x: 1, y: 1, w: 3, h: 1 },
        { kind: 'tv', x: 2, y: 3 },
        { kind: 'counter', x: 6, y: 1, w: 2, h: 3 },
        { kind: 'fridge', x: 6, y: 1 },
        { kind: 'plant', x: 8, y: 4 },
      ]},
    { id: 'phone', name: 'Phone Booth', x: 11, y: 7, w: 3, h: 3, color: '#c2884a', floor: '#5a3b1d',
      props: [{ kind: 'phone', x: 1, y: 1 }] },
    { id: 'lounge', name: 'Social Lounge', x: 15, y: 7, w: 7, h: 8, color: '#b25577', floor: '#4d2236',
      props: [
        { kind: 'sofa', x: 1, y: 2, w: 3, h: 1 },
        { kind: 'sofa', x: 1, y: 5, w: 3, h: 1 },
        { kind: 'plant', x: 5, y: 1 },
        { kind: 'plant', x: 5, y: 6 },
        { kind: 'table', x: 3, y: 3 },
      ]},
  ];

  const NPCS = [
    { id: 'boss', name: 'Marcus', role: 'manager', room: 'meeting', biased: false, x: 3, y: 1, hue: 220 },
    { id: 'coworker', name: 'Priya', role: 'coworker', room: 'office', biased: true, x: 8, y: 4, hue: 30 },
  ];

  const STRATEGIES = {
    attention: ['Pomodoro 25/5', 'Attention anchor', 'Distraction immunize', 'Task chunking', 'Mindful refocus'],
  };

  return { AVATARS, AIDES, SCENARIOS, ROOMS, NPCS, STRATEGIES, EVENT_KINDS };
})();
