#pragma once

#include "CoreMinimal.h"
#include "Core/NLTFusionCore.h"
#include "NLTSimulationState.generated.h"

USTRUCT(BlueprintType)
struct FNLTAgentState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	FName AgentId = NAME_None;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	ENLTAgentRole Role = ENLTAgentRole::None;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	FName ProfileId = NAME_None;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	FName DisplayName = NAME_None;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	FVector Position = FVector::ZeroVector;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	ENLTAgentIntent Intent = ENLTAgentIntent::None;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	float Focus = 0.0f;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	float CognitiveLoad = 0.0f;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	float Stress = 0.0f;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	float Burnout = 0.0f;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	float Independence = 0.0f;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	float FusionReady = 0.0f;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	float SuccessRate = 0.0f;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	FName EmotionalState = NAME_None;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	ENLTAgentNeed PrimaryNeed = ENLTAgentNeed::None;
};

USTRUCT(BlueprintType)
struct FNLTSimulationState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	int32 SimulationTick = 0;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	double WorldTime = 0.0;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	float TimeOfDay = 0.0f;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	ESimulationMode Mode = ESimulationMode::Realtime;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	int32 RandomSeed = 0;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	TArray<FNLTAgentState> Agents;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	TArray<FName> ActiveEvents;
};

USTRUCT(BlueprintType)
struct FNLTRandomStream
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	int32 Seed = 0;

	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	int32 Calls = 0;

	/** Seed used to initialize the stream, retained so Reset can restore it. */
	UPROPERTY(BlueprintReadWrite, Category = "NLT|Simulation")
	int32 InitialSeed = 0;

	FNLTRandomStream() = default;

	explicit FNLTRandomStream(int32 InSeed)
		: Seed(InSeed)
		, Calls(0)
		, InitialSeed(InSeed)
	{
	}

	float GetFraction()
	{
		++Calls;
		Seed = (Seed * 1103515245 + 12345) & 0x7fffffff;
		return static_cast<float>(Seed) / static_cast<float>(0x7fffffff);
	}

	float GetRange(float Min, float Max)
	{
		return Min + (Max - Min) * GetFraction();
	}

	int32 IntRange(int32 Min, int32 Max)
	{
		return Min + (int32)(GetFraction() * (float)(Max - Min + 1));
	}

	void Reset()
	{
		Seed = InitialSeed;
		Calls = 0;
	}
};