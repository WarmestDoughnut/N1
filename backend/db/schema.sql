-- N1 Hub — Supabase Postgres schema (centralized app state).
-- The backend auto-creates these on startup when DATABASE_URL is set, so running this by hand
-- is optional; it's here so you can paste it into the Supabase SQL editor to preview the tables.
-- Static reference data (patients, devices, daily time series) is loaded from the repo, not here.

create table if not exists accounts (
  id text primary key,
  role text,            -- 'clinician' | 'patient'
  name text,
  email text,
  password text,        -- demo only (plain); real auth would be Supabase Auth
  patient_id text,      -- set for patient accounts
  specialty text,       -- set for clinicians
  connect_code text     -- set for clinicians (e.g. RIV-482)
);

create table if not exists connections (
  id text primary key,
  clinician_id text,
  clinician_name text,
  clinician_specialty text,
  patient_id text,
  patient_name text,
  status text,          -- 'pending' | 'active'
  requested_by text,    -- 'patient' | 'clinician'
  created_at text
);

create table if not exists episodes (
  id bigserial primary key,
  patient_id text,
  date text,
  note text
);

create table if not exists plans (
  id text primary key,
  patient_id text,
  status text,
  type text,            -- 'observational' | 'intervention'
  created_at text,
  data jsonb            -- full plan body (signals, window, schedule, history, …)
);

create table if not exists results (
  plan_id text primary key,
  verdict text,
  type text,
  data jsonb            -- full CONTRACT §5 result body
);

create table if not exists counters (
  name text primary key,
  value integer
);
