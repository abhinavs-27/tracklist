import Link from "next/link";
import type { CommunitySignatureResult, SignatureRole } from "@/lib/community/community-signature";

const ROLE_COLOR: Record<SignatureRole, string> = {
  pioneer:      "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20",
  "deep-diver": "bg-gold-500/15 text-gold-400 ring-1 ring-gold-500/20",
  wildcard:     "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20",
  backbone:     "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/20",
  curator:      "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/20",
  insufficient: "",
};

export function CommunitySignatureCard({
  data,
}: {
  data: CommunitySignatureResult;
}) {
  if (!data.hasData) return null;

  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-4 ring-1 ring-white/[0.04]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Your role here
        </p>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            ROLE_COLOR[data.role]
          }`}
        >
          {data.roleLabel}
        </span>
      </div>

      {/* Narrative */}
      <p className="mt-2.5 text-sm leading-relaxed text-zinc-200">{data.narrative}</p>

      {/* Signature genres */}
      {data.signatureGenres.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Your signature
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.signatureGenres.map((g) => (
              <span
                key={g}
                className="rounded-full bg-zinc-800/60 px-2.5 py-0.5 text-xs font-medium text-zinc-300 ring-1 ring-white/[0.06]"
              >
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Unique artists */}
      {data.uniqueArtists.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Mainly yours
          </p>
          <div className="flex flex-wrap gap-2">
            {data.uniqueArtists.map((a) => (
              <Link
                key={a.id}
                href={`/artist/${a.id}`}
                className="group flex items-center gap-2 rounded-full bg-zinc-800/50 py-1 pl-1 pr-3 ring-1 ring-white/[0.06] transition hover:bg-zinc-700/60 hover:ring-white/[0.1]"
              >
                <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-zinc-700">
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[9px] font-bold text-zinc-400">
                      {a.name[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-zinc-300 group-hover:text-white">
                  {a.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
