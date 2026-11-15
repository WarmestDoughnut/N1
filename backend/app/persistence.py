"""
Persistence backends for the store.

Two interchangeable backends with the same tiny interface:
    load() -> snapshot dict | None      # None means "nothing persisted yet"
    save(snapshot: dict) -> None

- `JsonBackend`  — local dev / demo fallback: `backend/data/store.json` (current behaviour).
- `PostgresBackend` — centralized data in Supabase Postgres, selected when `DATABASE_URL` is set.

The selection is env-gated so **nothing changes locally**: with no `DATABASE_URL` the app behaves
exactly as before. `store.py` keeps all its in-memory logic; only where state is loaded/saved differs.
The snapshot is the single dict shape both backends round-trip:

    {"plans": {...}, "results": {...}, "episodes": [...], "accounts": {...},
     "connections": {...}, "counter": int, "conn_counter": int}
"""
import json
import os

EMPTY = {"plans": {}, "results": {}, "episodes": [], "accounts": {},
         "connections": {}, "counter": 0, "conn_counter": 0}


def get_backend(json_path):
    """PostgresBackend when DATABASE_URL is set and reachable, else JsonBackend (local/demo).

    If a DATABASE_URL is configured but Postgres can't be reached at startup, we fall back to the
    JSON store rather than crash — so the demo keeps working even if Supabase is briefly down.
    """
    url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if url and "PASTE_" not in url:
        try:
            return PostgresBackend(url)
        except Exception as e:  # connection/schema failure -> safe fallback
            print(f"[persistence] Postgres unavailable ({type(e).__name__}); using JSON store", flush=True)
    return JsonBackend(json_path)


class JsonBackend:
    def __init__(self, path):
        self.path = path
        self.kind = "json"

    def load(self):
        if not os.path.exists(self.path):
            return None
        with open(self.path) as f:
            return json.load(f)

    def save(self, snapshot):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(snapshot, f, indent=2)
        os.replace(tmp, self.path)


# Flat, queryable tables (nice in the Supabase dashboard); nested plan/result bodies are jsonb.
SCHEMA = """
create table if not exists accounts (
  id text primary key, role text, name text, email text, password text,
  patient_id text, specialty text, connect_code text
);
create table if not exists connections (
  id text primary key, clinician_id text, clinician_name text, clinician_specialty text,
  patient_id text, patient_name text, status text, requested_by text, created_at text
);
create table if not exists episodes (
  id bigserial primary key, patient_id text, date text, note text
);
create table if not exists plans (
  id text primary key, patient_id text, status text, type text, created_at text, data jsonb
);
create table if not exists results (
  plan_id text primary key, verdict text, type text, data jsonb
);
create table if not exists counters (name text primary key, value integer);
"""

_ACCOUNT_COLS = ["id", "role", "name", "email", "password", "patient_id", "specialty", "connect_code"]
_CONN_COLS = ["id", "clinician_id", "clinician_name", "clinician_specialty", "patient_id",
              "patient_name", "status", "requested_by", "created_at"]


class PostgresBackend:
    def __init__(self, url):
        self.url = url
        self.kind = "postgres"
        self._ensure_schema()

    def _connect(self):
        import psycopg2  # lazy: only needed when DATABASE_URL is set
        return psycopg2.connect(self.url)

    def _ensure_schema(self):
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(SCHEMA)
            conn.commit()

    def load(self):
        snap = {"plans": {}, "results": {}, "episodes": [], "accounts": {},
                "connections": {}, "counter": 0, "conn_counter": 0}
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("select id, data from plans")
            for pid, data in cur.fetchall():
                snap["plans"][pid] = data
            cur.execute("select plan_id, data from results")
            for pid, data in cur.fetchall():
                snap["results"][pid] = data
            cur.execute("select patient_id, date, note from episodes order by id")
            for patient_id, d, note in cur.fetchall():
                snap["episodes"].append({"patient_id": patient_id, "date": d, "note": note})
            cur.execute("select %s from accounts" % ", ".join(_ACCOUNT_COLS))
            for row in cur.fetchall():
                acct = dict(zip(_ACCOUNT_COLS, row))
                snap["accounts"][acct["id"]] = acct
            cur.execute("select %s from connections" % ", ".join(_CONN_COLS))
            for row in cur.fetchall():
                c = dict(zip(_CONN_COLS, row))
                snap["connections"][c["id"]] = c
            cur.execute("select name, value from counters")
            for name, value in cur.fetchall():
                if name == "counter":
                    snap["counter"] = value
                elif name == "conn_counter":
                    snap["conn_counter"] = value
        return snap

    def save(self, snapshot):
        from psycopg2.extras import Json
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("truncate accounts, connections, episodes, plans, results, counters")
            for p in snapshot["plans"].values():
                cur.execute(
                    "insert into plans (id, patient_id, status, type, created_at, data) "
                    "values (%s,%s,%s,%s,%s,%s)",
                    (p["id"], p.get("patient_id"), p.get("status"), p.get("type"),
                     p.get("created_at"), Json(p)))
            for pid, r in snapshot["results"].items():
                cur.execute(
                    "insert into results (plan_id, verdict, type, data) values (%s,%s,%s,%s)",
                    (pid, r.get("verdict"), r.get("type"), Json(r)))
            for e in snapshot["episodes"]:
                cur.execute("insert into episodes (patient_id, date, note) values (%s,%s,%s)",
                            (e.get("patient_id"), e.get("date"), e.get("note")))
            for a in snapshot["accounts"].values():
                cur.execute(
                    "insert into accounts (%s) values (%s)"
                    % (", ".join(_ACCOUNT_COLS), ", ".join(["%s"] * len(_ACCOUNT_COLS))),
                    tuple(a.get(c) for c in _ACCOUNT_COLS))
            for c in snapshot["connections"].values():
                cur.execute(
                    "insert into connections (%s) values (%s)"
                    % (", ".join(_CONN_COLS), ", ".join(["%s"] * len(_CONN_COLS))),
                    tuple(c.get(k) for k in _CONN_COLS))
            cur.execute("insert into counters (name, value) values ('counter', %s), ('conn_counter', %s)",
                        (snapshot.get("counter", 0), snapshot.get("conn_counter", 0)))
            conn.commit()
