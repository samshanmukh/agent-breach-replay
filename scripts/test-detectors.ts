import { scenarios, toSecurityTrace } from "../lib/traces";
import { detectSecurityFindings } from "../packages/detectors";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const unsafe = scenarios.find((scenario) => scenario.mode === "unsafe");
const guardrailed = scenarios.find((scenario) => scenario.mode === "guardrailed");

assert(Boolean(unsafe), "unsafe scenario missing");
assert(Boolean(guardrailed), "guardrailed scenario missing");

const unsafeFindings = detectSecurityFindings(toSecurityTrace(unsafe!));
const guardrailedFindings = detectSecurityFindings(toSecurityTrace(guardrailed!));

assert(
  unsafeFindings.some(
    (finding) =>
      finding.type === "exfiltration" && finding.status === "triggered",
  ),
  "unsafe scenario should trigger exfiltration",
);

assert(
  unsafeFindings.some(
    (finding) =>
      finding.type === "untrusted_to_action" &&
      finding.status === "triggered",
  ),
  "unsafe scenario should trigger untrusted-to-action",
);

assert(
  guardrailedFindings.some(
    (finding) =>
      finding.type === "exfiltration" && finding.status === "blocked",
  ),
  "guardrailed scenario should block exfiltration",
);

console.log("detector tests passed");
