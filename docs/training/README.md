# Training README — PPO for Avatar/Aide Pairs

> **Status:** ✅ Complete. Training infrastructure is live in both UE5 and Python.
> `train_nlt.py` exists in `neurolift-ai-fusion/src/simulation/training/`.

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

## How Training Works

### Dual-Policy PPO

Two policies train simultaneously:

1. **Avatar Policy** — learns movement and task-initiation decisions
2. **Aide Policy** — learns when to apply which coaching strategy

They train as paired agents: each Aide observes its paired Avatar's cognitive
state and chooses one of 10 coaching strategies.

### Training Loop

Training runs on **two paths** depending on mode:

**Path A — Rendered UE5 runtime (default):** PPO training runs inside UE5 via the
Learning Agents module (`ULearningAgentsPPOTrainer`) in the UE Editor or a rendered
standalone game. The human watches the same Unreal world in which agents act and learn.
UE5 creates a shared-memory communicator (`MakeSharedMemoryTrainingProcess()`) on port
5555 that the LearningAgents trainer uses for synchronization. The Python
`train_nlt.py` can connect to this communicator for monitoring/logging.

**Path B — Python Standalone (optional tooling):** `train_nlt.py --standalone` runs
a Python-only PPO loop without UE5, using a simulated cognitive-state evolution
(`update_cognitive_state()` mirrors `LTCognitiveStateComponent`). This is not the
primary training architecture.

#### UE5 Tick Flow (`NLTTrainingManager::Tick()`):

```
every 0.1s (TickInterval):
  └─ Tick cognitive decay (stress rises, focus drops, without coaching)
    └─ LTCognitiveStateComponent::TickCognitiveDecay(DeltaTime)
  └─ Run inference (both policies act)
    └─ AvatarPolicy->RunInference() + AidePolicy->RunInference()
  └─ Avatar moves + acts (via AvatarInteractor)
  └─ Aide picks strategy → applies to Avatar (via AideInteractor)
  └─ Every 1.0s (TrainingTimer):
     └─ ULearningAgentsPPOTrainer::RunTraining()
        - Collects episode records
        - Updates policy + critic networks
        - Logs reward to TensorBoard (via communicator)
  └─ Episode ends when:
     - Independence ≥ 0.8  (Avatar learned!)
     - Burnout ≥ 0.9  (Avatar overwhelmed — fail)
     - 512 steps elapsed (truncation)
```

### PPO Settings

| Parameter | Value | Notes |
|-----------|-------|-------|
| Hidden layers | 1 × 128 | ELU activation |
| Learning rate (policy) | 1e-4 | Slow = stable |
| Learning rate (critic) | 1e-3 | Faster value learning |
| Discount factor (γ) | 0.99 | Long-term reward |
| GAE lambda | 0.95 | Smooth advantage |
| Epsilon clip | 0.2 | PPO trust region |
| Max episode steps | 512 | 51.2 seconds of sim time |
| Fixed timestep | 60 Hz | Deterministic |

### Reward Function

**Avatar reward** (in `NLTTrainingEnvironment::GatherAgentReward`):
```
reward = +1.0 × Independence
         − 1.0 × Burnout
         − 0.5 × Stress
         + 0.3 × Focus
         + 0.5 × SuccessRate
```

**Aide reward** is the same formula applied to the paired Avatar — the Aide
is rewarded when its coaching improves the Avatar's cognitive state.

### Episode Completion

In `NLTEpisodeManager::CheckCognitiveCompletion`:
- **Independence ≥ 0.8** → episode succeeds (Avatar learned to work independently)
- **Burnout ≥ 0.9** → episode fails early (too much pressure)
- **512 steps** → truncation (scenario ran to time limit)

### Neural Network Assets

Learning Agents requires pre-created assets in the Editor. These must be
created via the **Learning Agents Editor** panel:

| Asset name | Input dims | Hidden | Output dims | Role |
|------------|-----------|--------|-------------|------|
| `NN_AvatarPolicy` | 13 | 128×1 ELU | 3 cont + 4 disc | Avatar action selection |
| `NN_AvatarCritic` | 13 | 128×1 ELU | 1 | Avatar value estimate |
| `NN_AidePolicy` | 13 | 128×1 ELU | 10 discrete | Aide strategy selection |
| `NN_AideCritic` | 13 | 128×1 ELU | 1 | Aide value estimate |

