using Godot;

namespace NltWorldEngine;

// TerrainBuilderPhysics — Phase C.1 placeholder
//
// C.1 (RENDERER-PLAN.md): Collision for FBX-imported interior scenes.
// FBX export drops UE collision volumes; agents walk through walls.
//
// This file is a placeholder. The open-world terrain (TerrainBuilder.cs) uses a
// height-sampled procedural mesh and does not need runtime collision shapes;
// walking agents will use WorldGeometry.HeightAt() + WorldGeometry.Walkable()
// directly. Interior collision is the concern addressed by this class — but it
// is blocked on Phase C decision-making (entry points, task anchors, etc.) and
// is deferred until C.1 is scheduled.
//
// Do not add physics collision bodies here until the Phase C interior scope is
// agreed, to avoid accumulating half-implemented code against an undefined spec.
public static class TerrainBuilderPhysics
{
    // Reserved for C.1 — interior collision layer
    // See RENDERER-PLAN.md §5 C.1.
}
