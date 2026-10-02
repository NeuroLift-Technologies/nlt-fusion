import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// sim-core.js and data.js are classic scripts — they set window.WE_SIM_CORE and window.WE_DATA
const WE_SIM_CORE = window.WE_SIM_CORE;
const WE = window.WE_DATA;
if (!WE) {
  document.getElementById('loading').textContent = 'Error: WE_DATA not loaded';
  throw new Error('WE_DATA missing');
}
if (!WE_SIM_CORE) {
  document.getElementById('loading').textContent = 'Error: WE_SIM_CORE not loaded';
  throw new Error('WE_SIM_CORE missing');
}

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.Fog(0x0a0a1a, 50, 150);

// Camera
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(25, 25, 25);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 5;
controls.maxDistance = 80;
controls.target.set(8, 0, 8);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffeedd, 1.5);
sunLight.position.set(20, 30, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 100;
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
fillLight.position.set(-10, 10, -10);
scene.add(fillLight);

// Ground plane
const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

// Grid helper
const gridHelper = new THREE.GridHelper(60, 60, 0x333355, 0x222244);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

// World group
const worldGroup = new THREE.Group();
scene.add(worldGroup);

// Sim meshes
const simMeshes = new Map();
let selectedSimId = null;
let worldState = WE_SIM_CORE.makeInitialWorldState();
let simTime = 0;
let tickCount = 0;

// Materials
const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a4a, roughness: 0.8 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3a6a, roughness: 0.7, transparent: true, opacity: 0.6 });
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x1a1a3a, roughness: 0.9, transparent: true, opacity: 0.3 });

// Furniture colors
const furnitureColors = {
  bed: 0x6b8cae, 'night stand': 0x8b6b4a, 'alarm clock': 0xff6b6b, dresser: 0x8b6b4a,
  fridge: 0xcccccc, stove: 0x444444, sink: 0xaaaaaa, counter: 0x888888, 'coffee maker': 0x666666, table: 0x8b6b4a,
  couch: 0x6b4a8b, tv: 0x111111, laptop: 0x555555, 'music stereo': 0x333333, 'coffee table': 0x8b6b4a,
  toilet: 0xffffff, shower: 0x88aacc, bathtub: 0xeeeeee, mirror: 0xaaccff,
  desk: 0x8b6b4a, chair: 0x666666, bookcase: 0x8b6b4a, computer: 0x444444,
};

