"""
Balanced randomized block schedules for intervention (A/B n-of-1) plans.

Each consecutive pair of periods is one block, randomized to AB or BA by a seeded coin
flip (so the arms are balanced overall). Washout days follow each period and are excluded
from analysis. Used by the clinician wizard preview and when a new intervention plan omits
its schedule. Demo plans ship their own exact schedules and are NOT regenerated.
"""
from datetime import date, timedelta

import numpy as np


def _d(s):
    y, m, dd = (int(x) for x in str(s)[:10].split("-"))
    return date(y, m, dd)


def generate_schedule(n_periods, period_days, washout_days, seed, start):
    """Return a list of period dicts: {period, arm, start, end, washout_end}.

    n_periods must be even (whole AB/BA blocks). Dates are inclusive `YYYY-MM-DD`.
    """
    n_periods = int(n_periods)
    if n_periods % 2:
        n_periods += 1  # round up to a whole block
    k = n_periods // 2
    rng = np.random.default_rng(int(seed))

    arms = []
    for _ in range(k):
        arms += ["A", "B"] if rng.random() < 0.5 else ["B", "A"]

    cur = _d(start)
    schedule = []
    for i, arm in enumerate(arms, start=1):
        end = cur + timedelta(days=period_days - 1)
        washout_end = end + timedelta(days=washout_days)
        schedule.append({
            "period": i,
            "arm": arm,
            "start": cur.isoformat(),
            "end": end.isoformat(),
            "washout_end": washout_end.isoformat(),
        })
        cur = washout_end + timedelta(days=1)
    return schedule


def smallest_possible_p(n_periods):
    """1 / 2^k for k = n_periods // 2 blocks (the permutation p-value floor)."""
    k = int(n_periods) // 2
    return 1.0 / (2 ** k) if k > 0 else 1.0
