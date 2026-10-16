"use strict";

const crypto = require("crypto");

const shortHash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 10);

/**
 * Duplicate-payment protection.
 *
 * An action identity is (service, commit sha, tool version, args hash).
 * Every failure is recorded with a fingerprint derived from the failure content.
 *
 * Policy:
 *   - first failure            -> one controlled retry is permitted
 *   - two equivalent failures  -> payment is refused
 *   - a new commit             -> new identity, clean slate
 */
class Fingerprints {
  constructor() {
    this.actions = new Map();
  }

  identity({ service, sha, toolVersion, args }) {
    return `${service}@${sha}@${shortHash(JSON.stringify(args))}` + `#${toolVersion}`;
  }

  /** Decide before paying. Returns { verdict: "allow" | "retry" | "refuse", reason } */
  decide(id) {
    const rec = this.actions.get(id);
    if (!rec || rec.failureFingerprints.length === 0) {
      return { verdict: "allow", reason: "first attempt for this action" };
    }
    const fps = rec.failureFingerprints;
    if (fps.length >= 2 && fps[fps.length - 1] === fps[fps.length - 2]) {
      return { verdict: "refuse", reason: `equivalent failure recorded twice (fp ${fps[fps.length - 1]})` };
    }
    return { verdict: "retry", reason: "first failure — one controlled retry permitted" };
  }

  recordFailure(id, failureFingerprint) {
    const rec = this.actions.get(id) || { failureFingerprints: [] };
    rec.failureFingerprints.push(failureFingerprint);
    this.actions.set(id, rec);
  }
}

module.exports = { Fingerprints, shortHash };
