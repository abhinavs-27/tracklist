import Image from "next/image";
import Link from "next/link";
import { InboxSendBackButton } from "@/components/social/inbox-send-back-button";
import type { ThreadKindUiKey } from "@/lib/social/thread-kind-ui";
import { threadKindUi } from "@/lib/social/thread-kind-ui";
import { LIKES_ENABLED } from "@/lib/feature-likes";
import type { SendBackPrefill } from "@/lib/social/send-back-prefill";

type RecPeople = {
  viewerId: string;
  senderId: string | null;
  recipientId: string | null;
  senderName: string;
  recipientName: string;
};

type Props = {
  threadId: string;
  kind: ThreadKindUiKey;
  title: string;
  who: string;
  time: string;
  lastActivityAt: string;
  musicImageUrl: string | null;
  lastReplyPreview: string | null;
  replyCount: number;
  recommendationPeople?: RecPeople | null;
  reactionTotal: number;
  viewerReactionEmoji: string | null;
  isUnread: boolean;
  needsResponse: boolean;
  sendBackRecipientId: string | null;
  sendBackPrefill: SendBackPrefill | null;
};

export function InboxThreadRow({
  threadId,
  kind,
  title,
  who,
  time,
  lastActivityAt,
  musicImageUrl,
  lastReplyPreview,
  replyCount,
  recommendationPeople,
  reactionTotal,
  viewerReactionEmoji,
  isUnread,
  needsResponse,
  sendBackRecipientId,
  sendBackPrefill,
}: Props) {
  const ui = threadKindUi(kind);
  const rec = recommendationPeople;
  const showRec =
    kind === "recommendation" &&
    rec &&
    rec.senderId &&
    rec.recipientId &&
    rec.senderId !== rec.recipientId;

  const showSendBack = Boolean(sendBackRecipientId && sendBackPrefill);

  return (
    <li className="relative">
      <Link
        href={`/social/inbox/${threadId}`}
        className="absolute inset-0 z-0 rounded-[1.35rem]"
        aria-label={`Open thread: ${title}`}
      />
      <div
        className={`group pointer-events-none relative z-[1] overflow-hidden rounded-[1.35rem] ring-1 transition ${
          isUnread
            ? "bg-gradient-to-br from-zinc-900/95 via-zinc-950/98 to-black ring-emerald-500/25 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
            : "bg-gradient-to-br from-zinc-900/80 via-zinc-950/95 to-black ring-white/[0.06]"
        }`}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full bg-emerald-500/[0.06] blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-violet-500/[0.05] blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch sm:gap-5 sm:p-5">
          <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
            <div className="relative shrink-0">
              {isUnread ? (
                <span
                  className="absolute -left-1 top-1/2 z-[2] h-2 w-2 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]"
                  aria-label="Unread"
                />
              ) : null}
              {musicImageUrl ? (
                <div className="relative h-[7.25rem] w-[7.25rem] overflow-hidden rounded-2xl bg-zinc-900 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.08] sm:h-[8.5rem] sm:w-[8.5rem]">
                  <Image
                    src={musicImageUrl}
                    alt=""
                    width={136}
                    height={136}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-80" />
                </div>
              ) : (
                <div
                  className={`flex h-[7.25rem] w-[7.25rem] items-center justify-center rounded-2xl text-4xl ring-1 sm:h-[8.5rem] sm:w-[8.5rem] sm:text-5xl ${
                    kind === "taste_comparison"
                      ? "bg-violet-950/50 text-violet-400/90 ring-violet-500/25"
                      : kind === "activity"
                        ? "bg-sky-950/40 text-sky-400/90 ring-sky-500/20"
                        : "bg-zinc-900/90 text-zinc-500 ring-white/[0.08]"
                  }`}
                  aria-hidden
                >
                  {ui.iconPlaceholder}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-lg px-2 py-0.5 ${ui.badge}`}
                >
                  {ui.label}
                </span>
                {needsResponse ? (
                  <span className="inline-flex items-center rounded-lg border border-amber-500/35 bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200/95">
                    Needs response
                  </span>
                ) : null}
              </div>

              {showRec ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="min-w-0 rounded-xl bg-emerald-950/30 px-2.5 py-2 ring-1 ring-emerald-500/15">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-400/85">
                        To
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-white">
                        {rec.recipientId === rec.viewerId ? (
                          "You"
                        ) : (
                          <Link
                            href={`/profile/${rec.recipientId}`}
                            className="pointer-events-auto hover:text-emerald-100 hover:underline"
                          >
                            @{rec.recipientName}
                          </Link>
                        )}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-xl bg-zinc-900/50 px-2.5 py-2 ring-1 ring-white/[0.06]">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        From
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-white">
                        {rec.senderId === rec.viewerId ? (
                          "You"
                        ) : (
                          <Link
                            href={`/profile/${rec.senderId}`}
                            className="pointer-events-auto hover:text-white hover:underline"
                          >
                            @{rec.senderName}
                          </Link>
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-lg font-semibold leading-snug tracking-tight text-white">
                    {title}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-lg font-semibold leading-snug tracking-tight text-white">
                    {title}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
                    {who} · {ui.listHint}
                  </p>
                </>
              )}

              {lastReplyPreview ? (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-400">
                  {lastReplyPreview}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-t border-white/[0.05] pt-3 sm:w-44 sm:border-t-0 sm:pt-0">
            <time
              className="text-xs tabular-nums text-zinc-500 sm:text-right"
              dateTime={lastActivityAt}
            >
              {time}
            </time>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {LIKES_ENABLED && reactionTotal > 0 ? (
                <span
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-rose-500/12 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-rose-200/95 ring-1 ring-rose-500/30"
                  title="Likes on this thread"
                >
                  <span className="text-[9px] uppercase tracking-[0.1em] text-rose-400/90">
                    Likes
                  </span>
                  {reactionTotal}
                  {viewerReactionEmoji ? (
                    <span className="text-zinc-200/95" aria-label="You liked this">
                      · You
                    </span>
                  ) : null}
                </span>
              ) : null}
              {replyCount > 0 ? (
                <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium tabular-nums text-zinc-400 ring-1 ring-white/[0.06]">
                  {replyCount} note{replyCount === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="text-[11px] text-zinc-600">No notes</span>
              )}
            </div>
            {showSendBack && sendBackRecipientId && sendBackPrefill ? (
              <div className="sm:ml-auto sm:flex sm:justify-end">
                <InboxSendBackButton
                  recipientUserId={sendBackRecipientId}
                  prefill={sendBackPrefill}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
