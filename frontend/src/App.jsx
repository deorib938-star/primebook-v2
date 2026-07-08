import { useState } from "react"
import Overview from "./pages/Overview"
import News from "./pages/News"
import PriceTracking from "./pages/PriceTracking"
import SocialMedia from "./pages/SocialMedia"
import AIResearch from "./pages/AIResearch"


export default function App() {
  const [activePage, setActivePage] = useState("overview")

  const navItems = [
    { id: "overview", label: "Overview", icon: "🏠" },
    { id: "news", label: "News & Insights", icon: "📰" },
    { id: "price", label: "Price Tracking", icon: "💰" },
    { id: "social", label: "Social & YouTube", icon: "📱" },
    { id: "ai", label: "AI Research", icon: "🤖" },
  ]

  const renderPage = () => {
    switch (activePage) {
      case "overview": return <Overview />
      case "news":     return <News />
      case "price":    return <PriceTracking />
      case "social":   return <SocialMedia />
      case "ai":       return <AIResearch />
      default:         return <Overview />
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", backgroundColor: "#141820", color: "#e2e8f0", overflow: "hidden" }}>

      {/* SIDEBAR */}
      <div style={{ width: "256px", backgroundColor: "#0f1218", borderRight: "1px solid #2a3347", display: "flex", flexDirection: "column" }}>

        {/* Logo */}
        <div style={{ padding: "24px", borderBottom: "1px solid #2a3347" }}>
          <p style={{ color: "#C9A84C", fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em" }}>PRIMEBOOK INDIA</p>
          <h1 style={{ color: "white", fontSize: "18px", fontWeight: "700", marginTop: "4px" }}>Competitor Intel</h1>
          <p style={{ color: "#4a5568", fontSize: "11px", marginTop: "4px" }}>Market Intelligence Dashboard</p>
          <div style={{ height: "1px", background: "linear-gradient(90deg, #C9A84C, transparent)", marginTop: "12px" }}></div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "12px 16px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "500",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                border: "none",
                cursor: "pointer",
                backgroundColor: activePage === item.id ? "#C9A84C" : "transparent",
                color: activePage === item.id ? "#0f1218" : "#94a3b8",
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: "16px", borderTop: "1px solid #2a3347" }}>
          <p style={{ color: "#2a3347", fontSize: "11px", textAlign: "center" }}>CONFIDENTIAL · INTERNAL USE</p>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {renderPage()}
      </div>

    </div>
  )
}