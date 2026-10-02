// World Engine simulation core — environmental-only sim tick.
// No avatars: world is buildings, roads, trees, NPCs, vehicles.
// The sim still drives the HUD clock.

export interface AvatarState { id: string; name: string; }
export interface SimEvent { id: string; t: number; kind: string; text: string; }
export interface WorldState { avatars: AvatarState[]; events: SimEvent[]; interventions: SimEvent[]; tickCount: number; simTime: number; }
export interface SimOptions { tickHz?: number; timeScale?: number; dysfunctionOn?: boolean; urgencyThreshold?: number; }

export class Simulation {
  tickCount = 0;
  simTime = 0;
  running = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private opts: SimOptions;
  state: WorldState;

  constructor(opts: SimOptions = {}) {
    this.opts = { tickHz: 4, timeScale: 1.0, dysfunctionOn: true, urgencyThreshold: 0.6, ...opts };
    this.state = { avatars: [], events: [], interventions: [], tickCount: 0, simTime: 0 };
  }

  start(): void {
    if (this.timer) return;
    this.running = true;
    const ms = 1000 / (this.opts.tickHz ?? 4);
    this.timer = setInterval(() => this.step(), ms);
  }

  stop(): void { this.running = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  toggle(): void { if (this.running) this.stop(); else this.start(); }

  reset(): void {
    this.state = { avatars: [], events: [], interventions: [], tickCount: 0, simTime: 0 };
    this.tickCount = 0;
    this.simTime = 0;
  }

  step(): void {
    if (!this.running) return;
    const { timeScale = 1 } = this.opts;
    this.tickCount++;
    this.simTime += timeScale;
    this.state.tickCount = this.tickCount;
    this.state.simTime = this.simTime;
  }
}
