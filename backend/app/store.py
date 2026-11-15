"""
In-memory store for plans, results and logged episodes, persisted to
`backend/data/store.json`. No DB, no auth (CLAUDE.md §4). Seeded from the demo data
on first run. Enforces the plan status machine from CONTRACT §4.
"""
import os
import threading
from datetime import datetime

from app import persistence

HERE = os.path.dirname(__file__)
STORE_PATH = os.path.abspath(os.path.join(HERE, "..", "data", "store.json"))

# CONTRACT §4 status machine: {status: {event: next_status}}
TRANSITIONS = {
    "pending_approval": {"approve": "active", "decline": "declined"},
    "active": {"pause": "paused", "stop": "stopped", "complete": "complete"},
    "paused": {"resume": "active", "stop": "stopped", "complete": "complete"},
    "declined": {},
    "stopped": {},
    "complete": {},
}

_SIGNAL_LABEL = {
    "sleep_min": "sleep", "resting_hr": "resting heart rate", "hrv": "heart-rate variability",
    "steps": "steps", "walking_speed": "walking speed", "systolic_bp": "blood pressure",
    "glucose_tir": "glucose time-in-range", "skin_temp_dev": "skin temperature",
    "resp_rate": "breathing rate", "spo2": "blood oxygen",
    "screen_time_min": "screen time", "late_screen_min": "late-night screen time",
    "mood_log": "mood", "pain_level": "pain level",
}


def _now():
    return datetime.now().replace(microsecond=0).isoformat()


def signal_label(sig):
    return _SIGNAL_LABEL.get(sig, sig)


def build_patient_summary(plan, device_names):
    """Plain-language consent summary from the plan (the plan IS the consent)."""
    devices = ", ".join(device_names) or "your device"
    win = plan.get("window", {})
    window = f"from {win.get('start')} to {win.get('end')}" if win else ""
    if plan["type"] == "observational":
        o = plan["observational"]
        sig = signal_label(o["signal"])
        return (f"{plan['clinician_name']} wants to check whether your {sig} changes before your "
                f"episodes. This test uses only {sig} from {devices} and your episode log {window}. "
                f"Nothing else is shared. You can pause or stop at any time.")
    iv = plan["intervention"]
    sig = signal_label(iv["outcome_signal"])
    return (f"{plan['clinician_name']} suggests alternating between \"{iv['arm_a']}\" and "
            f"\"{iv['arm_b']}\" week by week in a random order, and comparing your {sig}. "
            f"This test uses only {sig} from {devices} {window}. You can pause or stop at any time.")


