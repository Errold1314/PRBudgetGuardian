"use strict";

const { Ledger, fmtMills } = require("./ledger");
const { Fingerprints, shortHash } = require("./fingerprint");
const { SimulatedRail } = require("./rails");
const { createProviders, BUGGY_SHA } = require("./providers");
const { SUITES, VALUE, triage } = require("./policy");
const { buildScenario } = require("./scenario");

const TOTAL_MILLS = 100;
const RESERVE_MILLS = 40;
const TOOL_VERSION = "v1.2.0";
const ABORT = "__aborted__";

/** What a policy-free CI config buys on every revision. */
const NAIVE_SCHEDULE = [
  "typecheck",
  "unit-tests",
  "smoke-test",
  "security-review",
  "backend-suite",
  "solidity-suite",
  "visual-review",
  "full-e2e",
];

/**
 * The guardian engine: PR events -> policy -> payment -> providers -> ledger.
 * Every mutation emits one state snapshot; the dashboard only renders state.
 *
 * mode "guardian": relevance filter, gates, cancellation, fingerprint
 *                  refusal, protected reserve, refund.
 * mode "naive":    the counterfactual — no policy at all.
 */
class Engine {
  constructor({ speed = 1, onEvent = () => {}, budget = {}, mode = "guardian", providerOptions = {} } = {}) {
    this.speed = speed;
    this.onEvent = onEvent;
    this.mode = mode;
    this.providerOptions = providerOptions;
    this.baseBudget = {
      totalMills: budget.totalMills ?? TOTAL_MILLS,
      reserveMills: budget.reserveMills ?? RESERVE_MILLS,
    };
    this.runId = 0;
    this._token = 0;
    this._logSeq = 0;
    this.reset();
  }

  isNaive() {
    return this.mode === "naive";
  }

  reset() {
    this.runId += 1;
    this.ledger = new Ledger({
      totalMills: this.baseBudget.totalMills,
      reserveMills: this.isNaive() ? 0 : this.baseBudget.reserveMills,
    });
    this.fingerprints = new Fingerprints();
    this.rail = new SimulatedRail({ speed: this.speed });
    this.providers = createProviders({ speed: this.speed, ...this.providerOptions });
    this.log = [];
    this.status = "idle";
    this.step = { index: 0, total: 13, label: "" };
    this.pr = null;
    this.needed = [];
    this.cheapNeeded = [];
    this.cheapResults = {};
    this.flags = { cheapAllPassed: false, smokePassed: false, blockers: false, mergeable: false, exhausted: false };
    this._serial = 0;
    this._t0 = null;
  }

  snapshot() {
    return {
      runId: this.runId,
      mode: this.mode,
      status: this.status,
      step: this.step,
      pr: this.pr,
      flags: this.flags,
      ledger: this.ledger.snapshot(),
      costPerAcceptedPrMills: this.flags.mergeable ? this.ledger.spentMills : null,
      log: this.log.slice(-150),
    };
  }

  emitState() {
    this.onEvent({ kind: "state", state: this.snapshot() });
  }

  emitLog(tag, text) {
    const line = {
      seq: ++this._logSeq,
      t: this._t0 ? ((Date.now() - this._t0) / 1000).toFixed(1) + "s" : "0.0s",
      tag,
      text,
    };
    this.log.push(line);
    if (this.log.length > 300) this.log = this.log.slice(-300);
    return line;
  }

  /** Start (or restart) the demo. An in-flight run is signalled to abort. */
  async run({ speed, mode } = {}) {
    this._token += 1; // signal any in-flight run to abort
    if (this.task) {
      try { await this.task; } catch { /* already handled */ }
    }
    if (speed) this.speed = speed;
    if (mode) this.mode = mode;
    this.reset();
    this._t0 = Date.now();
    this.status = "live";
    this.emitState();
    const token = this._token;
    this.task = this._execute(token);
    return this.task;
  }

  async _sleep(ms, token) {
    await new Promise((r) => setTimeout(r, Math.max(0, Math.round(ms / this.speed))));
    if (token !== this._token) throw new Error(ABORT);
  }

