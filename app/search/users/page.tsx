import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { PageHeading } from "@/components/ui/page-heading";
import { UserSearchContent } from "./user-search-content";
import { sectionGap } from "@/lib/ui/surface";

export default async function SearchUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  return (
    <div className={`mx-auto max-w-2xl px-2 sm:px-0 ${sectionGap}`}>
      <Link
        href="/explore"
        className="text-sm font-medium text-zinc-500 transition hover:text-emerald-400"
      >
        ← Explore
      </Link>
      <PageHeading
        className="mt-3"
        title="Find people"
        description="Browse everyone who joined, or search by username."
      />
      <UserSearchContent />
    </div>
  );
}
