#include "NLTAgentVisualizer.h"
#include "Agents/NLTAgentFragments.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Particles/ParticleSystem.h"
#include "Particles/ParticleSystemComponent.h"
#include "Components/PostProcessComponent.h"
#include "MassEntityManager.h"
#include "MassEntitySubsystem.h"
#include "MassExecutionContext.h"

// Initialize static material parameter names
const FName ANLTAgentVisualizer::ParamStressLevel = TEXT("StressLevel");
const FName ANLTAgentVisualizer::ParamFocusLevel = TEXT("FocusLevel");
const FName ANLTAgentVisualizer::ParamTeamColor = TEXT("TeamColor");
const FName ANLTAgentVisualizer::ParamPulseIntensity = TEXT("PulseIntensity");

ANLTAgentVisualizer::ANLTAgentVisualizer()
{
    PrimaryActorTick.bCanEverTick = true;

    // Use Hierarchical ISM for better performance with many instances
    HISMComponent = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(TEXT("HISMComponent"));
    HISMComponent->NumCustomDataFloats = 1;
    RootComponent = HISMComponent;

    // Default mesh: low-poly stylized sim body (already authored at ~179.5cm,
    // feet flat at Z=0). Falls back to the engine cube if the kit asset is
    // missing so the visualizer still renders something.
    static ConstructorHelpers::FObjectFinder<UStaticMesh> SimBodyMesh(TEXT("/Game/Kits/SimBody/SM_SimBody_Base"));
    if (SimBodyMesh.Succeeded())
    {
        AgentMesh = SimBodyMesh.Object;
    }
    else
    {
        static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeMesh(TEXT("/Engine/BasicShapes/Cube"));
        if (CubeMesh.Succeeded())
        {
            AgentMesh = CubeMesh.Object;
        }
    }

    if (AgentMesh)
    {
        HISMComponent->SetStaticMesh(AgentMesh);
    }

    // Create particle system components
    StressParticleComponent = CreateDefaultSubobject<UParticleSystemComponent>(TEXT("StressParticles"));
    StressParticleComponent->SetupAttachment(RootComponent);
    StressParticleComponent->bAutoActivate = false;
    StressParticleComponent->SetWorldLocation(FVector::ZeroVector);

    FocusAuraParticleComponent = CreateDefaultSubobject<UParticleSystemComponent>(TEXT("FocusAuraParticles"));
    FocusAuraParticleComponent->SetupAttachment(RootComponent);
    FocusAuraParticleComponent->bAutoActivate = false;
    FocusAuraParticleComponent->SetWorldLocation(FVector::ZeroVector);

    // Create post process component
    PostProcessComponent = CreateDefaultSubobject<UPostProcessComponent>(TEXT("PostProcessComponent"));
    if (PostProcessComponent)
    {
        PostProcessComponent->SetupAttachment(RootComponent);
        PostProcessComponent->SetRelativeLocation(FVector::ZeroVector);
        PostProcessComponent->BlendWeight = 0.0f;
    }

    // Default values
    AgentScale = 1.0f;
    bShowDebugText = true;
    bUseTeamColors = true;
    bShowStressEffects = true;
    bShowFocusEffects = true;
    StressThresholdForEffects = 0.6f;
    FocusThresholdForEffects = 0.7f;
}

void ANLTAgentVisualizer::BeginPlay()
{
    Super::BeginPlay();
    SetupQuery();
    
    // Set up particle systems if assigned
    if (StressParticles)
    {
        StressParticleComponent->SetTemplate(StressParticles);
    }
    
    if (FocusAuraParticles)
    {
        FocusAuraParticleComponent->SetTemplate(FocusAuraParticles);
    }
}

void ANLTAgentVisualizer::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    UpdateVisuals();
}