  async _execute(token) {
    const scenario = buildScenario(this.mode);
    this.step = { index: 0, total: scenario.length, label: "" };
    try {
      for (let i = 0; i < scenario.length; i++) {
        const s = scenario[i];
        this.step = { index: i + 1, total: scenario.length, label: s.label };
        this.emitLog("step", s.label);
        this.emitState();
        await this.dispatch(s);
        await this._sleep(s.wait || 900, token);
      }
      if (this.status !== "complete") {
        this.status = "complete";
        this.emitState();
      }
    } catch (err) {
      if (err && err.message === ABORT) return;
      this.status = "error";
      this.emitLog("error", String((err && err.message) || err));
      this.emitState();
    }
  }

  async dispatch(step) {
    switch (step.action) {
      case "openPr": return this.openPr(step.args);
      case "triage": return this.triage();
      case "buy": return this.buy(step.args);
      case "pushCommit": return this.pushCommit(step.args);
      case "requestReview": return this.requestReview();
      case "unlockAndRunFinal": return this.unlockAndRunFinal();
      case "naiveFullRun": return this.naiveFullRun();
      case "naiveCommit": return this.naiveCommit(step.args);
      case "naiveFinal": return this.naiveFinal();
      case "close": return this.close();
      default: throw new Error("unknown action: " + step.action);
    }
  }

  // ---------------------------------------------------------------- events

  async openPr(spec = {}) {
    this.pr = {
      id: spec.id || 184,
      title: spec.title || "fix: checkout button loading state",
      branch: spec.branch || "fix/checkout-loading",
      sha: spec.sha || BUGGY_SHA,
      files: spec.files || [
        "src/components/CheckoutButton.tsx",
        "src/components/CheckoutButton.test.tsx",
      ],
    };
    this.emitLog("open", `PR #${this.pr.id} "${this.pr.title}" @ ${this.pr.sha} — ${this.pr.files.length} files changed`);
    this.emitLog("open", "files: " + this.pr.files.join(", "));
  }

  async triage() {
    if (this.isNaive()) {
      this.cheapNeeded = [];
      this.cheapResults = {};
      this.emitLog("decide", "no relevance filter in this mode — every suite is scheduled on every revision");
      this.emitLog("decide", "no gates, no reserve, no duplicate-payment protection");
      this.emitState();
      return;
    }

    const { needed, notAffected } = triage(this.pr.files);
    this.needed = needed;
    this.cheapNeeded = needed.filter((s) => SUITES[s].tier === "cheap");
    this.cheapResults = {};
    this.emitLog("decide", `relevant suites: ${needed.join(", ")}`);
    this.emitLog("decide", "gated behind cheap checks: smoke-test; held for final validation: full-e2e, visual-review");
    for (const s of notAffected) {
      this.emitLog("decide", `skip ${s} — unaffected by this change (${fmtMills(SUITES[s].priceMills)} not spent)`);
    }
    const skipped = notAffected.reduce((sum, s) => sum + SUITES[s].priceMills, 0);
    if (skipped) this.ledger.addAvoided(`unaffected suites skipped (${notAffected.join(", ")})`, skipped);
    this.emitState();
  }

  /** Detect a failure, including HTTP 200 with an error embedded in the body. */
  detectFailure(res) {
    const body = res.body || {};
    if (res.httpStatus === 200 && body.ok === false) {
      const e = body.error || {};
      return {
        note: `${e.code || "ERROR"}: ${e.message || "unknown"}`,
        fingerprint: shortHash(`${e.code || ""}|${e.message || ""}`),
        embedded: true,
      };
    }
    if (res.httpStatus !== 200) {
      return {
        note: `transport error HTTP ${res.httpStatus}`,
        fingerprint: shortHash(`http|${res.httpStatus}`),
        embedded: false,
      };
    }
    return null;
  }

