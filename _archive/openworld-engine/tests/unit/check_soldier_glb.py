#!/usr/bin/env python3
"""Parse Soldier.glb to find mesh vertex bounds and orientation."""
import json, struct, sys

# Read from local file
with open('soldier_test.glb', 'rb') as f:
    data = f.read()
print(f"Read {len(data)} bytes from soldier_test.glb", flush=True)

# Parse GLB header
magic = data[0:4]
version = struct.unpack('<I', data[4:8])[0]
length = struct.unpack('<I', data[8:12])[0]
print(f"GLB: magic={magic}, version={version}, length={length}", flush=True)

# Parse chunks
offset = 12
json_text = None
bin_data = None
while offset < len(data):
    chunk_len = struct.unpack('<I', data[offset:offset+4])[0]
    chunk_type = data[offset+4:offset+8].decode('ascii')
    chunk_data = data[offset+8:offset+8+chunk_len]
    if chunk_type == 'JSON':
        json_text = chunk_data.decode('utf-8')
        print(f"JSON chunk: {chunk_len} bytes", flush=True)
    elif chunk_type == 'BIN\0':
        bin_data = chunk_data
        print(f"BIN chunk: {chunk_len} bytes", flush=True)
    offset += 8 + chunk_len

glb = json.loads(json_text)

# Print asset info
print(f"\n=== Asset ===", flush=True)
print(f"asset: {glb.get('asset', {})}", flush=True)

# Find all position accessors
accessors = glb.get('accessors', [])
print(f"\nTotal accessors: {len(accessors)}", flush=True)

# Find mesh positions
for mesh in glb.get('meshes', []):
    for prim in mesh.get('primitives', []):
        pos_idx = prim.get('attributes', {}).get('POSITION')
        if pos_idx is not None:
            acc = accessors[pos_idx]
            min_vals = acc.get('min', [])
            max_vals = acc.get('max', [])
            print(f"\nMesh: {mesh['name']}, Primitive: {prim.get('mode', 'triangles')}", flush=True)
            print(f"  Position accessor: {pos_idx}", flush=True)
            print(f"  Min: {min_vals}", flush=True)
            print(f"  Max: {max_vals}", flush=True)
            if min_vals and max_vals:
                print(f"  X range: {max_vals[0] - min_vals[0]:.4f}", flush=True)
                print(f"  Y range: {max_vals[1] - min_vals[1]:.4f}", flush=True)
                print(f"  Z range: {max_vals[2] - min_vals[2]:.4f}", flush=True)

# Print ALL nodes
print(f"\n=== All Nodes ===", flush=True)
for i, node in enumerate(glb.get('nodes', [])):
    name = node.get('name', f'node_{i}')
    children = node.get('children', 'omitted')
    rotation = node.get('rotation', None)
    print(f"Node {i}: {name}", flush=True)
    print(f"  scale: {node.get('scale', 'omitted')}", flush=True)
    print(f"  translation: {node.get('translation', 'omitted')}", flush=True)
    print(f"  rotation: {rotation}", flush=True)
    print(f"  children: {children}", flush=True)
    print(f"  mesh: {node.get('mesh', 'none')}", flush=True)
    print(f"  skin: {node.get('skin', 'none')}", flush=True)

# Check skins
for i, skin in enumerate(glb.get('skins', [])):
    print(f"\nSkin {i}: joints={skin.get('joints')}, skeleton={skin.get('skeleton')}", flush=True)

# Check scenes
for scene in glb.get('scenes', []):
    print(f"\nScene nodes: {scene.get('nodes', [])}", flush=True)
