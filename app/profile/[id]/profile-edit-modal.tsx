'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FavoriteAlbumsEditModal } from '@/components/favorite-albums-edit-modal';
import type { FavoriteAlbumPick } from '@/components/favorite-albums-picker';
import { ImageCropModal } from '@/components/profile/image-crop-modal';
import { useProfileAvatarOptimistic } from '@/components/profile/profile-avatar-context';
import { uploadProfilePictureJPEG } from '@/lib/client/profile-picture-upload';
import { queryKeys } from '@/lib/query-keys';
import { resolveUserAvatarUrl } from '@/lib/profile-pictures/resolve-avatar-display';

/** Max size for the original file before cropping (memory / decode safety). */
const MAX_INPUT_FILE_BYTES = 25 * 1024 * 1024;

interface ProfileEditModalProps {
  userId: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  triggerClassName?: string;
  triggerLabel?: ReactNode;
}

export function ProfileEditModal({
  userId,
  username,
  bio,
  avatarUrl,
  triggerClassName,
  triggerLabel,
}: ProfileEditModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const avatarCtx = useProfileAvatarOptimistic();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [formUsername, setFormUsername] = useState(username);
  const [formBio, setFormBio] = useState(bio ?? '');
  const [error, setError] = useState('');
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const [favoritesModalOpen, setFavoritesModalOpen] = useState(false);

  const favoritesQuery = useQuery({
    queryKey: queryKeys.meFavoriteAlbums(),
    queryFn: async () => {
      const r = await fetch('/api/users/me/favorites');
      const data = (await r.json().catch(() => ({}))) as {
        albums?: FavoriteAlbumPick[];
        error?: string;
      };
      if (!r.ok) throw new Error(data.error ?? 'Failed to load favorites');
      return data.albums ?? [];
    },
    enabled: open,
  });
  const favoriteAlbums = favoritesQuery.data ?? [];
  const favoritesLoading = open && favoritesQuery.isPending;

  const revokeCropSrc = useCallback(() => {
    setCropImageSrc((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      revokeCropSrc();
    };
  }, [revokeCropSrc]);

  const closeProfileEdit = useCallback(() => {
    setCropModalOpen(false);
    setFavoritesModalOpen(false);
    revokeCropSrc();
    setOpen(false);
  }, [revokeCropSrc]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formUsername.trim(),
          bio: formBio.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
    },
    onSuccess: () => {
      closeProfileEdit();
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      router.refresh();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Update failed');
    },
  });

  const pictureMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      setPictureError(null);
      return uploadProfilePictureJPEG(blob, { type: 'user', id: userId });
    },
    onMutate: async (blob) => {
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      avatarCtx?.setOptimisticAvatarUrl(url);
    },
    onSuccess: (result) => {
      setPreviewUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });
      avatarCtx?.setOptimisticAvatarUrl(result.file_url);
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      router.refresh();
    },
    onError: (err) => {
      setPictureError(err instanceof Error ? err.message : 'Upload failed');
      avatarCtx?.setOptimisticAvatarUrl(avatarUrl);
      setPreviewUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    updateMutation.mutate();
  };

  const displayModalAvatar = resolveUserAvatarUrl(
    userId,
    previewUrl ?? avatarCtx?.optimisticAvatarUrl ?? avatarUrl,
  );

  const handleCropClose = () => {
    setCropModalOpen(false);
    revokeCropSrc();
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPictureError(null);
    if (f.size > MAX_INPUT_FILE_BYTES) {
      setPictureError('Image is too large. Try a file under 25 MB.');
      return;
    }
    revokeCropSrc();
    const url = URL.createObjectURL(f);
    setCropImageSrc(url);
    setCropModalOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFormUsername(username);
          setFormBio(bio ?? '');
          setOpen(true);
        }}
        className={
          triggerClassName ??
          'rounded-full border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800'
        }
      >
        {triggerLabel ?? 'Edit profile'}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            if (pictureMutation.isPending || updateMutation.isPending) return;
            closeProfileEdit();
          }}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-white">Edit profile</h2>

            <div className="mt-4 flex flex-col items-center gap-3">
              <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-zinc-600 bg-zinc-800">
                {displayModalAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob URLs + arbitrary CDN
                  <img
                    src={displayModalAvatar}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl text-zinc-500">
                    {username[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                {pictureMutation.isPending ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-medium text-white">
                    <span className="inline-flex items-center gap-2">
                      <SpinnerSm />
                      Uploading…
                    </span>
                  </div>
                ) : null}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFilePick}
              />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={pictureMutation.isPending}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Change photo
                </button>
                {pictureError ? (
                  <button
                    type="button"
                    disabled={pictureMutation.isPending}
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg bg-amber-600/20 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-600/30 disabled:opacity-50"
                  >
                    Retry
                  </button>
                ) : null}
              </div>
              {pictureError ? (
                <p className="text-center text-sm text-red-400">{pictureError}</p>
              ) : null}
            </div>

            <div className="mt-5 border-t border-zinc-800 pt-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-200">Favorite albums</p>
                  <p className="text-xs text-zinc-500">
                    Up to 4 albums on your profile
                  </p>
                </div>
                <button
                  type="button"
                  disabled={favoritesLoading}
                  onClick={() => setFavoritesModalOpen(true)}
                  className="shrink-0 rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {favoritesLoading ? 'Loading…' : 'Edit'}
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300">Username</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300">Bio</label>
                <textarea
                  value={formBio}
                  onChange={(e) => setFormBio(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeProfileEdit}
                  className="flex-1 rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending || pictureMutation.isPending}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cropImageSrc ? (
        <ImageCropModal
          imageSrc={cropImageSrc}
          open={cropModalOpen}
          onClose={handleCropClose}
          onConfirm={async (blob) => {
            await pictureMutation.mutateAsync(blob);
          }}
        />
      ) : null}

      <FavoriteAlbumsEditModal
        initialAlbums={favoriteAlbums}
        isOpen={favoritesModalOpen}
        onClose={() => setFavoritesModalOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.meFavoriteAlbums() });
          router.refresh();
        }}
      />
    </>
  );
}

function SpinnerSm() {
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
