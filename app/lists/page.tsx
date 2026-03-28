import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ListsSearchContent } from "./lists-search-content";

/**
 * Dedicated lists page: search lists by title. Your own lists live on your profile.
 */
export default async function ListsPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? (session.user as { id?: string }).id : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Browse lists</h1>
      <p className="text-zinc-400">
        Search lists by title. Create and manage your own lists on your profile.
      </p>

      {userId && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3">
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
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
