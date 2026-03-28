"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * First-session transition after onboarding: brief full-screen moment, then strip `?welcome=1`.
 */
export function HomeWelcomeOverlay({
  initialActive = false,
}: {
  initialActive?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const welcomeParam = searchParams.get("welcome") === "1";
  const [visible, setVisible] = useState(initialActive);

  const stripWelcome = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("welcome") !== "1") return;
    params.delete("welcome");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!welcomeParam) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 2000);
    return () => window.clearTimeout(t);
  }, [welcomeParam]);

  return (
    <AnimatePresence
      onExitComplete={() => {
        stripWelcome();
      }}
    >
      {visible ? (
        <motion.div
          key="welcome"
          className="pointer-events-none fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gradient-to-b from-emerald-950/95 via-zinc-950/98 to-zinc-950"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.p
            className="text-center text-2xl font-semibold tracking-tight text-white sm:text-3xl"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            You&apos;re in
          </motion.p>
          <motion.p
            className="mt-3 max-w-sm px-6 text-center text-sm text-zinc-400 sm:text-base"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            Your feed is tuned from the albums you picked.
          </motion.p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
