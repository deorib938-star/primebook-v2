# ================================
# PRIMEBOOK V2 - PRODUCT SCRAPER
# Source: Amazon only (Selenium)
# Cache: 30 days
# ================================

import time
import re
import json
import os
from datetime import datetime
from matplotlib import text
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By

CACHE_FILE = "amazon_cache.json"

BRAND_URLS = {
    "hp":        {"name": "HP",       "url": "https://www.amazon.in/s?k=HP+laptop&rh=n%3A1375424031%2Cp_89%3AHP%2Cp_36%3A-4000000&s=review-rank"},
    "lenovo":    {"name": "Lenovo",   "url": "https://www.amazon.in/s?k=Lenovo+laptop&rh=n%3A1375424031%2Cp_89%3ALenovo%2Cp_36%3A-4000000&s=review-rank"},
    "acer":      {"name": "Acer",     "url": "https://www.amazon.in/s?k=Acer+laptop&rh=n%3A1375424031%2Cp_89%3AAcer%2Cp_36%3A-4000000&s=review-rank"},
    "dell":      {"name": "Dell",     "url": "https://www.amazon.in/s?k=Dell+laptop&rh=n%3A1375424031%2Cp_89%3ADell%2Cp_36%3A-4000000&s=review-rank"},
    "asus":      {"name": "Asus",     "url": "https://www.amazon.in/s?k=Asus+laptop&rh=n%3A1375424031%2Cp_89%3AASUS%2Cp_36%3A-4000000&s=review-rank"},
    "primebook": {"name": "Primebook","url": "https://www.amazon.in/s?k=Primebook+laptop&s=review-rank"},
}

def _asin(url: str) -> str:
    """Stable Amazon product id from a URL (the ASIN in /dp/XXXX). Used to track the
    same products run-to-run so price history stays continuous."""
    m = re.search(r'/dp/([A-Z0-9]{8,})', url or "")
    return m.group(1) if m else ""

# ================================
# CACHE
# ================================

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
        except:
            pass
    return {}

