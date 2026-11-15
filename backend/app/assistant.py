"""
N1 Hub — physician "design copilot" (TEMPLATE / scaffold, disabled by default).

Scope (strict):
- Helps CLINICIANS use the site and DESIGN tests / data-collection plans.
- Reasons ONLY over: how the site works + the device/signal catalog + the design rules +
  the capabilities the caller passes in (which devices/signals are available to collect).
- It is STRUCTURALLY barred from patient data: it is given NO tools that read
  /api/patients, series, results, episodes, symptoms or any values. The only patient-ish
  input it ever sees is "these sensors are available / these signals can be collected".
- It never diagnoses, never invents devices/signals/verdicts, and refuses off-topic asks.

Kill switch (two independent ways to cut it instantly):
  1. Remove the credential env var (ANTHROPIC_API_KEY, or the Agent-SDK token) → account fully
     disconnected; `is_enabled()` is False → the endpoint returns 503 and the widget hides.
  2. Set ASSISTANT_ENABLED=false → soft off even if a credential is present.
Nothing is called unless BOTH a credential is present AND ASSISTANT_ENABLED is truthy.
"""
import json
import os

PROVIDER = os.environ.get("ASSISTANT_PROVIDER", "anthropic_api")  # "anthropic_api" | "agent_sdk"
MODEL = os.environ.get("ASSISTANT_MODEL", "claude-sonnet-4-6")
MAX_TOKENS = 700
TEMPERATURE = 0.2   # low: we want consistent, grounded answers, not creativity


def _credential_present():
    if PROVIDER == "agent_sdk":
        # Agent SDK uses your Claude subscription (Max plan) via its own login/token.
        return bool(os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def is_enabled():
    """Master gate + kill switch. False => endpoint should 503 and the frontend should hide the widget."""
    if os.environ.get("ASSISTANT_ENABLED", "false").lower() not in ("1", "true", "yes"):
        return False
    return _credential_present()


# --------------------------------------------------------------------------- #
# Grounding (all non-PHI). Injected into the system prompt so the model reasons over FACTS,
# not its training-data guesses, and cannot drift to anything patient-specific.
# --------------------------------------------------------------------------- #
SITE_GUIDE = """\
N1 Hub lets a physician turn a clinical hunch into a structured test on ONE patient's own
wearable/phone data, and returns an honest verdict. Navigation (clinician app):
- Patients → pick a patient → that patient's workspace has tabs for their tests, data collections,
  results, notes, and symptoms. Tests and collections are created from inside a patient's workspace.
- New test plan (wizard): choose devices → choose a signal (only signals the patient's devices
  provide AND have data for are selectable; others are greyed "needs a device" or "no data yet")
  → design the test → review → send to the patient to approve.
- Two test types: OBSERVATIONAL ("does signal X move before episodes of symptom Y?", scans look-back
  windows) and INTERVENTION (A/B n-of-1 trial: alternate arm A vs B over periods, optional breaks).
- DATA COLLECTION: gather chosen signals over a window with no test; later run an analysis on it.
- Results show a verdict (likely_real | suggestive | probably_chance | not_enough_data), an effect
  size, a permutation p-value ("chance check"), and — for observational — a personal risk model.
- The patient must approve every plan; they can pause or stop anytime; results are 'worth discussing',
  never a diagnosis."""

DESIGN_RULES = """\
Design rules you must respect when advising:
- Observational: needs >= 5 logged episodes of the symptom to be testable; fewer -> not_enough_data.
  Look-back is a range of 1..30 days before each episode; wider windows over few episodes leave little
  baseline (a 'windows_cover_most_days' caution). It also needs a device that provides the signal AND
  that the patient actually has data for.
- Intervention (A/B): needs >= 5 AB/BA blocks (>= 10 periods) or it can NEVER reach p<0.05
  (the smallest possible p-value is 1/2^k for k blocks). Default 12 periods x 6 days + 2 washout.
  Breaks/washout reduce carry-over between arms. Randomized assignment keeps the permutation p-value
  valid; a hand-picked ("manual") order is allowed but flagged 'not randomized' and isn't a controlled result.
- Minimum detectable effect depends on the patient's own variability and the number of
  periods/episodes — longer tests detect smaller effects.
- Data collection: pick the signals + a window long enough to later support the intended test
  (e.g. enough weeks for >= 10 A/B periods, or enough expected episodes for an observational test)."""

REFUSALS = """\
Hard rules:
- You can see ONLY the capabilities provided (available devices/signals). You have NO access to any
  patient's data, counts, results or identity. If asked for a patient's data, numbers, or a diagnosis,
  say you can't see patient data and can only help design the test or use the site.
- Never invent devices, signals, or results. If something isn't in the catalog/capabilities provided,
  say it's not available here (or "supported soon" if it's a catalog signal with no data).
- Stay on N1 Hub: using the site, and designing tests / data collections. Politely decline anything else.
- You assist physicians; you are a design aid, not clinical decision support. Keep "not a diagnosis" framing.
- Prefer concrete, short answers and point to the exact screen/step. If unsure, say so."""


def build_system_prompt(devices_catalog, capabilities):
    """devices_catalog: the public /api/devices list. capabilities: {available_signals:[...],
    present_signals:[...], devices:[...]} for the CURRENT clinician context (no PHI)."""
    catalog = "\n".join(
        f"- {d['id']} ({d.get('name')}, {d.get('availability')}): signals {d.get('signals')}"
        for d in devices_catalog)
    return (
        "You are the N1 Hub design copilot for physicians.\n\n"
        f"HOW THE SITE WORKS:\n{SITE_GUIDE}\n\n"
        f"DEVICE CATALOG (the only devices/signals that exist):\n{catalog}\n\n"
        f"DESIGN RULES:\n{DESIGN_RULES}\n\n"
        f"CURRENT CONTEXT (non-identifying capabilities the clinician selected):\n"
        f"{json.dumps(capabilities)}\n\n"
        f"{REFUSALS}\n"
    )


# --------------------------------------------------------------------------- #
# Entry point — provider call is stubbed until an account path is chosen + wired.
# --------------------------------------------------------------------------- #
def _sanitize(messages):
    """Keep only well-formed user/assistant turns, trim length, cap history — strict input hygiene."""
    clean = []
    for m in messages or []:
        role, content = m.get("role"), m.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            clean.append({"role": role, "content": content.strip()[:2000]})
    clean = clean[-12:]                       # cap conversation length
    while clean and clean[0]["role"] != "user":
        clean.pop(0)                          # Anthropic API requires the first turn to be 'user'
    return clean


def answer(messages, devices_catalog, capabilities):
    """messages: [{role, content}] chat turns (clinician). Returns assistant text.
    Raises RuntimeError('assistant_disabled') if the kill switch is engaged."""
    if not is_enabled():
        raise RuntimeError("assistant_disabled")
    clean = _sanitize(messages)
    if not clean:
        raise RuntimeError("empty_message")
    system = build_system_prompt(devices_catalog, capabilities)

    if PROVIDER == "anthropic_api":
        from anthropic import Anthropic           # lazy: only needed when enabled
        client = Anthropic()                      # reads ANTHROPIC_API_KEY from env
        resp = client.messages.create(model=MODEL, system=system, max_tokens=MAX_TOKENS,
                                       temperature=TEMPERATURE, messages=clean)
        return "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()

    if PROVIDER == "agent_sdk":
        # Uses the Claude Agent SDK authenticated with the Max subscription (run locally). Left as a
        # stub until we commit to Path B; Path A (API key) is the wired default.
        raise RuntimeError("provider_not_wired")

    raise RuntimeError("unknown_provider")
