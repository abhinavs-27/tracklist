import type { ReactNode } from "react";
import {
  layoutMainColumn,
  layoutMainSidebarGrid,
  layoutSidebarColumn,
} from "@/lib/ui/layout";

type PageWithSidebarProps = {
  main: ReactNode;
  sidebar: ReactNode;
};

/**
 * Desktop (lg+): 12-column grid — main 8, sidebar 4 inside max-w-6xl page shell.
 * Below lg: stacked sections with relaxed vertical gap (`layoutStackGap`).
 */
export function PageWithSidebar({ main, sidebar }: PageWithSidebarProps) {
  return (
    <div className={layoutMainSidebarGrid}>
      <div className={layoutMainColumn}>{main}</div>
      <aside className={layoutSidebarColumn}>{sidebar}</aside>
    </div>
  );
}
