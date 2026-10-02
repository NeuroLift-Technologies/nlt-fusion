// Quick diagnostic: load Soldier.glb, clone it, check bounding box
const THREEjs = (await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js'));
const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js');
const { clone } = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/SkeletonUtils.js');
const THREE = THREEjs;

const response = await fetch('https://threejs.org/examples/models/gltf/Soldier.glb');
const arrayBuffer = await response.arrayBuffer();
const loader = new GLTFLoader();
const gltf = await loader.parseAsync(arrayBuffer);

console.log('=== GLTF Info ===');
console.log('Animations:', gltf.animations.map(a => a.name));
console.log('Scene children:', gltf.scene.children.map(c => c.type + ': ' + c.name));

// Check original scene bounding box
const box0 = new THREE.Box3().setFromObject(gltf.scene);
const size0 = new THREE.Vector3();
box0.getSize(size0);
console.log('\n=== Original Scene ===');
console.log('Bounds size:', size0.x, size0.y, size0.z);
console.log('Bounds min:', box0.min.x, box0.min.y, box0.min.z);
console.log('Bounds max:', box0.max.x, box0.max.y, box0.max.z);

// Check cloned scene bounding box
const clonedScene = clone(gltf.scene);
const box1 = new THREE.Box3().setFromObject(clonedScene);
const size1 = new THREE.Vector3();
box1.getSize(size1);
console.log('\n=== Cloned Scene ===');
console.log('Bounds size:', size1.x, size1.y, size1.z);
console.log('Bounds min:', box1.min.x, box1.min.y, box1.min.z);
console.log('Bounds max:', box1.max.x, box1.max.y, box1.max.z);

const targetH = 1.8;
console.log('\n=== Scale Calculation ===');
console.log('targetH:', targetH);
console.log('size.y:', size1.y);
console.log('scale = targetH / size.y:', size1.y > 0 ? targetH / size1.y : 1);

// Check what meshes are in the cloned scene
clonedScene.traverse((obj) => {
  if (obj.isMesh) {
    const geo = obj.geometry;
    console.log('Mesh:', obj.name, 'type:', obj.type, 'isSkinned:', obj.isSkinnedMesh);
  }
});
