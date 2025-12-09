"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { toolboxNav } from "@/config/toolboxNav";

interface Props {
  currentPath: string;
}

export function ToolboxMobileNav({ currentPath }: Props) {
  const [open, setOpen] = useState(false);
  const activeKey = useMemo(() => {
    const match = toolboxNav.find(
      (item) =>
        currentPath === item.href ||
        currentPath.startsWith(`${item.href}/`)
    );
    return match?.key;
  }, [currentPath]);

  return (
    <div className="flex items-center gap-3 md:hidden print:hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
        aria-label="Toggle navigation"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {open && (
        <div className="absolute left-0 top-14 z-20 w-full px-4">
          <div className="rounded-xl border border-slate-200 bg-white shadow-lg">
            {toolboxNav.map((item) => {
              const isActive = activeKey === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`relative block px-4 py-3 text-sm font-medium ${
                    isActive
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-3 top-1/2 h-6 w-2 -translate-y-1/2 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]"
                    />
                  )}
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

