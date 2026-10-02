"""
State Machine

Formal state machine with validated transitions for Avatar, Aide,
and simulation lifecycle management. Prevents invalid state transitions
and provides transition hooks for side effects.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, Type
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class InvalidTransitionError(Exception):
    """Raised when an invalid state transition is attempted."""

    def __init__(self, current_state: Enum, target_state: Enum) -> None:
        self.current_state = current_state
        self.target_state = target_state
        super().__init__(
            f"Invalid transition: {current_state.value} -> {target_state.value}"
        )


@dataclass
class StateTransition:
    """Record of a state transition."""

    from_state: Enum
    to_state: Enum
    trigger: str
    timestamp: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)


# Type alias for transition guard/callback
TransitionCallback = Callable[[Enum, Enum, Dict[str, Any]], None]
TransitionGuard = Callable[[Enum, Enum, Dict[str, Any]], bool]


class StateMachine:
    """
    Generic state machine with validated transitions.

    Defines which state transitions are legal and fires callbacks
    on transition. Used by BaseAvatar, BaseAide, and the session
    orchestrator to enforce correct lifecycle progression.

    Usage:
        sm = StateMachine(AvatarState, AvatarState.IDLE)
        sm.add_transition(AvatarState.IDLE, AvatarState.ATTEMPTING_TASK)
        sm.add_transition(AvatarState.ATTEMPTING_TASK, AvatarState.STRUGGLING)
        sm.transition_to(AvatarState.ATTEMPTING_TASK, trigger="task_start")
    """

    def __init__(self, state_enum: Type[Enum], initial_state: Enum) -> None:
        self._state_enum = state_enum
        self._current_state = initial_state
        self._transitions: Dict[Enum, Set[Enum]] = {}
        self._on_enter: Dict[Enum, List[TransitionCallback]] = {}
        self._on_exit: Dict[Enum, List[TransitionCallback]] = {}
        self._guards: Dict[Tuple[Enum, Enum], List[TransitionGuard]] = {}
        self._history: List[StateTransition] = []

    @property
    def current_state(self) -> Enum:
        return self._current_state

    @property
    def history(self) -> List[StateTransition]:
        return list(self._history)

    def add_transition(self, from_state: Enum, to_state: Enum) -> None:
        """Register a legal transition."""
        if from_state not in self._transitions:
            self._transitions[from_state] = set()
        self._transitions[from_state].add(to_state)

    def add_transitions(self, from_state: Enum, to_states: List[Enum]) -> None:
        """Register multiple legal transitions from one state."""
        for to_state in to_states:
            self.add_transition(from_state, to_state)

    def add_guard(
        self, from_state: Enum, to_state: Enum, guard: TransitionGuard
    ) -> None:
        """
        Add a guard condition for a transition.

        The guard is called with (from_state, to_state, metadata).
        If any guard returns False, the transition is blocked.
        """
        key = (from_state, to_state)
        if key not in self._guards:
            self._guards[key] = []
        self._guards[key].append(guard)

    def on_enter(self, state: Enum, callback: TransitionCallback) -> None:
        """Register a callback for when a state is entered."""
        if state not in self._on_enter:
            self._on_enter[state] = []
        self._on_enter[state].append(callback)

    def on_exit(self, state: Enum, callback: TransitionCallback) -> None:
        """Register a callback for when a state is exited."""
        if state not in self._on_exit:
            self._on_exit[state] = []
        self._on_exit[state].append(callback)

    def can_transition_to(
        self, target_state: Enum, metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Check whether a transition to target_state is currently legal."""
        allowed = self._transitions.get(self._current_state, set())
        if target_state not in allowed:
            return False
        meta = metadata or {}
        guards = self._guards.get((self._current_state, target_state), [])
        return all(g(self._current_state, target_state, meta) for g in guards)

    def transition_to(
        self,
        target_state: Enum,
        trigger: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> StateTransition:
        """
        Perform a validated state transition.

        Raises InvalidTransitionError if the transition is not allowed.
        """
        meta = metadata or {}
        allowed = self._transitions.get(self._current_state, set())

        if target_state not in allowed:
            raise InvalidTransitionError(self._current_state, target_state)

        # Check guards
        guards = self._guards.get((self._current_state, target_state), [])
        for guard in guards:
            if not guard(self._current_state, target_state, meta):
                raise InvalidTransitionError(self._current_state, target_state)

        previous = self._current_state

        # Fire on_exit callbacks
        for cb in self._on_exit.get(previous, []):
            try:
                cb(previous, target_state, meta)
            except Exception:
                logger.exception("on_exit callback failed for %s", previous.value)

        self._current_state = target_state

        # Fire on_enter callbacks
        for cb in self._on_enter.get(target_state, []):
            try:
                cb(previous, target_state, meta)
            except Exception:
                logger.exception("on_enter callback failed for %s", target_state.value)

        transition = StateTransition(
            from_state=previous,
            to_state=target_state,
            trigger=trigger,
            metadata=meta,
        )
        self._history.append(transition)
        return transition

    def get_available_transitions(self) -> Set[Enum]:
        """Get all states reachable from the current state."""
        return set(self._transitions.get(self._current_state, set()))

    def reset(self, state: Optional[Enum] = None) -> None:
        """Reset state history and optionally set the current state without firing callbacks."""
        if state is not None:
            self._current_state = state
        self._history.clear()
