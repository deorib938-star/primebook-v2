# ================================
# youtube_cache_builder.py
# Save in: backend/youtube_cache_builder.py
# Run: python youtube_cache_builder.py
# ================================

import asyncio
import json
import os
import re
import httpx
from datetime import datetime, timezone, timedelta

import os
try:
    from dotenv import load_dotenv; load_dotenv()
except Exception:
    pass
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "")
CACHE_FILE      = "youtube_cache.json"

BRAND_CHANNELS = {
    "primebook": { "handle": "@primebookhq",          "name": "Primebook"              },
    "hp":     { "handle": "@HPIndiaVideos",        "name": "HP India"               },
    "lenovo": { "handle": "@lenovoindia",            "name": "Lenovo India"           },
    "acer":   { "handle": "@AcerIndiaYT",            "name": "Acer India"             },
    "dell":   { "handle": "@DellTechnologies-India", "name": "Dell Technologies India" },
    "asus":   { "handle": "@ASUSIndia.official",     "name": "ASUS India"             },
}

BRAND_LABELS = {
    "primebook":"Primebook","hp":"HP","lenovo":"Lenovo","acer":"Acer","dell":"Dell","asus":"Asus"
}

# --- Helpers ------------------------------------------------------------------
def dur_seconds(iso: str) -> int:
    if not iso: return 0
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not m: return 0
    return int(m.group(1) or 0)*3600 + int(m.group(2) or 0)*60 + int(m.group(3) or 0)

def is_short(iso: str) -> bool:
    return dur_seconds(iso) <= 65

async def api_get(url: str, params: dict) -> dict:
    params = {**params, "key": YOUTUBE_API_KEY}
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, timeout=20)
        data = resp.json()
        # -- Show any API error immediately --
        if "error" in data:
            err = data["error"]
            print(f"\n  [ERROR] API ERROR {err.get('code')}: {err.get('message')}")
            for e in err.get("errors", []):
                print(f"     reason: {e.get('reason')} | domain: {e.get('domain')}")
        return data

async def get_stats(video_ids: list) -> dict:
    if not video_ids: return {}
    data = await api_get(
        "https://www.googleapis.com/youtube/v3/videos",
        {"part": "statistics,contentDetails", "id": ",".join(video_ids)}
    )
    result = {}
    for v in data.get("items", []):
        dur = v["contentDetails"].get("duration", "")
        result[v["id"]] = {
            "views":         int(v["statistics"].get("viewCount",    0)),
            "likes":         int(v["statistics"].get("likeCount",    0)),
            "comments":      int(v["statistics"].get("commentCount", 0)),
            "duration":      dur,
            "duration_secs": dur_seconds(dur),
            "is_short":      is_short(dur),
        }
    return result

def build_video(item: dict, stats: dict) -> dict:
    vid_id  = item.get("id", {}).get("videoId", "")
    s       = stats.get(vid_id, {})
    snippet = item.get("snippet", {})
    dur     = s.get("duration", "")
    return {
        "video_id":      vid_id,
        "title":         snippet.get("title", ""),
        "channel":       snippet.get("channelTitle", ""),
        "channel_id":    snippet.get("channelId", ""),
        "published_at":  snippet.get("publishedAt", ""),
        "thumbnail":     snippet.get("thumbnails", {}).get("high", {}).get("url", ""),
        "url":           f"https://www.youtube.com/watch?v={vid_id}",
        "views":         s.get("views",         0),
        "likes":         s.get("likes",         0),
        "comments":      s.get("comments",      0),
        "duration":      dur,
        "duration_secs": s.get("duration_secs", 0),
        "is_short":      s.get("is_short",      False),
    }

async def resolve_channel_id(handle: str) -> str:
    data  = await api_get(
        "https://www.googleapis.com/youtube/v3/channels",
        {"part": "id", "forHandle": handle.lstrip("@")}
    )
    items = data.get("items", [])
    return items[0]["id"] if items else None

