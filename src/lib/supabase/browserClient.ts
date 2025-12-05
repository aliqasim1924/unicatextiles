'use client';

import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase browser client is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

export function createBrowserClient() {
  return createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
}

export const supabaseBrowserClient = createBrowserClient();

