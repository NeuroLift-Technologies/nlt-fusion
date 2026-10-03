// NLTWorkplaceEnvironmentSubsystem.cpp - environment-only sim infrastructure for Workplace_Level
#include "Simulation/NLTWorkplaceEnvironmentSubsystem.h"
#include "Simulation/NLTSimulationClockSubsystem.h"
#include "Simulation/NLTDeterministicSeedSubsystem.h"
#include "Simulation/NLTRoomStateSubsystem.h"
#include "Modules/ModuleManager.h"
#include "UObject/ConstructorHelpers.h"
#include "EngineUtils.h"
#include "Particles/ParticleSystemComponent.h"
#include "Particles/ParticleSystem.h"
#include "Components/LightComponent.h"
#include "Components/SkyLightComponent.h"

DEFINE_LOG_CATEGORY(LogNLTWorkplaceEnvironment);

namespace
{
    // Standard Workplace_Level rooms (stable id + friendly display name).
    // IDs must stay stable because they are persisted in room-state data.
    struct FWorkplaceRoomDef
    {
        const TCHAR* Id;
        const TCHAR* DisplayName;
    };

    const FWorkplaceRoomDef kWorkplaceRooms[] = {
        { TEXT("Lobby"),          TEXT("Lobby") },
        { TEXT("OpenOffice"),     TEXT("Open Office") },
        { TEXT("BreakRoom"),      TEXT("Break Room") },
        { TEXT("ConferenceRoom"), TEXT("Conference Room") },
        { TEXT("MeetingRoomA"),   TEXT("Meeting Room A") },
        { TEXT("FocusRoom"),      TEXT("Focus Room") },
        { TEXT("Pantry"),         TEXT("Pantry") },
        { TEXT("Hallway"),        TEXT("Hallway") },
    };
    constexpr int32 NumWorkplaceRooms = UE_ARRAY_COUNT(kWorkplaceRooms);

    constexpr int32 kEnvironmentMagic = 0x4E4C5457; // "NLTW"
    constexpr int32 kEnvironmentVersion = 1;
}

bool UNLTWorkplaceEnvironmentSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
    if (!Super::ShouldCreateSubsystem(Outer))
    {
        return false;
    }
    const UWorld* World = Cast<UWorld>(Outer);
    return World && (World->WorldType == EWorldType::Game || World->WorldType == EWorldType::PIE || World->WorldType == EWorldType::Editor);
}

void UNLTWorkplaceEnvironmentSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    Clock = GetWorld()->GetSubsystem<UNLTSimulationClockSubsystem>();
    EventBus = GetWorld()->GetSubsystem<UNLTEventBus>();
    Seed = GetWorld()->GetSubsystem<UNLTDeterministicSeedSubsystem>();
    RoomState = GetWorld()->GetSubsystem<UNLTRoomStateSubsystem>();



    // Spawn dust motes actor for atmospheric effect
    if (GetWorld() && !DustMotesActor)
    {
        DustMotesActor = GetWorld()->SpawnActor<ADustMotesActor>();
        if (DustMotesActor && DustTemplate)
        {
            DustMotesActor->DustTemplate = DustTemplate;
        }
    }

    // Spawn post-process volume for realistic rendering
    if (GetWorld() && !PostProcessVolumeActor)
    {
        PostProcessVolumeActor = GetWorld()->SpawnActor<APostProcessVolumeActor>();
        if (PostProcessVolumeActor)
        {
            // Configure post-process settings for realistic look
            PostProcessVolumeActor->BloomIntensity = 1.5f;
            PostProcessVolumeActor->Exposure = 1.2f;
            PostProcessVolumeActor->AmbientOcclusion = 0.5f;
        }
    }

    if (Clock)
    {
        Clock->OnAuthoritativeTick.AddDynamic(this, &UNLTWorkplaceEnvironmentSubsystem::HandleAuthoritativeTick);
    }

    UE_LOG(LogNLTWorkplaceEnvironment, Log,
        TEXT("Workplace environment driver initialized (clock=%s eventBus=%s seed=%s roomState=%s sun=%s sky=%s)"),
        Clock ? TEXT("yes") : TEXT("no"),
        EventBus ? TEXT("yes") : TEXT("no"),
        Seed ? TEXT("yes") : TEXT("no"),
        RoomState ? TEXT("yes") : TEXT("no"),
        SunLight ? TEXT("yes") : TEXT("no"),
        SkyLight ? TEXT("yes") : TEXT("no"));
}

