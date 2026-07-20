import { useState, useEffect, useRef } from "react"
import axios from "axios"
import ContentStudioAI from "../components/ContentStudioAI"
import {
  Chart as ChartJS, BarController, BarElement, LineController, LineElement, PointElement,
  RadarController, RadialLinearScale, CategoryScale, LinearScale, Tooltip, Legend, Filler,
} from "chart.js"
import {
  RefreshCw, Users, Image as ImageIcon, Film, Clock, Target, Lightbulb,
  Crown, Sparkles, Grid3x3, TrendingUp,
} from "lucide-react"

ChartJS.register(
  BarController, BarElement, LineController, LineElement, PointElement,
  RadarController, RadialLinearScale, CategoryScale, LinearScale, Tooltip, Legend, Filler,
)

const API = (import.meta.env.VITE_API_URL || `http://${location.hostname}:8000`)

const GOLD = "#C9A84C", CARD = "#1e293b", PANEL = "#0f172a", BORDER = "#334155", MUTED = "#64748b", TEXT = "#94a3b8"
const GREEN = "#22c55e", BLUE = "#3b82f6", RED = "#ef4444", PURPLE = "#a78bfa", PINK = "#ec4899"

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
  if (s < 0 || isNaN(s)) return ""
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]]
  for (const [name, secs] of units) { const n = Math.floor(s / secs); if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago` }
  return "just now"
}

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
    <RefreshCw size={18} className="ig-spin" /> Loading {what}…
  </div>
)

// ── Chart.js wrappers (same style as the YouTube dashboard) ───────────────────
function useChartRef(build, deps) {
  const ref = useRef(null), inst = useRef(null)
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
function Bar({ labels, values, colors, horizontal = false, height = 260, valueFmt = commas }) {
  const ref = useChartRef(() => ({
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 6, maxBarThickness: 44 }] },
    options: {
      indexAxis: horizontal ? "y" : "x", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => " " + valueFmt(c.parsed[horizontal ? "x" : "y"]) } } },
      scales: {
        x: { ticks: { color: MUTED, font: { size: 11 } }, grid: { color: horizontal ? GRID : "transparent" }, border: { display: false } },
        y: { ticks: { color: MUTED, font: { size: 11 } }, grid: { color: horizontal ? "transparent" : GRID }, border: { display: false } },
      },
    },
  }), [labels.join("|"), values.join("|"), horizontal])
  return <div style={{ height, position: "relative" }}><canvas ref={ref} /></div>
}
function Radar({ labels, datasets, height = 300 }) {
  const ref = useChartRef(() => ({
    type: "radar",
    data: { labels, datasets: datasets.map(d => ({ label: d.label, data: d.data, borderColor: d.color, backgroundColor: d.color + "33", pointBackgroundColor: d.color, borderWidth: 2, pointRadius: 3 })) },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: TEXT, font: { size: 12 }, usePointStyle: true } }, tooltip: { enabled: false } },
      scales: { r: { angleLines: { color: BORDER }, grid: { color: BORDER }, pointLabels: { color: TEXT, font: { size: 11 } }, ticks: { display: false, backdropColor: "transparent" }, suggestedMin: 0, suggestedMax: 100 } },
    },
  }), [labels.join("|"), JSON.stringify(datasets)])
  return <div style={{ height, position: "relative" }}><canvas ref={ref} /></div>
}
function Line({ labels, datasets, height = 300 }) {
  const ref = useChartRef(() => ({
    type: "line",
    data: { labels, datasets: datasets.map(d => ({ label: d.label, data: d.data, borderColor: d.color, backgroundColor: d.color + "22", borderWidth: d.ours ? 3 : 2, pointRadius: 3, tension: 0.3, fill: false, spanGaps: true })) },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: TEXT, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: c => " " + c.dataset.label + ": " + commas(c.parsed.y) } } },
      scales: { x: { ticks: { color: MUTED, font: { size: 11 } }, grid: { color: "transparent" } }, y: { ticks: { color: MUTED, font: { size: 11 }, callback: v => fmt(v) }, grid: { color: GRID } } },
    },
  }), [labels.join("|"), JSON.stringify(datasets.map(d => d.data))])
  return <div style={{ height, position: "relative" }}><canvas ref={ref} /></div>
}

function BrandPicker({ value, onChange, includeOurs = false }) {
  const list = includeOurs ? [PB_META, ...BRANDS] : BRANDS
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
      {list.map(b => {
        const on = value === b.id
        return (
          <button key={b.id} onClick={() => onChange(b.id)} style={{
            padding: "6px 14px", fontSize: 12, borderRadius: 16, cursor: "pointer", fontFamily: "inherit",
            border: `1px solid ${on ? b.color : BORDER}`, background: on ? b.color : "transparent",
            color: on ? "#0f1117" : TEXT, fontWeight: on ? 700 : 500,
          }}>{b.id === "primebook" ? "★ " : ""}{b.label}</button>
        )
      })}
    </div>
  )
}
function Pill({ children, color = GOLD }) {
  return <span style={{ background: `${color}22`, color, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 12, display: "inline-block" }}>{children}</span>
}

// ═══ COMPARE ═════════════════════════════════════════════════════════════════
function CompareTab({ all }) {
  const [rival, setRival] = useState("hp")
  if (!Object.keys(all || {}).length) return <Loading what="comparison" />
  const ours = all.primebook || { label: "Primebook", followers: 0, posts: 0, following: 0, followers_per_post: 0 }
  const rows = [{ ...PB_META, ...(all.primebook || {}), ours: true }, ...BRANDS.map(b => ({ ...b, ...(all[b.id] || {}) }))]
  const bySubs = [...rows].sort((a, b) => (b.followers || 0) - (a.followers || 0))
  const ourRank = bySubs.findIndex(r => r.ours) + 1

  const barData = key => rows.map(r => ({ label: r.label, v: r[key] || 0, c: r.color }))
  const followers = barData("followers"), eff = barData("followers_per_post"), posts = barData("posts")

  const rv = { ...BMAP[rival], ...(all[rival] || {}) }
  const axes = [
    { key: "followers", label: "Followers" },
    { key: "posts", label: "Total Posts" },
    { key: "following", label: "Following" },
    { key: "followers_per_post", label: "Followers / Post" },
  ]
  const norm = who => axes.map(a => { const mx = Math.max(ours[a.key] || 0, rv[a.key] || 0, 1); return Math.round(((who[a.key] || 0) / mx) * 100) })

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ ...card, borderColor: GOLD, background: "linear-gradient(135deg, rgba(201,168,76,0.10), rgba(201,168,76,0.02))", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}><Crown size={22} color="#0f1117" /></div>
          <div>
            <div style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em" }}>OUR ACCOUNT · @primebook.hq</div>
            <div style={{ color: "white", fontSize: 20, fontWeight: 800 }}>Rank #{ourRank} of {rows.length} by followers</div>
            <div style={{ color: MUTED, fontSize: 10 }}>live from the tracked Instagram profile</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          {[["Followers", fmt(ours.followers)], ["Total posts", fmt(ours.posts)], ["Followers / post", fmt(ours.followers_per_post)], ["Reels", (ours.reel_share ?? 0) + "%"]].map(([k, v]) => (
            <div key={k} style={{ textAlign: "center" }}><div style={label}>{k}</div><div style={{ color: GOLD, fontSize: 20, fontWeight: 800, fontFamily: "monospace", marginTop: 4 }}>{v}</div></div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={card}><SectionTitle icon={Users} note="ours in gold">Followers</SectionTitle>
          <Bar labels={followers.map(d => d.label)} values={followers.map(d => d.v)} colors={followers.map(d => d.c)} /></div>
        <div style={card}><SectionTitle icon={TrendingUp} note="followers ÷ total posts">Follower efficiency</SectionTitle>
          <Bar labels={eff.map(d => d.label)} values={eff.map(d => d.v)} colors={eff.map(d => d.c)} /></div>
      </div>

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
          <Radar labels={axes.map(a => a.label)} datasets={[{ label: "Primebook", data: norm(ours), color: GOLD }, { label: rv.label, data: norm(rv), color: rv.color || BLUE }]} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {axes.map(a => {
              const ov = ours[a.key] || 0, tv = rv[a.key] || 0
              const win = a.key === "following" ? ov <= tv : ov >= tv
              return (
                <div key={a.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: PANEL }}>
                  <span style={{ color: TEXT, fontSize: 12 }}>{a.label}</span>
                  <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: GOLD, fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>{fmt(ov)}</span>
                    <span style={{ color: MUTED, fontSize: 10 }}>vs</span>
                    <span style={{ color: rv.color, fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>{fmt(tv)}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: win ? GREEN : RED, width: 34, textAlign: "right" }}>{win ? "LEAD" : "GAP"}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={card}><SectionTitle icon={ImageIcon} note="lifetime total">Total posts published</SectionTitle>
        <Bar labels={posts.map(d => d.label)} values={posts.map(d => d.v)} colors={posts.map(d => d.c)} horizontal height={220} /></div>
    </div>
  )
}

// ═══ POSTS (grid + per-post AI content analysis) ══════════════════════════════
const TONE = { good: GREEN, warn: GOLD, bad: RED, neutral: BLUE }

function PostAI({ brand, index }) {
  const [open, setOpen] = useState(false), [ai, setAi] = useState(null), [loading, setLoading] = useState(false)
  function toggle() {
    const n = !open; setOpen(n)
    if (n && !ai && !loading) {
      setLoading(true)
      axios.get(`${API}/instagram/post-analysis/${brand}?i=${index}`)
        .then(r => setAi(r.data)).catch(() => setAi({ error: 1 })).finally(() => setLoading(false))
    }
  }
  const tone = ai ? (TONE[ai.badge_tone] || BLUE) : BLUE
  return (
    <div style={{ borderTop: `0.5px solid ${BORDER}` }}>
      <button onClick={toggle} style={{ width: "100%", background: "transparent", border: "none", color: GOLD, fontSize: 11, fontWeight: 600, padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
        <Sparkles size={12} /> {open ? "Hide AI analysis" : "Content analysis — AI"}
      </button>
      {open && (
        <div style={{ padding: "0 12px 12px" }}>
          {loading || !ai ? <div style={{ color: MUTED, fontSize: 11, padding: "4px 0" }}>Analyzing…</div>
            : ai.error ? <div style={{ color: RED, fontSize: 11 }}>Analysis failed — try again.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {ai.badge_text && <div><span style={{ background: `${tone}22`, color: tone, fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 4 }}>{ai.badge_text}</span></div>}
                <div style={{ color: TEXT, fontSize: 11.5, lineHeight: 1.5 }}><b style={{ color: "#e2e8f0" }}>What it is:</b> {ai.summary}</div>
                <div>
                  <div style={{ ...label, marginBottom: 4 }}>Analysis</div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: TEXT, fontSize: 11.5, lineHeight: 1.6 }}>{(ai.points || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
                {ai.action && ai.action_label && <div style={{ color: TEXT, fontSize: 11.5, lineHeight: 1.5 }}><b style={{ color: GOLD }}>{ai.action_label}:</b> {ai.action}</div>}
              </div>
            )}
        </div>
      )}
    </div>
  )
}

function PostsTab() {
  const [brand, setBrand] = useState("primebook")
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); axios.get(`${API}/instagram/analytics/${brand}`).then(r => setD(r.data)).catch(() => setD({ error: 1 })) }, [brand])

  return (
    <div>
      <BrandPicker value={brand} onChange={setBrand} includeOurs />
      {!d ? <Loading what="posts" /> : d.error ? <div style={{ color: RED, padding: 20 }}>Not cached.</div>
        : !(d.recent_posts || []).length ? (
          <div style={{ ...card, borderColor: GOLD }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>No posts scraped for this brand</div>
            <div style={{ color: TEXT, fontSize: 12, marginTop: 4 }}>Instagram blocked the grid for {meta(brand).label} during the last scrape (it happens for private/rate-limited profiles). Re-run <code style={{ color: GOLD }}>python instagram_cache_builder.py</code>.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
            {d.recent_posts.map(p => (
              <div key={p.index} style={{ ...card, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <a href={p.url} target="_blank" rel="noreferrer" style={{ display: "block", position: "relative" }}>
                  <img src={p.thumbnail} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                  <span style={{ position: "absolute", top: 8, right: 8, background: (p.type === "reel" ? PURPLE : BLUE) + "cc", color: "white", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {p.type === "reel" ? <Film size={9} /> : <ImageIcon size={9} />}{p.type === "reel" ? "REEL" : "POST"}
                  </span>
                </a>
                <div style={{ padding: "8px 10px", flex: 1 }}>
                  {p.taken_at && (
                    <div style={{ color: GOLD, fontSize: 10, marginBottom: 4 }}>{relativeTime(p.taken_at)}</div>
                  )}
                  <div style={{ color: TEXT, fontSize: 11, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.caption || "No caption"}</div>
                </div>
                <PostAI brand={brand} index={p.index} />
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ═══ CONTENT STRATEGY (AI) ════════════════════════════════════════════════════
function ContentTab() {
  return <ContentStudioAI platform="instagram" />
}

// ═══ GROWTH ══════════════════════════════════════════════════════════════════
function GrowthTab() {
  const [g, setG] = useState(null)
  useEffect(() => { axios.get(`${API}/instagram/growth/history`).then(r => setG(r.data)).catch(() => setG({ error: 1 })) }, [])
  if (!g) return <Loading what="growth history" />
  if (g.error) return <div style={{ color: RED, padding: 20 }}>Failed to load.</div>

  const gl = [PB_META, ...BRANDS]
  const dates = [...new Set(gl.flatMap(b => (g.brands?.[b.id]?.series || []).map(s => s.date)))].sort()
  const datasets = gl.map(b => ({ label: b.label, color: b.color, ours: b.id === "primebook", data: dates.map(dt => { const p = (g.brands?.[b.id]?.series || []).find(s => s.date === dt); return p ? p.followers : null }) }))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {g.collecting && (
        <div style={{ ...card, borderColor: GOLD, background: "rgba(201,168,76,0.06)", display: "flex", gap: 10 }}>
          <Clock size={16} color={GOLD} style={{ flexShrink: 0, marginTop: 2 }} />
          <div><div style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>Follower tracking is collecting data</div>
            <div style={{ color: TEXT, fontSize: 12, marginTop: 3 }}>{g.message} Trend lines fill in as weekly snapshots accumulate (hit <code style={{ color: GOLD }}>/instagram/growth/record</code> after each cache rebuild).</div></div>
        </div>
      )}
      <div style={card}>
        <SectionTitle icon={TrendingUp} note={`${g.count} snapshot(s)`}>Followers over time</SectionTitle>
        {dates.length >= 2 ? <Line labels={dates} datasets={datasets} />
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {gl.map(b => {
                const s = g.brands?.[b.id]?.series || []; const latest = s[s.length - 1]
                return (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `0.5px solid ${BORDER}` }}>
                    <span style={{ width: 70, color: b.color, fontWeight: 700, fontSize: 12 }}>{b.label}</span>
                    <span style={{ color: "white", fontSize: 13, fontFamily: "monospace" }}>{fmt(latest?.followers)}</span>
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

// ═══ AUDIENCE (content mix = real · demographics = AI estimate) ═══════════════
function AudienceTab() {
  const [brand, setBrand] = useState("primebook")
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); axios.get(`${API}/instagram/audience/${brand}`).then(r => setD(r.data)).catch(() => setD({ error: 1 })) }, [brand])
  const dm = d?.demographics || {}
  return (
    <div>
      <BrandPicker value={brand} onChange={setBrand} includeOurs />
      {!d ? <Loading what="audience (AI)" /> : d.error ? <div style={{ color: RED, padding: 20 }}>Not cached.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={card}><SectionTitle icon={Grid3x3} note="real — reel vs static share">Content mix they post</SectionTitle>
            <Bar labels={(d.content_mix || []).map(c => c.type)} values={(d.content_mix || []).map(c => c.share_pct)} colors={[PURPLE, BLUE]} horizontal height={140} valueFmt={v => v + "%"} /></div>

          <div style={{ ...card, background: "rgba(59,130,246,0.06)", borderColor: BLUE, color: TEXT, fontSize: 12, lineHeight: 1.5 }}>
            <b style={{ color: "#e2e8f0" }}>AI estimate.</b> Age & profession aren't published for other accounts — inferred from content, not measured. Instagram also hides per-post views, so formats can't be ranked by views here.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div style={card}><SectionTitle icon={Users} note="estimated">Age distribution</SectionTitle>
              <Bar labels={(dm.age || []).map(a => a.band)} values={(dm.age || []).map(a => a.pct)} colors={(dm.age || []).map(() => PURPLE)} horizontal height={200} valueFmt={v => v + "%"} /></div>
            <div style={card}><SectionTitle icon={Users} note="estimated">Who follows & why</SectionTitle>
              {(dm.profession || []).map((p, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "white", fontSize: 12, fontWeight: 600 }}>{p.label}</span><span style={{ color: GOLD, fontWeight: 700, fontSize: 12 }}>{p.pct}%</span></div>
                  <div style={{ color: TEXT, fontSize: 11 }}>{p.why}</div>
                </div>
              ))}
            </div>
          </div>
          {dm.summary && <div style={card}><div style={{ ...label, color: GOLD }}>Why this audience</div><div style={{ color: "white", fontSize: 13, marginTop: 6 }}>{dm.summary}</div></div>}
        </div>
      )}
    </div>
  )
}

// ═══ SHELL ═══════════════════════════════════════════════════════════════════
const TABS = [
  { id: "compare", label: "Compare", icon: Crown },
  { id: "posts", label: "Posts", icon: Grid3x3 },
  { id: "audience", label: "Audience", icon: Users },
  { id: "content", label: "Content Strategy AI", icon: Lightbulb },
  { id: "growth", label: "Growth", icon: TrendingUp },
]

export default function InstagramAnalytics() {
  const [tab, setTab] = useState("compare")
  const [all, setAll] = useState({})
  useEffect(() => { axios.get(`${API}/instagram/analytics/all`).then(r => setAll(r.data.brands || {})).catch(() => {}) }, [])

  return (
    <div>
      <style>{`.ig-spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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
      {tab === "posts" && <PostsTab />}
      {tab === "audience" && <AudienceTab />}
      {tab === "content" && <ContentTab />}
      {tab === "growth" && <GrowthTab />}

      <div style={{ marginTop: 20, color: MUTED, fontSize: 10, lineHeight: 1.5 }}>
        Instagram exposes far less than YouTube: no per-post likes/views/dates and no comments. So this dashboard covers followers, post mix, content strategy and follower growth — engagement/benchmark/sentiment tabs are omitted rather than faked.
      </div>
    </div>
  )
}
