"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  username: string;
};

/**
 * Centered dialog with a larger circular avatar (no fullscreen zoom UI).
 */
export function ProfileAvatarPreviewDialog({
  open,
  onClose,
  imageSrc,
  username,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-preview-title"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col items-center gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between gap-3">
          <h2
            id="avatar-preview-title"
            className="truncate text-sm font-medium text-zinc-300"
          >
            {username}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-zinc-600 bg-zinc-900/80 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div
          className="aspect-square w-full max-w-[min(100%,280px)] overflow-hidden rounded-full border-2 border-zinc-600/90 bg-zinc-900 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- presigned display URL */}
          <img
            src={imageSrc}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
