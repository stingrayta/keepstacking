// ── Firm registry ────────────────────────────────────────────────────────────
// Add new firms here — import and include in FIRMS. Nothing else changes.
import * as apex  from "./firms/apex.js";
import * as alphaFutures from "./firms/alpha-futures.js";
import * as bulenox from "./firms/bulenox.js";
import * as lucid from "./firms/lucid.js";
import * as mff   from "./firms/mff.js";
import * as tpt   from "./firms/tpt.js";
import * as topstep from "./firms/topstep.js";

const FIRMS = [apex, alphaFutures, bulenox, lucid, mff, tpt, topstep];

// ── DOM refs ────────────────────────────────────────────────────────────────
const wrongTab         = document.getElementById("wrong-tab");
const mainContent      = document.getElementById("main-content");
const dashboardLinks   = document.getElementById("dashboard-links");
const wrongTabTotalsWrap = document.getElementById("wrong-tab-totals-wrap");
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
const togglePropDashboards = document.getElementById("toggle-prop-dashboards");

const MAIN_DASH_VIEW_KEY = "mainDashViewMode";
const PNL_RANGE_KEY = "pnlRange";
const MAIN_CONTENT_BREAKDOWN_VIEW_KEY = "mainContentBreakdownView";
const PROP_DASHBOARDS_COLLAPSED_KEY = "propDashboardsCollapsed";

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

function getCurrentYear() {
  return String(new Date().getFullYear());
}

/** @param {string[]} keys - Month keys YYYY-MM */
function filterMonthKeysByRange(keys, range) {
  if (range === "all") return keys;
  const year = getCurrentYear();
  return keys.filter(k => k.startsWith(year));
}

/**
 * Filter spending/payout month maps by PNL range.
 * @returns {{ spendingMonths: Record<string,number>, payoutMonths: Record<string,number> }}
 */
function filterMonthsByRange(spendingMonths, payoutMonths, range) {
  if (range === "all") {
    return { spendingMonths, payoutMonths };
  }
  const year = getCurrentYear();
  const pred = (k) => k.startsWith(year);
  const filteredSpending = Object.fromEntries(
    Object.entries(spendingMonths).filter(([k]) => pred(k))
  );
  const filteredPayouts = Object.fromEntries(
    Object.entries(payoutMonths).filter(([k]) => pred(k))
  );
  return { spendingMonths: filteredSpending, payoutMonths: filteredPayouts };
}

function buildMonthlyAggregate(firmsWithCache) {
  const allMonthKeys = [...new Set(
    firmsWithCache.flatMap(({ cache }) => [
      ...Object.keys(cache.spendingMonths),
      ...Object.keys(cache.payoutMonths),
    ])
  )].sort((a, b) => b.localeCompare(a));
  const monthlyData = {};
  for (const key of allMonthKeys) {
    let spent = 0, received = 0;
    const firms = [];
    for (const { firm: f, cache } of firmsWithCache) {
      const s = cache.spendingMonths[key] || 0;
      const r = cache.payoutMonths[key] || 0;
      if (s !== 0 || r !== 0) {
        spent += s;
        received += r;
        firms.push({ name: f.name, spent: s, received: r });
      }
    }
    monthlyData[key] = { spent, received, firms };
  }
  return { allMonthKeys, monthlyData };
}

function buildYearlyAggregate(firmsWithCache) {
  const { allMonthKeys, monthlyData } = buildMonthlyAggregate(firmsWithCache);
  const byYear = {};
  for (const monthKey of allMonthKeys) {
    const year = monthKey.slice(0, 4);
    if (!byYear[year]) byYear[year] = { spent: 0, received: 0, months: [] };
    const { spent, received, firms } = monthlyData[monthKey];
    byYear[year].spent += spent;
    byYear[year].received += received;
    byYear[year].months.push({ monthKey, spent, received, firms });
  }
  const allYearKeys = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
  return { allYearKeys, yearlyData: byYear };
}

