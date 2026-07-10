import { NextResponse } from "next/server";
import { assertApiKey } from "@/lib/env";
import { buildOpenAIIncidentReport } from "@/lib/reporting";
import { detectSecurityFindings } from "@/packages/detectors";
import { assertSecurityTrace, type SecurityTrace } from "@/packages/trace-schema";

export async function POST(request: Request) {
  try {
    assertApiKey(request, "read");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const trace = assertSecurityTrace((await request.json()) as SecurityTrace);
  const findings = detectSecurityFindings(trace);
  const report = await buildOpenAIIncidentReport(trace, findings);

  return NextResponse.json(report);
}