void UNLTWorkplaceEnvironmentSubsystem::Deinitialize()
{
    bRunning = false;
    if (Clock)
    {
        Clock->OnAuthoritativeTick.RemoveDynamic(this, &UNLTWorkplaceEnvironmentSubsystem::HandleAuthoritativeTick);
    }
    Super::Deinitialize();
}

void UNLTWorkplaceEnvironmentSubsystem::ConfigureEnvironment(FName ScenarioId, int32 RoomSeed, bool bStartSimulation)
{
    ActiveScenarioId = ScenarioId;
    MasterSeed = RoomSeed;
    TicksSinceLastRefresh = 0;
    LastPublishedTimeOfDayHour = -1;

    if (Seed)
    {
        Seed->SetMasterSeed(RoomSeed);
    }

    RegisterWorkplaceRooms(0);
    bConfigured = true;

    UE_LOG(LogNLTWorkplaceEnvironment, Log,
        TEXT("Workplace environment configured: scenario=%s roomSeed=%d rooms=%d"),
        *ActiveScenarioId.ToString(), MasterSeed, NumWorkplaceRooms);

    if (bStartSimulation)
    {
        StartEnvironmentSimulation();
    }
}

void UNLTWorkplaceEnvironmentSubsystem::StartEnvironmentSimulation()
{
    if (!Clock)
    {
        UE_LOG(LogNLTWorkplaceEnvironment, Warning, TEXT("StartEnvironmentSimulation: clock subsystem unavailable"));
        return;
    }
    if (bRunning)
    {
        return;
    }
    if (!bConfigured)
    {
        // A seed was never set; fall back to a fixed default so rooms still register.
        ConfigureEnvironment(NAME_None, 12345, false);
    }
    Clock->Start();
    bRunning = true;
    UE_LOG(LogNLTWorkplaceEnvironment, Log, TEXT("Workplace environment simulation started (tick=%d)"), Clock->GetCurrentTick());
}

void UNLTWorkplaceEnvironmentSubsystem::StopEnvironmentSimulation()
{
    if (Clock)
    {
        Clock->Stop();
    }
    if (!bRunning)
    {
        return;
    }
    bRunning = false;
    UE_LOG(LogNLTWorkplaceEnvironment, Log, TEXT("Workplace environment simulation stopped"));
}

void UNLTWorkplaceEnvironmentSubsystem::StepEnvironmentSimulation(int32 NumTicks)
{
    if (!Clock || !bRunning)
    {
        return;
    }
    const int32 Count = FMath::Max(0, NumTicks);
    for (int32 i = 0; i < Count; ++i)
    {
        Clock->AdvanceTick();
    }
}

void UNLTWorkplaceEnvironmentSubsystem::HandleAuthoritativeTick(int32 Tick, double /*WorldTimeSeconds*/)
{
    if (!bRunning)
    {
        return;
    }

    PublishTimeOfDay(Tick);

    ++TicksSinceLastRefresh;
    if (TicksSinceLastRefresh >= DetailRefreshIntervalTicks)
    {
        TicksSinceLastRefresh = 0;
        RefreshRooms(Tick);
    }
}

void UNLTWorkplaceEnvironmentSubsystem::RegisterWorkplaceRooms(int32 Tick)
{
    if (!RoomState)
    {
        return;
    }

    for (int32 i = 0; i < NumWorkplaceRooms; ++i)
    {
        FNLRoomState Initial;
        Initial.RoomId = FName(kWorkplaceRooms[i].Id);
        Initial.DisplayName = kWorkplaceRooms[i].DisplayName;
        Initial.LastUpdateTick = Tick;

        if (Seed)
        {
            // Deterministic initial conditions, derived from the master seed.
            Initial.LightingLevel = FMath::Clamp(Seed->GetDeterministicRange(ENLTSeedCategory::Lighting, 0.5f, 1.0f), 0.15f, 1.5f);
            Initial.NoiseLevel = FMath::Clamp(Seed->GetDeterministicRange(ENLTSeedCategory::Ambient, 0.0f, 0.3f), 0.0f, 1.0f);
            Initial.TemperatureCelsius = FMath::Clamp(Seed->GetDeterministicRange(ENLTSeedCategory::Ambient, 20.0f, 24.0f), 10.0f, 40.0f);
        }
        Initial.AmbientColor = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);

        RoomState->RegisterRoom(Initial);
    }
}

