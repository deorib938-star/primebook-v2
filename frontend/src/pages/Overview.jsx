import { useState, useEffect } from "react"

const API = (import.meta.env.VITE_API_URL || `http://${location.hostname}:8000`)

// ─── Design tokens ────────────────────────────────────────────────────────────
const GOLD      = "#C9A84C"
const CARD      = "#1C2333"
const BORDER    = "#2a3347"
const MUTED     = "#4a5568"
const TEXT      = "#94a3b8"
const OOR_BG    = "rgba(99,102,241,0.07)"
const OOR_BORDER= "#6366f1"

// ─── Primebook official models (order must match backend PRIME_MODELS) ─────────
const officialModels = [
  {
    key: "neo", name: "Primebook 2 Neo", price: 19990, ram: 6, storage: 128,
    display: 11.6, battery: 8, webcam: "1080p", backlit: true,
    os: "PrimeOS 3.0 (Android 15)", processor: "MediaTek Helio G99",
    priceRangeMin: 10000, priceRangeMax: 25000,
  },
  {
    key: "pro", name: "Primebook 2 Pro", price: 25990, ram: 8, storage: 128,
    display: 14.1, battery: 14, webcam: "1440p", backlit: true,
    os: "PrimeOS 3.0 (Android 15)", processor: "MediaTek Helio G99",
    priceRangeMin: 20000, priceRangeMax: 30000,
  },
  {
    key: "max", name: "Primebook 2 Max", price: 27990, ram: 8, storage: 256,
    display: 15.6, battery: 12, webcam: "1440p", backlit: true,
    os: "PrimeOS 3.0 (Android 15)", processor: "MediaTek Helio G99",
    priceRangeMin: 25000, priceRangeMax: 40000,
  },
]

// ─── Processor ranking (budget segment, higher tier = stronger CPU) ────────────
function processorTier(p) {
  if (!p) return 2
  const s = p.toLowerCase()
  if (/ryzen 7|core i7|core ultra/.test(s))      return 7
  if (/ryzen 5|core i5/.test(s))                 return 6
  if (/ryzen 3|core i3/.test(s))                 return 5
  if (/intel n|\bn\d{2,3}\b/.test(s))            return 4   // N100 / N50 / N200 / N305
  if (/helio g99|kompanio|helio|snapdragon/.test(s)) return 3
  if (/mt8\d{2,3}|athlon|mediatek/.test(s))      return 2
  if (/celeron|pentium/.test(s))                 return 1
  return 2
}

// ─── Per-spec comparison — single source of truth for weights + scoring ────────
// Each spec knows how to display itself and how a Primebook model scores against a
// competitor. eval() returns { pts, outcome } where outcome ∈ 'win' | 'equal' | 'loss'.
// Total weight = 10.  Price 3 · Processor 2 · RAM 2 · Storage 1 · Battery 1 · Display 0.5 · OS 0.3 · Webcam 0.1 · Keyboard 0.1
const WEBCAM_RANK = { "720p": 1, "1080p": 2, "1440p": 3 }