function renderMainDashByYear(allYearKeys, yearlyData) {
  byPropList.innerHTML = allYearKeys.map(year => {
    const { spent, received, months } = yearlyData[year];
    const net = received - spent;
    const netClass = net >= 0 ? "positive" : "negative";
    const monthRows = months
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map(({ monthKey, spent: s, received: r }) => {
        const n = r - s;
        return `<div class="breakdown-row breakdown-row-nested">
          <span class="breakdown-month">${formatMonthKey(monthKey)}</span>
          <span class="breakdown-amount spent">${formatUSD(s)}</span>
          <span class="breakdown-amount received">${formatUSD(r)}</span>
          <span class="breakdown-amount ${n >= 0 ? "positive" : "negative"}">${formatUSD(n)}</span>
        </div>`;
      }).join("");
    return `<div class="by-year-row" data-year="${year}">
      <div class="breakdown-row by-year-summary-row">
        <span class="breakdown-month">${year}</span>
        <span class="breakdown-amount spent">${formatUSD(spent)}</span>
        <span class="breakdown-amount received">${formatUSD(received)}</span>
        <span class="breakdown-amount ${netClass}">${formatUSD(net)}</span>
      </div>
      <button type="button" class="toggle-btn by-year-months-toggle">Show months</button>
      <div class="by-year-months hidden">${monthRows}</div>
    </div>`;
  }).join("");
}

function renderMainDashByProp(firmsWithCache) {
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
}

function renderMainDashByMonth(allMonthKeys, monthlyData) {
  byPropList.innerHTML = allMonthKeys.map(monthKey => {
    const { spent, received, firms } = monthlyData[monthKey];
    const net = received - spent;
    const netClass = net >= 0 ? "positive" : "negative";
    const firmRows = firms.map(({ name, spent: s, received: r }) => {
      const n = r - s;
      return `<div class="breakdown-row breakdown-row-nested">
        <span class="breakdown-month">${name}</span>
        <span class="breakdown-amount spent">${formatUSD(s)}</span>
        <span class="breakdown-amount received">${formatUSD(r)}</span>
        <span class="breakdown-amount ${n >= 0 ? "positive" : "negative"}">${formatUSD(n)}</span>
      </div>`;
    }).join("");
    return `<div class="by-month-row" data-month-key="${monthKey}">
      <div class="breakdown-row by-month-summary-row">
        <span class="breakdown-month">${formatMonthKey(monthKey)}</span>
        <span class="breakdown-amount spent">${formatUSD(spent)}</span>
        <span class="breakdown-amount received">${formatUSD(received)}</span>
        <span class="breakdown-amount ${netClass}">${formatUSD(net)}</span>
      </div>
      <button type="button" class="toggle-btn by-month-firms-toggle">Show firms</button>
      <div class="by-month-firms hidden">${firmRows}</div>
    </div>`;
  }).join("");
}

// ── Render ───────────────────────────────────────────────────────────────────

/**
 * @param {Record<string,number>} spendingMonths
 * @param {Record<string,number>} payoutMonths
 * @param {number|null} lastTs
 * @param {{ pnlRange?: string, breakdownView?: string }} [options]
 */
