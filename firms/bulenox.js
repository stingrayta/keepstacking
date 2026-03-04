// Bulenox — scraper
// Spending: GET member/member/payment-history (single-page table)
// Payouts:  GET member/payout-list (single-page table)
// Auth:     Session cookie (user must be logged in at bulenox.com). Scrape runs in tab via executeScript.

export const id     = "bulenox";
export const name   = "Bulenox";
export const origin = "https://bulenox.com/member/";

export async function scrape(cachedSpendingKeys, cachedPayoutKeys) {
  const PAYMENT_HISTORY_URL = "https://bulenox.com/member/member/payment-history";
  const PAYOUT_LIST_URL     = "https://bulenox.com/member/payout-list";

  function parseMonthKey(dateStr) {
    const d = new Date(dateStr.trim());
    if (isNaN(d)) return null;
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  const spendingMonths = {};
  let spendingPagesFetched = 0;
  const payoutMonths = {};
  let payoutPagesFetched = 0;

  // —— Spending (payment-history) ——
  let paymentHtml;
  try {
    const res = await fetch(PAYMENT_HISTORY_URL, { credentials: "include" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    paymentHtml = await res.text();
  } catch (err) {
    throw new Error("Failed to fetch payment history. Log in at bulenox.com and try again: " + err.message);
  }

  const paymentDoc = new DOMParser().parseFromString(paymentHtml, "text/html");
  const paymentTable = paymentDoc.querySelector("table.am-member-payment-history");
  if (paymentTable) {
    const rows = paymentTable.querySelectorAll("tbody tr.am-member-payment-history-row");
    rows.forEach((row) => {
      const dateEl = row.querySelector("td.am-member-payment-history-date");
      const amountEl = row.querySelector("td.am-member-payment-history-amount");
      if (!dateEl || !amountEl) return;
      const dateStr = dateEl.textContent.trim();
      const amount = parseFloat(amountEl.textContent.replace(/[$,]/g, "")) || 0;
      const monthKey = parseMonthKey(dateStr);
      if (!monthKey || amount === 0) return;
      spendingMonths[monthKey] = (spendingMonths[monthKey] || 0) + amount;
    });
    spendingPagesFetched = 1;
  }

  // —— Payouts (payout-list) ——
  let payoutHtml;
  try {
    const res = await fetch(PAYOUT_LIST_URL, { credentials: "include" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    payoutHtml = await res.text();
  } catch (err) {
    throw new Error("Failed to fetch payout list. Log in at bulenox.com and try again: " + err.message);
  }

  const payoutDoc = new DOMParser().parseFromString(payoutHtml, "text/html");
  const payoutGrid = payoutDoc.querySelector("#grid-pl table.am-grid");
  if (payoutGrid) {
    const payoutRows = payoutGrid.querySelectorAll("tbody tr.am-grid-row");
    payoutRows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 3) return;
      const dateCell = cells[0];
      const amountCell = cells[2];
      const timeEl = dateCell.querySelector("time[datetime]");
      const dateStr = timeEl ? timeEl.getAttribute("datetime") : dateCell.textContent.trim();
      const amount = parseFloat(amountCell.textContent.replace(/[$,]/g, "")) || 0;
      const monthKey = parseMonthKey(dateStr);
      if (!monthKey || amount === 0) return;
      payoutMonths[monthKey] = (payoutMonths[monthKey] || 0) + amount;
    });
    payoutPagesFetched = 1;
  }

  return {
    spendingMonths,
    payoutMonths,
    spendingPagesFetched,
    payoutPagesFetched,
    spendingTotalPages: 1,
    payoutTotalPages:   1,
  };
}
