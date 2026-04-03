import {
  communityMeta,
  communityMetaLabel,
  sectionTitle,
} from "@/lib/ui/surface";

type Props = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Semantic section with a clear heading for community detail layout.
 * Use for page regions; nest card titles as h3 inside children where needed.
 */
export function CommunityPageSection({
  id,
  eyebrow,
  title,
  description,
  children,
  className = "",
}: Props) {
  return (
    <section
      id={id}
      className={`${id ? "scroll-mt-28 3xl:scroll-mt-36" : "scroll-mt-6"} ${className}`}
    >
      <header className="mb-5 border-b border-white/[0.06] pb-4 sm:mb-6 sm:pb-5">
        {eyebrow ? <p className={communityMetaLabel}>{eyebrow}</p> : null}
        <h2 className={sectionTitle}>{title}</h2>
        {description ? (
          <p className={`mt-2 max-w-2xl ${communityMeta}`}>{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
