# Casagrade Platform

A modular commerce platform for number-based draw games, covering end-to-end flows from order placement to settlement, with mobile clients, a backend service, and supporting web tooling.

---

## Overview

Casagrade is a multi-tenant, multi-device commerce stack built around periodic number draws. It ships as a monorepo with five co-located applications that share a single backend.

| Layer | Technology | Role |
|---|---|---|
| Backend | NestJS · TypeORM · SQLite/TypeORM | Order, draw, settlement, identity, multi-tenant isolation |
| Merchant App | Capacitor + Android | Operator-side terminal (Bluetooth peripherals, barcode scanner, native share) |
| Customer App | Capacitor + Android | Player-facing mobile client |
| POS / Web Frontend | Static HTML + Node Express | Operator dashboard, marketing pages, result pages |
| Preview / Tooling | Node + Express | Local proxy, static asset serving, dev preview |

---

## Capabilities

### Order & Settlement
- Order creation, confirmation, cancellation, and soft-delete lifecycle
- Multi-device order sync with delta endpoints
- Periodic settlement with chain-rule payout, idempotent roll-forward, and audit trail
- Multi-tenant data isolation by shop

### Draw Management
- Scheduled and manual draw entry
- Optimistic locking on draw publication to prevent concurrent settlement races
- Result publishing with automatic next-draw queuing
- Configurable draw dates and archival windows

### Identity & Access
- Username / password authentication (bcryptjs)
- Bearer-token authorization on sensitive endpoints
- Session management with concurrent-device limits
- Admin accounts with separate login path
- Rate limiting on registration and account-enumeration defenses

### Licensing
- Time-bound activation codes (30 / 180 / 365 day variants)
- Atomic activation with collision handling
- Trial-period auto-grant on registration

### Multi-tenant Configuration
- Per-shop payout multipliers (per-tier)
- Per-shop chain-rule odds
- Per-game enable / disable toggles
- Independent quota and limit configuration per game type

### Operator Tooling (Merchant App)
- Native barcode scanning via Capacitor
- Bluetooth Low Energy peripheral integration
- Native share and app-launcher bridges
- Local filesystem persistence

### Customer Experience (Customer App)
- Ticket viewing and result lookup
- Native Android WebView wrapper

### Web Surfaces (POS / Preview)
- Operator dashboard with multi-screen layout
- Customer-facing result pages
- Marketing flyers and posters
- Local Express proxy for development

### Operations
- Automated backups (daily snapshot pattern)
- Audit log for sensitive admin actions
- Notification dispatch via SMTP (nodemailer)
- TypeORM migrations for schema evolution

---

## Repository Layout

```
.
├── services/
│   └── lottery-system/        Backend (NestJS)
│       ├── backend/           Source, migrations, scripts
│       ├── frontend/          Auxiliary web UI
│       └── migrations/        SQL migrations
├── apps/
│   ├── merchant-app/          Operator Android client
│   ├── customer-app/          Player Android client
│   ├── pos/                   Static POS / dashboard pages
│   └── preview/               Preview proxy + dev tooling
├── .gitignore
└── README.md
```

Each top-level subdirectory is an independently buildable / deployable unit. Cross-cutting changes can be made in a single PR while preserving per-component release cadence.

---

## Backend Module Map

```
backend/src/
├── modules/
│   ├── admin/             Admin account, cleanup, audit
│   ├── draw/              Draw scheduling and publication
│   ├── local-lottery/     Local game variant logic
│   ├── merchant/          Merchant / shop management
│   ├── order/             Order lifecycle (create, confirm, cancel, sync)
│   └── settlement/        Payout computation and rolling settlement
├── entities/              TypeORM entities (User, Shop, Order, Draw, Session, CardCode, ShopBinding)
├── guards/                Auth guards
├── services/              Shared services
└── utils/                 Helpers
```

---

## Quick Reference

| Task | Command |
|---|---|
| Install backend deps | `cd services/lottery-system/backend && npm install` |
| Run backend in dev | `npm run start:dev` |
| Build backend | `npm run build` |
| Sync Capacitor app | `cd apps/merchant-app && npm run sync` |
| Open Android project | `npm run open` (in either Android app) |
| Run preview server | `cd apps/preview && npm start` |

---

## Status

- Backend, mobile clients, and web tooling are feature-complete for the current product scope
- Per-component deployment continues to be independent
- Cross-component refactoring and unified CI are planned

---

## License

Internal use unless stated otherwise.