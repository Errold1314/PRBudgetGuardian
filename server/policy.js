"use strict";

/**
 * Guardian policy — deterministic rules. No ML, no LLM on the money path.
 *
 * Relevance: which suites a change actually needs (file-to-suite mapping).
 * Value: an illustrative score = failure risk x impact x relevance - cost.
 * Tiers: cheap (buy immediately) -> gated (only after cheap checks pass)
 *        -> reserve (only spendable after the reserve unlocks).
 */

const SUITES = {
  "markdown-lint":   { provider: "quickci",     priceMills: 1,  tier: "cheap" },
  "typecheck":       { provider: "quickci",     priceMills: 2,  tier: "cheap" },
  "unit-tests":      { provider: "quickci",     priceMills: 4,  tier: "cheap" },
  "smoke-test":      { provider: "browserfarm", priceMills: 10, tier: "gated" },
  "security-review": { provider: "aireviewer",  priceMills: 12, tier: "gated" },
  "backend-suite":   { provider: "quickci",     priceMills: 20, tier: "extended" },
  "solidity-suite":  { provider: "quickci",     priceMills: 12, tier: "extended" },
  "visual-review":   { provider: "browserfarm", priceMills: 8,  tier: "reserve" },
  "full-e2e":        { provider: "browserfarm", priceMills: 30, tier: "reserve" },
};

/** Illustrative action values for the decision log (risk x impact x relevance). */
const VALUE = {
  "typecheck": 0.70,
  "unit-tests": 0.90,
  "smoke-test": 0.60,
  "security-review": 0.50,
  "full-e2e": 0.64,
};

const RULES = [
  { id: "docs",      test: (f) => /\.(md|mdx|txt)$/i.test(f),                              suites: ["markdown-lint"] },
  { id: "tests",     test: (f) => /\.test\.[jt]sx?$/i.test(f),                             suites: ["unit-tests"] },
  { id: "frontend",  test: (f) => /\.(tsx|jsx|vue|css)$/i.test(f) && !/\.test\./i.test(f), suites: ["typecheck", "unit-tests", "smoke-test"] },
  { id: "payments",  test: (f) => /(payment|checkout|billing)/i.test(f),                   suites: ["security-review"] },
  { id: "contracts", test: (f) => /\.sol$/i.test(f),                                       suites: ["solidity-suite"] },
  { id: "backend",   test: (f) => /\.(ts|js)$/i.test(f) && /(server|api|backend)/i.test(f), suites: ["backend-suite"] },
];

function triage(changedFiles) {
  const needed = new Set();
  for (const rule of RULES) {
    if (changedFiles.some(rule.test)) rule.suites.forEach((s) => needed.add(s));
  }
  const notAffected = Object.keys(SUITES).filter(
    (s) => !needed.has(s) && SUITES[s].tier === "extended"
  );
  return { needed: [...needed], notAffected };
}

module.exports = { SUITES, VALUE, RULES, triage };
