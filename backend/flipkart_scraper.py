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
    "primebook": {
        "name": "Primebook",
        "url": "https://www.flipkart.com/search?q=primebook+laptop&sort=popularity"
    },
}

MAX_PRICE_OVERRIDE = {}


def _fk_id(url: str) -> str:
    """Stable Flipkart product id (pid, else the itm id) so we track the same
    products run-to-run and keep price history continuous."""
    m = re.search(r'pid=([A-Z0-9]+)', url or "")
    if m:
        return m.group(1)
    m = re.search(r'/(itm[a-z0-9]+)', url or "")
    return m.group(1) if m else ""


def _load_flipkart_cache() -> dict:
    if os.path.exists(FLIPKART_CACHE):
        try:
            with open(FLIPKART_CACHE, "r", encoding="utf-8") as f:
                return json.loads(f.read().strip() or "{}")
        except Exception:
            pass
    return {}


def parse_specs_from_text(text, brand_name):
    product = {
        "name": "",
        "price_inr": 0,
        "processor": "Unknown",
        "ram_gb": 8,
        "storage_gb": 512,
        "display_inch": 15.6,
        "display_quality": "FHD",
        "battery_hours": 7,
        "webcam": "720p",
        "keyboard_backlit": False,
        "os": "Windows 11",
        "weight_kg": 1.7,
        "rating": 0.0,
        "reviews": 0,
        "brand": brand_name,
        "source": "Flipkart",
        "url": ""
    }

    text_lower = text.lower()

    # RAM + Storage from bracket pattern "(8 GB/512 GB SSD/Windows...)"
    bracket_match = re.search(r'\(?\s*(\d+)\s*gb\s*/\s*(\d+)\s*(gb|tb)\s*(?:ufs\s*)?(?:ssd|emmc|nvme|hdd)?', text_lower)
    if bracket_match:
        product["ram_gb"] = int(bracket_match.group(1))
        storage_val = int(bracket_match.group(2))
        if bracket_match.group(3) == "tb":
            storage_val *= 1024
        product["storage_gb"] = storage_val
    else:
        storage_match = re.search(r'(\d+)\s*(gb|tb)\s*(?:ufs\s*)?(?:ssd|emmc|nvme|storage|hdd)', text_lower)
        if storage_match:
            val = int(storage_match.group(1))
            if storage_match.group(2) == "tb":
                val *= 1024
            product["storage_gb"] = val

    display_match = re.search(r'(\d+\.?\d*)\s*(?:inch|cm)', text_lower)
    if display_match:
        val = float(display_match.group(1))
        if val > 20:
            val = round(val / 2.54, 1)
        if 10 <= val <= 18:
            product["display_inch"] = val

    if "primeos" in text_lower or "prime os" in text_lower or "android 15" in text_lower or "android" in text_lower:
        product["os"] = "PrimeOS 3.0 (Android 15)"
    elif "windows 11" in text_lower:
        product["os"] = "Windows 11"
    elif "windows 10" in text_lower:
        product["os"] = "Windows 10"
    elif "chrome" in text_lower:
        product["os"] = "ChromeOS"
    elif "dos" in text_lower:
        product["os"] = "DOS"

    # Comprehensive processor detection — order matters (specific → generic)
    processor_patterns = [
        # Intel Core (specific to generic)
        ("core ultra 7", "Core Ultra 7"),
        ("core ultra 5", "Core Ultra 5"),
        ("core i9", "Core i9"),
        ("core i7", "Core i7"),
        ("core i5", "Core i5"),
        ("core i3", "Core i3"),
        # AMD Ryzen
        ("ryzen 9", "Ryzen 9"),
        ("ryzen 7", "Ryzen 7"),
        ("ryzen 5", "Ryzen 5"),
        ("ryzen 3", "Ryzen 3"),
        # MediaTek — for Chromebooks and Android laptops
        ("kompanio 838", "MediaTek Kompanio 838"),
        ("kompanio 540", "MediaTek Kompanio 540"),
        ("kompanio 520", "MediaTek Kompanio 520"),
        ("kompanio", "MediaTek Kompanio"),
        ("helio g99", "MediaTek Helio G99"),
        ("helio", "MediaTek Helio"),
        ("mediatek", "MediaTek"),
        # Intel N-series (budget laptops)
        ("pentium silver n6000", "Pentium N6000"),
        ("pentium n6000", "Pentium N6000"),
        ("celeron n4500", "Celeron N4500"),
        ("celeron n4020", "Celeron N4020"),
        ("celeron n4120", "Celeron N4120"),
        ("celeron n100", "Celeron N100"),
        ("celeron n50", "Celeron N50"),
        ("intel n100", "Intel N100"),
        ("intel n50", "Intel N50"),
        ("intel n4500", "Celeron N4500"),
        # Generic Intel/AMD (last resort)
        ("celeron", "Celeron"),
        ("pentium", "Pentium"),
        ("athlon", "Athlon"),
        ("snapdragon", "Snapdragon"),
    ]
    for keyword, label in processor_patterns:
        if keyword in text_lower:
            product["processor"] = label
            break

    if "backlit" in text_lower:
        product["keyboard_backlit"] = True
        
    return product    


