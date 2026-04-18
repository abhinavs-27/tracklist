import { getFriendsAlbumActivity } from "@/lib/queries";
import dynamic from "next/dynamic";

const FriendsWhoListened = dynamic(
  () => import("./friends-who-listened").then((m) => ({ default: m.FriendsWhoListened })),
  { loading: () => <div className="h-24 animate-pulse rounded-xl bg-zinc-900/50" /> },
);

export async function AlbumFriendActivity({
  userId,
  albumId,
}: {
  userId: string;
  albumId: string;
}) {
  const friendActivity = await getFriendsAlbumActivity(userId, albumId, 10);
  if (friendActivity.length === 0) return null;
  return <FriendsWhoListened activity={friendActivity} />;
}
