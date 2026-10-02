#pragma once

#include "CoreMinimal.h"
#include "Core/NLTFusionCore.h"
#include "World/NLTWorldData.h"
#include "NLTWorldGenerator.generated.h"

DECLARE_LOG_CATEGORY_EXTERN(LogNLTWorldGenerator, Log, All);

/**
 * A single set-coordinate building: explicit type + exact location + yaw. Buildings are placed at
 * these coordinates verbatim (no randomization), so the same city appears on every run.
 */
USTRUCT(BlueprintType)
struct FNLTDesiredBuilding
{
    GENERATED_BODY()

    /** Building type name (Office, Apartment, Shop, School, Factory, Park, Hut). */
    UPROPERTY(BlueprintReadWrite)
    FName BuildingType;

    /** Fixed spawn location (cm). Z is ignored - the open-world subsystem raises each building
     *  onto the terrain height at spawn. */
    UPROPERTY(BlueprintReadWrite)
    FVector Location = FVector::ZeroVector;

    /** Authored rotation (usually yaw; pitch/roll kept for completeness). */
    UPROPERTY(BlueprintReadWrite)
    FRotator Rotation = FRotator::ZeroRotator;
};

USTRUCT(BlueprintType)
struct FNLTWorldGenerationParams
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite)
    int32 Seed = 12345;

    UPROPERTY(BlueprintReadWrite)
    FVector WorldSize = FVector(20000.0f, 20000.0f, 0.0f);

    UPROPERTY(BlueprintReadWrite)
    int32 NumDistricts = 4;

    /** Legacy count kept for API compatibility - building placement is driven by BuildingLayout. */
    UPROPERTY(BlueprintReadWrite)
    int32 NumBuildings = 20;

    UPROPERTY(BlueprintReadWrite)
    int32 NumRoads = 8;

    UPROPERTY(BlueprintReadWrite)
    float RoadWidth = 200.0f;

    UPROPERTY(BlueprintReadWrite)
    float BuildingDensity = 0.6f;

    UPROPERTY(BlueprintReadWrite)
    float GreenSpaceRatio = 0.2f;

    /** Fixed, authored building layout. When non-empty, GenerateBuildings places every entry
     *  verbatim (type + location + yaw) instead of random placement. Empty => warning + no buildings. */
    UPROPERTY(BlueprintReadWrite)
    TArray<FNLTDesiredBuilding> BuildingLayout;
};

USTRUCT(BlueprintType)
struct FNLTGeneratedDistrict
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite)
    FName DistrictType;

    UPROPERTY(BlueprintReadWrite)
    FVector Center = FVector::ZeroVector;

    UPROPERTY(BlueprintReadWrite)
    float Radius = 0.0f;

    UPROPERTY(BlueprintReadWrite)
    TArray<FName> Activities;

    UPROPERTY(BlueprintReadWrite)
    float NoiseLevel = 0.0f;

    UPROPERTY(BlueprintReadWrite)
    float SocialDensity = 0.0f;

    UPROPERTY(BlueprintReadWrite)
    float Privacy = 0.0f;
};

USTRUCT(BlueprintType)
struct FNLTGeneratedBuilding
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite)
    FTransform Transform;

    UPROPERTY(BlueprintReadWrite)
    FName BuildingType;

    UPROPERTY(BlueprintReadWrite)
    FNLTLocationSemanticData SemanticData;
};

USTRUCT(BlueprintType)
struct FNLTWorldGenerationResult
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite)
    TArray<FNLTGeneratedDistrict> Districts;

    UPROPERTY(BlueprintReadWrite)
    TArray<FNLTGeneratedBuilding> Buildings;

    UPROPERTY(BlueprintReadWrite)
    TArray<FTransform> RoadPoints;
};

UCLASS()
class UNLTWorldGeneratorSubsystem : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    UFUNCTION(BlueprintCallable, Category = "NLT|World")
    FNLTWorldGenerationResult GenerateWorld(const FNLTWorldGenerationParams& Params);

    UFUNCTION(BlueprintCallable, Category = "NLT|World")
    void ClearWorld();

    UFUNCTION(BlueprintPure, Category = "NLT|World")
    bool IsWorldGenerated() const { return bWorldGenerated; }

    UFUNCTION(BlueprintPure, Category = "NLT|World")
    const FNLTWorldGenerationResult& GetGeneratedWorld() const { return GeneratedWorld; }

private:
    bool bWorldGenerated = false;
    FNLTWorldGenerationResult GeneratedWorld;

    void GenerateDistricts(const FNLTWorldGenerationParams& Params, FRandomStream& Rand);
    void GenerateBuildings(const FNLTWorldGenerationParams& Params, FRandomStream& Rand);
    void GenerateRoads(const FNLTWorldGenerationParams& Params, FRandomStream& Rand);
    FNLTLocationSemanticData GenerateBuildingSemantics(FName BuildingType, FRandomStream& Rand);
};
