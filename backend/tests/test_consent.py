"""v1.7 consent enforcement (to-backend #17/#18): plan-scoped reads require an active connection;
the no-plan_id /series is consent-scoped for clinicians. Run with DATABASE_URL="" (JSON mode)."""
import os
os.environ.setdefault("DATABASE_URL", "")
os.environ.setdefault("SUPABASE_DB_URL", "")
import tempfile

from app import store as _store
_store.STORE_PATH = tempfile.mktemp(suffix=".json")

from app import main as m  # noqa: E402  (import after patching the store path)


class Req:
    def __init__(self, token=None):
        self.headers = {"authorization": f"Bearer {token}"} if token else {}


def _status(resp):
    return getattr(resp, "status_code", 200)


# Leo (P06-LEO) is connected to Okafor; Rivera only has a PENDING request → not connected.
PLAN = "DONE-P06-LEO"


def test_unconnected_clinician_blocked_from_plan_and_results():
    assert _status(m.get_plan(PLAN, Req("acct-rivera"))) == 403
    assert _status(m.results(PLAN, Req("acct-rivera"))) == 403


def test_connected_clinician_can_read_plan_and_results():
    plan = m.get_plan(PLAN, Req("acct-okafor"))
    assert isinstance(plan, dict) and plan["id"] == PLAN
    res = m.results(PLAN, Req("acct-okafor"))
    assert isinstance(res, dict) and res.get("verdict") == "likely_real"


def test_no_plan_series_is_consent_scoped_for_clinician():
    # Connected clinician → consent-scoped shared-data envelope (only shared signals/windows).
    scoped = m.series("P06-LEO", Req("acct-okafor"))
    assert isinstance(scoped, dict) and "range" in scoped and "signals" in scoped
    # Unconnected clinician → blocked.
    assert _status(m.series("P06-LEO", Req("acct-rivera"))) == 403


def test_patient_sees_own_full_series():
    # The patient may see all of their own history (unrestricted), shape {patient_id, rows}.
    own = m.series("P06-LEO", Req("acct-p06-leo"))
    assert isinstance(own, dict) and own.get("rows") and "range" not in own
