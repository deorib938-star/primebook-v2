import { useState, useEffect } from "react"

const GOLD = "#C9A84C"
const CARD = "#1C2333"
const BORDER = "#2a3347"
const MUTED = "#4a5568"
const TEXT = "#94a3b8"

const primebookModels = [
  { name: "Primebook 2 Neo", price: 19990, ram: 6,  storage: 128, display: 11.6, battery: 8,  webcam: "1080p", backlit: true, os: "PrimeOS 3.0 (Android 15)", processor: "MediaTek Helio G99" },
  { name: "Primebook 2 Pro", price: 25990, ram: 8,  storage: 128, display: 14.1, battery: 14, webcam: "1440p", backlit: true, os: "PrimeOS 3.0 (Android 15)", processor: "MediaTek Helio G99" },
  { name: "Primebook 2 Max", price: 27990, ram: 8,  storage: 256, display: 15.6, battery: 12, webcam: "1440p", backlit: true, os: "PrimeOS 3.0 (Android 15)", processor: "MediaTek Helio G99" },
]

function getScore(prime, comp) {
  let score = 0, total = 0
  total += 3
  if (prime.price <= comp.price_inr) score += 3
  else if (prime.price <= comp.price_inr * 1.3) score += 2
  else if (prime.price <= comp.price_inr * 1.5) score += 1
  total += 2
  if (prime.ram > comp.ram_gb) score += 2
  else if (prime.ram === comp.ram_gb) score += 1
  total += 1
  if (prime.storage > comp.storage_gb) score += 1
  else if (prime.storage === comp.storage_gb) score += 0.5
  total += 0.5
  if (prime.display > comp.display_inch) score += 0.5
  else if (prime.display === comp.display_inch) score += 0.25
  total += 1
  if (prime.battery > comp.battery_hours) score += 1
  else if (prime.battery === comp.battery_hours) score += 0.5
  total += 0.25
  const wc = { "720p": 1, "1080p": 2, "1440p": 3 }
  if ((wc[prime.webcam] || 1) > (wc[comp.webcam] || 1)) score += 0.25
  else if ((wc[prime.webcam] || 1) === (wc[comp.webcam] || 1)) score += 0.125
  total += 0.25
  if (prime.backlit && !comp.keyboard_backlit) score += 0.25
  else if (prime.backlit === comp.keyboard_backlit) score += 0.125
  total += 2
  if (prime.os.includes("15")) score += 2
  return Math.round((score / total) * 10)
}

function scoreLabel(score) {
  if (score >= 8) return { label: "WIN",    color: GOLD }
  if (score >= 6) return { label: "BETTER", color: "#60a5fa" }
  if (score >= 4) return { label: "EQUAL",  color: "#f97316" }
  return               { label: "LOSE",   color: "#ef4444" }
}

function Tag({ a, b, higher = true }) {
  const s = (bg, color, txt) => (
    <span style={{ background: bg, color, padding: "2px 7px", borderRadius: "3px", fontSize: "10px", fontWeight: "700", marginLeft: "4px" }}>{txt}</span>
  )
  if (a === b) return s("rgba(249,115,22,0.12)", "#f97316", "EQUAL")
  const win = higher ? a > b : a < b
  return win ? s("rgba(201,168,76,0.15)", GOLD, "WIN") : s("rgba(239,68,68,0.12)", "#ef4444", "LOSE")
}

function Pt({ pts, color }) {
  return (
    <span style={{ background: `${color}22`, color, fontSize: "9px", fontWeight: "700", padding: "1px 5px", borderRadius: "3px", marginLeft: "4px", verticalAlign: "middle" }}>
      {pts}
    </span>
  )
}

