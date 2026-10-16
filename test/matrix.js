"use strict";

/**
 * Test matrix — proves the decisions are a real engine, not a fixed script.
 * Run: npm run matrix
 */

const { Engine } = require("../server/engine");

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const setEq = (a, b) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
const quiet = { onEvent: () => {}, speed: 1000 };

/* [1] Relevance is a real rule: different changes buy different suites. */
async function t1_relevance() {
  console.log("\n[1] relevance: different PRs buy different suites");
  const variants = [
    { files: ["docs/guide.md"], expect: ["markdown-lint"] },
    { files: ["contracts/Payment.sol"], expect: ["solidity-suite", "security-review"] },
    { files: ["server/api/charge.ts"], expect: ["backend-suite"] },
    { files: ["web/Button.css"], expect: ["typecheck", "unit-tests", "smoke-test"] },
    { files: ["README.md", "contracts/Fee.sol"], expect: ["markdown-lint", "solidity-suite"] },
  ];
  for (const v of variants) {
    const e = new Engine(quiet);
    await e.openPr({ files: v.files });
    await e.triage();
    check(`${v.files.join(", ")} -> ${v.expect.join("+")}`, setEq(e.needed, v.expect), "got " + e.needed.join("+"));
  }
}

/* [2] Same scenario twice -> byte-identical ledger. */
async function t2_determinism() {
  console.log("\n[2] determinism: the same scenario produces the identical ledger");
  const a = new Engine(quiet);
  await a.run({});
  const b = new Engine(quiet);
  await b.run({});
  const norm = (s) =>
    JSON.stringify(s.ledger.entries.map((e) => [e.kind, e.suite, e.mills, e.outcome, e.note]));
  check("ledger entries identical", norm(a.snapshot()) === norm(b.snapshot()));
  check("spent identical", a.snapshot().ledger.spentMills === b.snapshot().ledger.spentMills);
  check("avoided identical", a.snapshot().ledger.avoidedTotalMills === b.snapshot().ledger.avoidedTotalMills);
}

/* [3] Fingerprint is a state machine: a retry that succeeds is not blocked. */
async function t3_fingerprint_recovery() {
  console.log("\n[3] fingerprint state machine: retry that succeeds is NOT blocked");
  const e = new Engine({ ...quiet, providerOptions: { reviewFailCount: 1 } });
  await e.openPr({});
  await e.triage();
  await e.requestReview(); // fails once (paid)
  await e.requestReview(); // controlled retry — succeeds (recovery)
  const snap = e.snapshot();
  const refused = snap.ledger.entries.filter((x) => x.kind === "refused").length;
  const spends = snap.ledger.entries.filter((x) => x.kind === "spend" && x.suite === "security-review").length;
  check("no refusal after a successful retry", refused === 0, `refused=${refused}`);
  check("exactly two review payments", spends === 2, `spends=${spends}`);
}

/* [4] Never overspends; tiny envelopes degrade gracefully with the invariant intact. */
async function t4_never_overspend() {
  console.log("\n[4] never overspends: tiny envelopes degrade gracefully");
  const e = new Engine({ ...quiet, budget: { totalMills: 5, reserveMills: 0 } });
  await e.openPr({});
  await e.triage();
  const r1 = await e.buy({ suite: "typecheck" }); // $0.002 fits
  const r2 = await e.buy({ suite: "unit-tests" }); // $0.004 does not
  const snap = e.snapshot();
  check("first purchase ok", r1.ok === true);
  check("second purchase refused as exhausted", r2.exhausted === true);
  check("exhausted flag raised", e.flags.exhausted === true);
  check("invariant holds", snap.ledger.invariantOk);
  check("never spent more than the envelope", snap.ledger.spentMills <= 5, `spent=${snap.ledger.spentMills}`);

  const e2 = new Engine({ ...quiet, budget: { totalMills: 20, reserveMills: 8 } });
  await e2.run({});
  const s2 = e2.snapshot();
  check("tiny-envelope full run still completes", s2.status === "complete", `status=${s2.status}`);
  check("tiny-envelope full run: invariant holds", s2.ledger.invariantOk);
  check("tiny-envelope full run: no overspend", s2.ledger.spentMills <= 20, `spent=${s2.ledger.spentMills}`);
}

/* [5] Refusal stress: 100 duplicate requests -> pay twice, refuse the rest. */
async function t5_refusal_stress() {
  console.log("\n[5] refusal stress: 100 duplicate requests -> 2 payments, the rest refused");
  const e = new Engine(quiet);
  await e.openPr({});
  await e.triage();
  await e.requestReview(); // first attempt, paid, fails
  await e.requestReview(); // controlled retry, paid, fails
  for (let i = 0; i < 100; i++) await e.requestReview();
  const snap = e.snapshot();
  const spends = snap.ledger.entries.filter((x) => x.kind === "spend" && x.suite === "security-review").length;
  const refused = snap.ledger.entries.filter((x) => x.kind === "refused");
  const merged = snap.ledger.avoided.find((a) => a.label === "duplicate paid retry refused");
  check("exactly 2 payments", spends === 2, `spends=${spends}`);
  check("exactly 100 refusals", refused.length === 100, `refused=${refused.length}`);
  check("refused mills = 100 x $0.012", snap.ledger.refusedTotalMills === 1200, `${snap.ledger.refusedTotalMills}`);
  check("avoided aggregated into one line", !!merged && merged.mills === 1200, merged && `${merged.mills}`);
  check("invariant holds", snap.ledger.invariantOk);
}

(async () => {
  console.log("=== PR BUDGET GUARDIAN — TEST MATRIX ===");
  await t1_relevance();
  await t2_determinism();
  await t3_fingerprint_recovery();
  await t4_never_overspend();
  await t5_refusal_stress();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
