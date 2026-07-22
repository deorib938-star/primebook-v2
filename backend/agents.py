# ================================
# MULTI-AGENT ORCHESTRATION LAYER
# ================================
# A small, self-contained crew runner built on the existing httpx + Groq stack.
# No new dependencies — deploys as-is on Render's free tier.
#
# Model: instead of one LLM call doing an entire complex report, we split the
# work across focused *specialist* agents that run concurrently, then assemble
# their outputs deterministically. Each specialist owns a subset of the final
# JSON keys, so the endpoint's output contract stays identical for the frontend.
#
# Usage:
#   from agents import Agent, run_crew
#   crew = [
#       Agent("Pattern Analyst", system="...", prompt="...", keys=["title_patterns"]),
#       Agent("Topic Analyst",   system="...", prompt="...", keys=["topic_clusters"]),
#   ]
#   merged = await run_crew(crew)   # -> {"title_patterns": [...], "topic_clusters": [...], "_meta": {...}}

import os
import re
import json
import asyncio
from dataclasses import dataclass, field

import httpx

# Ensure .env is loaded even if this module is imported before main calls
# load_dotenv() (import order in main.py puts this import first).
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Resolved at call time (not import time) so a late-loaded .env is picked up.
def _groq_key() -> str:
    return os.environ.get("GROQ_API_KEY", "")

def _groq_model() -> str:
    return os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")


def _extract_json(content: str) -> dict:
    """Robustly pull a JSON object out of an LLM response.
    Mirrors the cleanup that main._groq_json does (fenced blocks, trailing
    commas, smart quotes) so behaviour is consistent across the codebase."""
    content = content.strip()
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]
    content = content.strip()
    content = re.sub(r",\s*}", "}", content)
    content = re.sub(r",\s*]", "]", content)
    content = content.replace("’", "").replace("‘", "")
    content = content.replace("“", '"').replace("”", '"')
    return json.loads(content)


def _retry_after_seconds(msg: str) -> float:
    """Pull Groq's suggested wait ('Please try again in 14.75s') out of an error."""
    m = re.search(r"try again in ([\d.]+)\s*s", msg or "")
    if m:
        try:
            return min(float(m.group(1)) + 0.5, 30.0)
        except ValueError:
            pass
    return 8.0  # sane default when the message has no explicit hint


# When the primary model's daily/token quota is exhausted, fall back to this one
# (separate quota bucket on Groq's free tier) so features keep working.
FALLBACK_MODEL = "llama-3.1-8b-instant"


async def agent_call(
    system: str,
    prompt: str,
    max_tokens: int = 1500,
    temperature: float = 0.3,
    model: str | None = None,
    max_retries: int = 4,
    api_key: str | None = None,
) -> dict:
    """Single specialist LLM call. Returns parsed JSON, or {"error": ...}.

    `api_key` lets callers route to a dedicated Groq account/key (e.g. the live
    Content Strategy AI uses its own key so batch warming can't starve it);
    falls back to the default GROQ_API_KEY when not given.

    Retries per-minute rate limits (honoring the suggested wait); if a model's
    *daily* quota is exhausted (or the wait is impractically long) it falls back
    to a smaller model with a separate quota so the call still succeeds."""
    key = (api_key or _groq_key()).strip()
    models = [model or _groq_model()]
    if FALLBACK_MODEL not in models:
        models.append(FALLBACK_MODEL)

    last_err = "unknown"
    for mi, mdl in enumerate(models):
        for attempt in range(max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=90) as client:
                    resp = await client.post(
                        GROQ_URL,
                        headers={
                            "Authorization": f"Bearer {key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": mdl,
                            "messages": [
                                {"role": "system", "content": system},
                                {"role": "user", "content": prompt},
                            ],
                            "temperature": temperature,
                            "max_tokens": max_tokens,
                            "response_format": {"type": "json_object"},
                        },
                    )
                    data = resp.json()
                    if "error" in data:
                        emsg = data["error"].get("message", str(data["error"]))
                        last_err = emsg
                        low = emsg.lower()
                        is_rate = resp.status_code == 429 or "rate limit" in low
                        if is_rate:
                            daily = "per day" in low or "tpd" in low or "requests per day" in low
                            wait = _retry_after_seconds(emsg)
                            if (daily or wait > 20) and mi < len(models) - 1:
                                print(f"[agent] {mdl} quota hit — falling back to {models[mi+1]}")
                                break  # jump to fallback model
                            if attempt < max_retries:
                                print(f"[agent] rate-limited, waiting {wait:.1f}s (attempt {attempt+1}/{max_retries})")
                                await asyncio.sleep(wait)
                                continue
                            break
                        return {"error": emsg}
                    if "choices" not in data:
                        return {"error": str(data)[:200]}
                    return _extract_json(data["choices"][0]["message"]["content"])
            except json.JSONDecodeError as e:
                return {"error": f"JSON parse error: {e}"}
            except Exception as e:
                last_err = str(e)
                if attempt < max_retries:
                    await asyncio.sleep(2.0)
                    continue
    return {"error": last_err}


@dataclass
class Agent:
    """One specialist in a crew.

    name        human-readable label (shown in _meta / logs)
    system      persona / role instruction (system message)
    prompt      the task prompt — already includes the shared context
    keys        top-level output keys this agent is responsible for
    max_tokens  per-agent generation budget
    temperature sampling temperature
    """
    name: str
    system: str
    prompt: str
    keys: list = field(default_factory=list)
    max_tokens: int = 1500
    temperature: float = 0.3


async def run_crew(agents: list, model: str | None = None, max_concurrency: int = 2) -> dict:
    """Run specialists (capped concurrency) and assemble their owned keys.

    Each agent contributes only the keys it declares in `keys` (defensive:
    an agent that over-returns won't pollute another's section). Agents that
    error out simply don't contribute — the caller decides whether the
    partial result is usable or a fallback is needed.

    `max_concurrency` keeps token bursts under Groq's free-tier TPM limit;
    combined with per-call retry this makes the crew resilient on free tier.

    Returns the merged dict plus an "_meta" section listing which agents
    succeeded and any errors (frontend ignores unknown keys)."""
    sem = asyncio.Semaphore(max(1, max_concurrency))

    async def _run(a: "Agent") -> dict:
        async with sem:
            return await agent_call(a.system, a.prompt, a.max_tokens, a.temperature, model)

    results = await asyncio.gather(*[_run(a) for a in agents])

    merged: dict = {}
    meta = {"strategy": "multi-agent", "agents": [], "errors": []}
    for a, r in zip(agents, results):
        if isinstance(r, dict) and "error" not in r:
            picked = [k for k in a.keys if k in r]
            for k in picked:
                merged[k] = r[k]
            meta["agents"].append({"name": a.name, "keys": picked})
        else:
            err = r.get("error") if isinstance(r, dict) else str(r)
            meta["errors"].append({"agent": a.name, "error": err})

    merged["_meta"] = meta
    return merged


def crew_covered(merged: dict, required_keys: list) -> bool:
    """True if the crew produced every key the endpoint's contract needs."""
    return all(k in merged for k in required_keys)
