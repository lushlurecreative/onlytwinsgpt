"use client";

import { motion } from "framer-motion";

export default function AnimatedBackground() {
  return (
    <div className="ot-bg" aria-hidden="true">
      <motion.div
        className="ot-bg-mesh ot-bg-mesh-a"
        animate={{ x: [0, 40, -20, 0], y: [0, -20, 30, 0], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="ot-bg-mesh ot-bg-mesh-b"
        animate={{ x: [0, -26, 20, 0], y: [0, 16, -26, 0], scale: [1, 0.94, 1.08, 1] }}
        transition={{ duration: 36, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="ot-bg-grid"
        animate={{ opacity: [0.16, 0.24, 0.16] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
