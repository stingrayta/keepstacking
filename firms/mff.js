// MyFundedFutures — scraper
// Spending: POST /api/getReceipts/ with date range, cookie auth
// Payouts:  not yet implemented

export const id     = "mff";
export const name   = "MyFundedFutures";
export const origin = "https://myfundedfutures.com";

export async function scrape(cachedSpendingKeys, cachedPayoutKeys) {
  const API_URL = "https://api.myfundedfutures.com/api/getReceipts/";

  function parseMonthKey(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function toDateString(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Date range strategy:
  //   First run (empty cache) → fetch everything from 2020-01-01
  //   Recalculate (has cache) → fetch only current month (past months are cached)
  const today   = new Date();
  const hasCacheData = cachedSpendingKeys && cachedSpendingKeys.length > 0;
  const fromDate = hasCacheData
    ? new Date(today.getFullYear(), today.getMonth(), 1)  // start of current month
    : new Date("2020-01-01");

  let receipts;
  try {
    const res = await fetch(API_URL, {
      method:      "POST",
      credentials: "include",
      headers:     { "Content-Type": "application/json" },
      body:        JSON.stringify({ from: toDateString(fromDate), to: toDateString(today) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    receipts = data.ok;
    if (!Array.isArray(receipts)) throw new Error("Unexpected response format.");
  } catch (err) {
    throw new Error(`Failed to fetch receipts: ${err.message}`);
  }

  const months = {};
  receipts.forEach((order) => {
    if (!order.processed) return;
    const amount   = parseFloat(order.price_paid) || 0;
    const monthKey = parseMonthKey(order.created_at);
    if (!monthKey || amount === 0) return;
    months[monthKey] = (months[monthKey] || 0) + amount;
  });

  return {
    spendingMonths:       months,
    payoutMonths:         {},   // TODO: add payout endpoint when available
    spendingPagesFetched: 1,
    payoutPagesFetched:   0,
    spendingTotalPages:   1,
    payoutTotalPages:     0,
  };
}
