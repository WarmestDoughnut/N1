"""
In-memory store for plans, results and logged episodes, persisted to
`backend/data/store.json`. No DB, no auth (CLAUDE.md §4). Seeded from the demo data
on first run. Enforces the plan status machine from CONTRACT §4.
"""
import json
import os
import threading
from datetime import datetime

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
        self._counter = 0

    # ----- persistence -----
    def load(self):
        if not os.path.exists(STORE_PATH):
            return False
        with open(STORE_PATH) as f:
            data = json.load(f)
        self.plans = data.get("plans", {})
        self.results = data.get("results", {})
        self.episodes = data.get("episodes", [])
        self._counter = data.get("counter", 0)
        return True

    def save(self):
        os.makedirs(os.path.dirname(STORE_PATH), exist_ok=True)
        tmp = STORE_PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump({
                "plans": self.plans, "results": self.results,
                "episodes": self.episodes, "counter": self._counter,
            }, f, indent=2)
        os.replace(tmp, STORE_PATH)

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
