/**
 * Bundle the SQS worker for Node: stubs `server-only` (throws in plain Node) and maps `@/` → repo root.
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
  entryPoints: [path.join(root, "workers/sqs-worker/src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: path.join(root, "workers/sqs-worker/dist/index.js"),
  sourcemap: true,
  alias: {
    "@": root,
  },
  plugins: [stubServerOnly],
  logLevel: "info",
  /** App code pulls Next/OTel transitively; resolve at runtime from node_modules. */
  packages: "external",
  external: [
    "next",
    "next/*",
    "@opentelemetry/api",
    "@opentelemetry/*",
    "react",
    "react-dom",
    "styled-jsx",
    "styled-jsx/*",
  ],
});

console.log("Built workers/sqs-worker/dist/index.js");
