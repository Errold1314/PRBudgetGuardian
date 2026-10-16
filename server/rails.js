"use strict";

const { shortHash } = require("./fingerprint");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Payment rails — the only swappable layer of the guardian.
 *
 * Both rails implement the same interface:
 *   pay({ provider, suite, mills, idempotencyKey }) -> receipt
 *
 * Semantics mirror B402: settlement happens BEFORE work; a later work failure
 * retains the payment and does not trigger an automatic refund.
 */
class SimulatedRail {
  constructor({ speed = 1 } = {}) {
    this.speed = speed;
  }

  async pay({ provider, suite, mills, idempotencyKey }) {
    await sleep(Math.max(8, Math.round(160 / this.speed)));
    return {
      rail: "simulated",
      status: "settled",
      ref: "sim-" + shortHash(idempotencyKey),
      provider,
      suite,
      mills,
    };
  }
}

/** Stub for the real rail: one x402/B402 payment on BSC testnet (TEST_U).
 *  Wiring it up requires B402 merchant credentials — everything else in the
 *  guardian stays unchanged. */
class B402Rail {
  async pay() {
    throw new Error("B402 rail not wired yet — requires B402 merchant credentials (TEST_U sandbox).");
  }
}

module.exports = { SimulatedRail, B402Rail };
