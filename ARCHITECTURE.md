# KeepStacking — Architecture & Technical Reference

This document is intended as context for developers and AI assistants working on this codebase.

---

## File Structure

```
manifest.json          Chrome MV3 manifest — permissions, host_permissions, icons
popup.html             Extension popup UI
popup.js               Core logic — firm detection, caching, scraper orchestration
popup.css              Popup styles
firms/
  apex.js              Scraper for Apex Trader Funding
  lucid.js             Scraper for Lucid Trading
  mff.js               Scraper for MyFundedFutures
icons/
  icon16.png           Toolbar icon
  icon48.png           Extensions page icon
  icon128.png          Chrome Web Store icon
make-icons.js          Dev script to regenerate PNG icons (requires sharp)
```

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
