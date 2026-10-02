# Developer Onboarding Checklist

> Follow this in order. Each step takes 2–10 minutes. Check it off as you go.

## Prerequisites

- [ ] **UE5.8** installed at `~/Documents/NLT/Engine/` (Linux)
- [ ] **Python 3.11+** available (`python3 --version`)
- [ ] **PyTorch** installed (`python3 -c "import torch; print(torch.__version__)"`)
- [ ] **TensorBoard** available (`python3 -m tensorboard --version`)
- [ ] **Learning Agents plugin** enabled in `WorldEngine/WorldEngine.uproject`
- [ ] **Governance read** — `NLT-DEV-OTOI.md` + `AGENTS.md` + this checklist

---

## Step 1: Governance & Environment

```bash
# 1. Clone the repo
git clone https://github.com/NeuroLift-Technologies/nlt-world-engine.git
cd nlt-world-engine

# 2. Run governance validation
bash .nltotoi/scripts/validate-governance.sh
# Expected: 29 passed, 0 failed, 0 warned
```

- [ ] Governance validation passes

---

## Step 2: UE5 Build

```bash
# 3. Build the UE5 project
cd WorldEngine
make WorldEngineEditor
# Expected: "Succeeded" (85s on warm cache, ~3min cold)
make WorldEngine
# Expected: "Succeeded" (22s on warm cache)
```

- [ ] `make WorldEngineEditor` succeeds
- [ ] `make WorldEngine` succeeds

---

## Step 3: Python Engine (read-only demo, archived prototype)

```bash
# 4. Run the Python demo (no UE needed)
cd _archive/world-engine
python3 demo.py
# Expected: Prints "Day complete" + avatar stats
```

- [ ] `python3 demo.py` runs successfully

> **Note:** The Python ECS engine is a reference implementation, not the authoritative simulation. The authoritative runtime is `WorldEngine/` (UE 5.8 C++).

---

## Step 4: Babylon.js Viewer (archived prototype)

```bash
# 5. Start the Babylon.js viewer (not wired to UE yet)
cd _archive/world-engine-v2
npm install
npm run dev
# Expected: http://localhost:5173
```

- [ ] Viewer starts on port 5173

> **Note:** The Babylon.js viewer is a prototype spectator shell. The authoritative simulation is `WorldEngine/` (UE 5.8 C++).

---

## Step 5: Training (the ML part)

```bash
# 10. Build the training binaries (already done in Step 2)

# 11. Launch UE5 in headless training mode
cd WorldEngine
~/Documents/NLT/Engine/Binaries/Linux/UnrealEditor \
  WorldEngine.uproject \
  -nullrhi -game -server -log \
  -MAP=/Game/Scenarios/Levels/Workplace_Level.Workplace_Level

# 12. Check the log for:
grep "NLTTrainingManager" Saved/Logs/WorldEngine.log
# Expected: "NLTTrainingManager: LA components initialized"
```

- [ ] UE5 headless training mode launches cleanly
- [ ] `NLTTrainingManager` initializes without errors

# 13. Monitor TensorBoard
python3 -m tensorboard --logdir=D:/nlt-repos/nlt-world-engine/WorldEngine/Saved/LearningAgents/TensorBoard/ --port 6006 &
# Open http://localhost:6006 → look for "Loss/AvatarPolicy", "Reward/AvatarMean", "Independence/AvatarMean"

---

## Step 7: Writing Code

Before you commit anything:

```bash
# 14. Validate governance
bash .nltotoi/scripts/validate-governance.sh
```

- [ ] Governance validation: passes

---

## Troubleshooting Quick Reference

| Problem | Fix |
|---------|-----|
| `make: command not found` | Install `make` via package manager |
| `UnrealEditor not found` | Check `~/Documents/NLT/Engine/Binaries/Linux/` |
| `Module LearningAgents not found` | Enable plugin in `WorldEngine.uproject` |
| UE build fails on Niagara | Ensure `Niagara` plugin is enabled in `.uproject` |
| Port 8765 already in use | `kill $(lsof -t -i:8765)` \| or use a different port |
| Python imports fail (archived demo) | `pip install -r _archive/world-engine/requirements.txt` |

---

## Questions?

- **Scope questions** → escalate to Joshua (see `templates/escalation.md`)
- **Code questions** → read `docs/neurodivergent-guide.md`
- **Training issues** → read `docs/training/README.md`
- **Emergency** → file an issue with `ISSUE_TEMPLATE/agent-escalation.md`
