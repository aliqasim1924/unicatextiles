import { createServerClient } from "./serverClient";

export async function getServerSession() {
  const supabase = await createServerClient();
  
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}

export async function requireAuth() {
  const session = await getServerSession();
  
  if (!session) {
    return null;
  }
  
  return session;
}

