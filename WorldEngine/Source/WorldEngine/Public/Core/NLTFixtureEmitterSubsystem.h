#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Core/NLTSimulationState.h"
#include "NLTFixtureEmitterSubsystem.generated.h"

DECLARE_LOG_CATEGORY_EXTERN(LogNLTFixtureEmitter, Log, All);

/**
 * Outcome of the fixture non-degeneracy check (migration plan item 1.7).
 *
 * Editor-context capture produces static state because Mass processors do not run
 * without a game loop, so a capture can be N byte-identical ticks that encode no
 * behaviour. Tier 2 would then pass against nothing and go green on the gate that
 * retires UE. This struct reports each independent signal separately so a failure
 * says which property collapsed rather than just "mismatch".
 */
struct FNLTFixtureNonDegeneracyResult
{
	/** At least 3 ticks were captured, so first/middle/last are distinct samples. */
	bool bHasEnoughTicks = false;

	/** Canonical state text differs across first/middle/last tick. */
	bool bCanonicalVaries = false;

	/** At least one tick recorded a non-empty event stream. */
	bool bEventStreamNonEmpty = false;

	/** At least one agent's position changed between the first and last sampled tick. */
	bool bAgentsMove = false;

	/** Number of ticks inspected. */
	int32 TickCount = 0;

	/** How many ticks carried at least one event. */
	int32 TicksWithEvents = 0;

	/** Human-readable explanation of the first failed check; empty when bPassed. */
	FString FailureReason;

	bool Passed() const
	{
		return bHasEnoughTicks && bCanonicalVaries && bEventStreamNonEmpty && bAgentsMove;
	}
};

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

	/** Begin fixture capture for a given seed and max tick count.
	 *  InLabel optionally qualifies the output directory (e.g. the scenario id)
	 *  so multiple scenarios can be captured in one run without overwriting. */
	void BeginCapture(int32 InSeed, int32 InMaxTicks, const FString& InLabel = FString());

	/** End fixture capture and write all accumulated data to disk. */
	void EndCapture();

	/** Returns true if fixture capture is currently active. */
	bool IsCapturing() const { return bCapturing; }

	/** Returns the output directory for the current capture. */
	const FString& GetOutputDirectory() const { return OutputDirectory; }

	/** Capture one tick of simulation state. Called by ScenarioManagerSubsystem. */
	void CaptureTick();

	/**
	 * Runs the item 1.7 non-degeneracy check over the capture accumulated so far.
	 * Safe to call before EndCapture() — it reads the in-memory per-tick arrays.
	 */
	FNLTFixtureNonDegeneracyResult ValidateCaptureNonDegeneracy() const;

	/** Per-tick v2 canonical state text captured so far. */
	const TArray<FString>& GetPerTickCanonicalState() const { return PerTickCanonicalState; }

	/** Per-tick ordered event stream captured so far. */
	const TArray<FString>& GetPerTickEventStream() const { return PerTickEventStream; }

	/** Per-tick agent position trace captured so far (one entry per tick). */
	const TArray<FString>& GetPerTickAgentPositions() const { return PerTickAgentPositions; }

	/**
	 * Pure validator for item 1.7. Takes the three per-tick series and reports
	 * whether the capture encodes real behaviour. Split out from the subsystem so
	 * the assertion itself is unit-testable headlessly against synthetic vectors —
	 * only the PIE capture that feeds it needs a game loop.
	 */
	static FNLTFixtureNonDegeneracyResult ValidateNonDegeneracy(
		const TArray<FString>& InCanonicalState,
		const TArray<FString>& InEventStream,
		const TArray<FString>& InAgentPositions);

	/**
	 * Builds the per-tick position trace: one "{x};{y};{z};" group per agent in the
	 * same order the canonical text emits them, using the same %.17g double
	 * formatting. Comparing two traces therefore answers "did anything move"
	 * without re-parsing canonical text.
	 */
	static FString BuildAgentPositionTrace(const TArray<FNLTAgentState>& Agents);

private:
	void WriteFixturesToDisk();

	bool bCapturing = false;
	int32 CaptureSeed = 0;
	int32 CaptureMaxTicks = 0;
	FString CaptureLabel;
	int32 CurrentCaptureTick = 0;
	FString OutputDirectory;

	// Accumulated per-tick data
	TArray<FString> PerTickCanonicalState;  // v2 canonical text per tick
	TArray<FString> PerTickRngState;       // "seed;calls;currentSeed" per tick
	TArray<FString> PerTickEventStream;    // Ordered event stream per tick
	TArray<FString> PerTickStateHash;      // BLAKE3 hash of canonical state per tick

	// Per-tick "{x};{y};{z};" position trace per agent. Not written to disk — it
	// exists so the item 1.7 non-degeneracy check can prove agents actually moved
	// without re-parsing canonical text.
	TArray<FString> PerTickAgentPositions;

	// Final state for replay
	FString FinalCanonicalState;
	FString FinalRngState;
	FString FinalStateHash;
	int32 FinalTick = 0;
};