def save_cache(data):
    data["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    print(f"Cache saved! Last updated: {data['last_updated']}")

def is_cache_valid():
    cache = load_cache()
    if not cache or "last_updated" not in cache:
        return False
    try:
        last = datetime.strptime(cache["last_updated"], "%Y-%m-%d %H:%M")
        days = (datetime.now() - last).days
        print(f"Cache age: {days} days old")
        return days < 30
    except:
        return False

# ================================
# BROWSER
# ================================

def create_driver():
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    # Headless during the scheduled job (SCRAPE_HEADLESS=1) so no window pops up;
    # visible for manual runs. Matches the Flipkart/Instagram Playwright scrapers.
    if os.environ.get("SCRAPE_HEADLESS", "0") == "1":
        options.add_argument("--headless=new")
    driver = uc.Chrome(options=options, version_main=149)
    return driver

# ================================
# GET LINKS FROM AMAZON SEARCH
# ================================

def get_amazon_links(driver, url, brand_name):
    print(f"  Getting {brand_name} links from Amazon...")
    driver.get(url)
    time.sleep(5)

    links = []
    try:
        # Working selector from our test
        elems = driver.find_elements(By.CSS_SELECTOR, "a.a-link-normal.s-underline-text")
        for e in elems:
            href = e.get_attribute("href")
            if href and "/dp/" in href:
                asin = re.search(r'/dp/([A-Z0-9]+)', href)
                if asin:
                    clean = f"https://www.amazon.in/dp/{asin.group(1)}"
                    if clean not in links:
                        links.append(clean)

        # Fallback selector
        if not links:
            elems = driver.find_elements(By.CSS_SELECTOR, "a[href*='/dp/']")
            for e in elems:
                href = e.get_attribute("href")
                if href and "/dp/" in href:
                    asin = re.search(r'/dp/([A-Z0-9]+)', href)
                    if asin:
                        clean = f"https://www.amazon.in/dp/{asin.group(1)}"
                        if clean not in links:
                            links.append(clean)

        print(f"  Found {len(links)} links")
    except Exception as e:
        print(f"  Error: {e}")

    return links[:10]

# ================================
# PARSE SPECS
# ================================

def parse_specs(product, text):
    text = text.lower()

    m = re.search(r'(\d+)\s*gb\s*(?:ram|lpddr|ddr|memory)', text)
    if m:
        product["ram_gb"] = int(m.group(1))

    m = re.search(r'(\d+)\s*(gb|tb)\s*(?:ufs\s*)?(?:ssd|emmc|nvme|storage|hdd)', text)
    if m:
        val = int(m.group(1))
        if m.group(2) == "tb":
            val *= 1024
        if val >= 32:
            product["storage_gb"] = val

    m = re.search(r'(\d+\.?\d*)\s*(?:inch|"|-inch)', text)
    if m:
        val = float(m.group(1))
        if 10 <= val <= 18:
            product["display_inch"] = val

    if "fhd" in text or "1920" in text or "full hd" in text:
        product["display_quality"] = "FHD"
    elif "qhd" in text or "2560" in text or "2k" in text:
        product["display_quality"] = "QHD"
    elif "hd" in text or "1366" in text:
        product["display_quality"] = "HD"

    m = re.search(r'(\d+)\s*(?:hours?|hr)\s*(?:battery|life)?', text)
    if m:
        hrs = int(m.group(1))
        if 3 <= hrs <= 24:
            product["battery_hours"] = hrs   

    if "1080p" in text and "camera" in text:
        product["webcam"] = "1080p"
    elif "720p" in text and "camera" in text:
        product["webcam"] = "720p"

    if "backlit" in text:
        product["keyboard_backlit"] = True

    if "primeos" in text or "prime os" in text or "android 15" in text or "android" in text:
        product["os"] = "PrimeOS 3.0 (Android 15)"
    elif "windows 11" in text:
        product["os"] = "Windows 11"
    elif "windows 10" in text:
        product["os"] = "Windows 10"
    elif "chrome" in text:
        product["os"] = "ChromeOS"
    elif "dos" in text:
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
        if keyword in text:
            product["processor"] = label
            break

    m = re.search(r'(\d+\.?\d*)\s*kg', text)
    if m:
        val = float(m.group(1))
        if 0.5 <= val <= 5:
            product["weight_kg"] = val

    return product

# ================================
# PRICE SANITY FILTER
# ================================

def filter_price_outliers(products, brand_name):
    """
    Remove products whose price is unrealistically low compared to peers.
    Rule: if a product costs less than 60% of the median price for products
    with the same RAM tier, flag it as suspicious and skip.
    """
    if len(products) < 3:
        return products  # not enough data to compare

    # Group by RAM tier since RAM is the strongest price signal
    from statistics import median
    ram_prices = {}
    for p in products:
        ram = p.get("ram_gb", 0)
        price = p.get("price_inr", 0)
        if ram > 0 and price > 0:
            ram_prices.setdefault(ram, []).append(price)

    # Calculate median per RAM tier
    ram_median = {ram: median(prices) for ram, prices in ram_prices.items() if len(prices) >= 2}

    filtered = []
    for p in products:
        ram = p.get("ram_gb", 0)
        price = p.get("price_inr", 0)

        if ram in ram_median:
            threshold = ram_median[ram] * 0.6  # 60% of median
            if price < threshold:
                print(f"  [PRICE OUTLIER] Skipping {p['name'][:50]} — Rs.{price:,} is below Rs.{int(threshold):,} (60% of Rs.{int(ram_median[ram]):,} median for {ram}GB)")
                continue

        filtered.append(p)

    if len(filtered) < len(products):
        print(f"  [FILTER] {brand_name}: removed {len(products) - len(filtered)} outlier price(s)")

    return filtered

# ================================
# SCRAPE SINGLE PRODUCT
# ================================

def scrape_product(driver, url, brand_name):
    try:
        driver.get(url)
        time.sleep(3)

        product = {
            "name": "", "price_inr": 0,
            "processor": "Unknown", "ram_gb": 8,
            "storage_gb": 512, "display_inch": 15.6,
            "display_quality": "FHD", "battery_hours": 7,
            "webcam": "720p", "keyboard_backlit": False,
            "os": "Windows 11", "weight_kg": 1.7,
            "rating": 0.0, "reviews": 0,
            "url": url, "brand": brand_name, "source": "Amazon"
        }

        # Name
        try:
            product["name"] = driver.find_element(By.ID, "productTitle").text.strip()[:100]
        except:
            pass

        # Skip products that don't actually match the brand (Primebook search picks up junk)
        if brand_name.lower() == "primebook" and "primebook" not in product["name"].lower():
            print(f"  Skipping — not a Primebook product: {product['name'][:50]}")
            return None

        # Price
        try:
            price_selectors = [
                "span.a-price-whole",
                "span.a-offscreen",
                "#priceblock_ourprice",
                "#priceblock_dealprice",
                "span.a-color-price",
            ]
            for sel in price_selectors:
                elems = driver.find_elements(By.CSS_SELECTOR, sel)
                for elem in elems:
                    txt = elem.text.replace(",", "").replace("₹", "").strip()
                    numbers = re.sub(r'[^\d]', '', txt)
                    if numbers and 5000 <= int(numbers) <= 40000:
                        product["price_inr"] = int(numbers)
                        break
                if product["price_inr"] > 0:
                    break
        except:
            pass

        MAX_PRICE_OVERRIDE = {}
        max_price = MAX_PRICE_OVERRIDE.get(brand_name.lower(), 40000)
        if product["price_inr"] == 0 or product["price_inr"] > max_price:
            print(f"  Skipping price Rs.{product['price_inr']:,}")
            return None

        # Rating
        try:
            elem = driver.find_element(By.CSS_SELECTOR, "span.a-icon-alt")
            m = re.search(r'(\d+\.?\d*)', elem.get_attribute("innerHTML"))
            if m:
                product["rating"] = float(m.group(1))
        except:
            pass

        # Reviews
        try:
            elem = driver.find_element(By.ID, "acrCustomerReviewText")
            m = re.search(r'(\d+)', elem.text.replace(",", ""))
            if m:
                product["reviews"] = int(m.group(1))
        except:
            pass

        # Bullet specs — used as FALLBACK only
        try:
            bullets = driver.find_elements(By.CSS_SELECTOR, "#feature-bullets li span.a-list-item")
            full_text = " ".join([b.text for b in bullets])
            print(f"  BULLETS: {full_text[:300]}")
            product = parse_specs(product, full_text)
        except Exception as e:
            print(f"  BULLET ERROR: {e}")

        # Specs table — AUTHORITATIVE source, overrides bullet-text guesses
        table_specs = {}
        try:
            rows = driver.find_elements(By.CSS_SELECTOR, "tr.a-spacing-small")
            for row in rows:
                try:
                    label = row.find_element(By.TAG_NAME, "td").text.lower().strip()
                    value = row.find_elements(By.TAG_NAME, "td")[1].text.lower().strip()
                    print(f"  TABLE: {label} = {value}")
                    table_specs[label] = value
                except:
                    pass
        except:
            pass

        # Apply table values — these are Amazon's own structured fields, trust them over regex
        if "hard disk size" in table_specs:
            m = re.search(r'(\d+\.?\d*)\s*(gb|tb)', table_specs["hard disk size"])
            if m:
                val = float(m.group(1))
                if m.group(2) == "tb":
                    val *= 1024
                if val >= 32:
                    product["storage_gb"] = int(val)

        if "ram memory installed size" in table_specs:
            m = re.search(r'(\d+)\s*gb', table_specs["ram memory installed size"])
            if m:
                product["ram_gb"] = int(m.group(1))

        if "screen size" in table_specs:
            m = re.search(r'(\d+\.?\d*)', table_specs["screen size"])
            if m:
                val = float(m.group(1))
                if val > 20:  # value given in cm, convert
                    val = round(val / 2.54, 1)
                if 10 <= val <= 18:
                    product["display_inch"] = val

        if "cpu model" in table_specs and table_specs["cpu model"]:
            product["processor"] = table_specs["cpu model"].title()

        if "operating system" in table_specs:
            os_val = table_specs["operating system"]
            if "primeos" in os_val or "prime os" in os_val or "android" in os_val:
                product["os"] = "PrimeOS 3.0 (Android 15)"
            elif "windows 11" in os_val:
                product["os"] = "Windows 11"
            elif "windows 10" in os_val:
                product["os"] = "Windows 10"
            elif "chrome" in os_val:
                product["os"] = "ChromeOS"
            elif "dos" in os_val:
                product["os"] = "DOS"

        print(f"  [OK] {product['name'][:50]}")
        return product

    except Exception as e:
        print(f"  Error: {e}")
        return None

# ================================
# FILTER PRICE OUTLIERS
# ================================

def filter_price_outliers(products, brand_name):
    if not products:
        return []

    prices = [p.get("price_inr", 0) for p in products if p.get("price_inr", 0) > 0]
    if not prices:
        return []

    avg_price = sum(prices) / len(prices)
    min_price = max(5000, int(avg_price * 0.5))

    filtered = []
    for product in products:
        price = product.get("price_inr", 0)
        if price >= min_price:
            filtered.append(product)
        else:
            print(f"  Filtered out low price Rs.{price:,} for {product.get('name', '')[:50]}")

    return filtered

# ================================
# SCRAPE ALL BRANDS
# ================================

def scrape_all(force=False):
    if not force and is_cache_valid():
        print("Cache is valid! Using cached data.")
        print("Run with force=True to update.")
        return load_cache()

    print("=== PRIMEBOOK PRODUCT SCRAPER ===")
    print("Amazon | Top 10 popular models | Under Rs.40,000")
    print("Cache valid for 30 days\n")

    # Previously-tracked products — we ALWAYS re-scrape these so their price history
    # stays continuous, even if they drop out of the search's top results this run.
    prev_cache = load_cache() or {}
    today = datetime.now().strftime("%Y-%m-%d")

    driver = create_driver()
    all_data = {}

    try:
        for brand_id, info in BRAND_URLS.items():
            print(f"\n{'='*50}")
            print(f"BRAND: {info['name']}")
            print(f"{'='*50}")

            prev_brand = prev_cache.get(brand_id) if isinstance(prev_cache.get(brand_id), dict) else {}
            prev_list  = prev_brand.get("products", []) if prev_brand else []
            prev_by_id = {}
            for p in prev_list:
                pid = _asin(p.get("url", "")) or p.get("name", "")
                if pid:
                    prev_by_id[pid] = p

            discovered = get_amazon_links(driver, info["url"], info["name"])

            # Scrape order: tracked products first (guaranteed), then any NEW discoveries.
            ordered_links, seen_ids = [], set()
            for p in prev_list:
                u = p.get("url", "")
                pid = _asin(u) or p.get("name", "")
                if u and pid and pid not in seen_ids:
                    ordered_links.append(u); seen_ids.add(pid)
            new_count = 0
            for u in discovered:
                pid = _asin(u)
                if pid and pid not in seen_ids:
                    ordered_links.append(u); seen_ids.add(pid); new_count += 1
            print(f"  Tracking {len(prev_list)} known + {new_count} newly discovered")

            products, done_ids = [], set()
            for i, link in enumerate(ordered_links):
                pid = _asin(link) or link
                print(f"\n  [{i+1}/{len(ordered_links)}] {pid}")
                p = scrape_product(driver, link, info["name"])
                if p and p.get("name"):
                    key = _asin(p.get("url", "")) or p["name"]
                    if key in done_ids:
                        continue
                    prev = prev_by_id.get(pid) or prev_by_id.get(p["name"])
                    p["first_seen"]  = (prev or {}).get("first_seen") or today
                    p["last_checked"] = today
                    p["available"]   = True
                    products.append(p); done_ids.add(key)
                else:
                    # A tracked product we couldn't fetch now (delisted/out of range):
                    # keep its last-known record so its history line doesn't break.
                    prev = prev_by_id.get(pid)
                    if prev and pid not in done_ids:
                        kept = dict(prev)
                        kept["last_checked"] = today
                        kept["available"]    = False
                        kept.setdefault("first_seen", today)
                        products.append(kept); done_ids.add(pid)
                        print(f"    [KEEP] retained last-known for tracked product")
                time.sleep(2)

            # Price sanity check — remove obviously wrong low prices
            # (deals, refurbished, EMI, or parse errors)
            products = filter_price_outliers(products, info["name"])

            # Sort by reviews (display order only — NO truncation, so tracked products persist)
            products.sort(key=lambda x: x.get("reviews", 0), reverse=True)

            all_data[brand_id] = {
                "name": info["name"],
                "products": products,
                "total": len(products)
            }
            print(f"\n[DONE] {info['name']}: {len(products)} products!")

    finally:
        try:
            driver.quit()
        except:
            pass

    save_cache(all_data)

    print("\n=== COMPLETE ===")
    for bid, data in all_data.items():
        if isinstance(data, dict) and "products" in data:
            print(f"  {data['name']}: {data['total']} products")

    return all_data

def cache_status():
    cache = load_cache()
    if not cache:
        print("No cache found!")
        return
    print(f"Last updated: {cache.get('last_updated', 'Unknown')}")
    print(f"Cache valid: {is_cache_valid()}")
    for bid, data in cache.items():
        if isinstance(data, dict) and "products" in data:
            print(f"  {data['name']}: {data['total']} products")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        if sys.argv[1] == "status":
            cache_status()
        elif sys.argv[1] == "force":
            scrape_all(force=True)
    else:
        scrape_all()