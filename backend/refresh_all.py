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
    "price_history.json", "ai_cache.json",
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
    for fn_name in ("_record_yt_snapshot", "_record_ig_snapshot", "_record_price_snapshot"):
        try:
            getattr(main, fn_name)()
            log(f"OK {fn_name}")
        except Exception as e:
            log(f"FAILED {fn_name}: {e}")


def refresh_ai_cache():
    """Regenerate all page-level AI analysis into ai_cache.json by calling the
    app's own endpoint functions with refresh=True. Paced to respect Groq's
    token-per-minute limit. Skipped if AI_REFRESH=0."""
    if os.environ.get("AI_REFRESH", "1") != "1":
        log("AI_REFRESH=0 — skipping AI cache regeneration")
        return
    try:
        import main
    except Exception as e:
        log(f"ERROR importing main for AI refresh: {e}")
        return

    delay = float(os.environ.get("AI_REFRESH_DELAY", "15"))
    competitors = ["hp", "lenovo", "acer", "dell", "asus"]
    all_brands = ["primebook"] + competitors

    # (label, coroutine factory) — each returns a fresh coroutine when called
    jobs = [("research/all", lambda: main.research_all(refresh=True))]
    jobs += [(f"research/{c}", (lambda c=c: main.research_competitor(c, refresh=True))) for c in competitors]
    jobs += [
        ("news/intelligence", lambda: main.news_intelligence(refresh=True)),
        ("youtube/content-strategy", lambda: main.youtube_content_strategy(refresh=True)),
        ("youtube/content-ai", lambda: main.youtube_content_ai(refresh=True)),
        ("instagram/content-strategy", lambda: main.instagram_content_strategy(refresh=True)),
    ]
    jobs += [(f"youtube/sentiment/{b}", (lambda b=b: main.youtube_sentiment(b, refresh=True))) for b in competitors]
    jobs += [(f"youtube/audience/{b}", (lambda b=b: main.youtube_audience(b, refresh=True))) for b in all_brands]
    jobs += [(f"instagram/audience/{b}", (lambda b=b: main.instagram_audience(b, refresh=True))) for b in all_brands]

    async def run_all():
        ok = 0
        for n, (label, make) in enumerate(jobs, 1):
            try:
                res = await make()
                if isinstance(res, dict) and res.get("error"):
                    log(f"AI [{n}/{len(jobs)}] {label} -> error: {str(res.get('error'))[:60]}")
                else:
                    ok += 1
                    log(f"AI [{n}/{len(jobs)}] {label} OK")
            except Exception as e:
                log(f"AI [{n}/{len(jobs)}] {label} FAILED: {str(e)[:80]}")
            if n < len(jobs):
                await asyncio.sleep(delay)
        log(f"AI cache regenerated: {ok}/{len(jobs)}")

    try:
        asyncio.run(run_all())
    except Exception as e:
        log(f"AI refresh loop error: {e}")


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
    refresh_ai_cache()
    if os.environ.get("AUTO_PUSH", "0") == "1":
        git_push()
    ok = sum(1 for v in results.values() if v)
    log(f"========== DONE: {ok}/{len(results)} builders OK ==========")


if __name__ == "__main__":
    main_run()
