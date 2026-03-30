import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { InboxKindFilters } from "@/components/social/inbox-kind-filters";
import { InboxPageNav } from "@/components/social/inbox-page-nav";
import { InboxThreadRow } from "@/components/social/inbox-thread-row";
import {
  parseThreadInboxKind,
  type ThreadKindUiKey,
} from "@/lib/social/thread-kind-ui";
import {
  listThreadsForUser,
  musicLabelForThread,
  resolveThreadListUsernames,
} from "@/lib/social/threads";
import { formatRelativeTime } from "@/lib/time";
import { pageSubtitle, pageTitle, sectionGap } from "@/lib/ui/surface";

export const dynamic = "force-dynamic";

function emptyCopy(kind: ThreadKindUiKey | null): string {
  if (kind === "recommendation") {
    return "No recommendation threads yet. When someone sends you music (or you send some), it will show up here.";
  }
  if (kind === "taste_comparison") {
    return "No taste match threads yet. Run a taste comparison from a profile to start one.";
  }
  if (kind === "activity") {
    return "No activity threads yet. When people react on your reviews or related feed items, threads can appear here.";
  }
  return "Nothing here yet. Recommendations, taste matches, and activity each get their own thread — filter above to focus on one type.";
}

export default async function SocialInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const sp = await searchParams;
  const kindFilter = parseThreadInboxKind(sp.kind);

  const items = await listThreadsForUser(session.user.id, 80, kindFilter);
  const names = await resolveThreadListUsernames(
    items.map((i) => i.counterpart_user_id),
  );

  return (
    <div className={`mx-auto max-w-2xl px-4 py-8 sm:px-6 ${sectionGap}`}>
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <h1 className={pageTitle}>Inbox</h1>
          <p className={pageSubtitle}>
            Recommendations, taste matches, and activity threads with people you
            follow — filter by type or open a thread to reply.
          </p>
          <InboxKindFilters active={kindFilter} />
        </div>
        <InboxPageNav />
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-zinc-900/40 px-8 py-14 text-center shadow-[0_12px_40px_-16px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06]">
          <p className="text-sm font-medium text-zinc-300">Nothing here yet</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-500">
            {emptyCopy(kindFilter)}
          </p>
        </div>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {items.map((t) => {
            const who = t.counterpart_user_id
              ? (names.get(t.counterpart_user_id) ?? "Someone")
              : "Someone";
            const title = musicLabelForThread(t);
            const time = formatRelativeTime(t.last_activity_at);

            return (
              <InboxThreadRow
                key={t.id}
                threadId={t.id}
                kind={t.kind as ThreadKindUiKey}
                title={title}
                who={who}
                time={time}
                lastActivityAt={t.last_activity_at}
                musicImageUrl={t.music_image_url}
                lastReplyPreview={t.last_reply_preview}
                replyCount={t.reply_count}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
