import { useEffect, useState, useCallback } from "react"

// Interactive multi-agent "Content Strategy AI" — shared by the YouTube & Instagram
// tabs. Forecasts current + upcoming trends (auto, from today's date) and streams
// ideas that merge a creative hook with a competitor-proof strategic edge.
// Per idea: 💾 Save (archive as a to-do) · ✓ Done · ✕ Not interested (→ fresh idea).

const API = (import.meta.env.VITE_API_URL || `http://${location.hostname}:8000`)

const GOLD = "#C9A84C", CARD = "#1C2333", BORDER = "#2a3347"
const TEXT = "#94a3b8", MUTED = "#64748b", TEAL = "#3cbfa6", GREEN = "#22c55e", RED = "#ef4444"

export default function ContentStudioAI({ platform }) {
  const [forecast, setForecast] = useState(null)
  const [active, setActive]     = useState([])
  const [stats, setStats]       = useState({ saved: 0, done: 0 })
  const [loading, setLoading]   = useState(true)
  const [busy, setBusy]         = useState(false)
  const [notice, setNotice]     = useState("")
  const [view, setView]         = useState("feed")     // feed | archive
  const [arch, setArch]         = useState({ saved: [], done: [] })

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setNotice("")
    try {
      const r = await fetch(`${API}/content-studio/${platform}${refresh ? "?refresh=true" : ""}`)
      const d = await r.json()
      setForecast(d.forecast || null)
      setActive(d.active || [])
      setStats(d.stats || { saved: 0, done: 0 })
      if (!(d.active || []).length) setNotice(d.forecast?.error ? "AI could not generate right now (Groq daily limit). Try again later." : "No ideas yet — hit refresh.")
    } catch {
      setNotice("Could not reach the AI service.")
    }
    setLoading(false)
  }, [platform])

  useEffect(() => { load() }, [load])

  async function act(idea, action) {
    setBusy(true); setNotice("")
    try {
      const r = await fetch(`${API}/content-studio/${platform}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, idea }),
      })
      const d = await r.json()
      setActive(d.active || [])
      setStats(d.stats || stats)
      if (action === "save") setNotice("Saved to your ideas.")
      else if (action === "done") setNotice("Marked done. 🎉")
      else if (!d.replacement) setNotice("Skipped — could not fetch a fresh idea right now (Groq limit).")
    } catch {
      setNotice("Action failed — try again.")
    }
    setBusy(false)
  }

  async function openArchive() {
    setView("archive")
    try {
      const d = await (await fetch(`${API}/content-studio/${platform}/archive`)).json()
      setArch({ saved: d.saved || [], done: d.done || [] })
      setStats(d.stats || stats)
    } catch { /* ignore */ }
  }

  async function markDone(idea) {
    await fetch(`${API}/content-studio/${platform}/unsave`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "done", idea }),
    })
    openArchive()
  }

  const isYT = platform === "youtube"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ color: "white", fontSize: 16, fontWeight: 700 }}>🤖 Content Strategy AI</div>
          <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>
            Auto-forecasts current &amp; upcoming trends · every idea rides a trend + a competitor-proof edge
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={pill(GREEN)}>Saved {stats.saved}</span>
          <span style={pill(MUTED)}>Done {stats.done}</span>
          <button style={btnGhost} onClick={() => (view === "feed" ? openArchive() : setView("feed"))}>
            {view === "feed" ? "📁 My ideas" : "← Back to feed"}
          </button>
          {view === "feed" && <button style={btnGhost} onClick={() => load(true)} disabled={loading || busy}>↻ New trends</button>}
        </div>
      </div>

      {notice && <div style={{ color: GOLD, fontSize: 12, background: "rgba(201,168,76,0.08)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px" }}>{notice}</div>}

      {/* ARCHIVE VIEW */}
      {view === "archive" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={sectionLbl(GOLD)}>💾 Saved — to make ({arch.saved.length})</div>
            {arch.saved.length === 0 ? <Empty t="Nothing saved yet." /> :
              arch.saved.map((i, k) => (
                <div key={k} style={{ ...card, marginBottom: 10 }}>
                  <IdeaBody idea={i} isYT={isYT} />
                  <button style={{ ...btnDone, marginTop: 10 }} onClick={() => markDone(i)}>✓ Mark done</button>
                </div>
              ))}
          </div>
          <div>
            <div style={sectionLbl(GREEN)}>✓ Done ({arch.done.length})</div>
            {arch.done.length === 0 ? <Empty t="No completed ideas yet." /> :
              arch.done.map((i, k) => (
                <div key={k} style={{ ...card, marginBottom: 10, opacity: 0.75 }}>
                  <IdeaBody idea={i} isYT={isYT} />
                </div>
              ))}
          </div>
        </div>
      ) : loading ? (
        <div style={{ color: TEXT, padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🤖</div>
          Generating your content strategy…<br />
          <span style={{ color: MUTED, fontSize: 12 }}>first load can take a moment</span>
        </div>
      ) : (
        <>
          {/* FORECAST */}
          {forecast && (
            <div style={{ ...card, borderTop: `2px solid ${TEAL}` }}>
              <div style={sectionLbl(TEAL)}>📈 What&apos;s coming — get ahead of it</div>
              {(forecast.trends_now || []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0 12px" }}>
                  {forecast.trends_now.map((t, i) => <span key={i} style={pill(TEAL)}>{t}</span>)}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                {(forecast.upcoming || []).map((u, i) => (
                  <div key={i} style={{ background: "#141820", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ color: "white", fontSize: 13, fontWeight: 700 }}>{u.event}</div>
                    <div style={{ color: TEAL, fontSize: 10, fontFamily: "monospace", margin: "2px 0 6px" }}>{u.when}</div>
                    <div style={{ color: TEXT, fontSize: 11, lineHeight: 1.5 }}>{u.why}</div>
                    {u.get_ahead && <div style={{ color: GOLD, fontSize: 11, marginTop: 6 }}><b>Start now:</b> {u.get_ahead}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IDEA FEED */}
          <div style={sectionLbl(GOLD)}>💡 Ideas — save it, mark done, or skip for a fresh one</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14, opacity: busy ? 0.55 : 1, transition: "opacity .15s" }}>
            {active.map((idea) => (
              <div key={idea.id} style={{ ...card, display: "flex", flexDirection: "column" }}>
                <IdeaBody idea={idea} isYT={isYT} />
                <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
                  <button style={btnSave} disabled={busy} onClick={() => act(idea, "save")}>💾 Save</button>
                  <button style={btnDone} disabled={busy} onClick={() => act(idea, "done")}>✓ Done</button>
                  <button style={btnSkip} disabled={busy} onClick={() => act(idea, "not_interested")}>✕ Not interested</button>
                </div>
              </div>
            ))}
          </div>
          {busy && <div style={{ color: MUTED, fontSize: 12, textAlign: "center" }}>updating…</div>}
          {!active.length && !loading && <Empty t="No active ideas — hit ↻ New trends." />}
        </>
      )}
    </div>
  )
}

function IdeaBody({ idea, isYT }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ ...pill(isYT ? RED : GOLD), color: "#0f1218", background: isYT ? RED : GOLD }}>{idea.format || (isYT ? "Video" : "Post")}</span>
        {idea.trend && <span style={pill(TEAL)}>📈 {idea.trend}</span>}
      </div>
      <div style={{ color: "white", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{idea.title}</div>
      {idea.hook && <div style={{ color: "#e2e8f0", fontStyle: "italic", fontSize: 13, borderLeft: `3px solid ${GOLD}`, paddingLeft: 10, marginBottom: 8 }}>{idea.hook}</div>}
      {idea.concept && <div style={{ color: TEXT, fontSize: 12, lineHeight: 1.55, marginBottom: 8 }}>{idea.concept}</div>}
      {idea.why_it_works && <Line k="Why it works" v={idea.why_it_works} c={GREEN} />}
      {idea.edge && <Line k="Our edge" v={idea.edge} c={GOLD} />}
    </div>
  )
}

const Line = ({ k, v, c }) => (
  <div style={{ fontSize: 12, marginTop: 4 }}>
    <span style={{ color: c, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>{k}: </span>
    <span style={{ color: TEXT }}>{v}</span>
  </div>
)
const Empty = ({ t }) => <div style={{ color: MUTED, fontSize: 13, padding: 16 }}>{t}</div>

const card = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }
const sectionLbl = (c) => ({ color: c, fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 })
const pill = (c) => ({ background: `${c}22`, color: c, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" })
const btnBase = { fontSize: 12, fontWeight: 600, borderRadius: 8, padding: "8px 10px", cursor: "pointer", border: `1px solid ${BORDER}` }
const btnSave = { ...btnBase, flex: 1, background: "rgba(201,168,76,0.14)", color: GOLD, borderColor: GOLD }
const btnDone = { ...btnBase, flex: 1, background: "rgba(34,197,94,0.14)", color: GREEN, borderColor: GREEN }
const btnSkip = { ...btnBase, flex: 1, background: "transparent", color: MUTED }
const btnGhost = { ...btnBase, background: "transparent", color: TEXT }
