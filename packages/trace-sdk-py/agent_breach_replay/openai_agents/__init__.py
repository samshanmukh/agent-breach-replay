#!/usr/bin/env python3
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal

SpanKind = Literal[
    "AGENT",
    "CHAIN",
    "GUARDRAIL",
    "LLM",
    "TOOL",
    "AUDIO",
    "USER",
]

REDACTED = "__REDACTED__"


@dataclass
class TraceConfig:
    hide_inputs: bool = False
    hide_outputs: bool = False
    hide_input_audio: bool = False
    hide_output_audio: bool = False
    base64_audio_max_length: int = 32000

    def mask_attributes(self, attributes: dict[str, Any]) -> dict[str, Any]:
        masked = dict(attributes)
        if self.hide_inputs:
            for key in list(masked):
                if key.startswith("input.") or key.startswith("llm.input_messages."):
                    masked[key] = REDACTED
        if self.hide_outputs:
            for key in list(masked):
                if key.startswith("output.") or key.startswith("llm.output_messages."):
                    masked[key] = REDACTED
        if self.hide_input_audio:
            for key in (
                "input.audio.url",
                "input.audio.mime_type",
                "input.audio.transcript",
            ):
                if key in masked:
                    masked[key] = REDACTED
        if self.hide_output_audio:
            for key in (
                "output.audio.url",
                "output.audio.mime_type",
                "output.audio.transcript",
            ):
                if key in masked:
                    masked[key] = REDACTED
        return masked

    def truncate_audio_data_uri(self, value: str) -> str:
        prefix = "data:audio/"
        if not value.startswith(prefix):
            return value
        marker = ";base64,"
        idx = value.find(marker)
        if idx == -1:
            return value
        head = value[: idx + len(marker)]
        payload = value[idx + len(marker) :]
        if len(payload) <= self.base64_audio_max_length:
            return value
        return head + payload[: self.base64_audio_max_length]


@dataclass
class CompletedSpan:
    span_id: str
    trace_id: str
    name: str
    kind: SpanKind
    parent_id: str | None = None
    started_at: str | None = None
    ended_at: str | None = None
    status: Literal["ok", "error"] = "ok"
    status_message: str | None = None
    attributes: dict[str, Any] = field(default_factory=dict)


@dataclass
class CompletedTrace:
    trace_id: str
    name: str
    spans: list[CompletedSpan] = field(default_factory=list)


class MemorySpanExporter:
    def __init__(self, trace_config: TraceConfig | None = None) -> None:
        self.trace_config = trace_config or TraceConfig()
        self.traces: dict[str, CompletedTrace] = {}

    def start_trace(self, trace_id: str, name: str) -> None:
        self.traces.setdefault(trace_id, CompletedTrace(trace_id=trace_id, name=name))

    def end_trace(self, trace_id: str) -> None:
        return

    def start_span(
        self,
        *,
        span_id: str,
        trace_id: str,
        name: str,
        kind: SpanKind,
        parent_id: str | None = None,
        started_at: str | None = None,
        attributes: dict[str, Any] | None = None,
    ) -> None:
        trace = self.traces.setdefault(trace_id, CompletedTrace(trace_id=trace_id, name=trace_id))
        trace.spans.append(
            CompletedSpan(
                span_id=span_id,
                trace_id=trace_id,
                parent_id=parent_id,
                name=name,
                kind=kind,
                started_at=started_at,
                attributes=self.trace_config.mask_attributes(attributes or {}),
            )
        )

    def end_span(
        self,
        *,
        span_id: str,
        ended_at: str | None = None,
        status: Literal["ok", "error"] = "ok",
        status_message: str | None = None,
        attributes: dict[str, Any] | None = None,
    ) -> None:
        for trace in self.traces.values():
            for span in trace.spans:
                if span.span_id != span_id:
                    continue
                span.ended_at = ended_at
                span.status = status
                span.status_message = status_message
                span.attributes.update(
                    self.trace_config.mask_attributes(attributes or {})
                )
                return


