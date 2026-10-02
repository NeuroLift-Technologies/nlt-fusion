#!/usr/bin/env python3
"""Wrapper to execute the Phase 6 validation script via MCP ProgrammaticToolset."""
import json
import urllib.request

SESSION_ID = "01a05feffd767e9ca96db87b721fa2f5"
MCP_URL = "http://127.0.0.1:8001/mcp"

# Read the validation script
with open("D:/nlt-repos/nlt-fusion/WorldEngine/Scripts/phase6_mcp_validation.py") as f:
    script_content = f.read()

payload = {
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 60,
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
}

data = json.dumps(payload).encode()
req = urllib.request.Request(
    MCP_URL,
    data=data,
    headers={
        "Content-Type": "application/json",
        "Mcp-Session-Id": SESSION_ID
    }
)

print("Sending script to ProgrammaticToolset.execute_tool_script...")
print("Script length: {} chars".format(len(script_content)))

try:
    with urllib.request.urlopen(req, timeout=300) as resp:
        result = json.loads(resp.read().decode())
        if "error" in result:
            print("MCP ERROR:", json.dumps(result, indent=2))
        else:
            content = result["result"]["content"][0]["text"]
            # The text is the return value from run() which is a Dict
            # It might be JSON or plain text
            try:
                parsed = json.loads(content)
                print("=== RESULTS ===")
                print(json.dumps(parsed, indent=2, default=str))
            except:
                print(content)
except urllib.error.URLError as e:
    print("Connection error:", e)
except Exception as e:
    print("Error:", e)
