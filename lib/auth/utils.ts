/**
 * Generates a unique username based on the user's email address.
 * Standardizes formatting to lowercase alphanumeric with underscores.
 */
export function generateUsernameFromEmail(email: string): string {
  const base = email
    .split("@")[0]
    .replace(/[^a-zA-Z0-9]/g, "_")
    .toLowerCase()
    .slice(0, 20);
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalizes an email address by trimming whitespace and converting to lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
