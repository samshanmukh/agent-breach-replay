import { NextResponse } from "next/server";
import { buildOpenAIIncidentReport } from "@/lib/reporting";
import { detectSecurityFindings } from "@/packages/detectors";
import { assertSecurityTrace, type SecurityTrace } from "@/packages/trace-schema";

export async function POST(request: Request) {
  const trace = assertSecurityTrace((await request.json()) as SecurityTrace);
  const findings = detectSecurityFindings(trace);
  const report = await buildOpenAIIncidentReport(trace, findings);

  return NextResponse.json(report);
}
