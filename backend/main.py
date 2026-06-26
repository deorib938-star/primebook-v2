# ================================
# PRIMEBOOK INTELLIGENCE API
# FastAPI Backend
# ================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from competitor_registry import competitors, primebook
import json
import os
import re

app = FastAPI(title="Primebook Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

def clean_name(name):
    # Remove extra spaces and lowercase for comparison
    name = re.sub(r'\s+', ' ', name.lower().strip())
    # Remove common noise words
    for word in ["laptop", "notebook", "thin and light", "series"]:
        name = name.replace(word, "")
    return name.strip()

def is_similar(name1, name2, threshold=0.6):
    # Simple similarity check
    words1 = set(clean_name(name1).split())
    words2 = set(clean_name(name2).split())
    if not words1 or not words2:
        return False
    common = words1.intersection(words2)
    similarity = len(common) / max(len(words1), len(words2))
    return similarity >= threshold

def merge_products(amazon_products, flipkart_products):
    merged = []
    used_flipkart = set()

    for ap in amazon_products:
        matched = False
        for i, fp in enumerate(flipkart_products):
            if i in used_flipkart:
                continue
            if is_similar(ap.get("name", ""), fp.get("name", "")):
                # Same product — use lowest price
                amazon_price = ap.get("price_inr", 0)
                flipkart_price = fp.get("price_inr", 0)

                if amazon_price > 0 and flipkart_price > 0:
                    best_price = min(amazon_price, flipkart_price)
                    best_source = "Amazon" if amazon_price <= flipkart_price else "Flipkart"
                elif amazon_price > 0:
                    best_price = amazon_price
                    best_source = "Amazon"
                else:
                    best_price = flipkart_price
                    best_source = "Flipkart"

                merged_product = {**ap}
                merged_product["price_inr"] = best_price
                merged_product["amazon_price"] = amazon_price
                merged_product["flipkart_price"] = flipkart_price
                merged_product["best_source"] = best_source
                merged.append(merged_product)
                used_flipkart.add(i)
                matched = True
                break

        if not matched:
            # Only on Amazon
            p = {**ap}
            p["amazon_price"] = ap.get("price_inr", 0)
            p["flipkart_price"] = 0
            p["best_source"] = "Amazon"
            merged.append(p)

    # Add Flipkart-only products
    for i, fp in enumerate(flipkart_products):
        if i not in used_flipkart:
            p = {**fp}
            p["amazon_price"] = 0
            p["flipkart_price"] = fp.get("price_inr", 0)
            p["best_source"] = "Flipkart"
            merged.append(p)

    # Sort by reviews descending
    merged.sort(key=lambda x: x.get("reviews", 0), reverse=True)
    return merged

def get_combined_products():
    amazon = load_amazon_cache()
    flipkart = load_flipkart_cache()
    combined = {}

    all_brands = set(list(amazon.keys()) + list(flipkart.keys()))
    all_brands.discard("last_updated")
    all_brands.discard("next_update")

    for brand_id in all_brands:
        amazon_products = amazon.get(brand_id, {}).get("products", [])
        flipkart_products = flipkart.get(brand_id, {}).get("products", [])

        merged = merge_products(amazon_products, flipkart_products)

        brand_name = (
            amazon.get(brand_id, {}).get("name") or
            flipkart.get(brand_id, {}).get("name") or
            brand_id.upper()
        )

        combined[brand_id] = {
            "name": brand_name,
            "products": merged,
            "total": len(merged),
            "amazon_count": len(amazon_products),
            "flipkart_count": len(flipkart_products),
        }

    return combined

# ================================
# ROUTES
# ================================

@app.get("/")
def home():
    return {"status": "Primebook API running!", "version": "2.0"}

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

@app.get("/cache/status")
def cache_status():
    amazon = load_amazon_cache()
    flipkart = load_flipkart_cache()
    combined = get_combined_products()

    return {
        "amazon_last_updated": amazon.get("last_updated", "Never"),
        "flipkart_last_updated": flipkart.get("last_updated", "Never"),
        "brands": {
            bid: {
                "name": data["name"],
                "total": data["total"],
                "amazon_count": data["amazon_count"],
                "flipkart_count": data["flipkart_count"],
            }
            for bid, data in combined.items()
        }
    }
def get_relevant_products(brand_id, prime_model, max_products=10):
    combined = get_combined_products()
    brand_data = combined.get(brand_id, {})
    products = brand_data.get("products", [])

    if not products:
        return []

    # Prime model specs
    prime_price   = prime_model["price"]
    prime_ram     = prime_model["ram"]
    prime_storage = prime_model["storage"]
    prime_display = prime_model["display"]
    prime_battery = prime_model["battery"]

    def relevance_score(product):
        score = 0

        # Price similarity (40%) — prefer products in similar price range
        comp_price = product.get("price_inr", 0)
        if comp_price > 0:
            price_diff = abs(prime_price - comp_price) / prime_price
            if price_diff <= 0.2:    price_score = 100  # within 20%
            elif price_diff <= 0.4:  price_score = 75   # within 40%
            elif price_diff <= 0.6:  price_score = 50   # within 60%
            elif price_diff <= 0.8:  price_score = 25   # within 80%
            else:                    price_score = 10
            score += price_score * 0.40

        # Spec similarity (30%)
        spec_score = 0

        # RAM similarity
        comp_ram = product.get("ram_gb", 0)
        if comp_ram > 0:
            ram_diff = abs(prime_ram - comp_ram)
            if ram_diff == 0:   spec_score += 40
            elif ram_diff <= 2: spec_score += 25
            elif ram_diff <= 4: spec_score += 10

        # Display similarity
        comp_display = product.get("display_inch", 0)
        if comp_display > 0:
            display_diff = abs(prime_display - comp_display)
            if display_diff <= 0.5:  spec_score += 35
            elif display_diff <= 1:  spec_score += 20
            elif display_diff <= 2:  spec_score += 10

        # Storage similarity
        comp_storage = product.get("storage_gb", 0)
        if comp_storage > 0:
            if comp_storage >= prime_storage:  spec_score += 25
            else:                              spec_score += 10

        score += spec_score * 0.30

        # Popularity (30%) — reviews and rating
        reviews = product.get("reviews", 0)
        rating  = product.get("rating", 0)

        # Normalize reviews (max 2000 reviews = 100 score)
        review_score = min(reviews / 20, 100)
        rating_score = (rating / 5) * 100 if rating > 0 else 0
        popularity_score = (review_score * 0.7) + (rating_score * 0.3)
        score += popularity_score * 0.30

        return score

    # Score and sort all products
    scored = [(p, relevance_score(p)) for p in products]
    scored.sort(key=lambda x: x[1], reverse=True)

    # Return top 10
    return [p for p, s in scored[:max_products]]
@app.get("/relevant-products/{brand_id}/{prime_index}")
def get_relevant(brand_id: str, prime_index: int = 0):
    prime_models = [
        {"name": "Primebook 2 Neo", "price": 19990, "ram": 6,  "storage": 128, "display": 11.6, "battery": 8},
        {"name": "Primebook 2 Pro", "price": 25990, "ram": 8,  "storage": 128, "display": 14.1, "battery": 14},
        {"name": "Primebook 2 Max", "price": 27990, "ram": 8,  "storage": 256, "display": 15.6, "battery": 12},
    ]

    if prime_index < 0 or prime_index >= len(prime_models):
        return {"error": "Invalid prime index"}

    prime = prime_models[prime_index]
    products = get_relevant_products(brand_id, prime)

    return {
        "brand_id": brand_id,
        "primebook_model": prime["name"],
        "total": len(products),
        "products": products
    }