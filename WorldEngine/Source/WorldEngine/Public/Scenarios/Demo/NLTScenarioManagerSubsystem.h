#pragma once

#include "CoreMinimal.h"
#include "Core/NLTFusionCore.h"
#include "Subsystems/WorldSubsystem.h"
#include "NLTScenarioManagerSubsystem.generated.h"

class UNLTAgentSpawnerSubsystem;
class UNLTSimulationSubsystem;
class UNLTSoundscapeSubsystem;
class UNLTFixtureEmitterSubsystem;
class UScenarioDataAsset;
struct FMassEntityQuery;

/**
 * Parameters for one scenario run. Everything needed to reproduce a run
 * deterministically is captured here (agent count, spawn area, seed).
 */
USTRUCT(BlueprintType)
struct FNLTScenarioParams
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Scenario")
    int32 NumAgents = 10;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Scenario")
    FVector SpawnOrigin = FVector(0.0f, 0.0f, 100.0f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Scenario")
    float SpawnRadius = 2000.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Scenario")
    int32 Seed = 12345;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Scenario")
    bool bAutoStartSimulation = true;
};

DECLARE_LOG_CATEGORY_EXTERN(LogNLTScenarioManager, Log, All);

/**
 * Owns the lifecycle of a demo scenario run:
 *  - deterministic agent spawning (via UNLTAgentSpawnerSubsystem)
 *  - simulation clock advancement (StepTick once per TickScenarioManager call)
 *  - periodic deterministic checkpoints (state hash over identity-sorted agents)
 *  - headless self-test mode for the QA determinism gate:
 *      run N ticks, log checkpoints + final hash, then exit cleanly.
 *  - optional fixture capture for golden-vector migration (Phase 1)
 */
UCLASS()
class UNLTScenarioManagerSubsystem : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Despawns any previous run, spawns agents deterministically, optionally starts the sim clock. */
    UFUNCTION(BlueprintCallable, Category = "NLT|Scenario")
    bool StartScenario(const FNLTScenarioParams& Params);

    /**
     * Scenario-driven start: like StartScenario, but derives the need-growth
     * multiplier from the scenario definition (aversiveness + cognitive demand)
     * and keeps the asset for inspection (GetActiveScenario).
     */
    UFUNCTION(BlueprintCallable, Category = "NLT|Scenario")
    bool StartScenarioWithAsset(const FNLTScenarioParams& Params, UScenarioDataAsset* Scenario);

    UFUNCTION(BlueprintPure, Category = "NLT|Scenario")
    UScenarioDataAsset* GetActiveScenario() const { return ActiveScenario; }

    /** Despawns all scenario agents and stops the run. */
    UFUNCTION(BlueprintCallable, Category = "NLT|Scenario")
    void StopScenario();

    UFUNCTION(BlueprintPure, Category = "NLT|Scenario")
    bool IsScenarioActive() const { return bScenarioActive; }

    UFUNCTION(BlueprintPure, Category = "NLT|Scenario")
    const FNLTScenarioParams& GetActiveParams() const { return ActiveParams; }

    UFUNCTION(BlueprintPure, Category = "NLT|Scenario")
    int32 GetScenarioTick() const { return ScenarioTick; }

    /**
     * Advances the scenario by one tick: steps the simulation clock and runs
     * checkpoint/self-test bookkeeping. Call once per frame from the GameMode.
     */
    void TickScenarioManager(float DeltaTime);

    /** Deterministic hash over all agents: identity-sorted (AgentId, Position) pairs. Same seed + same ticks => same hash. */
    uint32 ComputeAgentStateHash() const;

    /** Returns the environment variation subsystem for the active run. */
    UFUNCTION(BlueprintPure, Category = "NLT|Environment")
    class UNLTEnvironmentVariationSubsystem* GetEnvironmentVariationSubsystem() const;

    // ----- Headless self-test (QA determinism gate) -----
    void BeginHeadlessSelfTest(int32 InMaxTicks);
    bool IsHeadlessSelfTestActive() const { return bHeadlessSelfTest; }

    // ----- Fixture capture (Phase 1: golden-vector migration) -----
    /** Begin fixture capture for golden-vector migration. */
    void BeginFixtureCapture(int32 InSeed, int32 InMaxTicks);
    /** End fixture capture and write to disk. */
    void EndFixtureCapture();
    bool IsFixtureCaptureActive() const;

private:
    bool StartScenarioInternal(const FNLTScenarioParams& Params, UScenarioDataAsset* Scenario, float NeedGrowthMultiplier);
    void LogCheckpoint(const TCHAR* Label) const;
    void FinishHeadlessSelfTest();

    bool bScenarioActive = false;
    FNLTScenarioParams ActiveParams;
    TObjectPtr<UScenarioDataAsset> ActiveScenario = nullptr;
    int32 ScenarioTick = 0;

    bool bHeadlessSelfTest = false;
    int32 HeadlessMaxTicks = 600;
    int32 NextCheckpointTick = 0;

    TObjectPtr<UNLTSoundscapeSubsystem> SoundscapeSubsystem = nullptr;
    TObjectPtr<UNLTFixtureEmitterSubsystem> FixtureEmitter = nullptr;
};