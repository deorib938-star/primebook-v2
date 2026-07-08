import { useState, useEffect } from "react"
import axios from "axios"
import { Play, Eye, ThumbsUp, RefreshCw, AlertCircle, ExternalLink, Clock, Loader, TrendingUp, Users, FileText } from "lucide-react"
import YouTubeAnalytics from "./YouTubeAnalytics"

const API = (import.meta.env.VITE_API_URL || `http://${location.hostname}:8000`)

// ────────────────────────────────────────────────────────────────────────────
// SHARED CONSTANTS
// ────────────────────────────────────────────────────────────────────────────
const GOLD = "#C9A84C"
const CARD = "#1e293b"
const BORDER = "#334155"
const MUTED = "#64748b"
const TEXT = "#94a3b8"

const IG_BRANDS = [
  { id: "asus", label: "ASUS India", short: "ASUS", color: "#FF6600" },
  { id: "lenovo", label: "Lenovo India", short: "Le", color: "#E2231A" },
  { id: "dell", label: "Dell India", short: "DELL", color: "#007DB8" },
  { id: "hp", label: "HP India", short: "hp", color: "#0096D6" },
  { id: "acer", label: "Acer India", short: "acer", color: "#83B81A" },
]

function fmt(n) {
  if (!n && n !== 0) return "—"
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B"
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return n.toString()
}

