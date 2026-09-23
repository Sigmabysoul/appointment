# Dispatch Desk

Desktop-first logistics operations app that consolidates only the `Upcoming` and `In Transit` tabs selected from each Google Sheet source. Each source independently maps its own columns to the standard logistics fields.

## What this first slice includes

- Dashboard totals across configured sources.
- Shared Upcoming and In Transit queues.
- Per-source Google Sheet URL, tab selection, field mapping, pause/activate state, header inspection, and sync action.
- Review-before-save source discovery: paste a link, detect tabs and columns, and inspect sample rows before saving.
- Google Sheets read-only importer using a service account.
- App-owned Delivered/RTD updates with an immutable status-event record.
- Local SQLite persistence for development.

## Local setup

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env.local` (no Google Cloud service account or credentials needed!).
3. In Google Sheets, make sure your sheet is set to **"Anyone with the link can view"** (Share > General access > Anyone with the link).
4. Run `npm run dev`, open Settings (`http://localhost:3000/settings`), paste your Google Sheet link, and click **"Read sheet and fill mapping"**.
5. Map your columns and sync!

## Automatic synchronization

Google Sheets does not expose a simple row-change subscription. Dispatch Desk therefore polls each active source and reconciles the two selected tabs on the next scheduled run: added rows are imported, changed rows are updated, moved rows move between queues, and source rows no longer present disappear from active queues without deleting Delivered/RTD history.

The app includes a protected `GET /api/cron/sync` endpoint and `vercel.json` schedule for a five-minute Vercel cron. Set `CRON_SECRET` in the deployment environment; the scheduler sends it as `Authorization: Bearer <CRON_SECRET>`. On another host, configure its scheduler to call the same endpoint every 2–5 minutes.

The application does not write to source Google Sheets. Delivered and RTD changes remain in the Dispatch Desk database. Authentication and production PostgreSQL deployment are intentionally not included in this initial local vertical slice.
