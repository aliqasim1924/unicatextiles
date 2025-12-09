"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ToolboxSidebar } from "./ToolboxSidebar";
import { ToolboxMobileNav } from "./ToolboxMobileNav";
import { logout } from "@/app/actions/auth";

interface ToolboxShellProps {
  email: string;
  version?: string;
  children: ReactNode;
}

export function ToolboxShell({ email, version, children }: ToolboxShellProps) {
  const pathname = usePathname();

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

      <div className="mx-auto flex max-w-7xl gap-4 px-4 pb-10 pt-6 md:px-8 md:pt-8">
        <aside className="hidden w-56 shrink-0 md:block print:hidden">
          <ToolboxSidebar currentPath={pathname} />
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