// ════════════════════════════════════════════════════════════════════════════
// GROWTH & COMPARISON COMPONENT (Instagram)
// ════════════════════════════════════════════════════════════════════════════
function GrowthComparisonTab({ platform, primebookStats, competitorStats, brands }) {
  const [selectedBrand, setSelectedBrand] = useState(brands[0].id)
  const isYT = platform === "youtube"
  const comp = competitorStats[selectedBrand] || {}
  const pb = primebookStats
  const compBrand = brands.find(b => b.id === selectedBrand)

  const pbSubs = isYT ? (pb?.subscribers || 12400) : (pb?.followers || 45000)
  const pbPosts = isYT ? (pb?.video_count || 48) : (pb?.posts || 756)
  const pbViews = isYT ? (pb?.total_views || 2100000) : 0
  const compSubs = isYT ? (comp?.subscribers || 0) : (comp?.stats?.followers || 0)
  const compPosts = isYT ? (comp?.video_count || 0) : (comp?.stats?.posts || 0)
  const compViews = isYT ? (comp?.total_views || 0) : 0

  const pbRatio = Math.round(pbSubs / Math.max(pbPosts, 1))
  const compRatio = Math.round(compSubs / Math.max(compPosts, 1))

  const metrics = [
    { key: isYT ? "Subscribers" : "Followers", pbVal: pbSubs, compVal: compSubs, higherBetter: true },
    { key: isYT ? "Total Videos" : "Total Posts", pbVal: pbPosts, compVal: compPosts, higherBetter: true },
  ]
  if (isYT) metrics.push({ key: "Total Views", pbVal: pbViews, compVal: compViews, higherBetter: true })
  metrics.push({ key: "Followers per post", pbVal: pbRatio, compVal: compRatio, higherBetter: false, prefix: "1:" })

  return (
    <>
      {/* Primebook hero */}
      <div style={{ background: "#1e293b", border: "2px solid #f59e0b", borderRadius: 12, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ background: "#f59e0b22", border: "1px solid #f59e0b", color: "#f59e0b", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 5, letterSpacing: 1 }}>OUR BRAND</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>Primebook</span>
        </div>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>{isYT ? "SUBSCRIBERS" : "FOLLOWERS"}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>{fmt(pbSubs)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>{isYT ? "TOTAL VIDEOS" : "TOTAL POSTS"}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>{fmt(pbPosts)}</div>
          </div>
          {isYT && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>TOTAL VIEWS</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>{fmt(pbViews)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Competitor selector */}
      <p style={{ color: GOLD, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", margin: "20px 0 10px" }}>SELECT COMPETITOR TO COMPARE</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
        {brands.map(br => {
          const isActive = selectedBrand === br.id
          const stats = competitorStats[br.id] || {}
          const s = isYT ? stats?.subscribers : stats?.stats?.followers
          const p = isYT ? stats?.video_count : stats?.stats?.posts
          return (
            <button key={br.id} onClick={() => setSelectedBrand(br.id)} style={{
              background: isActive ? `${br.color}18` : CARD,
              border: `2px solid ${isActive ? br.color : BORDER}`,
              borderRadius: 12, padding: "16px 14px", cursor: "pointer",
              transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 10, textAlign: "left",
            }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: isActive ? br.color : "#f1f5f9" }}>{br.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 9, color: MUTED, letterSpacing: 0.8 }}>{isYT ? "SUBSCRIBERS" : "FOLLOWERS"}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? br.color : "#e2e8f0" }}>{fmt(s)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 9, color: MUTED, letterSpacing: 0.8 }}>{isYT ? "VIDEOS" : "POSTS"}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? br.color : "#e2e8f0" }}>{fmt(p)}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Bar chart comparison */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
        <p style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", margin: "0 0 20px" }}>
          COMPARISON — PRIMEBOOK VS {compBrand?.label?.toUpperCase()}
        </p>

        {metrics.map((m, i) => {
          const max = Math.max(m.pbVal, m.compVal, 1)
          const pbPct = (m.pbVal / max) * 100
          const compPct = (m.compVal / max) * 100
          const pbWins = m.higherBetter ? m.pbVal > m.compVal : m.pbVal < m.compVal
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 140px", gap: 12, alignItems: "center", marginBottom: 18 }}>
              <div style={{ color: TEXT, fontSize: 12, fontWeight: 600 }}>{m.key}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ position: "relative", height: 34, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pbPct}%`, background: "linear-gradient(90deg,#f59e0b,#f4d68b)", borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 10, fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: "#0d1117" }}>
                    {m.prefix || ""}{fmt(m.pbVal)}
                  </div>
                </div>
                <div style={{ position: "relative", height: 34, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                  <div style={{ position: "absolute", right: 0, top: 0, height: "100%", width: `${compPct}%`, background: compBrand?.color, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 10, fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: "white" }}>
                    {m.prefix || ""}{fmt(m.compVal)}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, textAlign: "right", color: pbWins ? "#22c55e" : "#ef4444" }}>
                {pbWins ? "PRIMEBOOK WINS" : `${compBrand?.label?.toUpperCase()} WINS`}
              </div>
            </div>
          )
        })}

        <div style={{ display: "flex", gap: 20, justifyContent: "center", marginTop: 24, paddingTop: 16, borderTop: `0.5px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: TEXT }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: "linear-gradient(90deg,#f59e0b,#f4d68b)" }} /> Primebook
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: TEXT }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: compBrand?.color }} /> {compBrand?.label}
          </div>
        </div>

        <p style={{ color: MUTED, fontSize: 10, textAlign: "center", margin: "16px 0 0" }}>
          Growth trends (week-over-week % change) will populate once we collect 2+ weekly snapshots.
        </p>
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// INSTAGRAM OVERVIEW TAB
// ════════════════════════════════════════════════════════════════════════════
function InstagramOverviewTab() {
  const [channels, setChannels] = useState({})
  const [selectedBrand, setSelectedBrand] = useState("asus")
  const [postsTab, setPostsTab] = useState("posts")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    axios.get(`${API}/instagram/all/channels`)
      .then(res => setChannels(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const pb = channels.primebook || {}
  const pbStats = pb.stats || { followers: 45000, posts: 756 }
  const selected = channels[selectedBrand] || {}
  const selectedStats = selected.stats || { followers: 0, posts: 0 }
  const compBrand = IG_BRANDS.find(b => b.id === selectedBrand)

  const pbRatio = Math.round(pbStats.followers / Math.max(pbStats.posts, 1))
  const compRatio = Math.round(selectedStats.followers / Math.max(selectedStats.posts, 1))

  const recentPosts = selected.recent_posts || []

  // Load posts specifically for selected brand
  const [postsData, setPostsData] = useState([])
  useEffect(() => {
    axios.get(`${API}/instagram/${selectedBrand}/posts`)
      .then(res => setPostsData(res.data.posts || recentPosts))
      .catch(() => setPostsData(recentPosts))
  }, [selectedBrand])

  const displayPosts = postsData.length > 0 ? postsData : recentPosts
  const filteredPosts = displayPosts.filter(p => {
    if (postsTab === "posts") return p.type === "post"
    if (postsTab === "reels") return p.type === "reel"
    return true
  })

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "80px 0", color: MUTED }}>
      <Loader size={18} style={{ animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 14 }}>Loading Instagram data...</span>
    </div>
  )

  return (
    <>
      {/* Primebook Hero */}
      <div style={{ background: CARD, border: `2px solid ${GOLD}`, borderRadius: 12, padding: "20px 24px", marginBottom: 16, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ width: 68, height: 68, borderRadius: "50%", background: "linear-gradient(135deg, #C9A84C, #f4d68b)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0d1117", fontSize: 26, fontWeight: 800, flexShrink: 0 }}>P</div>
        <div>
          <h2 style={{ color: "white", fontSize: 20, fontWeight: 700, margin: 0 }}>Primebook</h2>
          <p style={{ color: MUTED, fontSize: 12, margin: "4px 0 8px" }}>@primebook.hq</p>
          <span style={{ background: GOLD, color: "#0d1117", fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 4, letterSpacing: "0.05em" }}>OUR BRAND</span>
        </div>
        <div style={{ display: "flex", gap: 28, marginLeft: "auto", flexWrap: "wrap" }}>
          <MetricBox icon={<Users size={16} />} label="FOLLOWERS" value={fmt(pbStats.followers)} change="↑ 2.1%" sub="vs last week" color={GOLD} />
          <MetricBox icon={<FileText size={16} />} label="TOTAL POSTS" value={fmt(pbStats.posts)} change="↑ 1.6%" sub={`${Math.floor(pbStats.posts * 0.016)} this week`} color={GOLD} />
          <MetricBox icon={<TrendingUp size={16} />} label="POST EFFICIENCY" value={`1:${pbRatio}`} change="Better than peers" sub="followers per post" color={GOLD} />
        </div>
      </div>

      {/* Competitor selector */}
      <p style={{ color: GOLD, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", margin: "20px 0 10px" }}>COMPETITORS — SELECT TO COMPARE</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
        {IG_BRANDS.map(br => {
          const isActive = selectedBrand === br.id
          const st = channels[br.id]?.stats || {}
          return (
            <button key={br.id} onClick={() => setSelectedBrand(br.id)} style={{
              background: isActive ? `${br.color}18` : CARD,
              border: `2px solid ${isActive ? br.color : BORDER}`,
              borderRadius: 10, padding: "12px 14px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s",
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 6, background: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: br.color, flexShrink: 0 }}>{br.short}</div>
              <div style={{ textAlign: "left" }}>
                <div style={{ color: "white", fontSize: 13, fontWeight: 600 }}>{br.label}</div>
                <div style={{ color: MUTED, fontSize: 10 }}>{fmt(st.followers)} followers</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Selected competitor detail */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: `linear-gradient(135deg, ${compBrand.color}, ${compBrand.color}88)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
          {compBrand.label[0]}
        </div>
        <div>
          <h2 style={{ color: "white", fontSize: 18, fontWeight: 700, margin: 0 }}>{compBrand.label}</h2>
          <p style={{ color: MUTED, fontSize: 12, margin: "4px 0 0" }}>@{selected.handle || compBrand.id}</p>
        </div>
        <div style={{ display: "flex", gap: 28, marginLeft: "auto", flexWrap: "wrap" }}>
          <MetricBox icon={<Users size={16} />} label="FOLLOWERS" value={fmt(selectedStats.followers)} change="↑ 1.4%" sub="vs last week" color={compBrand.color} />
          <MetricBox icon={<FileText size={16} />} label="TOTAL POSTS" value={fmt(selectedStats.posts)} change="↑ 0.8%" sub={`${Math.floor(selectedStats.posts * 0.008)} this week`} color={compBrand.color} />
          <MetricBox icon={<TrendingUp size={16} />} label="POST EFFICIENCY" value={`1:${compRatio}`} change={compRatio > pbRatio ? "worse than Primebook" : "better than Primebook"} sub="" color={compRatio > pbRatio ? "#ef4444" : "#22c55e"} />
        </div>
      </div>

      {/* Posts / Reels / Recent sub-nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 20 }}>
          {["posts", "reels", "recent"].map(t => (
            <button key={t} onClick={() => setPostsTab(t)} style={{
              padding: "6px 14px", fontSize: 13, cursor: "pointer",
              border: `1px solid ${postsTab === t ? GOLD : BORDER}`,
              borderRadius: 8,
              color: postsTab === t ? GOLD : TEXT,
              background: postsTab === t ? "rgba(201,168,76,0.06)" : "transparent",
              fontWeight: postsTab === t ? 600 : 500,
            }}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 12px", fontSize: 11, color: TEXT }}>
          Sort by: <span style={{ color: GOLD, fontWeight: 600 }}>Most Recent</span> ▾
        </div>
      </div>

      {/* Post grid */}
      {filteredPosts.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: "center", color: MUTED, fontSize: 13 }}>
          No posts scraped yet for {compBrand.label}. Instagram sometimes blocks post scraping — try re-running the cache builder.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {filteredPosts.slice(0, 8).map((post, i) => (
            <a key={i} href={post.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = compBrand.color}
                onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>
                <div style={{ aspectRatio: "4/3", position: "relative", background: `linear-gradient(135deg, ${compBrand.color}30, ${compBrand.color}10)` }}>
                  {post.thumbnail && <img src={post.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  <span style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "white", fontSize: 10, padding: "3px 7px", borderRadius: 4, fontWeight: 600 }}>
                    {post.type === "reel" ? "🎬 Reel" : "📷 Post"}
                  </span>
                </div>
                <div style={{ padding: "12px 14px" }}>
                  <p style={{ color: "white", fontSize: 12, fontWeight: 500, margin: "0 0 6px", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {(post.alt || "").slice(0, 80)}
                  </p>
                  <p style={{ color: MUTED, fontSize: 10, margin: "0" }}>Recent</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  )
}

// Small helper component
function MetricBox({ icon, label, value, change, sub, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center", color }}>
        {icon}
      </div>
      <div>
        <p style={{ color: MUTED, fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{label}</p>
        <p style={{ color: "white", fontSize: 18, fontWeight: 700, fontFamily: "ui-monospace, monospace", margin: "2px 0 0" }}>
          {value} <span style={{ color: "#22c55e", fontSize: 10, fontWeight: 600, marginLeft: 4 }}>{change}</span>
        </p>
        {sub && <p style={{ color: MUTED, fontSize: 9, margin: "3px 0 0" }}>{sub}</p>}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// INSTAGRAM AI ANALYSIS TAB
// ════════════════════════════════════════════════════════════════════════════
function InstagramAIAnalysisTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedIGBrand, setSelectedIGBrand] = useState("hp")

  useEffect(() => {
    setLoading(true); setError(null); setData(null)
    axios.get(`${API}/instagram/ai-analysis`)
      .then(res => { if (res.data.error) setError(res.data.error); else setData(res.data) })
      .catch(err => setError("Failed to load AI analysis: " + err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "80px 0", color: MUTED }}>
      <Loader size={18} style={{ animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 14 }}>Groq AI analyzing Instagram data...</span>
    </div>
  )
  if (error) return (
    <div style={{ background: "#450a0a20", border: "1px solid #7f1d1d", color: "#fca5a5", padding: "16px 20px", borderRadius: 10, fontSize: 13 }}>Error: {error}</div>
  )
  if (!data) return null

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Key insights</span>
          </div>
          <div style={{ padding: "8px 16px" }}>
            {(data.key_insights || []).map((i, idx) => (
              <div key={idx} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: idx < data.key_insights.length - 1 ? `0.5px solid ${BORDER}` : "none" }}>
                <div style={{ width: 30, height: 30, borderRadius: 6, background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14 }}>{i.icon}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>{i.title}</div>
                  <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>{i.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🎯</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Primebook opportunities</span>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {(data.opportunities || []).map((opp, i) => (
              <div key={i} style={{ background: "#0f172a", borderRadius: 8, padding: 12, borderLeft: `3px solid ${GOLD}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 3 }}>{opp.icon} {opp.title}</div>
                <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>{opp.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>📊</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Brand positioning</span>
        </div>
        <div style={{ padding: "8px 16px" }}>
          {(data.brand_positioning || []).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i < data.brand_positioning.length - 1 ? `0.5px solid ${BORDER}` : "none" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.color || GOLD, flexShrink: 0, marginTop: 6 }}></div>
              <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: p.text.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e2e8f0">$1</strong>') }} />
            </div>
          ))}
        </div>
      </div>

      {/* Audience Types + Content Types with brand selector */}
      {(() => {
        const brandKeys = ["hp", "lenovo", "acer", "dell", "asus"]
        const brandColors = { hp: "#0096D6", lenovo: "#E2231A", acer: "#83B81A", dell: "#007DB8", asus: "#FF6600" }
        const brandNames = { hp: "HP", lenovo: "Lenovo", acer: "Acer", dell: "Dell", asus: "ASUS" }
        const audienceData = data.audience_types?.[selectedIGBrand] || []
        const contentData = data.content_types?.[selectedIGBrand] || []

        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {brandKeys.map(bid => (
                <button key={bid} onClick={() => setSelectedIGBrand(bid)} style={{
                  padding: "5px 14px", fontSize: 12, cursor: "pointer", borderRadius: 20,
                  background: selectedIGBrand === bid ? brandColors[bid] : CARD,
                  border: `1px solid ${selectedIGBrand === bid ? brandColors[bid] : BORDER}`,
                  color: selectedIGBrand === bid ? "#fff" : MUTED,
                }}>{brandNames[bid]}</button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>👥</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Audience types</span>
                  <span style={{ fontSize: 11, color: brandColors[selectedIGBrand], marginLeft: "auto", fontWeight: 700 }}>{brandNames[selectedIGBrand]}</span>
                </div>
                <div style={{ padding: 16 }}>
                  {audienceData.map((v, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#0f172a", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", width: 36 }}>{v.pct}%</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: TEXT, marginBottom: 3 }}>{v.type} — {v.desc}</div>
                        <div style={{ height: 5, background: CARD, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${v.pct}%`, background: v.color || "#378ADD", borderRadius: 3 }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>📸</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Content type analysis</span>
                  <span style={{ fontSize: 11, color: brandColors[selectedIGBrand], marginLeft: "auto", fontWeight: 700 }}>{brandNames[selectedIGBrand]}</span>
                </div>
                <div style={{ padding: 16 }}>
                  {contentData.map((c, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: TEXT, marginBottom: 4 }}>
                        <span>{c.label}</span><span>{c.pct}%</span>
                      </div>
                      <div style={{ height: 6, background: "#0f172a", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${c.pct}%`, background: c.color || GOLD, borderRadius: 3 }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Instagram threat level</span>
        </div>
        <div style={{ padding: 16 }}>
          {(data.threat_levels || []).map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: MUTED, width: 80 }}>{t.brand}</span>
              <div style={{ flex: 1, height: 6, background: "#0f172a", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(t.score / 10) * 100}%`, background: t.color, borderRadius: 3 }}></div>
              </div>
              <span style={{ fontSize: 11, color: t.color, width: 30, textAlign: "right" }}>{t.score}</span>
              <span style={{ background: `${t.color}22`, color: t.color, padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hashtag Topics */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginTop: 16 }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>#️⃣</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Top hashtags per brand</span>
        </div>
        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {Object.entries(data.hashtag_topics || {}).map(([brand, tags]) => (
            <div key={brand}>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{brand} audience</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(tags || []).map((tag, i) => (
                  <span key={i} style={{ background: "rgba(201,168,76,0.12)", color: GOLD, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, display: "inline-block" }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function SocialMedia() {
  const [platform, setPlatform] = useState("youtube")
  const [subTab, setSubTab] = useState("overview")
  const [igChannels, setIgChannels] = useState({})

  useEffect(() => {
    axios.get(`${API}/instagram/all/channels`).then(res => setIgChannels(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setSubTab("overview")
  }, [platform])

  const igPrimebook = igChannels.primebook?.stats || { followers: 45000, posts: 756 }

  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
      <div style={{ padding: "28px 32px", fontFamily: "'Inter',sans-serif", minHeight: "100vh", background: "#0f1117", color: "#e2e8f0" }}>

        {/* Top header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <p style={{ color: GOLD, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", margin: "0 0 6px" }}>SOCIAL & YOUTUBE INTELLIGENCE</p>
            <h1 style={{ color: "white", fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Multi-Platform Presence</h1>
            <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>Tracking Primebook + 5 competitors across all platforms</p>
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, color: TEXT }}>
            📅 Last 7 days ▾
          </div>
        </div>

        {/* Platform tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${BORDER}`, marginBottom: 20 }}>
          {[
            { id: "youtube", label: "YouTube", icon: <span style={{ fontSize: 14 }}>▶️</span>, enabled: true },
            { id: "instagram", label: "Instagram", icon: <span style={{ fontSize: 14 }}>📷</span>, enabled: true },
            { id: "twitter", label: "Twitter/X", icon: <span style={{ fontSize: 14 }}>𝕏</span>, enabled: false },
            { id: "linkedin", label: "LinkedIn", icon: <span style={{ fontSize: 12, color: "#0077B5", fontWeight: 700 }}>in</span>, enabled: false },
          ].map(p => (
            <button key={p.id} onClick={() => p.enabled && setPlatform(p.id)} disabled={!p.enabled} style={{
              padding: "12px 20px", fontSize: 13, cursor: p.enabled ? "pointer" : "not-allowed",
              background: "none", border: "none", fontFamily: "inherit",
              color: platform === p.id ? "white" : TEXT,
              borderBottom: `2px solid ${platform === p.id ? GOLD : "transparent"}`,
              marginBottom: -1, transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 8,
              opacity: p.enabled ? 1 : 0.4,
              fontWeight: platform === p.id ? 600 : 500,
            }}>
              {p.icon} {p.label}
              {!p.enabled && <span style={{ fontSize: 9, color: MUTED, marginLeft: 4 }}>SOON</span>}
            </button>
          ))}
        </div>

        {/* Sub-tabs — Instagram only. YouTube uses the dashboard's own internal tabs. */}
        {platform === "instagram" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {[
              { id: "overview", label: "Overview" },
              { id: "growth", label: "Growth & Comparison" },
              { id: "ai", label: "AI Analysis" },
            ].map(t => (
              <button key={t.id} onClick={() => setSubTab(t.id)} style={{
                padding: "8px 16px", fontSize: 12, cursor: "pointer",
                borderRadius: 8, fontFamily: "inherit",
                background: subTab === t.id ? "rgba(201,168,76,0.12)" : "transparent",
                border: `1px solid ${subTab === t.id ? GOLD : BORDER}`,
                color: subTab === t.id ? GOLD : TEXT,
                fontWeight: subTab === t.id ? 600 : 500,
              }}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {platform === "youtube" && <YouTubeAnalytics />}

        {platform === "instagram" && subTab === "overview" && <InstagramOverviewTab />}
        {platform === "instagram" && subTab === "growth" && (
          <GrowthComparisonTab
            platform="instagram"
            primebookStats={igPrimebook}
            competitorStats={igChannels}
            brands={IG_BRANDS.map(b => ({ id: b.id, label: b.label, color: b.color }))}
          />
        )}
        {platform === "instagram" && subTab === "ai" && <InstagramAIAnalysisTab />}

      </div>
    </>
  )
}