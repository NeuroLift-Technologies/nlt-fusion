#include "Simulation/NLTDeterministicSeedSubsystem.h"
#include "Modules/ModuleManager.h"

DEFINE_LOG_CATEGORY(LogNLTDeterministicSeed);

void UNLTDeterministicSeedSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogNLTDeterministicSeed, Log, TEXT("Deterministic seed subsystem initialized"));

	// Initialize streams with a default master seed
	CategoryStreams.SetNum(NumCategories);
	SetMasterSeed(12345);
}

void UNLTDeterministicSeedSubsystem::Deinitialize()
{
	UE_LOG(LogNLTDeterministicSeed, Log, TEXT("Deterministic seed subsystem shutdown (master seed: %d)"), MasterSeed);
	CategoryStreams.Empty();
	Super::Deinitialize();
}

int32 UNLTDeterministicSeedSubsystem::DeriveCategorySeed(int32 InMasterSeed, ENLTSeedCategory Category)
{
	// Use a simple but well-distributed hash (based on FNV-1a principles)
	// to derive a unique seed per category from the master seed.
	uint32 Hash = static_cast<uint32>(InMasterSeed);
	const uint32 CategoryValue = static_cast<uint32>(static_cast<uint8>(Category));

	// Mix master seed with category value
	Hash ^= CategoryValue;
	Hash *= 16777619u;
	Hash ^= (Hash >> 16);
	Hash *= 0x45d9f3b;
	Hash ^= (Hash >> 16);

	return static_cast<int32>(Hash & 0x7fffffff);
}

void UNLTDeterministicSeedSubsystem::SetMasterSeed(int32 InMasterSeed)
{
	MasterSeed = InMasterSeed;
	CategoryStreams.SetNum(NumCategories);

	// Derive a unique seed for each category from the master seed
	for (int32 i = 0; i < NumCategories; ++i)
	{
		const ENLTSeedCategory Cat = static_cast<ENLTSeedCategory>(i);
		const int32 DerivedSeed = DeriveCategorySeed(MasterSeed, Cat);
		CategoryStreams[i] = FNLTRandomStream(DerivedSeed);
	}

	UE_LOG(LogNLTDeterministicSeed, Log, TEXT("Master seed set to %d; %d category streams derived"), MasterSeed, NumCategories);
}

int32 UNLTDeterministicSeedSubsystem::GetCategorySeed(ENLTSeedCategory Category) const
{
	const int32 Index = static_cast<int32>(static_cast<uint8>(Category));
	if (Index < 0 || Index >= NumCategories)
	{
		return 0;
	}
	return CategoryStreams[Index].Seed;
}

const FNLTRandomStream& UNLTDeterministicSeedSubsystem::GetCategoryRNG(ENLTSeedCategory Category) const
{
	const int32 Index = FMath::Clamp(static_cast<int32>(static_cast<uint8>(Category)), 0, NumCategories - 1);
	return CategoryStreams[Index];
}

FNLTRandomStream& UNLTDeterministicSeedSubsystem::GetCategoryRNGMutable(ENLTSeedCategory Category)
{
	const int32 Index = FMath::Clamp(static_cast<int32>(static_cast<uint8>(Category)), 0, NumCategories - 1);
	return CategoryStreams[Index];
}

void UNLTDeterministicSeedSubsystem::ResetAllStreams()
{
	for (int32 i = 0; i < NumCategories; ++i)
	{
		CategoryStreams[i].Reset();
	}
	UE_LOG(LogNLTDeterministicSeed, Log, TEXT("All category streams reset"));
}

void UNLTDeterministicSeedSubsystem::ResetStream(ENLTSeedCategory Category)
{
	const int32 Index = FMath::Clamp(static_cast<int32>(static_cast<uint8>(Category)), 0, NumCategories - 1);
	CategoryStreams[Index].Reset();
}

float UNLTDeterministicSeedSubsystem::GetDeterministicFloat(ENLTSeedCategory Category)
{
	const int32 Index = FMath::Clamp(static_cast<int32>(static_cast<uint8>(Category)), 0, NumCategories - 1);
	return CategoryStreams[Index].GetFraction();
}

float UNLTDeterministicSeedSubsystem::GetDeterministicRange(ENLTSeedCategory Category, float Min, float Max)
{
	const int32 Index = FMath::Clamp(static_cast<int32>(static_cast<uint8>(Category)), 0, NumCategories - 1);
	return CategoryStreams[Index].GetRange(Min, Max);
}

int32 UNLTDeterministicSeedSubsystem::GetDeterministicInt(ENLTSeedCategory Category, int32 Min, int32 Max)
{
	const int32 Index = FMath::Clamp(static_cast<int32>(static_cast<uint8>(Category)), 0, NumCategories - 1);
	return CategoryStreams[Index].IntRange(Min, Max);
}

