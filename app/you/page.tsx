import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getTopThisWeek } from "@/lib/profile/top-this-week";
import { getUserListsWithPreviews } from "@/lib/queries";
import { SectionBlock } from "@/components/layout/section-block";
import { ListCard } from "@/components/list-card";
import { ProfileTopThisWeekSection } from "@/components/profile/profile-top-this-week";
import { cardElevated, pageTitle, sectionGap } from "@/lib/ui/surface";

const profileLinkCard = `${cardElevated} bg-gradient-to-br from-zinc-900/95 via-zinc-900/90 to-emerald-950/25 ring-1 ring-white/[0.08]`;

export default async function YouHubPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/you");
  }

  const userId = session.user.id;
  const supabase = createSupabaseAdminClient();

  const [userRes, lists, topWeek] = await Promise.all([
    supabase
      .from("users")
      .select("id, username, avatar_url, bio")
      .eq("id", userId)
      .maybeSingle(),
    getUserListsWithPreviews(userId, 4, 0),
    getTopThisWeek(userId),
  ]);
  const { data: user } = userRes;

  const u = user as {
    id: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
  } | null;

  return (
    <div className={sectionGap}>
      <header>
        <h1 className={pageTitle}>You</h1>
        <p className="mt-3 text-base text-zinc-400 sm:text-lg">
          Hub for your stats and lists. Open your profile for the full experience —
          weekly tops, recent activity, taste, and account settings.
        </p>
      </header>

      <Link
        href={`/profile/${userId}`}
        className={`block ${profileLinkCard} p-5 transition hover:bg-zinc-900/70 sm:p-6`}
      >
        <div className="flex items-start gap-4">
          {u?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={u.avatar_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-white/10 sm:h-20 sm:w-20"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xl text-zinc-300 ring-1 ring-white/10 sm:h-20 sm:w-20">
              {(u?.username ?? "?")[0]?.toUpperCase() ?? "?"}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-white">
              {u?.username ?? "Profile"}
            </h2>
            {u?.bio?.trim() ? (
              <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{u.bio}</p>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                View and edit your public profile →
              </p>
            )}
            <span className="mt-3 inline-flex text-sm font-medium text-emerald-400">
              Open full profile
            </span>
          </div>
        </div>
      </Link>

      <ProfileTopThisWeekSection
        userId={userId}
        compact
        prefetched={topWeek}
      />

      <SectionBlock
        title="Your lists"
        description="Curated albums and tracks."
        action={
          lists.length > 0 ? { label: "View all", href: "/lists" } : undefined
        }
      >
        {lists.length === 0 ? (
          <div className={`${cardElevated} px-4 py-6 text-center text-sm text-zinc-500`}>
            No lists yet.{" "}
            <Link
              href={`/profile/${userId}#profile-lists`}
              className="text-emerald-400 hover:underline"
            >
              Create one on your profile
            </Link>
            .
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {lists.map((list) => (
              <li key={list.id}>
                <ListCard
                  id={list.id}
                  title={list.title}
                  description={list.description}
                  created_at={list.created_at}
                  item_count={list.item_count}
                  visibility={list.visibility}
                  emoji={list.emoji}
                  image_url={list.image_url}
                  preview_labels={list.preview_labels}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionBlock>

      <SectionBlock
        title="Listening reports"
        description="Top artists, albums, and genres across your history."
        action={{ label: "Open reports →", href: "/reports/listening" }}
      >
        <Link
          href="/reports/listening"
          className={`block ${cardElevated} p-5 transition hover:bg-zinc-900/70 sm:p-6`}
        >
          <p className="text-sm leading-relaxed text-zinc-400">
            See patterns in what you listen to — pick a preset or choose your own dates.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <span className="inline-flex rounded-xl bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30">
              Weekly insights
            </span>
            <span className="inline-flex rounded-xl bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 ring-1 ring-white/[0.06]">
              Custom ranges
            </span>
          </div>
          <span className="mt-4 inline-flex text-sm font-medium text-emerald-400">
            View listening reports →
          </span>
        </Link>
      </SectionBlock>
    </div>
  );
}
