import { useState, useEffect, useRef } from "react"
import axios from "axios"
import ContentStudioAI from "../components/ContentStudioAI"
import {
  Chart as ChartJS, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend, Filler,
} from "chart.js"
import { Crown, MessageSquare, Users, Lightbulb, TrendingUp, Heart, Repeat2, MessageCircle, ExternalLink } from "lucide-react"

ChartJS.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler)

const API = (import.meta.env.VITE_API_URL || `http://${location.hostname}:8000`)

const GOLD = "#C9A84C", CARD = "#1e293b", PANEL = "#0f172a", BORDER = "#334155", MUTED = "#64748b", TEXT = "#94a3b8"
const GREEN = "#22c55e", BLUE = "#1d9bf0", RED = "#ef4444"

const BRANDS = [
  { id: "primebook", label: "Primebook", color: GOLD, ours: true },
  { id: "hp", label: "HP", color: "#0096D6" },
  { id: "lenovo", label: "Lenovo", color: "#E2231A" },
  { id: "acer", label: "Acer", color: "#83B81A" },
  { id: "dell", label: "Dell", color: "#007DB8" },
  { id: "asus", label: "Asus", color: "#FF6600" },
]
const commas = n => (n == null ? "—" : n.toLocaleString("en-IN"))
const fmt = n => (n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : "" + n)

const card = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 }
const label = { fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: MUTED }

function NoData() {
  return (
    <div style={{ ...card, textAlign: "center", color: MUTED, padding: 40 }}>
      <div style={{ fontSize: 26, marginBottom: 10 }}>𝕏</div>
      <div style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 6 }}>No Twitter/X data yet</div>
      <div style={{ fontSize: 12, maxWidth: 520, margin: "0 auto", lineHeight: 1.6 }}>
        Add <code style={{ color: GOLD }}>TW_AUTH_TOKEN</code> (and <code style={{ color: GOLD }}>TW_CT0</code>) to <code>backend/.env</code> from a throwaway x.com session, then run <code style={{ color: GOLD }}>python twitter_cache_builder.py</code>. Followers, tweets, engagement &amp; growth appear here once scraped. The <b>Content Strategy AI</b> tab works right now.
      </div>
    </div>
  )
}

// CSS bar chart — no chart lib needed
function BarBlock({ title, rows, valKey }) {
  const max = Math.max(1, ...rows.map(r => r[valKey] || 0))
  return (
    <div style={card}>
      <div style={label}>{title}</div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 9 }}>
        {rows.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 68, fontSize: 12, color: r.ours ? GOLD : TEXT, fontWeight: r.ours ? 700 : 500, flexShrink: 0 }}>{r.label}</span>
            <div style={{ flex: 1, background: PANEL, borderRadius: 4, height: 18, overflow: "hidden" }}>
              <div style={{ width: `${((r[valKey] || 0) / max) * 100}%`, height: "100%", background: r.ours ? GOLD : r.color, borderRadius: 4, transition: "width .3s" }} />
            </div>
            <span style={{ width: 52, textAlign: "right", fontSize: 12, color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{fmt(r[valKey] || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CompareTab({ all }) {
  const rows = BRANDS.map(b => ({ ...b, ...(all[b.id] || {}) }))
  if (!rows.some(r => (r.followers || 0) > 0)) return <NoData />
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <BarBlock title="Followers" rows={rows} valKey="followers" />
        <BarBlock title="Total tweets" rows={rows} valKey="posts" />
      </div>
      <div style={card}>
        <div style={label}>Engagement snapshot</div>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
            <thead><tr>{["Brand", "Followers", "Tweets", "Avg likes", "Avg RTs", "Engagement"].map(h => (
              <th key={h} style={{ textAlign: h === "Brand" ? "left" : "right", padding: "8px 12px", color: MUTED, fontSize: 11, textTransform: "uppercase", borderBottom: `1px solid ${BORDER}` }}>{h}</th>
            ))}</tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} style={{ background: r.ours ? "rgba(201,168,76,0.06)" : "transparent" }}>
                <td style={{ padding: "8px 12px", color: r.ours ? GOLD : "#e2e8f0", fontWeight: r.ours ? 700 : 500 }}>{r.label}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: "#e2e8f0" }}>{commas(r.followers)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: TEXT }}>{commas(r.posts)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: TEXT }}>{commas(r.avg_likes)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: TEXT }}>{commas(r.avg_retweets)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: r.engagement_rate ? GREEN : MUTED }}>{r.engagement_rate != null ? r.engagement_rate + "%" : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function BrandPicker({ brand, setBrand }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {BRANDS.map(b => (
        <button key={b.id} onClick={() => setBrand(b.id)} style={{
          padding: "6px 13px", fontSize: 12, borderRadius: 20, cursor: "pointer", fontFamily: "inherit",
          border: `1px solid ${brand === b.id ? b.color : BORDER}`,
          background: brand === b.id ? b.color + "22" : "transparent",
          color: brand === b.id ? b.color : TEXT, fontWeight: brand === b.id ? 600 : 500,
        }}>{b.label}</button>
      ))}
    </div>
  )
}

