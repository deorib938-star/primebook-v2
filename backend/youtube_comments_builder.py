# ================================
# youtube_comments_builder.py
# Fetches top comments for each brand's most-viewed cached videos so the
# /youtube/sentiment/{brand} endpoint has real text to analyze.
# Run: python youtube_comments_builder.py
# Uses YouTube Data API quota (~1 unit per video's commentThreads call).
# ================================

import asyncio
import json
import os
import httpx
from datetime import datetime, timezone

import os
try:
    from dotenv import load_dotenv; load_dotenv()
except Exception:
    pass
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "")
CACHE_FILE      = "youtube_cache.json"
OUT_FILE        = "youtube_comments.json"

MAX_VIDEOS_TRY      = 24   # walk down the video list this far looking for comments
TARGET_COMMENTS     = 70   # stop once we have this many comments for a brand
COMMENTS_PER_VIDEO  = 25   # top-level comments per video

BRAND_ORDER = ["primebook", "hp", "lenovo", "acer", "dell", "asus"]


def _all_videos(brand_cache):
    tabs, seen, out = brand_cache.get("tabs", {}), set(), []
    for key in ("videos_latest", "videos_popular", "videos_oldest", "shorts", "popular", "live"):
        for v in tabs.get(key, []):
            vid = v.get("video_id")
            if vid and vid not in seen:
                seen.add(vid)
                out.append(v)
    return out


async def fetch_comments(client, video_id):
    try:
        resp = await client.get(
            "https://www.googleapis.com/youtube/v3/commentThreads",
            params={
                "part": "snippet",
                "videoId": video_id,
                "maxResults": COMMENTS_PER_VIDEO,
                "order": "relevance",
                "textFormat": "plainText",
                "key": YOUTUBE_API_KEY,
            },
            timeout=20,
        )
        data = resp.json()
        if "error" in data:
            reason = data["error"].get("errors", [{}])[0].get("reason", "")
            print(f"       [skip] {video_id}: {reason or data['error'].get('message', '')[:60]}")
            return []
        out = []
        for item in data.get("items", []):
            top = item.get("snippet", {}).get("topLevelComment", {}).get("snippet", {})
            text = (top.get("textDisplay") or "").strip().replace("\n", " ")
            if text:
                out.append(text[:300])
        return out
    except Exception as e:
        print(f"       [error] {video_id}: {e}")
        return []


async def build():
    if not os.path.exists(CACHE_FILE):
        print(f"[ERROR] {CACHE_FILE} not found. Run youtube_cache_builder.py first.")
        return
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        cache = json.load(f)

    brands = cache.get("brands", {})
    result = {"last_updated": datetime.now(timezone.utc).isoformat(), "brands": {}}

    async with httpx.AsyncClient() as client:
        for bid in BRAND_ORDER:
            b = brands.get(bid)
            if not b:
                continue
            name = b.get("stats", {}).get("name", bid)
            vids = sorted(_all_videos(b), key=lambda v: v.get("views", 0), reverse=True)[:MAX_VIDEOS_TRY]
            print(f"[{bid.upper()}] {name} — scanning up to {len(vids)} videos for comments")

            comments, sampled, tried = [], 0, 0
            for v in vids:
                if len(comments) >= TARGET_COMMENTS:
                    break
                tried += 1
                c = await fetch_comments(client, v.get("video_id"))
                if c:
                    sampled += 1
                    comments.extend(c)
                    print(f"       {v.get('video_id')}: {len(c)} comments")

            result["brands"][bid] = {
                "name": name,
                "comments": comments,
                "sampled_videos": sampled,
                "total_comments": len(comments),
            }
            print(f"   -> {len(comments)} comments from {sampled} videos\n")

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[OK] Saved -> {OUT_FILE}")
    print("Brands:", {k: v["total_comments"] for k, v in result["brands"].items()})


if __name__ == "__main__":
    asyncio.run(build())
