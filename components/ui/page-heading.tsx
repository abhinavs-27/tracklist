import type { ReactNode } from "react";
import { pageSubtitle, pageTitle } from "@/lib/ui/surface";

type Props = {
  title: string;
  description?: ReactNode;
  className?: string;
};

/** Consistent page hero: larger headline + optional subtitle. */
export function PageHeading({ title, description, className = "" }: Props) {
  return (
    <header className={`mb-8 sm:mb-10 ${className}`}>
      <h1 className={pageTitle}>{title}</h1>
      {description != null && description !== "" ? (
        <div className={pageSubtitle}>{description}</div>
      ) : null}
    </header>
  );
}
