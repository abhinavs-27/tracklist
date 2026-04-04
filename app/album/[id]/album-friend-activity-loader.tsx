import React from "react";
import { getFriendsAlbumActivity, type FriendAlbumActivityRow } from "@/lib/queries";

type AlbumFriendActivityLoaderProps = {
  viewerId: string | null;
  albumId: string;
  children: (friendActivity: FriendAlbumActivityRow[]) => React.ReactNode;
};

export async function AlbumFriendActivityLoader({ viewerId, albumId, children }: AlbumFriendActivityLoaderProps) {
  const friendActivity = viewerId
    ? await getFriendsAlbumActivity(viewerId, albumId, 10)
    : [];
  return <>{children(friendActivity)}</>;
}
