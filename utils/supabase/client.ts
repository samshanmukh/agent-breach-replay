import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase-env";

export const createClient = () =>
  createBrowserClient(getSupabaseUrl()!, getSupabaseAnonKey()!);
