# Deployment Notes

Agent Breach Replay is currently built as a Next.js app with local fixtures,
service-ready adapters, and deterministic detector tests.

## Recommended v0.1 Deployment

- App: Vercel
- Database: Neon or Supabase Postgres
- Retrieval: Moss
- AI reports: OpenAI models
- SDK distribution: npm for TypeScript, PyPI for Python later

## Environment Variables

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
MOSS_PROJECT_ID=
MOSS_PROJECT_KEY=
MOSS_INDEX_NAME=agent-breach-incidents
DATABASE_URL=
AGENT_BREACH_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

All service integrations have local fallbacks today:

- OpenAI report generation falls back to deterministic local reports.
- Moss similar incident search uses `@moss-dev/moss` when credentials are
  configured, and falls back to a local incident index if Moss is unavailable.
- Postgres is not required until persistence is added.

## Database Setup

Create a managed Postgres database, set `DATABASE_URL`, then run the SQL in:

```text
migrations/001_initial.sql
```

The app can run without `DATABASE_URL` for local development, but production
should always use Postgres.

## Supabase Setup

This repo includes Supabase SSR helpers in `utils/supabase`.

Set:

```text
NEXT_PUBLIC_SUPABASE_URL=https://dkiigflqnuyuiwghxjqe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
```

For Vercel/serverless Postgres access, prefer Supabase's pooled Postgres
connection string for `DATABASE_URL`.

## Supabase Auth

The replay studio is protected by Supabase email/password auth.

Configure these Supabase Auth settings:

- Enable email/password signups or create users manually.
- Add the deployed site URL to allowed redirect URLs.
- Add `/auth/callback` as the auth callback path.

Machine ingestion still uses `AGENT_BREACH_API_KEY` through the
`x-agent-breach-key` header.

## API Key Protection

Set `AGENT_BREACH_API_KEY` in production. Clients must submit traces with:

```text
x-agent-breach-key: <your key>
```

If the key is not configured, API routes remain open for local development.

## Production API Routes

- `GET /api/health`
- `POST /api/traces`
- `GET /api/runs`
- `GET /api/runs/:runId`
- `POST /api/reports`
- `POST /api/similar-incidents`
- `POST /api/import/openai`

## Moss Setup

The app uses the Moss JavaScript SDK package `@moss-dev/moss`.

Required env vars:

```text
MOSS_PROJECT_ID=
MOSS_PROJECT_KEY=
MOSS_INDEX_NAME=agent-breach-incidents
```

When a trace is saved, the app indexes the incident report in Moss. Similar
incident search loads the configured index and queries it with hybrid search.
If Moss is unavailable, the app uses the local fallback index.

## Verification

```bash
npm test
npm run typecheck
npm run build
```
