import { readdirSync, readFileSync } from "fs";
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

async function main() {
  try {
    const files = readdirSync("migrations")
      .filter((file) => file.endsWith(".sql"))
      .sort();
    let applied = 0;

    for (const file of files) {
      const statements = readFileSync(`migrations/${file}`, "utf8")
        .split(/;\s*(?:\n|$)/)
        .map((statement) => statement.trim())
        .filter(Boolean);

      for (const statement of statements) {
        await sql.unsafe(statement);
        applied += 1;
      }
      console.log(`applied ${file} (${statements.length} statements)`);
    }
    console.log(`applied ${applied} migration statements`);
  } finally {
    await sql.end();
  }
}

void main();
