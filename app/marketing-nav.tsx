import Link from "next/link";

type MarketingNavProps = {
  active?: "home" | "signin";
};

export default function MarketingNav({ active = "home" }: MarketingNavProps) {
  return (
    <header className="landingNav">
      <div className="landingContainer landingNavInner">
        <Link className="landingBrand" href="/">
          <div className="landingBrandMark">AB</div>
          <div>
            <strong>Agent Breach Replay</strong>
            <span>Security observability platform</span>
          </div>
        </Link>

        <nav className="landingNavLinks">
          <Link href="/#story">How it works</Link>
          <Link href="/#tracing">Tracing</Link>
          <Link href="/#prevention">Prevention</Link>
        </nav>

        <div className="landingNavActions">
          <Link
            className={
              active === "signin"
                ? "landingBtn landingBtnActive"
                : "landingBtn"
            }
            href="/login"
          >
            Sign in
          </Link>
          <Link className="landingBtnPrimary" href="/studio">
            Open replay studio
          </Link>
        </div>
      </div>
    </header>
  );
}
