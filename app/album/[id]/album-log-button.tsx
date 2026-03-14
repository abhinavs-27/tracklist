'use client';

import { useState } from 'react';
import { ReviewModal } from '@/components/review-modal';

interface AlbumLogButtonProps {
  spotifyId: string;
  type: 'song' | 'album';
  spotifyName: string;
  className?: string;
}

export function AlbumLogButton({ spotifyId, type, spotifyName, className = '' }: AlbumLogButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 ${className}`}
      >
        Rate &amp; review
      </button>
      {open && (
        <ReviewModal
          spotifyId={spotifyId}
          type={type}
          spotifyName={spotifyName}
          onClose={() => setOpen(false)}
          onSuccess={() => window.location.reload()}
        />
      )}
    </>
  );
}
