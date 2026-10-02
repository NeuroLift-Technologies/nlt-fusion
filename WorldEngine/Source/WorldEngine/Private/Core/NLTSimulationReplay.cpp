#include "Core/NLTSimulationReplay.h"
#include "Core/NLTSimulationStateHash.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace
{

	FString ReplayError(const FString& Message)
	{
		return FString::Printf(TEXT("Replay validation failed: %s"), *Message);
	}

	bool ReadInt(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, int32& OutValue)
	{
		double Number = 0.0;
		if (!Object.IsValid() || !Object->TryGetNumberField(Field, Number))
		{
			return false;
		}
		OutValue = static_cast<int32>(Number);
		return true;
	}

	bool ReadFloat(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, float& OutValue)
	{
		double Number = 0.0;
		if (!Object.IsValid() || !Object->TryGetNumberField(Field, Number))
		{
			return false;
		}
		OutValue = static_cast<float>(Number);
		return true;
	}

	bool ReadDouble(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, double& OutValue)
	{
		return Object.IsValid() && Object->TryGetNumberField(Field, OutValue);
	}

	bool ReadString(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, FString& OutValue)
	{
		return Object.IsValid() && Object->TryGetStringField(Field, OutValue);
	}

	bool ReadObject(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, TSharedPtr<FJsonObject>& OutObject)
	{
		const TSharedPtr<FJsonObject>* Value = nullptr;
		if (!Object.IsValid() || !Object->TryGetObjectField(Field, Value) || Value == nullptr || !Value->IsValid())
		{
			return false;
		}
		OutObject = *Value;
		return true;
	}

	bool ReadArray(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, const TArray<TSharedPtr<FJsonValue>>*& OutArray)
	{
		return Object.IsValid() && Object->TryGetArrayField(Field, OutArray) && OutArray != nullptr;
	}

	bool IsValidPayloadJson(const FString& PayloadJson)
	{
		TSharedPtr<FJsonObject> Payload;
		TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(PayloadJson);
		return PayloadJson.TrimStartAndEnd().StartsWith(TEXT("{")) &&
			FJsonSerializer::Deserialize(Reader, Payload) && Payload.IsValid();
	}

	TSharedPtr<FJsonObject> StateToJson(const FNLTSimulationState& State)
	{
		TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
		Result->SetNumberField(TEXT("simulation_tick"), State.SimulationTick);
		Result->SetNumberField(TEXT("world_time"), State.WorldTime);
		Result->SetNumberField(TEXT("time_of_day"), State.TimeOfDay);
		Result->SetNumberField(TEXT("mode"), static_cast<int32>(State.Mode));
		Result->SetNumberField(TEXT("random_seed"), State.RandomSeed);

		TArray<TSharedPtr<FJsonValue>> Agents;
		for (const FNLTAgentState& Agent : State.Agents)
		{
			TSharedPtr<FJsonObject> AgentObject = MakeShared<FJsonObject>();
			AgentObject->SetStringField(TEXT("agent_id"), Agent.AgentId.ToString());
			AgentObject->SetNumberField(TEXT("role"), static_cast<int32>(Agent.Role));
			AgentObject->SetStringField(TEXT("profile_id"), Agent.ProfileId.ToString());
			AgentObject->SetStringField(TEXT("display_name"), Agent.DisplayName.ToString());
			TSharedPtr<FJsonObject> Position = MakeShared<FJsonObject>();
			Position->SetNumberField(TEXT("x"), Agent.Position.X);
			Position->SetNumberField(TEXT("y"), Agent.Position.Y);
			Position->SetNumberField(TEXT("z"), Agent.Position.Z);
			AgentObject->SetObjectField(TEXT("position"), Position);
			AgentObject->SetNumberField(TEXT("intent"), static_cast<int32>(Agent.Intent));
			AgentObject->SetNumberField(TEXT("focus"), Agent.Focus);
			AgentObject->SetNumberField(TEXT("cognitive_load"), Agent.CognitiveLoad);
			AgentObject->SetNumberField(TEXT("stress"), Agent.Stress);
			AgentObject->SetNumberField(TEXT("burnout"), Agent.Burnout);
			AgentObject->SetNumberField(TEXT("independence"), Agent.Independence);
			AgentObject->SetNumberField(TEXT("fusion_ready"), Agent.FusionReady);
			AgentObject->SetNumberField(TEXT("success_rate"), Agent.SuccessRate);
			AgentObject->SetStringField(TEXT("emotional_state"), Agent.EmotionalState.ToString());
			AgentObject->SetNumberField(TEXT("primary_need"), static_cast<int32>(Agent.PrimaryNeed));
			Agents.Add(MakeShared<FJsonValueObject>(AgentObject));
		}
		Result->SetArrayField(TEXT("agents"), Agents);

		TArray<TSharedPtr<FJsonValue>> ActiveEvents;
		for (const FName Event : State.ActiveEvents)
		{
			ActiveEvents.Add(MakeShared<FJsonValueString>(Event.ToString()));
		}
		Result->SetArrayField(TEXT("active_events"), ActiveEvents);
		return Result;
	}

	bool StateFromJson(const TSharedPtr<FJsonObject>& Object, FNLTSimulationState& OutState, FString& OutError)
	{
		int32 Mode = 0;
		if (!ReadInt(Object, TEXT("simulation_tick"), OutState.SimulationTick) ||
			!ReadDouble(Object, TEXT("world_time"), OutState.WorldTime) ||
			!ReadFloat(Object, TEXT("time_of_day"), OutState.TimeOfDay) ||
			!ReadInt(Object, TEXT("mode"), Mode) ||
			!ReadInt(Object, TEXT("random_seed"), OutState.RandomSeed))
		{
			OutError = ReplayError(TEXT("snapshot is missing a required scalar field"));
			return false;
		}
		OutState.Mode = static_cast<ESimulationMode>(Mode);

		const TArray<TSharedPtr<FJsonValue>>* AgentValues = nullptr;
		if (!ReadArray(Object, TEXT("agents"), AgentValues))
		{
			OutError = ReplayError(TEXT("snapshot.agents must be an array"));
			return false;
		}
		OutState.Agents.Reset();
		for (const TSharedPtr<FJsonValue>& Value : *AgentValues)
		{
			const TSharedPtr<FJsonObject>* AgentObject = nullptr;
			if (!Value.IsValid() || !Value->TryGetObject(AgentObject) || AgentObject == nullptr)
			{
				OutError = ReplayError(TEXT("snapshot.agents contains a non-object"));
				return false;
			}
			FNLTAgentState Agent;
			FString AgentId;
			FString ProfileId;
			FString DisplayName;
			FString EmotionalState;
			TSharedPtr<FJsonObject> Position;
			int32 Role = 0;
			int32 Intent = 0;
			int32 PrimaryNeed = 0;
			if (!ReadString(*AgentObject, TEXT("agent_id"), AgentId) || !ReadInt(*AgentObject, TEXT("role"), Role) ||
				!ReadString(*AgentObject, TEXT("profile_id"), ProfileId) || !ReadString(*AgentObject, TEXT("display_name"), DisplayName) ||
				!ReadObject(*AgentObject, TEXT("position"), Position) || !ReadInt(*AgentObject, TEXT("intent"), Intent) ||
				!ReadInt(*AgentObject, TEXT("primary_need"), PrimaryNeed) ||
				!ReadString(*AgentObject, TEXT("emotional_state"), EmotionalState))
			{
				OutError = ReplayError(TEXT("snapshot agent is missing a required field"));
				return false;
			}
			float X = 0.0f;
			float Y = 0.0f;
			float Z = 0.0f;
			if (!ReadFloat(Position, TEXT("x"), X) || !ReadFloat(Position, TEXT("y"), Y) || !ReadFloat(Position, TEXT("z"), Z) ||
				!ReadFloat(*AgentObject, TEXT("focus"), Agent.Focus) || !ReadFloat(*AgentObject, TEXT("cognitive_load"), Agent.CognitiveLoad) ||
				!ReadFloat(*AgentObject, TEXT("stress"), Agent.Stress) || !ReadFloat(*AgentObject, TEXT("burnout"), Agent.Burnout) ||
				!ReadFloat(*AgentObject, TEXT("independence"), Agent.Independence) || !ReadFloat(*AgentObject, TEXT("fusion_ready"), Agent.FusionReady) ||
				!ReadFloat(*AgentObject, TEXT("success_rate"), Agent.SuccessRate))
			{
				OutError = ReplayError(TEXT("snapshot agent contains an invalid numeric field"));
				return false;
			}
			Agent.AgentId = FName(*AgentId);
			Agent.Role = static_cast<ENLTAgentRole>(Role);
			Agent.ProfileId = FName(*ProfileId);
			Agent.DisplayName = FName(*DisplayName);
			Agent.Position = FVector(X, Y, Z);
			Agent.Intent = static_cast<ENLTAgentIntent>(Intent);
			Agent.EmotionalState = FName(*EmotionalState);
			Agent.PrimaryNeed = static_cast<ENLTAgentNeed>(PrimaryNeed);
			OutState.Agents.Add(Agent);
		}

		const TArray<TSharedPtr<FJsonValue>>* EventValues = nullptr;
		if (!ReadArray(Object, TEXT("active_events"), EventValues))
		{
			OutError = ReplayError(TEXT("snapshot.active_events must be an array"));
			return false;
		}
		OutState.ActiveEvents.Reset();
		for (const TSharedPtr<FJsonValue>& Value : *EventValues)
		{
			FString Event;
			if (!Value.IsValid() || !Value->TryGetString(Event))
			{
				OutError = ReplayError(TEXT("snapshot.active_events contains a non-string"));
				return false;
			}
			OutState.ActiveEvents.Add(FName(*Event));
		}
		return true;
	}


	TSharedPtr<FJsonObject> RngToJson(const FNLTRandomStream& Rng)
	{
		TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
		Result->SetNumberField(TEXT("initial_seed"), Rng.InitialSeed);
		Result->SetNumberField(TEXT("seed"), Rng.Seed);
		Result->SetNumberField(TEXT("calls"), Rng.Calls);
		return Result;
	}

	bool RngFromJson(const TSharedPtr<FJsonObject>& Object, FNLTRandomStream& OutRng, FString& OutError)
	{
		if (!Object.IsValid() || !ReadInt(Object, TEXT("initial_seed"), OutRng.InitialSeed) ||
			!ReadInt(Object, TEXT("seed"), OutRng.Seed) || !ReadInt(Object, TEXT("calls"), OutRng.Calls))
		{
			OutError = ReplayError(TEXT("RNG state is missing a required field"));
			return false;
		}
		return true;
	}

	FString ActionCanonicalText(const FNLTReplayAction& Action)
	{
		return FString::Printf(TEXT("NLT.Replay.Action.v1\n%s\n%d\n%d\n%s\n%s\n%s\n%s\n%s"),
			*Action.ActionId, Action.Sequence, Action.SubmittedTick, *Action.ActorType,
			*Action.ActorId, *Action.ActionType, *Action.TargetId, *Action.PayloadJson);
	}

	FString EventCanonicalText(const FNLTReplayEvent& Event)
	{
		return FString::Printf(TEXT("NLT.Replay.Event.v1\n%s\n%d\n%d\n%d\n%s\n%s\n%s\n%.9g"),
			*Event.EventId, Event.Sequence, static_cast<int32>(Event.EventType), Event.Tick,
			*Event.AgentId.ToString(), *Event.Description, *Event.TargetId.ToString(), Event.Value);
	}


	TSharedPtr<FJsonObject> ActionToJson(const FNLTReplayAction& Action)
	{
		TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
		Result->SetStringField(TEXT("action_id"), Action.ActionId);
		Result->SetNumberField(TEXT("sequence"), Action.Sequence);
		Result->SetNumberField(TEXT("submitted_tick"), Action.SubmittedTick);
		Result->SetStringField(TEXT("actor_type"), Action.ActorType);
		Result->SetStringField(TEXT("actor_id"), Action.ActorId);
		Result->SetStringField(TEXT("action_type"), Action.ActionType);
		Result->SetStringField(TEXT("target_id"), Action.TargetId);
		Result->SetStringField(TEXT("payload_json"), Action.PayloadJson);
		Result->SetStringField(TEXT("action_hash"), Action.ActionHash);
		return Result;
	}

	bool ActionFromJson(const TSharedPtr<FJsonObject>& Object, FNLTReplayAction& OutAction, FString& OutError)
	{
		if (!ReadString(Object, TEXT("action_id"), OutAction.ActionId) ||
			!ReadInt(Object, TEXT("sequence"), OutAction.Sequence) ||
			!ReadInt(Object, TEXT("submitted_tick"), OutAction.SubmittedTick) ||
			!ReadString(Object, TEXT("actor_type"), OutAction.ActorType) ||
			!ReadString(Object, TEXT("actor_id"), OutAction.ActorId) ||
			!ReadString(Object, TEXT("action_type"), OutAction.ActionType) ||
			!ReadString(Object, TEXT("target_id"), OutAction.TargetId) ||
			!ReadString(Object, TEXT("payload_json"), OutAction.PayloadJson) ||
			!ReadString(Object, TEXT("action_hash"), OutAction.ActionHash))
		{
			OutError = ReplayError(TEXT("action is missing a required field"));
			return false;
		}
		return true;
	}

	TSharedPtr<FJsonObject> EventToJson(const FNLTReplayEvent& Event)
	{
		TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
		Result->SetStringField(TEXT("event_id"), Event.EventId);
		Result->SetNumberField(TEXT("sequence"), Event.Sequence);
		Result->SetNumberField(TEXT("event_type"), static_cast<int32>(Event.EventType));
		Result->SetNumberField(TEXT("tick"), Event.Tick);
		Result->SetStringField(TEXT("agent_id"), Event.AgentId.ToString());
		Result->SetStringField(TEXT("description"), Event.Description);
		Result->SetStringField(TEXT("target_id"), Event.TargetId.ToString());
		Result->SetNumberField(TEXT("value"), Event.Value);
		Result->SetStringField(TEXT("event_hash"), Event.EventHash);
		return Result;
	}


	bool EventFromJson(const TSharedPtr<FJsonObject>& Object, FNLTReplayEvent& OutEvent, FString& OutError)
	{
		int32 EventType = 0;
		FString AgentId;
		FString TargetId;
		if (!ReadString(Object, TEXT("event_id"), OutEvent.EventId) ||
			!ReadInt(Object, TEXT("sequence"), OutEvent.Sequence) ||
			!ReadInt(Object, TEXT("event_type"), EventType) ||
			!ReadInt(Object, TEXT("tick"), OutEvent.Tick) ||
			!ReadString(Object, TEXT("agent_id"), AgentId) ||
			!ReadString(Object, TEXT("description"), OutEvent.Description) ||
			!ReadString(Object, TEXT("target_id"), TargetId) ||
			!ReadFloat(Object, TEXT("value"), OutEvent.Value) ||
			!ReadString(Object, TEXT("event_hash"), OutEvent.EventHash))
		{
			OutError = ReplayError(TEXT("event is missing a required field"));
			return false;
		}
		OutEvent.EventType = static_cast<ENLTSimulationEventType>(EventType);
		OutEvent.AgentId = FName(*AgentId);
		OutEvent.TargetId = FName(*TargetId);
		return true;
	}

	TSharedPtr<FJsonObject> ReplayToJson(const FNLTDeterministicReplay& Replay)
	{
		TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
		Result->SetStringField(TEXT("contract_version"), Replay.ContractVersion);
		Result->SetStringField(TEXT("replay_id"), Replay.ReplayId);
		Result->SetStringField(TEXT("description"), Replay.Description);
		Result->SetNumberField(TEXT("seed"), Replay.Seed);
		Result->SetObjectField(TEXT("initial_snapshot"), StateToJson(Replay.InitialState));
		Result->SetObjectField(TEXT("initial_rng"), RngToJson(Replay.InitialRng));
		TArray<TSharedPtr<FJsonValue>> Actions;
		for (const FNLTReplayAction& Action : Replay.Actions)
		{
			Actions.Add(MakeShared<FJsonValueObject>(ActionToJson(Action)));
		}
		Result->SetArrayField(TEXT("actions"), Actions);
		TArray<TSharedPtr<FJsonValue>> Events;
		for (const FNLTReplayEvent& Event : Replay.Events)
		{
			Events.Add(MakeShared<FJsonValueObject>(EventToJson(Event)));
		}
		Result->SetArrayField(TEXT("events"), Events);
		Result->SetObjectField(TEXT("expected_final_snapshot"), StateToJson(Replay.ExpectedFinalState));
		Result->SetObjectField(TEXT("final_rng"), RngToJson(Replay.FinalRng));
		Result->SetStringField(TEXT("initial_state_hash"), Replay.InitialStateHash);
		Result->SetStringField(TEXT("expected_final_hash"), Replay.ExpectedFinalHash);
		return Result;
	}


}



	FNLTDeterministicReplay FNLTDeterministicReplay::Create(
		const FString& InReplayId,
		const FString& InDescription,
		const FNLTSimulationState& InInitialState,
		const FNLTRandomStream& InInitialRng,
		const TArray<FNLTReplayAction>& InActions,
		const TArray<FNLTReplayEvent>& InEvents,
		const FNLTSimulationState& InFinalState,
		const FNLTRandomStream& InFinalRng)
	{
		FNLTDeterministicReplay Replay;
		Replay.ReplayId = InReplayId;
		Replay.Description = InDescription;
		Replay.Seed = InInitialState.RandomSeed;
		Replay.InitialState = InInitialState;
		Replay.InitialRng = InInitialRng;
		Replay.Actions = InActions;
		Replay.Events = InEvents;
		Replay.ExpectedFinalState = InFinalState;
		Replay.FinalRng = InFinalRng;
		Replay.InitialStateHash = FNLTDeterministicStateHash::ComputeStateHash(Replay.InitialState, &Replay.InitialRng);
		Replay.ExpectedFinalHash = FNLTDeterministicStateHash::ComputeStateHash(Replay.ExpectedFinalState, &Replay.FinalRng);
		for (FNLTReplayAction& Action : Replay.Actions)
		{
			Action.ActionHash = FNLTDeterministicStateHash::ComputeTextHash(ActionCanonicalText(Action));
		}
		for (FNLTReplayEvent& Event : Replay.Events)
		{
			Event.EventHash = FNLTDeterministicStateHash::ComputeTextHash(EventCanonicalText(Event));
		}
		return Replay;
	}

	bool FNLTDeterministicReplay::Verify(FString& OutError) const
	{
		OutError.Reset();
		if (ContractVersion != TEXT("nlt.world-engine.replay.v1"))
		{
			OutError = ReplayError(FString::Printf(TEXT("unsupported contract version '%s'"), *ContractVersion));
			return false;
		}
		if (ReplayId.IsEmpty() || Description.IsEmpty())
		{
			OutError = ReplayError(TEXT("replay_id and description are required"));
			return false;
		}
		if (InitialState.RandomSeed != Seed || ExpectedFinalState.RandomSeed != Seed ||
			InitialRng.InitialSeed != Seed || FinalRng.InitialSeed != Seed)
		{
			OutError = ReplayError(TEXT("seed fields do not agree"));
			return false;
		}
		if (InitialStateHash != FNLTDeterministicStateHash::ComputeStateHash(InitialState, &InitialRng))
		{
			OutError = ReplayError(TEXT("initial state hash does not match initial snapshot"));
			return false;
		}
		if (ExpectedFinalHash != FNLTDeterministicStateHash::ComputeStateHash(ExpectedFinalState, &FinalRng))
		{
			OutError = ReplayError(TEXT("expected final hash does not match expected final snapshot"));
			return false;
		}

		int32 ExpectedSequence = 1;
		for (const FNLTReplayAction& Action : Actions)
		{
			if (Action.Sequence != ExpectedSequence++ || Action.ActionId.IsEmpty() || Action.ActionType.IsEmpty() ||
				!IsValidPayloadJson(Action.PayloadJson) ||
				Action.ActionHash != FNLTDeterministicStateHash::ComputeTextHash(ActionCanonicalText(Action)))
			{
				OutError = ReplayError(FString::Printf(TEXT("action sequence or hash validation failed at sequence %d"), ExpectedSequence - 1));
				return false;
			}
		}
		ExpectedSequence = 1;
		for (const FNLTReplayEvent& Event : Events)
		{
			if (Event.Sequence != ExpectedSequence++ || Event.EventId.IsEmpty() ||
				Event.EventHash != FNLTDeterministicStateHash::ComputeTextHash(EventCanonicalText(Event)))
			{
				OutError = ReplayError(FString::Printf(TEXT("event sequence or hash validation failed at sequence %d"), ExpectedSequence - 1));
				return false;
			}

		}
		return true;
	}


	bool FNLTDeterministicReplay::SerializeToJson(FString& OutJson) const
	{
		FString Error;
		if (!Verify(Error))
		{
			return false;
		}
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutJson);
		return FJsonSerializer::Serialize(ReplayToJson(*this).ToSharedRef(), Writer);
	}

	bool FNLTDeterministicReplay::DeserializeFromJson(const FString& Json, FNLTDeterministicReplay& OutReplay, FString& OutError)
	{
		OutError.Reset();
		TSharedPtr<FJsonObject> Root;
		TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
		if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
		{
			OutError = ReplayError(TEXT("JSON could not be parsed"));
			return false;
		}
		FNLTDeterministicReplay Replay;
		if (!ReadString(Root, TEXT("contract_version"), Replay.ContractVersion) ||
			!ReadString(Root, TEXT("replay_id"), Replay.ReplayId) ||
			!ReadString(Root, TEXT("description"), Replay.Description) ||

			!ReadInt(Root, TEXT("seed"), Replay.Seed) ||
			!ReadString(Root, TEXT("initial_state_hash"), Replay.InitialStateHash) ||
			!ReadString(Root, TEXT("expected_final_hash"), Replay.ExpectedFinalHash))
		{
			OutError = ReplayError(TEXT("root JSON is missing a required field"));
			return false;
		}

		TSharedPtr<FJsonObject> InitialState;
		TSharedPtr<FJsonObject> FinalState;
		TSharedPtr<FJsonObject> InitialRng;
		TSharedPtr<FJsonObject> FinalRng;
		if (!ReadObject(Root, TEXT("initial_snapshot"), InitialState) ||
			!ReadObject(Root, TEXT("expected_final_snapshot"), FinalState) ||
			!ReadObject(Root, TEXT("initial_rng"), InitialRng) ||
			!ReadObject(Root, TEXT("final_rng"), FinalRng) ||
			!StateFromJson(InitialState, Replay.InitialState, OutError) ||
			!StateFromJson(FinalState, Replay.ExpectedFinalState, OutError) ||
			!RngFromJson(InitialRng, Replay.InitialRng, OutError) ||
			!RngFromJson(FinalRng, Replay.FinalRng, OutError))
		{
			if (OutError.IsEmpty())
			{
				OutError = ReplayError(TEXT("snapshot or RNG JSON is invalid"));
			}
			return false;
		}

		const TArray<TSharedPtr<FJsonValue>>* Actions = nullptr;
		const TArray<TSharedPtr<FJsonValue>>* Events = nullptr;
		if (!ReadArray(Root, TEXT("actions"), Actions) || !ReadArray(Root, TEXT("events"), Events))
		{
			OutError = ReplayError(TEXT("actions and events must be arrays"));
			return false;
		}
		for (const TSharedPtr<FJsonValue>& Value : *Actions)
		{
			const TSharedPtr<FJsonObject>* ActionObject = nullptr;
			if (!Value.IsValid() || !Value->TryGetObject(ActionObject) || ActionObject == nullptr)
			{
				OutError = ReplayError(TEXT("actions contains a non-object"));
				return false;
			}
			FNLTReplayAction Action;
			if (!ActionFromJson(*ActionObject, Action, OutError))
			{
				return false;
			}
			Replay.Actions.Add(Action);
		}
		for (const TSharedPtr<FJsonValue>& Value : *Events)
		{
			const TSharedPtr<FJsonObject>* EventObject = nullptr;
			if (!Value.IsValid() || !Value->TryGetObject(EventObject) || EventObject == nullptr)
			{
				OutError = ReplayError(TEXT("events contains a non-object"));
				return false;
			}
			FNLTReplayEvent Event;
			if (!EventFromJson(*EventObject, Event, OutError))
			{
				return false;
			}
			Replay.Events.Add(Event);
		}

		OutReplay = MoveTemp(Replay);
		return OutReplay.Verify(OutError);
	}



	bool FNLTDeterministicReplay::VerifyAgainstState(
		const FNLTSimulationState& ActualFinalState,
		const FNLTRandomStream& ActualFinalRng,
		FString& OutError) const
	{
		if (!Verify(OutError))
		{
			return false;
		}
		if (ActualFinalState.RandomSeed != Seed || ActualFinalRng.InitialSeed != Seed)
		{
			OutError = ReplayError(TEXT("observed final state uses a different seed"));
			return false;
		}
		const FString ActualHash = FNLTDeterministicStateHash::ComputeStateHash(ActualFinalState, &ActualFinalRng);
		if (ActualHash != ExpectedFinalHash)
		{
			OutError = FString::Printf(
				TEXT("observed final state hash '%s' does not match expected '%s'"),
				*ActualHash,
				*ExpectedFinalHash);
			return false;
		}
		return true;
	}
