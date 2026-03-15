import { NextRequest, NextResponse } from 'next/server';
import { apiBadRequest } from './api-response';

/**
 * Standardizes JSON body parsing with error handling.
 */
export async function parseBody<T>(
  request: NextRequest
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  try {
    const data = await request.json();
    return { data, error: null };
  } catch (e) {
    return { data: null, error: apiBadRequest('Invalid JSON body') };
  }
}
