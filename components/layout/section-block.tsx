import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: { label: string; href: string };
  children: ReactNode;
  className?: string;
};

/**
 * Hub page section: title, optional “View all”, consistent spacing.
 */
export function SectionBlock({
  title,
  description,
  action,
  children,
  className = "",
}: Props) {
  return (
    <section className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">{description}</p>
          ) : null}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="shrink-0 text-sm font-medium text-emerald-400/95 transition hover:text-emerald-300"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
