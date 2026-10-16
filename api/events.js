"use strict";

const { serveEvents } = require("../server/stream");

module.exports = async function handler(req, res) {
  // Public hosting runs the deterministic demo with simulated payments.
  // Wallets and local seller credentials are never required or bundled.
  await serveEvents(req, res);
};