const COMP_SPECS = [
  {
    key: "price", label: "Price", weight: 3, wLabel: "3pts", wColor: GOLD,
    primeVal: m => `Rs. ${m.price.toLocaleString()}`,
    compVal:  c => `Rs. ${(c.price_inr || 0).toLocaleString()}`,
    primeStyle: { color: GOLD, fontFamily: "monospace", fontWeight: "700" },
    eval: (m, c) => ({
      pts: m.price <= c.price_inr ? 3 : m.price <= c.price_inr * 1.15 ? 2 : m.price <= c.price_inr * 1.3 ? 1 : 0,
      outcome: m.price < c.price_inr ? "win" : m.price === c.price_inr ? "equal" : "loss",
    }),
  },
  {
    key: "processor", label: "Processor", weight: 2, wLabel: "2pts", wColor: GOLD,
    primeVal: m => m.processor,
    compVal:  c => c.processor || "—",
    eval: (m, c) => {
      const a = processorTier(m.processor), b = processorTier(c.processor)
      return { pts: a > b ? 2 : a === b ? 1 : 0, outcome: a > b ? "win" : a === b ? "equal" : "loss" }
    },
  },
  {
    key: "ram", label: "RAM", weight: 2, wLabel: "2pts", wColor: GOLD,
    primeVal: m => `${m.ram} GB`,
    compVal:  c => `${c.ram_gb} GB`,
    eval: (m, c) => ({ pts: m.ram > c.ram_gb ? 2 : m.ram === c.ram_gb ? 1 : 0, outcome: m.ram > c.ram_gb ? "win" : m.ram === c.ram_gb ? "equal" : "loss" }),
  },
  {
    key: "storage", label: "Storage", weight: 1, wLabel: "1pt", wColor: "#60a5fa",
    primeVal: m => `${m.storage} GB`,
    compVal:  c => `${c.storage_gb} GB`,
    eval: (m, c) => ({ pts: m.storage > c.storage_gb ? 1 : m.storage === c.storage_gb ? 0.5 : 0, outcome: m.storage > c.storage_gb ? "win" : m.storage === c.storage_gb ? "equal" : "loss" }),
  },
  {
    key: "battery", label: "Battery", weight: 1, wLabel: "1pt", wColor: "#60a5fa",
    primeVal: m => `${m.battery} hrs`,
    compVal:  c => `${c.battery_hours} hrs`,
    eval: (m, c) => ({ pts: m.battery > c.battery_hours ? 1 : m.battery === c.battery_hours ? 0.5 : 0, outcome: m.battery > c.battery_hours ? "win" : m.battery === c.battery_hours ? "equal" : "loss" }),
  },
  {
    key: "display", label: "Display", weight: 0.5, wLabel: "0.5pt", wColor: TEXT,
    primeVal: m => `${m.display}"`,
    compVal:  c => `${c.display_inch}"`,
    eval: (m, c) => ({ pts: m.display > c.display_inch ? 0.5 : m.display === c.display_inch ? 0.25 : 0, outcome: m.display > c.display_inch ? "win" : m.display === c.display_inch ? "equal" : "loss" }),
  },
  {
    key: "os", label: "OS", weight: 0.3, wLabel: "0.3pt", wColor: TEXT,
    primeVal: m => m.os.replace(/\s*\(.*\)/, ""),
    compVal:  c => c.os || "—",
    // A ready-to-use OS beats a DOS/no-OS machine, otherwise even
    eval: (m, c) => /dos/i.test(c.os || "") ? { pts: 0.3, outcome: "win" } : { pts: 0.15, outcome: "equal" },
  },
  {
    key: "webcam", label: "Webcam", weight: 0.1, wLabel: "0.1pt", wColor: TEXT,
    primeVal: m => m.webcam,
    compVal:  c => c.webcam,
    eval: (m, c) => {
      const a = WEBCAM_RANK[m.webcam] || 1, b = WEBCAM_RANK[c.webcam] || 1
      return { pts: a > b ? 0.1 : a === b ? 0.05 : 0, outcome: a > b ? "win" : a === b ? "equal" : "loss" }
    },
  },
  {
    key: "keyboard", label: "Keyboard", weight: 0.1, wLabel: "0.1pt", wColor: TEXT,
    primeVal: m => m.backlit ? "Backlit" : "No",
    compVal:  c => c.keyboard_backlit ? "Backlit" : "No",
    eval: (m, c) => m.backlit && !c.keyboard_backlit ? { pts: 0.1, outcome: "win" } : m.backlit === c.keyboard_backlit ? { pts: 0.05, outcome: "equal" } : { pts: 0, outcome: "loss" },
  },
]

const TOTAL_WEIGHT = COMP_SPECS.reduce((s, x) => s + x.weight, 0)

function getScore(prime, comp) {
  const raw = COMP_SPECS.reduce((s, x) => s + x.eval(prime, comp).pts, 0)
  return Math.round((raw / TOTAL_WEIGHT) * 10)
}

// Outcome colours — win = green · equal = blue · loss = red
const OUTCOME_COLOR = { win: "#22c55e", equal: "#3b82f6", loss: "#ef4444" }

function scoreColor(s) {
  if (s >= 6) return OUTCOME_COLOR.win
  if (s >= 4) return OUTCOME_COLOR.equal
  return OUTCOME_COLOR.loss
}

function shortName(m) {
  return m.name.replace("Primebook 2 ", "").replace("Primebook ", "")
}

