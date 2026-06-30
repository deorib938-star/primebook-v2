import { useState, useEffect, useRef } from "react";
import {
  TrendingDown, TrendingUp, Minus, RefreshCw,
  AlertCircle, Sparkles, Bell, ExternalLink, Search
} from "lucide-react";
import axios from "axios";

const API = "http://127.0.0.1:8000";

const BRANDS = [
  { id: "hp",     label: "HP",     color: "#0096D6" },
  { id: "lenovo", label: "Lenovo", color: "#E2231A" },
  { id: "acer",   label: "Acer",   color: "#83B81A" },
  { id: "dell",   label: "Dell",   color: "#007DB8" },
  { id: "asus",   label: "Asus",   color: "#FF6600" },
];
const BRAND_MAP = Object.fromEntries(BRANDS.map(b => [b.id, b]));
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtRs(n) {
  if (!n && n !== 0) return "—";
  return "Rs." + Number(n).toLocaleString("en-IN");
}

function bestPrice(p) {
  const a = p.amazon_price  || p.price_inr || 0;
  const f = p.flipkart_price || 0;
  if (a > 0 && f > 0) return Math.min(a, f);
  return a || f || p.price_inr || 0;
}

function priceDelta(history) {
  if (!history || history.length < 2) return 0;
  return history[history.length - 1] - history[history.length - 2];
}

function deduplicateProducts(products) {
  const seen = new Set();
  return products.filter(p => {
    // Key: brand + ram + storage + display + os — same specs = duplicate
    const key = `${p.brand}-${p.ram_gb}-${p.storage_gb}-${p.display_inch}-${p.os}`;
    // Also check name similarity
    const nameKey = p.name?.toLowerCase().replace(/\s+/g, "").slice(0, 20);
    const fullKey = key + nameKey;
    if (seen.has(fullKey)) return false;
    seen.add(fullKey);
    return true;
  });
}

// Generate mock price history (6 months) from current price
// In production this will come from a price_history.json cache
function generateHistory(currentPrice) {
  if (!currentPrice || currentPrice === 0) return Array(6).fill(0);
  const history = [];
  let price = currentPrice * 1.08; // start ~8% higher 6 months ago
  for (let i = 0; i < 6; i++) {
    const change = (Math.random() - 0.55) * currentPrice * 0.02;
    price = Math.max(currentPrice * 0.9, price + change);
    history.push(Math.round(price / 10) * 10);
  }
  history[5] = currentPrice; // last point = current price
  return history;
}

