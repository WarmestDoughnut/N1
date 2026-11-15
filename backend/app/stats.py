"""
N1 Hub statistics — the product.

Ported from backend/data/synthetic/validate.py (the reference implementation the
synthetic data was validated against) and extended to return the full result shape
from CONTRACT.md §5. `run_plan(plan, daily)` is the single entry point used by both
the API (app/main.py) and the ground-truth tests (backend/tests/test_ground_truth.py).

Design rules that are binding (see CLAUDE.md §3 and INTEGRATION.md):
- Observational: pre-episode window vs baseline per lag; null = circular shifts of the
  episode series (preserves autocorrelation); max-statistic correction across lags.
- Intervention: compare period means A vs B (washout excluded); null = re-randomize arm
  labels within each AB/BA block. Enumerate all 2^k schedules exactly when k <= 12.
  With k blocks the smallest achievable p is 1/2^k, so k < 5 (fewer than 10 periods)
  can never reach p < 0.05 -> not_enough_data + warning `too_few_periods`.
"""
import numpy as np
import pandas as pd

N_PERM = 2000
MIN_BLOCKS = 5          # 10 periods; below this an intervention can never reach p<0.05
NULL_SAMPLE = 500       # cap on null_distribution length returned to the frontend


# --------------------------------------------------------------------------- #
# Observational
# --------------------------------------------------------------------------- #
def obs_effect(sig, ep, lag):
    """Mean of signal in the `lag` days before episodes vs baseline, as % of baseline."""
    n = len(sig)
    pre = np.zeros(n, bool)
    for e in np.flatnonzero(ep):
        pre[max(e - lag, 0):e] = True
    pre &= ~ep.astype(bool)
    base = ~pre & ~ep.astype(bool)
    a, b = sig[pre], sig[base]
    a, b = a[~np.isnan(a)], b[~np.isnan(b)]
    if len(a) < 3 or len(b) < 3:
        return np.nan
    return (a.mean() - b.mean()) / b.mean() * 100


def _pre_mask(ep, lag):
    """Boolean mask of the pre-episode window at a given lag (episode days excluded)."""
    n = len(ep)
    pre = np.zeros(n, bool)
    for e in np.flatnonzero(ep):
        pre[max(e - lag, 0):e] = True
    return pre & ~ep.astype(bool)


def observational(df, signal, direction, max_lag, rng, min_lag=1):
    """Scan look-back windows of size L for L in [min_lag, max_lag] (v1.4: min_lag defaults to 1,
    max_lag may go up to 14). Each lag L = the L days immediately before each episode vs baseline.
    With min_lag=1, max_lag<=3 this is byte-identical to the original (demo verdicts unchanged)."""
    sig = df[signal].to_numpy(float)
    ep = df["episode"].to_numpy(int)
    n_ep = int(ep.sum())
    sign = -1 if direction == "lower" else 1
    lags = list(range(min_lag, max_lag + 1))
    obs = np.array([obs_effect(sig, ep, L) for L in lags])

    all_nan = bool(np.all(np.isnan(obs)))
    oriented = obs * sign
    best = 0 if all_nan else int(np.nanargmax(oriented))

    # max-statistic null via circular shifts of the episode series (keeps autocorrelation)
    shifts = rng.integers(7, len(ep) - 7, N_PERM)
    null_max = np.empty(N_PERM)
    null_best_raw = np.empty(N_PERM)          # raw (signed) null at the best lag, for the histogram
    for i, s in enumerate(shifts):
        e2 = np.roll(ep, s)
        raw = np.array([obs_effect(sig, e2, L) for L in lags])   # one pass, reused below
        vals = raw * sign
        null_max[i] = np.nanmax(vals) if not np.all(np.isnan(vals)) else np.nan
        null_best_raw[i] = raw[best]

    best_oriented = oriented[best]
    if all_nan or np.isnan(best_oriented):
        p_best = 1.0
    else:
        p_best = (1 + np.nansum(null_max >= best_oriented)) / (N_PERM + 1)
    per_lag_p = [1.0 if np.isnan(o) else (1 + np.nansum(null_max >= o)) / (N_PERM + 1) for o in oriented]
    n_missing_days = int(np.isnan(sig).sum())
    missing = float(np.isnan(sig).mean())

    pre = _pre_mask(ep, lags[best])
    base = ~pre & ~ep.astype(bool)
    pre_mean = float(np.nanmean(sig[pre])) if pre.any() else None
    base_mean = float(np.nanmean(sig[base])) if base.any() else None
    # fraction of analyzable (non-episode) days swallowed by the best-lag window; large windows
    # over few episodes leave too little baseline to trust (CHANGE-REQUEST #6 caveat).
    analyzable = int((pre | base).sum())
    coverage = float(pre.sum() / analyzable) if analyzable else 1.0

    return {
        "kind": "observational",
        "signal": signal,
        "direction": direction,
        "n_episodes": n_ep,
        "best_lag": lags[best],
        "effect_pct": 0.0 if np.isnan(obs[best]) else round(float(obs[best]), 1),
        "p": round(float(p_best), 4),
        "lag_scan": [None if np.isnan(x) else round(float(x), 1) for x in obs],
        "lag_p": [round(float(x), 3) for x in per_lag_p],
        "lags": lags,
        "missing": round(missing, 2),
        "n_missing_days": n_missing_days,
        "enough": n_ep >= 5 and missing <= 0.4 and not all_nan,
        "direction_ok": bool(best_oriented > 0) if not np.isnan(best_oriented) else False,
        "pre_episode_mean": None if pre_mean is None else round(pre_mean, 1),
        "baseline_mean": None if base_mean is None else round(base_mean, 1),
        "windows_cover_most": coverage > 0.5,
        "null_raw_best": null_best_raw,
        "best_lag_mask": pre,
    }


