"""
N1 Hub synthetic patient generator.

Produces daily wearable/phone data for several synthetic patients, each designed to
showcase a different capability of the per-patient testing suite. Ground truth is
written alongside so tests can be validated against a known answer.

Usage: python generate.py [--out OUT_DIR]
Outputs (in OUT_DIR):
  daily/<PATIENT_ID>.csv   one row per day, columns = date + signals + episode
  all_daily.csv            all patients stacked (with patient_id)
  patients.json            patient metadata (matches CONTRACT /api/patients + extras)
  demo_plans.json          ready-made test plans to seed the store for the demo
  ground_truth.json        what was planted, and the verdict each plan should produce
"""
import argparse
import json
import os
from datetime import date, timedelta

import numpy as np
import pandas as pd

START = date(2026, 6, 1)
N_DAYS = 120
DATES = [START + timedelta(days=i) for i in range(N_DAYS)]
DOW = np.array([d.weekday() for d in DATES])  # 0=Mon
WEEKEND = (DOW >= 5).astype(float)

SIGNALS = [
    "sleep_min", "resting_hr", "hrv", "steps", "skin_temp_dev", "resp_rate",
    "spo2", "systolic_bp", "glucose_tir", "walking_speed",
]


# ---------------------------------------------------------------- helpers
def ar1(rng, n, sd, phi=0.5):
    """AR(1) noise with marginal sd ~= sd (day-to-day carryover, like real physiology)."""
    e = rng.normal(0, sd * np.sqrt(1 - phi ** 2), n)
    x = np.zeros(n)
    x[0] = rng.normal(0, sd)
    for i in range(1, n):
        x[i] = phi * x[i - 1] + e[i]
    return x


def place_episodes(rng, n_ep, min_gap=5, start=7, end=N_DAYS - 1):
    """Random episode days with a minimum spacing (so pre-episode windows don't overlap)."""
    span = end - start - (n_ep - 1) * min_gap
    if span <= 0:
        raise RuntimeError("could not place episodes")
    # place n_ep points in the compressed span, then re-expand by min_gap
    pts = np.sort(rng.choice(np.arange(span), n_ep, replace=False))
    return start + pts + np.arange(n_ep) * min_gap


