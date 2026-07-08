import json

with open("amazon_cache.json") as f:
    amazon = json.load(f)
with open("flipkart_cache.json") as f:
    flipkart = json.load(f)

for p in amazon.get("primebook", {}).get("products", []):
    print("AMAZON:", p.get("name"), "| price:", p.get("price_inr"))

for p in flipkart.get("primebook", {}).get("products", []):
    print("FLIPKART:", p.get("name"), "| price:", p.get("price_inr"))
