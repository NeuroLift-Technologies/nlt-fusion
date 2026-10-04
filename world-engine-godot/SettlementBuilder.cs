using Godot;
using System;
using System.Collections.Generic;

namespace NltWorldEngine;

public static class SettlementBuilder
{
    public sealed record Plan(float X, float Z, float Rad, float R, float Rot, float Kind);

    public static List<Plan> BuildPlans(SimulationRng rng)
    {
        var placed = new List<Plan>();
        int count = 19, guard = 0;
        while (placed.Count < count && guard++ < 900)
        {
            float a = rng.Next() * Mathf.Pi * 2f;
            float r = 7f + MathF.Sqrt(rng.Next()) * (WorldConstants.SettleR - 11f);
            float x = WorldConstants.SettleX + MathF.Cos(a) * r;
            float z = WorldConstants.SettleZ + MathF.Sin(a) * r;
            float ds = MathF.Sqrt((x - WorldConstants.SettleX) * (x - WorldConstants.SettleX) + (z - WorldConstants.SettleZ) * (z - WorldConstants.SettleZ));
            if (ds > WorldConstants.SettleR - 6f) continue;
            if (!WorldGeometry.Walkable(x, z)) continue;
            float rad = rng.Range(4.2f, 6.4f);
            bool clash = false;
            foreach (var p in placed)
                if (MathF.Sqrt((p.X - x) * (p.X - x) + (p.Z - z) * (p.Z - z)) < p.Rad + rad + 3.4f) { clash = true; break; }
            if (clash) continue;
            placed.Add(new Plan(x, z, rad, rng.Next(), rng.Next() * Mathf.Pi, rng.Next()));
        }
        return placed;
    }

