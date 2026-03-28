export default function YouLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-10 w-32 rounded-lg bg-zinc-800/70" />
      <div className="h-28 rounded-2xl bg-zinc-900/50 ring-1 ring-white/[0.04]" />
      <div className="h-40 rounded-2xl bg-zinc-900/50 ring-1 ring-white/[0.04]" />
      <div className="h-36 rounded-2xl bg-zinc-900/50 ring-1 ring-white/[0.04]" />
    </div>
  );
}
