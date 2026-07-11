#!/usr/bin/env python3
"""Local preview server with the MIME types required by CVClass assets."""

from __future__ import annotations

import argparse
import json
import mimetypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


ROOT = Path(__file__).resolve().parent


def configured_base_path() -> str:
    manifest = ROOT / "build-manifest.json"
    if not manifest.is_file():
        return ""
    data = json.loads(manifest.read_text(encoding="utf-8"))
    value = str(data.get("summary", {}).get("base_path", "")).strip()
    return "" if value in ("", "/") else "/" + value.strip("/")


class PrefixAwareHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, base_path: str, **kwargs):
        self.base_path = base_path
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path: str) -> str:
        parsed = urlsplit(path)
        route = parsed.path
        if self.base_path and (route == self.base_path or route.startswith(self.base_path + "/")):
            route = route[len(self.base_path) :] or "/"
        stripped = urlunsplit(("", "", route, parsed.query, parsed.fragment))
        return super().translate_path(stripped)

    def _redirect_canonical_entry(self) -> bool:
        parsed = urlsplit(self.path)
        canonical = (self.base_path or "") + "/"
        aliases = {"/", self.base_path, (self.base_path or "") + "/index"}
        if parsed.path not in aliases or parsed.path == canonical:
            return False
        self.send_response(302)
        self.send_header("Location", canonical)
        self.end_headers()
        return True

    def do_GET(self) -> None:
        if not self._redirect_canonical_entry():
            super().do_GET()

    def do_HEAD(self) -> None:
        if not self._redirect_canonical_entry():
            super().do_HEAD()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--base-path", help="Override deployment prefix; defaults to build-manifest.json")
    args = parser.parse_args()

    mimetypes.add_type("application/javascript", ".mjs")
    mimetypes.add_type("application/wasm", ".wasm")
    mimetypes.add_type("application/vnd.apple.mpegurl", ".m3u8")
    mimetypes.add_type("video/mp2t", ".ts")
    mimetypes.add_type("text/markdown; charset=utf-8", ".md")

    base_path = configured_base_path() if args.base_path is None else ("/" + args.base_path.strip("/") if args.base_path.strip("/") else "")
    handler = lambda *a, **kw: PrefixAwareHandler(*a, base_path=base_path, **kw)
    server = ThreadingHTTPServer((args.bind, args.port), handler)
    entry = (base_path or "") + "/"
    print(f"Serving {ROOT} at http://{args.bind}:{args.port}{entry}")
    server.serve_forever()


if __name__ == "__main__":
    main()
