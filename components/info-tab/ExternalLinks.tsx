const LABELS: Record<string, string> = {
  wikipedia: "Wikipedia", discogs: "Discogs", allmusic: "AllMusic",
  soundcloud: "SoundCloud", facebook: "Facebook", instagram: "Instagram", twitter: "Twitter",
};

export function ExternalLinks({ links }: { links: Record<string, string> | null }) {
  const entries = Object.entries(links ?? {}).filter(([k]) => LABELS[k]);
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Links</p>
      <div className="flex flex-wrap gap-2">
        {entries.map(([key, url]) => (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer"
            className="text-[12px] font-medium text-zinc-500 px-3 py-1.5 border border-zinc-800 rounded-full hover:border-zinc-600 hover:text-zinc-300 transition-colors">
            {LABELS[key]}
          </a>
        ))}
      </div>
    </div>
  );
}
