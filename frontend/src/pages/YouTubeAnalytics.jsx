import { useState, useEffect, useRef } from "react"
import axios from "axios"
import {
  Chart as ChartJS, BarController, BarElement, LineController, LineElement, PointElement,
  ArcElement, DoughnutController, RadarController, RadialLinearScale, CategoryScale, LinearScale, Tooltip, Legend, Filler,
} from "chart.js"
import {
  RefreshCw, TrendingUp, Users, Eye, ThumbsUp, MessageCircle, Clock, Trophy,
  Target, Lightbulb, AlertTriangle, ExternalLink, Calendar, BarChart3, Crown, Sparkles,
} from "lucide-react"

ChartJS.register(
  BarController, BarElement, LineController, LineElement, PointElement, ArcElement, DoughnutController,
  RadarController, RadialLinearScale, CategoryScale, LinearScale, Tooltip, Legend, Filler,
)

const API = (import.meta.env.VITE_API_URL || `http://${location.hostname}:8000`)

// palette
const GOLD = "#C9A84C", CARD = "#1e293b", PANEL = "#0f172a", BORDER = "#334155", MUTED = "#64748b", TEXT = "#94a3b8"
const GREEN = "#22c55e", BLUE = "#3b82f6", RED = "#ef4444", PURPLE = "#a78bfa"
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// Our channel (in-house figures — Primebook has no public tracked channel in the cache)
const PRIMEBOOK = { id: "primebook", label: "Primebook", color: GOLD, ours: true, subscribers: 12400, total_views: 2100000, video_count: 48 }
PRIMEBOOK.views_per_video = Math.round(PRIMEBOOK.total_views / PRIMEBOOK.video_count)

const BRANDS = [
  { id: "hp", label: "HP", color: "#0096D6" },
  { id: "lenovo", label: "Lenovo", color: "#E2231A" },
  { id: "acer", label: "Acer", color: "#83B81A" },
  { id: "dell", label: "Dell", color: "#007DB8" },
  { id: "asus", label: "Asus", color: "#FF6600" },
]
const BMAP = Object.fromEntries(BRANDS.map(b => [b.id, b]))
const PB_META = { id: "primebook", label: "Primebook", color: GOLD }
const meta = id => (id === "primebook" ? PB_META : (BMAP[id] || { label: id, color: GOLD }))

function fmt(n) {
  if (n == null) return "—"
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B"
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"
  return Math.round(n).toString()
}
const commas = n => (n == null ? "—" : Math.round(n).toLocaleString("en-IN"))

