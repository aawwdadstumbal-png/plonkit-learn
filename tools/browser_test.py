"""Run the browser tests against a locally served copy of the app.

Usage:
    python tools/browser_test.py
"""

import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT / "tools"))

import serve  # noqa: E402


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def wait_for_server(port, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def main():
    port = free_port()
    server = serve.make_server(host="127.0.0.1", port=port)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    if not wait_for_server(port):
        print("the local server did not start")
        server.shutdown()
        return 1

    base = f"http://127.0.0.1:{port}"
    print(f"serving the app on {base}")

    env = dict(os.environ)
    env["PLONKIT_BASE_URL"] = base
    result = subprocess.run(
        ["node", "--test", "tests/test_browser.mjs"],
        cwd=str(PROJECT),
        env=env,
    )

    server.shutdown()
    server.server_close()
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
