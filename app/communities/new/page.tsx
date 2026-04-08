import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHeading } from "@/components/ui/page-heading";
import { contentMaxMd } from "@/lib/ui/layout";
import { CreateCommunityForm } from "./create-community-form";
import { sectionGap } from "@/lib/ui/surface";

export default async function NewCommunityPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/communities/new");
  }

  return (
    <div className={`${contentMaxMd} py-6 sm:py-8 ${sectionGap}`}>
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
