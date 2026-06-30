import { useState, useEffect } from "react";
import { Play, Eye, ThumbsUp, RefreshCw, AlertCircle, ExternalLink, Clock, Loader } from "lucide-react";
import axios from "axios";

const API = "http://127.0.0.1:8000";

const BRANDS = [
  { id: "hp",     label: "HP",     color: "#0096D6" },
  { id: "lenovo", label: "Lenovo", color: "#E2231A" },
  { id: "acer",   label: "Acer",   color: "#83B81A" },
  { id: "dell",   label: "Dell",   color: "#007DB8" },
  { id: "asus",   label: "Asus",   color: "#FF6600" },
];
const BRAND_MAP = Object.fromEntries(BRANDS.map(b => [b.id, b]));

function fmt(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}
function parseDuration(iso) {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = parseInt(m[1]||0), mi = parseInt(m[2]||0), s = parseInt(m[3]||0);
  if (h > 0) return `${h}:${String(mi).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${mi}:${String(s).padStart(2,"0")}`;
}
function timeAgo(d) {
  if (!d) return "";
  const diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 3600)     return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)    return `${Math.floor(diff/3600)}h ago`;
  if (diff < 2592000)  return `${Math.floor(diff/86400)}d ago`;
  if (diff < 31536000) return `${Math.floor(diff/2592000)}mo ago`;
  return `${Math.floor(diff/31536000)}y ago`;
}

function VideoCard({ video, color, isLive = false }) {
  const dur = parseDuration(video.duration);
  return (
    <a href={video.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
      <div style={{ padding: "14px 16px 12px", cursor: "pointer", transition: "background 0.12s" }}
        onMouseEnter={e => e.currentTarget.style.background = "#ffffff05"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 8, overflow: "hidden", background: "#0f172a", marginBottom: 10 }}>
          {video.thumbnail
            ? <img src={video.thumbnail} alt={video.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Play size={24} color={color} /></div>
          }
          {dur && (
            <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.85)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 3, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
              <Clock size={9} />{dur}
            </div>
          )}
          {isLive && (
            <div style={{ position: "absolute", top: 6, left: 6, background: "#FF0000", color: "#fff", fontSize: 9, padding: "2px 7px", borderRadius: 3, fontWeight: 700, letterSpacing: 0.5 }}>LIVE</div>
          )}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#e2e8f0", lineHeight: 1.4, marginBottom: 5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {video.title}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", display: "flex", gap: 10 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Eye size={10} />{fmt(video.views)} views</span>
          <span>{timeAgo(video.published_at)}</span>
        </div>
      </div>
    </a>
  );
}

