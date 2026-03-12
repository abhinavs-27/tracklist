'use client';

interface ConnectSpotifyButtonProps {
  /** Optional return path after OAuth. If omitted, uses current page (window.location.pathname). */
  returnTo?: string;
  /** When true, button is disabled and shows "Spotify Connected". Set from server-side spotify_tokens check. */
  spotifyConnected?: boolean;
}

function ConnectSpotifyButton({ returnTo, spotifyConnected = false }: ConnectSpotifyButtonProps) {
  function handleConnect() {
    const currentPage = returnTo ?? (typeof window !== 'undefined' ? window.location.pathname : '/profile');
    const params = new URLSearchParams({ returnTo: currentPage });
    window.location.href = `/api/spotify/connect?${params.toString()}`;
  }

  if (spotifyConnected) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="inline-flex items-center justify-center rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:ring-offset-2 focus:ring-offset-zinc-950"
      >
        Spotify Connected
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleConnect}
      className="inline-flex items-center justify-center rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
    >
      Connect Spotify
    </button>
  );
}

export default ConnectSpotifyButton;

