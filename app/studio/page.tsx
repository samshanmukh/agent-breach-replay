import { redirect } from "next/navigation";
import StudioClient from "@/app/studio-client";
import { createClient } from "@/utils/supabase/server";

export default async function StudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <StudioClient userEmail={user.email ?? "authenticated user"} />;
}
