"""
Training-side layer for the Python world engine.

This package adds a gym-style RL loop and the cognitive model it needs, without
modifying the authoritative kernel under `src/simulation/environment/`.

    cognitive.py  - port of UE ULTCognitiveStateComponent (decay, coaching,
                    reward, completion thresholds)
    env.py        - WorldEnv: the observation/action/reward contract from
                    UNLTAvatarInteractor + UNLTTrainingEnvironment
    train_ppo.py  - optional Stable-Baselines3 PPO entrypoint
"""

from .cognitive import (
    BURNOUT_FAILURE_THRESHOLD,
    COACHING_EFFECTS,
    COACHING_STRATEGIES,
    DEFAULTS,
    DECAY_PER_S,
    INDEPENDENCE_SUCCESS_THRESHOLD,
    OBSERVATION_ORDER,
    REWARD_WEIGHTS,
    CognitiveState,
    default_cognitive_state,
)
from .env import (
    OBSERVATION_DIM,
    WorldEnv,
    build_training_world,
    make_env,
)

__all__ = [
    "CognitiveState",
    "default_cognitive_state",
    "DEFAULTS",
    "DECAY_PER_S",
    "COACHING_STRATEGIES",
    "COACHING_EFFECTS",
    "REWARD_WEIGHTS",
    "OBSERVATION_ORDER",
    "INDEPENDENCE_SUCCESS_THRESHOLD",
    "BURNOUT_FAILURE_THRESHOLD",
    "WorldEnv",
    "make_env",
    "build_training_world",
    "OBSERVATION_DIM",
]
