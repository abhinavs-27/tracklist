'use client';

interface ConnectSpotifyButtonProps {
  returnTo?: string;
}

function ConnectSpotifyButton({ returnTo }: ConnectSpotifyButtonProps) {
  function handleConnect() {
    const base = '/api/spotify/connect';
    const url = returnTo
      ? `${base}?returnTo=${encodeURIComponent(returnTo)}`
      : base;
    window.location.href = url;
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

