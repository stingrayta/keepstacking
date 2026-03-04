// ── Firm registry ────────────────────────────────────────────────────────────
// Add new firms here — import and include in FIRMS. Nothing else changes.
import * as apex  from "./firms/apex.js";
import * as alphaFutures from "./firms/alpha-futures.js";
import * as bulenox from "./firms/bulenox.js";
import * as lucid from "./firms/lucid.js";
import * as mff   from "./firms/mff.js";
import * as tpt   from "./firms/tpt.js";

const FIRMS = [apex, alphaFutures, bulenox, lucid, mff, tpt];

// ── DOM refs ────────────────────────────────────────────────────────────────
const wrongTab         = document.getElementById("wrong-tab");
const mainContent      = document.getElementById("main-content");
const dashboardLinks   = document.getElementById("dashboard-links");
const wrongTabTotals   = document.getElementById("wrong-tab-totals");
const byPropSection    = document.getElementById("by-prop-section");
const toggleByProp     = document.getElementById("toggle-by-prop");
const byPropList       = document.getElementById("by-prop-list");
const spentDisplay     = document.getElementById("spent-display");
const receivedDisplay  = document.getElementById("received-display");
const netDisplay       = document.getElementById("net-display");
const lastCalculatedEl = document.getElementById("last-calculated");
const statusRow        = document.getElementById("status-row");
const statusText       = document.getElementById("status-text");
const calcBtn          = document.getElementById("calc-btn");
const breakdownSection = document.getElementById("breakdown-section");
const toggleBreakdown  = document.getElementById("toggle-breakdown");
const breakdownList    = document.getElementById("breakdown-list");
const resetBtn         = document.getElementById("reset-btn");

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatUSD(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatMonthKey(key) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function setStatus(text) {
  statusText.textContent = text;
  statusRow.classList.remove("hidden");
}

function clearStatus() {
  statusRow.classList.add("hidden");
}

function setCalculating(on) {
  calcBtn.disabled = on;
  calcBtn.textContent = on ? "Calculating…" : "Recalculate";
  if (on) setStatus("Starting…");
  else clearStatus();
}

// ── Render ───────────────────────────────────────────────────────────────────

function renderTotal(spendingMonths, payoutMonths, lastTs) {
  const totalSpent    = Object.values(spendingMonths).reduce((s, v) => s + v, 0);
  const totalReceived = Object.values(payoutMonths).reduce((s, v) => s + v, 0);
  const net           = totalReceived - totalSpent;
  const hasData       = totalSpent > 0 || totalReceived > 0;

  spentDisplay.textContent    = totalSpent    > 0 ? formatUSD(totalSpent)    : "—";
  receivedDisplay.textContent = formatUSD(totalReceived);
  netDisplay.textContent      = hasData ? formatUSD(net) : "—";
  netDisplay.className        = "net-amount" + (hasData ? (net >= 0 ? " positive" : " negative") : "");
  lastCalculatedEl.textContent = lastTs ? `Updated ${timeAgo(lastTs)}` : "";

  // Combined monthly breakdown
  const allKeys = [...new Set([
    ...Object.keys(spendingMonths),
    ...Object.keys(payoutMonths),
  ])].sort((a, b) => b.localeCompare(a));

  if (allKeys.length > 0) {
    breakdownSection.classList.remove("hidden");
    breakdownList.innerHTML = allKeys.map(k => {
      const spent    = spendingMonths[k] || 0;
      const received = payoutMonths[k]   || 0;
      const rowNet   = received - spent;
      const netClass = rowNet >= 0 ? "positive" : "negative";
      return `<div class="breakdown-row">
        <span class="breakdown-month">${formatMonthKey(k)}</span>
        <span class="breakdown-amount spent">${formatUSD(spent)}</span>
        <span class="breakdown-amount received">${formatUSD(received)}</span>
        <span class="breakdown-amount ${netClass}">${formatUSD(rowNet)}</span>
      </div>`;
    }).join("");
  } else {
    breakdownSection.classList.add("hidden");
  }
}

// ── Storage ──────────────────────────────────────────────────────────────────

// Cache keys are namespaced by firm ID so each firm has its own independent cache.
function cacheKeys(firmId) {
  return {
    spending:    `${firmId}:spendingMonths`,
    payouts:     `${firmId}:payoutMonths`,
    lastCalc:    `${firmId}:lastCalculated`,
  };
}

function loadCache(firmId) {
  const k = cacheKeys(firmId);
  return new Promise((resolve) => {
    chrome.storage.local.get([k.spending, k.payouts, k.lastCalc], (data) => {
      resolve({
        spendingMonths: data[k.spending] || {},
        payoutMonths:   data[k.payouts]  || {},
        lastCalculated: data[k.lastCalc] || null,
      });
    });
  });
}

function saveCache(firmId, spendingMonths, payoutMonths, lastCalculated) {
  const k = cacheKeys(firmId);
  return new Promise((resolve) => {
    chrome.storage.local.set({
      [k.spending]: spendingMonths,
      [k.payouts]:  payoutMonths,
      [k.lastCalc]: lastCalculated,
    }, resolve);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const firm  = FIRMS.find(f => tab?.url?.startsWith(f.origin));

  if (!firm) {
    wrongTab.classList.remove("hidden");
    // Load cache for all firms to show totals and by-prop breakdown
    const caches = await Promise.all(FIRMS.map(f => loadCache(f.id)));
    const firmsWithCache = FIRMS.map((f, i) => ({ firm: f, cache: caches[i] })).filter(
      ({ cache }) => Object.keys(cache.spendingMonths).length > 0 || Object.keys(cache.payoutMonths).length > 0
    );

    // Company links (one per firm)
    dashboardLinks.innerHTML = FIRMS.map(f => `<a href="${f.origin}" class="btn btn-secondary dashboard-link" data-origin="${f.origin}">${f.name}</a>`).join("");
    dashboardLinks.querySelectorAll(".dashboard-link").forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: a.dataset.origin });
        window.close();
      });
    });

    // Aggregate total payout/spend from cache
    const totalSpent = caches.reduce((s, c) => s + Object.values(c.spendingMonths).reduce((t, v) => t + v, 0), 0);
    const totalReceived = caches.reduce((s, c) => s + Object.values(c.payoutMonths).reduce((t, v) => t + v, 0), 0);
    const hasAnyCache = totalSpent > 0 || totalReceived > 0;
    if (hasAnyCache) {
      wrongTabTotals.classList.remove("hidden");
      const net = totalReceived - totalSpent;
      wrongTabTotals.innerHTML = `
        <div class="wrong-tab-totals-row">
          <span class="metric-label">Spent</span>
          <span class="metric-amount spent">${formatUSD(totalSpent)}</span>
        </div>
        <div class="wrong-tab-totals-row">
          <span class="metric-label">Received</span>
          <span class="metric-amount received">${formatUSD(totalReceived)}</span>
        </div>
        <div class="wrong-tab-totals-row">
          <span class="metric-label">Net</span>
          <span class="metric-amount ${net >= 0 ? "positive" : "negative"}">${formatUSD(net)}</span>
        </div>
      `;
    } else {
      wrongTabTotals.classList.add("hidden");
    }

    // By-prop collapsed section
    if (firmsWithCache.length > 0) {
      byPropSection.classList.remove("hidden");
      byPropList.innerHTML = firmsWithCache.map(({ firm: f, cache }) => {
        const spent = Object.values(cache.spendingMonths).reduce((s, v) => s + v, 0);
        const received = Object.values(cache.payoutMonths).reduce((s, v) => s + v, 0);
        const net = received - spent;
        const netClass = net >= 0 ? "positive" : "negative";
        const allKeys = [...new Set([...Object.keys(cache.spendingMonths), ...Object.keys(cache.payoutMonths)])].sort((a, b) => b.localeCompare(a));
        const monthlyRows = allKeys.map(k => {
          const s = cache.spendingMonths[k] || 0;
          const r = cache.payoutMonths[k] || 0;
          const n = r - s;
          return `<div class="breakdown-row breakdown-row-nested">
            <span class="breakdown-month">${formatMonthKey(k)}</span>
            <span class="breakdown-amount spent">${formatUSD(s)}</span>
            <span class="breakdown-amount received">${formatUSD(r)}</span>
            <span class="breakdown-amount ${n >= 0 ? "positive" : "negative"}">${formatUSD(n)}</span>
          </div>`;
        }).join("");
        return `<div class="by-prop-row" data-firm-id="${f.id}">
          <div class="breakdown-row by-prop-summary-row">
            <span class="breakdown-month">${f.name}</span>
            <span class="breakdown-amount spent">${formatUSD(spent)}</span>
            <span class="breakdown-amount received">${formatUSD(received)}</span>
            <span class="breakdown-amount ${netClass}">${formatUSD(net)}</span>
          </div>
          <button type="button" class="toggle-btn by-prop-months-toggle">Show months</button>
          <div class="by-prop-months hidden">${monthlyRows}</div>
        </div>`;
      }).join("");

      // Toggle "By prop" list visibility
      toggleByProp.addEventListener("click", () => {
        const isHidden = byPropList.classList.contains("hidden");
        byPropList.classList.toggle("hidden", !isHidden);
        toggleByProp.textContent = isHidden ? "Hide" : "Show";
      });

      // Per-prop "Show months" toggle
      byPropList.querySelectorAll(".by-prop-months-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
          const row = btn.closest(".by-prop-row");
          const monthsEl = row.querySelector(".by-prop-months");
          const isHidden = monthsEl.classList.contains("hidden");
          monthsEl.classList.toggle("hidden", !isHidden);
          btn.textContent = isHidden ? "Hide months" : "Show months";
        });
      });
    } else {
      byPropSection.classList.add("hidden");
    }
    return;
  }

  mainContent.classList.remove("hidden");

  const cache = await loadCache(firm.id);
  const hasCache = Object.keys(cache.spendingMonths).length > 0 || Object.keys(cache.payoutMonths).length > 0;
  if (hasCache) {
    renderTotal(cache.spendingMonths, cache.payoutMonths, cache.lastCalculated);
    calcBtn.textContent = "Recalculate";
  }

  // ── Calculate ──
  calcBtn.addEventListener("click", async () => {
    setCalculating(true);
    try {
      const { spendingMonths: cachedSpending, payoutMonths: cachedPayouts } = await loadCache(firm.id);
      const cachedSpendingKeys = Object.keys(cachedSpending);
      const cachedPayoutKeys   = Object.keys(cachedPayouts);

      setStatus("Fetching data…");

      // firm.scrape is a self-contained function — Chrome serializes it
      // automatically. Each firm file owns its own scraping logic entirely.
      let results;
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func:   firm.scrape,
          args:   [cachedSpendingKeys, cachedPayoutKeys],
        });
      } catch (scriptErr) {
        const msg = scriptErr?.message || String(scriptErr);
        throw new Error(msg || "Script failed. Open DevTools on the dashboard tab (F12) and try again.");
      }

      if (!results || results.length === 0) throw new Error("No result from scraper.");
      const entry = results[0];
      if (entry.exceptionDetails) {
        const exc = entry.exceptionDetails.exception;
        const msg = exc?.description ?? exc?.value ?? entry.exceptionDetails.text ?? JSON.stringify(entry.exceptionDetails);
        throw new Error(msg);
      }
      const scraperResult = entry.result;
      if (!scraperResult || typeof scraperResult !== "object") throw new Error("Unexpected scraper result.");

      const {
        spendingMonths: newSpending,
        payoutMonths:   newPayouts,
        spendingPagesFetched, payoutPagesFetched,
        spendingTotalPages,   payoutTotalPages,
      } = scraperResult;

      const today  = new Date();
      const nowKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

      // Merge rules:
      //   Current month        → always overwrite
      //   New month (uncached) → add it
      //   Past cached month    → keep old cached value (full-scan result is correct)
      const mergedSpending = { ...cachedSpending };
      Object.entries(newSpending).forEach(([k, v]) => {
        if (k >= nowKey || !cachedSpending[k]) mergedSpending[k] = v;
      });

      const mergedPayouts = { ...cachedPayouts };
      Object.entries(newPayouts).forEach(([k, v]) => {
        if (k >= nowKey || !cachedPayouts[k]) mergedPayouts[k] = v;
      });

      const now = Date.now();
      await saveCache(firm.id, mergedSpending, mergedPayouts, now);

      setStatus(
        `Done — spending: ${spendingPagesFetched}/${spendingTotalPages} page(s), ` +
        `payouts: ${payoutPagesFetched}/${payoutTotalPages} page(s)`
      );
      renderTotal(mergedSpending, mergedPayouts, now);
      setTimeout(clearStatus, 3000);
    } catch (err) {
      const msg = err?.message || String(err);
      setStatus(`Error: ${msg}`);
    } finally {
      setCalculating(false);
    }
  });

  // ── Breakdown toggle ──
  toggleBreakdown.addEventListener("click", () => {
    const isHidden = breakdownList.classList.contains("hidden");
    breakdownList.classList.toggle("hidden", !isHidden);
    toggleBreakdown.textContent = isHidden ? "Hide" : "Show";
  });

  // ── Reset ──
  resetBtn.addEventListener("click", async () => {
    if (!confirm("Clear all cached data? You will need to recalculate from scratch.")) return;
    await chrome.storage.local.clear();
    spentDisplay.textContent    = "—";
    receivedDisplay.textContent = "—";
    netDisplay.textContent      = "—";
    netDisplay.className        = "net-amount";
    lastCalculatedEl.textContent = "";
    breakdownSection.classList.add("hidden");
    calcBtn.textContent = "Calculate";
  });
}

init();
