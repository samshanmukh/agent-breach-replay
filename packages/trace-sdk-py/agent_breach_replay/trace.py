from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

import httpx

TrustLevel = Literal["trusted", "untrusted", "protected", "external", "neutral"]
PolicyDecision = Literal["allowed", "blocked", "approval_required", "observed"]
Actor = Literal["user", "agent", "tool", "policy", "detector"]
CaptureMode = Literal["metadata-only", "redacted-preview", "full-debug"]
ViolationType = Literal[
    "exfiltration",
    "untrusted_to_action",
    "confused_deputy",
    "destructive_write",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class SecurityTraceRecorder:
    project_id: str
    agent_name: str
    scenario_name: str
    user_task: str
    risk_summary: str
    capture_mode: CaptureMode = "metadata-only"
    run_id: str = field(default_factory=lambda: f"run_{int(datetime.now().timestamp())}")
    started_at: str = field(default_factory=_now_iso)
    events: list[dict[str, Any]] = field(default_factory=list)

    def _event(self, event: dict[str, Any]) -> dict[str, Any]:
        event.setdefault("runId", self.run_id)
        event.setdefault("timestamp", _now_iso())
        self.events.append(event)
        return event

    def source(
        self,
        event_id: str,
        *,
        kind: str,
        trust: TrustLevel,
        label: str,
        summary: str | None = None,
        details: str | None = None,
    ) -> dict[str, Any]:
        return self._event(
            {
                "id": event_id,
                "title": label,
                "actor": "tool",
                "trust": trust,
                "summary": summary or f"{kind} source read",
                "details": details
                or "Source captured with security metadata only; raw content omitted.",
                "sourceIds": [event_id],
                "targetClass": trust,
                "decision": "observed",
            }
        )

    def tool(
        self,
        event_id: str,
        *,
        name: str,
        target: str,
        target_class: TrustLevel,
        summary: str,
        details: str,
        influenced_by: list[str] | None = None,
        decision: PolicyDecision = "allowed",
    ) -> dict[str, Any]:
        return self._event(
            {
                "id": event_id,
                "title": f"{name} requested",
                "actor": "tool",
                "trust": target_class,
                "summary": summary,
                "details": details,
                "toolName": name,
                "target": target,
                "targetClass": target_class,
                "destinationClass": target_class,
                "influencedBy": influenced_by or [],
                "decision": decision,
            }
        )

    def step(
        self,
        title: str,
        *,
        summary: str,
        details: str,
        actor: Actor = "agent",
        trust: TrustLevel = "neutral",
        influenced_by: list[str] | None = None,
    ) -> dict[str, Any]:
        return self._event(
            {
                "id": f"step_{len(self.events) + 1:04d}",
                "title": title,
                "actor": actor,
                "trust": trust,
                "summary": summary,
                "details": details,
                "influencedBy": influenced_by or [],
                "decision": "observed",
            }
        )

    def policy_decision(
        self,
        action_id: str,
        *,
        decision: PolicyDecision,
        reason: str,
        influenced_by: list[str] | None = None,
    ) -> dict[str, Any]:
        return self._event(
            {
                "id": f"{action_id}_policy",
                "title": "Policy decision",
                "actor": "policy",
                "trust": "neutral",
                "summary": reason,
                "details": reason,
                "influencedBy": influenced_by or [],
                "decision": decision,
            }
        )

    def violation(
        self,
        *,
        violation_type: ViolationType,
        severity_summary: str,
        details: str,
        influenced_by: list[str] | None = None,
    ) -> dict[str, Any]:
        return self._event(
            {
                "id": f"violation_{len(self.events) + 1:04d}",
                "title": f"{violation_type.replace('_', ' ')} detected",
                "actor": "detector",
                "trust": "neutral",
                "summary": severity_summary,
                "details": details,
                "influencedBy": influenced_by or [],
                "decision": "observed",
                "violation": violation_type,
            }
        )

    def to_replay(self) -> dict[str, Any]:
        return {
            "schemaVersion": "0.1",
            "runId": self.run_id,
            "projectId": self.project_id,
            "agentName": self.agent_name,
            "scenarioName": self.scenario_name,
            "captureMode": self.capture_mode,
            "startedAt": self.started_at,
            "userTask": self.user_task,
            "riskSummary": self.risk_summary,
            "events": self.events,
        }

    async def submit(self, endpoint: str, api_key: str | None = None) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["x-agent-breach-key"] = api_key

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                endpoint.rstrip("/") + "/api/traces",
                json=self.to_replay(),
                headers=headers,
            )
            response.raise_for_status()
            return response.json()

    def submit_sync(self, endpoint: str, api_key: str | None = None) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["x-agent-breach-key"] = api_key

        with httpx.Client(timeout=10) as client:
            response = client.post(
                endpoint.rstrip("/") + "/api/traces",
                json=self.to_replay(),
                headers=headers,
            )
            response.raise_for_status()
            return response.json()


def create_security_trace(**kwargs: Any) -> SecurityTraceRecorder:
    return SecurityTraceRecorder(**kwargs)
