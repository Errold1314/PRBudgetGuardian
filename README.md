# PR Budget Guardian (demo)

A financial controller for AI-generated pull requests. Every PR gets a budget
envelope; the guardian buys only the tests and reviews the change actually
needs, cancels outdated runs, refuses duplicate paid retries, and protects a
reserve for final validation.

Zero dependencies — plain Node.js (built-in `http` server + SSE). No build step.

## Online hosting

The dashboard can be deployed to Vercel using the included `vercel.json`.
Static assets come from `web/`; `/events` streams a complete, independent
scenario from `api/events.js`. Each visitor and replay has its own engine,
so the demo works across serverless instances without a shared memory store.
Select Guardian or Naive and press Replay to compare policies.

The public dashboard uses **simulated payments and providers**. The local
seller agents are retained as source in `agents/`, but are not deployed by
Vercel. Wallets, `.studio/`, private keys and `.env` files are excluded from
Git and deployment uploads. Configure and deploy real agents separately.

    npm run test:hosting # SSE streaming, visitor isolation and both policies

## Run

    npm start        # dashboard at http://localhost:8420 (demo auto-plays)
    npm run selftest # guardian scenario in fast-forward, 10 assertions
    npm run matrix   # test matrix: 23 checks proving the engine is real

## Live mode — QuickCI is a real agent

The demo's QuickCI purchases can go through the **real seller agent** running
locally (`agents/quickci`, scaffolded with bnbagent-studio — A2A + x402):

    # terminal 1 — the seller agent (real runtime, real wallet, signed quotes)
    cd agents/quickci
    bag dev

    # terminal 2 — the guardian, with typecheck routed to the live agent
    npm run start:live

In live mode the demo's two typecheck purchases become real HTTP calls to the
agent's x402 face; the decision log marks them `(live agent)` with the agent's
actual report (e.g. "typecheck clean — 25 files, 0 errors (live agent)").
All other suites stay in-process (deterministic). If the agent is unreachable,
the provider falls back to the mock and labels it `(mock fallback)` — never
silently.

Current seller state: **FREE passthrough** (`price_usd = "0"`) because PAID
activation waits on B402 merchant credentials (see `B402-APPLICATION.md`).
Before applying PAID, restore: `bag config set payments.seller.price_usd 0.01`.

## The two policies (A/B in the dashboard)

Switch "Policy" between **Guardian** and **Naive** and replay. Same PR, same
envelope, same events — only the policy differs:

| | Guardian | Naive |
| --- | --- | --- |
| Spent | $0.076 | $0.100 (the whole envelope) |
| Refunded | $0.024 | $0.000 |
| Refused (withheld) | $0.012 | $0.162 |
| Final revision validated | yes | **no** — the envelope died 2 mills into revision 2 |
| Cost per accepted PR | $0.076 | not accepted |

## The 13-step guardian scenario

1. PR #184 opens — changed files are scanned
2. Relevance triage — unaffected suites are rejected, expensive ones locked
3. Buy typecheck — passes
4. Buy unit tests — fails; expensive suites stay locked
5. Fix pushed — the outdated run is cancelled, its cost avoided
6. Re-run typecheck — passes
7. Re-run unit tests — passes; the smoke-test gate opens
8. Buy smoke test — passes; the PR is a merge candidate
9. Buy security review — HTTP 200 with an error embedded in the body
10. Controlled retry — the same embedded error again; the failure fingerprint matches
11. Duplicate review requested — payment refused
12. Reserve unlocked — full end-to-end purchased with the protected funds
13. Account closed — unused budget is refunded

## Test matrix — why you can trust the demo

`npm run matrix` proves the decisions are a real engine, not a fixed script:

1. **relevance** — docs-only / contracts / backend PRs buy different suites
2. **determinism** — the same scenario produces a byte-identical ledger
3. **fingerprint state machine** — a retry that succeeds is *not* blocked
4. **never overspends** — tiny envelopes degrade gracefully; the invariant holds
5. **refusal stress** — 100 duplicate requests: 2 payments, the rest refused

## Layout

    server/ledger.js       money ledger (integer mills; invariant: total = spent + reserved + free + refunded)
    server/policy.js       relevance rules, suite catalog, value scores
    server/fingerprint.js  duplicate-payment protection (action identities, failure fingerprints)
    server/rails.js        swappable payment rail — SimulatedRail today, B402Rail stub
    server/providers.js    QuickCI / BrowserFarm / AIReviewer (deterministic, incl. the fake success)
    server/engine.js       orchestration: events -> policy -> payment -> providers -> ledger
    server/scenario.js     the guardian and naive scripts
    test/matrix.js         the 5-family test matrix
    web/                   dashboard (SSE client, no framework)
    agents/quickci/        real bag seller agent (wallet, keys, B402 prep)
    B402-APPLICATION.md    ready-to-submit B402 merchant application (sandbox)

## Roadmap

- [x] Guardian engine + dashboard + A/B naive counterfactual + test matrix
- [x] Real seller scaffolded: `agents/quickci` (A2A + X402, $0.01/request, BSC testnet)
- [ ] **Submit the B402 sandbox application** (see `B402-APPLICATION.md`) — has review lead time
- [ ] Credentials -> `.studio/.env.local` -> `bag x402 sell status` -> wire `B402Rail` -> one real TEST_U settlement
- [ ] GitHub webhook as a second event source
- [ ] The guardian's own paid face (self-funding loop)
