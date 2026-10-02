# LNK1104 on `UnrealEditor-WorldEngine-0002.lib.rsp` — diagnosis and remediation

- Task: shared task `task_0003` (T3: Diagnose and clear the LNK1104 response-file failure), owner `link-doctor`
- Date of diagnosis: 2026-09-21 (all timestamps are local, UTC+0 on this machine)
- Project: `C:\Users\joshd\Documents\Unreal Projects\WorldEngine`
- Engine: Epic Games UE 5.8.2, launcher (installed) build at `C:\Program Files\Epic Games\UE_5.8`
- Toolchain reported by UBT: `MSVC 14.50.35738.0` / `cl 19.50.35717` (VS 18 Community), Windows SDK `10.0.22621.0`
- Method: read-only forensics (file metadata, file contents, process/module state, UBT logs, and the UnrealBuildTool C# source that shipped with the installed engine). **No** process was killed, **no** build was run, **no** build output was modified or deleted, **no** machine-wide security setting was touched.

## 0. Verdict

The LNK1104 is **not** path-length, **not** antivirus, **not** a concurrent/duplicate build, and **not** a consequence of the C1083 `asfdk/ASFDK.h` failure. It is a **response-file name mismatch inside one link action**, created by UnrealBuildTool's **legacy hot-reload-from-IDE** code path.

Chain of causation, every link of which is evidenced in §2:

1. `UnrealEditor.exe` (PID 17220) is running and **holds a write-lock on the canonical module output** `Binaries\Win64\UnrealEditor-WorldEngine.dll` (measured, §2.7).
2. Because an editor instance is running (its PID file `C:\Program Files\Epic Games\UE_5.8\Engine\Intermediate\EditorRuns\17220` exists and that PID is alive) **and** Live Coding is disabled for this project (`[/Script/LiveCoding.LiveCodingSettings] bEnabled=False` in `Saved\Config\WindowsEditor\EditorPerProjectUserSettings.ini`), UBT selects `HotReloadMode.FromIDE` (`HotReload.GetDefaultMode`, `HotReload.cs:191-211`). Both gates on that line are satisfied: the first, `BuildConfiguration.bAllowHotReloadFromIDE`, is at its UBT default `true` (`BuildConfiguration.cs:162`) — no `UEBuildConfiguration.xml` exists in this project and neither solution passes `-NoHotReloadFromIDE` — and the second, `ShouldDoHotReloadFromIDE(...)`, returns true for the reasons above (§2.6). A plain Visual Studio / MSBuild build is therefore *not* a plain build — it becomes a hot-reload iteration that links modules into **suffixed** output names (`UnrealEditor-WorldEngine-0001.dll`, `-0002.dll`, …).
3. UBT re-applies the persisted hot-reload state from `Intermediate\Build\Win64\x64\WorldEngineEditor\Development\HotReloadState.json` to the freshly built action graph (`HotReload.Setup` → `ApplyState` → `PatchActionGraph`). That state file is **internally inconsistent for this module**: `UnrealEditor-WorldEngine.lib` → `-0001.lib` while `UnrealEditor-WorldEngine.dll`/`.pdb` → `-0002.dll`/`.pdb` (§2.4).
4. `PatchActionGraph` renames *produced items* per action, but then also does a **blind base-name string substitution on the `CommandArguments` of every `ActionType.Link` action** (`HotReload.cs:1214-1228`). The DLL mapping pair `UnrealEditor-WorldEngine-0001 → UnrealEditor-WorldEngine-0002` therefore also rewrote the *import-library* action's command line, turning its reference to `UnrealEditor-WorldEngine-0001.lib.rsp` into `UnrealEditor-WorldEngine-0002.lib.rsp`.
5. No action in the graph produces `UnrealEditor-WorldEngine-0002.lib`: the import-library (`link.exe /LIB`) action for this module ran as `UnrealEditor-WorldEngine-0001.lib` (its response file `-0001.lib.rsp` exists and was written at 17:11:04). So `link.exe /LIB @"…-0002.lib.rsp"` opened a file that was never created → **LNK1104**.

Closing the Unreal Editor removes the trigger: with no live editor instance UBT selects `HotReloadMode.Disabled`, and in that mode UBT itself deletes the suffixed hot-reload temp files **and** the state file (`HotReload.cs:241-249` → `DeleteTemporaryFiles`, `HotReload.cs:508-552`). §6 gives the numbered procedure.

## 1. What was and was not done

Probes actually executed (all read-only):

| Probe | Purpose |
| --- | --- |
| `Get-Item` / `Get-ChildItem -Force` on the module `Intermediate` dir and both `Binaries\Win64` dirs | response-file inventory, sizes, creation **and** last-write times |
| `Get-Content` on the five `*.lib.rsp` / `*.dll.rsp` files | what each response file actually targets (`/NAME:`, `/OUT:`, `/PDB:`) |
| `Get-Content` + `ConvertFrom-Json` on `HotReloadState.json` | the persisted hot-reload rename map and `NextSuffix` |
| Byte-pattern search (`IndexOf`, ASCII **and** UTF-16LE) inside `Makefile.bin` (7.6 MB) | is the persisted action graph itself polluted with `-000N` names? |
| `Select-String` on `Log.txt`, `Log.json`, and all rotated `Log-backup-*.txt` | every occurrence of `LNK1104`, `-000N`, `.rsp`, `hot`/`coding` |
| `Get-Process -Id 17220` (`.Modules`, `.StartTime`, `.Responding`) | confirm the editor is alive and which module DLLs it has loaded |
| `[IO.File]::Open(..., ReadWrite, ReadWrite)` **without writing any byte** on the canonical `.dll`, `.pdb`, `.lib` | measure the write-lock the linker would hit |
| `Mutex.OpenExisting("Global\LiveCoding_…UnrealEditor.exe")` | is a Live Coding session actually active? |
| `Get-MpPreference`, `Get-MpComputerStatus`, `Get-MpThreatDetection` | Defender state and exclusions |
| `Get-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem LongPathsEnabled` | MAX_PATH policy |
| `Get-ChildItem -Recurse` over `Intermediate\` + `Binaries\` (26 768 files) | longest real path in the build tree |
| Read of the installed UnrealBuildTool C# source (`Engine\Source\Programs\UnrealBuildTool`, 301 `.cs` files) | the actual naming/patching code, quoted with file:line in §2.5 |

Not done (deliberately): no `Build.bat` run (that belongs to T4 / `build-verifier`, and it would write build outputs), no `taskkill`/`Stop-Process` on `UnrealEditor.exe`, `devenv.exe`, UBT, `cl.exe` or `link.exe`, no deletion/rename of anything under `Intermediate\` or `Binaries\`, no `Add-MpPreference`, no `handle.exe` (not installed).

## 2. Raw evidence

### 2.1 The failing build, as recorded by UBT

`C:\Users\joshd\AppData\Local\UnrealBuildTool\Log.txt` (25 691 bytes, last write 2026-09-21 17:11:36). It is the **MSBuild-invoked** run — note `-FromMsBuild`:

```
 29 | Command line: "…\Engine\Binaries\DotNET\UnrealBuildTool\UnrealBuildTool.dll" WorldEngineEditor Win64 Development
      "-Project=…\WorldEngine.uproject" -WaitMutex -architecture=x64 -Progress -FromMsBuild
 39 | Building UnrealEditor - WorldEngineEditor - Win64 - Development
113 | Using Unreal Build Accelerator local executor to run 6 action(s)
119 | Cache bucket 1970435009 used. Action: Compile [x64] Module.NLTGovernanceSubsystem.cpp ()
120 | Cache bucket 416513229 used. Action: Link [x64] UnrealEditor-NLTGovernanceSubsystem-0002.lib ()
123 | [1/6] Link [x64] UnrealEditor-WorldEngine-0001.lib
124 | Microsoft (R) Library Manager Version 14.50.35738.0
127 | LINK : fatal error LNK1104: cannot open file 'C:/Users/joshd/Documents/Unreal Projects/WorldEngine/Intermediate/
      Build/Win64/x64/UnrealEditor/Development/WorldEngine/UnrealEditor-WorldEngine-0002.lib.rsp'
128 |  Link [x64] UnrealEditor-WorldEngine-0001.lib: Exited with error code 1104 . The build will fail.
129 |  Link [x64] UnrealEditor-WorldEngine-0001.lib: WorkingDirectory C:\Program Files\Epic Games\UE_5.8\Engine\Source
130 |  Link [x64] UnrealEditor-WorldEngine-0001.lib: …\link.exe /LIB @"…/UnrealEditor-WorldEngine-0002.lib.rsp"
132 |  Compile [x64] Module.NLTGovernanceSubsystem.cpp: Exited with error code 2 . The build will fail.
136 | …\NLTGovernanceSubsystem\Private\AgentGovernanceState.h(10,1): fatal error C1083: Cannot open include file:
      'asfdk/ASFDK.h': No such file or directory
200 | Result: Failed (OtherCompilationError)
```

The single most important line is the **contradiction between line 123/128 and line 130**:

- the *action* being executed is `Link [x64] UnrealEditor-WorldEngine-0001.lib` (line 123, repeated 128/129/130) — UBT's `LinkAction.StatusDescription` is literally `Path.GetFileName(OutputFile.AbsolutePath)` (`VCToolChain.cs:3590`), i.e. the action owns `UnrealEditor-WorldEngine-0001.lib`;
- but the *command line* of that same action (line 130) passes `@"…/UnrealEditor-WorldEngine-0002.lib.rsp"`.

`Log.json` (same run) records the identical pair at lines 94 and 97: `"Description":"Link [x64] UnrealEditor-WorldEngine-0001.lib"` combined with `"CommandArguments":"/LIB @\"…UnrealEditor-WorldEngine-0002.lib.rsp\""`.

Also relevant: UBT logs **no** hot-reload message for this run. Where the hot-reload path degrades (e.g. Live Coding active) it logs `"Live coding session active…"`; `Select-String -Pattern 'hot|coding|Hot'` over `Log.txt` and `Log.json` returned **zero** matches. Legacy hot-reload-from-IDE is silent, which is why this looks like UBT hallucinating a file name.

### 2.2 Response-file inventory (with sizes and timestamps)

Directory `Intermediate\Build\Win64\x64\UnrealEditor\Development\WorldEngine` (29 entries captured; link-related ones shown):

| File | Bytes | Last write | Creation time | Note |
| --- | --- | --- | --- | --- |
| `UnrealEditor-WorldEngine.lib.rsp` | 649 | 16:14:43 | 14:53:14 | canonical import-lib action |
| `UnrealEditor-WorldEngine.lib.rsp.old` | 682 | (older) | 14:53:14 | UBT backup-on-rewrite |
| `UnrealEditor-WorldEngine.dll.rsp` | 8 278 | 16:14:43 | 14:53:14 | canonical DLL action |
| `UnrealEditor-WorldEngine.dll.rsp.old` | 8 344 | (older) | 14:53:14 | UBT backup-on-rewrite |
| `UnrealEditor-WorldEngine-0001.lib.rsp` | 659 | **17:11:04** | 14:53:14 | written by the failing run |
| `UnrealEditor-WorldEngine-0001.dll.rsp` | 8 293 | **17:11:04** | 14:53:14 | written by the failing run |
| `UnrealEditor-WorldEngine-0002.dll.rsp` | 8 293 | **17:11:05** | **17:11:05** | newly created by the failing run |
| `UnrealEditor-WorldEngine-0002.lib.rsp` | — | — | — | **does not exist, and never existed** |
| `UnrealEditor-WorldEngine-0001.exp` | 268 102 | 16:22:40 | 16:22:40 | produced by an earlier hot-reload iteration |
| `UnrealEditor-WorldEngine.lib` / `.exp` | 451 224 / 268 102 | 2026-09-20 18:41:57 | 14:53:14 | canonical, untouched since 09-20 |
| `WorldEngine.Shared.rsp` / `.rsp.old` | 25 592 / 26 530 | 16:14:43 / older | 14:53:14 | shared compile response file |
| `Module.WorldEngine.cpp.obj` | 27 813 710 | 16:22:40 | 16:22:40 | recompiled in the 16:22 run |
| `Module.WorldEngine.cpp.obj.rsp` / `.rsp.old` | 1 517 / 1 616 | 16:14:43 / older | 14:53:14 | compile response file |
| `Module.WorldEngine.cpp.lc.obj` / `.lc.rsp` / `.lc.dep.json` | 27 725 915 / 1 606 / 115 457 | 2026-09-20 14:15 / 14:11 | 14:53:14 | **Live Coding** leftovers (see §2.6) |

Interpretation of the `.rsp.old` files: they are UBT's normal "backup before rewriting" behaviour, not damage — the log says so verbatim, e.g. in the previous (16:22) run's log: `Updating …\UnrealEditor-WorldEngine.lib.rsp: contents have changed. Saving previous version to …\UnrealEditor-WorldEngine.lib.rsp.old.` (line 125 of `Log-backup-2026.09.19-18.07.41.txt`).

The same suffix pattern exists in the plugins, and **there it is complete**: `Plugins\NLTGovernanceSubsystem\Intermediate\…\NLTGovernanceSubsystem\` has *both* `UnrealEditor-NLTGovernanceSubsystem-0001.lib.rsp` (776 B, 17:11:04) *and* `-0002.lib.rsp` (776 B, 17:11:05), and `Plugins\VisualStudioTools\Binaries\Win64\` contains finished suffixed DLLs from the 16:22 run (`UnrealEditor-VisualStudioTools-0001.dll`, `UnrealEditor-VisualStudioBlueprintDebuggerHelper-0001.dll`, each with a matching `.pdb`). Only the `WorldEngine` **import-library** rsp is missing its `-0002` twin — exactly the asymmetry that §2.4 + §2.5 explain.

### 2.3 What each response file actually targets

```
UnrealEditor-WorldEngine.lib.rsp        (649 B, 16:14:43)   L7   /NAME:"UnrealEditor-WorldEngine.dll"
                                                            L12  /OUT:"…/UnrealEditor-WorldEngine.lib"
UnrealEditor-WorldEngine-0001.lib.rsp   (659 B, 17:11:04)   L7   /NAME:"UnrealEditor-WorldEngine-0001.dll"
                                                            L12  /OUT:"…/UnrealEditor-WorldEngine-0001.lib"
UnrealEditor-WorldEngine.dll.rsp        (8 278 B, 16:14:43) L122 /OUT:"…/Binaries/Win64/UnrealEditor-WorldEngine.dll"
UnrealEditor-WorldEngine-0001.dll.rsp   (8 293 B, 17:11:04) L122 /OUT:"…/Binaries/Win64/UnrealEditor-WorldEngine-0001.dll"
UnrealEditor-WorldEngine-0002.dll.rsp   (8 293 B, 17:11:05) L122 /OUT:"…/Binaries/Win64/UnrealEditor-WorldEngine-0002.dll"
```

Consequences:

1. The import-library action that ran owned `-0001.lib` (its rsp says so) — its response file was present and correct on disk.
2. **No** `-0002.lib` / `-0002.lib.rsp` exists anywhere, so nothing could have created one. `UEToolChain.GetResponseFileName` derives the response-file name from the action's output file (`ToolChain\UEToolChain.cs:282`, `:297-301`), so a `-0002.lib.rsp` can only exist if a `-0002.lib` action existed. It did not.
3. Only the *string* inside the command line says `-0002` — a pure name-substitution artefact (§2.5).

### 2.4 The persisted hot-reload state (the inconsistent mapping)

`Intermediate\Build\Win64\x64\WorldEngineEditor\Development\HotReloadState.json` — **10 443 bytes, last write 2026-09-21 17:11:05** (i.e. rewritten by the failing run itself).

```
{"NextSuffix":3,"OriginalFileToHotReloadFile":{ … }, "TemporaryFiles":[ … 28 entries … ]}
```

Full basename mapping (keys are always canonical paths; values are the hot-reload names):

| Original (canonical) | Hot-reload target |
| --- | --- |
| `UnrealEditor-VisualStudioTools.lib` | `…-0001.lib` |
| `UnrealEditor-VisualStudioTools.dll` / `.pdb` | `…-0001.dll` / `.pdb` |
| `UnrealEditor-VisualStudioBlueprintDebuggerHelper.lib` | `…-0001.lib` |
| `UnrealEditor-VisualStudioBlueprintDebuggerHelper.dll` / `.pdb` | `…-0001.dll` / `.pdb` |
| `UnrealEditor-NLTGovernanceSubsystem.lib` | `…-0002.lib` |
| `UnrealEditor-NLTGovernanceSubsystem.dll` / `.pdb` | `…-0002.dll` / `.pdb` |
| `UnrealEditor-McpAutomationBridge.lib` | `…-0001.lib` |
| `UnrealEditor-McpAutomationBridge.dll` / `.pdb` | `…-0001.dll` / `.pdb` |
| `UnrealEditor-McpAutomationBridgeFab.lib` / `.dll` / `.pdb` | `…-0001.lib` / `.dll` / `.pdb` |
| **`UnrealEditor-WorldEngine.lib`** | **`…-0001.lib`** |
| **`UnrealEditor-WorldEngine.dll`** | **`…-0002.dll`** |
| **`UnrealEditor-WorldEngine.pdb`** | **`…-0002.pdb`** |

This is the inconsistent state. For every module **except** `WorldEngine` the `.lib`, `.dll` and `.pdb` share one suffix. For `WorldEngine` the import library is on `-0001` while the DLL/PDB are on `-0002`. That divergence is what makes one suffix appear inside the *command line of an action that owns the other suffix*.

`TemporaryFiles` (28 entries) is the list UBT deletes when hot reload is switched off: `…\WorldEngine\UnrealEditor-WorldEngine-0001.lib`, `…\Binaries\Win64\UnrealEditor-WorldEngine-0001.dll` / `-0001.pdb` / **`-0002.dll` / `-0002.pdb`**, the VisualStudioTools / NLTGovernanceSubsystem / McpAutomationBridge equivalents, plus the four `UnrealEditor.modules` files and `WorldEngineEditor.target` (metadata UBT also rewrites for hot reload).

**11 of those 28 tracked paths do not exist on disk** (measured by running the helper script of §6 as a dry run, which lists each tracked path and whether it is present): `WorldEngine-0001.dll`/`.pdb`, `WorldEngine-0002.dll`/`.pdb`, `WorldEngine-0001.lib`, `NLTGovernanceSubsystem-0001.lib` / `-0001.dll` / `-0001.pdb`, `NLTGovernanceSubsystem-0002.lib` / `-0002.dll` / `-0002.pdb`. That is exactly what §2.5d predicts: the hot-reload pass is a **name** operation — the state records the *intended* name of every output of a module, but a file only appears if the corresponding action actually ran and succeeded. Nothing was broken or "half-deleted"; these files were simply never produced (the build failed before the DLL link steps).

Two supporting facts:

- `Makefile.bin` (the persisted action graph, `Intermediate\Build\Win64\x64\WorldEngineEditor\Development\Makefile.bin`, 7 643 267 B, last write 16:15:01) is **clean**. A byte-pattern search (ASCII **and** UTF-16LE) found `UnrealEditor-WorldEngine.lib` **5** times and `UnrealEditor-WorldEngine-0001.lib`, `-0002.lib`, `-0001.lib.rsp`, `-0002.lib.rsp`, `-0001.dll`, `-0002.dll` **0** times each. So the suffixes are **not** baked into the cached makefile — they are injected at run time from `HotReloadState.json`. This matters for the fix: deleting the makefile is **not** required.
- `NextSuffix` is now `3`, i.e. the next hot-reload iteration will invent `-0003` names while the build still references `-0001`/`-0002` files (`HotReload.cs:44`: `public int NextSuffix { get; set; } = 1;`). The state accumulates on every iteration for as long as the editor stays open.

### 2.5 The mechanism, from the UnrealBuildTool source shipped with UE 5.8.2

All quotes are from `C:\Program Files\Epic Games\UE_5.8\Engine\Source\Programs\UnrealBuildTool` (301 `.cs` files — the exact logic that produced this build).

**(a) Suffixed names are a hot-reload feature, not a "locked output" fallback.**

`System\HotReload.cs:846-849`
```csharp
// NOTE: Formatting of this string must match the code in ModuleManager.cpp, MakeUniqueModuleFilename
string NewFileName = String.Format("{0}-{1:D4}{2}", FileName.Substring(0, NameEndIdx), Suffix, FileName.Substring(NameEndIdx));
return FileReference.Combine(File.Directory, NewFileName);
```
`{1:D4}` is exactly `0001`, `0002`, … and `NextSuffix` starts at 1 (`HotReload.cs:44`). There is **no** "output file is locked → use a unique name" path anywhere in UBT's link-action creation (`VCToolChain.cs:3560-3590`); the numeric suffix comes only from hot reload / Live Coding.

**(b) An MSBuild build becomes a hot-reload build when the editor is running.**

`HotReload.cs:191-211`
```csharp
public static HotReloadMode GetDefaultMode(…)
{
    if (Makefile.TargetType == TargetType.Program) return HotReloadMode.Disabled;
    else if (TargetDescriptor.HotReloadModuleNameToSuffix.Count > 0 && …) return HotReloadMode.FromEditor;
    else if (BuildConfiguration.bAllowHotReloadFromIDE && HotReload.ShouldDoHotReloadFromIDE(…)) return HotReloadMode.FromIDE;
    …
    return HotReloadMode.Disabled;
}
```
`HotReload.cs:349-396`: `ShouldDoHotReloadFromIDE` enumerates `Engine\Intermediate\EditorRuns\` (one file per editor PID), parses the PID, and requires that process to still be alive. `HotReload.cs:339-347` explicitly returns **false** if `[/Script/LiveCoding.LiveCodingSettings] bEnabled` is true — i.e. this legacy path is used *precisely because* Live Coding is disabled here (§2.6).

**(c) The previous state is re-applied to the fresh graph, then the graph is patched again with a new suffix.**

`HotReload.cs:251-266`
```csharp
else
{
    // Reapply the previous state
    FileReference StateFile = HotReloadState.GetLocation(TargetDescriptor);
    if (FileReference.Exists(StateFile))
    {
        HotReloadState HotReloadState = HotReloadState.Load(StateFile);
        // Apply the old state to the makefile
        HotReload.ApplyState(HotReloadState, Makefile, Actions);
    }
    PatchedOldLocationToNewLocation = HotReload.PatchActionGraphWithNames(TargetDescriptor.HotReloadModuleNameToSuffix, Makefile, Actions);
}
```
`HotReload.cs:560-563` — `ApplyState` calls `HotReload.PatchActionGraph(Actions, HotReloadState.OriginalFileToHotReloadFile)`. `HotReload.cs:776-800` is the second patch pass: `FileReference NewLocation = HotReload.ReplaceSuffix(OldLocation, HotReloadState.NextSuffix)` followed by `HotReloadState.NextSuffix++`. Supplying the two passes is what lets `.lib` and `.dll` of the *same* binary end up on *different* suffixes when only some of the module's actions are re-executed in a given iteration.

**(d) Produced items are renamed per action — but the command line gets a blind base-name substitution on *every* link action.** This is the step that produces the LNK1104.

`HotReload.cs:1101-1102, 1155-1166` rename each action's produced/prerequisite `FileItem`s whose path matches the file being renamed and record the pair; `HotReload.cs:1181` then keeps the description consistent *for that action*:

```csharp
NewAction.StatusDescription = ReplaceBaseFileName(Action.StatusDescription, OriginalFileNameWithoutExtension, NewFileNameWithoutExtension);
```

Immediately afterwards, `HotReload.cs:1214-1228` applies those pairs to **all** link actions:

```csharp
if (OriginalFileNameAndNewFileNameList_NoExtensions.Count > 0)
{
    // Update all the paths in link actions
    foreach (LinkedAction Action in Actions.Where((Action) => Action.ActionType == ActionType.Link))
    {
        foreach (KeyValuePair<string, string> FileNameTuple in OriginalFileNameAndNewFileNameList_NoExtensions)
        {
            string OriginalFileNameWithoutExtension = FileNameTuple.Key;
            string NewFileNameWithoutExtension = FileNameTuple.Value;

            Action NewAction = new Action(Action.Inner);
            NewAction.CommandArguments = ReplaceBaseFileName(Action.CommandArguments, OriginalFileNameWithoutExtension, NewFileNameWithoutExtension);
            Action.Inner = NewAction;
        }
    }
```

`ReplaceBaseFileName` (`HotReload.cs:852-880`) only requires the *base name without extension* to be delimited by non-identifier characters. In `@"…/UnrealEditor-WorldEngine-0001.lib.rsp"` the token `UnrealEditor-WorldEngine-0001` is preceded by `/` and followed by `.`, so the **DLL**'s rename pair `UnrealEditor-WorldEngine-0001 → UnrealEditor-WorldEngine-0002` also rewrites the **import-library** action's response-file reference — even though that action's own output (`-0001.lib`) was not renamed in that pass. The observed contradiction (`StatusDescription = UnrealEditor-WorldEngine-0001.lib` with `CommandArguments = @…-0002.lib.rsp`, §2.1) is exactly this.

`HotReload.cs:1230-1246` does write out renamed response files, but only for pairs collected from prerequisite items that were **really** renamed in that pass (`HotReload.cs:1124-1132`):

```csharp
foreach (KeyValuePair<FileReference, FileReference> Item in OriginalToNewFilePaths)
{
    string FileContents = FileReference.ReadAllText(Item.Key);
    … // replace names
    FileReference.WriteAllText(Item.Value, FileContents, new System.Text.UTF8Encoding(false));
}
```

A name that is only substituted in the command-line *string*, with no matching `FileItem` rename, never gets a file. That is why `-0002.lib.rsp` is absent while `-0002.dll.rsp` (a genuine rename) exists.

**(e) With hot reload off, UBT cleans this up by itself.**

`HotReload.cs:241-249` (mode `Disabled`) → `HotReload.DeleteTemporaryFiles(StateFile, Logger)`, and `HotReload.cs:508-552` deletes **all 28 files listed in `TemporaryFiles`** and then the state file:

```csharp
foreach (FileReference Location in State.TemporaryFiles.OrderBy(x => x.FullName, StringComparer.OrdinalIgnoreCase))
{
    if (FileReference.Exists(Location)) { FileReference.Delete(Location); Logger.LogInformation("Deleted hot-reload file: {Location}", Location); }
}
… FileReference.Delete(HotReloadStateFile);
```

So the remediation in §6 does **not** need a manual wipe of `Intermediate\`.

### 2.6 Trigger evidence: the editor is running, Live Coding is off

```
Get-Process -Name UnrealEditor
  Id    ProcessName    StartTime              WS_MB   Path
  17220 UnrealEditor   9/21/2026 4:06:13 PM   3792.6  C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe
  10868 devenv         9/21/2026 3:02:37 PM   3243.1  C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\devenv.exe

(Get-Process -Id 17220).Responding            -> True
(Get-Process -Id 17220).MainWindowTitle       -> WorldEngine - Unreal Editor
(Get-Process -Id 17220).Modules | ? FileName -like '*WorldEngine*'
  UnrealEditor-WorldEngine.dll             C:\Users\joshd\…\WorldEngine\Binaries\Win64\UnrealEditor-WorldEngine.dll
  UnrealEditor-NLTGovernanceSubsystem.dll  C:\Users\joshd\…\WorldEngine\Plugins\NLTGovernanceSubsystem\Binaries\Win64\…
  UnrealEditor-McpAutomationBridge.dll / -McpAutomationBridgeFab.dll / -VisualStudioTools.dll

C:\Program Files\Epic Games\UE_5.8\Engine\Intermediate\EditorRuns\
  Name    LastWriteTime
  17220   9/21/2026 4:06:50 PM        <-- the PID file UBT keys on; Test-Path -> True
```

`Saved\Config\WindowsEditor\EditorPerProjectUserSettings.ini`:
```
 515 | [/Script/LiveCoding.LiveCodingSettings]
 516 | bEnabled=False
```
Live Coding was never actually running; the probe for UBT's own Live Coding mutex
(`Global\LiveCoding_C++Program+Files+Epic+Games+UE_5.8+Engine+Binaries+Win64+UnrealEditor.exe`, the name UBT builds in `HotReload.cs:293-306`) returned
`WaitHandleCannotBeOpenedException` → **no Live Coding session is active**. This is required for the diagnosis and not incidental: Live Coding enabled would have *suppressed* the FromIDE path.

Stale Live Coding leftovers do exist and are unrelated (they are on 09-20): `Intermediate\…\WorldEngine\LiveCodingInfo.json` (4 308 B, 2026-09-20 14:10:58, contains `RemapUnityFiles` only — **0** occurrences of `-0001`, `-0002` or `UnrealEditor-WorldEngine.dll`), and `Module.WorldEngine.cpp.lc.obj` / `.lc.dep.json` / `.obj.lc.rsp`.

There is no evidence of concurrent/duplicate builds: only `devenv.exe` (which launched this single `-FromMsBuild` UBT run at 17:11:02 — see `Log.txt:29`) and `UnrealEditor.exe` are alive; `UnrealBuildTool`, `cl`, `link`, `MSBuild`, `UbaAgent`, `UbaServer` are **not** running; the UBA server logged a clean shutdown (`Log.txt:141  UbaStorageServer - Database saved`); and the Visual Studio project generator always passes `-WaitMutex` (`VCProject.cs:2282`), which per `GlobalOptions.cs:75` means "Wait for another instance to finish and then start, rather than aborting immediately" — concurrent UBT instances are serialised by a single-instance mutex (`UnrealBuildTool.cs:447`).

### 2.7 Lock measurement (what the editor really holds)

Opening the canonical outputs read-write (**no bytes written — open/close only**) shows which files the linker would be blocked from overwriting:

```
C:\…\WorldEngine\Binaries\Win64\UnrealEditor-WorldEngine.dll
   open(ReadWrite, Share=ReadWrite): FAILED
   -> "The process cannot access the file … because it is being used by another process."
   open(Read , Share=None):          OK  (loader opened it with FILE_SHARE_READ|FILE_SHARE_DELETE)
   => the running editor holds the module DLL in a way that PREVENTS any overwrite.
C:\…\WorldEngine\Binaries\Win64\UnrealEditor-WorldEngine.pdb
   open(ReadWrite, Share=ReadWrite): OK   -> not locked
C:\…\Intermediate\…\WorldEngine\UnrealEditor-WorldEngine.lib
   open(ReadWrite, Share=ReadWrite): OK   -> not locked
```

Two consequences worth stating plainly:

1. The earlier hypothesis "UBT renames its output because the canonical output is locked and cannot be written" is **false as stated** (§2.5a: no such code exists). What selects `HotReloadMode.FromIDE` is the **live-editor state** — the `EditorRuns\17220` PID file with a live process, plus Live Coding disabled (§2.6). The DLL write-lock is real and measured, but it is a **separate consequence** of that same editor process, not an input to the mode selection; it only decides whether the canonical link can succeed.
2. A locked DLL would normally give `LNK1104: cannot open file '…UnrealEditor-WorldEngine.dll'` (the DLL, during the `/DLL` link). The failure in this build is on a **`.rsp`** file and names a **nonexistent** file, so the lock is the *trigger*, not the proximate error.

### 2.8 Measured path lengths and MAX_PATH exposure

| Path | Chars |
| --- | --- |
| **Failing path** `C:\Users\joshd\Documents\Unreal Projects\WorldEngine\Intermediate\Build\Win64\x64\UnrealEditor\Development\WorldEngine\UnrealEditor-WorldEngine-0002.lib.rsp` | **156** |
| Same path in the forward-slash form link.exe printed | 156 |
| Canonical `…\WorldEngine\UnrealEditor-WorldEngine.dll.rsp` | 151 |
| `…\WorldEngine\Module.WorldEngine.cpp.obj` | 145 |
| `…\Binaries\Win64\UnrealEditor-WorldEngine.dll` | 96 |
| Longest path in the whole `Intermediate\` + `Binaries\` tree (26 768 files scanned) | 212 (`Intermediate\PipInstall\Lib\site-packages\torch\include\ATen\ops\…`) |
| Files at ≥ 240 chars | 0 |
| Files at ≥ 260 chars | 0 |
| `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled` | `1` |

The failing path is in fact the **longest** path in that module's `Intermediate` directory (156), and the longest path anywhere in the build tree is 212 characters, below `MAX_PATH` (260). `link.exe` was invoked with an absolute path and with `WorkingDirectory C:\Program Files\Epic Games\UE_5.8\Engine\Source` (`Log.txt:129`); an absolute path is not extended by the working directory, and MSBuild/UBT do not prefix it. **MAX_PATH is therefore not a contributing factor**, and no short-path workaround (`subst`, junction shortening, moving the project) is warranted for this failure. (Unrelated residual exposure: paths would only start approaching 260 if a deeper plugin/module name were added or the project were moved under a longer root.)

## 3. Hypotheses: CONFIRMED / REFUTED / SUSPECTED

| # | Hypothesis | Verdict | Decisive evidence |
| --- | --- | --- | --- |
| H1 | `-000N` suffix is UBT's fallback for a **locked** output file, and the linker was handed a numbered rsp UBT did not write | **REFUTED as stated / CONFIRMED in substance** | The suffix code is `HotReload.ReplaceSuffix` (`HotReload.cs:846-849`), used only by hot reload; there is no lock-based naming path (`VCToolChain.cs:3560-3590`). But the *cause* is still the running editor: its registered `EditorRuns` PID plus disabled Live Coding are what put this build on the hot-reload path (§2.6), and the same process also makes the module DLL unwritable (§2.7). |
| H2 | **Legacy hot-reload-from-IDE** with a stale, internally inconsistent persisted state rewrites the action graph, producing an rsp reference with no corresponding file | **CONFIRMED** | `HotReloadState.json` maps `WorldEngine.lib→-0001` and `WorldEngine.dll→-0002` (§2.4); `HotReload.cs:1214-1228` rewrites base names in all link actions' `CommandArguments`; log line 123 vs 130 shows the `-0001.lib` action naming the `-0002.lib.rsp`; `-0002.lib.rsp` never existed (§2.2/2.3). |
| H3 | Concurrent/duplicate builds (VS MSBuild + Live Coding / another UBT) racing on the same `.rsp` files | **REFUTED** | One `-FromMsBuild` run (`Log.txt:29`); no other UBT/`cl`/`link`/UBA processes; `-WaitMutex` serialises UBT instances (`GlobalOptions.cs:75`, `UnrealBuildTool.cs:447`); no Live Coding mutex; UBA server exited cleanly (`Log.txt:141`). A race would also leave partial/interleaved artefacts, not a name no action ever owns. |
| H4 | Windows Defender / third-party AV holding or quarantining `.rsp` files | **REFUTED (small residual caveat)** | `Get-MpThreatDetection` → **0** detections; `RealTimeProtectionEnabled` → True; no third-party AV registered (`root/SecurityCenter2` empty). Decisively: the missing file was **never created** by any action, so no scanner can have removed it. Caveat: the Defender exclusion list needs elevation to read (`ExclusionPath` → "Must be an administrator to view exclusions") — §7 is a *recommendation only*. |
| H5 | Path length / MAX_PATH | **REFUTED** | §2.8: failing path 156, longest in tree 212, 0 files ≥ 240, `LongPathsEnabled=1`. |
| H6 | Stale `Intermediate` (leftover `-0001`/`-0002` files, `*.rsp.old`) indicating an interrupted prior link | **PARTIALLY CONFIRMED — right files, wrong reason** | The suffixed leftovers are real and are the state UBT re-applies, but they are not damage from an interrupted link: they are *deliberate* hot-reload temp files tracked in `HotReloadState.json.TemporaryFiles` (§2.4), and `*.rsp.old` is UBT's normal "save previous version" behaviour (`Log-backup-2026.09.19-18.07.41.txt:125`). Hence a manual hard delete is *not* the recommended remedy (§6). |
| H7 | Live Coding console / `LiveCodingInfo.json` inconsistency | **REFUTED as cause; confirmed as stale junk** | Live Coding is disabled (`bEnabled=False`) and no Live Coding mutex exists; `LiveCodingInfo.json` is from 2026-09-20 14:10:58 and contains no suffixed names (§2.6). The FromIDE path uses `HotReloadState.json` + `Metadata-HotReload.json`, not `LiveCodingInfo.json`. |
| H8 | UBA (Unreal Build Accelerator) corrupting the rsp lifecycle | **REFUTED** | UBA only *executes* actions and reported the failure verbatim (`Log.txt:127`); its local executor finished cleanly (`Log.txt:140-141`). Response-file names/contents are computed by UBT at graph-build time (`UEToolChain.cs:282`, `VCToolChain.cs:3564-3585`), and the mismatched name is already present in the **command line recorded in the log**, i.e. before UBA ran anything. |
| H9 | LNK1104 is a consequence of the C1083 (`asfdk/ASFDK.h`) failure | **REFUTED** | See §4. |

Residual uncertainty is listed in §8.

## 4. Is LNK1104 independent of the C1083, and what happens after C1083 is fixed?

**Independent.** The two failures have no causal relationship in either direction:

- different modules (`WorldEngine` link vs `NLTGovernanceSubsystem` compile), different tools (`link.exe /LIB` vs `cl.exe`), different UBT action types (`ActionType.Link` vs `ActionType.Compile`);
- the LNK1104 comes from a **name-resolution** defect in the patched action graph (§2.5d). Include paths cannot influence which file name a link action's command line contains;
- the C1083 likewise cannot be caused by hot reload: it is `AgentGovernanceState.h(10)` failing to find a header through the broken `Plugins\NLTGovernanceSubsystem\ThirdParty\ASFDK` junction (T1's subject);
- the two errors appear in one run with no ordering dependency between them (`Log.txt:123-136`).

**What happens to LNK1104 once C1083 is fixed: it stays.** Fixing the include path lets `Module.NLTGovernanceSubsystem.cpp` compile, after which the link steps execute — and the `WorldEngine` import-library action will again be handed `@…-0002.lib.rsp`, because the hot-reload state is re-applied on *every* build for as long as the editor keeps running. Two predictions to check during T4 verification (`build-verifier`):

1. the LNK1104 in the next build may name `-0003`/`-0004` rather than `-0002`: `HotReloadState.json.NextSuffix` is 3 and increments every iteration while actions that were *not* renamed keep older suffixes. Expect the same *class* of error with different digits — do **not** read a change of digits as "fixed".
2. even if the rsp mismatch were somehow dodged, the next blocker is the **canonical** `Binaries\Win64\UnrealEditor-WorldEngine.dll`, write-locked by the editor (§2.7) — `LNK1104: cannot open file '…UnrealEditor-WorldEngine.dll'`. That write-lock is a separate consequence of the same running editor that §2.6 identifies as what selects the hot-reload path; it does not itself select the mode.

So: fix the C1083 for compile health, but treat the two as separate workstreams and do not expect one to fix the other. `build-verifier` has been told this explicitly.

## 5. Remediation (numbered, for the user)

Nothing below has been executed by me. Steps 1-3 and 7 need the user's hands (the editor may hold unsaved work); steps 4-6 and 8 are safe verification commands.

1. **Save your work in the Unreal Editor, then close every `UnrealEditor.exe` instance.** This is required, and here is precisely why: with a live editor instance registered in `C:\Program Files\Epic Games\UE_5.8\Engine\Intermediate\EditorRuns\` (currently `17220`) and Live Coding disabled, UBT selects `HotReloadMode.FromIDE` (`HotReload.cs:191-211`) and turns every MSBuild link into a hot-reload iteration that re-applies `HotReloadState.json`. Closing the editor also releases the write-lock on `Binaries\Win64\UnrealEditor-WorldEngine.dll` (§2.7) — the canonical link can only succeed once that lock is gone. *I did not close or kill it for you.*
2. **Confirm the editor is really gone** (do not force-kill; if a process lingers unresponsive, close it from its window):
   ```powershell
   Get-Process -Name UnrealEditor -ErrorAction SilentlyContinue | Select-Object Id,StartTime,MainWindowTitle
   ```
   Expect no output. A stale `Engine\Intermediate\EditorRuns\<PID>` file is harmless — UBT deletes PID files whose process no longer exists (`HotReload.cs:389-413`).
3. **Let UBT do the cleanup: just build normally.** With no live editor, UBT selects `HotReloadMode.Disabled` and, before building, deletes all 28 files listed in `HotReloadState.json.TemporaryFiles` plus the state file itself (`HotReload.cs:241-249` → `508-552`), logging `Deleted hot-reload file: …` for each. Authoritative command:
   ```powershell
   & "C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat" WorldEngineEditor Win64 Development -Project="C:\Users\joshd\Documents\Unreal Projects\WorldEngine\WorldEngine.uproject" -WaitMutex -architecture=x64 -Progress
   ```
   Do **not** delete `Intermediate\` or `Binaries\` by hand: the suffixed files are deliberate hot-reload artefacts, `Makefile.bin` is clean (§2.4), and a manual wipe discards a large compile cache for no benefit.
4. **Verify the cleanup and the result** (after that build):
   ```powershell
   Test-Path 'C:\Users\joshd\Documents\Unreal Projects\WorldEngine\Intermediate\Build\Win64\x64\WorldEngineEditor\Development\HotReloadState.json'   # expect False
   Get-ChildItem 'C:\Users\joshd\Documents\Unreal Projects\WorldEngine\Intermediate\Build\Win64\x64\UnrealEditor\Development\WorldEngine' -Filter '*-000*.rsp'   # expect nothing
   Select-String -Path 'C:\Users\joshd\AppData\Local\UnrealBuildTool\Log.txt' -Pattern 'LNK1104|Deleted hot-reload file' | Select-Object LineNumber,Line
   ```
   A clean run shows neither `LNK1104` nor any `UnrealEditor-WorldEngine-000N.lib.rsp`, and `Log.txt` ends with `Result: Succeeded`.
5. **Build from Visual Studio as usual, with the editor closed for the duration.** MSBuild → `Build.bat` → UBT is not the problem; only `UnrealEditor.exe` matters here, so `devenv.exe` may stay open.
6. **Re-check after the C1083 fix lands** (asfdk / T1): the LNK1104 class of failure must still be absent. If it reappears, look at whether `HotReloadState.json` has been recreated — that means an editor instance came back up during the build.
7. **If a build must happen while the editor stays open**, use the supported mechanism instead of fighting the state: enable Live Coding (`[/Script/LiveCoding.LiveCodingSettings] bEnabled=True` in `Saved\Config\WindowsEditor\EditorPerProjectUserSettings.ini` — currently `False`) and compile with Live Coding (Ctrl+Alt+F11) from the editor. UBT's mode can also be forced (`-NoHotReload`, `-ForceHotReload`, `-LiveCoding`; `TargetDescriptor.cs:95-97`), but `-NoHotReload` with the editor open merely moves the failure to the write-locked canonical DLL (§2.7). **Not empirically verified by me** (I ran no builds) — it is derived from the source and flagged accordingly.
8. **If suffixed artefacts survive steps 3-4** (e.g. the state file was already gone), remove only the files the state file lists — never a wildcard over `Intermediate\`. Use the `-WhatIf`-only helper described in §6.

## 6. Recommended build/clean recipe and helper script

Preferred (nothing to run manually): close the editor → run the `Build.bat` command from §5.3 → check §5.4. UBT both cleans the hot-reload state and, on a normal editor-module build, re-links the canonical outputs.

Fallback helper (only if the state file is missing and suffixed artefacts must be swept):
`Scripts\Clear-WorldEngineEditorHotReload.ps1`

- Written with `SupportsShouldProcess` and `ConfirmImpact='High'`: `-WhatIf` prints `What if: Performing the operation …` for every path and deletes nothing; a plain run prompts for confirmation for each file; `-Confirm:$false` suppresses the prompts and performs the deletions. (Because the impact is High, a non-interactive host will refuse to run it without either `-WhatIf` or `-Confirm:$false` — that is deliberate.)
- Deletes **only** the paths listed in the given `HotReloadState.json` `TemporaryFiles` array (plus the state file itself). It never enumerates `Intermediate\` or `Binaries\`, never uses a wildcard, and refuses any path outside the project root.
- Skips files that are in use and reports them instead of failing, so it is safe to run with the editor open (it simply cannot remove the locked DLL).
- Usage:
  ```powershell
  # dry run (safe, default)
  & 'C:\Users\joshd\Documents\Unreal Projects\WorldEngine\Scripts\Clear-WorldEngineEditorHotReload.ps1' -WhatIf
  # real run, only after closing the editor
  & 'C:\Users\joshd\Documents\Unreal Projects\WorldEngine\Scripts\Clear-WorldEngineEditorHotReload.ps1' -Confirm:$false
  ```
  The `-WhatIf` output for the current state file is reproduced in §2.4 (28 files, no directories).

**Validated dry run (actually executed, deletes nothing):**

```
& 'C:\Users\joshd\Documents\Unreal Projects\WorldEngine\Scripts\Clear-WorldEngineEditorHotReload.ps1' -WhatIf

Project root : C:\Users\joshd\Documents\Unreal Projects\WorldEngine\
State file   : …\Intermediate\Build\Win64\x64\WorldEngineEditor\Development\HotReloadState.json

TemporaryFiles listed : 28
NextSuffix in state   : 3

What if: Performing the operation "Delete hot-reload file (5882 bytes, written 9/21/2026 4:22:55 PM)" on target "…\Plugins\VisualStudioTools\…\UnrealEditor-VisualStudioTools-0001.lib".
missing  : …\Plugins\NLTGovernanceSubsystem\…\UnrealEditor-NLTGovernanceSubsystem-0001.lib
What if: Performing the operation "Delete hot-reload file (315904 bytes, written 9/21/2026 4:22:56 PM)" on target "…\Plugins\VisualStudioTools\Binaries\Win64\UnrealEditor-VisualStudioTools-0001.dll".
…
What if: Performing the operation "Delete hot-reload state file" on target "…\HotReloadState.json".

Summary: deleted=0 missing=11 locked=0 refused=0 listed=28
DRY RUN (-WhatIf): nothing was deleted; "deleted=0" is expected.
```

Verification that the dry run really changed nothing (run immediately afterwards): `HotReloadState.json` → True, `UnrealEditor-WorldEngine-0001.lib.rsp` → True, `Binaries\Win64\UnrealEditor-WorldEngine.dll` → True, and `Binaries\Win64` still contains 14 entries.

## 7. Windows Defender — recommendation only, nothing executed

Measured state (read-only):

```
(Get-MpComputerStatus).RealTimeProtectionEnabled  -> True
Get-MpPreference                                  -> ExclusionPath count: 1, value: "N/A: Must be an administrator to view exclusions"
Get-MpThreatDetection                             -> 0 detections
Get-CimInstance root/SecurityCenter2 AntiVirusProduct -> (empty) no third-party AV registered
```

Real-time protection is on and the exclusion list cannot be read without elevation, so I cannot prove that the UE tree is excluded. **I changed nothing**, and on the evidence I do **not** think an exclusion is needed for this failure: the missing `.rsp` was never created by any action, and Defender has recorded zero detections (H4 in §3). An exclusion is therefore at most a latency/performance optimisation, not a fix.

If the user still wants it, here is the exact command to review and approve — **run it yourself in an elevated PowerShell; the agent did not and will not run it**:

```powershell
Add-MpPreference -ExclusionPath "C:\Users\joshd\Documents\Unreal Projects\WorldEngine\Intermediate"
```

(a companion exclusion for `"C:\Users\joshd\Documents\Unreal Projects\WorldEngine\Binaries"` can be added too; note that exclusions are machine-wide and reduce protection, and the path contains a space so the quotes are required). Verify afterwards with `(Get-MpPreference).ExclusionPath` (requires elevation).

## 8. Residual uncertainty (stated honestly)

1. **Not single-stepped.** The mechanism in §2.5 is read from the shipped UBT source and matches every observable (14 artefacts with exact sizes/timestamps, log line 123 vs 130, the state file's content). I did not attach a debugger to UBT or run a build to watch the passes execute in order, so the *exact intra-pass ordering* that leaves the `.lib` on `-0001` while the `.dll` moves to `-0002` is a code-based reconstruction. What is **directly observed** is the resulting inconsistency plus the mismatched command line and the absent file.
2. **Only one LNK1104 survives in the logs.** The user reported it twice (≈29 % and ≈39 %). `Log.txt` holds only the 17:11 run; the older run's log was rotated away (rotation is visible at `Log.txt:31-32`, and no `Log-backup-*.txt` contains `LNK1104`). I verified one occurrence in full detail and infer the second was the same failure in the 16:14/16:22 run — consistent with the artefacts it left (`-0001.exp`, `-0001.lib.rsp`), but an inference.
3. **No build was re-run.** Re-running `Build.bat` writes build outputs and belongs to T4/`build-verifier`; the "close the editor, then build" outcome in §5 is therefore a *prediction* grounded in the source and the observed state, not an observed result.
4. **`devenv.exe` cannot be formally excluded as a co-factor.** It was open (started 15:02), but nothing links it to the rsp names and UBT runs are serialised by `-WaitMutex`; treat it as irrelevant.
5. **Whether `-0002.lib.rsp` ever existed cannot be observed retroactively.** The strongest supportable statement: it is absent now, no action in the failing graph owned `-0002.lib`, and its name appears only inside a command-line string.

## 9. Quick reference: commands used to reach these conclusions

```powershell
# 1. The failing run's log
Select-String -Path 'C:\Users\joshd\AppData\Local\UnrealBuildTool\Log.txt' -Pattern 'LNK1104|0002\.lib\.rsp|Link \[x64\]'
# 2. rsp inventory with creation vs write times
Get-ChildItem -Force 'C:\Users\joshd\Documents\Unreal Projects\WorldEngine\Intermediate\Build\Win64\x64\UnrealEditor\Development\WorldEngine' |
    Sort-Object Name | Format-Table Length,LastWriteTime,CreationTime,Name -AutoSize
# 3. what each rsp targets
Select-String -Path '…\WorldEngine\*.lib.rsp','…\WorldEngine\*.dll.rsp' -Pattern '/OUT:|/NAME:'
# 4. the persisted hot-reload state (the inconsistency)
Get-Content '…\Intermediate\Build\Win64\x64\WorldEngineEditor\Development\HotReloadState.json' -Raw | ConvertFrom-Json
# 5. is the editor holding the module DLL?
try { [IO.File]::Open('…\Binaries\Win64\UnrealEditor-WorldEngine.dll','Open','ReadWrite',[IO.FileShare]::ReadWrite).Dispose(); 'not locked' }
catch { 'LOCKED: ' + $_.Exception.Message }
# 6. is a Live Coding session active? (mutex name per HotReload.cs:293-306)
try { [System.Threading.Mutex]::OpenExisting('Global\LiveCoding_C++Program+Files+Epic+Games+UE_5.8+Engine+Binaries+Win64+UnrealEditor.exe').Dispose(); 'ACTIVE' }
catch [System.Threading.WaitHandleCannotBeOpenedException] { 'no session' }
# 7. the editor-running signal UBT keys on
Get-ChildItem 'C:\Program Files\Epic Games\UE_5.8\Engine\Intermediate\EditorRuns'
# 8. is Live Coding disabled? (this is what routes builds to hot-reload-from-IDE)
Select-String -Path '…\Saved\Config\WindowsEditor\EditorPerProjectUserSettings.ini' -Pattern 'LiveCodingSettings' -Context 0,1
```

---

### Summary for the record

- **Confirmed cause:** `HotReloadMode.FromIDE` (editor running + Live Coding disabled) re-applied a stale, internally inconsistent `HotReloadState.json`; UBT's base-name string substitution (`HotReload.cs:1214-1228`) rewrote the import-library action's response-file argument from `-0001.lib.rsp` to `-0002.lib.rsp`, a file no action produces → `LNK1104`.
- **Refuted:** "locked output ⇒ unique name" fallback, concurrent builds, antivirus, MAX_PATH (156 chars), interrupted prior link, Live Coding console, UBA, and "consequence of the C1083".
- **Primary user action:** save and close the Unreal Editor, then build; UBT deletes the hot-reload state and its 28 temp files itself.
- **Independence:** fixing the C1083 will not fix the LNK1104, and the LNK1104 does not obstruct diagnosing or fixing the C1083.
