"""
Core package - Foundational components for the simulation engine.

Contains:
- Event bus for state observation and communication
- State machine for entity state management
"""

from .events import EventBus, Signal, SignalType
from .state_machine import State, StateMachine

__all__ = ["EventBus", "Signal", "SignalType", "State", "StateMachine"]
