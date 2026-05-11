import { getSession } from "@/lib/auth";
import { contentMax2xl } from "@/lib/ui/layout";
import { UserSearchContent } from "./user-search-content";

export default async function SearchUsersPage() {
  const session = await getSession();
  const viewerUserId = session?.user?.id ?? null;

  return (
    <div className={contentMax2xl}>
      <UserSearchContent viewerUserId={viewerUserId} />
    </div>
  );
}
