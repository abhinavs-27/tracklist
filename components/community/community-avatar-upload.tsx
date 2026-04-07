"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareProfilePictureFile } from "@/lib/client/prepare-profile-picture";
import { uploadProfilePictureJPEG } from "@/lib/client/profile-picture-upload";

type Props = {
  communityId: string;
  canEdit: boolean;
};

export function CommunityAvatarUpload({ communityId, canEdit }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!canEdit) return null;

  async function onFile(file: File) {
    setError(null);
    setPending(true);
    try {
      const blob = await prepareProfilePictureFile(file);
      await uploadProfilePictureJPEG(blob, {
        type: "community",
        id: communityId,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-zinc-400">Community photo</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Upload JPEG photo"}
        </button>
        {error ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-amber-600/20 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-600/30 disabled:opacity-50"
          >
            Retry
          </button>
        ) : null}
        {error ? (
          <span className="text-sm text-red-400" role="alert">
            {error}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-zinc-500">
        Square crop, 512×512 max, ~300KB — processed in your browser before upload.
      </p>
    </div>
  );
}