Location: `WorldEngine/Saved/LearningAgents/Assets/`

### Training Modes

| Flag | Behavior |
|------|----------|
| `bRunInference = true` | Policies run every tick (Avatar/Aide act) |
| `bRunTraining = true` | PPO updates run every 1.0s via `ULearningAgentsPPOTrainer` |
| Both true | Full training: act + learn |
| Inference only | Play back trained policies (no updates) |
| `--standalone` (Python) | Run PPO in Python without UE5 |

### Python Side

The Python training orchestrator (`train_nlt.py`) in the `neurolift-ai-fusion`
repo provides:

- **Standalone PPO**: Full PyTorch PPO implementation (policy networks, critics,
  PPO update step) that mirrors the UE5 LearningAgents configuration
- **Monitoring**: Connects to UE5's shared-memory communicator (port 5555) to
  log metrics and TensorBoard scalars

1. Connect to UE5's shared-memory communicator (port 5555)
2. Receive observations (13-dim float arrays per agent)
3. Evaluate policy networks → get action probabilities
4. Sample actions → send back (3 continuous + 4 discrete for Avatar, 10 discrete for Aide)
5. Receive rewards (computed by `NLTTrainingEnvironment::GatherAgentReward`)
6. PPO update step (clip ε=0.2, λ=0.95, γ=0.99)
7. Log scalars → TensorBoard

### Running Training

**Step 1 — Build:**
```bash
cd WorldEngine && make WorldEngineEditor && make WorldEngine
```

**Step 2 — Launch the rendered UE5 training runtime:**

Open `WorldEngine.uproject` in the UE Editor, select the training scenario, and run the configured training flow in Play In Editor or a rendered standalone game. The human watches the same Unreal world in which the agents simulate and learn.

**Optional headless automation:**

```bash
~/Documents/NLT/Engine/Binaries/Linux/UnrealEditor \
  WorldEngine.uproject \
  -nullrhi -game -unattended -log \
  -MAP=/Game/Scenarios/Levels/Workplace_Level.Workplace_Level
```

A future `WorldEngineServer` is optional infrastructure for running the same UE physical world without a rendered viewport; neither headless mode is required for the primary training path.

**Step 3 — Run Python PPO training (optional, for monitoring or standalone):**
```bash
cd D:/nlt-repos/neurolift-ai-fusion/src/simulation/training
python3 train_nlt.py --port 5555 --agents 20 --iterations 500 --scenario pers_4
# Use --standalone for Python-only training (no UE5 needed)
```

**Step 4 — Monitor:**
```bash
python3 -m tensorboard --logdir=D:/nlt-repos/nlt-world-engine/WorldEngine/Saved/LearningAgents/TensorBoard/ --port 6006
```

Open http://localhost:6006 → look for:
- `Reward/Avatar` and `Reward/Aide`
- `Independence/Avatar` (should trend upward over iterations)
- `EpisodeLength` (should increase as Avatar learns)

---

## Files to Know

| File | Role |
|------|------|
| `WorldEngine/Source/WorldEngine/Public/Agents/NLTTrainingManager.h` | Orchestrator — spawns pairs, owns trainers |
| `WorldEngine/Source/WorldEngine/Private/Agents/NLTTrainingManager.cpp` | BeginPlay/Tick — sets up everything |
| `WorldEngine/Source/WorldEngine/Public/Agents/NLTAvatarInteractor.h` | 13-dim obs + 3+4 action schema |
| `WorldEngine/Source/WorldEngine/Public/Agents/NLTAideInteractor.h` | 13-dim obs + 10 strategy action schema |
| `WorldEngine/Source/WorldEngine/Public/Agents/LTCognitiveStateComponent.h` | 7-dim cognitive state, coaching effects |
| `WorldEngine/Source/WorldEngine/Public/Agents/NLTEpisodeManager.h` | Step tracking, cognitive completion check |
| `WorldEngine/Source/WorldEngine/Public/Agents/NLTTrainingEnvironment.h` | Reward + completion computation |
| `WorldEngine/Source/WorldEngine/Public/Scenarios/UScenarioDataAsset.h` | Scenario definitions (.uasset) |
| `neurolift-ai-fusion/src/simulation/training/train_nlt.py` | Python PPO training orchestrator (standalone + UE bridge) |
| `neurolift-ai-fusion/src/simulation/environment/scenarios.py` | 13 Python scenario definitions |
