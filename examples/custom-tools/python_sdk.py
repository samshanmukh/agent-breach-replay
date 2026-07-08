from agent_breach_replay import create_security_trace

trace = create_security_trace(
    project_id="demo",
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

print(trace.to_replay())
