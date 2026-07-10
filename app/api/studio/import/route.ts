import { NextResponse } from "next/server";
import { findSimilarIncidents } from "@/lib/retrieval";
import { requireStudioActor } from "@/lib/studio-auth";
import { saveTrace } from "@/lib/store";
import { securityTraceSchema } from "@/lib/validation";
import {
  normalizeInstrumentedSpans,
  normalizeOpenAITrace,
  type OpenAITraceLike,
} from "@/packages/adapters/openai-agents";
import type { CompletedSpan } from "@/packages/instrumentation-openai-agents/types";
import { assertSecurityTrace } from "@/packages/trace-schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireStudioActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    securityTrace?: unknown;
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

  const candidate = body.securityTrace
    ? body.securityTrace
    : body.instrumented
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

  const parsed = securityTraceSchema.safeParse(candidate);
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
  return NextResponse.json({ ...stored, similarIncidents }, { status: 201 });
}
