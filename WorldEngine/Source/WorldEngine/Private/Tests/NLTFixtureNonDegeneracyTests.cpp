#include "Misc/AutomationTest.h"
#include "Core/NLTFixtureEmitterSubsystem.h"

#if WITH_DEV_AUTOMATION_TESTS

/**
 * Migration plan item 1.7a — non-degeneracy assertion.
 *
 * The PIE capture that produces real dynamic state needs a game loop and therefore
 * a human (item 1.7b). The *assertion* does not: it is a pure function of the
 * per-tick series, so it can be proven here against synthetic vectors, headlessly.
 *
 * The point of these cases is that each one must FAIL the check for the reason it
 * is named. A degenerate capture that slips through is the exact failure 1.7 exists
 * to prevent — Tier 2 would go green against a fixture encoding no behaviour.
 */

/** Builds N identical canonical-state blocks — the editor-context static capture. */
static TArray<FString> MakeStaticCanonical(int32 Count)
{
	TArray<FString> Out;
	const FString Block = TEXT("NLT.WorldEngine.State.v2\n0;0000000000000000;00000000;0;0;10;agent\n7:Agent_0;1;");
	for (int32 i = 0; i < Count; ++i)
	{
		Out.Add(Block);
	}
	return Out;
}

static TArray<FString> MakeVaryingCanonical(int32 Count)
{
	TArray<FString> Out;
	for (int32 i = 0; i < Count; ++i)
	{
		Out.Add(FString::Printf(TEXT("NLT.WorldEngine.State.v2\n%d;0000000000000000;"), i));
	}
	return Out;
}

static TArray<FString> MakeEmptyEvents(int32 Count)
{
	TArray<FString> Out;
	for (int32 i = 0; i < Count; ++i)
	{
		Out.Add(FString());
	}
	return Out;
}

static TArray<FString> MakeEventsWithOneEvent(int32 Count)
{
	TArray<FString> Out = MakeEmptyEvents(Count);
	if (Out.Num() > 0)
	{
		Out[Out.Num() / 2] = TEXT("7;NeedsChanged;Agent_0;need shifted;Target_1;0.5\n");
	}
	return Out;
}

static TArray<FString> MakeStaticPositions(int32 Count)
{
	TArray<FString> Out;
	for (int32 i = 0; i < Count; ++i)
	{
		Out.Add(TEXT("100;200;100;300;400;100;"));
	}
	return Out;
}

static TArray<FString> MakeMovingPositions(int32 Count)
{
	TArray<FString> Out;
	for (int32 i = 0; i < Count; ++i)
	{
		Out.Add(FString::Printf(TEXT("100;200;100;%d;400;100;"), 300 + i));
	}
	return Out;
}

// ---------------------------------------------------------------------------
// Positive case: a healthy capture passes every signal.
// ---------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTFixtureNonDegeneracyHealthyCaptureTest,
	"NLT.FixtureCapture.NonDegeneracy.HealthyCapturePasses",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTFixtureNonDegeneracyHealthyCaptureTest::RunTest(const FString& Parameters)
{
	const TArray<FString> Canonical = MakeVaryingCanonical(600);
	const TArray<FString> Events = MakeEventsWithOneEvent(600);
	const TArray<FString> Positions = MakeMovingPositions(600);

	const FNLTFixtureNonDegeneracyResult Result =
		UNLTFixtureEmitterSubsystem::ValidateNonDegeneracy(Canonical, Events, Positions);

	TestEqual(TEXT("All 600 ticks inspected"), Result.TickCount, 600);
	TestTrue(TEXT("Has enough ticks"), Result.bHasEnoughTicks);
	TestTrue(TEXT("Canonical text varies"), Result.bCanonicalVaries);
	TestTrue(TEXT("Event stream non-empty"), Result.bEventStreamNonEmpty);
	TestTrue(TEXT("Agents move"), Result.bAgentsMove);
	TestTrue(TEXT("Overall verdict is PASS"), Result.Passed());
	TestTrue(TEXT("No failure reason recorded"), Result.FailureReason.IsEmpty());

	return true;
}

// ---------------------------------------------------------------------------
// The real-world degenerate capture: 600 byte-identical ticks, no events.
// This is the shape observed in Saved/Fixtures/seed42 on 2026-10-02.
// ---------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTFixtureNonDegeneracyStaticCaptureTest,
	"NLT.FixtureCapture.NonDegeneracy.StaticCaptureFails",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTFixtureNonDegeneracyStaticCaptureTest::RunTest(const FString& Parameters)
{
	// 600 identical blocks, empty event stream, unmoving agents.
	const TArray<FString> Canonical = MakeStaticCanonical(600);
	const TArray<FString> Events = MakeEmptyEvents(600);
	const TArray<FString> Positions = MakeStaticPositions(600);

	const FNLTFixtureNonDegeneracyResult Result =
		UNLTFixtureEmitterSubsystem::ValidateNonDegeneracy(Canonical, Events, Positions);

	TestFalse(TEXT("Degenerate capture must NOT pass"), Result.Passed());
	TestTrue(TEXT("Canonical text does NOT vary"), !Result.bCanonicalVaries);
	TestTrue(TEXT("Event stream IS empty"), !Result.bEventStreamNonEmpty);
	TestTrue(TEXT("Agents do NOT move"), !Result.bAgentsMove);
	TestTrue(TEXT("A failure reason is recorded"), !Result.FailureReason.IsEmpty());
	return true;
}