function relativeTime(iso) {
  if (!iso) return ""
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 0) return "just now"
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]]
  for (const [name, secs] of units) { const n = Math.floor(s / secs); if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago` }
  return "just now"
}
function dateShort(iso) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

// ── styles ─────────────────────────────────────────────────────────────────
const card = { background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: 14, padding: 18 }
const label = { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }

function SectionTitle({ children, note, icon: Icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {Icon && <Icon size={14} color={GOLD} />}
      <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700 }}>{children}</span>
      {note && <span style={{ color: MUTED, fontSize: 11, fontWeight: 400 }}>· {note}</span>}
    </div>
  )
}

const Loading = ({ what = "data" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, color: MUTED, padding: 50, justifyContent: "center" }}>
    <RefreshCw size={18} className="yt-spin" /> Loading {what}…
  </div>
)

// ── Chart.js wrappers ────────────────────────────────────────────────────────
function useChartRef(build, deps) {
  const ref = useRef(null)
  const inst = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    if (inst.current) inst.current.destroy()
    inst.current = new ChartJS(ref.current, build())
    return () => { if (inst.current) inst.current.destroy() }
    // eslint-disable-next-line
  }, deps)
  return ref
}

const GRID = "rgba(148,163,184,0.08)"
const baseScales = (horizontal) => ({
  x: { ticks: { color: MUTED, font: { size: 11 } }, grid: { color: horizontal ? GRID : "transparent" }, border: { display: false } },
  y: { ticks: { color: MUTED, font: { size: 11 } }, grid: { color: horizontal ? "transparent" : GRID }, border: { display: false } },
})

function Bar({ labels, values, colors, horizontal = false, height = 260, valueFmt = commas }) {
  const ref = useChartRef(() => ({
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 6, maxBarThickness: 44 }] },
    options: {
      indexAxis: horizontal ? "y" : "x",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => " " + valueFmt(c.parsed[horizontal ? "x" : "y"]) } } },
      scales: baseScales(horizontal),
    },
  }), [labels.join("|"), values.join("|"), horizontal])
  return <div style={{ height, position: "relative" }}><canvas ref={ref} /></div>
}

function Radar({ labels, datasets, height = 300 }) {
  const ref = useChartRef(() => ({
    type: "radar",
    data: {
      labels,
      datasets: datasets.map(d => ({
        label: d.label, data: d.data, borderColor: d.color,
        backgroundColor: d.color + "33", pointBackgroundColor: d.color, borderWidth: 2, pointRadius: 3,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: TEXT, font: { size: 12 }, usePointStyle: true } }, tooltip: { enabled: false } },
      scales: { r: { angleLines: { color: BORDER }, grid: { color: BORDER }, pointLabels: { color: TEXT, font: { size: 11 } }, ticks: { display: false, backdropColor: "transparent" }, suggestedMin: 0, suggestedMax: 100 } },
    },
  }), [labels.join("|"), JSON.stringify(datasets)])
  return <div style={{ height, position: "relative" }}><canvas ref={ref} /></div>
}

function Doughnut({ values, colors, labels, height = 190 }) {
  const ref = useChartRef(() => ({
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      cutout: "68%", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: TEXT, font: { size: 11 }, usePointStyle: true, padding: 14 } }, tooltip: { callbacks: { label: c => " " + c.label + ": " + c.parsed + "%" } } },
    },
  }), [values.join("|")])
  return <div style={{ height, position: "relative" }}><canvas ref={ref} /></div>
}

function Line({ labels, datasets, height = 300, yFmt = fmt }) {
  const ref = useChartRef(() => ({
    type: "line",
    data: {
      labels,
      datasets: datasets.map(d => ({
        label: d.label, data: d.data, borderColor: d.color, backgroundColor: d.color + "22",
        borderWidth: d.ours ? 3 : 2, pointRadius: 3, pointHoverRadius: 6, tension: 0.3, fill: false, spanGaps: true,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: TEXT, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: c => " " + c.dataset.label + ": " + commas(c.parsed.y) } } },
      scales: { x: { ticks: { color: MUTED, font: { size: 11 } }, grid: { color: "transparent" } }, y: { ticks: { color: MUTED, font: { size: 11 }, callback: v => yFmt(v) }, grid: { color: GRID } } },
    },
  }), [labels.join("|"), JSON.stringify(datasets.map(d => d.data))])
  return <div style={{ height, position: "relative" }}><canvas ref={ref} /></div>
}

// ── shared bits ────────────────────────────────────────────────────────────
function BrandPicker({ value, onChange, includeOurs = false }) {
  const list = includeOurs ? [PRIMEBOOK, ...BRANDS] : BRANDS
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
      {list.map(b => {
        const on = value === b.id
        return (
          <button key={b.id} onClick={() => onChange(b.id)} style={{
            padding: "6px 14px", fontSize: 12, borderRadius: 16, cursor: "pointer", fontFamily: "inherit",
            border: `1px solid ${on ? b.color : BORDER}`, background: on ? b.color : "transparent",
            color: on ? "#0f1117" : TEXT, fontWeight: on ? 700 : 500,
          }}>{b.ours ? "★ " : ""}{b.label}</button>
        )
      })}
    </div>
  )
}

function Pill({ children, color = GOLD }) {
  return <span style={{ background: `${color}22`, color, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 12, display: "inline-block" }}>{children}</span>
}

// ═══ COMPARE (flagship: our channel vs competitors, in graphs) ═══════════════
function CompareTab({ all }) {
  const [rival, setRival] = useState("hp")
  const brands = Object.keys(all || {})
  if (!brands.length) return <Loading what="channel comparison" />

  // Prefer the live tracked channel; fall back to the constant if the cache lacks it
  const ours = { ...PRIMEBOOK, ...(all.primebook || {}), id: "primebook", label: "Primebook", color: GOLD, ours: true }
  const rows = [ours, ...BRANDS.map(b => ({ ...b, ...(all[b.id] || {}) }))]
  const bySubs = [...rows].sort((a, b) => (b.subscribers || 0) - (a.subscribers || 0))
  const ourRank = bySubs.findIndex(r => r.ours) + 1

  const subsData = rows.map(r => ({ label: r.label, v: r.subscribers || 0, c: r.color }))
  const vpvData  = rows.map(r => ({ label: r.label, v: r.views_per_video || 0, c: r.color }))
  const engRows  = rows.map(r => ({ label: r.label, v: r.engagement_rate || 0, c: r.color }))

  // radar: Primebook vs chosen rival, each axis normalized to the pair max
  const rv = { ...BMAP[rival], ...(all[rival] || {}) }
  const axes = [
    { key: "subscribers", label: "Subscribers" },
    { key: "total_views", label: "Total Views" },
    { key: "video_count", label: "Videos" },
    { key: "views_per_video", label: "Views / Video" },
    { key: "engagement_rate", label: "Engagement" },
  ]
  const norm = who => axes.map(a => {
    const mx = Math.max(ours[a.key] || 0, rv[a.key] || 0, 1)
    return Math.round(((who[a.key] || 0) / mx) * 100)
  })

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Our-channel hero */}
      <div style={{ ...card, borderColor: GOLD, background: "linear-gradient(135deg, rgba(201,168,76,0.10), rgba(201,168,76,0.02))", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Crown size={22} color="#0f1117" />
          </div>
          <div>
            <div style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em" }}>OUR CHANNEL · PRIMEBOOK</div>
            <div style={{ color: "white", fontSize: 20, fontWeight: 800 }}>Rank #{ourRank} of {rows.length} by subscribers</div>
            <div style={{ color: MUTED, fontSize: 10 }}>live from the tracked @primebookhq channel</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          {[["Subscribers", fmt(ours.subscribers)], ["Total views", fmt(ours.total_views)], ["Videos", ours.video_count], ["Views / video", fmt(ours.views_per_video)]].map(([k, v]) => (
            <div key={k} style={{ textAlign: "center" }}>
              <div style={label}>{k}</div>
              <div style={{ color: GOLD, fontSize: 20, fontWeight: 800, fontFamily: "monospace", marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bar comparisons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={card}>
          <SectionTitle icon={Users} note="ours in gold">Subscribers</SectionTitle>
          <Bar labels={subsData.map(d => d.label)} values={subsData.map(d => d.v)} colors={subsData.map(d => d.c)} />
        </div>
        <div style={card}>
          <SectionTitle icon={Eye} note="lifetime avg">Views per video</SectionTitle>
          <Bar labels={vpvData.map(d => d.label)} values={vpvData.map(d => d.v)} colors={vpvData.map(d => d.c)} />
        </div>
      </div>

      {/* Radar head-to-head */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <SectionTitle icon={Target} note="each axis scaled to the larger of the two">Head-to-head — Primebook vs rival</SectionTitle>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {BRANDS.map(b => (
              <button key={b.id} onClick={() => setRival(b.id)} style={{
                padding: "4px 12px", fontSize: 11, borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${rival === b.id ? b.color : BORDER}`, background: rival === b.id ? b.color : "transparent",
                color: rival === b.id ? "#0f1117" : TEXT, fontWeight: rival === b.id ? 700 : 500,
              }}>{b.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18, alignItems: "center" }}>
          <Radar
            labels={axes.map(a => a.label)}
            datasets={[
              { label: "Primebook", data: norm(ours), color: GOLD },
              { label: rv.label, data: norm(rv), color: rv.color || BLUE },
            ]}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {axes.map(a => {
              const ov = ours[a.key] || 0, theirs = rv[a.key] || 0
              const win = ov >= theirs
              const isPct = a.key === "engagement_rate"
              return (
                <div key={a.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: PANEL }}>
                  <span style={{ color: TEXT, fontSize: 12 }}>{a.label}</span>
                  <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: GOLD, fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>{isPct ? ov + "%" : fmt(ov)}</span>
                    <span style={{ color: MUTED, fontSize: 10 }}>vs</span>
                    <span style={{ color: rv.color, fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>{isPct ? theirs + "%" : fmt(theirs)}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: win ? GREEN : RED, width: 34, textAlign: "right" }}>{win ? "LEAD" : "GAP"}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Engagement rate — all channels incl. ours */}
      <div style={card}>
        <SectionTitle icon={TrendingUp} note="(likes + comments) / views · ours in gold">Engagement rate</SectionTitle>
        <Bar labels={engRows.map(d => d.label)} values={engRows.map(d => d.v)} colors={engRows.map(d => d.c)} horizontal height={220} valueFmt={v => v + "%"} />
      </div>
    </div>
  )
}

