# ================================
# CROSS-PLATFORM PRODUCT MATCHER (AI)
# Matches Amazon <-> Flipkart listings that are the SAME physical product and
# merges them into a single canonical record with a confidence score.
# Uses specs (brand/processor/RAM/storage/display/OS/price), not just the title.
# ================================

import os
import json
from datetime import datetime, timezone

from fastapi import APIRouter
from agents import agent_call

router = APIRouter(prefix="/price", tags=["product-match"])

AMAZON_CACHE = "amazon_cache.json"
FLIPKART_CACHE = "flipkart_cache.json"
OUT_FILE = "product_matches.json"
ORDER = ["primebook", "hp", "lenovo", "acer", "dell", "asus"]

MATCH_SYSTEM = (
    "You are an expert product matching assistant. Your task is to compare products "
    "from TWO ecommerce platforms (Amazon and Flipkart) and identify which listings "
    "refer to the same physical product. Do NOT rely only on the product title. "
    "Compare using: brand, model number, processor, RAM, storage, display size, color, "
    "generation, product description, and specifications. Ignore: seller names, discounts, "
    "offer text, delivery information, extra marketing words, and minor title differences. "
    "If two products are the same, merge them into a single record; if different, keep them "
    "separate. Never invent products. Only merge when confidence is at least 0.90. "
    "Confidence must be between 0 and 1. Return ONLY valid JSON."
)


def _load(f):
    if os.path.exists(f):
        try:
            return json.loads(open(f, encoding="utf-8").read().strip() or "{}")
        except Exception:
            pass
    return {}


def _slim(p):
    """Compact spec view of one product for the matcher prompt."""
    return {
        "title": (p.get("name") or "")[:140],
        "processor": p.get("processor") or "",
        "ram_gb": p.get("ram_gb") or 0,
        "storage_gb": p.get("storage_gb") or 0,
        "display_inch": p.get("display_inch") or 0,
        "os": p.get("os") or "",
        "price": p.get("price_inr") or 0,
        "url": p.get("url") or "",
    }


def _record(canonical, conf, az, fk):
    def side(p):
        return {"title": p.get("name", ""), "price": p.get("price_inr", 0), "url": p.get("url", "")} if p else None
    return {"canonical_name": canonical, "confidence": conf, "amazon": side(az), "flipkart": side(fk)}


async def _match_brand(brand_name, az_products, fk_products):
    """Return matched/merged records for one brand. LLM only when both sides have items."""
    # Single-platform brand — nothing to cross-match; emit each listing directly.
    if not az_products or not fk_products:
        recs = []
        for p in az_products:
            recs.append(_record(p.get("name", ""), 1.0, p, None))
        for p in fk_products:
            recs.append(_record(p.get("name", ""), 1.0, None, p))
        return recs

    az_slim = [_slim(p) for p in az_products]
    fk_slim = [_slim(p) for p in fk_products]
    prompt = f"""Brand: {brand_name}

AMAZON listings (index : specs):
{json.dumps({i: s for i, s in enumerate(az_slim)}, ensure_ascii=False)}

FLIPKART listings (index : specs):
{json.dumps({i: s for i, s in enumerate(fk_slim)}, ensure_ascii=False)}

Decide which Amazon listing (if any) refers to the SAME physical product as each
Flipkart listing, using the specs — not just the title. Return ONLY this JSON:
{{
  "matches": [
    {{"canonical_name": "clean model name", "confidence": 0.0,
      "amazon_index": <int or null>, "flipkart_index": <int or null>}}
  ]
}}
Rules:
- One object per distinct physical product.
- If the same product is on BOTH platforms, set both indices and confidence 0.90-1.0.
- If a product is on only ONE platform, set the other index to null (confidence 1.0).
- Only pair an Amazon+Flipkart together when confidence >= 0.90; otherwise keep them as
  separate single-platform records.
- Use every listing exactly once. Never invent products."""

    res = await agent_call(MATCH_SYSTEM, prompt, max_tokens=2600, temperature=0.1,
                           api_key=os.environ.get("GROQ_API_KEY_STUDIO") or None)
    raw = res.get("matches", []) if isinstance(res, dict) else []
    if not raw:  # AI failed — fall back to listing everything separately (never lose data)
        return [_record(p.get("name", ""), 1.0, p, None) for p in az_products] + \
               [_record(p.get("name", ""), 1.0, None, p) for p in fk_products]

    recs = []
    for m in raw:
        ai = m.get("amazon_index"); fi = m.get("flipkart_index")
        az = az_products[ai] if isinstance(ai, int) and 0 <= ai < len(az_products) else None
        fk = fk_products[fi] if isinstance(fi, int) and 0 <= fi < len(fk_products) else None
        if not az and not fk:
            continue
        try:
            conf = float(m.get("confidence", 0))
        except (TypeError, ValueError):
            conf = 0.0
        # enforce the 0.90 merge threshold: below it, split into two single-platform records
        if az and fk and conf < 0.90:
            recs.append(_record(az.get("name", ""), 1.0, az, None))
            recs.append(_record(fk.get("name", ""), 1.0, None, fk))
        else:
            recs.append(_record(m.get("canonical_name") or (az or fk).get("name", ""),
                                 round(conf, 2) if (az and fk) else 1.0, az, fk))
    return recs


@router.get("/matches")
async def get_matches(refresh: bool = False):
    """Return Amazon<->Flipkart matched product records (schema per spec)."""
    if not refresh and os.path.exists(OUT_FILE):
        try:
            cached = json.loads(open(OUT_FILE, encoding="utf-8").read())
            return cached
        except Exception:
            pass

    az = _load(AMAZON_CACHE)
    fk = _load(FLIPKART_CACHE)
    brands = [b for b in ORDER if b in az or b in fk] + \
             [b for b in list(az) + list(fk) if b not in ORDER and isinstance(az.get(b) or fk.get(b), dict)]
    seen, all_records = set(), []
    for b in brands:
        if b in seen:
            continue
        seen.add(b)
        azb = az.get(b) if isinstance(az.get(b), dict) else {}
        fkb = fk.get(b) if isinstance(fk.get(b), dict) else {}
        azp = azb.get("products", []) or []
        fkp = fkb.get("products", []) or []
        if not azp and not fkp:
            continue
        name = azb.get("name") or fkb.get("name") or b
        all_records.extend(await _match_brand(name, azp, fkp))

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total": len(all_records),
        "matched_both": sum(1 for r in all_records if r["amazon"] and r["flipkart"]),
        "matches": all_records,
    }
    try:
        with open(OUT_FILE, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
    except Exception:
        pass
    return result
