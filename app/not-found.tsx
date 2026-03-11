import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold text-white">Page not found</h1>
      <p className="text-zinc-400">The page you’re looking for doesn’t exist.</p>
      <Link href="/" className="text-emerald-400 hover:underline">
        Go home
      </Link>
    </div>
  );
}