// ── Per-video AI analysis — lazy, context-aware ("top" | "latest"), brand-aware ─
const TONE = { good: GREEN, warn: GOLD, bad: RED, neutral: BLUE }

function VideoAI({ brand, video, context }) {
  const [open, setOpen] = useState(false)
  const [ai, setAi] = useState(null)
  const [loading, setLoading] = useState(false)
  function toggle() {
    const n = !open
    setOpen(n)
    if (n && !ai && !loading) {
      setLoading(true)
      axios.get(`${API}/youtube/video-analysis/${brand}/${video.video_id}?context=${context}`)
        .then(r => setAi(r.data)).catch(() => setAi({ error: 1 })).finally(() => setLoading(false))
    }
  }
  const btn = context === "latest" ? "How is this performing? — AI analysis" : "Why did this work? — AI analysis"
  const tone = ai ? (TONE[ai.badge_tone] || BLUE) : BLUE
  return (
    <div style={{ borderTop: `0.5px solid ${BORDER}` }}>
      <button onClick={toggle} style={{ width: "100%", background: "transparent", border: "none", color: GOLD, fontSize: 11, fontWeight: 600, padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
        <Sparkles size={12} /> {open ? "Hide AI analysis" : btn}
      </button>
      {open && (
        <div style={{ padding: "0 12px 12px" }}>
          {loading || !ai ? <div style={{ color: MUTED, fontSize: 11, padding: "4px 0" }}>Analyzing…</div>
            : ai.error ? <div style={{ color: RED, fontSize: 11 }}>Analysis failed — try again.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {ai.badge_text && <div><span style={{ background: `${tone}22`, color: tone, fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.03em" }}>{ai.badge_text}</span></div>}
                <div style={{ color: TEXT, fontSize: 11.5, lineHeight: 1.5 }}><b style={{ color: "#e2e8f0" }}>What it is:</b> {ai.summary}</div>
                <div>
                  <div style={{ ...label, marginBottom: 4 }}>Analysis</div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: TEXT, fontSize: 11.5, lineHeight: 1.6 }}>
                    {(ai.points || []).map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
                {ai.action && ai.action_label && (
                  <div style={{ color: TEXT, fontSize: 11.5, lineHeight: 1.5 }}><b style={{ color: GOLD }}>{ai.action_label}:</b> {ai.action}</div>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  )
}

function VideoCard({ brand, v, context }) {
  return (
    <div style={{ border: `0.5px solid ${v.outlier ? GOLD : BORDER}`, borderRadius: 8, background: v.outlier ? "rgba(201,168,76,0.06)" : "transparent" }}>
      <a href={v.url} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 12, padding: "8px 10px", textDecoration: "none" }}>
        <img src={v.thumbnail} alt="" style={{ width: 72, height: 40, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "white", fontSize: 12, fontWeight: 500, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.title}</div>
          <div style={{ color: MUTED, fontSize: 10, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span>👁 {fmt(v.views)}</span><span>👍 {fmt(v.likes)}</span><span>💬 {fmt(v.comments)}</span>
            <span style={{ color: v.engagement_rate >= 3 ? GREEN : TEXT }}>⚡ {v.engagement_rate}%</span>
          </div>
          <div style={{ color: MUTED, fontSize: 9.5, marginTop: 3 }}>
            📅 {dateShort(v.published_at)} · <span style={{ color: GOLD }}>{relativeTime(v.published_at)}</span>
            {v.is_short && <span style={{ color: PURPLE }}> · Short</span>}
            {v.outlier && <span style={{ color: GOLD, fontWeight: 700 }}> · OUTLIER</span>}
          </div>
        </div>
      </a>
      <VideoAI brand={brand} video={v} context={context} />
    </div>
  )
}

// ═══ PERFORMANCE (per competitor deep dive) ══════════════════════════════════
function PerformanceTab() {
  const [brand, setBrand] = useState("hp")
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); axios.get(`${API}/youtube/analytics/${brand}`).then(r => setD(r.data)).catch(() => setD({ error: 1 })) }, [brand])

  return (
    <div>
      <BrandPicker value={brand} onChange={setBrand} includeOurs />
      {!d ? <Loading /> : d.error ? <div style={{ color: RED, padding: 20 }}>Not cached.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { t: "Subscribers", v: fmt(d.subscribers), s: "channel total", c: GOLD, I: Users },
              { t: "Views / video", v: fmt(d.views_per_video), s: "lifetime avg", c: BLUE, I: Eye },
              { t: "Engagement", v: d.engagement_rate + "%", s: "likes+comments/views", c: GREEN, I: TrendingUp },
              { t: "Uploads / week", v: d.uploads_per_week ?? "—", s: `gap ~${d.avg_gap_days ?? "—"}d · σ${d.consistency ?? "—"}`, c: PURPLE, I: Clock },
            ].map((k, i) => (
              <div key={i} style={{ ...card, borderTop: `2px solid ${k.c}` }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}><k.I size={12} color={MUTED} /><span style={label}>{k.t}</span></div>
                <div style={{ color: k.c, fontSize: 24, fontWeight: 800, fontFamily: "monospace", marginTop: 8 }}>{k.v}</div>
                <div style={{ color: TEXT, fontSize: 10, marginTop: 4 }}>{k.s}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div style={card}>
              <SectionTitle icon={Calendar} note="recent uploads">Publishing cadence — day of week</SectionTitle>
              <Bar labels={DOW} values={d.dow || []} colors={DOW.map(() => GOLD)} height={220} valueFmt={v => v} />
            </div>
            <div style={card}>
              <SectionTitle icon={BarChart3} note="video length split">Content mix</SectionTitle>
              <Bar
                labels={Object.keys(d.duration_buckets || {}).map(k => k.split(" ")[0])}
                values={Object.values(d.duration_buckets || {})}
                colors={[PURPLE, BLUE, GOLD]} height={220} valueFmt={v => v} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
            {/* Top videos — dates + per-video AI (why it worked) */}
            <div style={card}>
              <SectionTitle icon={Trophy} note="🟡 outlier = ≥2× median · tap a card for AI">Top videos by views</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(d.top_videos || []).map((v, i) => <VideoCard key={v.video_id || i} brand={brand} v={v} context="top" />)}
              </div>
            </div>

            {/* Latest uploads — time-sorted + per-video AI (is it performing?) */}
            <div style={card}>
              <SectionTitle icon={Clock} note="newest first · tap a card for AI">Latest uploads</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(d.latest_videos || []).map((v, i) => <VideoCard key={v.video_id || i} brand={brand} v={v} context="latest" />)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══ BENCHMARK (7/30/90 windows) ════════════════════════════════════════════
function BenchmarkTab({ all }) {
  const [period, setPeriod] = useState("30")
  const brands = Object.keys(all || {})
  if (!brands.length) return <Loading />
  const wk = `window_${period}`
  const colors = brands.map(id => meta(id).color)

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
        {["7", "30", "90"].map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            padding: "6px 14px", fontSize: 12, borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
            border: `1px solid ${period === p ? GOLD : BORDER}`, background: period === p ? "rgba(201,168,76,0.12)" : "transparent",
            color: period === p ? GOLD : TEXT, fontWeight: period === p ? 700 : 500,
          }}>Last {p} days</button>
        ))}
        <span style={{ color: MUTED, fontSize: 11, marginLeft: 8 }}>from the cached video sample · engagement is all-time</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        <div style={card}><SectionTitle note={`last ${period}d`}>Uploads</SectionTitle>
          <Bar labels={brands.map(id => meta(id).label)} values={brands.map(id => all[id][wk]?.uploads || 0)} colors={colors} valueFmt={v => v} /></div>
        <div style={card}><SectionTitle note={`last ${period}d`}>Avg views / video</SectionTitle>
          <Bar labels={brands.map(id => meta(id).label)} values={brands.map(id => all[id][wk]?.avg_views || 0)} colors={colors} /></div>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <SectionTitle icon={BarChart3}>Side-by-side scorecard</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ color: MUTED, fontSize: 10, textTransform: "uppercase" }}>
            {["Brand", "Subs", "Views/video", "Eng %", "Uploads/wk", "Shorts %"].map(h => (
              <th key={h} style={{ textAlign: h === "Brand" ? "left" : "right", padding: "6px 10px", borderBottom: `1px solid ${BORDER}` }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {brands.map(id => {
              const b = all[id]
              return (
                <tr key={id} style={{ borderBottom: `0.5px solid ${BORDER}` }}>
                  <td style={{ padding: "8px 10px", color: meta(id).color, fontWeight: 700 }}>{meta(id).label}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "white" }}>{fmt(b.subscribers)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "white" }}>{fmt(b.views_per_video)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: GREEN }}>{b.engagement_rate}%</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: TEXT }}>{b.uploads_per_week ?? "—"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: PURPLE }}>{b.shorts_share}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══ GROWTH (snapshots over time) ═══════════════════════════════════════════
function GrowthTab() {
  const [g, setG] = useState(null)
  useEffect(() => { axios.get(`${API}/youtube/growth/history`).then(r => setG(r.data)).catch(() => setG({ error: 1 })) }, [])
  if (!g) return <Loading what="growth history" />
  if (g.error) return <div style={{ color: RED, padding: 20 }}>Failed to load.</div>

  const gl = [PB_META, ...BRANDS]
  const dates = [...new Set(gl.flatMap(b => (g.brands?.[b.id]?.series || []).map(s => s.date)))].sort()
  const datasets = gl.map(b => ({
    label: b.label, color: b.color, ours: b.id === "primebook",
    data: dates.map(dt => { const p = (g.brands?.[b.id]?.series || []).find(s => s.date === dt); return p ? p.subscribers : null }),
  }))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {g.collecting && (
        <div style={{ ...card, borderColor: GOLD, background: "rgba(201,168,76,0.06)", display: "flex", gap: 10 }}>
          <Clock size={16} color={GOLD} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>Growth tracking is collecting data</div>
            <div style={{ color: TEXT, fontSize: 12, marginTop: 3 }}>{g.message} Trend lines fill in as weekly snapshots accumulate (hit <code style={{ color: GOLD }}>/youtube/growth/record</code> after each cache rebuild).</div>
          </div>
        </div>
      )}
      <div style={card}>
        <SectionTitle icon={TrendingUp} note={`${g.count} snapshot(s)`}>Subscribers over time</SectionTitle>
        {dates.length >= 2
          ? <Line labels={dates} datasets={datasets} />
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {gl.map(b => {
                const s = g.brands?.[b.id]?.series || []
                const latest = s[s.length - 1]
                return (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `0.5px solid ${BORDER}` }}>
                    <span style={{ width: 70, color: b.color, fontWeight: 700, fontSize: 12 }}>{b.label}</span>
                    <span style={{ color: "white", fontSize: 13, fontFamily: "monospace" }}>{fmt(latest?.subscribers)}</span>
                    <span style={{ color: MUTED, fontSize: 11, marginLeft: "auto" }}>captured {latest?.date}</span>
                  </div>
                )
              })}
            </div>
          )}
      </div>
    </div>
  )
}

// ═══ CONTENT STRATEGY (AI) ═══════════════════════════════════════════════════
function ContentTab() {
  const [s, setS] = useState(null)
  useEffect(() => { axios.get(`${API}/youtube/content-strategy`).then(r => setS(r.data)).catch(() => setS({ error: "network" })) }, [])
  if (!s) return <Loading what="AI content strategy" />
  if (s.error) return <div style={{ color: RED, padding: 20 }}>AI error: {String(s.error).slice(0, 200)}</div>

  const swotBox = (title, items, color) => (
    <div style={{ ...card, borderTop: `2px solid ${color}` }}>
      <div style={{ ...label, color }}>{title}</div>
      <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: TEXT, fontSize: 12, lineHeight: 1.6 }}>
        {(items || []).map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {s.optimal_upload && (
        <div style={{ ...card, borderColor: GOLD, display: "flex", alignItems: "center", gap: 14 }}>
          <Calendar size={20} color={GOLD} />
          <div>
            <div style={label}>Recommended upload window</div>
            <div style={{ color: "white", fontSize: 15, fontWeight: 700, marginTop: 3 }}>{s.optimal_upload.day} · {s.optimal_upload.time_ist}</div>
            <div style={{ color: TEXT, fontSize: 11, marginTop: 2 }}>{s.optimal_upload.rationale}</div>
          </div>
        </div>
      )}

      <div>
        <SectionTitle icon={Lightbulb}>Content ideas for Primebook</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {(s.content_ideas || []).map((c, i) => (
            <div key={i} style={{ ...card, display: "flex", gap: 10 }}>
              <Lightbulb size={16} color={GOLD} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ color: "white", fontSize: 13, fontWeight: 600 }}>{c.title}</div>
                <div style={{ color: TEXT, fontSize: 11, marginTop: 4 }}>{c.why}</div>
                {c.format && <div style={{ marginTop: 6 }}><Pill color={BLUE}>{c.format}</Pill></div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={card}>
          <SectionTitle icon={Target}>Content gaps</SectionTitle>
          {(s.content_gaps || []).map((g, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ color: "white", fontSize: 12, fontWeight: 600 }}>🎯 {g.gap}</div>
              <div style={{ color: TEXT, fontSize: 11 }}>{g.why_primebook}</div>
            </div>
          ))}
        </div>
        <div style={card}>
          <SectionTitle icon={TrendingUp}>What makes videos outperform</SectionTitle>
          {(s.outliers || []).map((o, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ color: "white", fontSize: 12, fontWeight: 600 }}>⚡ {o.observation}</div>
              <div style={{ color: TEXT, fontSize: 11 }}>{o.takeaway}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Title & topic patterns</SectionTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {(s.title_patterns || []).map((p, i) => <Pill key={i}>{p.pattern}</Pill>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {(s.topic_clusters || []).map((t, i) => (
            <div key={i} style={{ ...card, padding: 12 }}>
              <div style={{ color: "white", fontSize: 12, fontWeight: 600 }}>{t.topic}</div>
              <div style={{ marginTop: 4 }}><Pill color={t.drives_views === "high" ? GREEN : t.drives_views === "low" ? RED : GOLD}>{t.drives_views} views</Pill></div>
              <div style={{ color: TEXT, fontSize: 11, marginTop: 6 }}>{t.note}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle note="Primebook vs competitors">SWOT</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {swotBox("STRENGTHS", s.swot?.strengths, GREEN)}
          {swotBox("WEAKNESSES", s.swot?.weaknesses, RED)}
          {swotBox("OPPORTUNITIES", s.swot?.opportunities, BLUE)}
          {swotBox("THREATS", s.swot?.threats, "#f97316")}
        </div>
      </div>
    </div>
  )
}

// ═══ SENTIMENT ═══════════════════════════════════════════════════════════════
function SentimentTab() {
  const [brand, setBrand] = useState("hp")
  const [s, setS] = useState(null)
  useEffect(() => { setS(null); axios.get(`${API}/youtube/sentiment/${brand}`).then(r => setS(r.data)).catch(() => setS({ error: 1 })) }, [brand])

  return (
    <div>
      <BrandPicker value={brand} onChange={setBrand} includeOurs />
      {!s ? <Loading what="sentiment" /> : s.error ? <div style={{ color: RED, padding: 20 }}>Failed.</div> :
        s.available === false ? (
          <div style={{ ...card, borderColor: GOLD, display: "flex", gap: 10 }}>
            <AlertTriangle size={16} color={GOLD} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>Comment data not collected yet</div>
              <div style={{ color: TEXT, fontSize: 12, marginTop: 3 }}>Run <code style={{ color: GOLD }}>python youtube_comments_builder.py</code> in the backend folder, then sentiment appears here for every brand.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18 }}>
              <div style={card}>
                <SectionTitle note={`${s.sample_size} comments`}>Sentiment split</SectionTitle>
                <Doughnut
                  labels={["Positive", "Neutral", "Negative"]}
                  values={[s.sentiment?.positive || 0, s.sentiment?.neutral || 0, s.sentiment?.negative || 0]}
                  colors={[GREEN, MUTED, RED]} />
                <div style={{ textAlign: "center", marginTop: 6, color: s.overall_label === "Positive" ? GREEN : s.overall_label === "Negative" ? RED : GOLD, fontWeight: 800 }}>{s.overall_label}</div>
              </div>
              <div style={card}>
                <SectionTitle icon={AlertTriangle}>Pain points</SectionTitle>
                {(s.pain_points || []).map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ color: p.severity === "high" ? RED : p.severity === "low" ? TEXT : "#f97316", fontSize: 14 }}>●</span>
                    <span style={{ color: TEXT, fontSize: 12 }}>{p.text}</span>
                  </div>
                ))}
                <div style={{ marginTop: 12 }}>
                  <div style={label}>Themes</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {(s.themes || []).map((t, i) => <Pill key={i} color={t.sentiment === "positive" ? GREEN : t.sentiment === "negative" ? RED : GOLD}>{t.topic}</Pill>)}
                  </div>
                </div>
              </div>
            </div>
            {s.primebook_takeaway && (
              <div style={{ ...card, borderColor: GOLD }}>
                <div style={{ ...label, color: GOLD }}>Primebook takeaway</div>
                <div style={{ color: "white", fontSize: 13, marginTop: 6 }}>{s.primebook_takeaway}</div>
              </div>
            )}
          </div>
        )}
    </div>
  )
}

// ═══ SHELL ═══════════════════════════════════════════════════════════════════
const TABS = [
  { id: "compare", label: "Compare", icon: Crown },
  { id: "performance", label: "Performance", icon: TrendingUp },
  { id: "benchmark", label: "Benchmark", icon: Target },
  { id: "growth", label: "Growth", icon: BarChart3 },
  { id: "content", label: "Content Strategy AI", icon: Lightbulb },
  { id: "sentiment", label: "Comment Sentiment", icon: MessageCircle },
]

export default function YouTubeAnalytics() {
  const [tab, setTab] = useState("compare")
  const [all, setAll] = useState({})
  useEffect(() => { axios.get(`${API}/youtube/analytics/all`).then(r => setAll(r.data.brands || {})).catch(() => {}) }, [])

  return (
    <div>
      <style>{`.yt-spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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
      {tab === "performance" && <PerformanceTab />}
      {tab === "benchmark" && <BenchmarkTab all={all} />}
      {tab === "growth" && <GrowthTab />}
      {tab === "content" && <ContentTab />}
      {tab === "sentiment" && <SentimentTab />}
    </div>
  )
}
