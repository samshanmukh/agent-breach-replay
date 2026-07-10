import { NextResponse } from "next/server";
import { createApproval, listApprovals } from "@/lib/security-controls";
import { requireStudioActor } from "@/lib/studio-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireStudioActor();
    const projectId =
      new URL(request.url).searchParams.get("projectId") ?? undefined;
    return NextResponse.json({ approvals: listApprovals(projectId) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireStudioActor();
    const body = await request.json();
    const approval = createApproval({
      projectId: String(body.projectId ?? "local-demo"),
      runId: String(body.runId),
      eventId: String(body.eventId),
      status: "pending",
      requestedAction: String(body.requestedAction),
      reason: String(body.reason),
      evidence: Array.isArray(body.evidence) ? body.evidence.map(String) : [],
    });
    return NextResponse.json({ approval }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
