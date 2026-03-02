// MyFundedFutures — scraper
// Spending: POST /api/getReceipts/ with date range, cookie auth
// Payouts:  GET /api/getPastPayouts/ with pagination, same cookie auth

export const id     = "mff";
export const name   = "MyFundedFutures";
export const origin = "https://myfundedfutures.com/stats";

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

  // ── Payouts: getPastPayouts with pagination ──────────────────────────────
  const payoutMonths = {};
  const PAYOUT_PAGE_SIZE = 100;
  let payoutPage = 0;
  let payoutPagesFetched = 0;

  try {
    while (true) {
      const payoutUrl = `https://api.myfundedfutures.com/api/getPastPayouts/?page=${payoutPage}&page_size=${PAYOUT_PAGE_SIZE}`;
      const res = await fetch(payoutUrl, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const ok = data.ok;
      if (!ok || !ok.data) throw new Error("Unexpected payout response format.");
      const pastPayouts = ok.data.past_payouts;
      if (!Array.isArray(pastPayouts)) break;

      payoutPagesFetched++;

      pastPayouts.forEach((p) => {
        if (p.status !== "Processed") return;
        const amount = parseFloat(p.amount) || 0;
        const monthKey = parseMonthKey(p.date);
        if (!monthKey || amount === 0) return;
        payoutMonths[monthKey] = (payoutMonths[monthKey] || 0) + amount;
      });

      if (pastPayouts.length < PAYOUT_PAGE_SIZE || ok.next_page == null) break;
      payoutPage++;
    }
  } catch (err) {
    console.warn("[KeepStacking] MFF payout fetch failed:", err.message);
  }

  return {
    spendingMonths:       months,
    payoutMonths:         payoutMonths,
    spendingPagesFetched: 1,
    payoutPagesFetched:   payoutPagesFetched,
    spendingTotalPages:   1,
    payoutTotalPages:     payoutPagesFetched,
  };
}
