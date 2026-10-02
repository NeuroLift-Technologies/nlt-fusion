# Fusion ↔ Unreal v1 wire contract

**Status:** reference contract; UE transport integration requires runtime conformance verification.

## Envelope

Every WebSocket text frame is one JSON object:

```json
{"protocol":"nlt.fusion-unreal","protocol_version":"1.0","message_type":"action|ack|event|snapshot|error|ping|pong","message_id":"uuid","correlation_id":null,"session_id":"s-123","agent_id":"avatar-7","payload":{}}
```

`message_id` is unique per connection. `correlation_id` is the request `message_id` on replies. `session_id` is mandatory and scopes authorization, replay records, and agent ownership. An action without an `agent_id` is rejected unless the session has exactly one bound agent.

## Acknowledgements and errors

Every mutating request receives one `ack`. `payload.status` is `accepted` or `rejected`. Errors use stable codes: `invalid_envelope`, `unsupported_version`, `unsupported_type`, `invalid_action`, `unknown_target`, `invalid_state`. Rejected actions have no simulation side effect.

## Approved action semantics

- `move_to`: set the target agent's authoritative position to `x`,`y` (UE centimetres).
- `move_by`: add `dx`,`dy` to the current authoritative position.
- `interact`: append the requested target affordance to the agent's interaction history; the authoritative interaction processor resolves the target during the next tick.
- `set_focus`: set focus to a value in `[0,1]`.
- `idle`: clear movement intent and leave the agent in place.

Unknown actions, missing targets, malformed arguments, and out-of-range values are errors. No implicit no-op actions are permitted.

## Replay

A replay contains the initial state, seed/RNG state, action batches by tick, expected intermediate state hashes, expected event hashes, expected final state, and final hash. Replay execution starts from the recorded initial state, executes each action against the authoritative action dispatcher, advances the simulation one tick, then compares hashes after every tick and compares final state plus RNG state at the end. Hashing is SHA-256 over canonical JSON (`sort_keys`, compact separators, UTF-8).

The reference implementation is `WorldEngine/Scripts/fusion_protocol.py`; conformance tests are `WorldEngine/Scripts/tests/test_fusion_protocol.py`.

## Transport integration gate

The checked-out workspace contains a compiling UE editor target, but no live UE runtime session is available in this verification pass. The UE WebSocket listener and Mass action path are present; end-to-end Python↔UE conformance and authoritative UE replay remain pending. The next integration step is to run the same conformance fixture against the live UE process, then wire the codec/dispatcher into the authoritative replay runner.
