using Godot;
using System;

namespace NltWorldEngine;

public static class WorldConstants
{
    public const int Seed = 20260401;
    public const double Tick = 1.0 / 60.0;
    public const double DayLen = 260.0;

    public const float World = 460f;
    public const float Water = 0f;
    public const float LakeX = 82f, LakeZ = -58f, LakeR = 34f;
    public const float SettleX = -66f, SettleZ = 46f, SettleR = 38f, SettleY = 7.2f;
}

public static class Mathx
{
    public static float Clamp(float v, float a, float b) => v < a ? a : v > b ? b : v;
    public static float Clamp01(float v) => Clamp(v, 0f, 1f);
    public static float Lerp(float a, float b, float t) => a + (b - a) * t;
    public static float Smooth(float t) => t * t * (3 - 2 * t);
    public static float Smoothstep(float e0, float e1, float x)
    {
        float t = Clamp01((x - e0) / (e1 - e0));
        return t * t * (3 - 2 * t);
    }
}

/// <summary>mulberry32 + the JS world-noise ports (hash2/valueNoise/fbm).</summary>
public sealed class SimulationRng
{
    private uint _a;
    public SimulationRng(uint seed) => _a = seed;

    public float Next()
    {
        _a = (uint)(_a + 0x6D2B79F5u);
        uint t = _a;
        t = (uint)((t ^ (t >> 15)) * (1 | _a));
        t = (uint)((t + ((t ^ (t >> 7)) * (61 | t))) ^ t);
        return (t ^ (t >> 14)) / 4294967296f;
    }

    public float Range(float a, float b) => a + (b - a) * Next();

    public static float Hash2(int x, int y, int seed)
    {
        unchecked
        {
            uint h = (uint)seed;
            h = (h ^ ((uint)x * 374761393u)) * 668265263u;
            h = (h ^ ((uint)y * 2246822519u)) * 3266489917u;
            h ^= h >> 13;
            h = h * 1274126177u;
            return (h ^ (h >> 16)) / 4294967296f;
        }
    }

    public static float ValueNoise(float x, float y, int seed)
    {
        int xi = (int)MathF.Floor(x), yi = (int)MathF.Floor(y);
        float xf = x - xi, yf = y - yi;
        float u = Mathx.Smooth(xf), v = Mathx.Smooth(yf);
        float a = Hash2(xi, yi, seed);
        float b = Hash2(xi + 1, yi, seed);
        float c = Hash2(xi, yi + 1, seed);
        float d = Hash2(xi + 1, yi + 1, seed);
        return Mathx.Lerp(Mathx.Lerp(a, b, u), Mathx.Lerp(c, d, u), v);
    }

    public static float Fbm(float x, float y, int octaves, int seed)
    {
        float sum = 0, amp = 0.5f, freq = 1f, norm = 0;
        for (int i = 0; i < octaves; i++)
        {
            sum += ValueNoise(x * freq, y * freq, seed + i * 7919) * amp;
            norm += amp;
            amp *= 0.5f;
            freq *= 2.03f;
        }
        return sum / norm;
    }
}
