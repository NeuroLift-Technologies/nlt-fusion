"""
Event Bus and Signal System

Provides decoupled communication between simulation components.
Avatars, Aides, NPCs, and the WorldEngine communicate through signals
rather than direct method calls, enabling loose coupling and
parallel execution of multiple Avatar-Aide pairs.
"""

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Callable, Dict, List, Optional
from datetime import datetime
import uuid
import logging

logger = logging.getLogger(__name__)


class SignalType(Enum):
    """All signal types in the simulation."""

    # Avatar lifecycle
    AVATAR_TASK_STARTED = auto()
    AVATAR_STRUGGLING = auto()
    AVATAR_TASK_COMPLETED = auto()
    AVATAR_TASK_FAILED = auto()
    AVATAR_STATE_CHANGED = auto()
    AVATAR_BURNOUT_WARNING = auto()
    AVATAR_BURNOUT = auto()
    AVATAR_INDEPENDENCE_MILESTONE = auto()

    # Aide lifecycle
    AIDE_OBSERVATION_STARTED = auto()
    AIDE_INTERVENTION_NEEDED = auto()
    AIDE_COACHING_DELIVERED = auto()
    AIDE_COACHING_EFFECTIVE = auto()
    AIDE_COACHING_INEFFECTIVE = auto()
    AIDE_STRATEGY_ADAPTED = auto()

    # Simulation
    SCENARIO_STARTED = auto()
    SCENARIO_STEP_COMPLETED = auto()
    SCENARIO_COMPLETED = auto()
    NPC_INTERACTION = auto()
    CONSEQUENCE_APPLIED = auto()
    ENVIRONMENT_CHANGED = auto()

    # Fusion
    FUSION_READINESS_CHECK = auto()
    FUSION_STARTED = auto()
    FUSION_COMPLETED = auto()
    FUSION_FAILED = auto()

    # Session
    SESSION_STARTED = auto()
    SESSION_PAUSED = auto()
    SESSION_RESUMED = auto()
    SESSION_COMPLETED = auto()


@dataclass
class Signal:
    """A signal emitted by a simulation component."""

    signal_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    signal_type: SignalType = SignalType.AVATAR_STATE_CHANGED
    source_id: str = ""
    source_type: str = ""  # "avatar", "aide", "npc", "scenario", "engine"
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "signal_id": self.signal_id,
            "signal_type": self.signal_type.name,
            "source_id": self.source_id,
            "source_type": self.source_type,
            "data": self.data,
            "timestamp": self.timestamp.isoformat(),
        }


# Type alias for signal handler callbacks
SignalHandler = Callable[[Signal], None]


class EventBus:
    """
    Central event bus for decoupled component communication.

    Components register handlers for signal types they care about.
    When a signal is emitted, all registered handlers are called.
    Supports scoped subscriptions (e.g., an Aide only listens to
    signals from its paired Avatar).
    """

    def __init__(self) -> None:
        self._handlers: Dict[SignalType, List[_Subscription]] = {}
        self._history: List[Signal] = []
        self._max_history: int = 10000

    def subscribe(
        self,
        signal_type: SignalType,
        handler: SignalHandler,
        source_filter: Optional[str] = None,
    ) -> str:
        """
        Subscribe to a signal type.

        Args:
            signal_type: The type of signal to listen for.
            handler: Callback function invoked when signal fires.
            source_filter: If set, only receive signals from this source_id.

        Returns:
            Subscription ID for later unsubscription.
        """
        sub = _Subscription(
            subscription_id=str(uuid.uuid4()),
            handler=handler,
            source_filter=source_filter,
        )
        if signal_type not in self._handlers:
            self._handlers[signal_type] = []
        self._handlers[signal_type].append(sub)
        return sub.subscription_id

    def unsubscribe(self, subscription_id: str) -> bool:
        """Remove a subscription by ID. Returns True if found."""
        for signal_type, subs in self._handlers.items():
            for sub in subs:
                if sub.subscription_id == subscription_id:
                    subs.remove(sub)
                    return True
        return False

    def emit(self, signal: Signal) -> int:
        """
        Emit a signal to all matching subscribers.

        Returns:
            Number of handlers that were called.
        """
        self._record_history(signal)

        handlers = self._handlers.get(signal.signal_type, [])
        called = 0
        for sub in handlers:
            if sub.source_filter and sub.source_filter != signal.source_id:
                continue
            try:
                sub.handler(signal)
            except Exception:
                logger.exception(
                    "Signal handler failed for %s from %s",
                    signal.signal_type.name,
                    signal.source_id,
                )
            called += 1
        return called

    def get_history(
        self,
        signal_type: Optional[SignalType] = None,
        source_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[Signal]:
        """Query signal history with optional filters."""
        results = self._history
        if signal_type:
            results = [s for s in results if s.signal_type == signal_type]
        if source_id:
            results = [s for s in results if s.source_id == source_id]
        return results[-limit:]

    def clear_history(self) -> None:
        self._history.clear()

    def _record_history(self, signal: Signal) -> None:
        self._history.append(signal)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]


@dataclass
class _Subscription:
    """Internal subscription record."""

    subscription_id: str
    handler: SignalHandler
    source_filter: Optional[str] = None
