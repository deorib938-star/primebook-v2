import { useState } from "react"
import YouTubeAnalytics from "./YouTubeAnalytics"
import InstagramAnalytics from "./InstagramAnalytics"

const GOLD = "#C9A84C", CARD = "#1e293b", BORDER = "#334155", MUTED = "#64748b", TEXT = "#94a3b8"

const PLATFORMS = [
  { id: "youtube", label: "YouTube", icon: "▶️", enabled: true },
  { id: "instagram", label: "Instagram", icon: "📷", enabled: true },
  { id: "twitter", label: "Twitter/X", icon: "𝕏", enabled: false },
  { id: "linkedin", label: "LinkedIn", icon: "in", enabled: false },
]

export default function SocialMedia() {
  const [platform, setPlatform] = useState("youtube")

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'Inter',sans-serif", minHeight: "100vh", background: "#0f1117", color: "#e2e8f0" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ color: GOLD, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", margin: "0 0 6px" }}>SOCIAL & YOUTUBE INTELLIGENCE</p>
        <h1 style={{ color: "white", fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Multi-Platform Presence</h1>
        <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>Tracking Primebook + 5 competitors across platforms</p>
      </div>

      {/* Platform tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${BORDER}`, marginBottom: 20 }}>
        {PLATFORMS.map(p => (
          <button key={p.id} onClick={() => p.enabled && setPlatform(p.id)} disabled={!p.enabled} style={{
            padding: "12px 20px", fontSize: 13, cursor: p.enabled ? "pointer" : "not-allowed",
            background: "none", border: "none", fontFamily: "inherit",
            color: platform === p.id ? "white" : TEXT,
            borderBottom: `2px solid ${platform === p.id ? GOLD : "transparent"}`,
            marginBottom: -1, transition: "all 0.15s", display: "flex", alignItems: "center", gap: 8,
            opacity: p.enabled ? 1 : 0.4, fontWeight: platform === p.id ? 600 : 500,
          }}>
            <span style={{ fontSize: 14 }}>{p.icon}</span> {p.label}
            {!p.enabled && <span style={{ fontSize: 9, color: MUTED, marginLeft: 4 }}>SOON</span>}
          </button>
        ))}
      </div>

      {/* Content — each dashboard owns its internal tabs */}
      {platform === "youtube" && <YouTubeAnalytics />}
      {platform === "instagram" && <InstagramAnalytics />}
      {(platform === "twitter" || platform === "linkedin") && (
        <div style={{ background: CARD, border: `0.5px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: "center", color: MUTED }}>
          Coming soon.
        </div>
      )}
    </div>
  )
}
