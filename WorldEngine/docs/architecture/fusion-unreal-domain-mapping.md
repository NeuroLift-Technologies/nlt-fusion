# Fusion ↔ Unreal Domain Mapping

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

---

**Date:** 2026-09-05  
**Agent:** Hermes  
**Handoff source:** GPT-5.6 Luna Technical Handoff (2026-09-01)  
**Depends on:** `unreal-architecture-assessment.md`, `unreal-simulation-architecture.md`

---

## 1. Core Principle

```
Fusion owns semantic reality. Unreal owns physical reality.
```

Fusion concepts map to Unreal fragments/components. Unreal never writes cognitive state — it mirrors and executes physical representation.

---

## 2. Agent Types → Fragments

### 2.1 Avatar

| Fusion Concept | Unreal Representation | Location |
|----------------|----------------------|----------|
| Avatar identity | `FNLTAgentIdentityFragment` (Role = Avatar) | Agents/ |
| Avatar traits | `FNLTAgentCognitiveFragment` + `LTCognitiveStateComponent` | Agents/ |
| Avatar needs | `FNLTAgentNeedsFragment` | Agents/ |
| Avatar intent | `FNLTAgentIntentFragment` | Agents/ |
| Avatar behavior | `FNLTAgentBehaviorFragment` | Agents/ |
| Physical body | `AvatarCharacter` (ACharacter, LOD 0) | Agents/ |
| AI control | `AvatarAIController` (AAIController) | Agents/ |
| Aide pairing | `NLTAideInteractor` | Agents/ |
| World interaction | `NLTAvatarInteractor` | Agents/ |

### 2.2 Aide

| Fusion Concept | Unreal Representation | Location |
|----------------|----------------------|----------|
| Aide identity | `FNLTAgentIdentityFragment` (Role = Aide) | Agents/ |
| Aide cognitive state | `FNLTAgentCognitiveFragment` | Agents/ |
| Aide needs | `FNLTAgentNeedsFragment` | Agents/ |
| Aide intent | `FNLTAgentIntentFragment` (Coached) | Agents/ |
| Coaching behavior | `NLTAideInteractor` | Agents/ |
| Physical body | LOD 1/2 Mass entity (no actor) | Mass simulation |

### 2.3 Advocate

| Fusion Concept | Unreal Representation | Location |
|----------------|----------------------|----------|
| Advocate identity | `FNLTAgentIdentityFragment` (Role = Advocate) | Agents/ |
| Advocate state | `FNLTAgentCognitiveFragment` | Agents/ |
| Advocate intent | `FNLTAgentIntentFragment` | Agents/ |
| Physical body | LOD 2/3 Mass entity (no actor) | Mass simulation |

### 2.4 Role Enum

```cpp
// NLTFusionCore.h
UENUM(BlueprintType)
enum class ENLTAgentRole : uint8
{
    None        UMETA(DisplayName = "None"),
    Avatar      UMETA(DisplayName = "Avatar"),
    Aide        UMETA(DisplayName = "Aide"),
    Advocate    UMETA(DisplayName = "Advocate")
};
```

---

## 3. Traits → Cognitive Fragments

### 3.1 Fusion Traits (26-dim ADHD profile)

The fusion runtime stores Avatar traits as Python objects in `src/avatars/`. The 26 dimensions include: attention, hyperfocus, impulsivity, emotional dysregulation, working memory, time perception, task initiation, prioritization, boredom tolerance, stress response, recovery rate, independence, social preference, stimulation seeking, inhibition, cognitive flexibility, planning, organization, self-monitoring, activation, emotional intensity, novelty seeking, reward sensitivity, persistence, energy, and mood.

### 3.2 Unreal Mapping

| Fusion Trait | Unreal Field | Location |
|--------------|-------------|----------|
| All 26 traits | Stored in Fusion runtime, mirrored via `FNLTAgentCognitiveFragment` | Fusion → Unreal sync |
| CognitiveLoad | `FNLTAgentCognitiveFragment.CognitiveLoad` (float 0-1) | Agents/ |
| Stress | `FNLTAgentCognitiveFragment.Stress` (float 0-1) | Agents/ |
| Burnout | `FNLTAgentCognitiveFragment.Burnout` (float 0-1) | Agents/ |
| Focus | `FNLTAgentCognitiveFragment.Focus` (float 0-1) | Agents/ |
| Independence | `FNLTAgentCognitiveFragment.Independence` (float 0-1) | Agents/ |
| FusionReady | `FNLTAgentCognitiveFragment.FusionReady` (float 0-1) | Agents/ |
| SuccessRate | `FNLTAgentCognitiveFragment.SuccessRate` (float 0-1) | Agents/ |
| Emotional state | `FNLTAgentCognitiveFragment.EmotionalState` (FName) | Agents/ |

**Sync direction:** Fusion → Unreal only. Unreal mirrors; Fusion is source of truth. Trait updates arrive via WebSocket from Fusion runtime, applied through `NLTAvatarInteractor`.

