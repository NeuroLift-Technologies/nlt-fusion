#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "NLTFixtureEmitterSubsystem.generated.h"

DECLARE_LOG_CATEGORY_EXTERN(LogNLTFixtureEmitter, Log, All);

/**
 * Captures golden fixtures during a headless self-test run.
 * Writes per-tick canonical state text (v2), RNG state, ordered event stream,
 * and replay JSON to Saved/Fixtures/seed{N}/.
 *
 * This subsystem does NOT alter simulation behavior — it only observes.
 */
UCLASS()
class UNLTFixtureEmitterSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Begin fixture capture for a given seed and max tick count. */
	void BeginCapture(int32 InSeed, int32 InMaxTicks);

	/** End fixture capture and write all accumulated data to disk. */
	void EndCapture();

	/** Returns true if fixture capture is currently active. */
	bool IsCapturing() const { return bCapturing; }

	/** Returns the output directory for the current capture. */
	const FString& GetOutputDirectory() const { return OutputDirectory; }

	/** Capture one tick of simulation state. Called by ScenarioManagerSubsystem. */
	void CaptureTick();

private:
	void WriteFixturesToDisk();

	bool bCapturing = false;
	int32 CaptureSeed = 0;
	int32 CaptureMaxTicks = 0;
	int32 CurrentCaptureTick = 0;
	FString OutputDirectory;

	// Accumulated per-tick data
	TArray<FString> PerTickCanonicalState;  // v2 canonical text per tick
	TArray<FString> PerTickRngState;       // "seed;calls;currentSeed" per tick
	TArray<FString> PerTickEventStream;    // Ordered event stream per tick
	TArray<FString> PerTickStateHash;      // BLAKE3 hash of canonical state per tick

	// Final state for replay
	FString FinalCanonicalState;
	FString FinalRngState;
	FString FinalStateHash;
	int32 FinalTick = 0;
};