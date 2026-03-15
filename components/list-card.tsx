import Link from "next/link";

export type ListCardProps = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  item_count: number;
  visibility?: "public" | "friends" | "private";
  /** When set, show "by @username" and link to profile (e.g. on browse/search). */
  owner_username?: string | null;
};

export function ListCard({
  id,
  title,
  description,
  created_at,
  item_count,
  visibility,
  owner_username,
}: ListCardProps) {
  return (
    <Link
      href={`/lists/${id}`}
      className="block rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-600 hover:bg-zinc-800/50"
    >
      <div className="min-w-0">
        <h2 className="font-semibold text-white">{title}</h2>
          {owner_username != null && owner_username !== "" && (
            <p className="mt-0.5 text-xs text-zinc-500">
              by{" "}
              <span className="text-zinc-400">{owner_username}</span>
            </p>
          )}
          {description ? (
            <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
              {description}
            </p>
          ) : null}
        <p className="mt-2 text-xs text-zinc-500">
          {item_count} item{item_count !== 1 ? "s" : ""} ·{" "}
          {new Date(created_at).toLocaleDateString()}
          {visibility ? (
            <>
              {" "}
              ·{" "}
              {visibility === "public"
                ? "Public"
                : visibility === "friends"
                  ? "Friends only"
                  : "Private"}
            </>
          ) : null}
        </p>
      </div>
    </Link>
  );
}
