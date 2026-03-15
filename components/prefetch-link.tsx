"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type PrefetchLinkProps = React.ComponentProps<typeof Link> & {
  /** Prefetch on hover (default true when href is string). */
  prefetchOnHover?: boolean;
};

export function PrefetchLink({
  href,
  prefetchOnHover = true,
  onMouseEnter,
  ...rest
}: PrefetchLinkProps) {
  const router = useRouter();
  const hrefStr =
    typeof href === "string"
      ? href
      : typeof href === "object" && href !== null && "pathname" in href
        ? (href as { pathname: string }).pathname
        : "";

  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={(e) => {
        if (prefetchOnHover && hrefStr.startsWith("/")) {
          router.prefetch(hrefStr);
        }
        onMouseEnter?.(e);
      }}
      {...rest}
    />
  );
}
