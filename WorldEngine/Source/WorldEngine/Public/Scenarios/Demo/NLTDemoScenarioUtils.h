#pragma once

#include "CoreMinimal.h"
#include "Core/NLTFusionCore.h"
#include "MassEntityTypes.h"
#include "World/NLTSmartObjectWorldSubsystem.h"
#include "NLTDemoScenarioFragments.h"
#include "Agents/NLTStateTreeFragments.h"
#include "NLTDemoScenarioUtils.generated.h"

/**
 * Shared utility functions and types used by both the legacy
 * UNLTScenarioDecisionProcessor and the new UNLTStateTreeBehaviorProcessor.
 *
 * Centralising these here ensures the StateTree behavior layer and the
 * legacy processors agree on candidate scoring, need ranking, and
 * intent mapping — a critical invariant for deterministic transitions
 * and fallback tests.
 */

/** Candidate location evaluated during target selection. */
USTRUCT()
struct FNLTScenarioCandidate
{
    GENERATED_BODY()

    UPROPERTY()
    FVector WorldLocation = FVector::ZeroVector;

    UPROPERTY()
    FString DisplayName;

    UPROPERTY()
    float Score = 0.0f;

    UPROPERTY()
    float Distance = 0.0f;
};

/**
 * Sorts candidate locations deterministically:
 *   score desc, distance asc, display-name asc.
 */
inline void SortCandidatesDeterministic(TArray<FNLTScenarioCandidate>& Candidates)
{
    Candidates.Sort([](const FNLTScenarioCandidate& A, const FNLTScenarioCandidate& B)
    {
        if (A.Score != B.Score) return A.Score > B.Score;
        if (A.Distance != B.Distance) return A.Distance < B.Distance;
        return A.DisplayName < B.DisplayName;
    });
}

/**
 * Returns the most pressing need and its value (deterministic tie-break by enum order).
 */
inline ENLTAgentNeed HighestNeed(const FNLTScenarioNeedsFragment& Needs, float& OutValue)
{
    ENLTAgentNeed Best = ENLTAgentNeed::Quiet;
    float BestValue = Needs.Quiet;
    if (Needs.Rest > BestValue) { Best = ENLTAgentNeed::Rest; BestValue = Needs.Rest; }
    if (Needs.Social > BestValue) { Best = ENLTAgentNeed::Social; BestValue = Needs.Social; }
    if (Needs.Stimulation > BestValue) { Best = ENLTAgentNeed::Stimulation; BestValue = Needs.Stimulation; }
    OutValue = BestValue;
    return Best;
}

/** Maps an agent need to its corresponding intent (deterministic). */
inline ENLTAgentIntent IntentForNeed(const ENLTAgentNeed Need)
{
    switch (Need)
    {
    case ENLTAgentNeed::Quiet:       return ENLTAgentIntent::FindQuietPlace;
    case ENLTAgentNeed::Rest:        return ENLTAgentIntent::Rest;
    case ENLTAgentNeed::Social:      return ENLTAgentIntent::Socialize;
    case ENLTAgentNeed::Stimulation: return ENLTAgentIntent::Drifting;
    default:                         return ENLTAgentIntent::Idle;
    }
}

/** Returns the scalar value of a specific need from the needs fragment. */
inline float NeedValue(const FNLTScenarioNeedsFragment& Needs, const ENLTAgentNeed Need)
{
    switch (Need)
    {
    case ENLTAgentNeed::Quiet:       return Needs.Quiet;
    case ENLTAgentNeed::Rest:        return Needs.Rest;
    case ENLTAgentNeed::Social:      return Needs.Social;
    case ENLTAgentNeed::Stimulation: return Needs.Stimulation;
    default:                         return 0.0f;
    }
}

/** Scores a world location for satisfying a given need (deterministic). */
inline float ScoreLocationForNeed(const FNLTWorldLocation& Location, const ENLTAgentNeed Need)
{
    switch (Need)
    {
    case ENLTAgentNeed::Quiet:
        return 1.0f - Location.NoiseLevel;
    case ENLTAgentNeed::Social:
        return Location.SocialDensity;
    case ENLTAgentNeed::Rest:
    case ENLTAgentNeed::Privacy:
        return Location.Privacy;
    case ENLTAgentNeed::Stimulation:
        return Location.SocialDensity + Location.NoiseLevel * 0.5f;
    default:
        return 0.0f;
    }
}
