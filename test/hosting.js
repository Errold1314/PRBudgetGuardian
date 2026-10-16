"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const handler = require("../api/events");

async function main() {
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function replay(mode) {
    const response = await fetch(`${base}/events?mode=${mode}&speed=4`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    const reader = response.body.getReader();
    const first = await reader.read();
    const decoder = new TextDecoder();
    let text = decoder.decode(first.value, { stream: true });
    assert.match(text, /"status":"live"/, "first frame arrives before completion");
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      text += decoder.decode(part.value, { stream: true });
    }
    const frames = text.split("\n\n").filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)));
    assert.ok(frames.length > 10);
    assert.ok(frames.every((frame) => frame.state.mode === mode));
    const state = frames.at(-1).state;
    assert.equal(state.status, "complete");
    assert.equal(state.ledger.invariantOk, true);
    return state;
  }

  try {
    const wrongMethod = await fetch(`${base}/events`, { method: "POST" });
    assert.equal(wrongMethod.status, 405);
    const [guardian, naive] = await Promise.all([replay("guardian"), replay("naive")]);
    assert.equal(guardian.ledger.spentMills, 76);
    assert.equal(guardian.ledger.refundedMills, 24);
    assert.equal(guardian.flags.mergeable, true);
    assert.equal(naive.ledger.spentMills, 100);
    assert.equal(naive.flags.mergeable, false);
    const controller = new AbortController();
    const cancelled = await fetch(`${base}/events`, { signal: controller.signal });
    await cancelled.body.getReader().read();
    controller.abort();
    console.log("PASS: incremental SSE, concurrent visitor isolation, Guardian, Naive, method guard, disconnect");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
