import Link from "next/link";
import { contentMax2xl } from "@/lib/ui/layout";
import { ReportsTabs } from "@/components/reports/reports-tabs";

export default function ReportsTabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${contentMax2xl} py-8`}>
      <Link
        href="/you"
        className="text-sm text-gold-400 hover:underline"
      >
        ← You
      </Link>
      <div className="mt-5">
        <ReportsTabs />
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
