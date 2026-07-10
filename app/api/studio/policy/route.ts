import { NextResponse } from "next/server";
import { appendAudit, getPolicy, savePolicy } from "@/lib/security-controls";
import { canAdminister, requireStudioActor } from "@/lib/studio-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireStudioActor();
    const projectId =
      new URL(request.url).searchParams.get("projectId") ?? "local-demo";
    return NextResponse.json({ policy: getPolicy(projectId) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireStudioActor();
    if (!canAdminister(actor)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const projectId = String(body.projectId ?? "local-demo");
    const current = getPolicy(projectId);
    const policy = savePolicy(projectId, {
      name: String(body.name ?? current.name),
      enabled: body.enabled ?? current.enabled,
      rules: Array.isArray(body.rules) ? body.rules : current.rules,
    });
    appendAudit({
      projectId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "policy.updated",
      resourceType: "policy",
      resourceId: policy.id,
      metadata: { version: policy.version, ruleCount: policy.rules.length },
    });
    return NextResponse.json({ policy });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
