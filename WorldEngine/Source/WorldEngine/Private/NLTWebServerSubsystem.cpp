#include "NLTWebServerSubsystem.h"
#include "Simulation/NLTSimulationSubsystem.h"
#include "Simulation/NLTSimulationClockSubsystem.h"
#include "Scenarios/Demo/NLTScenarioManagerSubsystem.h"
#include "Agents/NLTAgentSpawnerSubsystem.h"
#include "Agents/NLTAgentFragments.h"
#include "Scenarios/Demo/NLTDemoScenarioFragments.h"
#include "Agents/AvatarCharacter.h"
#include "Agents/AvatarAIController.h"
#include "Agents/LTCognitiveStateComponent.h"
#include "Core/NLTFusionCore.h"
#include "MassEntitySubsystem.h"
#include "MassEntityQuery.h"
#include "MassExecutionContext.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"
#include "IPAddress.h"
#include "Misc/CoreDelegates.h"
#include "Modules/ModuleManager.h"
#include "Async/Async.h"
#include "WebSocketNetworkingDelegates.h"
#include "INetworkingWebSocket.h"

DEFINE_LOG_CATEGORY(LogNLTWebServer);

//-------------------------------------------------------------------------------
// Avatar control targets the Mass entity system: the sim's live avatars are
// Mass entities (role Avatar) carrying scenario behavior fragments, not
// AAvatarCharacter actors. A single shared query keeps chunk/entity access
// consistent across the HTTP handlers (requirements are frozen after init).
//-------------------------------------------------------------------------------
namespace NLTWebServerAvatarEntityControl
{
	static FMassEntityQuery& GetAvatarControlQuery(UMassEntitySubsystem* InMassSub)
	{
		static FMassEntityQuery ControlQuery;
		static bool bInitialized = false;
		if (!bInitialized && InMassSub)
		{
			ControlQuery.Initialize(InMassSub->GetMutableEntityManager().AsShared());
			ControlQuery.AddRequirement<FNLTAgentIdentityFragment>(EMassFragmentAccess::ReadOnly);
			ControlQuery.AddRequirement<FNLTAgentLocationFragment>(EMassFragmentAccess::ReadWrite);
			ControlQuery.AddRequirement<FNLTAgentCognitiveFragment>(EMassFragmentAccess::ReadWrite);
			ControlQuery.AddRequirement<FNLTAgentIntentFragment>(EMassFragmentAccess::ReadWrite);
			ControlQuery.AddRequirement<FNLTScenarioBehaviorFragment>(EMassFragmentAccess::ReadWrite);
			bInitialized = true;
		}
		return ControlQuery;
	}
}

void UNLTWebServerSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Host the web server at engine boot so it (and the shared HTTP listeners,
	// including the ModelContextProtocol MCP endpoint on port 8001) are not tied
	// to any single PIE world lifecycle. Engine subsystems initialize before the
	// HTTP module is guaranteed to be loaded, so defer the start to post-engine-init.
	PostEngineInitHandle = FCoreDelegates::GetOnPostEngineInit().AddUObject(this, &UNLTWebServerSubsystem::OnPostEngineInit);
	StartWebSocketServer(WebSocketPort);
	UE_LOG(LogNLTWebServer, Log, TEXT("WebServer subsystem initialized"));
}

void UNLTWebServerSubsystem::Deinitialize()
{
	StopServer();
	StopWebSocketServer();
	FCoreDelegates::GetOnPostEngineInit().Remove(PostEngineInitHandle);
	Super::Deinitialize();
}

bool UNLTWebServerSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	return true;
}

UWorld* UNLTWebServerSubsystem::GetSimulationWorld() const
{
	if (!GEngine)
	{
		return nullptr;
	}

	// Prefer an active PIE world so we observe the live simulation when it is running.
	for (const FWorldContext& WorldContext : GEngine->GetWorldContexts())
	{
		if (WorldContext.WorldType == EWorldType::PIE && WorldContext.World())
		{
			return WorldContext.World();
		}
	}

	// Fall back to any available world (e.g. editor world, or game world).
	for (const FWorldContext& WorldContext : GEngine->GetWorldContexts())
	{
		if (WorldContext.World())
		{
			return WorldContext.World();
		}
	}

	return nullptr;
}

void UNLTWebServerSubsystem::OnPostEngineInit()
{
	StartServer(Port);
}

void UNLTWebServerSubsystem::StartServer(int32 InPort)
{
	if (bRunning)
	{
		UE_LOG(LogNLTWebServer, Warning, TEXT("Server already running on port %d"), Port);
		return;
	}

	Port = static_cast<uint32>(InPort);

	// FHttpServerModule may not be loaded yet at engine boot (it is loaded
	// lazily). Force-load it so GetHttpRouter/StartAllListeners work regardless
	// of module load order.
	FModuleManager::Get().LoadModuleChecked<FHttpServerModule>("HTTPServer");
	FHttpServerModule& HttpModule = FHttpServerModule::Get();

	HttpRouter = HttpModule.GetHttpRouter(Port, true);
	if (!HttpRouter.IsValid())
	{
		UE_LOG(LogNLTWebServer, Error, TEXT("Failed to get HTTP router for port %d"), Port);
		return;
	}

	// Register routes
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/snapshot")), EHttpServerRequestVerbs::VERB_GET,
		FHttpRequestHandler::CreateUObject(this, &UNLTWebServerSubsystem::HandleSnapshotRequest));
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/scene")), EHttpServerRequestVerbs::VERB_GET,
		FHttpRequestHandler::CreateUObject(this, &UNLTWebServerSubsystem::HandleSceneRequest));
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/status")), EHttpServerRequestVerbs::VERB_GET,
		FHttpRequestHandler::CreateUObject(this, &UNLTWebServerSubsystem::HandleStatusRequest));
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/control")), EHttpServerRequestVerbs::VERB_POST,
		FHttpRequestHandler::CreateUObject(this, &UNLTWebServerSubsystem::HandleControlRequest));
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/avatar/action")), EHttpServerRequestVerbs::VERB_POST,
		FHttpRequestHandler::CreateUObject(this, &UNLTWebServerSubsystem::HandleAvatarActionRequest));
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/avatar/state")), EHttpServerRequestVerbs::VERB_GET,
		FHttpRequestHandler::CreateUObject(this, &UNLTWebServerSubsystem::HandleAvatarStateRequest));
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/avatar/command")), EHttpServerRequestVerbs::VERB_POST,
		FHttpRequestHandler::CreateUObject(this, &UNLTWebServerSubsystem::HandleAvatarCommandRequest));

	// OPTIONS for CORS
	auto CORSHandler = FHttpRequestHandler::CreateLambda([](const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete) -> bool {
		TUniquePtr<FHttpServerResponse> Response = MakeUnique<FHttpServerResponse>();
		Response->Code = EHttpServerResponseCodes::Ok;
		Response->Headers.Add(TEXT("Access-Control-Allow-Origin"), {TEXT("*")});
		Response->Headers.Add(TEXT("Access-Control-Allow-Methods"), {TEXT("GET, POST, OPTIONS")});
		Response->Headers.Add(TEXT("Access-Control-Allow-Headers"), {TEXT("Content-Type")});
		OnComplete(MoveTemp(Response));
		return true;
	});

	HttpRouter->BindRoute(FHttpPath(TEXT("/api/snapshot")), EHttpServerRequestVerbs::VERB_OPTIONS, CORSHandler);
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/scene")), EHttpServerRequestVerbs::VERB_OPTIONS, CORSHandler);
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/status")), EHttpServerRequestVerbs::VERB_OPTIONS, CORSHandler);
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/control")), EHttpServerRequestVerbs::VERB_OPTIONS, CORSHandler);
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/avatar/action")), EHttpServerRequestVerbs::VERB_OPTIONS, CORSHandler);
	HttpRouter->BindRoute(FHttpPath(TEXT("/api/avatar/command")), EHttpServerRequestVerbs::VERB_OPTIONS, CORSHandler);

	HttpModule.StartAllListeners();
	bRunning = true;

	UE_LOG(LogNLTWebServer, Log, TEXT("Server started on port %d"), Port);
}

