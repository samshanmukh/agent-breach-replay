import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const nextConfig: NextConfig = {
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  serverExternalPackages: ["@moss-dev/moss", "@moss-dev/moss-core"],
};

export default nextConfig;
