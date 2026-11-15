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
N_PERM = 150


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


def fit_risk_model(df, plan):
    """Return a CONTRACT §5 `model` dict, or None for non-observational plans."""
    if plan.get("type") != "observational":
        return None
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

    # label-permutation null for AUC
    rng = np.random.default_rng(0)
    null = []
    for _ in range(N_PERM):
        a = oof_auc(rng.permutation(y))
        if a is not None:
            null.append(a)
    null = np.array(null) if null else np.array([0.5])
    auc_null_p = float((1 + np.sum(null >= auc)) / (len(null) + 1))

    # fit on all data for coefficients + tomorrow's risk
    pipe = _pipe().fit(X, y)
    weights = pipe.named_steps["lr"].coef_[0]
    coefs = [{"feature": f, "weight": round(float(w), 3)} for f, w in zip(feats, weights)]

    # risk for "tomorrow": the most recent max_lag days as lag1..lagL
    recent = [sig[-L] for L in range(1, max_lag + 1)]
    risk = float(pipe.predict_proba([recent])[0, 1]) if not np.all(np.isnan(recent)) else None

    return {
        "kind": "logistic_l2",
        "trained": True,
        "reason": None,
        "auc": round(auc, 3),
        "auc_null_p": round(auc_null_p, 3),
        "coefficients": coefs,
        "risk_tomorrow": None if risk is None else round(risk, 3),
    }
