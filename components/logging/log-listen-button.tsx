"use client";

import { useSession } from "next-auth/react";
import { useLogging } from "./logging-context";

type Props = {
  trackId: string;
  albumId?: string | null;
  artistId?: string | null;
  displayName: string;
  label?: string;
  className?: string;
};

export function LogListenButton({
  trackId,
  albumId,
  artistId,
  displayName,
  label = "Log this listen",
  className = "",
}: Props) {
  const { data: session } = useSession();
  const { logListen, logBusy } = useLogging();

  if (!session?.user?.id) return null;

  return (
    <button
      type="button"
      disabled={logBusy}
      onClick={() => void logListen({ trackId, albumId, artistId, source: "manual", displayName })}
      className={
        className ||
        "rounded-full border border-emerald-500/60 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-60"
      }
    >
      {label}
    </button>
  );
}
