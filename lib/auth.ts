import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function getSession() {
  return getServerSession(authOptions);
}

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
