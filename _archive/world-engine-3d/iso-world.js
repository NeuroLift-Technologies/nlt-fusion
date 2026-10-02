import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

if (typeof window !== 'undefined' && window.__weMarkBoot) window.__weMarkBoot('iso-world module ran');

const WE = window.WE_DATA;
const SIM = window.WE_SIM_CORE;

function seededRandom(seed){let s=seed;return()=>{s=(s*1664525+1013904223)>>>0;return(s&0xfffffff)/0xfffffff;};}

function makeWoodTexture(){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const rng=seededRandom(42);ctx.fillStyle='#8B6B4A';ctx.fillRect(0,0,128,128);for(let i=0;i<16;i++){ctx.beginPath();ctx.moveTo(0,i*8+rng()*3);for(let x=0;x<128;x+=4)ctx.lineTo(x,i*8+Math.sin(x*0.2)*1.5+rng()*1.5);ctx.stroke();}ctx.strokeStyle='rgba(0,0,0,0.25)';for(let i=1;i<16;i++){ctx.beginPath();ctx.moveTo(0,i*8);ctx.lineTo(128,i*8);ctx.stroke();}const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;return tex;}
function makeTileTexture(){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#d8d4c8';ctx.fillRect(0,0,64,64);ctx.strokeStyle='#b0a890';ctx.lineWidth=2;ctx.strokeRect(1,1,62,62);const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;return tex;}
function makeCarpetTexture(hue=200){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const rng=seededRandom(hue);ctx.fillStyle=`hsl(${hue},30%,22%)`;ctx.fillRect(0,0,128,128);for(let i=0;i<400;i++){ctx.fillStyle=`hsla(${hue},25%,${18+rng()*12}%,0.25)`;ctx.fillRect(rng()*128,rng()*128,1.5,1.5);}const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;return tex;}
function makeWallTexture(){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const rng=seededRandom(99);ctx.fillStyle='#3a3a5a';ctx.fillRect(0,0,128,128);for(let i=0;i<120;i++){ctx.fillStyle=`rgba(255,255,255,${rng()*0.04})`;ctx.fillRect(rng()*128,rng()*128,1,1);}const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;return tex;}
function makeGrassTexture(){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');const rng=seededRandom(77);ctx.fillStyle='#2d5a3d';ctx.fillRect(0,0,64,64);for(let i=0;i<150;i++){ctx.fillStyle=`hsl(${100+rng()*40},${40+rng()*20}%,${22+rng()*12}%)`;ctx.fillRect(rng()*64,rng()*64,1,2+rng());}const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;return tex;}

const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(window.innerWidth,window.innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.0;
document.body.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0a0a1a);
scene.fog=new THREE.Fog(0x0a0a1a, 20, 120);
scene.environment = new THREE.Color(0x0a0a1a);

const camera=new THREE.PerspectiveCamera(35,window.innerWidth/window.innerHeight,0.1,500);
camera.position.set(25,30,25);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=0.05;controls.minDistance=8;controls.maxDistance=80;
controls.maxPolarAngle=Math.PI/2.3;controls.target.set(8,0,8);

let cameraMode='free',followTarget=null,cinematicAngle=0;

const ambientLight=new THREE.AmbientLight(0x202030,0.6);scene.add(ambientLight);
const sunLight=new THREE.DirectionalLight(0xffeedd,1.8);sunLight.position.set(20,30,10);
sunLight.castShadow=true;sunLight.shadow.mapSize.width=2048;sunLight.shadow.mapSize.height=2048;
sunLight.shadow.camera.near=0.5;sunLight.shadow.camera.far=150;
sunLight.shadow.camera.left=-50;sunLight.shadow.camera.right=50;sunLight.shadow.camera.top=50;sunLight.shadow.camera.bottom=-50;
sunLight.shadow.bias=-0.0001;sunLight.shadow.radius=4;sunLight.shadow.normalBias=0.05;
scene.add(sunLight);

const hemiLight=new THREE.HemisphereLight(0x87CEEB,0x2d5a3d,0.4);scene.add(hemiLight);

const roomLights=[];
for(const room of WE.ROOMS){
  const light=new THREE.PointLight(0xffeedd,0.5,10);
  light.position.set(room.x+room.w/2,2.8,room.y+room.h/2);light.castShadow=true;
  light.shadow.mapSize.width=512;light.shadow.mapSize.height=512;scene.add(light);
  roomLights.push({light,roomId:room.id});
}

// Detailed ground with normal mapping for realistic terrain
function makeGroundTexture(){
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
  // Base dirt color
  ctx.fillStyle='#8b7355';ctx.fillRect(0,0,256,256);
  // Random dark/light spots for variation
  for(let i=0;i<200;i++){
    const x=Math.random()*256, y=Math.random()*256;
    const darkness=Math.random();
    ctx.fillStyle=`rgba(139,115,85,${0.3+darkness*0.4})`;ctx.fillRect(x,y,2,2);
  }
  // Make it repeatable with subtle variation
  const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function makeGroundNormalMap(){
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
  ctx.fillStyle='#808080';ctx.fillRect(0,0,256,256);
  // Add some bump detail
  for(let i=0;i<500;i++){
    const x=Math.random()*256, y=Math.random()*256;
    const val=Math.random()*50+50;
    ctx.fillStyle=`rgba(${val},${val},${val},0.3)`;ctx.fillRect(x,y,1,1);
  }
  const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
const grassTex=makeGrassTexture();grassTex.repeat.set(50,50);
const groundNormalMap=makeGroundNormalMap();
const ground=new THREE.Mesh(
  new THREE.PlaneGeometry(200,200),
  new THREE.MeshStandardMaterial({ 
    map: grassTex, 
    roughness: 0.85, 
    metalness: 0.02,
    normalMap: groundNormalMap,
    normalScale: new THREE.Vector2(0.1, 0.1)
  })
);
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.position.y=0;scene.add(ground);

function makePath(x1,z1,x2,z2,width=1.2){const dx=x2-x1,dz=z2-z1;const len=Math.sqrt(dx*dx+dz*dz);const path=new THREE.Mesh(new THREE.PlaneGeometry(width,len),new THREE.MeshStandardMaterial({color:0xb8a88a,roughness:0.9}));path.rotation.x=-Math.PI/2;path.rotation.z=-Math.atan2(dx,dz);path.position.set((x1+x2)/2,0.025,(z1+z2)/2);path.receiveShadow=true;return path;}
scene.add(makePath(6,4,16,4));scene.add(makePath(16,4,22,11));scene.add(makePath(5,12,16,11));scene.add(makePath(16,11,16,15));

function makeTree(x,z,scale=1){const group=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.1*scale,0.15*scale,1.2*scale,8),new THREE.MeshStandardMaterial({color:0x6b4226}));trunk.position.y=0.6*scale;trunk.castShadow=true;const foliage=new THREE.Mesh(new THREE.SphereGeometry(0.6*scale,12,8),new THREE.MeshStandardMaterial({color:0x3a7a4a}));foliage.position.y=1.5*scale;foliage.castShadow=true;const foliage2=new THREE.Mesh(new THREE.SphereGeometry(0.4*scale,10,6),new THREE.MeshStandardMaterial({color:0x4a8a5a}));foliage2.position.set(0.2*scale,2.0*scale,0.1*scale);foliage2.castShadow=true;group.add(trunk,foliage,foliage2);group.position.set(x,0,z);return group;}
for(const[x,z]of[[-5,-5],[-8,5],[-3,20],[35,-8],[40,10],[38,25],[10,30],[25,35],[-10,15],[45,20]])scene.add(makeTree(x,z,0.8+Math.random()*0.5));

function makeBush(x,z){const group=new THREE.Group();for(let i=0;i<3;i++){const bush=new THREE.Mesh(new THREE.SphereGeometry(0.2+Math.random()*0.15,8,6),new THREE.MeshStandardMaterial({color:`hsl(${110+Math.random()*30},40%,${25+Math.random()*10}%)`}));bush.position.set((i-1)*0.2,0.15,Math.random()*0.2);bush.castShadow=true;group.add(bush);}group.position.set(x,0,z);return group;}
for(let i=0;i<20;i++)scene.add(makeBush(-8+Math.random()*50,-8+Math.random()*45));

const worldGroup=new THREE.Group();scene.add(worldGroup);
const simMeshes=new Map();const aideMeshes=new Map();const fusionMeshes=new Map();
let worldState=SIM.makeInitialWorldState();let tickCount=0,paused=false,selectedSimId=null,gameTime=600;
const eventFeed=[];

const woodTex=makeWoodTexture(),tileTex=makeTileTexture();
const carpetTex1=makeCarpetTexture(200),carpetTex2=makeCarpetTexture(280),wallTex=makeWallTexture();
const roomFloorTextures={office:woodTex,meeting:carpetTex1,home:woodTex,phone:tileTex,lounge:carpetTex2};

function buildRoom(room){
  const group=new THREE.Group();const tex=roomFloorTextures[room.id]||woodTex;tex.repeat.set(room.w,room.h);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(room.w,room.h),new THREE.MeshStandardMaterial({map:tex.clone(),roughness:0.85}));
  floor.rotation.x=-Math.PI/2;floor.position.set(room.x+room.w/2,0.02,room.y+room.h/2);floor.receiveShadow=true;group.add(floor);
  const wallH=3.2,wallT=0.2;const wallMat=new THREE.MeshStandardMaterial({map:wallTex.clone(),roughness:0.75,transparent:true,opacity:0.55});
  const cx=room.x+room.w/2,cy=room.y+room.h/2;
  const walls=[
    new THREE.Mesh(new THREE.BoxGeometry(room.w+wallT,wallH,wallT),wallMat),
    new THREE.Mesh(new THREE.BoxGeometry(room.w+wallT,wallH,wallT),wallMat.clone()),
    new THREE.Mesh(new THREE.BoxGeometry(wallT,wallH,room.h+wallT),wallMat.clone()),
    new THREE.Mesh(new THREE.BoxGeometry(wallT,wallH,room.h+wallT),wallMat.clone()),
  ];
  walls[0].position.set(cx,wallH/2,room.y-wallT/2);walls[1].position.set(cx,wallH/2,room.y+room.h+wallT/2);
  walls[2].position.set(room.x-wallT/2,wallH/2,cy);walls[3].position.set(room.x+room.w+wallT/2,wallH/2,cy);
  walls.forEach(w=>{w.castShadow=true;w.receiveShadow=true;group.add(w);});
  const door=new THREE.Mesh(new THREE.BoxGeometry(0.8,2.2,0.25),new THREE.MeshStandardMaterial({color:0x4a3520}));
  door.position.set(cx,1.1,room.y-wallT/2);group.add(door);
  const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=64;
  const lctx=labelCanvas.getContext('2d');lctx.fillStyle='rgba(0,0,0,0.7)';lctx.beginPath();lctx.roundRect(0,0,256,64,8);lctx.fill();
  lctx.fillStyle='#fff';lctx.font='bold 24px system-ui';lctx.textAlign='center';lctx.fillText(room.name,128,40);
  const labelSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(labelCanvas),transparent:true}));
  labelSprite.position.set(cx,4.5,cy);labelSprite.scale.set(3,0.75,1);group.add(labelSprite);
  return group;
}
for(const room of WE.ROOMS)worldGroup.add(buildRoom(room));