function renderTotal(spendingMonths, payoutMonths, lastTs, options = {}) {
  const pnlRange = options.pnlRange === "thisYear" ? "thisYear" : "all";
  const { spendingMonths: s, payoutMonths: p } = filterMonthsByRange(spendingMonths, payoutMonths, pnlRange);

  const totalSpent    = Object.values(s).reduce((sum, v) => sum + v, 0);
  const totalReceived = Object.values(p).reduce((sum, v) => sum + v, 0);
  const net           = totalReceived - totalSpent;
  const hasData       = totalSpent > 0 || totalReceived > 0;

  spentDisplay.textContent    = totalSpent    > 0 ? formatUSD(totalSpent)    : "—";
  receivedDisplay.textContent  = formatUSD(totalReceived);
  netDisplay.textContent      = hasData ? formatUSD(net) : "—";
  netDisplay.className        = "net-amount" + (hasData ? (net >= 0 ? " positive" : " negative") : "");
  lastCalculatedEl.textContent = lastTs ? `Updated ${timeAgo(lastTs)}` : "";

  const breakdownView = options.breakdownView === "byYear" ? "byYear" : "byMonth";
  const allKeys = [...new Set([...Object.keys(s), ...Object.keys(p)])].sort((a, b) => b.localeCompare(a));

  if (allKeys.length > 0) {
    breakdownSection.classList.remove("hidden");
    if (breakdownView === "byYear") {
      const byYear = {};
      for (const k of allKeys) {
        const year = k.slice(0, 4);
        if (!byYear[year]) byYear[year] = { spent: 0, received: 0, keys: [] };
        byYear[year].spent += s[k] || 0;
        byYear[year].received += p[k] || 0;
        byYear[year].keys.push(k);
      }
      const yearKeys = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
      breakdownList.innerHTML = yearKeys.map(year => {
        const { spent, received, keys } = byYear[year];
        const rowNet = received - spent;
        const netClass = rowNet >= 0 ? "positive" : "negative";
        const monthRows = keys.sort((a, b) => b.localeCompare(a)).map(k => {
          const sk = s[k] || 0, pk = p[k] || 0, nk = pk - sk;
          return `<div class="breakdown-row breakdown-row-nested">
            <span class="breakdown-month">${formatMonthKey(k)}</span>
            <span class="breakdown-amount spent">${formatUSD(sk)}</span>
            <span class="breakdown-amount received">${formatUSD(pk)}</span>
            <span class="breakdown-amount ${nk >= 0 ? "positive" : "negative"}">${formatUSD(nk)}</span>
          </div>`;
        }).join("");
        return `<div class="by-year-row" data-year="${year}">
          <div class="breakdown-row by-year-summary-row">
            <span class="breakdown-month">${year}</span>
            <span class="breakdown-amount spent">${formatUSD(spent)}</span>
            <span class="breakdown-amount received">${formatUSD(received)}</span>
            <span class="breakdown-amount ${netClass}">${formatUSD(rowNet)}</span>
          </div>
          <button type="button" class="toggle-btn by-year-months-toggle">Show months</button>
          <div class="by-year-months hidden">${monthRows}</div>
        </div>`;
      }).join("");
    } else {
      breakdownList.innerHTML = allKeys.map(k => {
        const spent    = s[k] || 0;
        const received = p[k] || 0;
        const rowNet   = received - spent;
        const netClass = rowNet >= 0 ? "positive" : "negative";
        return `<div class="breakdown-row">
          <span class="breakdown-month">${formatMonthKey(k)}</span>
          <span class="breakdown-amount spent">${formatUSD(spent)}</span>
          <span class="breakdown-amount received">${formatUSD(received)}</span>
          <span class="breakdown-amount ${netClass}">${formatUSD(rowNet)}</span>
        </div>`;
      }).join("");
    }
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

function clearCacheForFirm(firmId) {
  const k = cacheKeys(firmId);
  return new Promise((resolve) => {
    chrome.storage.local.remove([k.spending, k.payouts, k.lastCalc], resolve);
  });
}

function loadPnlRange() {
  return new Promise((resolve) => {
    chrome.storage.local.get([PNL_RANGE_KEY], (data) => {
      const v = data[PNL_RANGE_KEY];
      resolve(v === "thisYear" ? "thisYear" : "all");
    });
  });
}

function savePnlRange(range) {
  chrome.storage.local.set({ [PNL_RANGE_KEY]: range });
}

function loadMainContentBreakdownView() {
  return new Promise((resolve) => {
    chrome.storage.local.get([MAIN_CONTENT_BREAKDOWN_VIEW_KEY], (data) => {
      const v = data[MAIN_CONTENT_BREAKDOWN_VIEW_KEY];
      resolve(v === "byYear" ? "byYear" : "byMonth");
    });
  });
}

function saveMainContentBreakdownView(view) {
  chrome.storage.local.set({ [MAIN_CONTENT_BREAKDOWN_VIEW_KEY]: view });
}

function loadPropDashboardsCollapsed() {
  return new Promise((resolve) => {
    chrome.storage.local.get([PROP_DASHBOARDS_COLLAPSED_KEY], (data) => {
      resolve(data[PROP_DASHBOARDS_COLLAPSED_KEY] === true);
    });
  });
}

function savePropDashboardsCollapsed(collapsed) {
  chrome.storage.local.set({ [PROP_DASHBOARDS_COLLAPSED_KEY]: collapsed });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function init(opts = {}) {
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

    if (!togglePropDashboards.dataset.listenerAdded) {
      togglePropDashboards.dataset.listenerAdded = "1";
      togglePropDashboards.addEventListener("click", () => {
        const isHidden = dashboardLinks.classList.contains("hidden");
        dashboardLinks.classList.toggle("hidden", !isHidden);
        togglePropDashboards.textContent = isHidden ? "Hide" : "Show";
        savePropDashboardsCollapsed(!isHidden);
      });
    }

    const propDashboardsCollapsed = await loadPropDashboardsCollapsed();
    dashboardLinks.classList.toggle("hidden", propDashboardsCollapsed);
    togglePropDashboards.textContent = propDashboardsCollapsed ? "Show" : "Hide";

    // Aggregate total payout/spend from cache (respecting PNL range)
    const pnlRange = await loadPnlRange();
    const firmsWithFilteredCache = firmsWithCache.map(({ firm, cache }) => ({
      firm,
      cache: {
        ...filterMonthsByRange(cache.spendingMonths, cache.payoutMonths, pnlRange),
        lastCalculated: cache.lastCalculated,
      },
    }));
    const totalSpent = firmsWithFilteredCache.reduce((s, { cache }) => s + Object.values(cache.spendingMonths).reduce((t, v) => t + v, 0), 0);
    const totalReceived = firmsWithFilteredCache.reduce((s, { cache }) => s + Object.values(cache.payoutMonths).reduce((t, v) => t + v, 0), 0);
    const hasAnyCache = totalSpent > 0 || totalReceived > 0;
    if (hasAnyCache) {
      wrongTabTotalsWrap.classList.remove("hidden");
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
      wrongTabTotalsWrap.classList.add("hidden");
    }

    const updateWrongTabPnLToggle = (range) => {
      const filtered = firmsWithCache.map(({ firm, cache }) => ({
        firm,
        cache: {
          ...filterMonthsByRange(cache.spendingMonths, cache.payoutMonths, range),
          lastCalculated: cache.lastCalculated,
        },
      }));
      const spent = filtered.reduce((s, { cache }) => s + Object.values(cache.spendingMonths).reduce((t, v) => t + v, 0), 0);
      const received = filtered.reduce((s, { cache }) => s + Object.values(cache.payoutMonths).reduce((t, v) => t + v, 0), 0);
      const net = received - spent;
      wrongTabTotals.innerHTML = `
        <div class="wrong-tab-totals-row">
          <span class="metric-label">Spent</span>
          <span class="metric-amount spent">${formatUSD(spent)}</span>
        </div>
        <div class="wrong-tab-totals-row">
          <span class="metric-label">Received</span>
          <span class="metric-amount received">${formatUSD(received)}</span>
        </div>
        <div class="wrong-tab-totals-row">
          <span class="metric-label">Net</span>
          <span class="metric-amount ${net >= 0 ? "positive" : "negative"}">${formatUSD(net)}</span>
        </div>
      `;
    };

    wrongTabTotalsWrap.querySelectorAll(".pnl-range-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.range === pnlRange);
      btn.addEventListener("click", () => {
        const range = btn.dataset.range === "thisYear" ? "thisYear" : "all";
        savePnlRange(range);
        wrongTabTotalsWrap.querySelectorAll(".pnl-range-btn").forEach((b) => b.classList.toggle("active", b.dataset.range === range));
        updateWrongTabPnLToggle(range);
        const filtered = firmsWithCache.map(({ firm, cache }) => ({
          firm,
          cache: {
            ...filterMonthsByRange(cache.spendingMonths, cache.payoutMonths, range),
            lastCalculated: cache.lastCalculated,
          },
        }));
        const { allMonthKeys, monthlyData } = buildMonthlyAggregate(filtered);
        const currentMode = byPropSection.querySelector(".view-mode-btn.active")?.dataset.mode || "byProp";
        if (currentMode === "byProp") renderMainDashByProp(filtered);
        else if (currentMode === "byMonth") renderMainDashByMonth(allMonthKeys, monthlyData);
        else if (currentMode === "byYear") {
          const { allYearKeys, yearlyData } = buildYearlyAggregate(filtered);
          renderMainDashByYear(allYearKeys, yearlyData);
        }
      });
    });

    // By-prop / By-month section
    if (firmsWithCache.length > 0) {
      byPropSection.classList.remove("hidden");

      const viewModeBtns = byPropSection.querySelectorAll(".view-mode-btn");
      const loadViewMode = () => new Promise((resolve) => {
        chrome.storage.local.get([MAIN_DASH_VIEW_KEY], (data) => {
          const v = data[MAIN_DASH_VIEW_KEY];
          resolve(v === "byYear" || v === "byMonth" ? v : "byProp");
        });
      });
      const saveViewMode = (mode) => {
        chrome.storage.local.set({ [MAIN_DASH_VIEW_KEY]: mode });
      };

      const getFilteredForBreakdown = () => {
        const range = wrongTabTotalsWrap.querySelector(".pnl-range-btn.active")?.dataset.range === "thisYear" ? "thisYear" : "all";
        return firmsWithCache.map(({ firm, cache }) => ({
          firm,
          cache: {
            ...filterMonthsByRange(cache.spendingMonths, cache.payoutMonths, range),
            lastCalculated: cache.lastCalculated,
          },
        }));
      };

      const renderMainDashBreakdown = (mode) => {
        const filtered = getFilteredForBreakdown();
        if (mode === "byProp") {
          renderMainDashByProp(filtered);
        } else if (mode === "byMonth") {
          const { allMonthKeys, monthlyData } = buildMonthlyAggregate(filtered);
          renderMainDashByMonth(allMonthKeys, monthlyData);
        } else if (mode === "byYear") {
          const { allYearKeys, yearlyData } = buildYearlyAggregate(filtered);
          renderMainDashByYear(allYearKeys, yearlyData);
        }
        viewModeBtns.forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.mode === mode);
        });
      };

      loadViewMode().then((initialMode) => {
        renderMainDashBreakdown(initialMode);
      });

      viewModeBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.mode;
          saveViewMode(mode);
          renderMainDashBreakdown(mode);
        });
      });

      toggleByProp.addEventListener("click", () => {
        const isHidden = byPropList.classList.contains("hidden");
        byPropList.classList.toggle("hidden", !isHidden);
        toggleByProp.textContent = isHidden ? "Hide" : "Show";
      });

      byPropList.addEventListener("click", (e) => {
        const monthsToggle = e.target.closest(".by-prop-months-toggle");
        const firmsToggle = e.target.closest(".by-month-firms-toggle");
        const yearMonthsToggle = e.target.closest(".by-year-months-toggle");
        if (monthsToggle) {
          const row = monthsToggle.closest(".by-prop-row");
          const monthsEl = row.querySelector(".by-prop-months");
          const isHidden = monthsEl.classList.contains("hidden");
          monthsEl.classList.toggle("hidden", !isHidden);
          monthsToggle.textContent = isHidden ? "Hide months" : "Show months";
        } else if (firmsToggle) {
          const row = firmsToggle.closest(".by-month-row");
          const firmsEl = row.querySelector(".by-month-firms");
          const isHidden = firmsEl.classList.contains("hidden");
          firmsEl.classList.toggle("hidden", !isHidden);
          firmsToggle.textContent = isHidden ? "Hide firms" : "Show firms";
        } else if (yearMonthsToggle) {
          const row = yearMonthsToggle.closest(".by-year-row");
          const monthsEl = row.querySelector(".by-year-months");
          const isHidden = monthsEl.classList.contains("hidden");
          monthsEl.classList.toggle("hidden", !isHidden);
          yearMonthsToggle.textContent = isHidden ? "Hide months" : "Show months";
        }
      });
    } else {
      byPropSection.classList.add("hidden");
    }

    // Clear all cache (non-origin view): clear every firm's cache then refresh this view
    if (!opts.skipClearAllListener) {
      const clearAllCacheBtn = document.getElementById("clear-all-cache-btn");
      clearAllCacheBtn.addEventListener("click", async () => {
        if (!confirm("Clear all cached data for all firms? You will need to recalculate from scratch.")) return;
        for (const f of FIRMS) await clearCacheForFirm(f.id);
        await init({ skipClearAllListener: true });
      });
    }
    return;
  }

  mainContent.classList.remove("hidden");

  const cache = await loadCache(firm.id);
  const hasCache = Object.keys(cache.spendingMonths).length > 0 || Object.keys(cache.payoutMonths).length > 0;
  const pnlRange = await loadPnlRange();
  const breakdownView = await loadMainContentBreakdownView();

  if (hasCache) {
    renderTotal(cache.spendingMonths, cache.payoutMonths, cache.lastCalculated, { pnlRange, breakdownView });
    calcBtn.textContent = "Recalculate";
  }

  const mainPnlBtns = mainContent.querySelectorAll(".pnl-range-btn");
  mainPnlBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === pnlRange);
    btn.addEventListener("click", () => {
      const range = btn.dataset.range === "thisYear" ? "thisYear" : "all";
      savePnlRange(range);
      mainPnlBtns.forEach((b) => b.classList.toggle("active", b.dataset.range === range));
      if (hasCache) renderTotal(cache.spendingMonths, cache.payoutMonths, cache.lastCalculated, { pnlRange: range, breakdownView });
    });
  });

  const breakdownViewBtns = mainContent.querySelectorAll(".breakdown-view-btn");
  breakdownViewBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === breakdownView);
    btn.addEventListener("click", () => {
      const view = btn.dataset.view === "byYear" ? "byYear" : "byMonth";
      saveMainContentBreakdownView(view);
      breakdownViewBtns.forEach((b) => b.classList.toggle("active", b.dataset.view === view));
      if (hasCache) renderTotal(cache.spendingMonths, cache.payoutMonths, cache.lastCalculated, { pnlRange, breakdownView: view });
    });
  });

  // ── Calculate ──
  calcBtn.addEventListener("click", async () => {
    setCalculating(true);
    try {
      const { spendingMonths: cachedSpending, payoutMonths: cachedPayouts } = await loadCache(firm.id);
      const cachedSpendingKeys = Object.keys(cachedSpending);
      const cachedPayoutKeys   = Object.keys(cachedPayouts);

      setStatus("Fetching data…");

      // TopStep: auth token from HttpOnly refresh_token cookie (must be fetched in extension context)
      let scrapeArgs = [cachedSpendingKeys, cachedPayoutKeys];
      if (firm.id === "topstep") {
        const cookie = await chrome.cookies.get({
          url:  "https://dashboard.topstep.com",
          name: "refresh_token",
        });
        if (!cookie?.value) {
          throw new Error("TopStep auth token not found. Make sure you are logged in at dashboard.topstep.com.");
        }
        scrapeArgs.push(cookie.value);
      }

      // firm.scrape is a self-contained function — Chrome serializes it
      // automatically. Each firm file owns its own scraping logic entirely.
      let results;
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func:   firm.scrape,
          args:   scrapeArgs,
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
      const currentPnlRange = mainContent.querySelector(".pnl-range-btn.active")?.dataset.range === "thisYear" ? "thisYear" : "all";
      const currentBreakdownView = mainContent.querySelector(".breakdown-view-btn.active")?.dataset.view === "byYear" ? "byYear" : "byMonth";
      renderTotal(mergedSpending, mergedPayouts, now, { pnlRange: currentPnlRange, breakdownView: currentBreakdownView });
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

  breakdownList.addEventListener("click", (e) => {
    const t = e.target.closest(".by-year-months-toggle");
    if (!t) return;
    const row = t.closest(".by-year-row");
    const monthsEl = row.querySelector(".by-year-months");
    const isHidden = monthsEl.classList.contains("hidden");
    monthsEl.classList.toggle("hidden", !isHidden);
    t.textContent = isHidden ? "Hide months" : "Show months";
  });

  // ── Reset ──
  resetBtn.addEventListener("click", async () => {
    if (!confirm(`Clear cached data for ${firm.name}? You will need to recalculate for this firm.`)) return;
    await clearCacheForFirm(firm.id);
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
