using Godot;
using System;

namespace NltWorldEngine;

public static class WorldGeometry
{
    // Port of rawHeight/slopeAt/walkable/shorePoint from nlt-world-engine.html
    public static float RawHeight(float x, float z)
    {
        float h = SimulationRng.Fbm(x * 0.0072f, z * 0.0072f, 5, WorldConstants.Seed) * 24f - 6f;

        float ridge = 1f - MathF.Abs(SimulationRng.Fbm(x * 0.0155f + 31.7f, z * 0.0155f - 12.3f, 4, WorldConstants.Seed + 13) * 2f - 1f);
        h += ridge * ridge * 11f * Mathx.Smoothstep(-2f, 9f, h);

        float r = MathF.Sqrt(x * x + z * z) / (WorldConstants.World * 0.43f);
        float island = 1f - Mathx.Smoothstep(0.60f, 1.06f, r);
        h = h * island - 9f * (1f - island);

        float lakeD = MathF.Sqrt((x - WorldConstants.LakeX) * (x - WorldConstants.LakeX) + (z - WorldConstants.LakeZ) * (z - WorldConstants.LakeZ));
        float region = 1f - Mathx.Smoothstep(0f, WorldConstants.LakeR * 3.2f, lakeD);
        h -= region * 10f;
        float lake = 1f - Mathx.Smoothstep(0f, WorldConstants.LakeR, lakeD);
        h = Mathx.Lerp(h, -5f, MathF.Pow(lake, 1.2f));

        float sd = MathF.Sqrt((x - WorldConstants.SettleX) * (x - WorldConstants.SettleX) + (z - WorldConstants.SettleZ) * (z - WorldConstants.SettleZ));
        float flat = 1f - Mathx.Smoothstep(WorldConstants.SettleR * 0.55f, WorldConstants.SettleR, sd);
        h = Mathx.Lerp(h, WorldConstants.SettleY, flat * 0.94f);

        return h;
    }

    public static float HeightAt(float x, float z) => RawHeight(x, z);

    public static float SlopeAt(float x, float z)
    {
        const float e = 2.2f;
        float hx = HeightAt(x + e, z) - HeightAt(x - e, z);
        float hz = HeightAt(x, z + e) - HeightAt(x, z - e);
        return MathF.Sqrt(hx * hx + hz * hz) / (2f * e);
    }

    public static bool Walkable(float x, float z)
        => HeightAt(x, z) > WorldConstants.Water + 0.55f && SlopeAt(x, z) < 0.62f;

    public static Vector2 ShorePoint(float cx, float cz, float angle)
    {
        for (float r = 2f; r < WorldConstants.LakeR + 22f; r += 1.5f)
        {
            float x = cx + MathF.Cos(angle) * r, z = cz + MathF.Sin(angle) * r;
            if (HeightAt(x, z) > WorldConstants.Water + 1.1f) return new Vector2(x, z);
        }
        return new Vector2(cx + 30f, cz);
    }
}
