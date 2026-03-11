import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiInternalError,
} from '@/lib/api-response';
import { isValidUuid } from '@/lib/validation';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { id } = await params;
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid log id' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
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
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiInternalError(e);
  }
}
