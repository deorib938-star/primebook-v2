# ================================
# TWITTER / X CACHE BUILDER
# Scrapes profile + recent tweets for Primebook + 5 competitors.
# Mirrors instagram_cache_builder.py (Playwright + a logged-in session cookie).
#
# Reliable mode: set TW_AUTH_TOKEN (and TW_CT0) in backend/.env — the auth_token
# and ct0 cookies from a logged-in x.com session (use a THROWAWAY account; this is
# against X ToS and can get flagged). Without them X blocks the profile grid.
#
# How to get the cookies: log into x.com in your browser →
# DevTools → Application → Cookies → x.com → copy the values of `auth_token` and `ct0`.
#
# Run: python twitter_cache_builder.py
# ================================

import asyncio
import re
import json
import os
import sys
from datetime import datetime, timezone
from playwright.async_api import async_playwright

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

sys.stdout.reconfigure(encoding="utf-8")

CACHE_FILE    = "twitter_cache.json"
TW_AUTH_TOKEN = os.environ.get("TW_AUTH_TOKEN", "").strip()
TW_CT0        = os.environ.get("TW_CT0", "").strip()
TARGET_TWEETS = 40      # aim to collect this many per brand (spec: latest 20-50)
MAX_POSTS     = 50      # hard cap stored per brand
MAX_SCROLLS   = 20      # X virtualizes the timeline, so collect while scrolling

# Handles from competitor_registry (twitter field). Primebook handle — verify/adjust.
BRAND_PROFILES = {
    "hp":        {"name": "HP India",     "handle": "HPIndia"},
    "lenovo":    {"name": "Lenovo",       "handle": "Lenovo_in"},
    "acer":      {"name": "Acer",         "handle": "Acer"},
    "dell":      {"name": "Dell",         "handle": "Dell"},
    "asus":      {"name": "ASUS India",   "handle": "ASUSIndia"},
    "primebook": {"name": "Primebook",    "handle": "primebookindia"},
}
for b in BRAND_PROFILES.values():
    b["url"] = f"https://x.com/{b['handle']}"


def parse_count(text):
    """Convert '1.2M', '450K', '12,340' into an integer."""
    if not text:
        return 0
    text = text.strip().replace(",", "").replace(" ", "").lower()
    m = re.match(r"([\d.]+)\s*([km]?)", text)
    if not m:
        return 0
    try:
        num = float(m.group(1))
        suffix = m.group(2)
        if suffix == "k":
            num *= 1000
        elif suffix == "m":
            num *= 1_000_000
        return int(num)
    except Exception:
        return 0


