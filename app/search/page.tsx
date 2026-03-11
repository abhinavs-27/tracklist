import { Suspense } from 'react';
import { SearchPageContent } from './search-content';

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Search</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading...</p>}>
        <SearchPageContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
