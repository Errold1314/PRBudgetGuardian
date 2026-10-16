# B402 Merchant Application — QuickCI (sandbox)

One-page package for B402 paid-x402 merchant onboarding. Everything below is
ready to paste into the application form. **Submit the sandbox application
today** — it is a manual review process with lead time.

## Why

QuickCI is the first of three demo providers in PR Budget Guardian. Making it a
real B402 merchant turns the demo's "one real payment" into an on-chain
x402/B402 settlement on BSC testnet (TEST_U). The other two providers stay
FREE/simulated until this one is verified.

## The form

https://developers.binance.com/en/docs/products/onchainpay-x402/basics/6.apply-developer-account

Apply for: **Sandbox** (BSC testnet). A separate application is required later
for Production (BSC mainnet) — never reuse credentials across environments or
across wallets.

## Ready-to-paste values

| Form field | Value |
| --- | --- |
| Business Name | QuickCI |
| Email | `<your email>` |
| Wallet address | `0xB568eB67ae7D1Cc3e63fCc725c3Dfa1ab82eD4b7` |
| Public key | `MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC2flEQbB5ExJF7KOEKcOsnpY9sOZE0xt89wFluwOjQ86fFcu5c8FNUA9lPB7ruLIDL9aGplbLTTWOQ7ASoehIKeiAeTmq31tW/snkBJ+1WHfhf6GFk13HxxTFnOWqKyUOImJepIJAJPCWX7JdR1QbBFQhUCJ3KjVRXlr1MN4LE+QIDAQAB` |
| IP allowlist | `113.211.117.195` |
| Webhook callback URL | *(leave blank — no callbacks in this integration)* |

Notes:

- The wallet address is the **agent wallet** (evm-local keystore at
  `agents/quickci/.studio/wallets/`), not a developer treasury or buyer wallet.
- The public key is the base64 DER form of the RSA-1024 public key generated
  per the B402 request-signing spec (RSA-SHA256).
- IP allowlist = this machine's current public egress IP, so a local `bag dev`
  run can reach B402. If your ISP rotates it, the allowlist needs refreshing
  (re-check with `Invoke-RestMethod https://ipinfo.io/ip`).
- The private key never leaves this machine and is never submitted anywhere.

## Key material locations (for your eyes only)

| File | Use |
| --- | --- |
| `agents/quickci/.studio/b402/sandbox/public.der.b64` | what you submit (value above) |
| `agents/quickci/.studio/b402/sandbox/private.der.b64` | becomes `B402_PRIVATE_KEY_B64` after credentials arrive |
| `agents/quickci/.studio/b402/sandbox/private.pem` | PEM form (alternative) |

Never paste private-key material into chat, tickets, screenshots, or source files.

## After the credentials arrive

The application returns four values together (B402_BASE_URL, B402_CLIENT_ID,
B402_ACCESS_TOKEN plus the issued-key handshake), then:

0. Restore the paid price (the seller is currently FREE for the live demo):
   `bag config set payments.seller.price_usd 0.01`
1. Edit `agents/quickci/.studio/.env.local` and fill exactly:
   `B402_BASE_URL`, `B402_CLIENT_ID`, `B402_ACCESS_TOKEN`, `B402_PRIVATE_KEY_B64`
   (last = contents of `private.der.b64` — do not log it)
2. `bag x402 sell status --no-probe` — names/presence check, prints no values
3. `bag x402 sell status` — live capability probe; must find exact `eip155:97`
   and `TEST_U` (EIP-3009-only)
4. `bag deploy prepare` → deploy per provider to activate the rail

## Funding (needed before the first real settlement, not before applying)

Same agent wallet, two chains' worth of test funds:

- tBNB (gas): Telegram `@bnbchain_official_bot` — send
  `I would like to get tBNB to my wallet 0xB568eB67ae7D1Cc3e63fCc725c3Dfa1ab82eD4b7`
- testnet U (B402 rail): same bot — send
  `I would like to get U to my wallet 0xB568eB67ae7D1Cc3e63fCc725c3Dfa1ab82eD4b7`

## Later (only if more real sellers are needed)

Each additional agent (BrowserFarm, AIReviewer) needs **its own wallet and its
own merchant application** — credentials are never shared across wallets.
