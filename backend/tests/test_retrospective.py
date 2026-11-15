"""
v1.6 retrospective/mixed window rules (CONTRACT §10).

Focus: the human's binding product rules —
  * A/B (intervention) requires a FUTURE window; it must NOT be offered on past-only data.
  * past data is classified as retrospective; future as prospective; spanning as mixed.
Run from backend/:  python -m pytest tests/test_retrospective.py -q
"""
from app.main import _delivery, delivery_preview, _as_of


def _win(start, end):
    return {"window": {"start": start, "end": end}}


def test_demo_window_is_retrospective():
    # all demo data is Jun–Sep 2026; today is well past that
    d = _delivery(_win("2026-06-01", "2026-09-28"))
    assert d["delivery"] == "retrospective"
    assert d["past_end"] == "2026-09-28"
    assert d["live_start"] is None


def test_future_window_is_prospective():
    d = _delivery(_win("2099-01-01", "2099-03-01"))
    assert d["delivery"] == "prospective"
    assert d["live_start"] is not None


def test_spanning_window_is_mixed():
    as_of = _as_of()
    d = _delivery(_win("2026-06-01", "2099-03-01"))
    assert d["delivery"] == "mixed"
    assert d["past_end"] == as_of          # clipped at today
    assert d["live_start"] is not None


def test_ab_not_allowed_on_past_only():
    # the wizard pre-check must grey the A/B option for a purely-past window
    p = delivery_preview(start="2026-06-01", end="2026-09-28", patient_id="P01-MARIA")
    assert p["delivery"] == "retrospective"
    assert p["intervention_allowed"] is False


def test_ab_allowed_on_future():
    p = delivery_preview(start="2099-01-01", end="2099-03-01", patient_id="P01-MARIA")
    assert p["intervention_allowed"] is True


def test_window_before_data_flagged():
    p = delivery_preview(start="2020-01-01", end="2026-09-28", patient_id="P01-MARIA")
    assert p["window_before_data"] is True
