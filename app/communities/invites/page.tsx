import { redirect } from "next/navigation";

/** Old path — invites live on `/communities`. */
export default function CommunityInvitesRedirectPage() {
  redirect("/communities");
}
