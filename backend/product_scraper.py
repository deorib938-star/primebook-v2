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
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By

CACHE_FILE = "product_cache.json"

BRAND_URLS = {
    "hp":     {"name": "HP",     "url": "https://www.amazon.in/s?k=HP+laptop&rh=n%3A1375424031%2Cp_89%3AHP%2Cp_36%3A-4000000&s=review-rank"},
    "lenovo": {"name": "Lenovo", "url": "https://www.amazon.in/s?k=Lenovo+laptop&rh=n%3A1375424031%2Cp_89%3ALenovo%2Cp_36%3A-4000000&s=review-rank"},
    "acer":   {"name": "Acer",   "url": "https://www.amazon.in/s?k=Acer+laptop&rh=n%3A1375424031%2Cp_89%3AAcer%2Cp_36%3A-4000000&s=review-rank"},
    "dell":   {"name": "Dell",   "url": "https://www.amazon.in/s?k=Dell+laptop&rh=n%3A1375424031%2Cp_89%3ADell%2Cp_36%3A-4000000&s=review-rank"},
    "asus":   {"name": "Asus",   "url": "https://www.amazon.in/s?k=Asus+laptop&rh=n%3A1375424031%2Cp_89%3AASUS%2Cp_36%3A-4000000&s=review-rank"},
}

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

    m = re.search(r'(\d+)\s*(gb|tb)\s*(?:ssd|emmc|nvme|storage|hdd)', text)
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

    if "windows 11" in text:
        product["os"] = "Windows 11"
    elif "windows 10" in text:
        product["os"] = "Windows 10"
    elif "chrome" in text:
        product["os"] = "ChromeOS"
    elif "dos" in text:
        product["os"] = "DOS"

    for proc in ["core ultra 7", "core ultra 5", "core i9", "core i7", "core i5", "core i3", "ryzen 9", "ryzen 7", "ryzen 5", "ryzen 3", "celeron", "pentium"]:
        if proc in text:
            product["processor"] = proc.title()
            break

    m = re.search(r'(\d+\.?\d*)\s*kg', text)
    if m:
        val = float(m.group(1))
        if 0.5 <= val <= 5:
            product["weight_kg"] = val

    return product

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

        if product["price_inr"] == 0 or product["price_inr"] > 40000:
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

        # Bullet specs
        try:
            bullets = driver.find_elements(By.CSS_SELECTOR, "#feature-bullets li span.a-list-item")
            full_text = " ".join([b.text for b in bullets])
            print(f"  BULLETS: {full_text[:300]}")
            product = parse_specs(product, full_text)
        except Exception as e:
            print(f"  BULLET ERROR: {e}")

        # Also try specs table
        try:
            rows = driver.find_elements(By.CSS_SELECTOR, "tr.a-spacing-small")
            for row in rows:
                try:
                    label = row.find_element(By.TAG_NAME, "td").text.lower()
                    value = row.find_elements(By.TAG_NAME, "td")[1].text.lower()
                    print(f"  TABLE: {label} = {value}")
                except:
                    pass
        except:
            pass

        print(f"  [OK] {product['name'][:50]}")
        print(f"       Rs.{product['price_inr']:,} | {product['ram_gb']}GB RAM | {product['storage_gb']}GB | {product['display_inch']}\" | {product['rating']} stars ({product['reviews']} reviews)")
        return product

    except Exception as e:
        print(f"  Error: {e}")
        return None

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

    driver = create_driver()
    all_data = {}

    try:
        for brand_id, info in BRAND_URLS.items():
            print(f"\n{'='*50}")
            print(f"BRAND: {info['name']}")
            print(f"{'='*50}")

            links = get_amazon_links(driver, info["url"], info["name"])
            products = []
            seen = set()

            for i, link in enumerate(links):
                print(f"\n  [{i+1}/{len(links)}]")
                p = scrape_product(driver, link, info["name"])
                if p and p["name"] and p["name"] not in seen:
                    products.append(p)
                    seen.add(p["name"])
                time.sleep(2)

            # Sort by reviews
            products.sort(key=lambda x: x["reviews"], reverse=True)
            products = products[:10]

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