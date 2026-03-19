import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { apiUnauthorized } from './api-response';
import type { NextResponse } from 'next/server';

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

/**
 * Standard authentication helper for API routes.
 * Returns { session: Session; error: null } if authenticated,
 * or { session: null; error: NextResponse } if not.
 */
export async function requireApiAuth(): Promise<
  { session: Session; error: null } | { session: null; error: NextResponse }
> {
  const session = await getSession();
  if (!session?.user?.id) {
    return { session: null, error: apiUnauthorized() };
  }
  return { session, error: null };
}
