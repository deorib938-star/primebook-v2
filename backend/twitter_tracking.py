# ================================
# TWITTER / X TRACKING  (mirror of the Instagram dashboard)
# Serves profile stats + recent tweets from twitter_cache.json (built offline by
# twitter_cache_builder.py). Same shape/endpoints as /instagram/* so the frontend
# mirrors InstagramAnalytics. Growth accumulates in twitter_history.json.
# ================================

import os
import json
from datetime import datetime, timezone

from fastapi import APIRouter
from agents import agent_call

router = APIRouter(prefix="/twitter", tags=["twitter"])

CACHE_FILE   = "twitter_cache.json"
HISTORY_FILE = "twitter_history.json"

TWITTER_BRANDS = {
    "hp": "HP India", "lenovo": "Lenovo India", "acer": "Acer India",
    "dell": "Dell India", "asus": "ASUS India", "primebook": "Primebook",
}
_ORDER = ["hp", "lenovo", "acer", "dell", "asus", "primebook"]


def _load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.loads(f.read().strip() or "{}")
        except Exception:
            pass
    return {}


def _tweets(bc):
    return bc.get("recent_posts", []) or []


def _metrics(bid, bc):
    st = bc.get("stats", {}) or {}
    tw = _tweets(bc)
    followers = st.get("followers", 0) or 0
    total = st.get("posts", 0) or 0
    likes = [t.get("likes") for t in tw if isinstance(t.get("likes"), (int, float))]
    rts   = [t.get("retweets") for t in tw if isinstance(t.get("retweets"), (int, float))]
    reps  = [t.get("replies") for t in tw if isinstance(t.get("replies"), (int, float))]
    avg_likes = round(sum(likes) / len(likes)) if likes else None
    avg_rts   = round(sum(rts) / len(rts)) if rts else None
    # engagement = avg (likes + retweets + replies) / followers
    eng = None
    if followers and (likes or rts or reps):
        tot = (sum(likes) + sum(rts) + sum(reps))
        n = max(len(tw), 1)
        eng = round((tot / n) / followers * 100, 3)
    return {
        "brand_id": bid, "name": bc.get("name", bid), "handle": bc.get("handle", ""),
        "profile_pic": bc.get("profile_pic", ""), "url": bc.get("url", ""),
        "followers": followers, "following": st.get("following", 0) or 0, "posts": total,
        "followers_per_post": round(followers / total) if total else 0,
        "sample_size": len(tw),
        "avg_likes": avg_likes, "avg_retweets": avg_rts,
        "engagement_rate": eng,
    }


@router.get("/cache/status")
def cache_status():
    cache = _load_cache()
    brands = cache.get("brands", {})
    return {
        "cached": bool(brands),
        "last_updated": cache.get("last_updated"),
        "brands_cached": [b for b in _ORDER if brands.get(b)],
        "has_data": any((brands.get(b, {}).get("stats", {}) or {}).get("followers") for b in _ORDER),
        "message": "Twitter cache ready" if any((brands.get(b, {}).get("stats", {}) or {}).get("followers") for b in _ORDER)
                   else "No data yet — add TW_AUTH_TOKEN to backend/.env and run: python twitter_cache_builder.py",
    }


@router.get("/analytics/all")
def analytics_all():
    cache = _load_cache()
    brands = cache.get("brands", {})
    out = {bid: _metrics(bid, brands[bid]) for bid in _ORDER if brands.get(bid)}
    return {"last_updated": cache.get("last_updated"), "brands": out}


@router.get("/analytics/{brand_id}")
def analytics_brand(brand_id: str):
    brand_id = brand_id.lower()
    bc = _load_cache().get("brands", {}).get(brand_id)
    if not bc:
        return {"error": "Not cached yet. Run: python twitter_cache_builder.py"}
    m = _metrics(brand_id, bc)
    m["recent_posts"] = [
        {"index": i, "url": t.get("url"), "text": t.get("text", ""),
         "likes": t.get("likes"), "retweets": t.get("retweets"), "replies": t.get("replies"),
         "taken_at": t.get("taken_at"), "type": t.get("type", "tweet")}
        for i, t in enumerate(_tweets(bc))
    ]
    return m


# ─── Follower growth over time ────────────────────────────────────────────────
def _load_history():
    if not os.path.exists(HISTORY_FILE):
        return {"snapshots": []}
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"snapshots": []}


@router.get("/growth/record")
def growth_record():
    brands = _load_cache().get("brands", {})
    if not brands:
        return {"recorded": False, "reason": "no twitter cache yet"}
    today = datetime.now(timezone.utc).date().isoformat()
    hist = _load_history()
    snaps = [s for s in hist.get("snapshots", []) if s.get("date") != today]
    entry = {"date": today, "brands": {}}
    for bid in _ORDER:
        st = brands.get(bid, {}).get("stats", {})
        if st:
            entry["brands"][bid] = {"followers": st.get("followers", 0), "posts": st.get("posts", 0)}
    snaps.append(entry)
    snaps.sort(key=lambda s: s["date"])
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump({"snapshots": snaps}, f, indent=2)
    return {"recorded": True, "date": today, "total_snapshots": len(snaps)}


@router.get("/growth/history")
def growth_history():
    snaps = _load_history().get("snapshots", [])
    brands = {}
    for bid in _ORDER:
        series = [{"date": s["date"], **s["brands"].get(bid, {})} for s in snaps if bid in s.get("brands", {})]
        d = {"series": series}
        if len(series) >= 2:
            d["change"] = series[-1].get("followers", 0) - series[0].get("followers", 0)
        brands[bid] = d
    return {"brands": brands, "snapshots": len(snaps)}


# ─── AI audience estimate (inferred — labelled as estimate in the UI) ─────────
_AUD_CACHE = {}


@router.get("/audience/{brand_id}")
async def audience(brand_id: str, refresh: bool = False):
    brand_id = brand_id.lower()
    if not refresh and brand_id in _AUD_CACHE:
        return _AUD_CACHE[brand_id]
    bc = _load_cache().get("brands", {}).get(brand_id)
    name = bc.get("name", brand_id) if bc else TWITTER_BRANDS.get(brand_id, brand_id)
    tweets = [t.get("text", "") for t in _tweets(bc)][:12] if bc else []
    prompt = f"""Estimate the X/Twitter audience of {name} (a laptop brand in India), based on
their recent tweets below. This is an INFERRED estimate, not measured analytics.

RECENT TWEETS:
{chr(10).join('- ' + t for t in tweets) or '(none available)'}

Return ONLY this JSON:
{{
  "audience_types": [{{"type": "e.g. Students", "pct": <int>, "desc": "short"}}],
  "tone": "3-4 adjectives describing how they sound on X",
  "content_mix": [{{"label": "e.g. Product", "pct": <int>}}],
  "takeaway": "1 sentence: how Primebook can win this audience on X"
}}
audience_types pct sum to 100; content_mix pct sum to 100; 3-4 items each."""
    res = await agent_call("You are a social-audience analyst.", prompt, max_tokens=1200, temperature=0.5)
    if isinstance(res, dict) and "error" not in res:
        res["estimate"] = True
        _AUD_CACHE[brand_id] = res
    return res
