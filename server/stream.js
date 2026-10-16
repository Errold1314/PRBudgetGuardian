"use strict";

const { Engine } = require("./engine");

// Each connection owns its engine. No shared process state or background job
// is needed, so visitors and serverless instances cannot interrupt each other.
async function serveEvents(req, res, providerOptions = {}) {
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET" });
    return res.end("method not allowed");
  }
  const url = new URL(req.url, "http://localhost");
  const mode = url.searchParams.get("mode") === "naive" ? "naive" : "guardian";
  const requestedSpeed = Number(url.searchParams.get("speed"));
  const speed = [1, 2, 4].includes(requestedSpeed) ? requestedSpeed : 1;
  let closed = false;
  const engine = new Engine({
    speed,
    providerOptions,
    onEvent(event) {
      if (!closed) res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
  });
  const disconnect = () => {
    closed = true;
    engine._token += 1;
  };
  res.on("close", disconnect);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store, no-transform",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  try {
    await engine.run({ speed, mode });
  } catch (error) {
    console.error("Demo stream failed", error);
    if (!closed) res.write(`data: ${JSON.stringify({ kind: "error", message: "Demo failed. Please replay." })}\n\n`);
  } finally {
    res.off("close", disconnect);
    if (!closed) res.end();
  }
}

module.exports = { serveEvents };
