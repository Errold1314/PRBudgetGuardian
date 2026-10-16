/**
 * QuickCI's work product: a deterministic typecheck service.
 *
 * This replaces the generic LLM passthrough (`buildRunWork` in unifiedMain.ts)
 * with the mechanical service QuickCI actually sells on its paid faces
 * (ERC-8183 `notify_funded` delivery + the B402 `/x402` route).
 *
 * Deterministic on purpose: the same task always produces the same report, so
 * demos and tests replay byte-for-byte. Honest about what it is — a clearly
 * labelled **simulated** typecheck engine for the hackathon demo; to sell a
 * different service, swap this one file.
 *
 * Signing stays where it belongs: this hook only PRODUCES the deliverable
 * text — all money handling is fixed code in signing.ts.
 */

import { createHash } from "node:crypto";
import type { RunWork } from "./sellerCore.js";

export interface QuickCiReport {
  service: string;
  version: string;
  status: "clean" | "failed";
  summary: string;
  checked: {
    files: number;
    errors: number;
    warnings: number;
    duration_ms: number;
  };
  errors: Array<{ file: string; line: number; code: string; message: string }>;
  session_id: string;
}

/** The task text arrives inside the delivery prompt; pull the useful part out. */
function extractTask(prompt: string): string {
  const marker = "JOB CONTEXT:";
  const idx = prompt.indexOf(marker);
  return (idx >= 0 ? prompt.slice(idx + marker.length) : prompt).trim();
}

/** Deterministic pseudo-random helper — no Date.now(), no Math.random(). */
function deterministicInt(seed: string, min: number, max: number): number {
  const digest = createHash("sha256").update(seed).digest();
  return min + (digest.readUInt32BE(0) % (max - min + 1));
}

export function runQuickCiTypecheck(task: string, sessionId: string): QuickCiReport {
  // Deterministic behaviour: a task that explicitly asks for the failing
  // fixture gets the failing report; everything else is clean.
  const wantsFailure = /\bFAIL\b|buggy|broken-sha/i.test(task);
  const files = deterministicInt(task, 8, 42);
  const errors = wantsFailure
    ? [
        {
          file: "src/components/CheckoutButton.tsx",
          line: 42,
          code: "TS2345",
          message:
            "Argument of type 'string | undefined' is not assignable to parameter of type 'string'.",
        },
        {
          file: "src/components/CheckoutButton.tsx",
          line: 57,
          code: "TS7006",
          message: "Parameter 'event' implicitly has an 'any' type.",
        },
      ]
    : [];
  const status = errors.length ? "failed" : "clean";
  return {
    service: "quickci/typecheck",
    version: "1.0.0",
    status,
    summary:
      status === "clean"
        ? `typecheck clean — ${files} files, 0 errors`
        : `typecheck failed — ${errors.length} errors in ${files} files`,
    checked: {
      files,
      errors: errors.length,
      warnings: deterministicInt(`${task}:w`, 0, 3),
      duration_ms: deterministicInt(`${task}:d`, 400, 2400),
    },
    errors,
    session_id: sessionId,
  };
}

export function buildQuickCiRunWork(): RunWork {
  return async (prompt, { sessionId }) => {
    const report = runQuickCiTypecheck(extractTask(prompt), sessionId);
    return JSON.stringify(report, null, 2);
  };
}
