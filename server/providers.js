"use strict";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BUGGY_SHA = "a11f90d"; // the first revision: unit tests genuinely fail on it

/**
 * Call the REAL QuickCI seller agent's x402 face (agents/quickci, `bag dev`).
 * FREE passthrough: POST the task as text, receive {"result": "<work JSON>"}.
 * On any failure, fall back to the in-process mock — clearly labelled, never
 * silent.
 */
async function liveTypecheck(url, taskText, fallback) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: taskText,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const envelope = await res.json();
    const report = JSON.parse(
      typeof envelope.result === "string" ? envelope.result : JSON.stringify(envelope.result)
    );
    if (report.status === "failed") {
      const first = (Array.isArray(report.errors) && report.errors[0]) || {};
      return {
        httpStatus: 200,
        body: {
          ok: false,
          error: {
            code: first.code || "TYPECHECK_FAILED",
            message: first.message || report.summary || "typecheck failed",
          },
        },
        live: true,
      };
    }
    return {
      httpStatus: 200,
      body: { ok: true, summary: `${report.summary || "typecheck clean"} (live agent)` },
      live: true,
    };
  } catch (e) {
    console.warn(`[providers] live QuickCI unreachable (${e && e.message}) — falling back to the in-process mock`);
    const out = await fallback();
    if (out.body && out.body.ok) out.body.summary = `${out.body.summary} (mock fallback)`;
    return out;
  }
}

/**
 * Three simulated paid providers. Deterministic on purpose — the demo must
 * replay identically every time.
 *
 * Every call returns a transport-shaped response: { httpStatus, body }.
 * Failure semantics (including the embedded error) are the guardian's job to
 * detect — that is the product.
 *
 * AIReviewer answers HTTP 200 but embeds a gateway error in the body. A naive
 * agent reads this as a normal result and pays for retry after retry.
 */
function createProviders({ speed = 1, reviewFailCount = Infinity, liveQuickCiUrl = null } = {}) {
  const scale = (ms) => Math.max(10, Math.round(ms / speed));
  let reviewCalls = 0;

  const quickci = {
    id: "quickci",
    name: "QuickCI",
    services: {
      "markdown-lint": { priceMills: 1, latencyMs: 200 },
      typecheck: { priceMills: 2, latencyMs: 260 },
      "unit-tests": { priceMills: 4, latencyMs: 420 },
      "backend-suite": { priceMills: 20, latencyMs: 640 },
      "solidity-suite": { priceMills: 12, latencyMs: 520 },
    },
    async call(serviceId, args) {
      const mock = async () => {
        await sleep(scale(this.services[serviceId].latencyMs));
        if (serviceId === "unit-tests" && args.sha === BUGGY_SHA) {
          return {
            httpStatus: 200,
            body: { ok: false, error: { code: "TESTS_FAILED", message: "2 of 14 specs failed" } },
          };
        }
        return { httpStatus: 200, body: { ok: true, summary: `${serviceId} clean` } };
      };
      // Live mode (opt-in): typecheck is really sold by the running QuickCI
      // seller agent (agents/quickci) over its x402 face. Everything else
      // stays in-process so the demo's beats and determinism are unchanged.
      if (liveQuickCiUrl && serviceId === "typecheck") {
        return liveTypecheck(liveQuickCiUrl, `typecheck rev ${args.sha}: PR #184 (2 files changed)`, mock);
      }
      return mock();
    },
  };

  const browserfarm = {
    id: "browserfarm",
    name: "BrowserFarm",
    services: {
      "smoke-test": { priceMills: 10, latencyMs: 700 },
      "visual-review": { priceMills: 8, latencyMs: 600 },
      "full-e2e": { priceMills: 30, latencyMs: 1100 },
    },
    async call(serviceId) {
      await sleep(scale(this.services[serviceId].latencyMs));
      return { httpStatus: 200, body: { ok: true, summary: `${serviceId} clean` } };
    },
  };

  const aireviewer = {
    id: "aireviewer",
    name: "AIReviewer",
    services: {
      "security-review": { priceMills: 12, latencyMs: 620 },
    },
    // Deterministic: HTTP 200, error embedded in the body — for the first
    // `reviewFailCount` calls (default: always). Tests flip this to prove the
    // guardian's retry logic reacts to outcomes, not to a fixed script.
    async call(serviceId) {
      await sleep(scale(this.services[serviceId].latencyMs));
      reviewCalls += 1;
      if (reviewCalls > reviewFailCount) {
        return { httpStatus: 200, body: { ok: true, summary: "review clean — no high-severity findings" } };
      }
      return {
        httpStatus: 200,
        body: {
          ok: false,
          error: {
            code: "UPSTREAM_TIMEOUT",
            message: "model gateway timed out after 30s — review not produced",
          },
        },
      };
    },
  };

  return { quickci, browserfarm, aireviewer };
}

module.exports = { createProviders, BUGGY_SHA };
