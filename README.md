# KeepStacking

A Chrome extension for prop traders to track spending, payouts, and net profit across multiple prop trading firms — with smart incremental caching so past months are never re-fetched.

---

## Supported Firms

| Firm | Dashboard |
|------|-----------|
| Apex Trader Funding | `dashboard.apextraderfunding.com` |
| Lucid Trading | `dash.lucidtrading.com` |
| MyFundedFutures | `myfundedfutures.com` |

---

## How to Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder
5. The KeepStacking icon appears in your toolbar

---

## How to Use

1. Log in to any supported prop firm dashboard
2. Click the **KeepStacking** extension icon
3. Click **Calculate**
4. The extension fetches your full history and displays:
   - **Spent** — total purchases/fees
   - **Received** — total payouts
   - **Net Profit** — received minus spent
   - **By Month** — expandable breakdown with Spent / Received / Net columns
5. Click **Recalculate** anytime — only the current month is re-fetched

---

## Smart Caching

- Past months are cached permanently — never re-fetched
- Only the current month is refreshed on each recalculation
- Cache is stored locally in Chrome and persists across sessions
- Use the trash icon to clear all cached data and start fresh

---

## Regenerating Icons

```bash
npm install
node make-icons.js
```

---

For technical details, architecture, and how to add new firms see [ARCHITECTURE.md](./ARCHITECTURE.md).
