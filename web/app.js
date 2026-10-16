"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = (mills) => "$" + (mills / 1000).toFixed(3);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const els = {
    status: $("status"), prId: $("prId"), prTitle: $("prTitle"), prMeta: $("prMeta"),
    legend: $("legend"),
    segSpent: $("segSpent"), segFree: $("segFree"), segRefund: $("segRefund"), segReserved: $("segReserved"),
    reserveMarker: $("reserveMarker"), ruleNote: $("ruleNote"),
    ledgerBody: $("ledgerBody"), ledgerEmpty: $("ledgerEmpty"),
    figures: $("figures"), avoidedList: $("avoidedList"), baseline: $("baseline"),
    stepBar: $("stepBar"), stepLabel: $("stepLabel"),
    log: $("log"), logEmpty: $("logEmpty"),
    replay: $("replay"), speed: $("speed"), mode: $("mode"),
  };

  let runId = null;
  let seenEntries = new Set();
  let lastLogSeq = 0;

  function resetUI() {
    seenEntries = new Set();
    lastLogSeq = 0;
    els.ledgerBody.innerHTML = "";
    els.log.innerHTML = "";
    els.ledgerEmpty.hidden = false;
    els.logEmpty.hidden = false;
  }

  function applyState(s) {
    if (s.runId !== runId) {
      runId = s.runId;
      resetUI();
      els.mode.value = s.mode || "guardian";
    }

    els.status.textContent = s.status;
    els.status.dataset.status = s.status;

    if (s.pr) {
      els.prId.textContent = "PR #" + s.pr.id;
      els.prTitle.textContent = s.pr.title;
      els.prMeta.textContent = `${s.pr.branch} @ ${s.pr.sha}`;
    }

    applyRuler(s);
    applyLedger(s.ledger.entries);
    applyFigures(s);

    const step = s.step || { index: 0, total: 13, label: "" };
    els.stepBar.style.width = (step.total ? (step.index / step.total) * 100 : 0) + "%";
    els.stepLabel.textContent = step.index
      ? `Step ${step.index} of ${step.total}: ${step.label}`
      : "Waiting to start…";

    applyLog(s.log);
  }

  /* ------------------------------------------------------------- the ruler */

  function legendItem(sw, label, mills) {
    return `<span class="item"><span class="swatch ${sw}"></span>${label} <span class="val">${fmt(mills)}</span></span>`;
  }

  function applyRuler(s) {
    const l = s.ledger;
    const t = l.totalMills || 100;
    const parts = [
      { el: els.segSpent, mills: l.spentMills },
      { el: els.segFree, mills: l.freeMills },
      { el: els.segRefund, mills: l.refundedMills },
      { el: els.segReserved, mills: l.reservedMills },
    ];
    let left = 0;
    for (const p of parts) {
      const w = (p.mills / t) * 100;
      p.el.style.left = left + "%";
      p.el.style.width = w + "%";
      p.el.style.opacity = p.mills > 0 ? "1" : "0";
      left += w;
    }

    // the marker sits where the protected reserve begins
    els.reserveMarker.style.left = 100 - (l.reservedMills / t) * 100 + "%";
    els.reserveMarker.style.opacity = l.reservedMills > 0 ? "1" : "0";

    const items = [legendItem("sw-spent", "spent", l.spentMills)];
    if (l.freeMills > 0) items.push(legendItem("sw-free", "free", l.freeMills));
    if (l.refundedMills > 0) items.push(legendItem("sw-refund", "refunded", l.refundedMills));
    if (l.reservedMills > 0) items.push(legendItem("sw-reserved", "in reserve", l.reservedMills));
    els.legend.innerHTML = items.join("");

    if (s.status === "complete" && s.mode === "naive") {
      els.ruleNote.textContent = `Envelope exhausted — ${fmt(l.refundedMills)} returned, and the final revision was never validated.`;
    } else if (s.status === "complete") {
      els.ruleNote.textContent = `Account closed. ${fmt(l.refundedMills)} of the envelope was returned to the repository owner.`;
    } else if (l.reserveUnlocked) {
      els.ruleNote.textContent = "The reserve was released for final validation once the cheap checks passed.";
    } else {
      els.ruleNote.textContent = `The envelope is ${fmt(t)}. ${fmt(l.reservedMills)} of it is held back for final validation and cannot be spent on retries or diagnosis.`;
    }
  }

  /* ------------------------------------------------------------ ledger rows */

  function applyLedger(entries) {
    for (const e of entries) {
      if (seenEntries.has(e.id)) continue;
      seenEntries.add(e.id);

      const stamp = e.kind === "refused" ? "REFUSED" : e.outcome === "fail" ? "FAILED" : "PASSED";
      const stampClass = e.kind === "refused" ? "refused" : e.outcome === "fail" ? "failed" : "passed";

      const tr = document.createElement("tr");
      tr.className = "fresh" + (e.kind === "refused" ? " refused" : "");
      tr.innerHTML =
        `<td><span class="stamp ${stampClass}">${stamp}</span></td>` +
        `<td class="suite">${esc(e.suite || "")}</td>` +
        `<td>${esc(e.provider || "")}</td>` +
        `<td class="num cost">${fmt(e.mills)}</td>` +
        `<td class="note">${esc(e.note || "")}</td>`;
      els.ledgerBody.appendChild(tr);
    }
    els.ledgerEmpty.hidden = entries.length > 0;
  }

  /* ------------------------------------------------------------- statement */

  function applyFigures(s) {
    const l = s.ledger;
    const rows = [
      { label: "Spent", cls: "primary v-brass", text: fmt(l.spentMills) },
      { label: "In reserve", cls: "v-steel", text: fmt(l.reservedMills) },
      { label: "Free", cls: "", text: fmt(l.freeMills) },
    ];
    if (l.refundedMills > 0) rows.push({ label: "Refunded", cls: "v-jade", text: fmt(l.refundedMills) });
    if (l.refusedTotalMills > 0) rows.push({ label: "Refused (withheld)", cls: "v-oxide", text: fmt(l.refusedTotalMills) });
    if (s.status === "complete") {
      rows.push(
        s.flags.mergeable
          ? { label: "Cost per accepted PR", cls: "v-jade", text: fmt(l.spentMills) }
          : { label: "Cost per accepted PR", cls: "v-oxide", text: "not accepted" }
      );
    }

    els.figures.innerHTML = rows
      .map((r) => `<div class="${r.cls}"><dt>${r.label}</dt><dd>${r.text}</dd></div>`)
      .join("");

    els.avoidedList.innerHTML =
      l.avoided
        .map((a) => `<li><span>${esc(a.label)}</span><span class="amt">${fmt(a.mills)}</span></li>`)
        .join("") +
      (l.avoidedTotalMills > 0
        ? `<li class="total"><span>Avoided in total</span><span class="amt">${fmt(l.avoidedTotalMills)}</span></li>`
        : "");

    const baseline = els.baseline;
    if (l.avoidedTotalMills > 0) {
      baseline.innerHTML = `Without the guardian this PR is estimated at <strong>${fmt(l.baselineMills)}</strong> — actual spend plus the avoided line items above. Switch Policy to Naive and replay to see it happen for real.`;
    } else if (s.mode === "naive" && s.status === "complete") {
      baseline.innerHTML = "Naive mode: no relevance filter, no gates, no reserve, blind retries.";
    } else {
      baseline.innerHTML = "";
    }
  }

  /* ---------------------------------------------------------------- the log */

  function applyLog(lines) {
    const fresh = lines.filter((l) => l.seq > lastLogSeq);
    if (!fresh.length) return;
    for (const l of fresh) {
      lastLogSeq = Math.max(lastLogSeq, l.seq);
      const li = document.createElement("li");
      if (l.tag === "step") li.className = "is-step";
      li.innerHTML =
        `<span class="t">${esc(l.t)}</span>` +
        `<span class="tag ${esc(l.tag)}">${esc(l.tag)}</span>` +
        `<span class="txt">${esc(l.text)}</span>`;
      els.log.appendChild(li);
    }
    els.logEmpty.hidden = els.log.children.length > 0;
    els.log.scrollTop = els.log.scrollHeight;
  }

  /* -------------------------------------------------------------- the wire */

  let es = null;
  function startDemo() {
    if (es) es.close();
    runId = null;
    resetUI();
    els.status.textContent = "connecting";
    const query = new URLSearchParams({ speed: els.speed.value, mode: els.mode.value });
    const stream = new EventSource("/events?" + query);
    es = stream;
    stream.onmessage = (ev) => {
      if (es !== stream) return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg.kind === "state") {
          applyState(msg.state);
          if (msg.state.status === "complete" || msg.state.status === "error") stream.close();
        } else if (msg.kind === "error") {
          els.status.textContent = "error";
          els.status.dataset.status = "error";
          stream.close();
        }
      } catch { /* ignore malformed frame */ }
    };
    stream.onerror = () => {
      if (es !== stream) return;
      stream.close();
      els.status.textContent = "disconnected — press Replay";
      els.status.dataset.status = "error";
    };
  }

  els.replay.addEventListener("click", startDemo);
  startDemo();
})();
