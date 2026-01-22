import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/supabase/serverAuth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession();

  // Redirect authenticated users to toolbox
  if (session) {
    redirect("/toolbox");
  }

  // Redirect unauthenticated users to login
  redirect("/auth/login");
}