async def get_links_from_search(page, brand_id, brand_info):
    print(f"\n{'='*50}")
    print(f"BRAND: {brand_info['name']} — collecting links")
    print(f"{'='*50}")

    await page.goto(brand_info["url"], wait_until="domcontentloaded")
    await asyncio.sleep(4)

    for i in range(10):
        await page.evaluate(f"window.scrollTo(0, {i * 500})")
        await asyncio.sleep(0.4)
    await asyncio.sleep(2)

    cards = await page.locator("div[data-id]").all()
    print(f"Found {len(cards)} cards")

    items = []
    seen_names = set()

    for card in cards:
        try:
            text = await card.text_content()
            if not text or "Currently unavailable" in text:
                continue

            name_match = re.search(r'Add to Compare(.+?)(?:\d+\.\d+|\d+ Ratings)', text)
            if not name_match:
                continue
            name = name_match.group(1).strip()[:100]

            if brand_id == "primebook":
                if "primebook" not in name.lower():
                    continue
            elif brand_info["name"].lower() not in name.lower():
                continue

            if name in seen_names:
                continue

            href = ""
            try:
                link_elem = card.locator("a").first
                raw_href = await link_elem.get_attribute("href")
                if raw_href:
                    href = "https://www.flipkart.com" + raw_href if raw_href.startswith("/") else raw_href
            except:
                pass

            if not href:
                continue

            rating = 0.0
            rating_match = re.search(r'(\d+\.\d+)[\d,]+\s*Ratings', text)
            if not rating_match:
                rating_match = re.search(r'(\d+\.\d+)\s*\d+\s*Ratings', text)
            if rating_match:
                rating = float(rating_match.group(1))

            reviews = 0
            reviews_match = re.search(r'([\d,]+)\s*Ratings', text)
            if reviews_match:
                reviews = int(reviews_match.group(1).replace(",", ""))

            items.append({"name": name, "url": href, "text": text, "rating": rating, "reviews": reviews})
            seen_names.add(name)
        except:
            continue

    print(f"Collected {len(items)} candidate links")
    return items[:15]

async def get_price_from_product_page(page, url):
    """Returns tuple: (price, processor)"""
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(1.5)

        price = await page.evaluate("""
            () => {
                const all = document.querySelectorAll('div, span');
                let best = null;
                let bestSize = 0;
                for (const el of all) {
                    const text = el.textContent.trim();
                    if (/^\u20B9[\\d,]+$/.test(text)) {
                        const size = parseFloat(window.getComputedStyle(el).fontSize);
                        if (size > bestSize) {
                            bestSize = size;
                            best = text;
                        }
                    }
                }
                return best;
            }
        """)
        
        # Extract processor from targeted spec section ONLY
        # Flipkart specs table has rows like: "Processor Name: Intel Celeron"
        processor_text = await page.evaluate("""
            () => {
                // Look for spec table rows containing "processor" label
                const rows = document.querySelectorAll('tr, li, div');
                for (const row of rows) {
                    const text = row.textContent.toLowerCase();
                    // Match rows that START with "processor" — these are spec rows
                    if (text.startsWith('processor name') || 
                        text.startsWith('processor brand') ||
                        text.startsWith('processor variant') ||
                        text.startsWith('processor generation') ||
                        text.startsWith('processor')) {
                        // Return just this row's text, not the whole page
                        return row.textContent.substring(0, 200);
                    }
                }
                return '';
            }
        """)
        
        processor = ""
        if processor_text:
            proc_lower = processor_text.lower()
            processor_patterns = [
                ("core ultra 7", "Core Ultra 7"),
                ("core ultra 5", "Core Ultra 5"),
                ("core i9", "Core i9"),
                ("core i7", "Core i7"),
                ("core i5", "Core i5"),
                ("core i3", "Core i3"),
                ("ryzen 9", "Ryzen 9"),
                ("ryzen 7", "Ryzen 7"),
                ("ryzen 5", "Ryzen 5"),
                ("ryzen 3", "Ryzen 3"),
                ("kompanio 838", "MediaTek Kompanio 838"),
                ("kompanio 540", "MediaTek Kompanio 540"),
                ("kompanio 520", "MediaTek Kompanio 520"),
                ("kompanio", "MediaTek Kompanio"),
                ("helio g99", "MediaTek Helio G99"),
                ("helio", "MediaTek Helio"),
                ("pentium silver n6000", "Pentium N6000"),
                ("pentium n6000", "Pentium N6000"),
                ("celeron n4500", "Celeron N4500"),
                ("celeron n4020", "Celeron N4020"),
                ("celeron n4120", "Celeron N4120"),
                ("celeron n100", "Celeron N100"),
                ("celeron n50", "Celeron N50"),
                ("intel n100", "Intel N100"),
                ("intel n50", "Intel N50"),
                ("celeron", "Celeron"),
                ("pentium", "Pentium"),
                ("athlon", "Athlon"),
                ("snapdragon", "Snapdragon"),
                ("mediatek", "MediaTek"),
            ]
            for keyword, label in processor_patterns:
                if keyword in proc_lower:
                    processor = label
                    break

        price_val = 0
        if price:
            digits = re.sub(r'[^\d]', '', price)
            if digits:
                price_val = int(digits)
        
        return price_val, processor
    except Exception as e:
        print(f"    DEBUG: exception = {e}")
    return 0, ""


