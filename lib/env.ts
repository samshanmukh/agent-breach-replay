import { isProjectApiKeyValid } from "@/lib/security-controls";

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string) {
  return process.env[name] || undefined;
}

export function isApiKeyConfigured() {
  return Boolean(process.env.AGENT_BREACH_API_KEY);
}

export function assertApiKey(
  request: Request,
  scope: "ingest" | "read" | "simulate" | "approve" = "ingest",
) {
  const configuredKey = process.env.AGENT_BREACH_API_KEY;
  const providedKey = request.headers.get("x-agent-breach-key");
  if (!configuredKey && !providedKey) return;
  if (
    providedKey !== configuredKey &&
    !(providedKey && isProjectApiKeyValid(providedKey, scope))
  ) {
    throw new Error("Unauthorized");
  }
}
