import { useState, useEffect } from "react"
import axios from "axios"

const API = (import.meta.env.VITE_API_URL || `http://${location.hostname}:8000`)

const GOLD = "#C9A84C", CARD = "#1e293b", PANEL = "#0f172a", BORDER = "#334155", MUTED = "#64748b", TEXT = "#94a3b8"
const GREEN = "#22c55e", BLUE = "#3b82f6", RED = "#ef4444", ORANGE = "#f97316"

const BRANDS = [
  { id: "hp", label: "HP", color: "#0096D6" },
  { id: "lenovo", label: "Lenovo", color: "#E2231A" },
  { id: "acer", label: "Acer", color: "#83B81A" },
  { id: "dell", label: "Dell", color: "#007DB8" },
  { id: "asus", label: "Asus", color: "#FF6600" },
]
const BRAND_MAP = Object.fromEntries(BRANDS.map(b => [b.id, b]))

const card = { background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: 12, padding: 18 }
const label = { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }
const sentColor = s => /pos/i.test(s) ? GREEN : /neg/i.test(s) ? RED : BLUE

// Convert any "$1,234.56" amounts in text to approx ₹ (a lot of deal news is US-sourced).
const USD_INR = 83
function toINR(text) {
  if (text == null) return text
  return String(text).replace(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g, (m, n) => {
    const v = parseFloat(n.replace(/,/g, ""))
    return isNaN(v) ? m : "₹" + Math.round(v * USD_INR).toLocaleString("en-IN")
  })
}

function timeAgo(dateStr) {
  if (!dateStr) return ""
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
  return `${Math.floor(diff / 2592000)}mo ago`
}
function Section({ children, note }) {
  return <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
    <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700 }}>{children}</span>
    {note && <span style={{ color: MUTED, fontSize: 11 }}>· {note}</span>}
  </div>
}

// ── per-article AI (lazy) ─────────────────────────────────────────────────────
function NewsAI({ brand, idx }) {
  const [open, setOpen] = useState(false)
  const [ai, setAi] = useState(null)
  const [loading, setLoading] = useState(false)
  function toggle() {
    const n = !open; setOpen(n)
    if (n && !ai && !loading) {
      setLoading(true)
      axios.get(`${API}/news/ai/article?brand=${brand}&i=${idx}`)
        .then(r => setAi(r.data)).catch(() => setAi({ error: 1 })).finally(() => setLoading(false))
    }
  }
  return (
    <div style={{ borderTop: `0.5px solid ${BORDER}`, marginTop: 10 }}>
      <button onClick={toggle} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", color: GOLD, fontSize: 11, fontWeight: 600, padding: "7px 0", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
        🧠 {open ? "Hide AI analysis" : "AI analysis — summary, sentiment & emotion"}
      </button>
      {open && (
        <div style={{ paddingBottom: 10 }}>
          {loading || !ai ? <div style={{ color: MUTED, fontSize: 11 }}>Analyzing…</div>
            : ai.error ? <div style={{ color: RED, fontSize: 11 }}>Analysis failed — try again.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ background: `${sentColor(ai.sentiment)}22`, color: sentColor(ai.sentiment), fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 4 }}>{ai.sentiment}</span>
                  {ai.emotion && <span style={{ background: "rgba(148,163,184,0.15)", color: TEXT, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>{ai.emotion}</span>}
                  {ai.topic && <span style={{ background: `${GOLD}22`, color: GOLD, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>{ai.topic}</span>}
                </div>
                <div style={{ color: TEXT, fontSize: 12, lineHeight: 1.55 }}>{toINR(ai.summary)}</div>
                {(ai.points || []).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
                    {ai.points.map((pt, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, flexShrink: 0, marginTop: 6 }} />
                        <span style={{ color: TEXT, fontSize: 12, lineHeight: 1.5 }}>{toINR(pt)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {ai.primebook_angle && <div style={{ color: TEXT, fontSize: 11.5, lineHeight: 1.5, marginTop: 2 }}><b style={{ color: GOLD }}>Primebook angle:</b> {toINR(ai.primebook_angle)}</div>}
              </div>
            )}
        </div>
      )}
    </div>
  )
}

function ArticleCard({ a }) {
  const brand = BRAND_MAP[a.brand]
  return (
    <div style={{ border: `0.5px solid ${BORDER}`, borderRadius: 10, marginBottom: 10, padding: "14px 16px" }}>
      <a href={a.url} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 14, textDecoration: "none" }}>
        <div style={{ width: 100, height: 72, borderRadius: 6, flexShrink: 0, overflow: "hidden", background: PANEL }}>
          {a.image && <img src={a.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.4, marginBottom: 5 }}>{toINR(a.title)}</div>
          <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{toINR(a.description)}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11, color: MUTED }}>
            <span style={{ background: `${brand?.color || GOLD}22`, color: brand?.color || GOLD, padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: 10 }}>{brand?.label || a.brand}</span>
            <span>{a.source}</span><span>{timeAgo(a.published_at)}</span>
          </div>
        </div>
      </a>
      <NewsAI brand={a.brand} idx={a._idx} />
    </div>
  )
}

