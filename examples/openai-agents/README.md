# OpenAI Agents end-to-end example

This example runs the locally built OpenAI Agents instrumentation through the
complete Agent Breach Replay pipeline:

```text
agent trace
  → OpenInference-compatible spans
  → security trace normalization
  → deterministic detectors
  → incident report
  → optional Studio persistence
```

## Simulated mode

Runs without an OpenAI key or the OpenAI Agents SDK:

```bash
npm run example:openai-agents
```

The deterministic scenario emits agent, LLM, tool, and guardrail spans, then
prints the finding and report summary.

## Persist into the Studio

Start the application and run:

```bash
npm run dev
npm run example:openai-agents:persist
```

Set `AGENT_BREACH_BASE_URL` if the app is not running at
`http://localhost:3000`.

## Optional live mode

Install `@openai/agents`, configure `OPENAI_API_KEY`, and run:

```bash
npm install @openai/agents
OPENAI_API_KEY=... npm run example:openai-agents:live
```

If the live SDK or key is unavailable, the command reports the reason and
falls back to the simulated scenario.

## Privacy

Inputs and outputs are hidden by default. Set either variable to `false` only
in a safe local environment:

```bash
OPENINFERENCE_HIDE_INPUTS=false
OPENINFERENCE_HIDE_OUTPUTS=false
```
