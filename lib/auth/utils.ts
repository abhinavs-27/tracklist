/**
 * Shared authentication utilities.
 */

export function generateUsernameFromEmail(email: string): string {
  const base = email
    .split("@")[0]
    .replace(/[^a-zA-Z0-9]/g, "_")
    .toLowerCase()
    .slice(0, 20);
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}