---

## 4. Intent → State Machine

### 4.1 Fusion Intent States

```
idle → working → drifting → hyperfocus → overwhelmed → coached → idle
                  ↑                          |
                  └──────── overwhelmed ←────┘
```

### 4.2 Unreal Mapping

| Fusion Intent | Unreal Representation | Location |
|---------------|----------------------|----------|
| Intent enum | `ENLTAgentIntent` | NLTFusionCore.h |
| Current intent | `FNLTAgentIntentFragment.Intent` | Agents/ |
| Intent priority | `FNLTAgentIntentFragment.Priority` | Agents/ |
| Intent source tick | `FNLTAgentIntentFragment.SourceTick` | Agents/ |
| Target location | `FNLTAgentIntentFragment.TargetLocation` | Agents/ |
| Target tag | `FNLTAgentIntentFragment.TargetTag` | Agents/ |
| Behavior execution | `FNLTAgentBehaviorFragment` | Agents/ |

### 4.3 Intent Enum

```cpp
UENUM(BlueprintType)
enum class ENLTAgentIntent : uint8
{
    None            UMETA(DisplayName = "None"),
    Idle            UMETA(DisplayName = "Idle"),
    FindQuietPlace  UMETA(DisplayName = "FindQuietPlace"),
    Work            UMETA(DisplayName = "Work"),
    Socialize       UMETA(DisplayName = "Socialize"),
    Rest            UMETA(DisplayName = "Rest"),
    Study           UMETA(DisplayName = "Study"),
    MoveToLocation  UMETA(DisplayName = "MoveToLocation"),
    Interact        UMETA(DisplayName = "Interact"),
    Coached         UMETA(DisplayName = "Coached"),
    Overwhelmed     UMETA(DisplayName = "Overwhelmed"),
    Drifting        UMETA(DisplayName = "Drifting"),
    Hyperfocus      UMETA(DisplayName = "Hyperfocus")
};
```

### 4.4 Intent → Event Mapping

| Intent Transition | Event Raised |
|-------------------|-------------|
| Any → Idle | IntentChanged (Idle) |
| Idle → Work | IntentChanged (Work) |
| Work → Drifting | IntentChanged (Drifting) |
| Drifting → Hyperfocus | IntentChanged (Hyperfocus) |
| Hyperfocus → Overwhelmed | IntentChanged (Overwhelmed) + StressSpike |
| Overwhelmed → Coached | IntentChanged (Coached) + CoachingIntervention |
| Coached → Idle | IntentChanged (Idle) |
| Any → Rest | IntentChanged (Rest) + NeedChanged (Rest) |

---

## 5. Needs → Need Fragments

### 5.1 Fusion Needs

Fusion computes needs from cognitive state:
- Quiet (low stimulation)
- Rest (burnout recovery)
- Social (low independence, high interaction)
- Stimulation (high boredom, low focus)
- Food (basic need)
- Movement (physical activity)
- Privacy (high stress, low social)

### 5.2 Unreal Mapping

| Fusion Need | Unreal Representation | Location |
|-------------|----------------------|----------|
| Primary need | `FNLTAgentNeedsFragment.PrimaryNeed` | Agents/ |
| Secondary need | `FNLTAgentNeedsFragment.SecondaryNeed` | Agents/ |
| Urgency | `FNLTAgentNeedsFragment.Urgency` (float 0-1) | Agents/ |
| Need threshold | `NLTFusion::NeedThreshold` (0.7f) | NLTFusionCore.h |

### 5.3 Need Enum

```cpp
UENUM(BlueprintType)
enum class ENLTAgentNeed : uint8
{
    None        UMETA(DisplayName = "None"),
    Quiet       UMETA(DisplayName = "Quiet"),
    Rest        UMETA(DisplayName = "Rest"),
    Social      UMETA(DisplayName = "Social"),
    Stimulation UMETA(DisplayName = "Stimulation"),
    Food        UMETA(DisplayName = "Food"),
    Movement    UMETA(DisplayName = "Movement"),
    Privacy     UMETA(DisplayName = "Privacy")
};
```

### 5.4 Need → Smart Object Mapping

| Need | Smart Object Tag | Behavior |
|------|-----------------|----------|
| Quiet | `QuietZone` | Move to low-noise room |
| Rest | `RestSpot` | Sit, recover burnout |
| Social | `SocialSpot` | Interact with other agents |
| Stimulation | `ActivityNode` | Engage in task |
| Food | `KitchenNode` | Eat |
| Movement | `WalkPath` | Walk route |
| Privacy | `PrivateRoom` | Isolate |

---

## 6. Governance → Fragments (Planned)

### 6.1 Current State

`NLTGovernanceSubsystem` is **planned, not implemented**. See `unreal-architecture-assessment.md` Q7.

### 6.2 Planned Mapping

