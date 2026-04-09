/**
 * Minimal Lambda bundle (lambda/entry.ts) — Supabase only, no app/React.
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

await esbuild.build({
  entryPoints: [path.join(root, "lambda/entry.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: path.join(root, "lambda/dist/handler.js"),
  logLevel: "info",
  external: ["aws-sdk"],
});

console.log("Built lambda/dist/handler.js");
