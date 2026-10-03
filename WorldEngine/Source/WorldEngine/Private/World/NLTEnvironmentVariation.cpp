// NLTEnvironmentVariation.cpp - seeded micro-variation for Workplace_Level
#include "World/NLTEnvironmentVariation.h"
#include "Modules/ModuleManager.h"

DEFINE_LOG_CATEGORY(LogNLTEnvironmentVariation);

namespace
{
    /**
     * Deterministic hash combining scenario ID and run seed.
     * Produces a stable 32-bit value from (ScenarioId, RunSeed).
     */
    uint32 CombineScenarioRun(FName ScenarioId, int32 RunSeed)
    {
        const uint32 ScenarioHash = GetTypeHash(ScenarioId);
        uint32 Hash = 2166136261u;
        Hash = (Hash ^ ScenarioHash) * 16777619u;
        Hash = (Hash ^ static_cast<uint32>(RunSeed)) * 16777619u;
        return Hash;
    }

    /**
     * Deterministic hash for sub-stream derivation.
     * Each environment domain (clutter, lighting, vfx) gets its own sub-seed
     * derived from the master scenario-run hash.
     */
    uint32 SubSeed(uint32 MasterHash, uint8 Domain)
    {
        uint32 Hash = 2166136261u;
        Hash = (Hash ^ MasterHash) * 16777619u;
        Hash = (Hash ^ Domain) * 16777619u;
        return Hash;
    }
}

bool UNLTEnvironmentVariationSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
    if (!Super::ShouldCreateSubsystem(Outer))
    {
        return false;
    }
    const UWorld* World = Cast<UWorld>(Outer);
    return World && (World->WorldType == EWorldType::Game || World->WorldType == EWorldType::PIE || World->WorldType == EWorldType::Editor);
}

void UNLTEnvironmentVariationSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogNLTEnvironmentVariation, Log, TEXT("Environment variation subsystem initialized"));
}

void UNLTEnvironmentVariationSubsystem::Deinitialize()
{
    Super::Deinitialize();
}

uint32 UNLTEnvironmentVariationSubsystem::HashScenarioRun(FName ScenarioId, int32 RunSeed)
{
    return CombineScenarioRun(ScenarioId, RunSeed);
}

FNLTEnvironmentState UNLTEnvironmentVariationSubsystem::GenerateEnvironmentVariation(FName ScenarioId, int32 RunSeed)
{
    FNLTEnvironmentState Env;

    // Master hash from (ScenarioId, RunSeed)
    const uint32 MasterHash = CombineScenarioRun(ScenarioId, RunSeed);

    // ---- Variation Index (which "mood" of the scenario) ----
    // Same scenario ID always maps to the same base mood pool,
    // but different run seeds select different moods from that pool.
    Env.VariationIndex = static_cast<int32>(MasterHash % static_cast<uint32>(MaxVariations));

    // ---- Clutter ----
    // Clutter density: 0-10 items, derived from sub-seed
    FNLTRandomStream ClutterStream(static_cast<int32>(SubSeed(MasterHash, 0)));
    Env.ClutterDensity = ClutterStream.IntRange(0, 10);
    Env.ClutterSpread = ClutterStream.GetRange(0.1f, 1.0f);

    // Clutter variant indices: which specific clutter items to use
    const int32 NumVariants = 6;
    for (int32 i = 0; i < Env.ClutterDensity; i++)
    {
        Env.ClutterVariantIndices.Add(ClutterStream.IntRange(0, NumVariants - 1));
    }

    // ---- Lighting ----
    FNLTRandomStream LightingStream(static_cast<int32>(SubSeed(MasterHash, 1)));
    Env.LightingIntensity = LightingStream.GetRange(0.6f, 1.4f);
    Env.ColorTemperature = LightingStream.GetRange(4000.0f, 7500.0f);

    // Lighting color: subtle warm/cool tint
    const float R = LightingStream.GetRange(0.85f, 1.0f);
    const float G = LightingStream.GetRange(0.85f, 1.0f);
    const float B = LightingStream.GetRange(0.85f, 1.0f);
    Env.LightingColor = FLinearColor(R, G, B, 1.0f);

    // ---- VFX ----
    // VFX seed: separate deterministic seed for particle systems
    Env.VfxSeed = static_cast<int32>(SubSeed(MasterHash, 2));
    FNLTRandomStream VfxStream(Env.VfxSeed);
    Env.VfxIntensity = VfxStream.GetRange(0.5f, 1.5f);

    // ---- Ambient ----
    FNLTRandomStream AmbientStream(static_cast<int32>(SubSeed(MasterHash, 3)));
    Env.AmbientNoiseLevel = AmbientStream.GetRange(0.0f, 0.3f);

    UE_LOG(LogNLTEnvironmentVariation, Log,
        TEXT("Generated env variation for scenario=%s runSeed=%d mood=%d clutter=%d vfxSeed=%d"),
        *ScenarioId.ToString(), RunSeed, Env.VariationIndex, Env.ClutterDensity, Env.VfxSeed);

    return Env;
}

void UNLTEnvironmentVariationSubsystem::ApplyEnvironmentVariation(FName ScenarioId, int32 RunSeed)
{
    ActiveEnvironment = GenerateEnvironmentVariation(ScenarioId, RunSeed);
    UE_LOG(LogNLTEnvironmentVariation, Log,
        TEXT("Applied env variation: scenario=%s runSeed=%d"),
        *ScenarioId.ToString(), RunSeed);
}
