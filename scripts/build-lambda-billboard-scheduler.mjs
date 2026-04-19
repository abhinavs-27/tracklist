/**
 * Bundle Lambda artifacts under infra/aws/lambda/billboard-scheduler/dist:
 * - handler.js — SQS consumer (billboard-worker)
 * - scheduler-handler.js — optional fan-out (enqueueBillboardWeekJobs)
 */
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
    handler: path.join(root, "infra/aws/lambda/billboard-scheduler/entry.ts"),
    "scheduler-handler": path.join(
      root,
      "infra/aws/lambda/billboard-scheduler/scheduler-entry.ts",
    ),
  },
  bundle: true,
  platform: "node",
  target: "node20",
  outdir: path.join(root, "infra/aws/lambda/billboard-scheduler/dist"),
  sourcemap: true,
  alias: { "@": root },
  plugins: [stubServerOnly],
  /** Bundle node_modules into the zip — Lambda has no node_modules layer. */
  packages: "bundle",
  external: [
    "next",
    "next/*",
    "@opentelemetry/api",
    "@opentelemetry/*",
    // react / styled-jsx must be bundled — Lambda zip has no node_modules
  ],
  logLevel: "info",
});

console.log(
  "Built infra/aws/lambda/billboard-scheduler/dist/handler.js (SQS worker) and dist/scheduler-handler.js (fan-out)",
);
