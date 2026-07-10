# ================================
# INSTAGRAM CACHE BUILDER
# Scrapes profile + recent posts for Primebook + 5 competitors.
#
# Reliable mode: set IG_SESSIONID in backend/.env (a real Instagram sessionid
# cookie — use a THROWAWAY account, it is against IG ToS and can get flagged).
# With a session the grid loads for every brand and each post is enriched with
# likes + date. Without it, it falls back to logged-out best-effort (flaky).
#
# How to get the cookie: log into instagram.com in your browser →
# DevTools → Application → Cookies → copy the value of `sessionid`.
#
# Run: python instagram_cache_builder.py
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

CACHE_FILE   = "instagram_cache.json"
IG_SESSIONID = os.environ.get("IG_SESSIONID", "").strip()
ENRICH_POSTS = os.environ.get("IG_ENRICH", "1") != "0"   # set IG_ENRICH=0 to skip per-post likes/date
MAX_ENRICH   = 12                                         # posts per brand to open for likes/date

BRAND_PROFILES = {
    "hp":        {"name": "HP India",     "handle": "hp_india",     "url": "https://www.instagram.com/hp_india/"},
    "lenovo":    {"name": "Lenovo India", "handle": "lenovo_india", "url": "https://www.instagram.com/lenovo_india/"},
    "acer":      {"name": "Acer India",   "handle": "acerindia",    "url": "https://www.instagram.com/acerindia/"},
    "dell":      {"name": "Dell India",   "handle": "dellindia",    "url": "https://www.instagram.com/dellindia/"},
    "asus":      {"name": "ASUS India",   "handle": "asusindia",    "url": "https://www.instagram.com/asusindia/"},
    "primebook": {"name": "Primebook",    "handle": "primebook.hq", "url": "https://www.instagram.com/primebook.hq/"},
}


def parse_count(text):
    """Convert '1.2M', '450K', '12,340' etc into an integer."""
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


async def enrich_post(context, url):
    """Open a single post page (logged in) and pull likes + date. Best effort."""
    likes, taken_at = None, None
    page = await context.new_page()
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await asyncio.sleep(2)
        # date from the <time datetime="..."> element
        try:
            dt = await page.locator("time[datetime]").first.get_attribute("datetime", timeout=3000)
            if dt:
                taken_at = dt
        except Exception:
            pass
        # likes from visible text ("1,234 likes" / "1,234 others")
        try:
            body = await page.evaluate("() => document.body.innerText")
            m = re.search(r"([\d,\.]+)\s+likes", body, re.IGNORECASE)
            if not m:
                m = re.search(r"and\s+([\d,\.]+)\s+others", body, re.IGNORECASE)
            if m:
                likes = parse_count(m.group(1))
        except Exception:
            pass
    except Exception as e:
        print(f"       [enrich skip] {url[-24:]}: {str(e)[:50]}")
    finally:
        await page.close()
    return likes, taken_at


