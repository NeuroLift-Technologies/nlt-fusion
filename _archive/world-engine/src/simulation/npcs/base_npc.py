"""
Base NPC (Non-Player Character)

NPCs populate simulation environments and create realistic social
dynamics.  They react to the Avatar's behaviour, apply social
consequences, and generate the environmental pressure that makes
experiential learning authentic.

Examples: a boss who notices missed deadlines, a friend who gets
frustrated by forgotten plans, a coworker who offers unexpected help.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Dict, List, Optional
from datetime import datetime
import uuid


class NPCDisposition(Enum):
    """NPC's current attitude toward the Avatar."""
    SUPPORTIVE = auto()
    NEUTRAL = auto()
    IMPATIENT = auto()
    FRUSTRATED = auto()
    UNDERSTANDING = auto()


@dataclass
class NPCReaction:
    """An NPC's reaction to an Avatar action or event."""
    npc_id: str = ""
    npc_name: str = ""
    reaction_type: str = ""  # "verbal", "behavioral", "consequence"
    disposition: NPCDisposition = NPCDisposition.NEUTRAL
    message: str = ""
    emotional_impact_on_avatar: float = 0.0  # -1.0 (negative) to 1.0 (positive)
    stress_impact: float = 0.0  # how much stress this adds/removes
    consequence: Optional[Dict[str, Any]] = None
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "npc_id": self.npc_id,
            "npc_name": self.npc_name,
            "reaction_type": self.reaction_type,
            "disposition": self.disposition.name,
            "message": self.message,
            "emotional_impact_on_avatar": self.emotional_impact_on_avatar,
            "stress_impact": self.stress_impact,
            "consequence": self.consequence,
            "timestamp": self.timestamp.isoformat(),
        }


class BaseNPC(ABC):
    """
    Base class for all simulation NPCs.

    Subclasses define specific personalities (supportive manager,
    impatient coworker, understanding friend) and reaction logic.
    """

    def __init__(
        self,
        npc_id: Optional[str] = None,
        name: str = "NPC",
        role: str = "bystander",
        config: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.npc_id = npc_id or str(uuid.uuid4())
        self.name = name
        self.role = role
        self.config = config or {}

        self.disposition = NPCDisposition.NEUTRAL
        self.patience: float = 0.7  # 0.0 (none) to 1.0 (infinite)
        self.relationship_score: float = 0.5  # with the Avatar
        self.interaction_history: List[NPCReaction] = []

    @abstractmethod
    def react_to_event(
        self, event_type: str, event_data: Dict[str, Any]
    ) -> NPCReaction:
        """
        Generate a reaction to a simulation event.

        Args:
            event_type: e.g. "task_failed", "task_completed", "missed_deadline"
            event_data: Context about the event.

        Returns:
            An NPCReaction describing what the NPC does/says.
        """

    def update_disposition(self, avatar_action: str) -> None:
        """
        Adjust disposition based on the Avatar's recent behaviour.

        Positive actions (completing tasks, being on time) improve the
        relationship; negative actions (missing deadlines, forgetting)
        reduce patience and worsen disposition.
        """
        positive = {"task_completed", "on_time", "communicated_delay", "asked_for_help"}
        negative = {"task_failed", "missed_deadline", "forgot", "no_show"}

        if avatar_action in positive:
            self.patience = min(1.0, self.patience + 0.05)
            self.relationship_score = min(1.0, self.relationship_score + 0.05)
        elif avatar_action in negative:
            self.patience = max(0.0, self.patience - 0.1)
            self.relationship_score = max(0.0, self.relationship_score - 0.08)

        # Update disposition from patience/relationship
        if self.patience < 0.2:
            self.disposition = NPCDisposition.FRUSTRATED
        elif self.patience < 0.4:
            self.disposition = NPCDisposition.IMPATIENT
        elif self.relationship_score > 0.7:
            self.disposition = NPCDisposition.SUPPORTIVE
        elif self.relationship_score > 0.5:
            self.disposition = NPCDisposition.UNDERSTANDING
        else:
            self.disposition = NPCDisposition.NEUTRAL

    def get_summary(self) -> Dict[str, Any]:
        return {
            "npc_id": self.npc_id,
            "name": self.name,
            "role": self.role,
            "disposition": self.disposition.name,
            "patience": round(self.patience, 2),
            "relationship_score": round(self.relationship_score, 2),
            "total_interactions": len(self.interaction_history),
        }
