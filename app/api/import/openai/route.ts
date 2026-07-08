import { NextResponse } from "next/server";
import {
  normalizeOpenAITrace,
  type OpenAITraceLike,
} from "@/packages/adapters/openai-agents";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    trace: OpenAITraceLike;
    projectId?: string;
    userTask?: string;
  };

  const normalized = normalizeOpenAITrace(body.trace, {
    projectId: body.projectId ?? "imported",
    userTask: body.userTask ?? "Imported OpenAI agent run",
  });

  return NextResponse.json(normalized);
}
