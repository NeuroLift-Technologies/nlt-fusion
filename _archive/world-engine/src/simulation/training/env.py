"""
Gym-style RL environment over the Python ECS kernel.

This is the Python-side equivalent of the UE Learning Agents training setup:
it wraps the authoritative ECS world (`WorldEngine`) in a single-agent RL loop
and reproduces the observation / action / reward / completion contract that the
UE C++ interactors define, so policies can be trained **headless, without an
Unreal install**, at far faster than real time.

Contract parity (source of truth = UE C++):

    observation  <- UNLTAvatarInteractor::GatherAgentObservation
                    13-dim = Position(3) + Velocity(3) + Cognitive(7)
    action       <- UNLTAvatarInteractor::SpecifyAgentAction
                    MoveDirection(3 cont) + Interaction(1 of 4 discrete)
    reward       <- UNLTTrainingEnvironment::GatherAgentReward
    completion   <- NLTEpisodeManager::CheckCognitiveCompletion
                    + scenario.completed from the kernel

Nothing here mutates the kernel. It only *drives* it: cognitive decay/coaching
are applied at the same seam (`AgentState`) the scenario system already writes,
so kernel stressors and interventions still compose with the learned policy.

The environment is stdlib-only by default. If `gymnasium` is installed the
real `spaces.Box` objects are exposed; otherwise small local shims keep the
`observation_space` / `action_space` attributes present for tooling.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ..environment.agent_interface import AgentInterface
from ..environment.ecs import AgentState, Needs
from ..environment.scenario_system import ScenarioSystem
from ..environment.world_builder import DEFAULT_NEEDS, build_world, engine_for_spec
from ..runner import WorldRunner
from ..scene.loader import DEFAULT_SCENE_PATH, load_scene, scene_to_builder_spec
from .cognitive import (
    BURNOUT_FAILURE_THRESHOLD,
    INDEPENDENCE_SUCCESS_THRESHOLD,
    CognitiveState,
)

# Observation layout: Position(3) + Velocity(3) + Cognitive(7)
OBSERVATION_DIM = 13
_AIDE_OBSERVATION_DIM = 20  # AvatarState(13) + AideState(7)

_AVATAR_ID = "stay_alert"
_DEFAULT_SPAWN = (4, 12)

try:  # optional, only for real gym spaces
    import gymnasium.spaces as _gym_spaces  # type: ignore
except Exception:  # pragma: no cover - exercised only without gymnasium
    _gym_spaces = None

try:  # subclass the real Env so gymnasium wrappers (and SB3) accept us
    import gymnasium as _gymnasium  # type: ignore
    _ENV_BASE: Any = _gymnasium.Env
except Exception:  # pragma: no cover - stdlib-only fallback
    _ENV_BASE = object


class _Box:
    """Minimal stand-in for `gymnasium.spaces.Box` (stdlib-only fallback)."""

    def __init__(self, low: Sequence[float], high: Sequence[float]):
        self.low = list(low)
        self.high = list(high)
        self.shape = (len(self.low),)
        self.dtype = "float32"

    def sample(self) -> List[float]:
        import random
        return [random.uniform(lo, hi) for lo, hi in zip(self.low, self.high)]

    def __repr__(self) -> str:
        return f"_Box(shape={self.shape}, low={self.low}, high={self.high})"


def build_training_world(seed: int = 0,
                         seconds_per_tick: float = 60.0,
                         scenario_id: str = "pers_4",
                         tiles_per_second: float = 2.0
                         ) -> Tuple[Any, WorldRunner, ScenarioSystem, AgentInterface]:
    """Create the v1 Core Loop world with an *empty* controller list.

    Mirrors `core_loop.build_core_loop_world` but omits the scripted
    `ScenarioAgent` so the RL policy — not a reference controller — is the only
    thing driving the Avatar.
    """
    scene = load_scene(DEFAULT_SCENE_PATH)
    spec = scene_to_builder_spec(scene)
    engine = engine_for_spec(
        spec, seed=seed, seconds_per_tick=seconds_per_tick, pace=1.0,
        scene_id=scene.get("scene_id", "default_home"),
        tiles_per_second=tiles_per_second,
    )
    placed = build_world(engine, spec)

    scenario_system = ScenarioSystem(
        engine, placed, {_AVATAR_ID: _AVATAR_ID}, {_AVATAR_ID: "dr_vance"})
    engine.registry.register_system(scenario_system)

    needs = Needs(
        levels={"energy": 0.55, "hunger": 0.4, "hygiene": 0.35,
                "fun": 0.5, "social": 0.45},
        decay_per_s=DEFAULT_NEEDS,
    )
    interface = AgentInterface(
        engine, agent_id=_AVATAR_ID, x=_DEFAULT_SPAWN[0], y=_DEFAULT_SPAWN[1],
        name="StayAlert", needs=needs)
    engine.registry.add_component(interface.entity, AgentState(
        focus=0.65, cognitive_load=0.20, stress=0.15, burnout_risk=0.05,
        independence=0.20, fusion_readiness=0.0, success_rate=0.50,
        target_x=_DEFAULT_SPAWN[0], target_y=_DEFAULT_SPAWN[1], facing="south",
    ))
    engine.register_avatar_profile(
        _AVATAR_ID, interface.entity,
        contract_id=_AVATAR_ID, name="StayAlert", trait="Sustained Attention",
        default_room="bedroom", hue=200, tag="SA",
        spawn_x=_DEFAULT_SPAWN[0], spawn_y=_DEFAULT_SPAWN[1],
    )

    runner = WorldRunner(engine, controllers=[], pace=1.0)
    scenario_system.assign(_AVATAR_ID, scenario_id)
    return engine, runner, scenario_system, interface


class WorldEnv(_ENV_BASE):  # type: ignore[misc,valid-type]
    """Single-Avatar RL environment with an optional Aide coaching action.

    Usage (raw)::

        env = WorldEnv(seed=0)
        obs, info = env.reset()
        obs, reward, terminated, truncated, info = env.step([0.0, 1.0, 0.0, 0.0])

    Action forms accepted by `step`:

    * list/tuple of 3  -> continuous move only
    * list/tuple of 4  -> `[dx, dy, dz, interact]`, `interact` in [0, 4)
                          (floor -> 0=none, 1..3 = k-th nearest interactable)
    * list/tuple of 5+ -> the 5th value is an Aide strategy id (0-9, -1 = none)
    * dict             -> `{"move": [..], "interact": int, "aide": int}`
    """

    metadata = {"render_modes": []}

    def __init__(self,
                 seed: int = 0,
                 scenario_id: str = "pers_4",
                 seconds_per_tick: float = 60.0,
                 cognitive_seconds_per_step: float = 0.1,
                 max_steps: int = 512,
                 move_radius: int = 5,
                 vision_radius: int = 8,
                 tiles_per_second: float = 2.0):
        super().__init__()
        self.scenario_id = scenario_id
        self.seconds_per_tick = float(seconds_per_tick)
        # Cognitive dynamics run on their own step to preserve the UE
        # LearningAgents balance (512 steps ~= 51.2s of cognitive time).
        self.cognitive_seconds_per_step = float(cognitive_seconds_per_step)
        self.max_steps = int(max_steps)
        self.move_radius = int(move_radius)
        self.vision_radius = int(vision_radius)
        self.tiles_per_second = float(tiles_per_second)

        self._base_seed = int(seed)
        self._next_seed = int(seed)

        self.observation_space, self.action_space = self._make_spaces()

        # Populated by `_build`
        self.engine: Any = None
        self.runner: WorldRunner = None  # type: ignore[assignment]
        self.scenario_system: ScenarioSystem = None  # type: ignore[assignment]
        self.interface: AgentInterface = None  # type: ignore[assignment]
        self.cognitive = CognitiveState()
        self._agent_entity: Any = None
        self._grid_w = 1
        self._grid_h = 1
        self._prev_pos: Tuple[int, int] = _DEFAULT_SPAWN
        self.steps = 0
        self._done = False
        self._scenario_completed = False
        self._last_events: List[Dict[str, Any]] = []

        self._build(self._base_seed)

    # --- setup helpers -----------------------------------------------------

    @staticmethod
    def _make_spaces():
        if _gym_spaces is not None:
            import numpy as np  # gymnasium implies numpy
            obs = _gym_spaces.Box(low=-1.0, high=1.0,
                                  shape=(OBSERVATION_DIM,), dtype="float32")
            act = _gym_spaces.Box(
                low=np.array([-1.0, -1.0, -1.0, 0.0], dtype="float32"),
                high=np.array([1.0, 1.0, 1.0, 4.0], dtype="float32"),
                dtype="float32")
            return obs, act
        return (_Box([-1.0] * OBSERVATION_DIM, [1.0] * OBSERVATION_DIM),
                _Box([-1.0, -1.0, -1.0, 0.0], [1.0, 1.0, 1.0, 4.0]))

    def _build(self, seed: int) -> None:
        engine, runner, scenario_system, interface = build_training_world(
            seed=seed, seconds_per_tick=self.seconds_per_tick,
            scenario_id=self.scenario_id,
            tiles_per_second=self.tiles_per_second)
        self.engine = engine
        self.runner = runner
        self.scenario_system = scenario_system
        self.interface = interface
        self._grid_w = int(engine.config.get("grid_width", 100))
        self._grid_h = int(engine.config.get("grid_height", 100))
        profile = engine.avatar_profiles[_AVATAR_ID]
        self._agent_entity = engine.registry.get_entity(profile["entity_id"])
        runner.on_update(self._on_update)

    def _on_update(self, _snapshot: Dict[str, Any],
                   events: List[Dict[str, Any]]) -> None:
        self._last_events = list(events)
        if any(evt.get("event_type") == "scenario.completed" for evt in events):
            self._scenario_completed = True

    # --- state sync --------------------------------------------------------

    def _agent_state(self) -> Optional[AgentState]:
        if self._agent_entity is None:
            return None
        return self.engine.registry.get_component(self._agent_entity, AgentState)

    def _sync_to_agent_state(self, cognitive: CognitiveState) -> None:
        state = self._agent_state()
        if state is None:
            return
        state.focus = cognitive.focus
        state.cognitive_load = cognitive.cognitive_load
        state.stress = cognitive.stress
        state.burnout_risk = cognitive.burnout
        state.independence = cognitive.independence
        state.fusion_readiness = cognitive.fusion_ready
        state.success_rate = cognitive.success_rate

    def _sync_from_agent_state(self, cognitive: CognitiveState) -> None:
        """Absorb kernel-side changes (stressors, scripted interventions)."""
        state = self._agent_state()
        if state is None:
            return
        cognitive.focus = state.focus
        cognitive.cognitive_load = state.cognitive_load
        cognitive.stress = state.stress
        cognitive.burnout = state.burnout_risk
        cognitive.independence = state.independence
        cognitive.fusion_ready = state.fusion_readiness
        cognitive.success_rate = state.success_rate

    def _update_success_rate(self, cognitive: CognitiveState) -> None:
        state = self._agent_state()
        if state is None:
            return
        denom = state.successes + state.failures + 1.0
        cognitive.success_rate = (state.successes + 0.5) / denom

    # --- observation -------------------------------------------------------

    def _observation(self, cognitive: CognitiveState) -> List[float]:
        x, y = self.interface.position()
        if x < 0:  # no position component
            x, y = self._prev_pos
        px = x / max(1, self._grid_w - 1)
        py = y / max(1, self._grid_h - 1)
        px = max(0.0, min(1.0, px))
        py = max(0.0, min(1.0, py))
        scale = float(max(1, self.move_radius))
        vx = max(-1.0, min(1.0, (x - self._prev_pos[0]) / scale))
        vy = max(-1.0, min(1.0, (y - self._prev_pos[1]) / scale))
        return [px, py, 0.0, vx, vy, 0.0] + cognitive.observation()

    def aide_observation(self) -> List[float]:
        """20-dim Aide view: AvatarState(13) + AideState(7), per NLTAideInteractor."""
        return self._observation(self.cognitive) + [0.5] * 7

    # --- action application ------------------------------------------------

    @staticmethod
    def _split_action(action: Any) -> Tuple[List[float], int, int]:
        move: List[float] = [0.0, 0.0, 0.0]
        interact = 0
        aide = -1
        if isinstance(action, dict):
            raw_move = action.get("move", action.get("avatar", [0.0, 0.0, 0.0]))
            move = [float(v) for v in list(raw_move)[:3]] + [0.0] * (3 - len(raw_move))
            interact = int(action.get("interact", 0))
            aide = int(action.get("aide", -1))
        elif hasattr(action, "__len__") and not isinstance(action, (str, bytes)):
            vals = [float(v) for v in list(action)]
            if len(vals) >= 4:
                move = vals[:3]
                interact = int(math.floor(vals[3]))
            else:
                move = vals[:3] + [0.0] * (3 - len(vals))
            if len(vals) >= 5:
                aide = int(math.floor(vals[4]))
        interact = max(0, min(3, interact))
        return move, interact, aide

    def _apply_avatar_action(self, move: Sequence[float], interact: int) -> bool:
        if self.interface.is_busy():
            return False  # mid-intent: action is dropped, not queued
        if interact > 0:
            return self._interact_with(interact)
        dx, dy = float(move[0]), float(move[1])
        mag2 = dx * dx + dy * dy
        if mag2 < 1e-8:
            return False
        mag = min(1.0, math.sqrt(mag2))
        ux, uy = dx / math.sqrt(mag2), dy / math.sqrt(mag2)
        steps = max(1, int(round(mag * self.move_radius)))
        x, y = self.interface.position()
        tx = max(0, min(self._grid_w - 1, int(round(x + ux * steps))))
        ty = max(0, min(self._grid_h - 1, int(round(y + uy * steps))))
        return self.interface.move_to(tx, ty)

    def _interact_with(self, k: int) -> bool:
        perception = self.interface.perceive(self.vision_radius)
        targets = [d for d in perception.describe_surroundings()
                   if d.get("affordances") and not d.get("in_use")]
        if not targets:
            return False
        target = targets[min(k - 1, len(targets) - 1)]
        entity_id = target["entity_id"]
        my_x, my_y = self.interface.position()
        pos = target.get("position")
        if pos and max(abs(my_x - pos[0]), abs(my_y - pos[1])) <= 1:
            return self.interface.use(entity_id, target["affordances"][0])
        return self.interface.move_adjacent_to(entity_id)

    # --- gym API -----------------------------------------------------------

    def reset(self, seed: Optional[int] = None,
              options: Optional[Dict[str, Any]] = None):
        if seed is not None:
            self._next_seed = int(seed)
        episode_seed = self._next_seed
        self._next_seed = episode_seed + 1

        self._build(episode_seed)
        self.cognitive = CognitiveState()
        self._sync_to_agent_state(self.cognitive)
        self._prev_pos = self.interface.position()
        self.steps = 0
        self._done = False
        self._scenario_completed = False
        self._last_events = []
        info = {"seed": episode_seed, "scenario_id": self.scenario_id}
        return self._observation(self.cognitive), info

    def step(self, action: Any):
        if self._done:
            raise RuntimeError("step() called on a finished episode; call reset()")

        move, interact, aide = self._split_action(action)

        # 1. cognitive dynamics (UE parity) + optional Aide coaching
        self.cognitive.decay(self.cognitive_seconds_per_step)
        if aide >= 0:
            self.cognitive.apply_coaching(aide)
        self._sync_to_agent_state(self.cognitive)

        # 2. submit the Avatar intent, then advance the world one tick
        acted = self._apply_avatar_action(move, interact)
        before = self.interface.position()
        self.runner.step_once()

        # 3. absorb kernel-side changes, then score the resulting state
        self._sync_from_agent_state(self.cognitive)
        self._update_success_rate(self.cognitive)
        after = self.interface.position()
        self._prev_pos = before
        self.steps += 1

        reward = self.cognitive.reward()
        terminated = False
        truncated = False
        reason = "running"
        if self._scenario_completed:
            terminated, reason = True, "scenario_completed"
        elif self.cognitive.succeeded:
            terminated, reason = True, "independence"
        elif self.cognitive.failed:
            terminated, reason = True, "burnout"
        elif self.steps >= self.max_steps:
            truncated, reason = True, "max_steps"
        self._done = terminated or truncated

        info = {
            "seed": self._next_seed - 1,
            "tick": self.engine.tick_count,
            "steps": self.steps,
            "acted": acted,
            "reason": reason,
            "position": list(after),
            "moved": list(after) != list(before),
            "events": [evt.get("event_type") for evt in self._last_events],
            "cognitive": self.cognitive.observation(),
            "objective": self.scenario_system.current_objective(_AVATAR_ID),
        }
        return self._observation(self.cognitive), reward, terminated, truncated, info


def make_env(**kwargs: Any):
    """Factory for vectorized wrappers (SB3 `DummyVecEnv`/`SubprocVecEnv`)."""
    def _thunk() -> WorldEnv:
        return WorldEnv(**kwargs)
    return _thunk


__all__ = [
    "WorldEnv", "make_env", "build_training_world",
    "OBSERVATION_DIM", "INDEPENDENCE_SUCCESS_THRESHOLD",
    "BURNOUT_FAILURE_THRESHOLD", "_AIDE_OBSERVATION_DIM",
]
