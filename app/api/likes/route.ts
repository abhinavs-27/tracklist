import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  apiUnauthorized,
  apiBadRequest,
  apiConflict,
  apiInternalError,
} from '@/lib/api-response';
import { isValidUuid } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiBadRequest('Invalid JSON body');
    }
    const logId = (body as Record<string, unknown>).log_id;
    if (!logId) return apiBadRequest('log_id is required');
    if (!isValidUuid(logId)) return apiBadRequest('Invalid log_id');

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from('likes').insert({
      user_id: session.user.id,
      log_id: logId,
    });

    if (error) {
      if (error.code === '23505') return apiConflict('Already liked');
      if (error.code === '23503') return apiBadRequest('Log not found');
      console.error('Like error:', error);
      return apiInternalError(error);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiInternalError(e);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { searchParams } = new URL(request.url);
    const logId = searchParams.get('log_id');
    if (!logId) return apiBadRequest('log_id is required');
    if (!isValidUuid(logId)) return apiBadRequest('Invalid log_id');

    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', session.user.id)
      .eq('log_id', logId);

    if (error) {
      console.error('Unlike error:', error);
      return apiInternalError(error);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiInternalError(e);
  }
}