function createFurniture(prop,room){
  const x=room.x+(prop.x||0)+(prop.w?prop.w/2:0.5);const z=room.y+(prop.y||0)+(prop.h?prop.h/2:0.5);
  const group=new THREE.Group();group.position.set(x,0,z);const kind=prop.kind;
  if(kind==='desk'||kind==='table'||kind==='longtable'){
    const w=prop.w||2,d=prop.h||1;const top=new THREE.Mesh(new THREE.BoxGeometry(w,0.1,d),new THREE.MeshStandardMaterial({color:0x8b6b4a}));top.position.y=0.78;top.castShadow=true;group.add(top);
    const legGeo=new THREE.CylinderGeometry(0.04,0.04,0.78,8);
    for(const[lx,lz]of[[-w/2+0.1,-d/2+0.1],[w/2-0.1,-d/2+0.1],[-w/2+0.1,d/2-0.1],[w/2-0.1,d/2-0.1]]){const leg=new THREE.Mesh(legGeo,new THREE.MeshStandardMaterial({color:0x3a2a1a}));leg.position.set(lx,0.39,lz);group.add(leg);}
  } else if(kind==='monitor'||kind==='screen'){
    const h=kind==='screen'?1.8:0.9;const screen=new THREE.Mesh(new THREE.BoxGeometry(0.9,h,0.04),new THREE.MeshStandardMaterial({color:0x111122,emissive:0x222244,emissiveIntensity:0.15}));screen.position.y=h/2+0.4;screen.castShadow=true;group.add(screen);
  } else if(kind==='chair'){
    const seat=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.06,0.45),new THREE.MeshStandardMaterial({color:0x555555}));seat.position.y=0.48;seat.castShadow=true;group.add(seat);
    const back=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.55,0.06),new THREE.MeshStandardMaterial({color:0x555555}));back.position.set(0,0.75,-0.19);back.castShadow=true;group.add(back);
  } else if(kind==='plant'){
    const pot=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.1,0.28,12),new THREE.MeshStandardMaterial({color:0x8b4513}));pot.position.y=0.14;
    const foliage=new THREE.Mesh(new THREE.SphereGeometry(0.22,12,8),new THREE.MeshStandardMaterial({color:0x3a8a4a}));foliage.position.y=0.45;foliage.castShadow=true;group.add(pot,foliage);
  } else if(kind==='sofa'){
    const w=prop.w||2;const seat=new THREE.Mesh(new THREE.BoxGeometry(w,0.38,0.75),new THREE.MeshStandardMaterial({color:0x6b4a8b}));seat.position.y=0.28;seat.castShadow=true;group.add(seat);
    const back=new THREE.Mesh(new THREE.BoxGeometry(w,0.55,0.18),new THREE.MeshStandardMaterial({color:0x6b4a8b}));back.position.set(0,0.55,-0.28);back.castShadow=true;group.add(back);
  } else if(kind==='fridge'){
    const body=new THREE.Mesh(new THREE.BoxGeometry(0.75,1.9,0.65),new THREE.MeshStandardMaterial({color:0xeeeeee}));body.position.y=0.95;body.castShadow=true;group.add(body);
  } else if(kind==='counter'){
    const body=new THREE.Mesh(new THREE.BoxGeometry(prop.w||1.5,0.9,prop.h||0.6),new THREE.MeshStandardMaterial({color:0x888888}));body.position.y=0.45;body.castShadow=true;group.add(body);
  } else {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.4,0.4),new THREE.MeshStandardMaterial({color:0x888888}));mesh.position.y=0.2;mesh.castShadow=true;group.add(mesh);
  }
  group.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});
  return group;
}
for(const room of WE.ROOMS)for(const prop of(room.props||[]))worldGroup.add(createFurniture(prop,room));

