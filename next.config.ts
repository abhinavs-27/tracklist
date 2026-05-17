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
   * `Cannot find module ‘.../ioredis/built/index.js’` in production (Vercel).
   *
   * @vercel/og must stay external so `import.meta.url` inside index.node.js keeps pointing at
   * the real package directory. When bundled, `import.meta.url` resolves to the bundle path and
   * `new URL("./resvg.wasm", import.meta.url)` can’t find the WASM file → image generation fails.
   */
  serverExternalPackages: ["ioredis", "bullmq", "@vercel/og"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/ioredis/**/*"],
    // Include @vercel/og’s WASM + font files for the share-image routes so the
    // external package can load them at runtime in the Vercel serverless environment.
    "/api/charts/share-image": ["./node_modules/@vercel/og/dist/**/*"],
    "/api/reports/share-image": ["./node_modules/@vercel/og/dist/**/*"],
    "/api/communities/[id]/charts/share-image": ["./node_modules/@vercel/og/dist/**/*"],
  },
};

export default nextConfig;
