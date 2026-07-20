import { useState, useEffect, useMemo, useRef } from "react";
import {
  TrendingDown, RefreshCw, AlertCircle, Sparkles, Bell, SlidersHorizontal, X
} from "lucide-react";
import axios from "axios";
import {
  Chart as ChartJS, LineController, LineElement, PointElement, LinearScale, CategoryScale,
  Tooltip, Legend, Filler
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";

ChartJS.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler, zoomPlugin);

const API = (import.meta.env.VITE_API_URL || `http://${location.hostname}:8000`);

const BRANDS = [
  { id: "primebook", label: "Primebook", color: "#f59e0b", isOurs: true },
  { id: "hp",         label: "HP",       color: "#0096D6" },
  { id: "lenovo",     label: "Lenovo",   color: "#E2231A" },
  { id: "acer",       label: "Acer",     color: "#83B81A" },
  { id: "dell",       label: "Dell",     color: "#007DB8" },
  { id: "asus",       label: "Asus",     color: "#FF6600" },
];
const BRAND_MAP = Object.fromEntries(BRANDS.map(b => [b.id, b]));
const MODEL_COLORS = ["#818cf8", "#34d399", "#fbbf24", "#f472b6", "#38bdf8", "#a78bfa", "#fb923c", "#4ade80", "#f87171", "#22d3ee", "#c084fc", "#facc15"];

const PRICE_MIN = 0;
const PRICE_MAX = 60000;

function fmtRs(n) {
  if (!n || n <= 0) return null;
  return "Rs." + Number(n).toLocaleString("en-IN");
}

// Categorize processor into simple groups for filtering
function processorGroup(proc) {
  if (!proc) return "Others";
  const p = proc.toLowerCase();
  if (p.includes("core i") || p.includes("core ultra")) return "Intel Core";
  if (p.includes("ryzen")) return "AMD Ryzen";
  if (p.includes("celeron") || p.includes("pentium") || p.includes("athlon")) return "Celeron/Pentium";
  if (p.includes("mediatek") || p.includes("kompanio") || p.includes("helio")) return "MediaTek";
  return "Others";
}

