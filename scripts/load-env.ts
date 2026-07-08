import { existsSync, readFileSync } from "fs";

export function loadEnvFiles(files = [".env.local", ".env"]) {
  for (const file of files) {
    if (!existsSync(file)) continue;

    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (!key || process.env[key] !== undefined) continue;

      process.env[key] = rawValue
        .replace(/^['"]|['"]$/g, "")
        .replace(/\\n/g, "\n");
    }
  }
}