async def scrape_profile(context, page, brand_id, brand_info):
    print(f"\n{'='*50}\nBRAND: {brand_info['name']} (@{brand_info['handle']})\n{'='*50}")
    try:
        await page.goto(brand_info["url"], wait_until="domcontentloaded", timeout=25000)
        await asyncio.sleep(4)
        # scroll to trigger lazy-loaded grid
        for _ in range(3):
            await page.mouse.wheel(0, 1600)
            await asyncio.sleep(1.2)

        meta_desc = ""
        try:
            meta_desc = await page.locator('meta[name="description"]').first.get_attribute("content", timeout=5000) or ""
        except Exception:
            pass

        followers = following = posts = 0
        m = re.search(r"([\d.,km]+)\s*Followers", meta_desc, re.IGNORECASE)
        if m: followers = parse_count(m.group(1))
        m = re.search(r"([\d.,km]+)\s*Following", meta_desc, re.IGNORECASE)
        if m: following = parse_count(m.group(1))
        m = re.search(r"([\d.,km]+)\s*Posts", meta_desc, re.IGNORECASE)
        if m: posts = parse_count(m.group(1))

        if followers == 0:
            try:
                stats_text = await page.evaluate("""
                    () => Array.from(document.querySelectorAll('header section ul li, header section span'))
                              .map(e => e.textContent).join(' | ')
                """)
                m = re.search(r"([\d.,km]+)\s*followers", stats_text, re.IGNORECASE)
                if m: followers = parse_count(m.group(1))
                m = re.search(r"([\d.,km]+)\s*following", stats_text, re.IGNORECASE)
                if m: following = parse_count(m.group(1))
                m = re.search(r"([\d.,km]+)\s*posts", stats_text, re.IGNORECASE)
                if m: posts = parse_count(m.group(1))
            except Exception:
                pass

        bio = ""
        try:
            og_desc = await page.locator('meta[property="og:description"]').first.get_attribute("content", timeout=3000) or ""
            bm = re.search(r"-\s*(.+?)(?:\.\s*\d+ Posts|$)", og_desc)
            if bm:
                bio = bm.group(1).strip()[:200]
        except Exception:
            pass

        profile_pic = ""
        try:
            profile_pic = await page.locator('meta[property="og:image"]').first.get_attribute("content", timeout=3000) or ""
        except Exception:
            pass

        # Recent posts grid
        recent_posts = []
        try:
            post_links = await page.locator('a[href*="/p/"], a[href*="/reel/"]').all()
            for link in post_links[:14]:
                try:
                    href = await link.get_attribute("href", timeout=1000)
                    if not href:
                        continue
                    full_url = "https://www.instagram.com" + href if href.startswith("/") else href
                    img = link.locator("img").first
                    img_src = await img.get_attribute("src", timeout=1000) or ""
                    alt_text = await img.get_attribute("alt", timeout=1000) or ""
                    recent_posts.append({
                        "url": full_url,
                        "thumbnail": img_src,
                        "alt": alt_text[:150],
                        "type": "reel" if "/reel/" in href else "post",
                    })
                except Exception:
                    continue
        except Exception:
            pass

        seen, unique = set(), []
        for p in recent_posts:
            if p["url"] not in seen:
                seen.add(p["url"])
                unique.append(p)
        recent_posts = unique[:12]

        # Per-post enrichment (likes + date) — only when logged in
        if ENRICH_POSTS and IG_SESSIONID and recent_posts:
            print(f"  Enriching {min(len(recent_posts), MAX_ENRICH)} posts with likes + date…")
            for p in recent_posts[:MAX_ENRICH]:
                likes, taken_at = await enrich_post(context, p["url"])
                if likes is not None:
                    p["likes"] = likes
                if taken_at:
                    p["taken_at"] = taken_at
                await asyncio.sleep(1.5)

        result = {
            "brand_id": brand_id, "name": brand_info["name"], "handle": brand_info["handle"], "url": brand_info["url"],
            "stats": {"followers": followers, "following": following, "posts": posts},
            "bio": bio, "profile_pic": profile_pic,
            "recent_posts": recent_posts, "post_count_found": len(recent_posts),
        }
        enriched = len([p for p in recent_posts if "likes" in p])
        print(f"  Followers: {followers:,} | Following: {following:,} | Posts: {posts:,}")
        print(f"  Recent posts: {len(recent_posts)} (enriched with likes: {enriched})")
        return result

    except Exception as e:
        print(f"  ERROR: {e}")
        return {
            "brand_id": brand_id, "name": brand_info["name"], "handle": brand_info["handle"], "url": brand_info["url"],
            "stats": {"followers": 0, "following": 0, "posts": 0},
            "bio": "", "profile_pic": "", "recent_posts": [], "error": str(e),
        }


async def build_cache():
    print("=== INSTAGRAM CACHE BUILDER ===")
    if IG_SESSIONID:
        print(f"Logged-in mode (sessionid …{IG_SESSIONID[-6:]}) — enrichment {'ON' if ENRICH_POSTS else 'OFF'}")
    else:
        print("WARNING: no IG_SESSIONID in backend/.env — running logged-out (grids may be blocked, no likes/dates).")
    print(f"Tracking {len(BRAND_PROFILES)} brands\n")

    all_data = {"brands": {}}
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=(os.environ.get("SCRAPE_HEADLESS", "0") == "1"),
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            locale="en-IN",
        )
        if IG_SESSIONID:
            await context.add_cookies([{
                "name": "sessionid", "value": IG_SESSIONID,
                "domain": ".instagram.com", "path": "/", "httpOnly": True, "secure": True,
            }])

        page = await context.new_page()
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")

        for brand_id, brand_info in BRAND_PROFILES.items():
            all_data["brands"][brand_id] = await scrape_profile(context, page, brand_id, brand_info)
            await asyncio.sleep(3)

        await browser.close()

    all_data["last_updated"] = datetime.now(timezone.utc).isoformat()
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(all_data, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}\nINSTAGRAM CACHE COMPLETE!\n{'='*50}")
    for bid, data in all_data["brands"].items():
        st = data.get("stats", {})
        print(f"  {data['name']}: {st.get('followers', 0):,} followers, {st.get('posts', 0):,} posts, "
              f"{len(data.get('recent_posts', []))} recent")
    print(f"\nSaved to {CACHE_FILE}")


if __name__ == "__main__":
    asyncio.run(build_cache())