async def parse_tweet(art):
    """Extract a rich, AI-analysis-ready record from one tweet <article>.
    Every field defaults sensibly (arrays=[], strings="", numbers=0, bools=False)."""
    # text + language (X puts BCP-47 lang on the tweetText node)
    text, language = "", ""
    try:
        tt = art.locator('[data-testid="tweetText"]').first
        text = await tt.inner_text(timeout=700)
        language = await tt.get_attribute("lang", timeout=400) or ""
    except Exception:
        pass

    # id / url / created_at (from the timestamp's permalink)
    tid, url, created_at = "", "", ""
    try:
        t = art.locator("time[datetime]").first
        created_at = await t.get_attribute("datetime", timeout=600) or ""
        href = await t.locator("xpath=ancestor::a[1]").get_attribute("href", timeout=600) or ""
        if href:
            url = "https://x.com" + href if href.startswith("/") else href
            m = re.search(r"/status/(\d+)", href)
            tid = m.group(1) if m else ""
    except Exception:
        pass

    async def eng(testid):
        try:
            lbl = await art.locator(f'[data-testid="{testid}"]').first.get_attribute("aria-label", timeout=400) or ""
            mm = re.search(r"([\d.,km]+)", lbl, re.IGNORECASE)
            return parse_count(mm.group(1)) if mm else 0
        except Exception:
            return 0

    likes    = await eng("like")
    reposts  = await eng("retweet")
    comments = await eng("reply")

    # views — best-effort (analytics link or a "N views" aria-label)
    views = 0
    for sel in ('a[href$="/analytics"]', '[aria-label*="View" i]', '[aria-label*="views" i]'):
        try:
            lbl = await art.locator(sel).first.get_attribute("aria-label", timeout=300) or ""
            mm = re.search(r"([\d.,km]+)\s*views?", lbl, re.IGNORECASE)
            if mm:
                views = parse_count(mm.group(1)); break
        except Exception:
            continue

    # media + type
    media = []
    try:
        for img in await art.locator('[data-testid="tweetPhoto"] img').all():
            src = await img.get_attribute("src", timeout=300)
            if src:
                media.append(src)
    except Exception:
        pass
    has_video = False
    try:
        has_video = await art.locator('[data-testid="videoPlayer"], video').count() > 0
    except Exception:
        pass
    if has_video:
        media_type = "video"
    elif len(media) > 1:
        media_type = "carousel"
    elif len(media) == 1:
        media_type = "image"
    else:
        media_type = "text"

    # flags (best-effort)
    is_repost = is_reply = is_quote = False
    try:
        sc = await art.locator('[data-testid="socialContext"]').first.inner_text(timeout=300)
        if sc and "repost" in sc.lower():
            is_repost = True
    except Exception:
        pass
    try:
        if await art.locator('div:has-text("Replying to")').count() > 0:
            is_reply = True
    except Exception:
        pass
    try:
        if await art.locator('div[role="link"] time').count() > 0:
            is_quote = True
    except Exception:
        pass

    hashtags = re.findall(r"#(\w+)", text)
    mentions = re.findall(r"@(\w+)", text)
    text = text.replace("\n", " ").strip()

    if not text and not url and not media:
        return None

    return {
        "id": tid,
        "text": text,
        "created_at": created_at,
        "url": url,
        "likes": likes,
        "comments": comments,
        "reposts": reposts,
        "views": views,
        "hashtags": hashtags,
        "mentions": mentions,
        "media": media,
        "type": media_type,
        "language": language,
        "is_reply": is_reply,
        "is_repost": is_repost,
        "is_quote": is_quote,
        # legacy aliases — keep so existing backend/frontend keep working
        "retweets": reposts,
        "replies": comments,
        "taken_at": created_at,
    }


