import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "@/lib/supabase-env";
import { requireStudioActor } from "@/lib/studio-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const actor = await requireStudioActor();
    return NextResponse.json({
      ok: true,
      actor,
      services: {
        database: getSql() ? "connected" : "memory",
        auth:
          getSupabaseUrl() && getSupabaseAnonKey() ? "supabase" : "local",
        reports: process.env.OPENAI_API_KEY ? "openai" : "local-rules",
        retrieval: process.env.MOSS_API_KEY ? "moss" : "local-patterns",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
