function usable(value: string | undefined) {
  if (!value) return undefined;
  if (value.includes("your-")) return undefined;
  return value;
}

export function getSupabaseUrl() {
  return usable(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? usable(process.env.SUPABASE_URL);
}

export function getSupabaseAnonKey() {
  return (
    usable(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    usable(process.env.SUPABASE_PUBLISHABLE_KEY)
  );
}

export function getSupabaseSecretKey() {
  return usable(process.env.SUPABASE_SECRET_KEY);
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}
