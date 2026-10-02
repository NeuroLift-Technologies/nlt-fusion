# NeuroLift World Engine — Completion Plan

> **Vision:** A real-time simulation where pairs of ML Models (Avatar + Aide) train through authentic ADHD experiences in a Sims-like world, fusing into empathetic Advocates. Designed for human observation — looks, feels, and storytelling matter as much as the training itself.

---

## Phase 1: Visual Foundation ✅ (Current)
- [x] Three.js 3D world with perspective camera
- [x] 5 rooms (office, meeting, home, phone booth, lounge)
- [x] Procedural textures (wood, carpet, tile, grass, walls)
- [x] Animated Sim characters (walk cycle, bobbing, state rings)
- [x] Day/night cycle with sun movement
- [x] Environment (trees, bushes, pathways, particles)
- [x] Click-to-inspect with needs HUD

---

## Phase 2: Character & Animation Polish
**Goal:** Characters that feel alive and expressive

### 2.1 — Character Models
- [ ] More detailed body proportions (torso, limbs, hands)
- [ ] Face with expressions (eyes that blink, mouth shapes for emotions)
- [ ] Hair styles per avatar (distinct silhouettes)
- [ ] Clothing color coding (Avatar = warm, Aide = cool, Advocate = gradient)
- [ ] Scale variation (subtle height/weight differences)

### 2.2 — Animation System ✅ IMPLEMENTED (UE WorldEngine)
- [x] **Idle animations** — breathing, looking around, fidgeting (procedural via NLTAvatarAnimInstance + NLTCharacterAnimationComponent)
- [x] **Walk cycle** — arm swing + leg swing (procedural, driven by CharacterMovementComponent velocity)
- [x] **Work animation** — typing posture, head down, hands positioned over keyboard
- [x] **Struggle animation** — head tilted, arms raised (head-in-hands pose), slumped spine
- [x] **Hyperfocus animation** — locked posture, rapid micro-tension fidgets, tense arms
- [x] **Coaching animation** — Aide right-arm gesture + forward lean; Avatar nods in response
- [x] **Celebration animation** — arms raised, body bounce (yaw oscillation)
- [x] **Transition blending** — smooth crossfade between montage states (0.2s fade), spring-interpolated procedural posture
- [x] **Emotion → animation mapping** — ENLTEmotionState → ENLTAnimationState (see NLTFusionCore.h)
- [ ] Asset-based skeletal animations (requires imported rigs + Animation Blueprints)

### 2.3 — Emotional Feedback ✅ IMPLEMENTED (UE WorldEngine)
- [x] **Facial expression changes** per state via morph targets (mouthSmile, eyeBlink, browFurrow, eyeWide) driven by ENLTFacialExpression enum
- [x] **Thought bubbles** — current emotion maps to unicode bubble glyph (working→💻, drifting→😰, hyperfocus→🎯, overwhelmed→❗, coached→✦, struggling→😣, fatigued→😴, celebrating→🎉, focused→💡, neutral→"")
- [x] **State particles** — NLTAvatarVisualComponent glow intensity scales with EmotionalIntensity; Stress/Focus auras on existing PSCs
- [x] **Posture changes** — PostureInfluence vector (LeanForward, Slump, BounceMultiplier) computed per emotion state, applied via NLTCharacterAnimationComponent procedural fallback
- [x] **Color temperature shift** — status ring color + emissive glow updated per emotion via NLTAvatarVisualComponent::UpdateFromEmotion()

---

## UE Implementation: Emotion-Animation Architecture

### Overview
The emotion-driven character animation system bridges the sim's cognitive
values (Focus, Stress, CognitiveLoad, Burnout) → emotional states → body
language, facial expressions, and social choreography. This is the Sims-style
"characters that feel alive" layer, implemented in C++ for the UE WorldEngine.

