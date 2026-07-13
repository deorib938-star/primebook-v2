import { useState, useEffect } from "react"
import axios from "axios"

const API = (import.meta.env.VITE_API_URL || `http://${location.hostname}:8000`)

// ── palette (purple/blue enterprise) ─────────────────────────────────────────
const BG = "#0b0e16", TEXT = "#94a3b8", DIM = "#64748b", WHITE = "#e5e9f0"
const PURPLE = "#8b5cf6", BLUE = "#60a5fa", GREEN = "#22c55e", RED = "#ef4444", ORANGE = "#f59e0b", CYAN = "#22d3ee"
const glass = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 }
const kicker = { color: PURPLE, fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }
const lbl = { color: DIM, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }

const BRAND_COLOR = { hp: "#0096D6", lenovo: "#E2231A", acer: "#83B81A", dell: "#007DB8", asus: "#FF6600" }
const COMPETITORS = [
  { id: "hp", label: "HP" }, { id: "lenovo", label: "Lenovo" }, { id: "acer", label: "Acer" },
  { id: "dell", label: "Dell" }, { id: "asus", label: "Asus" },
]
const sev = s => /high|p0/i.test(s) ? RED : /med|p1/i.test(s) ? ORANGE : GREEN
const STANCE = { attack: RED, defend: BLUE, copy: ORANGE, differentiate: GREEN }

// ── atoms ─────────────────────────────────────────────────────────────────────
const AIBadge = () => <span style={{ background: "linear-gradient(90deg,#8b5cf6,#60a5fa)", color: "white", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 20 }}>AI</span>
const Badge = ({ text, color }) => <span style={{ background: `${color}22`, color, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 5, whiteSpace: "nowrap" }}>{text}</span>
const Loading = ({ what = "analysis" }) => <div style={{ color: DIM, padding: 50, textAlign: "center" }}>✦ Generating {what}…</div>
const ErrBox = ({ e }) => <div style={{ color: RED, padding: 16 }}>AI error: {String(e).slice(0, 160)} — the free-tier token limit may be momentarily hit; try Regenerate shortly.</div>

