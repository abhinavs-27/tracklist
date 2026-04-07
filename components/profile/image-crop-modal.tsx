"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";

import { exportCroppedImageToJpegBlob } from "@/lib/client/export-cropped-image";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Props = {
  imageSrc: string;
  open: boolean;
  onClose: () => void;
  /** Called with final JPEG blob (512px, ≤ ~300KB). */
  onConfirm: (blob: Blob) => void | Promise<void>;
  /** Dialog heading (default: profile photo). */
  title?: string;
};

export function ImageCropModal({
  imageSrc,
  open,
  onClose,
  onConfirm,
  title = "Crop profile photo",
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(
    null,
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setError(null);
    }
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_croppedArea: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) {
      setError("Adjust the image first");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const blob = await exportCroppedImageToJpegBlob(
        imageSrc,
        croppedAreaPixels,
      );
      await onConfirm(blob);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process image");
    } finally {
      setWorking(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col bg-black/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-crop-title"
    >
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="image-crop-title" className="text-lg font-semibold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            className="rounded-full px-3 py-1 text-sm text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <p className="text-xs text-zinc-500">
          Drag to reposition, use the slider to zoom. Output is square 512×512 JPEG.
        </p>

        <div className="relative aspect-square w-full max-h-[min(70vh,420px)] overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-white/10">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            objectFit="horizontal-cover"
          />
        </div>

        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-zinc-500">Zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-2 flex-1 accent-emerald-500"
            aria-label="Zoom"
          />
          <span className="tabular-nums text-xs text-zinc-400">
            {zoom.toFixed(2)}×
          </span>
        </div>

        {error ? (
          <p className="text-center text-sm text-red-400">{error}</p>
        ) : null}

        <div className="mt-auto flex justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            className="rounded-xl border border-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={working || !croppedAreaPixels}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {working ? (
              <span className="inline-flex items-center gap-2">
                <Spinner />
                Processing…
              </span>
            ) : (
              "Save & upload"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
