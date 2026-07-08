import { useState, useEffect } from "react"
import axios from "axios"

const API = (import.meta.env.VITE_API_URL || `http://${location.hostname}:8000`)

const BRANDS = [
  { id: "hp",     label: "HP",     color: "#0096D6" },
  { id: "lenovo", label: "Lenovo", color: "#E2231A" },
  { id: "acer",   label: "Acer",   color: "#83B81A" },
  { id: "dell",   label: "Dell",   color: "#007DB8" },
  { id: "asus",   label: "Asus",   color: "#FF6600" },
]
const BRAND_MAP = Object.fromEntries(BRANDS.map(b => [b.id, b]))

function timeAgo(dateStr) {
  if (!dateStr) return ""
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
  return `${Math.floor(diff / 2592000)}mo ago`
}

function NewsCard({ article }) {
  const brand = BRAND_MAP[article.brand]
  return (
    <a href={article.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
      <div style={{
        display: "flex", gap: 14, padding: "14px 16px",
        border: "0.5px solid #334155", borderRadius: 10, marginBottom: 10,
        cursor: "pointer", transition: "border-color 0.15s",
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#475569"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "#334155"}
      >
        <div style={{ width: 100, height: 72, borderRadius: 6, flexShrink: 0, overflow: "hidden", background: "#0f172a" }}>
          {article.image
            ? <img src={article.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
            : null
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.4, marginBottom: 5 }}>
            {article.title}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {article.description}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 11, color: "#64748b" }}>
            <span style={{
              background: `${brand?.color || "#C9A84C"}22`,
              color: brand?.color || "#C9A84C",
              padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: 10,
            }}>{brand?.label || article.brand}</span>
            <span>{article.source}</span>
            <span>{timeAgo(article.published_at)}</span>
          </div>
        </div>
      </div>
    </a>
  )
}

export default function News() {
  const [activeTab, setActiveTab] = useState("all")
  const [newsData, setNewsData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    axios.get(`${API}/news`)
      .then(res => setNewsData(res.data))
      .catch(() => setError("Could not load news"))
      .finally(() => setLoading(false))

    setSummaryLoading(true)
    axios.get(`${API}/news/ai-summary`)
      .then(res => {
        if (!res.data.error) setSummary(res.data)
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false))
  }, [])

  const articles = activeTab === "all"
    ? (newsData?.all || [])
    : (newsData?.by_brand?.[activeTab] || [])

  return (
    <div style={{ padding: "28px 32px", minHeight: "100vh", background: "#0f1117", color: "#e2e8f0" }}>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>News & Insights</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
          Competitor laptop news — HP, Lenovo, Acer, Dell, Asus
          {newsData?.last_updated && (
            <span> · Updated {timeAgo(newsData.last_updated)}</span>
          )}
        </div>
      </div>
{/* AI News Summary */}
      {summaryLoading ? (
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "16px 20px", marginBottom: 20, fontSize: 13, color: "#64748b" }}>
          Groq AI summarizing this week's news...
        </div>
      ) : summary ? (
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🧠</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{summary.headline}</span>
            <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto" }}>Groq LLaMA 3.3 70B</span>
          </div>
          <div style={{ padding: 16 }}>
            {(summary.summary_points || []).map((point, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < summary.summary_points.length - 1 ? "0.5px solid #1e293b" : "none" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C9A84C", flexShrink: 0, marginTop: 6 }}></div>
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{point}</div>
              </div>
            ))}

            {summary.brand_highlights && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "0.5px solid #1e293b" }}>
                {BRANDS.map(b => {
                  const text = summary.brand_highlights[b.id]
                  if (!text) return null
                  return (
                    <div key={b.id} style={{ background: "#0f172a", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: b.color, marginBottom: 4 }}>{b.label}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>{text}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #1e293b" }}>
        <button onClick={() => setActiveTab("all")} style={{
          padding: "10px 18px", fontSize: 13, cursor: "pointer",
          background: "none", border: "none",
          color: activeTab === "all" ? "#f1f5f9" : "#64748b",
          borderBottom: `2px solid ${activeTab === "all" ? "#C9A84C" : "transparent"}`,
          marginBottom: "-1px",
        }}>All brands</button>
        {BRANDS.map(b => (
          <button key={b.id} onClick={() => setActiveTab(b.id)} style={{
            padding: "10px 18px", fontSize: 13, cursor: "pointer",
            background: "none", border: "none",
            color: activeTab === b.id ? "#f1f5f9" : "#64748b",
            borderBottom: `2px solid ${activeTab === b.id ? b.color : "transparent"}`,
            marginBottom: "-1px",
          }}>{b.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#475569" }}>Loading news...</div>
      ) : error ? (
        <div style={{ background: "#450a0a20", border: "1px solid #7f1d1d", color: "#fca5a5", padding: "16px 20px", borderRadius: 10, fontSize: 13 }}>
          {error}
        </div>
      ) : articles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#475569" }}>No news found</div>
      ) : (
        <div>
          {articles.map((a, i) => <NewsCard key={i} article={a} />)}
        </div>
      )}
    </div>
  )
}