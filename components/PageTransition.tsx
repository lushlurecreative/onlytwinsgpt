"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import type { ReactNode } from "react";

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const flowOrder = useMemo(
    () => ["/dashboard", "/start", "/onboarding/intake", "/training/photos", "/requests"],
    []
  );
  const nextIndex = flowOrder.indexOf(pathname);
  const inGuidedFlow = nextIndex !== -1;

  const variants = {
    initial: { opacity: 0, x: inGuidedFlow ? 10 : 0, y: 8, filter: "blur(2px)" },
    animate: { opacity: 1, x: 0, y: 0, filter: "blur(0px)" },
    exit: { opacity: 0, x: inGuidedFlow ? -10 : 0, y: -6, filter: "blur(2px)" },
  } as const;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