def ab_schedule(rng, n_periods, period_days, washout_days, first_day=0):
    """Balanced randomized blocks: each pair of periods is AB or BA."""
    arms = []
    for _ in range(n_periods // 2):
        arms += ["A", "B"] if rng.random() < 0.5 else ["B", "A"]
    sched, day = [], first_day
    for p, arm in enumerate(arms, start=1):
        s, e = day, day + period_days - 1
        w = e + washout_days
        sched.append({
            "period": p, "arm": arm,
            "start": DATES[s].isoformat(), "end": DATES[e].isoformat(),
            "washout_end": DATES[w].isoformat() if washout_days else DATES[e].isoformat(),
            "_s": s, "_e": e, "_w": w,
        })
        day = w + 1
    return sched


def arm_vector(sched):
    """Per-day arm label: A / B / washout / None."""
    v = np.array([None] * N_DAYS, dtype=object)
    for p in sched:
        v[p["_s"]:p["_e"] + 1] = p["arm"]
        if p["_w"] > p["_e"]:
            v[p["_e"] + 1:p["_w"] + 1] = "washout"
    return v


def apply_missing(rng, df, cols, p_day=0.04, p_cell=0.02):
    """Realistic gaps: whole days the watch wasn't worn + scattered sensor dropouts."""
    off = rng.random(len(df)) < p_day
    for c in cols:
        df.loc[off, c] = np.nan
        df.loc[rng.random(len(df)) < p_cell, c] = np.nan
    return df


def base_frame(rng, *, sleep=420, rhr=62, hrv=45, steps=7500, age=40, sbp=None,
               tir=None, speed=None, temp=True, resp=True, spo2=True):
    """Baseline physiology with weekly rhythm and AR(1) noise. None = signal not tracked."""
    n = N_DAYS
    df = pd.DataFrame({"date": [d.isoformat() for d in DATES]})
    df["sleep_min"] = sleep + 25 * WEEKEND + ar1(rng, n, 38)
    df["resting_hr"] = rhr + ar1(rng, n, 2.2, 0.7)
    df["hrv"] = hrv + ar1(rng, n, 6.5, 0.6)
    df["steps"] = steps - 1500 * WEEKEND + ar1(rng, n, 1800, 0.3)
    df["skin_temp_dev"] = ar1(rng, n, 0.18, 0.6) if temp else np.nan
    df["resp_rate"] = 14.5 + ar1(rng, n, 0.5, 0.6) if resp else np.nan
    df["spo2"] = 96.8 + ar1(rng, n, 0.6, 0.4) if spo2 else np.nan
    df["systolic_bp"] = (sbp + ar1(rng, n, 6.0, 0.5)) if sbp else np.nan
    df["glucose_tir"] = (tir + ar1(rng, n, 7.0, 0.4)) if tir else np.nan
    df["walking_speed"] = (speed + ar1(rng, n, 0.05, 0.7)) if speed else np.nan
    df["episode"] = 0
    return df


def finalize(df, tracked):
    for c in SIGNALS:
        if c not in tracked:
            df[c] = np.nan
    df["sleep_min"] = df["sleep_min"].clip(180, 720)
    df["steps"] = df["steps"].clip(300, None)
    df["glucose_tir"] = df["glucose_tir"].clip(0, 100)
    df["spo2"] = df["spo2"].clip(88, 100)
    rounding = {"sleep_min": 0, "resting_hr": 0, "hrv": 1, "steps": 0, "skin_temp_dev": 2,
                "resp_rate": 1, "spo2": 1, "systolic_bp": 0, "glucose_tir": 1,
                "walking_speed": 2}
    for c, r in rounding.items():
        df[c] = df[c].round(r)
    df["episode"] = df["episode"].astype(int)
    return df[["date"] + SIGNALS + ["episode"]]


# ---------------------------------------------------------------- patients
def build(seed=2026):
    patients, plans, truth, frames = [], [], {}, {}

    def add(pid, meta, df, tracked, plan_list, gt):
        df = finalize(df, tracked)
        frames[pid] = df
        meta.update({
            "id": pid, "source": "synthetic",
            "date_range": [DATES[0].isoformat(), DATES[-1].isoformat()],
            "n_days": N_DAYS, "n_episodes": int(df["episode"].sum()),
            "signals_present": [c for c in SIGNALS if df[c].notna().any()],
        })
        patients.append(meta)
        plans.extend(plan_list)
        truth[pid] = gt

    window = {"start": DATES[0].isoformat(), "end": DATES[-1].isoformat()}

    def obs_plan(pid, title, devices, signal, direction, summary, max_lag=3):
        return {
            "id": f"DEMO-{pid}", "patient_id": pid, "clinician_name": "Dr. Rivera",
            "title": title, "type": "observational", "devices": devices,
            "signals": [signal, "episode"], "window": window,
            "status": "pending_approval",
            "observational": {"signal": signal, "direction": direction, "max_lag_days": max_lag},
            "intervention": None, "patient_summary": summary,
        }

    def int_plan(pid, title, devices, outcome, better, arm_a, arm_b, sched, pdays, wdays, summary):
        clean = [{k: v for k, v in p.items() if not k.startswith("_")} for p in sched]
        return {
            "id": f"DEMO-{pid}", "patient_id": pid, "clinician_name": "Dr. Rivera",
            "title": title, "type": "intervention", "devices": devices,
            "signals": [outcome], "window": {"start": clean[0]["start"], "end": clean[-1]["washout_end"]},
            "status": "pending_approval", "observational": None,
            "intervention": {
                "arm_a": arm_a, "arm_b": arm_b, "outcome_signal": outcome, "better": better,
                "period_days": pdays, "washout_days": wdays, "n_periods": len(clean),
                "seed": seed, "schedule": clean,
            },
            "patient_summary": summary,
        }

    # ---- P01 Maria: migraine, older adult, phone + Fitbit. OBSERVATIONAL PASS (multi-signal).
    rng = np.random.default_rng(seed + 1)
    df = base_frame(rng, sleep=405, rhr=66, hrv=34, steps=5200, speed=1.05)
    ep = place_episodes(rng, 13, min_gap=6)
    df.loc[ep, "episode"] = 1
    for e in ep:
        for lag, drop in ((1, 55), (2, 75)):        # short sleep 1-2 nights before
            if e - lag >= 0:
                df.loc[e - lag, "sleep_min"] -= drop
                df.loc[e - lag, "hrv"] -= 6
        df.loc[e, "steps"] -= 2200                   # less active on migraine days
    df = apply_missing(rng, df, ["sleep_min", "resting_hr", "hrv", "steps"])
    add("P01-MARIA",
        {"display_name": "Maria, 68", "condition": "Migraine",
         "devices": ["iphone", "fitbit"],
         "story": "Neurologist suspects short sleep triggers her migraines. She struggles to "
                  "recall what preceded each attack."},
        df, ["sleep_min", "resting_hr", "hrv", "steps", "walking_speed"],
        [obs_plan("P01-MARIA", "Does short sleep precede Maria's migraines?",
                  ["iphone", "fitbit"], "sleep_min", "lower",
                  "Dr. Rivera wants to check whether shorter sleep tends to come before your "
                  "migraines. This test uses sleep from your Fitbit and your migraine log. "
                  "Nothing else is shared. You can pause or stop at any time.")],
        {"planted": "sleep -55 min at lag1, -75 min at lag2; hrv -6 ms at lag1-2; "
                    "steps -2200 on episode days",
         "expected": {"DEMO-P01-MARIA": "likely_real", "best_lag_days": 2},
         "also_try": {"hrv/lower": "likely_real", "resting_hr/higher": "probably_chance (nothing planted)", "steps/lower": "probably_chance: steps drop ON migraine days, not before (symptom, not warning sign)"},
         "showcases": "core observational test, lag scan, equity (older adult, recall bias)"})

    # ---- P02 James: headaches, NO real relationship. OBSERVATIONAL NULL.
    rng = np.random.default_rng(seed + 22)
    df = base_frame(rng, sleep=395, rhr=70, hrv=30, steps=6800)
    ep = place_episodes(rng, 12, min_gap=6)
    df.loc[ep, "episode"] = 1
    df = apply_missing(rng, df, ["sleep_min", "resting_hr", "hrv", "steps"])
    add("P02-JAMES",
        {"display_name": "James, 54", "condition": "Tension headaches",
         "devices": ["iphone", "apple_watch"],
         "story": "James is convinced bad sleep causes his headaches. The data says otherwise."},
        df, ["sleep_min", "resting_hr", "hrv", "steps"],
        [obs_plan("P02-JAMES", "Does short sleep precede James's headaches?",
                  ["iphone", "apple_watch"], "sleep_min", "lower",
                  "Dr. Rivera wants to check whether shorter sleep tends to come before your "
                  "headaches. This test uses sleep from your Apple Watch and your headache log. "
                  "Nothing else is shared. You can pause or stop at any time.")],
        {"planted": "nothing (episodes independent of all signals)",
         "expected": {"DEMO-P02-JAMES": "probably_chance"},
         "showcases": "the tool can say NO; protects against confirmation bias"})

    # ---- P03 Aisha: insomnia, melatonin A/B. INTERVENTION PASS.
    rng = np.random.default_rng(seed + 43)
    df = base_frame(rng, sleep=360, rhr=64, hrv=40, steps=8200)
    sched = ab_schedule(rng, 12, 6, 2, first_day=7)
    arms = arm_vector(sched)
    df.loc[arms == "B", "sleep_min"] += 45
    df = apply_missing(rng, df, ["sleep_min", "resting_hr", "hrv", "steps"])
    add("P03-AISHA",
        {"display_name": "Aisha, 41", "condition": "Insomnia",
         "devices": ["iphone", "apple_watch"],
         "story": "Should Aisha keep taking melatonin? Population studies show small average "
                  "effects; her own response is what matters."},
        df, ["sleep_min", "resting_hr", "hrv", "steps"],
        [int_plan("P03-AISHA", "Does melatonin improve Aisha's sleep?",
                  ["iphone", "apple_watch"], "sleep_min", "higher",
                  "No melatonin", "Melatonin 3 mg", sched, 6, 2,
                  "Dr. Rivera suggests a 14-week test: on some weeks you take melatonin and on "
                  "others you don't, in a random order. This test uses only sleep from your "
                  "Apple Watch. You can pause or stop at any time.")],
        {"planted": "+45 min sleep on B (melatonin) days (strong individual responder); washout days unaffected",
         "expected": {"DEMO-P03-AISHA": "likely_real"},
         "showcases": "n-of-1 trial: randomized AB/BA blocks with washout (Lillie et al. 2011)"})

    # ---- P04 Robert: hypertension, morning vs evening dosing, cuffless BP. INTERVENTION NULL.
    rng = np.random.default_rng(seed + 44)
    df = base_frame(rng, sleep=410, rhr=68, hrv=28, steps=4800, sbp=138, speed=0.98)
    sched = ab_schedule(rng, 12, 6, 2, first_day=7)
    df = apply_missing(rng, df, ["sleep_min", "resting_hr", "hrv", "steps", "systolic_bp"])
    add("P04-ROBERT",
        {"display_name": "Robert, 72", "condition": "Hypertension",
         "devices": ["iphone", "bp_wearable"],
         "story": "Does taking his blood pressure pill at night instead of the morning lower "
                  "Robert's blood pressure? For him, timing makes no difference."},
        df, ["sleep_min", "resting_hr", "steps", "systolic_bp", "walking_speed"],
        [int_plan("P04-ROBERT", "Evening vs morning dosing: Robert's blood pressure",
                  ["iphone", "bp_wearable"], "systolic_bp", "lower",
                  "Morning dose", "Evening dose", sched, 6, 2,
                  "Dr. Rivera suggests alternating the time you take your blood pressure pill "
                  "week by week, in a random order. This test uses only blood pressure from "
                  "your wrist monitor. You can pause or stop at any time.")],
        {"planted": "nothing (dose timing has no effect on systolic_bp)",
         "expected": {"DEMO-P04-ROBERT": "probably_chance"},
         "showcases": "intervention that doesn't help is correctly identified; emerging "
                      "cuffless BP sensing"})

    # ---- P05 Dana: type 2 diabetes, post-dinner walk, CGM. INTERVENTION PASS (multimodal).
    rng = np.random.default_rng(seed + 5)
    df = base_frame(rng, sleep=430, rhr=72, hrv=32, steps=5600, tir=62)
    sched = ab_schedule(rng, 12, 6, 2, first_day=7)
    arms = arm_vector(sched)
    b = arms == "B"
    df.loc[b, "glucose_tir"] += 9          # walk after dinner: more time in range
    df.loc[b, "steps"] += 2400             # the walk itself shows up in steps
    df = apply_missing(rng, df, ["sleep_min", "resting_hr", "hrv", "steps", "glucose_tir"],
                       p_day=0.03)
    add("P05-DANA",
        {"display_name": "Dana, 35", "condition": "Type 2 diabetes",
         "devices": ["iphone", "fitbit", "cgm"],
         "story": "Does a 15-minute walk after dinner improve Dana's glucose control? "
                  "Her continuous glucose monitor answers it for her specifically."},
        df, ["sleep_min", "resting_hr", "hrv", "steps", "glucose_tir"],
        [int_plan("P05-DANA", "Does a post-dinner walk improve Dana's glucose time-in-range?",
                  ["iphone", "fitbit", "cgm"], "glucose_tir", "higher",
                  "Usual evening", "15-min walk after dinner", sched, 6, 2,
                  "Dr. Rivera suggests alternating weeks with and without a short walk after "
                  "dinner, in a random order. This test uses only time-in-range from your "
                  "glucose monitor. You can pause or stop at any time.")],
        {"planted": "+9 points glucose time-in-range and +2400 steps on B days",
         "expected": {"DEMO-P05-DANA": "likely_real"},
         "showcases": "multi-device fusion (CGM + Fitbit); lifestyle intervention; "
                      "steps confirm adherence"})

    # ---- P06 Leo: bipolar II, sleep drop before hypomania; smart ring. OBSERVATIONAL PASS.
    rng = np.random.default_rng(seed + 6)
    df = base_frame(rng, sleep=450, rhr=60, hrv=52, steps=9000)
    ep = place_episodes(rng, 9, min_gap=10, start=10)
    df.loc[ep, "episode"] = 1
    for e in ep:
        for lag, drop in ((1, 95), (2, 80), (3, 50)):   # sleep need falls ahead of episodes
            if e - lag >= 0:
                df.loc[e - lag, "sleep_min"] -= drop
                df.loc[e - lag, "steps"] += 2500
        df.loc[e, "steps"] += 3500
    df = apply_missing(rng, df, ["sleep_min", "resting_hr", "hrv", "steps",
                                 "skin_temp_dev", "resp_rate"])
    add("P06-LEO",
        {"display_name": "Leo, 29", "condition": "Bipolar II",
         "devices": ["iphone", "smart_ring"],
         "story": "Leo and his psychiatrist want early warning signs before hypomanic episodes. "
                  "Leo set up the plan while well and chose who can see it."},
        df, ["sleep_min", "resting_hr", "hrv", "steps", "skin_temp_dev", "resp_rate"],
        [obs_plan("P06-LEO", "Does reduced sleep precede Leo's hypomanic episodes?",
                  ["iphone", "smart_ring"], "sleep_min", "lower",
                  "Your psychiatrist wants to check whether shorter sleep comes before your "
                  "episodes, using sleep from your ring and your episode log. Nothing else is "
                  "shared. You can pause or stop at any time.")],
        {"planted": "sleep -95/-80/-50 min at lag 1/2/3; steps +2500 at lag1-3, +3500 on "
                    "episode day",
         "expected": {"DEMO-P06-LEO": "likely_real", "best_lag_days": "1-2 (near-identical effect)"},
         "also_try": {"steps/higher": "likely_real (lag 3)", "resting_hr/higher": "probably_chance"},
         "showcases": "early-warning lag profile; smart ring; patient-controlled consent"})

    # ---- P07 Grace: phone-only, very few events. NOT ENOUGH DATA + device gaps.
    rng = np.random.default_rng(seed + 7)
    df = base_frame(rng, steps=3100, speed=0.82, temp=False, resp=False, spo2=False)
    ep = place_episodes(rng, 3, min_gap=15, start=20)
    df.loc[ep, "episode"] = 1                         # near-falls
    for e in ep:
        df.loc[max(e - 2, 0):e - 1, "walking_speed"] -= 0.06
    df = apply_missing(rng, df, ["steps", "walking_speed"], p_day=0.08)
    add("P07-GRACE",
        {"display_name": "Grace, 80", "condition": "Fall risk",
         "devices": ["iphone"],
         "story": "Grace only has an iPhone. Sleep-based tests are unavailable, and with only "
                  "3 near-falls the suite honestly reports there isn't enough data yet."},
        df, ["steps", "walking_speed"],
        [obs_plan("P07-GRACE", "Does slower walking precede Grace's near-falls?",
                  ["iphone"], "walking_speed", "lower",
                  "Dr. Rivera wants to check whether your walking slows down before near-falls. "
                  "This test uses walking speed from your iPhone and your fall log. Nothing else "
                  "is shared. You can pause or stop at any time.")],
        {"planted": "walking_speed -0.06 m/s 1-2 days before 3 near-falls (too few to test)",
         "expected": {"DEMO-P07-GRACE": "not_enough_data"},
         "showcases": "sufficiency check; device selector greys out sleep/HR for phone-only; "
                      "equity (works with what she has, tells you what's missing)"})

    return patients, plans, truth, frames


DEVICE_CATALOG = [
    {"id": "iphone", "name": "iPhone", "availability": "now",
     "signals": ["steps", "walking_speed", "episode"]},
    {"id": "apple_watch", "name": "Apple Watch", "availability": "now",
     "signals": ["sleep_min", "resting_hr", "hrv", "steps", "resp_rate", "spo2",
                 "skin_temp_dev", "walking_speed"]},
    {"id": "fitbit", "name": "Fitbit", "availability": "now",
     "signals": ["sleep_min", "resting_hr", "hrv", "steps", "spo2", "skin_temp_dev"]},
    {"id": "smart_ring", "name": "Smart ring (Oura-class)", "availability": "now",
     "signals": ["sleep_min", "resting_hr", "hrv", "skin_temp_dev", "resp_rate"]},
    {"id": "cgm", "name": "Continuous glucose monitor", "availability": "now",
     "signals": ["glucose_tir"]},
    {"id": "bp_wearable", "name": "Cuffless BP wearable", "availability": "emerging",
     "signals": ["systolic_bp"]},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="synthetic_out")
    args = ap.parse_args()
    os.makedirs(os.path.join(args.out, "daily"), exist_ok=True)

    patients, plans, truth, frames = build()
    stacked = []
    for pid, df in frames.items():
        df.to_csv(os.path.join(args.out, "daily", f"{pid}.csv"), index=False)
        stacked.append(df.assign(patient_id=pid))
    pd.concat(stacked)[["patient_id", "date"] + SIGNALS + ["episode"]].to_csv(
        os.path.join(args.out, "all_daily.csv"), index=False)

    with open(os.path.join(args.out, "patients.json"), "w") as f:
        json.dump(patients, f, indent=2)
    with open(os.path.join(args.out, "demo_plans.json"), "w") as f:
        json.dump(plans, f, indent=2)
    with open(os.path.join(args.out, "ground_truth.json"), "w") as f:
        json.dump(truth, f, indent=2)
    with open(os.path.join(args.out, "devices.json"), "w") as f:
        json.dump(DEVICE_CATALOG, f, indent=2)
    print(f"wrote {len(patients)} patients, {len(plans)} demo plans to {args.out}/")


if __name__ == "__main__":
    main()
