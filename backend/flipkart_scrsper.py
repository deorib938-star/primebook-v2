import asyncio
import re
import json
import os
import sys
from datetime import datetime
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding='utf-8')

FLIPKART_CACHE = "flipkart_cache.json"

BRAND_URLS = {
    "hp": {
        "name": "HP",
        "url": "https://www.flipkart.com/laptops/hp~brand/pr?sid=6bo,b5g&p%5B%5D=facets.brand%255B%255D%3DHP&p%5B%5D=facets.price_range.from%3D5000&p%5B%5D=facets.price_range.to%3D40000&sort=popularity"
    },
    "lenovo": {
        "name": "Lenovo",
        "url": "https://www.flipkart.com/laptops/lenovo~brand/pr?sid=6bo,b5g&p%5B%5D=facets.brand%255B%255D%3DLenovo&p%5B%5D=facets.price_range.from%3D5000&p%5B%5D=facets.price_range.to%3D40000&sort=popularity"
    },
    "acer": {
        "name": "Acer",
        "url": "https://www.flipkart.com/laptops/acer~brand/pr?sid=6bo,b5g&p%5B%5D=facets.brand%255B%255D%3DAcer&p%5B%5D=facets.price_range.from%3D5000&p%5B%5D=facets.price_range.to%3D40000&sort=popularity"
    },
    "dell": {
        "name": "Dell",
        "url": "https://www.flipkart.com/search?q=dell+laptop&sort=popularity&p%5B%5D=facets.brand%255B%255D%3DDell&p%5B%5D=facets.price_range.from%3D5000&p%5B%5D=facets.price_range.to%3D40000"
    },
    "asus": {
        "name": "Asus",
        "url": "https://www.flipkart.com/laptops/asus~brand/pr?sid=6bo,b5g&p%5B%5D=facets.brand%255B%255D%3DASUS&p%5B%5D=facets.price_range.from%3D5000&p%5B%5D=facets.price_range.to%3D40000&sort=popularity"
    },
}

def parse_card_text(text, brand_name):
    product = {
        "name": "", "price_inr": 0,
        "processor": "Unknown", "ram_gb": 8,
        "storage_gb": 512, "display_inch": 15.6,
        "display_quality": "FHD", "battery_hours": 7,
        "webcam": "720p", "keyboard_backlit": False,
        "os": "Windows 11", "weight_kg": 1.7,
        "rating": 0.0, "reviews": 0,
        "brand": brand_name, "source": "Flipkart"
    }

    # Skip unavailable
    if "Currently unavailable" in text:
        return None

    # Name
    name_match = re.search(r'Add to Compare(.+?)(?:\d+\.\d+|\d+ Ratings)', text)
    if name_match:
        product["name"] = name_match.group(1).strip()[:100]

    # Filter wrong brand products (remove sponsored ads)
    if product["name"]:
        if brand_name.lower() not in product["name"].lower():
            return None

    # Price
    prices = re.findall(r'[₹Rs\.]+\s*([\d,]+)', text)
    for p in prices:
        val = int(p.replace(",", ""))
        if 5000 <= val <= 40000:
            product["price_inr"] = val
            break

    if product["price_inr"] == 0:
        return None

    # Rating — fixed regex
    rating_match = re.search(r'(\d+\.\d+)[\d,]+\s*Ratings', text)
    if not rating_match:
        rating_match = re.search(r'(\d+\.\d+)\s*\d+\s*Ratings', text)
    if rating_match:
        product["rating"] = float(rating_match.group(1))

    # Reviews
    reviews_match = re.search(r'([\d,]+)\s*Ratings', text)
    if reviews_match:
        product["reviews"] = int(reviews_match.group(1).replace(",", ""))

    text_lower = text.lower()

    # RAM
    ram_match = re.search(r'(\d+)\s*gb\s*(?:ddr|lpddr|ram)', text_lower)
    if ram_match:
        product["ram_gb"] = int(ram_match.group(1))

    # Storage
    storage_match = re.search(r'(\d+)\s*gb\s*(?:ssd|emmc|hdd)', text_lower)
    if storage_match:
        product["storage_gb"] = int(storage_match.group(1))

    # Display
    display_match = re.search(r'(\d+\.?\d*)\s*(?:inch|cm)', text_lower)
    if display_match:
        val = float(display_match.group(1))
        if val > 20:
            val = round(val / 2.54, 1)
        if 10 <= val <= 18:
            product["display_inch"] = val

    # OS
    if "windows 11" in text_lower:
        product["os"] = "Windows 11"
    elif "windows 10" in text_lower:
        product["os"] = "Windows 10"
    elif "chrome" in text_lower:
        product["os"] = "ChromeOS"
    elif "dos" in text_lower:
        product["os"] = "DOS"

    # Processor
    for proc in ["core ultra 7", "core ultra 5", "core i9", "core i7", "core i5", "core i3", "ryzen 9", "ryzen 7", "ryzen 5", "ryzen 3", "celeron", "athlon", "pentium"]:
        if proc in text_lower:
            product["processor"] = proc.title()
            break

    # Backlit
    if "backlit" in text_lower:
        product["keyboard_backlit"] = True

    return product

