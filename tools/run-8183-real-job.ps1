# run-8183-real-job.ps1 — run ONE real ERC-8183 escrow job on BSC testnet.
#
# Buyer : agents/guardian  wallet 0xBF562b6bD63FFaf091d2991aE451576fDbc3Fa73
# Seller: agents/quickci   wallet 0xB568eB67ae7D1Cc3e63fCc725c3Dfa1ab82eD4b7
#
# Preconditions (do these first):
#   1) Both wallets funded (free faucets, see DEMO-PLAYBOOK.md):
#        seller: tBNB (gas for the on-chain submit)
#        buyer : tBNB (gas for create/fund/approve) + testnet U (the escrow)
#   2) Seller charges a positive price and bag dev was RESTARTED after:
#        cd D:\PRBudgetGuardian\agents\quickci
#        bag config set payments.seller.price_usd 0.01
#        bag dev              # keep running; wait for "serving on 127.0.0.1:9000"
#      (a real escrow requires funded_budget == signed_quote_price exactly;
#       at price 0 the quote is 0 and there is nothing to escrow)
#
# Usage:
#   powershell -File tools\run-8183-real-job.ps1
#   powershell -File tools\run-8183-real-job.ps1 -AmountUsd 0.01 -DeadlineMin 30

param(
  [string]$Seller = "0xB568eB67ae7D1Cc3e63fCc725c3Dfa1ab82eD4b7",
  [string]$AmountUsd = "0.01",
  [int]$DeadlineMin = 30,
  [string]$AgentUrl = "http://127.0.0.1:9000"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot            # D:\PRBudgetGuardian
$guardianWs = Join-Path $root "agents\guardian"
$quoteFile = Join-Path $guardianWs "quote.json"

function Invoke-A2ASkill {
  param([string]$Skill, [hashtable]$Extra)
  $data = @{ skill = $Skill }
  foreach ($k in $Extra.Keys) { $data[$k] = $Extra[$k] }
  $bodyObj = @{
    jsonrpc = "2.0"; id = 1; method = "message/send"
    params = @{
      message = @{
        kind = "message"; role = "user"; messageId = [guid]::NewGuid().ToString()
        parts = @( @{ kind = "data"; data = $data } )
      }
    }
  }
  $body = $bodyObj | ConvertTo-Json -Depth 12 -Compress
  $resp = Invoke-WebRequest -UseBasicParsing -Method POST -Uri $AgentUrl -ContentType "application/json" -Body $body -TimeoutSec 40
  return ($resp.Content | ConvertFrom-Json)
}

Write-Host ""
Write-Host "== 1/5 liveness: fetching the agent card =="
$card = (Invoke-WebRequest -UseBasicParsing "$AgentUrl/.well-known/agent-card.json" -TimeoutSec 10).Content | ConvertFrom-Json
Write-Host ("   agent: " + $card.name)

Write-Host "== 2/5 negotiate: get the wallet-signed quote =="
$neg = Invoke-A2ASkill -Skill "negotiate" -Extra @{
  task_description = "typecheck PR #184 rev a11f90d (2 files changed)"
  terms = @{ deliverables = "typecheck report JSON"; quality_standards = "clean or explicit error list" }
}
$envelope = $neg.result.parts[0].data
if (-not $envelope.response.accepted) { throw "seller rejected the quote" }
$quotePrice = [string]$envelope.response.terms.price
Write-Host ("   price (raw)  : " + $quotePrice)
Write-Host ("   currency     : " + $envelope.response.terms.currency)
Write-Host ("   provider_sig : " + $envelope.provider_sig.Substring(0, 42) + "...")

# Save WITHOUT BOM (PS 5.1 utf8 adds a BOM that breaks JSON.parse in Node)
$json = $envelope | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($quoteFile, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("   envelope saved -> " + $quoteFile)

Write-Host "== 3/5 buy: create + fund the job on-chain (4 txs) =="
Set-Location $guardianWs
$buyOut = (& bag erc8183 buy --provider $Seller --quote-json $quoteFile `
  --task "typecheck PR #184 rev a11f90d" --budget-usd $AmountUsd `
  --deadline-min $DeadlineMin --network bsc-testnet | Out-String)
$clean = $buyOut -replace "\x1b\[[0-9;]*m", ""     # strip ANSI if any
Write-Host $clean
if ($clean -notmatch "job_id:\s*(\d+)") { throw "could not parse job_id from the buy output above" }
$jobId = $Matches[1]
Write-Host ("   job_id = " + $jobId)

Write-Host "== 4/5 notify_funded: ask the seller to deliver =="
$notify = Invoke-A2ASkill -Skill "notify_funded" -Extra @{ job_id = [int]$jobId }
$notifyData = $notify.result.parts[0].data | ConvertTo-Json -Compress -Depth 10
Write-Host ("   seller says: " + $notifyData)

Write-Host "== 5/5 polling the chain until SUBMITTED =="
$status = ""
for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 6
  $status = (& bag erc8183 status $jobId | Out-String) -replace "\x1b\[[0-9;]*m", ""
  if ($status -match "SUBMITTED|COMPLETED") { break }
  Write-Host ("   waiting... " + ($i * 6) + "s")
}
Write-Host $status
Write-Host "== deliverable =="
(& bag erc8183 fetch $jobId | Out-String) -replace "\x1b\[[0-9;]*m", ""

Write-Host ""
Write-Host "== DONE. Next steps: =="
Write-Host "   - Open the tx hashes (printed above / in the job history) on https://testnet.bscscan.com"
Write-Host "   - approve (COMPLETED + payment release) opens after the 24h dispute window:"
Write-Host ("       cd " + $guardianWs)
Write-Host ("       bag erc8183 settle " + $jobId + " --action approve")
Write-Host "   - restore FREE pricing for the live x402 demo afterwards:"
Write-Host "       cd D:\PRBudgetGuardian\agents\quickci"
Write-Host "       bag config set payments.seller.price_usd 0"
