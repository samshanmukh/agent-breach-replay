# Privacy Model

Agent Breach Replay is privacy-first by default.

Product promise:

> Show the breach path without collecting the breached data.

## Capture Modes

### Metadata Only

Default mode. Stores trust labels, tool names, target classes, decisions,
influence links, and finding evidence. It does not require raw emails, files,
secrets, prompts, or customer records.

### Redacted Preview

Optional mode for debugging. Stores short previews after local redaction.

### Full Debug

Explicit opt-in mode for temporary investigations. This should include retention
controls and clear UI warnings before production release.

## Design Rules

- Redact locally before upload.
- Hash sensitive values when equality checks are needed.
- Keep raw private data out of detector requirements.
- Ground findings in event IDs, not hidden model reasoning.
- Make unknown trust explicit rather than silently safe.