void UNLTWebServerSubsystem::StopServer()
{
	if (HttpRouter.IsValid())
	{
		HttpRouter.Reset();
	}
	bRunning = false;
	UE_LOG(LogNLTWebServer, Log, TEXT("Server stopped"));
}

bool UNLTWebServerSubsystem::HandleSnapshotRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
{
	TUniquePtr<FHttpServerResponse> Response = MakeUnique<FHttpServerResponse>();
	Response->Code = EHttpServerResponseCodes::Ok;
	Response->Headers.Add(TEXT("Content-Type"), {TEXT("application/json")});
	Response->Headers.Add(TEXT("Access-Control-Allow-Origin"), {TEXT("*")});

	FString SnapshotJson = JsonToStr(BuildSnapshotObject());
	FTCHARToUTF8 Converter(*SnapshotJson);
	Response->Body = TArray<uint8>((const uint8*)Converter.Get(), Converter.Length());

	OnComplete(MoveTemp(Response));
	return true;
}

bool UNLTWebServerSubsystem::HandleSceneRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
{
	FString SceneJson = BuildSceneJson();
	TUniquePtr<FHttpServerResponse> Response = MakeUnique<FHttpServerResponse>();
	Response->Code = EHttpServerResponseCodes::Ok;
	Response->Headers.Add(TEXT("Content-Type"), {TEXT("application/json")});
	Response->Headers.Add(TEXT("Access-Control-Allow-Origin"), {TEXT("*")});
	FTCHARToUTF8 Converter(*SceneJson);
	Response->Body = TArray<uint8>((const uint8*)Converter.Get(), Converter.Length());
	OnComplete(MoveTemp(Response));
	return true;
}

bool UNLTWebServerSubsystem::HandleStatusRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
{
	FString StatusJson = BuildStatusJson();
	TUniquePtr<FHttpServerResponse> Response = MakeUnique<FHttpServerResponse>();
	Response->Code = EHttpServerResponseCodes::Ok;
	Response->Headers.Add(TEXT("Content-Type"), {TEXT("application/json")});
	Response->Headers.Add(TEXT("Access-Control-Allow-Origin"), {TEXT("*")});
	FTCHARToUTF8 Converter(*StatusJson);
	Response->Body = TArray<uint8>((const uint8*)Converter.Get(), Converter.Length());
	OnComplete(MoveTemp(Response));
	return true;
}

bool UNLTWebServerSubsystem::HandleControlRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
{
	// Authorization: simulation control commands mutate game state, so they are
	// only accepted from loopback. Remote control requires token-based auth
	// (see gap analysis) before the endpoint can be exposed beyond localhost.
	const bool bIsLoopback = Request.PeerAddress.IsValid() &&
		(Request.PeerAddress->ToString(false) == TEXT("127.0.0.1") || Request.PeerAddress->ToString(false) == TEXT("::1"));
	if (!bIsLoopback)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"forbidden: control requires local access\"}")), TEXT("application/json"));
		Response->Headers.Add(TEXT("Access-Control-Allow-Origin"), {TEXT("*")});
		OnComplete(MoveTemp(Response));
		return true;
	}

	FString BodyStr;
	for (uint8 Byte : Request.Body)
	{
		BodyStr += (TCHAR)Byte;
	}

	TSharedPtr<FJsonObject> JsonObject;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(BodyStr);

	FString Action;
	if (FJsonSerializer::Deserialize(Reader, JsonObject))
	{
		JsonObject->TryGetStringField(TEXT("action"), Action);
	}

	if (Action.IsEmpty())
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"missing action\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	UWorld* World = GetSimulationWorld();
	UNLTSimulationSubsystem* SimSub = World ? World->GetSubsystem<UNLTSimulationSubsystem>() : nullptr;

	if (!SimSub)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"simulation not ready\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	bool bHandled = true;

	if (Action == TEXT("pause"))
	{
		SimSub->PauseSimulation();
	}
	else if (Action == TEXT("resume"))
	{
		SimSub->ResumeSimulation();
	}
	else if (Action == TEXT("step"))
	{
		SimSub->StepTick();
	}
	else if (Action == TEXT("toggle"))
	{
		if (SimSub->IsRunning()) SimSub->PauseSimulation();
		else SimSub->ResumeSimulation();
	}
	else if (Action == TEXT("pace"))
	{
		float NewPace = 1.0f;
		JsonObject->TryGetNumberField(TEXT("pace"), NewPace);
		SimSub->SetSimulationRate(NewPace);
	}
	else
	{
		bHandled = false;
	}

	FString ResultJson;
	if (bHandled)
	{
		ResultJson = TEXT("{\"ok\":true}");
	}
	else
	{
		ResultJson = FString::Printf(TEXT("{\"ok\":false,\"error\":\"unknown action: %s\"}"), *Action);
	}

	TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(FUtf8String(ResultJson), TEXT("application/json"));
	OnComplete(MoveTemp(Response));
	return true;
}

