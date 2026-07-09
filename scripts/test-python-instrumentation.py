#!/usr/bin/env python3
from __future__ import annotations

from agent_breach_replay.openai_agents import (
    AgentBreachTracingProcessor,
    OpenAIAgentsInstrumentor,
    TraceConfig,
)


class MockAgentsModule:
    def __init__(self) -> None:
        self.processors: list[object] = []

    def set_trace_processors(self, processors: list[object]) -> None:
        self.processors = list(processors)

    def add_trace_processor(self, processor: object) -> None:
        self.processors.append(processor)


def test_local_processor_emits_tool_and_guardrail_spans() -> None:
    processor = AgentBreachTracingProcessor(TraceConfig())
    processor.on_trace_start({"trace_id": "trace_py", "name": "Vendor Email Assistant"})
    processor.on_span_start(
        {
            "span_id": "span_root",
            "trace_id": "trace_py",
            "parent_id": None,
            "started_at": "2026-07-08T12:00:00.000Z",
            "span_data": {"type": "agent", "name": "Vendor Email Assistant"},
        }
    )
    processor.on_span_start(
        {
            "span_id": "span_email",
            "trace_id": "trace_py",
            "parent_id": "span_root",
            "started_at": "2026-07-08T12:00:01.000Z",
            "span_data": {"type": "function", "name": "email.read"},
        }
    )
    processor.on_span_end(
        {
            "span_id": "span_email",
            "trace_id": "trace_py",
            "parent_id": "span_root",
            "ended_at": "2026-07-08T12:00:02.000Z",
            "span_data": {
                "type": "function",
                "name": "email.read",
                "input": {"mailbox": "inbox"},
                "output": {"from": "vendor@example.net"},
            },
        }
    )
    processor.on_span_end(
        {
            "span_id": "span_root",
            "trace_id": "trace_py",
            "parent_id": None,
            "ended_at": "2026-07-08T12:00:03.000Z",
            "span_data": {"type": "agent", "name": "Vendor Email Assistant"},
        }
    )
    processor.on_trace_end({"trace_id": "trace_py", "name": "Vendor Email Assistant"})

    trace = processor.exporter.traces["trace_py"]
    kinds = {span.kind for span in trace.spans}
    assert "AGENT" in kinds
    assert "TOOL" in kinds
    tool_span = next(span for span in trace.spans if span.kind == "TOOL")
    assert tool_span.attributes["tool.name"] == "email.read"


def test_instrumentor_registers_exclusive_processor() -> None:
    agents = MockAgentsModule()
    instrumentor = OpenAIAgentsInstrumentor(exclusive_processor=True)
    instrumentor.instrument(agents)
    assert len(agents.processors) == 1


def main() -> None:
    test_local_processor_emits_tool_and_guardrail_spans()
    test_instrumentor_registers_exclusive_processor()
    print("python instrumentation tests passed")


if __name__ == "__main__":
    main()
