# KeepStacking — Architecture & Technical Reference

This document is intended as context for developers and AI assistants working on this codebase.

---

## File Structure

```
manifest.json          Chrome MV3 manifest — permissions, host_permissions, icons
popup.html             Extension popup UI
popup.js               Core logic — firm detection, caching, scraper orchestration
popup.css              Popup styles (dark theme, metric cards, breakdown views)
firms/
  apex.js              Scraper for Apex Trader Funding
  alpha-futures.js     Scraper for Alpha Futures
  bulenox.js           Scraper for Bulenox
  lucid.js             Scraper for Lucid Trading
  mff.js               Scraper for MyFundedFutures
  tpt.js               Scraper for Take Profit Trader
  topstep.js           Scraper for TopStep
icons/
  icon16.png           Toolbar icon
  icon48.png           Extensions page icon
  icon128.png          Chrome Web Store icon
make-icons.js          Dev script to regenerate PNG icons (requires sharp)
```

---

## UI Design

- **Dark theme** — `#0a0c10` background, `#f59e0b` amber accent
- **Metric cards** — Spent and Received side by side; Net Profit in a highlighted card with amber glow
- **View toggles** — PNL range (All data / This year), breakdown view (By month / By year)
- **Wrong-tab view** — When not on a supported dashboard: Prop Dashboards links, aggregated totals, by-prop / by-month / by-year breakdown
- **Expandable rows** — Years expand to months; props expand to months; months expand to firms
- **Persisted preferences** — PNL range, breakdown view mode, prop dashboards collapsed state

---

## Multi-Firm Plugin Architecture

Each firm lives in its own file under `firms/` and exports three things:

```js
export const id     = "apex";           // unique key, used for cache namespacing
export const name   = "Apex Trader Funding";
export const origin = "https://dashboard.apextraderfunding.com";

export async function scrape(cachedSpendingKeys, cachedPayoutKeys) {
  // runs inside the active tab via chrome.scripting.executeScript
  // returns: { spendingMonths, payoutMonths,
  //            spendingPagesFetched, payoutPagesFetched,
  //            spendingTotalPages, payoutTotalPages }
}
```

To add a new firm: create `firms/<name>.js` exporting the above, then add it to the `FIRMS` array in `popup.js`. Nothing else changes.

---

## Scraper Execution Model (Manifest V3)

Chrome MV3 forbids `eval()` and `new Function()`. Instead, the scraper function is passed **by reference** to `chrome.scripting.executeScript`:

```js
chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func:   firm.scrape,        // Chrome serializes the function automatically
  args:   [cachedSpendingKeys, cachedPayoutKeys],
});
```

This means each `scrape()` function must be **fully self-contained** — no imports, no closures over external variables. All helpers must be defined inside the function body.

**Exception:** TopStep uses an HttpOnly `refresh_token` cookie. The popup fetches it via `chrome.cookies` and passes it as a third argument to `scrape(cachedSpendingKeys, cachedPayoutKeys, authToken)`.

---

## Caching Strategy

Cache keys are namespaced per firm: `apex:spendingMonths`, `lucid:payoutMonths`, etc., stored in `chrome.storage.local`.

On every recalculation, the merge rules are:

| Month | Action |
|-------|--------|
| Current month | Always overwrite with fresh data |
| New month (not in cache) | Add it |
| Past month already cached | Keep cached value — never overwrite |

This means a full re-fetch only happens on the very first run. Subsequent recalculations fetch at most one page (the current month).

---

## Storage Keys

| Key | Purpose |
|-----|---------|
| `{firmId}:spendingMonths` | Cached spending by YYYY-MM |
| `{firmId}:payoutMonths` | Cached payouts by YYYY-MM |
| `{firmId}:lastCalculated` | Timestamp of last successful calc |
| `mainDashViewMode` | Wrong-tab breakdown: `byProp` \| `byMonth` \| `byYear` |
| `pnlRange` | `all` \| `thisYear` for totals filter |
| `mainContentBreakdownView` | Main content breakdown: `byMonth` \| `byYear` |
| `propDashboardsCollapsed` | Whether Prop Dashboards links are hidden |

---

## Data Retrieval by Firm

### Apex Trader Funding — HTML scraping

- Fetches `/PaymentHistory` and `/PARequestPayout` pages
- Reads `data-info` attribute on `table.am-grid` for `totalRecords` to compute page count
- Paginates via `?_payment_history_p=N` query param
- Parses rows with `DOMParser`
- Early-stops once all months on a page are already cached

### Lucid Trading — REST API with offset pagination

- Reads `auth_token` from `localStorage`, decodes JWT to extract `userKey`
- `GET /api/users/order-history?userKey=...&limit=50&offset=N`
- Increments offset by 50 until response length < limit
- Filters for `status === "completed"` orders

### MyFundedFutures — REST API with date-range

- `POST https://api.myfundedfutures.com/api/getReceipts/` with `{ from, to }` body
- Uses `credentials: "include"` (cookie-based auth — no token extraction needed)
- First run: fetches from `2020-01-01` to today
- Recalculate: fetches only current month (start of month to today)
- Filters for `processed === true` receipts

### Alpha Futures — REST API with Bearer token

- Bearer token from Redux persist: `localStorage.getItem("persist:acg-futures-root")`
- Spending: `GET backend.alpha-futures.com/payment/payment-history` (pagination)
- Payouts: `GET backend.alpha-futures.com/user/payout/list` (pagination)

### Bulenox — HTML scraping (single-page tables)

- `GET member/member/payment-history` and `member/payout-list`
- Parses HTML tables for amounts and dates
- Session cookie auth (user must be logged in)

### Take Profit Trader — REST API with pagination

- Spending: `GET payments/api/payments/user-transactions` — sum by month (type=0 add, type=1 subtract)
- Payouts: `GET payments/api/Wallets/transactions` — sum where type=0, status=1
- Cookie-based auth (same-origin)

### TopStep — GraphQL + REST (Bearer from HttpOnly cookie)

- Auth: `refresh_token` cookie fetched by popup via `chrome.cookies`, passed as third scrape arg
- Spending: GraphQL `GetAllPurchasesByUser` at `crystal.topstep.com`
- Payouts: REST `GET api.topstep.com/me/payouts`

---

## Scraper Return Contract

Every `scrape()` function must return this shape:

```js
{
  spendingMonths:       { "2025-01": 540.00, "2025-02": 120.00 },  // YYYY-MM → amount
  payoutMonths:         { "2025-03": 3000.00 },
  spendingPagesFetched: 2,   // used for status display only
  payoutPagesFetched:   1,
  spendingTotalPages:   2,
  payoutTotalPages:     1,
}
```

Month keys are always `YYYY-MM` strings. Amounts are numbers (USD).

---

## Adding a New Firm — Checklist

1. Create `firms/<firmid>.js` with `id`, `name`, `origin`, and `scrape` exports
2. The `scrape` function must be self-contained (no external imports or closures)
3. Import it in `popup.js` and add to the `FIRMS` array
4. Add the firm's domain to `host_permissions` in `manifest.json`
5. If the firm uses an external API domain, add that too (e.g. `api.myfundedfutures.com`)
6. If the firm needs auth from outside the page (e.g. HttpOnly cookie), add logic in popup.js to fetch it and pass as extra args to `scrape`
