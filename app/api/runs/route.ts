import { NextResponse } from "next/server";
import { assertApiKey } from "@/lib/env";
import { listRuns } from "@/lib/store";

export async function GET(request: Request) {
  try {
    assertApiKey(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const runs = await listRuns(projectId);

  return NextResponse.json({
    runs: runs.map((run) => ({
      runId: run.trace.runId,
      projectId: run.trace.projectId,
      agentName: run.trace.agentName,
      scenarioName: run.trace.scenarioName,
      captureMode: run.trace.captureMode,
      startedAt: run.trace.startedAt,
      findingCount: run.findings.length,
      highestSeverity: run.findings[0]?.severity ?? "none",
    })),
  });
}
