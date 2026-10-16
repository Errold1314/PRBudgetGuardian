# Demo Playbook — PR Budget Guardian

The demo is **deterministic** — rehearse it three times and the third run is
byte-identical to the first. That is itself a feature: nothing on stage can
surprise you.

## The three things judges must walk away knowing

1. **It refuses to spend** — relevance triage, locked gates, refused retries.
   (Most agent demos show *paying*; ours shows *not paying, with proof*.)
2. **The money math is airtight** — the invariant, the reserve, the refund,
   cost per accepted PR = $0.076.
3. **It is real** — a real seller agent runs locally, signs real quotes,
   serves the typecheck work live. What is *not* real yet (on-chain
   settlement) we say out loud, and show exactly which switch turns it on.

## Real escrow job on BSC testnet (one-time proof — run BEFORE demo day)

The strongest evidence for BNB judging ("real successful transactions rather
than unrealized claims"): **one real ERC-8183 escrowed job** — create → fund →
deliver → on-chain submit — with BscScan testnet links for the pitch.

1. Faucet both wallets (free; Telegram `@bnbchain_official_bot`):
   - seller `0xB568eB67ae7D1Cc3e63fCc725c3Dfa1ab82eD4b7` — send: `I would like to get tBNB to my wallet 0xB568eB67ae7D1Cc3e63fCc725c3Dfa1ab82eD4b7`
   - buyer `0xBF562b6bD63FFaf091d2991aE451576fDbc3Fa73` — send: `I would like to get tBNB to my wallet 0xBF562b6bD63FFaf091d2991aE451576fDbc3Fa73`
   - buyer also needs U — send: `I would like to get U to my wallet 0xBF562b6bD63FFaf091d2991aE451576fDbc3Fa73`
2. A real escrow needs a positive price (funded budget must equal the signed
   quote exactly):
       cd agents\quickci
       bag config set payments.seller.price_usd 0.01
       bag dev            # restart, keep running
3. Run the one-shot job:
       powershell -File tools\run-8183-real-job.ps1
4. When it reaches SUBMITTED, the 24h dispute window starts — that window IS
   buyer protection (say so on stage). Approve after it elapses:
       cd agents\guardian
       bag erc8183 settle <job_id> --action approve
5. Restore FREE pricing for the live x402 demo:
       cd agents\quickci
       bag config set payments.seller.price_usd 0
       bag dev            # restart

## Pre-flight (T-30 minutes, do not skip)

```powershell
# Terminal 1 — the real seller agent. COLD START TAKES ~30s. Start it early.
cd D:\PRBudgetGuardian\agents\quickci
bag dev
# wait for:  [seller-agent] serving on 127.0.0.1:9000 (x402: active)

# Terminal 2 — the guardian with live wiring
cd D:\PRBudgetGuardian
npm run start:live
# wait for:  dashboard: http://localhost:8420
```

Then:

- Open http://localhost:8420 in the browser, let one full run finish, so the
  first on-stage Replay is warm.
- Do ONE rehearsal replay at 1× while reading the narration below.
- Terminal font: large. Browser: full screen, zoom so the balance rule fills
  the top third.
- Close everything else that makes noise.

**Fallback (if `bag dev` won't start on the day):** run `npm start` instead —
pure deterministic mock mode, everything works, the log lines simply lack
`(live agent)`. See the fallback ladder below.

## The 7-minute script

### Act 0 — the problem (30 s, no screen)

> "AI coding agents push 5–10 revisions per PR. Every push re-burns CI,
> browser tests and paid AI review — a one-button change runs the backend
> and Solidity suites too, an outdated run keeps burning after the fix
> lands, and a review that failed with an embedded error gets paid for six
> times. Teams report CI costs spiraling. We built the financial controller
> for that."

### Act 1 — the guardian run (2 min, speed 1×, click **Replay demo**)

Narrate as it plays; don't rush — 1× takes ~26 s total:

- **Step 2 (~3 s)** — point at the decision log: *"backend and Solidity
  suites are rejected as unaffected. That's $0.032 never spent — watch the
  avoided list."*
- **Step 4 (~9 s)** — *"Unit tests fail. Everything expensive stays locked.
  This is the point: you don't pay for the full suite on a revision that
  can't merge."*
- **Step 5 (~11 s)** — *"The fix lands, the outdated run is cancelled —
  another $0.018 avoided."*
- **Steps 9–11 (~18–23 s)** — **killer moment #1.** *"The AI reviewer
  answers HTTP 200 but the error is embedded in the body. The guardian
  fingerprints the failure, permits exactly one controlled retry, and on
  the second equivalent failure it REFUSES to pay."* Point at the
  struck-through $0.012 in the ledger.
- **Steps 12–13 (~25 s)** — *"And now the reserve unlocks — the $0.040 that
  could not be touched during diagnosis pays for the one test that proves
  the merge. Account closes: spent $0.076, refunded $0.024, cost per
  accepted PR: $0.076."*

### Act 2 — the counterfactual (1 min, speed 4×)

Switch **Policy → Naive**, click Replay. 9 seconds:

> "Same PR, same envelope, same events — only the policy changes. No triage,
> no gates, no reserve, blind retries. The envelope burns to $0.000, $0.162
> of purchase requests get refused for lack of funds — and the final
> revision is never validated. That's the A/B: $0.076 accepted vs $0.100
> burned with nothing proven."

### Act 3 — proof it's real (1.5 min)

- Point at terminal 1: *"That's a real seller agent — bag runtime, real
  wallet, x402 payment face."*
- Scroll the decision log, point at: `typecheck passed — typecheck clean —
  25 files, 0 errors (live agent)` — *"that report was computed by the agent
  process and crossed the wire."*
- Optional flourish in terminal 3 (cold, but impressive):

```powershell
$body = '{"jsonrpc":"2.0","id":1,"method":"send","params":{"message":{"kind":"message","role":"user","messageId":"m1","parts":[{"kind":"data","data":{"skill":"negotiate","task_description":"typecheck","terms":{"deliverables":"report","quality_standards":"clean"}}}]}}}'
# (full command in the repo history) → returns a wallet-signed quote:
# provider_sig 0x4950…, chain_id 97 — a real EIP-191 signature over the price.
```

- **Honesty card, say it plainly:** *"The one thing still simulated is the
  on-chain settlement — that opens when our B402 merchant application is
  approved; the switch is one file (`rails.js`). Everything else in this
  chain is real."*

### Act 4 — close (30 s)

> "PR Budget Guardian is the **buy side** of agent commerce: an agent with a
> wallet that buys services per call, refuses duplicate payments, protects
> its budget, and earns a cut of verified savings to fund itself. 23
> automated checks prove the engine; run `npm run matrix` to see them."

## Fallback ladder (rehearse the ladder, not just the happy path)

| Level | Setup | When |
| --- | --- | --- |
| L1 | `bag dev` + `npm run start:live` (+ real tx hash if B402 credentials landed) | default |
| L2 | `npm run start:live`, agent down → provider auto-falls back to mock, labeled `(mock fallback)` | agent crashed on stage |
| L3 | `npm start` — fully offline deterministic | no network / nothing else works |
| L4 | `shot-guardian.png` / `shot-naive.png` + screen recording | laptop died |

**Record the backup video NOW** (one clean 1× guardian run + one naive run) —
2 minutes of OBS/Game Bar, insurance against everything.

## Booth mode (30 seconds, judges walking by)

Replay at 4×. Say three sentences while pointing:
1. "An agent that gives every AI PR a budget and only buys the tests the
   change actually needs."
2. "Watch it refuse a duplicate payment — that red struck-through line."
3. "Spent $0.076 of $0.100, refunded the rest, and the seller over there is
   a real agent."

## Judge Q&A bank

| Question | Answer spine |
| --- | --- |
| Is any of this real? | Two real processes; real wallet signs real quotes; live typecheck served by the agent. On-chain settlement waits on B402 approval — one-file switch, say it plainly. |
| Where does the money come from? | The repo owner's existing CI budget, prepaid into a capped wallet. The guardian's own income = a cut of verified savings. |
| How do you know it saves money? | Same-PR A/B (naive burns the envelope and still can't validate) + 23-check matrix incl. never-overspend and 100-duplicate-refusal stress. Real-world proof next: shadow mode on a live repo. |
| Relation to agent-to-agent commerce? | This is the buy side — per-call micro-payments ($0.002–$0.030) are impossible on card rails; and someone has to make autonomous spending *safe*. |
| Why not just use existing CI tools? | They run tests; we decide whether the money is worth spending, per event, inside an envelope, with refusal and reserve as first-class behaviors. |
| Security? | Caps are config (LLM can never sign or change a payee), keystore private, ledger invariant enforced, spends idempotent by fingerprint. |
| What's next? | B402 credentials → real settlement tx; GitHub webhook; the guardian's own paid face (self-funding loop). |

## Before demo day — task list

- [ ] **Submit the B402 merchant application** (`B402-APPLICATION.md` — the
      only external lead-time item)
- [ ] If credentials arrive: restore price `bag config set
      payments.seller.price_usd 0.01`, wire `B402Rail`, rehearse the paid run
- [ ] Rehearse the 7-minute script 3×
- [ ] Record the backup video
- [ ] Optional: add the "Guardian fee (10% of verified savings)" row so the
      self-funding loop is visible on the statement