// ---------------------------------------------------------------------------
// Canonical text can vary while agents are frozen: SimulationTick and WorldTime
// advance every tick, so signal 2 alone would pass. Signal 4 must still catch it.
// ---------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTFixtureNonDegeneracyFrozenAgentsTest,
	"NLT.FixtureCapture.NonDegeneracy.FrozenAgentsFail",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTFixtureNonDegeneracyFrozenAgentsTest::RunTest(const FString& Parameters)
{
	const TArray<FString> Canonical = MakeVaryingCanonical(600);
	const TArray<FString> Events = MakeEventsWithOneEvent(600);
	const TArray<FString> Positions = MakeStaticPositions(600); // agents frozen

	const FNLTFixtureNonDegeneracyResult Result =
		UNLTFixtureEmitterSubsystem::ValidateNonDegeneracy(Canonical, Events, Positions);

	TestTrue(TEXT("Canonical text DOES vary (weak signal alone is satisfied)"), Result.bCanonicalVaries);
	TestTrue(TEXT("Event stream IS non-empty"), Result.bEventStreamNonEmpty);
	TestTrue(TEXT("Agents do NOT move"), !Result.bAgentsMove);
	TestFalse(TEXT("Overall verdict must be FAIL"), Result.Passed());
	TestTrue(TEXT("Failure names the static capture"),
		Result.FailureReason.Contains(TEXT("no agent position changed")));

	return true;
}

// ---------------------------------------------------------------------------
// A silent event bus must fail on its own, even with healthy positions.
// ---------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTFixtureNonDegeneracyEmptyEventStreamTest,
	"NLT.FixtureCapture.NonDegeneracy.EmptyEventStreamFails",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTFixtureNonDegeneracyEmptyEventStreamTest::RunTest(const FString& Parameters)
{
	const TArray<FString> Canonical = MakeVaryingCanonical(600);
	const TArray<FString> Events = MakeEmptyEvents(600);
	const TArray<FString> Positions = MakeMovingPositions(600);

	const FNLTFixtureNonDegeneracyResult Result =
		UNLTFixtureEmitterSubsystem::ValidateNonDegeneracy(Canonical, Events, Positions);

	TestTrue(TEXT("Agents move"), Result.bAgentsMove);
	TestTrue(TEXT("Event stream IS empty"), !Result.bEventStreamNonEmpty);
	TestEqual(TEXT("No ticks carried events"), Result.TicksWithEvents, 0);
	TestFalse(TEXT("Overall verdict must be FAIL"), Result.Passed());
	TestTrue(TEXT("Failure names the empty event stream"),
		Result.FailureReason.Contains(TEXT("event stream is empty")));

	return true;
}

// ---------------------------------------------------------------------------
// Too few ticks must fail rather than pass vacuously: with 1 tick there is
// nothing to compare, and a 2-tick capture cannot assert three distinct samples.
// ---------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTFixtureNonDegeneracyTooFewTicksTest,
	"NLT.FixtureCapture.NonDegeneracy.TooFewTicksFails",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTFixtureNonDegeneracyTooFewTicksTest::RunTest(const FString& Parameters)
{
	const FNLTFixtureNonDegeneracyResult One =
		UNLTFixtureEmitterSubsystem::ValidateNonDegeneracy(
			MakeVaryingCanonical(1), MakeEventsWithOneEvent(1), MakeMovingPositions(1));
	TestFalse(TEXT("Single tick must NOT pass"), One.Passed());
	TestFalse(TEXT("Single tick flagged as insufficient"), One.bHasEnoughTicks);
	TestTrue(TEXT("Failure explains the tick count"),
		One.FailureReason.Contains(TEXT("need >= 3")));

	const FNLTFixtureNonDegeneracyResult Two =
		UNLTFixtureEmitterSubsystem::ValidateNonDegeneracy(
			MakeVaryingCanonical(2), MakeEventsWithOneEvent(2), MakeMovingPositions(2));
	TestFalse(TEXT("Two ticks must NOT pass"), Two.Passed());
	TestFalse(TEXT("Two ticks flagged as insufficient"), Two.bHasEnoughTicks);

	return true;
}

// ---------------------------------------------------------------------------
// No agents captured at all: positions series empty, so movement is unknowable
// and must not be reported as passing.
// ---------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTFixtureNonDegeneracyNoAgentsTest,
	"NLT.FixtureCapture.NonDegeneracy.NoAgentsFails",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTFixtureNonDegeneracyNoAgentsTest::RunTest(const FString& Parameters)
{
	const TArray<FString> Canonical = MakeVaryingCanonical(600);
	const TArray<FString> Events = MakeEventsWithOneEvent(600);
	const TArray<FString> NoPositions;

	const FNLTFixtureNonDegeneracyResult Result =
		UNLTFixtureEmitterSubsystem::ValidateNonDegeneracy(Canonical, Events, NoPositions);

	TestTrue(TEXT("Agents must not be reported as moving"), !Result.bAgentsMove);
	TestFalse(TEXT("Overall verdict must be FAIL"), Result.Passed());
	TestTrue(TEXT("Failure names the absent agent data"),
		Result.FailureReason.Contains(TEXT("no agent position trace recorded")));

	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS

