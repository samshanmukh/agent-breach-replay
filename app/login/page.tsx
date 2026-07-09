import Link from "next/link";
import { redirect } from "next/navigation";
import MarketingNav from "@/app/marketing-nav";
import { signInWithEmail, signUpWithEmail } from "@/app/login/actions";
import { isSupabaseConfigured } from "@/lib/supabase-env";
import { createClient } from "@/utils/supabase/server";
import "../landing.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const supabaseConfigured = isSupabaseConfigured();
  const supabase = supabaseConfigured ? await createClient() : null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/studio");
    }
  }

  const params = await searchParams;

  return (
    <div className="marketingPage">
      <MarketingNav active="signin" />

      <main className="marketingAuth">
        <div className="landingContainer">
          <section className="marketingAuthCard">
            <Link className="marketingBackLink" href="/">
              ← Back to home
            </Link>
            <span className="marketingEyebrow">Agent Breach Replay</span>
            <h1>Sign in</h1>
            <p>
              Access the security replay studio for agent traces, findings, and
              incident reports.
            </p>

            {!supabaseConfigured ? (
              <p className="marketingAuthMessage">
                Authentication is not configured in this environment yet. You can
                still open the replay studio locally, or add Supabase credentials
                to `.env` to enable sign in.
              </p>
            ) : null}

            {params.error ? (
              <p className="marketingAuthError">{params.error}</p>
            ) : null}
            {params.message ? (
              <p className="marketingAuthMessage">{params.message}</p>
            ) : null}

            <form className="marketingAuthForm" action={signInWithEmail}>
              <label>
                Email
                <input name="email" required type="email" autoComplete="email" />
              </label>
              <label>
                Password
                <input
                  minLength={6}
                  name="password"
                  required
                  type="password"
                  autoComplete="current-password"
                />
              </label>
              <button type="submit">Sign in</button>
            </form>

            <div className="marketingAuthSecondary">
              <h2>Create account</h2>
              <p>Start reviewing agent security traces in the replay studio.</p>
              <form className="marketingAuthForm" action={signUpWithEmail}>
                <label>
                  Email
                  <input name="email" required type="email" autoComplete="email" />
                </label>
                <label>
                  Password
                  <input
                    minLength={6}
                    name="password"
                    required
                    type="password"
                    autoComplete="new-password"
                  />
                </label>
                <button type="submit">Create account</button>
              </form>
            </div>

            {!supabaseConfigured ? (
              <div className="marketingAuthSecondary">
                <Link className="landingBtnPrimary" href="/studio" style={{ display: "inline-flex" }}>
                  Continue to replay studio
                </Link>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

