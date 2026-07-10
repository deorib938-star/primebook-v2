# ================================
# PRIMEBOOK INTELLIGENCE API
# FastAPI Backend v2.1
# ================================
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from competitor_registry import competitors, primebook
import json
import os
import re
import httpx
import asyncio

# Load secrets from backend/.env locally (git-ignored). On Render/Vercel the same
# names come from the dashboard env vars, so load_dotenv is a harmless no-op there.
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

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
        "name": "Primebook 2 Neo", "price": 19990, "ram": 6, "storage": 128,
        "display": 11.6, "battery": 8,
        "price_range_min": 10000, "price_range_max": 25000,
    },
    {
        "name": "Primebook 2 Pro", "price": 25990, "ram": 8, "storage": 128,
        "display": 14.1, "battery": 14,
        "price_range_min": 20000, "price_range_max": 30000,
    },
    {
        "name": "Primebook 2 Max", "price": 27990, "ram": 8, "storage": 256,
        "display": 15.6, "battery": 12,
        "price_range_min": 25000, "price_range_max": 40000,
    },
    {
        "name": "Primebook 4G", "price": 22031, "ram": 4, "storage": 128,
        "display": 11.6, "battery": 8,
        "price_range_min": 15000, "price_range_max": 25000,
    },
]

# ================================
# LOAD CACHES
# ================================

def load_amazon_cache():
    if os.path.exists("amazon_cache.json"):
        try:
            with open("amazon_cache.json", "r", encoding="utf-8") as f:
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

def is_similar(name1, name2, threshold=0.75):
    w1 = set(clean_name(name1).split())
    w2 = set(clean_name(name2).split())
    if not w1 or not w2:
        return False
    common = w1.intersection(w2)
    similarity = len(common) / max(len(w1), len(w2))
    return similarity >= threshold


def _shorten_for_dedup(name):
    """Shorter name for merge comparison, same logic as _shorten_model_name."""
    return _shorten_model_name(name, "").lower().strip()


def is_duplicate(p1, p2):
    # Must be same brand
    if p1.get("brand") != p2.get("brand"):
        return False
    
    # STRICT MATCH: shortened name + all key specs must match
    name1 = _shorten_for_dedup(p1.get("name", ""))
    name2 = _shorten_for_dedup(p2.get("name", ""))
    
    if not name1 or not name2:
        return False
    
    # Names must be similar (share at least 60% of words after shortening)
    words1 = set(name1.split())
    words2 = set(name2.split())
    if not words1 or not words2:
        return False
    common = words1.intersection(words2)
    name_similarity = len(common) / max(len(words1), len(words2))
    
    if name_similarity < 0.6:
        return False
    
    # All these specs must match exactly
    if p1.get("ram_gb") != p2.get("ram_gb"):
        return False
    if p1.get("storage_gb") != p2.get("storage_gb"):
        return False
    if p1.get("display_inch") != p2.get("display_inch"):
        return False
    if p1.get("display_quality") != p2.get("display_quality"):
        return False
    if p1.get("os") != p2.get("os"):
        return False
    # Battery match — only enforce if BOTH sides have real (non-default) data
    b1 = p1.get("battery_hours", 0)
    b2 = p2.get("battery_hours", 0)
    # 7 is the scraper default when battery wasn't extracted
    b1_is_real = b1 > 0 and b1 != 7
    b2_is_real = b2 > 0 and b2 != 7
    if b1_is_real and b2_is_real and b1 != b2:
        return False
    # If one side is default (7) and other is real, allow merge
    # If both are default (7), allow merge
    
    # Processor match (lenient — allow Unknown or partial match)
    p1_proc = (p1.get("processor") or "").lower().strip()
    p2_proc = (p2.get("processor") or "").lower().strip()
    processor_ok = (
        p1_proc == p2_proc or
        p1_proc in ("", "unknown") or
        p2_proc in ("", "unknown") or
        p1_proc in p2_proc or p2_proc in p1_proc
    )
    if not processor_ok:
        return False
    
    return True

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
                merged_product["amazon_url"]     = ap.get("url", "")
                merged_product["flipkart_url"]   = fp.get("url", "")
                used_flipkart.add(i)
                matched = True
                merged.append(merged_product)
                break

        if not matched:
            p = {**ap}
            p["amazon_price"]   = ap.get("price_inr", 0)
            p["flipkart_price"] = 0
            p["best_source"]    = "Amazon"
            p["amazon_url"]     = ap.get("url", "")
            p["flipkart_url"]   = ""
            merged.append(p)

    for i, fp in enumerate(flipkart_products):
        if i not in used_flipkart:
            p = {**fp}
            p["amazon_price"]   = 0
            p["flipkart_price"] = fp.get("price_inr", 0)
            p["best_source"]    = "Flipkart"
            p["amazon_url"]     = ""
            p["flipkart_url"]   = fp.get("url", "")
            merged.append(p)

    final = []
    for p in merged:
        is_dup = False
        for existing in final:
            if is_duplicate(p, existing):
                # Merge URL and price fields from BOTH so no data is lost
                merged_amazon_url   = p.get("amazon_url", "")   or existing.get("amazon_url", "")
                merged_flipkart_url = p.get("flipkart_url", "") or existing.get("flipkart_url", "")
                merged_amazon_price   = p.get("amazon_price", 0)   or existing.get("amazon_price", 0)
                merged_flipkart_price = p.get("flipkart_price", 0) or existing.get("flipkart_price", 0)
                
                # Keep the cheaper one as base, but restore both URLs and prices
                if p.get("price_inr", 0) < existing.get("price_inr", 0) and p.get("price_inr", 0) > 0:
                    final.remove(existing)
                    p["amazon_url"]     = merged_amazon_url
                    p["flipkart_url"]   = merged_flipkart_url
                    p["amazon_price"]   = merged_amazon_price
                    p["flipkart_price"] = merged_flipkart_price
                    # Recompute best_source based on merged prices
                    if merged_amazon_price > 0 and merged_flipkart_price > 0:
                        p["best_source"] = "Amazon" if merged_amazon_price <= merged_flipkart_price else "Flipkart"
                    elif merged_amazon_price > 0:
                        p["best_source"] = "Amazon"
                    else:
                        p["best_source"] = "Flipkart"
                    final.append(p)
                else:
                    existing["amazon_url"]     = merged_amazon_url
                    existing["flipkart_url"]   = merged_flipkart_url
                    existing["amazon_price"]   = merged_amazon_price
                    existing["flipkart_price"] = merged_flipkart_price
                    if merged_amazon_price > 0 and merged_flipkart_price > 0:
                        existing["best_source"] = "Amazon" if merged_amazon_price <= merged_flipkart_price else "Flipkart"
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

def get_relevant_products(brand_id, prime_model, max_products=None):
    combined     = get_combined_products()
    brand_data   = combined.get(brand_id, {})
    all_products = brand_data.get("products", [])

    if not all_products:
        return []

    price_min = prime_model["price_range_min"]
    price_max = prime_model["price_range_max"]
    prime_price = prime_model["price"]

    # PRIMARY sort — price proximity to Primebook (closest first)
    # SECONDARY factors — RAM match, display match, reviews (as tiebreakers)
    def relevance_score(product):
        comp_price = product.get("price_inr", 0)
        if comp_price <= 0:
            return 0

        # Price proximity is the DOMINANT factor (higher weight)
        price_diff_pct = abs(prime_price - comp_price) / prime_price
        price_score = max(0, 200 - (price_diff_pct * 400))  # 200 max, drops fast

        # Small tiebreakers
        ram_bonus = 0
        comp_ram = product.get("ram_gb", 0)
        if comp_ram > 0:
            ram_diff = abs(prime_model["ram"] - comp_ram)
            if ram_diff == 0:    ram_bonus = 10
            elif ram_diff <= 2:  ram_bonus = 5

        display_bonus = 0
        comp_display = product.get("display_inch", 0)
        if comp_display > 0:
            display_diff = abs(prime_model["display"] - comp_display)
            if display_diff <= 0.5:  display_bonus = 8
            elif display_diff <= 1:  display_bonus = 4

        # Review count as small tiebreaker
        review_bonus = min(product.get("reviews", 0) / 5000, 5)

        return price_score + ram_bonus + display_bonus + review_bonus

    # Sort ALL products by relevance (price proximity dominant)
    sorted_products = sorted(all_products, key=relevance_score, reverse=True)

    # Tag out-of-range and duplicates for frontend display
    seen_specs = []
    for p in sorted_products:
        in_range = price_min <= p.get("price_inr", 0) <= price_max
        p["out_of_range"] = not in_range
        p["out_of_range_note"] = f"Outside Rs.{price_min:,}-Rs.{price_max:,} comparison range" if not in_range else ""

        spec_key = (p.get("ram_gb"), p.get("storage_gb"), p.get("display_inch"), p.get("os"))
        if spec_key in seen_specs:
            p["is_duplicate"] = True
            p["duplicate_reason"] = "Same specs as a higher-ranked product"
        else:
            p["is_duplicate"] = False
            p["duplicate_reason"] = ""
            seen_specs.append(spec_key)

    # Add price_diff for display in frontend headers
    for p in sorted_products:
        comp_price = p.get("price_inr", 0)
        if comp_price > 0:
            p["price_diff_from_prime"] = abs(prime_price - comp_price)
        else:
            p["price_diff_from_prime"] = 999999

    # Return ALL products (frontend paginates), or limit if max_products specified
    return sorted_products if max_products is None else sorted_products[:max_products]

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

    for brand_id in ["hp", "acer", "lenovo", "dell", "asus", "primebook"]:
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

@app.get("/primebook/real-prices")
def get_primebook_real_prices():
    combined = get_combined_products()
    primebook_data = combined.get("primebook", {})
    products = primebook_data.get("products", [])

    fallback = {
        "neo": {"price": 19990, "ram": 6, "storage": 128, "display": 11.6, "battery": 8},
        "pro": {"price": 25990, "ram": 8, "storage": 128, "display": 14.1, "battery": 14},
        "max": {"price": 27990, "ram": 8, "storage": 256, "display": 15.6, "battery": 12},
        "4g":  {"price": 22031, "ram": 4, "storage": 128, "display": 11.6, "battery": 8},
    }

    result = {}
    for model_key in ["neo", "pro", "max", "4g"]:
        matches = [p for p in products if model_key in p.get("name", "").lower()]
        if matches:
            best = min(matches, key=lambda p: p.get("price_inr", 999999))
            result[model_key] = {
                "price": best.get("price_inr", fallback[model_key]["price"]),
                "ram": best.get("ram_gb", fallback[model_key]["ram"]),
                "storage": best.get("storage_gb", fallback[model_key]["storage"]),
                "display": best.get("display_inch", fallback[model_key]["display"]),
                "battery": fallback[model_key]["battery"],
                "source": best.get("best_source", best.get("source", "Unknown")),
                "is_real_data": True,
            }
        else:
            result[model_key] = {**fallback[model_key], "source": "Official (no listing found)", "is_real_data": False}

    return result

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

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "")