async def fetch_channel_stats(channel_id: str, handle: str, name: str) -> dict:
    data  = await api_get(
        "https://www.googleapis.com/youtube/v3/channels",
        {"part": "snippet,statistics,brandingSettings", "id": channel_id}
    )
    items = data.get("items", [])
    if not items:
        return {}
    item   = items[0]
    stats  = item.get("statistics", {})
    snip   = item.get("snippet", {})
    banner = item.get("brandingSettings", {}).get("image", {}).get("bannerExternalUrl", "")
    return {
        "channel_id":  channel_id,
        "name":        snip.get("title", name),
        "handle":      handle,
        "thumbnail":   snip.get("thumbnails", {}).get("high", {}).get("url", ""),
        "banner":      banner,
        "subscribers": int(stats.get("subscriberCount", 0)),
        "total_views": int(stats.get("viewCount",       0)),
        "video_count": int(stats.get("videoCount",      0)),
    }

# --- Core fetch: search within a channel -------------------------------------
async def search_channel(channel_id: str, order: str, max_results: int, extra: dict = {}) -> list:
    params = {
        "part":       "snippet",
        "channelId":  channel_id,
        "type":       "video",
        "order":      order,
        "maxResults": max_results,
        **extra,
    }
    data = await api_get("https://www.googleapis.com/youtube/v3/search", params)

    items = data.get("items", [])
    print(f"       -> API returned {len(items)} items")

    video_ids = [i["id"]["videoId"] for i in items if i.get("id", {}).get("videoId")]
    stats_map = await get_stats(video_ids)
    return [build_video(i, stats_map) for i in items if i.get("id", {}).get("videoId")]

# --- Fetch all tabs ------------------------------------------------------------
async def fetch_all_tabs(channel_id: str) -> dict:

    print(f"       Fetching Videos-latest...")
    raw     = await search_channel(channel_id, "date",      20)
    latest  = [v for v in raw if not v["is_short"]][:12]
    print(f"       -> {len(latest)} regular videos")

    print(f"       Fetching Videos-popular...")
    raw     = await search_channel(channel_id, "viewCount", 20)
    popular = [v for v in raw if not v["is_short"]][:12]
    print(f"       -> {len(popular)} popular videos")

    print(f"       Fetching Videos-oldest...")
    raw    = await search_channel(channel_id, "date",       50)
    oldest = [v for v in raw if not v["is_short"]]
    oldest.reverse()
    oldest = oldest[:12]
    print(f"       -> {len(oldest)} oldest videos")

    print(f"       Fetching Shorts...")
    raw    = await search_channel(channel_id, "date", 25, {"videoDuration": "short"})
    shorts = [v for v in raw if v["is_short"]][:12]
    print(f"       -> {len(shorts)} shorts")

    print(f"       Fetching Popular tab (long videos)...")
    raw = await search_channel(channel_id, "viewCount", 20, {"videoDuration": "long"})
    pop = [v for v in raw if not v["is_short"]][:12]
    print(f"       -> {len(pop)} popular long videos")

    print(f"       Fetching Live (eventType=completed)...")
    data = await api_get("https://www.googleapis.com/youtube/v3/search", {
        "part":      "snippet",
        "channelId": channel_id,
        "type":      "video",
        "eventType": "completed",
        "order":     "date",
        "maxResults": 15,
    })
    live_items = data.get("items", [])
    print(f"       -> API returned {len(live_items)} live items")
    if live_items:
        live_ids   = [i["id"]["videoId"] for i in live_items if i.get("id", {}).get("videoId")]
        live_stats = await get_stats(live_ids)
        live       = [build_video(i, live_stats) for i in live_items if i.get("id", {}).get("videoId")]
        live       = [v for v in live if not v["is_short"]][:12]
    else:
        print(f"       -> Falling back to long videos for Live tab...")
        raw  = await search_channel(channel_id, "date", 15, {"videoDuration": "long"})
        live = [v for v in raw if not v["is_short"]][:12]
    print(f"       -> {len(live)} live videos")

    return {
        "videos_latest":  latest,
        "videos_popular": popular,
        "videos_oldest":  oldest,
        "shorts":         shorts,
        "popular":        pop,
        "live":           live,
    }