### Core Flow
```
LTCognitiveStateComponent.TickCognitiveDecay()
  → NLTEmotionStateComponent.ComputeTargetEmotion()
    → ENLTEmotionState (priority-ordered: overwhelmed → struggling → fatigued → hyperfocus → drifting → focused → working → neutral)
    → NLTEmotionStateComponent.CurrentAnimationState (ENLTAnimationState)
    → NLTAvatarAnimInstance.NativeUpdateAnimation()
      → Reads emotion state, computes procedural pose parameters
      → BlueprintReadOnly members: ProceduralSpine01Rotation, ProceduralHeadRotation,
        ProceduralLeftArmRotation, ProceduralRightArmRotation, etc.
      → UAnimInstance::SetMorphTarget() for facial blend shapes
      → OnAnimationStateChanged / OnFacialExpressionChanged (BlueprintImplementableEvent)
    → NLTCharacterAnimationComponent.TickComponent()
      → Monitors emotion state changes
      → PlayMontageForState() for SkeletalMesh path (montage crossfade, 0.2s)
      → ApplyProceduralPosture() for StaticMesh SimBody fallback (rotation + vertical bob)
    → NLTAvatarVisualComponent.UpdateFromEmotion()
      → Status ring color, emissive glow intensity
```

### Key Components (all in WorldEngine/Source/WorldEngine/)
| Component | Role |
|---|---|
| `NLTEmotionStateComponent` | Emotion state machine: cognitive values → emotional states → animation states. Exposes `CurrentEmotion`, `CurrentAnimationState`, `EmotionalIntensity`, `CurrentThoughtBubble`, `CurrentExpression`, `PostureInfluence` |
| `NLTAvatarAnimInstance` | UAnimInstance subclass: reads emotion state per frame, computes procedural pose parameters (BlueprintReadOnly), applies facial morph targets, fires Blueprint hooks |
| `NLTCharacterAnimationComponent` | Animation state machine: manages montage playback, crossfade transitions, static-mesh procedural fallback |
| `NLTPairChoreographyComponent` | Avatar↔Aide social choreography: facing, coaching mode (Aide auto-positions), synchronized reactions |
| `AvatarCharacter` | ACharacter subclass integrating all above components, supports both SkeletalMesh and StaticMesh (SimBody) rendering paths |

### Emotion → Animation State Mapping
| Emotion | Animation State | Face | Body Posture | Thought Bubble |
|---|---|---|---|---|
| Neutral | Idle | Neutral | Upright, subtle breathing | (empty) |
| Focused | Work | Focused | Forward lean, hands on keyboard | 💡 |
| Working | Work | Focused | Forward lean, hands on keyboard | 💻 |
| Struggling | Struggle | Stressed | Slumped, head tilted, arms raised | 😣 |
| Overwhelmed | Struggle | Stressed | Heavy slump, head down | ❗ |
| Hyperfocus | Hyperfocus | Focused | Locked posture, tense arms | 🎯 |
| Drifting | Drift | Sad | Side-to-side sway, unfocused gaze | 😰 |
| Coached | CoachGesture | Happy | Forward lean (Aide) / nod (Avatar) | ✦ |
| Celebrating | Celebrate | Happy | Arms raised, body bounce | 🎉 |
| Fatigued | IdleTired | Tired | Slumped, slow breathing | 😴 |

### Procedural Pose Parameters (NLTAvatarAnimInstance)
These BlueprintReadOnly parameters are computed per-frame and can be read
by an Animation Blueprint to drive bone-level posing:
- `ProceduralSpine01Rotation` / `ProceduralSpine02Rotation` — spine lean + slump + breathing
- `ProceduralHeadRotation` — head tilt, micro-nods
- `ProceduralLeftArmRotation` / `ProceduralRightArmRotation` — arm poses per animation state
- `ProceduralLeftLegRotation` / `ProceduralRightLegRotation` — leg swing for walk cycle
- `MouthSmile`, `EyeBlink`, `BrowFurrow`, `EyeWide` — facial morph target weights

