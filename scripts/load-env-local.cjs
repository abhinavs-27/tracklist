/**
 * CJS preloader: reads .env.local (then .env) into process.env before any
 * module code runs. Use via NODE_OPTIONS: -r ./scripts/load-env-local.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

function loadFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    // Strip optional surrounding quotes from value
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

const root = process.cwd();
loadFile(path.join(root, ".env"));