function ShortCard({ video }) {
  return (
    <a href={video.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
      <div style={{ padding: "12px 12px", cursor: "pointer", transition: "background 0.12s" }}
        onMouseEnter={e => e.currentTarget.style.background = "#ffffff05"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <div style={{ width: "100%", aspectRatio: "9/16", borderRadius: 10, overflow: "hidden", background: "#0f172a", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {video.thumbnail
            ? <img src={video.thumbnail} alt={video.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : <Play size={18} color="#94a3b8" />
          }
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#e2e8f0", lineHeight: 1.35, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {video.title}
        </div>
        <div style={{ fontSize: 10, color: "#64748b" }}>{fmt(video.views)} views</div>
      </div>
    </a>
  );
}

function PopularRow({ rank, video, color }) {
  const dur = parseDuration(video.duration);
  return (
    <a href={video.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 20px", borderBottom: "0.5px solid #ffffff06", cursor: "pointer", transition: "background 0.12s" }}
        onMouseEnter={e => e.currentTarget.style.background = "#ffffff05"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <div style={{ fontSize: 14, color: "#475569", width: 22, flexShrink: 0, textAlign: "center", fontWeight: 600 }}>{rank}</div>
        <div style={{ width: 84, height: 52, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "#0f172a", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {video.thumbnail
            ? <img src={video.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <Play size={14} color={color} />
          }
          {dur && <div style={{ position: "absolute", bottom: 3, right: 3, background: "rgba(0,0,0,0.85)", color: "#fff", fontSize: 9, padding: "1px 4px", borderRadius: 2, fontWeight: 600 }}>{dur}</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.title}</div>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#64748b" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Eye size={10} />{fmt(video.views)}</span>
            {video.likes > 0 && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><ThumbsUp size={10} />{fmt(video.likes)}</span>}
            <span>{timeAgo(video.published_at)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}

function SortBar({ options, active, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", borderBottom: "1px solid #0f172a" }}>
      <span style={{ fontSize: 12, color: "#64748b", marginRight: 4 }}>Sort by</span>
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)} style={{
          background: active === o.key ? "#334155" : "#0f172a",
          border: `1px solid ${active === o.key ? "#475569" : "#1e293b"}`,
          color: active === o.key ? "#f1f5f9" : "#64748b",
          padding: "5px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", transition: "all 0.12s",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function LoadMore({ onClick, loading }) {
  return (
    <div onClick={!loading ? onClick : undefined}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "18px", color: "#475569", fontSize: 13, cursor: loading ? "default" : "pointer", borderTop: "1px solid #0f172a", transition: "color 0.12s" }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.color = "#94a3b8"; }}
      onMouseLeave={e => e.currentTarget.style.color = "#475569"}>
      {loading
        ? <><Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading more…</>
        : <><Play size={14} /> Load more videos</>
      }
    </div>
  );
}

function ChannelPage({ brandId, channelStats, color }) {
  const [activeTab,   setActiveTab]   = useState("Videos");
  const [sort,        setSort]        = useState("latest");
  const [videos,      setVideos]      = useState([]);
  const [nextToken,   setNextToken]   = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const b = BRAND_MAP[brandId];

  function getUrl(tab, sortKey) {
    const base = `${API}/youtube/${brandId}/tab`;
    if (tab === "Videos")  return `${base}/videos?sort=${sortKey}`;
    if (tab === "Shorts")  return `${base}/shorts?sort=${sortKey}`;
    if (tab === "Popular") return `${base}/popular`;
    if (tab === "Live")    return `${base}/live`;
    return `${base}/videos?sort=latest`;
  }

  useEffect(() => {
    setVideos([]); setNextToken(null); setLoading(true);
    axios.get(getUrl(activeTab, sort))
      .then(res => { setVideos(res.data.videos || []); setNextToken(res.data.next_page_token || null); })
      .catch(() => setVideos([]))
      .finally(() => setLoading(false));
  }, [brandId, activeTab, sort]);

  useEffect(() => {
    setActiveTab("Videos"); setSort("latest"); setVideos([]); setNextToken(null);
  }, [brandId]);

  const loadMore = async () => {
    if (!nextToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await axios.get(getUrl(activeTab, sort) + `&page_token=${encodeURIComponent(nextToken)}`);
      setVideos(prev => [...prev, ...(res.data.videos || [])]);
      setNextToken(res.data.next_page_token || null);
    } catch {}
    finally { setLoadingMore(false); }
  };

  const handleTab = (tab) => { setActiveTab(tab); setSort("latest"); };
  const sortOpts = {
    Videos:  [{ key: "latest", label: "Latest" }, { key: "popular", label: "Popular" }, { key: "oldest", label: "Oldest" }],
    Shorts:  [{ key: "latest", label: "Latest" }, { key: "popular", label: "Popular" }],
    Popular: [], Live: [],
  };

  return (
    <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
      <div style={{ height: 70, background: `${color}12`, borderBottom: `1px solid ${color}20` }} />
      <div style={{ padding: "0 24px 16px", display: "flex", alignItems: "flex-end", gap: 16, marginTop: -28 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", flexShrink: 0, background: `${color}20`, border: `3px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color, overflow: "hidden" }}>
          {channelStats?.thumbnail
            ? <img src={channelStats.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : b?.label[0]
          }
        </div>
        <div style={{ paddingBottom: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>{channelStats?.name || `${b?.label} India`}</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              { val: channelStats?.subscribers ? fmt(channelStats.subscribers) : "—", lbl: "SUBSCRIBERS" },
              { val: channelStats?.video_count  ? fmt(channelStats.video_count)  : "—", lbl: "VIDEOS" },
              { val: channelStats?.total_views  ? fmt(channelStats.total_views)  : "—", lbl: "TOTAL VIEWS" },
            ].map(({ val, lbl }) => (
              <div key={lbl}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 0.5, marginTop: 1 }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid #334155", borderBottom: "1px solid #334155", padding: "0 20px" }}>
        {["Videos", "Shorts", "Popular", "Live"].map(tab => (
          <button key={tab} onClick={() => handleTab(tab)} style={{
            padding: "11px 16px", fontSize: 13, cursor: "pointer", background: "none", border: "none",
            color: activeTab === tab ? "#f1f5f9" : "#64748b",
            borderBottom: `2px solid ${activeTab === tab ? color : "transparent"}`, transition: "all 0.15s",
          }}>{tab}</button>
        ))}
      </div>
      {sortOpts[activeTab]?.length > 0 && <SortBar options={sortOpts[activeTab]} active={sort} onChange={setSort} />}
      {activeTab === "Popular" && <div style={{ padding: "11px 20px", borderBottom: "1px solid #0f172a", fontSize: 12, color: "#64748b" }}>All-time most viewed</div>}
      {activeTab === "Live" && <div style={{ padding: "11px 20px", borderBottom: "1px solid #0f172a", fontSize: 12, color: "#64748b" }}>Past live streams</div>}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "40px 0", color: "#475569", fontSize: 13 }}>
          <Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading {activeTab.toLowerCase()}…
        </div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#475569", fontSize: 13 }}>No {activeTab.toLowerCase()} found</div>
      ) : (
        <>
          {(activeTab === "Videos" || activeTab === "Live") && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
              {videos.map(v => <VideoCard key={v.video_id} video={v} color={color} isLive={activeTab === "Live"} />)}
            </div>
          )}
          {activeTab === "Shorts" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)" }}>
              {videos.map(v => <ShortCard key={v.video_id} video={v} />)}
            </div>
          )}
          {activeTab === "Popular" && videos.map((v, i) => <PopularRow key={v.video_id} rank={i+1} video={v} color={color} />)}
          {nextToken && <LoadMore onClick={loadMore} loading={loadingMore} />}
        </>
      )}
    </div>
  );
}

function RelatedRow({ rank, video, color }) {
  const dur = parseDuration(video.duration);
  return (
    <a href={video.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
      <div style={{ padding: "11px 16px", borderBottom: "0.5px solid #ffffff08", display: "flex", alignItems: "flex-start", gap: 10, transition: "background 0.12s", cursor: "pointer" }}
        onMouseEnter={e => e.currentTarget.style.background = "#ffffff06"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#64748b", width: 16, flexShrink: 0, marginTop: 2 }}>{rank}</div>
        <div style={{ width: 60, height: 38, borderRadius: 4, flexShrink: 0, overflow: "hidden", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {video.thumbnail ? <img src={video.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Play size={14} color={color} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#e2e8f0", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 4 }}>{video.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#475569", flexWrap: "wrap" }}>
            {video.views > 0 && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Eye size={10} />{fmt(video.views)}</span>}
            {dur && <span style={{ background: "#6366f120", color: "#818cf8", fontSize: 9, padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>{dur}</span>}
            {video.channel && <span style={{ color: "#475569" }}>· {video.channel}</span>}
            {video.published_at && <span style={{ marginLeft: "auto" }}>{timeAgo(video.published_at)}</span>}
          </div>
        </div>
      </div>
    </a>
  );
}

// ─── AI Analysis Tab Component ─────────────────────────────────────────────────
function AIAnalysisTab({ activeBrand }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDemoBrand, setSelectedDemoBrand] = useState("hp")

  useEffect(() => {
    setLoading(true)
    setError(null)
    setData(null)
    axios.get(`${API}/youtube/ai-analysis`)
      .then(res => {
        if (res.data.error) setError(res.data.error)
        else setData(res.data)
      })
      .catch(err => setError("Failed to load AI analysis: " + err.message))
      .finally(() => setLoading(false))
  }, [activeBrand])

  const COLORS = { gold: "#C9A84C", blue: "#378ADD", red: "#E24B4A", green: "#28a745", orange: "#f97316" }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "80px 0", color: "#475569" }}>
      <Loader size={18} style={{ animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 14 }}>Groq AI analyzing YouTube data...</span>
    </div>
  )

  if (error) return (
    <div style={{ background: "#450a0a20", border: "1px solid #7f1d1d", color: "#fca5a5", padding: "16px 20px", borderRadius: 10, fontSize: 13 }}>
      Error: {error}
    </div>
  )

  if (!data) return null

  return (
    <div>
      {/* Row 1 — Key Insights + Opportunities side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Key insights</span>
            <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto" }}>AI-generated</span>
          </div>
          <div style={{ padding: "8px 16px" }}>
            {(data.key_insights || []).map((insight, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < data.key_insights.length - 1 ? "0.5px solid #1e293b" : "none" }}>
                <div style={{ width: 30, height: 30, borderRadius: 6, background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14 }}>{insight.icon}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>{insight.title}</div>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{insight.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🎯</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Primebook opportunities</span>
            <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto" }}>Action items</span>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {(data.opportunities || []).map((opp, i) => (
              <div key={i} style={{ background: "#0f172a", borderRadius: 8, padding: 12, borderLeft: "3px solid #C9A84C" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 3 }}>{opp.icon} {opp.title}</div>
                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{opp.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2 — AI Market Summary */}
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🧠</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>AI market summary</span>
          <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto" }}>Groq LLaMA 3.3 70B</span>
        </div>
        <div style={{ padding: "8px 16px" }}>
          {(data.market_summary || []).map((point, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i < data.market_summary.length - 1 ? "0.5px solid #1e293b" : "none" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: point.color || "#C9A84C", flexShrink: 0, marginTop: 6 }}></div>
              <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: point.text.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e2e8f0">$1</strong>') }} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: "0.5px solid #1e293b" }}>
            {(data.badges || []).map((badge, i) => (
              <span key={i} style={{ background: `${COLORS[badge.color] || "#C9A84C"}22`, color: COLORS[badge.color] || "#C9A84C", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                {badge.text}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3 — Viewer Demographics + Content Types with brand selector */}
      {(() => {
        const brandKeys = ["hp", "lenovo", "acer", "dell", "asus"]
        const brandColors = { hp: "#0096D6", lenovo: "#E2231A", acer: "#83B81A", dell: "#007DB8", asus: "#FF6600" }
        const brandNames  = { hp: "HP", lenovo: "Lenovo", acer: "Acer", dell: "Dell", asus: "Asus" }
        const selectedBrand = selectedDemoBrand
        const setSelectedBrand = setSelectedDemoBrand

        const viewerData  = data.viewer_types?.[selectedBrand]  || []
        const contentData = data.content_types?.[selectedBrand] || []

        return (
          <div style={{ marginBottom: 16 }}>
            {/* Brand selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {brandKeys.map(bid => (
                <button key={bid} onClick={() => setSelectedBrand(bid)} style={{
                  padding: "5px 14px", fontSize: 12, cursor: "pointer", borderRadius: 20,
                  background: selectedBrand === bid ? brandColors[bid] : "#1e293b",
                  border: `1px solid ${selectedBrand === bid ? brandColors[bid] : "#334155"}`,
                  color: selectedBrand === bid ? "#fff" : "#64748b",
                  transition: "all 0.15s",
                }}>{brandNames[bid]}</button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>👥</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Viewer demographics</span>
                  <span style={{ fontSize: 11, color: brandColors[selectedBrand], marginLeft: "auto", fontWeight: 700 }}>{brandNames[selectedBrand]}</span>
                </div>
                <div style={{ padding: 16 }}>
                  {viewerData.map((v, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#0f172a", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", width: 36 }}>{v.pct}%</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>{v.type} — {v.desc}</div>
                        <div style={{ height: 5, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${v.pct}%`, background: v.color || "#378ADD", borderRadius: 3 }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🎬</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Content type analysis</span>
                  <span style={{ fontSize: 11, color: brandColors[selectedBrand], marginLeft: "auto", fontWeight: 700 }}>{brandNames[selectedBrand]}</span>
                </div>
                <div style={{ padding: 16 }}>
                  {contentData.map((c, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                        <span>{c.label}</span><span>{c.pct}%</span>
                      </div>
                      <div style={{ height: 6, background: "#0f172a", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${c.pct}%`, background: c.color || "#C9A84C", borderRadius: 3 }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Row 4 — Threat Level */}
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>YouTube threat level</span>
          <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto" }}>Subscribers + engagement + posting frequency</span>
        </div>
        <div style={{ padding: 16 }}>
          {(data.threat_levels || []).map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#64748b", width: 60 }}>{t.brand}</span>
              <div style={{ flex: 1, height: 6, background: "#0f172a", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(t.score / 10) * 100}%`, background: t.color, borderRadius: 3 }}></div>
              </div>
              <span style={{ fontSize: 11, color: t.color, width: 30, textAlign: "right" }}>{t.score}</span>
              <span style={{ background: `${t.color}22`, color: t.color, padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Row 5 — Comment Sentiment */}
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>💬</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>Comment sentiment</span>
          <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto" }}>Top topics per brand</span>
        </div>
        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {Object.entries(data.comment_topics || {}).map(([brand, topics]) => (
            <div key={brand}>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{brand} viewers</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(topics || []).map((topic, i) => (
                  <span key={i} style={{ background: i < 3 ? "rgba(55,138,221,0.12)" : "rgba(226,75,74,0.12)", color: i < 3 ? "#378ADD" : "#E24B4A", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, display: "inline-block" }}>
                    {topic}
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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SocialYoutube() {
  const [mainTab,       setMainTab]       = useState("tracking")
  const [activeBrand,   setActiveBrand]   = useState("hp");
  const [channelStats,  setChannelStats]  = useState({});
  const [relatedVideos, setRelatedVideos] = useState({});
  const [pageLoading,   setPageLoading]   = useState(true);
  const [relLoading,    setRelLoading]    = useState(false);
  const [error,         setError]         = useState(null);

  useEffect(() => {
    setPageLoading(true);
    axios.get(`${API}/youtube/all/channels`)
      .then(res => setChannelStats(res.data))
      .catch(() => setError("Could not load channel data."))
      .finally(() => setPageLoading(false));
  }, []);

  useEffect(() => {
    if (relatedVideos[activeBrand]) return;
    setRelLoading(true);
    axios.get(`${API}/youtube/${activeBrand}/related`)
      .then(res => setRelatedVideos(prev => ({ ...prev, [activeBrand]: res.data.videos || [] })))
      .catch(() => setRelatedVideos(prev => ({ ...prev, [activeBrand]: [] })))
      .finally(() => setRelLoading(false));
  }, [activeBrand]);

  const color      = BRAND_MAP[activeBrand]?.color || "#6366f1";
  const curChannel = channelStats[activeBrand];
  const curRelated = relatedVideos[activeBrand] || [];

  return (
    <>
      <style>{`
        .sy-page{padding:28px 32px;font-family:'Inter',sans-serif;min-height:100vh;background:#0f1117;color:#e2e8f0}
        .sy-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
        .sy-title{display:flex;align-items:center;gap:10px;font-size:22px;font-weight:700;color:#f1f5f9}
        .sy-sub{font-size:13px;color:#64748b;margin-top:2px}
        .refresh-btn{display:flex;align-items:center;gap:6px;background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;transition:all 0.2s}
        .refresh-btn:hover{background:#334155;color:#e2e8f0}
        .error-box{background:#450a0a20;border:1px solid #7f1d1d;color:#fca5a5;padding:16px 20px;border-radius:10px;display:flex;gap:10px;align-items:flex-start;margin-bottom:24px;font-size:13px}
        .center-msg{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:80px 0;color:#475569}
        .list-card{background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden}
        .list-header{padding:14px 16px;border-bottom:1px solid #334155;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}
        .list-empty{padding:32px 16px;text-align:center;color:#475569;font-size:13px}
        .list-loading{padding:32px 16px;text-align:center;color:#475569;font-size:13px;display:flex;align-items:center;justify-content:center;gap:8px}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .spin{animation:spin 1s linear infinite}
        @media(max-width:900px){.sy-page{padding:16px}}
      `}</style>

      <div className="sy-page">

        {/* ── Main Tab Switcher ── */}
        <div style={{ display: "flex", gap: 0, marginBottom: "24px", borderBottom: "1px solid #1e293b" }}>
          {[
            { key: "tracking", label: "YouTube Tracking" },
            { key: "ai",       label: "AI Analysis" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setMainTab(tab.key)} style={{
              padding: "10px 20px", fontSize: 13, cursor: "pointer",
              background: "none", border: "none",
              color: mainTab === tab.key ? "#f1f5f9" : "#64748b",
              borderBottom: `2px solid ${mainTab === tab.key ? "#C9A84C" : "transparent"}`,
              marginBottom: "-1px", transition: "all 0.15s",
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── YouTube Tracking Tab ── */}
        {mainTab === "tracking" && (
          <>
            <div className="sy-header">
              <div>
                <div className="sy-title"><Play size={24} color="#FF0000" /> YouTube tracking</div>
                <div className="sy-sub">Official India channels — HP · Lenovo · Acer · Dell · Asus</div>
              </div>
              <button className="refresh-btn" onClick={() => window.location.reload()} disabled={pageLoading}>
                <RefreshCw size={14} className={pageLoading ? "spin" : ""} />
                {pageLoading ? "Loading…" : "Refresh"}
              </button>
            </div>

            {error && (
              <div className="error-box">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div><strong>Error:</strong> {error}</div>
              </div>
            )}

            <div style={{ background: "#1e293b", border: "2px solid #f59e0b", borderRadius: 12, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ background: "#f59e0b22", border: "1px solid #f59e0b", color: "#f59e0b", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 5, letterSpacing: 1 }}>OUR BRAND</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>Primebook</span>
              </div>
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                {[
                  { label: "SUBSCRIBERS", value: "12.4K" },
                  { label: "TOTAL VIDEOS", value: "48" },
                  { label: "TOTAL VIEWS",  value: "2.1M" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>{value}</div>
                  </div>
                ))}
              </div>
              <a href="https://www.youtube.com/@primebookhq" target="_blank" rel="noreferrer" style={{ color: "#f59e0b", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                Official Channel →
              </a>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 24 }}>
              {BRANDS.map(br => {
                const isActive = activeBrand === br.id;
                const stats    = channelStats[br.id];
                return (
                  <button key={br.id} onClick={() => setActiveBrand(br.id)} style={{
                    background: isActive ? `${br.color}18` : "#1e293b",
                    border: `2px solid ${isActive ? br.color : "#334155"}`,
                    borderRadius: 12, padding: "16px 14px", cursor: "pointer",
                    transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 10, textAlign: "left",
                  }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: isActive ? br.color : "#f1f5f9" }}>{br.label}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {[
                        { label: "SUBSCRIBERS", value: stats?.subscribers ? fmt(stats.subscribers) : "—" },
                        { label: "VIDEOS",      value: stats?.video_count  ? fmt(stats.video_count)  : "—" },
                        { label: "TOTAL VIEWS", value: stats?.total_views  ? fmt(stats.total_views)  : "—" },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontSize: 9, color: "#64748b", letterSpacing: 0.8 }}>{label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? br.color : "#e2e8f0" }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            {pageLoading ? (
              <div className="center-msg">
                <Play size={48} />
                <div style={{ fontSize: 15 }}>Loading channel stats…</div>
              </div>
            ) : error ? null : (
              <>
                <ChannelPage brandId={activeBrand} channelStats={curChannel} color={color} />
                <div className="list-card">
                  <div className="list-header" style={{ color: "#818cf8" }}>
                    <ExternalLink size={14} /> Brand-related videos
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569", fontWeight: 400 }}>
                      Third-party reviews · min 2 min · no shorts
                    </span>
                  </div>
                  {relLoading
                    ? <div className="list-loading"><Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> Searching YouTube…</div>
                    : curRelated.length === 0
                      ? <div className="list-empty">No related videos found</div>
                      : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                          {curRelated.map((v, i) => <RelatedRow key={v.video_id} rank={i+1} video={v} color={color} />)}
                        </div>
                  }
                </div>
              </>
            )}
          </>
        )}

        {/* ── AI Analysis Tab ── */}
        {mainTab === "ai" && (
          <AIAnalysisTab activeBrand={activeBrand} />
        )}

      </div>
    </>
  );
}