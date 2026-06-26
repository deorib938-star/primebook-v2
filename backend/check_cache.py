import json

with open('flipkart_cache.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print('Last updated:', data.get('last_updated'))
for brand, info in data.items():
    if isinstance(info, dict) and 'products' in info:
        print(f"{info['name']}: {info['total']} products")