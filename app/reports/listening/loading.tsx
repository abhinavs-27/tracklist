import { InlineLoading } from "@/components/ui/loading-states";

export default function ListeningReportLoading() {
  return (
    <InlineLoading
      message="Preparing your listening report…"
      className="min-h-[50vh]"
      size="xl"
    />
  );
}
