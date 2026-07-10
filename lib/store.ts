import { buildLocalIncidentReport, type IncidentReport } from "@/lib/reporting";
import { getSql } from "@/lib/db";
import { indexIncidentInMoss } from "@/lib/moss";
import {
  appendAudit,
  getProjectSettings,
  syncApprovalsFromTrace,
} from "@/lib/security-controls";
import { detectSecurityFindings } from "@/packages/detectors";
import type { SecurityFinding, SecurityTrace } from "@/packages/trace-schema";

export type StoredRun = {
  trace: SecurityTrace;
  findings: SecurityFinding[];
  report: IncidentReport;
};

const memoryRuns = new Map<string, StoredRun>();

function agentId(projectId: string, agentName: string) {
  return `${projectId}:${agentName.toLowerCase().replaceAll(" ", "-")}`;
}

export async function saveTrace(trace: SecurityTrace): Promise<StoredRun> {
  const findings = detectSecurityFindings(trace);
  const report = buildLocalIncidentReport(trace, findings);
  const stored = { trace, findings, report };
  syncApprovalsFromTrace(trace);
  appendAudit({
    projectId: trace.projectId,
    actorId: "ingestion-api",
    actorEmail: "machine ingestion",
    action: "trace.ingested",
    resourceType: "run",
    resourceId: trace.runId,
    metadata: {
      agentName: trace.agentName,
      eventCount: trace.events.length,
      findingCount: findings.length,
      captureMode: trace.captureMode,
    },
  });
  const sql = getSql();

  if (!sql) {
    memoryRuns.set(trace.runId, stored);
    await indexIncidentInMoss(trace, findings, report);
    return stored;
  }

  const orgId = process.env.DEFAULT_ORG_ID ?? "default-org";
  const projectName = process.env.DEFAULT_PROJECT_NAME ?? trace.projectId;
  const computedAgentId = agentId(trace.projectId, trace.agentName);

  await sql.begin(async (tx) => {
    await tx`
      insert into organizations (id, name)
      values (${orgId}, ${process.env.DEFAULT_ORG_NAME ?? "Default Organization"})
      on conflict (id) do nothing
    `;

    await tx`
      insert into projects (id, org_id, name)
      values (${trace.projectId}, ${orgId}, ${projectName})
      on conflict (id) do update set name = excluded.name
    `;

    await tx`
      insert into agents (id, project_id, name)
      values (${computedAgentId}, ${trace.projectId}, ${trace.agentName})
      on conflict (project_id, name) do update set name = excluded.name
    `;

    await tx`
      insert into runs (
        id, project_id, agent_id, scenario_name, capture_mode, user_task,
        risk_summary, started_at
      )
      values (
        ${trace.runId}, ${trace.projectId}, ${computedAgentId},
        ${trace.scenarioName}, ${trace.captureMode}, ${trace.userTask},
        ${trace.riskSummary}, ${trace.startedAt}
      )
      on conflict (id) do update set
        scenario_name = excluded.scenario_name,
        capture_mode = excluded.capture_mode,
        user_task = excluded.user_task,
        risk_summary = excluded.risk_summary
    `;

    await tx`delete from trace_events where run_id = ${trace.runId}`;
    await tx`delete from findings where run_id = ${trace.runId}`;
    await tx`delete from reports where run_id = ${trace.runId}`;

    for (const [index, event] of trace.events.entries()) {
      await tx`
        insert into trace_events (
          id, run_id, event_index, timestamp, title, actor, trust, summary,
          details, source_ids, tool_name, target, target_class,
          destination_class, influenced_by, decision, violation, raw
        )
        values (
          ${event.id}, ${trace.runId}, ${index}, ${event.timestamp},
          ${event.title}, ${event.actor}, ${event.trust}, ${event.summary},
          ${event.details}, ${event.sourceIds ?? []}, ${event.toolName ?? null},
          ${event.target ?? null}, ${event.targetClass ?? null},
          ${event.destinationClass ?? null}, ${event.influencedBy ?? []},
          ${event.decision ?? null}, ${event.violation ?? null},
          ${sql.json(event)}
        )
      `;
    }

    for (const finding of findings) {
      await tx`
        insert into findings (run_id, type, severity, status, evidence, recommendation)
        values (
          ${trace.runId}, ${finding.type}, ${finding.severity},
          ${finding.status}, ${finding.evidence}, ${finding.recommendation}
        )
      `;
    }

    await tx`
      insert into reports (
        run_id, title, summary, breach_path, recommendations, generated_by, raw
      )
      values (
        ${trace.runId}, ${report.title}, ${report.summary}, ${report.breachPath},
        ${report.recommendations}, ${report.generatedBy}, ${sql.json(report)}
      )
    `;
  });

  await indexIncidentInMoss(trace, findings, report);
  return stored;
}

