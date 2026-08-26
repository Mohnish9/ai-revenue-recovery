-- Migration 002: Synthetic Telemetry Demonstration Queue & AI Detection Schema

-- 1. synthetic_telemetry_records: Stores raw synthetic telemetry demo datasets waiting for AI analysis
create table if not exists synthetic_telemetry_records (
  id text primary key,
  batch_number integer not null unique check (batch_number >= 1 and batch_number <= 100),
  title text not null,
  customer_id text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  customer_type text not null default 'INDIVIDUAL' check (customer_type in ('INDIVIDUAL', 'BUSINESS')),
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null default 'INR',
  payment_method text not null,
  payment_rail text not null,
  events jsonb not null default '[]'::jsonb,
  session_context jsonb not null default '{}'::jsonb,
  historical_context jsonb not null default '{}'::jsonb,
  status text not null default 'WAITING' check (status in ('WAITING', 'ANALYZING', 'AI_DETECTED', 'RECOVERY_ACTIVE', 'RECOVERED', 'ESCALATED', 'ERROR')),
  created_incident_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. telemetry_ground_truth: Stores hidden ground truth classification for demo evaluation (never sent to Gemini)
create table if not exists telemetry_ground_truth (
  id text primary key,
  telemetry_id text not null references synthetic_telemetry_records(id) on delete cascade,
  expected_scenario_type text not null,
  expected_category text not null,
  description text,
  created_at timestamptz not null default now()
);

-- 3. telemetry_ai_analyses: Stores actual Gemini AI detection results
create table if not exists telemetry_ai_analyses (
  id text primary key,
  telemetry_id text not null references synthetic_telemetry_records(id) on delete cascade,
  detected_scenario_type text not null,
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  root_cause text not null,
  evidence jsonb not null default '[]'::jsonb,
  reasoning text not null,
  revenue_at_risk numeric(14,2) not null check (revenue_at_risk >= 0),
  recommended_strategy text not null,
  recommended_channel text not null,
  explanation text,
  model_name text not null default 'gemini-3.7-flash',
  raw_model_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 4. telemetry_processing_runs: Stores manual execution audit run history
create table if not exists telemetry_processing_runs (
  id text primary key,
  telemetry_id text not null references synthetic_telemetry_records(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  model text not null default 'gemini-3.7-flash',
  error text,
  detected_result text,
  created_incident_id text
);

-- 5. detection_evaluations: Stores comparison of AI prediction vs hidden ground truth
create table if not exists detection_evaluations (
  id text primary key,
  telemetry_id text not null references synthetic_telemetry_records(id) on delete cascade,
  ai_prediction text not null,
  ground_truth text not null,
  match boolean not null default false,
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  evaluated_at timestamptz not null default now()
);

-- 6. sandbox_incidents: Stores sandbox incidents created after AI detection
create table if not exists sandbox_incidents (
  id text primary key,
  telemetry_id text references synthetic_telemetry_records(id) on delete set null,
  scenario_type text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  customer_type text not null default 'INDIVIDUAL',
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null default 'INR',
  payment_method text not null,
  payment_rail text not null,
  failure_reason text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'RECOVERED', 'ESCALATED', 'CANCELLED')),
  ai_confidence numeric(5,2),
  ai_root_cause text,
  ai_evidence jsonb not null default '[]'::jsonb,
  ai_reasoning text,
  ai_recommended_strategy text,
  attempt_number integer not null default 0,
  next_attempt_at timestamptz,
  workflow_status text not null default 'SCHEDULED',
  metadata jsonb not null default '{}'::jsonb,
  is_sandbox boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for lightning fast queries
create index if not exists synthetic_telemetry_status_idx on synthetic_telemetry_records(status);
create index if not exists telemetry_ground_truth_telemetry_id_idx on telemetry_ground_truth(telemetry_id);
create index if not exists telemetry_ai_analyses_telemetry_id_idx on telemetry_ai_analyses(telemetry_id);
create index if not exists detection_evaluations_telemetry_id_idx on detection_evaluations(telemetry_id);
create index if not exists sandbox_incidents_telemetry_id_idx on sandbox_incidents(telemetry_id);
create index if not exists sandbox_incidents_status_idx on sandbox_incidents(status);
