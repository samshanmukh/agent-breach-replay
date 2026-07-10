import { isSupabaseConfigured } from "@/lib/supabase-env";
import { createClient } from "@/utils/supabase/server";

export type StudioActor = {
  id: string;
  email: string;
  role: "owner" | "admin" | "analyst" | "approver" | "viewer";
};

function normalizeRole(value: unknown): StudioActor["role"] {
  return value === "owner" ||
    value === "admin" ||
    value === "analyst" ||
    value === "approver" ||
    value === "viewer"
    ? value
    : "viewer";
}

export async function getStudioActor(): Promise<StudioActor | null> {
  if (!isSupabaseConfigured()) {
    return {
      id: "local-developer",
      email: "local developer",
      role: normalizeRole(process.env.LOCAL_STUDIO_ROLE ?? "owner"),
    };
  }

  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? "authenticated user",
    role: normalizeRole(user.app_metadata.role),
  };
}

export async function requireStudioActor(): Promise<StudioActor> {
  const actor = await getStudioActor();
  if (!actor) {
    throw new Error("Unauthorized");
  }
  return actor;
}

export function canApprove(actor: StudioActor) {
  return ["owner", "admin", "approver"].includes(actor.role);
}

export function canAdminister(actor: StudioActor) {
  return ["owner", "admin"].includes(actor.role);
}
