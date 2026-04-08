"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

const labelClass =
  "text-sm font-medium leading-snug text-zinc-200 peer-disabled:opacity-50";
const descClass = "mt-1 text-xs text-zinc-500";

export function PrivateLogsToggle({
  initialPrivate,
}: {
  initialPrivate: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialPrivate);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = useCallback(async (next: boolean) => {
    setPending(true);
    setError(null);
    const prev = value;
    setValue(next);
    try {
      const res = await fetch("/api/users/me/private-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs_private: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        logs_private?: boolean;
      };
      if (!res.ok) {
        setValue(prev);
        setError(data.error ?? "Could not update privacy");
        return;
      }
      if (typeof data.logs_private === "boolean") {
        setValue(data.logs_private);
      }
      router.refresh();
    } catch {
      setValue(prev);
      setError("Could not update privacy");
    } finally {
      setPending(false);
    }
  }, [router, value]);

  return (
    <div
      className="rounded-2xl border border-zinc-800/90 bg-zinc-950/40 px-4 py-4 ring-1 ring-inset ring-white/[0.05] sm:px-5 sm:py-4"
      id="private-logs"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <label htmlFor="logs-private-toggle" className={labelClass}>
            Private listening logs
          </label>
          <p className={descClass}>
            Private logs won&apos;t appear in feeds or on your profile, but
            stats and taste match are unaffected.
          </p>
          {error ? (
            <p className="mt-2 text-xs text-red-400/95" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
          <span className="text-xs text-zinc-500 sm:hidden">Off / On</span>
          <button
            type="button"
            id="logs-private-toggle"
            role="switch"
            aria-checked={value}
            disabled={pending}
            onClick={() => void onChange(!value)}
            title="Private logs won’t appear in feeds or on your profile, but stats and taste match are unaffected."
            className={`peer relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border border-zinc-600/90 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/80 disabled:cursor-not-allowed disabled:opacity-50 ${
              value ? "bg-emerald-600/90" : "bg-zinc-700/80"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 translate-x-0.5 translate-y-0.5 transform rounded-full bg-white shadow ring-1 ring-black/10 transition ${
                value ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
