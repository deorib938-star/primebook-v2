# ================================
# INSTAGRAM CACHE BUILDER
# Scrapes profile data for 5 competitor brands
# ================================

import asyncio
import re
import json
import os
import sys
from datetime import datetime, timezone
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding='utf-8')

CACHE_FILE = "instagram_cache.json"

BRAND_PROFILES = {
    "hp": {
        "name": "HP India",
        "handle": "hp_india",
        "url": "https://www.instagram.com/hp_india/",
    },
    "lenovo": {
        "name": "Lenovo India",
        "handle": "lenovo_india",
        "url": "https://www.instagram.com/lenovo_india/",
    },
    "acer": {
        "name": "Acer India",
        "handle": "acerindia",
        "url": "https://www.instagram.com/acerindia/",
    },
    "dell": {
        "name": "Dell India",
        "handle": "dellindia",
        "url": "https://www.instagram.com/dellindia/",
    },
    "asus": {
        "name": "ASUS India",
        "handle": "asusindia",
        "url": "https://www.instagram.com/asusindia/",
    },
    "primebook": {
        "name": "Primebook",
        "handle": "primebook.hq",
        "url": "https://www.instagram.com/primebook.hq/",
    },
}


def parse_count(text):
    """Convert '1.2M', '450K', '12,340' etc into an integer."""
    if not text:
        return 0
    text = text.strip().replace(",", "").replace(" ", "")
    text = text.lower()

    m = re.match(r'([\d.]+)\s*([km]?)', text)
    if not m:
        return 0

    try:
        num = float(m.group(1))
        suffix = m.group(2)
        if suffix == "k":
            num *= 1000
        elif suffix == "m":
            num *= 1000000
        return int(num)
    except:
        return 0


async def scrape_profile(page, brand_id, brand_info):
    print(f"\n{'='*50}")
    print(f"BRAND: {brand_info['name']} (@{brand_info['handle']})")
    print(f"{'='*50}")

    try:
        await page.goto(brand_info["url"], wait_until="domcontentloaded", timeout=25000)
        await asyncio.sleep(4)

        # Instagram embeds the full profile data in a meta description tag which is
        # much more reliable than DOM scraping since it doesn't depend on CSS classes
        meta_desc = ""
        try:
            meta_elem = page.locator('meta[name="description"]').first
            meta_desc = await meta_elem.get_attribute("content", timeout=5000) or ""
        except:
            pass

        followers = 0
        following = 0
        posts = 0

        # Meta pattern is usually: "1.2M Followers, 450 Following, 3,200 Posts - @handle on Instagram"
        m = re.search(r'([\d.,km]+)\s*Followers', meta_desc, re.IGNORECASE)
        if m:
            followers = parse_count(m.group(1))

        m = re.search(r'([\d.,km]+)\s*Following', meta_desc, re.IGNORECASE)
        if m:
            following = parse_count(m.group(1))

        m = re.search(r'([\d.,km]+)\s*Posts', meta_desc, re.IGNORECASE)
        if m:
            posts = parse_count(m.group(1))

        # Fallback: try DOM-based extraction if meta didn't work
        if followers == 0:
            try:
                stats_text = await page.evaluate("""
                    () => {
                        const items = document.querySelectorAll('header section ul li, header section span');
                        return Array.from(items).map(e => e.textContent).join(' | ');
                    }
                """)
                m = re.search(r'([\d.,km]+)\s*followers', stats_text, re.IGNORECASE)
                if m:
                    followers = parse_count(m.group(1))
                m = re.search(r'([\d.,km]+)\s*following', stats_text, re.IGNORECASE)
                if m:
                    following = parse_count(m.group(1))
                m = re.search(r'([\d.,km]+)\s*posts', stats_text, re.IGNORECASE)
                if m:
                    posts = parse_count(m.group(1))
            except:
                pass

        # Bio — from meta description or og:description
        bio = ""
        try:
            og_desc = await page.locator('meta[property="og:description"]').first.get_attribute("content", timeout=3000) or ""
            # og:description often contains bio after the stats
            bio_match = re.search(r'-\s*(.+?)(?:\.\s*\d+ Posts|$)', og_desc)
            if bio_match:
                bio = bio_match.group(1).strip()[:200]
        except:
            pass

        # Profile pic
        profile_pic = ""
        try:
            og_image = await page.locator('meta[property="og:image"]').first.get_attribute("content", timeout=3000) or ""
            profile_pic = og_image
        except:
            pass

        # Recent post thumbnails (best effort — may be blocked by login wall)
        recent_posts = []
        try:
            post_links = await page.locator('a[href*="/p/"], a[href*="/reel/"]').all()
            for link in post_links[:12]:
                try:
                    href = await link.get_attribute("href", timeout=1000)
                    if href:
                        full_url = "https://www.instagram.com" + href if href.startswith("/") else href
                        # Try to get thumbnail
                        img = link.locator("img").first
                        img_src = await img.get_attribute("src", timeout=1000) or ""
                        alt_text = await img.get_attribute("alt", timeout=1000) or ""
                        recent_posts.append({
                            "url": full_url,
                            "thumbnail": img_src,
                            "alt": alt_text[:150],
                            "type": "reel" if "/reel/" in href else "post",
                        })
                except:
                    continue
        except:
            pass

        # De-duplicate posts by URL
        seen_urls = set()
        unique_posts = []
        for p in recent_posts:
            if p["url"] not in seen_urls:
                seen_urls.add(p["url"])
                unique_posts.append(p)
        recent_posts = unique_posts[:12]

        result = {
            "brand_id": brand_id,
            "name": brand_info["name"],
            "handle": brand_info["handle"],
            "url": brand_info["url"],
            "stats": {
                "followers": followers,
                "following": following,
                "posts": posts,
            },
            "bio": bio,
            "profile_pic": profile_pic,
            "recent_posts": recent_posts,
            "post_count_found": len(recent_posts),
        }

        print(f"  Followers: {followers:,}")
        print(f"  Following: {following:,}")
        print(f"  Total posts: {posts:,}")
        print(f"  Recent posts scraped: {len(recent_posts)}")
        print(f"  Bio: {bio[:80]}")

        return result

    except Exception as e:
        print(f"  ERROR: {e}")
        return {
            "brand_id": brand_id,
            "name": brand_info["name"],
            "handle": brand_info["handle"],
            "url": brand_info["url"],
            "stats": {"followers": 0, "following": 0, "posts": 0},
            "bio": "",
            "profile_pic": "",
            "recent_posts": [],
            "error": str(e),
        }


async def build_cache():
    print("=== INSTAGRAM CACHE BUILDER ===")
    print(f"Tracking {len(BRAND_PROFILES)} brands\n")

    all_data = {"brands": {}}

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
            ]
        )

        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            locale="en-IN",
        )

        page = await context.new_page()
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
        """)

        for brand_id, brand_info in BRAND_PROFILES.items():
            data = await scrape_profile(page, brand_id, brand_info)
            all_data["brands"][brand_id] = data
            await asyncio.sleep(3)  # gentle delay between profiles

        await browser.close()

    all_data["last_updated"] = datetime.now(timezone.utc).isoformat()
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(all_data, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}")
    print("INSTAGRAM CACHE COMPLETE!")
    print(f"{'='*50}")
    for bid, data in all_data["brands"].items():
        stats = data.get("stats", {})
        print(f"  {data['name']}: {stats.get('followers', 0):,} followers, {stats.get('posts', 0):,} posts")
    print(f"\nSaved to {CACHE_FILE}")


if __name__ == "__main__":
    asyncio.run(build_cache())