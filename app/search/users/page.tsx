import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { UserSearchContent } from './user-search-content';

export default async function SearchUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  return (
    <div className="mx-auto max-w-2xl px-2 sm:px-0">
      <h1 className="mb-4 text-2xl font-bold text-white">Find users</h1>
      <p className="mb-4 text-zinc-400">Search by username to find people to follow.</p>
      <UserSearchContent />
    </div>
  );
}