bool UNLTWebServerSubsystem::HandleAvatarActionRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
{
	// Only accept from loopback
	const bool bIsLoopback = Request.PeerAddress.IsValid() &&
		(Request.PeerAddress->ToString(false) == TEXT("127.0.0.1") || Request.PeerAddress->ToString(false) == TEXT("::1"));
	if (!bIsLoopback)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"only localhost allowed\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	// Read body
	FString BodyStr;
	for (const uint8& Byte : Request.Body)
	{
		BodyStr += (TCHAR)Byte;
	}

	TSharedPtr<FJsonObject> JsonObject;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(BodyStr);

	if (!FJsonSerializer::Deserialize(Reader, JsonObject))
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"invalid JSON\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	// Parse action
	float MoveX = 0.0f, MoveY = 0.0f, MoveZ = 0.0f;
	int32 Interact = 0;
	FString AvatarId;

	JsonObject->TryGetStringField(TEXT("avatar_id"), AvatarId);
	JsonObject->TryGetNumberField(TEXT("move_x"), MoveX);
	JsonObject->TryGetNumberField(TEXT("move_y"), MoveY);
	JsonObject->TryGetNumberField(TEXT("move_z"), MoveZ);
	JsonObject->TryGetNumberField(TEXT("interact"), Interact);

	// Clamp values
	MoveX = FMath::Clamp(MoveX, -1.0f, 1.0f);
	MoveY = FMath::Clamp(MoveY, -1.0f, 1.0f);
	MoveZ = FMath::Clamp(MoveZ, -1.0f, 1.0f);
	Interact = FMath::Clamp(Interact, 0, 3);

	// Find avatar and apply action
	UWorld* World = GetSimulationWorld();
	if (!World)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"no world\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	// Avatars live in the sim as Mass entities (see BuildSnapshotObject), not
	// as AAvatarCharacter actors. Resolve the requested avatar entity and drive
	// its scenario behavior fragments so the movement processor walks it.
	auto* MassSub = World->GetSubsystem<UMassEntitySubsystem>();
	if (!MassSub)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"no mass subsystem\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	FMassEntityManager& EntityManager = MassSub->GetMutableEntityManager();
	FMassEntityQuery& ControlQuery = NLTWebServerAvatarEntityControl::GetAvatarControlQuery(MassSub);
	FMassExecutionContext ExecutionContext(EntityManager);

	FString ResolvedAgentId;
	bool bFound = false;
	ControlQuery.ForEachEntityChunk(ExecutionContext, [&](FMassExecutionContext& Context)
	{
		const int32 NumEntities = Context.GetNumEntities();
		TConstArrayView<FNLTAgentIdentityFragment> Identities = Context.GetFragmentView<FNLTAgentIdentityFragment>();
		TArrayView<FNLTAgentLocationFragment> Locations = Context.GetMutableFragmentView<FNLTAgentLocationFragment>();
		TArrayView<FNLTAgentCognitiveFragment> Cognitives = Context.GetMutableFragmentView<FNLTAgentCognitiveFragment>();
		TArrayView<FNLTAgentIntentFragment> Intents = Context.GetMutableFragmentView<FNLTAgentIntentFragment>();
		TArrayView<FNLTScenarioBehaviorFragment> Behaviors = Context.GetMutableFragmentView<FNLTScenarioBehaviorFragment>();

		for (int32 i = 0; i < NumEntities && !bFound; ++i)
		{
			if (Identities[i].Role != ENLTAgentRole::Avatar)
			{
				continue;
			}
			if (!AvatarId.IsEmpty() && Identities[i].AgentId.ToString() != AvatarId)
			{
				continue;
			}

			const FVector TargetLocation = Locations[i].Position + FVector(MoveX, MoveY, 0.0f) * 100.0f;

			// Drive the scenario movement processor toward the requested target.
			Behaviors[i].TargetPosition = TargetLocation;
			Behaviors[i].bHasTarget = true;
			Behaviors[i].Phase = ENLTScenarioMovementPhase::Moving;
			// Hold the autonomous decision processor so it does not immediately overwrite the target.
			Behaviors[i].TicksSinceDecision = 0;

			// Mirror into the shared agent fragments so snapshots stay consistent.
			Locations[i].TargetPosition = TargetLocation;
			Locations[i].bIsMoving = true;
			Intents[i].TargetLocation = TargetLocation;

			if (Interact > 0)
			{
				Cognitives[i].Focus = FMath::Min(1.0f, Cognitives[i].Focus + 0.25f);
			}

			ResolvedAgentId = Identities[i].AgentId.ToString();
			bFound = true;
			UE_LOG(LogNLTWebServer, Log, TEXT("Avatar action: avatar=%s move=(%f,%f,%f) interact=%d"),
				*ResolvedAgentId, MoveX, MoveY, MoveZ, Interact);
		}
	});

	if (!bFound)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"avatar not found\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	FString ResultJson = FString::Printf(TEXT("{\"ok\":true,\"move\":[%f,%f,%f],\"interact\":%d,\"avatar_id\":\"%s\"}"),
		MoveX, MoveY, MoveZ, Interact, *ResolvedAgentId);
	TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(FUtf8String(ResultJson), TEXT("application/json"));
	OnComplete(MoveTemp(Response));
	return true;
}

bool UNLTWebServerSubsystem::HandleAvatarStateRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
{
	// Only accept from loopback
	const bool bIsLoopback = Request.PeerAddress.IsValid() &&
		(Request.PeerAddress->ToString(false) == TEXT("127.0.0.1") || Request.PeerAddress->ToString(false) == TEXT("::1"));
	if (!bIsLoopback)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"only localhost allowed\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	UWorld* World = GetSimulationWorld();
	if (!World)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"no world\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	// Avatar state comes from the Mass entity system (the sim's live agents),
	// not from AAvatarCharacter actors. Support an optional ?avatar_id= query.
	FString AvatarId;
	const FString* QueryValue = Request.QueryParams.Find(TEXT("avatar_id"));
	if (QueryValue)
	{
		AvatarId = *QueryValue;
	}

	auto* MassSub = World->GetSubsystem<UMassEntitySubsystem>();
	if (!MassSub)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"no mass subsystem\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	FMassEntityManager& EntityManager = MassSub->GetMutableEntityManager();
	FMassEntityQuery& ControlQuery = NLTWebServerAvatarEntityControl::GetAvatarControlQuery(MassSub);
	FMassExecutionContext ExecutionContext(EntityManager);

	TSharedPtr<FJsonObject> State = MakeShareable(new FJsonObject());
	bool bFound = false;
	ControlQuery.ForEachEntityChunk(ExecutionContext, [&](FMassExecutionContext& Context)
	{
		const int32 NumEntities = Context.GetNumEntities();
		TConstArrayView<FNLTAgentIdentityFragment> Identities = Context.GetFragmentView<FNLTAgentIdentityFragment>();
		TArrayView<FNLTAgentLocationFragment> Locations = Context.GetMutableFragmentView<FNLTAgentLocationFragment>();
		TArrayView<FNLTAgentCognitiveFragment> Cognitives = Context.GetMutableFragmentView<FNLTAgentCognitiveFragment>();

		for (int32 i = 0; i < NumEntities && !bFound; ++i)
		{
			if (Identities[i].Role != ENLTAgentRole::Avatar)
			{
				continue;
			}
			if (!AvatarId.IsEmpty() && Identities[i].AgentId.ToString() != AvatarId)
			{
				continue;
			}

			State->SetBoolField(TEXT("ok"), true);
			State->SetStringField(TEXT("avatar_id"), Identities[i].AgentId.ToString());
			State->SetStringField(TEXT("name"), Identities[i].DisplayName.ToString());

			TSharedPtr<FJsonObject> Pos = MakeShareable(new FJsonObject());
			Pos->SetNumberField(TEXT("x"), Locations[i].Position.X);
			Pos->SetNumberField(TEXT("y"), Locations[i].Position.Y);
			Pos->SetNumberField(TEXT("z"), Locations[i].Position.Z);
			Pos->SetNumberField(TEXT("target_x"), Locations[i].TargetPosition.X);
			Pos->SetNumberField(TEXT("target_y"), Locations[i].TargetPosition.Y);
			State->SetObjectField(TEXT("position"), Pos);
			State->SetBoolField(TEXT("moving"), Locations[i].bIsMoving);

			TSharedPtr<FJsonObject> Metrics = MakeShareable(new FJsonObject());
			Metrics->SetNumberField(TEXT("focus"), Cognitives[i].Focus);
			Metrics->SetNumberField(TEXT("cognitive_load"), Cognitives[i].CognitiveLoad);
			Metrics->SetNumberField(TEXT("stress"), Cognitives[i].Stress);
			Metrics->SetNumberField(TEXT("burnout"), Cognitives[i].Burnout);
			Metrics->SetNumberField(TEXT("independence"), Cognitives[i].Independence);
			Metrics->SetNumberField(TEXT("fusion_ready"), Cognitives[i].FusionReady);
			Metrics->SetNumberField(TEXT("success_rate"), Cognitives[i].SuccessRate);
			State->SetObjectField(TEXT("metrics"), Metrics);

			bFound = true;
		}
	});

	if (!bFound)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"no avatar found\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	FString ResultJson = JsonToStr(State);
	TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(FUtf8String(ResultJson), TEXT("application/json"));
	OnComplete(MoveTemp(Response));
	return true;
}

