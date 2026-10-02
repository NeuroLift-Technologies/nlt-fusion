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

	// ----- v2: bit-exact IEEE-754 hex encoding -----

	/** Builds v2 canonical state text using bit-exact IEEE-754 hex encoding.
	 *  This removes float-formatting ambiguity between C++ and C#.
	 *  Format: "NLT.WorldEngine.State.v2\n" followed by the same structure as v1
	 *  but with all floats/doubles encoded as 8-char (float) or 16-char (double) hex.
	 *  Agent Position is encoded as a double, because FVector is FVector3d under UE5
	 *  large-world coordinates; all other agent scalars are floats. Signed zero is
	 *  canonicalised to +0 and NaN to quiet NaN so equal states always produce equal text.
	 *  NOTE: encoding a value at a different width changes the canonical text and
	 *  therefore invalidates every fixture captured with the previous encoding. */
	static FString BuildCanonicalStateTextV2(const FNLTSimulationState& State, const FNLTRandomStream* RNG = nullptr);

	/** Returns a 64-character lowercase BLAKE3 digest of the v2 canonical state. */
	static FString ComputeStateHashV2(const FNLTSimulationState& State, const FNLTRandomStream* RNG = nullptr);
};
