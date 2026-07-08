import postgres from "postgres";

let sqlClient: postgres.Sql | null = null;

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.SUPABASE_DB_URL
  );
}

export function getSql() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) return null;

  if (!sqlClient) {
    sqlClient = postgres(databaseUrl, {
      max: Number(process.env.DATABASE_MAX_CONNECTIONS ?? 5),
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  return sqlClient;
}