export async function listRuns(projectId?: string): Promise<StoredRun[]> {
  const sql = getSql();
  if (!sql) {
    return Array.from(memoryRuns.values()).filter(
      (run) => !projectId || run.trace.projectId === projectId,
    );
  }

  const rows = await sql<{ raw: SecurityTrace }[]>`
    select jsonb_build_object(
      'schemaVersion', '0.1',
      'runId', r.id,
      'projectId', r.project_id,
      'agentName', a.name,
      'scenarioName', r.scenario_name,
      'captureMode', r.capture_mode,
      'startedAt', r.started_at,
      'userTask', r.user_task,
      'riskSummary', r.risk_summary,
      'events', coalesce(jsonb_agg(e.raw order by e.event_index), '[]'::jsonb)
    ) as raw
    from runs r
    join agents a on a.id = r.agent_id
    left join trace_events e on e.run_id = r.id
    where (${projectId ?? null}::text is null or r.project_id = ${projectId ?? null})
    group by r.id, a.name
    order by r.created_at desc
    limit 100
  `;

  return rows.map((row) => {
    const findings = detectSecurityFindings(row.raw);
    return {
      trace: row.raw,
      findings,
      report: buildLocalIncidentReport(row.raw, findings),
    };
  });
}

export async function getRun(runId: string): Promise<StoredRun | null> {
  const sql = getSql();
  if (!sql) return memoryRuns.get(runId) ?? null;

  const rows = await sql<{ raw: SecurityTrace }[]>`
    select jsonb_build_object(
      'schemaVersion', '0.1',
      'runId', r.id,
      'projectId', r.project_id,
      'agentName', a.name,
      'scenarioName', r.scenario_name,
      'captureMode', r.capture_mode,
      'startedAt', r.started_at,
      'userTask', r.user_task,
      'riskSummary', r.risk_summary,
      'events', coalesce(jsonb_agg(e.raw order by e.event_index), '[]'::jsonb)
    ) as raw
    from runs r
    join agents a on a.id = r.agent_id
    left join trace_events e on e.run_id = r.id
    where r.id = ${runId}
    group by r.id, a.name
    limit 1
  `;
  const trace = rows[0]?.raw;
  if (!trace) return null;
  const findings = detectSecurityFindings(trace);
  return {
    trace,
    findings,
    report: buildLocalIncidentReport(trace, findings),
  };
}

export async function purgeExpiredRuns(reference = new Date()) {
  const sql = getSql();
  if (!sql) {
    let deleted = 0;
    for (const [runId, run] of memoryRuns) {
      const retention = getProjectSettings(run.trace.projectId).retention;
      const days =
        run.trace.captureMode === "metadata-only"
          ? retention.metadataOnlyDays
          : run.trace.captureMode === "redacted-preview"
            ? retention.redactedPreviewDays
            : retention.fullDebugDays;
      const expiresAt =
        new Date(run.trace.startedAt).getTime() + days * 24 * 60 * 60 * 1000;
      if (expiresAt < reference.getTime()) {
        memoryRuns.delete(runId);
        deleted += 1;
      }
    }
    return deleted;
  }

  const rows = await sql<{ id: string }[]>`
    delete from runs r
    using project_settings s
    where s.project_id = r.project_id
      and (
        (r.capture_mode = 'metadata-only'
          and r.started_at < ${reference.toISOString()}::timestamptz
            - make_interval(days => s.retention_metadata_days))
        or
        (r.capture_mode = 'redacted-preview'
          and r.started_at < ${reference.toISOString()}::timestamptz
            - make_interval(days => s.retention_preview_days))
        or
        (r.capture_mode = 'full-debug'
          and r.started_at < ${reference.toISOString()}::timestamptz
            - make_interval(days => s.retention_debug_days))
      )
    returning r.id
  `;
  return rows.length;
}