function TweetsTab() {
  const [brand, setBrand] = useState("primebook")
  const [data, setData] = useState(null)
  useEffect(() => { setData(null); axios.get(`${API}/twitter/analytics/${brand}`).then(r => setData(r.data)).catch(() => setData({ error: 1 })) }, [brand])
  return (
    <div>
      <BrandPicker brand={brand} setBrand={setBrand} />
      {!data ? <div style={{ color: MUTED, padding: 20 }}>Loading…</div>
        : !data.recent_posts?.length ? <NoData />
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {data.recent_posts.map((t, i) => (
              <div key={i} style={card}>
                <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.5, minHeight: 40 }}>{t.text || "(no text)"}</div>
                <div style={{ display: "flex", gap: 16, marginTop: 12, color: MUTED, fontSize: 12, alignItems: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Heart size={13} color={RED} /> {commas(t.likes)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Repeat2 size={13} color={GREEN} /> {commas(t.retweets)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MessageCircle size={13} color={BLUE} /> {commas(t.replies)}</span>
                  {t.url && <a href={t.url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", color: BLUE }}><ExternalLink size={13} /></a>}
                </div>
                {t.taken_at && <div style={{ color: MUTED, fontSize: 10, marginTop: 6 }}>{new Date(t.taken_at).toLocaleDateString()}</div>}
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

function AudienceTab() {
  const [brand, setBrand] = useState("primebook")
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); axios.get(`${API}/twitter/audience/${brand}`).then(r => setD(r.data)).catch(() => setD({ error: 1 })) }, [brand])
  return (
    <div>
      <BrandPicker brand={brand} setBrand={setBrand} />
      {!d ? <div style={{ color: MUTED, padding: 20 }}>Estimating…</div>
        : d.error ? <NoData />
        : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={card}>
              <div style={label}>Audience types <span style={{ color: GOLD }}>· AI estimate</span></div>
              {(d.audience_types || []).map((a, i) => (
                <div key={i} style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#e2e8f0" }}><span>{a.type}</span><span>{a.pct}%</span></div>
                  <div style={{ height: 6, background: PANEL, borderRadius: 3, marginTop: 4 }}><div style={{ width: a.pct + "%", height: "100%", background: BLUE, borderRadius: 3 }} /></div>
                  <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{a.desc}</div>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={label}>Content mix</div>
              {(d.content_mix || []).map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#e2e8f0", marginTop: 8 }}><span>{c.label}</span><span style={{ color: TEXT }}>{c.pct}%</span></div>
              ))}
              <div style={{ marginTop: 14 }}><div style={label}>Tone</div><div style={{ color: "#e2e8f0", fontSize: 13, marginTop: 4 }}>{d.tone}</div></div>
              {d.takeaway && <div style={{ marginTop: 14, background: "rgba(201,168,76,0.08)", borderRadius: 8, padding: 12, fontSize: 12, color: "#e2e8f0" }}><b style={{ color: GOLD }}>Primebook play:</b> {d.takeaway}</div>}
            </div>
          </div>
        )}
    </div>
  )
}

function GrowthTab() {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const [g, setG] = useState(null)
  useEffect(() => { axios.get(`${API}/twitter/growth/history`).then(r => setG(r.data)).catch(() => setG({ brands: {} })) }, [])

  const dates = g ? [...new Set(BRANDS.flatMap(b => (g.brands?.[b.id]?.series || []).map(s => s.date)))].sort() : []

  useEffect(() => {
    if (!canvasRef.current || dates.length < 2) return
    if (chartRef.current) chartRef.current.destroy()
    chartRef.current = new ChartJS(canvasRef.current, {
      type: "line",
      data: {
        labels: dates,
        datasets: BRANDS.map(b => ({
          label: b.label, borderColor: b.color, backgroundColor: b.color + "22", borderWidth: b.ours ? 3 : 2,
          tension: 0.3, pointRadius: 2,
          data: dates.map(dt => { const p = (g.brands?.[b.id]?.series || []).find(s => s.date === dt); return p ? p.followers : null }),
        })),
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: TEXT, font: { size: 11 }, usePointStyle: true } } },
        scales: { x: { ticks: { color: MUTED } }, y: { ticks: { color: MUTED, callback: v => fmt(v) }, grid: { color: "rgba(148,163,184,0.1)" } } },
      },
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [g])

  if (!g) return <div style={{ color: MUTED, padding: 20 }}>Loading…</div>
  if (dates.length < 2) return <div style={{ ...card, color: MUTED, textAlign: "center", padding: 40 }}>Follower growth needs at least 2 daily snapshots. It builds up as the daily refresh runs.</div>
  return <div style={{ ...card, height: 380 }}><canvas ref={canvasRef} /></div>
}

const TABS = [
  { id: "compare", label: "Compare", icon: Crown },
  { id: "tweets", label: "Tweets", icon: MessageSquare },
  { id: "audience", label: "Audience", icon: Users },
  { id: "content", label: "Content Strategy AI", icon: Lightbulb },
  { id: "growth", label: "Growth", icon: TrendingUp },
]

export default function TwitterAnalytics() {
  const [tab, setTab] = useState("compare")
  const [all, setAll] = useState({})
  useEffect(() => { axios.get(`${API}/twitter/analytics/all`).then(r => setAll(r.data.brands || {})).catch(() => {}) }, [])

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 22 }}>
        {TABS.map(t => {
          const on = tab === t.id, Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "9px 15px", fontSize: 12, borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 7,
              border: `1px solid ${on ? GOLD : BORDER}`, background: on ? "rgba(201,168,76,0.12)" : "transparent",
              color: on ? GOLD : TEXT, fontWeight: on ? 600 : 500,
            }}><Icon size={13} /> {t.label}</button>
          )
        })}
      </div>

      {tab === "compare" && <CompareTab all={all} />}
      {tab === "tweets" && <TweetsTab />}
      {tab === "audience" && <AudienceTab />}
      {tab === "content" && <ContentStudioAI platform="twitter" />}
      {tab === "growth" && <GrowthTab />}

      <div style={{ marginTop: 20, color: MUTED, fontSize: 10, lineHeight: 1.5 }}>
        Twitter/X data is scraped from public profiles (followers, tweet counts, recent tweets + engagement). Audience is an AI estimate. Content Strategy AI generates X-native ideas from live trends and needs no Twitter data.
      </div>
    </div>
  )
}
