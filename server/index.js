"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { Engine } = require("./engine");
const { fmtMills } = require("./ledger");
const { serveEvents } = require("./stream");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8420;
const WEB_DIR = path.resolve(__dirname, "..", "web");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

function main() {
  const clients = new Set();
  // --live (or LIVE_QUICKCI=<url>): route QuickCI's typecheck purchases to the
  // REAL seller agent running locally (`bag dev` in agents/quickci) instead of
  // the in-process mock. Other suites are unaffected either way.
  const liveQuickCiUrl = process.argv.includes("--live")
    ? "http://127.0.0.1:9000/x402"
    : process.env.LIVE_QUICKCI || null;
  const engine = new Engine({ speed: 1, onEvent: broadcast, providerOptions: { liveQuickCiUrl } });

  function broadcast(ev) {
    const payload = `data: ${JSON.stringify(ev)}\n\n`;
    for (const res of clients) {
      try { res.write(payload); } catch { /* client gone */ }
    }
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/api/state") return sendJson(res, engine.snapshot());

    if (url.pathname === "/api/demo/run" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let speed = 1;
        let mode = "guardian";
        try {
          const body = JSON.parse(raw || "{}");
          speed = Number(body.speed) || 1;
          if (body.mode === "naive") mode = "naive";
        } catch { /* defaults */ }
        if (![1, 2, 4].includes(speed)) speed = 1;
        engine.run({ speed, mode }).catch(() => {});
        sendJson(res, { started: true, speed, mode });
      });
      return;
    }

    if (url.pathname === "/events") {
      serveEvents(req, res, { liveQuickCiUrl }).catch((error) => {
        console.error("Demo stream failed", error);
        res.end();
      });
      return;
    }

    // static files from web/
    const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const file = path.resolve(WEB_DIR, rel);
    if (!file.startsWith(WEB_DIR)) {
      res.writeHead(404);
      return res.end("not found");
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      });
      res.end(data);
    });
  });

  server.listen(PORT, () => {
    console.log("PR Budget Guardian — demo server");
    console.log(`  dashboard: http://localhost:${PORT}`);
    console.log("  the demo starts automatically; press Replay to run it again");
    engine.run({ speed: 1, mode: "guardian" }).catch(() => {});
  });
}

function sendJson(res, obj) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

/** Fast-forward replay of the whole scenario with hard assertions. */
async function selftest() {
  const engine = new Engine({ speed: 1000 });
  await engine.run({ speed: 1000 });
  const s = engine.snapshot();
  const l = s.ledger;

  console.log("=== PR BUDGET GUARDIAN — SELFTEST (guardian mode) ===");
  console.log(`status: ${s.status}\n`);

  console.log("ledger entries:");
  for (const e of l.entries) {
    console.log(`  [${e.kind.padEnd(7)}] ${(e.suite || "").padEnd(16)} ${fmtMills(e.mills)}  ${(e.outcome || "-").padEnd(4)}  ${e.note}`);
  }

  console.log("\navoided (estimated):");
  for (const a of l.avoided) console.log(`  ${fmtMills(a.mills)}  ${a.label}`);

  const lastSpend = [...l.entries].reverse().find((e) => e.kind === "spend");
  const refused = l.entries.filter((e) => e.kind === "refused");

  const checks = [];
  const expect = (name, ok, got) => checks.push({ name, ok: !!ok, got: JSON.stringify(got) });
  expect("scenario completes", s.status === "complete", s.status);
  expect("ledger invariant holds", l.invariantOk, l.invariantOk);
  expect("spent is $0.076", l.spentMills === 76, l.spentMills);
  expect("refunded is $0.024", l.refundedMills === 24, l.refundedMills);
  expect("reserve unlocked and fully released", l.reserveUnlocked && l.reservedMills === 0, l.reservedMills);
  expect("avoided total is $0.072", l.avoidedTotalMills === 72, l.avoidedTotalMills);
  expect("exactly one refused payment", refused.length === 1, refused.length);
  expect("refused amount is $0.012", l.refusedTotalMills === 12, l.refusedTotalMills);
  expect("full-e2e was the last purchase", lastSpend && lastSpend.suite === "full-e2e", lastSpend && lastSpend.suite);
  expect("PR is mergeable", s.flags.mergeable === true, s.flags.mergeable);

  console.log("\nchecks:");
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : `  (got ${c.got})`}`);
  console.log(failed.length ? `\n${failed.length} CHECK(S) FAILED` : "\nall checks passed");
  process.exitCode = failed.length ? 1 : 0;
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  main();
}
