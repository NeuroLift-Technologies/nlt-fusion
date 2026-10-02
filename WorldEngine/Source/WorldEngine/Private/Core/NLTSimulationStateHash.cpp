#include "Core/NLTSimulationStateHash.h"
#include "Containers/StringConv.h"
#include "Hash/Blake3.h"

namespace
{
	void AppendInt(FString& Output, int32 Value)
	{
		Output += FString::Printf(TEXT("%d;"), Value);
	}

	void AppendFloat(FString& Output, float Value)
	{
		if (Value == 0.0f)
		{
			Value = 0.0f;
		}
		Output += FString::Printf(TEXT("%.9g;"), Value);
	}

	void AppendDouble(FString& Output, double Value)
	{
		if (Value == 0.0)
		{
			Value = 0.0;
		}
		Output += FString::Printf(TEXT("%.17g;"), Value);
	}

	void AppendName(FString& Output, FName Value)
	{
		const FString Name = Value.ToString();
		Output += FString::Printf(TEXT("%d:%s;"), Name.Len(), *Name);
	}
}

FString FNLTDeterministicStateHash::BuildCanonicalStateText(
	const FNLTSimulationState& State,
	const FNLTRandomStream* RNG)
{
	FString Canonical = TEXT("NLT.WorldEngine.State.v1\n");
	AppendInt(Canonical, State.SimulationTick);
	AppendDouble(Canonical, State.WorldTime);
	AppendFloat(Canonical, State.TimeOfDay);
	AppendInt(Canonical, static_cast<int32>(State.Mode));
	AppendInt(Canonical, State.RandomSeed);

	TArray<FNLTAgentState> SortedAgents = State.Agents;
	SortedAgents.Sort([](const FNLTAgentState& A, const FNLTAgentState& B)
	{
		return A.AgentId.ToString() < B.AgentId.ToString();
	});

	AppendInt(Canonical, SortedAgents.Num());
	for (const FNLTAgentState& Agent : SortedAgents)
	{
		Canonical += TEXT("agent\n");
		AppendName(Canonical, Agent.AgentId);
		AppendInt(Canonical, static_cast<int32>(Agent.Role));
		AppendName(Canonical, Agent.ProfileId);
		AppendName(Canonical, Agent.DisplayName);
		AppendFloat(Canonical, Agent.Position.X);
		AppendFloat(Canonical, Agent.Position.Y);
		AppendFloat(Canonical, Agent.Position.Z);
		AppendInt(Canonical, static_cast<int32>(Agent.Intent));
		AppendFloat(Canonical, Agent.Focus);
		AppendFloat(Canonical, Agent.CognitiveLoad);
		AppendFloat(Canonical, Agent.Stress);
		AppendFloat(Canonical, Agent.Burnout);
		AppendFloat(Canonical, Agent.Independence);
		AppendFloat(Canonical, Agent.FusionReady);
		AppendFloat(Canonical, Agent.SuccessRate);
		AppendName(Canonical, Agent.EmotionalState);
		AppendInt(Canonical, static_cast<int32>(Agent.PrimaryNeed));
	}

	TArray<FName> SortedEvents = State.ActiveEvents;
	SortedEvents.Sort([](const FName& A, const FName& B)
	{
		return A.ToString() < B.ToString();
	});
	AppendInt(Canonical, SortedEvents.Num());
	for (const FName& Event : SortedEvents)
	{
		AppendName(Canonical, Event);
	}

	if (RNG != nullptr)
	{
		Canonical += TEXT("rng\n");
		AppendInt(Canonical, RNG->InitialSeed);
		AppendInt(Canonical, RNG->Seed);
		AppendInt(Canonical, RNG->Calls);
	}

	return Canonical;
}

FString FNLTDeterministicStateHash::ComputeStateHash(
	const FNLTSimulationState& State,
	const FNLTRandomStream* RNG)
{
	const FString Canonical = BuildCanonicalStateText(State, RNG);
	const FTCHARToUTF8 Utf8(*Canonical);
	return LexToString(FBlake3::HashBuffer(Utf8.Get(), static_cast<uint64>(Utf8.Length())));
}

FString FNLTDeterministicStateHash::ComputeTextHash(const FString& CanonicalText)
{
	const FTCHARToUTF8 Utf8(*CanonicalText);
	return LexToString(FBlake3::HashBuffer(Utf8.Get(), static_cast<uint64>(Utf8.Length())));
}
