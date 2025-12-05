"use client";

import Link from "next/link";
import { motion } from "framer-motion";

interface ToolboxCardProps {
  title: string;
  items: string[];
  href: string;
  index?: number;
}

export function ToolboxCard({ title, items, href, index = 0 }: ToolboxCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      <Link
        href={href}
        className="block h-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      >
        <div className="flex h-full flex-col justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <ul className="mt-3 space-y-1.5">
              {items.map((item, idx) => (
                <li key={idx} className="flex items-start text-sm text-slate-600">
                  <span className="mr-2 text-teal-700">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <span className="mt-4 inline-block text-sm font-semibold text-teal-700">
            Open →
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

