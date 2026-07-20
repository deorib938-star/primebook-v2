# ================================
# CONTENT STRATEGY AI  (multi-agent, native)
# ================================
# One combined engine for the YouTube + Instagram "Content Strategy AI" tabs.
# It merges the idea-generator and the war-room strategist into a single stream:
# every idea rides a real CURRENT or UPCOMING trend and carries a strategic edge.
#
#  • Trends are NOT hardcoded. The forecaster reasons from *today's date* about
#    what is relevant now and, crucially, what is COMING (exam seasons, festivals,
#    sale events, new semesters, big cultural/sports moments) so we can get ahead
#    of it. Stale events (already passed) are excluded automatically.
#  • Interactive: generate a batch, then per idea →  Save (archive as a to-do) /
#    Already done / Not interested (drop it and serve a fresh one).
#  • State persists to content_studio_state.json.

import os
import json
import asyncio
from datetime import datetime

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from agents import agent_call

GNEWS_KEY = os.environ.get("GNEWS_API_KEY", "")

router = APIRouter(prefix="/content-studio", tags=["content-studio"])

STATE_FILE = "content_studio_state.json"
PLATFORMS = ("youtube", "instagram")
ACTIVE_TARGET = 5
_LOCK = asyncio.Lock()

# ── Grounding (stable facts — not trends) ────────────────────────────────────
PRIMEBOOK = (
    "Primebook India makes Android-based laptops running PrimeOS 3.0 (India's first "
    "Android laptop OS). Models: 2 Neo (~Rs.17,990), 2 Pro (~Rs.26,990), 2 Max (~Rs.29,990). "
    "Unfair advantages competitors can't match: PrimeOS + 50,000+ Android apps, Cloud PC "
    "streaming full Windows/Linux from Rs.19, keymapping (play BGMI with keyboard), "
    "mobile-grade sensors, class-leading price-to-performance, IIT-founder / Shark Tank / "
    "boAt-backed underdog story, and a witty meme-native social voice. Audience: Indian "
    "students, exam aspirants, young creators, freelancers, early professionals."
)
COMPETITORS = (
    "Competitors (HP, Lenovo, Dell, Acer, ASUS India) sell the same Windows laptops as "
    "everyone and market them in a polished, corporate, product-showcase tone. Weak spots: "
    "HP over-promotional, Lenovo generic, Dell dry/business, Acer & ASUS gaming-only. None "
    "can claim an Android laptop OS, Cloud-PC-from-Rs.19, or a nimble founder/meme voice."
)

CREATOR_ROLE = (
    "You are an elite challenger-brand content creator AND growth strategist for Primebook "
    "India. You live on Instagram and YouTube, you know this cycle's trends, and you turn "
    "them into scroll-stopping ideas that ALSO carry a strategic edge competitors can't copy. "
    "You never ship safe, generic, done-before ideas."
)
FORECAST_ROLE = (
    "You are a cultural-trend forecaster who deeply understands India's youth and student "
    "calendar (exams, admissions, festivals, sale events, semesters, sports, cinema, memes) "
    "and how they play out on Instagram and YouTube. You reason from the current date and "
    "look AHEAD, so a brand can prepare content before a moment peaks."
)


# ── State persistence ─────────────────────────────────────────────────────────
def _blank():
    return {"forecast": None, "active": [], "queue": [], "saved": [], "done": [],
            "rejected_titles": [], "seq": 0}


def _load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                d = json.loads(f.read().strip() or "{}")
        except Exception:
            d = {}
    else:
        d = {}
    for p in PLATFORMS:
        d.setdefault(p, _blank())
    return d


def _save_state(d: dict):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _stats(ps: dict) -> dict:
    return {"saved": len(ps.get("saved", [])), "done": len(ps.get("done", []))}


# ── Live trend signal (real, current — grounds the forecast) ──────────────────
async def _live_signals() -> list:
    """Pull today's real headlines from GNews so the forecaster reflects what's
    ACTUALLY happening in India this week — not the model's memory of the calendar."""
    if not GNEWS_KEY:
        return []
    q = ('India (students OR exam OR gaming OR gadget OR laptop OR trending OR '
         'festival OR sale OR "back to school" OR cricket OR movie OR AI)')
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get("https://gnews.io/api/v4/search", params={
                "q": q, "lang": "en", "country": "in", "max": 10,
                "sortby": "publishedAt", "apikey": GNEWS_KEY,
            })
            arts = r.json().get("articles", [])
    except Exception as e:
        print(f"[content-studio] live signal fetch failed: {e}")
        return []
    out = []
    for a in arts:
        out.append({
            "title": (a.get("title") or "").strip(),
            "date": (a.get("publishedAt") or "")[:10],
            "source": a.get("source", {}).get("name", ""),
        })
    return [x for x in out if x["title"]]


