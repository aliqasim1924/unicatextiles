"use client";

import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ToolboxSidebar } from "./ToolboxSidebar";
import { ToolboxMobileNav } from "./ToolboxMobileNav";
import { logout } from "@/app/actions/auth";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

interface ToolboxShellProps {
  email: string;
  version?: string;
  children: ReactNode;
}

export function ToolboxShell({ email, version, children }: ToolboxShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="toolbox-header sticky top-0 z-20 border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <ToolboxMobileNav currentPath={pathname} />
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-slate-900">Unica Textile Mills</span>
              <span className="hidden text-sm font-medium text-slate-500 md:inline">Toolbox</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {version && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                v{version}
              </span>
            )}
            <span className="hidden text-sm text-slate-600 sm:inline">{email}</span>
            <form action={logout}>
              <Button type="submit" variant="primary" className="text-xs sm:text-sm">
                Logout
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1920px] gap-0 px-4 pb-10 pt-6 md:px-6 md:pt-8">
        <aside
          className={`hidden shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 print:hidden md:block md:transition-[width] md:duration-200 md:ease-out ${
            sidebarCollapsed ? "md:w-14" : "md:w-56"
          }`}
          onMouseEnter={() => setSidebarCollapsed(false)}
        >
          <div className="flex h-full flex-col p-2">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="flex items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>
            <ToolboxSidebar currentPath={pathname} collapsed={sidebarCollapsed} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 pl-4 md:pl-6">{children}</main>
      </div>
    </div>
  );
}

