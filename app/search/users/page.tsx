import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { PageHeading } from "@/components/ui/page-heading";
import { contentMax2xl } from "@/lib/ui/layout";
import { UserSearchContent } from "./user-search-content";
import { sectionGap } from "@/lib/ui/surface";

export default async function SearchUsersPage() {
  const session = await getServerSession(authOptions);
  const viewerUserId = session?.user?.id ?? null;

  return (
    <div className={`${contentMax2xl} ${sectionGap}`}>
      <Link
        href="/explore"
        className="text-sm font-medium text-zinc-500 transition hover:text-emerald-400"
      >
        ← Explore
      </Link>
      <PageHeading
        className="mt-3"
        title="Find people"
        description={
          viewerUserId
            ? "Browse everyone who joined, or search by username."
            : "Browse public profiles and search by username — sign in to follow."
        }
      />
      <UserSearchContent viewerUserId={viewerUserId} />
    </div>
  );
}
