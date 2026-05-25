import Link from "next/link";

interface Member { id: string; name: string; role: string | null; is_active: boolean }

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function MembersGrid({ members }: { members: Member[] }) {
  if (members.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Members</p>
      <div className="flex flex-wrap gap-4">
        {members.map((m) => (
          <Link key={m.id} href={`/artist/${m.id}`} className="flex flex-col items-center gap-1.5 group">
            <div className="w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center border border-transparent group-hover:border-gold-500 transition-colors">
              <span className="text-[13px] font-semibold text-zinc-400">{initials(m.name)}</span>
            </div>
            <span className="text-[10px] text-zinc-500 max-w-[56px] text-center leading-tight">{m.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