function PriceTableRow({ row }) {
  const prices = [row.amazon, row.flipkart].filter(p => p > 0);
  const minP = prices.length > 0 ? Math.min(...prices) : 0;

  const Cell = ({ value, url }) => {
    if (!value || value <= 0) return <span style={{ fontSize: 11, color: "#475569" }}>Not available</span>;
    const isBest = value === minP;
    
    const content = (
      <span style={{ 
        fontWeight: isBest ? 600 : 500, 
        color: isBest ? "#10b981" : "#e2e8f0", 
        display: "inline-flex", 
        alignItems: "center", 
        gap: 4,
        padding: url ? "4px 8px" : "0",
        borderRadius: 6,
        transition: "background 0.15s",
        cursor: url ? "pointer" : "default",
      }}
      onMouseEnter={e => { if (url) e.currentTarget.style.background = isBest ? "rgba(16,185,129,0.1)" : "rgba(148,163,184,0.08)"; }}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        {fmtRs(value)} 
        {url && <span style={{ fontSize: 9, opacity: 0.5 }}>↗</span>}
      </span>
    );
    
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>{content}</a>
    ) : content;
  };

  let osColor = "#C9A84C";
  let osBg = "rgba(201,168,76,0.15)";
  let osLabel = row.os || "—";
  
  if (osLabel.toLowerCase().includes("windows")) {
    osColor = "#0096D6"; osBg = "rgba(0,150,214,0.15)";
  } else if (osLabel.toLowerCase().includes("chrome")) {
    osColor = "#83B81A"; osBg = "rgba(131,184,26,0.15)";
  } else if (osLabel.toLowerCase().includes("prime") || osLabel.toLowerCase().includes("android")) {
    osColor = "#C9A84C"; osBg = "rgba(201,168,76,0.15)";
  } else if (osLabel.toLowerCase().includes("dos") || osLabel.toLowerCase().includes("linux")) {
    osColor = "#94a3b8"; osBg = "rgba(148,163,184,0.15)";
  }

  return (
    <tr style={{
      background: row.is_our_brand ? "#f59e0b0c" : "transparent",
      borderBottom: "0.5px solid #334155",
      transition: "background 0.12s",
    }}
      onMouseEnter={e => e.currentTarget.style.background = row.is_our_brand ? "#f59e0b16" : "#1e293b"}
      onMouseLeave={e => e.currentTarget.style.background = row.is_our_brand ? "#f59e0b0c" : "transparent"}
    >
      <td style={{ padding: "12px 14px" }}>
        <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 13 }}>{row.name}</div>
      </td>
      <td style={{ padding: "12px 14px", color: "#94a3b8", fontSize: 12 }}>
        <span style={{ color: "white", fontWeight: 500 }}>{row.ram_gb || "—"}</span> GB
      </td>
      <td style={{ padding: "12px 14px", color: "#94a3b8", fontSize: 12 }}>
        <span style={{ color: "white", fontWeight: 500 }}>{row.storage_gb || "—"}</span> GB
      </td>
      <td style={{ padding: "12px 14px", color: "#94a3b8", fontSize: 12 }}>{row.processor || "—"}</td>
      <td style={{ padding: "12px 14px", color: "#94a3b8", fontSize: 12 }}>{row.battery_hours ? row.battery_hours + " hrs" : "—"}</td>
      <td style={{ padding: "12px 14px" }}>
        <span style={{ background: osBg, color: osColor, fontSize: 10, padding: "2px 7px", borderRadius: 3, fontWeight: 500 }}>{osLabel}</span>
      </td>
      <td style={{ padding: "12px 14px" }}><Cell value={row.amazon}   url={row.amazon_url} /></td>
      <td style={{ padding: "12px 14px" }}><Cell value={row.flipkart} url={row.flipkart_url} /></td>
    </tr>
  );
}

