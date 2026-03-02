// Lucid Trading — scraper
// Spending: REST API order-history with Bearer token from localStorage
// Payouts:  REST API payout-history, same auth

export const id     = "lucid";
export const name   = "Lucid Trading";
export const origin = "https://dash.lucidtrading.com";

export async function scrape(cachedSpendingKeys, cachedPayoutKeys) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = localStorage.getItem("auth_token");
  if (!token) throw new Error("auth_token not found in localStorage. Make sure you are logged in.");

  // Extract userKey: try JWT payload first, then common localStorage keys.
  // JWT structure: header.payload.signature — payload is base64-encoded JSON.
  function getUserKey() {
    for (const lsKey of ["userKey", "user_key", "lucid_user_key"]) {
      const v = localStorage.getItem(lsKey);
      if (v) return v;
    }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      for (const field of ["userKey", "user_key", "key", "sub", "userId", "id"]) {
        if (payload[field]) return String(payload[field]);
      }
    } catch { /* JWT decode failed — fall through */ }
    return null;
  }

  const userKey = getUserKey();
  if (!userKey) throw new Error("Could not determine userKey. Check localStorage or JWT payload.");

  // ── Helpers ───────────────────────────────────────────────────────────────
  function parseMonthKey(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  // ── Paginated fetch ───────────────────────────────────────────────────────
  const LIMIT        = 50;
  const cachedSet    = new Set(cachedSpendingKeys || []);
  const nowKey       = currentMonthKey();
  const months       = {};
  let   offset       = 0;
  let   totalPages   = 0;
  let   pagesFetched = 0;

  while (true) {
    const url = `https://dash.lucidtrading.com/api/users/order-history` +
                `?userKey=${encodeURIComponent(userKey)}&limit=${LIMIT}&offset=${offset}`;

    let orders;
    try {
      const res = await fetch(url, {
        credentials: "same-origin",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      orders = await res.json();
    } catch (err) {
      throw new Error(`Failed to fetch orders (offset ${offset}): ${err.message}`);
    }

    if (!Array.isArray(orders) || orders.length === 0) break;

    totalPages++;
    pagesFetched++;

    const monthsOnPage = {};
    orders.forEach((order) => {
      if (order.status !== "completed") return;
      const amount   = parseFloat(order.totalAmount) || 0;
      const monthKey = parseMonthKey(order.dateCreated);
      if (!monthKey || amount === 0) return;
      monthsOnPage[monthKey] = (monthsOnPage[monthKey] || 0) + amount;
    });

    Object.entries(monthsOnPage).forEach(([k, v]) => {
      months[k] = (months[k] || 0) + v;
    });

    // Early stop: if every month on this page is current-or-cached, all
    // deeper (older) pages are guaranteed to be fully cached too.
    if (Object.keys(monthsOnPage).length > 0) {
      const canStop = Object.keys(monthsOnPage).every(
        k => k === nowKey || (k < nowKey && cachedSet.has(k))
      );
      if (canStop) break;
    }

    if (orders.length < LIMIT) break;

    offset += LIMIT;
  }

  // ── Payout history ────────────────────────────────────────────────────────
  const payoutMonths = {};
  let payoutPagesFetched = 0;
  let payoutTotalPages = 0;

  try {
    const payoutUrl = `https://dash.lucidtrading.com/api/payout/payout-history` +
                     `?userKey=${encodeURIComponent(userKey)}`;
    const res = await fetch(payoutUrl, {
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payouts = await res.json();
    if (!Array.isArray(payouts)) throw new Error("Unexpected payout response format.");

    payoutTotalPages = 1;
    payoutPagesFetched = 1;

    payouts.forEach((p) => {
      if (p.status !== "Paid") return;
      const amount = parseFloat(p.amount) || 0;
      const dateStr = p.payDate || p.approvalDate || p.requestDate;
      const monthKey = parseMonthKey(dateStr);
      if (!monthKey || amount === 0) return;
      payoutMonths[monthKey] = (payoutMonths[monthKey] || 0) + amount;
    });
  } catch (err) {
    // Non-fatal: spending still returns; payouts remain empty
    console.warn("[KeepStacking] Lucid payout fetch failed:", err.message);
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
