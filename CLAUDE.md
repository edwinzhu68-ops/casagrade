# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication Style

- 所有回复必须用中文
- 用简单易懂的中文解释，避免复杂术语

## Commands

```bash
# Install dependencies
npm install

# Start the frontend dev server (port 8080 by default)
npm start

# Custom ports
PORT=9000 npm start           # change frontend port
BACKEND_PORT=4000 npm start   # point API proxy to a different backend port
```

The backend (`lottery-system`) must be started separately before the frontend server can proxy API calls. The backend defaults to port 3000.

## Architecture Overview

This is the **frontend-only** repo for a Panama lottery (Lotería) sales system. It serves static HTML pages and proxies `/api/*` requests to the NestJS backend at `https://api.casagrade.com` (or `localhost:3000` in local dev).

**`server.js`** — Express server that:
1. Proxies all `/api/*` requests to the backend (port configurable via `BACKEND_PORT`)
2. Serves static HTML files directly from the project root

**Pages and roles:**

| File | Role | Purpose |
|------|------|---------|
| `index.html` | Customer | Enter store number → pick Billete/Chance tickets → submit order → QR payment page (polls for paid status) → confirmed/result view |
| `merchant.html` | Store owner | Login → cashier dashboard (sales stats, pending orders) → confirm payment → redeem winnings → jump to result page |
| `dashboard.html` | Admin | Pull Firebase draw results → send draw results manually → assign shop numbers → clear settlement |
| `result.html` | Store owner | Settlement view: sales, payouts, profit, order list sorted by last 4 digits of order number, recent 20-period history |

**No build step** — pages use Tailwind CDN and inline JS. Pages are in Spanish (UI) with Chinese comments.

## Key Business Logic

### Period/Draw Cycle
- Sales open at 16:00 after the previous draw; close at 14:55 on draw day; draw at 15:00
- After draw: data flows to settlement view; sales page clears at 16:00 for the new period
- "Clear settlement" (`POST /api/admin/clear-settlement`) archives the latest completed draw — result page then shows "waiting for draw" until the next manual draw is sent

### Order Status Flow
`0` pending → `1` paid → `2` settled (no win) / `3` won → redeemed (won + `redeemed_at` set)

### Win Amount Display Rule (critical)
**Never recalculate winnings on the frontend.** Always use `win_amount` from the API; fall back to sum of `win_breakdown` fields only if `win_amount === 0`. The helper `getOrderWinAmount(order)` in merchant/result pages implements this.

### Winning Rules Summary
- **Billete** ($1/ticket, 4-digit): compare against 1st/2nd/3rd prize numbers; per prize, take the highest matching tier only (exact→first3→last3→first2→last2→last1); sum across all three prizes. Rates: `[2000,600,300]` / `[50,20,10]` / `[50,20,10]` / `[3,0,0]` / `[3,2,1]` / `[1,0,0]`
- **Chance** ($0.25/ticket, 2-digit): compare last 2 digits against last 2 digits of all three prizes; prizes stack. Rates: `[14, 3, 2]` per ticket. **Must calculate as `quantity × rate`**, never `betAmount × multiplier`.

## API Base URL

Pages determine the backend URL at runtime. `index.html` checks `localStorage.lottery_api_base` first, then falls back to production (`https://api.casagrade.com`) or local. In production, `server.js` is not typically used — pages hit the API directly.

## Auth

- Merchant/admin login: `POST /api/merchant/login`
- Admin-only operations require header `X-Admin-Token` matching the server's `ADMIN_TOKEN` env var
- Exception: `POST /api/admin/clear-settlement` and health checks do **not** require `X-Admin-Token`

## Known Gotchas

- **Two settlement paths**: `DrawController.settleOrdersForDraw` (triggered on manual draw) writes per-order `win_amount`/`win_breakdown`; `SettlementService` handles period-level aggregation. Both must use `quantity × rate` for Chance — a past bug caused `dist` to compile CHANCE rate as `80` instead of `[14,3,2]`, resulting in massive overpayment.
- **Backend dist/src sync**: After any backend rate or settlement logic change, rebuild (`npm run build`) and verify the compiled `dist` reflects the changes before deploying.
- **`POST /api/admin/clear-settlement`** is registered in `draw.controller.ts` under `AdminController` — if you see `Cannot POST`, check for duplicate/missing route registration.
- `DEBUG = false` should be set in merchant/result pages before going to production (controls `console.log` output).