bool UNLTWebServerSubsystem::HandleAvatarCommandRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
{
	// Only accept from loopback — high-level avatar commands mutate game state.
	const bool bIsLoopback = Request.PeerAddress.IsValid() &&
		(Request.PeerAddress->ToString(false) == TEXT("127.0.0.1") || Request.PeerAddress->ToString(false) == TEXT("::1"));
	if (!bIsLoopback)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"only localhost allowed\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	// Read body
	FString BodyStr;
	for (const uint8& Byte : Request.Body)
	{
		BodyStr += (TCHAR)Byte;
	}

	TSharedPtr<FJsonObject> JsonObject;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(BodyStr);
	if (!FJsonSerializer::Deserialize(Reader, JsonObject))
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"invalid JSON\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	// Parse { "avatar_id": "...", "command": "...", "args": { ... } }
	FString AvatarId;
	FString Command;
	if (!JsonObject->TryGetStringField(TEXT("command"), Command) || Command.IsEmpty())
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"missing command\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}
	JsonObject->TryGetStringField(TEXT("avatar_id"), AvatarId);

	const TSharedPtr<FJsonObject> Args = JsonObject->HasField(TEXT("args")) ? JsonObject->GetObjectField(TEXT("args")) : nullptr;

	UWorld* World = GetSimulationWorld();
	if (!World)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"no world\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	// Avatars live in the sim as Mass entities, not AAvatarCharacter actors.
	auto* MassSub = World->GetSubsystem<UMassEntitySubsystem>();
	if (!MassSub)
	{
		TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
			FUtf8String(TEXT("{\"ok\":false,\"error\":\"no mass subsystem\"}")), TEXT("application/json"));
		OnComplete(MoveTemp(Response));
		return true;
	}

	FMassEntityManager& EntityManager = MassSub->GetMutableEntityManager();
	FMassEntityQuery& ControlQuery = NLTWebServerAvatarEntityControl::GetAvatarControlQuery(MassSub);
	FMassExecutionContext ExecutionContext(EntityManager);

	float CmdX = 0.0f, CmdY = 0.0f;
	if (Args.IsValid())
	{
		Args->TryGetNumberField(TEXT("x"), CmdX);
		Args->TryGetNumberField(TEXT("y"), CmdY);
	}

	FString ResolvedAgentId;
	FString OutMessage;
	bool bOk = false;
	ControlQuery.ForEachEntityChunk(ExecutionContext, [&](FMassExecutionContext& Context)
	{
		const int32 NumEntities = Context.GetNumEntities();
		TConstArrayView<FNLTAgentIdentityFragment> Identities = Context.GetFragmentView<FNLTAgentIdentityFragment>();
		TArrayView<FNLTAgentLocationFragment> Locations = Context.GetMutableFragmentView<FNLTAgentLocationFragment>();
		TArrayView<FNLTAgentCognitiveFragment> Cognitives = Context.GetMutableFragmentView<FNLTAgentCognitiveFragment>();
		TArrayView<FNLTAgentIntentFragment> Intents = Context.GetMutableFragmentView<FNLTAgentIntentFragment>();
		TArrayView<FNLTScenarioBehaviorFragment> Behaviors = Context.GetMutableFragmentView<FNLTScenarioBehaviorFragment>();

		for (int32 i = 0; i < NumEntities && !bOk; ++i)
		{
			if (Identities[i].Role != ENLTAgentRole::Avatar)
			{
				continue;
			}
			if (!AvatarId.IsEmpty() && Identities[i].AgentId.ToString() != AvatarId)
			{
				continue;
			}

			ResolvedAgentId = Identities[i].AgentId.ToString();

			const FString CmdLower = Command.ToLower();
			if (CmdLower == TEXT("move") || CmdLower == TEXT("goto") ||
				CmdLower == TEXT("move_to") || CmdLower == TEXT("move_by"))
			{
				FVector Target = Locations[i].Position;
				if (Args.IsValid() && Args->HasField(TEXT("x")) && Args->HasField(TEXT("y")))
				{
					// Absolute target when x/y are provided (move_to).
					Target = FVector(CmdX, CmdY, 0.0f);
				}
				else
				{
					// Relative step when dx/dy are provided (move_by, in world units; cm).
					float Dx = 0.0f, Dy = 0.0f;
					if (Args.IsValid())
					{
						Args->TryGetNumberField(TEXT("dx"), Dx);
						Args->TryGetNumberField(TEXT("dy"), Dy);
					}
					Target += FVector(Dx, Dy, 0.0f);
				}

				Behaviors[i].TargetPosition = Target;
				Behaviors[i].bHasTarget = true;
				Behaviors[i].Phase = ENLTScenarioMovementPhase::Moving;
				Behaviors[i].TicksSinceDecision = 0;
				Locations[i].TargetPosition = Target;
				Locations[i].bIsMoving = true;
				Intents[i].TargetLocation = Target;
				OutMessage = FString::Printf(TEXT("avatar moving to (%.0f, %.0f)"), Target.X, Target.Y);
				bOk = true;
			}
			else if (CmdLower == TEXT("move_to_object"))
			{
				FString ObjectId;
				if (Args.IsValid())
				{
					Args->TryGetStringField(TEXT("object_id"), ObjectId);
				}
				// Match by actor name. For now, treat the object_id as a relative offset hint
				// (snap to a nearby grid point). Full actor lookup requires World actor iteration.
				FVector Target = Locations[i].Position + FVector(500.0f, 0.0f, 0.0f);
				Behaviors[i].TargetPosition = Target;
				Behaviors[i].bHasTarget = true;
				Behaviors[i].Phase = ENLTScenarioMovementPhase::Moving;
				Behaviors[i].TicksSinceDecision = 0;
				Locations[i].TargetPosition = Target;
				Locations[i].bIsMoving = true;
				Intents[i].TargetLocation = Target;
				OutMessage = FString::Printf(TEXT("avatar moving toward object '%s' (%.0f, %.0f)"),
					*ObjectId, Target.X, Target.Y);
				bOk = true;
			}
			else if (CmdLower == TEXT("face_towards"))
			{
				FVector FacingTarget = FVector(CmdX, CmdY, 0.0f);
				Intents[i].TargetLocation = FacingTarget;
				OutMessage = FString::Printf(TEXT("avatar facing (%.0f, %.0f)"), CmdX, CmdY);
				bOk = true;
			}
			else if (CmdLower == TEXT("stop") || CmdLower == TEXT("halt") ||
				CmdLower == TEXT("idle") || CmdLower == TEXT("wait"))
			{
				Behaviors[i].bHasTarget = false;
				Behaviors[i].Phase = ENLTScenarioMovementPhase::Idle;
				Behaviors[i].TargetPosition = Locations[i].Position;
				Locations[i].bIsMoving = false;
				Locations[i].TargetPosition = Locations[i].Position;
				Intents[i].TargetLocation = Locations[i].Position;
				OutMessage = TEXT("avatar stopped");
				bOk = true;
			}
			else if (CmdLower == TEXT("release"))
			{
				Behaviors[i].bHasTarget = false;
				Behaviors[i].Phase = ENLTScenarioMovementPhase::Idle;
				Behaviors[i].TicksSinceDecision = 0;
				Locations[i].bIsMoving = false;
				OutMessage = TEXT("control released to autonomous AI");
				bOk = true;
			}
			else if (CmdLower == TEXT("focus"))
			{
				Cognitives[i].Focus = 1.0f;
				OutMessage = TEXT("focus set to 1.0");
				bOk = true;
			}
			else
			{
				OutMessage = FString::Printf(TEXT("unsupported command for entity avatar: %s"), *Command);
			}

			if (bOk)
			{
				UE_LOG(LogNLTWebServer, Log, TEXT("Avatar command: avatar=%s command=%s ok=1 message=%s"),
					*ResolvedAgentId, *Command, *OutMessage);
			}
		}
	});

	if (!bOk)
	{
		if (ResolvedAgentId.IsEmpty())
		{
			TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(
				FUtf8String(TEXT("{\"ok\":false,\"error\":\"avatar not found\"}")), TEXT("application/json"));
			OnComplete(MoveTemp(Response));
			return true;
		}
		OutMessage = FString::Printf(TEXT("unsupported command for avatar: %s"), *Command);
	}

	const FString ResultJson = bOk
		? FString::Printf(TEXT("{\"ok\":true,\"command\":\"%s\",\"message\":\"%s\",\"avatar_id\":\"%s\",\"llm_control\":false}"),
			*Command, *OutMessage, *ResolvedAgentId)
		: FString::Printf(TEXT("{\"ok\":false,\"error\":\"%s\"}"), *OutMessage);

	TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(FUtf8String(ResultJson), TEXT("application/json"));
	OnComplete(MoveTemp(Response));
	return true;
}

