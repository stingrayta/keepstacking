// Alpha Futures — scraper
// Spending: GET payment-history with pagination
// Payouts:  GET user/payout/list with pagination
// Auth:     Bearer token from Redux persist (persist:acg-futures-root). All logic
//           must live inside scrape() so Chrome's executeScript can serialize it.

export const id     = "alpha-futures";
export const name   = "Alpha Futures";
export const origin = "https://app.alpha-futures.com";

export async function scrape(cachedSpendingKeys, cachedPayoutKeys) {
  const PAYMENT_HISTORY_URL = "https://backend.alpha-futures.com/payment/payment-history";
  const PAYOUT_LIST_URL     = "https://backend.alpha-futures.com/user/payout/list";
  const PAGE_SIZE = 100;

  function getAuthHeaders() {
    const raw = localStorage.getItem("persist:acg-futures-root");
    if (!raw) return {};
    let token = null;
    try {
      function findToken(obj, depth) {
        if (depth > 5) return null;
        if (typeof obj === "string") {
          if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(obj.trim())) return obj.trim();
          try { return findToken(JSON.parse(obj), depth + 1); } catch (_) { return null; }
        }
        if (obj && typeof obj === "object") {
          const t = obj.token || obj.accessToken || obj.authToken || (obj.stsTokenManager && obj.stsTokenManager.accessToken);
          if (typeof t === "string") return t;
          for (const k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) {
            const v = findToken(obj[k], depth + 1);
            if (v) return v;
          }
        }
        return null;
      }
      token = findToken(JSON.parse(raw), 0);
    } catch (_) {}
    if (!token) return {};
    return { Authorization: token.startsWith("Bearer ") ? token : "Bearer " + token };
  }

  function parseMonthKey(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function currentMonthKey() {
    const now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  }

  const authHeaders = getAuthHeaders();
  if (!authHeaders.Authorization) {
    throw new Error("No auth token found. Log in at app.alpha-futures.com and try again.");
  }

  const months = {};
  const cachedSet = new Set(cachedSpendingKeys || []);
  const nowKey = currentMonthKey();
  let page = 1;
  let pagesFetched = 0;
  let totalPages = 1;

  while (true) {
    const url = PAYMENT_HISTORY_URL + "/?page=" + page + "&page_size=" + PAGE_SIZE;

    let data;
    try {
      const res = await fetch(url, { credentials: "include", headers: authHeaders });
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = await res.json();
    } catch (err) {
      throw new Error("Failed to fetch payment history: " + err.message);
    }

    if (!data || !Array.isArray(data.results)) throw new Error("Unexpected payment-history response format.");

    const results = data.results;
    pagesFetched++;
    if (data.count != null) totalPages = Math.ceil(data.count / PAGE_SIZE) || 1;

    const monthsOnPage = {};
    results.forEach(function (item) {
      if (item.payment_status !== "succeeded" && item.payment_status !== "expired") return;
      const amount = parseFloat(item.amount) || 0;
      const monthKey = parseMonthKey(item.created_at);
      if (!monthKey || amount === 0) return;
      monthsOnPage[monthKey] = (monthsOnPage[monthKey] || 0) + amount;
    });

    Object.keys(monthsOnPage).forEach(function (k) {
      months[k] = (months[k] || 0) + monthsOnPage[k];
    });

    if (Object.keys(monthsOnPage).length > 0) {
      const canStop = Object.keys(monthsOnPage).every(function (k) {
        return k === nowKey || (k < nowKey && cachedSet.has(k));
      });
      if (canStop) break;
    }

    if (!data.next || results.length < PAGE_SIZE) break;
    page++;
  }

  const payoutMonths = {};
  let payoutPage = 1;
  let payoutPagesFetched = 0;
  let payoutTotalPages = 1;

  try {
    while (true) {
      const payoutUrl = PAYOUT_LIST_URL + "/?page=" + payoutPage + "&page_size=" + PAGE_SIZE;

      const res = await fetch(payoutUrl, { credentials: "include", headers: authHeaders });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const payoutData = await res.json();

      if (!payoutData || !Array.isArray(payoutData.results)) break;

      const payoutResults = payoutData.results;
      payoutPagesFetched++;
      if (payoutData.count != null) payoutTotalPages = Math.ceil(payoutData.count / PAGE_SIZE) || 1;

      payoutResults.forEach(function (item) {
        if (item.status !== "approved") return;
        const amount = parseFloat(item.amount) || 0;
        const monthKey = parseMonthKey(item.created_at);
        if (!monthKey || amount === 0) return;
        payoutMonths[monthKey] = (payoutMonths[monthKey] || 0) + amount;
      });

      if (!payoutData.next || payoutResults.length < PAGE_SIZE) break;
      payoutPage++;
    }
  } catch (err) {
    // non-fatal: payouts remain empty
  }

  return {
    spendingMonths:       months,
    payoutMonths:         payoutMonths,
    spendingPagesFetched: pagesFetched,
    payoutPagesFetched:   payoutPagesFetched,
    spendingTotalPages:   totalPages,
    payoutTotalPages:     payoutTotalPages,
  };
}
