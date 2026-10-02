"""
Scenario Definitions

Pre-defined scenarios for training Avatars in realistic situations.
Each scenario presents specific challenges and measures performance.
"""

from typing import Dict, List, Any
from enum import Enum
from dataclasses import dataclass
from datetime import timedelta


class ScenarioCategory(Enum):
    """Categories of training scenarios"""
    WORKPLACE = "workplace"
    PERSONAL = "personal"
    SOCIAL = "social"
    ACADEMIC = "academic"


@dataclass
class Scenario:
    """Base scenario definition"""
    scenario_id: str
    name: str
    description: str
    category: ScenarioCategory
    task_type: str
    expected_duration: timedelta
    complexity: str
    aversiveness: float
    requires_sustained_focus: bool
    cognitive_demand: float
    base_success_rate: float
    context: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "scenario_id": self.scenario_id,
            "name": self.name,
            "description": self.description,
            "category": self.category.value,
            "task_type": self.task_type,
            "expected_duration": self.expected_duration.total_seconds(),
            "complexity": self.complexity,
            "aversiveness": self.aversiveness,
            "requires_sustained_focus": self.requires_sustained_focus,
            "cognitive_demand": self.cognitive_demand,
            "base_success_rate": self.base_success_rate,
            "context": self.context
        }


