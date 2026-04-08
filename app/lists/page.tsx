import Link from "next/link";
import { getSession } from "@/lib/auth";
import { contentMax4xl } from "@/lib/ui/layout";
import { cardMutedCompact, cardOutlined } from "@/lib/ui/surface";
import { ListsSearchContent } from "./lists-search-content";

/**
 * Dedicated lists page: search lists by title. Your own lists live on your profile.
 */
export default async function ListsPage() {
  const session = await getSession();
  const userId = session?.user ? (session.user as { id?: string }).id : null;

  return (
    <div className={`${contentMax4xl} space-y-6`}>
      <h1 className="text-2xl font-bold text-white">Browse lists</h1>
      <p className="text-zinc-400">
        Search lists by title. Create and manage your own lists on your profile.
      </p>

      {userId && (
        <div className={cardMutedCompact}>
          <Link href="/you" className="text-emerald-400 hover:underline">
            You hub →
          </Link>
          <span className="ml-2 text-zinc-500">
            Create and view your lists on your profile.
          </span>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Search lists</h2>
        <ListsSearchContent />
      </section>

      {!session && (
        <div className={cardOutlined}>
          <p className="text-zinc-500">
            <Link href="/auth/signin" className="text-emerald-400 hover:underline">
              Sign in
            </Link>
            {" to create your own lists on your profile."}
          </p>
        </div>
      )}
    </div>
  );
}
