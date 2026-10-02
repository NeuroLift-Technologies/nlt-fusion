#pragma once

#include "CoreMinimal.h"
#include "Core/NLTSimulationState.h"

/** Stable, platform-local verification hashes for authoritative simulation state. */
class WORLDENGINE_API FNLTDeterministicStateHash
{
public:
	/** Builds the versioned canonical representation used by the hash. */
	static FString BuildCanonicalStateText(const FNLTSimulationState& State, const FNLTRandomStream* RNG = nullptr);

	/** Returns a 64-character lowercase BLAKE3 digest of the canonical state. */
	static FString ComputeStateHash(const FNLTSimulationState& State, const FNLTRandomStream* RNG = nullptr);

	/** Hashes an already-canonical UTF-8 text with the same digest algorithm. */
	static FString ComputeTextHash(const FString& CanonicalText);
};
