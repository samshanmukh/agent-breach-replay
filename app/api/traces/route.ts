import { NextResponse } from "next/server";
import { assertApiKey } from "@/lib/env";
import { findSimilarIncidents } from "@/lib/retrieval";
import { saveTrace } from "@/lib/store";
import { securityTraceSchema } from "@/lib/validation";
import { assertSecurityTrace } from "@/packages/trace-schema";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    assertApiKey(request);
  } catch {
    return unauthorized();
  }

  const parsed = securityTraceSchema.safeParse(await request.json());
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
    },
    { status: 201 },
  );
}