TSharedPtr<FJsonObject> UNLTWebServerSubsystem::BuildSnapshotObject()
{
	UWorld* World = GetSimulationWorld();
	auto* SimSub = World ? World->GetSubsystem<UNLTSimulationSubsystem>() : nullptr;
	auto* ClockSub = World ? World->GetSubsystem<UNLTSimulationClockSubsystem>() : nullptr;

	// Derive the room id from the currently loaded level (e.g. "Workplace_Level" -> "workplace")
	// so the API reports where avatars actually are instead of a hardcoded value.
	FString RoomId = TEXT("workplace");
	if (World)
	{
		RoomId = UGameplayStatics::GetCurrentLevelName(World);
		RoomId.RemoveFromEnd(TEXT("_Level"));
		RoomId.ToLowerInline();
	}

	TSharedPtr<FJsonObject> SnapshotObject = MakeShareable(new FJsonObject());
	SnapshotObject->SetStringField(TEXT("contract_version"), TEXT("nlt.world-engine.v1"));
	SnapshotObject->SetStringField(TEXT("snapshot_id"), FString::Printf(TEXT("snapshot-%d"), RequestCounter++));

	// Simulation state
	TSharedPtr<FJsonObject> SimObject = MakeShareable(new FJsonObject());
	SimObject->SetStringField(TEXT("simulation_id"), TEXT("ue5-sim"));
	SimObject->SetStringField(TEXT("state"), SimSub && SimSub->IsRunning() ? TEXT("running") : TEXT("paused"));
	SimObject->SetNumberField(TEXT("tick"), SimSub ? SimSub->GetCurrentTick() : 0);
	SimObject->SetNumberField(TEXT("sim_time"), ClockSub ? (ClockSub->GetWorldTimeSeconds() / 60.0) : 0.0);
	SimObject->SetNumberField(TEXT("seed"), 42);
	SimObject->SetNumberField(TEXT("pace"), SimSub ? SimSub->GetSimulationRate() : 1.0f);
	SnapshotObject->SetObjectField(TEXT("simulation"), SimObject);

	// Avatars - get from Mass Entity system
	TSharedPtr<FJsonObject> AvatarsObject = MakeShareable(new FJsonObject());
	auto* MassSub = World ? World->GetSubsystem<UMassEntitySubsystem>() : nullptr;
	if (MassSub && World->bIsWorldInitialized)
	{
		FMassEntityManager& EntityManager = const_cast<FMassEntityManager&>(MassSub->GetEntityManager());
		// Use a pre-constructed shared query to avoid re-adding requirements at runtime
		// (FMassFragmentRequirements::AddRequirement fails after MassEntity initialization)
		static FMassEntityQuery AvatarQuery;
		static bool bQueryInitialized = false;
		if (!bQueryInitialized)
		{
			AvatarQuery.Initialize(MassSub->GetMutableEntityManager().AsShared());
			AvatarQuery.AddRequirement<FNLTAgentIdentityFragment>(EMassFragmentAccess::ReadOnly);
			AvatarQuery.AddRequirement<FNLTAgentLocationFragment>(EMassFragmentAccess::ReadOnly);
			AvatarQuery.AddRequirement<FNLTAgentCognitiveFragment>(EMassFragmentAccess::ReadOnly);
			bQueryInitialized = true;
		}

		FMassExecutionContext ExecutionContext(EntityManager);
		AvatarQuery.ForEachEntityChunk(ExecutionContext, [this, &AvatarsObject, &RoomId](FMassExecutionContext& Context)
		{
			const TArrayView<const FNLTAgentIdentityFragment>& Identities = Context.GetFragmentView<FNLTAgentIdentityFragment>();
			const TArrayView<const FNLTAgentLocationFragment>& Locations = Context.GetFragmentView<FNLTAgentLocationFragment>();
			const TArrayView<const FNLTAgentCognitiveFragment>& Cognitives = Context.GetFragmentView<FNLTAgentCognitiveFragment>();

			for (int32 i = 0; i < Context.GetNumEntities(); ++i)
			{
				const FNLTAgentIdentityFragment& Identity = Identities[i];
				if (Identity.Role == ENLTAgentRole::Avatar)
				{
					TSharedPtr<FJsonObject> AvatarObject = MakeShareable(new FJsonObject());
					AvatarObject->SetStringField(TEXT("id"), Identity.AgentId.ToString());
					AvatarObject->SetStringField(TEXT("name"), Identity.DisplayName.ToString());
					AvatarObject->SetStringField(TEXT("trait"), TEXT("ADHD Trait"));
					AvatarObject->SetStringField(TEXT("state"), TEXT("working"));
					AvatarObject->SetStringField(TEXT("emotional_state"), TEXT("neutral"));

					const FNLTAgentCognitiveFragment& Cognitive = Cognitives[i];
					TSharedPtr<FJsonObject> MetricsObject = MakeShareable(new FJsonObject());
					MetricsObject->SetNumberField(TEXT("focus"), Cognitive.Focus);
					MetricsObject->SetNumberField(TEXT("cognitive_load"), Cognitive.CognitiveLoad);
					MetricsObject->SetNumberField(TEXT("stress"), Cognitive.Stress);
					MetricsObject->SetNumberField(TEXT("burnout_risk"), Cognitive.Burnout);
					MetricsObject->SetNumberField(TEXT("independence"), Cognitive.Independence);
					MetricsObject->SetNumberField(TEXT("fusion_readiness"), Cognitive.FusionReady);
					MetricsObject->SetNumberField(TEXT("success_rate"), Cognitive.SuccessRate);
					AvatarObject->SetObjectField(TEXT("metrics"), MetricsObject);

					const FNLTAgentLocationFragment& Location = Locations[i];
					TSharedPtr<FJsonObject> PosObject = MakeShareable(new FJsonObject());
					PosObject->SetStringField(TEXT("room_id"), *RoomId);
					PosObject->SetNumberField(TEXT("x"), Location.Position.X);
					PosObject->SetNumberField(TEXT("y"), Location.Position.Y);
					PosObject->SetNumberField(TEXT("target_x"), Location.TargetPosition.X);
					PosObject->SetNumberField(TEXT("target_y"), Location.TargetPosition.Y);
					PosObject->SetStringField(TEXT("facing"), TEXT("south"));
					AvatarObject->SetObjectField(TEXT("position"), PosObject);

					TSharedPtr<FJsonObject> CountersObject = MakeShareable(new FJsonObject());
					CountersObject->SetNumberField(TEXT("minutes_focused"), 0.0f);
					CountersObject->SetNumberField(TEXT("false_starts"), 0);
					CountersObject->SetNumberField(TEXT("interventions"), 0);
					CountersObject->SetNumberField(TEXT("successes"), 0);
					CountersObject->SetNumberField(TEXT("failures"), 0);
					AvatarObject->SetObjectField(TEXT("counters"), CountersObject);

					TSharedPtr<FJsonObject> ExtObject = MakeShareable(new FJsonObject());
					ExtObject->SetNumberField(TEXT("hue"), 200.0f);
					ExtObject->SetStringField(TEXT("tag"), TEXT("SA"));
					AvatarObject->SetObjectField(TEXT("extensions"), ExtObject);

					AvatarsObject->SetObjectField(Identity.AgentId.ToString(), AvatarObject);
				}
			}
		});
	}
	SnapshotObject->SetObjectField(TEXT("avatars"), AvatarsObject);

	// Entities
	TSharedPtr<FJsonObject> EntitiesObject = MakeShareable(new FJsonObject());
	SnapshotObject->SetObjectField(TEXT("entities"), EntitiesObject);

	// Extensions
	TSharedPtr<FJsonObject> ExtObject = MakeShareable(new FJsonObject());
	ExtObject->SetStringField(TEXT("scene_id"), TEXT("ue5_world"));
	auto* ClockSub2 = World ? World->GetSubsystem<UNLTSimulationClockSubsystem>() : nullptr;
	if (ClockSub2)
	{
		float TimeOfDay = ClockSub2->GetTimeOfDayHours();
		int32 Days = ClockSub2->GetDaysElapsed();
		int32 Hours = FMath::FloorToInt(TimeOfDay);
		int32 Minutes = FMath::FloorToInt((TimeOfDay - Hours) * 60.0f);
		FString IsoTime = FString::Printf(TEXT("2026-01-%02dT%02d:%02d:00"), Days + 1, Hours, Minutes);
		ExtObject->SetStringField(TEXT("simulation_time_iso"), IsoTime);
	}
	SnapshotObject->SetObjectField(TEXT("extensions"), ExtObject);

	return SnapshotObject;
}

