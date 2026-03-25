import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Allow dev HMR / fonts when the site is opened via 127.0.0.1 instead of localhost. */
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
