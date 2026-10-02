// Babylon.js scene builder — real-world urban environment.
//
// City blocks with 3D buildings, roads, parks, trees, water,
// street furniture, vehicles, and pedestrians.

import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Mesh } from '@babylonjs/core/Meshes/mesh';

import {
  BUILDINGS,
  ROADS,
  TREES,
  WATER_BODIES,
  STREET_FURNITURE,
  VEHICLES,
  NPCS,
  type BuildingDef,
  type TreeDef,
  type FurnitureDef,
  type VehicleDef,
} from './data';
import type { AvatarState } from './simulation';

// ─── Color helpers ────────────────────────────────────────────────
function hexToColor3(hex: string): Color3 {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  return new Color3(r, g, b);
}

function shadeHex(hex: string, pct: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) + pct;
  let g = ((n >> 8) & 0xff) + pct;
  let b = (n & 0xff) + pct;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function hslToColor3(h: number, s: number, l: number): Color3 {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return new Color3(r + m, g + m, b + m);
}

// ─── Camera setup ─────────────────────────────────────────────────
export function createCamera(scene: Scene): ArcRotateCamera {
  const camera = new ArcRotateCamera(
    'camera',
    -Math.PI / 4,
    Math.PI / 4,
    80,
    Vector3.Zero(),
    scene,
  );
  camera.attachControl(scene.getEngine().getRenderingCanvas(), true);
  camera.lowerRadiusLimit = 20;
  camera.upperRadiusLimit = 300;
  camera.wheelPrecision = 10;
  camera.panningSensibility = 50;
  return camera;
}

// ─── Lighting ─────────────────────────────────────────────────────
export function setupLighting(scene: Scene): void {
  const hemiLight = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.55;
  hemiLight.diffuse = new Color3(0.9, 0.92, 1.0);
  hemiLight.groundColor = new Color3(0.28, 0.32, 0.28);

  const sunLight = new DirectionalLight('sun', new Vector3(-0.6, -1.2, -0.4), scene);
  sunLight.intensity = 1.4;
  sunLight.position = new Vector3(50, 80, 40);
  sunLight.diffuse = new Color3(1.0, 0.96, 0.85);
}

// ─── Scene builder ────────────────────────────────────────────────
export class WorldScene {
  private scene: Scene;
  private camera: ArcRotateCamera;
  private characterNodes: Map<string, TransformNode> = new Map();
  private characterLabels: Map<string, Mesh> = new Map();

  constructor(scene: Scene, camera: ArcRotateCamera) {
    this.scene = scene;
    this.camera = camera;
  }

  buildWorld(): void {
    this.buildGround();
    this.buildSky();
    this.buildRoads();
    this.buildBuildings();
    this.buildTrees();
    this.buildWater();
    this.buildStreetFurniture();
    this.buildVehicles();
    this.buildNpcs();
    this.frameCamera();
  }

  // ─── Ground ─────────────────────────────────────────────────────
  private buildGround(): void {
    const ground = MeshBuilder.CreateGround(
      'ground',
      { width: 200, height: 200, subdivisions: 8 },
      this.scene,
    );
    ground.position.y = -0.15;

    const mat = new StandardMaterial('groundMat', this.scene);
    mat.diffuseTexture = this.createGrassTexture();
    (mat.diffuseTexture as Texture).uScale = 12;
    (mat.diffuseTexture as Texture).vScale = 12;
    mat.specularColor = new Color3(0.02, 0.03, 0.02);
    ground.material = mat;
  }

  private createGrassTexture(): DynamicTexture {
    const tex = new DynamicTexture('grassTex', { width: 1024, height: 1024 }, this.scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = '#3a5a28';
    ctx.fillRect(0, 0, 1024, 1024);
    let s = 42;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0xfffffff) / 0xfffffff; };
    for (let i = 0; i < 400; i++) {
      const x = rnd() * 1024, y = rnd() * 1024, r = 12 + rnd() * 50;
      const g = 60 + Math.floor(rnd() * 50);
      const b = 22 + Math.floor(rnd() * 25);
      ctx.fillStyle = `rgba(${g},${g + 40},${b},0.3)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 150; i++) {
      const x = rnd() * 1024, y = rnd() * 1024, r = 4 + rnd() * 18;
      ctx.fillStyle = `rgba(${95 + Math.floor(rnd() * 40)},${130 + Math.floor(rnd() * 50)},${45 + Math.floor(rnd() * 30)},0.35)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    tex.update();
    return tex;
  }