// ── Intelligence view ─────────────────────────────────────────────────────────
function IntelligenceView() {
  const [d, setD] = useState(null)
  useEffect(() => { axios.get(`${API}/news/ai/intelligence`).then(r => setD(r.data)).catch(() => setD({ error: 1 })) }, [])
  if (!d) return <div style={{ color: MUTED, padding: 40, textAlign: "center" }}>🧠 Generating news intelligence…</div>
  if (d.error) return <div style={{ color: RED, padding: 20 }}>AI error: {String(d.error).slice(0, 160)}</div>
  const s = d.sentiment || {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Executive summary */}
      <div style={{ ...card, borderColor: GOLD }}>
        <div style={{ ...label, color: GOLD }}>Executive summary</div>
        <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>{toINR(d.executive_summary)}</div>
        {(d.summary_points || []).length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {d.summary_points.map((pt, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, flexShrink: 0, marginTop: 6 }} />
                <span style={{ color: TEXT, fontSize: 12.5, lineHeight: 1.55 }}>{toINR(pt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sentiment + topics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}>
          <Section note={s.label}>Overall sentiment</Section>
          <div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${s.positive || 0}%`, background: GREEN }} />
            <div style={{ width: `${s.neutral || 0}%`, background: MUTED }} />
            <div style={{ width: `${s.negative || 0}%`, background: RED }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11 }}>
            <span style={{ color: GREEN }}>😊 {s.positive}% pos</span>
            <span style={{ color: MUTED }}>😐 {s.neutral}% neu</span>
            <span style={{ color: RED }}>😞 {s.negative}% neg</span>
          </div>
        </div>
        <div style={card}>
          <Section note="sentiment by topic">Emotion by topic</Section>
          {(d.topics || []).map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 74, color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{t.topic}</span>
              <span style={{ background: `${sentColor(t.sentiment)}22`, color: sentColor(t.sentiment), fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3 }}>{(t.sentiment || "").toUpperCase()}</span>
              <span style={{ color: TEXT, fontSize: 11, flex: 1 }}>{t.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Anomalies */}
      <div style={{ ...card, borderColor: (d.anomalies || []).length ? RED : BORDER }}>
        <Section note="sudden negative / volume spikes">⚠ Anomaly detection</Section>
        {(d.anomalies || []).length === 0
          ? <div style={{ color: GREEN, fontSize: 12 }}>No unusual negative or volume spikes detected in the current news set.</div>
          : (d.anomalies).map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
              <span style={{ background: `${RED}22`, color: RED, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>{(a.signal || "SPIKE").toUpperCase()}</span>
              <span style={{ color: TEXT, fontSize: 12 }}><b style={{ color: "#e2e8f0" }}>{a.brand}:</b> {a.detail}</span>
            </div>
          ))}
      </div>

      {/* Emerging trends */}
      <div style={card}>
        <Section note="topics gaining momentum across competitors">Emerging trends</Section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          {(d.emerging_trends || []).map((t, i) => (
            <div key={i} style={{ background: PANEL, borderRadius: 8, padding: 12 }}>
              <div style={{ color: "#f1f5f9", fontSize: 12, fontWeight: 700 }}>📈 {t.trend}</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "6px 0" }}>
                {(t.brands || []).map((b, j) => <span key={j} style={{ background: "rgba(148,163,184,0.15)", color: TEXT, fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3 }}>{b}</span>)}
              </div>
              <div style={{ color: TEXT, fontSize: 11, lineHeight: 1.5 }}>{t.note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Competitive intelligence */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}>
          <Section note="how each brand frames itself in the news">Positioning</Section>
          {(d.positioning || []).map((p, i) => {
            const b = BRANDS.find(x => x.label.toLowerCase() === (p.brand || "").toLowerCase()) || {}
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <span style={{ color: b.color || GOLD, fontSize: 12, fontWeight: 700 }}>{p.brand}</span>
                <span style={{ color: TEXT, fontSize: 11.5 }}> — {p.point}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={card}>
            <Section note="who reacts fastest to market events">Speed of response</Section>
            <div style={{ color: TEXT, fontSize: 12, lineHeight: 1.55 }}>{d.response_speed}</div>
          </div>
          <div style={card}>
            <Section>Innovation signals</Section>
            <ul style={{ margin: 0, paddingLeft: 16, color: TEXT, fontSize: 12, lineHeight: 1.7 }}>
              {(d.innovation_signals || []).map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Feed view ─────────────────────────────────────────────────────────────────
function FeedView({ newsData }) {
  const [brand, setBrand] = useState("all")
  const byBrand = newsData?.by_brand || {}
  // GNews queries ("HP laptop") sometimes return articles about other brands;
  // on a brand tab, keep only articles that actually mention that brand.
  const mentions = (a, bid) => {
    const name = (BRAND_MAP[bid]?.label || bid).toLowerCase()
    return `${a.title || ""} ${a.description || ""}`.toLowerCase().includes(name)
  }
  let feed
  if (brand === "all") {
    feed = Object.entries(byBrand).flatMap(([bid, arr]) => (arr || []).map((a, idx) => ({ ...a, brand: bid, _idx: idx })))
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
  } else {
    const tagged = (byBrand[brand] || []).map((a, idx) => ({ ...a, brand, _idx: idx }))
    const filtered = tagged.filter(a => mentions(a, brand))
    feed = filtered.length ? filtered : tagged   // fall back to unfiltered if nothing matches
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 0, marginBottom: 18, borderBottom: `1px solid ${PANEL}`, flexWrap: "wrap" }}>
        {[{ id: "all", label: "All brands", color: GOLD }, ...BRANDS].map(b => (
          <button key={b.id} onClick={() => setBrand(b.id)} style={{
            padding: "10px 18px", fontSize: 13, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit",
            color: brand === b.id ? "#f1f5f9" : MUTED,
            borderBottom: `2px solid ${brand === b.id ? b.color : "transparent"}`, marginBottom: -1,
          }}>{b.label}</button>
        ))}
      </div>
      {feed.length === 0 ? <div style={{ textAlign: "center", padding: 50, color: "#475569" }}>No news found</div>
        : feed.map((a, i) => <ArticleCard key={a.url || i} a={a} />)}
    </div>
  )
}

export default function News() {
  const [tab, setTab] = useState("intel")
  const [newsData, setNewsData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    axios.get(`${API}/news`).then(res => setNewsData(res.data)).catch(() => setError("Could not load news"))
  }, [])

  return (
    <div style={{ padding: "28px 32px", minHeight: "100vh", background: "#0f1117", color: "#e2e8f0" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>News & Intelligence</div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
          Competitor laptop news — HP · Lenovo · Acer · Dell · Asus
          {newsData?.last_updated && <span> · Updated {timeAgo(newsData.last_updated)}</span>}
        </div>
      </div>

      {error && <div style={{ background: "#450a0a20", border: "1px solid #7f1d1d", color: "#fca5a5", padding: "14px 18px", borderRadius: 10, fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[{ id: "intel", label: "Intelligence" }, { id: "feed", label: "Article feed" }].map(t => {
          const on = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "9px 16px", fontSize: 12, borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${on ? GOLD : BORDER}`, background: on ? "rgba(201,168,76,0.12)" : "transparent",
              color: on ? GOLD : TEXT, fontWeight: on ? 600 : 500,
            }}>{t.label}</button>
          )
        })}
      </div>

      {tab === "intel" && <IntelligenceView />}
      {tab === "feed" && <FeedView newsData={newsData} />}

      <div style={{ marginTop: 20, color: MUTED, fontSize: 10, lineHeight: 1.5 }}>
        AI summaries & sentiment are generated from article headlines + snippets (GNews free tier has no full article text). Anomaly detection works over the current news set, not a long history.
      </div>
    </div>
  )
}
