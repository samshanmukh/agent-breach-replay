import { NextResponse } from "next/server";
import {
  appendAudit,
  getPolicy,
  simulatePolicy,
  syncApprovalsFromTrace,
} from "@/lib/security-controls";
import { requireStudioActor } from "@/lib/studio-auth";
import { getRun } from "@/lib/store";
import { securityTraceSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireStudioActor();
    const body = await request.json();
    const stored = body.runId ? await getRun(String(body.runId)) : null;
    const parsed = body.securityTrace
      ? securityTraceSchema.safeParse(body.securityTrace)
      : null;
    const trace = stored?.trace ?? (parsed?.success ? parsed.data : null);
    if (!trace) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    const rules = Array.isArray(body.rules)
      ? body.rules
      : getPolicy(trace.projectId).rules;
    const simulation = simulatePolicy(trace, rules);
    syncApprovalsFromTrace(simulation.trace);
    appendAudit({
      projectId: trace.projectId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "policy.simulated",
      resourceType: "run",
      resourceId: trace.runId,
      metadata: {
        changeCount: simulation.changes.length,
        baselineFindings: simulation.baselineFindings.length,
        simulatedFindings: simulation.simulatedFindings.length,
      },
    });
    return NextResponse.json({ simulation });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
