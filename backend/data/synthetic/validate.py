"""
Reference implementation of the CONTRACT stats, used to validate the synthetic data.
The backend instance can reuse/port this. Usage: python validate.py [--out synthetic_out]
"""
import argparse
import json
import os

import numpy as np
import pandas as pd

N_PERM = 2000


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


def observational(df, signal, direction, max_lag, rng):
    sig = df[signal].to_numpy(float)
    ep = df["episode"].to_numpy(int)
    n_ep = int(ep.sum())
    sign = -1 if direction == "lower" else 1
    lags = list(range(1, max_lag + 1))
    obs = np.array([obs_effect(sig, ep, L) for L in lags])
    # max-statistic null via circular shifts of the episode series (keeps autocorrelation)
    shifts = rng.integers(7, len(ep) - 7, N_PERM)
    null_max = np.empty(N_PERM)
    null_per = np.empty((N_PERM, len(lags)))
    for i, s in enumerate(shifts):
        e2 = np.roll(ep, s)
        vals = np.array([obs_effect(sig, e2, L) for L in lags]) * sign
        null_per[i] = vals
        null_max[i] = np.nanmax(vals)
    oriented = obs * sign
    best = int(np.nanargmax(oriented))
    p_best = (1 + np.sum(null_max >= oriented[best])) / (N_PERM + 1)
    per_lag_p = [(1 + np.sum(null_max >= o)) / (N_PERM + 1) for o in oriented]
    missing = np.isnan(sig).mean()
    return {
        "n_episodes": n_ep, "best_lag": lags[best], "effect_pct": round(float(obs[best]), 1),
        "p": round(float(p_best), 4), "lag_scan": [round(float(x), 1) for x in obs],
        "lag_p": [round(float(x), 3) for x in per_lag_p], "missing": round(float(missing), 2),
        "enough": n_ep >= 5 and missing <= 0.4, "direction_ok": oriented[best] > 0,
    }


def intervention(df, iv, rng):
    sig = df[iv["outcome_signal"]].to_numpy(float)
    dates = pd.to_datetime(df["date"])
    periods = []
    for p in iv["schedule"]:
        m = (dates >= p["start"]) & (dates <= p["end"])
        vals = sig[m.to_numpy()]
        vals = vals[~np.isnan(vals)]
        periods.append((p["arm"], vals.mean() if len(vals) else np.nan))
    arms = np.array([a for a, _ in periods])
    means = np.array([m for _, m in periods])
    sign = 1 if iv["better"] == "higher" else -1

    def diff(arm_labels):
        return np.nanmean(means[arm_labels == "B"]) - np.nanmean(means[arm_labels == "A"])

    obs = diff(arms)
    # null: re-randomize within each AB/BA block (exactly how the schedule was generated).
    # With k blocks there are only 2^k possible schedules -> enumerate exactly when small.
    # NOTE: min achievable p = 1/2^k, so k must be >= 5 (10 periods) to ever get p < 0.05.
    n_blocks = len(arms) // 2
    if 2 ** n_blocks <= 4096:
        null = []
        for mask in range(2 ** n_blocks):
            lab = []
            for b in range(n_blocks):
                lab += ["B", "A"] if (mask >> b) & 1 else ["A", "B"]
            null.append(diff(np.array(lab)) * sign)
        null = np.array(null)
        p = np.mean(null >= obs * sign - 1e-12)   # exact; observed schedule is included
    else:
        null = np.empty(N_PERM)
        for i in range(N_PERM):
            lab = []
            for _ in range(n_blocks):
                lab += ["A", "B"] if rng.random() < 0.5 else ["B", "A"]
            null[i] = diff(np.array(lab)) * sign
        p = (1 + np.sum(null >= obs * sign)) / (N_PERM + 1)
    mean_a = np.nanmean(means[arms == "A"])
    return {
        "mean_a": round(float(mean_a), 1), "mean_b": round(float(np.nanmean(means[arms == "B"])), 1),
        "effect_pct": round(float(obs / mean_a * 100), 1), "p": round(float(p), 4),
        "n_a": int((arms == "A").sum()), "n_b": int((arms == "B").sum()),
        "enough": (arms == "A").sum() >= 2 and (arms == "B").sum() >= 2,
        "direction_ok": obs * sign > 0,
    }


def verdict(r):
    if not r["enough"]:
        return "not_enough_data"
    if r["p"] < 0.05 and abs(r["effect_pct"]) >= 5 and r["direction_ok"]:
        return "likely_real"
    if r["p"] < 0.15 and r["direction_ok"]:
        return "suggestive"
    return "probably_chance"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="synthetic_out")
    args = ap.parse_args()
    plans = json.load(open(os.path.join(args.out, "demo_plans.json")))
    truth = json.load(open(os.path.join(args.out, "ground_truth.json")))
    rng = np.random.default_rng(0)
    all_ok = True
    for plan in plans:
        df = pd.read_csv(os.path.join(args.out, "daily", f"{plan['patient_id']}.csv"))
        if plan["type"] == "observational":
            o = plan["observational"]
            r = observational(df, o["signal"], o["direction"], o["max_lag_days"], rng)
        else:
            r = intervention(df, plan["intervention"], rng)
        v = verdict(r)
        exp = truth[plan["patient_id"]]["expected"][plan["id"]]
        ok = v == exp
        all_ok &= ok
        print(f"{'OK ' if ok else 'BAD'} {plan['id']:<18} expected={exp:<16} got={v:<16} {r}")
    print("ALL VERDICTS MATCH" if all_ok else "MISMATCH — tune generator")


if __name__ == "__main__":
    main()
