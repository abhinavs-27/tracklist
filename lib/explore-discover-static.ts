export type ExploreDiscoverLink = {
  href: string;
  label: string;
  variant: "primary" | "secondary";
};

export type ExploreDiscoverPayload = {
  headline: string;
  description: string;
  links: ExploreDiscoverLink[];
};

/** Static copy for the Discover CTA; no DB. */
export function getExploreDiscoverStaticPayload(): ExploreDiscoverPayload {
  return {
    headline: "Discover",
    description: "Rising artists, hidden gems, and personalized picks.",
    links: [
      { href: "/discover", label: "Go to Discover", variant: "primary" },
      {
        href: "/discover/recommended",
        label: "For you",
        variant: "secondary",
      },
    ],
  };
}
