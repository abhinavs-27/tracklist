import Link from "next/link";
import { cardElevated } from "@/lib/ui/surface";

export type ListCardProps = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  item_count: number;
  visibility?: "public" | "friends" | "private";
  /** When set, show "by @username" and link to profile (e.g. on browse/search). */
  owner_username?: string | null;
  emoji?: string | null;
  image_url?: string | null;
  /** First few album or track names from the list */
  preview_labels?: string[];
};

export function ListCard({
  id,
  title,
  description,
  created_at,
  item_count,
  visibility,
  owner_username,
  emoji,
  image_url,
  preview_labels,
}: ListCardProps) {
  const displayTitle = emoji ? `${emoji} ${title}` : title;
  const previewLine =
    preview_labels && preview_labels.length > 0
      ? preview_labels.slice(0, 4).join(" · ")
      : null;

  return (
    <Link
      href={`/lists/${id}`}
      className={`flex min-h-[140px] flex-col ${cardElevated} p-4 transition hover:bg-zinc-900/65 hover:ring-white/[0.1]`}
    >
      <div className="flex gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-800">
          {image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl">
              {emoji ?? "📋"}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-snug text-white">{displayTitle}</h2>
          {owner_username != null && owner_username !== "" && (
            <p className="mt-0.5 text-xs text-zinc-500">
              by{" "}
              <span className="text-zinc-400">{owner_username}</span>
            </p>
          )}
          {description ? (
            <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{description}</p>
          ) : null}
        </div>
      </div>

      {previewLine ? (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-400">
          <span className="font-medium text-zinc-500">Includes </span>
          {previewLine}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-xs text-zinc-500">
        <span>
          {item_count} item{item_count !== 1 ? "s" : ""}
        </span>
        <span className="text-zinc-700">·</span>
        <span>{new Date(created_at).toLocaleDateString()}</span>
        {visibility ? (
          <>
            <span className="text-zinc-700">·</span>
            <span>
              {visibility === "public"
                ? "Public"
                : visibility === "friends"
                  ? "Friends only"
                  : "Private"}
            </span>
          </>
        ) : null}
      </div>
    </Link>
  );
}
