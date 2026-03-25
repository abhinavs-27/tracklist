import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CreateCommunityForm } from "./create-community-form";

export default async function NewCommunityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/communities/new");
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-8">
      <Link href="/communities" className="text-sm text-emerald-400 hover:underline">
        ← Communities
      </Link>
      <h1 className="text-2xl font-bold text-white">Create community</h1>
      <CreateCommunityForm />
    </div>
  );
}
