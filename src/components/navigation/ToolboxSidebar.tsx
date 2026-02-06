"use client";

import Link from "next/link";
import { useMemo } from "react";
import { toolboxNav } from "@/config/toolboxNav";

interface Props {
  currentPath: string;
  collapsed?: boolean;
}

export function ToolboxSidebar({ currentPath, collapsed = false }: Props) {
  const activeKey = useMemo(() => {
    const match = toolboxNav.find(
      (item) =>
        currentPath === item.href ||
        currentPath.startsWith(`${item.href}/`)
    );
    return match?.key;
  }, [currentPath]);

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-hidden print:hidden">
      {toolboxNav.map((item) => {
        const isActive = activeKey === item.key;
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={`relative mb-1 flex items-center gap-3 rounded-full py-2 text-sm font-medium transition-colors ${
              collapsed ? "justify-center px-2" : "px-4"
            } ${
              isActive
                ? "bg-slate-100 text-slate-900"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {isActive && !collapsed && (
              <span
                aria-hidden
                className="absolute left-1 top-1/2 h-6 w-2 -translate-y-1/2 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]"
              />
            )}
            <Icon
              size={18}
              className={`shrink-0 ${isActive ? "text-slate-900" : "text-slate-600"}`}
              fill={item.filled ? (item.fillColor || "currentColor") : "none"}
              strokeWidth={item.filled ? 1.5 : 2}
              stroke={item.filled ? (item.fillColor || "currentColor") : "currentColor"}
            />
            {!collapsed && (
              <span className="truncate">{item.label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

