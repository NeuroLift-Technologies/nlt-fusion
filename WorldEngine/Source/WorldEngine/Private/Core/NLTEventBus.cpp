#include "Core/NLTEventBus.h"
#include "Modules/ModuleManager.h"

DEFINE_LOG_CATEGORY(LogNLTEventBus);

void UNLTEventBus::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogNLTEventBus, Log, TEXT("Event bus initialized"));

	EventRingBuffer.SetNumZeroed(RingBufferCapacity);
	RingBufferWriteHead = 0;
	TotalEventCount = 0;
}

void UNLTEventBus::Deinitialize()
{
	UE_LOG(LogNLTEventBus, Log, TEXT("Event bus shutdown (total events raised: %d)"), TotalEventCount);
	EventRingBuffer.Empty();
	Super::Deinitialize();
}

void UNLTEventBus::RaiseEvent(const FNLTSimulationEvent& Event)
{
	if (EventRingBuffer.Num() != RingBufferCapacity)
	{
		EventRingBuffer.SetNumZeroed(RingBufferCapacity);
	}

	EventRingBuffer[RingBufferWriteHead] = Event;
	RingBufferWriteHead = (RingBufferWriteHead + 1) % RingBufferCapacity;
	++TotalEventCount;

	UE_LOG(LogNLTEventBus, Verbose, TEXT("Event raised: %s for agent %s at tick %d"),
		*StaticEnum<ENLTSimulationEventType>()->GetNameStringByValue((int64)Event.EventType),
		*Event.AgentId.ToString(),
		Event.Tick);

	OnSimulationEvent.Broadcast(Event);
}

void UNLTEventBus::RaiseSimpleEvent(ENLTSimulationEventType EventType, int32 Tick, FName AgentId, FString Description, FName TargetId, float Value)
{
	FNLTSimulationEvent NewEvent;
	NewEvent.EventType = EventType;
	NewEvent.Tick = Tick;
	NewEvent.AgentId = AgentId;
	NewEvent.Description = MoveTemp(Description);
	NewEvent.TargetId = TargetId;
	NewEvent.Value = Value;

	RaiseEvent(NewEvent);
}

void UNLTEventBus::RaiseEnvironmentEvent(ENLTSimulationEventType EventType, int32 Tick, FName RoomId, FString Description, float Value)
{
	FNLTSimulationEvent NewEvent;
	NewEvent.EventType = EventType;
	NewEvent.Tick = Tick;
	NewEvent.AgentId = NAME_None;  // No agent in environment-only mode
	NewEvent.Description = MoveTemp(Description);
	NewEvent.TargetId = RoomId;
	NewEvent.Value = Value;

	RaiseEvent(NewEvent);

	// Also broadcast on the environment-specific delegate
	OnEnvironmentEvent.Broadcast(NewEvent);
}

void UNLTEventBus::GetRecentEvents(int32 Count, TArray<FNLTSimulationEvent>& OutEvents) const
{
	OutEvents.Empty();

	const int32 NumAvailable = FMath::Min(TotalEventCount, RingBufferCapacity);
	const int32 NumToReturn = FMath::Min(Count, NumAvailable);

	for (int32 i = 0; i < NumToReturn; ++i)
	{
		const int32 Index = (RingBufferWriteHead - 1 - i + RingBufferCapacity) % RingBufferCapacity;
		OutEvents.Add(EventRingBuffer[Index]);
	}
}

void UNLTEventBus::GetEventsByType(ENLTSimulationEventType EventType, TArray<FNLTSimulationEvent>& OutEvents) const
{
	OutEvents.Empty();

	const int32 NumAvailable = FMath::Min(TotalEventCount, RingBufferCapacity);
	for (int32 i = 0; i < NumAvailable; ++i)
	{
		const int32 Index = (RingBufferWriteHead - 1 - i + RingBufferCapacity) % RingBufferCapacity;
		if (EventRingBuffer[Index].EventType == EventType)
		{
			OutEvents.Add(EventRingBuffer[Index]);
		}
	}
}