class AgentBreachTracingProcessor:
    def __init__(self, trace_config: TraceConfig | None = None) -> None:
        self.enabled = True
        self.trace_config = trace_config or TraceConfig()
        self.exporter = MemorySpanExporter(self.trace_config)
        self.root_span_ids: dict[str, str] = {}
        self.reverse_handoffs: dict[str, str] = {}

    def on_trace_start(self, trace: dict[str, Any]) -> None:
        if not self.enabled:
            return
        trace_id = trace["trace_id"]
        root_span_id = f"root_{trace_id}"
        self.root_span_ids[trace_id] = root_span_id
        self.exporter.start_trace(trace_id, trace.get("name", trace_id))
        self.exporter.start_span(
            span_id=root_span_id,
            trace_id=trace_id,
            name=trace.get("name", trace_id),
            kind="AGENT",
            attributes={
                "openinference.span.kind": "AGENT",
                "llm.system": "openai",
            },
        )

    def on_trace_end(self, trace: dict[str, Any]) -> None:
        trace_id = trace["trace_id"]
        root_span_id = self.root_span_ids.pop(trace_id, None)
        if root_span_id:
            self.exporter.end_span(span_id=root_span_id, status="ok")
        self.exporter.end_trace(trace_id)

    def on_span_start(self, span: dict[str, Any]) -> None:
        if not self.enabled:
            return
        span_data = span.get("span_data", {})
        span_type = span_data.get("type", "custom")
        kind = self._span_kind(span_type)
        self.exporter.start_span(
            span_id=span["span_id"],
            trace_id=span["trace_id"],
            parent_id=span.get("parent_id") or self.root_span_ids.get(span["trace_id"]),
            name=span_data.get("name", span_type),
            kind=kind,
            started_at=span.get("started_at"),
            attributes={
                "openinference.span.kind": kind,
                "llm.system": "openai",
            },
        )

    def on_span_end(self, span: dict[str, Any]) -> None:
        span_data = span.get("span_data", {})
        span_type = span_data.get("type", "custom")
        attributes: dict[str, Any] = {}

        if span_type == "function":
            attributes["tool.name"] = span_data.get("name", "")
            if span_data.get("input") is not None:
                attributes["input.value"] = json.dumps(span_data["input"])
                attributes["input.mime_type"] = "application/json"
            if span_data.get("output") is not None:
                attributes["output.value"] = json.dumps(span_data["output"])
                attributes["output.mime_type"] = "application/json"
        elif span_type == "guardrail":
            attributes["tool.name"] = span_data.get("name", "")
            attributes["guardrail.triggered"] = bool(span_data.get("triggered"))
        elif span_type == "handoff":
            to_agent = span_data.get("to_agent")
            from_agent = span_data.get("from_agent")
            if to_agent:
                attributes["tool.name"] = f"handoff_to_{to_agent}"
            if from_agent and to_agent:
                self.reverse_handoffs[f"{to_agent}:{span['trace_id']}"] = from_agent
        elif span_type == "agent":
            attributes["graph.node.id"] = span_data.get("name", "")
            parent = self.reverse_handoffs.get(
                f"{span_data.get('name')}:{span['trace_id']}"
            )
            if parent:
                attributes["graph.node.parent_id"] = parent
        elif span_type in {"generation", "response"}:
            if span_data.get("model"):
                attributes["llm.model_name"] = span_data["model"]
            usage = span_data.get("usage") or {}
            if usage.get("input_tokens") is not None:
                attributes["llm.token_count.prompt"] = usage["input_tokens"]
            if usage.get("output_tokens") is not None:
                attributes["llm.token_count.completion"] = usage["output_tokens"]

        self.exporter.end_span(
            span_id=span["span_id"],
            ended_at=span.get("ended_at"),
            status="error" if span.get("error") else "ok",
            status_message=(span.get("error") or {}).get("message"),
            attributes=attributes,
        )

    def _span_kind(self, span_type: str) -> SpanKind:
        if span_type == "agent":
            return "AGENT"
        if span_type in {"generation", "response"}:
            return "LLM"
        if span_type in {"function", "handoff", "mcp_tools"}:
            return "TOOL"
        if span_type == "guardrail":
            return "GUARDRAIL"
        return "CHAIN"


class OpenAIAgentsInstrumentor:
    def __init__(
        self,
        *,
        trace_config: TraceConfig | None = None,
        exclusive_processor: bool = True,
    ) -> None:
        self.trace_config = trace_config
        self.exclusive_processor = exclusive_processor
        self.processor = AgentBreachTracingProcessor(trace_config)
        self._patched = False

    def instrument(self, agents_module: Any) -> None:
        processor = self.processor
        if self.exclusive_processor:
            agents_module.set_trace_processors(
                [
                    _PythonTracingProcessorAdapter(processor),
                ]
            )
        else:
            agents_module.add_trace_processor(
                _PythonTracingProcessorAdapter(processor)
            )
        self._patched = True

    def uninstrument(self, agents_module: Any) -> None:
        if self.exclusive_processor:
            agents_module.set_trace_processors([])
        self._patched = False


class _PythonTracingProcessorAdapter:
    def __init__(self, processor: AgentBreachTracingProcessor) -> None:
        self.processor = processor

    def on_trace_start(self, trace: Any) -> None:
        self.processor.on_trace_start(
            {
                "trace_id": getattr(trace, "trace_id", trace.get("trace_id")),
                "name": getattr(trace, "name", trace.get("name")),
            }
        )

    def on_trace_end(self, trace: Any) -> None:
        self.processor.on_trace_end(
            {
                "trace_id": getattr(trace, "trace_id", trace.get("trace_id")),
                "name": getattr(trace, "name", trace.get("name")),
            }
        )

    def on_span_start(self, span: Any) -> None:
        self.processor.on_span_start(_span_to_dict(span))

    def on_span_end(self, span: Any) -> None:
        self.processor.on_span_end(_span_to_dict(span))


def _span_to_dict(span: Any) -> dict[str, Any]:
    if isinstance(span, dict):
        return span
    span_data = getattr(span, "span_data", None)
    return {
        "span_id": getattr(span, "span_id", None),
        "trace_id": getattr(span, "trace_id", None),
        "parent_id": getattr(span, "parent_id", None),
        "started_at": getattr(span, "started_at", None),
        "ended_at": getattr(span, "ended_at", None),
        "error": getattr(span, "error", None),
        "span_data": {
            "type": getattr(span_data, "type", None),
            "name": getattr(span_data, "name", None),
            "input": getattr(span_data, "input", None),
            "output": getattr(span_data, "output", None),
            "triggered": getattr(span_data, "triggered", None),
            "from_agent": getattr(span_data, "from_agent", None),
            "to_agent": getattr(span_data, "to_agent", None),
            "model": getattr(span_data, "model", None),
            "usage": getattr(span_data, "usage", None),
        },
    }
