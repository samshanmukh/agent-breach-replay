import postgres from "postgres";
import { buildLocalIncidentReport } from "../lib/reporting";
import { toSecurityTrace, scenarios } from "../lib/traces";
import { detectSecurityFindings } from "../packages/detectors";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

function status(name: string, ok: boolean, detail = "") {
  console.log(`${name}=${ok ? "ok" : "missing"}${detail ? ` ${detail}` : ""}`);
}

async function checkDatabase() {
  const databaseUrl =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    status("database", false);
    return;
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 20,
  });

  try {
    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from runs
    `;
    status("database", true, `runs=${rows[0]?.count ?? 0}`);
  } finally {
    await sql.end();
  }
}

async function checkOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    status("openai", false);
    return;
  }

  const scenario = scenarios[0];
  const trace = toSecurityTrace(scenario);
  const findings = detectSecurityFindings(trace);
  const localReport = buildLocalIncidentReport(trace, findings);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: `Summarize this security report in one sentence: ${localReport.summary}`,
      max_output_tokens: 80,
    }),
  });

  console.log(`openai=${response.ok ? "ok" : "error"} status=${response.status}`);
}

async function main() {
  status("moss_env", Boolean(process.env.MOSS_PROJECT_ID && process.env.MOSS_PROJECT_KEY));
  status("agent_breach_api_key", Boolean(process.env.AGENT_BREACH_API_KEY));
  await checkDatabase();
  await checkOpenAI();
}

void main();