// ─── PARTICLE SYSTEM ──────────────────────────────────────────────────
function createParticleSystem(position,color,count=20,type='burst'){
  const geo=new THREE.BufferGeometry();const positions=new Float32Array(count*3);const velocities=[];
  for(let i=0;i<count;i++){positions[i*3]=position.x;positions[i*3+1]=position.y+1;positions[i*3+2]=position.z;velocities.push({x:(Math.random()-0.5)*0.05,y:Math.random()*0.03+0.01,z:(Math.random()-0.5)*0.05});}
  geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const mat=new THREE.PointsMaterial({color,size:0.06,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending});
  const points=new THREE.Points(geo,mat);points.userData={velocities,life:1.0,type};
  scene.add(points);
  return points;
}

function updateParticles(delta){
  scene.children.filter(c=>c.isPoints&&c.userData.type).forEach(p=>{
    p.userData.life-=delta*0.5;p.material.opacity=Math.max(0,p.userData.life*0.8);
    const pos=p.geometry.attributes.position.array;const vel=p.userData.velocities;
    for(let i=0;i<vel.length;i++){pos[i*3]+=vel[i].x;pos[i*3+1]+=vel[i].y;pos[i*3+2]+=vel[i].z;vel[i].y-=0.0005;}
    p.geometry.attributes.position.needsUpdate=true;
    if(p.userData.life<=0)scene.remove(p);
  });
}

function triggerEmotionalFeedback(mesh,state){
  const pos=mesh.position.clone();
  switch(state){
    case'hyperfocus':createParticleSystem(pos,0x00ffff,15,'spark');break;
    case'drifting':createParticleSystem(pos,0x4488ff,10,'drip');break;
    case'overwhelmed':createParticleSystem(pos,0xff4444,15,'burst');break;
    case'coached':createParticleSystem(pos,0xff88ff,12,'float');break;
  }
}

// ─── FUSION CEREMONY ──────────────────────────────────────────────────
function triggerFusionCeremony(av,mesh,aideMesh){
  const pos=mesh.position.clone();
  // Create massive particle burst
  for(let i=0;i<5;i++)createParticleSystem(pos,0xff88ff,20,'burst');
  for(let i=0;i<5;i++)createParticleSystem(pos,0x88ffff,20,'float');
  // Flash effect
  const flash=new THREE.PointLight(0xffffff,5,20);flash.position.copy(pos).y+=2;scene.add(flash);
  setTimeout(()=>scene.remove(flash),1000);
  // Merge characters
  if(aideMesh){
    aideMesh.visible=false;
    scene.remove(aideMesh);
    aideMeshes.delete(av.id);
  }
  // Create fused character (Advocate)
  const fusedGroup=new THREE.Group();
  const fusedColor=new THREE.Color().setHSL(av.hue/360,0.8,0.6);
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.2,0.6,8,16),new THREE.MeshStandardMaterial({color:fusedColor,emissive:fusedColor,emissiveIntensity:0.3}));
  body.position.y=0.6;body.castShadow=true;fusedGroup.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.16,16,16),new THREE.MeshStandardMaterial({color:0xffddbb}));
  head.position.y=1.05;head.castShadow=true;fusedGroup.add(head);
  // Glowing aura
  const aura=new THREE.Mesh(new THREE.SphereGeometry(0.4,16,16),new THREE.MeshBasicMaterial({color:0xff88ff,transparent:true,opacity:0.3,blending:THREE.AdditiveBlending}));
  aura.position.y=0.7;fusedGroup.add(aura);
  // Crown/halo
  const halo=new THREE.Mesh(new THREE.TorusGeometry(0.25,0.03,8,24),new THREE.MeshBasicMaterial({color:0xffff00}));
  halo.rotation.x=Math.PI/2;halo.position.y=1.3;fusedGroup.add(halo);
  fusedGroup.position.copy(mesh.position);
  worldGroup.add(fusedGroup);
  fusionMeshes.set(av.id,fusedGroup);
  // Update UI
  addEvent(`🌟 FUSION! ${av.name} + ${WE.AIDES[av.id]?.name} = ADVOCATE!`,'success');
  showThoughtBubble(mesh,'🌟','ADVOCATE!');
}