# --- Fetch related videos -----------------------------------------------------
async def fetch_related(brand_id: str, channel_id: str) -> list:
    label   = BRAND_LABELS[brand_id]
    queries = [
        f"{label} laptop India review 2025",
        f"{label} laptop vs comparison India",
    ]
    all_videos = []
    for query in queries:
        print(f"       Searching: '{query}'")
        data  = await api_get("https://www.googleapis.com/youtube/v3/search", {
            "part":          "snippet",
            "q":             query,
            "type":          "video",
            "order":         "viewCount",
            "maxResults":    15,
            "regionCode":    "IN",
            "videoDuration": "medium",
        })
        items     = data.get("items", [])
        print(f"       -> {len(items)} results from YouTube")
        items     = [i for i in items if i.get("snippet", {}).get("channelId") != channel_id]
        video_ids = [i["id"]["videoId"] for i in items if i.get("id", {}).get("videoId")]
        stats_map = await get_stats(video_ids)
        videos    = [build_video(i, stats_map) for i in items if i.get("id", {}).get("videoId")]
        videos    = [v for v in videos if v["duration_secs"] >= 120 and not v["is_short"]]
        print(f"       -> {len(videos)} valid after filtering")
        all_videos.extend(videos)

    seen, unique = set(), []
    for v in all_videos:
        if v["video_id"] not in seen:
            seen.add(v["video_id"])
            unique.append(v)
    unique.sort(key=lambda x: x["views"], reverse=True)
    return unique[:8]

# --- Main ---------------------------------------------------------------------
async def build_cache():
    print("\n" + "="*52)
    print("  YOUTUBE CACHE BUILDER")
    print("  API Key:", YOUTUBE_API_KEY[:20] + "...")
    print("="*52 + "\n")

    # -- Quick API key test --
    print("Testing API key...")
    test = await api_get(
        "https://www.googleapis.com/youtube/v3/videos",
        {"part": "snippet", "id": "dQw4w9WgXcQ"}
    )
    if "error" in test:
        print("[ERROR] API key test FAILED -- check the key and try again")
        return
    elif test.get("items"):
        print("[OK] API key working!\n")
    else:
        print("[WARN]  API key responded but returned no items -- may still work\n")

    cache = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "next_update":  (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "brands": {}
    }

    for brand_id, ch_info in BRAND_CHANNELS.items():
        print(f"[{brand_id.upper()}] {ch_info['name']}")

        print(f"  Resolving channel ID for {ch_info['handle']}...")
        channel_id = await resolve_channel_id(ch_info["handle"])
        if not channel_id:
            print(f"  [ERROR] Could not resolve. Skipping.\n")
            continue
        print(f"  [OK] Channel ID: {channel_id}")

        print(f"  Fetching channel stats...")
        stats = await fetch_channel_stats(channel_id, ch_info["handle"], ch_info["name"])
        print(f"  [OK] Subscribers: {stats.get('subscribers', 0):,}")

        print(f"  Fetching all tabs...")
        tabs = await fetch_all_tabs(channel_id)

        print(f"  Fetching related videos...")
        related = await fetch_related(brand_id, channel_id)
        print(f"  [OK] Related: {len(related)} videos")

        cache["brands"][brand_id] = {
            "channel_id": channel_id,
            "stats":      stats,
            "tabs":       tabs,
            "related":    related,
        }

        # Summary per brand
        print(f"\n  [SUMMARY] {brand_id.upper()} SUMMARY:")
        print(f"     videos_latest:  {len(tabs['videos_latest'])}")
        print(f"     videos_popular: {len(tabs['videos_popular'])}")
        print(f"     videos_oldest:  {len(tabs['videos_oldest'])}")
        print(f"     shorts:         {len(tabs['shorts'])}")
        print(f"     popular:        {len(tabs['popular'])}")
        print(f"     live:           {len(tabs['live'])}")
        print(f"     related:        {len(related)}\n")

    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

    print("="*52)
    print(f"  [OK] CACHE SAVED -> {CACHE_FILE}")
    print(f"  Last updated : {cache['last_updated']}")
    print(f"  Next update  : {cache['next_update']}")
    print(f"  Brands cached: {list(cache['brands'].keys())}")
    print("="*52 + "\n")

if __name__ == "__main__":
    asyncio.run(build_cache())