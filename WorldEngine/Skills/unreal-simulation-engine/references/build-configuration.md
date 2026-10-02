# Build Configuration Reference

## UBT Build Quirks (Linux)

### Warning Level Conflicts

Editor targets share build products with UnrealEditor. If you modify warning levels (like `UndefinedIdentifierWarningLevel`), UBT rejects it:

```
WorldEngineEditor modifies the values of properties: [ UndefinedIdentifierWarningLevel: Off != Error, ... ]
This is not allowed, as WorldEngineEditor has build products in common with UnrealEditor.
```

**Fix**: Set `bOverrideBuildEnvironment = true;` in `WorldEngineEditor.Target.cs`:

```cpp
public WorldEngineEditorTarget(TargetInfo Target) : base(Target)
{
    Type = TargetType.Editor;
    DefaultBuildSettings = BuildSettingsVersion.V7;
    IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
    bOverrideBuildEnvironment = true;
    ExtraModuleNames.AddRange(new string[] { "WorldEngine" });
}
```

### Single Module Architecture

The project uses a **single module** (`WorldEngine`) containing all code. This avoids the sibling module linking pitfall where UBT does NOT automatically add the project's `Binaries/Linux/` to the linker search path for sibling modules.

**Why**: If module A depends on module B (both in the same project), the linker fails with:
```
ld.lld: error: unable to find library -lUnrealEditor-ModuleB
```

The "fix" of adding `.so` paths via `PublicAdditionalLibraries` works but is fragile. Merging into one module is the correct approach for in-project simulation code.

### MassEngine Dependency

Using `FMassFragment` or `FMassEntityTemplateBuildContext` requires the `MassEngine` module, not just `MassEntity`.

**Fix**: Add to `PublicDependencyModuleNames` in `Build.cs`:

```cpp
PublicDependencyModuleNames.AddRange(new string[] {
    "MassEntity",
    "MassCore",
    "MassSignals",
    "MassEngine",  // Required for FMassFragment base struct
    "MassSpawner", // Required for UMassEntityTraitBase
    // ...
});
```

### BuildEnvironment.Unique FAILS on Installed Engine

`BuildEnvironment = TargetBuildEnvironment.Unique;` produces:
```
Targets with a unique build environment cannot be built with an installed engine.
```

**Fix**: Use `bOverrideBuildEnvironment = true;` instead.

### Target.cs Version

Use `BuildSettingsVersion.V7` for UE5.8 installed engine builds. Older versions produce the upgrade warning.

## Plugin Setup

### Required Plugins (WorldEngine.uplugin)

```json
"Plugins": [
  { "Name": "MassGameplay", "Enabled": true },
  { "Name": "MassCrowd", "Enabled": true },
  { "Name": "StateTree", "Enabled": true },
  { "Name": "SmartObjects", "Enabled": true },
  { "Name": "PCG", "Enabled": true },
  { "Name": "ModelContextProtocol", "Enabled": true },
  { "Name": "AllToolsets", "Enabled": true }
]
```

### Module Dependencies (WorldEngine.Build.cs)

```cpp
PublicDependencyModuleNames.AddRange(new string[] {
    "Core",
    "CoreUObject",
    "Engine",
    "InputCore",
    "EnhancedInput",
    "GameplayTags",
    "MassEntity",
    "MassCore",
    "MassSignals",
    "MassEngine",
    "MassCommon",
    "MassSimulation",
    "MassMovement",
    "MassCrowd",
    "MassActors",
    "MassRepresentation",
    "MassSpawner",
    "MassSmartObjects",
    "MassLOD",
    "MassReplication",
    "StateTreeModule",
    "SmartObjectsModule",
    "GameplayTasks",
    "PCG",
    "Json",
    "JsonUtilities"
});
```

## Build Commands

```bash
cd D:\\nlt-repos/nlt-fusion/WorldEngine
make configure                    # Generate project files
make WorldEngineEditor            # Build editor target
make WorldEngine                  # Build game target
```

## MCP Server

The UE project runs an MCP server on `localhost:8001`.

### Verify it's running:

```bash
curl -s -X POST http://localhost:8001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hermes","version":"1.0.0"}}}'
```

### List available toolsets:

```bash
# Initialize session first, then:
curl -s -X POST http://localhost:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <session_id>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_toolsets","arguments":{}}}'
```

### Available toolsets include:
- EditorToolset (actors, scene, objects, blueprints, primitives, data tables)
- PCGToolset
- StateTreeToolset
- NiagaraToolsets
- Animation toolsets
- And more