  async buy({ suite }) {
    const spec = SUITES[suite];
    const provider = this.providers[spec.provider];

    if (!this.isNaive()) {
      if (spec.tier === "reserve" && !this.ledger.reserveUnlocked) {
        this.emitLog("block", `${suite} stays locked — the reserve unlocks only after cheap checks pass and the PR looks mergeable`);
        return { ok: false };
      }
      if (spec.tier === "gated" && !this.flags.cheapAllPassed) {
        this.emitLog("block", `gate closed — cheap checks have not passed for ${this.pr.sha}; ${suite} not purchased`);
        return { ok: false };
      }
    }

    if (spec.priceMills > this.ledger.freeMills) {
      this.ledger.refuse({
        suite,
        provider: provider.name,
        mills: spec.priceMills,
        note: "envelope exhausted — refused; human input required",
      });
      this.emitLog("block", `envelope exhausted — cannot buy ${suite}: needs ${fmtMills(spec.priceMills)}, ${fmtMills(this.ledger.freeMills)} free`);
      this.flags.exhausted = true;
      this.emitState();
      return { ok: false, exhausted: true };
    }

    this._serial += 1;
    const idempotencyKey = `${suite}@${this.pr.sha}@${this._serial}`;
    if (this.isNaive()) {
      this.emitLog("decide", `paying ${fmtMills(spec.priceMills)} for ${suite} — no policy check`);
    } else {
      this.emitLog("decide", `value ${VALUE[suite].toFixed(2)} - ${fmtMills(spec.priceMills)} -> buy ${suite}`);
    }

    const receipt = await this.rail.pay({
      provider: spec.provider,
      suite,
      mills: spec.priceMills,
      idempotencyKey,
    });
    this.emitLog("pay", `${suite} @ ${provider.name} ${fmtMills(spec.priceMills)} settled (${receipt.ref})`);

    const res = await provider.call(suite, { sha: this.pr.sha });
    const fail = this.detectFailure(res);

    this.ledger.spend({
      suite,
      provider: provider.name,
      mills: spec.priceMills,
      outcome: fail ? "fail" : "pass",
      note: fail
        ? `${fail.note} — payment retained (no auto-refund)`
        : "relevant to this change — approved",
    });
    this.emitLog("result", fail ? `${suite} FAILED — ${fail.note}` : `${suite} passed${res.body && res.body.summary ? " — " + res.body.summary : ""}`);

    if (!this.isNaive()) this._updateFlags(suite, !fail);
    this.emitState();
    return { ok: !fail };
  }

  _updateFlags(suite, passed) {
    if (this.cheapNeeded.includes(suite)) {
      this.cheapResults[suite] = passed;
      const wasOpen = this.flags.cheapAllPassed;
      this.flags.cheapAllPassed = this.cheapNeeded.every((s) => this.cheapResults[s] === true);
      if (!wasOpen && this.flags.cheapAllPassed) {
        this.emitLog("gate", "all cheap checks passed — the smoke-test gate opens");
      }
      if (!passed && suite === "unit-tests") {
        this.emitLog("gate", "unit tests failed — expensive suites stay locked");
      }
    }
    if (suite === "smoke-test" && passed) {
      this.flags.smokePassed = true;
      this.emitLog("gate", "smoke test passed — this revision is a merge candidate");
    }
  }

  async pushCommit({ sha }) {
    const prev = this.pr.sha;
    this.pr.sha = sha;
    this.cheapResults = {};
    this.flags.cheapAllPassed = false;
    this.flags.smokePassed = false;
    this.emitLog("commit", `fix pushed: head moved ${prev} -> ${sha}`);
    this.emitLog("cancel", `outdated workflow run #5512 cancelled — it would have burned ${fmtMills(18)} on the superseded revision`);
    this.ledger.addAvoided("outdated run cancelled (revision superseded)", 18);
    this.emitLog("decide", `smoke test was never purchased on ${prev} (gate stayed closed) — withheld spend`);
    this.ledger.addAvoided("smoke test withheld on the failed revision", 10);
    this.emitState();
  }

  async requestReview() {
    const suite = "security-review";
    const spec = SUITES[suite];

    if (this.isNaive()) {
      this.emitLog("decide", "blind retry policy — no action identity, no fingerprint, paying again");
      return this._dispatchReview(suite, spec);
    }

    const id = this.fingerprints.identity({
      service: "aireviewer/security-review",
      sha: this.pr.sha,
      toolVersion: TOOL_VERSION,
      args: { pr: this.pr.id, suite },
    });

    const verdict = this.fingerprints.decide(id);

    if (verdict.verdict === "refuse") {
      this.ledger.refuse({
        suite,
        provider: "AIReviewer",
        mills: spec.priceMills,
        note: `payment refused — ${verdict.reason}`,
      });
      this.emitLog("block", `review requested again — payment refused (${verdict.reason})`);
      this.ledger.addAvoided("duplicate paid retry refused", spec.priceMills);
      this.emitState();
      return;
    }

    this.emitLog("decide", verdict.verdict === "retry" ? `retry permitted — ${verdict.reason}` : verdict.reason);
    this.emitLog("fp", `action identity ${id}`);

    const out = await this._dispatchReview(suite, spec);
    if (out && out.fail) {
      this.fingerprints.recordFailure(id, out.fail.fingerprint);
      this.emitLog("fp", `failure fp ${out.fail.fingerprint} recorded against the action identity`);
      this.emitLog("decide", "the review is advisory — its failure does not block this merge");
    }
  }