// ─── CHARACTER CREATION ──────────────────────────────────────────────
function createCharacter(sim,isAide=false){
  const group=new THREE.Group();const hue=sim.hue/360;
  // Live avatars get stable outfit colors from the asset manifest
  // (assets.js); scenario avatars keep hue/aide colors.
  let manifestEntry=null;
  try{ if(sim.name&&window.WE_ASSETS)manifestEntry=window.WE_ASSETS.characterFor(sim.name); }catch(e){/* optional */}
  const bodyColor=manifestEntry?new THREE.Color(manifestEntry.tint):(isAide?new THREE.Color().setHSL((hue+0.5)%1,0.5,0.5):new THREE.Color().setHSL(hue,0.6,0.5));
  const skinColor=manifestEntry?new THREE.Color(manifestEntry.skin):new THREE.Color(0xffddbb);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(0.25,16),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.25}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=0.02;group.add(shadow);
  const legGeo=new THREE.CapsuleGeometry(0.06,0.25,4,8);
  const legMat=new THREE.MeshStandardMaterial({color:isAide?0x222244:0x333366});
  const legL=new THREE.Mesh(legGeo,legMat);legL.position.set(-0.07,0.22,0);legL.name='legL';group.add(legL);
  const legR=new THREE.Mesh(legGeo,legMat);legR.position.set(0.07,0.22,0);legR.name='legR';group.add(legR);
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.15,0.3,8,16),new THREE.MeshStandardMaterial({color:bodyColor}));
  body.position.y=0.55;body.castShadow=true;group.add(body);
  const armGeo=new THREE.CapsuleGeometry(0.05,0.22,4,8);
  const armMat=new THREE.MeshStandardMaterial({color:isAide?0x4466aa:0xffffff});
  const armL=new THREE.Mesh(armGeo,armMat);armL.position.set(-0.2,0.6,0);armL.name='armL';group.add(armL);
  const armR=new THREE.Mesh(armGeo,armMat);armR.position.set(0.2,0.6,0);armR.name='armR';group.add(armR);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.13,16,16),new THREE.MeshStandardMaterial({color:skinColor}));
  head.position.y=0.92;head.castShadow=true;head.name='head';group.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(0.14,16,8,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(hue,0.4,0.25)}));
  hair.position.y=0.95;group.add(hair);
  const eyeGeo=new THREE.SphereGeometry(0.022,8,8);const eyeMat=new THREE.MeshBasicMaterial({color:0xffffff});
  const pupilGeo=new THREE.SphereGeometry(0.012,8,8);const pupilMat=new THREE.MeshBasicMaterial({color:0x222222});
  const eyeL=new THREE.Mesh(eyeGeo,eyeMat);eyeL.position.set(-0.045,0.94,0.11);eyeL.name='eyeL';group.add(eyeL);
  const pupilL=new THREE.Mesh(pupilGeo,pupilMat);pupilL.position.set(-0.045,0.94,0.125);pupilL.name='pupilL';group.add(pupilL);
  const eyeR=eyeL.clone();eyeR.position.set(0.045,0.94,0.11);eyeR.name='eyeR';group.add(eyeR);
  const pupilR=pupilL.clone();pupilR.position.set(0.045,0.94,0.125);pupilR.name='pupilR';group.add(pupilR);

  // Mouth (expression)
  const mouthCanvas=document.createElement('canvas');mouthCanvas.width=32;mouthCanvas.height=16;
  const mouthTex=new THREE.CanvasTexture(mouthCanvas);
  const mouth=new THREE.Sprite(new THREE.SpriteMaterial({map:mouthTex,transparent:true}));
  mouth.position.set(0,0.87,0.13);mouth.scale.set(0.08,0.04,1);mouth.name='mouth';group.add(mouth);

  if(isAide){
    const badgeCanvas=document.createElement('canvas');badgeCanvas.width=64;badgeCanvas.height=32;
    const bctx=badgeCanvas.getContext('2d');bctx.fillStyle='#4466ff';bctx.beginPath();bctx.roundRect(0,0,64,32,6);bctx.fill();
    bctx.fillStyle='#fff';bctx.font='bold 14px system-ui';bctx.textAlign='center';bctx.fillText('AIDE',32,22);
    const badge=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(badgeCanvas),transparent:true}));
    badge.position.y=1.6;badge.scale.set(0.6,0.3,1);group.add(badge);
  }

  const ring=new THREE.Mesh(new THREE.RingGeometry(0.22,0.32,24),new THREE.MeshBasicMaterial({color:0x00ff88,transparent:true,opacity:0.5,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.y=0.04;ring.name='state-ring';group.add(ring);
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
  const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(0,0,0,0.75)';ctx.beginPath();ctx.roundRect(0,0,256,64,8);ctx.fill();
  ctx.fillStyle='#fff';ctx.font='bold 26px system-ui';ctx.textAlign='center';ctx.fillText(sim.name,128,42);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true}));
  sprite.position.y=isAide?1.75:1.45;sprite.scale.set(1.0,0.25,1);group.add(sprite);

  const bubbleCanvas=document.createElement('canvas');bubbleCanvas.width=128;bubbleCanvas.height=64;
  const bubbleTex=new THREE.CanvasTexture(bubbleCanvas);
  const bubble=new THREE.Sprite(new THREE.SpriteMaterial({map:bubbleTex,transparent:true,opacity:0}));
  bubble.position.y=1.9;bubble.scale.set(0.9,0.45,1);bubble.name='bubble';group.add(bubble);

  const xpCanvas=document.createElement('canvas');xpCanvas.width=80;xpCanvas.height=8;
  const xpTex=new THREE.CanvasTexture(xpCanvas);
  const xpBar=new THREE.Sprite(new THREE.SpriteMaterial({map:xpTex,transparent:true,opacity:0.9}));
  xpBar.position.y=isAide?1.85:1.65;xpBar.scale.set(0.5,0.06,1);xpBar.name='xp-bar';group.add(xpBar);

  // Skill icons
  const skillCanvas=document.createElement('canvas');skillCanvas.width=128;skillCanvas.height=32;
  const skillTex=new THREE.CanvasTexture(skillCanvas);
  const skillBar=new THREE.Sprite(new THREE.SpriteMaterial({map:skillTex,transparent:true,opacity:0}));
  skillBar.position.y=2.0;skillBar.scale.set(0.6,0.15,1);skillBar.name='skill-bar';group.add(skillBar);

  group.userData={
    simId:sim.id,simName:sim.name,isAide,animState:'idle',animTime:0,bobPhase:Math.random()*Math.PI*2,
    targetRotY:0,bubbleCanvas,bubbleTex,xpCanvas,xpTex,xpBar,mouthCanvas,mouthTex,skillCanvas,skillTex,skillBar,
    xp:0,level:1,skills:{focus:0,initiation:0,memory:0,time:0,emotional:0},
    bond:0,fusionReady:0,lastExpression:'neutral',lastState:null
  };
  return group;
}

