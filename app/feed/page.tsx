import { redirect } from "next/navigation";

/** Feed lives on the home route; keep /feed as a stable alias for bookmarks and tests. */
export default function FeedRedirectPage() {
  redirect("/");
}
