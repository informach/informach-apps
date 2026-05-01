import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: [
    "@informach/ai-core",
    "@informach/auth",
    "@informach/billing",
    "@informach/config",
    "@informach/db",
    "@informach/emails",
    "@informach/ui",
  ],
  typedRoutes: true,
};

export default nextConfig;
