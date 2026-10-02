// World Engine — real-world environment data.
//
// Coordinate system: X = east-west, Z = north-south, all in meters.
// World spans roughly -90..90 on both axes.

export type BuildingKind = 'office' | 'residential' | 'retail' | 'civic' | 'park';

export interface BuildingDef {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  floors: number;
  facade: string;
  roof: string;
  windows: string;
  kind: BuildingKind;
}

export interface RoadDef {
  id: string;
  x: number;
  z: number;
  width: number;
  length: number;
  rotation: number; // 0 = N-S (along Z), Math.PI/2 = E-W (along X)
  kind: 'avenue' | 'street' | 'path';
}

export interface TreeDef {
  x: number;
  z: number;
  scale: number;
  kind: 'oak' | 'pine' | 'maple' | 'birch';
}

export interface WaterDef {
  id: string;
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
}

export interface FurnitureDef {
  x: number;
  z: number;
  rotation: number;
  kind: 'lamp' | 'bench' | 'trash' | 'hydrant' | 'bollard';
}

export interface VehicleDef {
  x: number;
  z: number;
  rotation: number;
  kind: 'sedan' | 'suv' | 'truck';
  color: string;
}

export interface NpcDef {
  id: string;
  name: string;
  x: number;
  z: number;
  hue: number;
}

// ─── Buildings (6 city blocks) ─────────────────────────────────────
export const BUILDINGS: BuildingDef[] = [
  {
    id: 'office', name: 'Meridian Tower', x: -43, z: -60, width: 24, depth: 16,
    height: 36, floors: 8, facade: '#496173', roof: '#2a3038', windows: '#8ab4d4',
    kind: 'office',
  },
  {
    id: 'meeting', name: 'Conference Center', x: 43, z: -60, width: 20, depth: 14,
    height: 14, floors: 3, facade: '#a8b0b8', roof: '#383838', windows: '#90a8c0',
    kind: 'office',
  },
  {
    id: 'home', name: 'Parkview Apartments', x: -43, z: -15, width: 28, depth: 12,
    height: 27, floors: 6, facade: '#c4a882', roof: '#5a4030', windows: '#7a90a0',
    kind: 'residential',
  },
  {
    id: 'phone', name: 'Corner Cafe', x: 43, z: -15, width: 16, depth: 12,
    height: 8, floors: 2, facade: '#8b4513', roof: '#4a2a10', windows: '#c8b898',
    kind: 'retail',
  },
  {
    id: 'lounge', name: 'Social Hub', x: -43, z: 45, width: 22, depth: 14,
    height: 10, floors: 2, facade: '#6a8a6a', roof: '#3a4a3a', windows: '#b0c8d0',
    kind: 'civic',
  },
  {
    id: 'park', name: 'Riverside Park', x: 43, z: 45, width: 38, depth: 40,
    height: 0.2, floors: 0, facade: '#3a7a2a', roof: '#3a7a2a', windows: '#3a7a2a',
    kind: 'park',
  },
];

// ─── Roads ────────────────────────────────────────────────────────
export const ROADS: RoadDef[] = [
  { id: 'avenue', x: 0, z: 0, width: 14, length: 190, rotation: 0, kind: 'avenue' },
  { id: 'street1', x: 0, z: -35, width: 10, length: 190, rotation: Math.PI / 2, kind: 'street' },
  { id: 'street2', x: 0, z: 35, width: 10, length: 190, rotation: Math.PI / 2, kind: 'street' },
];

