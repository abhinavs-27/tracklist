import { InlineLoading } from "@/components/ui/loading-states";

export default function ChartsLoading() {
  return (
    <InlineLoading
      message="Loading your billboard…"
      className="min-h-[40vh]"
      size="xl"
    />
  );
}
