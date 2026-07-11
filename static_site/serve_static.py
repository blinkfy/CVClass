#!/usr/bin/env python3
"""Local preview server with the MIME types required by CVClass assets."""

from __future__ import annotations

import argparse
import mimetypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent / "site"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    mimetypes.add_type("application/javascript", ".mjs")
    mimetypes.add_type("application/wasm", ".wasm")
    mimetypes.add_type("application/vnd.apple.mpegurl", ".m3u8")
    mimetypes.add_type("video/mp2t", ".ts")
    mimetypes.add_type("text/markdown; charset=utf-8", ".md")

    handler = lambda *a, **kw: SimpleHTTPRequestHandler(*a, directory=str(ROOT), **kw)
    server = ThreadingHTTPServer((args.bind, args.port), handler)
    print(f"Serving {ROOT} at http://{args.bind}:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
