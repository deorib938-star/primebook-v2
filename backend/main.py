# ================================
# PRIMEBOOK INTELLIGENCE API
# FastAPI Backend v2.1
# ================================
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from competitor_registry import competitors, primebook
import json
import os
import re
import httpx

app = FastAPI(title="Primebook Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================================
# PRIME MODEL DEFINITIONS
# ================================

PRIME_MODELS = [
    {
        "name": "Primebook 2 Neo",
        "price": 19990,
        "ram": 6,
        "storage": 128,
        "display": 11.6,
        "battery": 8,
        "price_range_min": 10000,
        "price_range_max": 25000,
    },
    {
        "name": "Primebook 2 Pro",
        "price": 25990,
        "ram": 8,
        "storage": 128,
        "display": 14.1,
        "battery": 14,
        "price_range_min": 20000,
        "price_range_max": 30000,
    },
    {
        "name": "Primebook 2 Max",
        "price": 27990,
        "ram": 8,
        "storage": 256,
        "display": 15.6,
        "battery": 12,
        "price_range_min": 25000,
        "price_range_max": 40000,
    },
]

# ================================
# LOAD CACHES
# ================================

def load_amazon_cache():
    if os.path.exists("product_cache.json"):
        try:
            with open("product_cache.json", "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
        except:
            pass
    return {}

def load_flipkart_cache():
    if os.path.exists("flipkart_cache.json"):
        try:
            with open("flipkart_cache.json", "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
        except:
            pass
    return {}

# ================================
# DUPLICATE DETECTION
# ================================

def clean_name(name):
    name = re.sub(r'\s+', ' ', name.lower().strip())
    for word in ["laptop", "notebook", "thin and light", "series"]:
        name = name.replace(word, "")
    return name.strip()

def is_similar(name1, name2, threshold=0.5):
    w1 = set(clean_name(name1).split())
    w2 = set(clean_name(name2).split())
    if not w1 or not w2:
        return False
    common = w1.intersection(w2)
    similarity = len(common) / max(len(w1), len(w2))
    return similarity >= threshold

def is_duplicate(p1, p2):
    if is_similar(p1.get("name", ""), p2.get("name", "")):
        return True
    if (p1.get("ram_gb") == p2.get("ram_gb") and
        p1.get("storage_gb") == p2.get("storage_gb") and
        p1.get("display_inch") == p2.get("display_inch") and
        p1.get("os") == p2.get("os") and
        p1.get("brand") == p2.get("brand")):
        return True
    return False

# ================================
# MERGE AMAZON + FLIPKART
# ================================

def merge_products(amazon_products, flipkart_products):
    merged = []
    used_flipkart = set()

    for ap in amazon_products:
        matched = False
        for i, fp in enumerate(flipkart_products):
            if i in used_flipkart:
                continue
            if is_duplicate(ap, fp):
                amazon_price   = ap.get("price_inr", 0)
                flipkart_price = fp.get("price_inr", 0)
                if amazon_price > 0 and flipkart_price > 0:
                    best_price  = min(amazon_price, flipkart_price)
                    best_source = "Amazon" if amazon_price <= flipkart_price else "Flipkart"
                elif amazon_price > 0:
                    best_price, best_source = amazon_price, "Amazon"
                else:
                    best_price, best_source = flipkart_price, "Flipkart"

                merged_product = {**ap}
                merged_product["price_inr"]      = best_price
                merged_product["amazon_price"]   = amazon_price
                merged_product["flipkart_price"] = flipkart_price
                merged_product["best_source"]    = best_source
                merged_product["source"]         = "Both"
                used_flipkart.add(i)
                matched = True
                merged.append(merged_product)
                break

        if not matched:
            p = {**ap}
            p["amazon_price"]   = ap.get("price_inr", 0)
            p["flipkart_price"] = 0
            p["best_source"]    = "Amazon"
            merged.append(p)

    for i, fp in enumerate(flipkart_products):
        if i not in used_flipkart:
            p = {**fp}
            p["amazon_price"]   = 0
            p["flipkart_price"] = fp.get("price_inr", 0)
            p["best_source"]    = "Flipkart"
            merged.append(p)

    final = []
    for p in merged:
        is_dup = False
        for existing in final:
            if is_duplicate(p, existing):
                if p.get("price_inr", 0) < existing.get("price_inr", 0):
                    final.remove(existing)
                    final.append(p)
                is_dup = True
                break
        if not is_dup:
            final.append(p)

    final.sort(key=lambda x: x.get("reviews", 0), reverse=True)
    return final

def get_combined_products():
    amazon   = load_amazon_cache()
    flipkart = load_flipkart_cache()
    combined = {}

    all_brands = set(list(amazon.keys()) + list(flipkart.keys()))
    all_brands.discard("last_updated")
    all_brands.discard("next_update")

    for brand_id in all_brands:
        amazon_products   = amazon.get(brand_id, {}).get("products", [])
        flipkart_products = flipkart.get(brand_id, {}).get("products", [])
        merged            = merge_products(amazon_products, flipkart_products)
        brand_name        = (
            amazon.get(brand_id, {}).get("name") or
            flipkart.get(brand_id, {}).get("name") or
            brand_id.upper()
        )
        combined[brand_id] = {
            "name":            brand_name,
            "products":        merged,
            "total":           len(merged),
            "amazon_count":    len(amazon_products),
            "flipkart_count":  len(flipkart_products),
        }

    return combined

# ================================
# RELEVANT PRODUCTS
# ================================

def get_relevant_products(brand_id, prime_model, max_products=10):
    combined     = get_combined_products()
    brand_data   = combined.get(brand_id, {})
    all_products = brand_data.get("products", [])

    if not all_products:
        return []

    price_min = prime_model["price_range_min"]
    price_max = prime_model["price_range_max"]

    in_range  = [p for p in all_products if price_min <= p.get("price_inr", 0) <= price_max]
    out_range = [p for p in all_products if p not in in_range]

    def relevance_score(product):
        score = 0
        comp_price = product.get("price_inr", 0)
        if comp_price > 0:
            price_diff = abs(prime_model["price"] - comp_price) / prime_model["price"]
            if price_diff   <= 0.1:  score += 100
            elif price_diff <= 0.2:  score += 80
            elif price_diff <= 0.4:  score += 60
            elif price_diff <= 0.6:  score += 40
            else:                    score += 20

        comp_ram = product.get("ram_gb", 0)
        if comp_ram > 0:
            ram_diff = abs(prime_model["ram"] - comp_ram)
            if ram_diff == 0:    score += 40
            elif ram_diff <= 2:  score += 25
            elif ram_diff <= 4:  score += 10

        comp_display = product.get("display_inch", 0)
        if comp_display > 0:
            display_diff = abs(prime_model["display"] - comp_display)
            if display_diff <= 0.5:  score += 35
            elif display_diff <= 1:  score += 20
            elif display_diff <= 2:  score += 10

        reviews      = product.get("reviews", 0)
        rating       = product.get("rating", 0)
        review_score = min(reviews / 20, 100)
        rating_score = (rating / 5) * 100 if rating > 0 else 0
        score       += (review_score * 0.7) + (rating_score * 0.3)

        return score

    in_range.sort(key=relevance_score, reverse=True)
    out_range.sort(key=relevance_score, reverse=True)

    seen_specs = []
    for p in in_range:
        spec_key = (p.get("ram_gb"), p.get("storage_gb"), p.get("display_inch"), p.get("os"))
        if spec_key in seen_specs:
            p["is_duplicate"]     = True
            p["duplicate_reason"] = "Same specs as a higher-ranked product"
        else:
            p["is_duplicate"]     = False
            p["duplicate_reason"] = ""
            seen_specs.append(spec_key)

    for p in out_range:
        spec_key = (p.get("ram_gb"), p.get("storage_gb"), p.get("display_inch"), p.get("os"))
        p["is_duplicate"]     = spec_key in seen_specs
        p["duplicate_reason"] = "Same specs as in-range product" if p["is_duplicate"] else ""
        if not p["is_duplicate"]:
            seen_specs.append(spec_key)

    result = in_range[:max_products]
    if len(result) < max_products:
        needed  = max_products - len(result)
        result += out_range[:needed]

    for p in result:
        if p not in in_range:
            p["out_of_range"]      = True
            p["out_of_range_note"] = f"Outside Rs.{price_min:,}-Rs.{price_max:,} comparison range"
        else:
            p["out_of_range"]      = False
            p["out_of_range_note"] = ""

    return result[:max_products]

# ================================
# ROUTES
# ================================

@app.get("/")
def home():
    return {"status": "Primebook API running!", "version": "2.1"}

@app.get("/competitors")
def get_competitors():
    return competitors

@app.get("/primebook")
def get_primebook():
    return primebook

@app.get("/products")
def get_all_products():
    return get_combined_products()

@app.get("/products/{brand_id}")
def get_brand_products(brand_id: str):
    combined = get_combined_products()
    if brand_id in combined:
        return combined[brand_id]
    return {"error": "Brand not found"}

@app.get("/all-raw-products")
def get_all_raw_products():
    amazon   = load_amazon_cache()
    flipkart = load_flipkart_cache()
    all_products = {}

    for brand_id in ["hp", "acer", "lenovo", "dell", "asus"]:
        amazon_products   = amazon.get(brand_id, {}).get("products", [])
        flipkart_products = flipkart.get(brand_id, {}).get("products", [])
        brand_name        = (
            amazon.get(brand_id, {}).get("name") or
            flipkart.get(brand_id, {}).get("name") or
            brand_id.upper()
        )
        all_products[brand_id] = {
            "name":           brand_name,
            "products":       amazon_products + flipkart_products,
            "total":          len(amazon_products) + len(flipkart_products),
            "amazon_count":   len(amazon_products),
            "flipkart_count": len(flipkart_products),
        }
    return all_products

@app.get("/cache/status")
def cache_status():
    amazon   = load_amazon_cache()
    flipkart = load_flipkart_cache()
    combined = get_combined_products()

    return {
        "amazon_last_updated":   amazon.get("last_updated", "Never"),
        "flipkart_last_updated": flipkart.get("last_updated", "Never"),
        "brands": {
            bid: {
                "name":           data["name"],
                "total":          data["total"],
                "amazon_count":   data["amazon_count"],
                "flipkart_count": data["flipkart_count"],
            }
            for bid, data in combined.items()
        }
    }

@app.get("/relevant-products/{brand_id}/{prime_index}")
def get_relevant(brand_id: str, prime_index: int = 0):
    if prime_index < 0 or prime_index >= len(PRIME_MODELS):
        return {"error": "Invalid prime index"}

    prime    = PRIME_MODELS[prime_index]
    products = get_relevant_products(brand_id, prime)

    return {
        "brand_id":        brand_id,
        "primebook_model": prime["name"],
        "price_range":     f"Rs. {prime['price_range_min']:,} - Rs. {prime['price_range_max']:,}",
        "total":           len(products),
        "products":        products,
    }

# ================================
# YOUTUBE TRACKING — CACHED VERSION
# Replace everything from YOUTUBE_API_KEY = ... to end of main.py
# ================================

YOUTUBE_API_KEY = "AIzaSyBHjJOtHy4H1NxVfgV9xuKNVsGngdOwFss"  # new key

CACHE_FILE = "youtube_cache.json"
CACHE_MAX_AGE_DAYS = 7

BRAND_CHANNELS = {
    "hp":     { "handle": "@HPIndiaVideos",        "name": "HP India"               },
    "lenovo": { "handle": "@lenovoindia",            "name": "Lenovo India"           },
    "acer":   { "handle": "@AcerIndiaYT",            "name": "Acer India"             },
    "dell":   { "handle": "@DellTechnologies-India", "name": "Dell Technologies India" },
    "asus":   { "handle": "@ASUSIndia.official",     "name": "ASUS India"             },
}

import re as _re
import json as _json
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import Query

# ─── Cache helpers ─────────────────────────────────────────────────────────────

def _load_cache() -> dict:
    """Load youtube_cache.json from disk. Returns {} if missing."""
    if not os.path.exists(CACHE_FILE):
        return {}
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return _json.load(f)
    except Exception:
        return {}

def _cache_is_fresh(cache: dict) -> bool:
    """Returns True if cache was updated within the last 7 days."""
    last = cache.get("last_updated")
    if not last:
        return False
    try:
        updated = datetime.fromisoformat(last)
        return (datetime.now(timezone.utc) - updated) < timedelta(days=CACHE_MAX_AGE_DAYS)
    except Exception:
        return False

def _brand_cache(brand_id: str) -> dict:
    """Get the cached data for one brand. Returns {} if not cached."""
    cache = _load_cache()
    return cache.get("brands", {}).get(brand_id, {})

# ─── Cache status route ────────────────────────────────────────────────────────
@app.get("/youtube/cache/status")
def youtube_cache_status():
    cache = _load_cache()
    if not cache:
        return {
            "cached": False,
            "message": "No cache found. Run: python youtube_cache_builder.py",
            "last_updated": None,
            "next_update": None,
            "brands_cached": [],
        }
    brands = list(cache.get("brands", {}).keys())
    return {
        "cached":        True,
        "fresh":         _cache_is_fresh(cache),
        "last_updated":  cache.get("last_updated"),
        "next_update":   cache.get("next_update"),
        "brands_cached": brands,
        "message":       "Cache is fresh ✅" if _cache_is_fresh(cache) else "Cache is stale ⚠️ — run youtube_cache_builder.py",
    }

# ─── All channel stats (brand selector cards) ─────────────────────────────────
@app.get("/youtube/all/channels")
def get_all_channel_stats():
    """
    Reads from cache. Returns channel stats for all 5 brands.
    Zero API calls.
    """
    cache   = _load_cache()
    brands  = cache.get("brands", {})
    results = {}
    for brand_id in BRAND_CHANNELS:
        b = brands.get(brand_id, {})
        if b:
            results[brand_id] = b.get("stats", {})
        else:
            results[brand_id] = {"error": "not cached yet"}
    return results

# ─── Single channel stats ──────────────────────────────────────────────────────
@app.get("/youtube/{brand_id}/channel")
def get_channel_stats(brand_id: str):
    brand_id = brand_id.lower()
    b = _brand_cache(brand_id)
    if not b:
        return {"error": "Not cached yet. Run: python youtube_cache_builder.py"}
    return b.get("stats", {})

# ─── Tab: Videos (latest / popular / oldest) ──────────────────────────────────
@app.get("/youtube/{brand_id}/tab/videos")
def get_videos_tab(
    brand_id:    str,
    sort:        str = Query(default="latest"),
    page_token:  Optional[str] = Query(default=None),
    max_results: int = Query(default=12),
):
    brand_id = brand_id.lower()
    b = _brand_cache(brand_id)
    if not b:
        return {"videos": [], "next_page_token": None, "error": "Not cached yet"}

    tabs = b.get("tabs", {})
    key  = {"latest": "videos_latest", "popular": "videos_popular", "oldest": "videos_oldest"}.get(sort, "videos_latest")
    all_videos = tabs.get(key, [])

    # Simple pagination using page number as token
    page  = int(page_token or 0)
    start = page * max_results
    end   = start + max_results
    page_videos = all_videos[start:end]

    return {
        "brand_id":        brand_id,
        "sort":            sort,
        "videos":          page_videos,
        "next_page_token": str(page + 1) if end < len(all_videos) else None,
    }

# ─── Tab: Shorts ───────────────────────────────────────────────────────────────
@app.get("/youtube/{brand_id}/tab/shorts")
def get_shorts_tab(
    brand_id:    str,
    sort:        str = Query(default="latest"),
    page_token:  Optional[str] = Query(default=None),
    max_results: int = Query(default=12),
):
    brand_id = brand_id.lower()
    b = _brand_cache(brand_id)
    if not b:
        return {"videos": [], "next_page_token": None, "error": "Not cached yet"}

    all_videos = b.get("tabs", {}).get("shorts", [])

    # Sort by views if popular
    if sort == "popular":
        all_videos = sorted(all_videos, key=lambda x: x.get("views", 0), reverse=True)

    page  = int(page_token or 0)
    start = page * max_results
    end   = start + max_results

    return {
        "brand_id":        brand_id,
        "sort":            sort,
        "videos":          all_videos[start:end],
        "next_page_token": str(page + 1) if end < len(all_videos) else None,
    }

# ─── Tab: Popular ──────────────────────────────────────────────────────────────
@app.get("/youtube/{brand_id}/tab/popular")
def get_popular_tab(
    brand_id:    str,
    page_token:  Optional[str] = Query(default=None),
    max_results: int = Query(default=12),
):
    brand_id = brand_id.lower()
    b = _brand_cache(brand_id)
    if not b:
        return {"videos": [], "next_page_token": None, "error": "Not cached yet"}

    all_videos = b.get("tabs", {}).get("popular", [])
    page  = int(page_token or 0)
    start = page * max_results
    end   = start + max_results

    return {
        "brand_id":        brand_id,
        "videos":          all_videos[start:end],
        "next_page_token": str(page + 1) if end < len(all_videos) else None,
    }

# ─── Tab: Live ─────────────────────────────────────────────────────────────────
@app.get("/youtube/{brand_id}/tab/live")
def get_live_tab(
    brand_id:    str,
    page_token:  Optional[str] = Query(default=None),
    max_results: int = Query(default=12),
):
    brand_id = brand_id.lower()
    b = _brand_cache(brand_id)
    if not b:
        return {"videos": [], "next_page_token": None, "error": "Not cached yet"}

    all_videos = b.get("tabs", {}).get("live", [])
    page  = int(page_token or 0)
    start = page * max_results
    end   = start + max_results

    return {
        "brand_id":        brand_id,
        "videos":          all_videos[start:end],
        "next_page_token": str(page + 1) if end < len(all_videos) else None,
    }

# ─── Related videos ────────────────────────────────────────────────────────────
@app.get("/youtube/{brand_id}/related")
def get_related_videos(brand_id: str):
    brand_id = brand_id.lower()
    b = _brand_cache(brand_id)
    if not b:
        return {"videos": [], "error": "Not cached yet"}
    videos = b.get("related", [])
    return {"brand_id": brand_id, "total": len(videos), "videos": videos}

# ─── Summary (legacy support) ──────────────────────────────────────────────────
@app.get("/youtube/all/summary")
def get_youtube_all_summary():
    cache   = _load_cache()
    brands  = cache.get("brands", {})
    results = {}
    for brand_id in BRAND_CHANNELS:
        b = brands.get(brand_id, {})
        results[brand_id] = b.get("tabs", {}).get("videos_latest", [])[:8]
    return results

AI_ANALYSIS_CACHE = {}
AI_ANALYSIS_CACHE_TIME = None

@app.get("/youtube/ai-analysis")
async def get_youtube_ai_analysis():
    # Return cached result if fresh (under 24 hours)
    global AI_ANALYSIS_CACHE_TIME
    if "result" in AI_ANALYSIS_CACHE and AI_ANALYSIS_CACHE_TIME:
        hours_old = (datetime.now() - AI_ANALYSIS_CACHE_TIME).total_seconds() / 3600
        if hours_old < 24:
            print(f"Returning cached AI analysis ({hours_old:.1f} hours old)")
            return AI_ANALYSIS_CACHE["result"]
        else:
            print("Cache expired — refreshing AI analysis")

    cache = _load_cache()
    brands = cache.get("brands", {})

    # Get data for ALL brands together
    all_brand_data = {}
    for bid in BRAND_CHANNELS:
        b = brands.get(bid, {})
        if b:
            stats = b.get("stats", {})
            videos_latest  = b.get("tabs", {}).get("videos_latest", [])[:10]
            videos_popular = b.get("tabs", {}).get("popular", [])[:5]
            all_brand_data[bid] = {
                "name":           BRAND_CHANNELS[bid]["name"],
                "subscribers":    stats.get("subscribers", 0),
                "video_count":    stats.get("video_count", 0),
                "total_views":    stats.get("total_views", 0),
                "avg_views":      sum(v.get("views", 0) for v in videos_latest) // max(len(videos_latest), 1),
                "recent_titles":  [v.get("title", "") for v in videos_latest],
                "popular_titles": [v.get("title", "") for v in videos_popular],
            }

    # Build comprehensive prompt for ALL brands
    brand_summary = ""
    for bid, data in all_brand_data.items():
        brand_summary += f"""
{data['name']}:
- Subscribers: {data['subscribers']:,}
- Total Videos: {data['video_count']}
- Total Views: {data['total_views']:,}
- Average Views per Video: {data['avg_views']:,}
- Recent Video Titles: {', '.join(data['recent_titles'][:5])}
- Most Popular Videos: {', '.join(data['popular_titles'][:3])}
"""

    prompt = f"""You are a senior market intelligence analyst for Primebook India — an Android 15 laptop brand competing in the Rs. 10,000-40,000 budget laptop segment in India.

Analyze the YouTube presence of ALL 5 competitor brands together and provide ONE comprehensive market intelligence report specifically for Primebook's content and marketing strategy.

COMPETITOR YOUTUBE DATA (ALL 5 BRANDS):
{brand_summary}

PRIMEBOOK PRODUCTS:
- Neo: Rs. 19,990 | 6GB RAM | 11.6" | Android 15 | Battery 8hrs
- Pro: Rs. 25,990 | 8GB RAM | 14.1" | Android 15 | Battery 14hrs  
- Max: Rs. 27,990 | 8GB RAM | 15.6" | Android 15 | Battery 12hrs

Analyze ALL brands together and identify the overall competitive landscape. Provide exactly this JSON structure:

{{
  "key_insights": [
    {{"icon": "🔥", "title": "concise title max 8 words", "text": "2 clear sentences with specific data points"}},
    {{"icon": "📈", "title": "concise title max 8 words", "text": "2 clear sentences with specific data points"}},
    {{"icon": "✅", "title": "concise title max 8 words", "text": "2 clear sentences with specific data points"}},
    {{"icon": "🎯", "title": "concise title max 8 words", "text": "2 clear sentences with specific data points"}},
    {{"icon": "⚠️", "title": "concise title max 8 words", "text": "2 clear sentences with specific data points"}}
  ],
  "opportunities": [
    {{"icon": "🎬", "title": "concise action title", "text": "2 sentences explaining what to do and why"}},
    {{"icon": "👨‍👩‍👧", "title": "concise action title", "text": "2 sentences explaining what to do and why"}},
    {{"icon": "📊", "title": "concise action title", "text": "2 sentences explaining what to do and why"}},
    {{"icon": "🏆", "title": "concise action title", "text": "2 sentences explaining what to do and why"}}
  ],
  "market_summary": [
    {{"color": "#E24B4A", "text": "**HP India** specific data-driven point about their YouTube strategy"}},
    {{"color": "#f97316", "text": "**Lenovo India** specific data-driven point about their YouTube strategy"}},
    {{"color": "#378ADD", "text": "**Acer India** specific data-driven point about their YouTube strategy"}},
    {{"color": "#28a745", "text": "**Dell India** specific data-driven point about their YouTube strategy"}},
    {{"color": "#94a3b8", "text": "**Asus India** specific data-driven point about their YouTube strategy"}},
    {{"color": "#C9A84C", "text": "**Overall gap** the biggest content opportunity Primebook should capture now"}}
  ],
  "viewer_types": {{
    "hp":     [{{"type": "Students", "pct": 42, "desc": "college buyers", "color": "#378ADD"}}, {{"type": "Professionals", "pct": 28, "desc": "WFH workers", "color": "#C9A84C"}}, {{"type": "Parents", "pct": 18, "desc": "buying for kids", "color": "#28a745"}}, {{"type": "Adults", "pct": 12, "desc": "home use", "color": "#94a3b8"}}],
    "lenovo": [{{"type": "Students", "pct": 30, "desc": "college buyers", "color": "#378ADD"}}, {{"type": "Professionals", "pct": 40, "desc": "WFH workers", "color": "#C9A84C"}}, {{"type": "Parents", "pct": 18, "desc": "buying for kids", "color": "#28a745"}}, {{"type": "Adults", "pct": 12, "desc": "home use", "color": "#94a3b8"}}],
    "acer":   [{{"type": "Students", "pct": 30, "desc": "college buyers", "color": "#378ADD"}}, {{"type": "Gamers", "pct": 40, "desc": "gaming audience", "color": "#E24B4A"}}, {{"type": "Professionals", "pct": 20, "desc": "WFH workers", "color": "#C9A84C"}}, {{"type": "Adults", "pct": 10, "desc": "home use", "color": "#94a3b8"}}],
    "dell":   [{{"type": "Professionals", "pct": 50, "desc": "office workers", "color": "#C9A84C"}}, {{"type": "Students", "pct": 25, "desc": "college buyers", "color": "#378ADD"}}, {{"type": "Adults", "pct": 15, "desc": "home use", "color": "#94a3b8"}}, {{"type": "Parents", "pct": 10, "desc": "buying for kids", "color": "#28a745"}}],
    "asus":   [{{"type": "Gamers", "pct": 38, "desc": "gaming audience", "color": "#E24B4A"}}, {{"type": "Students", "pct": 30, "desc": "college buyers", "color": "#378ADD"}}, {{"type": "Professionals", "pct": 22, "desc": "WFH workers", "color": "#C9A84C"}}, {{"type": "Adults", "pct": 10, "desc": "home use", "color": "#94a3b8"}}]
  }},
  "content_types": {{
    "hp":     [{{"label": "Product demos", "pct": 35, "color": "#C9A84C"}}, {{"label": "Tutorials", "pct": 28, "color": "#378ADD"}}, {{"label": "Unboxing", "pct": 20, "color": "#28a745"}}, {{"label": "Ads", "pct": 12, "color": "#E24B4A"}}, {{"label": "Comparisons", "pct": 5, "color": "#94a3b8"}}],
    "lenovo": [{{"label": "WFH content", "pct": 32, "color": "#C9A84C"}}, {{"label": "Product demos", "pct": 28, "color": "#378ADD"}}, {{"label": "Tutorials", "pct": 22, "color": "#28a745"}}, {{"label": "Unboxing", "pct": 12, "color": "#E24B4A"}}, {{"label": "Ads", "pct": 6, "color": "#94a3b8"}}],
    "acer":   [{{"label": "Gaming content", "pct": 42, "color": "#E24B4A"}}, {{"label": "Product demos", "pct": 25, "color": "#C9A84C"}}, {{"label": "Unboxing", "pct": 18, "color": "#378ADD"}}, {{"label": "Tutorials", "pct": 10, "color": "#28a745"}}, {{"label": "Ads", "pct": 5, "color": "#94a3b8"}}],
    "dell":   [{{"label": "Product demos", "pct": 40, "color": "#C9A84C"}}, {{"label": "Business content", "pct": 30, "color": "#378ADD"}}, {{"label": "Tutorials", "pct": 18, "color": "#28a745"}}, {{"label": "Unboxing", "pct": 8, "color": "#E24B4A"}}, {{"label": "Ads", "pct": 4, "color": "#94a3b8"}}],
    "asus":   [{{"label": "Gaming content", "pct": 38, "color": "#E24B4A"}}, {{"label": "Product demos", "pct": 27, "color": "#C9A84C"}}, {{"label": "Unboxing", "pct": 20, "color": "#378ADD"}}, {{"label": "Tutorials", "pct": 10, "color": "#28a745"}}, {{"label": "Ads", "pct": 5, "color": "#94a3b8"}}]
  }},
  "threat_levels": [
    {{"brand": "HP", "score": 8.5, "color": "#E24B4A", "label": "High threat"}},
    {{"brand": "Lenovo", "score": 7.2, "color": "#f97316", "label": "Growing"}},
    {{"brand": "Acer", "score": 6.0, "color": "#f97316", "label": "Medium"}},
    {{"brand": "Asus", "score": 4.5, "color": "#378ADD", "label": "Low"}},
    {{"brand": "Dell", "score": 2.5, "color": "#28a745", "label": "Very low"}}
  ],
  "comment_topics": {{
    "hp": ["Price comparisons", "Battery life", "Student discounts", "Heating issues", "Slow performance"],
    "lenovo": ["Office productivity", "Build quality", "RAM upgrade", "Service center", "Keyboard issues"],
    "acer": ["Gaming FPS", "Graphics upgrade", "Display problems", "Fan noise", "Warranty issues"]
  }},
  "badges": [
    {{"text": "HP - biggest threat", "color": "red"}},
    {{"text": "Lenovo - fast growing", "color": "orange"}},
    {{"text": "Android gap - act now", "color": "gold"}}
  ]
}}

IMPORTANT RULES:
- Use actual data from the YouTube stats provided
- Make threat_levels scores based on actual subscriber and view counts
- Keep all text in double quotes only - no single quotes inside text
- No apostrophes in any text field - use alternative wording
- Return ONLY the JSON object, no explanation, no markdown
- For viewer_types and content_types, you MUST return them as objects with brand keys (hp, lenovo, acer, dell, asus) not as arrays
- Each brand key must have an array of items"""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.getenv('GROQ_API_KEY', '')}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 3000,
                }
            )
            data = response.json()
            if "error" in data:
                return {"error": f"Groq error: {data['error'].get('message', str(data['error']))}"}
            if "choices" not in data:
                return {"error": f"Unexpected response: {str(data)[:200]}"}

            content = data["choices"][0]["message"]["content"]
            content = content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            content = content.strip()

            import re as _re2
            content = _re2.sub(r',\s*}', '}', content)
            content = _re2.sub(r',\s*]', ']', content)
            content = content.replace("\u2019", "").replace("\u2018", "")
            content = content.replace("\u201c", '"').replace("\u201d", '"')

            try:
                result = json.loads(content)
            except json.JSONDecodeError as e:
                return {"error": f"JSON parse error: {str(e)} | Content: {content[:300]}"}

            # Cache the result with timestamp
            AI_ANALYSIS_CACHE["result"] = result
            AI_ANALYSIS_CACHE_TIME = datetime.now()
            print("AI analysis completed and cached!")
            return result

    except Exception as e:
        return {"error": str(e)}