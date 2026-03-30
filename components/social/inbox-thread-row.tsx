import Image from "next/image";
import Link from "next/link";
import type { ThreadKindUiKey } from "@/lib/social/thread-kind-ui";
import { threadKindUi } from "@/lib/social/thread-kind-ui";
import { cardElevatedInteractive } from "@/lib/ui/surface";

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
}: Props) {
  const ui = threadKindUi(kind);

  return (
    <li>
      <Link
        href={`/social/inbox/${threadId}`}
        className={`group flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch sm:justify-between sm:gap-5 sm:p-5 ${cardElevatedInteractive} ${ui.accentBorder}`}
      >
        <div className="flex min-w-0 flex-1 gap-4">
          {musicImageUrl ? (
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-zinc-900 shadow-inner ring-1 ring-white/[0.06] sm:h-[4.5rem] sm:w-[4.5rem]">
              <Image
                src={musicImageUrl}
                alt=""
                width={72}
                height={72}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                unoptimized
              />
            </div>
          ) : (
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl ring-1 sm:h-[4.5rem] sm:w-[4.5rem] sm:text-2xl ${
                kind === "taste_comparison"
                  ? "bg-violet-950/40 text-violet-400/90 ring-violet-500/20"
                  : kind === "activity"
                    ? "bg-sky-950/35 text-sky-500/90 ring-sky-500/15"
                    : "bg-zinc-900/90 text-zinc-500 ring-white/[0.06]"
              }`}
              aria-hidden
            >
              {ui.iconPlaceholder}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-lg px-2 py-0.5 ${ui.badge}`}
              >
                {ui.label}
              </span>
            </div>
            <p className="mt-2 text-base font-semibold leading-snug tracking-tight text-white group-hover:text-emerald-50/95">
              {title}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              <span className="text-zinc-400">{who}</span>
              <span className="mx-1.5 text-zinc-700">·</span>
              <span className="text-zinc-500">{ui.listHint}</span>
            </p>
            {lastReplyPreview ? (
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-400">
                {lastReplyPreview}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-row items-center justify-between gap-3 border-t border-white/[0.04] pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
          <time
            className="text-xs tabular-nums text-zinc-500"
            dateTime={lastActivityAt}
          >
            {time}
          </time>
          {replyCount > 0 ? (
            <span className="rounded-full bg-zinc-800/80 px-2.5 py-1 text-[11px] font-medium tabular-nums text-zinc-400 ring-1 ring-white/[0.06]">
              {replyCount} note{replyCount === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-[11px] text-zinc-600">No notes yet</span>
          )}
        </div>
      </Link>
    </li>
  );
}
