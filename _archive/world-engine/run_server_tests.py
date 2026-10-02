"""
Standlone runner for tests/test_server.py bypassing pytest.

Pytest collection/imports can be slow on this machine; this file only
imports the test module and runs every test_* function directly.
Neither this file nor the tests depend on pytest being installed.

Usage:
    python run_server_tests.py
"""

import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import tests.test_server as suite


def main() -> int:
    tests = [(name, getattr(suite, name))
             for name in sorted(dir(suite))
             if name.startswith("test_") and callable(getattr(suite, name))]
    failed = 0
    for name, fn in tests:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001 - report everything
            failed += 1
            print(f"FAIL {name}: {exc!r}")
            traceback.print_exc(limit=3)
        else:
            print(f"PASS {name}")
    print(f"{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())