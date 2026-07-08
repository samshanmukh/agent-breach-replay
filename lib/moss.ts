import type { IncidentReport } from "@/lib/reporting";
import type { SimilarIncident } from "@/lib/retrieval";
import type { SecurityFinding, SecurityTrace } from "@/packages/trace-schema";

type MossDocument = {
  id: string;
  text: string;
  metadata?: Record<string, string>;
};

type MossResultDoc = {
  id: string;
  score: number;
  text?: string;
  metadata?: Record<string, string>;
};

type MossClientLike = {
  createIndex: (name: string, docs: MossDocument[]) => Promise<unknown>;
  getIndex: (name: string) => Promise<unknown>;
  addDocs: (
    name: string,
    docs: MossDocument[],
    options?: { upsert?: boolean },
  ) => Promise<unknown>;
  loadIndex: (
    name: string,
    options?: { autoRefresh?: boolean; pollingIntervalInSeconds?: number },
  ) => Promise<unknown>;
  query: (
    name: string,
    query: string,
    options?: { topK?: number; alpha?: number },
  ) => Promise<{ docs: MossResultDoc[] }>;
};

const DEFAULT_INDEX = "agent-breach-incidents";

let mossClientPromise: Promise<MossClientLike | null> | null = null;
const loadedIndexes = new Set<string>();

function mossConfigured() {
  return Boolean(process.env.MOSS_PROJECT_ID && process.env.MOSS_PROJECT_KEY);
}

async function getMossClient(): Promise<MossClientLike | null> {
  if (!mossConfigured()) return null;

  mossClientPromise ??= import("@moss-dev/moss")
    .then((module) => {
      const client = new module.MossClient(
        process.env.MOSS_PROJECT_ID!,
        process.env.MOSS_PROJECT_KEY!,
      );
      return client as MossClientLike;
    })
    .catch(() => null);

  return mossClientPromise;
}

async function ensureIndex(client: MossClientLike, indexName: string) {
  try {
    await client.getIndex(indexName);
  } catch {
    await client.createIndex(indexName, [
      {
        id: "seed_agent_breach_replay",
        text: "Agent Breach Replay indexes AI-agent security incidents, trace narratives, detector findings, and guardrail recommendations.",
        metadata: {
          source: "seed",
          type: "seed",
        },
      },
    ]);
  }
}

async function loadIndex(client: MossClientLike, indexName: string) {
  if (loadedIndexes.has(indexName)) return;
  await client.loadIndex(indexName, {
    autoRefresh: true,
    pollingIntervalInSeconds: 300,
  });
  loadedIndexes.add(indexName);
}

export function buildMossIncidentDocument(
  trace: SecurityTrace,
  findings: SecurityFinding[],
  report: IncidentReport,
): MossDocument {
  return {
    id: trace.runId,
    text: [
      report.title,
      report.summary,
      trace.riskSummary,
      report.breachPath.join("\n"),
      findings
        .map(
          (finding) =>
            `${finding.type} ${finding.status} ${finding.severity}: ${finding.recommendation}`,
        )
        .join("\n"),
    ].join("\n\n"),
    metadata: {
      runId: trace.runId,
      projectId: trace.projectId,
      agentName: trace.agentName,
      scenarioName: trace.scenarioName,
      captureMode: trace.captureMode,
      findingTypes: findings.map((finding) => finding.type).join(","),
    },
  };
}

export async function indexIncidentInMoss(
  trace: SecurityTrace,
  findings: SecurityFinding[],
  report: IncidentReport,
) {
  const client = await getMossClient();
  if (!client) return false;

  const indexName = process.env.MOSS_INDEX_NAME ?? DEFAULT_INDEX;
  const doc = buildMossIncidentDocument(trace, findings, report);

  try {
    await ensureIndex(client, indexName);
    await client.addDocs(indexName, [doc], { upsert: true });
    loadedIndexes.delete(indexName);
    return true;
  } catch {
    return false;
  }
}

export async function searchSimilarIncidentsInMoss(
  query: string,
): Promise<SimilarIncident[] | null> {
  const client = await getMossClient();
  if (!client) return null;

  const indexName = process.env.MOSS_INDEX_NAME ?? DEFAULT_INDEX;

  try {
    await ensureIndex(client, indexName);
    await loadIndex(client, indexName);
    const results = await client.query(indexName, query, {
      topK: 3,
      alpha: 0.7,
    });

    return results.docs.map((doc) => ({
      id: doc.id,
      title: doc.metadata?.scenarioName ?? doc.id,
      reason: doc.text ?? "Matched incident from Moss index.",
      score: doc.score,
      source: "moss",
    }));
  } catch {
    return null;
  }
}