# --------------------------------------------------------------------------- #
# Intervention (A/B n-of-1)
# --------------------------------------------------------------------------- #
def intervention(df, iv, rng):
    sig = df[iv["outcome_signal"]].to_numpy(float)
    dates = pd.to_datetime(df["date"])
    periods = []
    n_period_days = 0     # scheduled outcome-days present in the (possibly truncated) table
    n_missing_days = 0    # of those, how many had no reading
    for p in iv["schedule"]:
        idx = ((dates >= p["start"]) & (dates <= p["end"])).to_numpy()
        day_count = int(idx.sum())
        if day_count == 0:
            periods.append((p["arm"], np.nan))   # period outside the collected window
            continue
        present = sig[idx][~np.isnan(sig[idx])]
        n_period_days += day_count
        n_missing_days += day_count - len(present)
        # A period must have >= 50% of its scheduled days covered, else its mean is missing
        # (so a 6-day period with 1 reading can't carry the trial). CONTRACT §5.
        period_len = (pd.Timestamp(p["end"]) - pd.Timestamp(p["start"])).days + 1
        mean = present.mean() if len(present) >= 0.5 * period_len else np.nan
        periods.append((p["arm"], mean))
    arms = np.array([a for a, _ in periods])
    means = np.array([m for _, m in periods])
    sign = 1 if iv["better"] == "higher" else -1

    def diff(arm_labels):
        return np.nanmean(means[arm_labels == "B"]) - np.nanmean(means[arm_labels == "A"])

    obs = diff(arms)
    n_blocks = len(arms) // 2      # structural blocks — drives the 2^k permutation enumeration

    # null: re-randomize within each AB/BA block (exactly how the schedule was generated).
    if 2 ** n_blocks <= 4096:
        null = []
        for mask in range(2 ** n_blocks):
            lab = []
            for b in range(n_blocks):
                lab += ["B", "A"] if (mask >> b) & 1 else ["A", "B"]
            null.append(diff(np.array(lab)) * sign)
        null = np.array(null)
        p = float(np.mean(null >= obs * sign - 1e-12))   # exact; observed schedule included
        n_perm = len(null)
    else:
        null = np.empty(N_PERM)
        for i in range(N_PERM):
            lab = []
            for _ in range(n_blocks):
                lab += ["A", "B"] if rng.random() < 0.5 else ["B", "A"]
            null[i] = diff(np.array(lab)) * sign
        p = float((1 + np.sum(null >= obs * sign)) / (N_PERM + 1))
        n_perm = N_PERM

    mean_a = float(np.nanmean(means[arms == "A"]))
    mean_b = float(np.nanmean(means[arms == "B"]))
    # count only periods that actually carry a usable mean (>= 50% covered)
    valid = ~np.isnan(means)
    n_a = int(((arms == "A") & valid).sum())
    n_b = int(((arms == "B") & valid).sum())
    valid_blocks = (n_a + n_b) // 2
    missing = float(n_missing_days / n_period_days) if n_period_days else 1.0
    enough = n_a >= 2 and n_b >= 2 and valid_blocks >= MIN_BLOCKS and missing <= 0.4
    # null distribution expressed as effect_pct, in the same sign convention as effect_pct
    null_pct = (null * sign) / mean_a * 100 if mean_a else null

    return {
        "kind": "intervention",
        "outcome_signal": iv["outcome_signal"],
        "better": iv["better"],
        "mean_a": round(mean_a, 1),
        "mean_b": round(mean_b, 1),
        "effect_pct": round(float(obs / mean_a * 100), 1) if mean_a else 0.0,
        "p": round(p, 4),
        "n_a": n_a,
        "n_b": n_b,
        "n_blocks": valid_blocks,
        "n_perm": n_perm,
        "missing": round(missing, 2),
        "n_missing_days": int(n_missing_days),
        "enough": enough,
        "too_few_periods": valid_blocks < MIN_BLOCKS,
        "direction_ok": bool(obs * sign > 0),
        "period_means": [
            {"period": p["period"], "arm": p["arm"],
             "mean": None if np.isnan(m) else round(float(m), 1)}
            for p, (_, m) in zip(iv["schedule"], periods)
        ],
        "null_pct": null_pct,
    }


