"""
Pick the best real PMData participant for the N1 Hub demo and convert them to our daily table.

Usage:
  python pmdata_pick.py --root path/to/pmdata            # rank all participants
  python pmdata_pick.py --root path/to/pmdata --build p05 --out daily/REAL-P05.csv

Expected layout (PMData): <root>/pXX/fitbit/{sleep.json, resting_heart_rate.json, steps.json}
                          <root>/pXX/pmsys/wellness.csv
Output columns match the synthetic data: date, sleep_min, resting_hr, hrv, steps, skin_temp_dev,
resp_rate, spo2, systolic_bp, glucose_tir, walking_speed, episode   (untracked = blank)

Episode rule (documented, unambiguous direction): a self-reported LOW-READINESS day,
i.e. readiness (0-10, higher = more ready) at or below the participant's own 15th percentile.
"""
import argparse
import glob
import json
import os

import numpy as np
import pandas as pd

COLS = ["date", "sleep_min", "resting_hr", "hrv", "steps", "skin_temp_dev", "resp_rate",
        "spo2", "systolic_bp", "glucose_tir", "walking_speed", "episode"]


def _load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return []


def sleep_daily(pdir):
    rows = _load_json(os.path.join(pdir, "fitbit", "sleep.json"))
    recs = []
    for r in rows:
        if not isinstance(r, dict) or "dateOfSleep" not in r:
            continue
        if r.get("mainSleep") is False:
            continue
        recs.append({"date": r["dateOfSleep"][:10], "sleep_min": r.get("minutesAsleep")})
    if not recs:
        return pd.DataFrame(columns=["date", "sleep_min"])
    return pd.DataFrame(recs).groupby("date", as_index=False)["sleep_min"].max()


def rhr_daily(pdir):
    rows = _load_json(os.path.join(pdir, "fitbit", "resting_heart_rate.json"))
    recs = []
    for r in rows:
        try:
            v = r["value"]["value"] if isinstance(r.get("value"), dict) else r.get("value")
            d = r.get("dateTime") or (r["value"].get("date") if isinstance(r.get("value"), dict) else None)
            v = float(v)
            if v > 0:
                recs.append({"date": str(d)[:10], "resting_hr": round(v)})
        except Exception:
            continue
    if not recs:
        return pd.DataFrame(columns=["date", "resting_hr"])
    return pd.DataFrame(recs).groupby("date", as_index=False)["resting_hr"].mean()


def steps_daily(pdir):
    rows = _load_json(os.path.join(pdir, "fitbit", "steps.json"))  # per-minute records
    if not rows:
        return pd.DataFrame(columns=["date", "steps"])
    df = pd.DataFrame(rows)
    if "dateTime" not in df or "value" not in df:
        return pd.DataFrame(columns=["date", "steps"])
    df["date"] = df["dateTime"].astype(str).str[:10]
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    out = df.groupby("date", as_index=False)["value"].sum().rename(columns={"value": "steps"})
    out.loc[out["steps"] < 300, "steps"] = np.nan  # device not worn
    return out


def wellness_daily(pdir):
    path = os.path.join(pdir, "pmsys", "wellness.csv")
    if not os.path.exists(path):
        return pd.DataFrame(columns=["date", "readiness"])
    w = pd.read_csv(path)
    tcol = next((c for c in w.columns if "time" in c.lower() or "date" in c.lower()), None)
    if tcol is None or "readiness" not in w.columns:
        return pd.DataFrame(columns=["date", "readiness"])
    w["date"] = pd.to_datetime(w[tcol], errors="coerce", utc=True).dt.strftime("%Y-%m-%d")
    w["readiness"] = pd.to_numeric(w["readiness"], errors="coerce")
    keep = ["date", "readiness"] + [c for c in ("fatigue", "mood", "stress", "sleep_quality") if c in w]
    return w[keep].dropna(subset=["date"]).groupby("date", as_index=False).mean(numeric_only=True)


def _norm(f):
    f = f.copy()
    f["date"] = pd.to_datetime(f["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    f = f.dropna(subset=["date"])
    return f.groupby("date", as_index=False).mean(numeric_only=True)


def build(pdir):
    s, r, st, w = sleep_daily(pdir), rhr_daily(pdir), steps_daily(pdir), wellness_daily(pdir)
    frames = [_norm(f) for f in (s, r, st, w) if len(f)]
    if not frames:
        return None, None
    dates = sorted(set().union(*[set(f["date"]) for f in frames]))
    full = pd.DataFrame({"date": pd.date_range(dates[0], dates[-1]).strftime("%Y-%m-%d")})
    for f in frames:
        full = full.merge(f, on="date", how="left")
    thr = full["readiness"].quantile(0.15) if "readiness" in full and full["readiness"].notna().any() else None
    full["episode"] = 0
    if thr is not None:
        full.loc[full["readiness"] <= thr, "episode"] = 1
    for c in COLS:
        if c not in full:
            full[c] = np.nan
    stats = {
        "days": len(full),
        "sleep_nights": int(full["sleep_min"].notna().sum()),
        "rhr_days": int(full["resting_hr"].notna().sum()),
        "wellness_reports": int(full["readiness"].notna().sum()) if "readiness" in full else 0,
        "episodes": int(full["episode"].sum()),
        "readiness_threshold": None if thr is None else float(thr),
    }
    # completeness score: overlapping sleep + wellness coverage, needs >= 8 episodes to be testable
    overlap = int((full["sleep_min"].notna() & full.get("readiness", pd.Series(dtype=float)).notna()).sum())
    stats["sleep_and_wellness_overlap"] = overlap
    stats["score"] = overlap + (25 if 8 <= stats["episodes"] <= 30 else 0)
    return full[COLS], stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--build")
    ap.add_argument("--out", default="REAL.csv")
    a = ap.parse_args()
    if a.build:
        df, st = build(os.path.join(a.root, a.build))
        df.to_csv(a.out, index=False)
        print(f"wrote {a.out}: {st}")
        return
    rows = []
    for pdir in sorted(glob.glob(os.path.join(a.root, "p*"))):
        _, st = build(pdir)
        if st:
            rows.append({"participant": os.path.basename(pdir), **st})
    print(pd.DataFrame(rows).sort_values("score", ascending=False).to_string(index=False))
    print("\nPick the top row (needs >= 8 episodes and the most sleep+wellness overlap).")


if __name__ == "__main__":
    main()