async def scrape_brand(page, brand_id, brand_info, prev_list=None):
    prev_list = prev_list or []
    today = datetime.now().strftime("%Y-%m-%d")
    max_price = MAX_PRICE_OVERRIDE.get(brand_id, 40000)

    discovered = await get_links_from_search(page, brand_id, brand_info)
    disc_by_id = {}
    for it in discovered:
        pid = _fk_id(it["url"]) or it["name"]
        disc_by_id.setdefault(pid, it)

    prev_by_id = {}
    for p in prev_list:
        pid = _fk_id(p.get("url", "")) or p.get("name", "")
        if pid:
            prev_by_id[pid] = p

    # Targets: previously-tracked products first (always re-priced), then new discoveries.
    order, seen = [], set()
    for p in prev_list:
        pid = _fk_id(p.get("url", "")) or p.get("name", "")
        if pid and pid not in seen and p.get("url"):
            order.append(("prev", pid, p)); seen.add(pid)
    new_count = 0
    for pid, it in disc_by_id.items():
        if pid not in seen:
            order.append(("new", pid, it)); seen.add(pid); new_count += 1
    print(f"  Tracking {len(prev_list)} known + {new_count} newly discovered")

    products = []
    for i, (kind, pid, obj) in enumerate(order):
        url, name = obj.get("url"), obj.get("name", "")
        print(f"\n  [{i+1}/{len(order)}] {name[:50]}")
        price, page_processor = await get_price_from_product_page(page, url)
        prev = prev_by_id.get(pid)

        if price == 0 or price < 5000 or price > max_price:
            # Keep a tracked product's last-known record so its history line doesn't break.
            if prev:
                kept = dict(prev)
                kept["last_checked"] = today
                kept["available"] = False
                kept.setdefault("first_seen", today)
                products.append(kept)
                print(f"    [KEEP] retained last-known (current Rs.{price:,} out of range)")
            else:
                print(f"    Skipping — price Rs.{price:,} out of range")
            continue

        if kind == "new":
            product = parse_specs_from_text(obj.get("text", ""), brand_info["name"])
            product["rating"] = obj.get("rating", 0)
            product["reviews"] = obj.get("reviews", 0)
        else:
            product = dict(prev)   # reuse known specs; just refresh the price
        product["name"] = name
        product["url"] = url
        product["price_inr"] = price
        if page_processor:
            product["processor"] = page_processor
        product["first_seen"]  = (prev or {}).get("first_seen") or today
        product["last_checked"] = today
        product["available"]   = True

        products.append(product)
        print(f"    [OK] Rs.{price:,} | {product.get('ram_gb')}GB | {product.get('storage_gb')}GB | {product.get('processor')} | {product.get('rating')} stars")

    # Sort by reviews for display order — NO truncation, so tracked products persist.
    products.sort(key=lambda x: x.get("reviews", 0), reverse=True)
    return products


async def scrape_flipkart():
    print("=== FLIPKART SCRAPER — PLAYWRIGHT (accurate price mode) ===")
    print("Visiting each product page for verified pricing\n")

    # Previously-tracked products — always re-scraped so price history stays continuous.
    prev_cache = _load_flipkart_cache()
    all_data = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=(os.environ.get("SCRAPE_HEADLESS", "0") == "1"),
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

        await page.goto("https://www.flipkart.com", wait_until="domcontentloaded")
        await asyncio.sleep(3)

        try:
            await page.click("button._2KpZ6l._2doB4z", timeout=3000)
        except:
            pass

        for brand_id, brand_info in BRAND_URLS.items():
            prev_brand = prev_cache.get(brand_id) if isinstance(prev_cache.get(brand_id), dict) else {}
            prev_list = prev_brand.get("products", []) if prev_brand else []
            products = await scrape_brand(page, brand_id, brand_info, prev_list)
            all_data[brand_id] = {
                "name": brand_info["name"],
                "products": products,
                "total": len(products)
            }
            print(f"\n[DONE] {brand_info['name']}: {len(products)} products!")
            await asyncio.sleep(2)

        await browser.close()

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