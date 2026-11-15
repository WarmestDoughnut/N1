"""
Copy to backend/tests/test_ground_truth.py.
Checks that the backend's stats produce the expected verdict for every demo plan.

Adjust the import below to your stats module. It expects a function:
    run_plan(plan: dict, daily: pandas.DataFrame) -> dict   # returns at least {"verdict": ...}
Until app.stats exists, it falls back to the reference implementation in validate.py.
"""
import json
import os
import sys

import numpy as np
import pandas as pd
import pytest

DATA = os.path.join(os.path.dirname(__file__), "..", "data", "synthetic")

try:
    from app.stats import run_plan  # backend implementation
except Exception:  # fallback: reference implementation
    sys.path.insert(0, DATA)
    import validate as _v

    def run_plan(plan, daily):
        rng = np.random.default_rng(0)
        if plan["type"] == "observational":
            o = plan["observational"]
            r = _v.observational(daily, o["signal"], o["direction"], o["max_lag_days"], rng)
        else:
            r = _v.intervention(daily, plan["intervention"], rng)
        return {"verdict": _v.verdict(r)}


PLANS = json.load(open(os.path.join(DATA, "demo_plans.json")))
TRUTH = json.load(open(os.path.join(DATA, "ground_truth.json")))


@pytest.mark.parametrize("plan", PLANS, ids=[p["id"] for p in PLANS])
def test_demo_plan_verdict(plan):
    daily = pd.read_csv(os.path.join(DATA, "daily", f"{plan['patient_id']}.csv"))
    expected = TRUTH[plan["patient_id"]]["expected"][plan["id"]]
    assert run_plan(plan, daily)["verdict"] == expected


BONUS = [
    ("P01-MARIA", "hrv", "lower", "likely_real"),
    ("P01-MARIA", "steps", "lower", "probably_chance"),
    ("P06-LEO", "steps", "higher", "likely_real"),
    ("P01-MARIA", "resting_hr", "higher", "probably_chance"),
]


@pytest.mark.parametrize("pid,signal,direction,expected", BONUS)
def test_bonus_hypotheses(pid, signal, direction, expected):
    daily = pd.read_csv(os.path.join(DATA, "daily", f"{pid}.csv"))
    plan = {"id": "BONUS", "patient_id": pid, "type": "observational",
            "observational": {"signal": signal, "direction": direction, "max_lag_days": 3}}
    assert run_plan(plan, daily)["verdict"] == expected
