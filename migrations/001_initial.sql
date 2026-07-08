create table if not exists organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists agents (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(project_id, name)
);

create table if not exists runs (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  agent_id text not null references agents(id) on delete cascade,
  scenario_name text not null,
  capture_mode text not null,
  user_task text not null,
  risk_summary text not null,
  started_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists trace_events (
  id text not null,
  run_id text not null references runs(id) on delete cascade,
  event_index integer not null,
  timestamp timestamptz not null,
  title text not null,
  actor text not null,
  trust text not null,
  summary text not null,
  details text not null,
  source_ids text[] not null default '{}',
  tool_name text,
  target text,
  target_class text,
  destination_class text,
  influenced_by text[] not null default '{}',
  decision text,
  violation text,
  raw jsonb not null,
  primary key(run_id, id)
);

create table if not exists findings (
  id bigserial primary key,
  run_id text not null references runs(id) on delete cascade,
  type text not null,
  severity text not null,
  status text not null,
  evidence text[] not null,
  recommendation text not null,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id bigserial primary key,
  run_id text not null references runs(id) on delete cascade,
  title text not null,
  summary text not null,
  breach_path text[] not null,
  recommendations text[] not null,
  generated_by text not null,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_runs_project_created_at
  on runs(project_id, created_at desc);

create index if not exists idx_trace_events_run_index
  on trace_events(run_id, event_index);

create index if not exists idx_findings_run
  on findings(run_id);
