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

  const selectedBrandProducts = products[selectedComp]?.products || []

  return (
    <div style={{ padding: "32px" }}>

      {/* Header */}
      <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em" }}>COMPETITOR ANALYSIS</p>
      <h1 style={{ color: "white", fontSize: "24px", fontWeight: "700", marginTop: "4px" }}>Intelligence Overview</h1>
      <p style={{ color: MUTED, fontSize: "13px", marginTop: "4px" }}>All laptop brands under Rs. 10,000 - Rs. 40,000</p>
      <div style={{ height: "1px", backgroundColor: BORDER, marginTop: "16px", marginBottom: "24px" }}></div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
        {[
          { label: "BRANDS TRACKED",   value: Object.keys(competitors).length },
          { label: "PRODUCTS SCRAPED", value: allCompProducts.length },
          { label: "PRICE RANGE",      value: "₹10K-40K" },
          { label: "LAST UPDATED",     value: products.last_updated?.split(" ")[0] || "Today" },
        ].map((stat, i) => (
          <div key={i} style={{ backgroundColor: CARD, borderRadius: "8px", padding: "20px", border: `0.5px solid ${BORDER}`, borderTop: `2px solid ${GOLD}` }}>
            <p style={{ color: MUTED, fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em" }}>{stat.label}</p>
            <p style={{ color: GOLD, fontSize: "28px", fontWeight: "800", fontFamily: "monospace", marginTop: "8px" }}>{stat.value}</p>
          </div>
        ))}
      </div>

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
          
          <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em", marginBottom: "12px" }}>
            COMPARISON — {prime.name.toUpperCase()} vs ALL {competitors[selectedComp]?.name?.toUpperCase()} PRODUCTS
          </p>

          <div style={{ overflowX: "auto", borderRadius: "8px", border: `0.5px solid ${BORDER}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, color: GOLD, minWidth: "180px" }}>Product</th>
                  <th style={thStyle}>Price <Pt pts="3 pts" color={GOLD} /></th>
                  <th style={thStyle}>RAM <Pt pts="2 pts" color={GOLD} /></th>
                  <th style={thStyle}>Storage <Pt pts="1 pt" color="#60a5fa" /></th>
                  <th style={thStyle}>Display <Pt pts="0.5 pt" color={TEXT} /></th>
                  <th style={thStyle}>Battery <Pt pts="1 pt" color="#60a5fa" /></th>
                  <th style={thStyle}>Webcam <Pt pts="0.25 pt" color={TEXT} /></th>
                  <th style={thStyle}>Keyboard <Pt pts="0.25 pt" color={TEXT} /></th>
                  <th style={thStyle}>OS <Pt pts="2 pts" color={GOLD} /></th>
                  <th style={thStyle}>Rating</th>
                  <th style={thStyle}>Score</th>
                  <th style={thStyle}>Result</th>
                </tr>
              </thead>
              <tbody>
                {/* Primebook row */}
                <tr>
                  <td style={{ ...primeTd, borderLeft: `3px solid ${GOLD}` }}>
                    <p style={{ color: GOLD, fontSize: "10px", fontWeight: "700", margin: 0 }}>PRIMEBOOK</p>
                    <p style={{ color: "white", fontWeight: "700", margin: "2px 0 0 0" }}>{prime.name}</p>
                  </td>
                  <td style={primeTd}><span style={{ color: GOLD, fontFamily: "monospace", fontWeight: "700" }}>Rs. {prime.price.toLocaleString()}</span></td>
                  <td style={primeTd}>{prime.ram} GB</td>
                  <td style={primeTd}>{prime.storage} GB</td>
                  <td style={primeTd}>{prime.display}"</td>
                  <td style={primeTd}>{prime.battery} hrs</td>
                  <td style={primeTd}>{prime.webcam}</td>
                  <td style={primeTd}>Backlit</td>
                  <td style={primeTd}>Android 15</td>
                  <td style={primeTd}>—</td>
                  <td style={primeTd}>—</td>
                  <td style={primeTd}>—</td>
                </tr>

                {selectedBrandProducts.map((comp, i) => {
                  const score = getScore(prime, comp)
                  const { label, color } = scoreLabel(score)

                  const priceTag = prime.price <= comp.price_inr ? 3 : prime.price <= comp.price_inr * 1.3 ? 2 : prime.price <= comp.price_inr * 1.5 ? 1 : 0
                  const ramTag = prime.ram > comp.ram_gb ? 2 : prime.ram === comp.ram_gb ? 1 : 0
                  const storageTag = prime.storage > comp.storage_gb ? 1 : prime.storage === comp.storage_gb ? 0.5 : 0
                  const displayTag = prime.display > comp.display_inch ? 0.5 : prime.display === comp.display_inch ? 0.25 : 0
                  const batteryTag = prime.battery > comp.battery_hours ? 1 : prime.battery === comp.battery_hours ? 0.5 : 0
                  const wc = { "720p": 1, "1080p": 2, "1440p": 3 }
                  const webcamTag = (wc[prime.webcam] || 1) > (wc[comp.webcam] || 1) ? 0.25 : (wc[prime.webcam] || 1) === (wc[comp.webcam] || 1) ? 0.125 : 0
                  const keyTag = prime.backlit && !comp.keyboard_backlit ? 0.25 : prime.backlit === comp.keyboard_backlit ? 0.125 : 0
                  const osTag = prime.os.includes("15") ? 2 : 0

                  const pt = (pts, a, b, higher = true) => {
                    const win = higher ? a > b : a < b
                    const eq = a === b
                    const c = eq ? "#f97316" : win ? GOLD : "#ef4444"
                    return (
                      <span style={{ background: `${c}22`, color: c, padding: "1px 5px", borderRadius: "3px", fontSize: "10px", fontWeight: "700", marginLeft: "4px" }}>
                        {eq ? "=" : win ? "WIN" : "LOSE"} +{pts}
                      </span>
                    )
                  }

                  return (
                    <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                      <td style={{ ...tdStyle, borderLeft: `3px solid ${color}` }}>
                        <p style={{ color: TEXT, fontSize: "10px", margin: 0 }}>#{i + 1} {competitors[selectedComp]?.name}</p>
                        <p style={{ color: "white", fontWeight: "600", fontSize: "11px", margin: "2px 0 0 0", whiteSpace: "normal", lineHeight: "1.4", maxWidth: "200px" }}>
                          {comp.name?.slice(0, 60)}
                        </p>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: "monospace" }}>Rs. {comp.price_inr?.toLocaleString()}</span>
                        {pt(priceTag, comp.price_inr, prime.price, true)}
                      </td>
                      <td style={tdStyle}>{comp.ram_gb} GB {pt(ramTag, prime.ram, comp.ram_gb)}</td>
                      <td style={tdStyle}>{comp.storage_gb} GB {pt(storageTag, prime.storage, comp.storage_gb)}</td>
                      <td style={tdStyle}>{comp.display_inch}" {pt(displayTag, prime.display, comp.display_inch)}</td>
                      <td style={tdStyle}>{comp.battery_hours} hrs {pt(batteryTag, prime.battery, comp.battery_hours)}</td>
                      <td style={tdStyle}>{comp.webcam} {pt(webcamTag, wc[prime.webcam] || 1, wc[comp.webcam] || 1)}</td>
                      <td style={tdStyle}>{comp.keyboard_backlit ? "Backlit" : "No"} {pt(keyTag, prime.backlit ? 1 : 0, comp.keyboard_backlit ? 1 : 0)}</td>
                      <td style={tdStyle}>{comp.os} {pt(osTag, prime.os.includes("15") ? 1 : 0, 0)}</td>
                      <td style={tdStyle}>
                        <span style={{ color: GOLD }}>{"★".repeat(Math.round(comp.rating || 0))}</span>
                        <span style={{ color: BORDER }}>{"★".repeat(5 - Math.round(comp.rating || 0))}</span>
                        <span style={{ color: MUTED, fontSize: "10px" }}> ({comp.reviews || 0})</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color, fontFamily: "monospace", fontWeight: "700", fontSize: "18px" }}>{score}</span>
                        <span style={{ color: BORDER, fontSize: "12px" }}>/10</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ background: `${color}22`, color, padding: "3px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "700" }}>{label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}