| Fusion Governance | Unreal Representation | Status |
|-------------------|----------------------|--------|
| TOI constraints | `FNLTAgentGovernanceFragment` | ⬜ Planned |
| OTOI compliance | `UNLTGovernanceSubsystem` | ⬜ Planned |
| ASFDK boundary | `ICognitionProvider` → ASFDK | ⬜ Planned |
| Agent card | `FNLTAgentIdentityFragment` + governance metadata | ⬜ Planned |

---

## 7. World State → Unreal World

### 7.1 Fusion World State

Fusion maintains: room occupancy, scenario progression, pair bonding status, session state, training metrics.

### 7.2 Unreal Mapping

| Fusion World State | Unreal Representation | Location |
|--------------------|----------------------|----------|
| Room occupancy | `NLTRoomStateSubsystem` | Simulation/ |
| World cells | `FNLTAgentLocationFragment.WorldCell` | Agents/ |
| Environment variation | `NLTEnvironmentVariation` | World/ |
| Scenario data | `UScenarioDataAsset` + `NLTScenarioManagerSubsystem` | Scenarios/ |
| Smart object availability | `NLTSmartObjectWorldSubsystem` | World/ |
| Time of day | `NLTAtmosphereSubsystem` | Simulation/ |
| World generation | `NLTWorldGenerator` | World/ |

---

## 8. Memory → Persistence

### 8.1 Fusion Memory

Fusion stores agent memory, interaction history, coaching records, training results in Python objects + DO state.

### 8.2 Unreal Mapping

| Fusion Memory | Unreal Representation | Location |
|---------------|----------------------|----------|
| Agent memory | EventBus ring buffer (256 events) + external event log | Core/ |
| Interaction history | `FNLTSavedGame.ActiveEvents[]` | Persistence/ |
| Coaching records | `FNLTAgentBehaviorFragment.CoachingCount` | Agents/ |
| Training results | `NLTEpisodeManager` + `NLTTrainingManager` | Agents/ |
| Replay | `ESimulationMode::Replay` + deterministic seed | Core/ |

---

## 9. Relationships → Event Bus

| Fusion Relationship | Unreal Representation |
|--------------------|----------------------|
| Avatar↔Aide bond | `NLTAideInteractor` events |
| Avatar↔Avatar social | `SocialInteraction` events |
| Avatar↔Advocate monitoring | `Breakthrough` / `StressSpike` events |
| Pair fusion status | `FusionStart` / `FusionComplete` / `FusionFail` events |
| Aide coaching | `Coached` intent + `NeedChanged` events |

---

## 10. Summary Table

| Fusion Domain | Primary Unreal Fragment | Subsystem | Status |
|---------------|------------------------|-----------|--------|
| Agent Identity | `FNLTAgentIdentityFragment` | Core | ✅ Implemented |
| Agent Role | `ENLTAgentRole` enum | Core | ✅ Implemented |
| Cognitive State | `FNLTAgentCognitiveFragment` | Agents | ✅ Implemented |
| Needs | `FNLTAgentNeedsFragment` | Agents | ✅ Implemented |
| Intent | `FNLTAgentIntentFragment` | Agents | ✅ Implemented |
| Behavior | `FNLTAgentBehaviorFragment` | Agents | ✅ Implemented |
| Location | `FNLTAgentLocationFragment` | Agents | ✅ Implemented |
| World State | `NLTRoomStateSubsystem` | Simulation | ✅ Implemented |
| Event Bus | `UNLTEventBus` | Core | ✅ Implemented |
| Persistence | `UNLTPersistenceSubsystem` | Persistence | ✅ Implemented |
| Scenarios | `UScenarioDataAsset` + Manager | Scenarios | ✅ Implemented |
| Atmosphere | `NLTAtmosphereSubsystem` | Simulation | ✅ Implemented |
| Smart Objects | `NLTSmartObjectWorldSubsystem` | World | ✅ Implemented |
| Population Scaling | `NLTPopulationScaler` | Scaling | ✅ Implemented |
| Training | `NLTTrainingManager` + Environment | Agents | ✅ Implemented |
| Governance | `NLTGovernanceSubsystem` | — | ⬜ Planned |
| WebSocket Protocol | `NLTWebServerSubsystem` | Web | ⬜ In progress |
| Replay Verification | Deterministic seed + event log | — | ⬜ Not started |
| Cross-Level Nav | NavMesh between levels | — | ⬜ Partial |

---

## 11. Unresolved Mappings

| # | Fusion Concept | Unreal Status | Notes |
|---|---------------|---------------|-------|
| 1 | Advocate behavior | No Actor | Mass entity only — needs LOD 0 representation for demos |
| 2 | 26-dim ADHD traits | Mirrored, not stored in UE | Full trait data lives in Fusion; UE stores derived cognitive metrics |
| 3 | Fusion progress (0→100%) | `FusionReady` float in cognitive fragment | Threshold-based, not a separate fragment |
| 4 | Aide coaching strategies | `NLTAideInteractor` logic | Implemented as tick-based intervention, not Behavior Tree |
| 5 | Memory beyond 256 events | External event log + Fusion DO | UE ring buffer is short-term only |