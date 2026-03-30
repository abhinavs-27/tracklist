import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  getSocialInbox,
  resolveSocialInboxUsernames,
  type SocialInboxItem,
} from "@/lib/social/inbox";
import { formatRelativeTime } from "@/lib/time";
import { cardElevated, sectionGap, sectionTitle } from "@/lib/ui/surface";

function kindLabel(kind: SocialInboxItem["kind"]): string {
  switch (kind) {
    case "recommendation_received":
      return "Received";
    case "recommendation_sent":
      return "Sent";
    case "reaction":
      return "Reaction";
    case "taste_comparison":
      return "Taste match";
  }
}

function InboxRow({
  item,
  names,
}: {
  item: SocialInboxItem;
  names: Map<string, string>;
}) {
  const time = formatRelativeTime(item.at);

  if (item.kind === "recommendation_received") {
    const who = item.actorId
      ? (names.get(item.actorId) ?? "Someone")
      : "Someone";
    return (
      <li className="flex flex-col gap-1 border-b border-zinc-800/80 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {kindLabel(item.kind)}
          </p>
          <p className="mt-1 text-sm text-zinc-200">
            <span className="font-medium text-white">{who}</span>
            {" recommended "}
            {item.href ? (
              <Link
                href={item.href}
                className="font-medium text-emerald-400 hover:underline"
              >
                {item.title}
              </Link>
            ) : (
              <span className="text-zinc-100">{item.title}</span>
            )}
          </p>
        </div>
        <time
          className="shrink-0 text-xs tabular-nums text-zinc-500 sm:pt-5"
          dateTime={item.at}
        >
          {time}
        </time>
      </li>
    );
  }

  if (item.kind === "recommendation_sent") {
    const to = names.get(item.recipientUserId) ?? "Someone";
    return (
      <li className="flex flex-col gap-1 border-b border-zinc-800/80 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {kindLabel(item.kind)}
          </p>
          <p className="mt-1 text-sm text-zinc-200">
            You recommended{" "}
            {item.href ? (
              <Link
                href={item.href}
                className="font-medium text-emerald-400 hover:underline"
              >
                {item.title}
              </Link>
            ) : (
              <span className="text-zinc-100">{item.title}</span>
            )}
            {" to "}
            <Link
              href={`/profile/${item.recipientUserId}`}
              className="font-medium text-white hover:text-emerald-400 hover:underline"
            >
              {to}
            </Link>
            .
          </p>
        </div>
        <time
          className="shrink-0 text-xs tabular-nums text-zinc-500 sm:pt-5"
          dateTime={item.at}
        >
          {time}
        </time>
      </li>
    );
  }

  if (item.kind === "reaction") {
    const who = names.get(item.fromUserId) ?? "Someone";
    const subject =
      item.href ? (
        <Link href={item.href} className="text-emerald-400 hover:underline">
          {item.subjectLabel}
        </Link>
      ) : (
        <span className="text-zinc-100">{item.subjectLabel}</span>
      );
    return (
      <li className="flex flex-col gap-1 border-b border-zinc-800/80 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {kindLabel(item.kind)}
          </p>
          <p className="mt-1 text-sm text-zinc-200">
            <span className="font-medium text-white">{who}</span>
            {" reacted with "}
            <span aria-hidden>{item.emoji}</span>
            {item.context === "recommendation" ? (
              <> to your recommendation of {subject}</>
            ) : (
              <> to your review of {subject}</>
            )}
          </p>
        </div>
        <time
          className="shrink-0 text-xs tabular-nums text-zinc-500 sm:pt-5"
          dateTime={item.at}
        >
          {time}
        </time>
      </li>
    );
  }

  const other = names.get(item.otherUserId) ?? "Someone";
  return (
    <li className="flex flex-col gap-1 border-b border-zinc-800/80 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {kindLabel(item.kind)}
        </p>
        <p className="mt-1 text-sm text-zinc-200">
          You compared taste with{" "}
          <Link
            href={`/profile/${item.otherUserId}`}
            className="font-medium text-emerald-400 hover:underline"
          >
            {other}
          </Link>
          .
        </p>
      </div>
      <time
        className="shrink-0 text-xs tabular-nums text-zinc-500 sm:pt-5"
        dateTime={item.at}
      >
        {time}
      </time>
    </li>
  );
}

export default async function SocialInboxPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const items = await getSocialInbox(session.user.id, 80);
  const names = await resolveSocialInboxUsernames(items);

  return (
    <div className={`mx-auto max-w-2xl px-4 py-8 sm:px-6 ${sectionGap}`}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={sectionTitle}>Social inbox</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Recommendations you sent and received, reactions on your activity,
            and taste comparisons — newest first.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/notifications"
            className="text-emerald-400 hover:underline"
          >
            Notifications
          </Link>
          <Link href="/" className="text-zinc-400 hover:text-white hover:underline">
            Home
          </Link>
        </div>
      </header>

      {items.length === 0 ? (
        <div className={`p-10 text-center ${cardElevated}`}>
          <p className="text-zinc-400">
            Nothing here yet. Send or receive recommendations, get reactions, or
            run a taste match from someone&apos;s profile.
          </p>
        </div>
      ) : (
        <ul className={`m-0 list-none p-0 px-4 sm:px-5 ${cardElevated}`}>
          {items.map((item) => (
            <InboxRow key={item.id} item={item} names={names} />
          ))}
        </ul>
      )}
    </div>
  );
}
