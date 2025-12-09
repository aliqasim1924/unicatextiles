import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/supabase/serverAuth";
import { ToolboxShell } from "@/components/navigation/ToolboxShell";
import packageJson from "../../../package.json";

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
    <ToolboxShell email={session.user.email} version={packageJson.version}>
      {children}
    </ToolboxShell>
  );
}

