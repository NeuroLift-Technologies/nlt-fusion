#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "NLTNoiseLibrary.generated.h"

/**
 * Procedural noise library for deterministic world generation.
 *
 * Ports the proven algorithms from the LT OpenWorld Engine (Three.js):
 * - mulberry32 PRNG (fast, deterministic 32-bit)
 * - 2D Perlin-style value noise with seeded permutation table
 * - Fractal Brownian Motion (fBm) — multiple octaves
 *
 * Same seed always produces the same output — critical for reproducible
 * simulation across sessions and the deterministic tick requirement
 * (see WORLD-ENGINE-OTOI.md §17 Definition of Done: Reproducibility).
 *
 * Used by:
 * - NLTAtmosphereSubsystem (cloud coverage, star field density)
 * - NLTWorldGeneratorSubsystem (terrain heightfield, district layout)
 * - Vegetation scatter (PCG EnvironmentScatter)
 */

/**
 * Terrain biome classification (ported from openworld-engine/src/world/terrain.js).
 * Maps generated terrain elevation to a surface band for material assignment.
 */
UENUM(BlueprintType)
enum class ETerrainBiome : uint8
{
    Ocean UMETA(DisplayName = "Ocean"),
    Sand UMETA(DisplayName = "Sand"),
    Grass UMETA(DisplayName = "Grass"),
    Rock UMETA(DisplayName = "Rock"),
    Snow UMETA(DisplayName = "Snow"),
};

UCLASS()
class WORLDENGINE_API UNLTNoiseLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/**
	 * Mulberry32 PRNG — fast, deterministic 32-bit random number generator.
	 * Same seed always produces the same sequence.
	 * @param Seed 32-bit unsigned integer seed
	 * @return Random float in [0, 1)
	 */
	UFUNCTION(BlueprintCallable, Category = "NLT|Noise")
	static float Mulberry32(int32 Seed);

	/**
	 * Create a seeded 2D noise function. Returns values in approximately [-1, 1].
	 * Uses a permutation table seeded by the given value for deterministic output.
	 * @param X World X coordinate
	 * @param Y World Y coordinate
	 * @param Seed Integer seed for the permutation table
	 * @return Noise value in [-1, 1]
	 */
	UFUNCTION(BlueprintCallable, Category = "NLT|Noise")
	static float Noise2D(float X, float Y, int32 Seed);

	/**
	 * Fractal Brownian Motion — sums multiple octaves of noise at increasing
	 * frequency and decreasing amplitude. Returns normalized values in [0, 1].
	 * @param X World X coordinate
	 * @param Y World Y coordinate
	 * @param Seed Base seed (octave offset = Seed + i * 137)
	 * @param Octaves Number of noise layers to sum (default 5)
	 * @param Lacunarity Frequency multiplier per octave (default 2.0)
	 * @param Gain Amplitude multiplier per octave (default 0.5)
	 * @return fBm value in [0, 1]
	 */
	UFUNCTION(BlueprintCallable, Category = "NLT|Noise")
	static float Fbm2D(float X, float Y, int32 Seed, int32 Octaves = 5,
		float Lacunarity = 2.0f, float Gain = 0.5f);

	/**
	 * Convenience: Generate a biome-appropriate value from fBm noise.
	 * Returns a normalized height in [0, 1] suitable for terrain elevation
	 * or district property assignment.
	 */
	UFUNCTION(BlueprintCallable, Category = "NLT|Noise")
	static float HeightField(float X, float Y, int32 Seed, int32 Octaves = 5);

	/**
	 * Procedural terrain height — ports the Three.js createHeightField/baseHeight
	 * logic (continental island falloff + layered hill/mountain noise) using the
	 * UE5 noise primitives (Fbm2D). Returns height in world units. Same seed
	 * always yields the same terrain (OTOI §17 reproducibility).
	 *
	 * @param X World X coordinate
	 * @param Z World Z coordinate
	 * @param Seed World seed for deterministic generation
	 * @param WorldSize Total world extent in cm (UE WorldUnit = 1cm)
	 * @param HeightScale Maximum terrain elevation in cm
	 * @return Terrain height in world units (cm)
	 */
	UFUNCTION(BlueprintCallable, Category = "NLT|Noise|Terrain")
	static float GenerateTerrainHeight(float X, float Z, int32 Seed, float WorldSize, float HeightScale);

	/**
	 * Classify a terrain height into a biome band.
	 * Elevation bands adapted from openworld-engine/src/world/terrain.js
	 * buildTerrain() biome coloring (sand/grass/rock/snow), scaled for
	 * UE WorldUnit = cm.
	 *
	 * @param Height Terrain height at the point (world units / cm)
	 * @param SeaLevel Sea-level height (world units / cm)
	 * @return Biome classification for the elevation
	 */
	UFUNCTION(BlueprintCallable, Category = "NLT|Noise|Terrain")
	static ETerrainBiome ClassifyTerrainBiome(float Height, float SeaLevel);
};