  /** Shared tail: budget check -> pay -> call -> spend. */
  async _dispatchReview(suite, spec) {
    if (spec.priceMills > this.ledger.freeMills) {
      this.ledger.refuse({
        suite,
        provider: "AIReviewer",
        mills: spec.priceMills,
        note: "envelope exhausted — refused; human input required",
      });
      this.emitLog("block", `envelope exhausted — cannot buy ${suite}: needs ${fmtMills(spec.priceMills)}, ${fmtMills(this.ledger.freeMills)} free`);
      this.flags.exhausted = true;
      this.emitState();
      return { ok: false, exhausted: true };
    }

    this._serial += 1;
    const receipt = await this.rail.pay({
      provider: "aireviewer",
      suite,
      mills: spec.priceMills,
      idempotencyKey: `${suite}@${this.pr.sha}@${this._serial}`,
    });
    this.emitLog("pay", `${suite} @ AIReviewer ${fmtMills(spec.priceMills)} settled (${receipt.ref})`);

    const res = await this.providers.aireviewer.call(suite, { pr: this.pr.id, sha: this.pr.sha });
    const fail = this.detectFailure(res);

    if (fail) {
      this.ledger.spend({
        suite,
        provider: "AIReviewer",
        mills: spec.priceMills,
        outcome: "fail",
        note: `fake success (HTTP 200 with ${fail.note}) — payment retained`,
      });
      this.emitLog("result", "security review returned HTTP 200 but the body embeds an error — treated as FAILED");
    } else {
      this.ledger.spend({
        suite,
        provider: "AIReviewer",
        mills: spec.priceMills,
        outcome: "pass",
        note: "review delivered",
      });
      this.emitLog("result", "security review passed");
    }
    this.emitState();
    return { ok: !fail, fail };
  }

  async unlockAndRunFinal() {
    const conditions = this.flags.cheapAllPassed && this.flags.smokePassed && !this.flags.blockers;
    if (!conditions) {
      this.emitLog("reserve", "reserve stays locked — unlock conditions not met");
      return;
    }
    this.ledger.unlockReserve();
    this.emitLog("reserve", `unlock conditions met (cheap checks green, smoke passed, no blockers) — ${fmtMills(RESERVE_MILLS)} reserve released for final validation`);
    this.emitState();

    const result = await this.buy({ suite: "full-e2e" });
    if (result.ok) {
      this.flags.mergeable = true;
      this.emitLog("gate", "full end-to-end passed on the final revision — the PR is mergeable");
      this.emitState();
    }
  }

  // ------------------------------------------------------------ naive mode

  async naiveFullRun() {
    for (const suite of NAIVE_SCHEDULE) {
      await this.buy({ suite });
    }
  }

  async naiveCommit({ sha }) {
    const prev = this.pr.sha;
    this.pr.sha = sha;
    this.cheapResults = {};
    this.emitLog("commit", `fix pushed: head moved ${prev} -> ${sha}`);
    this.emitLog("cancel", "the outdated run was NOT cancelled — it kept burning on the superseded revision; its results are already stale");
    this.emitState();
  }

  async naiveFinal() {
    const result = await this.buy({ suite: "full-e2e" });
    if (result.ok) {
      this.flags.mergeable = true;
      this.emitLog("gate", "final end-to-end passed on the final revision");
    } else {
      this.emitLog("block", "the envelope is gone — the final revision was never validated; the PR cannot be proven mergeable");
    }
    this.emitState();
  }

  // -------------------------------------------------------------- closing

  async close() {
    const refund = this.ledger.freeMills;
    this.ledger.refundAtClose();
    this.emitLog("close", `account closed — unused budget ${fmtMills(refund)} returned to the repository owner`);
    if (this.flags.mergeable) {
      this.emitLog("close", `cost per accepted PR: ${fmtMills(this.ledger.spentMills)}`);
    } else {
      this.emitLog("close", `no accepted PR — ${fmtMills(this.ledger.spentMills)} spent without a validated final revision`);
    }
    this.emitLog("close", this.ledger.invariantOk()
      ? "ledger invariant holds: total = spent + reserved + free + refunded"
      : "LEDGER INVARIANT VIOLATED");
    this.status = "complete";
    this.emitState();
  }
}

module.exports = { Engine, TOTAL_MILLS, RESERVE_MILLS };
