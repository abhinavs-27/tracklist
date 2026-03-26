import { redirect } from "next/navigation";

/** Default reports landing: top artists / albums / tracks / genres. */
export default function ReportsIndexPage() {
  redirect("/reports/listening");
}