void UNLTWorkplaceEnvironmentSubsystem::RefreshRooms(int32 Tick)
{
    if (!RoomState || !Seed)
    {
        return;
    }

    const TArray<FName> RoomIds = RoomState->GetAllRoomIds();
    for (const FName RoomId : RoomIds)
    {
        FNLRoomState Current;
        if (!RoomState->GetRoomState(RoomId, Current))
        {
            continue;
        }

        const float NewLighting = FMath::Clamp(
            Current.LightingLevel + Seed->GetDeterministicRange(ENLTSeedCategory::Lighting, -0.08f, 0.08f), 0.15f, 1.5f);
        const float NewNoise = FMath::Clamp(
            Current.NoiseLevel + Seed->GetDeterministicRange(ENLTSeedCategory::Ambient, -0.05f, 0.05f), 0.0f, 1.0f);

        RoomState->SetRoomLighting(RoomId, NewLighting, Tick);
        RoomState->SetRoomNoise(RoomId, NewNoise, Tick);

        if (EventBus)
        {
            EventBus->RaiseEnvironmentEvent(
                ENLTSimulationEventType::EnvLightingChanged, Tick, RoomId,
                FString::Printf(TEXT("LightingRefresh %.2f"), NewLighting), NewLighting);
            EventBus->RaiseEnvironmentEvent(
                ENLTSimulationEventType::EnvRoomStateChanged, Tick, RoomId,
                TEXT("RoomDetailRefresh"), NewNoise);
        }
    }
}

void UNLTWorkplaceEnvironmentSubsystem::PublishTimeOfDay(int32 Tick)
{
    if (!Clock || !EventBus)
    {
        return;
    }

    const float Hours = Clock->GetTimeOfDayHours();
    const int32 Hour = FMath::FloorToInt(FMath::Fmod(FMath::Fmod(Hours, 24.0f) + 24.0f, 24.0f));
    if (Hour == LastPublishedTimeOfDayHour)
    {
        return;
    }
    LastPublishedTimeOfDayHour = Hour;

    EventBus->RaiseEnvironmentEvent(
        ENLTSimulationEventType::EnvTimeOfDayChanged, Tick, NAME_None,
        FString::Printf(TEXT("TimeOfDay %.1f"), Hours), Hours);

    // Global daylight curve: brightest around midday, dark before 6am / after 6pm.
    const float Daylight = FMath::Clamp(FMath::Sin((Hours - 6.0f) * (UE_PI / 12.0f)), 0.0f, 1.0f);
    const float GlobalLighting = FMath::Lerp(0.15f, 1.0f, Daylight);
    EventBus->RaiseEnvironmentEvent(
        ENLTSimulationEventType::EnvLightingChanged, Tick, NAME_None,
        TEXT("GlobalLighting"), GlobalLighting);

    // Apply daylight to the world's directional light (sun)
    if (SunLight)
    {
        ULightComponent* SunComponent = SunLight->GetLightComponent();
        if (SunComponent)
        {
            // Sun intensity varies from 0.2 (dawn/dusk) to 2.0 (high noon)
            const float SunIntensity = FMath::Lerp(0.2f, 2.0f, Daylight);
            SunComponent->SetIntensity(SunIntensity);

            // Sun color shifts from warm gold at noon to cool blue at dawn/dusk
            const FLinearColor SunMiddayColor(1.0f, 0.95f, 0.8f);
            const FLinearColor SunDawnDuskColor(0.5f, 0.6f, 0.8f);
            const FLinearColor SunColor = SunMiddayColor * Daylight + SunDawnDuskColor * (1.0f - Daylight);
            SunComponent->SetLightColor(SunColor);
        }
    }

    // Update ambient lighting to match time of day
    if (SkyLight)
    {
        USkyLightComponent* SkyComponent = Cast<USkyLightComponent>(SkyLight->GetLightComponent());
        if (SkyComponent)
        {
            // Ambient color shifts from warm golden to cool blue throughout the day
            const FLinearColor MorningAmbient(1.0f, 0.95f, 0.8f);
            const FLinearColor EveningAmbient(0.5f, 0.6f, 0.8f);
            const FLinearColor AmbientColor = MorningAmbient * Daylight + EveningAmbient * (1.0f - Daylight);
            SkyComponent->SetIntensity(GlobalLighting * 1000.0f);
            SkyComponent->SetLightColor(AmbientColor);
        }
    }

    // Update dust mote visibility based on time of day
    UpdateDustMotes(Daylight, Tick);
}

void UNLTWorkplaceEnvironmentSubsystem::UpdateDustMotes(float Daylight, int32 Tick)
{
    // Dust motes are more visible during dawn/dusk (low light) and settle at night
    // During bright midday, dust is less noticeable
    const float DustVisibility = FMath::Lerp(0.3f, 1.0f, 1.0f - Daylight);

    // Find and update the dust motes particle system in the level
    for (TObjectIterator<ADustMotesActor> It; It; ++It)
    {
        if (ADustMotesActor* DustActor = *It)
        {
            if (DustActor->DustParticles)
            {
                DustActor->DustParticles->SetVisibility(DustVisibility > 0.1f);
            }
        }
    }
}

