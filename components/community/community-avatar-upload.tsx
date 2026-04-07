"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageCropModal } from "@/components/profile/image-crop-modal";
import { uploadProfilePictureJPEG } from "@/lib/client/profile-picture-upload";
import { queryKeys } from "@/lib/query-keys";
import { resolveCommunityAvatarUrl } from "@/lib/profile-pictures/resolve-avatar-display";

const MAX_INPUT_FILE_BYTES = 25 * 1024 * 1024;

type Props = {
  communityId: string;
  canEdit: boolean;
  avatarUrl?: string | null;
  /** First letter fallback when there is no image. */
  communityName?: string;
};

export function CommunityAvatarUpload({
  communityId,
  canEdit,
  avatarUrl = null,
  communityName = "",
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  /** Optimistic blob URL while uploading (cleared on success/error). */
  const [blobPreview, setBlobPreview] = useState<string | null>(null);

  const revokeCropSrc = useCallback(() => {
    setCropImageSrc((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const revokeBlobPreview = useCallback(() => {
    setBlobPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const pictureMutation = useMutation({
    mutationFn: async (blob: Blob) =>
      uploadProfilePictureJPEG(blob, {
        type: "community",
        id: communityId,
      }),
    onMutate: (blob) => {
      setError(null);
      setBlobPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    },
    onSuccess: () => {
      revokeBlobPreview();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.community(communityId),
      });
      router.refresh();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Upload failed");
      revokeBlobPreview();
    },
  });

  const imgSrc = resolveCommunityAvatarUrl(
    communityId,
    blobPreview ?? avatarUrl,
  );
  const letter = communityName.trim()[0]?.toUpperCase() ?? "?";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    if (f.size > MAX_INPUT_FILE_BYTES) {
      setError("Image is too large. Try a file under 25 MB.");
      return;
    }
    revokeCropSrc();
    setCropImageSrc(URL.createObjectURL(f));
    setCropModalOpen(true);
  };

  const handleCropClose = () => {
    setCropModalOpen(false);
    revokeCropSrc();
  };

  if (!canEdit) return null;

  return (
    <div className="space-y-3">
      <span className="text-xs font-medium text-zinc-400">Community photo</span>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-zinc-600 bg-zinc-800">
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- presigned / blob URLs
            <img
              src={imgSrc}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-medium text-zinc-500">
              {letter}
            </div>
          )}
          {pictureMutation.isPending ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-medium text-white">
              Uploading…
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pictureMutation.isPending}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {imgSrc ? "Change photo" : "Add photo"}
            </button>
            {error ? (
              <button
                type="button"
                disabled={pictureMutation.isPending}
                onClick={() => inputRef.current?.click()}
                className="rounded-lg bg-amber-600/20 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-600/30 disabled:opacity-50"
              >
                Retry
              </button>
            ) : null}
          </div>
          {error ? (
            <span className="text-sm text-red-400" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Drag to reposition and zoom before upload — square 512×512 JPEG (~300KB),
        same as profile photos.
      </p>

      {cropImageSrc ? (
        <ImageCropModal
          title="Crop community photo"
          imageSrc={cropImageSrc}
          open={cropModalOpen}
          onClose={handleCropClose}
          onConfirm={async (blob) => {
            await pictureMutation.mutateAsync(blob);
          }}
        />
      ) : null}
    </div>
  );
}