// ─── ANIMATION ────────────────────────────────────────────────────────
function updateCharacterAnimation(mesh,deltaTime){
  const ud=mesh.userData;ud.animTime+=deltaTime;const time=ud.animTime;
  const legL=mesh.getObjectByName('legL');const legR=mesh.getObjectByName('legR');
  const armL=mesh.getObjectByName('armL');const armR=mesh.getObjectByName('armR');
  const head=mesh.getObjectByName('head');
  const body=mesh.children.find(c=>c.geometry?.type==='CapsuleGeometry'&&c.position.y===0.55);
  if(legL)legL.rotation.x=0;if(legR)legR.rotation.x=0;if(armL)armL.rotation.x=0;if(armR)armR.rotation.x=0;
  if(armL)armL.rotation.z=0;if(armR)armR.rotation.z=0;mesh.position.y=0;
  const speed=ud.animState==='walking'?10:6;const swing=Math.sin(time*speed)*0.3;

  switch(ud.animState){
    case'idle':mesh.position.y=Math.sin(time*2+ud.bobPhase)*0.01;
      if(armL)armL.rotation.z=Math.sin(time*1.5)*0.05;if(armR)armR.rotation.z=-Math.sin(time*1.5)*0.05;
      const blinkCycle=time%4;const eyeL=mesh.getObjectByName('eyeL');const eyeR=mesh.getObjectByName('eyeR');
      if(eyeL&&eyeR){const blink=blinkCycle>3.8?0.005:0.022;eyeL.scale.y=blink/0.022;eyeR.scale.y=blink/0.022;}
      updateExpression(mesh,'neutral');break;
    case'walking':if(legL)legL.rotation.x=swing;if(legR)legR.rotation.x=-swing;
      if(armL)armL.rotation.x=-swing*0.7;if(armR)armR.rotation.x=swing*0.7;
      mesh.position.y=Math.abs(Math.sin(time*speed))*0.02;break;
    case'working':if(body)body.rotation.x=0.15;
      if(armL){armL.rotation.x=-0.8;armL.rotation.z=0.3;}if(armR){armR.rotation.x=-0.8;armR.rotation.z=-0.3;}
      if(head)head.rotation.x=0.2;mesh.position.y=Math.sin(time*8)*0.005;updateExpression(mesh,'focused');break;
    case'struggling':if(body)body.rotation.x=0.2+Math.sin(time*1.5)*0.05;
      if(armL){armL.rotation.x=-1.2;armL.rotation.z=0.6;}if(armR){armR.rotation.x=-1.2;armR.rotation.z=-0.6;}
      if(head)head.rotation.x=Math.sin(time*2)*0.15;mesh.position.y=Math.sin(time*3)*0.015;updateExpression(mesh,'sad');break;
    case'hyperfocus':if(body)body.rotation.x=0.2;
      if(armL){armL.rotation.x=-0.9;armL.rotation.z=Math.sin(time*15)*0.05;}
      if(armR){armR.rotation.x=-0.9;armR.rotation.z=-Math.sin(time*15)*0.05;}
      if(head)head.rotation.x=0.25;mesh.position.y=Math.sin(time*15)*0.003;updateExpression(mesh,'focused');break;
    case'coaching':
      if(ud.isAide){if(armR){armR.rotation.x=-0.8;armR.rotation.z=-0.4+Math.sin(time*3)*0.3;}
        if(armL){armL.rotation.z=Math.sin(time*2)*0.1;}}
      else{if(head)head.rotation.x=Math.sin(time*2.5)*0.15;
        if(armL)armL.rotation.z=Math.sin(time*2)*0.05;if(armR)armR.rotation.z=-Math.sin(time*2)*0.05;}
      mesh.position.y=Math.sin(time*2)*0.01;break;
    case'celebrating':mesh.position.y=Math.abs(Math.sin(time*6))*0.15;
      if(armL){armL.rotation.x=-2.5;armL.rotation.z=0.3;}if(armR){armR.rotation.x=-2.5;armR.rotation.z=-0.3;}
      if(legL)legL.rotation.x=Math.sin(time*6)*0.2;if(legR)legR.rotation.x=-Math.sin(time*6)*0.2;
      updateExpression(mesh,'happy');break;
  }
  mesh.rotation.y+=(ud.targetRotY-mesh.rotation.y)*0.1;
}

function updateExpression(mesh,expression){
  if(typeof mesh==='string')return;
  if(mesh.userData.lastExpression===expression)return;
  mesh.userData.lastExpression=expression;
  const mouth=mesh.getObjectByName('mouth');if(!mouth)return;
  const ctx=mouth.material.map.image.getContext('2d');
  ctx.clearRect(0,0,32,16);
  ctx.strokeStyle='#333';ctx.lineWidth=2;ctx.beginPath();
  switch(expression){
    case'happy':ctx.moveTo(4,6);ctx.quadraticCurveTo(16,14,28,6);break;
    case'sad':ctx.moveTo(4,10);ctx.quadraticCurveTo(16,2,28,10);break;
    case'focused':ctx.moveTo(8,8);ctx.lineTo(24,8);break;
    default:ctx.moveTo(8,8);ctx.quadraticCurveTo(16,10,24,8);break;
  }
  ctx.stroke();mouth.material.map.needsUpdate=true;
}

function showThoughtBubble(mesh,emoji,text=''){
  const ud=mesh.userData;const ctx=ud.bubbleCanvas.getContext('2d');
  ud.bubbleCanvas.width=128;ud.bubbleCanvas.height=64;
  ctx.fillStyle='rgba(255,255,255,0.92)';ctx.beginPath();ctx.roundRect(0,0,128,64,12);ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.1)';ctx.lineWidth=1;ctx.stroke();
  ctx.font='28px system-ui';ctx.textAlign='center';ctx.fillText(emoji,64,38);
  if(text){ctx.fillStyle='#555';ctx.font='10px system-ui';ctx.fillText(text,64,55);}
  ud.bubbleTex.needsUpdate=true;
  const bubble=mesh.getObjectByName('bubble');
  if(bubble){bubble.material.opacity=1;ud.bubbleTimer=3;}
}

