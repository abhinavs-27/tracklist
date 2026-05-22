import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const stubServerOnly = {
  name: "stub-server-only",
  setup(build) {
    build.onResolve({ filter: /^server-only$/ }, () => ({
      path: "server-only",
      namespace: "server-only-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "server-only-stub" }, () => ({
      contents: "export {};\n",
      loader: "js",
    }));
  },
};

await esbuild.build({
  entryPoints: {
    handler: path.join(root, "infra/aws/lambda/spotify-enrichment-retry-scheduler/entry.ts"),
  },
  bundle: true,
  platform: "node",
  target: "node20",
  outdir: path.join(root, "infra/aws/lambda/spotify-enrichment-retry-scheduler/dist"),
  sourcemap: true,
  alias: {
    "@": root,
    "next/headers": path.join(root, "infra/aws/lambda/stubs/next-headers.ts"),
    "next/cache":   path.join(root, "infra/aws/lambda/stubs/next-cache.ts"),
    "next/server":  path.join(root, "infra/aws/lambda/stubs/next-server.ts"),
  },
  plugins: [stubServerOnly],
  packages: "bundle",
  external: ["@opentelemetry/api", "@opentelemetry/*"],
  logLevel: "info",
});

console.log("Built infra/aws/lambda/spotify-enrichment-retry-scheduler/dist/handler.js");
console.log("EventBridge schedule: rate(30 minutes)");
