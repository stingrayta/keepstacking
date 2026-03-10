// TopStep — scraper
// Spending: GraphQL GetAllPurchasesByUser at crystal.topstep.com
// Payouts:  REST GET api.topstep.com/me/payouts
// Auth:     GET api.topstep.com/me/profile/ with credentials returns { token } — use as Bearer

export const id     = "topstep";
export const name   = "TopStep";
export const origin = "https://dashboard.topstep.com";

export async function scrape(cachedSpendingKeys, cachedPayoutKeys, _authToken) {
  const PROFILE_URL = "https://api.topstep.com/me/profile/";
  const GRAPHQL_URL = "https://crystal.topstep.com/graphql/GetAllPurchasesByUser";
  const PAYOUTS_URL = "https://api.topstep.com/me/payouts";
  const PAGE_SIZE   = 50;

  // Get access token from profile endpoint (accepts cookie auth when on dashboard)
  const profileRes = await fetch(PROFILE_URL, { credentials: "include" });
  if (!profileRes.ok) throw new Error("TopStep auth failed. Make sure you are logged in at dashboard.topstep.com.");
  const profileJson = await profileRes.json();
  const token = profileJson?.token;
  if (!token) throw new Error("TopStep auth token not found. Make sure you are logged in at dashboard.topstep.com.");

  const headers = {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${token}`,
  };

  function parseMonthKey(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  // ── Expenses: GraphQL GetAllPurchasesByUser ─────────────────────────────────
  const months           = {};
  const cachedSet        = new Set(cachedSpendingKeys || []);
  const nowKey           = currentMonthKey();
  let   offset           = 0;
  let   totalCount       = 0;
  let   spendingPages    = 0;

  const query = `
    query GetAllPurchasesByUser($first: Int, $offset: Int, $after: Cursor) {
      normalizedPurchasesByUser(first: $first, offset: $offset, after: $after) {
        nodes {
          total
          createdAt
          paymentStatus
        }
      }
      normalizedPurchasesByUserTotalCount
    }
  `;

  while (true) {
    const variables = { first: PAGE_SIZE, offset, after: null };
    let data;
    try {
      const res = await fetch(GRAPHQL_URL, {
        method:  "POST",
        headers,
        body:    JSON.stringify({ query, operationName: "GetAllPurchasesByUser", variables }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || "GraphQL error");
      data = json.data;
    } catch (err) {
      throw new Error(`Failed to fetch purchases (offset ${offset}): ${err.message}`);
    }

    if (!data?.normalizedPurchasesByUser?.nodes) break;
    const nodes = data.normalizedPurchasesByUser.nodes;
    if (typeof data.normalizedPurchasesByUserTotalCount === "number") {
      totalCount = data.normalizedPurchasesByUserTotalCount;
    }

    if (nodes.length === 0) break;

    spendingPages++;

    const monthsOnPage = {};
    nodes.forEach((node) => {
      if (node.paymentStatus !== "complete") return;
      const amount = Number(node.total) || 0;
      const monthKey = parseMonthKey(node.createdAt);
      if (!monthKey || amount === 0) return;
      monthsOnPage[monthKey] = (monthsOnPage[monthKey] || 0) + amount;
    });

    Object.entries(monthsOnPage).forEach(([k, v]) => {
      months[k] = (months[k] || 0) + v;
    });

    // Early stop: all months on page are current or cached
    if (Object.keys(monthsOnPage).length > 0) {
      const canStop = Object.keys(monthsOnPage).every(
        k => k === nowKey || (k < nowKey && cachedSet.has(k))
      );
      if (canStop) break;
    }

    if (nodes.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const spendingTotalPages = totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : spendingPages;

  // ── Payouts: REST api.topstep.com/me/payouts ─────────────────────────────────
  const payoutMonths       = {};
  const payoutCachedSet    = new Set(cachedPayoutKeys || []);
  let   payoutPage         = 1;
  let   payoutPagesFetched = 0;
  let   payoutTotalPages   = 1;

  try {
    while (true) {
      const url = `${PAYOUTS_URL}?page=${payoutPage}&limit=${PAGE_SIZE}`;
      let data;
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } catch (err) {
        throw new Error(`Failed to fetch payouts (page ${payoutPage}): ${err.message}`);
      }

      const requests = data?.payoutRequests;
      if (!Array.isArray(requests) || requests.length === 0) break;

      payoutPagesFetched++;
      if (typeof data?.totalPages === "number") payoutTotalPages = data.totalPages;

      const monthsOnPage = {};
      requests.forEach((p) => {
        if (p.status !== "Finalized") return;
        const amount   = parseFloat(p.amount) || 0;
        const monthKey = parseMonthKey(p.createdAt);
        if (!monthKey || amount === 0) return;
        monthsOnPage[monthKey] = (monthsOnPage[monthKey] || 0) + amount;
      });

      Object.entries(monthsOnPage).forEach(([k, v]) => {
        payoutMonths[k] = (payoutMonths[k] || 0) + v;
      });

      // Early stop
      if (Object.keys(monthsOnPage).length > 0) {
        const canStop = Object.keys(monthsOnPage).every(
          k => k === nowKey || (k < nowKey && payoutCachedSet.has(k))
        );
        if (canStop) break;
      }

      if (payoutPage >= payoutTotalPages || requests.length < PAGE_SIZE) break;
      payoutPage++;
    }
  } catch (err) {
    console.warn("[KeepStacking] TopStep payout fetch failed:", err.message);
  }

  return {
    spendingMonths:       months,
    payoutMonths:         payoutMonths,
    spendingPagesFetched: spendingPages,
    payoutPagesFetched:   payoutPagesFetched,
    spendingTotalPages:   spendingTotalPages || 1,
    payoutTotalPages:     payoutTotalPages || payoutPagesFetched || 1,
  };
}