CACHE_FILE = "youtube_cache.json"
CACHE_MAX_AGE_DAYS = 7

BRAND_CHANNELS = {
    "primebook": { "handle": "@primebookhq",          "name": "Primebook"              },
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
                    "Authorization": f"Bearer {GROQ_API_KEY}",
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
    
    # ================================
# INSTAGRAM TRACKING
# ================================

INSTAGRAM_CACHE_FILE = "instagram_cache.json"
INSTAGRAM_CACHE_MAX_AGE_DAYS = 7

INSTAGRAM_BRANDS = {
    "hp":        { "handle": "hp_india",      "name": "HP India" },
    "lenovo":    { "handle": "lenovo_india",  "name": "Lenovo India" },
    "acer":      { "handle": "acerindia",     "name": "Acer India" },
    "dell":      { "handle": "dellindia",     "name": "Dell India" },
    "asus":      { "handle": "asusindia",     "name": "ASUS India" },
    "primebook": { "handle": "primebook.hq",  "name": "Primebook" },
}


def _load_instagram_cache():
    if not os.path.exists(INSTAGRAM_CACHE_FILE):
        return {}
    try:
        with open(INSTAGRAM_CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _instagram_cache_is_fresh(cache):
    last = cache.get("last_updated")
    if not last:
        return False
    try:
        updated = datetime.fromisoformat(last)
        return (datetime.now(timezone.utc) - updated) < timedelta(days=INSTAGRAM_CACHE_MAX_AGE_DAYS)
    except Exception:
        return False


@app.get("/instagram/cache/status")
def instagram_cache_status():
    cache = _load_instagram_cache()
    if not cache:
        return {
            "cached": False,
            "message": "No cache found. Run: python instagram_cache_builder.py",
            "last_updated": None,
            "brands_cached": [],
        }
    brands = list(cache.get("brands", {}).keys())
    return {
        "cached": True,
        "fresh": _instagram_cache_is_fresh(cache),
        "last_updated": cache.get("last_updated"),
        "brands_cached": brands,
        "message": "Cache is fresh ✅" if _instagram_cache_is_fresh(cache) else "Cache is stale ⚠️ — re-run instagram_cache_builder.py",
    }


@app.get("/instagram/all/channels")
def instagram_all_channels():
    """Return follower/post stats for all 6 brands."""
    cache = _load_instagram_cache()
    brands = cache.get("brands", {})
    result = {}
    for brand_id in INSTAGRAM_BRANDS:
        b = brands.get(brand_id, {})
        if b:
            result[brand_id] = {
                "name":    b.get("name", INSTAGRAM_BRANDS[brand_id]["name"]),
                "handle":  b.get("handle", INSTAGRAM_BRANDS[brand_id]["handle"]),
                "url":     b.get("url", ""),
                "stats":   b.get("stats", {}),
                "bio":     b.get("bio", ""),
                "profile_pic": b.get("profile_pic", ""),
            }
        else:
            result[brand_id] = {
                "name":    INSTAGRAM_BRANDS[brand_id]["name"],
                "handle":  INSTAGRAM_BRANDS[brand_id]["handle"],
                "stats":   {"followers": 0, "following": 0, "posts": 0},
                "error":   "not cached yet",
            }
    return result


@app.get("/instagram/{brand_id}/profile")
def instagram_brand_profile(brand_id: str):
    """Return full profile data for one brand including recent posts."""
    brand_id = brand_id.lower()
    cache = _load_instagram_cache()
    b = cache.get("brands", {}).get(brand_id)
    if not b:
        return {"error": "Not cached yet. Run: python instagram_cache_builder.py"}
    return b


@app.get("/instagram/{brand_id}/posts")
def instagram_brand_posts(brand_id: str):
    """Return recent posts for one brand."""
    brand_id = brand_id.lower()
    cache = _load_instagram_cache()
    b = cache.get("brands", {}).get(brand_id, {})
    return {
        "brand_id": brand_id,
        "posts": b.get("recent_posts", []),
        "total": len(b.get("recent_posts", [])),
    }

INSTAGRAM_AI_CACHE = {}
INSTAGRAM_AI_CACHE_TIME = None


@app.get("/instagram/ai-analysis")
async def instagram_ai_analysis():
    """AI analysis of all 6 brands' Instagram strategies — includes audience,
    content types, hashtag topics, brand positioning, and threat levels."""
    global INSTAGRAM_AI_CACHE_TIME
    if "result" in INSTAGRAM_AI_CACHE and INSTAGRAM_AI_CACHE_TIME:
        hours_old = (datetime.now() - INSTAGRAM_AI_CACHE_TIME).total_seconds() / 3600
        if hours_old < 24:
            print(f"Returning cached Instagram AI analysis ({hours_old:.1f}h old)")
            return INSTAGRAM_AI_CACHE["result"]

    cache = _load_instagram_cache()
    brands = cache.get("brands", {})

    all_brand_data = {}
    for bid in INSTAGRAM_BRANDS:
        b = brands.get(bid, {})
        if b:
            stats = b.get("stats", {})
            recent = b.get("recent_posts", [])[:8]
            all_brand_data[bid] = {
                "name":         INSTAGRAM_BRANDS[bid]["name"],
                "followers":    stats.get("followers", 0),
                "posts":        stats.get("posts", 0),
                "recent_captions": [p.get("alt", "")[:100] for p in recent if p.get("alt")],
            }

    brand_summary = ""
    for bid, data in all_brand_data.items():
        brand_summary += f"""
{data['name']}:
- Followers: {data['followers']:,}
- Total Posts: {data['posts']:,}
- Post-to-follower ratio: 1:{data['followers'] // max(data['posts'], 1)}
- Recent captions: {' | '.join(data['recent_captions'][:5]) if data['recent_captions'] else 'not scraped'}
"""

    prompt = f"""You are a market intelligence analyst for Primebook India, an Android 15 laptop brand competing in the Rs. 10,000-40,000 budget segment against HP, Lenovo, Acer, Dell, and ASUS.

Analyze the Instagram presence of all 6 brands (5 competitors + Primebook) and give a comprehensive report focused on how Primebook should evolve its Instagram strategy.

INSTAGRAM DATA:
{brand_summary}

Return ONLY this JSON, no markdown, no explanation:

{{
  "key_insights": [
    {{"icon": "🏆", "title": "concise 8-word title", "text": "2 sentences with specific follower or post numbers"}},
    {{"icon": "📊", "title": "concise 8-word title", "text": "2 sentences with specific follower or post numbers"}},
    {{"icon": "⚠️", "title": "concise 8-word title", "text": "2 sentences with specific follower or post numbers"}},
    {{"icon": "🎯", "title": "concise 8-word title", "text": "2 sentences with specific follower or post numbers"}},
    {{"icon": "🔥", "title": "concise 8-word title", "text": "2 sentences with specific follower or post numbers"}}
  ],
  "opportunities": [
    {{"icon": "📸", "title": "concise action title", "text": "2 sentences on what Primebook should do"}},
    {{"icon": "🎬", "title": "concise action title", "text": "2 sentences on what Primebook should do"}},
    {{"icon": "💬", "title": "concise action title", "text": "2 sentences on what Primebook should do"}}
  ],
  "brand_positioning": [
    {{"color": "#E24B4A", "text": "**HP India** one-sentence positioning insight"}},
    {{"color": "#f97316", "text": "**Lenovo India** one-sentence positioning insight"}},
    {{"color": "#378ADD", "text": "**Acer India** one-sentence positioning insight"}},
    {{"color": "#28a745", "text": "**Dell India** one-sentence positioning insight"}},
    {{"color": "#94a3b8", "text": "**ASUS India** one-sentence positioning insight"}},
    {{"color": "#C9A84C", "text": "**Primebook** one-sentence positioning insight and opportunity"}}
  ],
  "audience_types": {{
    "hp":     [{{"type": "Students", "pct": 40, "desc": "college users", "color": "#378ADD"}}, {{"type": "Professionals", "pct": 30, "desc": "office workers", "color": "#C9A84C"}}, {{"type": "Enthusiasts", "pct": 20, "desc": "tech fans", "color": "#28a745"}}, {{"type": "General", "pct": 10, "desc": "casual buyers", "color": "#94a3b8"}}],
    "lenovo": [{{"type": "Professionals", "pct": 45, "desc": "office workers", "color": "#C9A84C"}}, {{"type": "Students", "pct": 30, "desc": "college users", "color": "#378ADD"}}, {{"type": "Creators", "pct": 15, "desc": "content makers", "color": "#28a745"}}, {{"type": "General", "pct": 10, "desc": "casual buyers", "color": "#94a3b8"}}],
    "acer":   [{{"type": "Gamers", "pct": 40, "desc": "gaming audience", "color": "#E24B4A"}}, {{"type": "Students", "pct": 30, "desc": "college users", "color": "#378ADD"}}, {{"type": "Enthusiasts", "pct": 20, "desc": "tech fans", "color": "#C9A84C"}}, {{"type": "General", "pct": 10, "desc": "casual buyers", "color": "#94a3b8"}}],
    "dell":   [{{"type": "Professionals", "pct": 55, "desc": "office workers", "color": "#C9A84C"}}, {{"type": "Enterprise", "pct": 20, "desc": "business users", "color": "#378ADD"}}, {{"type": "Students", "pct": 15, "desc": "college users", "color": "#28a745"}}, {{"type": "General", "pct": 10, "desc": "casual buyers", "color": "#94a3b8"}}],
    "asus":   [{{"type": "Gamers", "pct": 45, "desc": "gaming audience", "color": "#E24B4A"}}, {{"type": "Creators", "pct": 25, "desc": "content makers", "color": "#C9A84C"}}, {{"type": "Students", "pct": 20, "desc": "college users", "color": "#378ADD"}}, {{"type": "General", "pct": 10, "desc": "casual buyers", "color": "#94a3b8"}}]
  }},
  "content_types": {{
    "hp":     [{{"label": "Product photos", "pct": 40, "color": "#C9A84C"}}, {{"label": "Reels/videos", "pct": 25, "color": "#378ADD"}}, {{"label": "Lifestyle", "pct": 20, "color": "#28a745"}}, {{"label": "Deals/offers", "pct": 10, "color": "#E24B4A"}}, {{"label": "Behind-scenes", "pct": 5, "color": "#94a3b8"}}],
    "lenovo": [{{"label": "Product photos", "pct": 35, "color": "#C9A84C"}}, {{"label": "Reels/videos", "pct": 30, "color": "#378ADD"}}, {{"label": "Work-from-home", "pct": 20, "color": "#28a745"}}, {{"label": "Deals/offers", "pct": 10, "color": "#E24B4A"}}, {{"label": "Community", "pct": 5, "color": "#94a3b8"}}],
    "acer":   [{{"label": "Gaming content", "pct": 45, "color": "#E24B4A"}}, {{"label": "Product photos", "pct": 25, "color": "#C9A84C"}}, {{"label": "Reels/videos", "pct": 15, "color": "#378ADD"}}, {{"label": "Lifestyle", "pct": 10, "color": "#28a745"}}, {{"label": "Deals/offers", "pct": 5, "color": "#94a3b8"}}],
    "dell":   [{{"label": "Product photos", "pct": 45, "color": "#C9A84C"}}, {{"label": "Business content", "pct": 25, "color": "#378ADD"}}, {{"label": "Reels/videos", "pct": 15, "color": "#28a745"}}, {{"label": "Deals/offers", "pct": 10, "color": "#E24B4A"}}, {{"label": "Testimonials", "pct": 5, "color": "#94a3b8"}}],
    "asus":   [{{"label": "Gaming content", "pct": 40, "color": "#E24B4A"}}, {{"label": "Reels/videos", "pct": 30, "color": "#378ADD"}}, {{"label": "Product photos", "pct": 20, "color": "#C9A84C"}}, {{"label": "Creator collabs", "pct": 7, "color": "#28a745"}}, {{"label": "Deals/offers", "pct": 3, "color": "#94a3b8"}}]
  }},
  "hashtag_topics": {{
    "hp":     ["#HPIndia", "#LifeWithHP", "#StudentDeals", "#WorkFromHome", "#Innovation"],
    "lenovo": ["#LenovoIndia", "#SmarterAI", "#YogaLaptop", "#WorkAnywhere", "#Ideapad"],
    "acer":   ["#PredatorGaming", "#AcerNitro", "#GamingLife", "#EsportsIndia", "#StudentLaptop"]
  }},
  "threat_levels": [
    {{"brand": "ASUS", "score": 9.0, "color": "#E24B4A", "label": "Very high"}},
    {{"brand": "Lenovo", "score": 7.5, "color": "#f97316", "label": "High"}},
    {{"brand": "Dell", "score": 5.5, "color": "#f97316", "label": "Medium"}},
    {{"brand": "HP", "score": 4.5, "color": "#378ADD", "label": "Low-medium"}},
    {{"brand": "Acer", "score": 4.0, "color": "#378ADD", "label": "Low-medium"}},
    {{"brand": "Primebook", "score": 2.5, "color": "#C9A84C", "label": "Our position"}}
  ]
}}

IMPORTANT:
- Base scores on actual follower counts and posting patterns above
- Primebook's position should reflect its 45K followers vs competitors' 220K-844K range
- No apostrophes in string values, use alternative phrasing
- Return ONLY the JSON object"""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
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

            content = data["choices"][0]["message"]["content"].strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            content = content.strip()
            content = re.sub(r',\s*}', '}', content)
            content = re.sub(r',\s*]', ']', content)
            content = content.replace("\u2019", "").replace("\u2018", "")
            content = content.replace("\u201c", '"').replace("\u201d", '"')

            try:
                result = json.loads(content)
            except json.JSONDecodeError as e:
                return {"error": f"JSON parse error: {str(e)} | Content: {content[:300]}"}

            INSTAGRAM_AI_CACHE["result"] = result
            INSTAGRAM_AI_CACHE_TIME = datetime.now()
            print("Instagram AI analysis completed and cached!")
            return result

    except Exception as e:
        return {"error": str(e)}


@app.get("/instagram/growth")
def instagram_growth_comparison():
    """
    Cross-brand comparison + placeholder for historical growth.
    Real growth data will populate as the scraper is run over multiple weeks.
    """
    cache = _load_instagram_cache()
    brands = cache.get("brands", {})

    comparison = []
    for bid in INSTAGRAM_BRANDS:
        b = brands.get(bid, {})
        stats = b.get("stats", {})
        followers = stats.get("followers", 0)
        posts = stats.get("posts", 0)
        comparison.append({
            "brand_id":  bid,
            "name":      INSTAGRAM_BRANDS[bid]["name"],
            "followers": followers,
            "posts":     posts,
            "post_to_follower_ratio": followers // max(posts, 1),
            "is_primebook": bid == "primebook",
        })

    comparison.sort(key=lambda x: x["followers"], reverse=True)

    return {
        "last_updated": cache.get("last_updated"),
        "brands": comparison,
        "note": "Historical growth chart will populate once we have 2+ weekly snapshots.",
    }

# ================================
# PRICE TRACKING — backend routes
# Add this block to main.py (after the existing /products routes)
# Uses the EXISTING get_combined_products() function already in main.py
# ================================

# ── Primebook official prices (our own brand — no Amazon/Flipkart/Croma) ──
PRIMEBOOK_PRICING = [
    {"name": "Primebook Neo", "official": 19990, "amazon": 0, "flipkart": 0, "croma": 0,
     "ram_gb": 6, "storage_gb": 128, "display_inch": 11.6},
    {"name": "Primebook Pro", "official": 25990, "amazon": 0, "flipkart": 0, "croma": 0,
     "ram_gb": 8, "storage_gb": 128, "display_inch": 14.1},
    {"name": "Primebook Max", "official": 27990, "amazon": 0, "flipkart": 0, "croma": 0,
     "ram_gb": 8, "storage_gb": 256, "display_inch": 15.6},
]

import random as _random
from datetime import datetime, timedelta

def _generate_history(current_price: float, months: int = 6) -> list:
    """
    Generates a plausible 6-month price history ending at current_price.
    NOTE: This is a placeholder until real historical price tracking
    (weekly price snapshots saved to price_history.json) is built.
    """
    if not current_price or current_price <= 0:
        return [0] * months
    history = []
    price = current_price * 1.08
    for i in range(months):
        change = _random.uniform(-0.025, 0.01) * current_price
        price = max(current_price * 0.9, price + change)
        history.append(round(price / 10) * 10)
    history[-1] = current_price
    return history

def _get_brand_models(brand_id: str):
    """Get ALL products for a brand (sorted by review count, no limit)."""
    combined = get_combined_products()
    brand_data = combined.get(brand_id, {})
    products = brand_data.get("products", [])
    products_sorted = sorted(products, key=lambda p: p.get("reviews", 0), reverse=True)
    return products_sorted

def _best_price(amazon_price, flipkart_price, croma_price=0, official_price=0):
    prices = [p for p in [amazon_price, flipkart_price, croma_price, official_price] if p and p > 0]
    return min(prices) if prices else 0

def _shorten_model_name(full_name, brand):
    """Extract just the brand + main model line from a long product name.
    e.g., 'HP Laptop 15s, Intel Celeron N4500...' → 'HP 15s'
    """
    if not full_name:
        return "Unknown"
    
    # Hard stop tokens — spec section starts here
    hard_stops = ["intel", "amd", "mediatek", "core", "ryzen", "celeron", "athlon",
                  "pentium", "helio", "kompanio", "quad", "dual", "hexa", "octa",
                  "processor", "gb", "ssd", "hdd", "emmc", "ram",
                  "windows", "chrome", "android", "prime", "primeos", "dos", "linux",
                  "gen", "generation", "th", "12th", "11th", "10th", "13th"]
    
    # Filler words we can drop but keep going
    filler = ["laptop", "notebook", "smartchoice"]
    
    # Punctuation that signals spec section start
    punct_stops = ["(", "|", ","]
    
    words = full_name.split()
    result = []
    for w in words:
        w_lower = w.lower().strip(",().\"'")
        
        # Hard stop on punctuation
        if any(p in w for p in punct_stops):
            break
        
        # Hard stop on spec keywords
        if w_lower in hard_stops:
            break
        # Also check word starts (e.g., "N4500" starts with digit — usually a chip model)
        if w_lower and w_lower[0].isdigit() and len(w_lower) >= 3:
            break
        
        # Skip filler words but keep going
        if w_lower in filler:
            continue
        
        result.append(w.strip(",-()"))
        
        # Cap at 4 meaningful words
        if len(result) >= 4:
            break
    
    shortened = " ".join(result).strip(",- ").strip()
    
    # Safety net — if we shortened too much (only brand name or less), take first 3 words
    if len(shortened.split()) <= 1 or len(shortened) < 5:
        shortened = " ".join(full_name.split()[:3])
    
    return shortened if shortened else full_name[:30]

# ================================
# ROUTE 1: Price table (all brands or one brand, includes Primebook)
# ================================
@app.get("/price/table")
def get_price_table(brand: str = "all"):
    """
    brand = 'all' | 'primebook' | 'hp' | 'lenovo' | 'acer' | 'dell' | 'asus'
    Returns rows: [{brand, name, official, amazon, flipkart, croma, best_price, best_source}]
    """
    rows = []

    def add_primebook():
        combined = get_combined_products()
        primebook_data = combined.get("primebook", {})
        scraped_products = primebook_data.get("products", [])
        
        official_by_keyword = {}
        for m in PRIMEBOOK_PRICING:
            name_parts = m["name"].lower().split()
            if len(name_parts) >= 2:
                keyword = name_parts[-1]
                official_by_keyword[keyword] = m
        
        added_official_models = set()
        for p in scraped_products:
            name = p.get("name", "Unknown")
            amazon_price = p.get("amazon_price", 0) or 0
            flipkart_price = p.get("flipkart_price", 0) or 0
            
            # Use preserved URLs from merge, fall back to detecting from `url` field
            amazon_url = p.get("amazon_url", "") or ""
            flipkart_url = p.get("flipkart_url", "") or ""
            if not amazon_url and not flipkart_url:
                product_url = p.get("url", "") or ""
                if "amazon" in product_url.lower():
                    amazon_url = product_url
                elif "flipkart" in product_url.lower():
                    flipkart_url = product_url
            
            
            name_lower = name.lower()
            official_price = 0
            matched_model = None
            for keyword, m in official_by_keyword.items():
                if keyword in name_lower:
                    official_price = m["official"]
                    matched_model = keyword
                    break
            
            if matched_model:
                added_official_models.add(matched_model)
            
            best = _best_price(amazon_price, flipkart_price, 0, official_price)
            
            # Determine best source
            best_source = "Official"
            if best == amazon_price and amazon_price > 0:
                best_source = "Amazon"
            elif best == flipkart_price and flipkart_price > 0:
                best_source = "Flipkart"
            
            rows.append({
                "brand":        "Primebook",
                "is_our_brand": True,
                "name":          _shorten_model_name(name, "Primebook"),   # for add_primebook()
                "official":     official_price,
                "amazon":       amazon_price,
                "flipkart":     flipkart_price,
                "croma":        0,
                "official_url": "https://primebook.in/",
                "amazon_url":   amazon_url,
                "flipkart_url": flipkart_url,
                "croma_url":    "",
                "best_price":   best,
                "best_source":  best_source,
                "specs":        f"{p.get('ram_gb','—')}GB / {p.get('storage_gb','—')}GB / {p.get('display_inch','—')}\"",
                "ram_gb":        p.get("ram_gb", 0),
                "storage_gb":    p.get("storage_gb", 0),
                "processor":     p.get("processor", "—"),
                "battery_hours": p.get("battery_hours", 0),
                "os":            p.get("os", "—"),
            })
            
        
        for keyword, m in official_by_keyword.items():
            if keyword not in added_official_models:
                rows.append({
                    "brand":        "Primebook",
                    "is_our_brand": True,
                    "name":          _shorten_model_name(m["name"], "Primebook"),
                    "official":     m["official"],
                    "amazon":       0,
                    "flipkart":     0,
                    "croma":        0,
                    "official_url": "https://primebook.in/",
                    "amazon_url":   "",
                    "flipkart_url": "",
                    "croma_url":    "",
                    "best_price":   m["official"],
                    "best_source":  "Official",
                    "specs":        f"{m['ram_gb']}GB / {m['storage_gb']}GB / {m['display_inch']}\"",
                    "ram_gb":        m.get("ram_gb", 0),
                    "storage_gb":    m.get("storage_gb", 0),
                    "processor":     "MediaTek Helio",
                    "battery_hours": m.get("battery_hours", 8),
                    "os":            "PrimeOS 3.0",
                })

    def add_brand(brand_id, brand_label):
        models = _get_brand_models(brand_id)
        for m in models:
            amazon_price   = m.get("amazon_price", 0) or 0
            flipkart_price = m.get("flipkart_price", 0)
            croma_price    = 0
            
            # URLs — prefer stored amazon_url/flipkart_url from merge_products,
            # fall back to detecting from `url` field for unmerged products
            amazon_url = m.get("amazon_url", "") or ""
            flipkart_url = m.get("flipkart_url", "") or ""
            
            if not amazon_url and not flipkart_url:
                product_url = m.get("url", "") or ""
                if "amazon" in product_url.lower():
                    amazon_url = product_url
                elif "flipkart" in product_url.lower():
                    flipkart_url = product_url
            
            best = _best_price(amazon_price, flipkart_price, croma_price, 0)
            best_source = "—"
            if best == amazon_price and amazon_price > 0:
                best_source = "Amazon"
            elif best == flipkart_price and flipkart_price > 0:
                best_source = "Flipkart"
            
            rows.append({
                "brand":        brand_label,
                "is_our_brand": False,
                "name":         _shorten_model_name(m.get("name", "Unknown"), brand_label),
                "official":     0,
                "amazon":       amazon_price,
                "flipkart":     flipkart_price,
                "croma":        croma_price,
                "official_url": "",
                "amazon_url":   amazon_url,
                "flipkart_url": flipkart_url,
                "croma_url":    "",
                "best_price":   best,
                "best_source":  best_source,
                "specs":        f"{m.get('ram_gb','—')}GB / {m.get('storage_gb','—')}GB / {m.get('display_inch','—')}\"",
                "ram_gb":        m.get("ram_gb", 0),
                "storage_gb":    m.get("storage_gb", 0),
                "processor":     m.get("processor", "—"),
                "battery_hours": m.get("battery_hours", 0),
                "os":            m.get("os", "—"),
            })
            
    BRAND_LABELS = {"hp": "HP", "lenovo": "Lenovo", "acer": "Acer", "dell": "Dell", "asus": "Asus"}

    if brand == "all":
        add_primebook()
        for bid, label in BRAND_LABELS.items():
            add_brand(bid, label)
    elif brand == "primebook":
        add_primebook()
    elif brand in BRAND_LABELS:
        add_brand(brand, BRAND_LABELS[brand])
    else:
        return {"error": "Invalid brand", "rows": []}

    return {"brand": brand, "total": len(rows), "rows": rows}


# ================================
# ROUTE 2: Price history (combined chart data for one brand's models)
# ================================
@app.get("/price/history/{brand_id}")
def get_price_history(brand_id: str):
    """
    brand_id = 'primebook' | 'hp' | 'lenovo' | 'acer' | 'dell' | 'asus'
    Returns { months: [...], models: [{name, history: [...]}] }
    """
    months = []
    today = datetime.now()
    for i in range(5, -1, -1):
        d = today - timedelta(days=30 * i)
        months.append(d.strftime("%b"))

    models_out = []

    if brand_id == "primebook":
        for m in PRIMEBOOK_PRICING:
            models_out.append({
                "name":    m["name"],
                "history": _generate_history(m["official"]),
            })
    else:
        BRAND_LABELS = {"hp": "HP", "lenovo": "Lenovo", "acer": "Acer", "dell": "Dell", "asus": "Asus"}
        if brand_id not in BRAND_LABELS:
            return {"error": "Invalid brand", "months": [], "models": []}

        top_models = _get_brand_models(brand_id)
        for m in top_models:
            current = m.get("amazon_price", 0) or m.get("flipkart_price", 0) or m.get("price_inr", 0)
            models_out.append({
                "name":    m.get("name", "Unknown")[:35],
                "history": _generate_history(current),
            })

    return {"brand": brand_id, "months": months, "models": models_out}


# ================================
# ROUTE 3: Alerts — price diff + new products (includes Primebook context)
# ================================
@app.get("/price/alerts")
def get_price_alerts():
    combined = get_combined_products()

    price_diff_alerts = []
    new_products = []

    BRAND_LABELS = {"hp": "HP", "lenovo": "Lenovo", "acer": "Acer", "dell": "Dell", "asus": "Asus"}

    for brand_id, label in BRAND_LABELS.items():
        products = combined.get(brand_id, {}).get("products", [])
        for p in products:
            amz  = p.get("amazon_price", 0)
            flip = p.get("flipkart_price", 0)
            if amz > 0 and flip > 0:
                diff = abs(amz - flip)
                if diff > 500:  # only meaningful differences
                    price_diff_alerts.append({
                        "brand":   label,
                        "name":    p.get("name", ""),
                        "amazon":  amz,
                        "flipkart":flip,
                        "diff":    diff,
                        "cheaper": "Amazon" if amz < flip else "Flipkart",
                    })
            # "New" heuristic: products found on both sources with high review count
            if p.get("source") == "Both" and p.get("reviews", 0) > 500:
                new_products.append({
                    "brand": label,
                    "name":  p.get("name", ""),
                    "price": _best_price(amz, flip),
                })

    price_diff_alerts.sort(key=lambda x: x["diff"], reverse=True)
    new_products.sort(key=lambda x: x["price"])

    return {
        "price_diff_alerts": price_diff_alerts[:8],
        "new_products":      new_products[:8],
    }
    
    # ================================
# NEWS & INSIGHTS
# ================================

GNEWS_API_KEY = os.environ.get("GNEWS_API_KEY", "")

NEWS_CACHE_FILE = "news_cache.json"
NEWS_CACHE_MAX_AGE_HOURS = 6

NEWS_BRANDS = {
    "hp":     "HP laptop",
    "lenovo": "Lenovo laptop",
    "acer":   "Acer laptop",
    "dell":   "Dell laptop",
    "asus":   "Asus laptop",
}

def _load_news_cache():
    if not os.path.exists(NEWS_CACHE_FILE):
        return {}
    try:
        with open(NEWS_CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _save_news_cache(data):
    data["last_updated"] = datetime.now(timezone.utc).isoformat()
    with open(NEWS_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def _news_cache_is_fresh(cache):
    last = cache.get("last_updated")
    if not last:
        return False
    try:
        updated = datetime.fromisoformat(last)
        return (datetime.now(timezone.utc) - updated) < timedelta(hours=NEWS_CACHE_MAX_AGE_HOURS)
    except Exception:
        return False

async def _fetch_news_for_brand(client, brand_id, query):
    try:
        response = await client.get(
            "https://gnews.io/api/v4/search",
            params={
                "q": query,
                "lang": "en",
                "max": 10,
                "sortby": "publishedAt",
                "apikey": GNEWS_API_KEY,
            },
            timeout=15,
        )
        data = response.json()
        print(f"[{brand_id}] status={response.status_code} response={str(data)[:300]}")
        articles = data.get("articles", [])
        result = []
        for a in articles:
            result.append({
                "brand": brand_id,
                "title": a.get("title", ""),
                "description": a.get("description", ""),
                "url": a.get("url", ""),
                "image": a.get("image", ""),
                "source": a.get("source", {}).get("name", "Unknown"),
                "published_at": a.get("publishedAt", ""),
            })
        return brand_id, result
    except Exception as e:
        print(f"News fetch error for {brand_id}: {e}")
        return brand_id, []

@app.get("/news/refresh")
async def refresh_news():
    """Force refresh news for all 5 brands and save to cache."""
    all_news = {}
    async with httpx.AsyncClient() as client:
        for bid, q in NEWS_BRANDS.items():
            brand_id, articles = await _fetch_news_for_brand(client, bid, q)
            all_news[brand_id] = articles
            await asyncio.sleep(1)

    _save_news_cache(all_news)
    return {"status": "refreshed", "counts": {k: len(v) for k, v in all_news.items() if k != "last_updated"}}

@app.get("/news")
async def get_news():
    """Return cached news. Auto-refreshes if cache is stale (over 6 hours old)."""
    cache = _load_news_cache()
    if not cache or not _news_cache_is_fresh(cache):
        print("News cache stale or missing — refreshing...")
        await refresh_news()
        cache = _load_news_cache()

    all_articles = []
    for brand_id in NEWS_BRANDS:
        for article in cache.get(brand_id, []):
            all_articles.append(article)

    all_articles.sort(key=lambda a: a.get("published_at", ""), reverse=True)

    return {
        "last_updated": cache.get("last_updated"),
        "total": len(all_articles),
        "all": all_articles,
        "by_brand": {bid: cache.get(bid, []) for bid in NEWS_BRANDS},
    }
# ================================
# NEWS AI SUMMARY
# ================================

NEWS_SUMMARY_CACHE = {}
NEWS_SUMMARY_CACHE_TIME = None

@app.get("/news/ai-summary")
async def get_news_ai_summary():
    global NEWS_SUMMARY_CACHE_TIME

    cache = _load_news_cache()
    if not cache or not _news_cache_is_fresh(cache):
        await refresh_news()
        cache = _load_news_cache()

    # Build a fingerprint of current news so we know if it changed
    all_titles = []
    for bid in NEWS_BRANDS:
        for a in cache.get(bid, []):
            all_titles.append(a.get("title", ""))
    news_fingerprint = str(sorted(all_titles))

    # Return cached summary if fresh AND news hasn't changed
    if ("result" in NEWS_SUMMARY_CACHE and NEWS_SUMMARY_CACHE_TIME
            and NEWS_SUMMARY_CACHE.get("fingerprint") == news_fingerprint):
        hours_old = (datetime.now() - NEWS_SUMMARY_CACHE_TIME).total_seconds() / 3600
        if hours_old < 24:
            print(f"Returning cached news AI summary ({hours_old:.1f}h old)")
            return NEWS_SUMMARY_CACHE["result"]

    # Build news text for the prompt
    news_text = ""
    for bid in NEWS_BRANDS:
        articles = cache.get(bid, [])[:8]
        if not articles:
            continue
        news_text += f"\n\n{bid.upper()} NEWS:"
        for a in articles:
            news_text += f"\n- {a.get('title', '')} ({a.get('source', '')}, {a.get('published_at', '')[:10]}): {a.get('description', '')[:150]}"

    if not news_text.strip():
        return {"error": "No news available to summarize"}

    prompt = f"""You are a market intelligence analyst for Primebook India, an Android 15 laptop brand competing in the Rs. 10,000-40,000 budget segment against HP, Lenovo, Acer, Dell, and Asus.

Below is recent news coverage for each of the 5 competitor brands. Write a short news digest summarizing what's actually happening this week.

{news_text}

Return ONLY this exact JSON structure, no markdown, no explanation:

{{
  "headline": "one sentence capturing the single most important theme across all this news, under 20 words",
  "summary_points": [
    "First key point about what's happening, mention specific brand names and details from the articles above",
    "Second key point about what's happening, mention specific brand names and details from the articles above",
    "Third key point about what's happening, mention specific brand names and details from the articles above",
    "Fourth point specifically about what this means for Primebook or an opportunity/risk it creates"
  ],
  "brand_highlights": {{
    "hp": "one sentence on the most notable HP news this period, or empty string if none",
    "lenovo": "one sentence on the most notable Lenovo news this period, or empty string if none",
    "acer": "one sentence on the most notable Acer news this period, or empty string if none",
    "dell": "one sentence on the most notable Dell news this period, or empty string if none",
    "asus": "one sentence on the most notable Asus news this period, or empty string if none"
  }}
}}

IMPORTANT:
- Base everything strictly on the articles provided above, do not invent facts
- No apostrophes inside string values, use alternative phrasing
- Return ONLY the JSON object"""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.4,
                    "max_tokens": 1500,
                }
            )
            data = response.json()
            if "error" in data:
                return {"error": f"Groq error: {data['error'].get('message', str(data['error']))}"}
            if "choices" not in data:
                return {"error": f"Unexpected response: {str(data)[:200]}"}

            content = data["choices"][0]["message"]["content"].strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            content = content.strip()

            content = re.sub(r',\s*}', '}', content)
            content = re.sub(r',\s*]', ']', content)
            content = content.replace("\u2019", "").replace("\u2018", "")
            content = content.replace("\u201c", '"').replace("\u201d", '"')

            try:
                result = json.loads(content)
            except json.JSONDecodeError as e:
                return {"error": f"JSON parse error: {str(e)} | Content: {content[:300]}"}

            NEWS_SUMMARY_CACHE["result"] = result
            NEWS_SUMMARY_CACHE["fingerprint"] = news_fingerprint
            NEWS_SUMMARY_CACHE_TIME = datetime.now()
            print("News AI summary completed and cached!")
            return result

    except Exception as e:
        return {"error": str(e)}

@app.get("/news/{brand_id}")
async def get_news_by_brand(brand_id: str):
    cache = _load_news_cache()
    if not cache or not _news_cache_is_fresh(cache):
        await refresh_news()
        cache = _load_news_cache()
    return {
        "brand_id": brand_id,
        "articles": cache.get(brand_id, []),
    }
    
# ================================
# AI RESEARCH PAGE
# ================================

RESEARCH_CACHE = {}
RESEARCH_CACHE_TIME = None

@app.get("/research/ai-report")
async def get_ai_research_report():
    global RESEARCH_CACHE_TIME

    # Return cached result if fresh (under 24 hours)
    if "result" in RESEARCH_CACHE and RESEARCH_CACHE_TIME:
        hours_old = (datetime.now() - RESEARCH_CACHE_TIME).total_seconds() / 3600
        if hours_old < 24:
            print(f"Returning cached AI research report ({hours_old:.1f} hours old)")
            return RESEARCH_CACHE["result"]
        else:
            print("Research cache expired — refreshing")

    # ---- Gather data from all our existing sources ----

    # 1. Product/pricing data (Overview page data)
    combined = get_combined_products()
    product_summary = ""
    for bid, data in combined.items():
        top_products = data.get("products", [])[:3]
        prices = [p.get("price_inr", 0) for p in top_products if p.get("price_inr", 0) > 0]
        avg_price = sum(prices) // max(len(prices), 1) if prices else 0
        product_summary += f"\n{data.get('name', bid).upper()}: {data.get('total', 0)} products tracked, avg price of top 3 ~Rs.{avg_price:,}"

    # 2. YouTube data
    yt_cache = _load_cache()
    yt_brands = yt_cache.get("brands", {})
    youtube_summary = ""
    for bid in BRAND_CHANNELS:
        b = yt_brands.get(bid, {})
        stats = b.get("stats", {})
        if stats:
            youtube_summary += f"\n{BRAND_CHANNELS[bid]['name']}: {stats.get('subscribers', 0):,} subscribers, {stats.get('video_count', 0)} videos, {stats.get('total_views', 0):,} total views"

    # 3. News data
    news_cache = _load_news_cache()
    news_summary = ""
    for bid in NEWS_BRANDS:
        articles = news_cache.get(bid, [])
        news_summary += f"\n{bid.upper()}: {len(articles)} recent news articles"
        for a in articles[:3]:
            news_summary += f"\n  - {a.get('title', '')}"

    # ---- Build the prompt ----
    prompt = f"""You are a senior competitive intelligence analyst for Primebook India — an Android 15 laptop brand competing in the Rs. 10,000-40,000 budget segment in India against HP, Lenovo, Acer, Dell, and Asus.

PRIMEBOOK PRODUCTS:
- Neo: Rs. 19,990 | 6GB RAM | 11.6" | Android 15
- Pro: Rs. 25,990 | 8GB RAM | 14.1" | Android 15
- Max: Rs. 27,990 | 8GB RAM | 15.6" | Android 15

PRODUCT & PRICING DATA:
{product_summary}

YOUTUBE PRESENCE DATA:
{youtube_summary}

RECENT NEWS DATA:
{news_summary}

Write a comprehensive weekly market intelligence report. Return ONLY this exact JSON structure, no markdown, no explanation:

{{
  "market_summary": [
    "First paragraph identifying which competitor is growing fastest right now, with specific reasoning from the data above.",
    "Second paragraph identifying the single biggest overall threat to Primebook and why.",
    "Third paragraph identifying the weakest competitors and the opportunity that creates.",
    "Fourth paragraph starting with what Primebook should focus on this week, being specific and actionable."
  ],
  "callouts": [
    {{"label": "FASTEST GROWING", "color": "#f97316", "text": "brand name and short reason, under 12 words"}},
    {{"label": "BIGGEST THREAT", "color": "#E24B4A", "text": "brand name and short reason, under 12 words"}},
    {{"label": "PRIMEBOOK FOCUS", "color": "#C9A84C", "text": "one specific action, under 12 words"}}
  ],
  "recommendations": [
    {{"title": "short actionable title", "text": "2 sentences explaining what to do and why, grounded in the data"}},
    {{"title": "short actionable title", "text": "2 sentences explaining what to do and why, grounded in the data"}},
    {{"title": "short actionable title", "text": "2 sentences explaining what to do and why, grounded in the data"}}
  ],
  "threat_ranking": [
    {{"brand": "HP", "score": 8.5, "color": "#E24B4A"}},
    {{"brand": "Lenovo", "score": 7.5, "color": "#f97316"}},
    {{"brand": "Acer", "score": 6.0, "color": "#f97316"}},
    {{"brand": "Asus", "score": 4.5, "color": "#378ADD"}},
    {{"brand": "Primebook", "score": 3.5, "color": "#C9A84C"}},
    {{"brand": "Dell", "score": 2.5, "color": "#28a745"}}
  ],
  "swot": {{
    "strengths": ["point 1", "point 2"],
    "weaknesses": ["point 1", "point 2"],
    "opportunities": ["point 1", "point 2"],
    "threats": ["point 1", "point 2"]
  }}
}}

IMPORTANT: 
- threat_ranking must include all 5 competitors PLUS Primebook, sorted highest score (most threatening) to lowest
- Primebook's own score should reflect its current market presence and competitive position, not be artificially high or low
- Scores must be realistic based on the actual data provided above
- No apostrophes inside string values, use alternative phrasing
- Return ONLY the JSON object"""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.4,
                    "max_tokens": 3000,
                }
            )
            data = response.json()
            if "error" in data:
                return {"error": f"Groq error: {data['error'].get('message', str(data['error']))}"}
            if "choices" not in data:
                return {"error": f"Unexpected response: {str(data)[:200]}"}

            content = data["choices"][0]["message"]["content"].strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            content = content.strip()

            content = re.sub(r',\s*}', '}', content)
            content = re.sub(r',\s*]', ']', content)
            content = content.replace("\u2019", "").replace("\u2018", "")
            content = content.replace("\u201c", '"').replace("\u201d", '"')

            try:
                result = json.loads(content)
            except json.JSONDecodeError as e:
                return {"error": f"JSON parse error: {str(e)} | Content: {content[:300]}"}

            RESEARCH_CACHE["result"] = result
            RESEARCH_CACHE_TIME = datetime.now()
            print("AI research report completed and cached!")
            return result

    except Exception as e:
        return {"error": str(e)}


