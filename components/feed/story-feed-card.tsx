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
              scale: 1.035,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.45)",
            }
      }
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
      className={`origin-center rounded-2xl border border-zinc-800/90 bg-zinc-900/45 shadow-md shadow-black/25 transition-shadow duration-200 will-change-transform hover:border-zinc-700/90 hover:shadow-xl hover:shadow-black/35 ${className}`}
    >
      {children}
    </motion.div>
  );
}