async def scrape_brand(page, brand_id, brand_info):
    print(f"\n{'='*50}")
    print(f"BRAND: {brand_info['name']}")
    print(f"{'='*50}")

    await page.goto(brand_info["url"], wait_until="domcontentloaded")
    await asyncio.sleep(4)

    # Scroll to load all products
    for i in range(10):
        await page.evaluate(f"window.scrollTo(0, {i * 500})")
        await asyncio.sleep(0.4)
    await asyncio.sleep(2)

    # Get all product cards
    cards = await page.locator("div[data-id]").all()
    print(f"Found {len(cards)} cards")

    products = []
    seen_names = set()

    for card in cards:
        try:
            text = await card.text_content()
            if not text:
                continue

            product = parse_card_text(text, brand_info["name"])
            if product and product["name"] and product["name"] not in seen_names:
                products.append(product)
                seen_names.add(product["name"])
                print(f"  [OK] {product['name'][:50]}")
                print(f"       Rs.{product['price_inr']:,} | {product['ram_gb']}GB | {product['storage_gb']}GB | {product['rating']} stars")
        except:
            continue

    # Sort by reviews
    products.sort(key=lambda x: x["reviews"], reverse=True)
    return products[:10]

async def scrape_flipkart():
    print("=== FLIPKART SCRAPER — PLAYWRIGHT ===")
    print("Scraping top products per brand under Rs. 40,000\n")

    all_data = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
        )

        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            locale="en-IN",
        )

        page = await context.new_page()
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
        """)

        # Go to homepage first
        await page.goto("https://www.flipkart.com", wait_until="domcontentloaded")
        await asyncio.sleep(3)

        # Close popup
        try:
            await page.click("button._2KpZ6l._2doB4z", timeout=3000)
        except:
            pass

        # Scrape each brand
        for brand_id, brand_info in BRAND_URLS.items():
            products = await scrape_brand(page, brand_id, brand_info)
            all_data[brand_id] = {
                "name": brand_info["name"],
                "products": products,
                "total": len(products)
            }
            print(f"\n[DONE] {brand_info['name']}: {len(products)} products!")
            await asyncio.sleep(2)

        await browser.close()

    # Save cache
    all_data["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    with open(FLIPKART_CACHE, "w", encoding="utf-8") as f:
        json.dump(all_data, f, indent=4, ensure_ascii=False)

    print(f"\n{'='*50}")
    print("SCRAPING COMPLETE!")
    for bid, data in all_data.items():
        if isinstance(data, dict) and "products" in data:
            print(f"  {data['name']}: {data['total']} products")
    print(f"Saved to {FLIPKART_CACHE}")

asyncio.run(scrape_flipkart())