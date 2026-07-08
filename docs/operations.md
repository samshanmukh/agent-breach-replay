# Operations

## Health Check

```bash
curl http://localhost:3000/api/health
```

The health response reports:

- database configuration/reachability
- API key configuration
- OpenAI configuration
- Moss configuration

## Trace Ingestion

```bash
curl -X POST http://localhost:3000/api/traces \
  -H "Content-Type: application/json" \
  -H "x-agent-breach-key: $AGENT_BREACH_API_KEY" \
  --data @trace.json
```

## Local Development

Local development can run without `DATABASE_URL`. In that case, traces are stored
in process memory and disappear when the server restarts.

Production must use Postgres.

## Retention

Retention controls are not implemented yet. Before production customer data,
add scheduled deletion by project and capture mode.

Recommended defaults:

- metadata-only traces: 90 days
- redacted-preview traces: 30 days
- full-debug traces: 7 days

