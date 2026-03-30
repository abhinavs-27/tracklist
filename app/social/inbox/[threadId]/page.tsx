import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { EmojiReactionBar } from "@/components/reactions/emoji-reaction-bar";
import { InboxPageNav } from "@/components/social/inbox-page-nav";
import { ThreadReplyForm } from "@/components/social/thread-reply-form";
import {
  entityTypeShort,
  threadKindUi,
  type ThreadKindUiKey,
} from "@/lib/social/thread-kind-ui";
import {
  getThreadDetail,
  musicLabelForThread,
  threadMusicHref,
} from "@/lib/social/threads";
import { formatRelativeTime } from "@/lib/time";
import {
  communityBody,
  communityCard,
  communityInset,
  communityMeta,
  communityMetaLabel,
  pageSubtitle,
  pageTitle,
  sectionGap,
} from "@/lib/ui/surface";
import { isValidUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function SocialThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  if (!isValidUuid(threadId)) notFound();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const detail = await getThreadDetail(threadId, session.user.id);
  if (!detail) notFound();

  const { thread, replies, counterpart_user_id, counterpart_username } = detail;
  const ui = threadKindUi(thread.kind as ThreadKindUiKey);
  const musicHref = threadMusicHref(
    thread.music_entity_type,
    thread.music_entity_id,
    thread.album_id_for_track,
  );
  const label = musicLabelForThread(thread);
  const reactionTarget =
    thread.reaction_target_type && thread.reaction_target_id
      ? {
          targetType: thread.reaction_target_type,
          targetId: thread.reaction_target_id,
        }
      : null;
  const entityTag = entityTypeShort(thread.music_entity_type);

  const heroArtwork =
    thread.music_image_url ? (
      <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-2xl bg-zinc-900 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.08] sm:h-36 sm:w-36">
        <Image
          src={thread.music_image_url}
          alt=""
          width={144}
          height={144}
          className="h-full w-full object-cover"
          unoptimized
          priority
        />
      </div>
    ) : (
      <div
        className={`flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl text-4xl ring-1 sm:h-36 sm:w-36 sm:text-5xl ${
          thread.kind === "taste_comparison"
            ? "bg-violet-950/45 text-violet-400/95 ring-violet-500/25"
            : thread.kind === "activity"
              ? "bg-sky-950/40 text-sky-400/90 ring-sky-500/20"
              : "bg-zinc-900/90 text-zinc-500 ring-white/[0.08]"
        }`}
        aria-hidden
      >
        {ui.iconPlaceholder}
      </div>
    );

  return (
    <div className={`mx-auto max-w-2xl px-4 py-8 sm:px-6 ${sectionGap}`}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/social/inbox"
          className="group inline-flex w-fit items-center gap-2 text-sm text-zinc-400 transition hover:text-white"
        >
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-800/80 text-zinc-300 ring-1 ring-white/[0.06] transition group-hover:bg-zinc-800 group-hover:text-emerald-400"
            aria-hidden
          >
            ←
          </span>
          <span>Inbox</span>
        </Link>
        <InboxPageNav />
      </header>

      <article className={`${communityCard} overflow-hidden p-0 ${ui.accentBorder}`}>
        <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-lg px-2.5 py-1 ${ui.badge}`}>
              {ui.label}
            </span>
            {counterpart_user_id ? (
              <span className={communityMeta}>
                with{" "}
                <Link
                  href={`/profile/${counterpart_user_id}`}
                  className="font-medium text-zinc-300 hover:text-emerald-400 hover:underline"
                >
                  {counterpart_username
                    ? `@${counterpart_username}`
                    : "their profile"}
                </Link>
              </span>
            ) : null}
          </div>
          <p className={`mt-4 max-w-prose ${communityBody}`}>{ui.detailSubhead}</p>
        </div>

        {thread.kind === "recommendation" ? (
          <div className="border-b border-white/[0.06] bg-gradient-to-b from-zinc-950/40 to-transparent px-5 py-8 sm:px-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              {heroArtwork}
              <div className="min-w-0 flex-1">
                <h1 className={`${pageTitle} text-balance`}>{label}</h1>
                {thread.music_subtitle ? (
                  <p className={`mt-2 ${pageSubtitle}`}>{thread.music_subtitle}</p>
                ) : null}
                {musicHref ? (
                  <Link
                    href={musicHref}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
                  >
                    Open in catalog
                    <span aria-hidden>→</span>
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {thread.kind === "taste_comparison" ? (
          <div
            className={`border-b border-white/[0.06] px-5 py-10 sm:px-6 ${ui.heroPanel}`}
          >
            <div className="mx-auto flex max-w-md flex-col items-center text-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/15 text-3xl text-violet-300 ring-1 ring-violet-400/25"
                aria-hidden
              >
                {ui.iconPlaceholder}
              </div>
              <h1 className={`mt-5 ${pageTitle}`}>Taste match</h1>
              <p className={`mt-3 ${communityBody}`}>
                Overlap and listening affinity — notes are optional side context.
              </p>
            </div>
          </div>
        ) : null}

        {thread.kind === "activity" ? (
          <div className="border-b border-white/[0.06] bg-gradient-to-b from-zinc-950/35 to-transparent px-5 py-8 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              {entityTag ? (
                <span className="rounded-lg border border-sky-500/25 bg-sky-950/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-200/90">
                  {entityTag}
                </span>
              ) : null}
            </div>
            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
              {heroArtwork}
              <div className="min-w-0 flex-1">
                <h1 className={`${pageTitle} text-balance`}>{label}</h1>
                {thread.music_subtitle ? (
                  <p className={`mt-2 ${pageSubtitle}`}>{thread.music_subtitle}</p>
                ) : null}
                {musicHref ? (
                  <Link
                    href={musicHref}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
                  >
                    View in catalog
                    <span aria-hidden>→</span>
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {reactionTarget ? (
          <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
            <EmojiReactionBar target={reactionTarget} standalone />
          </div>
        ) : detail.reactions.length > 0 ? (
          <div className="border-b border-white/[0.06] px-5 py-3 sm:px-6">
            <div className="flex flex-wrap gap-3 text-sm">
              {detail.reactions.map((r) => (
                <span
                  key={r.emoji}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900/60 px-2.5 py-1 ring-1 ring-white/[0.06]"
                >
                  <span aria-hidden>{r.emoji}</span>
                  <span className="tabular-nums text-zinc-400">{r.count}</span>
                  {r.mine ? (
                    <span className="text-[10px] font-medium uppercase text-zinc-500">
                      you
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="bg-zinc-950/35 px-5 py-6 sm:px-6">
          <h2 className={communityMetaLabel}>Notes</h2>
          {replies.length === 0 ? (
            <p className={`mt-4 ${communityMeta}`}>
              No notes yet — add one below.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {replies.map((r) => {
                const who = r.author_username ?? "someone";
                const me = r.user_id === session.user.id;
                return (
                  <li key={r.id}>
                    <div
                      className={`rounded-xl px-4 py-3 ${communityInset}`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span
                          className={`text-sm font-medium ${
                            me ? "text-emerald-400/95" : "text-zinc-300"
                          }`}
                        >
                          {me ? "You" : `@${who}`}
                        </span>
                        <time
                          className="text-[11px] tabular-nums text-zinc-600"
                          dateTime={r.created_at}
                        >
                          {formatRelativeTime(r.created_at)}
                        </time>
                      </div>
                      <p className={`mt-2 whitespace-pre-wrap ${communityBody}`}>
                        {r.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <ThreadReplyForm
            threadId={threadId}
            threadKind={thread.kind as ThreadKindUiKey}
          />
        </div>
      </article>
    </div>
  );
}
