// World Engine v2 — Babylon.js entry point.
//
// Ports the world-engine prototype to Babylon.js with:
// - Isometric tile-based rooms with floors, props, characters
// - Full simulation tick loop
// - HUD overlay with stats and event log

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';

import { Simulation } from './simulation';
import { WorldScene, createCamera, setupLighting } from './scene';
import { HUD } from './hud';

// ─── Engine setup ─────────────────────────────────────────────────
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
  antialias: true,
});
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 2));

const scene = new Scene(engine);
scene.clearColor = new Color4(0.06, 0.1, 0.2, 1);
scene.ambientColor = new Color3(0.3, 0.32, 0.38);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.0035;
scene.fogColor = new Color3(0.5, 0.65, 0.8);

// ─── Camera & lighting ───────────────────────────────────────────
const camera = createCamera(scene);
setupLighting(scene);

// ─── World scene ──────────────────────────────────────────────────
const worldScene = new WorldScene(scene, camera);
worldScene.buildWorld();

// ─── Simulation ───────────────────────────────────────────────────
const sim = new Simulation({
  tickHz: 4,
  timeScale: 1.0,
  dysfunctionOn: true,
  urgencyThreshold: 0.6,
});

// Avatars currently empty — world is environmental only

// ─── HUD ──────────────────────────────────────────────────────────
const hud = new HUD();

// ─── Render loop ──────────────────────────────────────────────────
let lastTickCount = 0;

scene.registerBeforeRender(() => {
  // Update simulation
  sim.step();

  // Only update scene when the simulation actually ticks
  if (sim.state.tickCount !== lastTickCount) {
    lastTickCount = sim.state.tickCount;
    worldScene.updateAvatarPositions(sim.state.avatars);
    hud.render(sim.state);
  }
});

// ─── Start ────────────────────────────────────────────────────────
sim.start();

// Run the render loop
engine.runRenderLoop(() => {
  scene.render();
});

// Handle resize
window.addEventListener('resize', () => {
  engine.resize();
});

// ─── Exports (for debugging) ──────────────────────────────────────
export { engine, scene, camera, sim, worldScene, hud };