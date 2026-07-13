"""
Regenerate ALL AI analysis into the on-disk cache (ai_cache.json).

Hits every AI endpoint with ?refresh=1 against a RUNNING backend, so the
server writes fresh results to ai_cache.json. Requests are paced to respect
Groq's free-tier token-per-minute limit.

Usage:
    python warm_ai_cache.py                 # page-level analyses (recommended)
    python warm_ai_cache.py --deep          # also every news article + IG post
    python warm_ai_cache.py --delay 25      # seconds between calls (default 20)
    python warm_ai_cache.py --base http://localhost:8000

Run the backend first:  uvicorn main:app --port 8000
Then commit + push ai_cache.json so live serves it without calling Groq.
"""
import sys
import time
import json
import urllib.request
import urllib.error
import urllib.parse

BASE = "http://localhost:8000"
DELAY = 20
DEEP = False

# ---- parse args -----------------------------------------------------
args = sys.argv[1:]
if "--deep" in args:
    DEEP = True
    args.remove("--deep")
i = 0
while i < len(args):
    if args[i] == "--delay" and i + 1 < len(args):
        DELAY = float(args[i + 1]); i += 2
    elif args[i] == "--base" and i + 1 < len(args):
        BASE = args[i + 1].rstrip("/"); i += 2
    else:
        i += 1

COMPETITORS = ["hp", "lenovo", "acer", "dell", "asus"]
ALL_BRANDS = ["primebook"] + COMPETITORS

# Page-level AI (the analyses shown on load across the dashboard)
TARGETS = []
TARGETS.append(("/research/all", {"refresh": 1}))
for c in COMPETITORS:
    TARGETS.append((f"/research/competitor/{c}", {"refresh": 1}))
TARGETS.append(("/news/ai/intelligence", {"refresh": 1}))
TARGETS.append(("/youtube/content-strategy", {"refresh": 1}))
TARGETS.append(("/youtube/content-ai", {"refresh": 1}))
TARGETS.append(("/instagram/content-strategy", {"refresh": 1}))
for b in COMPETITORS:
    TARGETS.append((f"/youtube/sentiment/{b}", {"refresh": 1}))
for b in ALL_BRANDS:
    TARGETS.append((f"/youtube/audience/{b}", {"refresh": 1}))
for b in ALL_BRANDS:
    TARGETS.append((f"/instagram/audience/{b}", {"refresh": 1}))


def get_json(path, params=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def call(path, params, label=""):
    """Call one endpoint with one retry on rate-limit / error."""
    for attempt in (1, 2):
        try:
            data = get_json(path, params)
            if isinstance(data, dict) and data.get("error"):
                print(f"   ! {path} -> error: {str(data.get('error'))[:80]}")
                if attempt == 1:
                    print("     waiting 60s then retrying...")
                    time.sleep(60); continue
                return False
            print(f"   OK {path} {label}")
            return True
        except urllib.error.HTTPError as e:
            print(f"   ! {path} -> HTTP {e.code}")
            if attempt == 1 and e.code in (429, 500, 503):
                print("     waiting 60s then retrying...")
                time.sleep(60); continue
            return False
        except Exception as e:
            print(f"   ! {path} -> {type(e).__name__}: {str(e)[:80]}")
            return False
    return False


def deep_targets():
    """Per-item analyses: every news article + IG post that exists."""
    extra = []
    try:
        news = get_json("/news")  # {brand: [...]} or list
    except Exception:
        news = None
    if isinstance(news, dict):
        for b in COMPETITORS:
            arts = news.get(b) or news.get("articles", {}).get(b, []) if isinstance(news.get(b), list) else news.get(b, [])
            n = len(arts) if isinstance(arts, list) else 0
            for idx in range(min(n, 8)):
                extra.append((f"/news/ai/article", {"brand": b, "i": idx, "refresh": 1}))
    # IG posts (first 6 per brand)
    for b in ALL_BRANDS:
        for idx in range(6):
            extra.append(("/instagram/post-analysis/" + b, {"i": idx, "refresh": 1}))
    return extra


def main():
    print(f"Warming AI cache via {BASE}  (delay {DELAY}s, deep={DEEP})")
    # sanity: server up?
    try:
        get_json("/ai-cache/status")
    except Exception as e:
        print(f"Cannot reach backend at {BASE} — start uvicorn first. ({e})")
        sys.exit(1)

    targets = list(TARGETS)
    if DEEP:
        targets += deep_targets()

    total = len(targets)
    ok = 0
    for n, (path, params) in enumerate(targets, 1):
        print(f"[{n}/{total}]", end=" ")
        if call(path, params):
            ok += 1
        if n < total:
            time.sleep(DELAY)

    print(f"\nDone. {ok}/{total} regenerated.")
    try:
        status = get_json("/ai-cache/status")
        print("Cache namespaces:")
        for ns, meta in status.get("namespaces", {}).items():
            print(f"  {ns}: {meta['entries']} entries")
    except Exception:
        pass


if __name__ == "__main__":
    main()
