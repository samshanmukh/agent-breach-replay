import type { SecurityFinding, SecurityTrace } from "@/packages/trace-schema";

export type IncidentReport = {
  title: string;
  summary: string;
  breachPath: string[];
  findings: SecurityFinding[];
  recommendations: string[];
  generatedBy: "local-rules" | "openai";
};

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildLocalIncidentReport(
  trace: SecurityTrace,
  findings: SecurityFinding[],
): IncidentReport {
  const highestFinding =
    findings.find((finding) => finding.severity === "critical") ??
    findings.find((finding) => finding.severity === "high") ??
    findings[0];

  const breachPath = trace.events
    .filter(
      (event) =>
        event.trust === "untrusted" ||
        event.targetClass === "protected" ||
        event.targetClass === "external" ||
        event.violation ||
        event.decision === "blocked" ||
        event.decision === "approval_required",
    )
    .map((event) => `${event.id}: ${event.title}`);

  const recommendations = Array.from(
    new Set(findings.map((finding) => finding.recommendation)),
  );

  return {
    title: highestFinding
      ? `${titleCase(highestFinding.type)} in ${trace.scenarioName}`
      : `Security Replay for ${trace.scenarioName}`,
    summary:
      findings.length > 0
        ? `${trace.scenarioName} produced ${findings.length} security finding(s). The trace was captured in ${trace.captureMode} mode and evaluated from explicit source, influence, tool, and policy events.`
        : `${trace.scenarioName} did not produce security findings in the current detector set.`,
    breachPath,
    findings,
    recommendations,
    generatedBy: "local-rules",
  };
}

export async function buildOpenAIIncidentReport(
  trace: SecurityTrace,
  findings: SecurityFinding[],
): Promise<IncidentReport> {
  if (!process.env.OPENAI_API_KEY) {
    return buildLocalIncidentReport(trace, findings);
  }

  const prompt = {
    instruction:
      "Generate a concise security incident report from this metadata-only AI-agent security trace. Ground every claim in event IDs. Do not infer private model reasoning.",
    trace,
    findings,
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: JSON.stringify(prompt),
    }),
  });

  if (!response.ok) {
    return buildLocalIncidentReport(trace, findings);
  }

  const data = (await response.json()) as {
    output_text?: string;
  };
  const fallback = buildLocalIncidentReport(trace, findings);

  return {
    ...fallback,
    summary: data.output_text ?? fallback.summary,
    generatedBy: "openai",
  };
}