  // ─── Sky ────────────────────────────────────────────────────────
  private buildSky(): void {
    const sky = MeshBuilder.CreateSphere(
      'sky',
      { diameter: 700, segments: 16, sideOrientation: Mesh.BACKSIDE },
      this.scene,
    );
    sky.infiniteDistance = true;
    sky.applyFog = false;

    const tex = new DynamicTexture('skyTex', { width: 512, height: 512 }, this.scene, false);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#0b1a3a');
    grad.addColorStop(0.2, '#1e4080');
    grad.addColorStop(0.4, '#4a80b0');
    grad.addColorStop(0.55, '#a0c4e0');
    grad.addColorStop(0.7, '#c8daf0');
    grad.addColorStop(1.0, '#80a0c0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    tex.update();

    const mat = new StandardMaterial('skyMat', this.scene);
    mat.emissiveTexture = tex;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    sky.material = mat;

    // Clouds
    this.buildClouds();
  }

  private buildClouds(): void {
    const cloudMat = new StandardMaterial('cloudMat', this.scene);
    cloudMat.diffuseColor = new Color3(0.88, 0.91, 0.95);
    cloudMat.emissiveColor = new Color3(0.6, 0.64, 0.7);
    cloudMat.specularColor = new Color3(0, 0, 0);
    cloudMat.alpha = 0.7;

    let seed = 99999;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed & 0xfffffff) / 0xfffffff; };

