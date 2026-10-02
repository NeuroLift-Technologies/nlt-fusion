// Strip textures/images from a glTF, replacing material texture refs with simple constants.
// Keeps geometry (meshes, nodes, skins, animations) intact.
// Usage: node strip-gltf-textures.js <in.gltf> <out.gltf>
const fs = require('fs');

const [,, inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('Usage: node strip-gltf-textures.js <in.gltf> <out.gltf>');
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(inPath, 'utf-8'));

// Simple hash for deterministic material colors
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Remove KHR extension maps (they often carry texture references)
delete doc.extensions;
for (const k of Object.keys(doc.extensionsUsed ?? {})) {
  if (k.startsWith('KHR_materials') || k.startsWith('EXT_texture')) {
    doc.extensionsUsed = (doc.extensionsUsed ?? []).filter(x => x !== k);
  }
}
delete doc.extensionsRequired;

let removedTextureRefs = 0;

if (Array.isArray(doc.materials)) {
  doc.materials = doc.materials.map((m, idx) => {
    const name = m.name ?? `Material_${idx}`;
    const h = hashStr(name);
    const base = [0.55 + (h % 100) / 255.0, 0.55 + ((h >> 4) % 100) / 255.0, 0.62 + ((h >> 8) % 100) / 255.0, 1.0];
    const simple = {
      name,
      doubleSided: !!m.doubleSided
    };
    if (m.pbrMetallicRoughness) {
      const pbr = { baseColorFactor: base, metallicFactor: 0.05, roughnessFactor: 0.9 };
      if (m.pbrMetallicRoughness.baseColorFactor) pbr.baseColorFactor = m.pbrMetallicRoughness.baseColorFactor;
      simple.pbrMetallicRoughness = pbr;
    }
    for (const texKey of ['baseColorTexture', 'metallicRoughnessTexture', 'normalTexture', 'occlusionTexture', 'emissiveTexture']) {
      if (m.pbrMetallicRoughness?.[texKey]) removedTextureRefs++;
      if (m[texKey]) removedTextureRefs++;
    }
    delete m.pbrMetallicRoughness?.baseColorTexture;
    delete m.pbrMetallicRoughness?.metallicRoughnessTexture;
    delete m.pbrMetallicRoughness?.normalTexture;
    delete m.pbrMetallicRoughness?.occlusionTexture;
    delete m.pbrMetallicRoughness?.emissiveTexture;
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
    delete m.extensions;
    return simple;
  });
}

const removedArrays = [];
if (Array.isArray(doc.textures)) { removedArrays.push(`textures:${doc.textures.length}`); delete doc.textures; }
if (Array.isArray(doc.images)) { removedArrays.push(`images:${doc.images.length}`); delete doc.images; }
if (Array.isArray(doc.samplers)) { delete doc.samplers; }

fs.writeFileSync(outPath, JSON.stringify(doc));
console.log(`OK wrote ${outPath}`);
console.log(`  meshes: ${doc.meshes?.length ?? 0}, materials: ${doc.materials?.length ?? 0}, nodes: ${doc.nodes?.length ?? 0}`);
console.log(`  removed texture refs: ${removedTextureRefs}; removed arrays: ${removedArrays.join(', ')}`);