'use client';

import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";

export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase browser client is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set these environment variables in Netlify (Site settings → Build & deploy → Environment).",
    );
  }

  return createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
}

export const supabaseBrowserClient = createBrowserClient();

