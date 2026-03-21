import Link from 'next/link';
import { Suspense } from 'react';
import { SearchBar } from '@/components/search-bar';
import { SearchPageContent } from './search-content';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Search</h1>
      {q === '' ? (
        <>
          <div className="mb-6 max-w-xl">
            <SearchBar placeholder="Search artists, albums, or tracks…" />
          </div>
          <p className="text-sm text-zinc-500">
            <Link href="/search/users" className="text-emerald-400 hover:underline">
              Find people by username →
            </Link>
          </p>
        </>
      ) : (
        <Suspense fallback={<p className="text-zinc-500">Loading...</p>}>
          <SearchPageContent searchParams={params} />
        </Suspense>
      )}
    </div>
  );
}
