import { Redirect } from "expo-router";

/** Invites are shown on the Communities tab. */
export default function CommunityInvitesRedirect() {
  return <Redirect href="/(tabs)/communities" />;
}
