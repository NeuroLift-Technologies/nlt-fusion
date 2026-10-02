#include "Core/NLTSimulationReplay.h"
#include "Core/NLTSimulationStateHash.h"
#include "Visual/NLTVisualLODPolicy.h"
#include "Simulation/NLTDeterministicSeedSubsystem.h"
#include "Misc/AutomationTest.h"
#include "UObject/StrongObjectPtr.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTDeterministicRandomStreamTest,
	"NLT.Simulation.Determinism.RandomStreamReset",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTDeterministicRandomStreamTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	FNLTRandomStream Stream(1337);
	const float First = Stream.GetFraction();
	const float Second = Stream.GetFraction();
	Stream.Reset();
	const float AfterReset = Stream.GetFraction();

	TestEqual(TEXT("Reset restores the first random value"), AfterReset, First);
	TestEqual(TEXT("Reset restores the call counter before the next draw"), Stream.Calls, 1);
	TestNotEqual(TEXT("A reset stream still advances"), First, Second);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTDeterministicSeedSerializationTest,
	"NLT.Simulation.Determinism.SeedSerialization",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTDeterministicSeedSerializationTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	TStrongObjectPtr<UNLTDeterministicSeedSubsystem> Source(NewObject<UNLTDeterministicSeedSubsystem>());
	TStrongObjectPtr<UNLTDeterministicSeedSubsystem> Restored(NewObject<UNLTDeterministicSeedSubsystem>());
	Source->SetMasterSeed(4242);
	Source->GetDeterministicFloat(ENLTSeedCategory::Weather);
	Source->GetDeterministicFloat(ENLTSeedCategory::Weather);

	TArray<uint8> Serialized;
	Source->SerializeSeedState(Serialized);
	const FString SourceNext = FString::Printf(TEXT("%.9f"), Source->GetDeterministicFloat(ENLTSeedCategory::Weather));

	TestTrue(TEXT("Serialized seed state restores"), Restored->DeserializeSeedState(Serialized));
	const FString RestoredNext = FString::Printf(TEXT("%.9f"), Restored->GetDeterministicFloat(ENLTSeedCategory::Weather));
	TestEqual(TEXT("Serialized stream continues at the same value"), RestoredNext, SourceNext);
	TestEqual(TEXT("Master seed restores"), Restored->GetMasterSeed(), Source->GetMasterSeed());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTDeterministicStateHashTest,
	"NLT.Simulation.Determinism.StateHash",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTDeterministicStateHashTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	FNLTSimulationState State;
	State.SimulationTick = 12;
	State.WorldTime = 3.25;
	State.TimeOfDay = 14.5f;
	State.Mode = ESimulationMode::DeterministicTest;
	State.RandomSeed = 1337;
	State.ActiveEvents = { FName(TEXT("event.b")), FName(TEXT("event.a")) };

	FNLTAgentState First;
	First.AgentId = FName(TEXT("Agent_B"));
	First.DisplayName = FName(TEXT("Bee"));
	First.Position = FVector(10.0, 20.0, 30.0);
	First.Focus = 0.75f;
	FNLTAgentState Second;
	Second.AgentId = FName(TEXT("Agent_A"));
	Second.DisplayName = FName(TEXT("Ay"));
	Second.Position = FVector(-10.0, -20.0, -30.0);
	State.Agents = { First, Second };

	const FString Hash = FNLTDeterministicStateHash::ComputeStateHash(State);
	TestEqual(TEXT("Hash is a full BLAKE3 digest"), Hash.Len(), 64);

	FNLTSimulationState Reordered = State;
	Reordered.Agents = { Second, First };
	Reordered.ActiveEvents = { FName(TEXT("event.a")), FName(TEXT("event.b")) };
	TestEqual(
		TEXT("Canonical hash ignores entity and event storage order"),
		FNLTDeterministicStateHash::ComputeStateHash(Reordered),
		Hash);

	Reordered.SimulationTick++;
	TestNotEqual(
		TEXT("Changing authoritative state changes the hash"),
		FNLTDeterministicStateHash::ComputeStateHash(Reordered),
		Hash);

	FNLTRandomStream Rng(99);
	Rng.GetFraction();
	const FString StateWithRng = FNLTDeterministicStateHash::ComputeStateHash(State, &Rng);
	Rng.GetFraction();
	TestNotEqual(
		TEXT("RNG progress changes the state hash"),
		FNLTDeterministicStateHash::ComputeStateHash(State, &Rng),
		StateWithRng);
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS


IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTDeterministicReplayRoundTripTest,
	"NLT.Simulation.Replay.RoundTrip",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTDeterministicReplayRoundTripTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	FNLTSimulationState Initial;
	Initial.RandomSeed = 1337;
	Initial.SimulationTick = 0;
	FNLTAgentState Agent;
	Agent.AgentId = FName(TEXT("agent-a"));
	Agent.DisplayName = FName(TEXT("Agent A"));
	Initial.Agents.Add(Agent);
	FNLTRandomStream InitialRng(1337);

	FNLTSimulationState Final = Initial;
	Final.SimulationTick = 1;
	Final.WorldTime = 1.0 / 60.0;
	Final.Agents[0].Focus = 0.8f;
	FNLTRandomStream FinalRng(1337);
	FinalRng.GetFraction();

	FNLTReplayAction Action;
	Action.ActionId = TEXT("action-1");
	Action.Sequence = 1;
	Action.SubmittedTick = 0;
	Action.ActorType = TEXT("engine");
	Action.ActorId = TEXT("test");
	Action.ActionType = TEXT("advance_tick");
	Action.TargetId = TEXT("simulation");
	Action.PayloadJson = TEXT("{\"minutes\":1}");

	FNLTReplayEvent Event;
	Event.EventId = TEXT("event-1");
	Event.Sequence = 1;
	Event.EventType = ENLTSimulationEventType::Tick;
	Event.Tick = 1;
	Event.Description = TEXT("Advanced deterministic simulation");

	FNLTDeterministicReplay Replay = FNLTDeterministicReplay::Create(
		TEXT("replay-test-1"), TEXT("Replay round trip test"), Initial, InitialRng,
		{Action}, {Event}, Final, FinalRng);
	FString Error;
	TestTrue(TEXT("Created replay verifies"), Replay.Verify(Error));
	FString Json;
	TestTrue(TEXT("Replay serializes"), Replay.SerializeToJson(Json));
	TestFalse(TEXT("Serialized replay is not empty"), Json.IsEmpty());

	FNLTDeterministicReplay Restored;
	TestTrue(TEXT("Replay deserializes"), FNLTDeterministicReplay::DeserializeFromJson(Json, Restored, Error));
	TestTrue(TEXT("Deserialized replay verifies"), Restored.Verify(Error));
	TestEqual(TEXT("Round trip preserves final hash"), Restored.ExpectedFinalHash, Replay.ExpectedFinalHash);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTDeterministicReplayTamperTest,
	"NLT.Simulation.Replay.TamperDetection",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTDeterministicReplayTamperTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	FNLTSimulationState State;
	State.RandomSeed = 9;
	FNLTRandomStream Rng(9);
	FNLTDeterministicReplay Replay = FNLTDeterministicReplay::Create(
		TEXT("replay-tamper"), TEXT("Tamper test"), State, Rng, {}, {}, State, Rng);
	FString Error;
	Replay.Actions.Add(FNLTReplayAction());
	TestFalse(TEXT("Invalid action sequence is rejected"), Replay.Verify(Error));
	TestTrue(TEXT("Tamper error explains the rejected action"), Error.Contains(TEXT("action sequence")));

	FNLTDeterministicReplay StateTamper = Replay;
	StateTamper.Actions.Reset();
	StateTamper.ExpectedFinalState.SimulationTick++;
	TestFalse(TEXT("Tampered final state is rejected"), StateTamper.Verify(Error));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTDeterministicReplayMalformedJsonTest,
	"NLT.Simulation.Replay.MalformedJson",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTDeterministicReplayMalformedJsonTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	FNLTDeterministicReplay Replay;
	FString Error;
	TestFalse(TEXT("Malformed replay JSON is rejected"), FNLTDeterministicReplay::DeserializeFromJson(TEXT("{\"replay_id\":"), Replay, Error));
	TestFalse(TEXT("Malformed replay error is populated"), Error.IsEmpty());
	return true;
}


IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTDeterministicReplayObservedStateTest,
	"NLT.Simulation.Replay.ObservedState",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTDeterministicReplayObservedStateTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	FNLTSimulationState State;
	State.RandomSeed = 77;
	FNLTRandomStream Rng(77);
	FNLTDeterministicReplay Replay = FNLTDeterministicReplay::Create(
		TEXT("replay-observed"), TEXT("Observed state test"), State, Rng, {}, {}, State, Rng);
	FString Error;
	TestTrue(TEXT("Matching observed state verifies"), Replay.VerifyAgainstState(State, Rng, Error));
	State.SimulationTick++;
	TestFalse(TEXT("Different observed state is rejected"), Replay.VerifyAgainstState(State, Rng, Error));
	return true;
}


IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTVisualLODThresholdTest,
	"NLT.VisualLOD.Policy.Thresholds",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTVisualLODThresholdTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	FNLTVisualLODPolicy Policy;
	Policy.NearDistance = 1000.0f;
	Policy.MidDistance = 3000.0f;
	Policy.FarDistance = 6000.0f;
	Policy.Hysteresis = 250.0f;
	TestEqual(TEXT("Near distance selects LOD0"), Policy.ResolveLevel(500.0f, ENLTVisualLODLevel::LOD1_Mid, false), ENLTVisualLODLevel::LOD0_Near);
	TestEqual(TEXT("Between near and mid selects LOD1"), Policy.ResolveLevel(2000.0f, ENLTVisualLODLevel::LOD0_Near, true), ENLTVisualLODLevel::LOD1_Mid);
	TestEqual(TEXT("Between mid and far selects LOD2"), Policy.ResolveLevel(4000.0f, ENLTVisualLODLevel::LOD1_Mid, true), ENLTVisualLODLevel::LOD2_Far);
	TestEqual(TEXT("Beyond far selects LOD3"), Policy.ResolveLevel(7000.0f, ENLTVisualLODLevel::LOD2_Far, true), ENLTVisualLODLevel::LOD3_Hidden);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTVisualLODHysteresisTest,
	"NLT.VisualLOD.Policy.Hysteresis",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTVisualLODHysteresisTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	FNLTVisualLODPolicy Policy;
	Policy.NearDistance = 1000.0f;
	Policy.MidDistance = 3000.0f;
	Policy.FarDistance = 6000.0f;
	Policy.Hysteresis = 250.0f;
	TestEqual(TEXT("Moving slightly beyond near keeps the previous LOD"), Policy.ResolveLevel(1100.0f, ENLTVisualLODLevel::LOD0_Near, true), ENLTVisualLODLevel::LOD0_Near);
	TestEqual(TEXT("Moving beyond near plus hysteresis advances"), Policy.ResolveLevel(1300.0f, ENLTVisualLODLevel::LOD0_Near, true), ENLTVisualLODLevel::LOD1_Mid);
	TestEqual(TEXT("Moving slightly beyond far keeps the previous LOD"), Policy.ResolveLevel(6100.0f, ENLTVisualLODLevel::LOD2_Far, true), ENLTVisualLODLevel::LOD2_Far);
	TestEqual(TEXT("Moving beyond far plus hysteresis hides"), Policy.ResolveLevel(6300.0f, ENLTVisualLODLevel::LOD2_Far, true), ENLTVisualLODLevel::LOD3_Hidden);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTVisualLODRepresentationTest,
	"NLT.VisualLOD.Policy.RepresentationAndFallback",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTVisualLODRepresentationTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	FNLTVisualLODPolicy Policy;
	TestEqual(TEXT("Mass entities with a visual use HISM"), Policy.ResolveRepresentation(ENLTVisualLODLevel::LOD1_Mid, true, true, false), ENLTVisualRepresentation::HISM);
	TestEqual(TEXT("Actor with a primary mesh uses Mesh"), Policy.ResolveRepresentation(ENLTVisualLODLevel::LOD0_Near, false, true, true), ENLTVisualRepresentation::Mesh);
	TestEqual(TEXT("Actor without a primary mesh uses fallback"), Policy.ResolveRepresentation(ENLTVisualLODLevel::LOD2_Far, false, false, true), ENLTVisualRepresentation::FallbackMesh);
	TestEqual(TEXT("Hidden level is never represented"), Policy.ResolveRepresentation(ENLTVisualLODLevel::LOD3_Hidden, false, true, true), ENLTVisualRepresentation::Hidden);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTVisualLODViewerFallbackTest,
	"NLT.VisualLOD.Policy.ViewerFallback",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTVisualLODViewerFallbackTest::RunTest(const FString& Parameters)
{
	(void)Parameters;
	const FVector Fallback(100.0f, 200.0f, 300.0f);
	TestEqual(TEXT("No world returns the supplied fallback"), FNLTVisualLODPolicy::GetViewerLocation(nullptr, Fallback), Fallback);
	return true;
}
