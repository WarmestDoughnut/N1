"""
Load the provided demo data package at startup (CLAUDE.md §3, INTEGRATION.md).

We do NOT generate synthetic data; we load `backend/data/synthetic/` exactly:
- every `daily/*.csv` into a per-patient pandas DataFrame (file stem = patient id),
- `patients.json` for metadata (REAL-* files without an entry get synthesized metadata),
- `devices_full.json` for the device catalog,
- `demo_plans.json` to seed the store (+ an observational plan for the real participant).
"""
import glob
import json
import os

import pandas as pd

HERE = os.path.dirname(__file__)
DATA = os.path.abspath(os.path.join(HERE, "..", "data", "synthetic"))

# daily-table signal columns (everything except date/episode)
SIGNAL_COLUMNS = [
    "sleep_min", "resting_hr", "hrv", "steps", "skin_temp_dev", "resp_rate",
    "spo2", "systolic_bp", "glucose_tir", "walking_speed",
]

REAL_CITATION = "Thambawita et al., PMData, MMSys 2020 (CC BY-NC 4.0)"


def load_daily():
    """Return {patient_id: DataFrame} for every daily/*.csv."""
    tables = {}
    for path in sorted(glob.glob(os.path.join(DATA, "daily", "*.csv"))):
        pid = os.path.splitext(os.path.basename(path))[0]
        df = pd.read_csv(path)
        df["date"] = df["date"].astype(str)
        if "episode" not in df.columns:
            df["episode"] = 0
        df["episode"] = df["episode"].fillna(0).astype(int)
        tables[pid] = df
    return tables


def _signals_present(df):
    return [c for c in SIGNAL_COLUMNS if c in df.columns and df[c].notna().any()]


def _synth_real_meta(pid, df):
    """Metadata for a REAL-* participant that has no patients.json entry."""
    return {
        "id": pid,
        "display_name": "PMData participant",
        "condition": "Low-readiness days (self-reported)",
        "story": "Real Fitbit Versa 2 data from the PMData study. Episodes are this person's "
                 "lowest-readiness days (bottom 15% of their own scores). The verdict is unknown "
                 "in advance — that's the point.",
        "source": "real",
        "citation": REAL_CITATION,
        "devices": ["fitbit"],
        "date_range": [str(df["date"].min()), str(df["date"].max())],
        "n_days": int(len(df)),
        "n_episodes": int(df["episode"].sum()),
        "signals_present": _signals_present(df),
    }


def load_patients(daily):
    """Return {patient_id: metadata}, synthesizing entries for REAL-* files."""
    with open(os.path.join(DATA, "patients.json")) as f:
        listed = {p["id"]: p for p in json.load(f)}
    out = {}
    for pid, df in daily.items():
        if pid in listed:
            meta = dict(listed[pid])
            meta.setdefault("source", "synthetic")
        else:
            meta = _synth_real_meta(pid, df)
        out[pid] = meta
    return out


def load_devices():
    with open(os.path.join(DATA, "devices_full.json")) as f:
        return json.load(f)


def _real_plan(pid, df):
    """Observational demo plan for the real PMData participant."""
    return {
        "id": f"DEMO-{pid}",
        "patient_id": pid,
        "clinician_name": "Dr. Rivera",
        "title": "Does short sleep precede low-readiness days?",
        "type": "observational",
        "devices": ["fitbit"],
        "signals": ["sleep_min", "episode"],
        "window": {"start": str(df["date"].min()), "end": str(df["date"].max())},
        "status": "pending_approval",
        "observational": {"signal": "sleep_min", "direction": "lower", "max_lag_days": 3},
        "intervention": None,
        "patient_summary": "Dr. Rivera wants to check whether shorter sleep tends to come before "
                           "your lowest-readiness days. This test uses only sleep and your readiness "
                           "log from your Fitbit. You can pause or stop at any time. "
                           "(Real data: " + REAL_CITATION + ".)",
    }


def load_seed_plans(daily):
    """demo_plans.json plus an observational plan for every REAL-* participant."""
    with open(os.path.join(DATA, "demo_plans.json")) as f:
        plans = json.load(f)
    for pid, df in daily.items():
        if pid.startswith("REAL-"):
            plans.append(_real_plan(pid, df))
    return plans
