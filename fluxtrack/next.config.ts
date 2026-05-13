import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this directory. The repo also has a stray
  // package-lock.json at the parent (an unrelated tiny project), which makes
  // Next.js infer the wrong root and print a warning at `next dev`.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
