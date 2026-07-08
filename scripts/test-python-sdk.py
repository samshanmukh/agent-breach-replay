from agent_breach_replay import create_security_trace


trace = create_security_trace(
    project_id="sdk-test",
    agent_name="SDK Test Agent",
    scenario_name="SDK Test",
    user_task="Test trace capture.",
    risk_summary="Validate SDK trace format.",
    run_id="sdk_test_run_py",
)

trace.source(
    "email_1",
    kind="email",
    trust="untrusted",
    label="External email",
)

trace.step(
    "Agent planned action",
    summary="Agent plan created",
    details="Plan influenced by email.",
    influenced_by=["email_1"],
)

trace.tool(
    "read_secret",
    name="fs.read",
    target="secret.txt",
    target_class="protected",
    summary="Read requested",
    details="Protected file read requested.",
    influenced_by=["email_1"],
)

trace.policy_decision(
    "read_secret",
    decision="blocked",
    reason="Untrusted influence cannot access protected file.",
    influenced_by=["email_1"],
)

trace.violation(
    violation_type="untrusted_to_action",
    severity_summary="Untrusted source influenced protected action.",
    details="Detector evidence from SDK test.",
    influenced_by=["email_1", "read_secret"],
)

replay = trace.to_replay()

assert replay["schemaVersion"] == "0.1"
assert len(replay["events"]) == 5
assert any(event.get("violation") == "untrusted_to_action" for event in replay["events"])

print("python sdk tests passed")
