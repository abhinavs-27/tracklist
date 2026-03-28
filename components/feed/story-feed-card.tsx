"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

type StoryFeedCardProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Story-style feed shell: scroll fade-in, hover/tap scale + shadow (respects reduced motion).
 */
export function StoryFeedCard({ children, className = "" }: StoryFeedCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      role="article"
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-48px 0px", amount: 0.15 }}
      transition={{
        duration: reduceMotion ? 0 : 0.4,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      whileHover={
        reduceMotion
          ? undefined
          : {
              scale: 1.015,
              boxShadow: "0 18px 40px -12px rgba(0, 0, 0, 0.4)",
            }
      }
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
      className={`origin-center rounded-2xl bg-zinc-900/50 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-white/[0.07] transition-shadow duration-300 will-change-transform hover:shadow-[0_18px_44px_-12px_rgba(0,0,0,0.5)] hover:ring-white/[0.1] ${className}`}
    >
      {children}
    </motion.div>
  );
}
