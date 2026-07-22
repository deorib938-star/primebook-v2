# ================================
# ALL LAPTOP BRANDS IN INDIA
# Price Range: Rs. 10,000 - Rs. 40,000
# ================================

competitors = {
    "hp": {
        "name": "HP",
        "market_share": "30%",
        "price_range": "Rs. 10,000 - Rs. 40,000",
        "os": ["Windows 11", "ChromeOS"],
        "website": "https://www.hp.com/in-en",
        "social": {
            "instagram": "hpindia",
            "twitter": "HPIndia",
            "linkedin": "hp",
            "facebook": "HPIndia",
        },
        "youtube_channel": "HP",
        "news_keywords": ["HP laptop India 2026", "HP 15s India", "HP Chromebook India"],
        "popular_models": ["HP 15s eq2144au", "HP Chromebook 15a", "HP 15s fy5004TU"],
    },
    "lenovo": {
        "name": "Lenovo",
        "market_share": "20%",
        "price_range": "Rs. 10,000 - Rs. 40,000",
        "os": ["Windows 11", "ChromeOS"],
        "website": "https://www.lenovo.com/in/en",
        "social": {
            "instagram": "lenovoindia",
            "twitter": "Lenovo_in",
            "linkedin": "lenovo",
            "facebook": "LenovoIndia",
        },
        "youtube_channel": "Lenovo India",
        "news_keywords": ["Lenovo laptop India 2026", "Lenovo IdeaPad India", "Lenovo Chromebook India"],
        "popular_models": ["Lenovo IdeaPad Slim 3", "Lenovo Chromebook Duet", "Lenovo V15 G4"],
    },
    "acer": {
        "name": "Acer",
        "market_share": "15%",
        "price_range": "Rs. 10,000 - Rs. 40,000",
        "os": ["Windows 11", "ChromeOS"],
        "website": "https://www.acer.com/in-en",
        "social": {
            "instagram": "acerindia",
            "twitter": "Acer",
            "linkedin": "acer",
            "facebook": "AcerIndia",
        },
        "youtube_channel": "Acer India",
        "news_keywords": ["Acer laptop India 2026", "Acer Aspire India", "Acer Chromebook India"],
        "popular_models": ["Acer Aspire 3", "Acer Aspire Lite", "Acer Chromebook Plus"],
    },
    "dell": {
        "name": "Dell",
        "market_share": "10%",
        "price_range": "Rs. 10,000 - Rs. 40,000",
        "os": ["Windows 11"],
        "website": "https://www.dell.com/en-in",
        "social": {
            "instagram": "dellindia",
            "twitter": "Dell",
            "linkedin": "dell",
            "facebook": "DellIndia",
        },
        "youtube_channel": "Dell India",
        "news_keywords": ["Dell laptop India 2026", "Dell Inspiron India", "Dell Vostro India"],
        "popular_models": ["Dell Inspiron 3530", "Dell Vostro 3430"],
    },
    "asus": {
        "name": "Asus",
        "market_share": "8%",
        "price_range": "Rs. 10,000 - Rs. 40,000",
        "os": ["Windows 11", "ChromeOS"],
        "website": "https://www.asus.com/in",
        "social": {
            "instagram": "asus_india",
            "twitter": "ASUSIndia",
            "linkedin": "asus",
            "facebook": "ASUSIndia",
        },
        "youtube_channel": "ASUS India",
        "news_keywords": ["Asus laptop India 2026", "Asus Vivobook India", "Asus Chromebook India"],
        "popular_models": ["Asus Vivobook 15", "Asus Chromebook CX1405", "Asus Chromebook CX15"],
    },
}   
# Our product
primebook = {
    "name": "Primebook",
    "twitter": "primebookindia",
    "models": [
        {"name": "Primebook 2 Neo", "price": 19990, "ram": 6,  "storage": 128, "display": 11.6, "battery": 8,  "webcam": "1080p"},
        {"name": "Primebook 2 Pro", "price": 25990, "ram": 8,  "storage": 128, "display": 14.1, "battery": 14, "webcam": "1440p"},
        {"name": "Primebook 2 Max", "price": 27990, "ram": 8,  "storage": 256, "display": 15.6, "battery": 12, "webcam": "1440p"},
    ],
    "os": "PrimeOS 3.0 (Android 15)",
    "processor": "MediaTek Helio G99 MT8781 Octa Core",
}

if __name__ == "__main__":
    print(f"Total competitors: {len(competitors)}")
    for k, v in competitors.items():
        print(f"  {v['name']} — {v['price_range']}")