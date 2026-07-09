"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase-env";
import { createClient } from "@/utils/supabase/server";

function authUnavailable() {
  redirect(
    `/login?error=${encodeURIComponent("Authentication is not configured. Add Supabase credentials to .env.")}`,
  );
}

export async function signInWithEmail(formData: FormData) {
  if (!isSupabaseConfigured()) {
    authUnavailable();
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  if (!supabase) {
    authUnavailable();
  }

  const client = supabase!;
  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/studio");
}

export async function signUpWithEmail(formData: FormData) {
  if (!isSupabaseConfigured()) {
    authUnavailable();
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  if (!supabase) {
    authUnavailable();
  }

  const client = supabase!;
  const { error } = await client.auth.signUp({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?message=Check your email to confirm your account.");
}
