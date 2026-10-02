"""
Cognitive dynamics for RL training.

A faithful, dependency-free port of Unreal's `ULTCognitiveStateComponent`
(`WorldEngine/Source/WorldEngine/{Public,Private}/Agents/LTCognitiveStateComponent.*`)
so the Python kernel can serve the same training signal the UE Learning Agents
path uses. Keeping these constants in one place lets the UE and Python trainers
stay in parity.

7 cognitive dimensions (observation order matches UE `GetObservationValues`):

    Focus, CognitiveLoad, Stress, Burnout, Independence, FusionReady, SuccessRate

The kernel's own `AgentState` component carries the same seven fields (with
`burnout_risk` = Burnout and `fusion_readiness` = FusionReady), so the env syncs
between this model and the ECS each step rather than owning duplicate state.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

# --- Tunables (verbatim from LTCognitiveStateComponent.cpp) ----------------

#: Per-second decay/growth rates applied to the cognitive model each step.
DECAY_PER_S: Dict[str, float] = {
    "stress": 0.01,        # pressure builds over time
    "burnout": 0.005,
    "focus": 0.02,         # focus drifts down without coaching
    "independence": 0.001,
}

#: Reset values (LTCognitiveStateComponent::ResetCognitiveState).
DEFAULTS: Dict[str, float] = {
    "focus": 0.65,
    "cognitive_load": 0.20,
    "stress": 0.15,
    "burnout": 0.05,
    "independence": 0.20,
    "fusion_ready": 0.0,
    "success_rate": 0.50,
}

#: The 10 coaching strategies an Aide policy can choose (strategy id 0-9).
COACHING_STRATEGIES: List[str] = [
    "pomodoro",               # 0
    "ladder_step",            # 1
    "body_double",            # 2
    "implementation_intent",  # 3
    "two_minute_start",       # 4
    "task_chunking",          # 5
    "mindful_refocus",        # 6
    "distraction_immunize",   # 7
    "attention_anchor",       # 8
    "shrink_the_task",        # 9
]

#: Per-strategy deltas (LTCognitiveStateComponent::ApplyCoachingEffect).
COACHING_EFFECTS: Dict[int, Dict[str, float]] = {
    0: {"stress": -0.10, "focus": +0.10},
    1: {"cognitive_load": -0.10, "focus": +0.05},
    2: {"stress": -0.15, "independence": +0.05},
    3: {"cognitive_load": -0.05, "focus": +0.10},
    4: {"focus": +0.15},
    5: {"cognitive_load": -0.15, "focus": +0.05},
    6: {"stress": -0.20, "focus": +0.10},
    7: {"focus": +0.15},
    8: {"focus": +0.20, "stress": -0.10},
    9: {"cognitive_load": -0.20, "stress": -0.05},
}

#: Reward weights (UNLTTrainingEnvironment::GatherAgentReward).
REWARD_WEIGHTS: Dict[str, float] = {
    "independence": +1.0,
    "burnout": -1.0,
    "stress": -0.5,
    "focus": +0.3,
    "success_rate": +0.5,
}

#: Episode completion (NLTEpisodeManager::CheckCognitiveCompletion).
INDEPENDENCE_SUCCESS_THRESHOLD = 0.8
BURNOUT_FAILURE_THRESHOLD = 0.9

#: The seven fields, in observation order.
OBSERVATION_ORDER: List[str] = [
    "focus", "cognitive_load", "stress", "burnout",
    "independence", "fusion_ready", "success_rate",
]

_CLAMPED_FIELDS = tuple(OBSERVATION_ORDER)


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


@dataclass
class CognitiveState:
    """The 7-dim cognitive model for a single Avatar."""

    focus: float = DEFAULTS["focus"]
    cognitive_load: float = DEFAULTS["cognitive_load"]
    stress: float = DEFAULTS["stress"]
    burnout: float = DEFAULTS["burnout"]
    independence: float = DEFAULTS["independence"]
    fusion_ready: float = DEFAULTS["fusion_ready"]
    success_rate: float = DEFAULTS["success_rate"]

    # --- dynamics ---

    def decay(self, delta_seconds: float) -> None:
        """`ULTCognitiveStateComponent::TickCognitiveDecay`."""
        self.stress = _clamp01(self.stress + DECAY_PER_S["stress"] * delta_seconds)
        self.burnout = _clamp01(self.burnout + DECAY_PER_S["burnout"] * delta_seconds)
        self.focus = _clamp01(self.focus - DECAY_PER_S["focus"] * delta_seconds)
        self.independence = _clamp01(
            self.independence - DECAY_PER_S["independence"] * delta_seconds)

    def apply_coaching(self, strategy_id: int) -> bool:
        """`ULTCognitiveStateComponent::ApplyCoachingEffect`. Returns applied."""
        effects = COACHING_EFFECTS.get(strategy_id)
        if effects is None:
            return False
        for name, delta in effects.items():
            setattr(self, name, _clamp01(getattr(self, name) + delta))
        return True

    def clamp(self) -> None:
        for name in _CLAMPED_FIELDS:
            setattr(self, name, _clamp01(getattr(self, name)))

    # --- derived ---

    def observation(self) -> List[float]:
        """The 7-value cognitive block, in UE observation order."""
        return [float(getattr(self, name)) for name in OBSERVATION_ORDER]

    def reward(self) -> float:
        """`UNLTTrainingEnvironment::GatherAgentReward`.

        reward = +1.0*Independence - 1.0*Burnout - 0.5*Stress
                 +0.3*Focus +0.5*SuccessRate
        """
        return sum(getattr(self, name) * weight
                   for name, weight in REWARD_WEIGHTS.items())

    @property
    def succeeded(self) -> bool:
        return self.independence >= INDEPENDENCE_SUCCESS_THRESHOLD

    @property
    def failed(self) -> bool:
        return self.burnout >= BURNOUT_FAILURE_THRESHOLD


def default_cognitive_state() -> CognitiveState:
    return CognitiveState()
