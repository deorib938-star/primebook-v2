import json

with open(r'C:\Users\Asus\OneDrive\Desktop\primebook_v2\backend\product_cache.json', 'r', encoding='utf-8') as f:
    amazon = json.load(f)

with open(r'C:\Users\Asus\OneDrive\Desktop\primebook_v2\backend\flipkart_cache.json', 'r', encoding='utf-8') as f:
    flipkart = json.load(f)

for brand in ['hp', 'lenovo', 'acer', 'asus']:
    print(f'\n=== {brand.upper()} ===')
    print('Amazon:')
    for p in amazon.get(brand, {}).get('products', []):
        print(f'  A: {p["name"][:60]}')
    print('Flipkart:')
    for p in flipkart.get(brand, {}).get('products', []):
        print(f'  F: {p["name"][:60]}')