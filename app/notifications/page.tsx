import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getNotifications } from "@/lib/queries";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const notifications = await getNotifications(session.user.id, 50);
  const actorIds = [...new Set((notifications.map((n) => n.actor_user_id).filter(Boolean) as string[]))];
  const supabase = await createSupabaseServerClient();
  const { data: users } = actorIds.length > 0
    ? await supabase.from("users").select("id, username").in("id", actorIds)
    : { data: [] };
  const actorMap = new Map((users ?? []).map((u: { id: string; username: string }) => [u.id, u.username]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Notifications</h1>
        <Link href="/" className="text-sm text-emerald-400 hover:underline">← Home</Link>
      </div>
      {notifications.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">No notifications yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border px-4 py-3 ${n.read ? "border-zinc-800 bg-zinc-900/30 text-zinc-400" : "border-zinc-700 bg-zinc-900/50 text-zinc-200"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span>
                  {n.type === "follow" && n.actor_user_id && (
                    <>
                      <Link href={`/profile/${n.actor_user_id ?? ""}`} className="font-medium text-white hover:text-emerald-400 hover:underline">
                        {actorMap.get(n.actor_user_id ?? "") ?? "Someone"}
                      </Link>
                      {" started following you"}
                    </>
                  )}
                  {n.type !== "follow" && (
                    <span className="capitalize">{n.type.replace(/_/g, " ")}</span>
                  )}
                </span>
                <span className="text-xs text-zinc-500">{new Date(n.created_at).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
