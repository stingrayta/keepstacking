// ── Firm registry ────────────────────────────────────────────────────────────
// Add new firms here — import and include in FIRMS. Nothing else changes.
import * as apex  from "./firms/apex.js";
import * as alphaFutures from "./firms/alpha-futures.js";
import * as lucid from "./firms/lucid.js";
import * as mff   from "./firms/mff.js";

const FIRMS = [apex, alphaFutures, lucid, mff];

// ── DOM refs ────────────────────────────────────────────────────────────────
const wrongTab         = document.getElementById("wrong-tab");
const mainContent      = document.getElementById("main-content");
const openDashboard    = document.getElementById("open-dashboard");
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
    openDashboard.addEventListener("click", (e) => {
      e.preventDefault();
      // Open the first registered firm's dashboard as a fallback
      chrome.tabs.create({ url: FIRMS[0].origin + "/member" });
      window.close();
    });
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
