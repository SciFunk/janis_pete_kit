"""Tiny dev/play server. Run `python serve.py` (or double-click play.bat) then open the printed URL.

Serves this folder over HTTP (ES modules and canvas image access need http://, not file://)
and accepts POST /__save/<name>.json to write authored data files (maps, dialogue) back to disk
from the in-game editor, and POST /__save_png/assets/characters/<name>.png (base64 body) from
the character builder. Only paths under data/ and assets/characters/ are writable.
"""
import base64, http.server, json, os, sys, webbrowser, threading

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
PNG_MAGIC = bytes([0x89, 0x50, 0x4E, 0x47])


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    # Music is served as .mus with a generic content type: Internet Download Manager intercepts
    # .ogg/.oga and audio/* responses (even from localhost) and pops its download dialog instead.
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{".mus": "application/octet-stream"})

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/__mtimes"):
            # JSON {"name.png": mtime_ms, ...} for one folder under assets/ (default assets/characters):
            # the game and tools/sprite_preview.html poll it to hot-reload sprites saved from Aseprite
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            rel = (q.get("dir", ["assets/characters"])[0]).replace("\\", "/").strip("/")
            if ".." in rel or not rel.startswith("assets/"):
                self.send_error(403); return
            d = os.path.join(ROOT, rel)
            out = {}
            if os.path.isdir(d):
                for f in os.listdir(d):
                    if f.lower().endswith(".png"):
                        out[f] = int(os.path.getmtime(os.path.join(d, f)) * 1000)
            body = json.dumps(out).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers()
            self.wfile.write(body); return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/__save_png/"):
            rel = self.path[len("/__save_png/"):].replace("\\", "/").lstrip("/")
            if ".." in rel or not rel.startswith("assets/characters/") or not rel.endswith(".png"):
                self.send_error(403, "only assets/characters/*.png is writable"); return
            n = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(n)
            try:
                data = base64.b64decode(body.split(b",")[-1])
                assert data[:4] == PNG_MAGIC
            except Exception:
                self.send_error(400, "bad png"); return
            target = os.path.join(ROOT, rel)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "wb") as f:
                f.write(data)
            self.send_response(200); self.end_headers(); self.wfile.write(b"ok"); return
        if self.path.startswith("/__pack"):
            # design kit (tools/make_kit.py): zip the friend's outputs into send_back_<slug>.zip
            kp = os.path.join(ROOT, "kit.json")
            if not os.path.exists(kp):
                self.send_error(404, "not a design kit"); return
            import zipfile
            info = json.load(open(kp, encoding="utf-8"))
            out = os.path.join(ROOT, "send_back_%s.zip" % info["slug"])
            with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
                z.write(kp, "kit.json")
                for rel in ["data/maps/%s.json" % info["map"], "data/maps/edits/%s.json" % info["map"], "data/custom_characters.json"]:
                    p = os.path.join(ROOT, rel)
                    if os.path.exists(p): z.write(p, rel)
                cd = os.path.join(ROOT, "assets", "characters")
                for f in os.listdir(cd):
                    if f.startswith("custom_") and f.endswith(".png"): z.write(os.path.join(cd, f), "assets/characters/" + f)
            body = os.path.basename(out).encode()
            self.send_response(200); self.send_header("Content-Type", "text/plain"); self.send_header("Content-Length", str(len(body))); self.end_headers()
            self.wfile.write(body); return
        if not self.path.startswith("/__save/"):
            self.send_error(404); return
        rel = self.path[len("/__save/"):]
        rel = rel.replace("\\", "/").lstrip("/")
        if ".." in rel or not rel.startswith("data/") or not rel.endswith(".json"):
            self.send_error(403, "only data/**.json is writable"); return
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n)
        try:
            json.loads(body)  # validate
        except Exception as e:
            self.send_error(400, f"bad json: {e}"); return
        target = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as f:
            f.write(body)
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")

    def log_message(self, fmt, *args):
        if os.environ.get("FARM_LOG") or (args and isinstance(args[0], str) and "__save" in args[0]):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print("serving", ROOT, "at", url)
    if "--no-browser" not in sys.argv:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
