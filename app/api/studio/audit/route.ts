import { NextResponse } from "next/server";
import { listAudit } from "@/lib/security-controls";
import { requireStudioActor } from "@/lib/studio-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireStudioActor();
    const projectId =
      new URL(request.url).searchParams.get("projectId") ?? undefined;
    return NextResponse.json({ audit: listAudit(projectId) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
