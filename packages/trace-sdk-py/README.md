# agent-breach-replay

Python SDK for capturing privacy-first security traces from tool-using AI
agents.

## Install

```bash
pip install agent-breach-replay
```

## Usage

```python
from agent_breach_replay import create_security_trace

trace = create_security_trace(
    project_id="prod",
    agent_name="Vendor Email Assistant",
    scenario_name="Vendor Email Assistant",
    user_task="Summarize vendor emails.",
    risk_summary="Untrusted email may influence privileged tools.",
)

trace.source(
    "email_42",
    kind="email",
    trust="untrusted",
    label="External vendor email",
)

trace.tool(
    "read_secret",
    name="fs.read",
    target="secret.txt",
    target_class="protected",
    summary="Protected file requested",
    details="Request was influenced by untrusted email.",
    influenced_by=["email_42"],
)

trace.submit_sync(
    "https://your-agent-breach-app.vercel.app",
    api_key="your-ingestion-key",
)
```

## Privacy

The SDK is metadata-first. Do not send raw private content unless your capture
mode and retention policy explicitly allow it.

