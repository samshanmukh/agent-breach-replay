import type { IncidentReport } from "@/lib/reporting";
import { searchSimilarIncidentsInMoss } from "@/lib/moss";
import type { SecurityFinding, SecurityTrace } from "@/packages/trace-schema";

export type SimilarIncident = {
  id: string;
  title: string;
  reason: string;
  score: number;
  source: "local" | "moss";
};

type IncidentDocument = {
  id: string;
  title: string;
  text: string;
  tags: string[];
};

const localIncidentIndex: IncidentDocument[] = [
  {
    id: "pattern_untrusted_external_send",
    title: "Untrusted content caused external send",
    text: "External email or webpage influenced an agent to call email.send, http.post, webhook, or another external action.",
    tags: ["untrusted_to_action", "external", "email.send"],
  },
  {
    id: "pattern_protected_data_exfiltration",
    title: "Protected data reached external destination",
    text: "Protected files, secrets, customer records, or internal documents flowed into an external action.",
    tags: ["exfiltration", "protected", "external"],
  },
  {
    id: "pattern_confused_deputy_file_read",
    title: "Agent permission used as confused deputy",
    text: "The agent used its own permission to read protected data because untrusted content requested it.",
    tags: ["confused_deputy", "fs.read", "protected"],
  },
];

function tokenize(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_.-]+/)
      .filter(Boolean),
  );
}

function scoreDocument(queryTokens: Set<string>, document: IncidentDocument) {
  const docTokens = tokenize(`${document.title} ${document.text} ${document.tags.join(" ")}`);
  let score = 0;

  for (const token of queryTokens) {
    if (docTokens.has(token)) score += 1;
  }

  return score / Math.max(docTokens.size, 1);
}

export function buildIncidentSearchText(
  trace: SecurityTrace,
  findings: SecurityFinding[],
  report?: IncidentReport,
) {
  return [
    trace.scenarioName,
    trace.riskSummary,
    trace.events.map((event) => `${event.toolName ?? event.actor} ${event.target ?? ""} ${event.trust}`).join(" "),
    findings.map((finding) => `${finding.type} ${finding.status}`).join(" "),
    report?.summary ?? "",
  ].join(" ");
}

export async function findSimilarIncidents(
  trace: SecurityTrace,
  findings: SecurityFinding[],
  report?: IncidentReport,
): Promise<SimilarIncident[]> {
  const query = buildIncidentSearchText(trace, findings, report);

  if (process.env.MOSS_PROJECT_ID && process.env.MOSS_PROJECT_KEY) {
    const mossResults = await searchSimilarIncidentsInMoss(query);
    if (mossResults && mossResults.length > 0) {
      return mossResults;
    }
  }

  return localSimilarIncidents(query, "local");
}

function localSimilarIncidents(query: string, source: SimilarIncident["source"]) {
  const queryTokens = tokenize(query);

  return localIncidentIndex
    .map((document) => ({
      id: document.id,
      title: document.title,
      reason: document.text,
      score: scoreDocument(queryTokens, document),
      source,
    }))
    .filter((incident) => incident.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