### UE 5.8 API Constraints
- `USkeletalMeshComponent` does NOT expose `SetBoneRotationByName` / `SetBoneLocationByName`
  (these are on `UPoseableMeshComponent`). Bone manipulation must go through an
  Animation Blueprint or `UPoseableMeshComponent`.
- `UAnimInstance` exposes `SetMorphTarget()` for facial blend shapes — used directly.
- `UEnum::GetValueAsString()` requires `StaticEnum<T>()` which mandates full UHT
  regeneration — use `static_cast<int32>` for logging instead.
- `TObjectPtr<T>::IsValid()` does not exist in UE 5.8 — use implicit bool.
- `GetDeltaTime()` on `UAnimInstance` does not exist — cache DeltaTime from
  `NativeUpdateAnimation(float DeltaSeconds)`.

### Web Engine Cross-Reference
The web engine's `iso-world.js` (lines 240–356) implements an equivalent
7-state procedural animation state machine (idle, walking, working, struggling,
hyperfocus, coaching, celebrating). The UE implementation mirrors this mapping
with 10 animation states, adding IdleTired, Nod, and Drift for finer expressiveness.

---

## Phase 3: Environment & Atmosphere
**Goal:** A world that feels alive and immersive

### 3.1 — World Building
- [ ] **Outdoor areas** — park, garden, walking paths between buildings
- [ ] **Interior details** — windows, doors, light fixtures, wall art
- [ ] **Furniture interaction points** — chairs pull out, beds lie down, computers type
- [ ] **Ambient life** — birds, clouds, distant traffic, wind in trees
- [ ] **Weather system** — clear, cloudy, rain (with rain particles), snow
- [ ] **Seasonal variation** — leaf colors, ground coverage

### 3.2 — Lighting & Post-Processing
- [ ] **Interior lighting** — ceiling lights, desk lamps, window light shafts
- [ ] **Bloom/glow** — on screens, state rings, fusion effects
- [ ] **Ambient occlusion** — soft shadows in corners
- [ ] **Volumetric light** — sunbeams through windows
- [ ] **Tone mapping shifts** — warm interiors, cool exteriors
- [ ] **Night mode** — interior lights on, moonlight, stars

### 3.3 — Audio
- [ ] **Ambient soundscape** — birds, wind, indoor hum, keyboard clicks
- [ ] **Footstep sounds** — different per surface (grass, wood, tile)
- [ ] **UI sounds** — click, notification, achievement
- [ ] **Emotional cues** — sigh when stressed, gasp when coached, cheer on success
- [ ] **Music** — adaptive soundtrack that shifts with simulation intensity

---

## Phase 4: Simulation Depth (Training Core)
**Goal:** Pairs of ML Models that actually train, learn, and fuse

### 4.1 — Pair System
- [ ] **Avatar** — the model experiencing struggles (19 ADHD-trait variants)
- [ ] **Aide** — the coaching model with expertise strategies
- [ ] **Fusion** — when Avatar + Aide combine into an Advocate
- [ ] **Pair bonding meter** — grows through successful coaching sessions
- [ ] **Distinct visual identity** — each pair has a shared color/theme

### 4.2 — Training Scenarios
- [ ] **Workplace** — Email processing, report writing, meeting participation
- [ ] **Home** — Cooking, cleaning, budgeting, self-care
- [ ] **Social** — Conversation, boundary-setting, task switching
- [ ] **Cognitive** — Planning, prioritization, time estimation
- [ ] **Multi-step tasks** — scenarios with 3-5 sub-steps and dependencies
- [ ] **Difficulty scaling** — scenarios get harder as the pair improves
- [ ] **Random events** — interruptions, urgent requests, mood shifts

