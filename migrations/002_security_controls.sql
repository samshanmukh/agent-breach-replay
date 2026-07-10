create table if not exists policies (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  version integer not null default 1,
  enabled boolean not null default true,
  rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists policy_simulations (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  source_run_id text references runs(id) on delete set null,
  baseline_findings jsonb not null,
  simulated_findings jsonb not null,
  changes jsonb not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists approval_requests (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  run_id text not null references runs(id) on delete cascade,
  event_id text not null,
  status text not null check (status in ('pending', 'approved', 'denied', 'expired')),
  requested_action text not null,
  reason text not null,
  evidence text[] not null default '{}',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  decision_note text
);

create index if not exists approval_requests_project_status_idx
  on approval_requests(project_id, status, requested_at desc);

create table if not exists project_settings (
  project_id text primary key references projects(id) on delete cascade,
  default_capture_mode text not null default 'metadata-only',
  retention_metadata_days integer not null default 90,
  retention_preview_days integer not null default 30,
  retention_debug_days integer not null default 7,
  require_approval_for_external boolean not null default true,
  audit_run_views boolean not null default true,
  allowed_origins jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists project_api_keys (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{ingest,read}',
  created_by text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists audit_logs (
  id text primary key,
  project_id text,
  actor_id text not null,
  actor_email text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_project_time_idx
  on audit_logs(project_id, created_at desc);