# ── Generation ────────────────────────────────────────────────────────────────
async def _forecast(platform: str) -> dict:
    today = _today()
    plat = "YouTube" if platform == "youtube" else "Instagram"
    signals = await _live_signals()
    if signals:
        signal_block = ("REAL HEADLINES FROM THE LAST FEW DAYS (live signal — this is what is "
                        "ACTUALLY happening in India right now; base your read of 'now' on these):\n"
                        + "\n".join(f"  - [{s['date']}] {s['title']}" for s in signals))
        grounding = "Derive 'trends_now' from the real headlines above (what has momentum THIS week)."
    else:
        signal_block = "(No live headline feed available right now.)"
        grounding = ("No live feed — infer only what is genuinely current for {today}; be honest "
                     "and do not invent specific viral moments.")

    prompt = f"""Today's date is {today}. You are forecasting content opportunities for
Primebook India on {plat}.

{PRIMEBOOK}

{signal_block}

Return ONLY this JSON:
{{
  "trends_now": ["3-5 things genuinely happening / trending in India RIGHT NOW (this week) that Primebook can ride on {plat} — grounded in the real headlines above where possible"],
  "upcoming": [
    {{"event": "an emerging or near-term moment", "when": "how soon (prefer THIS WEEK to ~4 weeks out)", "why": "why it's an attention opportunity for Primebook + students", "get_ahead": "what to make NOW to ride it before it peaks"}}
  ]
}}
Rules:
- {grounding}
- 'upcoming' must prioritise the NEXT 1-4 WEEKS. Only include something further out if it has real momentum building NOW. Do NOT pad the list with generic annual events that are months away (no listing Diwali/IPL/exams just because they exist on the calendar) unless a real signal above points to them.
- Order soonest / most-current first. Do NOT mention anything that already ended before {today}.
- Give 4-5 items in each list."""

    res = await agent_call(FORECAST_ROLE, prompt, max_tokens=1600, temperature=0.4)
    if not isinstance(res, dict) or "error" in res:
        return {"trends_now": [], "upcoming": [], "generated_on": today,
                "signal_count": len(signals),
                "error": res.get("error") if isinstance(res, dict) else "forecast failed"}
    return {"trends_now": res.get("trends_now", []), "upcoming": res.get("upcoming", []),
            "generated_on": today, "signal_count": len(signals)}


async def _generate_ideas(platform: str, forecast: dict, avoid: list, n: int) -> list:
    plat = "YouTube" if platform == "youtube" else "Instagram"
    formats = ("Long-form | Short" if platform == "youtube"
               else "Reel | Carousel | Story series")
    avoid_block = ""
    if avoid:
        avoid_block = ("\n\nDo NOT repeat or lightly reword any of these already-used ideas:\n"
                       + "\n".join(f"  - {t}" for t in avoid[-30:]))
    prompt = f"""{PRIMEBOOK}

{COMPETITORS}

CURRENT + UPCOMING TRENDS (use these — ride a specific one per idea):
{json.dumps(forecast, ensure_ascii=False)[:1800]}
{avoid_block}

Generate {n} {plat} content ideas ({formats}). Every idea MUST:
- ride ONE specific trend/event from the forecast above (current OR upcoming — name it),
- carry a strategic EDGE: a Primebook advantage competitors literally cannot copy
  (PrimeOS/Android apps, Cloud PC from Rs.19, keymapping/BGMI, sensors, price, underdog voice),
- be genuinely NEW and bold — never unboxings, "5 reasons", or generic study/price reels.

Return ONLY this JSON:
{{
  "ideas": [
    {{
      "format": "{formats}",
      "title": "short internal name",
      "trend": "the specific current/upcoming trend or event this rides",
      "hook": "the exact scroll-stopping first line / on-screen text",
      "concept": "2-3 sentences on what happens in the piece",
      "why_it_works": "1 sentence: why it performs for this audience right now",
      "edge": "1 sentence: the competitor-proof Primebook advantage it lands"
    }}
  ]
}}"""
    res = await agent_call(CREATOR_ROLE, prompt, max_tokens=2600, temperature=0.7)
    raw = res.get("ideas", []) if isinstance(res, dict) else []
    out = []
    for d in raw:
        if not isinstance(d, dict) or not d.get("title"):
            continue
        out.append({
            "platform": platform,
            "format": d.get("format", ""),
            "title": d.get("title", ""),
            "trend": d.get("trend", ""),
            "hook": d.get("hook", ""),
            "concept": d.get("concept", ""),
            "why_it_works": d.get("why_it_works", ""),
            "edge": d.get("edge", ""),
        })
    return out[:n]


