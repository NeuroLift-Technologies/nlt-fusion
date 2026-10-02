// NLTFusion core translation unit.
//
// The "WorldEngine" module (see WorldEngine.uproject) is implemented exactly once, by
// FWorldEngineModule in Source/WorldEngine/WorldEngine.cpp. Never add another
// IMPLEMENT_MODULE / IMPLEMENT_GAME_MODULE call for this module name here: UBT merges a
// module's .cpp files into shared unity translation units, so a second implementation
// produces C2084/C2086/C2374 errors for InitializeWorldEngineModule,
// WorldEngineInitializerEntry and IMPLEMENT_MODULE_WorldEngine.

#include "Core/NLTFusionCore.h"
#include "Modules/ModuleManager.h"

DEFINE_LOG_CATEGORY(LogNLTFusion);
