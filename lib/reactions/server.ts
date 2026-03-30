import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { reactionTargetKey } from "@/lib/reactions/keys";
import {
  isAllowedReactionEmoji,
  isAllowedReactionTargetType,
} from "@/lib/reactions/constants";
import type { ReactionSnapshot } from "@/lib/reactions/types";

export type { ReactionSnapshot } from "@/lib/reactions/types";

function dedupeTargets(
  targets: { targetType: string; targetId: string }[],
): { targetType: string; targetId: string }[] {
  const seen = new Set<string>();
  const out: { targetType: string; targetId: string }[] = [];
  for (const t of targets) {
    const k = reactionTargetKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export async function fetchReactionsBatch(
  viewerUserId: string | null,
  targets: { targetType: string; targetId: string }[],
): Promise<Map<string, ReactionSnapshot>> {
  const list = dedupeTargets(targets);
  const result = new Map<string, ReactionSnapshot>();
  for (const t of list) {
    result.set(reactionTargetKey(t), { counts: {}, mine: null });
  }
  if (list.length === 0) return result;

  const admin = createSupabaseAdminClient();
  const byType = new Map<string, string[]>();
  for (const t of list) {
    if (!byType.has(t.targetType)) byType.set(t.targetType, []);
    byType.get(t.targetType)!.push(t.targetId);
  }

  const rows: {
    target_type: string;
    target_id: string;
    emoji: string;
    user_id: string;
  }[] = [];

  for (const [targetType, ids] of byType) {
    const uniqueIds = [...new Set(ids)];
    const chunkSize = 200;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const { data, error } = await admin
        .from("reactions")
        .select("target_type, target_id, emoji, user_id")
        .eq("target_type", targetType)
        .in("target_id", chunk);
      if (error) throw error;
      rows.push(...(data ?? []));
    }
  }

  for (const r of rows) {
    const rk = reactionTargetKey({
      targetType: r.target_type,
      targetId: r.target_id,
    });
    const entry = result.get(rk);
    if (!entry) continue;
    entry.counts[r.emoji] = (entry.counts[r.emoji] ?? 0) + 1;
    if (viewerUserId && r.user_id === viewerUserId) {
      entry.mine = r.emoji;
    }
  }

  return result;
}

export async function setReactionForUser(
  userId: string,
  targetType: string,
  targetId: string,
  emoji: string,
): Promise<{ snapshot: ReactionSnapshot }> {
  if (!isAllowedReactionTargetType(targetType)) {
    throw new Error("Invalid target type");
  }
  if (!isAllowedReactionEmoji(emoji)) {
    throw new Error("Invalid emoji");
  }
  if (targetId.length > 500) {
    throw new Error("Invalid target id");
  }

  const admin = createSupabaseAdminClient();

  const { data: existing, error: selErr } = await admin
    .from("reactions")
    .select("emoji")
    .eq("user_id", userId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();

  if (selErr) throw selErr;

  if (existing?.emoji === emoji) {
    const { error: delErr } = await admin
      .from("reactions")
      .delete()
      .eq("user_id", userId)
      .eq("target_type", targetType)
      .eq("target_id", targetId);
    if (delErr) throw delErr;
  } else if (existing) {
    const { error: upErr } = await admin
      .from("reactions")
      .update({ emoji })
      .eq("user_id", userId)
      .eq("target_type", targetType)
      .eq("target_id", targetId);
    if (upErr) throw upErr;
  } else {
    const { error: insErr } = await admin.from("reactions").insert({
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
      emoji,
    });
    if (insErr) throw insErr;
  }

  const snapshotMap = await fetchReactionsBatch(userId, [
    { targetType, targetId },
  ]);
  const snapshot = snapshotMap.get(reactionTargetKey({ targetType, targetId }));
  return {
    snapshot: snapshot ?? { counts: {}, mine: null },
  };
}

export async function clearReactionForUser(
  userId: string,
  targetType: string,
  targetId: string,
): Promise<{ snapshot: ReactionSnapshot }> {
  if (!isAllowedReactionTargetType(targetType)) {
    throw new Error("Invalid target type");
  }
  if (targetId.length > 500) {
    throw new Error("Invalid target id");
  }

  const admin = createSupabaseAdminClient();
  const { error: delErr } = await admin
    .from("reactions")
    .delete()
    .eq("user_id", userId)
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  if (delErr) throw delErr;

  const snapshotMap = await fetchReactionsBatch(userId, [
    { targetType, targetId },
  ]);
  const snapshot = snapshotMap.get(reactionTargetKey({ targetType, targetId }));
  return {
    snapshot: snapshot ?? { counts: {}, mine: null },
  };
}
