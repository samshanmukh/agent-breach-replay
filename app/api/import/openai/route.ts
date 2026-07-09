import { NextResponse } from "next/server";
import { assertApiKey } from "@/lib/env";
import { findSimilarIncidents } from "@/lib/retrieval";
import { saveTrace } from "@/lib/store";
import { securityTraceSchema } from "@/lib/validation";
import {
  normalizeInstrumentedSpans,
  normalizeOpenAITrace,
  type OpenAITraceLike,
} from "@/packages/adapters/openai-agents";
import { assertSecurityTrace } from "@/packages/trace-schema";
import type { CompletedSpan } from "@/packages/instrumentation-openai-agents/types";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const persist = url.searchParams.get("persist") !== "false";

  const body = (await request.json()) as {
    trace?: OpenAITraceLike;
    instrumented?: {
      traceId: string;
      workflowName: string;
      spans: CompletedSpan[];
      createdAt?: string;
    };
    projectId?: string;
    userTask?: string;
    riskSummary?: string;
  };

  const normalized = body.instrumented
    ? normalizeInstrumentedSpans(body.instrumented, {
        projectId: body.projectId ?? "imported",
        userTask: body.userTask ?? "Imported OpenAI agent run",
        riskSummary: body.riskSummary,
      })
    : normalizeOpenAITrace(body.trace as OpenAITraceLike, {
        projectId: body.projectId ?? "imported",
        userTask: body.userTask ?? "Imported OpenAI agent run",
        riskSummary: body.riskSummary,
      });

  if (!persist) {
    return NextResponse.json(normalized);
  }

  try {
    assertApiKey(request);
  } catch {
    return unauthorized();
  }

  const parsed = securityTraceSchema.safeParse(normalized);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid trace", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const trace = assertSecurityTrace(parsed.data);
  const stored = await saveTrace(trace);
  const similarIncidents = await findSimilarIncidents(
    stored.trace,
    stored.findings,
    stored.report,
  );

  return NextResponse.json(
    {
      runId: stored.trace.runId,
      findings: stored.findings,
      report: stored.report,
      similarIncidents,
      trace: stored.trace,
    },
    { status: 201 },
  );
}