// ─── Shared cell styles ───────────────────────────────────────────────────────
const thStyle  = { padding: "10px 12px", fontSize: "11px", fontWeight: "700", color: TEXT, textAlign: "left", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap", backgroundColor: "#141820" }
const tdStyle  = { padding: "10px 12px", fontSize: "12px", color: "white", borderBottom: `0.5px solid ${BORDER}`, whiteSpace: "nowrap" }
const primeTd  = { ...tdStyle, backgroundColor: "rgba(201,168,76,0.05)", fontWeight: "600" }
const specTd   = { ...tdStyle, borderRight: `1px solid ${BORDER}`, color: TEXT, fontWeight: "700", position: "sticky", left: 0, backgroundColor: "#1a2235", zIndex: 1 }

// ─── Point badge — colour by outcome, number only (compact for multi-model) ────
function PtsBadge({ pts, outcome, prefix }) {
  const c = OUTCOME_COLOR[outcome]
  return (
    <span style={{ background: `${c}22`, color: c, padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: "700", marginLeft: "4px", whiteSpace: "nowrap", display: "inline-block" }}>
      {prefix ? prefix + " " : ""}+{pts}
    </span>
  )
}

// ─── Column header with brand + out-of-range badge ─────────────────────────────
function CompHeader({ index, brandName, product }) {
  const isOOR = product?.out_of_range
  return (
    <th style={{
      ...thStyle,
      minWidth: "170px",
      borderLeft: isOOR ? `2px solid ${OOR_BORDER}` : "none",
      backgroundColor: isOOR ? OOR_BG : "#141820",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <span style={{ color: TEXT, fontSize: "10px" }}>#{index + 1} {brandName}</span>
          {isOOR && (
            <span style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", fontSize: "9px", fontWeight: "800", padding: "1px 5px", borderRadius: "3px" }}>
              OUT OF RANGE
            </span>
          )}
        </div>
        <span style={{ color: "white", fontSize: "11px", fontWeight: "600", whiteSpace: "normal", lineHeight: "1.4" }}>
          {product?.name?.slice(0, 40)}
        </span>
        {isOOR && (
          <span style={{ color: "#818cf8", fontSize: "9px" }}>
            {product?.out_of_range_note}
          </span>
        )}
      </div>
    </th>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Overview() {
  const [competitors,     setCompetitors]     = useState({})
  const [products,        setProducts]        = useState({})
  const [selectedPrimes,  setSelectedPrimes]  = useState(new Set([0]))   // multi-select
  const [selectedBrands,  setSelectedBrands]  = useState(new Set())      // multi-select
  const [loading,         setLoading]         = useState(true)
  const [showAllProducts, setShowAllProducts] = useState(false)
  const [rawProducts,     setRawProducts]     = useState({})
  const [relevantProducts,setRelevantProducts]= useState([])
  const [priceRangeLabel, setPriceRangeLabel] = useState("")
  const [primebookModels, setPrimebookModels] = useState(officialModels)
  const [currentPage,     setCurrentPage]     = useState(0)
  const PRODUCTS_PER_PAGE = 5

  // Reference model — sets the price range / product list (lowest selected index)
  const primeIndices        = [...selectedPrimes].sort((a, b) => a - b)
  const referencePrimeIndex = primeIndices.length ? primeIndices[0] : 0
  const referencePrime      = primebookModels[referencePrimeIndex]
  const primeCols           = primeIndices.map(i => ({ idx: i, model: primebookModels[i] })).filter(x => x.model)

  // Initial load
  useEffect(() => {
    Promise.all([
      fetch(`${API}/competitors`).then(r => r.json()),
      fetch(`${API}/products`).then(r => r.json()),
    ]).then(([comps, prods]) => {
      setCompetitors(comps)
      setProducts(prods)
      const first = Object.keys(comps)[0]
      if (first) setSelectedBrands(new Set([first]))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Raw products for "all products" table
  useEffect(() => {
    fetch(`${API}/all-raw-products`)
      .then(r => r.json())
      .then(data => setRawProducts(data))
      .catch(() => {})
  }, [])

  // Real Primebook prices — overlay onto official specs
  useEffect(() => {
    fetch(`${API}/primebook/real-prices`)
      .then(r => r.json())
      .then(data => {
        setPrimebookModels(officialModels.map(m => {
          const real = data[m.key]
          if (real && real.is_real_data) {
            return {
              ...m,
              price: real.price,
              ram: real.ram,
              storage: real.storage,
              display: real.display,
              isReal: true,
              realSource: real.source,
              officialPrice: m.price,
            }
          }
          return { ...m, isReal: false, officialPrice: m.price }
        }))
      })
      .catch(() => {})
  }, [])

  // Fetch relevant products for every selected brand against the reference model,
  // then merge into one list (each product tagged with its own brand name).
  useEffect(() => {
    const brandList = [...selectedBrands]
    if (brandList.length === 0 || Object.keys(competitors).length === 0) {
      setRelevantProducts([])
      setPriceRangeLabel("")
      return
    }
    Promise.all(brandList.map(bid =>
      fetch(`${API}/relevant-products/${bid}/${referencePrimeIndex}`)
        .then(r => r.json())
        .then(data => ({ bid, data }))
        .catch(() => ({ bid, data: { products: [], price_range: "" } }))
    )).then(results => {
      const merged = []
      let label = ""
      results.forEach(({ bid, data }) => {
        label = data.price_range || label
        ;(data.products || []).forEach(p =>
          merged.push({ ...p, _brandName: competitors[bid]?.name || bid })
        )
      })
      setRelevantProducts(merged)
      setPriceRangeLabel(label)
      setCurrentPage(0)
    })
  }, [selectedBrands, referencePrimeIndex, competitors])

  // Sort the listing by price (low → high), then by score (low → high) as tiebreaker
  const sortedProducts = [...relevantProducts].sort((a, b) => {
    const pa = a.price_inr || 0, pb = b.price_inr || 0
    if (pa !== pb) return pa - pb
    return getScore(referencePrime, a) - getScore(referencePrime, b)
  })
  const totalPages    = Math.ceil(sortedProducts.length / PRODUCTS_PER_PAGE)
  const pagedProducts = sortedProducts.slice(
    currentPage * PRODUCTS_PER_PAGE,
    (currentPage + 1) * PRODUCTS_PER_PAGE
  )

  // All competitor products (for the stats card)
  const allCompProducts = []
  Object.entries(products).forEach(([brandId, brandData]) => {
    if (brandData.products) brandData.products.forEach(p => allCompProducts.push({ ...p, brand_id: brandId }))
  })

  const oorCount   = relevantProducts.filter(p => p.out_of_range && !p.is_duplicate).length
  const brandNames = [...selectedBrands].map(id => competitors[id]?.name).filter(Boolean).join(" · ")
  const primeNames = primeCols.map(x => x.model.name).join(" · ")

  // ── Selection toggles (multi-select, always keep at least one) ──
  function togglePrime(i) {
    setSelectedPrimes(prev => {
      const s = new Set(prev)
      if (s.has(i)) { if (s.size > 1) s.delete(i) }
      else s.add(i)
      return s
    })
  }
  function toggleBrand(id) {
    setSelectedBrands(prev => {
      const s = new Set(prev)
      if (s.has(id)) { if (s.size > 1) s.delete(id) }
      else s.add(id)
      return s
    })
  }

  return (
    <div style={{ padding: "32px" }}>

      {/* ── Header ── */}
      <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em" }}>COMPETITOR ANALYSIS</p>
      <h1 style={{ color: "white", fontSize: "24px", fontWeight: "700", marginTop: "4px" }}>Intelligence Overview</h1>
      <p style={{ color: MUTED, fontSize: "13px", marginTop: "4px" }}>Budget laptop segment · Rs. 10,000 – Rs. 40,000</p>
      <div style={{ height: "1px", backgroundColor: BORDER, marginTop: "16px", marginBottom: "24px" }} />

      {/* ── Stats row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>

        <div style={{ backgroundColor: CARD, borderRadius: "8px", padding: "20px", border: `0.5px solid ${BORDER}`, borderTop: `2px solid ${GOLD}` }}>
          <p style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>BRANDS TRACKED</p>
          <p style={{ color: GOLD, fontSize: "28px", fontWeight: "800", fontFamily: "monospace", marginTop: "8px" }}>{Object.keys(competitors).length}</p>
          <p style={{ color: TEXT, fontSize: "10px", marginTop: "6px" }}>{Object.values(competitors).map(c => c.name).join(" · ")}</p>
        </div>

        <div onClick={() => setShowAllProducts(!showAllProducts)} style={{ backgroundColor: CARD, borderRadius: "8px", padding: "20px", border: `0.5px solid ${BORDER}`, borderTop: `2px solid ${GOLD}`, cursor: "pointer" }}>
          <p style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>PRODUCTS SCRAPED</p>
          <p style={{ color: GOLD, fontSize: "28px", fontWeight: "800", fontFamily: "monospace", marginTop: "8px" }}>
            {Object.values(rawProducts).reduce((s, b) => s + (b.total || 0), 0) || allCompProducts.length}
          </p>
          <p style={{ color: TEXT, fontSize: "10px", marginTop: "4px" }}>Amazon + Flipkart</p>
          <p style={{ color: GOLD, fontSize: "10px", marginTop: "4px" }}>{showAllProducts ? "▲ Hide" : "▼ Click to view all"}</p>
        </div>

        <div style={{ backgroundColor: CARD, borderRadius: "8px", padding: "20px", border: `0.5px solid ${BORDER}`, borderTop: `2px solid ${GOLD}` }}>
          <p style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>PRICE RANGE</p>
          <p style={{ color: GOLD, fontSize: "24px", fontWeight: "800", fontFamily: "monospace", marginTop: "8px" }}>Rs.10K–40K</p>
          <p style={{ color: TEXT, fontSize: "10px", marginTop: "6px" }}>Budget laptop segment</p>
        </div>

        <div style={{ backgroundColor: CARD, borderRadius: "8px", padding: "20px", border: `0.5px solid ${BORDER}`, borderTop: `2px solid ${GOLD}` }}>
          <p style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>LAST UPDATED</p>
          <p style={{ color: GOLD, fontSize: "24px", fontWeight: "800", fontFamily: "monospace", marginTop: "8px" }}>{products.last_updated?.split(" ")[0] || "Today"}</p>
          <p style={{ color: TEXT, fontSize: "10px", marginTop: "6px" }}>Amazon + Flipkart caches</p>
        </div>
      </div>

      {/* ── All products table (expandable) ── */}
      {showAllProducts && (
        <div style={{ marginBottom: "32px" }}>
          <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em", marginBottom: "16px" }}>ALL SCRAPED PRODUCTS</p>
          {Object.entries(rawProducts).map(([brandId, brandData]) => {
            if (!brandData.products?.length) return null
            return (
              <div key={brandId} style={{ marginBottom: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", backgroundColor: "#141820", borderRadius: "8px 8px 0 0", border: `0.5px solid ${BORDER}`, borderBottom: `2px solid ${GOLD}` }}>
                  <span style={{ color: GOLD, fontSize: "14px", fontWeight: "700" }}>{brandData.name}</span>
                  <span style={{ color: TEXT, fontSize: "11px", backgroundColor: CARD, padding: "2px 8px", borderRadius: "3px" }}>{brandData.total} products</span>
                  <span style={{ color: MUTED, fontSize: "10px", marginLeft: "auto" }}>Amazon: {brandData.amazon_count} · Flipkart: {brandData.flipkart_count}</span>
                </div>
                <div style={{ overflowX: "auto", border: `0.5px solid ${BORDER}`, borderTop: "none", borderRadius: "0 0 8px 8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["#", "Product Name", "Price", "Processor", "RAM", "Storage", "Display", "OS", "Source"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", fontSize: "10px", fontWeight: "700", color: TEXT, textAlign: "left", borderBottom: `0.5px solid ${BORDER}`, backgroundColor: CARD, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {brandData.products.map((p, i) => (
                        <tr
                          key={i}
                          onClick={() => p.url && window.open(p.url, "_blank", "noopener,noreferrer")}
                          style={{
                            backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                            cursor: p.url ? "pointer" : "default",
                          }}
                          onMouseEnter={e => { if (p.url) e.currentTarget.style.backgroundColor = "rgba(201,168,76,0.08)" }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}
                        >
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: MUTED, borderBottom: `0.5px solid ${BORDER}` }}>{i + 1}</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: p.url ? "#60a5fa" : "white", borderBottom: `0.5px solid ${BORDER}`, maxWidth: "250px", whiteSpace: "normal", lineHeight: "1.4", textDecoration: p.url ? "underline" : "none" }}>
                            {p.name?.slice(0, 70)}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: GOLD, fontFamily: "monospace", borderBottom: `0.5px solid ${BORDER}` }}>Rs. {p.price_inr?.toLocaleString()}</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: "white", borderBottom: `0.5px solid ${BORDER}`, whiteSpace: "nowrap" }}>{p.processor || "—"}</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: "white", borderBottom: `0.5px solid ${BORDER}` }}>{p.ram_gb} GB</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: "white", borderBottom: `0.5px solid ${BORDER}` }}>{p.storage_gb} GB</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: "white", borderBottom: `0.5px solid ${BORDER}` }}>{p.display_inch}"</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: "white", borderBottom: `0.5px solid ${BORDER}`, whiteSpace: "nowrap" }}>{p.os}</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", borderBottom: `0.5px solid ${BORDER}` }}>
                            <span style={{ background: p.source === "Amazon" ? "rgba(255,153,0,0.15)" : "rgba(40,116,240,0.15)", color: p.source === "Amazon" ? "#ff9900" : "#2874F0", padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: "700" }}>
                              {p.source}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Our Products ── */}
      <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em", marginBottom: "12px" }}>OUR PRODUCTS — SELECT ONE OR MORE TO COMPARE</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "32px" }}>
        {primebookModels.map((model, i) => {
          const isSel = selectedPrimes.has(i)
          return (
            <div key={i} onClick={() => togglePrime(i)} style={{
              backgroundColor: CARD, borderRadius: "8px", padding: "20px",
              border: isSel ? `1px solid ${GOLD}` : `0.5px solid ${BORDER}`,
              borderTop: `2px solid ${isSel ? GOLD : BORDER}`,
              cursor: "pointer", textAlign: "center",
            }}>
              <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em" }}>PRIMEBOOK</p>
              <h3 style={{ color: "white", fontSize: "16px", fontWeight: "700", margin: "6px 0" }}>{shortName(model)}</h3>
              <p style={{ color: GOLD, fontSize: "22px", fontWeight: "800", fontFamily: "monospace" }}>Rs. {model.price.toLocaleString()}</p>

              {model.isReal ? (
                <span style={{ display: "inline-block", marginTop: "4px", fontSize: "9px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px", background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                  Live · {model.realSource}
                </span>
              ) : (
                <span style={{ display: "inline-block", marginTop: "4px", fontSize: "9px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px", background: "rgba(234,179,8,0.15)", color: "#facc15" }}>
                  Official price
                </span>
              )}

              <div style={{ height: "0.5px", backgroundColor: BORDER, margin: "10px 0" }} />
              <p style={{ color: TEXT, fontSize: "12px", lineHeight: "1.8" }}>
                {model.ram}GB RAM · {model.storage}GB · {model.display}" · {model.battery}hrs
              </p>
              {model.isReal && model.officialPrice !== model.price && (
                <p style={{ color: "#6b7280", fontSize: "9px", marginTop: "4px" }}>Official Rs. {model.officialPrice.toLocaleString()}</p>
              )}
              <p style={{ color: "#818cf8", fontSize: "10px", marginTop: "8px", fontWeight: "600" }}>
                Compares: Rs.{(model.priceRangeMin / 1000).toFixed(0)}K – Rs.{(model.priceRangeMax / 1000).toFixed(0)}K
              </p>
              {isSel && <p style={{ color: GOLD, fontSize: "11px", fontWeight: "700", marginTop: "8px" }}>SELECTED</p>}
            </div>
          )
        })}
      </div>

      {/* ── Primebook brand banner + Competitor brand cards ── */}
      <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em", marginBottom: "12px" }}>SELECT COMPETITOR BRANDS</p>

      {/* Our brand banner */}
      <div style={{ marginBottom: "16px", backgroundColor: "rgba(201,168,76,0.06)", borderRadius: "8px", padding: "16px 20px", border: `1px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ background: GOLD, color: "#0d1117", fontSize: "10px", fontWeight: "800", padding: "3px 8px", borderRadius: "3px" }}>OUR BRAND</span>
          <span style={{ color: GOLD, fontWeight: "700", fontSize: "18px" }}>Primebook</span>
        </div>
        <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ color: MUTED, fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em" }}>MARKET SHARE</p>
            <p style={{ color: GOLD, fontSize: "20px", fontWeight: "800", fontFamily: "monospace" }}>3%</p>
            <p style={{ color: MUTED, fontSize: "9px" }}>budget segment</p>
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ color: MUTED, fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em" }}>MODELS</p>
            <p style={{ color: TEXT, fontSize: "12px", fontWeight: "600" }}>Neo · Pro · Max</p>
          </div>
          <a href="https://primebook.in" target="_blank" rel="noreferrer" style={{ color: GOLD, fontSize: "11px", fontWeight: "600", textDecoration: "none", alignSelf: "center" }}>
            Official Site →
          </a>
        </div>
      </div>

      {/* Competitor cards */}
      {loading ? <p style={{ color: MUTED }}>Loading...</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "32px" }}>
          {Object.entries(competitors).map(([id, comp]) => {
            const isSel = selectedBrands.has(id)
            return (
              <div key={id} onClick={() => toggleBrand(id)} style={{
                backgroundColor: CARD, borderRadius: "8px", padding: "16px",
                border: isSel ? `1px solid ${GOLD}` : `0.5px solid ${BORDER}`,
                borderTop: `2px solid ${isSel ? GOLD : BORDER}`,
                textAlign: "center", cursor: "pointer",
              }}>
                <p style={{ color: MUTED, fontSize: "10px", fontWeight: "700", marginBottom: "4px" }}>{comp.market_share} SHARE</p>
                <p style={{ color: "white", fontWeight: "700", fontSize: "16px", marginBottom: "8px" }}>{comp.name}</p>
                {isSel && <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", marginBottom: "8px" }}>SELECTED</p>}
                <a href={comp.website} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: GOLD, fontSize: "11px", fontWeight: "600", textDecoration: "none" }}>
                  Official Site →
                </a>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Comparison Table ── */}
      {relevantProducts.length > 0 && (
        <>
          {/* Info bar */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px", alignItems: "center" }}>
            <span style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>SHOWING {relevantProducts.length} PRODUCTS:</span>
            <span style={{ background: "rgba(201,168,76,0.12)", color: GOLD, fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "3px" }}>
              {relevantProducts.length - oorCount} IN RANGE
            </span>
            {oorCount > 0 && (
              <span style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "3px" }}>
                {oorCount} OUT OF RANGE
              </span>
            )}
            <span style={{ color: "#818cf8", fontSize: "10px", marginLeft: "auto" }}>
              Comparison range: {priceRangeLabel}
            </span>
          </div>

          {/* Score weight legend + outcome colour key */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px", alignItems: "center" }}>
            <span style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>SCORE WEIGHTS:</span>
            {COMP_SPECS.map((s, i) => (
              <span key={i} style={{ background: `${s.wColor}22`, color: s.wColor, fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "3px" }}>
                {s.label} {s.wLabel}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
            <span style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>POINTS:</span>
            {[["win", "Primebook wins"], ["equal", "Tie"], ["loss", "Primebook loses"]].map(([k, txt]) => (
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: OUTCOME_COLOR[k] }} />
                <span style={{ color: TEXT, fontSize: "10px" }}>{txt}</span>
              </span>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
            <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em", margin: 0 }}>
              COMPARISON — {primeNames.toUpperCase()} vs {brandNames.toUpperCase()}
            </p>
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: TEXT, fontSize: "10px" }}>
                  Showing {currentPage * PRODUCTS_PER_PAGE + 1}–{Math.min((currentPage + 1) * PRODUCTS_PER_PAGE, relevantProducts.length)} of {relevantProducts.length}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  style={{
                    fontSize: "11px", padding: "4px 10px", borderRadius: "4px",
                    border: `1px solid ${BORDER}`, backgroundColor: "transparent",
                    color: currentPage === 0 ? MUTED : GOLD,
                    cursor: currentPage === 0 ? "not-allowed" : "pointer",
                    opacity: currentPage === 0 ? 0.4 : 1,
                  }}
                >
                  ← Prev
                </button>
                <span style={{ color: TEXT, fontSize: "11px", fontWeight: "600" }}>
                  Page {currentPage + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                  style={{
                    fontSize: "11px", padding: "4px 10px", borderRadius: "4px",
                    border: `1px solid ${currentPage >= totalPages - 1 ? BORDER : GOLD}`,
                    backgroundColor: currentPage >= totalPages - 1 ? "transparent" : "rgba(201,168,76,0.1)",
                    color: currentPage >= totalPages - 1 ? MUTED : GOLD,
                    cursor: currentPage >= totalPages - 1 ? "not-allowed" : "pointer",
                    opacity: currentPage >= totalPages - 1 ? 0.4 : 1,
                    fontWeight: "600",
                  }}
                >
                  Next →
                </button>
              </div>
            )}
          </div>

          <div style={{ overflowX: "auto", borderRadius: "8px", border: `0.5px solid ${BORDER}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: "120px", borderRight: `1px solid ${BORDER}`, position: "sticky", left: 0, zIndex: 2 }}>Spec</th>
                  {/* Our product columns (multi-select) */}
                  {primeCols.map(({ idx, model }) => (
                    <th key={idx} style={{ ...thStyle, color: GOLD, backgroundColor: "rgba(201,168,76,0.06)", minWidth: "150px" }}>
                      {model.name}
                      {primeCols.length > 1 && idx === referencePrimeIndex && (
                        <><br /><span style={{ color: "#818cf8", fontSize: "9px", fontWeight: "600" }}>SETS RANGE</span></>
                      )}
                    </th>
                  ))}
                  {/* Competitor columns */}
                  {pagedProducts.map((comp, i) => (
                    <CompHeader key={i} index={currentPage * PRODUCTS_PER_PAGE + i} brandName={comp._brandName} product={comp} />
                  ))}
                </tr>
              </thead>

              <tbody>

                {/* SCORE ROW — one score per selected Primebook model */}
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  <td style={{ ...tdStyle, borderRight: `1px solid ${BORDER}`, fontWeight: "700", color: "white", backgroundColor: "#141820", position: "sticky", left: 0, zIndex: 1 }}>Score</td>
                  {primeCols.map(({ idx }) => (
                    <td key={idx} style={{ ...primeTd, color: GOLD, fontWeight: "700" }}>—</td>
                  ))}
                  {pagedProducts.map((comp, i) => (
                    <td key={i} style={{ ...tdStyle, backgroundColor: comp.out_of_range ? OOR_BG : "transparent" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        {primeCols.map(({ idx, model }) => {
                          const sc = getScore(model, comp)
                          return (
                            <span key={idx} style={{ whiteSpace: "nowrap" }}>
                              {primeCols.length > 1 && <span style={{ color: TEXT, fontSize: "9px", marginRight: "5px" }}>{shortName(model)}</span>}
                              <span style={{ color: scoreColor(sc), fontFamily: "monospace", fontWeight: "700", fontSize: primeCols.length > 1 ? "14px" : "18px" }}>{sc}</span>
                              <span style={{ color: BORDER, fontSize: "11px" }}>/10</span>
                            </span>
                          )
                        })}
                      </div>
                    </td>
                  ))}
                </tr>

                {/* SPEC ROWS — each competitor cell shows one point badge per model */}
                {COMP_SPECS.map(spec => (
                  <tr key={spec.key}>
                    <td style={specTd}>{spec.label} <span style={{ color: spec.wColor, fontSize: "9px" }}>{spec.wLabel}</span></td>
                    {primeCols.map(({ idx, model }) => (
                      <td key={idx} style={{ ...primeTd, ...(spec.primeStyle || {}) }}>{spec.primeVal(model)}</td>
                    ))}
                    {pagedProducts.map((comp, i) => (
                      <td key={i} style={{ ...tdStyle, backgroundColor: comp.out_of_range ? OOR_BG : "transparent" }}>
                        <span>{spec.compVal(comp)}</span>
                        {primeCols.map(({ idx, model }) => {
                          const { pts, outcome } = spec.eval(model, comp)
                          return <PtsBadge key={idx} pts={pts} outcome={outcome} prefix={primeCols.length > 1 ? shortName(model) : null} />
                        })}
                      </td>
                    ))}
                  </tr>
                ))}

              </tbody>
            </table>
          </div>

          {/* Legend below table */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "2px", backgroundColor: OOR_BG, border: `1px solid ${OOR_BORDER}` }} />
            <span style={{ color: "#818cf8", fontSize: "11px" }}>Out of range — outside {priceRangeLabel}</span>
          </div>
        </>
      )}
    </div>
  )
}
