import { getSession } from "./auth/get-session";

export { getSession };

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  return session;
}

export {
  findOrCreateUser,
  getUserFromRequest,
  handleUnauthorized,
  normalizeEmail,
  requireApiAuth,
  UnauthorizedError,
  type User,
} from '@/lib/auth/requireApiAuth';
