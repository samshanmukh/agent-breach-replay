import { readFileSync } from "fs";
import postgres from "postgres";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const databaseUrl =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL, POSTGRES_URL, or SUPABASE_DB_URL is required.");
}

const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 20,
});

const migration = readFileSync("migrations/001_initial.sql", "utf8");
const statements = migration
  .split(/;\s*(?:\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

async function main() {
  try {
    for (const statement of statements) {
      await sql.unsafe(statement);
    }
    console.log(`applied ${statements.length} migration statements`);
  } finally {
    await sql.end();
  }
}

void main();
