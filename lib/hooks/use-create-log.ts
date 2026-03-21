"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { buildLogRequestBody } from "@/lib/logging/build-log-request-body";
import type { LogInput } from "@/lib/logging/types";
import { queryKeys } from "@/lib/query-keys";

async function postLog(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export function useCreateLog() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (input: LogInput) => {
      return postLog(buildLogRequestBody(input));
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feed() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.logs() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.discover() });
      if (variables.trackId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.song(variables.trackId) });
      }
      if (variables.albumId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.album(variables.albumId) });
      }
      if (variables.artistId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.artist(variables.artistId) });
      }
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      router.refresh();
    },
  });
}