# --------------------------------------------------------------------------- #
# Verdict
# --------------------------------------------------------------------------- #
def verdict(r):
    if not r["enough"]:
        return "not_enough_data"
    if r["p"] < 0.05 and abs(r["effect_pct"]) >= 5 and r["direction_ok"]:
        return "likely_real"
    if r["p"] < 0.15 and r["direction_ok"]:
        return "suggestive"
    return "probably_chance"


# --------------------------------------------------------------------------- #
# Full result builder (CONTRACT §5)
# --------------------------------------------------------------------------- #
def _nan_to_none(x):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else x


def _sample(arr):
    arr = np.asarray(arr, float)
    arr = arr[~np.isnan(arr)]
    if len(arr) > NULL_SAMPLE:
        arr = arr[:NULL_SAMPLE]
    return [round(float(x), 2) for x in arr]


def _signal_label(sig):
    return {
        "sleep_min": "Sleep", "resting_hr": "Resting heart rate", "hrv": "HRV",
        "steps": "Steps", "walking_speed": "Walking speed", "systolic_bp": "Blood pressure",
        "glucose_tir": "Glucose time-in-range", "skin_temp_dev": "Skin temperature",
        "resp_rate": "Respiratory rate", "spo2": "Blood oxygen",
        "screen_time_min": "Screen time", "late_screen_min": "Late-night screen time",
        "mood_log": "Mood", "pain_level": "Pain level",
    }.get(sig, sig)


def _obs_headlines(r, v):
    sig = _signal_label(r["signal"]).lower()
    pct = abs(r["effect_pct"])
    lag = r["best_lag"]
    dir_word = "lower" if r["direction"] == "lower" else "higher"
    if v == "likely_real":
        h = f"{_signal_label(r['signal'])} was {pct:.0f}% {dir_word} in the {lag} days before episodes."
        ph = f"Your {sig} was often {dir_word} in the {lag} days before an episode. Worth discussing with your clinician."
    elif v == "suggestive":
        h = f"{_signal_label(r['signal'])} was somewhat {dir_word} before episodes, but the signal is weak."
        ph = f"There's a hint that your {sig} shifts before episodes, but it isn't clear yet."
    elif v == "not_enough_data":
        h = f"Not enough episodes to test whether {sig} changes before them."
        ph = f"There aren't enough logged episodes yet to check your {sig}."
    else:
        h = f"No reliable link between {sig} and episodes — the pattern looks like chance."
        ph = f"We didn't find a reliable link between your {sig} and your episodes."
    return h, ph


def _iv_headlines(r, v, iv):
    sig = _signal_label(r["outcome_signal"]).lower()
    pct = abs(r["effect_pct"])
    a, b = iv.get("arm_a", "A"), iv.get("arm_b", "B")
    if v == "likely_real":
        h = f"{b} improved {sig} by {pct:.0f}% vs {a}."
        ph = f"{b} seemed to help your {sig} compared with {a}. Worth discussing with your clinician."
    elif v == "suggestive":
        h = f"{b} looked a bit better than {a}, but the signal is weak."
        ph = f"There's a hint that {b} helps your {sig}, but it isn't clear yet."
    elif v == "not_enough_data":
        if r.get("too_few_periods"):
            h = f"Too few periods to test {b} vs {a} — the trial can't reach significance."
            ph = f"This trial is too short to give a clear answer about {b}."
        else:
            h = f"Not enough usable data to compare {b} and {a}."
            ph = f"There isn't enough data yet to compare {b} and {a}."
    else:
        h = f"No reliable difference between {b} and {a} — looks like chance."
        ph = f"We didn't find a reliable difference between {b} and {a} for your {sig}."
    return h, ph


def _obs_series(df, signal, mask):
    sig = df[signal].to_numpy(float)
    ep = df["episode"].to_numpy(int)
    dates = df["date"].astype(str).tolist()
    out = []
    for i, d in enumerate(dates):
        out.append({
            "date": d,
            "value": _nan_to_none(round(float(sig[i]), 1)) if not np.isnan(sig[i]) else None,
            "episode": int(ep[i]),
            "arm": None,
            "in_window": bool(mask[i]),
        })
    return out


