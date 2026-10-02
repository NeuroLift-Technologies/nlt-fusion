#pragma once

#include "CoreMinimal.h"
#include "Core/NLTSimulationState.h"
#include "Core/NLTEventBus.h"
#include "NLTSimulationReplay.generated.h"

USTRUCT(BlueprintType)
struct FNLTReplayAction
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString ActionId;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	int32 Sequence = 0;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	int32 SubmittedTick = 0;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString ActorType;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString ActorId;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString ActionType;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString TargetId;

	/** Canonical JSON object text. Action semantics are owned by the caller. */
	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString PayloadJson = TEXT("{}");

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString ActionHash;
};

USTRUCT(BlueprintType)
struct FNLTReplayEvent
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString EventId;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	int32 Sequence = 0;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	ENLTSimulationEventType EventType = ENLTSimulationEventType::None;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	int32 Tick = 0;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FName AgentId = NAME_None;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString Description;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FName TargetId = NAME_None;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	float Value = 0.0f;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString EventHash;
};

USTRUCT(BlueprintType)
struct FNLTDeterministicReplay
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString ContractVersion = TEXT("nlt.world-engine.replay.v1");

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString ReplayId;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString Description;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	int32 Seed = 0;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FNLTSimulationState InitialState;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FNLTRandomStream InitialRng;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	TArray<FNLTReplayAction> Actions;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	TArray<FNLTReplayEvent> Events;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FNLTSimulationState ExpectedFinalState;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FNLTRandomStream FinalRng;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString InitialStateHash;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Replay")
	FString ExpectedFinalHash;

	/** Builds a record and calculates all verification hashes. */
	static FNLTDeterministicReplay Create(
		const FString& InReplayId,
		const FString& InDescription,
		const FNLTSimulationState& InInitialState,
		const FNLTRandomStream& InInitialRng,
		const TArray<FNLTReplayAction>& InActions,
		const TArray<FNLTReplayEvent>& InEvents,
		const FNLTSimulationState& InFinalState,
		const FNLTRandomStream& InFinalRng);

	/** Verifies structure, ordering, state hashes, action hashes, and event hashes. */
	bool Verify(FString& OutError) const;

	/** Verifies an observed post-run state against the expected final state. */
	bool VerifyAgainstState(const FNLTSimulationState& ActualFinalState, const FNLTRandomStream& ActualFinalRng, FString& OutError) const;

	bool SerializeToJson(FString& OutJson) const;
	static bool DeserializeFromJson(const FString& Json, FNLTDeterministicReplay& OutReplay, FString& OutError);
};