    public static Node3D Build(List<Plan> plans)
    {
        var root = new Node3D();
        var wallMat = new StandardMaterial3D { Roughness = 0.85f };
        var roofMat = new StandardMaterial3D { Roughness = 0.78f };
        var glassMat = new StandardMaterial3D { AlbedoColor = new Color(0xffe0b0FF), EmissionEnabled = true, Emission = new Color(0xffc478FF), EmissionEnergyMultiplier = 0.85f, Roughness = 0.3f };
        var pathMat = new StandardMaterial3D { AlbedoColor = new Color(0x8a8377FF), Roughness = 0.98f };
        var doorMat = new StandardMaterial3D { AlbedoColor = new Color(0x54402fFF), Roughness = 0.8f };

        Color[] wallCols = { new(0xd9cdb8FF), new(0xc9bfa9FF), new(0xe0d4c0FF), new(0xbfae96FF), new(0xcfc4aeFF), new(0xc4b49cFF) };
        Color[] roofCols = { new(0x7a4a3cFF), new(0x6b5340FF), new(0x8a5a44FF), new(0x5f4a3eFF), new(0x74503fFF) };

        int i = 0;
        foreach (var plan in plans)
        {
            float y = WorldGeometry.HeightAt(plan.X, plan.Z);
            var g = new Node3D();
            float w = plan.Rad * 1.5f, d = plan.Rad * 1.25f;
            float wallH = 4.2f + plan.R * 3.4f, roofH = 2.4f + plan.R * 1.4f;

            var wm = (StandardMaterial3D)wallMat.Duplicate(); wm.AlbedoColor = wallCols[i % wallCols.Length];
            var wall = new MeshInstance3D
            {
                Mesh = new BoxMesh { Size = new Vector3(w, wallH, d) },
                MaterialOverride = wm,
                Position = new Vector3(0, wallH / 2f, 0),
            };
            g.AddChild(wall);

            var rm = (StandardMaterial3D)roofMat.Duplicate(); rm.AlbedoColor = roofCols[i % roofCols.Length];
            var roof = new MeshInstance3D
            {
                Mesh = new CylinderMesh { Height = roofH, TopRadius = 0f, BottomRadius = MathF.Max(w, d) * 0.78f, RadialSegments = 4 },
                MaterialOverride = rm,
                Position = new Vector3(0, wallH + roofH / 2f - 0.15f, 0),
                Rotation = new Vector3(0, Mathf.Pi / 4f, 0),
            };
            g.AddChild(roof);

            g.AddChild(new MeshInstance3D
            {
                Mesh = new BoxMesh { Size = new Vector3(0.7f, 1.9f, 0.7f) },
                MaterialOverride = wm,
                Position = new Vector3(w * 0.22f, wallH + roofH * 0.55f, -d * 0.2f),
            });

            g.AddChild(new MeshInstance3D
            {
                Mesh = new BoxMesh { Size = new Vector3(1.15f, 2.1f, 0.14f) },
                MaterialOverride = doorMat,
                Position = new Vector3(0, 1.05f, d / 2f + 0.02f),
            });

            for (int s = 0; s < 2; s++)
            for (int f = 0; f < 2; f++)
                g.AddChild(new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.95f, 0.8f, 0.1f) },
                    MaterialOverride = glassMat,
                    Position = new Vector3((s == 0 ? -1 : 1) * w * 0.29f, 1.9f + f * 1.5f, d / 2f + 0.02f),
                });

            g.Position = new Vector3(plan.X, y, plan.Z);
            g.Rotation = new Vector3(0, plan.Rot, 0);
            root.AddChild(g);
            i++;
        }

        // plaza — raised 0.5 so it sits visibly on terrain instead of clipping
        root.AddChild(new MeshInstance3D
        {
            Mesh = new CylinderMesh { Height = 0.22f, TopRadius = 13f, BottomRadius = 13f, RadialSegments = 40 },
            MaterialOverride = pathMat,
            Position = new Vector3(WorldConstants.SettleX, WorldConstants.SettleY + 0.5f, WorldConstants.SettleZ),
        });

        for (int r = 0; r < 5; r++)
        {
            float a = r / 5f * Mathf.Pi * 2f + 0.4f;
            float len = WorldConstants.SettleR * 0.9f;
            var road = new MeshInstance3D
            {
                Mesh = new BoxMesh { Size = new Vector3(2.5f, 0.2f, len) },
                MaterialOverride = pathMat,
                Position = new Vector3(WorldConstants.SettleX, WorldConstants.SettleY + 0.5f, WorldConstants.SettleZ),
                Rotation = new Vector3(0, a, 0),
            };
            road.Position += road.Basis * new Vector3(0, 0, len / 2f);
            root.AddChild(road);
        }

        // well at plaza edge
        float wy = WorldConstants.SettleY;
        var wellPos = new Vector3(WorldConstants.SettleX + 8f, wy, WorldConstants.SettleZ + 3f);
        root.AddChild(new MeshInstance3D { Mesh = new CylinderMesh { Height = 1.1f, TopRadius = 1.3f, BottomRadius = 1.45f, RadialSegments = 12 }, MaterialOverride = new StandardMaterial3D { AlbedoColor = new Color(0x8a8078FF), Roughness = 0.95f }, Position = wellPos + new Vector3(0, 0.55f, 0) });
        root.AddChild(new MeshInstance3D { Mesh = new CylinderMesh { Height = 0.1f, TopRadius = 1.05f, BottomRadius = 1.05f, RadialSegments = 12 }, MaterialOverride = new StandardMaterial3D { AlbedoColor = new Color(0x2f6f74FF), Roughness = 0.3f }, Position = wellPos + new Vector3(0, 1.05f, 0) });
        root.AddChild(new MeshInstance3D { Mesh = new CylinderMesh { Height = 2.0f, TopRadius = 0f, BottomRadius = 1.7f, RadialSegments = 4 }, MaterialOverride = roofMat, Position = wellPos + new Vector3(0, 2.4f, 0), Rotation = new Vector3(0, Mathf.Pi / 4f, 0) });

        // benches around plaza
        for (int b = 0; b < 6; b++)
        {
            float a = b / 6f * Mathf.Pi * 2f + 0.2f;
            float rr = 10.5f;
            var bp = new Vector3(WorldConstants.SettleX + MathF.Cos(a) * rr, wy, WorldConstants.SettleZ + MathF.Sin(a) * rr);
            var bench = new MeshInstance3D { Mesh = new BoxMesh { Size = new Vector3(2.2f, 0.16f, 0.6f) }, MaterialOverride = doorMat, Position = bp + new Vector3(0, 0.55f, 0), Rotation = new Vector3(0, a + Mathf.Pi / 2f, 0) };
            root.AddChild(bench);
        }

        // desks with emissive monitors
        for (int d = 0; d < 4; d++)
        {
            float a = d / 4f * Mathf.Pi * 2f + 0.9f;
            float rr = 15f;
            float dx = WorldConstants.SettleX + MathF.Cos(a) * rr, dz = WorldConstants.SettleZ + MathF.Sin(a) * rr;
            float dy = WorldGeometry.HeightAt(dx, dz);
            var desk = new Node3D { Position = new Vector3(dx, dy, dz), Rotation = new Vector3(0, a, 0) };
            desk.AddChild(new MeshInstance3D { Mesh = new BoxMesh { Size = new Vector3(2.0f, 0.12f, 0.9f) }, MaterialOverride = doorMat, Position = new Vector3(0, 0.95f, 0) });
            desk.AddChild(new MeshInstance3D { Mesh = new BoxMesh { Size = new Vector3(0.8f, 0.5f, 0.08f) }, MaterialOverride = glassMat, Position = new Vector3(0, 1.35f, -0.25f) });
            root.AddChild(desk);
        }

        return root;
    }
}
