import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

/** Ensure `.env` is loaded from the cwd used to run `next dev` / `next build`. */
loadEnvConfig(process.cwd());

const nextConfig: NextConfig = {
  /** Allow dev HMR / fonts when the site is opened via 127.0.0.1 instead of localhost. */
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
