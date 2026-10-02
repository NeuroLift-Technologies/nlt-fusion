#pragma once

#include "CoreMinimal.h"
#include "Subsystems/EngineSubsystem.h"
#include "HttpServerModule.h"
#include "HttpServerRequest.h"
#include "HttpServerResponse.h"
#include "IHttpRouter.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"
#include "MassEntityQuery.h"
#include "IWebSocketServer.h"
#include "IWebSocketNetworkingModule.h"
#include "NLTWebServerSubsystem.generated.h"

DECLARE_LOG_CATEGORY_EXTERN(LogNLTWebServer, Log, All);

UCLASS()
class UNLTWebServerSubsystem : public UEngineSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;

	UFUNCTION(BlueprintCallable, Category = "NLT|WebServer")
	void StartServer(int32 Port);

	UFUNCTION(BlueprintCallable, Category = "NLT|WebServer")
	void StopServer();

	UFUNCTION(BlueprintCallable, Category = "NLT|WebServer")
	void StartWebSocketServer(int32 InWebSocketPort = 8766);

	UFUNCTION(BlueprintCallable, Category = "NLT|WebServer")
	void StopWebSocketServer();

	UFUNCTION(BlueprintPure, Category = "NLT|WebServer")
	bool IsRunning() const { return bRunning; }

	UFUNCTION(BlueprintPure, Category = "NLT|WebServer")
	int32 GetPort() const { return static_cast<int32>(Port); }

private:
	// Resolves the live world used to query simulation state. Prefers an active
	// PIE world and falls back to the first available world. Returns null when
	// no suitable world exists (e.g. editor with no open world).
	UWorld* GetSimulationWorld() const;

	// Called by FCoreDelegates::GetOnPostEngineInit() after the engine is
	// fully initialized. Reads the Port member and delegates to StartServer(int32).
	void OnPostEngineInit();

	bool HandleSnapshotRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete);
	bool HandleControlRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete);
	bool HandleSceneRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete);
	bool HandleStatusRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete);
	bool HandleAvatarActionRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete);
	bool HandleAvatarStateRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete);
	bool HandleAvatarCommandRequest(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete);

	TSharedPtr<FJsonObject> BuildSnapshotObject();
	FString BuildSceneJson();
	FString BuildStatusJson();
	FString BuildEventsJson();
	FString JsonToStr(TSharedPtr<FJsonObject> Obj);
	void HandleWebSocketMessage(TSharedPtr<INetworkingWebSocket> Socket, const void* Data, int32 Size);
	void SendWebSocketEnvelope(TSharedPtr<INetworkingWebSocket> Socket, const TSharedPtr<FJsonObject>& Message);
	bool ExecuteAuthoritativeAvatarAction(const TSharedPtr<FJsonObject>& Payload, FString& OutAgentId, FString& OutError);

	void BroadcastEvent(const FString& EventType, const FString& Message, const FString& SourceId, const FString& SourceType);

private:
	TSharedPtr<IHttpRouter> HttpRouter;
	TUniquePtr<IWebSocketServer> WebSocketServer;
	TArray<TSharedPtr<INetworkingWebSocket>> WebSocketClients;
	int32 WebSocketPort = 8766;
	int32 Port = 8765;
	bool bRunning = false;
	FString LatestSnapshot;
	FString LatestStatus;
	TArray<FString> EventBuffer;
	int32 EventBufferSize = 200;
	int32 RequestCounter = 0;
	FCriticalSection EventMutex;
	FDelegateHandle PostEngineInitHandle;
};
