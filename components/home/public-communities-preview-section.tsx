import Link from "next/link";
import { getPublicCommunitiesPreview } from "@/lib/community/public-communities-preview";
import { SectionBlock } from "@/components/layout/section-block";
import { cardElevatedInteractive } from "@/lib/ui/surface";

export async function PublicCommunitiesPreviewSection() {
  const communities = await getPublicCommunitiesPreview(6);

  if (communities.length === 0) {
    return null;
  }

  return (
    <SectionBlock
      title="Community charts"
      description="Each group has a feed and a weekly billboard — poke around a public one below."
      action={{ label: "Explore hub →", href: "/explore" }}
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {communities.map((c) => (
          <li key={c.id}>
            <Link
              href={`/communities/${c.id}`}
              className={`block px-4 py-3 ${cardElevatedInteractive}`}
            >
              <p className="truncate font-medium text-white">{c.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {c.memberCount.toLocaleString()} member
                {c.memberCount !== 1 ? "s" : ""} · Billboard & activity
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </SectionBlock>
  );
}