void ANLTAgentVisualizer::SetupQuery()
{
    UWorld* World = GetWorld();
    if (!World) return;

    UMassEntitySubsystem* EntitySub = World->GetSubsystem<UMassEntitySubsystem>();
    if (!EntitySub) return;

    EntityQuery.Initialize(EntitySub->GetMutableEntityManager().AsShared());
    EntityQuery.AddRequirement<FNLTAgentIdentityFragment>(EMassFragmentAccess::ReadOnly, EMassFragmentPresence::All);
    EntityQuery.AddRequirement<FNLTAgentLocationFragment>(EMassFragmentAccess::ReadOnly, EMassFragmentPresence::All);
    EntityQuery.AddRequirement<FNLTAgentCognitiveFragment>(EMassFragmentAccess::ReadOnly, EMassFragmentPresence::All);
}

void ANLTAgentVisualizer::UpdateVisuals()
{
    UWorld* World = GetWorld();
    if (!World) return;

    UMassEntitySubsystem* EntitySub = World->GetSubsystem<UMassEntitySubsystem>();
    if (!EntitySub) return;

    FMassEntityManager& EntityManager = EntitySub->GetMutableEntityManager();

    // Clear existing instances
    HISMComponent->ClearInstances();

    TArray<FTransform> InstanceTransforms;
    TArray<FLinearColor> StateColors;
    TArray<int32> TeamIds;
    TArray<EMassAgentVisualState> States;
    TArray<ENLTVisualLODLevel> InstanceLODLevels;
    ActiveStressLocations.Empty();
    ActiveFocusLocations.Empty();

    FMassExecutionContext Context(EntityManager);
    const float LocalAgentScale = AgentScale;
    const FVector ViewerLocation = VisualLODPolicy.bUseViewerLocation
        ? FNLTVisualLODPolicy::GetViewerLocation(World, GetActorLocation())
        : GetActorLocation();
    const FNLTVisualLODPolicy LocalLODPolicy = VisualLODPolicy;
    float PulseIntensity = GetWorld() ? FMath::Sin(GetWorld()->GetTimeSeconds() * 2.0f) * 0.5f + 0.5f : 0.5f;

    EntityQuery.ForEachEntityChunk(Context, [
        &InstanceTransforms, 
        &StateColors, 
        &TeamIds, 
        &States,
        &InstanceLODLevels,
        LocalAgentScale,
        LocalLODPolicy,
        ViewerLocation,
        this
    ](FMassExecutionContext& Context)
        {
            const int32 NumEntities = Context.GetNumEntities();
            const TConstArrayView<FNLTAgentLocationFragment> Locations = Context.GetFragmentView<FNLTAgentLocationFragment>();
            const TConstArrayView<FNLTAgentCognitiveFragment> Cognition = Context.GetFragmentView<FNLTAgentCognitiveFragment>();
            const TConstArrayView<FNLTAgentIdentityFragment> Identities = Context.GetFragmentView<FNLTAgentIdentityFragment>();

            for (int32 i = 0; i < NumEntities; i++)
            {
                const float Focus = Cognition[i].Focus;
                const float Stress = Cognition[i].Stress;
                const int32 TeamId = Identities[i].TeamId;
                const EMassAgentVisualState State = GetVisualState(Stress, Focus);
                const float Distance = LocalLODPolicy.GetDistance(Locations[i].Position, ViewerLocation);
                ENLTVisualLODLevel PreviousLevel = ENLTVisualLODLevel::LOD0_Near;
                const ENLTVisualLODLevel* FoundPreviousLevel = this->AgentVisualLevels.Find(Identities[i].AgentId);
                const bool bHasPreviousLevel = FoundPreviousLevel != nullptr;
                if (FoundPreviousLevel)
                {
                    PreviousLevel = *FoundPreviousLevel;
                }
                const ENLTVisualLODLevel LODLevel = LocalLODPolicy.ResolveLevel(Distance, PreviousLevel, bHasPreviousLevel);
                this->AgentVisualLevels.Add(Identities[i].AgentId, LODLevel);
                if (LODLevel == ENLTVisualLODLevel::LOD3_Hidden)
                {
                    continue;
                }

                // Calculate color based on team and state
                FLinearColor BaseColor = GetTeamColor(TeamId);
                
                // Modify color based on stress and focus
                FLinearColor FinalColor;
                if (Stress > 0.7f)
                {
                    // High stress - shift toward red
                    FinalColor = FMath::Lerp(BaseColor, FLinearColor(1.0f, 0.2f, 0.2f, 1.0f), Stress);
                }
                else if (Stress > 0.4f)
                {
                    // Medium stress - shift toward orange
                    FinalColor = FMath::Lerp(BaseColor, FLinearColor(1.0f, 0.6f, 0.2f, 1.0f), Stress - 0.4f);
                }
                else
                {
                    // Low stress - use team color with focus enhancement
                    FinalColor = FMath::Lerp(FLinearColor(0.4f, 0.6f, 1.0f, 1.0f), BaseColor, Focus);
                }
                FinalColor.A = 0.5f + Focus * 0.5f; // Alpha based on focus

                // Track locations for particle effects
                if (Stress > StressThresholdForEffects && bShowStressEffects)
                {
                    this->ActiveStressLocations.Add(Locations[i].Position);
                }
                
                if (Focus > FocusThresholdForEffects && bShowFocusEffects)
                {
                    this->ActiveFocusLocations.Add(Locations[i].Position);
                }

                InstanceTransforms.Add(FTransform(
                    FQuat::Identity,
                    Locations[i].Position,
                    FVector(LocalAgentScale)));
                InstanceLODLevels.Add(LODLevel);
                StateColors.Add(FinalColor);
                TeamIds.Add(TeamId);
                States.Add(State);
            }
        });

    // Add instances
    for (int32 InstanceIndex = 0; InstanceIndex < InstanceTransforms.Num(); ++InstanceIndex)
    {
        const int32 AddedIndex = HISMComponent->AddInstance(InstanceTransforms[InstanceIndex]);
        if (InstanceLODLevels.IsValidIndex(InstanceIndex))
        {
            HISMComponent->SetCustomDataValue(AddedIndex, 0, static_cast<float>(InstanceLODLevels[InstanceIndex]));
        }
    }
    
    // Update materials based on state
    ApplyStateBasedMaterials(InstanceTransforms, StateColors, TeamIds, States);
    
    // Update particle effects
    if (bShowStressEffects || bShowFocusEffects)
    {
        UpdateParticleEffects(ActiveStressLocations, ActiveFocusLocations);
    }
    
    // Update global post-processing based on overall state
    float StressFactor = FMath::Clamp(ActiveStressLocations.Num() / static_cast<float>(FMath::Max(1, InstanceTransforms.Num())), 0.0f, 1.0f);
    float FocusFactor = FMath::Clamp(ActiveFocusLocations.Num() / static_cast<float>(FMath::Max(1, InstanceTransforms.Num())), 0.0f, 1.0f);
    UpdatePostProcessingEffects(StressFactor, FocusFactor);
    

}

