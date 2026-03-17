import "server-only";

export function getAppEnv(): "development" | "production" {
  const env = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development";
  if (env === "production") return "production";
  return "development";
}

export function isDev() {
  return getAppEnv() === "development";
}

export function isProd() {
  return getAppEnv() === "production";
}

// Log environment once on module load (server-side only)
// This will appear in server logs and build logs.
console.log("Tracklist running in", getAppEnv());

