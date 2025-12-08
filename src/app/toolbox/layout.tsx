import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/supabase/serverAuth";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";

export default async function ToolboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="toolbox-header sticky top-0 z-10 border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              UNICA TEXTILE MILLS
            </h1>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
              Toolbox
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {session.user.email}
            </span>
            <form action={logout}>
              <Button
                type="submit"
                variant="primary"
                className="text-xs sm:text-sm"
              >
                Logout
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
    </div>
  );
}