void ANLTAgentVisualizer::ApplyStateBasedMaterials(
    const TArray<FTransform>& InstanceTransforms,
    const TArray<FLinearColor>& StateColors,
    const TArray<int32>& TeamIds,
    const TArray<EMassAgentVisualState>& States)
{
    if (InstanceTransforms.Num() == 0) return;

    if (HISMComponent->GetStaticMesh())
    {
        UMaterialInterface* BaseMat = AgentMaterial;
        if (!BaseMat)
        {
            BaseMat = HISMComponent->GetStaticMesh()->GetMaterial(0);
        }
        
        if (BaseMat)
        {
            // Create dynamic material for the instances
            UMaterialInstanceDynamic* DynMat = UMaterialInstanceDynamic::Create(BaseMat, HISMComponent);
            if (DynMat)
            {
                // Calculate average values across all agents
                FVector4 AvgColor(0, 0, 0, 0);
                float AvgStress = 0.0f;
                float AvgFocus = 0.0f;
                
                for (int32 i = 0; i < StateColors.Num(); i++)
                {
                    AvgColor.X += StateColors[i].R;
                    AvgColor.Y += StateColors[i].G;
                    AvgColor.Z += StateColors[i].B;
                    AvgColor.W += StateColors[i].A;
                }
                AvgColor /= StateColors.Num();
                
                // Use average color
                DynMat->SetVectorParameterValue(ParamTeamColor, FLinearColor(AvgColor));
                
                // Set additional parameters
                DynMat->SetScalarParameterValue(ParamPulseIntensity, GetWorld() ? FMath::Sin(GetWorld()->GetTimeSeconds() * 2.0f) * 0.5f + 0.5f : 0.5f);
                
                HISMComponent->SetMaterial(0, DynMat);
            }
        }
    }
}

