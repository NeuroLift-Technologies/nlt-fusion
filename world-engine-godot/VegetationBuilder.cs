using Godot;
using System;
using System.Collections.Generic;

namespace NltWorldEngine;

public static class VegetationBuilder
{
    private sealed record Spot(float X, float Z, float Y, float Scale, float Rot, float Tint);

    private static List<Spot> SeededPlacement(int count, Func<float, float, SimulationRng, bool> test)
    {
        var out_ = new List<Spot>();
        var r = new SimulationRng((uint)(WorldConstants.Seed + 4242));
        int guard = 0;
        while (out_.Count < count && guard++ < count * 60)
        {
            float a = r.Next() * Mathf.Pi * 2f;
            float rad = MathF.Sqrt(r.Next()) * (WorldConstants.World * 0.42f);
            float x = MathF.Cos(a) * rad, z = MathF.Sin(a) * rad;
            if (!test(x, z, r)) continue;
            bool ok = true;
            foreach (var o in out_)
                if ((o.X - x) * (o.X - x) + (o.Z - z) * (o.Z - z) < 16f) { ok = false; break; }
            if (ok) out_.Add(new Spot(x, z, WorldGeometry.HeightAt(x, z), r.Next(), r.Next(), r.Next()));
        }
        return out_;
    }

    private static MultiMeshInstance3D Instanced(Mesh mesh, StandardMaterial3D mat, List<Spot> spots, Func<Spot, Transform3D> makeT)
    {
        var mm = new MultiMesh
        {
            TransformFormat = MultiMesh.TransformFormatEnum.Transform3D,
            Mesh = mesh,
            InstanceCount = spots.Count,
        };
        for (int i = 0; i < spots.Count; i++)
            mm.SetInstanceTransform(i, makeT(spots[i]));
        return new MultiMeshInstance3D { Multimesh = mm, MaterialOverride = mat };
    }

    private static bool ClearOfSettlement(float x, float z, List<SettlementBuilder.Plan> plans, float pad = 0f)
    {
        if (MathF.Sqrt((x - WorldConstants.SettleX) * (x - WorldConstants.SettleX) + (z - WorldConstants.SettleZ) * (z - WorldConstants.SettleZ)) < 15f + pad) return false;
        foreach (var b in plans)
            if (MathF.Sqrt((x - b.X) * (x - b.X) + (z - b.Z) * (z - b.Z)) < b.Rad + 3.5f + pad) return false;
        return true;
    }

    public static Node3D Build(List<SettlementBuilder.Plan> plans)
    {
        var root = new Node3D();

        // trees: one trunk + 3 canopy cones per spot, four MultiMesh layers
        var treeSpots = SeededPlacement(620, (x, z, r) =>
        {
            float h = WorldGeometry.HeightAt(x, z);
            return h > WorldConstants.Water + 1.6f && WorldGeometry.SlopeAt(x, z) < 0.42f && ClearOfSettlement(x, z, plans, 1.5f);
        });

        var trunkMesh = new CylinderMesh { Height = 2.6f, TopRadius = 0.16f, BottomRadius = 0.30f, RadialSegments = 6 };
        var trunkMat = new StandardMaterial3D { AlbedoColor = new Color(0x5a4534), Roughness = 0.92f };
        root.AddChild(Instanced(trunkMesh, trunkMat, treeSpots, t =>
        {
            float sc = 0.72f + t.Scale * 0.85f;
            return new Transform3D(new Basis(Quaternion.FromEuler(new Vector3(0, t.Rot * Mathf.Pi * 2f, 0))).Scaled(new Vector3(sc, sc * (0.85f + t.Tint * 0.4f), sc)),
                new Vector3(t.X, t.Y - 0.2f + 1.3f * sc, t.Z));
        }));

        StandardMaterial3D leaf(Color c) => new() { AlbedoColor = c, Roughness = 0.92f };
        root.AddChild(Instanced(Cone(1.35f, 2.9f, 8), leaf(new(0x3d5c36)), treeSpots, t => T(t, 3.2f, 0.72f, 0.85f)));
        root.AddChild(Instanced(Cone(1.05f, 2.4f, 8), leaf(new(0x4a7038)), treeSpots, t => T(t, 4.5f, 0.72f, 0.85f)));
        root.AddChild(Instanced(Cone(0.68f, 1.8f, 8), leaf(new(0x5c8440)), treeSpots, t => T(t, 5.7f, 0.72f, 0.85f)));

        // rocks
        var rockSpots = SeededPlacement(190, (x, z, r) =>
        {
            float h = WorldGeometry.HeightAt(x, z);
            return h > WorldConstants.Water + 0.6f && WorldGeometry.SlopeAt(x, z) > 0.16f && ClearOfSettlement(x, z, plans, 0.5f);
        });
        var rockMesh = new SphereMesh { Radius = 1f, RadialSegments = 6, Rings = 3 };
        var rockMat = new StandardMaterial3D { AlbedoColor = new Color(0x7d776c), Roughness = 0.98f, ShadingMode = BaseMaterial3D.ShadingModeEnum.PerVertex };
        root.AddChild(Instanced(rockMesh, rockMat, rockSpots, t =>
        {
            float sc = 0.5f + t.Scale * 1.5f;
            return new Transform3D(new Basis(Quaternion.FromEuler(new Vector3(t.Tint * 3f, t.Rot * 6f, t.Tint * 2f))).Scaled(new Vector3(sc, sc * (0.6f + t.Rot * 0.5f), sc * (0.8f + t.Tint * 0.4f))),
                new Vector3(t.X, t.Y - 0.25f, t.Z));
        }));

        // grass
        var grassSpots = SeededPlacement(1200, (x, z, r) =>
        {
            float h = WorldGeometry.HeightAt(x, z);
            float dPlaza = MathF.Sqrt((x - WorldConstants.SettleX) * (x - WorldConstants.SettleX) + (z - WorldConstants.SettleZ) * (z - WorldConstants.SettleZ));
            if (dPlaza < 14f && r.Next() < 0.85f) return false;
            return h > WorldConstants.Water + 0.9f && WorldGeometry.SlopeAt(x, z) < 0.45f;
        });
        var grassCone = Cone(0.075f, 0.62f, 3);
        var grassMat = new StandardMaterial3D { AlbedoColor = new Color(0x7d9c4e), Roughness = 1f };
        root.AddChild(Instanced(grassCone, grassMat, grassSpots, t =>
        {
            float sc = 0.7f + t.Scale * 0.9f;
            return new Transform3D(new Basis(Quaternion.FromEuler(new Vector3(0, t.Rot * Mathf.Pi * 2f, 0))).Scaled(new Vector3(sc, sc * (0.7f + t.Tint * 0.8f), sc)),
                new Vector3(t.X, t.Y - 0.05f, t.Z));
        }));

        return root;
    }

    private static Mesh Cone(float radius, float height, int sides)
        => new CylinderMesh { Height = height, TopRadius = 0f, BottomRadius = radius, RadialSegments = sides };

    private static Transform3D T(Spot t, float yOff, float baseScale, float tintScale)
    {
        float sc = baseScale + t.Scale * 0.85f;
        return new Transform3D(new Basis(Quaternion.FromEuler(new Vector3(0, t.Rot * Mathf.Pi * 2f, 0))).Scaled(new Vector3(sc, sc * (tintScale + t.Tint * 0.4f), sc)),
            new Vector3(t.X, t.Y - 0.2f + yOff, t.Z));
    }
}
