import { NextResponse } from "next/server";
import { decideApproval } from "@/lib/security-controls";
import { canApprove, requireStudioActor } from "@/lib/studio-auth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  try {
    const actor = await requireStudioActor();
    if (!canApprove(actor)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { approvalId } = await params;
    const body = await request.json();
    if (body.decision !== "approved" && body.decision !== "denied") {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }
    const approval = decideApproval(
      approvalId,
      body.decision,
      actor,
      body.note ? String(body.note) : undefined,
    );
    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }
    return NextResponse.json({ approval });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
