"use client";

import { ReactNode } from "react";
import { motion, HTMLMotionProps } from "framer-motion";

interface CardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
}

export const Card = ({ children, className = "", ...props }: CardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`
        w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm
        ${className}
      `}
      {...props}
    >
      {children}
    </motion.div>
  );
};