// ─── Trees (procedurally placed) ──────────────────────────────────
function generateTrees(): TreeDef[] {
  const trees: TreeDef[] = [];
  let seed = 98765;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed & 0xfffffff) / 0xfffffff; };

  // Along central avenue (edges at x=-7, x=7)
  for (let z = -80; z <= 80; z += 13) {
    trees.push({ x: -10.5, z: z + (rnd() - 0.5) * 3, scale: 0.9 + rnd() * 0.5, kind: 'oak' });
    trees.push({ x: 10.5, z: z + (rnd() - 0.5) * 3, scale: 0.9 + rnd() * 0.5, kind: 'oak' });
  }
  // Along cross streets (z=-35, z=35)
  for (let x = -80; x <= 80; x += 11) {
    trees.push({ x: x + (rnd() - 0.5) * 3, z: -38.5, scale: 0.8 + rnd() * 0.5, kind: 'maple' });
    trees.push({ x: x + (rnd() - 0.5) * 3, z: 38.5, scale: 0.8 + rnd() * 0.5, kind: 'maple' });
  }
  // In park block (SE: x=6..80, z=5..80) — dense cluster
  for (let i = 0; i < 30; i++) {
    const x = 12 + rnd() * 60;
    const z = 10 + rnd() * 65;
    const kinds: TreeDef['kind'][] = ['oak', 'maple', 'birch', 'pine'];
    trees.push({ x, z, scale: 1.0 + rnd() * 0.9, kind: kinds[Math.floor(rnd() * kinds.length)] });
  }
  // Scattered in non-building areas
  for (let i = 0; i < 20; i++) {
    const x = (rnd() - 0.5) * 160;
    const z = (rnd() - 0.5) * 160;
    // Skip if too close to a building
    const nearBuilding = BUILDINGS.some(b =>
      Math.abs(x - b.x) < b.width / 2 + 4 && Math.abs(z - b.z) < b.depth / 2 + 4
    );
    if (nearBuilding) continue;
    trees.push({ x, z, scale: 0.8 + rnd() * 0.7, kind: rnd() < 0.5 ? 'oak' : 'pine' });
  }
  return trees;
}

export const TREES: TreeDef[] = generateTrees();

// ─── Water ────────────────────────────────────────────────────────
export const WATER_BODIES: WaterDef[] = [
  { id: 'pond', x: 43, z: 50, radiusX: 14, radiusZ: 10 },
];

// ─── Street furniture (procedurally placed) ───────────────────────
function generateFurniture(): FurnitureDef[] {
  const items: FurnitureDef[] = [];
  let seed = 11111;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed & 0xfffffff) / 0xfffffff; };

  // Lamp posts along avenue
  for (let z = -78; z <= 78; z += 18) {
    items.push({ x: -9.5, z: z + (rnd() - 0.5) * 2, rotation: 0, kind: 'lamp' });
    items.push({ x: 9.5, z: z + (rnd() - 0.5) * 2, rotation: 0, kind: 'lamp' });
  }
  // Lamp posts along cross streets
  for (let x = -78; x <= 78; x += 16) {
    items.push({ x: x + (rnd() - 0.5) * 2, z: -37, rotation: 0, kind: 'lamp' });
    items.push({ x: x + (rnd() - 0.5) * 2, z: 37, rotation: 0, kind: 'lamp' });
  }
  // Benches and trash cans in park
  for (let i = 0; i < 8; i++) {
    items.push({ x: 25 + rnd() * 35, z: 25 + rnd() * 40, rotation: rnd() * Math.PI * 2, kind: 'bench' });
    items.push({ x: 28 + rnd() * 30, z: 30 + rnd() * 35, rotation: 0, kind: 'trash' });
  }
  // Fire hydrants near buildings
  items.push({ x: -28, z: -48, rotation: 0, kind: 'hydrant' });
  items.push({ x: 28, z: -48, rotation: 0, kind: 'hydrant' });
  items.push({ x: -28, z: 3, rotation: 0, kind: 'hydrant' });
  // Bollards near crossings
  for (let z = -35; z <= 35; z += 7) {
    items.push({ x: -7.5, z, rotation: 0, kind: 'bollard' });
    items.push({ x: 7.5, z, rotation: 0, kind: 'bollard' });
  }
  return items;
}

export const STREET_FURNITURE: FurnitureDef[] = generateFurniture();

