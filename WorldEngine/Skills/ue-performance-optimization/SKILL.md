---
name: ue-performance-optimization
description: Optimize simulation performance with bounded goals (Codex + Poolside lane).
---

# UE Performance Optimization

Authorized for Codex + Poolside lane: approved performance engineering with bounded iteration goals.

## Metrics to Track
- Sim framerate (target: 60 FPS minimum)
- Avatar AI response time
- HTTP API latency

## Workflow
1. Establish baseline with phase6_full_validation.py
2. Define bounded optimization goal with allowed paths
3. Implement single change, measure, compare
4. Stop when target met or iteration budget exhausted