void UNLTWorkplaceEnvironmentSubsystem::WriteInt32(TArray<uint8>& OutData, int32& Offset, int32 Value)
{
    OutData.AddUninitialized(sizeof(int32));
    FMemory::Memcpy(&OutData[Offset], &Value, sizeof(int32));
    Offset += sizeof(int32);
}

int32 UNLTWorkplaceEnvironmentSubsystem::ReadInt32(const TArray<uint8>& InData, int32& Offset)
{
    if (Offset + (int32)sizeof(int32) > InData.Num())
    {
        return 0;
    }
    int32 Value = 0;
    FMemory::Memcpy(&Value, &InData[Offset], sizeof(int32));
    Offset += sizeof(int32);
    return Value;
}

void UNLTWorkplaceEnvironmentSubsystem::AppendBlob(TArray<uint8>& OutData, int32& Offset, const TArray<uint8>& Blob)
{
    WriteInt32(OutData, Offset, Blob.Num());
    if (Blob.Num() > 0)
    {
        OutData.AddUninitialized(Blob.Num());
        FMemory::Memcpy(&OutData[Offset], Blob.GetData(), Blob.Num());
        Offset += Blob.Num();
    }
}

bool UNLTWorkplaceEnvironmentSubsystem::ReadBlob(const TArray<uint8>& InData, int32& Offset, TArray<uint8>& OutBlob)
{
    const int32 Size = ReadInt32(InData, Offset);
    if (Size < 0 || Offset + Size > InData.Num())
    {
        return false;
    }
    OutBlob.SetNum(Size);
    if (Size > 0)
    {
        FMemory::Memcpy(OutBlob.GetData(), &InData[Offset], Size);
        Offset += Size;
    }
    return true;
}

void UNLTWorkplaceEnvironmentSubsystem::SerializeEnvironmentState(TArray<uint8>& OutData) const
{
    OutData.Empty();
    int32 Offset = 0;

    // Header
    WriteInt32(OutData, Offset, kEnvironmentMagic);
    WriteInt32(OutData, Offset, kEnvironmentVersion);
    // Scalar state
    WriteInt32(OutData, Offset, MasterSeed);
    WriteInt32(OutData, Offset, bRunning ? 1 : 0);
    WriteInt32(OutData, Offset, LastPublishedTimeOfDayHour);
    WriteInt32(OutData, Offset, TicksSinceLastRefresh);
    // Scenario id (length + TCHAR payload)
    const FString ScenarioName = ActiveScenarioId.ToString();
    const int32 NameLen = ScenarioName.Len();
    WriteInt32(OutData, Offset, NameLen);
    if (NameLen > 0)
    {
        OutData.AddUninitialized(NameLen * (int32)sizeof(TCHAR));
        FMemory::Memcpy(&OutData[Offset], *ScenarioName, NameLen * sizeof(TCHAR));
        Offset += NameLen * (int32)sizeof(TCHAR);
    }

    // Subsystem payloads
    {
        TArray<uint8> ClockData;
        if (Clock) { Clock->SerializeClockState(ClockData); }
        AppendBlob(OutData, Offset, ClockData);
    }
    {
        TArray<uint8> SeedData;
        if (Seed) { Seed->SerializeSeedState(SeedData); }
        AppendBlob(OutData, Offset, SeedData);
    }
    {
        TArray<uint8> RoomData;
        if (RoomState) { RoomState->SerializeRoomStates(RoomData); }
        AppendBlob(OutData, Offset, RoomData);
    }
}

