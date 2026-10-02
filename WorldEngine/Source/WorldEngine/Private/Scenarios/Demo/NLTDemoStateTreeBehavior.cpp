#include "Scenarios/Demo/NLTDemoStateTreeBehavior.h"

TArray<FNLTStateTreeBehaviorStateConfig> UNLTDemoStateTreeBehavior::GetDefaultStateConfigs()
{
    TArray<FNLTStateTreeBehaviorStateConfig> Configs;

    // Idle — wait for needs to rise above threshold, then evaluate.
    FNLTStateTreeBehaviorStateConfig IdleConfig;
    IdleConfig.State = ENLTStateTreeBehaviorState::Idle;
    IdleConfig.TicksInState = 0; // Re-evaluate every tick until threshold met
    IdleConfig.NeedThreshold = 0.3f;
    Configs.Add(IdleConfig);

    // EvaluateNeeds — pick the highest need; transition immediately to SelectTarget.
    FNLTStateTreeBehaviorStateConfig EvalConfig;
    EvalConfig.State = ENLTStateTreeBehaviorState::EvaluateNeeds;
    EvalConfig.TicksInState = 0;
    EvalConfig.NeedThreshold = 0.0f;
    Configs.Add(EvalConfig);

    // SelectTarget — find matching locations, pick best or fall back to wander.
    FNLTStateTreeBehaviorStateConfig SelectConfig;
    SelectConfig.State = ENLTStateTreeBehaviorState::SelectTarget;
    SelectConfig.TicksInState = 0;
    SelectConfig.NeedThreshold = 0.0f;
    Configs.Add(SelectConfig);

    // MoveToTarget — step toward the target each tick.
    FNLTStateTreeBehaviorStateConfig MoveConfig;
    MoveConfig.State = ENLTStateTreeBehaviorState::MoveToTarget;
    MoveConfig.TicksInState = 0;
    MoveConfig.NeedThreshold = 0.0f;
    Configs.Add(MoveConfig);

    // FallbackWander — same as MoveToTarget but driven by a deterministic wander target.
    FNLTStateTreeBehaviorStateConfig FallbackConfig;
    FallbackConfig.State = ENLTStateTreeBehaviorState::FallbackWander;
    FallbackConfig.TicksInState = 0;
    FallbackConfig.NeedThreshold = 0.0f;
    Configs.Add(FallbackConfig);

    // Arrived — brief hold at the target before re-evaluating needs.
    FNLTStateTreeBehaviorStateConfig ArrivedConfig;
    ArrivedConfig.State = ENLTStateTreeBehaviorState::Arrived;
    ArrivedConfig.TicksInState = 5;
    ArrivedConfig.NeedThreshold = 0.0f;
    Configs.Add(ArrivedConfig);

    // Override — external command active; no auto-transitions.
    FNLTStateTreeBehaviorStateConfig OverrideConfig;
    OverrideConfig.State = ENLTStateTreeBehaviorState::Override;
    OverrideConfig.TicksInState = 0;
    OverrideConfig.NeedThreshold = 0.0f;
    Configs.Add(OverrideConfig);

    return Configs;
}

const FNLTStateTreeBehaviorStateConfig* UNLTDemoStateTreeBehavior::GetStateConfig(ENLTStateTreeBehaviorState InState) const
{
    for (const FNLTStateTreeBehaviorStateConfig& Config : States)
    {
        if (Config.State == InState)
        {
            return &Config;
        }
    }
    return nullptr;
}
