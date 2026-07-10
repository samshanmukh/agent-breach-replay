import { NextResponse } from "next/server";
import {
  appendAudit,
  createApiKey,
  getProjectSettings,
  listApiKeys,
  revokeApiKey,
  updateProjectSettings,
} from "@/lib/security-controls";
import { canAdminister, requireStudioActor } from "@/lib/studio-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireStudioActor();
    const projectId =
      new URL(request.url).searchParams.get("projectId") ?? "local-demo";
    return NextResponse.json({
      settings: getProjectSettings(projectId),
      apiKeys: listApiKeys(projectId),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireStudioActor();
    if (!canAdminister(actor)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const projectId = String(body.projectId ?? "local-demo");

    if (body.action === "create_key") {
      const result = createApiKey(
        projectId,
        String(body.name ?? "Ingestion key"),
        Array.isArray(body.scopes) ? body.scopes : ["ingest", "read"],
        actor,
      );
      return NextResponse.json(
        { apiKey: { ...result.record, hash: undefined }, secret: result.secret },
        { status: 201 },
      );
    }

    if (body.action === "revoke_key") {
      const apiKey = revokeApiKey(String(body.keyId), actor);
      return apiKey
        ? NextResponse.json({ apiKey })
        : NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    const settings = updateProjectSettings(projectId, body.settings ?? {});
    appendAudit({
      projectId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "settings.updated",
      resourceType: "project_settings",
      resourceId: projectId,
      metadata: body.settings ?? {},
    });
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