void ANLTAgentVisualizer::UpdateParticleEffects(const TArray<FVector>& StressLocations, const TArray<FVector>& FocusLocations)
{
    if (!StressParticleComponent || !FocusAuraParticleComponent) return;
    
    // Update stress particles
    if (bShowStressEffects && StressLocations.Num() > 0)
    {
        if (!StressParticleComponent->IsActive())
        {
            StressParticleComponent->ActivateSystem(true);
        }
        
        // Move particles to average stress location
        FVector AvgStressLocation = FVector::ZeroVector;
        for (const FVector& Loc : StressLocations)
        {
            AvgStressLocation += Loc;
        }
        AvgStressLocation /= StressLocations.Num();
        StressParticleComponent->SetWorldLocation(AvgStressLocation);
        
        // Scale intensity based on number of stressed agents
        float Intensity = FMath::Clamp(StressLocations.Num() / 10.0f, 0.1f, 2.0f);
        StressParticleComponent->SetFloatParameter(TEXT("Intensity"), Intensity);
    }
    else if (StressParticleComponent->IsActive())
    {
        StressParticleComponent->DeactivateSystem();
    }
    
    // Update focus aura particles
    if (bShowFocusEffects && FocusLocations.Num() > 0)
    {
        if (!FocusAuraParticleComponent->IsActive())
        {
            FocusAuraParticleComponent->ActivateSystem(true);
        }
        
        // Move particles to average focus location
        FVector AvgFocusLocation = FVector::ZeroVector;
        for (const FVector& Loc : FocusLocations)
        {
            AvgFocusLocation += Loc;
        }
        AvgFocusLocation /= FocusLocations.Num();
        FocusAuraParticleComponent->SetWorldLocation(AvgFocusLocation);
        
        // Scale intensity based on number of focused agents
        float Intensity = FMath::Clamp(FocusLocations.Num() / 10.0f, 0.1f, 2.0f);
        FocusAuraParticleComponent->SetFloatParameter(TEXT("Intensity"), Intensity);
    }
    else if (FocusAuraParticleComponent->IsActive())
    {
        FocusAuraParticleComponent->DeactivateSystem();
    }
}

void ANLTAgentVisualizer::UpdatePostProcessingEffects(float StressFactor, float FocusFactor)
{
    if (!PostProcessComponent) return;
    
    // Calculate overall effect intensity
    float EffectIntensity = (StressFactor + FocusFactor) * 0.5f;
    
    // Set blend weight based on intensity
    PostProcessComponent->BlendWeight = EffectIntensity;
    
    // Additional post-processing parameters could be set here
    // based on the stress and focus factors
}

FLinearColor ANLTAgentVisualizer::GetTeamColor(int32 TeamId) const
{
    switch (TeamId % 4) // Modulo to handle any team ID
    {
        case 0: // Neutral
            return FLinearColor(0.7f, 0.7f, 0.7f, 1.0f);
        case 1: // Team A
            return FLinearColor(0.2f, 0.6f, 1.0f, 1.0f); // Blue
        case 2: // Team B
            return FLinearColor(1.0f, 0.4f, 0.2f, 1.0f); // Orange
        case 3: // Team C
            return FLinearColor(0.3f, 0.8f, 0.3f, 1.0f); // Green
        default:
            return FLinearColor(0.7f, 0.7f, 0.7f, 1.0f);
    }
}

EMassAgentVisualState ANLTAgentVisualizer::GetVisualState(float Stress, float Focus) const
{
    if (Stress > 0.8f)
    {
        return EMassAgentVisualState::Stressed;
    }
    else if (Focus > FocusThresholdForEffects)
    {
        return EMassAgentVisualState::Focused;
    }
    else if (Stress > 0.4f)
    {
        return EMassAgentVisualState::Stressed; // Medium stress
    }
    else
    {
        return EMassAgentVisualState::Normal;
    }
}
