// Apex Trader Funding — scraper
// Contract: must return { spendingMonths, payoutMonths, spendingPagesFetched,
//           payoutPagesFetched, spendingTotalPages, payoutTotalPages }

export const id     = "apex";
export const name   = "Apex Trader Funding";
export const origin = "https://dashboard.apextraderfunding.com";

export async function scrape(cachedSpendingKeys, cachedPayoutKeys) {
  const ROWS_PER_PAGE   = 50;
  const TABLE_SELECTOR  = "table.am-grid";
  const ROW_SELECTOR    = "table.am-grid tbody tr.am-grid-row";

  function parseMonthKey(dateText) {
    const d = new Date(dateText.trim());
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  // Scrapes a paginated HTML table.
  // statusColIdx = -1 → no filter; otherwise only rows where that column
  // text (trimmed, lowercase) equals statusValue are counted.
  async function scrapeGrid(basePath, paginationParam, amountColIdx, dateColIdx, statusColIdx, statusValue, cachedKeys) {
    let firstHtml;
    try {
      firstHtml = await fetch(basePath, { credentials: "same-origin" }).then(r => r.text());
    } catch (err) {
      throw new Error(`Failed to fetch ${basePath}: ${err.message}`);
    }

    const firstDoc = new DOMParser().parseFromString(firstHtml, "text/html");
    const tableEl  = firstDoc.querySelector(TABLE_SELECTOR);
    if (!tableEl) return { months: {}, totalPages: 0, pagesFetched: 0 };

    let info;
    try { info = JSON.parse(tableEl.dataset.info); }
    catch { return { months: {}, totalPages: 0, pagesFetched: 0 }; }

    const totalRecords = info.totalRecords || 0;
    const totalPages   = Math.ceil(totalRecords / ROWS_PER_PAGE);
    const cachedSet    = new Set(cachedKeys || []);
    const nowKey       = currentMonthKey();
    const months       = {};
    let   pagesFetched = 0;

    for (let p = 0; p < totalPages; p++) {
      const url  = p === 0 ? basePath : `${basePath}?${paginationParam}=${p}`;
      let   html;
      try {
        html = p === 0 ? firstHtml : await fetch(url, { credentials: "same-origin" }).then(r => r.text());
      } catch (err) {
        throw new Error(`Failed to fetch page ${p} of ${basePath}: ${err.message}`);
      }

      pagesFetched++;
      const doc          = new DOMParser().parseFromString(html, "text/html");
      const rows         = doc.querySelectorAll(ROW_SELECTOR);
      const monthsOnPage = {};

      rows.forEach((row) => {
        const cells  = row.querySelectorAll("td");
        const maxIdx = Math.max(amountColIdx, dateColIdx, statusColIdx >= 0 ? statusColIdx : 0);
        if (cells.length <= maxIdx) return;
        if (statusColIdx >= 0 && cells[statusColIdx].textContent.trim().toLowerCase() !== statusValue) return;

        const amount   = parseFloat(cells[amountColIdx].textContent.replace(/[$,]/g, "")) || 0;
        const monthKey = parseMonthKey(cells[dateColIdx].textContent);
        if (!monthKey || amount === 0) return;
        monthsOnPage[monthKey] = (monthsOnPage[monthKey] || 0) + amount;
      });

      Object.entries(monthsOnPage).forEach(([k, v]) => {
        months[k] = (months[k] || 0) + v;
      });

      // Stop once every month on this page is the current month or already cached.
      // Rows are newest-first, so all subsequent pages are guaranteed to be older.
      if (Object.keys(monthsOnPage).length > 0) {
        const canStop = Object.keys(monthsOnPage).every(
          k => k === nowKey || (k < nowKey && cachedSet.has(k))
        );
        if (canStop) break;
      }
    }

    return { months, totalPages, pagesFetched };
  }

  // Spending: /PaymentHistory — amount col 1, date col 2, no status filter
  const spending = await scrapeGrid(
    "/PaymentHistory", "_payment_history_p", 1, 2, -1, null, cachedSpendingKeys
  );

  // Payouts: /PARequestPayout — amount col 3, date col 2, status col 5 = "paid"
  const payouts = await scrapeGrid(
    "/PARequestPayout", "_charts_p", 3, 2, 5, "paid", cachedPayoutKeys
  );

  return {
    spendingMonths:       spending.months,
    payoutMonths:         payouts.months,
    spendingPagesFetched: spending.pagesFetched,
    payoutPagesFetched:   payouts.pagesFetched,
    spendingTotalPages:   spending.totalPages,
    payoutTotalPages:     payouts.totalPages,
  };
}
