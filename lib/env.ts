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

export function assertApiKey(request: Request) {
  const configuredKey = process.env.AGENT_BREACH_API_KEY;
  if (!configuredKey) return;

  const providedKey = request.headers.get("x-agent-breach-key");
  if (providedKey !== configuredKey) {
    throw new Error("Unauthorized");
  }
}
