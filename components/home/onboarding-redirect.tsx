import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function OnboardingRedirect({ userId }: { userId: string }) {
  const admin = createSupabaseAdminClient();
  const { data: onboardingRow, error: onboardingErr } = await admin
    .from("users")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (onboardingErr) {
    console.error("[home] onboarding_completed lookup failed", onboardingErr);
    return null;
  }

  if (
    onboardingRow &&
    (onboardingRow as { onboarding_completed: boolean }).onboarding_completed !==
      true
  ) {
    redirect("/onboarding");
  }

  return null;
}