function updateXPBar(mesh){
  const ud=mesh.userData;if(ud.isAide)return;
  const ctx=ud.xpCanvas.getContext('2d');ud.xpCanvas.width=80;ud.xpCanvas.height=8;
  ctx.fillStyle='rgba(0,0,0,0.5)';ctx.beginPath();ctx.roundRect(0,0,80,8,3);ctx.fill();
  const fillWidth=(ud.xp%100)/100*76;
  const gradient=ctx.createLinearGradient(2,0,78,0);
  gradient.addColorStop(0,'#4488ff');gradient.addColorStop(1,'#88ddff');
  ctx.fillStyle=gradient;ctx.beginPath();ctx.roundRect(2,2,fillWidth,4,2);ctx.fill();
  ctx.fillStyle='#fff';ctx.font='bold 6px system-ui';ctx.textAlign='center';ctx.fillText(`Lv.${ud.level}`,40,7);
  ud.xpTex.needsUpdate=true;
}

function updateSkillBar(mesh){
  const ud=mesh.userData;if(ud.isAide)return;
  const ctx=ud.skillCanvas.getContext('2d');ud.skillCanvas.width=128;ud.skillCanvas.height=32;
  ctx.clearRect(0,0,128,32);
  const skills=['focus','initiation','memory','time','emotional'];
  const colors=['#6bff95','#ffaa00','#ff6b6b','#88ddff','#e879f9'];
  const barWidth=22,barHeight=4,spacing=3;
  skills.forEach((skill,i)=>{
    const x=i*(barWidth+spacing)+2;const y=2;
    const value=ud.skills[skill]||0;
    ctx.fillStyle='rgba(255,255,255,0.1)';ctx.fillRect(x,y,barWidth,barHeight);
    ctx.fillStyle=colors[i];ctx.fillRect(x,y,barWidth*value,barHeight);
  });
  ud.skillTex.needsUpdate=true;
  const skillBar=mesh.getObjectByName('skill-bar');
  if(skillBar)skillBar.material.opacity=0.9;
}

// ─── BUILD CHARACTERS ─────────────────────────────────────────────────
for(const sim of worldState.avatars){
  const room=WE.ROOMS.find(r=>r.id===sim.room)||WE.ROOMS[0];
  const mesh=createCharacter(sim,false);mesh.position.set(sim.px,0,sim.py);worldGroup.add(mesh);simMeshes.set(sim.id,mesh);
  const aideSim={id:sim.id+'_aide',name:WE.AIDES[sim.id]?.name||'Aide',hue:sim.hue+60};
  const aideMesh=createCharacter(aideSim,true);aideMesh.position.set(sim.px+0.8,0,sim.py+0.8);worldGroup.add(aideMesh);aideMeshes.set(sim.id,aideMesh);
}

for(const npc of WE.NPCS){
  if(npc.invisible)continue;const room=WE.ROOMS.find(r=>r.id===npc.room);if(!room)continue;
  const group=new THREE.Group();const color=new THREE.Color().setHSL((npc.hue||200)/360,0.5,0.5);
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.14,0.38,8,16),new THREE.MeshStandardMaterial({color}));
  body.position.y=0.48;body.castShadow=true;const head=new THREE.Mesh(new THREE.SphereGeometry(0.11,16,16),new THREE.MeshStandardMaterial({color:0xffddbb}));
  head.position.y=0.82;head.castShadow=true;group.add(body,head);group.position.set(room.x+npc.x,0,room.y+npc.y);worldGroup.add(group);
}

const particleCount=100;const particleGeo=new THREE.BufferGeometry();const particlePos=new Float32Array(particleCount*3);
for(let i=0;i<particleCount;i++){particlePos[i*3]=(Math.random()-0.5)*60;particlePos[i*3+1]=Math.random()*8+1;particlePos[i*3+2]=(Math.random()-0.5)*60;}
particleGeo.setAttribute('position',new THREE.BufferAttribute(particlePos,3));
const particles=new THREE.Points(particleGeo,new THREE.PointsMaterial({color:0xffffff,size:0.05,transparent:true,opacity:0.4}));
scene.add(particles);

const raycaster=new THREE.Raycaster();const mouse=new THREE.Vector2();
renderer.domElement.addEventListener('click',e=>{
  mouse.x=(e.clientX/window.innerWidth)*2-1;mouse.y=-(e.clientY/window.innerHeight)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(Array.from(simMeshes.values()),true);
  if(hits.length>0){let obj=hits[0].object;while(obj&&!obj.userData?.simId)obj=obj.parent;if(obj?.userData?.simId){selectedSimId=obj.userData.simId;followTarget=simMeshes.get(selectedSimId);cameraMode='follow';updateSimInfo();}}
});

function updateSimInfo(){
  if(!selectedSimId){document.getElementById('sim-info').style.display='none';return;}
  const av=worldState.avatars.find(a=>a.id===selectedSimId);if(!av)return;
  const mesh=simMeshes.get(selectedSimId);
  document.getElementById('sim-info').style.display='block';
  document.getElementById('sim-name').textContent=av.name;
  document.getElementById('sim-trait').textContent=av.blurb||av.trait||'';
  // Live avatars carry Sims-style needs; scenario avatars carry cognitive
  // metrics. Show whichever the avatar has.
  const needs = av.needs ? {
    energy: av.needs.energy ?? 0, hunger: av.needs.hunger ?? 0,
    hygiene: av.needs.hygiene ?? 0, fun: av.needs.fun ?? 0,
    social: av.needs.social ?? 0,
  } : {focus:av.focus,cognitive_load:av.cogLoad,stress:av.stress,burnout:av.burnout,independence:av.independence,fusion_ready:av.fusionReady};
  const colors={focus:'#6bff95',cognitive_load:'#ffaa00',stress:'#ff6b6b',burnout:'#ff0000',independence:'#6bb5ff',fusion_ready:'#e879f9',energy:'#ffd166',hunger:'#ff9f1c',hygiene:'#2ec4b6',fun:'#e879f9',social:'#6bb5ff'};
  const el=document.getElementById('sim-needs');el.innerHTML='';
  for(const[k,v]of Object.entries(needs)){const pct=Math.round(v*100);el.innerHTML+=`<div class="need-bar"><span class="name">${k.replace('_',' ')}</span><div class="bar"><div class="fill" style="width:${pct}%;background:${colors[k]||'#888'}"></div></div></div>`;}
  if(mesh){
    el.innerHTML+=`<div style="margin-top:8px;font-size:11px;color:#8892b0">Level ${mesh.userData.level} · XP ${Math.floor(mesh.userData.xp)}</div>`;
    el.innerHTML+=`<div style="font-size:11px;color:#8892b0">Bond: ${Math.round(mesh.userData.bond*100)}% · Fusion: ${Math.round(mesh.userData.fusionReady*100)}%</div>`;
    // Skills
    el.innerHTML+=`<div style="margin-top:6px;font-size:10px;color:#8892b0">Skills:</div>`;
    for(const[skill,value]of Object.entries(mesh.userData.skills)){
      const pct=Math.round(value*100);
      el.innerHTML+=`<div class="need-bar"><span class="name" style="width:50px">${skill}</span><div class="bar"><div class="fill" style="width:${pct}%;background:#88ddff"></div></div></div>`;
    }
  }
}

