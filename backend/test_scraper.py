import requests
from bs4 import BeautifulSoup
import re
import time

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate",
}

session = requests.Session()
session.headers.update(HEADERS)

url = "https://www.amazon.in/s?k=HP+laptop+under+40000&s=review-rank"
print(f"Fetching: {url[:60]}")

r = session.get(url, timeout=15)
print(f"Status: {r.status_code}")
print(f"Encoding: {r.encoding}")

# Fix encoding
r.encoding = "utf-8"
soup = BeautifulSoup(r.text, "lxml")

title = soup.select_one("title")
print(f"Title: {title.text[:80] if title else 'No title'}")

# Try selectors
selectors = [
    "a.a-link-normal.s-underline-text",
    "a[href*='/dp/']",
    "div[data-asin]",
    "span.a-price-whole",
    "h2 a",
    "div.s-result-item",
]
print("\nSelectors:")
for sel in selectors:
    elems = soup.select(sel)
    print(f"  [{sel}]: {len(elems)}")
    if elems and "dp" in sel:
        for e in elems[:3]:
            href = e.get("href", "")
            if "/dp/" in href:
                print(f"    -> {href[:60]}")

# Save HTML for inspection
with open("amazon_debug.html", "w", encoding="utf-8") as f:
    f.write(r.text)
print("\nSaved HTML to amazon_debug.html")