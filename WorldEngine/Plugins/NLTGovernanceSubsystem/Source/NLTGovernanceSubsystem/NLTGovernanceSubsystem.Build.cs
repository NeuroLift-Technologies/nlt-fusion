using UnrealBuildTool;
using System;
using System.IO;

public class NLTGovernanceSubsystem : ModuleRules
{
    public NLTGovernanceSubsystem(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[] {
            "Core",
            "CoreUObject",
            "Engine",
            "LearningAgents",
            "Json",
            "JsonUtilities",
            "GameplayTasks"
        });

        PrivateDependencyModuleNames.AddRange(new string[] {
            "Projects",
            "NavigationSystem",
            "AIModule",
            "MassEntity",
            "MassCore",
            "MassSignals",
            "MassEngine",
            "MassCommon",
            "MassSimulation",
            "Sockets",
            "Networking"
        });


        // UE 5.8 scans include paths for source files and would pick up duplicate
        // standalone_test.cpp filenames from ASFDK packages if they existed.
        // The tests directories have been renamed to tests_disabled to avoid this.
        //
        // The ASFDK headers are reached through ThirdParty/ASFDK, a Windows junction into
        // the asfdk-cplus checkout (see plugin README "Build Requirements"). A junction
        // whose target has moved keeps its name and is still reported as existing by
        // Directory.Exists, while every path underneath it resolves to nothing. UBT
        // accepts include directories that do not exist without complaint, so a moved
        // checkout used to surface two layers away, in the compiler, as
        //   AgentGovernanceState.h(10): fatal error C1083: Cannot open include file:
        //   'asfdk/ASFDK.h': No such file or directory
        // ResolveASFDKRoot() below fails the build here instead, with the fix command.
        // Set ASFDK_ROOT to the checkout to bypass the junction entirely (machines that
        // cannot create one, relocated checkouts, build agents).
        string ASFDKPath = ResolveASFDKRoot();

        // nlohmann/json.hpp is vendored TWICE in the upstream tree and the two copies differ:
        //   packages/include/nlohmann/json.hpp               944974 bytes
        //   packages/rrt-advocate/include/nlohmann/json.hpp  944740 bytes
        // packages/rrt-advocate/include cannot be dropped (rrt/RRTTypes.h includes
        // <nlohmann/json.hpp>, and every pillar header includes rrt/... headers), so both
        // copies are reachable and the compiler takes the first match in the order the
        // directories are passed. packages/include therefore stays FIRST below so the
        // vendored copy wins in every translation unit; were it absent, MSVC would
        // silently select the rrt-advocate copy and different translation units could
        // disagree about nlohmann::json (ODR hazard). Guarded explicitly below.
        // Do not reorder these entries; do not add packages/rrt-advocate/include/nlohmann.
        string[] ASFDKIncludePaths = new string[] {
            Path.Combine("packages", "include"),          // nlohmann/json.hpp, tl/expected.hpp, spdlog shim - must stay first
            Path.Combine("packages", "asfdk", "include"),
            Path.Combine("packages", "toi", "include"),
            Path.Combine("packages", "otoi", "include"),
            Path.Combine("packages", "rrt-advocate", "include"),
            Path.Combine("packages", "sleepwalker", "include")
        };

        foreach (string ASFDKRelativeIncludePath in ASFDKIncludePaths) {
            string ASFDKIncludePath = Path.Combine(ASFDKPath, ASFDKRelativeIncludePath);
            if (!Directory.Exists(ASFDKIncludePath)) {
                throw new BuildException(
                    "NLTGovernanceSubsystem: ASFDK-C++ include directory does not exist: " + ASFDKIncludePath + Environment.NewLine +
                    "  ASFDK root  : " + ASFDKPath + Environment.NewLine +
                    "  Expected    : <root>\\packages\\<package>\\include" + Environment.NewLine +
                    "  Inspect link: cmd /c dir /AL \"" + Path.GetFullPath(Path.Combine(ModuleDirectory, "..", "..", "ThirdParty")) + "\"" + Environment.NewLine +
                    "  Override    : ASFDK_ROOT=<path to the asfdk-cplus checkout>");
            }
            PublicIncludePaths.Add(ASFDKIncludePath);
        }

        // The umbrella header does #include <nlohmann/json.hpp>; without this copy the
        // differing rrt-advocate duplicate would be selected silently.
        string ASFDKVendoredJson = Path.Combine(ASFDKPath, "packages", "include", "nlohmann", "json.hpp");
        if (!File.Exists(ASFDKVendoredJson)) {
            throw new BuildException(
                "NLTGovernanceSubsystem: missing vendored JSON header: " + ASFDKVendoredJson + Environment.NewLine +
                "  packages/include must be the first ASFDK include path. Without it the copy at " + Environment.NewLine +
                "  packages/rrt-advocate/include/nlohmann/json.hpp (944740 bytes vs 944974 bytes) would be " + Environment.NewLine +
                "  picked up silently and different translation units could disagree about nlohmann::json.");
        }

