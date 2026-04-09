import { createClient } from "@supabase/supabase-js";

/**
 * Minimal SQS/Lambda smoke test — no React, no Next, no app graph.
 * Bundle: `npm run build:lambda:minimal`
 */
export const handler = async (event: unknown) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url ?? "", key ?? "");

  console.log("Lambda running", JSON.stringify(event));
  console.log("supabase client", Boolean(supabase));

  return { statusCode: 200 };
};