def _used_titles(ps: dict) -> list:
    seen = [i["title"] for i in ps.get("saved", []) + ps.get("done", [])]
    seen += ps.get("rejected_titles", [])
    seen += [i["title"] for i in ps.get("active", []) + ps.get("queue", [])]
    return seen


async def _ensure_forecast(ps: dict, platform: str):
    fc = ps.get("forecast")
    if not fc or fc.get("generated_on") != _today() or not fc.get("upcoming"):
        ps["forecast"] = await _forecast(platform)


async def _generate_into_queue(ps: dict, platform: str, n: int):
    """Generate a fresh batch into the queue, avoiding everything already used."""
    batch = await _generate_ideas(platform, ps.get("forecast") or {},
                                  _used_titles(ps), max(n, 4))
    for idea in batch:
        ps["seq"] += 1
        idea["id"] = ps["seq"]
        ps["queue"].append(idea)


def _topup_from_queue(ps: dict):
    """Move buffered ideas into the active feed — no generation (instant)."""
    while len(ps["active"]) < ACTIVE_TARGET and ps["queue"]:
        ps["active"].append(ps["queue"].pop(0))


# ── API models ────────────────────────────────────────────────────────────────
class Action(BaseModel):
    action: str          # "save" | "done" | "not_interested"
    idea: dict


# ── Routes ────────────────────────────────────────────────────────────────────
@router.get("/{platform}")
async def get_feed(platform: str, refresh: bool = False):
    if platform not in PLATFORMS:
        return {"error": "unknown platform"}
    async with _LOCK:
        state = _load_state()
        ps = state[platform]
        if refresh:
            ps["forecast"] = None
            ps["active"] = []
            ps["queue"] = []
        await _ensure_forecast(ps, platform)
        _topup_from_queue(ps)
        if not ps["active"]:                      # nothing to show — generate once
            await _generate_into_queue(ps, platform, ACTIVE_TARGET + 3)
            _topup_from_queue(ps)
        _save_state(state)
        return {"platform": platform, "forecast": ps["forecast"],
                "active": ps["active"], "stats": _stats(ps),
                "generated_on": _today()}


@router.post("/{platform}/action")
async def act(platform: str, a: Action):
    if platform not in PLATFORMS:
        return {"error": "unknown platform"}
    async with _LOCK:
        state = _load_state()
        ps = state[platform]
        idea = a.idea or {}
        iid = idea.get("id")
        title = idea.get("title", "")

        # remove from active
        ps["active"] = [x for x in ps["active"] if x.get("id") != iid]

        if a.action == "save":
            ps["saved"].append(idea)
        elif a.action == "done":
            ps["done"].append(idea)
        else:  # not_interested
            if title:
                ps["rejected_titles"].append(title)

        # Refill from the buffer instantly. Only "Not interested" pays for fresh
        # generation (that's the action that explicitly asks for a new idea);
        # Save / Done just archive and pull the next buffered idea if any.
        _topup_from_queue(ps)
        if a.action == "not_interested" and len(ps["active"]) < ACTIVE_TARGET:
            await _ensure_forecast(ps, platform)
            await _generate_into_queue(ps, platform, 4)
            _topup_from_queue(ps)
        replacement = ps["active"][-1] if ps["active"] else None
        _save_state(state)
        return {"replacement": replacement, "active": ps["active"],
                "stats": _stats(ps)}


@router.get("/{platform}/archive")
async def archive(platform: str):
    if platform not in PLATFORMS:
        return {"error": "unknown platform"}
    state = _load_state()
    ps = state[platform]
    return {"saved": ps.get("saved", []), "done": ps.get("done", []),
            "stats": _stats(ps)}


@router.post("/{platform}/unsave")
async def unsave(platform: str, a: Action):
    """Move an item out of saved/done (e.g. mark a saved to-do as done, or restore)."""
    if platform not in PLATFORMS:
        return {"error": "unknown platform"}
    async with _LOCK:
        state = _load_state()
        ps = state[platform]
        iid = (a.idea or {}).get("id")
        ps["saved"] = [x for x in ps.get("saved", []) if x.get("id") != iid]
        if a.action == "done":
            ps["done"].append(a.idea)
        _save_state(state)
        return {"stats": _stats(ps)}
