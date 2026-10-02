using Godot;
using System;

namespace NltWorldEngine;

public static class Daylight
{
    private struct Palette
    {
        public float T;
        public Color Top, Hor, Gnd, Sun, Fog;
        public float I, Amb, Exp, Fd;
    }

    private static readonly Palette[] Palettes =
    {
        new() { T = 0.00f, Top = new(0x101b34), Hor = new(0x2a3550), Gnd = new(0x1c2026), Sun = new(0x6f7fa8), I = 0.30f, Amb = 0.38f, Exp = 0.94f, Fog = new(0x2a3550), Fd = 0.0028f },
        new() { T = 0.20f, Top = new(0x2a4a72), Hor = new(0xd08a58), Gnd = new(0x4a4034), Sun = new(0xffb06a), I = 1.45f, Amb = 0.55f, Exp = 1.02f, Fog = new(0x9d7c66), Fd = 0.0022f },
        new() { T = 0.32f, Top = new(0x2f6ea8), Hor = new(0xc3d4dd), Gnd = new(0x6b5f42), Sun = new(0xfff2d6), I = 2.10f, Amb = 0.60f, Exp = 1.06f, Fog = new(0x9fb6c4), Fd = 0.0016f },
        new() { T = 0.68f, Top = new(0x2f6ea8), Hor = new(0xc3d4dd), Gnd = new(0x6b5f42), Sun = new(0xfff2d6), I = 2.10f, Amb = 0.60f, Exp = 1.06f, Fog = new(0x9fb6c4), Fd = 0.0016f },
        new() { T = 0.80f, Top = new(0x27395e), Hor = new(0xc9693f), Gnd = new(0x4a3c30), Sun = new(0xff9a5c), I = 1.35f, Amb = 0.52f, Exp = 1.01f, Fog = new(0x94675a), Fd = 0.0022f },
        new() { T = 1.00f, Top = new(0x101b34), Hor = new(0x2a3550), Gnd = new(0x1c2026), Sun = new(0x6f7fa8), I = 0.30f, Amb = 0.38f, Exp = 0.94f, Fog = new(0x2a3550), Fd = 0.0028f },
    };

    public readonly struct State
    {
        public readonly Color Top, Hor, Gnd, Sun, Fog;
        public readonly float SunI, Amb, Exp, Fd;
        public readonly Vector3 SunDir;
        public State(Color t, Color h, Color g, Color s, Color f, float i, float a, float e, float fd, Vector3 d)
            => (Top, Hor, Gnd, Sun, Fog, SunI, Amb, Exp, Fd, SunDir) = (t, h, g, s, f, i, a, e, fd, d);
    }

    public static State Sample(double simT)
    {
        float dayT = (float)(((simT / WorldConstants.DayLen) + 0.32) % 1.0 + 1.0) % 1f;
        int i = 0;
        while (i < Palettes.Length - 2 && Palettes[i + 1].T <= dayT) i++;
        Palette p0 = Palettes[i], p1 = Palettes[i + 1];
        float f = Mathx.Smooth(Mathx.Clamp01((dayT - p0.T) / (p1.T - p0.T)));

        Color LerpHex(Color a, Color b) => a.Lerp(b, f);
        float ang = (dayT - 0.25f) * Mathf.Pi * 2f;
        float elev = MathF.Sin(ang);
        Vector3 sunDir = new Vector3(MathF.Cos(ang) * 0.75f, MathF.Max(elev, -0.15f), 0.45f).Normalized();

        return new State(
            LerpHex(p0.Top, p1.Top), LerpHex(p0.Hor, p1.Hor), LerpHex(p0.Gnd, p1.Gnd),
            LerpHex(p0.Sun, p1.Sun), LerpHex(p0.Fog, p1.Fog),
            Mathx.Lerp(p0.I, p1.I, f), Mathx.Lerp(p0.Amb, p1.Amb, f),
            Mathx.Lerp(p0.Exp, p1.Exp, f), Mathx.Lerp(p0.Fd, p1.Fd, f), sunDir);
    }
}
