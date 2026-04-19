/**
 * After `node scripts/build-lambda-billboard-scheduler.mjs`:
 * - handler.js uses dynamic `require("ioredis")` at runtime → bundle must ship `node_modules/ioredis`.
 * Produces `/tmp/billboard-worker-full.zip` for `aws lambda update-function-code`.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const handlerSrc = path.join(
  root,
  "infra/aws/lambda/billboard-scheduler/dist/handler.js",
);

if (!fs.existsSync(handlerSrc)) {
  console.error("Missing dist/handler.js — run: node scripts/build-lambda-billboard-scheduler.mjs");
  process.exit(1);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-lambda-"));
try {
  fs.copyFileSync(handlerSrc, path.join(dir, "handler.js"));
  execSync("npm init -y", { cwd: dir, stdio: "pipe" });
  execSync("npm install ioredis@5.10.1 --omit=dev", {
    cwd: dir,
    stdio: "inherit",
  });
  const outZip = "/tmp/billboard-worker-full.zip";
  fs.rmSync(outZip, { force: true });
  execSync(`zip -rq "${outZip}" handler.js node_modules`, {
    cwd: dir,
    stdio: "inherit",
  });
  console.log(`Wrote ${outZip}`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
