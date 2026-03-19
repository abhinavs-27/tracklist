import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  apiForbidden,
  apiNotFound,
  apiInternalError,
  apiBadRequest,
  apiOk,
} from '@/lib/api-response';
import { isValidUuid } from '@/lib/validation';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error: authErr } = await requireApiAuth();
    if (authErr) return authErr;

    const { id } = await params;
    if (!isValidUuid(id)) {
      return apiBadRequest('Invalid log id');
    }

    const supabase = await createSupabaseServerClient();
    const { data: log, error: fetchError } = await supabase
      .from('logs')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !log) return apiNotFound('Log not found');
    if (log.user_id !== session.user.id) return apiForbidden();

    const { error: deleteError } = await supabase.from('logs').delete().eq('id', id);
    if (deleteError) {
      console.error('Log delete error:', deleteError);
      return apiInternalError(deleteError);
    }
    console.log("[logs] log-deleted", {
      userId: session.user.id,
      logId: id,
    });
    return apiOk({ success: true });
  } catch (e) {
    return apiInternalError(e);
  }
}
