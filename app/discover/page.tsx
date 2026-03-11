import { DiscoverUsersGrid } from '@/components/discover-users-grid';

export default function DiscoverPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Discover</h1>
        <p className="mt-1 text-zinc-400">Find people who are listening right now.</p>
      </header>

      <DiscoverUsersGrid limit={18} />
    </div>
  );
}

