import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: { label: string; href: string };
  /** e.g. a client button next to the section title */
  headerRight?: ReactNode;
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
  headerRight,
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
        <div className="flex flex-wrap items-center justify-end gap-3">
          {headerRight}
          {action ? (
            <Link
              href={action.href}
              className="shrink-0 text-sm font-medium text-emerald-400/95 transition hover:text-emerald-300"
            >
              {action.label}
            </Link>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}