async def scrape_profile(page, brand_id, brand_info, attempt=1):
    if attempt == 1:
        print(f"\n{'='*50}\nBRAND: {brand_info['name']} (@{brand_info['handle']})\n{'='*50}")
    try:
        await page.goto(brand_info["url"], wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(6 + attempt * 2)   # X renders counts async; give it longer
        for _ in range(5):
            await page.mouse.wheel(0, 1800)
            await asyncio.sleep(1.5)

        followers = following = tweets = 0
        bio = profile_pic = ""

        # Follower / following from the profile links (X renders these as anchors).
        try:
            body = await page.evaluate("() => document.body.innerText")
            m = re.search(r"([\d.,km]+)\s*Followers", body, re.IGNORECASE)
            if m: followers = parse_count(m.group(1))
            m = re.search(r"([\d.,km]+)\s*Following", body, re.IGNORECASE)
            if m: following = parse_count(m.group(1))
            # posts count appears under the name header as "N posts"
            m = re.search(r"([\d.,km]+)\s*posts", body, re.IGNORECASE)
            if m: tweets = parse_count(m.group(1))
        except Exception:
            pass

        # More reliable follower count via the follow links' aria/label spans.
        if followers == 0:
            try:
                txt = await page.evaluate(f"""
                    () => {{
                        const a = document.querySelector('a[href$="/verified_followers"], a[href$="/followers"]');
                        return a ? a.textContent : '';
                    }}
                """)
                m = re.search(r"([\d.,km]+)", txt or "", re.IGNORECASE)
                if m: followers = parse_count(m.group(1))
            except Exception:
                pass

        try:
            bio = await page.locator('[data-testid="UserDescription"]').first.inner_text(timeout=3000)
            bio = (bio or "").strip()[:200]
        except Exception:
            pass
        try:
            profile_pic = await page.locator('a[href$="/photo"] img, img[src*="profile_images"]').first.get_attribute("src", timeout=3000) or ""
        except Exception:
            pass

        # Retry a totally-blank profile once before spending time scrolling tweets.
        if followers == 0 and attempt < 2:
            print(f"  0 followers — retrying (attempt {attempt + 1})…")
            await asyncio.sleep(5)
            return await scrape_profile(page, brand_id, brand_info, attempt + 1)

        # Recent tweets — the timeline is virtualized (old nodes are removed as you
        # scroll), so collect incrementally, deduping by tweet id, until we have enough.
        collected = {}
        for _ in range(MAX_SCROLLS):
            try:
                arts = await page.locator('article[data-testid="tweet"]').all()
            except Exception:
                arts = []
            for art in arts:
                try:
                    post = await parse_tweet(art)
                except Exception:
                    post = None
                if not post:
                    continue
                key = post["id"] or post["text"][:60]
                if key and key not in collected:
                    collected[key] = post
            if len(collected) >= TARGET_TWEETS:
                break
            await page.mouse.wheel(0, 2400)
            await asyncio.sleep(1.6)
        recent_posts = list(collected.values())[:MAX_POSTS]

        result = {
            "brand_id": brand_id, "name": brand_info["name"], "handle": brand_info["handle"], "url": brand_info["url"],
            "stats": {"followers": followers, "following": following, "posts": tweets},
            "bio": bio, "profile_pic": profile_pic,
            "recent_posts": recent_posts, "post_count_found": len(recent_posts),
            "last_scraped": datetime.now(timezone.utc).isoformat(),
        }
        print(f"  Followers: {followers:,} | Following: {following:,} | Tweets: {tweets:,}")
        print(f"  Recent tweets scraped: {len(recent_posts)}")
        return result

    except Exception as e:
        print(f"  ERROR: {e}")
        return {
            "brand_id": brand_id, "name": brand_info["name"], "handle": brand_info["handle"], "url": brand_info["url"],
            "stats": {"followers": 0, "following": 0, "posts": 0},
            "bio": "", "profile_pic": "", "recent_posts": [], "post_count_found": 0,
            "last_scraped": datetime.now(timezone.utc).isoformat(), "error": str(e),
        }


async def build_cache():
    print("=== TWITTER / X CACHE BUILDER ===")
    if TW_AUTH_TOKEN:
        print(f"Logged-in mode (auth_token …{TW_AUTH_TOKEN[-6:]})")
    else:
        print("WARNING: no TW_AUTH_TOKEN in backend/.env — X will block profile data. "
              "Add TW_AUTH_TOKEN and TW_CT0 (throwaway account).")
    print(f"Tracking {len(BRAND_PROFILES)} brands\n")

    all_data = {"brands": {}}
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=(os.environ.get("SCRAPE_HEADLESS", "0") == "1"),
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}, locale="en-IN",
        )
        cookies = []
        for dom in (".x.com", ".twitter.com"):
            if TW_AUTH_TOKEN:
                cookies.append({"name": "auth_token", "value": TW_AUTH_TOKEN, "domain": dom, "path": "/", "httpOnly": True, "secure": True})
            if TW_CT0:
                cookies.append({"name": "ct0", "value": TW_CT0, "domain": dom, "path": "/", "secure": True})
        if cookies:
            await context.add_cookies(cookies)

        page = await context.new_page()
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")

        for brand_id, brand_info in BRAND_PROFILES.items():
            all_data["brands"][brand_id] = await scrape_profile(page, brand_id, brand_info)
            await asyncio.sleep(6)   # spacing between profiles to avoid X throttling

        await browser.close()

    all_data["last_updated"] = datetime.now(timezone.utc).isoformat()
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(all_data, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}\nTWITTER CACHE COMPLETE!\n{'='*50}")
    for bid, data in all_data["brands"].items():
        st = data.get("stats", {})
        print(f"  {data['name']}: {st.get('followers', 0):,} followers, {st.get('posts', 0):,} tweets, "
              f"{len(data.get('recent_posts', []))} recent")
    print(f"\nSaved to {CACHE_FILE}")


if __name__ == "__main__":
    asyncio.run(build_cache())
