#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

DECLARE_LOG_CATEGORY_EXTERN(LogNLTFusion, Log, All);

// NOTE: The "WorldEngine" module is implemented exactly once, by FWorldEngineModule in
// Source/WorldEngine/WorldEngine.cpp. Do not declare a second IModuleInterface
// implementation for this module here: a module must have exactly one
// IMPLEMENT_MODULE / IMPLEMENT_GAME_MODULE definition, otherwise the build fails with
// C2084/C2086/C2374 duplicate-definition errors for InitializeWorldEngineModule,
// WorldEngineInitializerEntry and IMPLEMENT_MODULE_WorldEngine.

UENUM(BlueprintType)
enum class ENLTAgentRole : uint8
{
    None        UMETA(DisplayName = "None"),
    Avatar      UMETA(DisplayName = "Avatar"),
    Aide        UMETA(DisplayName = "Aide"),
    Advocate    UMETA(DisplayName = "Advocate")
};

UENUM(BlueprintType)
enum class ESimulationMode : uint8
{
    Realtime           UMETA(DisplayName = "Realtime"),
    Paused             UMETA(DisplayName = "Paused"),
    FastForward        UMETA(DisplayName = "FastForward"),
    SlowMotion         UMETA(DisplayName = "SlowMotion"),
    Headless           UMETA(DisplayName = "Headless"),
    Replay             UMETA(DisplayName = "Replay"),
    DeterministicTest  UMETA(DisplayName = "DeterministicTest")
};

UENUM(BlueprintType)
enum class ENLTAgentIntent : uint8
{
    None            UMETA(DisplayName = "None"),
    Idle            UMETA(DisplayName = "Idle"),
    FindQuietPlace  UMETA(DisplayName = "FindQuietPlace"),
    Work            UMETA(DisplayName = "Work"),
    Socialize       UMETA(DisplayName = "Socialize"),
    Rest            UMETA(DisplayName = "Rest"),
    Study           UMETA(DisplayName = "Study"),
    MoveToLocation  UMETA(DisplayName = "MoveToLocation"),
    Interact        UMETA(DisplayName = "Interact"),
    Coached         UMETA(DisplayName = "Coached"),
    Overwhelmed     UMETA(DisplayName = "Overwhelmed"),
    Drifting        UMETA(DisplayName = "Drifting"),
    Hyperfocus      UMETA(DisplayName = "Hyperfocus")
};

UENUM(BlueprintType)
enum class ENLTAgentNeed : uint8
{
    None        UMETA(DisplayName = "None"),
    Quiet       UMETA(DisplayName = "Quiet"),
    Rest        UMETA(DisplayName = "Rest"),
    Social      UMETA(DisplayName = "Social"),
    Stimulation UMETA(DisplayName = "Stimulation"),
    Food        UMETA(DisplayName = "Food"),
    Movement    UMETA(DisplayName = "Movement"),
    Privacy     UMETA(DisplayName = "Privacy")
};

/**
 * Emotional state derived from cognitive dimensions (Focus, Stress, CognitiveLoad, Burnout).
 * Drives animation posture, facial expression, thought bubbles, and particle effects.
 * The state machine lives in UNLTEmotionStateComponent.
 */
UENUM(BlueprintType)
enum class ENLTEmotionState : uint8
{
    Neutral     UMETA(DisplayName = "Neutral"),
    Focused     UMETA(DisplayName = "Focused"),
    Working     UMETA(DisplayName = "Working"),
    Struggling  UMETA(DisplayName = "Struggling"),
    Overwhelmed UMETA(DisplayName = "Overwhelmed"),
    Drifting    UMETA(DisplayName = "Drifting"),
    Hyperfocus  UMETA(DisplayName = "Hyperfocus"),
    Coached     UMETA(DisplayName = "Coached"),
    Fatigued    UMETA(DisplayName = "Fatigued"),
    Celebrating UMETA(DisplayName = "Celebrating")
};

/**
 * Animation state that corresponds to an ENLTEmotionState.
 * Drives animation montage selection and procedural posing.
 */
UENUM(BlueprintType)
enum class ENLTAnimationState : uint8
{
    Idle        UMETA(DisplayName = "Idle"),
    Walk        UMETA(DisplayName = "Walk"),
    Work        UMETA(DisplayName = "Work"),
    Struggle    UMETA(DisplayName = "Struggle"),
    Hyperfocus  UMETA(DisplayName = "Hyperfocus"),
    CoachGesture UMETA(DisplayName = "Coach Gesture"),
    IdleTired   UMETA(DisplayName = "Idle Tired"),
    Celebrate   UMETA(DisplayName = "Celebrate"),
    Nod         UMETA(DisplayName = "Nod"),
    Drift       UMETA(DisplayName = "Drift"),
    None        UMETA(DisplayName = "None")
};

/**
 * Facial expression target for blend-shape or curve-driven facial animation.
 */
UENUM(BlueprintType)
enum class ENLTFacialExpression : uint8
{
    Neutral     UMETA(DisplayName = "Neutral"),
    Happy       UMETA(DisplayName = "Happy"),
    Sad         UMETA(DisplayName = "Sad"),
    Focused     UMETA(DisplayName = "Focused"),
    Tired       UMETA(DisplayName = "Tired"),
    Stressed    UMETA(DisplayName = "Stressed"),
    Surprised   UMETA(DisplayName = "Surprised"),
    Thinking    UMETA(DisplayName = "Thinking")
};

namespace NLTFusion
{
    constexpr float NeedThreshold = 0.7f;
    constexpr float CognitiveLoadMax = 1.0f;
    constexpr float StressMax = 1.0f;
    constexpr float FocusMax = 1.0f;
    constexpr float BurnoutMax = 1.0f;
    constexpr float IndependenceMax = 1.0f;
    constexpr float FusionReadyMax = 1.0f;
    constexpr float SuccessRateMax = 1.0f;
}
