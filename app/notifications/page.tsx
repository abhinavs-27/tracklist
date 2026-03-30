import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NotificationsAcknowledge } from "@/components/notifications/notifications-acknowledge";
import { FollowReciprocityHint } from "@/components/notifications/follow-reciprocity-hint";
import { MusicRecommendationNotificationFooter } from "@/components/notifications/music-recommendation-notification-footer";
import type { NotificationRow } from "@/lib/queries";
import { getNotifications, markNotificationsRead } from "@/lib/queries";
import {
  getFollowBackFlags,
  getMusicRecommendationReciprocityState,
} from "@/lib/social/reciprocity";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function recommendationHref(n: NotificationRow): string | null {
  if (!n.entity_type || !n.entity_id) return null;
  const p = n.payload as { albumId?: string } | undefined;
  if (n.entity_type === "artist") return `/artist/${n.entity_id}`;
  if (n.entity_type === "album") return `/album/${n.entity_id}`;
  if (n.entity_type === "track") {
    if (p?.albumId?.trim()) return `/album/${p.albumId.trim()}`;
    return null;
  }
  return null;
}

function recommendationTitle(n: NotificationRow): string {
  const p = n.payload as { title?: string } | undefined;
  if (p?.title?.trim()) return p.title.trim();
  if (n.entity_type === "artist") return "an artist";
  if (n.entity_type === "album") return "an album";
  return "a track";
}

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  await markNotificationsRead(session.user.id);
  const notifications = await getNotifications(session.user.id, 50);
  const actorIds = [...new Set((notifications.map((n) => n.actor_user_id).filter(Boolean) as string[]))];
  const supabase = await createSupabaseServerClient();
  const { data: users } = actorIds.length > 0
    ? await supabase.from("users").select("id, username").in("id", actorIds)
    : { data: [] };
  const actorMap = new Map((users ?? []).map((u: { id: string; username: string }) => [u.id, u.username]));

  const recInputs = notifications
    .filter((n) => n.type === "music_recommendation")
    .map((n) => ({
      notificationId: n.id,
      actorUserId: n.actor_user_id,
      createdAt: n.created_at,
    }));
  const followActorIds = [
    ...new Set(
      notifications
        .filter((n) => n.type === "follow" && n.actor_user_id)
        .map((n) => n.actor_user_id as string),
    ),
  ];

  const [reciprocityRec, followBackFlags] = await Promise.all([
    getMusicRecommendationReciprocityState(session.user.id, recInputs),
    getFollowBackFlags(session.user.id, followActorIds),
  ]);

  return (
    <div className="space-y-6">
      <NotificationsAcknowledge />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-white">Notifications</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link href="/social/inbox" className="text-emerald-400 hover:underline">
            Social inbox
          </Link>
          <Link href="/" className="text-zinc-400 hover:text-white hover:underline">
            ← Home
          </Link>
        </div>
      </div>
      {notifications.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">No notifications yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border px-4 py-3 ${n.read ? "border-zinc-800 bg-zinc-900/30 text-zinc-400" : "border-zinc-700 bg-zinc-900/50 text-zinc-200"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span>
                  {n.type === "follow" && n.actor_user_id && (
                    <>
                      <Link href={`/profile/${n.actor_user_id ?? ""}`} className="font-medium text-white hover:text-emerald-400 hover:underline">
                        {actorMap.get(n.actor_user_id ?? "") ?? "Someone"}
                      </Link>
                      {" started following you"}
                    </>
                  )}
                  {n.type === "community_invite" &&
                    n.actor_user_id &&
                    n.entity_type === "community" &&
                    n.entity_id && (
                  <>
                    <Link href={`/profile/${n.actor_user_id}`} className="font-medium text-white hover:text-emerald-400 hover:underline">
                      {actorMap.get(n.actor_user_id) ?? "Someone"}
                    </Link>
                    {" invited you to a "}
                    <Link
                      href={`/communities/${n.entity_id}`}
                      className="font-medium text-emerald-400 hover:underline"
                    >
                      community
                    </Link>
                    {" — open Communities to respond."}
                  </>
                  )}
                  {n.type === "music_recommendation" && (
                    <>
                      {n.actor_user_id ? (
                        <Link
                          href={`/profile/${n.actor_user_id}`}
                          className="font-medium text-white hover:text-emerald-400 hover:underline"
                        >
                          {actorMap.get(n.actor_user_id) ?? "Someone"}
                        </Link>
                      ) : (
                        <span className="font-medium text-zinc-300">Someone</span>
                      )}
                      {" recommended "}
                      {(() => {
                        const href = recommendationHref(n);
                        const label = recommendationTitle(n);
                        return href ? (
                          <Link
                            href={href}
                            className="font-medium text-emerald-400 hover:underline"
                          >
                            {label}
                          </Link>
                        ) : (
                          <span className="font-medium text-zinc-200">{label}</span>
                        );
                      })()}
                    </>
                  )}
                  {n.type !== "follow" &&
                    n.type !== "music_recommendation" &&
                    !(
                      n.type === "community_invite" &&
                      n.actor_user_id &&
                      n.entity_type === "community" &&
                      n.entity_id
                    ) && (
                    <span className="capitalize">{n.type.replace(/_/g, " ")}</span>
                  )}
                </span>
                <span className="text-xs text-zinc-500">{new Date(n.created_at).toLocaleDateString()}</span>
              </div>
              {n.type === "follow" && n.actor_user_id ? (
                <FollowReciprocityHint
                  actorUserId={n.actor_user_id}
                  showFollowBack={followBackFlags.get(n.actor_user_id) ?? false}
                />
              ) : null}
              {n.type === "music_recommendation" ? (
                <MusicRecommendationNotificationFooter
                  notificationId={n.id}
                  actorUserId={n.actor_user_id}
                  actorUsername={
                    n.actor_user_id
                      ? (actorMap.get(n.actor_user_id) ?? "Someone")
                      : "Someone"
                  }
                  initialResponded={
                    reciprocityRec.get(n.id)?.responded ?? true
                  }
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