FString UNLTWebServerSubsystem::BuildSceneJson()
{
	TSharedPtr<FJsonObject> SceneObject = MakeShareable(new FJsonObject());
	SceneObject->SetStringField(TEXT("contract_version"), TEXT("nlt.world-engine.v1"));
	SceneObject->SetStringField(TEXT("scene_id"), TEXT("ue5_world"));

	TSharedPtr<FJsonObject> GridObject = MakeShareable(new FJsonObject());
	GridObject->SetNumberField(TEXT("width"), 100);
	GridObject->SetNumberField(TEXT("height"), 100);
	SceneObject->SetObjectField(TEXT("grid"), GridObject);

	TArray<TSharedPtr<FJsonValue>> RoomsArray;
	TArray<FName> RoomNames = {TEXT("workplace"), TEXT("meeting"), TEXT("home"), TEXT("lounge"), TEXT("office")};
	for (const FName& RoomName : RoomNames)
	{
		TSharedPtr<FJsonObject> RoomObject = MakeShareable(new FJsonObject());
		RoomObject->SetStringField(TEXT("id"), RoomName.ToString());
		RoomObject->SetStringField(TEXT("name"), RoomName.ToString());
		RoomsArray.Add(MakeShareable(new FJsonValueObject(RoomObject)));
	}
	SceneObject->SetArrayField(TEXT("rooms"), RoomsArray);

	return JsonToStr(SceneObject);
}

FString UNLTWebServerSubsystem::BuildStatusJson()
{
	UWorld* World = GetSimulationWorld();
	auto* SimSub = World ? World->GetSubsystem<UNLTSimulationSubsystem>() : nullptr;

	TSharedPtr<FJsonObject> StatusObject = MakeShareable(new FJsonObject());
	StatusObject->SetBoolField(TEXT("running"), SimSub ? SimSub->IsRunning() : false);
	StatusObject->SetNumberField(TEXT("pace"), SimSub ? SimSub->GetSimulationRate() : 1.0f);
	StatusObject->SetStringField(TEXT("snapshot"), JsonToStr(BuildSnapshotObject()));

	return JsonToStr(StatusObject);
}

FString UNLTWebServerSubsystem::BuildEventsJson()
{
	FScopeLock Lock(&EventMutex);

	TArray<TSharedPtr<FJsonValue>> EventsArray;
	for (const FString& EventStr : EventBuffer)
	{
		EventsArray.Add(MakeShareable(new FJsonValueString(EventStr)));
	}

	TSharedPtr<FJsonObject> EventsObject = MakeShareable(new FJsonObject());
	EventsObject->SetArrayField(TEXT("events"), EventsArray);

	return JsonToStr(EventsObject);
}

FString UNLTWebServerSubsystem::JsonToStr(TSharedPtr<FJsonObject> Obj)
{
	FString OutputString;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutputString);
	FJsonSerializer::Serialize(Obj.ToSharedRef(), Writer);
	return OutputString;
}

void UNLTWebServerSubsystem::BroadcastEvent(const FString& EventType, const FString& Message, const FString& SourceId, const FString& SourceType)
{
	FScopeLock Lock(&EventMutex);

	TSharedPtr<FJsonObject> EventObject = MakeShareable(new FJsonObject());
	EventObject->SetStringField(TEXT("event_type"), EventType);
	EventObject->SetStringField(TEXT("message"), Message);
	EventObject->SetStringField(TEXT("source_id"), SourceId);
	EventObject->SetStringField(TEXT("source_type"), SourceType);

	FString EventStr = JsonToStr(EventObject);

	EventBuffer.Add(EventStr);
	if (EventBuffer.Num() > EventBufferSize)
	{
		EventBuffer.RemoveAt(0);
	}
}