function createFurnitureMesh(furn) {
  const color = furnitureColors[furn.furniture_type] || 0x888888;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
  let mesh;
  const type = furn.furniture_type;
  if (type === 'bed') {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 1.2), mat);
    base.position.y = 0.2;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 1.1), new THREE.MeshStandardMaterial({ color: 0xddddee }));
    mattress.position.y = 0.5;
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.9), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    pillow.position.set(-0.5, 0.65, 0);
    group.add(base, mattress, pillow);
    mesh = group;
  } else if (type === 'couch') {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 0.8), mat);
    seat.position.y = 0.2;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 0.2), mat);
    back.position.set(0, 0.5, -0.3);
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.8), mat);
    arm1.position.set(-0.9, 0.35, 0);
    const arm2 = arm1.clone();
    arm2.position.set(0.9, 0.35, 0);
    group.add(seat, back, arm1, arm2);
    mesh = group;
  } else if (type === 'tv') {
    const group = new THREE.Group();
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.05), new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0x222244, emissiveIntensity: 0.3 }));
    screen.position.y = 0.8;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.3), mat);
    stand.position.y = 0.15;
    group.add(screen, stand);
    mesh = group;
  } else if (type === 'fridge') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), mat);
    mesh.position.y = 0.8;
  } else if (type === 'stove') {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.6), mat);
    body.position.y = 0.4;
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    burner.position.set(-0.15, 0.82, -0.15);
    const burner2 = burner.clone(); burner2.position.set(0.15, 0.82, -0.15);
    const burner3 = burner.clone(); burner3.position.set(-0.15, 0.82, 0.15);
    const burner4 = burner.clone(); burner4.position.set(0.15, 0.82, 0.15);
    group.add(body, burner, burner2, burner3, burner4);
    mesh = group;
  } else if (type === 'toilet') {
    const group = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 16), mat);
    bowl.position.y = 0.2;
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.15), mat);
    tank.position.set(0, 0.5, -0.2);
    group.add(bowl, tank);
    mesh = group;
  } else if (type === 'shower') {
    const group = new THREE.Group();
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), mat);
    tray.position.y = 0.025;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    head.position.set(0, 1.5, -0.35);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    bar.position.set(0, 0.75, -0.35);
    group.add(tray, head, bar);
    mesh = group;
  } else if (type === 'desk' || type === 'table') {
    const group = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.7), mat);
    top.position.y = 0.75;
    const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.75, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const leg1 = new THREE.Mesh(legGeo, legMat); leg1.position.set(-0.6, 0.375, -0.25);
    const leg2 = leg1.clone(); leg2.position.set(0.6, 0.375, -0.25);
    const leg3 = leg1.clone(); leg3.position.set(-0.6, 0.375, 0.25);
    const leg4 = leg1.clone(); leg4.position.set(0.6, 0.375, 0.25);
    group.add(top, leg1, leg2, leg3, leg4);
    mesh = group;
  } else if (type === 'chair') {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), mat);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.05), mat);
    back.position.set(0, 0.7, -0.18);
    const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const leg1 = new THREE.Mesh(legGeo, legMat); leg1.position.set(-0.15, 0.225, -0.15);
    const leg2 = leg1.clone(); leg2.position.set(0.15, 0.225, -0.15);
    const leg3 = leg1.clone(); leg3.position.set(-0.15, 0.225, 0.15);
    const leg4 = leg1.clone(); leg4.position.set(0.15, 0.225, 0.15);
    group.add(seat, back, leg1, leg2, leg3, leg4);
    mesh = group;
  } else if (type === 'computer') {
    const group = new THREE.Group();
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.03), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x111133, emissiveIntensity: 0.2 }));
    monitor.position.y = 0.6;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.1), mat);
    stand.position.y = 0.3;
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    keyboard.position.y = 0.78;
    group.add(monitor, stand, keyboard);
    mesh = group;
  } else if (type === 'bookcase') {
    const group = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.3), mat);
    frame.position.y = 0.75;
    const shelfMat2 = new THREE.MeshStandardMaterial({ color: 0x666666 });
    for (let i = 0; i < 3; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.25), shelfMat2);
      shelf.position.set(0, 0.3 + i * 0.45, 0);
      group.add(shelf);
    }
    group.add(frame);
    mesh = group;
  } else if (type === 'laptop') {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.2), mat);
    base.position.y = 0.77;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.01), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x222244, emissiveIntensity: 0.3 }));
    screen.position.set(0, 0.86, -0.09);
    screen.rotation.x = -0.3;
    group.add(base, screen);
    mesh = group;
  } else if (type === 'bathtub') {
    const group = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 1.4), mat);
    outer.position.y = 0.25;
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 1.2), new THREE.MeshStandardMaterial({ color: 0xddeeff }));
    inner.position.y = 0.3;
    group.add(outer, inner);
    mesh = group;
  } else if (type === 'mirror') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.02), new THREE.MeshStandardMaterial({ color: 0xaaccff, metalness: 0.9, roughness: 0.1 }));
    mesh.position.y = 1.2;
  } else if (type === 'sink') {
    const group = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.15, 16), mat);
    basin.position.y = 0.75;
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.75, 8), mat);
    pedestal.position.y = 0.375;
    group.add(basin, pedestal);
    mesh = group;
  } else if (type === 'counter') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.5), mat);
    mesh.position.y = 0.45;
  } else if (type === 'coffee maker') {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.2), mat);
    body.position.y = 0.85;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pot.position.set(0, 0.72, 0.05);
    group.add(body, pot);
    mesh = group;
  } else if (type === 'music stereo') {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.3), mat);
    body.position.y = 0.8;
    const speaker1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.25), mat);
    speaker1.position.set(-0.4, 0.9, 0);
    const speaker2 = speaker1.clone();
    speaker2.position.set(0.4, 0.9, 0);
    group.add(body, speaker1, speaker2);
    mesh = group;
  } else if (type === 'night stand') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), mat);
    mesh.position.y = 0.25;
  } else if (type === 'dresser') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.4), mat);
    mesh.position.y = 0.4;
  } else if (type === 'alarm clock') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 0.3 }));
    mesh.position.y = 0.9;
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat);
    mesh.position.y = 0.2;
  }

  if (mesh) {
    mesh.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
  }
  return mesh;
}

