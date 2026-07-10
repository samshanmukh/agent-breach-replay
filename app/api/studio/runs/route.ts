import { NextResponse } from "next/server";
import { appendAudit } from "@/lib/security-controls";
import { requireStudioActor } from "@/lib/studio-auth";
import { listRuns } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireStudioActor();
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const runs = await listRuns(projectId);
    appendAudit({
      projectId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "runs.listed",
      resourceType: "run",
      metadata: { count: runs.length },
    });
    return NextResponse.json({ runs });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
