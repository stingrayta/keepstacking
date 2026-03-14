# KeepStacking

A Chrome extension for prop traders to track spending, payouts, and net profit across multiple prop trading firms — with smart incremental caching so past months are never re-fetched.

---

## Supported Firms

| Firm | Dashboard |
|------|-----------|
| Apex Trader Funding | `dashboard.apextraderfunding.com` |
| Alpha Futures | `app.alpha-futures.com` |
| Bulenox | `bulenox.com/member` |
| Lucid Trading | `dash.lucidtrading.com` |
| MyFundedFutures | `myfundedfutures.com` |
| Take Profit Trader | `takeprofittrader.com` |
| TopStep | `dashboard.topstep.com` |

---

## Install

| Browser | Link |
|---------|------|
| Chrome | [Chrome Web Store](https://chromewebstore.google.com/detail/ijnmgininjnghpblmgeabanhidilbmhf) |
| Edge | [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/keepstacking/bbeflhooembibkckkfognklladichbbl) |

---

## Install from Source (Developer Mode)

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
   - **Spent** — total purchases/fees (metric card)
   - **Received** — total payouts (metric card)
   - **Net Profit** — received minus spent (highlighted card)
   - **Breakdown** — expandable view by month or by year
5. Click **Recalculate** anytime — only the current month is re-fetched

### When Not on a Dashboard

Open the extension from any tab to see:
- **Prop Dashboards** — quick links to all supported firms (show/hide toggle)
- **Aggregated totals** — Spent, Received, Net across all your cached firms
- **By prop / By month / By year** — switchable breakdown views with expandable rows
- **PNL range** — filter to All data or This year only
- **Clear all** — trash icon to clear all cached data

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