function createSimMesh(sim) {
  const group = new THREE.Group();
  const asset = (window.WE_ASSETS ? window.WE_ASSETS.characterFor(sim.name)
                                  : { tint: 0x4a90d9, skin: 0xffddbb });

  // Articulated low-poly human (until a GLB in assets.js replaces it):
  // torso + head + arms + legs that swing while walking, so Sims read as
  // people at a glance. GLB models load async and swap the body in place.
  const clothMat = new THREE.MeshStandardMaterial({ color: asset.tint, roughness: 0.6 });
  const skinMat = new THREE.MeshStandardMaterial({ color: asset.skin, roughness: 0.55 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.85 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 6, 12), clothMat);
  torso.position.y = 0.62;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), skinMat);
  head.position.y = 1.12;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.y = 1.15;
  group.add(hair);

  function limb(w, len, mat, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(w, len, 4, 8), mat);
    mesh.position.y = -(len / 2 + w);
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }
  const armL = limb(0.05, 0.3, clothMat, -0.24, 0.86);
  const armR = limb(0.05, 0.3, clothMat, 0.24, 0.86);
  const legL = limb(0.065, 0.34, new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.7 }), -0.09, 0.42);
  const legR = limb(0.065, 0.34, new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.7 }), 0.09, 0.42);
  group.userData.limbs = { armL, armR, legL, legR };
  group.userData.walkPhase = Math.random() * Math.PI * 2;

  // Async GLB upgrade: if assets.js points this Sim at a model file,
  // load and swap it in without touching the ring/label above.
  if (asset.model && asset.model !== 'procedural') {
    import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      new GLTFLoader().load(asset.model, (gltf) => {
        const model = gltf.scene;
        model.traverse(c => { if (c.isMesh) { c.castShadow = true; } });
        model.position.y = 0;
        // Hide procedural body, keep ring + label
        for (const child of [...group.children]) {
          if (child.isMesh && child !== head) child.visible = false;
        }
        group.add(model);
      }, undefined, () => { /* keep procedural on failure */ });
    }).catch(() => {});
  }

  // State glow ring
  const ringGeo = new THREE.RingGeometry(0.25, 0.35, 16);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  ring.name = 'state-ring';
  group.add(ring);

  // Name label (sprite)
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 256, 64, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(sim.name, 128, 40);
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.y = 1.5;
  sprite.scale.set(1.2, 0.3, 1);
  group.add(sprite);

  group.userData = { simId: sim.id, simName: sim.name };
  return group;
}

function clearWorld() {
  while (worldGroup.children.length > 0) {
    const child = worldGroup.children[0];
    worldGroup.remove(child);
    child.traverse?.(c => {
      if (c.geometry) c.geometry.dispose?.();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose?.());
        else c.material.dispose?.();
      }
    });
  }
  simMeshes.clear();
}

