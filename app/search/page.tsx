import { Suspense } from 'react';
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
        <p className="text-zinc-500">Search for artists, albums, or tracks</p>
      ) : (
        <Suspense fallback={<p className="text-zinc-500">Loading...</p>}>
          <SearchPageContent searchParams={params} />
        </Suspense>
      )}
    </div>
  );
}
