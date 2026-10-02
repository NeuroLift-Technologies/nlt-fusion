#!/usr/bin/env python3
"""Wrapper to execute the Phase 6 full validation script via MCP ProgrammaticToolset."""
import json
import urllib.request

MCP_URL = "http://127.0.0.1:8001/mcp"

# Step 1: Initialize MCP session
print("Initializing MCP session...")
init_payload = json.dumps({
    "jsonrpc": "2.0",
    "method": "initialize",
    "id": 1,
    "params": {
        "protocolVersion": "2025-03-26",
        "capabilities": {"sampling": {}, "roots": {}},
        "clientInfo": {"name": "pool", "version": "1.0"}
    }
}).encode()

init_req = urllib.request.Request(
    MCP_URL, data=init_payload,
    headers={"Content-Type": "application/json"}
)
init_resp = urllib.request.urlopen(init_req, timeout=15)
session_id = init_resp.headers.get("Mcp-Session-Id", "")
print("Session ID: {}".format(session_id))

# Step 2: Read the validation script
with open("D:/nlt-repos/nlt-fusion/WorldEngine/Scripts/phase6_full_validation.py") as f:
    script_content = f.read()

print("Script length: {} chars".format(len(script_content)))

# Step 3: Execute the script via ProgrammaticToolset
print("Executing script...")
exec_payload = json.dumps({
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 2,
    "params": {
        "name": "call_tool",
        "arguments": {
            "toolset_name": "editor_toolset.toolsets.programmatic.ProgrammaticToolset",
            "tool_name": "execute_tool_script",
            "arguments": {
                "script": script_content
            }
        }
    }
}).encode()

exec_req = urllib.request.Request(
    MCP_URL, data=exec_payload,
    headers={
        "Content-Type": "application/json",
        "Mcp-Session-Id": session_id
    }
)

try:
    exec_resp = urllib.request.urlopen(exec_req, timeout=300)
    result = json.loads(exec_resp.read().decode())
    if "error" in result:
        print("MCP ERROR:", json.dumps(result, indent=2))
    else:
        # The return value is in the content array
        content = result["result"]["content"][0]["text"]
        try:
            parsed = json.loads(content)
            # The parsed value is the return value of run() as a JSON string inside returnValue
            rv = parsed.get("returnValue", content)
            if isinstance(rv, str):
                inner = json.loads(rv)
            else:
                inner = rv
            print("\n=== EXECUTION RESULTS ===")
            print(json.dumps(inner, indent=2, default=str))
        except Exception as e:
            print("Could not parse result as JSON: {}".format(e))
            print("Raw content:", content[:5000])
except urllib.error.URLError as e:
    print("Connection error (might still be processing):", e)
    print("Check editor log for results")
except Exception as e:
    print("Error:", e)
    import traceback
    traceback.print_exc()
