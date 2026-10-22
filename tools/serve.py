"""A small static server for the app, for use on the computer.

It serves the app directory on the given port and binds to every interface,
so a phone on the same wifi can reach it. The phone cannot install the app
from this address, because a browser only allows offline caching and
installation on a secure origin, but it is handy for a quick look.

Usage:
    python tools/serve.py --port 8000
"""

import argparse
import http.server
import os
import socket
import socketserver
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    """A handler that serves only from the app directory and never caches."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def guess_type(self, path):
        extension = os.path.splitext(str(path))[1].lower()
        return CONTENT_TYPES.get(extension, "application/octet-stream")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        # SimpleHTTPRequestHandler already refuses to escape its directory,
        # but it does so with a message that leaks the path. The check here
        # turns anything outside the app directory into a plain 404.
        path = self.translate_path(self.path)
        try:
            resolved = Path(path).resolve()
            resolved.relative_to(APP_DIR.resolve())
        except (ValueError, OSError):
            self.send_error(404, "Not Found")
            return None
        return super().send_head()

    def log_message(self, fmt, *args):
        if "--quiet" not in sys.argv:
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def make_server(host="0.0.0.0", port=8000):
    return Server((host, port), Handler)


def lan_ip():
    """The address other devices on the network can reach."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.settimeout(0.5)
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def lan_url(port):
    return f"http://{lan_ip()}:{port}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    server = make_server(args.host, args.port)
    port = server.server_address[1]

    print(f"Plonk It Learn is being served from {APP_DIR}")
    print(f"  on this computer:  http://127.0.0.1:{port}")
    print(f"  on the local wifi: {lan_url(port)}")
    print("  (the phone needs an https address to install the app; use the published site)")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
