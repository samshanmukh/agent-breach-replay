import { NextResponse } from "next/server";
import { buildLocalIncidentReport } from "@/lib/reporting";
import { findSimilarIncidents } from "@/lib/retrieval";
import { detectSecurityFindings } from "@/packages/detectors";
import { assertSecurityTrace, type SecurityTrace } from "@/packages/trace-schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const trace = assertSecurityTrace((await request.json()) as SecurityTrace);
  const findings = detectSecurityFindings(trace);
  const report = buildLocalIncidentReport(trace, findings);
  const incidents = await findSimilarIncidents(trace, findings, report);

  return NextResponse.json({ incidents });
}
