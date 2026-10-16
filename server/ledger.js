"use strict";

/**
 * Ledger — the single source of truth.
 *
 * All money is stored as integer MILLS (thousandths of a dollar):
 * 100 mills = $0.100. Integers keep the invariant exact.
 *
 * Invariant: total = spent + reserved + free + refunded
 */
const fmtMills = (mills) => "$" + (mills / 1000).toFixed(3);

class Ledger {
  constructor({ totalMills, reserveMills }) {
    this.totalMills = totalMills;
    this.spentMills = 0;
    this.reservedMills = reserveMills;
    this.freeMills = totalMills - reserveMills;
    this.refundedMills = 0;
    this.reserveUnlocked = false;
    this.entries = []; // purchase / refusal rows for the ledger table
    this.avoided = []; // estimated savings shown in the statement
    this.nextId = 1;
  }

  invariantOk() {
    return (
      this.totalMills ===
      this.spentMills + this.reservedMills + this.freeMills + this.refundedMills
    );
  }

  addEntry({ kind, outcome, suite, provider, mills, note }) {
    const entry = {
      id: this.nextId++,
      kind, // "spend" | "refused"
      outcome: outcome || null, // "pass" | "fail" for spends
      suite,
      provider,
      mills,
      note,
      at: Date.now(),
    };
    this.entries.push(entry);
    return entry;
  }

  /** Money leaves the free bucket. Settlement happens before work; a later
   *  work failure retains the payment (no automatic refund). */
  spend({ suite, provider, mills, note, outcome }) {
    if (mills > this.freeMills) {
      throw new Error(`insufficient free budget for ${suite}: needs ${mills}, has ${this.freeMills}`);
    }
    this.freeMills -= mills;
    this.spentMills += mills;
    return this.addEntry({ kind: "spend", outcome, suite, provider, mills, note });
  }

  /** Payment withheld. No money moves; recorded so the statement can show it. */
  refuse({ suite, provider, mills, note }) {
    return this.addEntry({ kind: "refused", suite, provider, mills, note });
  }

  /** Merge by label so repeated refusals aggregate into one statement line. */
  addAvoided(label, mills) {
    const existing = this.avoided.find((a) => a.label === label);
    if (existing) {
      existing.mills += mills;
      return existing;
    }
    const item = { label, mills };
    this.avoided.push(item);
    return item;
  }

  /** Reserve release: the protected funds become spendable. */
  unlockReserve() {
    this.reserveUnlocked = true;
    this.freeMills += this.reservedMills;
    this.reservedMills = 0;
  }

  refundAtClose() {
    this.refundedMills += this.freeMills;
    this.freeMills = 0;
  }

  avoidedTotalMills() {
    return this.avoided.reduce((sum, a) => sum + a.mills, 0);
  }

  refusedTotalMills() {
    return this.entries.filter((e) => e.kind === "refused").reduce((s, e) => s + e.mills, 0);
  }

  snapshot() {
    const avoidedTotalMills = this.avoidedTotalMills();
    return {
      totalMills: this.totalMills,
      spentMills: this.spentMills,
      reservedMills: this.reservedMills,
      freeMills: this.freeMills,
      refundedMills: this.refundedMills,
      reserveUnlocked: this.reserveUnlocked,
      entries: this.entries,
      avoided: this.avoided,
      avoidedTotalMills,
      refusedTotalMills: this.refusedTotalMills(),
      baselineMills: this.spentMills + avoidedTotalMills,
      invariantOk: this.invariantOk(),
    };
  }
}

module.exports = { Ledger, fmtMills };