### 4.3 — Learning Progression
- [ ] **Skill tree** — focus, initiation, memory, time perception, etc.
- [ ] **Experience points** — gained through task completion and coaching
- [ ] **Level-ups** — visual celebration, new abilities unlocked
- [ ] **Setbacks** — failures reduce confidence, require recovery
- [ ] **Fusion readiness** — meter fills as skills + bond increase
- [ ] **Advocate emergence** — fusion ceremony with visual effects

### 4.4 — Aide Coaching System
- [ ] **Strategy library** — Pomodoro, chunking, anchoring, reframing, etc.
- [ ] **Intervention timing** — Aide detects struggle and offers help
- [ ] **Dialogue system** — text bubbles with coaching phrases
- [ ] **Effectiveness tracking** — some strategies work better for some traits
- [ ] **Relationship building** — trust grows, Aide learns Avatar's patterns

---

## Phase 5: Observer Experience
**Goal:** Compelling viewing for human spectators

### 5.1 — Camera System
- [ ] **Overview** — see the whole world, all pairs training
- [ ] **Follow cam** — lock onto one pair, follow their journey
- [ ] **Cinematic** — auto-directed camera that finds interesting moments
- [ ] **Free cam** — orbit, pan, zoom anywhere
- [ ] **Picture-in-picture** — main view + small pair portrait

### 5.2 — HUD & Information Display
- [ ] **Pair cards** — floating cards showing each pair's status
- [ ] **Live event feed** — scrolling log of notable events
- [ ] **Stats dashboard** — success rates, avg focus, interventions given
- [ ] **Progress timeline** — visual timeline of a pair's journey
- [ ] **Highlight reel** — auto-captured breakthrough moments

### 5.3 — Storytelling Features
- [ ] **Day summary** — end-of-day recap with key stats
- [ ] **Milestone markers** — "First successful task!", "100th intervention!"
- [ ] **Comparison view** — side-by-side pair performance
- [ ] **Slow-motion replay** — for fusion moments and breakthroughs
- [ ] **Photo mode** — freeze, filter, capture, export

### 5.4 — Simulation Controls
- [ ] **Speed** — pause, 1x, 2x, 4x, 8x
- [ ] **Time scrubber** — jump to any point in the simulation
- [ ] **Scenario injection** — manually trigger events
- [ ] **Pair selector** — focus on specific pairs
- [ ] **Stats overlay** — toggle data layers on/off

---

## Phase 6: AI Behavior & Intelligence
**Goal:** Sims that make believable, trait-driven decisions

### 6.1 — Decision Engine
- [ ] **Need-based prioritization** — hunger > sleep > work > social
- [ ] **Trait-driven choices** — attention avatar drifts, initiation avatar stalls
- [ ] **Schedule awareness** — knows when to work, rest, eat
- [ ] **Interruptibility** — some traits get derailed easier than others
- [ ] **Recovery behavior** — knows when to take a break

### 6.2 — Aide AI
- [ ] **Struggle detection** — monitors Avatar's state in real-time
- [ ] **Strategy selection** — picks best strategy for current situation
- [ ] **Timing judgment** — when to intervene vs. let Avatar struggle
- [ ] **Adaptive coaching** — learns what works for this specific Avatar
- [ ] **Proactive support** — anticipates problems before they happen

### 6.3 — Social Dynamics
- [ ] **Pair bonding** — shared experiences strengthen relationship
- [ ] **NPC interactions** — boss interrupts, coworker distracts, friend supports
- [ ] **Group dynamics** — multiple pairs in same space influence each other
- [ ] **Empathy modeling** — Advocate shows understanding of others' struggles

---

## Phase 7: Progression & Meta-Game
**Goal:** Long-term engagement and meaningful outcomes

### 7.1 — Training Arc (Single Pair)
1. **Onboarding** — Avatar learns the world, Aide introduces itself
2. **Assessment** — Aide observes Avatar's trait patterns
3. **Training** — Scenarios with coaching, building skills
4. **Setback** — Major failure, confidence drops, recovery needed
5. **Breakthrough** — Key insight, rapid skill growth
6. **Fusion Ready** — Bond + skills at threshold
7. **Fusion Ceremony** — Visual transformation into Advocate
8. **Advocate Mode** — Helps other pairs, demonstrates empathy