    for (let i = 0; i < 18; i++) {
      const node = new TransformNode('cloud', this.scene);
      node.position.set(
        (rnd() - 0.5) * 280,
        45 + rnd() * 25,
        (rnd() - 0.5) * 200,
      );
      node.scaling.set(12 + rnd() * 18, 3 + rnd() * 3, 8 + rnd() * 12);

      for (let p = 0; p < 6; p++) {
        const puff = MeshBuilder.CreateSphere('puff', { diameter: 1, segments: 4 }, this.scene);
        puff.position.set((rnd() - 0.5) * 9, (rnd() - 0.5) * 2, (rnd() - 0.5) * 6);
        puff.material = cloudMat;
        puff.parent = node;
      }
    }
  }

  // ─── Roads ──────────────────────────────────────────────────────
  private buildRoads(): void {
    const roadMat = new StandardMaterial('roadMat', this.scene);
    roadMat.diffuseColor = new Color3(0.18, 0.18, 0.2);
    roadMat.emissiveColor = new Color3(0.04, 0.04, 0.05);
    roadMat.specularColor = new Color3(0.04, 0.04, 0.04);

    const sidewalkMat = new StandardMaterial('sidewalkMat', this.scene);
    sidewalkMat.diffuseColor = new Color3(0.62, 0.6, 0.56);
    sidewalkMat.emissiveColor = new Color3(0.14, 0.14, 0.13);

    const dashMat = new StandardMaterial('dashMat', this.scene);
    dashMat.diffuseColor = new Color3(0.75, 0.65, 0.15);
    dashMat.emissiveColor = new Color3(0.18, 0.14, 0.03);

    const crosswalkMat = new StandardMaterial('crosswalkMat', this.scene);
    crosswalkMat.diffuseColor = new Color3(0.85, 0.85, 0.82);
    crosswalkMat.emissiveColor = new Color3(0.2, 0.2, 0.18);

    for (const road of ROADS) {
      // Asphalt
      const roadMesh = MeshBuilder.CreateBox(
        `road_${road.id}`,
        {
          width: road.rotation === 0 ? road.width : road.length,
          height: 0.06,
          depth: road.rotation === 0 ? road.length : road.width,
        },
        this.scene,
      );
      roadMesh.position.set(road.x, 0.04, road.z);
      roadMesh.rotation.y = road.rotation;
      roadMesh.material = roadMat;

      // Sidewalks on both sides
      const sideOffset = road.width / 2 + 1.2;
      for (const side of [-1, 1]) {
        const sw = MeshBuilder.CreateBox(
          `sidewalk_${road.id}_${side}`,
          {
            width: road.rotation === 0 ? 2.4 : road.length,
            height: 0.12,
            depth: road.rotation === 0 ? road.length : 2.4,
          },
          this.scene,
        );
        const offsetX = road.rotation === 0 ? side * sideOffset : 0;
        const offsetZ = road.rotation === 0 ? 0 : side * sideOffset;
        sw.position.set(road.x + offsetX, 0.08, road.z + offsetZ);
        sw.rotation.y = road.rotation;
        sw.material = sidewalkMat;
      }

      // Center dashes
      const dashLen = 2.5;
      const dashGap = 3.5;
      const dashCount = Math.floor(road.length / (dashLen + dashGap));
      for (let d = 0; d < dashCount; d++) {
        const t = (d + 0.5) / dashCount;
        const pos = t * road.length - road.length / 2;
        const dash = MeshBuilder.CreateBox(
          `dash_${road.id}_${d}`,
          {
            width: road.rotation === 0 ? 0.15 : dashLen,
            height: 0.03,
            depth: road.rotation === 0 ? dashLen : 0.15,
          },
          this.scene,
        );
        dash.position.set(road.x + (road.rotation === 0 ? pos : 0), 0.08, road.z + (road.rotation === 0 ? 0 : pos));
        dash.rotation.y = road.rotation;
        dash.material = dashMat;
      }

      // Crosswalks at intersections
      if (road.kind === 'street') {
        for (const crossZ of [-35, 35]) {
          const cw = MeshBuilder.CreateBox(
            `crosswalk_${road.id}_${crossZ}`,
            { width: road.width + 1, height: 0.02, depth: 4 },
            this.scene,
          );
          cw.position.set(road.x + (road.rotation === 0 ? 0 : crossZ), 0.1, road.z + (road.rotation === 0 ? crossZ : 0));
          cw.rotation.y = road.rotation;
          cw.material = crosswalkMat;
        }
      }
    }
  }

  // ─── Buildings ──────────────────────────────────────────────────
  private buildBuildings(): void {
    for (const b of BUILDINGS) {
      this.createBuilding(b);
    }
  }

  private createBuilding(b: BuildingDef): void {
    const node = new TransformNode(`building_${b.id}`, this.scene);
    node.position.set(b.x, 0, b.z);

    if (b.kind === 'park') {
      // Park = green lawn area with subtle elevation
      const lawn = MeshBuilder.CreateBox(
        `lawn_${b.id}`,
        { width: b.width, height: 0.15, depth: b.depth },
        this.scene,
      );
      lawn.position.set(b.x, 0.08, b.z);
      const lawnMat = new StandardMaterial(`lawnMat_${b.id}`, this.scene);
      lawnMat.diffuseColor = hexToColor3(b.facade);
      lawnMat.emissiveColor = new Color3(0.08, 0.18, 0.06);
      lawn.material = lawnMat;
      return;
    }

    // Main facade
    const body = MeshBuilder.CreateBox(
      `body_${b.id}`,
      { width: b.width, height: b.height, depth: b.depth },
      this.scene,
    );
    body.position.set(b.x, b.height / 2, b.z);
    const facadeMat = new StandardMaterial(`facadeMat_${b.id}`, this.scene);
    facadeMat.diffuseColor = hexToColor3(b.facade);
    facadeMat.emissiveColor = hexToColor3(shadeHex(b.facade, -15));
    body.material = facadeMat;

    // Roof
    const roof = MeshBuilder.CreateBox(
      `roof_${b.id}`,
      { width: b.width + 0.4, height: 0.3, depth: b.depth + 0.4 },
      this.scene,
    );
    roof.position.set(b.x, b.height + 0.15, b.z);
    const roofMat = new StandardMaterial(`roofMat_${b.id}`, this.scene);
    roofMat.diffuseColor = hexToColor3(b.roof);
    roofMat.emissiveColor = hexToColor3(shadeHex(b.roof, -8));
    roof.material = roofMat;

    // Windows (texture-based for performance)
    if (b.floors > 0) {
      const windowTex = this.createWindowTexture(b);
      const windowPlane = MeshBuilder.CreatePlane(
        `windows_${b.id}`,
        { width: b.width * 0.85, height: b.height * 0.85 },
        this.scene,
      );
      windowPlane.position.set(b.x, b.height * 0.5, b.z + b.depth / 2 + 0.05);
      const windowMat = new StandardMaterial(`windowMat_${b.id}`, this.scene);
      windowMat.diffuseTexture = windowTex;
      windowMat.emissiveTexture = windowTex;
      windowMat.emissiveColor = new Color3(0.6, 0.6, 0.6);
      windowMat.opacityTexture = windowTex;
      windowMat.disableLighting = false;
      windowPlane.material = windowMat;

      // Back side too
      const windowPlane2 = windowPlane.clone(`windows_back_${b.id}`);
      windowPlane2.position.z = b.z - b.depth / 2 - 0.05;
      windowPlane2.rotation.y = Math.PI;
    }
  }

  private createWindowTexture(b: BuildingDef): DynamicTexture {
    const tex = new DynamicTexture(
      `winTex_${b.id}`,
      { width: 256, height: 128 },
      this.scene,
      false,
    );
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

    // Transparent base
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, 256, 128);

    const cols = Math.max(3, Math.floor(b.width / 3));
    const rows = b.floors;
    const cellW = 256 / cols;
    const cellH = 128 / rows;

    const facadeRgb = parseInt(b.facade.replace('#', ''), 16);
    const fr = ((facadeRgb >> 16) & 0xff) / 255;
    const fg = ((facadeRgb >> 8) & 0xff) / 255;
    const fb = (facadeRgb & 0xff) / 255;

    const winRgb = parseInt(b.windows.replace('#', ''), 16);
    const wr = ((winRgb >> 16) & 0xff) / 255;
    const wg = ((winRgb >> 8) & 0xff) / 255;
    const wb = (winRgb & 0xff) / 255;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Window frame (facade color)
        ctx.fillStyle = `rgba(${Math.floor(fr * 255)},${Math.floor(fg * 255)},${Math.floor(fb * 255)},1)`;
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);

        // Window pane (glass color)
        const inset = cellW * 0.15;
        ctx.fillStyle = `rgba(${Math.floor(wr * 200 + 55)},${Math.floor(wg * 200 + 55)},${Math.floor(wb * 200 + 55)},0.85)`;
        ctx.fillRect(c * cellW + inset, r * cellH + inset, cellW - inset * 2, cellH - inset * 2);
      }
    }
    tex.update();
    return tex;
  }

  // ─── Trees ──────────────────────────────────────────────────────
  private buildTrees(): void {
    for (const t of TREES) {
      this.createTree(t);
    }
  }

  private createTree(t: TreeDef): void {
    const node = new TransformNode('tree', this.scene);
    node.position.set(t.x, 0, t.z);
    node.scaling.setAll(t.scale);

    const trunkH = t.kind === 'pine' ? 3.5 : t.kind === 'birch' ? 2.8 : 2.6;
    const trunk = MeshBuilder.CreateCylinder(
      'trunk',
      { height: trunkH, diameterTop: 0.15, diameterBottom: 0.3, tessellation: 6 },
      this.scene,
    );
    trunk.position.y = trunkH / 2;
    const trunkMat = new StandardMaterial('trunkMat', this.scene);
    if (t.kind === 'birch') {
      trunkMat.diffuseColor = new Color3(0.85, 0.82, 0.75);
      trunkMat.emissiveColor = new Color3(0.18, 0.17, 0.15);
    } else {
      trunkMat.diffuseColor = new Color3(0.35, 0.24, 0.12);
      trunkMat.emissiveColor = new Color3(0.08, 0.05, 0.03);
    }
    trunk.material = trunkMat;
    trunk.parent = node;

    // Foliage
    const foliageMat = new StandardMaterial('foliageMat', this.scene);
    if (t.kind === 'pine') {
      foliageMat.diffuseColor = new Color3(0.1, 0.35, 0.12);
      foliageMat.emissiveColor = new Color3(0.02, 0.08, 0.03);
    } else if (t.kind === 'maple') {
      foliageMat.diffuseColor = new Color3(0.22, 0.42, 0.12);
      foliageMat.emissiveColor = new Color3(0.06, 0.12, 0.03);
    } else if (t.kind === 'birch') {
      foliageMat.diffuseColor = new Color3(0.3, 0.48, 0.18);
      foliageMat.emissiveColor = new Color3(0.08, 0.14, 0.05);
    } else {
      foliageMat.diffuseColor = new Color3(0.18, 0.4, 0.12);
      foliageMat.emissiveColor = new Color3(0.05, 0.12, 0.04);
    }

    if (t.kind === 'pine') {
      // Conical layers
      for (let i = 0; i < 4; i++) {
        const d = 2.4 - i * 0.4;
        const cone = MeshBuilder.CreateCylinder(
          'cone',
          { height: 1.0, diameterTop: 0, diameterBottom: d, tessellation: 7 },
          this.scene,
        );
        cone.position.y = trunkH - 0.5 + i * 0.7;
        cone.material = foliageMat;
        cone.parent = node;
      }
    } else if (t.kind === 'birch') {
      // Tall oval
      const foliage = MeshBuilder.CreateSphere('foliage', { diameter: 2.0, segments: 6 }, this.scene);
      foliage.position.set(0, trunkH + 0.5, 0);
      foliage.scaling.set(0.8, 1.2, 0.8);
      foliage.material = foliageMat;
      foliage.parent = node;
    } else {
      // Round canopy (oak, maple)
      for (let i = 0; i < 3; i++) {
        const d = 2.4 - i * 0.35;
        const foliage = MeshBuilder.CreateSphere('foliage', { diameter: d, segments: 6 }, this.scene);
        foliage.position.y = trunkH + i * 0.5;
        foliage.scaling.y = 0.7;
        foliage.material = foliageMat;
        foliage.parent = node;
      }
    }
  }

  // ─── Water ──────────────────────────────────────────────────────
  private buildWater(): void {
    const waterMat = new StandardMaterial('waterMat', this.scene);
    waterMat.diffuseColor = new Color3(0.15, 0.35, 0.5);
    waterMat.emissiveColor = new Color3(0.04, 0.1, 0.14);
    waterMat.specularColor = new Color3(0.4, 0.5, 0.6);
    waterMat.alpha = 0.8;

    for (const w of WATER_BODIES) {
      const water = MeshBuilder.CreateGround(
        `water_${w.id}`,
        { width: w.radiusX * 2, height: w.radiusZ * 2, subdivisions: 12 },
        this.scene,
      );
      water.position.set(w.x, 0.05, w.z);
      water.scaling.x = 1;
      water.scaling.z = 1;
      water.material = waterMat;
    }
  }

  // ─── Street furniture ───────────────────────────────────────────
  private buildStreetFurniture(): void {
    for (const f of STREET_FURNITURE) {
      this.createFurniture(f);
    }
  }

  private createFurniture(f: FurnitureDef): void {
    switch (f.kind) {
      case 'lamp': {
        const post = MeshBuilder.CreateCylinder('lampPost', { height: 3.5, diameter: 0.08 }, this.scene);
        post.position.set(f.x, 1.75, f.z);
        const postMat = new StandardMaterial('lampPostMat', this.scene);
        postMat.diffuseColor = new Color3(0.2, 0.2, 0.22);
        post.material = postMat;
        const head = MeshBuilder.CreateSphere('lampHead', { diameter: 0.3 }, this.scene);
        head.position.set(f.x, 3.6, f.z);
        const headMat = new StandardMaterial('lampHeadMat', this.scene);
        headMat.diffuseColor = new Color3(1.0, 0.9, 0.6);
        headMat.emissiveColor = new Color3(0.6, 0.5, 0.2);
        head.material = headMat;
        break;
      }
      case 'bench': {
        const seat = MeshBuilder.CreateBox('benchSeat', { width: 1.6, height: 0.08, depth: 0.5 }, this.scene);
        seat.position.set(f.x, 0.45, f.z);
        seat.rotation.y = f.rotation;
        const woodMat = new StandardMaterial('benchWoodMat', this.scene);
        woodMat.diffuseColor = new Color3(0.45, 0.3, 0.15);
        woodMat.emissiveColor = new Color3(0.1, 0.07, 0.04);
        seat.material = woodMat;
        const frameMat = new StandardMaterial('benchFrameMat', this.scene);
        frameMat.diffuseColor = new Color3(0.15, 0.15, 0.17);
        for (const dx of [-0.7, 0.7]) {
          const leg = MeshBuilder.CreateBox('benchLeg', { width: 0.06, height: 0.4, depth: 0.4 }, this.scene);
          const cos = Math.cos(f.rotation), sin = Math.sin(f.rotation);
          leg.position.set(f.x + dx * cos, 0.22, f.z - dx * sin);
          leg.rotation.y = f.rotation;
          leg.material = frameMat;
        }
        break;
      }
      case 'trash': {
        const can = MeshBuilder.CreateCylinder('trash', { height: 0.7, diameter: 0.3 }, this.scene);
        can.position.set(f.x, 0.35, f.z);
        const mat = new StandardMaterial('trashMat', this.scene);
        mat.diffuseColor = new Color3(0.2, 0.25, 0.2);
        mat.emissiveColor = new Color3(0.04, 0.05, 0.04);
        can.material = mat;
        break;
      }
      case 'hydrant': {
        const body = MeshBuilder.CreateCylinder('hydrantBody', { height: 0.6, diameter: 0.18 }, this.scene);
        body.position.set(f.x, 0.3, f.z);
        const mat = new StandardMaterial('hydrantMat', this.scene);
        mat.diffuseColor = new Color3(0.7, 0.15, 0.1);
        mat.emissiveColor = new Color3(0.15, 0.03, 0.02);
        body.material = mat;
        const top = MeshBuilder.CreateSphere('hydrantTop', { diameter: 0.22 }, this.scene);
        top.position.set(f.x, 0.65, f.z);
        top.material = mat;
        break;
      }
      case 'bollard': {
        const post = MeshBuilder.CreateCylinder('bollard', { height: 0.6, diameter: 0.1 }, this.scene);
        post.position.set(f.x, 0.3, f.z);
        const mat = new StandardMaterial('bollardMat', this.scene);
        mat.diffuseColor = new Color3(0.3, 0.3, 0.32);
        mat.emissiveColor = new Color3(0.06, 0.06, 0.07);
        post.material = mat;
        break;
      }
    }
  }

  // ─── Vehicles ───────────────────────────────────────────────────
  private buildVehicles(): void {
    for (const v of VEHICLES) {
      this.createVehicle(v);
    }
  }

  private createVehicle(v: VehicleDef): void {
    const node = new TransformNode('vehicle', this.scene);
    node.position.set(v.x, 0, v.z);
    node.rotation.y = v.rotation;

    const bodyColor = hexToColor3(v.color);
    const bodyMat = new StandardMaterial('vehicleBodyMat', this.scene);
    bodyMat.diffuseColor = bodyColor;
    bodyMat.emissiveColor = hexToColor3(shadeHex(v.color, -10));
    bodyMat.specularColor = new Color3(0.4, 0.4, 0.4);

    const windowMat = new StandardMaterial('vehicleWindowMat', this.scene);
    windowMat.diffuseColor = new Color3(0.2, 0.3, 0.4);
    windowMat.emissiveColor = new Color3(0.05, 0.08, 0.12);

    // Body
    const bodyH = v.kind === 'truck' ? 1.6 : 1.2;
    const body = MeshBuilder.CreateBox('vehicleBody', { width: 2.0, height: bodyH, depth: 4.2 }, this.scene);
    body.position.y = bodyH / 2 + 0.2;
    body.material = bodyMat;
    body.parent = node;

    // Cabin
    const cabin = MeshBuilder.CreateBox('vehicleCabin', { width: 1.8, height: 0.8, depth: 2.0 }, this.scene);
    cabin.position.set(0, bodyH + 0.5, -0.3);
    cabin.material = windowMat;
    cabin.parent = node;

    // Wheels
    const wheelMat = new StandardMaterial('wheelMat', this.scene);
    wheelMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
    for (const wx of [-1.0, 1.0]) {
      for (const wz of [-1.3, 1.3]) {
        const wheel = MeshBuilder.CreateCylinder('wheel', { height: 0.2, diameter: 0.5 }, this.scene);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.25, wz);
        wheel.material = wheelMat;
        wheel.parent = node;
      }
    }
  }

  // ─── NPCs (people) ──────────────────────────────────────────────
  private buildNpcs(): void {
    for (const npc of NPCS) {
      this.createCharacter(npc.id, npc.name, npc.hue, npc.x, npc.z);
    }
  }

  private createCharacter(
    id: string,
    name: string,
    hue: number,
    tileX: number,
    tileZ: number,
  ): TransformNode {
    const node = new TransformNode(`char_${id}`, this.scene);
    node.position.set(tileX, 0, tileZ);

    // Body (capsule)
    const body = MeshBuilder.CreateCapsule(
      `body_${id}`,
      { radius: 0.22, height: 0.9 },
      this.scene,
    );
    body.position.y = 0.65;
    const bodyMat = new StandardMaterial(`bodyMat_${id}`, this.scene);
    bodyMat.emissiveColor = hslToColor3(hue, 0.6, 0.45);
    bodyMat.diffuseColor = hslToColor3(hue, 0.6, 0.45);
    body.material = bodyMat;
    body.parent = node;

    // Head (sphere)
    const head = MeshBuilder.CreateSphere(`head_${id}`, { diameter: 0.32 }, this.scene);
    head.position.y = 1.2;
    const headMat = new StandardMaterial(`headMat_${id}`, this.scene);
    headMat.emissiveColor = hslToColor3(hue, 0.25, 0.75);
    headMat.diffuseColor = hslToColor3(hue, 0.25, 0.75);
    head.material = headMat;
    head.parent = node;

    // Eyes
    const eyeMat = new StandardMaterial(`eyeMat_${id}`, this.scene);
    eyeMat.emissiveColor = new Color3(1, 1, 1);
    eyeMat.diffuseColor = new Color3(1, 1, 1);

    const leftEye = MeshBuilder.CreateSphere(`leftEye_${id}`, { diameter: 0.06 }, this.scene);
    leftEye.position.set(-0.08, 1.24, 0.14);
    leftEye.material = eyeMat;
    leftEye.parent = node;

    const rightEye = MeshBuilder.CreateSphere(`rightEye_${id}`, { diameter: 0.06 }, this.scene);
    rightEye.position.set(0.08, 1.24, 0.14);
    rightEye.material = eyeMat;
    rightEye.parent = node;

    // Label (floating text)
    this.createCharacterLabel(id, name, hue, node);

    this.characterNodes.set(id, node);
    return node;
  }

  private createCharacterLabel(id: string, name: string, hue: number, parent: TransformNode): void {
    const labelMesh = MeshBuilder.CreatePlane(
      `label_${id}`,
      { width: 2.5, height: 0.6 },
      this.scene,
    );
    labelMesh.position.set(0, 1.8, 0);
    labelMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    labelMesh.parent = parent;

    const tex = new DynamicTexture(
      `labelTex_${id}`,
      { width: 256, height: 64 },
      this.scene,
      false,
    );
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 256, 64, 8);
    ctx.fill();
    ctx.fillStyle = `hsl(${hue}, 70%, 70%)`;
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 34);
    tex.update();

    const mat = new StandardMaterial(`labelMat_${id}`, this.scene);
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.diffuseTexture = tex;
    mat.opacityTexture = tex;
    mat.emissiveTexture = tex;
    mat.disableLighting = true;
    labelMesh.material = mat;

    this.characterLabels.set(id, labelMesh);
  }

  // ─── Avatar characters (kept for sim compatibility) ─────────────
  buildAvatars(_avatars: AvatarState[]): void {
    for (const [id, node] of this.characterNodes) {
      if (!id.startsWith('npc-')) {
        node.dispose();
        this.characterNodes.delete(id);
        const label = this.characterLabels.get(id);
        if (label) {
          label.dispose();
          this.characterLabels.delete(id);
        }
      }
    }
  }

  updateAvatarPositions(_avatars: AvatarState[]): void {
    // No-op: avatars removed
  }

  // ─── Camera framing ────────────────────────────────────────────
  private frameCamera(): void {
    this.camera.target.set(0, 0, 0);
    this.camera.radius = 140;
  }

  // ─── Dispose ───────────────────────────────────────────────────
  dispose(): void {
    for (const [, node] of this.characterNodes) {
      node.dispose();
    }
    for (const [, label] of this.characterLabels) {
      label.dispose();
    }
    this.characterNodes.clear();
    this.characterLabels.clear();
  }
}
