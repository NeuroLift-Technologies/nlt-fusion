#include "Core/NLTNoiseLibrary.h"

// ─── Mulberry32 PRNG ────────────────────────────────────────────────
// Ported from openworld-engine/src/world/noise.js
// "mulberry32" — fast, deterministic 32-bit PRNG. Same seed = same sequence.

static uint32 Mulberry32Next(uint32& State)
{
	State = (State + 0x6D2B79F5u) & 0xFFFFFFFFu;
	uint32 T = State;
	T = (T ^ (T >> 15)) * (1u | State);
	T = (T ^ (T >> 7)) * (61u | T);
	T = T ^ (T >> 14);
	return T;
}

float UNLTNoiseLibrary::Mulberry32(int32 Seed)
{
	uint32 State = static_cast<uint32>(Seed);
	// Advance one step (matching the JS: each call returns the next value)
	uint32 T = Mulberry32Next(State);
	return static_cast<float>(T) / 4294967296.0f;
}

// ─── 2D Noise ───────────────────────────────────────────────────────
// Ported from openworld-engine/src/world/noise.js makeNoise2D()

static uint8 Perm[512];
static bool bPermInitialized = false;
static int32 CurrentPermSeed = 0;

static void InitPerm(int32 Seed)
{
	if (bPermInitialized && CurrentPermSeed == Seed)
		return;

	// Use mulberry32 to shuffle the permutation table
	uint32 State = static_cast<uint32>(Seed);
	int32 Base[256];
	for (int32 i = 0; i < 256; i++)
		Base[i] = i;

	// Fisher-Yates shuffle
	for (int32 i = 255; i > 0; i--)
	{
		Mulberry32Next(State);
		uint32 R = Mulberry32Next(State);
		int32 J = static_cast<int32>(R % static_cast<uint32>(i + 1));
		int32 Temp = Base[i];
		Base[i] = Base[J];
		Base[J] = Temp;
	}

	for (int32 i = 0; i < 512; i++)
		Perm[i] = static_cast<uint8>(Base[i & 255]);

	bPermInitialized = true;
	CurrentPermSeed = Seed;
}

static float Fade(float T)
{
	return T * T * (3.0f - 2.0f * T);
}

static float Grad(int32 Hash, float X, float Y)
{
	int32 H = Hash & 3;
	switch (H)
	{
	case 0: return X + Y;
	case 1: return -X + Y;
	case 2: return X - Y;
	default: return -X - Y;
	}
}

float UNLTNoiseLibrary::Noise2D(float X, float Y, int32 Seed)
{
	InitPerm(Seed);

	int32 Xi = FMath::FloorToInt(X) & 255;
	int32 Yi = FMath::FloorToInt(Y) & 255;
	float Xf = X - static_cast<float>(FMath::FloorToInt(X));
	float Yf = Y - static_cast<float>(FMath::FloorToInt(Y));

	float U = Fade(Xf);
	float V = Fade(Yf);

	int32 Aa = Perm[Perm[Xi] + Yi];
	int32 Ab = Perm[Perm[Xi] + Yi + 1];
	int32 Ba = Perm[Perm[Xi + 1] + Yi];
	int32 Bb = Perm[Perm[Xi + 1] + Yi + 1];

	float X1 = Grad(Aa, Xf, Yf) + (Grad(Ba, Xf - 1.0f, Yf) - Grad(Aa, Xf, Yf)) * U;
	float X2 = Grad(Ab, Xf, Yf - 1.0f) + (Grad(Bb, Xf - 1.0f, Yf - 1.0f) - Grad(Ab, Xf, Yf - 1.0f)) * U;

	return (X1 + (X2 - X1) * V) * 0.7071f;
}

float UNLTNoiseLibrary::Fbm2D(float X, float Y, int32 Seed, int32 Octaves,
	float Lacunarity, float Gain)
{
	float Amp = 0.5f;
	float Freq = 1.0f;
	float Sum = 0.0f;
	float Norm = 0.0f;

	for (int32 i = 0; i < Octaves; i++)
	{
		Sum += Amp * Noise2D(X * Freq, Y * Freq, Seed + i * 137);
		Norm += Amp;
		Amp *= Gain;
		Freq *= Lacunarity;
	}

	return Norm > 0.0f ? Sum / Norm : 0.0f;
}

float UNLTNoiseLibrary::HeightField(float X, float Y, int32 Seed, int32 Octaves)
{
	// fBm returns [-1, 1] → normalize to [0, 1]
	float Raw = Fbm2D(X, Y, Seed, Octaves);
	return (Raw + 1.0f) * 0.5f;
}

// ─── Terrain heightfield ─────────────────────────────────────────
// Ported from openworld-engine/src/world/terrain.js (createHeightField/baseHeight).
// Continental island falloff + layered hill/mountain noise, deterministic per seed.
// Uses the UE5 noise primitives (NLTNoiseLibrary::Fbm2D), matching the
// openworld-engine design intent (procedural-openworld.md §Terrain).

ETerrainBiome UNLTNoiseLibrary::ClassifyTerrainBiome(float Height, float SeaLevel)
{
	// Elevation bands adapted from terrain.js buildTerrain() biome coloring,
	// scaled for UE WorldUnit = cm. Sea-level thresholds are world-unit based.
	if (Height <= SeaLevel)
	{
		return ETerrainBiome::Ocean;
	}
	else if (Height < SeaLevel + 3.0f)
	{
		return ETerrainBiome::Sand;
	}
	else if (Height < SeaLevel + 12.0f)
	{
		return ETerrainBiome::Grass;
	}
	else if (Height < SeaLevel + 22.0f)
	{
		return ETerrainBiome::Rock;
	}
	else
	{
		return ETerrainBiome::Snow;
	}
}

float UNLTNoiseLibrary::GenerateTerrainHeight(float X, float Z, int32 Seed, float WorldSize, float HeightScale)
{
	// Normalize world coordinates to [0,1] across the world, matching
	// terrain.js sample(): nx = x/size + 0.5, ny = z/size + 0.5.
	const float nx = (WorldSize > 0.0f) ? (X / WorldSize + 0.5f) : 0.5f;
	const float ny = (WorldSize > 0.0f) ? (Z / WorldSize + 0.5f) : 0.5f;

	// Island / continental falloff: 0 (center) → ~1 (edge).
	const float dx = nx - 0.5f;
	const float dy = ny - 0.5f;
	const float dist = FMath::Sqrt(dx * dx + dy * dy) * 2.0f; // 0 center → 1 edge
	const float distClamped = FMath::Clamp(dist, 0.0f, 1.0f);
	const float continent = 1.0f - FMath::Pow(distClamped, 2.2f);

	// Hill noise (fine detail) — fbm5 at feature scale 6 (terrain.js makeFbm(noise, 5)).
	const float hills = Fbm2D(nx * 6.0f, ny * 6.0f, Seed, 5) * 0.5f + 0.5f;

	// Mountain noise (macro shape) — fbm3 from a second seed at feature scale 3
	// (terrain.js makeFbm(makeNoise2D(seed + 99), 3)).
	const float rawMountains = Fbm2D(nx * 3.0f + 7.0f, ny * 3.0f - 3.0f, Seed + 99, 3) * 0.5f + 0.5f;
	const float mountains = FMath::Pow(FMath::Max(0.0f, rawMountains), 2.0f);

	// Combine (terrain.js baseHeight):
	// h = continent * (0.25 + hills*0.55 + mountains*0.9) - 0.18
	const float h = continent * (0.25f + hills * 0.55f + mountains * 0.9f) - 0.18f;
	return h * HeightScale;
}