// ─── Vehicles ─────────────────────────────────────────────────────
export const VEHICLES: VehicleDef[] = [
  { x: -18, z: -55, rotation: 0.1, kind: 'sedan', color: '#2a3a4a' },
  { x: -22, z: -52, rotation: -0.05, kind: 'suv', color: '#4a2a2a' },
  { x: 18, z: -58, rotation: 0.05, kind: 'sedan', color: '#3a3a3a' },
  { x: 22, z: -54, rotation: -0.1, kind: 'truck', color: '#2a2a4a' },
  { x: -18, z: -10, rotation: 0.08, kind: 'sedan', color: '#4a4a2a' },
  { x: 18, z: -12, rotation: -0.06, kind: 'suv', color: '#2a4a2a' },
  { x: -18, z: 50, rotation: 0.12, kind: 'sedan', color: '#3a2a3a' },
  { x: 20, z: 48, rotation: -0.08, kind: 'sedan', color: '#2a2a2a' },
  { x: -50, z: -25, rotation: Math.PI / 2, kind: 'sedan', color: '#4a3a2a' },
  { x: 50, z: -20, rotation: -Math.PI / 2, kind: 'truck', color: '#1a1a3a' },
  { x: 30, z: 20, rotation: 0.3, kind: 'suv', color: '#3a4a3a' },
  { x: -35, z: 60, rotation: 0.9, kind: 'sedan', color: '#2a3a2a' },
];

// ─── NPCs (people in the world) ───────────────────────────────────
export const NPCS: NpcDef[] = [
  { id: 'marcus', name: 'Marcus', x: -15, z: -50, hue: 220 },
  { id: 'priya', name: 'Priya', x: 15, z: -45, hue: 30 },
  { id: 'jordan', name: 'Jordan', x: 0, z: -20, hue: 320 },
  { id: 'liana', name: 'Liana', x: -20, z: 10, hue: 160 },
  { id: 'ren', name: 'Ren', x: 20, z: 5, hue: 100 },
  { id: 'voice', name: 'Voice', x: 0, z: 55, hue: 280 },
];

// ─── Avatars (empty for now) ──────────────────────────────────────
export const AVATARS: never[] = [];
export const AIDES: Record<string, never> = {};

// ─── Scenarios ────────────────────────────────────────────────────
export interface ScenarioDef {
  id: string;
  name: string;
  cat: string;
  room: string;
  desc: string;
  minutes: number;
  complexity: string;
  aversive: number;
  cog: number;
  base: number;
  sustained: boolean;
  ctx: Record<string, unknown>;
}

export const SCENARIOS: ScenarioDef[] = [
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

// ─── Coaching strategies ──────────────────────────────────────────
export const STRATEGIES: Record<string, string[]> = {
  attention: ['Pomodoro 25/5', 'Attention anchor', 'Distraction immunize', 'Task chunking', 'Mindful refocus'],
  initiation: ['Two-minute start', 'Ladder step', 'Body double', 'Implementation intent', 'Shrink the task'],
  impulse: ['Pause-name-choose', 'Response delay', 'If-then plan', 'Cue swap'],
  memory: ['External memory', 'Loop-back', 'Chunking', 'Visual scaffold'],
  time: ['Visible clock', 'Time-block', 'Estimate-then-measure', 'Backwards plan'],
  emotion: ['Name the wave', 'Grounding 5-4-3', 'Co-regulate', 'Window check'],
  focus: ['Soft cut', 'External exit cue', 'Transition ritual'],
  frustration: ['Breath-down', 'Reframe', 'Checkpoint return'],
  planning: ['Reverse engineer', 'Single next action', 'Decision board'],
  transition: ['Warning window', 'Soft cut', 'Landing pad'],
  monitor: ['Notice prompt', 'Weekly review', 'Self check-in'],
  fatigue: ['Micro-rest', 'Load shed', 'Energy audit'],
  effort: ['Estimate vs actual', 'Effort budget', 'Reward stacking'],
  stress: ['Pre-load check', 'Down-regulate', 'Co-regulate'],
  sensory: ['Sensory budget', 'Safe cave', 'Headphones / shade'],
  social: ['Thread anchor', 'Clarifying question', 'Graceful exit'],
  identity: ['Values check-in', 'Self-compassion script'],
};