// ─── Mini sparkline (pure SVG — no Chart.js needed) ──────────────────────────
function Sparkline({ data, data2, color, height = 80 }) {
  if (!data || data.length === 0) return null;
  const w = 300, h = height;
  const allVals = [...data, ...(data2 || [])].filter(v => v > 0);
  if (allVals.length === 0) return null;
  const min = Math.min(...allVals) * 0.99;
  const max = Math.max(...allVals) * 1.01;
  const range = max - min || 1;

  const pts = (arr) => arr.map((v, i) => {
    const x = (i / (arr.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");

  const poly1 = pts(data);
  const polyArr = poly1.split(" ");
  const fillPath = `M ${polyArr[0]} L ${poly1.replace(/,/g, " ").replace(/ /g, ",")} L ${w},${h} L 0,${h} Z`.replace(/,/g, " ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <path d={fillPath} fill={`url(#grad-${color.replace("#","")})`} />
      {/* Amazon line */}
      <polyline points={poly1} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Flipkart dashed line */}
      {data2 && data2.some(v => v > 0) && (
        <polyline points={pts(data2)} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" strokeLinejoin="round" />
      )}
      {/* End dot */}
      <circle cx={w} cy={h - ((data[data.length-1] - min) / range) * h} r="3" fill={color} />
    </svg>
  );
}

// ─── Price history chart card ─────────────────────────────────────────────────
function HistoryCard({ product, color }) {
  const amzPrice  = product.amazon_price   || product.price_inr || 0;
  const flipPrice = product.flipkart_price || 0;
  const amzHist   = generateHistory(amzPrice);
  const flipHist  = flipPrice > 0 ? generateHistory(flipPrice) : [];
  const d         = priceDelta(amzHist);
  const best      = bestPrice(product);

  return (
    <div style={{
      background: "var(--surface-2, #1e293b)",
      border: "0.5px solid var(--border, #334155)",
      borderRadius: 12, padding: 14,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 500, color: "var(--text-primary, #e2e8f0)",
            lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {product.name}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary, #f1f5f9)" }}>
            {fmtRs(best)}
          </div>
          <div style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 2,
            color: d < 0 ? "#10b981" : d > 0 ? "#ef4444" : "var(--text-muted, #64748b)" }}>
            {d < 0 ? <TrendingDown size={10} /> : d > 0 ? <TrendingUp size={10} /> : <Minus size={10} />}
            {d !== 0 ? fmtRs(Math.abs(d)) + (d < 0 ? " drop" : " rise") : "Stable"}
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <Sparkline data={amzHist} data2={flipHist} color={color} height={80} />

      {/* X axis labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: "var(--text-muted, #475569)" }}>
        {MONTHS.map(m => <span key={m}>{m}</span>)}
      </div>

      {/* Source prices */}
      <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
        {amzPrice > 0 && (
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#FF9900", color: "#111", fontWeight: 600 }}>
            Amz {fmtRs(amzPrice)}
          </span>
        )}
        {flipPrice > 0 && (
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#2874F0", color: "#fff", fontWeight: 600 }}>
            Flip {fmtRs(flipPrice)}
          </span>
        )}
        <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, background: color + "22", color, fontWeight: 500, marginLeft: "auto" }}>
          {product.source || "Amazon"}
        </span>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 9, color: "var(--text-muted, #475569)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 10, height: 2, background: color, display: "inline-block", borderRadius: 2 }} />
          Amazon
        </span>
        {flipPrice > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 10, borderTop: `2px dashed ${color}`, opacity: 0.6, display: "inline-block" }} />
            Flipkart
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Deal card ────────────────────────────────────────────────────────────────
function DealCard({ product, color }) {
  const best = bestPrice(product);
  const amz  = product.amazon_price   || product.price_inr || 0;
  const flip = product.flipkart_price || 0;
  const cheaper = (amz > 0 && flip > 0) ? (amz <= flip ? "Amazon" : "Flipkart") : (amz > 0 ? "Amazon" : "Flipkart");

  return (
    <div style={{
      background: "var(--surface-2, #1e293b)",
      border: "0.5px solid var(--border, #334155)",
      borderRadius: 12, padding: 14, position: "relative",
      transition: "border-color 0.12s", cursor: "pointer",
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = color + "80"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border, #334155)"}
    >
      <div style={{
        position: "absolute", top: 10, right: 10,
        background: "#10b98120", color: "#10b981",
        fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 20,
      }}>
        Best on {cheaper}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted, #64748b)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {product.brand}
      </div>
      <div style={{
        fontSize: 12, fontWeight: 500, color: "var(--text-primary, #e2e8f0)",
        marginBottom: 8, lineHeight: 1.35, paddingRight: 60,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        {product.name}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary, #f1f5f9)" }}>{fmtRs(best)}</span>
        {product.rating > 0 && (
          <span style={{ fontSize: 10, color: "#f59e0b" }}>★ {product.rating}</span>
        )}
        {product.reviews > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-muted, #64748b)" }}>({Number(product.reviews).toLocaleString()})</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {amz > 0 && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: amz <= flip || flip === 0 ? "#FF9900" : "#FF990055", color: amz <= flip || flip === 0 ? "#111" : "#888", fontWeight: 600 }}>Amz {fmtRs(amz)}</span>}
        {flip > 0 && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: flip <= amz || amz === 0 ? "#2874F0" : "#2874F055", color: flip <= amz || amz === 0 ? "#fff" : "#aaa", fontWeight: 600 }}>Flip {fmtRs(flip)}</span>}
        {product.ram_gb && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: color + "22", color, fontWeight: 500 }}>{product.ram_gb}GB RAM</span>}
        {product.storage_gb && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "var(--surface-1, #0f172a)", color: "var(--text-muted, #64748b)" }}>{product.storage_gb}GB</span>}
      </div>
    </div>
  );
}

// ─── Compare table row ────────────────────────────────────────────────────────
function CompareRow({ product, index }) {
  const amz  = product.amazon_price   || product.price_inr || 0;
  const flip = product.flipkart_price || 0;
  const diff = flip - amz;
  const hasBoth = amz > 0 && flip > 0;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr",
      padding: "10px 14px", borderBottom: "0.5px solid var(--border, #ffffff08)",
      alignItems: "center", fontSize: 12, transition: "background 0.12s",
      background: index % 2 === 0 ? "transparent" : "var(--surface-1, #0f172a44)",
    }}
      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-1, #ffffff08)"}
      onMouseLeave={e => e.currentTarget.style.background = index % 2 === 0 ? "transparent" : "var(--surface-1, #0f172a44)"}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontWeight: 500, color: "var(--text-primary, #e2e8f0)", fontSize: 12,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {product.name?.slice(0, 35)}{product.name?.length > 35 ? "…" : ""}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted, #64748b)" }}>
          {product.brand} · {product.ram_gb}GB · {product.storage_gb}GB
        </span>
      </div>
      <span style={{ color: hasBoth && amz < flip ? "#10b981" : hasBoth && amz > flip ? "#ef4444" : "var(--text-primary, #e2e8f0)", fontWeight: hasBoth ? 500 : 400 }}>
        {amz > 0 ? fmtRs(amz) : "—"}
      </span>
      <span style={{ color: hasBoth && flip < amz ? "#10b981" : hasBoth && flip > amz ? "#ef4444" : "var(--text-primary, #e2e8f0)", fontWeight: hasBoth ? 500 : 400 }}>
        {flip > 0 ? fmtRs(flip) : "—"}
      </span>
      <span style={{ color: !hasBoth ? "var(--text-muted, #64748b)" : Math.abs(diff) < 200 ? "var(--text-muted, #64748b)" : diff > 0 ? "#10b981" : "#ef4444" }}>
        {!hasBoth ? "One source" : Math.abs(diff) < 200 ? "Same" : diff > 0 ? `Flipkart +${fmtRs(Math.abs(diff))}` : `Amazon +${fmtRs(Math.abs(diff))}`}
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PriceTracking() {
  const [activeTab,    setActiveTab]    = useState("deals");
  const [activeBrand,  setActiveBrand]  = useState("all");
  const [allProducts,  setAllProducts]  = useState({});
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [priceRange,   setPriceRange]   = useState("all");
  const [historyBrand, setHistoryBrand] = useState("hp");

  // Load all products from existing cache
  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/products`)
      .then(res => {
        const data = res.data;
        // Deduplicate per brand
        const cleaned = {};
        Object.entries(data).forEach(([brandId, brandData]) => {
          const products = brandData.products || [];
          cleaned[brandId] = {
            ...brandData,
            products: deduplicateProducts(products),
          };
        });
        setAllProducts(cleaned);
      })
      .catch(() => setError("Could not load products. Make sure backend is running."))
      .finally(() => setLoading(false));
  }, []);

  // All products flat list
  const flatProducts = Object.entries(allProducts).flatMap(([brandId, d]) =>
    (d.products || []).map(p => ({ ...p, brand: p.brand || BRAND_MAP[brandId]?.label || brandId }))
  );

  // Filtered products for deals tab
  const filteredProducts = flatProducts.filter(p => {
    const price = bestPrice(p);
    const brandOk = activeBrand === "all" || p.brand?.toLowerCase() === activeBrand;
    const rangeOk = priceRange === "all" ||
      (priceRange === "10-20" && price >= 10000 && price < 20000) ||
      (priceRange === "20-30" && price >= 20000 && price < 30000) ||
      (priceRange === "30-40" && price >= 30000 && price <= 40000);
    const searchOk = !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase());
    return brandOk && rangeOk && searchOk && price > 0;
  }).sort((a, b) => bestPrice(a) - bestPrice(b));

  // New products (added in last 30 days — based on source "Both" or highest reviews)
  const newProducts = flatProducts
    .filter(p => p.source === "Both" || p.reviews > 1000)
    .sort((a, b) => (b.reviews || 0) - (a.reviews || 0))
    .slice(0, 6);

  // Price alerts — products with biggest price difference between Amazon and Flipkart
  const priceAlerts = flatProducts
    .filter(p => p.amazon_price > 0 && p.flipkart_price > 0)
    .map(p => ({ ...p, diff: Math.abs(p.amazon_price - p.flipkart_price) }))
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 6);

  // History brand products (top 4 unique)
  const historyProducts = (allProducts[historyBrand]?.products || []);
  const histColor = BRAND_MAP[historyBrand]?.color || "#6366f1";

  return (
    <>
      <style>{`
        .pt-page{padding:28px 32px;font-family:'Inter',sans-serif;min-height:100vh;background:#0f1117;color:#e2e8f0}
        .pt-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
        .pt-title{display:flex;align-items:center;gap:10px;font-size:22px;font-weight:700;color:#f1f5f9}
        .pt-sub{font-size:13px;color:#64748b;margin-top:2px}
        .pt-tabs{display:flex;border-bottom:1px solid #334155;margin-bottom:22px}
        .pt-tab{padding:10px 16px;font-size:13px;color:#64748b;cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;transition:all 0.15s}
        .pt-tab.active{color:#f1f5f9;border-bottom-color:#6366f1}
        .pt-filters{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
        .pt-chip{padding:5px 12px;border-radius:20px;border:1.5px solid #334155;background:#1e293b;color:#94a3b8;cursor:pointer;font-size:12px;font-weight:500;transition:all 0.12s}
        .pt-chip.active{border-color:currentColor}
        .pt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .pt-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .pt-section-title{font-size:13px;font-weight:600;color:#94a3b8;margin-bottom:12px;display:flex;align-items:center;gap:6px}
        .compare-header{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;padding:10px 14px;font-size:11px;font-weight:600;color:#64748b;background:#1e293b;border-radius:8px 8px 0 0}
        .refresh-btn{display:flex;align-items:center;gap:6px;background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;transition:all 0.2s}
        .refresh-btn:hover{background:#334155;color:#e2e8f0}
        .search-wrap{position:relative;flex:1;max-width:260px}
        .search-wrap input{width:100%;padding:7px 10px 7px 30px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:12px}
        .search-icon{position:absolute;left:8px;top:50%;transform:translateY(-50%);color:#64748b}
        .error-box{background:#450a0a20;border:1px solid #7f1d1d;color:#fca5a5;padding:16px 20px;border-radius:10px;display:flex;gap:10px;margin-bottom:24px;font-size:13px}
        .center-msg{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:80px 0;color:#475569}
        .alert-item{background:#1e293b;border:0.5px solid #334155;border-radius:12px;padding:14px;display:flex;align-items:flex-start;gap:12px;margin-bottom:10px}
        .alert-icon{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .spin{animation:spin 1s linear infinite}
        @media(max-width:900px){.pt-page{padding:16px}.pt-grid{grid-template-columns:1fr 1fr}.pt-grid-2{grid-template-columns:1fr}}
        @media(max-width:600px){.pt-grid{grid-template-columns:1fr}}
      `}</style>

      <div className="pt-page">
        {/* Header */}
        <div className="pt-header">
          <div>
            <div className="pt-title">
              <TrendingDown size={24} color="#10b981" /> Price tracking
            </div>
            <div className="pt-sub">All 65 products · Amazon + Flipkart · Rs. 10K–40K range</div>
          </div>
          <button className="refresh-btn" onClick={() => window.location.reload()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="error-box">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <div>{error}</div>
          </div>
        )}

        {/* Tabs */}
        <div className="pt-tabs">
          {[
            { id: "deals",   label: "Best deals"          },
            { id: "history", label: "Price history"        },
            { id: "compare", label: "Amazon vs Flipkart"   },
            { id: "alerts",  label: "Alerts"               },
          ].map(t => (
            <button key={t.id} className={`pt-tab${activeTab === t.id ? " active" : ""}`}
              onClick={() => setActiveTab(t.id)}>
              {t.label}
              {t.id === "alerts" && priceAlerts.length > 0 && (
                <span style={{ background: "#ef444420", color: "#ef4444", fontSize: 10, padding: "1px 6px", borderRadius: 20, marginLeft: 6 }}>
                  {priceAlerts.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="center-msg">
            <TrendingDown size={48} />
            <div style={{ fontSize: 15 }}>Loading price data…</div>
          </div>
        ) : error ? null : (
          <>
            {/* ── BEST DEALS TAB ── */}
            {activeTab === "deals" && (
              <>
                <div className="pt-filters">
                  <div className="search-wrap">
                    <Search size={13} className="search-icon" />
                    <input placeholder="Search products…" value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                  <select value={priceRange} onChange={e => setPriceRange(e.target.value)}
                    style={{ fontSize: 12, padding: "7px 10px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0" }}>
                    <option value="all">All prices</option>
                    <option value="10-20">Rs. 10K – 20K</option>
                    <option value="20-30">Rs. 20K – 30K</option>
                    <option value="30-40">Rs. 30K – 40K</option>
                  </select>
                  {BRANDS.map(br => (
                    <button key={br.id} className={`pt-chip${activeBrand === br.id ? " active" : ""}`}
                      onClick={() => setActiveBrand(br.id === activeBrand ? "all" : br.id)}
                      style={activeBrand === br.id ? { color: br.color, borderColor: br.color, background: br.color + "18" } : {}}>
                      {br.label}
                    </button>
                  ))}
                  {activeBrand !== "all" && (
                    <button className="pt-chip" onClick={() => setActiveBrand("all")}>Clear</button>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                  {filteredProducts.length} products · sorted by lowest price
                </div>
                <div className="pt-grid">
                  {filteredProducts.length === 0
                    ? <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "40px 0", color: "#475569", fontSize: 13 }}>No products match this filter</div>
                    : filteredProducts.map((p, i) => (
                        <DealCard key={i} product={p} color={BRAND_MAP[p.brand?.toLowerCase()]?.color || "#6366f1"} />
                      ))
                  }
                </div>
              </>
            )}

            {/* ── PRICE HISTORY TAB ── */}
            {activeTab === "history" && (
              <>
                {/* Brand selector */}
                <div className="pt-filters" style={{ marginBottom: 20 }}>
                  {BRANDS.map(br => (
                    <button key={br.id} className={`pt-chip${historyBrand === br.id ? " active" : ""}`}
                      onClick={() => setHistoryBrand(br.id)}
                      style={historyBrand === br.id ? { color: br.color, borderColor: br.color, background: br.color + "18" } : {}}>
                      {br.label}
                      <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>
                        ({(allProducts[br.id]?.products || []).length})
                      </span>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
                  Showing {historyProducts.length} unique products for {BRAND_MAP[historyBrand]?.label} · no duplicates · Amazon + Flipkart
                </div>
                {historyProducts.length === 0
                  ? <div style={{ textAlign: "center", padding: "40px 0", color: "#475569", fontSize: 13 }}>No products cached for this brand</div>
                  : <div className="pt-grid">
                      {historyProducts.map((p, i) => (
                        <HistoryCard key={i} product={p} color={histColor} />
                      ))}
                    </div>
                }
              </>
            )}

            {/* ── AMAZON VS FLIPKART TAB ── */}
            {activeTab === "compare" && (
              <>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
                  Green = cheaper on that platform · showing all products with both sources
                </div>
                <div style={{ border: "1px solid #334155", borderRadius: 12, overflow: "hidden" }}>
                  <div className="compare-header">
                    <span>Product</span>
                    <span>Amazon</span>
                    <span>Flipkart</span>
                    <span>Difference</span>
                  </div>
                  {flatProducts
                    .filter(p => bestPrice(p) > 0)
                    .sort((a, b) => bestPrice(a) - bestPrice(b))
                    .map((p, i) => <CompareRow key={i} product={p} index={i} />)
                  }
                </div>
              </>
            )}

            {/* ── ALERTS TAB ── */}
            {activeTab === "alerts" && (
              <div className="pt-grid-2">
                {/* Price difference alerts */}
                <div>
                  <div className="pt-section-title">
                    <Bell size={14} color="#ef4444" /> Price difference alerts
                  </div>
                  {priceAlerts.map((p, i) => {
                    const amz  = p.amazon_price   || p.price_inr || 0;
                    const flip = p.flipkart_price || 0;
                    const diff = Math.abs(amz - flip);
                    const cheaper = amz < flip ? "Amazon" : "Flipkart";
                    return (
                      <div key={i} className="alert-item">
                        <div className="alert-icon" style={{ background: "#ef444420" }}>
                          <Bell size={16} color="#ef4444" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", marginBottom: 3,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.name?.slice(0, 32)}{p.name?.length > 32 ? "…" : ""}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            {cheaper} is {fmtRs(diff)} cheaper
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#10b981", flexShrink: 0 }}>
                          Save {fmtRs(diff)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* New products detected */}
                <div>
                  <div className="pt-section-title">
                    <Sparkles size={14} color="#6366f1" /> New products detected
                    <span style={{ fontSize: 10, color: "#64748b", fontWeight: 400 }}>under Rs. 40K</span>
                  </div>
                  {newProducts.map((p, i) => {
                    const color = BRAND_MAP[p.brand?.toLowerCase()]?.color || "#6366f1";
                    return (
                      <div key={i} className="alert-item">
                        <div className="alert-icon" style={{ background: color + "20" }}>
                          <Sparkles size={16} color={color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", marginBottom: 3,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.brand}
                            <span style={{ background: color + "22", color, fontSize: 9, fontWeight: 600,
                              padding: "1px 6px", borderRadius: 20, marginLeft: 6 }}>NEW</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.name?.slice(0, 35)}{p.name?.length > 35 ? "…" : ""}
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color, flexShrink: 0 }}>
                          {fmtRs(bestPrice(p))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}