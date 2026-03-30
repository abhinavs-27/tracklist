import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { LikeReactionBar } from "@/components/reactions/like-reaction-bar";
import { LIKES_ENABLED } from "@/lib/feature-likes";
import { InboxPageNav } from "@/components/social/inbox-page-nav";
import { ThreadReplyForm } from "@/components/social/thread-reply-form";
import {
  entityTypeShort,
  threadKindUi,
  type ThreadKindUiKey,
} from "@/lib/social/thread-kind-ui";
import { sendBackPrefillFromThread } from "@/lib/social/send-back-prefill";
import {
  getThreadDetail,
  markThreadRead,
  musicLabelForThread,
  threadMusicHref,
} from "@/lib/social/threads";
import { ThreadSendBackCta } from "@/components/social/thread-send-back-cta";
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

  await markThreadRead(threadId, session.user.id);

  const {
    thread,
    replies,
    counterpart_user_id,
    counterpart_username,
    recommendation_sender_id,
    recommendation_recipient_id,
    recommendation_sender_username,
    recommendation_recipient_username,
  } = detail;
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

  const sendBackRecipientId =
    counterpart_user_id && counterpart_user_id !== session.user.id
      ? counterpart_user_id
      : null;
  const sendBackPrefill = sendBackRecipientId
    ? sendBackPrefillFromThread(thread)
    : null;

  const heroArtwork =
    thread.music_image_url ? (
      <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-3xl bg-zinc-900 shadow-[0_24px_64px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.1] sm:h-44 sm:w-44">
        <Image
          src={thread.music_image_url}
          alt=""
          width={176}
          height={176}
          className="h-full w-full object-cover"
          unoptimized
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-white/[0.03]" />
      </div>
    ) : (
      <div
        className={`flex h-40 w-40 shrink-0 items-center justify-center rounded-3xl text-5xl ring-1 sm:h-44 sm:w-44 sm:text-6xl ${
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
    <div
      className={`relative min-h-[calc(100vh-4rem)] bg-gradient-to-b from-zinc-950 via-zinc-950 to-black ${sectionGap}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_70%_50%_at_50%_-5%,rgba(16,185,129,0.1),transparent)]"
        aria-hidden
      />
      <div className={`relative mx-auto max-w-2xl px-4 py-8 sm:px-6 ${sectionGap}`}>
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

      <article
        className={`${communityCard} relative overflow-hidden p-0 backdrop-blur-sm ${ui.accentBorder}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent" />
        <div className="relative border-b border-white/[0.06] px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-lg px-2.5 py-1 ${ui.badge}`}>
              {ui.label}
            </span>
            {thread.kind !== "recommendation" && counterpart_user_id ? (
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
          <p className={`mt-4 max-w-prose text-sm text-zinc-500`}>
            {ui.detailSubhead}
          </p>
        </div>

        {thread.kind === "recommendation" ? (
          <div className="relative border-b border-white/[0.06] bg-gradient-to-b from-zinc-950/50 via-zinc-950/25 to-transparent px-5 py-8 sm:px-6">
            {recommendation_sender_id &&
            recommendation_recipient_id &&
            recommendation_sender_id !== recommendation_recipient_id ? (
              <div className="mb-8 grid gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="min-w-0 rounded-xl bg-emerald-950/25 px-4 py-3 ring-1 ring-emerald-500/20">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/90">
                    To
                  </p>
                  <p className="mt-1.5 text-lg font-semibold tracking-tight text-white">
                    {recommendation_recipient_id === session.user.id ? (
                      "You"
                    ) : (
                      <Link
                        href={`/profile/${recommendation_recipient_id}`}
                        className="hover:text-emerald-200 hover:underline"
                      >
                        @{recommendation_recipient_username ?? "recipient"}
                      </Link>
                    )}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl bg-zinc-900/60 px-4 py-3 ring-1 ring-white/[0.06]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    From
                  </p>
                  <p className="mt-1.5 text-lg font-semibold tracking-tight text-white">
                    {recommendation_sender_id === session.user.id ? (
                      "You"
                    ) : (
                      <Link
                        href={`/profile/${recommendation_sender_id}`}
                        className="hover:text-zinc-100 hover:underline"
                      >
                        @{recommendation_sender_username ?? "sender"}
                      </Link>
                    )}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-8 sm:flex-row sm:items-end">
              {heroArtwork}
              <div className="min-w-0 flex-1 space-y-3">
                <h1 className={`${pageTitle} text-balance text-2xl sm:text-3xl`}>
                  {label}
                </h1>
                {thread.music_subtitle ? (
                  <p className={`${pageSubtitle} line-clamp-2`}>
                    {thread.music_subtitle}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                {musicHref ? (
                  <Link
                    href={musicHref}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
                  >
                    Open in catalog
                    <span aria-hidden>→</span>
                  </Link>
                ) : null}
                {sendBackRecipientId && sendBackPrefill ? (
                  <ThreadSendBackCta
                    recipientUserId={sendBackRecipientId}
                    prefill={sendBackPrefill}
                  />
                ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {thread.kind === "taste_comparison" ? (
          <div
            className={`relative border-b border-white/[0.06] px-5 py-12 sm:px-6 ${ui.heroPanel}`}
          >
            <div className="mx-auto flex max-w-md flex-col items-center text-center">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-3xl bg-violet-500/15 text-4xl text-violet-300 ring-1 ring-violet-400/25 shadow-[0_20px_48px_-16px_rgba(139,92,246,0.35)]"
                aria-hidden
              >
                {ui.iconPlaceholder}
              </div>
              <h1 className={`mt-6 ${pageTitle} text-2xl`}>Taste match</h1>
              <p className="mt-3 text-sm text-zinc-500">
                Overlap and affinity — notes are optional.
              </p>
              {sendBackRecipientId && sendBackPrefill ? (
                <div className="mt-8">
                  <ThreadSendBackCta
                    recipientUserId={sendBackRecipientId}
                    prefill={sendBackPrefill}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {thread.kind === "activity" ? (
          <div className="relative border-b border-white/[0.06] bg-gradient-to-b from-zinc-950/40 to-transparent px-5 py-8 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              {entityTag ? (
                <span className="rounded-lg border border-sky-500/25 bg-sky-950/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-200/90">
                  {entityTag}
                </span>
              ) : null}
            </div>
            <div className="mt-6 flex flex-col gap-8 sm:flex-row sm:items-end">
              {heroArtwork}
              <div className="min-w-0 flex-1 space-y-3">
                <h1 className={`${pageTitle} text-balance text-2xl sm:text-3xl`}>
                  {label}
                </h1>
                {thread.music_subtitle ? (
                  <p className={`${pageSubtitle} line-clamp-2`}>
                    {thread.music_subtitle}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                {musicHref ? (
                  <Link
                    href={musicHref}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
                  >
                    View in catalog
                    <span aria-hidden>→</span>
                  </Link>
                ) : null}
                {sendBackRecipientId && sendBackPrefill ? (
                  <ThreadSendBackCta
                    recipientUserId={sendBackRecipientId}
                    prefill={sendBackPrefill}
                  />
                ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {LIKES_ENABLED && reactionTarget ? (
          <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
            <LikeReactionBar target={reactionTarget} standalone />
          </div>
        ) : LIKES_ENABLED && detail.reactions.length > 0 ? (
          <div className="border-b border-white/[0.06] px-5 py-3 sm:px-6">
            <p className="text-sm text-zinc-400">
              <span className="font-medium text-zinc-200">
                {detail.reactions.reduce((n, r) => n + r.count, 0)}
              </span>{" "}
              like
              {detail.reactions.reduce((n, r) => n + r.count, 0) === 1 ? "" : "s"}
              {detail.reactions.some((r) => r.mine) ? (
                <span className="text-zinc-500"> · You liked this</span>
              ) : null}
            </p>
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
    </div>
  );
}
