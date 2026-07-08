import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isApiKeyConfigured } from "@/lib/env";
import { getSupabaseAnonKey, getSupabaseSecretKey, getSupabaseUrl } from "@/lib/supabase-env";

export async function GET() {
  const sql = getSql();
  let database: "configured" | "not_configured" | "unreachable" = sql
    ? "configured"
    : "not_configured";

  if (sql) {
    try {
      await sql`select 1`;
    } catch {
      database = "unreachable";
    }
  }

  return NextResponse.json({
    ok: database !== "unreachable",
    database,
    apiKeyConfigured: isApiKeyConfigured(),
    supabaseConfigured: Boolean(getSupabaseUrl() && getSupabaseAnonKey()),
    supabaseSecretConfigured: Boolean(getSupabaseSecretKey()),
    openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
    mossConfigured: Boolean(process.env.MOSS_PROJECT_ID && process.env.MOSS_PROJECT_KEY),
  });
}
