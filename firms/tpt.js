// Take Profit Trader — scraper
// Spending: GET payments/api/payments/user-transactions → sum by month (type=0 add, type=1 subtract)
// Payouts:  GET payments/api/Wallets/transactions with pagination; sum amount where type=0, status=1
// Auth:     Cookie-based (same-origin). All logic inside scrape() for executeScript.

export const id     = "tpt";
export const name   = "Take Profit Trader";
export const origin = "https://takeprofittrader.com";

export async function scrape(cachedSpendingKeys, cachedPayoutKeys) {
  const USER_TRANSACTIONS_URL = "https://takeprofittrader.com/payments/api/payments/user-transactions";
  const TRANSACTIONS_BASE = "https://takeprofittrader.com/payments/api/Wallets/transactions";
  const PAGE_SIZE = 100;

  function parseMonthKey(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  // ── Spend: user-transactions (actual payments by month) ────────────────────
  const spendingMonths = {};
  let spendingPagesFetched = 0;
  try {
    const res = await fetch(USER_TRANSACTIONS_URL, { credentials: "include" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || !data.isSuccess) {
      throw new Error(data?.error || "User transactions request failed. Log in at takeprofittrader.com and try again.");
    }
    const result = data.result;
    if (!Array.isArray(result)) {
      throw new Error("Unexpected user-transactions response format.");
    }
    spendingPagesFetched = 1;
    result.forEach(function (item) {
      if (item.status !== 1 || item.amount == null) return;
      const amount = parseFloat(item.amount) || 0;
      if (amount === 0) return;
      const monthKey = parseMonthKey(item.createdAt);
      if (!monthKey) return;
      if (item.type === 0) {
        spendingMonths[monthKey] = (spendingMonths[monthKey] || 0) + amount;
      } else if (item.type === 1) {
        spendingMonths[monthKey] = (spendingMonths[monthKey] || 0) - amount;
      }
    });
  } catch (err) {
    throw new Error("Failed to fetch user transactions: " + (err.message || String(err)));
  }

  // ── Payouts: paginate Wallets/transactions ─────────────────────────────────
  const payoutMonths = {};
  let payoutPagesFetched = 0;
  let payoutTotalPages = 0;
  let page = 1;

  try {
    while (true) {
      const url = TRANSACTIONS_BASE + "?page=" + page + "&itemCount=" + PAGE_SIZE + "&sortKey=createdAt&sortDirection=1";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data || !data.isSuccess || !data.result || !Array.isArray(data.result.items)) break;

      const items = data.result.items;
      payoutPagesFetched++;
      if (data.result.total != null) payoutTotalPages = Math.ceil(data.result.total / PAGE_SIZE) || 1;

      items.forEach(function (item) {
        if (item.type !== 0 || item.status !== 1) return;
        const amount = parseFloat(item.amount) || 0;
        const monthKey = parseMonthKey(item.createdAt);
        if (!monthKey || amount === 0) return;
        payoutMonths[monthKey] = (payoutMonths[monthKey] || 0) + amount;
      });

      if (items.length < PAGE_SIZE) break;
      page++;
    }
  } catch (err) {
    // Non-fatal: payouts remain empty
  }

  return {
    spendingMonths,
    payoutMonths,
    spendingPagesFetched: 1,
    payoutPagesFetched:   payoutPagesFetched,
    spendingTotalPages:   1,
    payoutTotalPages:     payoutTotalPages || payoutPagesFetched,
  };
}