const thStyle = { padding: "10px 12px", fontSize: "11px", fontWeight: "700", color: TEXT, textAlign: "left", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap", backgroundColor: "#141820" }
const tdStyle = { padding: "10px 12px", fontSize: "12px", color: "white", borderBottom: `0.5px solid ${BORDER}`, whiteSpace: "nowrap" }
const primeTd = { ...tdStyle, backgroundColor: "rgba(201,168,76,0.05)", fontWeight: "600" }

export default function Overview() {
  const [competitors, setCompetitors] = useState({})
  const [products, setProducts] = useState({})
  const [selectedPrime, setSelectedPrime] = useState(0)
  const [selectedComp, setSelectedComp] = useState("")
  const [loading, setLoading] = useState(true)
  const [showAllProducts, setShowAllProducts] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("http://127.0.0.1:8000/competitors").then(r => r.json()),
      fetch("http://127.0.0.1:8000/products").then(r => r.json()),
    ]).then(([comps, prods]) => {
      setCompetitors(comps)
      setProducts(prods)
      setSelectedComp(Object.keys(comps)[0])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const prime = primebookModels[selectedPrime]
  const allCompProducts = []
  Object.entries(products).forEach(([brandId, brandData]) => {
    if (brandData.products) brandData.products.forEach(p => allCompProducts.push({ ...p, brand_id: brandId }))
  })

  const brandScores = Object.entries(competitors).map(([id, comp]) => {
    const topProd = products[id]?.products?.[0]
    const score = topProd ? getScore(prime, topProd) : 5
    return { id, name: comp.name, score, market_share: comp.market_share, website: comp.website }
  })

  const selectedBrandProducts = products[selectedComp]?.products
    ?.slice()
    ?.sort((a, b) => {
      const priceA = a.price_inr || 0
      const priceB = b.price_inr || 0
      const primePriceRef = prime.price
      const diffA = Math.abs(priceA - primePriceRef)
      const diffB = Math.abs(priceB - primePriceRef)
      if (diffA !== diffB) return diffA - diffB
      return (b.reviews || 0) - (a.reviews || 0)
    })
    ?.slice(0, 10) || []

  return (
    <div style={{ padding: "32px" }}>

      {/* Header */}
      <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em" }}>COMPETITOR ANALYSIS</p>
      <h1 style={{ color: "white", fontSize: "24px", fontWeight: "700", marginTop: "4px" }}>Intelligence Overview</h1>
      <p style={{ color: MUTED, fontSize: "13px", marginTop: "4px" }}>All laptop brands under Rs. 10,000 - Rs. 40,000</p>
      <div style={{ height: "1px", backgroundColor: BORDER, marginTop: "16px", marginBottom: "24px" }}></div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>

        {/* Brands Tracked */}
        <div style={{ backgroundColor: CARD, borderRadius: "8px", padding: "20px", border: `0.5px solid ${BORDER}`, borderTop: `2px solid ${GOLD}` }}>
          <p style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>BRANDS TRACKED</p>
          <p style={{ color: GOLD, fontSize: "28px", fontWeight: "800", fontFamily: "monospace", marginTop: "8px" }}>{Object.keys(competitors).length}</p>
          <p style={{ color: TEXT, fontSize: "10px", marginTop: "6px" }}>{Object.values(competitors).map(c => c.name).join(" · ")}</p>
        </div>

        {/* Products Scraped — clickable */}
        <div
          onClick={() => setShowAllProducts(!showAllProducts)}
          style={{ backgroundColor: CARD, borderRadius: "8px", padding: "20px", border: `0.5px solid ${BORDER}`, borderTop: `2px solid ${GOLD}`, cursor: "pointer" }}>
          <p style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>PRODUCTS SCRAPED</p>
          <p style={{ color: GOLD, fontSize: "28px", fontWeight: "800", fontFamily: "monospace", marginTop: "8px" }}>{allCompProducts.length}</p>
          <p style={{ color: TEXT, fontSize: "10px", marginTop: "4px" }}>Amazon + Flipkart</p>
          <p style={{ color: GOLD, fontSize: "10px", marginTop: "4px" }}>{showAllProducts ? "▲ Hide products" : "▼ Click to view all"}</p>
        </div>

        {/* Price Range */}
        <div style={{ backgroundColor: CARD, borderRadius: "8px", padding: "20px", border: `0.5px solid ${BORDER}`, borderTop: `2px solid ${GOLD}` }}>
          <p style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>PRICE RANGE</p>
          <p style={{ color: GOLD, fontSize: "24px", fontWeight: "800", fontFamily: "monospace", marginTop: "8px" }}>₹10K-40K</p>
          <p style={{ color: TEXT, fontSize: "10px", marginTop: "6px" }}>Budget laptop segment</p>
        </div>

        {/* Last Updated */}
        <div style={{ backgroundColor: CARD, borderRadius: "8px", padding: "20px", border: `0.5px solid ${BORDER}`, borderTop: `2px solid ${GOLD}` }}>
          <p style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>LAST UPDATED</p>
          <p style={{ color: GOLD, fontSize: "24px", fontWeight: "800", fontFamily: "monospace", marginTop: "8px" }}>{products.last_updated?.split(" ")[0] || "Today"}</p>
          <p style={{ color: TEXT, fontSize: "10px", marginTop: "6px" }}>Cache valid 30 days</p>
        </div>

      </div>

      {/* All Products Table — shown when clicked */}
      {showAllProducts && (
        <div style={{ marginBottom: "32px" }}>
          <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em", marginBottom: "16px" }}>ALL SCRAPED PRODUCTS</p>
          {Object.entries(products).map(([brandId, brandData]) => {
            if (!brandData.products || brandData.products.length === 0) return null
            return (
              <div key={brandId} style={{ marginBottom: "24px" }}>
                {/* Brand Header */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", backgroundColor: "#141820", borderRadius: "8px 8px 0 0", border: `0.5px solid ${BORDER}`, borderBottom: `2px solid ${GOLD}` }}>
                  <span style={{ color: GOLD, fontSize: "14px", fontWeight: "700" }}>{brandData.name}</span>
                  <span style={{ color: TEXT, fontSize: "11px", backgroundColor: CARD, padding: "2px 8px", borderRadius: "3px" }}>{brandData.total} products</span>
                  <span style={{ color: MUTED, fontSize: "10px", marginLeft: "auto" }}>
                    Amazon: {brandData.amazon_count} · Flipkart: {brandData.flipkart_count}
                  </span>
                </div>

                {/* Products Table */}
                <div style={{ overflowX: "auto", border: `0.5px solid ${BORDER}`, borderTop: "none", borderRadius: "0 0 8px 8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["#", "Product Name", "Price", "RAM", "Storage", "Display", "OS", "Rating", "Source"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", fontSize: "10px", fontWeight: "700", color: TEXT, textAlign: "left", borderBottom: `0.5px solid ${BORDER}`, backgroundColor: CARD, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {brandData.products.map((p, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: MUTED, borderBottom: `0.5px solid ${BORDER}` }}>{i + 1}</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: "white", borderBottom: `0.5px solid ${BORDER}`, maxWidth: "250px", whiteSpace: "normal", lineHeight: "1.4" }}>{p.name?.slice(0, 70)}</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: GOLD, fontFamily: "monospace", borderBottom: `0.5px solid ${BORDER}`, whiteSpace: "nowrap" }}>Rs. {p.price_inr?.toLocaleString()}</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: "white", borderBottom: `0.5px solid ${BORDER}` }}>{p.ram_gb} GB</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: "white", borderBottom: `0.5px solid ${BORDER}` }}>{p.storage_gb} GB</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: "white", borderBottom: `0.5px solid ${BORDER}` }}>{p.display_inch}"</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: "white", borderBottom: `0.5px solid ${BORDER}`, whiteSpace: "nowrap" }}>{p.os}</td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: GOLD, borderBottom: `0.5px solid ${BORDER}`, whiteSpace: "nowrap" }}>
                            {"★".repeat(Math.round(p.rating || 0))}{"☆".repeat(5 - Math.round(p.rating || 0))} {p.rating}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", borderBottom: `0.5px solid ${BORDER}` }}>
                            <span style={{
                              background: p.source === "Amazon" ? "rgba(255,153,0,0.15)" : "rgba(40,116,240,0.15)",
                              color: p.source === "Amazon" ? "#ff9900" : "#2874F0",
                              padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: "700"
                            }}>{p.source}</span>
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

      {/* Our Products */}
      <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em", marginBottom: "12px" }}>OUR PRODUCTS — SELECT TO COMPARE</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "32px" }}>
        {primebookModels.map((model, i) => (
          <div key={i} onClick={() => setSelectedPrime(i)} style={{
            backgroundColor: CARD, borderRadius: "8px", padding: "20px",
            border: selectedPrime === i ? `1px solid ${GOLD}` : `0.5px solid ${BORDER}`,
            borderTop: `2px solid ${selectedPrime === i ? GOLD : BORDER}`,
            cursor: "pointer", textAlign: "center",
          }}>
            <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em" }}>PRIMEBOOK</p>
            <h3 style={{ color: "white", fontSize: "16px", fontWeight: "700", margin: "6px 0" }}>{model.name.replace("Primebook 2 ", "")}</h3>
            <p style={{ color: GOLD, fontSize: "22px", fontWeight: "800", fontFamily: "monospace" }}>Rs. {model.price.toLocaleString()}</p>
            <div style={{ height: "0.5px", backgroundColor: BORDER, margin: "10px 0" }}></div>
            <p style={{ color: TEXT, fontSize: "12px", lineHeight: "1.8" }}>
              {model.ram}GB RAM · {model.storage}GB · {model.display}" · {model.battery}hrs
            </p>
            {selectedPrime === i && <p style={{ color: GOLD, fontSize: "11px", fontWeight: "700", marginTop: "8px" }}>SELECTED</p>}
          </div>
        ))}
      </div>

      {/* Brand Score Cards */}
      <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em", marginBottom: "12px" }}>SELECT COMPETITOR BRAND</p>
      {loading ? <p style={{ color: MUTED }}>Loading...</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "32px" }}>
          {brandScores.map(({ id, name, market_share, website }) => {
            return (
              <div key={id} onClick={() => setSelectedComp(id)} style={{
                backgroundColor: CARD, borderRadius: "8px", padding: "16px",
                border: selectedComp === id ? `1px solid ${GOLD}` : `0.5px solid ${BORDER}`,
                borderTop: `2px solid ${selectedComp === id ? GOLD : BORDER}`,
                textAlign: "center", cursor: "pointer",
              }}>
                <p style={{ color: MUTED, fontSize: "10px", fontWeight: "700", marginBottom: "8px" }}>{market_share} SHARE</p>
                <p style={{ color: "white", fontWeight: "700", fontSize: "16px", marginBottom: "16px" }}>{name}</p>
                <a href={website} target="_blank" rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ color: GOLD, fontSize: "11px", fontWeight: "600", textDecoration: "none" }}>
                  Official Site →
                </a>
              </div>
            )
          })}
        </div>
      )}

      {/* Comparison Table */}
      {selectedBrandProducts.length > 0 && (
        <>
          {/* Score Weights */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
            <span style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>SCORE WEIGHTS:</span>
            {[
              { label: "Price 3pts",    color: GOLD },
              { label: "RAM 2pts",      color: GOLD },
              { label: "OS 2pts",       color: GOLD },
              { label: "Storage 1pt",   color: "#60a5fa" },
              { label: "Battery 1pt",   color: "#60a5fa" },
              { label: "Display 0.5pt", color: TEXT },
              { label: "Webcam 0.25pt", color: TEXT },
              { label: "Keyboard 0.25pt", color: TEXT },
            ].map((w, i) => (
              <span key={i} style={{ background: `${w.color}22`, color: w.color, fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "3px" }}>
                {w.label}
              </span>
            ))}
          </div>

          <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em", marginBottom: "12px" }}>
            COMPARISON — {prime.name.toUpperCase()} vs ALL {competitors[selectedComp]?.name?.toUpperCase()} PRODUCTS
          </p>

          <div style={{ overflowX: "auto", borderRadius: "8px", border: `0.5px solid ${BORDER}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: "120px", borderRight: `1px solid ${BORDER}` }}>Spec</th>
                  <th style={{ ...thStyle, color: GOLD, backgroundColor: "rgba(201,168,76,0.06)", minWidth: "150px" }}>
                    {prime.name}
                  </th>
                  {selectedBrandProducts.map((comp, i) => (
                    <th key={i} style={{ ...thStyle, minWidth: "160px" }}>
                      <span style={{ color: TEXT, fontSize: "10px" }}>#{i + 1} {competitors[selectedComp]?.name}</span><br />
                      <span style={{ color: "white", fontSize: "11px", fontWeight: "600" }}>{comp.name?.slice(0, 35)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>

                {/* SCORE ROW — at top */}
                {(() => {
                  return (
                    <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                      <td style={{ ...tdStyle, borderRight: `1px solid ${BORDER}`, fontWeight: "700", color: "white", backgroundColor: "#141820" }}>Score</td>
                      <td style={{ ...tdStyle, backgroundColor: "rgba(201,168,76,0.06)", color: GOLD, fontWeight: "700" }}>—</td>
                      {selectedBrandProducts.map((comp, i) => {
                        const score = getScore(prime, comp)
                        const { label, color } = scoreLabel(score)
                        return (
                          <td key={i} style={tdStyle}>
                            <span style={{ color, fontFamily: "monospace", fontWeight: "700", fontSize: "18px" }}>{score}</span>
                            <span style={{ color: BORDER, fontSize: "12px" }}>/10 </span>
                            <span style={{ background: `${color}22`, color, padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "700" }}>{label}</span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })()}

                {/* PRICE ROW */}
                <tr>
                  <td style={{ ...tdStyle, borderRight: `1px solid ${BORDER}`, color: TEXT, fontWeight: "700" }}>Price <span style={{ color: GOLD, fontSize: "9px" }}>3pts</span></td>
                  <td style={{ ...tdStyle, backgroundColor: "rgba(201,168,76,0.06)", color: GOLD, fontFamily: "monospace", fontWeight: "700" }}>Rs. {prime.price.toLocaleString()}</td>
                  {selectedBrandProducts.map((comp, i) => {
                    const pts = prime.price <= comp.price_inr ? 3 : prime.price <= comp.price_inr * 1.3 ? 2 : prime.price <= comp.price_inr * 1.5 ? 1 : 0
                    const win = prime.price < comp.price_inr
                    const eq = prime.price === comp.price_inr
                    const c = eq ? "#f97316" : win ? GOLD : "#ef4444"
                    return <td key={i} style={tdStyle}>
                      <span style={{ fontFamily: "monospace" }}>Rs. {comp.price_inr?.toLocaleString()}</span>
                      <span style={{ background: `${c}22`, color: c, padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: "700", marginLeft: "4px" }}>
                        {eq ? "EQUAL" : win ? "WIN" : "LOSE"} +{pts}
                      </span>
                    </td>
                  })}
                </tr>

                {/* RAM ROW */}
                <tr>
                  <td style={{ ...tdStyle, borderRight: `1px solid ${BORDER}`, color: TEXT, fontWeight: "700" }}>RAM <span style={{ color: GOLD, fontSize: "9px" }}>2pts</span></td>
                  <td style={{ ...tdStyle, backgroundColor: "rgba(201,168,76,0.06)", color: "white" }}>{prime.ram} GB</td>
                  {selectedBrandProducts.map((comp, i) => {
                    const pts = prime.ram > comp.ram_gb ? 2 : prime.ram === comp.ram_gb ? 1 : 0
                    const win = prime.ram > comp.ram_gb; const eq = prime.ram === comp.ram_gb
                    const c = eq ? "#f97316" : win ? GOLD : "#ef4444"
                    return <td key={i} style={tdStyle}>{comp.ram_gb} GB
                      <span style={{ background: `${c}22`, color: c, padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: "700", marginLeft: "4px" }}>
                        {eq ? "EQUAL" : win ? "WIN" : "LOSE"} +{pts}
                      </span>
                    </td>
                  })}
                </tr>

                {/* STORAGE ROW */}
                <tr>
                  <td style={{ ...tdStyle, borderRight: `1px solid ${BORDER}`, color: TEXT, fontWeight: "700" }}>Storage <span style={{ color: "#60a5fa", fontSize: "9px" }}>1pt</span></td>
                  <td style={{ ...tdStyle, backgroundColor: "rgba(201,168,76,0.06)", color: "white" }}>{prime.storage} GB</td>
                  {selectedBrandProducts.map((comp, i) => {
                    const pts = prime.storage > comp.storage_gb ? 1 : prime.storage === comp.storage_gb ? 0.5 : 0
                    const win = prime.storage > comp.storage_gb; const eq = prime.storage === comp.storage_gb
                    const c = eq ? "#f97316" : win ? GOLD : "#ef4444"
                    return <td key={i} style={tdStyle}>{comp.storage_gb} GB
                      <span style={{ background: `${c}22`, color: c, padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: "700", marginLeft: "4px" }}>
                        {eq ? "EQUAL" : win ? "WIN" : "LOSE"} +{pts}
                      </span>
                    </td>
                  })}
                </tr>

                {/* DISPLAY ROW */}
                <tr>
                  <td style={{ ...tdStyle, borderRight: `1px solid ${BORDER}`, color: TEXT, fontWeight: "700" }}>Display <span style={{ color: TEXT, fontSize: "9px" }}>0.5pt</span></td>
                  <td style={{ ...tdStyle, backgroundColor: "rgba(201,168,76,0.06)", color: "white" }}>{prime.display}"</td>
                  {selectedBrandProducts.map((comp, i) => {
                    const pts = prime.display > comp.display_inch ? 0.5 : prime.display === comp.display_inch ? 0.25 : 0
                    const win = prime.display > comp.display_inch; const eq = prime.display === comp.display_inch
                    const c = eq ? "#f97316" : win ? GOLD : "#ef4444"
                    return <td key={i} style={tdStyle}>{comp.display_inch}"
                      <span style={{ background: `${c}22`, color: c, padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: "700", marginLeft: "4px" }}>
                        {eq ? "EQUAL" : win ? "WIN" : "LOSE"} +{pts}
                      </span>
                    </td>
                  })}
                </tr>

                {/* BATTERY ROW */}
                <tr>
                  <td style={{ ...tdStyle, borderRight: `1px solid ${BORDER}`, color: TEXT, fontWeight: "700" }}>Battery <span style={{ color: "#60a5fa", fontSize: "9px" }}>1pt</span></td>
                  <td style={{ ...tdStyle, backgroundColor: "rgba(201,168,76,0.06)", color: "white" }}>{prime.battery} hrs</td>
                  {selectedBrandProducts.map((comp, i) => {
                    const pts = prime.battery > comp.battery_hours ? 1 : prime.battery === comp.battery_hours ? 0.5 : 0
                    const win = prime.battery > comp.battery_hours; const eq = prime.battery === comp.battery_hours
                    const c = eq ? "#f97316" : win ? GOLD : "#ef4444"
                    return <td key={i} style={tdStyle}>{comp.battery_hours} hrs
                      <span style={{ background: `${c}22`, color: c, padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: "700", marginLeft: "4px" }}>
                        {eq ? "EQUAL" : win ? "WIN" : "LOSE"} +{pts}
                      </span>
                    </td>
                  })}
                </tr>

                {/* WEBCAM ROW */}
                <tr>
                  <td style={{ ...tdStyle, borderRight: `1px solid ${BORDER}`, color: TEXT, fontWeight: "700" }}>Webcam <span style={{ color: TEXT, fontSize: "9px" }}>0.25pt</span></td>
                  <td style={{ ...tdStyle, backgroundColor: "rgba(201,168,76,0.06)", color: "white" }}>{prime.webcam}</td>
                  {selectedBrandProducts.map((comp, i) => {
                    const wc = { "720p": 1, "1080p": 2, "1440p": 3 }
                    const pts = (wc[prime.webcam] || 1) > (wc[comp.webcam] || 1) ? 0.25 : (wc[prime.webcam] || 1) === (wc[comp.webcam] || 1) ? 0.125 : 0
                    const win = (wc[prime.webcam] || 1) > (wc[comp.webcam] || 1); const eq = (wc[prime.webcam] || 1) === (wc[comp.webcam] || 1)
                    const c = eq ? "#f97316" : win ? GOLD : "#ef4444"
                    return <td key={i} style={tdStyle}>{comp.webcam}
                      <span style={{ background: `${c}22`, color: c, padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: "700", marginLeft: "4px" }}>
                        {eq ? "EQUAL" : win ? "WIN" : "LOSE"} +{pts}
                      </span>
                    </td>
                  })}
                </tr>

                {/* KEYBOARD ROW */}
                <tr>
                  <td style={{ ...tdStyle, borderRight: `1px solid ${BORDER}`, color: TEXT, fontWeight: "700" }}>Keyboard <span style={{ color: TEXT, fontSize: "9px" }}>0.25pt</span></td>
                  <td style={{ ...tdStyle, backgroundColor: "rgba(201,168,76,0.06)", color: "white" }}>Backlit</td>
                  {selectedBrandProducts.map((comp, i) => {
                    const pts = prime.backlit && !comp.keyboard_backlit ? 0.25 : prime.backlit === comp.keyboard_backlit ? 0.125 : 0
                    const win = prime.backlit && !comp.keyboard_backlit; const eq = prime.backlit === comp.keyboard_backlit
                    const c = eq ? "#f97316" : win ? GOLD : "#ef4444"
                    return <td key={i} style={tdStyle}>{comp.keyboard_backlit ? "Backlit" : "No"}
                      <span style={{ background: `${c}22`, color: c, padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: "700", marginLeft: "4px" }}>
                        {eq ? "EQUAL" : win ? "WIN" : "LOSE"} +{pts}
                      </span>
                    </td>
                  })}
                </tr>

                {/* OS ROW */}
                <tr>
                  <td style={{ ...tdStyle, borderRight: `1px solid ${BORDER}`, color: TEXT, fontWeight: "700" }}>OS <span style={{ color: GOLD, fontSize: "9px" }}>2pts</span></td>
                  <td style={{ ...tdStyle, backgroundColor: "rgba(201,168,76,0.06)", color: "white" }}>Android 15</td>
                  {selectedBrandProducts.map((comp, i) => {
                    const pts = prime.os.includes("15") ? 2 : 0
                    return <td key={i} style={tdStyle}>{comp.os}
                      <span style={{ background: `${GOLD}22`, color: GOLD, padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: "700", marginLeft: "4px" }}>
                        WIN +{pts}
                      </span>
                    </td>
                  })}
                </tr>

                {/* RATING ROW */}
                <tr>
                  <td style={{ ...tdStyle, borderRight: `1px solid ${BORDER}`, color: TEXT, fontWeight: "700" }}>Rating</td>
                  <td style={{ ...tdStyle, backgroundColor: "rgba(201,168,76,0.06)", color: "white" }}>—</td>
                  {selectedBrandProducts.map((comp, i) => (
                    <td key={i} style={tdStyle}>
                      <span style={{ color: GOLD }}>{"★".repeat(Math.round(comp.rating || 0))}</span>
                      <span style={{ color: BORDER }}>{"★".repeat(5 - Math.round(comp.rating || 0))}</span>
                      <span style={{ color: MUTED, fontSize: "10px" }}> ({comp.reviews || 0})</span>
                    </td>
                  ))}
                </tr>

              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}