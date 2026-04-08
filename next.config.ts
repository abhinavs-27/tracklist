import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

/** Ensure `.env` is loaded from the cwd used to run `next dev` / `next build`. */
loadEnvConfig(process.cwd());

const nextConfig: NextConfig = {
  /** Allow dev HMR / fonts when the site is opened via 127.0.0.1 instead of localhost. */
  allowedDevOrigins: ["127.0.0.1"],
  /** gzip for `next start`; Vercel also applies Brotli/gzip at the edge. */
  compress: true,
  /**
   * ioredis ships compiled JS under `built/` (`"main": "./built/index.js"`). Next’s serverless
   * file tracer can copy `package.json` without the `built/` tree, causing
   * `Cannot find module '.../ioredis/built/index.js'` in production (Vercel).
   */
  serverExternalPackages: ["ioredis", "bullmq"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/ioredis/**/*"],
  },
};

export default nextConfig;
