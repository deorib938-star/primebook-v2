from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from competitor_registry import competitors, primebook
import json
import os

app = FastAPI(title="Primebook Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================================
# LOAD CACHE
# ================================

def load_cache():
    cache_file = "product_cache.json"
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {}

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
    return load_cache()

@app.get("/products/{brand_id}")
def get_brand_products(brand_id: str):
    cache = load_cache()
    if brand_id in cache:
        return cache[brand_id]
    return {"error": "Brand not found"}

@app.get("/cache/status")
def cache_status():
    cache = load_cache()
    status = {}
    for key, val in cache.items():
        if isinstance(val, dict) and "products" in val:
            status[key] = {
                "name": val["name"],
                "total": val["total"]
            }
    return {
        "last_updated": cache.get("last_updated", "Never"),
        "brands": status
    }