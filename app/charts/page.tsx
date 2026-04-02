import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ChartsClient } from "./charts-client";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { pageTitle, sectionGap } from "@/lib/ui/surface";

const TYPES: ChartType[] = ["tracks", "artists", "albums"];

function parseType(raw: string | null | undefined): ChartType {
  if (raw && TYPES.includes(raw as ChartType)) return raw as ChartType;
  return "tracks";
}

type PageProps = {
  searchParams?: Promise<{ type?: string; weekStart?: string }>;
};

export default async function WeeklyBillboardPage(props: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/charts");
  }

  const sp = (await props.searchParams) ?? {};
  const initialType = parseType(sp.type);
  const initialWeekStart = sp.weekStart?.trim() || null;

  return (
    <div className={`mx-auto max-w-4xl px-4 py-8 ${sectionGap}`}>
      <header>
        <h1 className={pageTitle}>Weekly Billboard</h1>
        <p className="mt-3 max-w-xl text-base text-zinc-400 sm:text-lg">
          Your top 10 by raw play counts for the latest completed week (Sun–Sat,
          UTC). Updated every Sunday.
        </p>
      </header>
      <ChartsClient
        initialType={initialType}
        initialWeekStart={initialWeekStart}
      />
    </div>
  );
}
