import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { getListeningReportPreview } from "@/lib/profile/listening-report-preview";

export const GET = withHandler(
  async (_request, { user }) => {
    const data = await getListeningReportPreview(user!.id).catch((e) => {
      console.error("[api/me/listening-report] getListeningReportPreview failed:", e);
      return null;
    });
    return apiOk(data);
  },
  { requireAuth: true },
);