// ── deep competitor report ────────────────────────────────────────────────────
export default function AIResearch() {
  const [brand, setBrand] = useState("all")
  const [d, setD] = useState(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    setD(null)
    const refresh = nonce > 0
    const url = brand === "all" ? `${API}/research/all` : `${API}/research/competitor/${brand}`
    axios.get(url, { params: refresh ? { refresh: 1 } : {} })
      .then(r => setD(r.data)).catch(() => setD({ error: 1 }))
    // eslint-disable-next-line
  }, [brand, nonce])

  const bc = brand === "all" ? PURPLE : (BRAND_COLOR[brand] || PURPLE)
  const para = (title, text) => (
    <div style={glass}><div style={{ ...lbl, color: PURPLE }}>{title}</div><div style={{ color: "#cbd5e1", fontSize: 12.5, lineHeight: 1.6, marginTop: 6 }}>{text}</div></div>
  )
  const quad = (title, items, color) => (
    <div style={{ ...glass, borderTop: `2px solid ${color}` }}>
      <div style={{ ...lbl, color }}>{title}</div>
      <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: TEXT, fontSize: 12, lineHeight: 1.6 }}>{(items || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "'Inter',sans-serif", padding: "26px 32px" }}>
      <style>{`@media print { .air-top { display:none !important } }`}</style>

      {/* header */}
      <div className="air-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <div style={kicker}>Competitive Intelligence</div>
          <div style={{ color: WHITE, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 4 }}>AI Research</div>
          <div style={{ color: DIM, fontSize: 13, marginTop: 3, maxWidth: 640 }}>Expert analyst deep-dive on one competitor — synthesising Overview, News, Social (YouTube + Instagram) and Pricing into an objective, actionable report.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => window.print()} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: TEXT, fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>⭳ Export</button>
          <button onClick={() => setNonce(n => n + 1)} style={{ background: "linear-gradient(90deg,#8b5cf6,#60a5fa)", color: "white", border: "none", fontSize: 12, fontWeight: 700, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>✦ Regenerate</button>
        </div>
      </div>

      {/* competitor selector — All brands first, then each competitor */}
      <div className="air-top" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {[{ id: "all", label: "All brands" }, ...COMPETITORS].map(b => {
          const on = brand === b.id
          const col = b.id === "all" ? PURPLE : BRAND_COLOR[b.id]
          return <button key={b.id} onClick={() => { setNonce(0); setBrand(b.id) }} style={{ padding: "8px 18px", fontSize: 13, borderRadius: 20, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? col : "rgba(255,255,255,0.12)"}`, background: on ? col : "transparent", color: on ? "#0b0e16" : TEXT, fontWeight: on ? 700 : 500 }}>{b.label}</button>
        })}
      </div>

      {!d ? <Loading what={brand === "all" ? "market summary" : "deep competitor report"} /> : d.error ? <ErrBox e={d.error} /> : brand === "all" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
          {/* MARKET-WIDE SUMMARY */}
          <div style={{ ...glass, borderColor: `${PURPLE}66`, background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(96,165,250,0.03))" }}>
            <div style={{ ...lbl, color: PURPLE }}>Market Executive Summary <AIBadge /></div>
            <div style={{ color: WHITE, fontSize: 15, lineHeight: 1.6, marginTop: 8 }}>{d.executive_summary}</div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
              {(d.key_insights || []).map((x, i) => (
                <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}><span style={{ color: PURPLE, marginTop: 1 }}>▸</span><span style={{ color: "#cbd5e1", fontSize: 12.5, lineHeight: 1.5 }}>{x}</span></div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ ...kicker, marginBottom: 10 }}>Where each brand stands</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
              {(d.brand_takes || []).map((bt, i) => {
                const c = BRAND_COLOR[(bt.brand || "").toLowerCase()] || PURPLE
                return <div key={i} style={{ ...glass, borderTop: `2px solid ${c}` }}><div style={{ color: c, fontWeight: 700, fontSize: 13 }}>{bt.brand}</div><div style={{ color: "#cbd5e1", fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{bt.take}</div></div>
              })}
            </div>
          </div>

          <div style={glass}>
            <div style={{ ...lbl, color: CYAN }}>Market trends</div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: TEXT, fontSize: 12.5, lineHeight: 1.7 }}>{(d.market_trends || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>

          <div style={{ ...glass, borderColor: "rgba(201,168,76,0.4)" }}>
            <div style={{ ...lbl, color: "#C9A84C" }}>Primebook's position</div>
            <div style={{ color: WHITE, fontSize: 13.5, marginTop: 6, lineHeight: 1.6 }}>{d.primebook_position}</div>
          </div>

          <div>
            <div style={{ ...kicker, marginBottom: 10 }}>✓ Recommendations for Primebook</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(d.recommendations || []).map((r, i) => {
                const sc = STANCE[(r.stance || "").toLowerCase()] || PURPLE
                return (
                  <div key={i} style={{ ...glass, borderLeft: `3px solid ${sc}` }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Badge text={(r.stance || "").toUpperCase()} color={sc} />
                      <Badge text={r.priority} color={sev(r.priority)} />
                      <span style={{ color: WHITE, fontWeight: 700, fontSize: 13.5 }}>{r.action}</span>
                    </div>
                    <div style={{ color: TEXT, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{r.rationale}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {(d.data_gaps || []).length > 0 && (
            <div style={{ ...glass, borderColor: "rgba(245,158,11,0.4)" }}>
              <div style={{ ...lbl, color: ORANGE }}>⚑ Data gaps / low-confidence areas</div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: TEXT, fontSize: 11.5, lineHeight: 1.6 }}>{d.data_gaps.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          <div style={{ color: DIM, fontSize: 10 }}>Generated {d.generated} · market-wide synthesis across all tracked competitors.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
          {/* 1. Executive summary + key insights */}
          <div style={{ ...glass, borderColor: `${bc}66`, background: `linear-gradient(135deg, ${bc}18, rgba(96,165,250,0.03))` }}>
            <div style={{ ...lbl, color: bc }}>Executive Summary · {d.competitor} <AIBadge /></div>
            <div style={{ color: WHITE, fontSize: 15, lineHeight: 1.6, marginTop: 8 }}>{d.executive_summary}</div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
              {(d.key_insights || []).map((x, i) => (
                <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}><span style={{ color: bc, marginTop: 1 }}>▸</span><span style={{ color: "#cbd5e1", fontSize: 12.5, lineHeight: 1.5 }}>{x}</span></div>
              ))}
            </div>
          </div>

          {/* 2. 360 snapshot */}
          <div>
            <div style={{ ...kicker, marginBottom: 10 }}>360° Snapshot</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              {[["Growth", "growth"], ["Pricing", "pricing"], ["Sentiment", "sentiment"], ["Visibility", "visibility"], ["Positioning", "positioning"]].map(([t, k]) => (
                <div key={k} style={glass}><div style={lbl}>{t}</div><div style={{ color: "#cbd5e1", fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{d.snapshot?.[k]}</div></div>
              ))}
            </div>
          </div>

          {/* 3. Deep analysis */}
          <div style={{ ...kicker, marginTop: 4 }}>Deep Analysis</div>
          {para("Market & Pricing Intelligence", d.market_pricing)}
          {para("Narrative & Sentiment", d.narrative_sentiment)}
          {para("Content & Audience Strategy", d.content_audience)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {quad("Strengths", d.swot?.strengths, GREEN)}
            {quad("Weaknesses", d.swot?.weaknesses, RED)}
            {quad("Opportunities", d.swot?.opportunities, BLUE)}
            {quad("Threats", d.swot?.threats, ORANGE)}
          </div>
          <div style={glass}>
            <div style={{ ...lbl, color: CYAN }}>Cross-Insights (cause → effect)</div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: TEXT, fontSize: 12.5, lineHeight: 1.7 }}>{(d.cross_insights || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>

          {/* 4. Forward-looking */}
          <div style={{ ...kicker, marginTop: 4 }}>Forward-Looking</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={glass}>
              <div style={{ ...lbl, color: PURPLE }}>Likely next moves / risks</div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: TEXT, fontSize: 12, lineHeight: 1.6 }}>{(d.forward?.next_moves || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ ...glass, borderLeft: `3px solid ${GREEN}` }}><div style={{ ...lbl, color: GREEN }}>Best case (3–6 mo)</div><div style={{ color: TEXT, fontSize: 12, marginTop: 5, lineHeight: 1.5 }}>{d.forward?.best_case}</div></div>
              <div style={{ ...glass, borderLeft: `3px solid ${RED}` }}><div style={{ ...lbl, color: RED }}>Worst case (3–6 mo)</div><div style={{ color: TEXT, fontSize: 12, marginTop: 5, lineHeight: 1.5 }}>{d.forward?.worst_case}</div></div>
            </div>
          </div>

          {/* 5. Recommendations */}
          <div>
            <div style={{ ...kicker, marginBottom: 10 }}>✓ Recommendations for Primebook</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(d.recommendations || []).map((r, i) => {
                const sc = STANCE[(r.stance || "").toLowerCase()] || PURPLE
                return (
                  <div key={i} style={{ ...glass, borderLeft: `3px solid ${sc}` }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Badge text={(r.stance || "").toUpperCase()} color={sc} />
                      <Badge text={r.priority} color={sev(r.priority)} />
                      <span style={{ color: WHITE, fontWeight: 700, fontSize: 13.5 }}>{r.action}</span>
                    </div>
                    <div style={{ color: TEXT, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{r.rationale}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {(d.data_gaps || []).length > 0 && (
            <div style={{ ...glass, borderColor: "rgba(245,158,11,0.4)" }}>
              <div style={{ ...lbl, color: ORANGE }}>⚑ Data gaps / low-confidence areas</div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: TEXT, fontSize: 11.5, lineHeight: 1.6 }}>{d.data_gaps.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          <div style={{ color: DIM, fontSize: 10 }}>Generated {d.generated} · objective synthesis of tracked Overview, News, YouTube, Instagram & Pricing data. AI analysis — flag anything marked as a data gap.</div>
        </div>
      )}
    </div>
  )
}
