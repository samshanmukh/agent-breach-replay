import { redirect } from "next/navigation";
import { signInWithEmail, signUpWithEmail } from "@/app/login/actions";
import { createClient } from "@/utils/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const params = await searchParams;

  return (
    <main className="authShell">
      <section className="authPanel">
        <span className="eyebrow">Agent Breach Replay</span>
        <h1>Sign in</h1>
        <p>
          Access the security replay studio for agent traces, findings, and
          incident reports.
        </p>

        {params.error ? <p className="authError">{params.error}</p> : null}
        {params.message ? <p className="authMessage">{params.message}</p> : null}

        <form className="authForm" action={signInWithEmail}>
          <label>
            Email
            <input name="email" required type="email" />
          </label>
          <label>
            Password
            <input minLength={6} name="password" required type="password" />
          </label>
          <button className="primaryButton" type="submit">
            Sign in
          </button>
        </form>

        <form className="authForm secondaryAuth" action={signUpWithEmail}>
          <label>
            Email
            <input name="email" required type="email" />
          </label>
          <label>
            Password
            <input minLength={6} name="password" required type="password" />
          </label>
          <button type="submit">Create account</button>
        </form>
      </section>
    </main>
  );
}
