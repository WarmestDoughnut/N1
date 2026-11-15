"""
Optional personal risk model (CONTRACT §5 `results.model`), for observational plans.

An L2-regularized logistic regression predicts "episode today" from the plan's signal on
the previous 1..max_lag days. Honest by construction:
- out-of-fold AUC via TimeSeriesSplit (no peeking at the future),
- a label-permutation null for AUC so we can say whether the model beats chance,
- it refuses to train (with a reason) when there are too few episodes.

This is computed on the API path only (app/main.py), not inside run_plan, so the
ground-truth tests stay fast and deterministic.
"""
import warnings

import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

MIN_EPISODES = 8
N_PERM = 100   # label-permutation null for AUC (100 gives ample resolution; keeps simulate snappy)


def _pipe():
    # LogisticRegression defaults to L2; C=1.0 is the regularization strength.
    return Pipeline([
        ("impute", SimpleImputer(strategy="mean")),
        ("scale", StandardScaler()),
        ("lr", LogisticRegression(C=1.0, max_iter=1000, class_weight="balanced")),
    ])


def _lagged(df, signal, max_lag):
    """Feature matrix of signal[t-1..t-max_lag] and target episode[t]."""
    sig = df[signal].to_numpy(float)
    ep = df["episode"].to_numpy(int)
    n = len(df)
    feats = [f"{signal}_lag{L}" for L in range(1, max_lag + 1)]
    X, y = [], []
    for t in range(max_lag, n):
        X.append([sig[t - L] for L in range(1, max_lag + 1)])
        y.append(ep[t])
    return np.array(X, float), np.array(y, int), feats, sig


def _feature_label(feature):
    """Turn 'sleep_min_lag2' into a plain label like 'Sleep, 2 days before' for the UI."""
    from app.stats import _signal_label
    if "_lag" in feature:
        sig, lag = feature.rsplit("_lag", 1)
        try:
            L = int(lag)
            return f"{_signal_label(sig)}, {L} day{'s' if L != 1 else ''} before"
        except ValueError:
            pass
    return _signal_label(feature)


def _untrained(reason):
    return {"kind": "logistic_l2", "trained": False, "reason": reason,
            "auc": None, "auc_null_p": None, "coefficients": [], "risk_tomorrow": None}


def fit_risk_model(df, plan, verdict=None):
    """Return a CONTRACT §5 `model` dict, or None for non-observational plans.

    Product rule: we only build a personal risk model once the screening test has found a
    candidate signal (verdict likely_real/suggestive). Fitting a predictive model on a signal
    the screening test rejected is fishing, and small-sample multivariate AUC can pick up chance
    patterns the univariate test (correctly) ignores — so for a `probably_chance` plan we decline.
    """
    if plan.get("type") != "observational":
        return None
    if verdict is not None and verdict not in ("likely_real", "suggestive"):
        return _untrained("too_few_episodes" if verdict == "not_enough_data" else "no_primary_signal")
    warnings.filterwarnings("ignore", category=ConvergenceWarning)
    warnings.filterwarnings("ignore", category=FutureWarning)
    o = plan["observational"]
    signal, max_lag = o["signal"], o["max_lag_days"]

    if signal not in df.columns:
        return {"kind": "logistic_l2", "trained": False, "reason": "signal_unavailable",
                "auc": None, "auc_null_p": None, "coefficients": [], "risk_tomorrow": None}

    X, y, feats, sig = _lagged(df, signal, max_lag)
    n_ep = int(y.sum())
    if n_ep < MIN_EPISODES:
        return {"kind": "logistic_l2", "trained": False, "reason": "too_few_episodes",
                "auc": None, "auc_null_p": None, "coefficients": [], "risk_tomorrow": None}

    tscv = TimeSeriesSplit(n_splits=5)

    def oof_auc(target):
        """Out-of-fold AUC via TimeSeriesSplit; skips folds whose training set is single-class
        (episodes are rare, so the earliest folds often have none). Returns None if undefined."""
        true, prob = [], []
        for tr, te in tscv.split(X):
            if len(np.unique(target[tr])) < 2:
                continue
            p = _pipe().fit(X[tr], target[tr]).predict_proba(X[te])[:, 1]
            true.extend(target[te])
            prob.extend(p)
        if len(np.unique(true)) < 2:
            return None
        return float(roc_auc_score(true, prob))

    auc = oof_auc(y)
    if auc is None:
        return {"kind": "logistic_l2", "trained": False, "reason": "cv_insufficient",
                "auc": None, "auc_null_p": None, "coefficients": [], "risk_tomorrow": None}

    # Null for AUC: CIRCULAR SHIFTS of the episode series, not random label permutation.
    # Episodes and the signal are both autocorrelated; random shuffling breaks the episodes'
    # temporal clustering and makes the test anti-conservative (false positives, e.g. P02-JAMES).
    # Circular shifts preserve that autocorrelation, so a high AUC only survives if the signal
    # genuinely predicts episodes at the right phase.
    rng = np.random.default_rng(0)
    n = len(y)
    shifts = rng.integers(max_lag + 1, n - max_lag - 1, N_PERM)
    null = []
    for s in shifts:
        a = oof_auc(np.roll(y, s))
        if a is not None:
            null.append(a)
    null = np.array(null) if null else np.array([0.5])
    auc_null_p = float((1 + np.sum(null >= auc)) / (len(null) + 1))

    # fit on all data for coefficients + tomorrow's risk
    pipe = _pipe().fit(X, y)
    weights = pipe.named_steps["lr"].coef_[0]
    coefs = [{"feature": f, "label": _feature_label(f), "weight": round(float(w), 3)}
             for f, w in zip(feats, weights)]

    # risk for "tomorrow": the most recent max_lag days as lag1..lagL
    recent = [sig[-L] for L in range(1, max_lag + 1)]
    risk = float(pipe.predict_proba([recent])[0, 1]) if not np.all(np.isnan(recent)) else None

    # plain-language framing so the clinician (and patient) needn't read AUC / feature names
    quality = "strong" if auc >= 0.8 else "moderate" if auc >= 0.65 else "weak"
    beats = auc_null_p < 0.05
    plain = (f"On days it hadn't seen, this model told an about-to-have-an-episode day from a normal "
             f"day about {round(auc * 100)}% of the time (50% is a coin flip) — a {quality} signal. "
             + ("Better than chance." if beats else "Not better than chance, so treat it with caution."))

    return {
        "kind": "logistic_l2",
        "trained": True,
        "reason": None,
        "auc": round(auc, 3),
        "auc_null_p": round(auc_null_p, 3),
        "quality": quality,
        "beats_chance": beats,
        "plain": plain,
        "coefficients": coefs,
        "risk_tomorrow": None if risk is None else round(risk, 3),
    }
