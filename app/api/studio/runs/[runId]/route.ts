import { NextResponse } from "next/server";
import { appendAudit } from "@/lib/security-controls";
import { requireStudioActor } from "@/lib/studio-auth";
import { getRun } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const actor = await requireStudioActor();
    const { runId } = await params;
    const run = await getRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    appendAudit({
      projectId: run.trace.projectId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "run.viewed",
      resourceType: "run",
      resourceId: runId,
      metadata: {},
    });
    return NextResponse.json(run);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