# ================================================================
# YOUTUBE ANALYTICS
# Performance · Benchmark · Growth-over-time · Content strategy · Sentiment
# All performance/benchmark math is pure-python over the existing cache
# (zero API calls). AI endpoints use Groq. Growth uses accumulated snapshots.
# ================================================================
import statistics as _statistics

YT_HISTORY_FILE  = "youtube_history.json"
YT_COMMENTS_FILE = "youtube_comments.json"
GROQ_API_KEY     = os.environ.get("GROQ_API_KEY", "")
GROQ_URL         = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL       = "llama-3.3-70b-versatile"
DOW_LABELS       = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _yt_all_videos(brand_cache: dict) -> list:
    """Every unique video we have for a brand, deduped across all tabs by video_id."""
    tabs = brand_cache.get("tabs", {})
    seen, out = set(), []
    for key in ("videos_latest", "videos_popular", "videos_oldest", "shorts", "popular", "live"):
        for v in tabs.get(key, []):
            vid = v.get("video_id")
            if vid and vid not in seen:
                seen.add(vid)
                out.append(v)
    return out


def _parse_dt(s: str):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _yt_metrics(brand_cache: dict) -> dict:
    """Performance metrics for one brand computed from the cached video sample."""
    stats = brand_cache.get("stats", {})
    vids  = _yt_all_videos(brand_cache)
    withv = [v for v in vids if v.get("views", 0) > 0]
    views = [v["views"] for v in withv]

    eng  = [(v.get("likes", 0) + v.get("comments", 0)) / v["views"] for v in withv]
    lr   = [v.get("likes", 0) / v["views"] for v in withv]
    cr   = [v.get("comments", 0) / v["views"] for v in withv]

    # Cadence is based on the most RECENT videos only, so the channel's oldest-ever
    # uploads don't stretch the average gap across the channel's whole lifetime.
    dated = sorted(
        [(_parse_dt(v.get("published_at")), v) for v in vids if _parse_dt(v.get("published_at"))],
        key=lambda x: x[0],
    )
    recent = dated[-20:]
    dow, hod = [0] * 7, [0] * 24
    for dt, _v in recent:
        dow[dt.weekday()] += 1
        hod[dt.hour] += 1
    rdates = [dt for dt, _v in recent]
    gaps = [(rdates[i + 1] - rdates[i]).total_seconds() / 86400 for i in range(len(rdates) - 1)] if len(rdates) > 1 else []

    now = datetime.now(timezone.utc)
    def window(days):
        w  = [v for v in vids if (_parse_dt(v.get("published_at")) and (now - _parse_dt(v.get("published_at"))).days <= days)]
        wv = [v.get("views", 0) for v in w]
        return {"uploads": len(w), "total_views": sum(wv), "avg_views": (sum(wv) // len(wv)) if wv else 0}

    vc = stats.get("video_count", 0) or 0
    return {
        "name":            stats.get("name", ""),
        "subscribers":     stats.get("subscribers", 0),
        "total_views":     stats.get("total_views", 0),
        "video_count":     vc,
        "sample_size":     len(vids),
        "avg_views":       int(sum(views) / len(views)) if views else 0,
        "median_views":    int(_statistics.median(views)) if views else 0,
        "views_per_video": (stats.get("total_views", 0) // vc) if vc else 0,
        "engagement_rate": round(sum(eng) / len(eng) * 100, 2) if eng else 0,
        "like_rate":       round(sum(lr) / len(lr) * 100, 2) if lr else 0,
        "comment_rate":    round(sum(cr) / len(cr) * 100, 3) if cr else 0,
        "shorts_share":    round(len([v for v in vids if v.get("is_short")]) / len(vids) * 100) if vids else 0,
        "dow":             dow,
        "hod":             hod,
        "avg_gap_days":    round(sum(gaps) / len(gaps), 1) if gaps else None,
        "consistency":     round(_statistics.pstdev(gaps), 1) if len(gaps) > 1 else None,
        "uploads_per_week": round(7 / (sum(gaps) / len(gaps)), 1) if gaps and sum(gaps) > 0 else None,
        "window_7":        window(7),
        "window_30":       window(30),
        "window_90":       window(90),
    }


@app.get("/youtube/analytics/all")
def youtube_analytics_all():
    """Per-brand performance metrics for the dashboard + 7/30/90-day benchmark. Zero API calls."""
    cache  = _load_cache()
    brands = cache.get("brands", {})
    out = {bid: _yt_metrics(brands[bid]) for bid in BRAND_CHANNELS if brands.get(bid)}
    return {"last_updated": cache.get("last_updated"), "brands": out}


@app.get("/youtube/analytics/{brand_id}")
def youtube_analytics_brand(brand_id: str):
    brand_id = brand_id.lower()
    b = _brand_cache(brand_id)
    if not b:
        return {"error": "Not cached yet. Run: python youtube_cache_builder.py"}
    m    = _yt_metrics(b)
    vids = _yt_all_videos(b)
    withv = [v for v in vids if v.get("views", 0) > 0]
    med  = m["median_views"] or 1
    ranked = sorted(withv, key=lambda v: v["views"], reverse=True)

    def slim(v):
        views = v.get("views", 0) or 0
        er = round((v.get("likes", 0) + v.get("comments", 0)) / views * 100, 2) if views else 0
        return {
            "video_id": v.get("video_id"),
            "title": v.get("title"), "views": views, "likes": v.get("likes"),
            "comments": v.get("comments"), "url": v.get("url"), "thumbnail": v.get("thumbnail"),
            "published_at": v.get("published_at"), "duration_secs": v.get("duration_secs"),
            "is_short": v.get("is_short"), "engagement_rate": er, "outlier": views >= 2 * med,
        }

    buckets = {"Short (<1m)": 0, "Mid (1-10m)": 0, "Long (>10m)": 0}
    for v in vids:
        s = v.get("duration_secs", 0)
        if s <= 65:      buckets["Short (<1m)"] += 1
        elif s <= 600:   buckets["Mid (1-10m)"] += 1
        else:            buckets["Long (>10m)"] += 1

    latest = sorted(vids, key=lambda v: v.get("published_at") or "", reverse=True)[:8]

    m["top_videos"]       = [slim(v) for v in ranked[:8]]
    m["latest_videos"]    = [slim(v) for v in latest]
    m["bottom_videos"]    = [slim(v) for v in ranked[-5:][::-1]] if len(ranked) >= 5 else []
    m["duration_buckets"] = buckets
    return m


# ─── Per-video AI analysis — aware of (ours vs competitor) × (top vs latest) ──
VIDEO_ANALYSIS_CACHE = {}

@app.get("/youtube/video-analysis/{brand_id}/{video_id}")
async def youtube_video_analysis(brand_id: str, video_id: str, context: str = Query(default="top")):
    brand_id = brand_id.lower()
    context  = "latest" if context == "latest" else "top"
    b = _brand_cache(brand_id)
    if not b:
        return {"error": "Not cached yet"}
    v = next((x for x in _yt_all_videos(b) if x.get("video_id") == video_id), None)
    if not v:
        return {"error": "Video not found"}

    ckey = f"{video_id}:{context}"
    cached = VIDEO_ANALYSIS_CACHE.get(ckey)
    if cached and (datetime.now() - cached["time"]).total_seconds() / 3600 < 168:
        return cached["result"]

    is_ours    = brand_id == "primebook"
    brand_name = b.get("stats", {}).get("name", brand_id)
    dur = v.get("duration_secs", 0)
    dur_txt = f"{dur // 60}m {dur % 60}s" + (" (Short)" if v.get("is_short") else "")
    dt = _parse_dt(v.get("published_at"))
    days = (datetime.now(timezone.utc) - dt).days if dt else None
    age_txt = (f"{days} days ago" if days and days > 0 else "today/very recently") if days is not None else "unknown"

    stats_line = (f'- Views: {v.get("views", 0):,} | Likes: {v.get("likes", 0):,} | '
                  f'Comments: {v.get("comments", 0):,} | Posted: {age_txt} | Length: {dur_txt}')

    # Choose the task + the label for the "action" field per the 4 cases
    if is_ours and context == "top":
        action_label = ""
        task = ("This is one of PRIMEBOOK's OWN best videos. In 3 points explain why it performed well so we can "
                "repeat the winning formula. Do NOT suggest adapting or remaking our own video. "
                "badge_text = a 1-2 word label like TOP PERFORMER, badge_tone = good. Leave action empty.")
    elif is_ours and context == "latest":
        action_label = "Improvements"
        task = ("This is a RECENT PRIMEBOOK upload (our own). Judge whether its views and likes are GOOD ENOUGH for how "
                "long ago it was posted. In 3 points explain why it is doing well OR why it is underperforming. "
                "badge_text = GOOD / UNDERPERFORMING / TOO EARLY, badge_tone = good / warn / neutral. "
                "action = concrete improvements Primebook can make to get more views and likes on videos like this.")
    elif (not is_ours) and context == "top":
        action_label = "Primebook recommendation"
        task = ("This is a COMPETITOR top video. In 3 points explain why it performed well. "
                "badge_text = MAKE THIS / ADAPT IT / SKIP IT (should Primebook make this type), "
                "badge_tone = good / warn / bad. action = if MAKE or ADAPT, how Primebook should make its own version "
                "and what angle; if SKIP, what different content Primebook should make instead.")
    else:  # competitor latest
        action_label = "Primebook move"
        task = ("This is a RECENT COMPETITOR upload. In 3 points analyze whether it gained views and likes FAST for how "
                "recently it was posted (or not) and WHY. badge_text = FAST GROWTH / STEADY / SLOW, "
                "badge_tone = good / neutral / warn. action = what Primebook can do, related to this video topic, "
                "to gain fast views and likes.")

    prompt = f"""You are a YouTube strategist for Primebook India (Android 15 budget laptops, Rs. 10,000-40,000).

Channel: {brand_name} {"(OUR OWN channel)" if is_ours else "(competitor)"}
Video title: "{v.get('title', '')}"
{stats_line}

TASK: {task}

Return ONLY this JSON (no markdown, no apostrophes inside strings):
{{
  "summary": "1-2 sentence plain description of what this video most likely is",
  "badge_text": "short label as instructed",
  "badge_tone": "good|warn|bad|neutral",
  "points": ["point 1", "point 2", "point 3"],
  "action": "{'text as instructed' if action_label else ''}"
}}"""

    result = await _groq_json(prompt, 1200)
    if "error" not in result:
        result["action_label"] = action_label
        VIDEO_ANALYSIS_CACHE[ckey] = {"result": result, "time": datetime.now()}
    return result


# ─── Groq JSON helper (shared by content-strategy + sentiment) ────────────────
async def _groq_json(prompt: str, max_tokens: int = 2500, temperature: float = 0.3) -> dict:
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={"model": GROQ_MODEL, "messages": [{"role": "user", "content": prompt}],
                      "temperature": temperature, "max_tokens": max_tokens,
                      "response_format": {"type": "json_object"}},
            )
            data = resp.json()
            if "error" in data:
                return {"error": data["error"].get("message", str(data["error"]))}
            if "choices" not in data:
                return {"error": str(data)[:200]}
            content = data["choices"][0]["message"]["content"].strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            content = content.strip()
            content = re.sub(r",\s*}", "}", content)
            content = re.sub(r",\s*]", "]", content)
            content = content.replace("’", "").replace("‘", "").replace("“", '"').replace("”", '"')
            return json.loads(content)
    except json.JSONDecodeError as e:
        return {"error": f"JSON parse error: {e}"}
    except Exception as e:
        return {"error": str(e)}


CONTENT_STRATEGY_CACHE = {}

@app.get("/youtube/content-strategy")
async def youtube_content_strategy():
    """AI content-strategy report: title/format patterns, topic clusters, gaps, SWOT, ideas."""
    global CONTENT_STRATEGY_CACHE
    c = CONTENT_STRATEGY_CACHE
    if c.get("result") and c.get("time") and (datetime.now() - c["time"]).total_seconds() / 3600 < 24:
        return c["result"]

    cache  = _load_cache()
    brands = cache.get("brands", {})
    if not brands:
        return {"error": "No YouTube cache. Run: python youtube_cache_builder.py"}

    # Best-performing day/hour across all brands' top videos (grounds the recommendation)
    best_dow, best_hod, lines = [0] * 7, [0] * 24, []
    for bid in BRAND_CHANNELS:
        b = brands.get(bid)
        if not b:
            continue
        m    = _yt_metrics(b)
        vids = _yt_all_videos(b)
        top  = sorted([v for v in vids if v.get("views", 0) > 0], key=lambda v: v["views"], reverse=True)[:8]
        for v in top:
            dt = _parse_dt(v.get("published_at"))
            if dt:
                best_dow[dt.weekday()] += 1
                best_hod[dt.hour] += 1
        lines.append(
            f"{m['name']}: subs {m['subscribers']:,}, avg views {m['avg_views']:,}, "
            f"engagement {m['engagement_rate']}%, ~{m['uploads_per_week']} uploads/wk, shorts {m['shorts_share']}%\n"
            f"  Top video titles: " + " | ".join((v.get('title', '') or '')[:70] for v in top[:6])
        )
    peak_day  = DOW_LABELS[best_dow.index(max(best_dow))] if any(best_dow) else "n/a"
    peak_hour = best_hod.index(max(best_hod)) if any(best_hod) else 0

    prompt = f"""You are a senior YouTube content strategist for Primebook India, an Android 15 budget laptop brand (Rs. 10,000-40,000 segment).

Analyze the 5 competitor channels below and produce a content-strategy report for Primebook.

COMPETITOR YOUTUBE DATA:
{chr(10).join(lines)}

DATA SIGNAL: across competitors' best-performing videos, the most common upload day is {peak_day} and the most common upload hour is ~{peak_hour}:00 UTC.

PRIMEBOOK PRODUCTS: Neo (Rs.19,990 / 6GB / 11.6"), Pro (Rs.25,990 / 8GB / 14.1"), Max (Rs.27,990 / 8GB / 15.6"). All Android 15.

Return ONLY this JSON (no markdown, no apostrophes inside strings):
{{
  "title_patterns": [{{"pattern": "short phrase", "detail": "1 sentence with evidence"}}],
  "format_mix": [{{"format": "Tutorials|Reviews|Unboxing|Shorts|Comparisons|Ads", "note": "who does it and how it performs"}}],
  "topic_clusters": [{{"topic": "2-3 words", "drives_views": "high|medium|low", "note": "1 sentence"}}],
  "content_gaps": [{{"gap": "topic competitors ignore", "why_primebook": "why it fits Primebook strengths"}}],
  "outliers": [{{"observation": "what makes certain videos outperform", "takeaway": "actionable point"}}],
  "swot": {{"strengths": ["..."], "weaknesses": ["..."], "opportunities": ["..."], "threats": ["..."]}},
  "content_ideas": [{{"title": "ready-to-use video title", "format": "format", "why": "1 sentence rationale"}}],
  "optimal_upload": {{"day": "{peak_day}", "time_ist": "convert {peak_hour}:00 UTC to IST", "rationale": "1 sentence"}}
}}
Give 4-5 items in each array and 6 content_ideas. Base everything on the data above."""

    result = await _groq_json(prompt, 3200)
    if "error" not in result:
        CONTENT_STRATEGY_CACHE = {"result": result, "time": datetime.now()}
    return result


# ─── Growth over time (accumulated snapshots) ─────────────────────────────────
def _load_yt_history() -> dict:
    if not os.path.exists(YT_HISTORY_FILE):
        return {"snapshots": []}
    try:
        with open(YT_HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"snapshots": []}


def _record_yt_snapshot() -> dict:
    """Append today's channel stats to youtube_history.json (one entry per day)."""
    cache  = _load_cache()
    brands = cache.get("brands", {})
    if not brands:
        return {"recorded": False, "reason": "no youtube cache yet"}
    today = datetime.now(timezone.utc).date().isoformat()
    hist  = _load_yt_history()
    snaps = [s for s in hist.get("snapshots", []) if s.get("date") != today]
    entry = {"date": today, "brands": {}}
    for bid in BRAND_CHANNELS:
        st = brands.get(bid, {}).get("stats", {})
        if st:
            entry["brands"][bid] = {
                "subscribers": st.get("subscribers", 0),
                "total_views": st.get("total_views", 0),
                "video_count": st.get("video_count", 0),
            }
    snaps.append(entry)
    snaps.sort(key=lambda s: s["date"])
    hist["snapshots"] = snaps
    with open(YT_HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(hist, f, indent=2)
    return {"recorded": True, "date": today, "total_snapshots": len(snaps)}


@app.get("/youtube/growth/record")
def youtube_growth_record():
    """Manually capture a snapshot. (Also call this weekly / after each cache rebuild.)"""
    return _record_yt_snapshot()


@app.get("/youtube/growth/history")
def youtube_growth_history():
    hist  = _load_yt_history()
    snaps = hist.get("snapshots", [])
    brands = {}
    for bid in BRAND_CHANNELS:
        series = [{"date": s["date"], **s["brands"].get(bid, {})} for s in snaps if bid in s.get("brands", {})]
        d = {"series": series}
        if len(series) >= 2:
            d["subs_change"]  = series[-1].get("subscribers", 0) - series[0].get("subscribers", 0)
            d["views_change"] = series[-1].get("total_views", 0) - series[0].get("total_views", 0)
            d["days_tracked"] = len(series)
        brands[bid] = d
    return {
        "count": len(snaps),
        "brands": brands,
        "collecting": len(snaps) < 2,
        "message": ("Only one snapshot so far — growth trends populate as more weekly snapshots accumulate."
                    if len(snaps) < 2 else f"Tracking {len(snaps)} snapshots."),
    }


# ─── Comment sentiment (reads youtube_comments.json; build with youtube_comments_builder.py) ──
def _load_yt_comments() -> dict:
    if not os.path.exists(YT_COMMENTS_FILE):
        return {}
    try:
        with open(YT_COMMENTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


SENTIMENT_CACHE = {}

@app.get("/youtube/sentiment/{brand_id}")
async def youtube_sentiment(brand_id: str):
    brand_id = brand_id.lower()
    data = _load_yt_comments()
    bc   = (data.get("brands", {}) or {}).get(brand_id) if data else None
    if not bc or not bc.get("comments"):
        return {"available": False,
                "message": "No comments collected yet. Run: python youtube_comments_builder.py"}

    cached = SENTIMENT_CACHE.get(brand_id)
    if cached and (datetime.now() - cached["time"]).total_seconds() / 3600 < 24:
        return cached["result"]

    comments = bc["comments"][:120]
    listing  = "\n".join(f"- {c}" for c in comments)
    prompt = f"""You are analyzing YouTube comments on {bc.get('name', brand_id)} laptop videos (a Primebook competitor in India).

COMMENTS ({len(comments)}):
{listing}

Return ONLY this JSON (no markdown, no apostrophes inside strings):
{{
  "overall_label": "Positive|Mixed|Negative",
  "sentiment": {{"positive": <int %>, "neutral": <int %>, "negative": <int %>}},
  "pain_points": [{{"text": "what viewers complain about", "severity": "high|medium|low"}}],
  "praise": ["what viewers like"],
  "themes": [{{"topic": "2-3 words", "sentiment": "positive|negative|neutral", "note": "1 sentence"}}],
  "primebook_takeaway": "1-2 sentences on how Primebook can exploit these pain points"
}}
Percentages must sum to 100. Give 3-5 pain_points, 3-4 praise, 4-5 themes."""

    result = await _groq_json(prompt, 1800)
    if "error" not in result:
        result["available"] = True
        result["sample_size"] = len(comments)
        result["sampled_videos"] = bc.get("sampled_videos", 0)
        SENTIMENT_CACHE[brand_id] = {"result": result, "time": datetime.now()}
    return result

    

# ================================================================
# INSTAGRAM ANALYTICS  (mirror of the YouTube dashboard, within IG data limits)
# Available: followers/following/total-posts + up to 12 recent posts
#   (thumbnail, partial caption via `alt`, reel/post type).
# NOT available: per-post likes/comments/views/dates, comments, history.
# ================================================================
IG_HISTORY_FILE = "instagram_history.json"


def _ig_posts(bc):
    return bc.get("recent_posts", []) or []


def _ig_metrics(bid, bc):
    st = bc.get("stats", {}) or {}
    posts = _ig_posts(bc)
    reels = len([p for p in posts if p.get("type") == "reel"])
    followers = st.get("followers", 0) or 0
    total_posts = st.get("posts", 0) or 0
    likes_list = [p.get("likes") for p in posts if isinstance(p.get("likes"), (int, float))]
    avg_likes = round(sum(likes_list) / len(likes_list)) if likes_list else None
    engagement = round(avg_likes / followers * 100, 2) if avg_likes and followers else None
    return {
        "brand_id": bid,
        "name": bc.get("name", bid),
        "handle": bc.get("handle", ""),
        "profile_pic": bc.get("profile_pic", ""),
        "followers": followers,
        "following": st.get("following", 0) or 0,
        "posts": total_posts,
        "followers_per_post": round(followers / total_posts) if total_posts else 0,
        "sample_size": len(posts),
        "reels": reels,
        "images": len(posts) - reels,
        "reel_share": round(reels / len(posts) * 100) if posts else 0,
        "avg_likes": avg_likes,          # None until posts are enriched with likes
        "engagement_rate": engagement,   # avg likes / followers, None until enriched
    }


@app.get("/instagram/analytics/all")
def instagram_analytics_all():
    cache = _load_instagram_cache()
    brands = cache.get("brands", {})
    out = {bid: _ig_metrics(bid, brands[bid]) for bid in INSTAGRAM_BRANDS if brands.get(bid)}
    return {"last_updated": cache.get("last_updated"), "brands": out}


@app.get("/instagram/analytics/{brand_id}")
def instagram_analytics_brand(brand_id: str):
    brand_id = brand_id.lower()
    bc = _load_instagram_cache().get("brands", {}).get(brand_id)
    if not bc:
        return {"error": "Not cached yet. Run: python instagram_cache_builder.py"}
    m = _ig_metrics(brand_id, bc)
    m["recent_posts"] = [
        {"index": i, "url": p.get("url"), "thumbnail": p.get("thumbnail"),
         "caption": p.get("alt", ""), "type": p.get("type", "post"),
         "likes": p.get("likes"), "taken_at": p.get("taken_at")}
        for i, p in enumerate(_ig_posts(bc))
    ]
    return m


IG_CONTENT_CACHE = {}


@app.get("/instagram/content-strategy")
async def instagram_content_strategy():
    global IG_CONTENT_CACHE
    c = IG_CONTENT_CACHE
    if c.get("result") and c.get("time") and (datetime.now() - c["time"]).total_seconds() / 3600 < 24:
        return c["result"]

    cache = _load_instagram_cache()
    brands = cache.get("brands", {})
    if not brands:
        return {"error": "No Instagram cache. Run: python instagram_cache_builder.py"}

    lines = []
    for bid in INSTAGRAM_BRANDS:
        bc = brands.get(bid)
        if not bc:
            continue
        m = _ig_metrics(bid, bc)
        caps = [(p.get("alt") or "").replace("\n", " ")[:90] for p in _ig_posts(bc)][:5]
        lines.append(
            f"{m['name']}: {m['followers']:,} followers, {m['posts']:,} posts, "
            f"{m['reel_share']}% reels, {m['followers_per_post']} followers/post\n"
            f"  Recent captions: " + " | ".join(caps)
        )

    prompt = f"""You are an Instagram content strategist for Primebook India (Android 15 budget laptops, Rs. 10,000-40,000).

Analyze the competitor Instagram presence below and produce a content strategy for Primebook.
NOTE: only follower/post counts, reel share, and short captions are available (no per-post likes/views).

DATA:
{chr(10).join(lines)}

Return ONLY this JSON (no markdown, no apostrophes inside strings):
{{
  "caption_patterns": [{{"pattern": "short phrase", "detail": "1 sentence with evidence"}}],
  "hashtag_themes": [{{"theme": "2-3 words", "note": "1 sentence"}}],
  "format_mix": [{{"format": "Reels|Carousels|Static posts|Stories", "note": "who leans on it and why it works"}}],
  "content_gaps": [{{"gap": "topic competitors ignore", "why_primebook": "why it fits Primebook"}}],
  "swot": {{"strengths": ["..."], "weaknesses": ["..."], "opportunities": ["..."], "threats": ["..."]}},
  "content_ideas": [{{"idea": "ready-to-post idea", "format": "Reel|Carousel|Static", "why": "1 sentence"}}],
  "optimal_cadence": {{"posts_per_week": "number or range", "reel_ratio": "e.g. 60% reels", "rationale": "1 sentence"}}
}}
Give 4-5 items in each array and 6 content_ideas. Base everything on the data above."""

    result = await _groq_json(prompt, 3000)
    if "error" not in result:
        IG_CONTENT_CACHE = {"result": result, "time": datetime.now()}
    return result


IG_POST_CACHE = {}


@app.get("/instagram/post-analysis/{brand_id}")
async def instagram_post_analysis(brand_id: str, i: int = Query(default=0)):
    brand_id = brand_id.lower()
    bc = _load_instagram_cache().get("brands", {}).get(brand_id)
    if not bc:
        return {"error": "Not cached yet"}
    posts = _ig_posts(bc)
    if i < 0 or i >= len(posts):
        return {"error": "Post not found"}
    p = posts[i]

    ckey = f"{brand_id}:{i}"
    cached = IG_POST_CACHE.get(ckey)
    if cached and (datetime.now() - cached["time"]).total_seconds() / 3600 < 168:
        return cached["result"]

    is_ours = brand_id == "primebook"
    name = bc.get("name", brand_id)
    caption = (p.get("alt") or "").replace("\n", " ")[:150]
    ptype = "Reel" if p.get("type") == "reel" else "Static/Carousel post"

    if is_ours:
        action_label = "Improvements"
        task = ("This is one of PRIMEBOOK's OWN recent posts. Judge whether the content angle and caption are strong "
                "for reach and likes. In 3 points say what is working or weak. badge_text = STRONG / OK / WEAK, "
                "badge_tone = good / neutral / warn. action = concrete improvements to get more reach and likes. "
                "Do NOT suggest copying our own post.")
    else:
        action_label = "Primebook move"
        task = ("This is a COMPETITOR post. In 3 points explain what kind of content it is and why this format/angle "
                "tends to work on Instagram. badge_text = MAKE THIS / ADAPT IT / SKIP IT (should Primebook make this "
                "type), badge_tone = good / warn / bad. action = what Primebook can do, related to this post, to gain "
                "reach and likes fast.")

    prompt = f"""You are an Instagram strategist for Primebook India (Android 15 budget laptops, Rs. 10,000-40,000).

Channel: {name} {"(OUR OWN account)" if is_ours else "(competitor)"}
Post type: {ptype}
Caption (partial): "{caption}"

TASK: {task}
Note: exact likes/views are NOT available, so judge by content angle, format and caption, not by numbers.

Return ONLY this JSON (no markdown, no apostrophes inside strings):
{{
  "summary": "1-2 sentence description of what this post most likely is",
  "badge_text": "short label as instructed",
  "badge_tone": "good|warn|bad|neutral",
  "points": ["point 1", "point 2", "point 3"],
  "action": "text as instructed"
}}"""

    result = await _groq_json(prompt, 1100)
    if "error" not in result:
        result["action_label"] = action_label
        IG_POST_CACHE[ckey] = {"result": result, "time": datetime.now()}
    return result


# ─── Instagram follower growth over time (accumulated snapshots) ──────────────
def _load_ig_history():
    if not os.path.exists(IG_HISTORY_FILE):
        return {"snapshots": []}
    try:
        with open(IG_HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"snapshots": []}


def _record_ig_snapshot():
    brands = _load_instagram_cache().get("brands", {})
    if not brands:
        return {"recorded": False, "reason": "no instagram cache yet"}
    today = datetime.now(timezone.utc).date().isoformat()
    hist = _load_ig_history()
    snaps = [s for s in hist.get("snapshots", []) if s.get("date") != today]
    entry = {"date": today, "brands": {}}
    for bid in INSTAGRAM_BRANDS:
        st = brands.get(bid, {}).get("stats", {})
        if st:
            entry["brands"][bid] = {"followers": st.get("followers", 0), "posts": st.get("posts", 0)}
    snaps.append(entry)
    snaps.sort(key=lambda s: s["date"])
    hist["snapshots"] = snaps
    with open(IG_HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(hist, f, indent=2)
    return {"recorded": True, "date": today, "total_snapshots": len(snaps)}


@app.get("/instagram/growth/record")
def instagram_growth_record():
    return _record_ig_snapshot()


@app.get("/instagram/growth/history")
def instagram_growth_history():
    hist = _load_ig_history()
    snaps = hist.get("snapshots", [])
    brands = {}
    for bid in INSTAGRAM_BRANDS:
        series = [{"date": s["date"], **s["brands"].get(bid, {})} for s in snaps if bid in s.get("brands", {})]
        d = {"series": series}
        if len(series) >= 2:
            d["followers_change"] = series[-1].get("followers", 0) - series[0].get("followers", 0)
        brands[bid] = d
    return {
        "count": len(snaps),
        "brands": brands,
        "collecting": len(snaps) < 2,
        "message": ("Only one snapshot so far — follower trends populate as more weekly snapshots accumulate."
                    if len(snaps) < 2 else f"Tracking {len(snaps)} snapshots."),
    }
