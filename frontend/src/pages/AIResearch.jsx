import { useState, useEffect } from "react"
import axios from "axios"

const API = (import.meta.env.VITE_API_URL || `http://${location.hostname}:8000`)

const CARD = "#1e293b"
const BORDER = "#334155"
const TEXT = "#94a3b8"
const MUTED = "#64748b"

function Card({ icon, title, sub, children, style }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 16, ...style }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{title}</span>
        {sub && <span style={{ fontSize: 11, color: MUTED, marginLeft: "auto" }}>{sub}</span>}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

export default function AIResearch() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    axios.get(`${API}/research/ai-report`)
      .then(res => {
        if (res.data.error) setError(res.data.error)
        else setData(res.data)
      })
      .catch(err => setError("Failed to load AI research: " + err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ padding: "28px 32px", minHeight: "100vh", background: "#0f1117", color: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: MUTED, fontSize: 14 }}>Groq AI analyzing market data...</div>
    </div>
  )

  if (error) return (
    <div style={{ padding: "28px 32px", minHeight: "100vh", background: "#0f1117", color: "#e2e8f0" }}>
      <div style={{ background: "#450a0a20", border: "1px solid #7f1d1d", color: "#fca5a5", padding: "16px 20px", borderRadius: 10, fontSize: 13 }}>
        Error: {error}
      </div>
    </div>
  )

  if (!data) return null

  const swotConfig = [
    { key: "strengths", label: "Strengths", color: "#28a745" },
    { key: "weaknesses", label: "Weaknesses", color: "#E24B4A" },
    { key: "opportunities", label: "Opportunities", color: "#378ADD" },
    { key: "threats", label: "Threats", color: "#f97316" },
  ]

  return (
    <div style={{ padding: "28px 32px", minHeight: "100vh", background: "#0f1117", color: "#e2e8f0" }}>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>AI Research</div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Weekly market intelligence — Groq LLaMA 3.3 70B</div>
      </div>

      {/* 1. This week in the market */}
      <Card icon="📄" title="This week in the market" sub="Groq LLaMA 3.3 70B">
        {(data.market_summary || []).map((para, i) => (
          <p key={i} style={{ fontSize: 13, color: TEXT, lineHeight: 1.75, marginBottom: 12 }}>{para}</p>
        ))}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          {(data.callouts || []).map((c, i) => (
            <div key={i} style={{ flex: 1, minWidth: 180, background: `${c.color}15`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.06em", color: c.color, marginBottom: 4, fontWeight: 700 }}>{c.label}</div>
              <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>{c.text}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 2. Strategic recommendations */}
      <Card icon="🚀" title="Strategic recommendations">
        {(data.recommendations || []).map((rec, i) => (
          <div key={i} style={{ background: "#0f172a", borderRadius: 8, padding: 12, borderLeft: "3px solid #C9A84C", marginBottom: i < data.recommendations.length - 1 ? 10 : 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 3 }}>{i + 1}. {rec.title}</div>
            <div style={{ fontSize: 11, color: TEXT, lineHeight: 1.5 }}>{rec.text}</div>
          </div>
        ))}
      </Card>

      {/* 3. Threat ranking + SWOT side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        <Card icon="📊" title="Threat ranking" sub="Primebook's position shown">
          {(data.threat_ranking || []).map((t, i) => {
            const isPrime = t.brand === "Primebook"
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                borderBottom: i < data.threat_ranking.length - 1 ? `0.5px solid ${BORDER}` : "none",
                background: isPrime ? "rgba(201,168,76,0.06)" : "transparent",
                margin: isPrime ? "0 -16px" : "0",
                paddingLeft: isPrime ? 16 : 0,
                paddingRight: isPrime ? 16 : 0,
                borderRadius: isPrime ? 6 : 0,
              }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: isPrime ? t.color : "#0f172a", color: isPrime ? "#412402" : TEXT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {isPrime ? "P" : i + 1}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: isPrime ? t.color : "#e2e8f0", width: 76, flexShrink: 0 }}>{t.brand}</div>
                <div style={{ flex: 1, height: 6, background: "#0f172a", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(t.score / 10) * 100}%`, background: t.color, borderRadius: 3 }}></div>
                </div>
                <div style={{ fontSize: 12, color: isPrime ? t.color : MUTED, width: 32, textAlign: "right" }}>{t.score}</div>
              </div>
            )
          })}
        </Card>

        <Card icon="⊞" title="Primebook SWOT">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {swotConfig.map(({ key, label, color }) => (
              <div key={key} style={{ background: `${color}15`, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 8 }}>{label}</div>
                {(data.swot?.[key] || []).map((item, i) => (
                  <div key={i} style={{ fontSize: 12, color: TEXT, lineHeight: 1.6, padding: "4px 0" }}>{item}</div>
                ))}
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  )
}