void UNLTWebServerSubsystem::StartWebSocketServer(int32 InWebSocketPort)
{
	if (WebSocketServer.IsValid())
	{
		UE_LOG(LogNLTWebServer, Warning, TEXT("WebSocket server already running on port %d"), WebSocketPort);
		return;
	}

	FModuleManager::Get().LoadModuleChecked<FDefaultModuleImpl>(TEXT("WebSocketNetworking"));
	IWebSocketNetworkingModule& WebSocketModule = FModuleManager::GetModuleChecked<IWebSocketNetworkingModule>(TEXT("WebSocketNetworking"));
	WebSocketServer = WebSocketModule.CreateServer();
	if (!WebSocketServer.IsValid())
	{
		UE_LOG(LogNLTWebServer, Error, TEXT("Failed to create WebSocket server"));
		return;
	}

	WebSocketPort = InWebSocketPort;
	FWebSocketClientConnectedCallBack Connected = FWebSocketClientConnectedCallBack::CreateLambda([this](INetworkingWebSocket* Socket)
	{
		if (Socket == nullptr) return;
		TSharedPtr<INetworkingWebSocket> SharedSocket(Socket, [](INetworkingWebSocket*) {});
		Socket->SetReceiveCallBack(FWebSocketPacketReceivedCallBack::CreateLambda([this, SharedSocket](void* Data, int32 Size)
		{
			if (IsInGameThread())
			{
				HandleWebSocketMessage(SharedSocket, Data, Size);
				return;
			}

			TArray<uint8> Payload;
			Payload.SetNumUninitialized(Size);
			FMemory::Memcpy(Payload.GetData(), Data, Size);
			AsyncTask(ENamedThreads::GameThread, [this, SharedSocket, Payload = MoveTemp(Payload)]()
			{
				HandleWebSocketMessage(SharedSocket, Payload.GetData(), Payload.Num());
			});
		}));
		Socket->SetSocketClosedCallBack(FWebSocketInfoCallBack::CreateLambda([this, SharedSocket]()
		{
			WebSocketClients.Remove(SharedSocket);
		}));
		WebSocketClients.Add(SharedSocket);
	});
	if (!WebSocketServer->Init(static_cast<uint32>(WebSocketPort), Connected, TEXT("127.0.0.1")))
	{
		WebSocketServer.Reset();
		UE_LOG(LogNLTWebServer, Error, TEXT("Failed to start WebSocket server on port %d"), WebSocketPort);
		return;
	}
	UE_LOG(LogNLTWebServer, Log, TEXT("Fusion WebSocket server started on ws://127.0.0.1:%d"), WebSocketPort);
}

void UNLTWebServerSubsystem::StopWebSocketServer()
{
	WebSocketClients.Reset();
	if (WebSocketServer.IsValid())
	{
		WebSocketServer.Reset();
		UE_LOG(LogNLTWebServer, Log, TEXT("Fusion WebSocket server stopped"));
	}
}

void UNLTWebServerSubsystem::SendWebSocketEnvelope(TSharedPtr<INetworkingWebSocket> Socket, const TSharedPtr<FJsonObject>& Message)
{
	if (!Socket.IsValid() || !Message.IsValid()) return;
	const FString Json = JsonToStr(Message);
	FTCHARToUTF8 Utf8(*Json);
	Socket->Send(reinterpret_cast<const uint8*>(Utf8.Get()), static_cast<uint32>(Utf8.Length()), false);
}

void UNLTWebServerSubsystem::HandleWebSocketMessage(TSharedPtr<INetworkingWebSocket> Socket, const void* Data, int32 Size)
{
	if (!Socket.IsValid() || Data == nullptr || Size <= 0) return;
	FString Body;
	Body.Append(static_cast<const ANSICHAR*>(Data), Size);
	TSharedPtr<FJsonObject> Request;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
	if (!FJsonSerializer::Deserialize(Reader, Request))
	{
		TSharedPtr<FJsonObject> ResponsePayload = MakeShared<FJsonObject>();
		ResponsePayload->SetStringField(TEXT("status"), TEXT("rejected"));
		TSharedPtr<FJsonObject> Error = MakeShared<FJsonObject>();
		Error->SetStringField(TEXT("code"), TEXT("invalid_envelope"));
		Error->SetStringField(TEXT("message"), TEXT("message is not valid JSON"));
		ResponsePayload->SetObjectField(TEXT("error"), Error);
		TSharedPtr<FJsonObject> Response = MakeShared<FJsonObject>();
		Response->SetStringField(TEXT("protocol"), TEXT("nlt.fusion-unreal"));
		Response->SetStringField(TEXT("protocol_version"), TEXT("1.0"));
		Response->SetStringField(TEXT("message_type"), TEXT("ack"));
		Response->SetStringField(TEXT("message_id"), FGuid::NewGuid().ToString(EGuidFormats::Digits));
		Response->SetStringField(TEXT("session_id"), TEXT("invalid"));
		Response->SetObjectField(TEXT("payload"), ResponsePayload);
		SendWebSocketEnvelope(Socket, Response);
		return;
	}

	FString Protocol;
	FString Version;
	FString SessionId;
	FString MessageId;
	FString MessageType;
	Request->TryGetStringField(TEXT("protocol"), Protocol);
	Request->TryGetStringField(TEXT("protocol_version"), Version);
	Request->TryGetStringField(TEXT("session_id"), SessionId);
	Request->TryGetStringField(TEXT("message_id"), MessageId);
	Request->TryGetStringField(TEXT("message_type"), MessageType);
	FString AgentId;
	Request->TryGetStringField(TEXT("agent_id"), AgentId);

	const TSharedPtr<FJsonObject>* Payload = nullptr;
	Request->TryGetObjectField(TEXT("payload"), Payload);
	TSharedPtr<FJsonObject> ResponsePayload = MakeShared<FJsonObject>();
	FString ErrorCode;
	FString ErrorMessage;
	if (Protocol != TEXT("nlt.fusion-unreal")) { ErrorCode = TEXT("invalid_envelope"); ErrorMessage = TEXT("unknown protocol"); }
	else if (Version != TEXT("1.0")) { ErrorCode = TEXT("unsupported_version"); ErrorMessage = TEXT("only protocol version 1.0 is supported"); }
	else if (SessionId.IsEmpty() || MessageId.IsEmpty()) { ErrorCode = TEXT("invalid_envelope"); ErrorMessage = TEXT("session_id and message_id are required"); }
	else if (MessageType == TEXT("ping")) { ResponsePayload->SetStringField(TEXT("status"), TEXT("accepted")); }
	else if (MessageType == TEXT("snapshot")) { ResponsePayload->SetObjectField(TEXT("snapshot"), BuildSnapshotObject()); }
	else if (MessageType == TEXT("action")) { FString AppliedAgentId; if (Payload != nullptr && ExecuteAuthoritativeAvatarAction(*Payload, AppliedAgentId, ErrorMessage)) { ResponsePayload->SetStringField(TEXT("agent_id"), AppliedAgentId); } else { ErrorCode = TEXT("invalid_action"); } }
	else { ErrorCode = TEXT("unsupported_type"); ErrorMessage = FString::Printf(TEXT("unsupported message_type: %s"), *MessageType); }

	ResponsePayload->SetStringField(TEXT("status"), ErrorCode.IsEmpty() ? TEXT("accepted") : TEXT("rejected"));
	if (!ErrorCode.IsEmpty())
	{
		TSharedPtr<FJsonObject> Error = MakeShared<FJsonObject>();
		Error->SetStringField(TEXT("code"), ErrorCode);
		Error->SetStringField(TEXT("message"), ErrorMessage);
		ResponsePayload->SetObjectField(TEXT("error"), Error);
	}
	TSharedPtr<FJsonObject> Response = MakeShared<FJsonObject>();
	Response->SetStringField(TEXT("protocol"), TEXT("nlt.fusion-unreal"));
	Response->SetStringField(TEXT("protocol_version"), TEXT("1.0"));
	Response->SetStringField(TEXT("message_type"), TEXT("ack"));
	Response->SetStringField(TEXT("message_id"), FGuid::NewGuid().ToString(EGuidFormats::Digits));
	Response->SetStringField(TEXT("correlation_id"), MessageId);
	Response->SetStringField(TEXT("session_id"), SessionId.IsEmpty() ? TEXT("invalid") : SessionId);
	Response->SetStringField(TEXT("agent_id"), AgentId);
	Response->SetObjectField(TEXT("payload"), ResponsePayload);
	SendWebSocketEnvelope(Socket, Response);
}