bool UNLTWorkplaceEnvironmentSubsystem::DeserializeEnvironmentState(const TArray<uint8>& InData)
{
    int32 Offset = 0;
    if (ReadInt32(InData, Offset) != kEnvironmentMagic)
    {
        UE_LOG(LogNLTWorkplaceEnvironment, Warning, TEXT("DeserializeEnvironmentState: bad magic"));
        return false;
    }
    if (ReadInt32(InData, Offset) < kEnvironmentVersion)
    {
        UE_LOG(LogNLTWorkplaceEnvironment, Warning, TEXT("DeserializeEnvironmentState: unsupported version"));
        return false;
    }

    MasterSeed = ReadInt32(InData, Offset);
    bRunning = ReadInt32(InData, Offset) != 0;
    LastPublishedTimeOfDayHour = ReadInt32(InData, Offset);
    TicksSinceLastRefresh = ReadInt32(InData, Offset);

    const int32 NameLen = ReadInt32(InData, Offset);
    if (NameLen < 0 || Offset + NameLen * (int32)sizeof(TCHAR) > InData.Num())
    {
        return false;
    }
    if (NameLen > 0)
    {
        TArray<TCHAR> Chars;
        Chars.SetNumUninitialized(NameLen);
        FMemory::Memcpy(Chars.GetData(), &InData[Offset], NameLen * sizeof(TCHAR));
        ActiveScenarioId = FName(FString(Chars.GetData(), NameLen));
        Offset += NameLen * (int32)sizeof(TCHAR);
    }
    else
    {
        ActiveScenarioId = NAME_None;
    }

    TArray<uint8> ClockData;
    TArray<uint8> SeedData;
    TArray<uint8> RoomData;
    if (!ReadBlob(InData, Offset, ClockData) ||
        !ReadBlob(InData, Offset, SeedData) ||
        !ReadBlob(InData, Offset, RoomData))
    {
        UE_LOG(LogNLTWorkplaceEnvironment, Warning, TEXT("DeserializeEnvironmentState: truncated payload"));
        return false;
    }

    bool bOk = true;
    if (Clock && ClockData.Num() > 0) { bOk = Clock->DeserializeClockState(ClockData) && bOk; }
    if (Seed && SeedData.Num() > 0)  { bOk = Seed->DeserializeSeedState(SeedData) && bOk; }
    if (RoomState && RoomData.Num() > 0) { bOk = RoomState->DeserializeRoomStates(RoomData) && bOk; }

    // Apply ground material improvement with normal mapping for realism
    ApplyGroundMaterialOverride();

    bConfigured = true;
    UE_LOG(LogNLTWorkplaceEnvironment, Log,
        TEXT("Workplace environment deserialized: seed=%d running=%d rooms=%d"),
        MasterSeed, bRunning ? 1 : 0, RoomState ? RoomState->GetRoomCount() : 0);
    return bOk;
}

void UNLTWorkplaceEnvironmentSubsystem::ApplyGroundMaterialOverride()
{
    // Search for a ground plane mesh and apply a material dynamic instance
    // with normal mapping for more realistic ground rendering
    if (!GetWorld()) return;

    const FName GroundMaterialName = TEXT("MI_Ground_Normal");

    // Try to find the ground plane actor or mesh component
    for (TObjectIterator<AActor> ActorIt; ActorIt; ++ActorIt)
    {
        AActor* Actor = *ActorIt;
        if (!Actor || Actor->GetWorld() != GetWorld()) continue;
        // Check for mesh components that might be the ground
        for (UActorComponent* Comp : Actor->GetComponents())
        {
            UStaticMeshComponent* MeshComp = Cast<UStaticMeshComponent>(Comp);
            if (!MeshComp) continue;

            // Check if this looks like a ground plane (large, at y=0, receives shadows)
            if (MeshComp->GetOwner()->GetActorScale3D().X > 50.0f &&
                FMath::Abs(MeshComp->GetComponentLocation().Y) < 10.0f &&
                MeshComp->GetComponentLocation().Z < 5.0f)
            {
                // Create a dynamic material instance with normal mapping
                UMaterialInterface* OriginalMat = MeshComp->GetMaterial(0);
                if (OriginalMat)
                {
                    UMaterialInstanceDynamic* DynMat = UMaterialInstanceDynamic::Create(
                        OriginalMat, MeshComp, GroundMaterialName);
                    if (DynMat)
                    {
                        // Add normal map for ground texture detail
                        // The normal map texture asset should be available in the project
                        UTexture2D* NormalMap = nullptr;
                        static ConstructorHelpers::FObjectFinder<UTexture2D> NormalMapFinder(
                            TEXT("/Environment/Materials/NormalMaps/MI_ground_nm"));
                        if (NormalMapFinder.Succeeded())
                        {
                            NormalMap = NormalMapFinder.Object;
                        }
                        else
                        {
                            // Fallback: no normal map available
                            NormalMap = nullptr;
                        }

                        if (NormalMap)
                        {
                            DynMat->SetTextureParameterValue(TEXT("NormalMap"), NormalMap);
                            DynMat->SetVectorParameterValue(TEXT("NormalScale"), FLinearColor(0.1f, 0.1f, 0.0f, 1.0f));
                            DynMat->SetScalarParameterValue(TEXT("Roughness"), 0.85f);
                            DynMat->SetScalarParameterValue(TEXT("Metalness"), 0.02f);

                            // Apply the new material
                            MeshComp->SetMaterial(0, DynMat);
                        }
                    }
                }
            }
        }
    }
}