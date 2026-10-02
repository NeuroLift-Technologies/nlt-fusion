#pragma warning(disable: 4668) // __GNUC__ undefined on MSVC
#include "NLTGovernanceSubsystem.h"
#include "AgentGovernanceState.h"
#include "Modules/ModuleManager.h"

// LogNLTGovernance is declared (DECLARE_LOG_CATEGORY_EXTERN) in
// NLTGovernanceSubsystem.h and defined once in NLTGovernanceSubsystem.cpp.
// Do not DEFINE_LOG_CATEGORY here too — that was a duplicate-symbol link
// error (two definitions of the same global log category across two
// translation units in this module).

void FNLTGovernanceSubsystemModule::StartupModule()
{
    UE_LOG(LogNLTGovernance, Log, TEXT("NLTGovernanceSubsystem: ASFDK governance initialized"));
}

void FNLTGovernanceSubsystemModule::ShutdownModule()
{
    UE_LOG(LogNLTGovernance, Log, TEXT("NLTGovernanceSubsystem: ASFDK governance shutdown"));
}

IMPLEMENT_MODULE(FNLTGovernanceSubsystemModule, NLTGovernanceSubsystem)
