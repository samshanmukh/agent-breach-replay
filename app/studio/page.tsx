import { redirect } from "next/navigation";
import StudioClient from "@/app/studio-client";
import { isSupabaseConfigured } from "@/lib/supabase-env";
import { createClient } from "@/utils/supabase/server";

export default async function StudioPage() {
  if (!isSupabaseConfigured()) {
    return <StudioClient userEmail="local developer" />;
  }

  const supabase = await createClient();
  if (!supabase) {
    return <StudioClient userEmail="local developer" />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <StudioClient userEmail={user.email ?? "authenticated user"} />;
}
