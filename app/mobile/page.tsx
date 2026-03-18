import Link from "next/link";

export default function MobilePage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-white">
        Tracklist for Mobile
      </h1>
      <p className="mt-4 max-w-md text-lg text-zinc-400">
        Experience Tracklist on your phone. Log listens, rate albums, and stay connected with your friends on the go.
      </p>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-left backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-white">Expo Go</h2>
          <p className="mt-2 text-zinc-400">
            Open the Expo Go app and scan the QR code to start using the mobile version immediately.
          </p>
          <div className="mt-6 aspect-square w-full max-w-[200px] rounded-lg bg-white p-2">
            {/* QR code placeholder */}
            <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-900">
              [QR CODE]
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-left backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-white">Web Version</h2>
          <p className="mt-2 text-zinc-400">
            You can also access the mobile-optimized web experience directly in your browser.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-emerald-600 px-6 py-2 font-medium text-white transition hover:bg-emerald-500"
          >
            Go to Web App
          </Link>
        </div>
      </div>

      <Link
        href="/"
        className="mt-12 text-sm text-zinc-400 underline hover:text-white"
      >
        Back to home
      </Link>
    </div>
  );
}
