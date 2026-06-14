/**
 * Generate an Apple Sign In client secret JWT for Supabase.
 *
 * Usage:
 *   node scripts/gen-apple-client-secret.mjs \
 *     --key-file /path/to/AuthKey_XXXXXXXXXX.p8 \
 *     --key-id XXXXXXXXXX \
 *     --team-id XXXXXXXXXX \
 *     --client-id com.abhinavs.tracklist
 *
 * Paste the output JWT into Supabase Dashboard → Auth → Providers → Apple → Secret Key.
 * The token is valid for 180 days — regenerate and update Supabase before it expires.
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };
  return {
    keyFile: get("--key-file"),
    keyId: get("--key-id"),
    teamId: get("--team-id"),
    clientId: get("--client-id"),
  };
}

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function sign(header, payload, privateKeyPem) {
  const h = base64url(Buffer.from(JSON.stringify(header)));
  const p = base64url(Buffer.from(JSON.stringify(payload)));
  const data = `${h}.${p}`;
  const signer = createSign("SHA256");
  signer.update(data);
  const sig = signer.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `${data}.${base64url(sig)}`;
}

const { keyFile, keyId, teamId, clientId } = parseArgs();

if (!keyFile || !keyId || !teamId || !clientId) {
  console.error("Usage: node gen-apple-client-secret.mjs --key-file <path> --key-id <id> --team-id <id> --client-id <bundle-or-service-id>");
  process.exit(1);
}

const privateKey = readFileSync(keyFile, "utf8");
const now = Math.floor(Date.now() / 1000);
const exp = now + 180 * 24 * 60 * 60; // 180 days

const jwt = sign(
  { alg: "ES256", kid: keyId },
  { iss: teamId, iat: now, exp, aud: "https://appleid.apple.com", sub: clientId },
  privateKey,
);

console.log("\nApple client secret JWT (valid 180 days):\n");
console.log(jwt);
console.log("\nExpires:", new Date(exp * 1000).toISOString());
console.log("\nPaste this into: Supabase Dashboard → Auth → Providers → Apple → Secret Key\n");