bool UNLTDeterministicSeedSubsystem::GetDeterministicBool(ENLTSeedCategory Category)
{
	const int32 Index = FMath::Clamp(static_cast<int32>(static_cast<uint8>(Category)), 0, NumCategories - 1);
	return CategoryStreams[Index].GetFraction() >= 0.5f;
}

int32 UNLTDeterministicSeedSubsystem::GetDeterministicIndex(ENLTSeedCategory Category, int32 ArraySize)
{
	if (ArraySize <= 0) return 0;
	const int32 Index = FMath::Clamp(static_cast<int32>(static_cast<uint8>(Category)), 0, NumCategories - 1);
	return FMath::FloorToInt(CategoryStreams[Index].GetFraction() * static_cast<float>(ArraySize));
}

void UNLTDeterministicSeedSubsystem::SerializeSeedState(TArray<uint8>& OutData) const
{
	// Seed + Calls + InitialSeed. All three fields are required to restore a
	// stream to the exact same point, including its reset behavior.
	const int32 PerStreamSize = sizeof(int32) * 3;
	OutData.Empty();
	OutData.AddUninitialized(sizeof(int32) * 2 + NumCategories * PerStreamSize);

	int32 Offset = 0;
	FMemory::Memcpy(&OutData[Offset], &MasterSeed, sizeof(int32)); Offset += sizeof(int32);
	FMemory::Memcpy(&OutData[Offset], &NumCategories, sizeof(int32)); Offset += sizeof(int32);

	for (int32 i = 0; i < NumCategories; ++i)
	{
		FMemory::Memcpy(&OutData[Offset], &CategoryStreams[i].Seed, sizeof(int32)); Offset += sizeof(int32);
		FMemory::Memcpy(&OutData[Offset], &CategoryStreams[i].Calls, sizeof(int32)); Offset += sizeof(int32);
		FMemory::Memcpy(&OutData[Offset], &CategoryStreams[i].InitialSeed, sizeof(int32)); Offset += sizeof(int32);
	}
}

bool UNLTDeterministicSeedSubsystem::DeserializeSeedState(const TArray<uint8>& InData)
{
	const int32 LegacyPerStreamSize = sizeof(int32) * 2;
	const int32 LegacyExpectedSize = sizeof(int32) * 2 + NumCategories * LegacyPerStreamSize;
	const int32 PerStreamSize = sizeof(int32) * 3;
	const int32 ExpectedSize = sizeof(int32) * 2 + NumCategories * PerStreamSize;
	if (InData.Num() < LegacyExpectedSize)
	{
		UE_LOG(LogNLTDeterministicSeed, Warning, TEXT("DeserializeSeedState: buffer too small (%d < %d)"), InData.Num(), LegacyExpectedSize);
		return false;
	}

	int32 Offset = 0;
	int32 NumRead = 0;
	FMemory::Memcpy(&MasterSeed, &InData[Offset], sizeof(int32)); Offset += sizeof(int32);
	FMemory::Memcpy(&NumRead, &InData[Offset], sizeof(int32)); Offset += sizeof(int32);

	if (NumRead != NumCategories)
	{
		UE_LOG(LogNLTDeterministicSeed, Warning, TEXT("DeserializeSeedState: category count mismatch (%d vs %d)"), NumRead, NumCategories);
		return false;
	}

	CategoryStreams.SetNum(NumCategories);
	const bool bHasInitialSeed = InData.Num() >= ExpectedSize;
	for (int32 i = 0; i < NumCategories; ++i)
	{
		FMemory::Memcpy(&CategoryStreams[i].Seed, &InData[Offset], sizeof(int32)); Offset += sizeof(int32);
		FMemory::Memcpy(&CategoryStreams[i].Calls, &InData[Offset], sizeof(int32)); Offset += sizeof(int32);
		if (bHasInitialSeed)
		{
			FMemory::Memcpy(&CategoryStreams[i].InitialSeed, &InData[Offset], sizeof(int32)); Offset += sizeof(int32);
		}
		else
		{
			// Legacy saves did not retain the stream's initial seed. Reconstruct
			// it from the master seed so future Reset calls remain deterministic.
			CategoryStreams[i].InitialSeed = DeriveCategorySeed(
				MasterSeed,
				static_cast<ENLTSeedCategory>(i));
		}
	}

	UE_LOG(LogNLTDeterministicSeed, Log, TEXT("Seed state deserialized: master=%d, categories=%d"), MasterSeed, NumCategories);
	return true;
}
