import Link from "next/link";
import { listUsersByCreatedAt } from "@/lib/queries";
import { cardElevatedInteractive } from "@/lib/ui/surface";

export async function VisitorProfilesStrip() {
  const users = await listUsersByCreatedAt(8, 0, null);
  if (users.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl bg-zinc-900/35 px-4 py-4 ring-1 ring-white/[0.06] sm:px-5`}
    >
      <p className="w-full text-sm text-zinc-400 sm:w-auto sm:pr-2">
        People on Tracklist
      </p>
      <div className="flex flex-wrap gap-2">
        {users.map((u) => (
          <Link
            key={u.id}
            href={`/profile/${u.id}`}
            title={`@${u.username}`}
            className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ${cardElevatedInteractive}`}
          >
            {u.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={u.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-medium text-zinc-300">
                {u.username[0]?.toUpperCase() ?? "?"}
              </span>
            )}
          </Link>
        ))}
      </div>
      <Link
        href="/search/users"
        className="ml-auto text-sm font-medium text-emerald-400/95 hover:text-emerald-300"
      >
        Browse everyone →
      </Link>
    </div>
  );
}