function updateTimeDisplay(){const hours=Math.floor(gameTime/60)%24,mins=Math.floor(gameTime%60);const period=hours<12?'AM':'PM',h12=hours%12===0?12:hours%12;document.getElementById('time-display').textContent=`Day 1 · ${h12}:${String(mins).padStart(2,'0')} ${period}`;}
function updateUI(){document.getElementById('sim-count').textContent=worldState.avatars.length;document.getElementById('pair-count').textContent=worldState.avatars.length;document.getElementById('tick-count').textContent=tickCount;}

function addEvent(text,type='info'){
  eventFeed.unshift({text,type,time:tickCount});if(eventFeed.length>50)eventFeed.pop();
  const feedEl=document.getElementById('events');if(feedEl){
    const colors={info:'#8892b0',success:'#6bff95',warning:'#ffaa00',error:'#ff6b6b',coaching:'#e879f9'};
    feedEl.innerHTML=eventFeed.slice(0,15).map(e=>`<div class="event-item" style="color:${colors[e.type]||'#8892b0'}"><span class="event-time">[${e.time}]</span> ${e.text}</div>`).join('');
  }
}

function updateDayNight(){
  const dayFraction=(gameTime%1440)/1440;const sunAngle=dayFraction*Math.PI*2-Math.PI/2;const sunHeight=Math.sin(sunAngle);
  sunLight.position.set(Math.cos(sunAngle)*35,Math.max(5,sunHeight*35),15);
  if(sunHeight>0.3){sunLight.color.setHex(0xffeedd);sunLight.intensity=1.8;scene.background.setHex(0x87CEEB);}
  else if(sunHeight>0){sunLight.color.setHex(0xff8844);sunLight.intensity=1.2;scene.background.setHex(0x2a2a5e);}
  else{sunLight.color.setHex(0x4444ff);sunLight.intensity=0.3;scene.background.setHex(0x050510);}
  for(const rl of roomLights){rl.light.intensity=sunHeight>0.1?0.3:0.8;}
}

function runDecisionEngine(av,mesh){
  if(av.stress>0.7&&av.state!=='coached')return{action:'seek_coach'};
  if(av.cogLoad>0.8)return{action:'break'};
  if(av.focus<0.3&&!av.scenarioId)return{action:'find_task',difficulty:'easy'};
  return null;
}

function runAideCoaching(av,mesh,aideMesh){
  if(!aideMesh)return;
  const urgency=Math.max(av.stress,av.cogLoad,1-av.focus);
  if(urgency>0.65&&av.state!=='coached'){
    const strategies=WE.STRATEGIES[av.flavor]||WE.STRATEGIES.attention;
    const strategy=strategies[Math.floor(Math.random()*strategies.length)];
    const effectiveness=0.4+Math.random()*0.45;
    av.stress=Math.max(0,av.stress-0.25*effectiveness);
    av.cogLoad=Math.max(0,av.cogLoad-0.20*effectiveness);
    av.focus=Math.min(1,av.focus+0.15*effectiveness);
    av.state='coached';av.interventions+=1;
    mesh.userData.bond=Math.min(1,mesh.userData.bond+0.02);
    // Improve skills
    const skillBoost=0.01*Math.random();
    Object.keys(mesh.userData.skills).forEach(skill=>{mesh.userData.skills[skill]=Math.min(1,(mesh.userData.skills[skill]||0)+skillBoost);});
    showThoughtBubble(mesh,'✦',strategy);showThoughtBubble(aideMesh,'💬',strategy);
    addEvent(`${WE.AIDES[av.id]?.name} applied "${strategy}" for ${av.name}`,'coaching');
    triggerEmotionalFeedback(mesh,'coached');
    updateSkillBar(mesh);
  }
}

// --- Live mode: stream the real Python engine instead of the offline sim ---
// ?live=1 connects to server.py via WE_LIVE (live-client.js). Live avatars
// are reconciled into the scene; offline behavior is unchanged.
let liveHandle=null;
const LIVE = (typeof window!=='undefined' && window.WE_LIVE) ? window.WE_LIVE : null;
const isLiveMode = LIVE ? LIVE.isLiveMode() : false;

function syncLiveAvatars(liveAvatars){
  const seen=new Set();
  for(const av of liveAvatars){
    seen.add(av.id);
    // Keep the sim-core avatar object in sync so the decision engine,
    // HUD, and event feed keep working on live data.
    let core=worldState.avatars.find(a=>a.id===av.id);
    if(!core){ core={...av}; worldState.avatars.push(core); }
    else { Object.assign(core, av); }
    let mesh=simMeshes.get(av.id);
    if(!mesh){
      mesh=createCharacter(av,false);
      mesh.position.set(av.px,0,av.py);
      scene.add(mesh);simMeshes.set(av.id,mesh);
    }
  }
  // Remove avatars that left the live world
  for(const [id,mesh] of [...simMeshes]){
    if(!seen.has(id) && !WE.AVATARS.some(a=>a.id===id)){
      scene.remove(mesh);simMeshes.delete(id);
      const i=worldState.avatars.findIndex(a=>a.id===id);
      if(i>=0)worldState.avatars.splice(i,1);
    }
  }
}

function onLiveState(next){
  syncLiveAvatars(next.avatars||[]);
  // Merge live event feed into the HUD feed (dedupe by id)
  for(const evt of (next.events||[])){
    if(!eventFeed.some(e=>e.id===evt.id)){
      eventFeed.unshift({...evt,t:Date.now()});
    }
  }
  eventFeed=eventFeed.slice(0,80);
  document.getElementById('events').innerHTML=eventFeed.map(e=>{
    const time=new Date(e.t).toLocaleTimeString();
    return `<div class="event-item"><span class="event-time">${time}</span>${e.text||e.kind}</div>`;
  }).join('');
  updateSimInfo();
}

