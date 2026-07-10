# ================================================================
# refresh_all.py — daily cache refresh orchestrator
# Runs every builder, records growth snapshots, refreshes news, and
# (optionally) commits + pushes the updated caches so the live site updates.
#
# Run manually:  python refresh_all.py
# Scheduled:     Windows Task Scheduler runs refresh_all.bat at 7 AM (see that file).
#
# Env:
#   SCRAPE_HEADLESS=1   run Playwright scrapers headless (set by the scheduled job)
#   AUTO_PUSH=1         git add caches + commit + push after refresh
# ================================================================

import os
import sys
import subprocess
import asyncio
from datetime import datetime

os.chdir(os.path.dirname(os.path.abspath(__file__)))  # always run from backend/
PY = sys.executable

# Builders to run in order (name, script, extra-args). Each is isolated so one
# failure never blocks the rest. Amazon gets "force" so it re-scrapes daily
# instead of honoring its own cache-age check.
BUILDERS = [
    ("YouTube channels", "youtube_cache_builder.py", []),
    ("YouTube comments", "youtube_comments_builder.py", []),
    ("Amazon prices",    "amazon_scraper.py", ["force"]),
    ("Flipkart prices",  "flipkart_scraper.py", []),
    ("Instagram",        "instagram_cache_builder.py", []),
]

# Caches to commit when AUTO_PUSH is on
CACHE_FILES = [
    "youtube_cache.json", "youtube_comments.json", "youtube_history.json",
    "amazon_cache.json", "flipkart_cache.json",
    "instagram_cache.json", "instagram_history.json", "news_cache.json",
]


def log(msg):
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def run_builder(name, script, args=None, timeout=900):
    if not os.path.exists(script):
        log(f"SKIP {name}: {script} not found")
        return False
    log(f"--- {name} ({script}) ---")
    try:
        r = subprocess.run([PY, script, *(args or [])], timeout=timeout)
        ok = r.returncode == 0
        log(f"{'OK' if ok else 'FAILED'} {name} (exit {r.returncode})")
        return ok
    except subprocess.TimeoutExpired:
        log(f"TIMEOUT {name} after {timeout}s")
        return False
    except Exception as e:
        log(f"ERROR {name}: {e}")
        return False


def refresh_news_and_snapshots():
    """Uses the FastAPI app's own functions (no server needed)."""
    try:
        import main  # noqa: imports the app module (loads .env, defines helpers)
    except Exception as e:
        log(f"ERROR importing main for news/snapshots: {e}")
        return
    try:
        asyncio.run(main.refresh_news())
        log("OK news refresh")
    except Exception as e:
        log(f"FAILED news refresh: {e}")
    for fn_name in ("_record_yt_snapshot", "_record_ig_snapshot"):
        try:
            getattr(main, fn_name)()
            log(f"OK {fn_name}")
        except Exception as e:
            log(f"FAILED {fn_name}: {e}")


def git_push():
    repo = os.path.dirname(os.getcwd())  # project root (parent of backend/)
    def git(*args):
        return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)
    existing = [f for f in CACHE_FILES if os.path.exists(os.path.join("", f))]
    paths = [f"backend/{f}" for f in existing]
    git("add", *paths)
    status = git("status", "--porcelain", *paths).stdout.strip()
    if not status:
        log("AUTO_PUSH: no cache changes to commit")
        return
    msg = f"chore: daily cache refresh {datetime.now():%Y-%m-%d}"
    c = git("commit", "-m", msg)
    if c.returncode != 0:
        log(f"AUTO_PUSH commit failed: {c.stderr.strip()[:200]}")
        return
    p = git("push", "origin", "main")
    if p.returncode == 0:
        log("AUTO_PUSH: pushed to origin/main — live site will redeploy")
    else:
        log(f"AUTO_PUSH push failed: {p.stderr.strip()[:200]}")


def main_run():
    log("========== DAILY REFRESH START ==========")
    results = {name: run_builder(name, script, args) for name, script, args in BUILDERS}
    refresh_news_and_snapshots()
    if os.environ.get("AUTO_PUSH", "0") == "1":
        git_push()
    ok = sum(1 for v in results.values() if v)
    log(f"========== DONE: {ok}/{len(results)} builders OK ==========")


if __name__ == "__main__":
    main_run()