class Store:
    def __init__(self):
        self._lock = threading.RLock()
        self.plans = {}       # id -> plan dict
        self.results = {}     # plan_id -> results dict
        self.episodes = []    # [{patient_id, date, note}]
        self.accounts = {}    # account_id -> account dict (v1.2)
        self.connections = {} # conn_id -> connection dict (v1.2)
        self._counter = 0
        self._conn_counter = 0
        # JSON file locally, Supabase Postgres when DATABASE_URL is set (see app/persistence.py)
        self._backend = persistence.get_backend(STORE_PATH)

    @property
    def backend_kind(self):
        return self._backend.kind

    def _snapshot(self):
        return {
            "plans": self.plans, "results": self.results, "episodes": self.episodes,
            "accounts": self.accounts, "connections": self.connections,
            "counter": self._counter, "conn_counter": self._conn_counter,
        }

    # ----- persistence -----
    def load(self):
        data = self._backend.load()
        if data is None:
            return False
        self.plans = data.get("plans", {})
        self.results = data.get("results", {})
        self.episodes = data.get("episodes", [])
        self.accounts = data.get("accounts", {})
        self.connections = data.get("connections", {})
        self._counter = data.get("counter", 0)
        self._conn_counter = data.get("conn_counter", 0)
        return True

    def save(self):
        self._backend.save(self._snapshot())

    def clear(self):
        """Wipe all runtime state (for POST /api/demo/reset). Caller re-seeds afterwards."""
        with self._lock:
            self.plans = {}
            self.results = {}
            self.episodes = []
            self.accounts = {}
            self.connections = {}
            self._counter = 0
            self._conn_counter = 0
            self.save()

    # ----- seeding -----
    def seed(self, seed_plans):
        with self._lock:
            if self.plans:
                return
            for p in seed_plans:
                plan = dict(p)
                plan.setdefault("status", "pending_approval")
                plan.setdefault("created_at", _now())
                plan.setdefault("history", [{"at": plan["created_at"], "event": "created"}])
                self.plans[plan["id"]] = plan
            self.save()

    # ----- plans -----
    def next_id(self):
        with self._lock:
            self._counter += 1
            return f"PLAN-{self._counter}"

    def add_plan(self, plan):
        with self._lock:
            self.plans[plan["id"]] = plan
            self.save()
            return plan

    def get_plan(self, plan_id):
        return self.plans.get(plan_id)

    def list_plans(self, patient_id=None):
        plans = list(self.plans.values())
        if patient_id:
            plans = [p for p in plans if p["patient_id"] == patient_id]
        return sorted(plans, key=lambda p: p.get("created_at", ""))

    def transition(self, plan_id, event):
        """Apply a status event. Returns (plan, error). error='invalid_transition' if not allowed."""
        with self._lock:
            plan = self.plans.get(plan_id)
            if plan is None:
                return None, "not_found"
            allowed = TRANSITIONS.get(plan["status"], {})
            if event not in allowed:
                return plan, "invalid_transition"
            plan["status"] = allowed[event]
            plan.setdefault("history", []).append({"at": _now(), "event": event})
            self.save()
            return plan, None

    def set_result(self, plan_id, result):
        with self._lock:
            self.results[plan_id] = result
            self.save()

    def get_result(self, plan_id):
        return self.results.get(plan_id)

    def add_episode(self, patient_id, ep_date, note):
        with self._lock:
            self.episodes.append({"patient_id": patient_id, "date": ep_date, "note": note})
            self.save()

    # ----- accounts / connections (v1.2) -------------------------------------
    # All auth state lives here and nowhere else, so this JSON-backed store can later be swapped
    # for Supabase/Postgres (or Supabase Auth) without touching the API surface. Token = account id
    # (opaque Bearer string); a real JWT could be verified in its place later with no shape change.
    _CLINICIANS = [
        {"id": "acct-rivera", "role": "clinician", "name": "Dr. Rivera", "email": "rivera@n1hub.demo",
         "password": "demo", "specialty": "Internal medicine", "connect_code": "RIV-482", "patient_id": None},
        {"id": "acct-okafor", "role": "clinician", "name": "Dr. Okafor", "email": "okafor@n1hub.demo",
         "password": "demo", "specialty": "Neurology", "connect_code": "OKA-317", "patient_id": None},
    ]
    # active clinician<->patient links; plus one pending request from a patient (Leo -> Rivera)
    _ACTIVE = [
        ("acct-rivera", ["P01-MARIA", "P02-JAMES", "P03-AISHA", "P04-ROBERT", "P07-GRACE", "P08-SAM", "REAL-P07"]),
        ("acct-okafor", ["P01-MARIA", "P05-DANA", "P06-LEO"]),
    ]
    _PENDING = [("acct-rivera", "P06-LEO")]   # requested_by patient

    @staticmethod
    def _patient_email(meta):
        if meta.get("source") == "real":
            return f"{meta['id'].lower()}@n1hub.demo"
        first = meta.get("display_name", meta["id"]).split(",")[0].strip().split()[0]
        return f"{first.lower()}@n1hub.demo"

    def seed_auth(self, patients_meta):
        """Seed demo accounts + connections once (patients_meta = {patient_id: metadata})."""
        with self._lock:
            if self.accounts:
                return
            for c in self._CLINICIANS:
                self.accounts[c["id"]] = dict(c)
            for pid, meta in patients_meta.items():
                aid = f"acct-{pid.lower()}"
                self.accounts[aid] = {
                    "id": aid, "role": "patient", "name": meta.get("display_name", pid),
                    "email": self._patient_email(meta), "password": "demo",
                    "specialty": None, "connect_code": None, "patient_id": pid,
                }
            for clin_id, pids in self._ACTIVE:
                for pid in pids:
                    self._make_connection(clin_id, pid, "active", "clinician")
            for clin_id, pid in self._PENDING:
                self._make_connection(clin_id, pid, "pending", "patient")
            self.save()

    def _patient_name(self, patient_id):
        for a in self.accounts.values():
            if a.get("patient_id") == patient_id:
                return a["name"]
        return patient_id

    def _make_connection(self, clinician_id, patient_id, status, requested_by):
        clin = self.accounts[clinician_id]
        self._conn_counter += 1
        cid = f"conn-{self._conn_counter}"
        self.connections[cid] = {
            "id": cid, "clinician_id": clinician_id, "clinician_name": clin["name"],
            "clinician_specialty": clin.get("specialty"), "patient_id": patient_id,
            "patient_name": self._patient_name(patient_id), "status": status,
            "requested_by": requested_by, "created_at": _now(),
        }
        return self.connections[cid]

    # auth lookups
    def get_account(self, account_id):
        return self.accounts.get(account_id)

    def account_by_email(self, email):
        email = (email or "").strip().lower()
        for a in self.accounts.values():
            if a["email"].lower() == email:
                return a
        return None

    def clinician_by_code(self, code):
        code = (code or "").strip().upper()
        for a in self.accounts.values():
            if a["role"] == "clinician" and (a.get("connect_code") or "").upper() == code:
                return a
        return None

    def demo_accounts(self):
        out = []
        for a in self.accounts.values():
            detail = a["specialty"] if a["role"] == "clinician" else a["name"]
            out.append({"email": a["email"], "name": a["name"], "role": a["role"], "detail": detail})
        out.sort(key=lambda d: (d["role"] != "clinician", d["email"]))
        return out

    # connections
    def connections_for(self, account):
        if account["role"] == "clinician":
            conns = [c for c in self.connections.values() if c["clinician_id"] == account["id"]]
        else:
            conns = [c for c in self.connections.values() if c["patient_id"] == account.get("patient_id")]
        return sorted(conns, key=lambda c: c["created_at"])

    def active_patient_ids(self, clinician_id):
        return {c["patient_id"] for c in self.connections.values()
                if c["clinician_id"] == clinician_id and c["status"] == "active"}

    def is_connected(self, clinician_id, patient_id):
        return any(c["clinician_id"] == clinician_id and c["patient_id"] == patient_id
                   and c["status"] == "active" for c in self.connections.values())

    def request_connection(self, patient_account, clinician_code):
        """Patient adds a clinician by code → pending connection. Returns (conn, error)."""
        with self._lock:
            clin = self.clinician_by_code(clinician_code)
            if clin is None:
                return None, "unknown_code"
            pid = patient_account.get("patient_id")
            for c in self.connections.values():
                if c["clinician_id"] == clin["id"] and c["patient_id"] == pid:
                    return None, "already_connected"
            conn = self._make_connection(clin["id"], pid, "pending", "patient")
            self.save()
            return conn, None

    def accept_connection(self, conn_id, clinician_account):
        with self._lock:
            conn = self.connections.get(conn_id)
            if conn is None:
                return None, "not_found"
            if conn["clinician_id"] != clinician_account["id"] or conn["status"] != "pending":
                return conn, "invalid_transition"
            conn["status"] = "active"
            self.save()
            return conn, None

    def remove_connection(self, conn_id, account):
        with self._lock:
            conn = self.connections.get(conn_id)
            if conn is None:
                return "not_found"
            allowed = (account["id"] == conn["clinician_id"]
                       or account.get("patient_id") == conn["patient_id"])
            if not allowed:
                return "forbidden"
            del self.connections[conn_id]
            self.save()
            return None