// ─── Filter sidebar ────────────────────────────────────────────────────────────
function FilterSidebar({ filters, setFilters, counts, onReset }) {
  const toggleSet = (key, value) => {
    setFilters(prev => {
      const set = new Set(prev[key]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, [key]: set };
    });
  };

  const Checkbox = ({ label, checked, onChange, count }) => (
    <label style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", cursor: "pointer", fontSize: 11, color: checked ? "white" : "#94a3b8" }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: "#C9A84C", cursor: "pointer", width: 12, height: 12 }} />
      {label} {count != null && <span style={{ color: "#64748b", fontSize: 9, marginLeft: 3 }}>({count})</span>}
    </label>
  );

  return (
    <div style={{ background: "#1e293b", padding: 12, borderRadius: 10, height: "fit-content", position: "sticky", top: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#C9A84C", fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", margin: 0, textTransform: "uppercase" }}>Filters</h3>
        <button onClick={onReset} style={{ color: "#ef4444", background: "transparent", border: "none", fontSize: 10, cursor: "pointer", padding: 0 }}>
          Reset
        </button>
      </div>

      <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "0.5px solid #334155" }}>
  <div style={{ color: "white", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Price (Rs)</div>
  <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
    <input
      type="number"
      placeholder="Min"
      value={filters.priceMin === 0 ? "" : filters.priceMin}
      onChange={e => {
        const val = e.target.value === "" ? 0 : Number(e.target.value);
        setFilters({ ...filters, priceMin: val });
      }}
      style={{ background: "#0f172a", border: "1px solid #334155", color: "white", padding: "3px 6px", borderRadius: 4, fontSize: 10, width: 65 }}
    />
    <span style={{ color: "#64748b", fontSize: 10 }}>to</span>
    <input
      type="number"
      placeholder="Max"
      value={filters.priceMax === 999999 ? "" : filters.priceMax}
      onChange={e => {
        const val = e.target.value === "" ? 999999 : Number(e.target.value);
        setFilters({ ...filters, priceMax: val });
      }}
      style={{ background: "#0f172a", border: "1px solid #334155", color: "white", padding: "3px 6px", borderRadius: 4, fontSize: 10, width: 65 }}
    />
  </div>
  <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
    {[
      { label: "Under 20K", min: 0, max: 20000 },
      { label: "20K-30K", min: 20000, max: 30000 },
      { label: "30K-40K", min: 30000, max: 40000 },
      { label: "All", min: 0, max: 999999 },
    ].map(preset => (
      <button
        key={preset.label}
        onClick={() => setFilters({ ...filters, priceMin: preset.min, priceMax: preset.max })}
        style={{
          background: "transparent",
          border: "1px solid #334155",
          color: "#94a3b8",
          fontSize: 9,
          padding: "2px 6px",
          borderRadius: 3,
          cursor: "pointer",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#334155"; e.currentTarget.style.color = "white"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
      >
        {preset.label}
      </button>
    ))}
  </div>
</div>

      <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "0.5px solid #334155" }}>
        <div style={{ color: "white", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Platform</div>
        <Checkbox label="On Amazon" checked={filters.platforms.has("amazon")} onChange={() => toggleSet("platforms", "amazon")} count={counts.platforms.amazon} />
        <Checkbox label="On Flipkart" checked={filters.platforms.has("flipkart")} onChange={() => toggleSet("platforms", "flipkart")} count={counts.platforms.flipkart} />
        <Checkbox label="Available on both" checked={filters.platforms.has("both")} onChange={() => toggleSet("platforms", "both")} count={counts.platforms.both} />
      </div>

      <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "0.5px solid #334155" }}>
        <div style={{ color: "white", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>RAM</div>
        {[4, 6, 8, 12, 16].map(v => (
          <Checkbox key={v} label={`${v} GB`} checked={filters.ram.has(v)} onChange={() => toggleSet("ram", v)} count={counts.ram[v]} />
        ))}
      </div>

      <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "0.5px solid #334155" }}>
        <div style={{ color: "white", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Storage</div>
        {[32, 64, 128, 256, 512].map(v => (
          <Checkbox key={v} label={`${v} GB`} checked={filters.storage.has(v)} onChange={() => toggleSet("storage", v)} count={counts.storage[v]} />
        ))}
      </div>

      <div>
        <div style={{ color: "white", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Processor</div>
        {["Intel Core", "AMD Ryzen", "Celeron/Pentium", "MediaTek", "Others"].map(v => (
          <Checkbox key={v} label={v} checked={filters.processor.has(v)} onChange={() => toggleSet("processor", v)} count={counts.processor[v]} />
        ))}
      </div>
    </div>
  );
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDateLabel(iso) {
  if (!iso || iso.indexOf("-") < 0) return iso || "";
  const p = iso.split("-");
  return `${parseInt(p[2], 10)} ${MONTH_ABBR[parseInt(p[1], 10) - 1]}`;
}

function InteractiveHistoryChart({ months, models, realFrom }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const [activeModel, setActiveModel] = useState(null);

  function toggleModel(i) { setActiveModel(prev => (prev === i ? null : i)); }

  const realIdx = realFrom ? months.indexOf(realFrom) : months.length - 1;

  useEffect(() => {
    if (!canvasRef.current || !months || months.length === 0) return;
    if (chartRef.current) chartRef.current.destroy();

    // Clean Y range: snap to 5,000 steps around the visible data so gridlines are tidy.
    const visible = models.filter((_, i) => activeModel === null || activeModel === i);
    const vals = visible.flatMap(m => m.history).filter(v => v != null && v > 0);
    let yMin = 10000, yMax = 40000;
    if (vals.length) {
      const lo = Math.min(...vals), hi = Math.max(...vals);
      yMin = Math.max(0, Math.floor((lo - 2500) / 5000) * 5000);
      yMax = Math.ceil((hi + 2500) / 5000) * 5000;
      if (yMax - yMin < 10000) yMax = yMin + 10000;
    }

    // Models with the SAME price would draw on top of each other and look like one
    // line. Fan overlapping series apart by a tiny amount so all are visible; the
    // real price is kept separately for tooltips/labels.
    const DODGE = 220;
    const shown = models.map(m => m.history.slice());
    for (let x = 0; x < months.length; x++) {
      const groups = {};
      models.forEach((m, i) => {
        const v = m.history[x];
        if (v != null) {
          const k = Math.round(v / 300) * 300;   // bucket near-equal prices together
          (groups[k] = groups[k] || []).push(i);
        }
      });
      Object.values(groups).forEach(idxs => {
        if (idxs.length > 1) {
          const mid = (idxs.length - 1) / 2;
          idxs.forEach((i, rank) => { shown[i][x] = models[i].history[x] + (rank - mid) * DODGE; });
        }
      });
    }

    const datasets = models.map((m, i) => {
      const color = MODEL_COLORS[i % MODEL_COLORS.length];
      const isActive = activeModel === null || activeModel === i;
      return {
        label: m.name, data: shown[i], _real: m.history,
        borderColor: isActive ? color : color + "22",
        backgroundColor: color + "22",
        pointBackgroundColor: isActive ? color : color + "22",
        pointBorderColor: "#141820", pointBorderWidth: 1.5,
        borderWidth: activeModel === i ? 3 : 2.25,
        pointRadius: ctx => (ctx.dataIndex >= realIdx && isActive ? 3.5 : 0),
        pointHoverRadius: 6, pointHitRadius: 14, tension: 0.25,
        fill: activeModel === i ? "start" : false,
        order: activeModel === i ? 0 : 1,
        // estimated portion (before first real point) is a light dashed line
        segment: { borderDash: ctx => (ctx.p0DataIndex >= realIdx ? undefined : [4, 4]) },
      };
    });

    try {
      chartRef.current = new ChartJS(canvasRef.current, {
        type: "line",
        data: { labels: months.map(fmtDateLabel), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          onClick: (evt, el, ci) => {
            const pts = ci.getElementsAtEventForMode(evt, "nearest", { intersect: false }, true);
            if (pts.length > 0) toggleModel(pts[0].datasetIndex);
          },
          onHover: (evt, el, ci) => {
            const pts = ci.getElementsAtEventForMode(evt, "nearest", { intersect: false }, true);
            if (evt.native?.target) evt.native.target.style.cursor = pts.length > 0 ? "pointer" : "default";
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#0f172a", borderColor: "#334155", borderWidth: 1, padding: 12,
              titleColor: "#e2e8f0", bodyColor: "#cbd5e1", titleFont: { size: 12 }, bodyFont: { size: 12 },
              boxPadding: 4, usePointStyle: true,
              callbacks: {
                title: items => months[items[0].dataIndex],
                label: c => {
                  const real = c.dataset._real?.[c.dataIndex];
                  return "  " + c.dataset.label + ": " + fmtRs(real != null ? real : c.raw);
                },
              },
            },
          },
          scales: {
            y: { min: yMin, max: yMax,
              ticks: { stepSize: 5000, callback: v => "₹" + (v / 1000).toFixed(0) + "K", font: { size: 12 }, color: "#94a3b8", padding: 6 },
              grid: { color: "rgba(148,163,184,0.10)" }, border: { display: false } },
            x: { ticks: { font: { size: 11 }, color: "#94a3b8", maxRotation: 0, autoSkip: true, maxTicksLimit: 6, padding: 6 },
              grid: { display: false }, border: { color: "#334155" } },
          },
        },
      });
    } catch (err) { console.error("Chart.js error:", err); }
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [months, models, activeModel, realIdx]);

  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
        Tap a model below to focus it · hover the chart for prices
      </div>
      <div style={{ position: "relative", width: "100%", height: 320 }}>
        <canvas ref={canvasRef} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {models.map((m, i) => {
          const color = MODEL_COLORS[i % MODEL_COLORS.length];
          const isActive = activeModel === i;
          const isDimmed = activeModel !== null && activeModel !== i;
          const hist = m.history.filter(v => v != null);
          const latest = hist[hist.length - 1], first = hist[0];
          const delta = (latest != null && first != null) ? latest - first : 0;
          return (
            <div key={m.name} onClick={() => toggleModel(i)} style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 11,
              color: isActive ? "#f1f5f9" : "#94a3b8",
              cursor: "pointer", padding: "5px 10px", borderRadius: 20,
              border: `1px solid ${isActive ? "#475569" : "transparent"}`,
              background: isActive ? "#1e293b" : "transparent",
              opacity: isDimmed ? 0.35 : 1,
              fontWeight: isActive ? 600 : 400, transition: "all 0.15s", userSelect: "none",
            }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
              {m.name}
              {latest != null && <span style={{ color: "#e2e8f0", fontWeight: 600 }}>· {fmtRs(latest)}</span>}
              {delta !== 0 && <span style={{ color: delta < 0 ? "#22c55e" : "#ef4444", fontSize: 10 }}>{delta < 0 ? "▼" : "▲"}{fmtRs(Math.abs(delta))?.replace("Rs.", "")}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AlertItem({ icon: Icon, iconColor, title, subtitle, rightText, rightColor, badge }) {
  return (
    <div style={{ background: "#1e293b", border: "0.5px solid #334155", borderRadius: 12, padding: 14, display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: iconColor + "20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} color={iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title} {badge}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: rightColor, flexShrink: 0 }}>{rightText}</div>
    </div>
  );
}

export default function PriceTracking() {
  const [activeTab,      setActiveTab]      = useState("table");
  const [selectedBrands, setSelectedBrands] = useState(new Set()); // empty = all
  const [historyBrand,   setHistoryBrand]   = useState("primebook");
  const [historyPlatform, setHistoryPlatform] = useState("flipkart");
  const [allRows,        setAllRows]        = useState([]);
  const [historyData,    setHistoryData]    = useState({ months: [], models: [] });
  const [loading,        setLoading]        = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error,          setError]          = useState(null);

  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [sortOrder,      setSortOrder]      = useState("price_asc");
  const [filters,        setFilters]        = useState({
    priceMin: 0, priceMax: 999999,
    platforms: new Set(),
    ram: new Set(),
    storage: new Set(),
    processor: new Set(),
  });

  // Fetch ALL products once, then filter client-side
  useEffect(() => {
    if (activeTab !== "table") return;
    setLoading(true);
    axios.get(`${API}/price/table`, { params: { brand: "all" } })
      .then(res => setAllRows(res.data.rows || []))
      .catch(() => setError("Could not load price table. Check backend is running."))
      .finally(() => setLoading(false));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "history") return;
    setHistoryLoading(true);
    axios.get(`${API}/price/history/${historyBrand}`, { params: { platform: historyPlatform } })
      .then(res => setHistoryData(res.data))
      .catch(() => setHistoryData({ months: [], models: [] }))
      .finally(() => setHistoryLoading(false));
  }, [activeTab, historyBrand, historyPlatform]);

  // Auto-pick the platform with more tracked models for the selected brand (once per brand).
  const platformAdjusted = useRef({});
  useEffect(() => {
    const pc = historyData.platform_counts;
    if (!pc || historyData.brand !== historyBrand || platformAdjusted.current[historyBrand]) return;
    platformAdjusted.current[historyBrand] = true;
    const richer = (pc.flipkart || 0) >= (pc.amazon || 0) ? "flipkart" : "amazon";
    if (richer !== historyPlatform) setHistoryPlatform(richer);
  }, [historyData, historyBrand]);

  // Client-side filtering + sorting
  const filteredRows = useMemo(() => {
    let rows = allRows;

    // Brand filter (empty = all). Primebook is always kept so it shows for every brand.
    if (selectedBrands.size > 0) {
      rows = rows.filter(r => r.is_our_brand || selectedBrands.has(r.brand?.toLowerCase()));
    }

    // Price range
    rows = rows.filter(r => {
      const price = r.best_price || r.amazon || r.flipkart || 0;
      return price >= filters.priceMin && price <= filters.priceMax;
    });

    // Platform
    if (filters.platforms.size > 0) {
      rows = rows.filter(r => {
        const onAmazon = r.amazon > 0;
        const onFlipkart = r.flipkart > 0;
        if (filters.platforms.has("both") && onAmazon && onFlipkart) return true;
        if (filters.platforms.has("amazon") && onAmazon) return true;
        if (filters.platforms.has("flipkart") && onFlipkart) return true;
        return false;
      });
    }

    // RAM
    if (filters.ram.size > 0) {
      rows = rows.filter(r => filters.ram.has(r.ram_gb));
    }

    // Storage
    if (filters.storage.size > 0) {
      rows = rows.filter(r => filters.storage.has(r.storage_gb));
    }

    // Processor group
    if (filters.processor.size > 0) {
      rows = rows.filter(r => filters.processor.has(processorGroup(r.processor)));
    }

    // Sort — Primebook always pinned to the top, then sorted by the chosen order within each group
    rows = [...rows].sort((a, b) => {
      if (a.is_our_brand && !b.is_our_brand) return -1;
      if (!a.is_our_brand && b.is_our_brand) return 1;
      const pa = a.best_price || a.amazon || a.flipkart || 999999;
      const pb = b.best_price || b.amazon || b.flipkart || 999999;
      return sortOrder === "price_asc" ? pa - pb : pb - pa;
    });

    return rows;
  }, [allRows, selectedBrands, filters, sortOrder]);

  // Counts for the sidebar (based on brand-selection only, so counts stay meaningful)
  const counts = useMemo(() => {
    let base = allRows;
    if (selectedBrands.size > 0) base = base.filter(r => selectedBrands.has(r.brand?.toLowerCase()));
    
    const c = {
      platforms: { amazon: 0, flipkart: 0, both: 0 },
      ram: {}, storage: {}, processor: {},
    };
    base.forEach(r => {
      if (r.amazon > 0) c.platforms.amazon++;
      if (r.flipkart > 0) c.platforms.flipkart++;
      if (r.amazon > 0 && r.flipkart > 0) c.platforms.both++;
      c.ram[r.ram_gb] = (c.ram[r.ram_gb] || 0) + 1;
      c.storage[r.storage_gb] = (c.storage[r.storage_gb] || 0) + 1;
      const g = processorGroup(r.processor);
      c.processor[g] = (c.processor[g] || 0) + 1;
    });
    return c;
  }, [allRows, selectedBrands]);

  // Active filter count for the badge
  const activeFilterCount = 
  (filters.priceMin > 0 || filters.priceMax < 999999 ? 1 : 0) +
  filters.platforms.size + filters.ram.size + filters.storage.size + filters.processor.size;
  function toggleBrand(brandId) {
    setSelectedBrands(prev => {
      const set = new Set(prev);
      if (set.has(brandId)) set.delete(brandId);
      else set.add(brandId);
      return set;
    });
  }

  function clearAllBrands() { setSelectedBrands(new Set()); }

  function resetFilters() {
    setFilters({
      priceMin: 0, priceMax: 999999,
      platforms: new Set(), ram: new Set(),
      storage: new Set(), processor: new Set(),
    });
  }

  const brandCounts = useMemo(() => {
    const c = {};
    allRows.forEach(r => { const b = r.brand?.toLowerCase(); c[b] = (c[b] || 0) + 1; });
    return c;
  }, [allRows]);

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
        .pt-chip{padding:5px 11px;border-radius:16px;border:1px solid #334155;background:transparent;color:#94a3b8;cursor:pointer;font-size:11px;font-weight:500;transition:all 0.15s;user-select:none}
        .pt-chip:hover{background:rgba(148,163,184,0.1);color:white}
        .pt-card{background:#1e293b;border:0.5px solid #334155;border-radius:12px;padding:18px}
        .pt-table{width:100%;border-collapse:collapse;font-size:13px}
        .pt-table th{text-align:left;padding:12px 14px;background:#0f172a;color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;white-space:nowrap}
        .refresh-btn{display:flex;align-items:center;gap:6px;background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;transition:all 0.2s}
        .refresh-btn:hover{background:#334155;color:#e2e8f0}
        .error-box{background:#450a0a20;border:1px solid #7f1d1d;color:#fca5a5;padding:16px 20px;border-radius:10px;display:flex;gap:10px;margin-bottom:24px;font-size:13px}
        .center-msg{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:80px 0;color:#475569}
        .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .section-title{font-size:13px;font-weight:600;color:#94a3b8;margin-bottom:12px;display:flex;align-items:center;gap:6px}
        .filter-btn{background:transparent;border:1px solid #334155;color:#94a3b8;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.15s}
        .filter-btn:hover{background:rgba(148,163,184,0.1);color:white;border-color:#C9A84C}
        .filter-btn.active{background:#C9A84C;color:#0f1117;border-color:#C9A84C}
        .filter-badge{background:rgba(255,255,255,0.25);color:inherit;font-size:10px;padding:1px 6px;border-radius:10px;font-weight:700}
        .sort-select{background:#0f172a;color:white;border:1px solid #334155;padding:5px 8px;border-radius:5px;font-size:11px;cursor:pointer}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .spin{animation:spin 1s linear infinite}
        @media(max-width:900px){.pt-page{padding:16px}.two-col{grid-template-columns:1fr}}
      `}</style>

      <div className="pt-page">
        <div className="pt-header">
          <div>
            <div className="pt-title"><TrendingDown size={24} color="#10b981" /> Price tracking</div>
            <div className="pt-sub">Primebook + HP + Lenovo + Acer + Dell + Asus · Amazon + Flipkart</div>
          </div>
          <button className="refresh-btn" onClick={() => window.location.reload()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {error && <div className="error-box"><AlertCircle size={16} /> <div>{error}</div></div>}

        <div className="pt-tabs">
          {[
            { id: "table",   label: "Price table"   },
            { id: "history", label: "Price history" },
          ].map(t => (
            <button key={t.id} className={`pt-tab${activeTab === t.id ? " active" : ""}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "table" && (
          <>
            {/* Top bar: filters button + brand chips + sort */}
            <div style={{ background: "#1e293b", padding: "12px 14px", borderRadius: 10, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button className={`filter-btn${sidebarOpen ? " active" : ""}`} onClick={() => setSidebarOpen(!sidebarOpen)}>
                  <SlidersHorizontal size={13} /> Filters
                  {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
                </button>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className="pt-chip"
                    onClick={clearAllBrands}
                    style={selectedBrands.size === 0 ? { background: "#C9A84C", color: "#0f1117", borderColor: "#C9A84C" } : { borderColor: "#C9A84C", color: "#C9A84C" }}>
                    All ({allRows.length})
                  </span>
                  {BRANDS.filter(br => !br.isOurs).map(br => {
                    const isActive = selectedBrands.has(br.id);
                    return (
                      <span key={br.id} className="pt-chip"
                        onClick={() => toggleBrand(br.id)}
                        style={isActive
                          ? { background: br.color, color: "#0f1117", borderColor: br.color }
                          : {}}>
                        {br.label} ({brandCounts[br.id] || 0})
                      </span>
                    );
                  })}
                  {selectedBrands.size > 0 && (
                    <span className="pt-chip" onClick={clearAllBrands}
                      style={{ color: "#ef4444", borderColor: "#ef4444", fontSize: 10 }}>
                      <X size={10} style={{ verticalAlign: "middle" }} /> Clear
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#64748b", fontSize: 11 }}>Sort:</span>
                <select className="sort-select" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                  <option value="price_asc">Price low → high</option>
                  <option value="price_desc">Price high → low</option>
                </select>
              </div>
            </div>

            {/* Layout: optional sidebar + table */}
            <div style={{ display: "grid", gridTemplateColumns: sidebarOpen ? "180px 1fr" : "1fr", gap: 14, transition: "all 0.2s" }}>
              {sidebarOpen && (
                <FilterSidebar filters={filters} setFilters={setFilters} counts={counts} onReset={resetFilters} />
              )}

              <div>
                <div style={{ color: "#64748b", fontSize: 11, marginBottom: 8 }}>
                  Showing <span style={{ color: "white", fontWeight: 600 }}>{filteredRows.length}</span> of {allRows.length} products
                </div>

                {loading ? (
                  <div className="center-msg"><TrendingDown size={40} /><div style={{ fontSize: 14 }}>Loading price table…</div></div>
                ) : (
                  <div className="pt-card" style={{ padding: 0, overflow: "hidden auto" }}>
                    <div style={{ overflowX: "auto" }}>
                      <table className="pt-table">
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th>RAM</th>
                            <th>Storage</th>
                            <th>Processor</th>
                            <th>Battery</th>
                            <th>OS</th>
                            <th>Amazon</th>
                            <th>Flipkart</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRows.length === 0
                            ? <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "#475569" }}>No products match your filters</td></tr>
                            : filteredRows.map((row, i) => <PriceTableRow key={i} row={row} />)
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === "history" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {BRANDS.map(br => (
                <button key={br.id} className="pt-chip" onClick={() => setHistoryBrand(br.id)}
                  style={historyBrand === br.id ? { color: br.color, borderColor: br.color, background: br.color + "18" } : { borderColor: br.isOurs ? br.color + "80" : "#334155", color: br.isOurs ? br.color : "#94a3b8" }}>
                  {br.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>Platform:</span>
              {[{ id: "amazon", label: "Amazon" }, { id: "flipkart", label: "Flipkart" }].map(p => (
                <button key={p.id} className="pt-chip" onClick={() => { platformAdjusted.current[historyBrand] = true; setHistoryPlatform(p.id); }}
                  style={historyPlatform === p.id ? { background: "#C9A84C", color: "#0f1117", borderColor: "#C9A84C" } : {}}>
                  {p.label}
                </button>
              ))}
            </div>
            {(historyData.estimated_history || historyData.collecting) && (
              <div style={{ background: "rgba(201,168,76,0.06)", border: "1px solid #C9A84C", borderRadius: 10, padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Sparkles size={16} color="#C9A84C" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5 }}>
                  <b style={{ color: "#C9A84C" }}>{historyData.estimated_history ? "Estimated history." : "Real price tracking has started."}</b> {historyData.message} New real prices append weekly.
                </div>
              </div>
            )}
            <div className="pt-card">
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#f1f5f9" }}>{BRAND_MAP[historyBrand]?.label} — top models</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Price over time{historyData.dates?.length ? ` · ${historyData.dates.length} tracked snapshot${historyData.dates.length > 1 ? "s" : ""}` : ""}
                </div>
              </div>
              {historyLoading ? (
                <div className="center-msg" style={{ padding: 40 }}><RefreshCw size={24} className="spin" /></div>
              ) : historyData.models.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "#475569", fontSize: 13 }}>No price history yet — run the refresh job to capture the first snapshot.</div>
              ) : (
                <InteractiveHistoryChart months={historyData.months} models={historyData.models} realFrom={historyData.real_from} />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}