        // Link the ASFDK-C++ static library (libasfdk.a), pre-built from the
        // asfdk-cplus source tree. The header-only vendored deps (nlohmann/json,
        // tl::expected, spdlog shim) are resolved via the include paths above,
        // so only the compiled ASFDK umbrella + four pillars need linking.
        // The library must be built first — see plugin README "Build Requirements".
        if (Target.Platform == UnrealTargetPlatform.Linux) {
            string ASFDKLibraryPath = Path.Combine(ASFDKPath, "lib", "libasfdk.a");
            if (!File.Exists(ASFDKLibraryPath)) {
                // Fatal on purpose. A warning does not keep this build alive: the
                // nonexistent path was still handed to the linker, so the run died
                // later with a bare "cannot open file ... libasfdk.a" that names none
                // of the fix. Fail here instead, with the same repair guidance the
                // header-root check in ResolveASFDKRoot gives.
                throw new BuildException(
                    "NLTGovernanceSubsystem: ASFDK static library missing: " + ASFDKLibraryPath + Environment.NewLine +
                    "  The ASFDK headers resolved (root = " + ASFDKPath + "), but the compiled library is not" + Environment.NewLine +
                    "  present, so linking cannot succeed." + Environment.NewLine +
                    "  Fix - build libasfdk.a from the asfdk-cplus checkout first:" + Environment.NewLine +
                    "    see the plugin README, section 'Build Requirements'" + Environment.NewLine +
                    "  Inspect the expected lib directory:" + Environment.NewLine +
                    "    dir \"" + Path.GetFullPath(Path.Combine(ASFDKPath, "lib")) + "\"");
            }
            PublicAdditionalLibraries.Add(ASFDKLibraryPath);
            PublicAdditionalLibraries.Add("c++");
        }
        // Win64: Use stub implementations for ASFDK (TODO: build ASFDK lib for Win64)
        else if (Target.Platform == UnrealTargetPlatform.Win64) {
            // Stubs compile inline — no external lib needed
        }
    }

    /// <summary>
    /// Resolves the root of the ASFDK-C++ checkout, i.e. the directory that contains
    /// "packages". ASFDK_ROOT, when set, takes precedence over the ThirdParty/ASFDK
    /// junction so the checkout can be relocated without editing this file or
    /// re-creating a link. Throws BuildException when the resolved root is unusable,
    /// rather than handing UBT include paths that silently cannot resolve.
    /// </summary>
    private string ResolveASFDKRoot()
    {
        string ASFDKRootOverride = Environment.GetEnvironmentVariable("ASFDK_ROOT");
        if (!string.IsNullOrWhiteSpace(ASFDKRootOverride)) {
            string OverridePath = Path.GetFullPath(ASFDKRootOverride.Trim());
            if (!Directory.Exists(Path.Combine(OverridePath, "packages"))) {
                throw new BuildException(
                    "NLTGovernanceSubsystem: ASFDK_ROOT is set to '" + OverridePath + "' but " + Path.Combine(OverridePath, "packages") + " does not exist." + Environment.NewLine +
                    "  Refusing to fall back to the ThirdParty/ASFDK junction: silently ignoring an explicit" + Environment.NewLine +
                    "  override is the same class of failure this check exists to prevent." + Environment.NewLine +
                    "  Point ASFDK_ROOT at the asfdk-cplus checkout (the directory containing 'packages')," + Environment.NewLine +
                    "  or clear the variable to use the junction.");
            }
            Console.WriteLine("NLTGovernanceSubsystem: ASFDK root from ASFDK_ROOT = " + OverridePath);
            return OverridePath;
        }

        string JunctionPath = Path.GetFullPath(Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "ASFDK"));
        if (!Directory.Exists(Path.Combine(JunctionPath, "packages"))) {
            throw new BuildException(
                "NLTGovernanceSubsystem: cannot find the ASFDK-C++ header root." + Environment.NewLine +
                "  Missing     : " + Path.Combine(JunctionPath, "packages") + Environment.NewLine +
                "  A junction whose target moved still exists as a reparse point (Directory.Exists returns" + Environment.NewLine +
                "  true for it) while nothing underneath it resolves, which is why this is checked here." + Environment.NewLine +
                "  Fix A - re-create the junction:" + Environment.NewLine +
                "    cmd /c rmdir \"" + JunctionPath + "\"" + Environment.NewLine +
                "    cmd /c mklink /J \"" + JunctionPath + "\" \"<path to the asfdk-cplus checkout>\"" + Environment.NewLine +
                "  Fix B - skip the junction (also works on machines that cannot create one):" + Environment.NewLine +
                "    set ASFDK_ROOT=<path to the asfdk-cplus checkout>" + Environment.NewLine +
                "  Inspect the current link:" + Environment.NewLine +
                "    cmd /c dir /AL \"" + Path.GetFullPath(Path.Combine(ModuleDirectory, "..", "..", "ThirdParty")) + "\"");
        }
        Console.WriteLine("NLTGovernanceSubsystem: ASFDK root from ThirdParty/ASFDK junction = " + JunctionPath);
        return JunctionPath;
    }
}