class ScenarioLibrary:
    """Library of pre-defined training scenarios"""

    @staticmethod
    def get_workplace_scenarios() -> List[Scenario]:
        """Workplace scenarios for professional environments"""
        return [
            Scenario(
                scenario_id="wp_1",
                name="Email Processing",
                description="Process and respond to 20 emails",
                category=ScenarioCategory.WORKPLACE,
                task_type="email_processing",
                expected_duration=timedelta(minutes=30),
                complexity="medium",
                aversiveness=0.4,
                requires_sustained_focus=True,
                cognitive_demand=0.5,
                base_success_rate=0.7,
                context={
                    "email_count": 20,
                    "priority_emails": 5,
                    "interruptions": True,
                    "deadline_pressure": False
                }
            ),
            Scenario(
                scenario_id="wp_2",
                name="Report Writing",
                description="Write a comprehensive project report (2000 words)",
                category=ScenarioCategory.WORKPLACE,
                task_type="report_writing",
                expected_duration=timedelta(minutes=90),
                complexity="high",
                aversiveness=0.6,
                requires_sustained_focus=True,
                cognitive_demand=0.8,
                base_success_rate=0.5,
                context={
                    "word_count": 2000,
                    "research_required": True,
                    "deadline_pressure": True,
                    "interruptions": False
                }
            ),
            Scenario(
                scenario_id="wp_3",
                name="Meeting Participation",
                description="Participate actively in 1-hour team meeting",
                category=ScenarioCategory.WORKPLACE,
                task_type="meeting",
                expected_duration=timedelta(minutes=60),
                complexity="medium",
                aversiveness=0.3,
                requires_sustained_focus=True,
                cognitive_demand=0.6,
                base_success_rate=0.6,
                context={
                    "participants": 8,
                    "social_elements": True,
                    "structured_agenda": True,
                    "note_taking": True
                }
            ),
            Scenario(
                scenario_id="wp_4",
                name="Code Review",
                description="Review and provide feedback on 500 lines of code",
                category=ScenarioCategory.WORKPLACE,
                task_type="code_review",
                expected_duration=timedelta(minutes=45),
                complexity="high",
                aversiveness=0.4,
                requires_sustained_focus=True,
                cognitive_demand=0.85,
                base_success_rate=0.6,
                context={
                    "lines_of_code": 500,
                    "complexity": "medium",
                    "time_limit": True,
                    "interactive": False
                }
            ),
            Scenario(
                scenario_id="wp_5",
                name="Deadline Crunch",
                description="Complete urgent task under pressure before end of day",
                category=ScenarioCategory.WORKPLACE,
                task_type="urgent_task",
                expected_duration=timedelta(minutes=120),
                complexity="high",
                aversiveness=0.8,
                requires_sustained_focus=True,
                cognitive_demand=0.9,
                base_success_rate=0.4,
                context={
                    "urgency": "critical",
                    "pressure": "high",
                    "interruptions": True,
                    "multiple_dependencies": True
                }
            )
        ]

    @staticmethod
    def get_personal_scenarios() -> List[Scenario]:
        """Personal life scenarios"""
        return [
            Scenario(
                scenario_id="pers_1",
                name="Household Cleaning",
                description="Clean and organize bedroom (1-2 hours)",
                category=ScenarioCategory.PERSONAL,
                task_type="cleaning",
                expected_duration=timedelta(minutes=120),
                complexity="medium",
                aversiveness=0.7,
                requires_sustained_focus=False,
                cognitive_demand=0.3,
                base_success_rate=0.5,
                context={
                    "room_size": "medium",
                    "organization_needed": True,
                    "motivation_challenge": True
                }
            ),
            Scenario(
                scenario_id="pers_2",
                name="Grocery Shopping",
                description="Plan, shop, and prepare dinner",
                category=ScenarioCategory.PERSONAL,
                task_type="shopping_cooking",
                expected_duration=timedelta(minutes=90),
                complexity="medium",
                aversiveness=0.5,
                requires_sustained_focus=False,
                cognitive_demand=0.6,
                base_success_rate=0.6,
                context={
                    "meal_complexity": "medium",
                    "ingredients": 8,
                    "shopping_needed": True
                }
            ),
            Scenario(
                scenario_id="pers_3",
                name="Bill Paying",
                description="Review bills and pay monthly expenses",
                category=ScenarioCategory.PERSONAL,
                task_type="bill_payment",
                expected_duration=timedelta(minutes=45),
                complexity="low",
                aversiveness=0.8,
                requires_sustained_focus=True,
                cognitive_demand=0.7,
                base_success_rate=0.5,
                context={
                    "bills_count": 8,
                    "complexity": "routine",
                    "avoidance_tendency": True
                }
            ),
            Scenario(
                scenario_id="pers_4",
                name="Morning Routine",
                description="Complete full morning routine before 8 AM",
                category=ScenarioCategory.PERSONAL,
                task_type="morning_routine",
                expected_duration=timedelta(minutes=60),
                complexity="medium",
                aversiveness=0.4,
                requires_sustained_focus=False,
                cognitive_demand=0.4,
                base_success_rate=0.5,
                context={
                    "components": ["shower", "breakfast", "getting_ready"],
                    "time_limit": True,
                    "motivation": "moderate"
                }
            )
        ]

    @staticmethod
    def get_social_scenarios() -> List[Scenario]:
        """Social interaction scenarios"""
        return [
            Scenario(
                scenario_id="soc_1",
                name="Phone Conversation",
                description="Make and complete important phone call",
                category=ScenarioCategory.SOCIAL,
                task_type="phone_call",
                expected_duration=timedelta(minutes=15),
                complexity="medium",
                aversiveness=0.6,
                requires_sustained_focus=True,
                cognitive_demand=0.5,
                base_success_rate=0.6,
                context={
                    "caller": "unknown",
                    "duration": 15,
                    "urgency": "normal",
                    "anxiety_level": 0.6
                }
            ),
            Scenario(
                scenario_id="soc_2",
                name="Social Event",
                description="Attend and participate in social gathering",
                category=ScenarioCategory.SOCIAL,
                task_type="social_event",
                expected_duration=timedelta(minutes=120),
                complexity="high",
                aversiveness=0.7,
                requires_sustained_focus=False,
                cognitive_demand=0.8,
                base_success_rate=0.5,
                context={
                    "group_size": "large",
                    "structured": False,
                    "anxiety_level": 0.7
                }
            )
        ]

    @staticmethod
    def get_academic_scenarios() -> List[Scenario]:
        """Academic/learning scenarios"""
        return [
            Scenario(
                scenario_id="acad_1",
                name="Study Session",
                description="Study for exam (2 hours focused study)",
                category=ScenarioCategory.ACADEMIC,
                task_type="studying",
                expected_duration=timedelta(minutes=120),
                complexity="high",
                aversiveness=0.5,
                requires_sustained_focus=True,
                cognitive_demand=0.8,
                base_success_rate=0.5,
                context={
                    "material_volume": "large",
                    "difficulty": "high",
                    "deadline": 5
                }
            ),
            Scenario(
                scenario_id="acad_2",
                name="Project Work",
                description="Work on long-term project milestone",
                category=ScenarioCategory.ACADEMIC,
                task_type="project_work",
                expected_duration=timedelta(minutes=180),
                complexity="high",
                aversiveness=0.6,
                requires_sustained_focus=True,
                cognitive_demand=0.9,
                base_success_rate=0.4,
                context={
                    "project_phase": "mid",
                    "deadline_days": 7,
                    "dependencies": True
                }
            )
        ]

    @staticmethod
    def get_scenario_by_id(scenario_id: str) -> Scenario:
        """Retrieve a specific scenario by ID"""
        all_scenarios = (
            ScenarioLibrary.get_workplace_scenarios() +
            ScenarioLibrary.get_personal_scenarios() +
            ScenarioLibrary.get_social_scenarios() +
            ScenarioLibrary.get_academic_scenarios()
        )

        for scenario in all_scenarios:
            if scenario.scenario_id == scenario_id:
                return scenario

        raise ValueError(f"Scenario {scenario_id} not found")

    @staticmethod
    def get_scenarios_by_category(category: ScenarioCategory) -> List[Scenario]:
        """Get all scenarios in a category"""
        if category == ScenarioCategory.WORKPLACE:
            return ScenarioLibrary.get_workplace_scenarios()
        elif category == ScenarioCategory.PERSONAL:
            return ScenarioLibrary.get_personal_scenarios()
        elif category == ScenarioCategory.SOCIAL:
            return ScenarioLibrary.get_social_scenarios()
        elif category == ScenarioCategory.ACADEMIC:
            return ScenarioLibrary.get_academic_scenarios()

        return []

    @staticmethod
    def get_all_scenarios() -> List[Scenario]:
        """Get all available scenarios"""
        return (
            ScenarioLibrary.get_workplace_scenarios() +
            ScenarioLibrary.get_personal_scenarios() +
            ScenarioLibrary.get_social_scenarios() +
            ScenarioLibrary.get_academic_scenarios()
        )