### 7.2 — World Progression
- [ ] **Day/night cycle** with weekly summaries
- [ ] **Seasonal changes** — training intensifies over "months"
- [ ] **Facility expansion** — new rooms unlock as pairs progress
- [ ] **Community** — Advocates become Aides for new Avatars
- [ ] **Legacy system** — successful pairs leave behind "wisdom" for others

### 7.3 — Metrics & Outcomes
- [ ] **Training effectiveness** — did the Avatar improve?
- [ ] **Fusion quality** — how empathetic is the resulting Advocate?
- [ ] **Strategy success rate** — which interventions work best?
- [ ] **Trait-specific insights** — what helps each ADHD trait most?
- [ ] **Exportable reports** — data for research and model improvement

---

## Phase 8: Technical Polish
**Goal:** Smooth, performant, reliable

### 8.1 — Performance
- [ ] **Instanced rendering** — for trees, particles, furniture
- [ ] **LOD system** — simpler models at distance
- [ ] **Frustum culling** — don't render off-screen objects
- [ ] **Texture atlasing** — reduce draw calls
- [ ] **Web Worker** — simulation logic off main thread
- [ ] **60fps target** — on mid-range hardware

### 8.2 — Persistence
- [ ] **Save/load state** — pause and resume training
- [ ] **Replay recording** — capture and replay any session
- [ ] **Config export** — share simulation configs
- [ ] **Snapshot system** — bookmark interesting moments

### 8.3 — UI/UX
- [ ] **Responsive design** — works on tablet and desktop
- [ ] **Accessibility** — keyboard nav, screen reader support
- [ ] **Tooltips** — explain every element
- [ ] **Onboarding tour** — guide new observers
- [ ] **Settings panel** — graphics quality, audio, speed defaults

---

## Implementation Priority

| Order | Phase | Impact | Effort |
|-------|-------|--------|--------|
| 1 | 2.2 Animation System | High — characters feel alive | Medium |
| 2 | 4.1 Pair System | High — core training concept | Medium |
| 3 | 5.1 Camera System | High — observer experience | Low |
| 4 | 6.1 Decision Engine | High — believable behavior | Medium |
| 5 | 2.3 Emotional Feedback | Medium — visual storytelling | Low |
| 6 | 4.3 Learning Progression | Medium — training depth | Medium |
| 7 | 3.2 Lighting & Post | Medium — visual polish | Medium |
| 8 | 5.2 HUD & Display | Medium — observer info | Medium |
| 9 | 4.4 Aide Coaching | Medium — training realism | High |
| 10 | 6.2 Aide AI | Medium — coaching quality | High |
| 11 | 3.1 World Building | Medium — immersion | High |
| 12 | 3.3 Audio | Medium — atmosphere | Medium |
| 13 | 5.3 Storytelling | Medium — engagement | Medium |
| 14 | 7.1 Training Arc | Medium — structure | Medium |
| 15 | 8.1 Performance | Low — scalability | Medium |
| 16 | 8.3 UI/UX | Low — polish | Medium |

---

## Key Design Principles

1. **Observable first** — Every action should be visible and understandable to a spectator
2. **Emotional resonance** — Viewers should feel the Avatar's struggle and celebrate their wins
3. **Trait authenticity** — Each ADHD trait should manifest in distinct, recognizable behavior
4. **Coaching visibility** — Aide interventions should be clear, timely, and satisfying
5. **Fusion as climax** — The moment of fusion should feel earned and spectacular
6. **Data integrity** — The simulation should produce meaningful training data
7. **Performance** — Must run smoothly with 19+ pairs simultaneously

---

*This is a living document. Phases will be updated as implementation progresses and new requirements emerge.*