function tick(){
  if(isLiveMode)return; // live state arrives via onLiveState
  if(paused)return;tickCount++;gameTime+=2;if(gameTime>1440)gameTime=0;
  worldState=SIM.tickWorld(worldState,{ts:2,dysOn:true,threshold:0.6});

  for(const av of worldState.avatars){
    const mesh=simMeshes.get(av.id);const aideMesh=aideMeshes.get(av.id);
    if(mesh&&!fusionMeshes.has(av.id)){
      const decision=runDecisionEngine(av,mesh);
      if(decision){
        if(decision.action==='seek_coach'&&aideMesh)runAideCoaching(av,mesh,aideMesh);
        else if(decision.action==='break'){av.stress=Math.max(0,av.stress-0.1);av.cogLoad=Math.max(0,av.cogLoad-0.15);showThoughtBubble(mesh,'☕','break');}
      }
      if(av.state!=='coached'&&Math.random()<0.15)runAideCoaching(av,mesh,aideMesh);

      const dx=av.px-mesh.position.x,dz=av.py-mesh.position.z;const dist=Math.sqrt(dx*dx+dz*dz);
      if(dist>0.05){mesh.position.x+=(dx/dist)*0.1;mesh.position.z+=(dz/dist)*0.1;mesh.userData.targetRotY=Math.atan2(dx,dz);mesh.userData.animState='walking';}
      else{mesh.userData.animState=av.state==='working'?'working':(av.state==='drifting'?'struggling':(av.state==='hyperfocus'?'hyperfocus':(av.state==='coached'?'coaching':(av.state==='overwhelmed'?'struggling':'idle'))));}

      // XP and skills
      if(av.state==='working'||av.state==='hyperfocus'){
        mesh.userData.xp+=0.5;
        if(mesh.userData.xp>=mesh.userData.level*100){
          mesh.userData.level++;mesh.userData.xp=0;
          showThoughtBubble(mesh,'⬆️',`Level ${mesh.userData.level}!`);
          addEvent(`${av.name} leveled up to ${mesh.userData.level}!`,'success');
          mesh.userData.animState='celebrating';triggerEmotionalFeedback(mesh,'hyperfocus');
        }
        updateXPBar(mesh);
      }

      // Fusion check
      const avgSkill=Object.values(mesh.userData.skills).reduce((a,b)=>a+b,0)/5;
      mesh.userData.fusionReady=Math.min(1,(mesh.userData.bond+avgSkill)/2);
      if(mesh.userData.fusionReady>=0.8&&mesh.userData.bond>=0.8){
        triggerFusionCeremony(av,mesh,aideMesh);
      }

      const ring=mesh.getObjectByName('state-ring');
      if(ring){const c={idle:0x00ff88,working:0x00aaff,drifting:0xffaa00,hyperfocus:0xff00ff,overwhelmed:0xff0000,coached:0xffff00};ring.material.color.setHex(c[av.state]||0x00ff88);ring.material.opacity=av.state==='idle'?0.3:0.7;}

      if(av.state!==mesh.userData.lastState){
        const bubbleMap={working:'💻',drifting:'😰',hyperfocus:'🎯',overwhelmed:'❗',coached:'✦',idle:''};
        if(bubbleMap[av.state])showThoughtBubble(mesh,bubbleMap[av.state]);
        triggerEmotionalFeedback(mesh,av.state);mesh.userData.lastState=av.state;
      }

      if(aideMesh&&!fusionMeshes.has(av.id)){
        const adx=(av.px+0.8)-aideMesh.position.x,adz=(av.py+0.8)-aideMesh.position.z;
        const adist=Math.sqrt(adx*adx+adz*adz);
        if(adist>0.1){aideMesh.position.x+=(adx/adist)*0.08;aideMesh.position.z+=(adz/adist)*0.08;aideMesh.userData.targetRotY=Math.atan2(adx,adz);aideMesh.userData.animState='walking';}
        else{aideMesh.userData.animState=av.state==='coached'?'coaching':'idle';}
      }
    }
  }
  updateDayNight();updateTimeDisplay();updateUI();updateSimInfo();
}
setInterval(tick,1000);

// Show the scene as soon as the first frame renders (module scripts run
// after classic scripts; nothing after this line depends on the network).
document.getElementById('loading').style.display='none';

// Live status pill (?live=1 only) + connection bootstrap
if(isLiveMode){
  const pill=document.createElement('div');
  pill.id='live-status';
  pill.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10;background:rgba(10,40,20,.92);border:1px solid rgba(0,255,136,.35);border-radius:999px;padding:6px 14px;font-size:12px;color:#6bff95';
  pill.textContent='live · connecting…';
  document.body.appendChild(pill);
  liveHandle=LIVE.connect({
    onState:onLiveState,
    onStatus:(t)=>{pill.textContent=t;},
  });
}

const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);const delta=clock.getDelta();const time=clock.getElapsedTime();
  for(const[id,mesh]of simMeshes)updateCharacterAnimation(mesh,delta);
  for(const[id,mesh]of aideMeshes)updateCharacterAnimation(mesh,delta);
  for(const[id,mesh]of simMeshes){const ud=mesh.userData;if(ud.bubbleTimer>0){ud.bubbleTimer-=delta;if(ud.bubbleTimer<=0){const b=mesh.getObjectByName('bubble');if(b)b.material.opacity=0;}}}
  updateParticles(delta);
  const pos=particles.geometry.attributes.position.array;
  for(let i=0;i<particleCount;i++){pos[i*3+1]+=Math.sin(time+i)*0.002;if(pos[i*3+1]>10)pos[i*3+1]=1;}
  particles.geometry.attributes.position.needsUpdate=true;
  if(cameraMode==='follow'&&followTarget){const tp=followTarget.position.clone();const off=new THREE.Vector3(0,8,10);camera.position.lerp(tp.clone().add(off),0.05);controls.target.lerp(tp,0.05);}
  else if(cameraMode==='cinematic'){cinematicAngle+=delta*0.2;const r=30;camera.position.x=Math.cos(cinematicAngle)*r+8;camera.position.z=Math.sin(cinematicAngle)*r+8;camera.position.y=20;controls.target.set(8,0,8);}
  controls.update();renderer.render(scene,camera);
}
animate();

window.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();paused=!paused;}if(e.code==='Digit1'){cameraMode='free';followTarget=null;}if(e.code==='Digit2'){cameraMode='follow';if(selectedSimId)followTarget=simMeshes.get(selectedSimId);}if(e.code==='Digit3'){cameraMode='cinematic';}});
window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});
addEvent('World Engine initialized','info');addEvent('StayAlert entered the world','info');
