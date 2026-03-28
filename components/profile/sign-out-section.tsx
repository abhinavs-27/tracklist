"use client";

import { signOut } from "next-auth/react";
import { cardElevated } from "@/lib/ui/surface";

/** Shown on your own profile — primary sign-out on mobile (navbar hides it). */
export function SignOutSection() {
  return (
    <section className={`p-6 sm:p-7 ${cardElevated}`}>
      <h2 className="text-lg font-semibold tracking-tight text-white">
        Session
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Sign out of Tracklist on this device. You can sign in again anytime.
      </p>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-800/50 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
      >
        Sign out
      </button>
    </section>
  );
}
