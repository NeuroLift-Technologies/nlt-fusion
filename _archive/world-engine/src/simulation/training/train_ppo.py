"""
Optional Stable-Baselines3 PPO entrypoint for `WorldEnv`.

This is deliberately *outside* the stdlib-only kernel. The training deps are not
in `requirements.txt`; install them explicitly when you want to train:

    pip install "stable-baselines3>=2.3" "gymnasium>=0.29"

Then (from `world-engine/`):

    python -m src.simulation.training.train_ppo --timesteps 200000 --n-envs 8

The environment itself runs on the stdlib; SB3 + numpy are only used here.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any, List

from .env import WorldEnv


def _require_sb3() -> Any:
    try:
        import stable_baselines3  # noqa: F401
        from stable_baselines3.common.env_util import make_vec_env  # noqa: F401
        from stable_baselines3.common.vec_env import DummyVecEnv  # noqa: F401
    except Exception:
        print("stable-baselines3 is not installed. Install it with:\n"
              '    pip install "stable-baselines3>=2.3" "gymnasium>=0.29"',
              file=sys.stderr)
        raise SystemExit(2)


def _make_wrapped(seed: int, scenario_id: str, max_steps: int):
    """Build a gymnasium-compatible env: float32 observations, list actions."""
    import numpy as np
    import gymnasium as gym

    class _Float32Obs(gym.ObservationWrapper):
        def observation(self, observation):
            return np.asarray(observation, dtype=np.float32)

    def _init():
        env = WorldEnv(seed=seed, scenario_id=scenario_id, max_steps=max_steps)
        return _Float32Obs(env)

    return _init


def parse_args(argv: List[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a PPO policy on WorldEnv.")
    parser.add_argument("--timesteps", type=int, default=200_000)
    parser.add_argument("--n-envs", type=int, default=4)
    parser.add_argument("--scenario", type=str, default="pers_4")
    parser.add_argument("--max-steps", type=int, default=512)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--n-steps", type=int, default=256)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--save", type=str, default="models/ppo_worldenv")
    parser.add_argument("--log-dir", type=str, default="models/tensorboard")
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv)
    _require_sb3()
    from stable_baselines3 import PPO
    from stable_baselines3.common.vec_env import DummyVecEnv

    env_fns = [_make_wrapped(args.seed + i, args.scenario, args.max_steps)
               for i in range(args.n_envs)]
    vec_env = DummyVecEnv(env_fns)

    try:
        import tensorboard  # noqa: F401
        tensorboard_log = args.log_dir
    except Exception:
        tensorboard_log = None
        print("tensorboard not installed; logging to stdout only "
              "(pip install tensorboard)", file=sys.stderr)

    model = PPO(
        "MlpPolicy",
        vec_env,
        learning_rate=args.lr,
        n_steps=args.n_steps,
        batch_size=args.batch_size,
        seed=args.seed,
        tensorboard_log=tensorboard_log,
        verbose=1,
    )
    model.learn(total_timesteps=args.timesteps, progress_bar=False)
    model.save(args.save)
    print(f"Saved PPO policy to {args.save}.zip")

    # Deterministic evaluation rollout
    eval_env = WorldEnv(seed=args.seed, scenario_id=args.scenario,
                        max_steps=args.max_steps)
    obs, _ = eval_env.reset()
    total_reward = 0.0
    for _ in range(args.max_steps):
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, terminated, truncated, info = eval_env.step(action)
        total_reward += reward
        if terminated or truncated:
            break
    print(f"Eval: steps={info['steps']} reward={total_reward:.3f} "
          f"reason={info['reason']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
