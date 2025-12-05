"use server";

import { createServerClient } from "@/lib/supabase/serverClient";
import { redirect } from "next/navigation";

export async function logout() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}

