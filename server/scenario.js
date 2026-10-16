"use strict";

/**
 * Demo scripts.
 *
 * "guardian" — the 13-step story: relevance triage, gates, cancellation,
 *              fingerprint refusal, protected reserve, refund.
 * "naive"    — the counterfactual: no relevance filter, no gates, no reserve,
 *              no duplicate-payment protection. Same PR, same envelope, same
 *              events — the envelope burns and the final revision is never
 *              validated.
 *
 * `wait` is the pause after the step, in milliseconds (scaled by demo speed).
 */

function guardianScenario() {
  return [
    { label: "PR opened: scanning changed files",             action: "openPr",           wait: 1000 },
    { label: "Relevance triage: what this PR actually needs", action: "triage",           wait: 1600 },
    { label: "Buying typecheck",                              action: "buy", args: { suite: "typecheck" },  wait: 1200 },
    { label: "Buying unit tests",                             action: "buy", args: { suite: "unit-tests" }, wait: 1500 },
    { label: "Fix pushed: cancelling the outdated run",       action: "pushCommit", args: { sha: "c9e2f41" }, wait: 1600 },
    { label: "Re-running typecheck",                          action: "buy", args: { suite: "typecheck" },  wait: 1200 },
    { label: "Re-running unit tests",                         action: "buy", args: { suite: "unit-tests" }, wait: 1400 },
    { label: "Gate open: buying the smoke test",              action: "buy", args: { suite: "smoke-test" }, wait: 1600 },
    { label: "Buying security review",                        action: "requestReview",    wait: 1500 },
    { label: "Controlled retry of the review",                action: "requestReview",    wait: 1500 },
    { label: "Duplicate review: refusing payment",            action: "requestReview",    wait: 1600 },
    { label: "Reserve unlocked: buying full end-to-end",      action: "unlockAndRunFinal", wait: 1800 },
    { label: "Closing the account",                           action: "close",            wait: 800 },
  ];
}

function naiveScenario() {
  return [
    { label: "PR opened: scanning changed files",           action: "openPr",         wait: 900 },
    { label: "No relevance filter: running every suite",    action: "naiveFullRun",   wait: 1600 },
    { label: "Fix pushed: the outdated run is left running", action: "naiveCommit", args: { sha: "c9e2f41" }, wait: 1400 },
    { label: "Running everything again on the fix",         action: "naiveFullRun",   wait: 1800 },
    { label: "AI review requested",                         action: "requestReview",  wait: 1100 },
    { label: "Review requested again (blind retry)",        action: "requestReview",  wait: 1100 },
    { label: "Review requested a third time",               action: "requestReview",  wait: 1100 },
    { label: "Final validation attempted",                  action: "naiveFinal",     wait: 1500 },
    { label: "Closing the account",                         action: "close",          wait: 700 },
  ];
}

function buildScenario(mode = "guardian") {
  return mode === "naive" ? naiveScenario() : guardianScenario();
}

module.exports = { buildScenario };