function buildWorld() {
  clearWorld();

  // Create rooms
  const roomGroup = new THREE.Group();
  let roomIdx = 0;
  for (const room of WE.ROOMS) {
    const floorGeo = new THREE.PlaneGeometry(room.w, room.h);
    const floorMat2 = new THREE.MeshStandardMaterial({
      color: new THREE.Color(room.color || '#1f6fb2'),
      roughness: 0.8,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat2);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x + room.w / 2, 0.02, room.y + room.h / 2);
    floor.receiveShadow = true;
    roomGroup.add(floor);

    // Walls
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const wallH = 2.5;
    const wallT = 0.1;
    // Front/back
    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(room.w, wallH, wallT), wallMat);
    wall1.position.set(cx, wallH / 2, room.y);
    const wall2 = new THREE.Mesh(new THREE.BoxGeometry(room.w, wallH, wallT), wallMat);
    wall2.position.set(cx, wallH / 2, room.y + room.h);
    // Left/right
    const wall3 = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, room.h), wallMat);
    wall3.position.set(room.x, wallH / 2, cy);
    const wall4 = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, room.h), wallMat);
    wall4.position.set(room.x + room.w, wallH / 2, cy);
    roomGroup.add(wall1, wall2, wall3, wall4);

    roomIdx++;
  }
  worldGroup.add(roomGroup);

  // Create furniture from props
  for (const room of WE.ROOMS) {
    for (const prop of (room.props || [])) {
      const furn = {
        furniture_type: prop.kind,
        position: { x: room.x + (prop.x || 0), y: room.y + (prop.y || 0) }
      };
      const mesh = createFurnitureMesh(furn);
      if (mesh) worldGroup.add(mesh);
    }
  }

  // Create NPCs
  for (const npc of WE.NPCS) {
    if (npc.invisible) continue;
    const group = new THREE.Group();
    const color = new THREE.Color().setHSL((npc.hue || 200) / 360, 0.5, 0.5);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.4, 8, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    body.position.y = 0.45;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffddbb }));
    head.position.y = 0.8;
    head.castShadow = true;
    group.add(body, head);
    group.position.set(npc.x, 0, npc.y);
    worldGroup.add(group);
  }

  // Create Sims
  for (const sim of worldState.avatars) {
    const room = WE.ROOMS.find(r => r.id === sim.room) || WE.ROOMS[0];
    const mesh = createSimMesh(sim);
    mesh.position.set(sim.px, 0, sim.py);
    worldGroup.add(mesh);
    simMeshes.set(sim.id, mesh);
  }

  // Update UI
  document.getElementById('sim-count').textContent = worldState.avatars.length;
  document.getElementById('loading').style.display = 'none';
}

function updateSimPositions() {
  for (const av of worldState.avatars) {
    const mesh = simMeshes.get(av.id);
    if (mesh) {
      const dx = av.px - mesh.position.x;
      const dz = av.py - mesh.position.z;
      const moving = Math.abs(dx) + Math.abs(dz) > 0.02;
      mesh.position.x += dx * 0.05;
      mesh.position.z += dz * 0.05;
      // Walk cycle: swing limbs while moving, relax when idle
      const limbs = mesh.userData.limbs;
      if (limbs) {
        mesh.userData.walkPhase += moving ? 0.18 : 0.02;
        const swing = moving ? 0.55 : 0.03;
        const t = mesh.userData.walkPhase;
        limbs.legL.rotation.x = Math.sin(t) * swing;
        limbs.legR.rotation.x = -Math.sin(t) * swing;
        limbs.armL.rotation.x = -Math.sin(t) * swing * 0.8;
        limbs.armR.rotation.x = Math.sin(t) * swing * 0.8;
      }
      // Update state ring color
      const ring = mesh.getObjectByName('state-ring');
      if (ring) {
        const stateColors = {
          idle: 0x00ff88, working: 0x00aaff, drifting: 0xffaa00,
          hyperfocus: 0xff00ff, overwhelmed: 0xff0000, coached: 0xffff00,
        };
        ring.material.color.setHex(stateColors[av.state] || 0x00ff88);
        ring.material.opacity = av.state === 'idle' ? 0.3 : 0.8;
      }
    }
  }
}

function updateEventLog() {
  document.getElementById('event-count').textContent = worldState.events.length;
  const eventsEl = document.getElementById('events');
  const kindColors = {
    TASK_START: '#00ff88', FOCUS_DRIFT: '#ffaa00', HYPERFOCUS_ENTER: '#ff00ff',
    STRESS_SPIKE: '#ff4444', COGNITIVE_LOAD_HIGH: '#ff6600', COACHING_INTERVENTION: '#ffff00',
    TASK_COMPLETE: '#00ff88', TASK_FAIL: '#ff4444', NPC_INTERRUPT: '#ff8800',
  };
  eventsEl.innerHTML = worldState.events.slice(0, 20).map(evt => `
    <div class="event">
      <span class="kind" style="color:${kindColors[evt.kind] || '#888'}">${evt.kind}</span>
      <span class="text">${evt.text}</span>
    </div>
  `).join('');
}

function updateTimeDisplay() {
  document.getElementById('time-display').textContent = `Tick ${tickCount} · ${simTime.toFixed(0)} min`;
}