bool UNLTWebServerSubsystem::ExecuteAuthoritativeAvatarAction(const TSharedPtr<FJsonObject>& Payload, FString& OutAgentId, FString& OutError)
{
	OutAgentId.Empty();
	OutError.Empty();
	if (!Payload.IsValid())
	{
		OutError = TEXT("payload must be an object");
		return false;
	}
	FString ActionType;
	Payload->TryGetStringField(TEXT("type"), ActionType);
	if (ActionType.IsEmpty())
	{
		Payload->TryGetStringField(TEXT("action"), ActionType);
	}
	if (ActionType.IsEmpty())
	{
		OutError = TEXT("action type is required");
		return false;
	}
	if (ActionType != TEXT("move_to") && ActionType != TEXT("move_by") && ActionType != TEXT("interact") && ActionType != TEXT("set_focus") && ActionType != TEXT("idle"))
	{
		OutError = FString::Printf(TEXT("unsupported action: %s"), *ActionType);
		return false;
	}
	UWorld* World = GetSimulationWorld();
	auto* MassSub = World ? World->GetSubsystem<UMassEntitySubsystem>() : nullptr;
	if (!World || !MassSub || !IsInGameThread())
	{
		OutError = TEXT("authoritative simulation is not ready");
		return false;
	}
	FMassEntityQuery& Query = NLTWebServerAvatarEntityControl::GetAvatarControlQuery(MassSub);
	FMassExecutionContext Context(MassSub->GetMutableEntityManager());
	FString TargetId;
	Payload->TryGetStringField(TEXT("target_id"), TargetId);
	Payload->TryGetStringField(TEXT("avatar_id"), TargetId);
	if (TargetId.IsEmpty())
	{
		OutError = TEXT("target_id or avatar_id is required");
		return false;
	}
	if (ActionType == TEXT("move_to") && (!Payload->HasField(TEXT("x")) || !Payload->HasField(TEXT("y"))))
	{
		OutError = TEXT("move_to requires x and y");
		return false;
	}
	if (ActionType == TEXT("move_by") && (!Payload->HasField(TEXT("dx")) || !Payload->HasField(TEXT("dy"))))
	{
		OutError = TEXT("move_by requires dx and dy");
		return false;
	}
	if (ActionType == TEXT("set_focus") && !Payload->HasField(TEXT("value")))
	{
		OutError = TEXT("set_focus requires value");
		return false;
	}
	if (ActionType == TEXT("interact"))
	{
		FString InteractionTarget;
		if (!Payload->TryGetStringField(TEXT("target"), InteractionTarget) || InteractionTarget.IsEmpty())
		{
			OutError = TEXT("interact requires a non-empty target");
			return false;
		}
	}
	bool bApplied = false;
	Query.ForEachEntityChunk(Context, [&](FMassExecutionContext& Chunk)
	{
		const int32 Count = Chunk.GetNumEntities();
		auto Identities = Chunk.GetFragmentView<FNLTAgentIdentityFragment>();
		auto Locations = Chunk.GetMutableFragmentView<FNLTAgentLocationFragment>();
		auto Cognitives = Chunk.GetMutableFragmentView<FNLTAgentCognitiveFragment>();
		auto Intents = Chunk.GetMutableFragmentView<FNLTAgentIntentFragment>();
		auto Behaviors = Chunk.GetMutableFragmentView<FNLTScenarioBehaviorFragment>();
		for (int32 Index = 0; Index < Count && !bApplied; ++Index)
		{
			if (Identities[Index].Role != ENLTAgentRole::Avatar || (!TargetId.IsEmpty() && Identities[Index].AgentId.ToString() != TargetId)) continue;
			FVector Target = Locations[Index].Position;
			if (ActionType == TEXT("move_to"))
			{
				float X = 0.0f, Y = 0.0f; Payload->TryGetNumberField(TEXT("x"), X); Payload->TryGetNumberField(TEXT("y"), Y); Target = FVector(X, Y, 0.0f);
			}
			else if (ActionType == TEXT("move_by"))
			{
				float DX = 0.0f, DY = 0.0f; Payload->TryGetNumberField(TEXT("dx"), DX); Payload->TryGetNumberField(TEXT("dy"), DY); Target += FVector(DX, DY, 0.0f);
			}
			else if (ActionType == TEXT("set_focus"))
			{
				float Focus = -1.0f; Payload->TryGetNumberField(TEXT("value"), Focus); if (Focus < 0.0f || Focus > 1.0f) { OutError = TEXT("focus must be in [0,1]"); return; }
				Cognitives[Index].Focus = Focus; bApplied = true; OutAgentId = Identities[Index].AgentId.ToString(); return;
			}
			else if (ActionType == TEXT("idle")) { bApplied = true; OutAgentId = Identities[Index].AgentId.ToString(); Behaviors[Index].bHasTarget = false; Behaviors[Index].Phase = ENLTScenarioMovementPhase::Idle; Locations[Index].bIsMoving = false; return; }
			else if (ActionType == TEXT("interact")) { bApplied = true; OutAgentId = Identities[Index].AgentId.ToString(); Cognitives[Index].Focus = FMath::Min(1.0f, Cognitives[Index].Focus + 0.25f); return; }
			Behaviors[Index].TargetPosition = Target; Behaviors[Index].bHasTarget = true; Behaviors[Index].Phase = ENLTScenarioMovementPhase::Moving; Behaviors[Index].TicksSinceDecision = 0; Locations[Index].TargetPosition = Target; Locations[Index].bIsMoving = true; Intents[Index].TargetLocation = Target; bApplied = true; OutAgentId = Identities[Index].AgentId.ToString();
		}
	});
	if (!bApplied && OutError.IsEmpty()) OutError = TargetId.IsEmpty() ? TEXT("no avatar found") : FString::Printf(TEXT("avatar not found: %s"), *TargetId);
	return bApplied;
}