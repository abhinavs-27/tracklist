import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { PageHeading } from "@/components/ui/page-heading";
import { CreateCommunityForm } from "./create-community-form";
import { sectionGap } from "@/lib/ui/surface";

export default async function NewCommunityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/communities/new");
  }

  return (
    <div className={`mx-auto max-w-md px-2 py-6 sm:px-0 sm:py-8 ${sectionGap}`}>
      <Link
        href="/communities"
        className="inline-block text-sm font-medium text-emerald-400 transition hover:text-emerald-300 hover:underline"
      >
        ← Communities
      </Link>
      <PageHeading title="Create community" />
      <CreateCommunityForm />
    </div>
  );
}
