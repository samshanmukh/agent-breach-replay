export {};

const BASE_URL = process.env.UI_TEST_BASE_URL ?? "http://localhost:3010";

type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  if (!ok) {
    throw new Error(detail ? `${name}: ${detail}` : name);
  }
}

async function fetchPage(path: string) {
  const response = await fetch(`${BASE_URL}${path}`);
  const html = await response.text();
  return { response, html };
}

function includesAll(html: string, needles: string[]) {
  const missing = needles.filter((needle) => !html.includes(needle));
  return missing;
}

async function testLandingPage() {
  const { response, html } = await fetchPage("/");
  record("landing status 200", response.status === 200, `got ${response.status}`);
  record(
    "landing has marketing wrapper",
    html.includes("marketingPage"),
  );
  record(
    "landing hero headline",
    html.includes("Understand every agent action"),
  );
  record(
    "landing story section",
    html.includes("How the instrumentation works"),
  );
  record(
    "landing tracing steps",
    html.includes("Attach to the OpenAI Agents SDK"),
  );
  record(
    "landing prevention steps",
    html.includes("Replay the breach and compare prevention"),
  );
  record(
    "landing sign-in link",
    html.includes('href="/login"'),
  );
  record(
    "landing no error shell",
    !html.includes("__next_error__"),
  );

  const missing = includesAll(html, [
    "marketingPage",
    "landingNav",
    "businessHero",
    "metricStrip",
    "featureTree",
    "storyTimeline",
  ]);
  record("landing key sections", missing.length === 0, `missing ${missing.join(", ")}`);
}

async function testLoginPage() {
  const { response, html } = await fetchPage("/login");
  record("login status 200", response.status === 200, `got ${response.status}`);
  record("login has marketing wrapper", html.includes("marketingPage"));
  record("login has auth card", html.includes("marketingAuthCard"));
  record("login has sign in heading", html.includes("Sign in"));
  record("login has back link", html.includes("Back to home"));
  record("login has email field", html.includes('name="email"'));
  record("login has password field", html.includes('name="password"'));
  record("login has studio link", html.includes('href="/studio"'));
  record("login no error shell", !html.includes("__next_error__"));

  const missing = includesAll(html, [
    "marketingAuth",
    "marketingAuthForm",
    "landingNav",
  ]);
  record("login key sections", missing.length === 0, `missing ${missing.join(", ")}`);
}

async function testStudioPage() {
  const { response, html } = await fetchPage("/studio");
  record("studio status 200", response.status === 200, `got ${response.status}`);
  record("studio shell present", html.includes("studioShell"));
  record("studio incident list", html.includes("Vendor email exfiltration"));
  record("studio replay view", html.includes("Play the breach"));
  record("studio incident arena", html.includes("incidentArena"));
  record("studio arena play control", html.includes("incidentArenaControls"));
  record("studio arena hero stage", html.includes("incidentArenaHero"));
  record("studio findings tab", html.includes("Findings"));
  record("studio spans tab", html.includes("Spans"));
  record("studio report tab", html.includes("Report"));
  record("studio compare tab", html.includes("Compare"));
  record("studio policy tab", html.includes("Policy"));
  record("studio approvals tab", html.includes("Approvals"));
  record("studio controls tab", html.includes("Controls"));
  record("studio instrumentation tab", html.includes("Instrumentation"));
  record("studio no marketing wrapper", !html.includes("marketingPage"));
  record("studio no error shell", !html.includes("__next_error__"));
}

async function testNavigationTargets() {
  const landing = await fetchPage("/");
  const login = await fetchPage("/login");
  const studio = await fetchPage("/studio");

  record(
    "landing links to login",
    landing.html.includes('href="/login"'),
  );
  record(
    "landing links to studio",
    landing.html.includes('href="/studio"'),
  );
  record(
    "login links back home",
    login.html.includes('href="/"'),
  );
  record(
    "studio renders without redirect loop",
    studio.response.status === 200,
  );
}

async function main() {
  console.log(`UI smoke tests against ${BASE_URL}`);

  await testLandingPage();
  console.log("landing page checks passed");

  await testLoginPage();
  console.log("login page checks passed");

  await testStudioPage();
  console.log("studio page checks passed");

  await testNavigationTargets();
  console.log("navigation checks passed");

  console.log("ui tests passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
