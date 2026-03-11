import Link from 'next/link';
import { notFound } from 'next/navigation';

export default function E2EIndexPage() {
  if (process.env.NEXT_PUBLIC_E2E !== '1') notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">E2E test pages</h1>
      <p className="text-sm text-zinc-400">
        These routes exist only for Playwright. Set <code className="text-zinc-200">NEXT_PUBLIC_E2E=1</code> to enable.
      </p>
      <ul className="list-disc pl-5 text-emerald-400">
        <li>
          <Link href="/e2e/social" className="hover:underline">
            Social (like/comment)
          </Link>
        </li>
        <li>
          <Link href="/e2e/logging" className="hover:underline">
            Logging (album/track modal)
          </Link>
        </li>
        <li>
          <Link href="/e2e/recent-albums" className="hover:underline">
            RecentAlbumsGrid
          </Link>
        </li>
      </ul>
    </div>
  );
}