function updateSimInfo() {
  if (!selectedSimId) {
    document.getElementById('sim-info').style.display = 'none';
    return;
  }
  const av = worldState.avatars.find(a => a.id === selectedSimId);
  if (!av) return;

  const infoEl = document.getElementById('sim-info');
  const nameEl = document.getElementById('sim-name');
  const traitEl = document.getElementById('sim-trait');
  const needsEl = document.getElementById('sim-needs');
  infoEl.style.display = 'block';
  nameEl.textContent = av.name;
  traitEl.textContent = av.trait || av.blurb || '';

  const needColors = {
    focus: '#6bff95', cognitive_load: '#ffaa00', stress: '#ff6b6b',
    burnout: '#ff0000', independence: '#6bb5ff', fusion_ready: '#e879f9',
  };
  const needs = {
    focus: av.focus,
    cognitive_load: av.cogLoad,
    stress: av.stress,
    burnout: av.burnout,
    independence: av.independence,
    fusion_ready: av.fusionReady,
  };
  needsEl.innerHTML = '';
  for (const [key, value] of Object.entries(needs)) {
    const color = needColors[key] || '#888';
    const pct = Math.round(value * 100);
    needsEl.innerHTML += `
      <div class="need-bar">
        <span class="name">${key.replace('_', ' ')}</span>
        <div class="bar"><div class="fill" style="width:${pct}%;background:${color}"></div></div>
      </div>
    `;
  }
}

// Click handler for sim selection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
renderer.domElement.addEventListener('click', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const simObjects = Array.from(simMeshes.values());
  const intersects = raycaster.intersectObjects(simObjects, true);
  if (intersects.length > 0) {
    let obj = intersects[0].object;
    while (obj && !obj.userData?.simId) obj = obj.parent;
    if (obj?.userData?.simId) {
      selectedSimId = obj.userData.simId;
      updateSimInfo();
    }
  }
});

// Tick loop — live mode streams the real engine; offline ticks sim-core.
let liveHandle = null;
let liveStatusEl = null;
function tick() {
  if (liveHandle) return; // live state arrives via onLiveState
  tickCount++;
  simTime += 1;
  worldState = WE_SIM_CORE.tickWorld(worldState, {
    ts: 1,
    dysOn: true,
    threshold: 0.6,
  });
  updateSimPositions();
  updateEventLog();
  updateTimeDisplay();
  updateSimInfo();
}

/** Reconcile renderer meshes with a new avatar list (join/leave/move). */
function syncAvatarsToState() {
  const seen = new Set();
  for (const av of worldState.avatars) {
    seen.add(av.id);
    let mesh = simMeshes.get(av.id);
    if (!mesh) {
      mesh = createSimMesh(av);
      mesh.position.set(av.px, 0, av.py);
      worldGroup.add(mesh);
      simMeshes.set(av.id, mesh);
    } else {
      // Carry the new target over; updateSimPositions eases toward it.
      mesh.position.y = 0;
    }
    // Keep label fresh
    mesh.userData.simName = av.name;
  }
  for (const [id, mesh] of [...simMeshes]) {
    if (!seen.has(id)) {
      worldGroup.remove(mesh);
      simMeshes.delete(id);
    }
  }
  document.getElementById('sim-count').textContent = worldState.avatars.length;
}

function onLiveState(next) {
  worldState = next;
  tickCount++;
  syncAvatarsToState();
  updateSimPositions();
  updateEventLog();
  updateTimeDisplay();
  updateSimInfo();
}
if (window.WE_LIVE && window.WE_LIVE.isLiveMode()) {
  liveStatusEl = document.createElement('div');
  liveStatusEl.id = 'live-status';
  liveStatusEl.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10;background:rgba(10,40,20,.92);border:1px solid rgba(0,255,136,.35);border-radius:999px;padding:6px 14px;font-size:12px;color:#6bff95';
  liveStatusEl.textContent = 'live · connecting…';
  document.body.appendChild(liveStatusEl);
  liveHandle = window.WE_LIVE.connect({
    onState: onLiveState,
    onStatus: (t) => { liveStatusEl.textContent = t; },
  });
} else {
  setInterval(tick, 1000);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  // Animate Sims (bobbing)
  const time = Date.now() * 0.003;
  for (const [id, mesh] of simMeshes) {
    mesh.position.y = Math.sin(time + mesh.position.x) * 0.02;
  }
  renderer.render(scene, camera);
}
animate();

// Initial build
buildWorld();

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