def _iv_series(df, iv):
    sig = df[iv["outcome_signal"]].to_numpy(float)
    dates = pd.to_datetime(df["date"])
    date_strs = df["date"].astype(str).tolist()
    arm_of = [None] * len(df)
    for p in iv["schedule"]:
        active = ((dates >= p["start"]) & (dates <= p["end"])).to_numpy()
        wash = ((dates > p["end"]) & (dates <= p["washout_end"])).to_numpy()
        for i in np.flatnonzero(active):
            arm_of[i] = p["arm"]
        for i in np.flatnonzero(wash):
            arm_of[i] = "washout"
    ep = df["episode"].to_numpy(int) if "episode" in df.columns else np.zeros(len(df), int)
    out = []
    for i, d in enumerate(date_strs):
        out.append({
            "date": d,
            "value": None if np.isnan(sig[i]) else round(float(sig[i]), 1),
            "episode": int(ep[i]),
            "arm": arm_of[i],
            "in_window": False,
        })
    return out


def run_plan(plan, daily):
    """Compute full CONTRACT §5 results for a plan over its patient's daily table.

    `plan` is the plan dict (with `type`, `observational` or `intervention`).
    `daily` is a pandas DataFrame with at least the plan's signals + `date`, `episode`.
    Returns a dict including `verdict` (what the ground-truth tests assert) and every
    field the results endpoint serves.
    """
    rng = np.random.default_rng(0)
    warnings = []

    if plan["type"] == "observational":
        o = plan["observational"]
        r = observational(daily, o["signal"], o["direction"], o["max_lag_days"], rng,
                          min_lag=o.get("min_lag_days", 1))
        v = verdict(r)
        headline, patient_headline = _obs_headlines(r, v)
        if r["missing"] >= 0.05:            # >= 5% of days missing (40% still -> not_enough_data)
            warnings.append("missing_data")
        if r["n_episodes"] < 8:
            warnings.append("few_episodes")
        if len(r["lags"]) > 1:
            warnings.append("multiple_lags_tested")
        if r.get("windows_cover_most"):     # v1.4: wide look-back leaves too little baseline
            warnings.append("windows_cover_most_days")
        obs_block = {
            "best_lag_days": r["best_lag"],
            "lag_scan": [
                {"lag_days": L, "effect_pct": e, "p_value": p}
                for L, e, p in zip(r["lags"], r["lag_scan"], r["lag_p"])
            ],
            "pre_episode_mean": r["pre_episode_mean"],
            "baseline_mean": r["baseline_mean"],
        }
        return {
            "plan_id": plan.get("id"),
            "type": "observational",
            "complete": True,
            "verdict": v,
            "headline": headline,
            "patient_headline": patient_headline,
            "effect_pct": r["effect_pct"],
            "p_value": r["p"],
            "n_permutations": N_PERM,
            "n_episodes": r["n_episodes"],
            "n_days": int(len(daily)),
            "n_missing_days": r["n_missing_days"],
            "warnings": warnings,
            "observational": obs_block,
            "intervention": None,
            "null_distribution": _sample(r["null_raw_best"]),
            "series": _obs_series(daily, o["signal"], r["best_lag_mask"]),
            "model": None,
        }

    # intervention
    iv = plan["intervention"]
    r = intervention(daily, iv, rng)
    v = verdict(r)
    headline, patient_headline = _iv_headlines(r, v, iv)
    if r["too_few_periods"]:
        warnings.append("too_few_periods")
    if r["missing"] >= 0.05:               # >= 5% of scheduled outcome-days missing
        warnings.append("missing_data")
    # B8: a hand-assigned (non-randomized) A/B order invalidates the permutation p-value's meaning.
    # Allow it, but flag it loudly so it can't read as a controlled result.
    randomized = iv.get("assignment", "randomized") != "manual"
    if not randomized:
        warnings.append("not_randomized")
        caveat = ("You chose the A/B order yourself rather than randomizing, so this isn't a controlled "
                  "test — read the significance with caution; a randomized version is needed to be sure. ")
        headline = caveat + headline
        patient_headline = caveat + patient_headline
    iv_block = {
        "mean_a": r["mean_a"],
        "mean_b": r["mean_b"],
        "effect_pct": r["effect_pct"],
        "n_periods_a": r["n_a"],
        "n_periods_b": r["n_b"],
        "period_means": r["period_means"],
    }
    return {
        "plan_id": plan.get("id"),
        "type": "intervention",
        "complete": True,
        "verdict": v,
        "headline": headline,
        "patient_headline": patient_headline,
        "randomized": randomized,
        "effect_pct": r["effect_pct"],
        "p_value": r["p"],
        "n_permutations": r["n_perm"],
        "n_episodes": 0,
        "n_days": int(len(daily)),
        "n_missing_days": r["n_missing_days"],
        "warnings": warnings,
        "observational": None,
        "intervention": iv_block,
        "null_distribution": _sample(r["null_pct"]),
        "series": _iv_series(daily, iv),
        "model": None,
    }
